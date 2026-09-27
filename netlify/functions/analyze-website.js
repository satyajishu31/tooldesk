// netlify/functions/analyze-website.js
// Advanced Website Analyzer — PageSpeed Insights + DNS + Security Headers

const https = require('https')
const http = require('http')
const { URL } = require('url')
const dns = require('dns')
const net = require('net')
const { promisify } = require('util')
const lookupAsync = promisify(dns.lookup)
const { getClientIp } = require('./utils/ip')
const { handleCors } = require('./utils/cors')
const { enforceRateLimit } = require('./utils/rateLimiter')

function expandIPv6(ip) {
  let clean = ip.trim().toLowerCase().replace(/^\[|\]$/g, '')
  if (clean.includes('.')) {
    const lastColon = clean.lastIndexOf(':')
    const ipv4Part = clean.slice(lastColon + 1)
    const parts = ipv4Part.split('.').map(n => parseInt(n, 10))
    if (parts.length === 4 && parts.every(p => !isNaN(p) && p >= 0 && p <= 255)) {
      const hex1 = ((parts[0] << 8) | parts[1]).toString(16).padStart(4, '0')
      const hex2 = ((parts[2] << 8) | parts[3]).toString(16).padStart(4, '0')
      clean = clean.slice(0, lastColon + 1) + hex1 + ':' + hex2
    }
  }
  const sides = clean.split('::')
  let left = sides[0] ? sides[0].split(':').filter(Boolean) : []
  let right = sides[1] ? sides[1].split(':').filter(Boolean) : []
  if (sides.length > 1) {
    const missing = 8 - (left.length + right.length)
    const middle = new Array(Math.max(0, missing)).fill('0000')
    return [...left, ...middle, ...right].map(h => h.padStart(4, '0')).join(':')
  }
  return left.map(h => h.padStart(4, '0')).join(':')
}

function isPrivateOrReservedIP(ipAddress) {
  if (!ipAddress || typeof ipAddress !== 'string') return true

  let cleanIp = ipAddress.trim().toLowerCase().replace(/^\[|\]$/g, '')
  const family = net.isIP(cleanIp)
  if (!family) return true

  if (family === 4) {
    const parts = cleanIp.split('.').map(n => parseInt(n, 10))
    if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return true
    const [o1, o2, o3, o4] = parts

    // 0.0.0.0/8
    if (o1 === 0) return true
    // 10.0.0.0/8
    if (o1 === 10) return true
    // 100.64.0.0/10
    if (o1 === 100 && o2 >= 64 && o2 <= 127) return true
    // 127.0.0.0/8
    if (o1 === 127) return true
    // 169.254.0.0/16
    if (o1 === 169 && o2 === 254) return true
    // 172.16.0.0/12
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return true
    // 192.0.0.0/24 & 192.0.2.0/24
    if (o1 === 192 && o2 === 0 && (o3 === 0 || o3 === 2)) return true
    // 192.168.0.0/16
    if (o1 === 192 && o2 === 168) return true
    // 198.18.0.0/15 & 198.51.100.0/24
    if (o1 === 198 && (o2 === 18 || o2 === 19 || (o2 === 51 && o3 === 100))) return true
    // 203.0.113.0/24
    if (o1 === 203 && o2 === 0 && o3 === 113) return true
    // 224.0.0.0/4 & 240.0.0.0/4
    if (o1 >= 224) return true

    return false
  }

  if (family === 6) {
    const full = expandIPv6(cleanIp)
    const words = full.split(':').map(w => parseInt(w, 16))
    if (words.length !== 8 || words.some(w => isNaN(w) || w < 0 || w > 0xffff)) return true

    // ::1 loopback and :: unspecified
    if (words.every((w, i) => i === 7 ? w === 1 : w === 0)) return true
    if (words.every(w => w === 0)) return true

    // Unique Local Addresses (fc00::/7)
    if ((words[0] & 0xfe00) === 0xfc00) return true
    // Link-Local Unicast (fe80::/10)
    if ((words[0] & 0xffc0) === 0xfe80) return true
    // Multicast (ff00::/8)
    if ((words[0] & 0xff00) === 0xff00) return true
    // Documentation prefix (2001:db8::/32)
    if (words[0] === 0x2001 && words[1] === 0x0db8) return true
    // Discard prefix (100::/64)
    if (words[0] === 0x0100 && words[1] === 0) return true

    // 6to4 encapsulation (2002::/16)
    if (words[0] === 0x2002) {
      const v4_1 = words[1] >> 8, v4_2 = words[1] & 0xff
      return isPrivateOrReservedIP(`${v4_1}.${v4_2}.0.1`)
    }

    // IPv4-mapped / compatible IPv6
    if (words.slice(0, 5).every(w => w === 0) && (words[5] === 0xffff || words[5] === 0)) {
      const v4 = `${words[6] >> 8}.${words[6] & 0xff}.${words[7] >> 8}.${words[7] & 0xff}`
      return isPrivateOrReservedIP(v4)
    }

    return false
  }

  return true
}

function lookupWithTimeout(hostname, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        reject(new Error('DNS lookup timed out'))
      }
    }, timeoutMs)

    lookupAsync(hostname, { all: true })
      .then(addresses => {
        if (!settled) {
          settled = true
          clearTimeout(timer)
          resolve(addresses)
        }
      })
      .catch(err => {
        if (!settled) {
          settled = true
          clearTimeout(timer)
          reject(err)
        }
      })
  })
}

// Bounded URL fetcher with strict SSRF re-validation on every hop
async function fetchURL(rawUrl, timeoutMs = 8000, redirectsLeft = 3) {
  let u
  try { u = new URL(rawUrl) } catch { throw new Error('Invalid URL') }

  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('Only HTTP and HTTPS protocols are allowed')
  }

  const targetPort = u.port ? parseInt(u.port, 10) : (u.protocol === 'https:' ? 443 : 80)
  if (targetPort !== 80 && targetPort !== 443) {
    throw new Error('Only standard HTTP (80) and HTTPS (443) ports are allowed')
  }

  // DNS Lookup for SSRF prevention
  let address
  if (net.isIP(u.hostname)) {
    if (isPrivateOrReservedIP(u.hostname)) {
      throw new Error('Access to private or loopback IP range is forbidden')
    }
    address = u.hostname
  } else {
    const addresses = await lookupWithTimeout(u.hostname, 3000)
    if (!addresses || !addresses.length) {
      throw new Error('Failed to resolve hostname')
    }
    for (const item of addresses) {
      if (isPrivateOrReservedIP(item.address)) {
        throw new Error('Access to private or loopback IP range is forbidden')
      }
    }
    address = addresses[0].address
  }

  return new Promise((resolve, reject) => {
    let settled = false
    const safeResolve = val => { if (!settled) { settled = true; resolve(val) } }
    const safeReject = err => { if (!settled) { settled = true; reject(err) } }

    const lib = u.protocol === 'https:' ? https : http
    const req = lib.request({
      hostname: address,
      port: targetPort,
      path: u.pathname + u.search,
      method: 'GET',
      headers: {
        'Host': u.hostname,
        'User-Agent': 'Mozilla/5.0 (compatible; ToolDeskBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8'
      },
      timeout: timeoutMs,
      ...(u.protocol === 'https:' ? { servername: u.hostname } : {})
    }, res => {
      if (res.statusCode >= 301 && res.statusCode <= 308 && res.headers.location) {
        res.destroy()
        req.destroy()
        if (res.socket && !res.socket.destroyed) res.socket.destroy()

        if (redirectsLeft <= 0) {
          return safeReject(new Error('Too many redirects (exceeded limit)'))
        }
        try {
          const nextUrl = new URL(res.headers.location, rawUrl).href
          return fetchURL(nextUrl, timeoutMs, redirectsLeft - 1).then(safeResolve, safeReject)
        } catch {
          return safeReject(new Error('Invalid redirect Location header'))
        }
      }

      const chunks = []
      let byteCount = 0
      const MAX_BYTES = 2 * 1024 * 1024 // 2MB cap (reduced from 10MB to prevent memory exhaustion)

      res.on('error', safeReject)
      res.on('data', c => {
        byteCount += c.length
        if (byteCount > MAX_BYTES) {
          res.destroy()
          req.destroy()
          if (res.socket && !res.socket.destroyed) res.socket.destroy()
          safeReject(new Error('Response body exceeds maximum allowed size (2MB)'))
          return
        }
        chunks.push(c)
      })
      res.on('end', () => {
        if (byteCount > MAX_BYTES) return
        safeResolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8'),
          ok: res.statusCode >= 200 && res.statusCode < 400,
          finalUrl: rawUrl,
        })
      })
    })
    req.on('error', safeReject)
    req.on('timeout', () => { req.destroy(); safeReject(new Error('Timed out')) })
    req.end()
  })
}

async function safe(fn) { try { return await fn() } catch { return null } }

/**
 * ReDoS-safe and memory-bounded metadata extractor
 * Uses a single-pass attribute scanner instead of multiple backtracking RegExps over 500KB
 */
function extractMeta(html, baseUrl) {
  // Bound input size to 250KB to eliminate ReDoS and memory bloat
  const safeHtml = typeof html === 'string' ? html.slice(0, 250000) : ''

  // 1. Single pass extraction for all <meta> tags into a null-prototype lookup map
  const metaMap = Object.create(null)
  const metaTagRegex = /<meta\s+([^>]+)>/gi
  let tagMatch
  let metaCount = 0

  while ((tagMatch = metaTagRegex.exec(safeHtml)) !== null && metaCount < 100) {
    metaCount++
    const tagContent = tagMatch[1]
    let name = ''
    let content = ''

    // Fast non-backtracking attribute extractor
    const nameMatch = tagContent.match(/\b(?:name|property|http-equiv)\s*=\s*["']([^"']*)["']/i)
    if (nameMatch) name = nameMatch[1].trim().toLowerCase()

    const contentMatch = tagContent.match(/\bcontent\s*=\s*["']([^"']*)["']/i)
    if (contentMatch) content = contentMatch[1].trim()

    const charsetMatch = tagContent.match(/\bcharset\s*=\s*["']?([^"'\s/>]+)/i)
    if (charsetMatch && !name) {
      name = 'charset'
      content = charsetMatch[1].trim()
    }

    if (name && content && !(name in metaMap)) {
      metaMap[name] = content.slice(0, 500)
    }
  }

  // 2. Safe single-match extractions for title and headers
  const titleMatch = safeHtml.match(/<title[^>]*>([^<]{1,200})<\/title>/i)
  const title = titleMatch ? titleMatch[1].trim() : ''

  const description = metaMap['description'] || ''
  const keywords    = metaMap['keywords'] || ''
  const ogTitle     = metaMap['og:title'] || ''
  const ogDesc      = metaMap['og:description'] || ''
  const ogImage     = metaMap['og:image'] || ''
  const robots      = metaMap['robots'] || ''
  const viewport    = metaMap['viewport'] || ''
  const charset     = metaMap['charset'] || ''

  const canonicalMatch = safeHtml.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)
  const canonical = canonicalMatch ? canonicalMatch[1].trim() : ''

  const h1s = []
  const h1Regex = /<h1[^>]*>([^<]{1,120})<\/h1>/gi
  let h1Match
  while ((h1Match = h1Regex.exec(safeHtml)) !== null && h1s.length < 5) {
    h1s.push(h1Match[1].trim())
  }

  const h2s = []
  const h2Regex = /<h2[^>]*>([^<]{1,120})<\/h2>/gi
  let h2Match
  while ((h2Match = h2Regex.exec(safeHtml)) !== null && h2s.length < 8) {
    h2s.push(h2Match[1].trim())
  }

  // 3. Image URLs and alt attributes
  const rawUrls = []
  let imgNoAlt = 0
  const imgRegex = /<img\s+([^>]+)>/gi
  let imgMatch
  let imgCount = 0

  while ((imgMatch = imgRegex.exec(safeHtml)) !== null && imgCount < 50) {
    imgCount++
    const imgAttrs = imgMatch[1]
    if (!/\balt\s*=/i.test(imgAttrs)) {
      imgNoAlt++
    }

    const srcMatch = imgAttrs.match(/\b(?:src|data-src|data-lazy-src)\s*=\s*["']([^"'\s]+)["']/i)
    if (srcMatch && rawUrls.length < 15) {
      rawUrls.push(srcMatch[1].trim())
    }
  }

  const images = [...new Set(rawUrls)]
    .map(src => {
      try { return new URL(src, baseUrl).href } catch { return null }
    })
    .filter(Boolean)
    .slice(0, 15)

  // 4. Scripts and Stylesheets counts
  const scripts = (safeHtml.match(/<script\b[^>]*\bsrc\s*=/gi) || []).length
  const stylesheets = (safeHtml.match(/<link\b[^>]*\brel=["']stylesheet["']/gi) || []).length

  // 5. Links: parse <a> tags and resolve relative URLs properly
  const links = []
  const aTagRegex = /<a\b[^>]*\bhref\s*=\s*["']([^"'\s#]+)["'][^>]*>/gi
  let aMatch
  let linkCount = 0
  let baseDomain = ''
  try { baseDomain = new URL(baseUrl).hostname } catch {}

  let internalLinks = 0
  let externalLinks = 0

  while ((aMatch = aTagRegex.exec(safeHtml)) !== null && linkCount < 200) {
    const rawHref = aMatch[1].trim()
    if (!rawHref || rawHref.startsWith('javascript:') || rawHref.startsWith('mailto:') || rawHref.startsWith('tel:')) {
      continue
    }

    try {
      const resolved = new URL(rawHref, baseUrl)
      if (resolved.protocol === 'http:' || resolved.protocol === 'https:') {
        linkCount++
        links.push(resolved.href)
        if (resolved.hostname === baseDomain || resolved.hostname.endsWith('.' + baseDomain)) {
          internalLinks++
        } else {
          externalLinks++
        }
      }
    } catch {}
  }

  // 6. Word count without massive split(' ') array allocation
  const cleanTextHtml = safeHtml
    .slice(0, 100000)
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-zA-Z0-9#]+;/g, ' ')

  let wordCount = 0
  const wordMatches = cleanTextHtml.matchAll(/\b[a-zA-Z0-9'-]{2,}\b/g)
  for (const _ of wordMatches) {
    wordCount++
    if (wordCount >= 50000) break
  }

  const hasSchema = /application\/ld\+json/i.test(safeHtml)
  const hasHTTPS  = baseUrl.startsWith('https://')

  // Tech stack detection
  const techStack = []
  const hl = safeHtml.toLowerCase()
  const techSignatures = [
    ['React', /data-reactroot|react-dom/],
    ['Vue.js', /vue\.js|__vue__/],
    ['Angular', /ng-version|ng-app/],
    ['Next.js', /__next|_next\/static/],
    ['jQuery', /jquery\.min\.js|jquery-\d/],
    ['WordPress', /wp-content|wp-includes/],
    ['Shopify', /cdn\.shopify/],
    ['Bootstrap', /bootstrap\.min\.css/],
    ['Tailwind', /tailwindcss/],
    ['Stripe', /js\.stripe\.com/],
    ['Google Analytics', /gtag|google-analytics/],
    ['Cloudflare', /cloudflare|__cf_bm/],
    ['Vercel', /vercel\.app|x-vercel-id/],
    ['Netlify', /netlify\.app/],
  ]
  for (const [name, re] of techSignatures) {
    if (re.test(hl)) techStack.push(name)
  }

  // Favicon: attribute-order-independent detection
  let faviconUrl = null
  const linkTags = safeHtml.match(/<link\b[^>]*>/gi) || []
  for (const tag of linkTags) {
    const relMatch = tag.match(/\brel=["']([^"']+)["']/i)
    const hrefMatch = tag.match(/\bhref=["']([^"']+)["']/i)
    if (relMatch && hrefMatch && /(?:shortcut )?icon/i.test(relMatch[1])) {
      try {
        faviconUrl = hrefMatch[1].startsWith('http') ? hrefMatch[1] : new URL(hrefMatch[1], baseUrl).href
        break
      } catch {}
    }
  }
  if (!faviconUrl) {
    try { faviconUrl = new URL('/favicon.ico', baseUrl).href } catch {}
  }

  return {
    title, description, keywords, ogTitle, ogDesc, ogImage, canonical, robots, viewport, charset,
    h1s, h2s,
    links: { internal: internalLinks, external: externalLinks, total: links.length },
    images: { urls: images, total: images.length, missingAlt: imgNoAlt },
    scripts, stylesheets, techStack, wordCount, hasSchema, hasHTTPS, faviconUrl,
    textContent: cleanTextHtml.replace(/\s+/g, ' ').trim().slice(0, 500),
  }
}

async function getPageSpeed(url, timeoutMs = 2500) {
  return safe(async () => {
    const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&category=performance&category=accessibility&category=seo&category=best-practices`
    const res = await fetchURL(apiUrl, timeoutMs)
    if (!res.ok || !res.body) return null
    const data = JSON.parse(res.body)
    const cats = data.lighthouseResult?.categories || {}
    const aud  = data.lighthouseResult?.audits || {}
    return {
      performance: Math.round((cats.performance?.score || 0) * 100),
      accessibility: Math.round((cats.accessibility?.score || 0) * 100),
      seo: Math.round((cats.seo?.score || 0) * 100),
      bestPractices: Math.round((cats['best-practices']?.score || 0) * 100),
      fcp: aud['first-contentful-paint']?.displayValue || '—',
      lcp: aud['largest-contentful-paint']?.displayValue || '—',
      tbt: aud['total-blocking-time']?.displayValue || '—',
      cls: aud['cumulative-layout-shift']?.displayValue || '—',
      si:  aud['speed-index']?.displayValue || '—',
      ttfb: aud['server-response-time']?.displayValue || '—',
      opportunities: Object.values(aud)
        .filter(a => a.score !== null && a.score < 0.9 && a.details?.type === 'opportunity')
        .slice(0, 5).map(a => ({ title: a.title, savings: a.displayValue })),
    }
  })
}

async function getDNSInfo(hostname, timeoutMs = 2000) {
  return safe(async () => {
    if (!hostname || typeof hostname !== 'string' || !/^[a-zA-Z0-9.-]+$/.test(hostname)) return null

    try {
      const res = await fetchURL(`https://ipapi.co/${encodeURIComponent(hostname)}/json/`, timeoutMs)
      if (res.ok && res.body) {
        const d = JSON.parse(res.body)
        if (!d.error && d.ip) {
          return { ip: d.ip, org: d.org, asn: d.asn, country: d.country_name, city: d.city, lat: d.latitude, lon: d.longitude }
        }
      }
    } catch {}

    try {
      const res = await fetchURL(`https://ipwho.is/${encodeURIComponent(hostname)}`, timeoutMs)
      if (res.ok && res.body) {
        const d = JSON.parse(res.body)
        if (d.success !== false && d.ip) {
          return { ip: d.ip, org: d.connection?.isp || d.connection?.org, asn: d.connection?.asn, country: d.country, city: d.city, lat: d.latitude, lon: d.longitude }
        }
      }
    } catch {}

    return null
  })
}

async function checkSitemapRobots(baseUrl, timeoutMs = 2000) {
  let base
  try { base = new URL(baseUrl).origin } catch { return { robotsOk: false, sitemapExists: false, sitemapInRobots: false, robotsContent: null } }
  const [rob, sit] = await Promise.all([
    safe(() => fetchURL(base + '/robots.txt', timeoutMs)),
    safe(() => fetchURL(base + '/sitemap.xml', timeoutMs)),
  ])
  return {
    robotsOk: rob?.ok || false,
    sitemapExists: (sit?.ok && (sit.body?.includes('<?xml') || sit.body?.includes('<urlset') || sit.body?.includes('<sitemapindex'))) || false,
    sitemapInRobots: (rob?.ok && /sitemap:\s*/i.test(rob.body || '')) || false,
    robotsContent: rob?.ok ? rob.body?.slice(0, 600) : null,
  }
}

exports.handler = async function(event) {
  const cors = handleCors(event, { allowedMethods: 'POST,OPTIONS' })
  if (!cors.isAllowed || !cors.ok) {
    return cors.response || { statusCode: cors.status || 403, headers: cors.headers, body: JSON.stringify({ error: cors.error }) }
  }
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors.headers, body: '' }
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors.headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const clientIp = getClientIp(event)
  const rl = await enforceRateLimit(clientIp, { action: 'analyze-website', maxRequests: 20, windowSeconds: 60 })
  if (!rl.allowed) {
    return {
      statusCode: 429,
      headers: { ...cors.headers, 'Content-Type': 'application/json', 'Retry-After': String(rl.retryAfter) },
      body: JSON.stringify({ error: 'Rate limit exceeded. Please wait a minute before analyzing more websites.' })
    }
  }

  let payload
  try {
    const parsed = JSON.parse(event.body || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { statusCode: 400, headers: cors.headers, body: JSON.stringify({ error: 'Payload must be a JSON object' }) }
    }
    payload = parsed
  } catch {
    return { statusCode: 400, headers: cors.headers, body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  let { url } = payload
  if (typeof url !== 'string' || !url.trim()) {
    return { statusCode: 400, headers: cors.headers, body: JSON.stringify({ error: 'url must be a valid string' }) }
  }
  url = url.trim()
  if (!url.startsWith('http')) url = 'https://' + url
  let parsedUrl
  try {
    parsedUrl = new URL(url)
  } catch {
    return { statusCode: 400, headers: cors.headers, body: JSON.stringify({ error: 'Invalid URL format' }) }
  }

  const startTime = Date.now()
  const deadline = startTime + 8500 // Bound execution budget to 8.5s
  let pageRes
  try {
    pageRes = await fetchURL(url, 4500)
  } catch (e) {
    return {
      statusCode: 502,
      headers: { ...cors.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: `Could not fetch ${url}: ${e.message}`, url })
    }
  }
  if (!pageRes.ok) {
    return {
      statusCode: 502,
      headers: { ...cors.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: `HTTP ${pageRes.status} — site may block automated requests`, url })
    }
  }

  const html = pageRes.body
  const loadTime = Date.now() - startTime
  const remainingBudget = Math.max(1200, deadline - Date.now() - 500)

  let meta, pageSpeed, dnsInfo, sitemapRobots
  try {
    const settled = await Promise.allSettled([
      Promise.resolve(extractMeta(html, url)),
      getPageSpeed(url, Math.min(2500, remainingBudget)),
      getDNSInfo(parsedUrl.hostname, Math.min(2000, remainingBudget)),
      checkSitemapRobots(url, Math.min(2000, remainingBudget)),
    ])
    meta = settled[0].status === 'fulfilled' && settled[0].value ? settled[0].value : extractMeta(html, url)
    pageSpeed = settled[1].status === 'fulfilled' ? settled[1].value : null
    dnsInfo = settled[2].status === 'fulfilled' ? settled[2].value : null
    sitemapRobots = settled[3].status === 'fulfilled' && settled[3].value ? settled[3].value : { robotsOk: false, sitemapExists: false }
  } catch {
    meta = extractMeta(html, url)
    pageSpeed = null
    dnsInfo = null
    sitemapRobots = { robotsOk: false, sitemapExists: false }
  }

  const h = Object.fromEntries(Object.entries(pageRes.headers).map(([k, v]) => [k.toLowerCase(), v]))
  const secHeaders = {
    hsts: !!h['strict-transport-security'], csp: !!h['content-security-policy'],
    xFrameOptions: !!h['x-frame-options'], xContentTypeOptions: !!h['x-content-type-options'],
    referrerPolicy: !!h['referrer-policy'], permissionsPolicy: !!h['permissions-policy'],
    server: h['server'] || '—', poweredBy: h['x-powered-by'] || null,
    cacheControl: h['cache-control'] || null, contentType: h['content-type'] || null,
  }

  const titleStr = typeof meta?.title === 'string' ? meta.title : ''
  const descStr = typeof meta?.description === 'string' ? meta.description : ''
  const h1Arr = Array.isArray(meta?.h1s) ? meta.h1s : []
  const imgObj = meta?.images || { missingAlt: 0 }

  const seoChecks = [
    { name: 'Has title',            pass: !!titleStr,                                     weight: 15 },
    { name: 'Title length 10–60',   pass: titleStr.length >= 10 && titleStr.length <= 60, weight: 10 },
    { name: 'Has description',      pass: !!descStr,                                      weight: 12 },
    { name: 'Description 50–160',   pass: descStr.length >= 50 && descStr.length <= 160,  weight: 8 },
    { name: 'Has H1 tag',           pass: h1Arr.length > 0,                               weight: 10 },
    { name: 'Single H1',            pass: h1Arr.length === 1,                             weight: 5 },
    { name: 'Has canonical URL',    pass: !!meta?.canonical,                              weight: 6 },
    { name: 'Has robots meta',      pass: !!meta?.robots,                                 weight: 4 },
    { name: 'Mobile viewport',      pass: !!meta?.viewport,                               weight: 8 },
    { name: 'Open Graph tags',      pass: !!meta?.ogTitle,                                weight: 6 },
    { name: 'HTTPS enabled',        pass: !!meta?.hasHTTPS,                               weight: 10 },
    { name: 'Has sitemap',          pass: !!sitemapRobots?.sitemapExists,                 weight: 6 },
    { name: 'Structured data',      pass: !!meta?.hasSchema,                              weight: 5 },
    { name: 'Images have alt text', pass: imgObj.missingAlt === 0,                         weight: 5 },
    { name: 'Has robots.txt',       pass: !!sitemapRobots?.robotsOk,                      weight: 4 },
    { name: 'Has meta keywords',    pass: !!meta?.keywords,                               weight: 2 },
  ]
  const secChecks = [
    { name: 'HTTPS enabled',          pass: meta.hasHTTPS,                 weight: 25 },
    { name: 'HSTS header',            pass: secHeaders.hsts,               weight: 20 },
    { name: 'Content-Security-Policy', pass: secHeaders.csp,               weight: 20 },
    { name: 'X-Frame-Options',        pass: secHeaders.xFrameOptions,     weight: 15 },
    { name: 'X-Content-Type-Options', pass: secHeaders.xContentTypeOptions, weight: 10 },
    { name: 'Referrer-Policy',        pass: secHeaders.referrerPolicy,    weight: 10 },
  ]
  const seoScore = Math.round(seoChecks.filter(c => c.pass).reduce((s, c) => s + c.weight, 0) / seoChecks.reduce((s, c) => s + c.weight, 0) * 100)
  const secScore = Math.round(secChecks.filter(c => c.pass).reduce((s, c) => s + c.weight, 0) / secChecks.reduce((s, c) => s + c.weight, 0) * 100)
  const htmlSize = Buffer.byteLength(html, 'utf8')

  return {
    statusCode: 200,
    headers: { ...cors.headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url, loadTime, htmlSize,
      title: meta.title, description: meta.description, keywords: meta.keywords,
      ogTitle: meta.ogTitle, ogDesc: meta.ogDesc, ogImage: meta.ogImage,
      faviconUrl: meta.faviconUrl, canonical: meta.canonical, robots: meta.robots,
      viewport: meta.viewport, charset: meta.charset,
      h1s: meta.h1s, h2s: meta.h2s, links: meta.links, images: meta.images,
      scripts: meta.scripts, stylesheets: meta.stylesheets, techStack: meta.techStack,
      wordCount: meta.wordCount, hasSchema: meta.hasSchema, hasHTTPS: meta.hasHTTPS,
      textPreview: meta.textContent,
      seoScore, secScore, seoChecks, secChecks, secHeaders,
      pageSpeed, dnsInfo, sitemapRobots,
      scores: {
        seo: seoScore, security: secScore,
        performance: pageSpeed?.performance || null,
        accessibility: pageSpeed?.accessibility || null
      },
    }),
  }
}
