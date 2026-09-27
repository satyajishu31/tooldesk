const https = require('https')
const http  = require('http')
const { URL } = require('url')
const dns = require('dns')
const net = require('net')
const { promisify } = require('util')
const lookupAsync = promisify(dns.lookup)
const { getClientIp } = require('./utils/ip')
const { handleCors } = require('./utils/cors')
const { enforceRateLimit } = require('./utils/rateLimiter')

const ALLOWED_HOST_SUFFIXES = [
  'youtube.com',
  'ytimg.com',
  'vimeo.com',
  'vimeocdn.com',
  'flagcdn.com',
  'unsplash.com',
  'pexels.com',
  'wikimedia.org',
  'githubusercontent.com',
  'cloudinary.com',
  'imgur.com',
  'restcountries.com',
  'googleusercontent.com',
  'dailymotion.com',
  'dmcdn.net',
]

function isAllowedHost(hostname) {
  if (!hostname || typeof hostname !== 'string') return false
  const host = hostname.toLowerCase().trim()
  return ALLOWED_HOST_SUFFIXES.some(suffix => host === suffix || host.endsWith('.' + suffix))
}

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

    if (o1 === 0) return true
    if (o1 === 10) return true
    if (o1 === 100 && o2 >= 64 && o2 <= 127) return true
    if (o1 === 127) return true
    if (o1 === 169 && o2 === 254) return true
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return true
    if (o1 === 192 && o2 === 0 && (o3 === 0 || o3 === 2)) return true
    if (o1 === 192 && o2 === 88 && o3 === 99) return true
    if (o1 === 192 && o2 === 168) return true
    if (o1 === 198 && (o2 === 18 || o2 === 19 || (o2 === 51 && o3 === 100))) return true
    if (o1 === 203 && o2 === 0 && o3 === 113) return true
    if (o1 >= 224) return true

    return false
  }


  if (family === 6) {
    const full = expandIPv6(cleanIp)
    const words = full.split(':').map(w => parseInt(w, 16))
    if (words.length !== 8 || words.some(w => isNaN(w) || w < 0 || w > 0xffff)) return true

    if (words.every((w, i) => i === 7 ? w === 1 : w === 0)) return true
    if (words.every(w => w === 0)) return true
    if ((words[0] & 0xfe00) === 0xfc00) return true
    if ((words[0] & 0xffc0) === 0xfe80) return true
    if ((words[0] & 0xff00) === 0xff00) return true
    if (words[0] === 0x2001 && words[1] === 0x0db8) return true
    if (words[0] === 0x0100 && words[1] === 0) return true

    if (words[0] === 0x2002) {
      const v4_1 = words[1] >> 8, v4_2 = words[1] & 0xff
      return isPrivateOrReservedIP(`${v4_1}.${v4_2}.0.1`)
    }

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

function verifyImageSignature(buffer) {
  if (!buffer || buffer.length < 4) return null
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'image/jpeg'
  } else if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return 'image/png'
  } else if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return 'image/gif'
  } else if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp'
  } else if (buffer[0] === 0x42 && buffer[1] === 0x4D) {
    return 'image/bmp'
  } else if (buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0x01 && buffer[3] === 0x00) {
    return 'image/x-icon'
  }
  return null
}

async function fetchImage(rawUrl, corsHeaders, redirectsLeft = 3) {
  let parsedUrl
  try {
    parsedUrl = new URL(rawUrl)
  } catch {
    return { statusCode: 400, headers: corsHeaders, body: 'Invalid URL format' }
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return { statusCode: 400, headers: corsHeaders, body: 'Only HTTP and HTTPS protocols are allowed' }
  }

  const targetPort = parsedUrl.port ? parseInt(parsedUrl.port, 10) : (parsedUrl.protocol === 'https:' ? 443 : 80)
  if (targetPort !== 80 && targetPort !== 443) {
    return { statusCode: 400, headers: corsHeaders, body: 'Only standard HTTP (80) and HTTPS (443) ports are allowed' }
  }

  const lowerHost = (parsedUrl.hostname || '').toLowerCase().trim()
  if (!lowerHost || !/^[a-z0-9.-]+$/.test(lowerHost) || lowerHost.includes('..') || lowerHost.startsWith('.') || lowerHost.endsWith('.')) {
    return { statusCode: 400, headers: corsHeaders, body: 'Invalid hostname format' }
  }

  // Enforce allowlist on the initial request (not just on redirects)
  if (!isAllowedHost(lowerHost)) {
    return { statusCode: 403, headers: corsHeaders, body: 'Access to this host is not permitted by proxy allowlist policy' }
  }

  if (lowerHost === 'localhost' || lowerHost.endsWith('.localhost') || lowerHost.endsWith('.local') || lowerHost.endsWith('.internal') || lowerHost.endsWith('.arpa')) {
    return { statusCode: 403, headers: corsHeaders, body: 'Access to internal or local domains is forbidden' }
  }

  let address
  try {
    if (net.isIP(parsedUrl.hostname)) {
      if (isPrivateOrReservedIP(parsedUrl.hostname)) {
        return { statusCode: 403, headers: corsHeaders, body: 'Access to private or loopback IP range is forbidden' }
      }
      address = parsedUrl.hostname
    } else {
      const addresses = await lookupWithTimeout(parsedUrl.hostname, 3000)
      if (!addresses || !addresses.length) {
        return { statusCode: 400, headers: corsHeaders, body: 'Failed to resolve hostname' }
      }
      for (const item of addresses) {
        if (isPrivateOrReservedIP(item.address)) {
          return { statusCode: 403, headers: corsHeaders, body: 'Access to private or loopback IP range is forbidden' }
        }
      }
      address = addresses[0].address
    }
  } catch (err) {
    return { statusCode: 400, headers: corsHeaders, body: err.message || 'Failed to resolve hostname' }
  }

  return new Promise((resolve) => {
    let resolved = false
    const safeResolve = (val) => {
      if (!resolved) {
        resolved = true
        resolve(val)
      }
    }

    const lib = parsedUrl.protocol === 'https:' ? https : http

    const reqOpts = {
      hostname: address,
      port: targetPort,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'Host': parsedUrl.hostname,
        'User-Agent': 'Mozilla/5.0 (compatible; ToolDeskBot/1.0)',
        'Accept': 'image/jpeg,image/png,image/webp,image/*;q=0.8',
      },
      timeout: 6500,
      ...(parsedUrl.protocol === 'https:' ? { servername: parsedUrl.hostname } : {})
    }

    const req = lib.request(reqOpts, (res) => {
      if (res.statusCode >= 301 && res.statusCode <= 308 && res.headers.location) {
        res.removeAllListeners('error')
        res.removeAllListeners('data')
        res.destroy()
        req.destroy()
        if (res.socket && !res.socket.destroyed) res.socket.destroy()

        if (redirectsLeft <= 0) {
          safeResolve({ statusCode: 502, headers: corsHeaders, body: 'Too many redirects' })
          return
        }
        try {
          const nextUrl = new URL(res.headers.location, rawUrl).href
          const parsedNext = new URL(nextUrl)
          if (!isAllowedHost(parsedNext.hostname)) {
            safeResolve({ statusCode: 403, headers: corsHeaders, body: 'Redirect to unauthorized host forbidden' })
            return
          }
          fetchImage(nextUrl, corsHeaders, redirectsLeft - 1).then(safeResolve, (err) => safeResolve({ statusCode: 502, headers: corsHeaders, body: err.message }))
          return
        } catch {
          safeResolve({ statusCode: 400, headers: corsHeaders, body: 'Invalid redirect Location header' })
          return
        }
      }

      const chunks = []
      let byteCount = 0
      const MAX_BYTES = 3 * 1024 * 1024

      res.on('error', (err) => {
        safeResolve({ statusCode: 502, headers: corsHeaders, body: err.message || 'Stream error' })
      })

      res.on('data', (chunk) => {
        byteCount += chunk.length
        if (byteCount > MAX_BYTES) {
          res.destroy()
          req.destroy()
          if (res.socket && !res.socket.destroyed) res.socket.destroy()
          safeResolve({ statusCode: 413, headers: corsHeaders, body: 'Image exceeds maximum allowed size (3MB limit)' })
          return
        }
        chunks.push(chunk)
      })

      res.on('end', () => {
        if (byteCount > MAX_BYTES) return

        if (res.statusCode !== 200) {
          safeResolve({
            statusCode: res.statusCode >= 400 && res.statusCode < 600 ? res.statusCode : 502,
            headers: corsHeaders,
            body: `Upstream returned status ${res.statusCode}`
          })
          return
        }

        const buffer = Buffer.concat(chunks)
        chunks.length = 0 // Release individual chunk references to unburden V8 GC
        if (buffer.length < 8) {
          safeResolve({ statusCode: 400, headers: corsHeaders, body: 'Upstream image buffer is too small or corrupt' })
          return
        }

        const verifiedMime = verifyImageSignature(buffer)
        if (!verifiedMime) {
          safeResolve({ statusCode: 415, headers: corsHeaders, body: 'Upstream payload does not match any valid image file signature' })
          return
        }

        safeResolve({
          statusCode: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': verifiedMime,
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'public, max-age=86400, s-maxage=86400'
          },
          body: buffer.toString('base64'),
          isBase64Encoded: true
        })
      })
    })

    req.on('error', (err) => safeResolve({ statusCode: 502, headers: corsHeaders, body: err.message || 'Network error' }))
    req.on('timeout', () => { req.destroy(); safeResolve({ statusCode: 504, headers: corsHeaders, body: 'Gateway Timeout' }) })
    req.end()
  })
}

exports.handler = async function(event) {
  const cors = handleCors(event, { allowedMethods: 'GET,OPTIONS' })
  if (!cors.isAllowed || !cors.ok) return cors.response || { statusCode: cors.status || 403, headers: cors.headers, body: JSON.stringify({ error: cors.error }) }
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors.headers, body: '' }
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers: cors.headers, body: 'Method Not Allowed' }

  const clientIp = getClientIp(event)
  const rl = await enforceRateLimit(clientIp, { action: 'image-proxy', maxRequests: 60, windowSeconds: 60 })
  if (!rl.allowed) {
    return {
      statusCode: 429,
      headers: { ...cors.headers, 'Content-Type': 'application/json', 'Retry-After': String(rl.retryAfter) },
      body: JSON.stringify({ error: 'Rate limit exceeded. Please wait a minute before requesting more images.' })
    }
  }

  const params = event.queryStringParameters || {}
  const url = params.url
  if (!url || typeof url !== 'string') return { statusCode: 400, headers: cors.headers, body: 'url parameter is required' }

  try {
    return await fetchImage(url, cors.headers, 3)
  } catch (err) {
    return {
      statusCode: 502,
      headers: cors.headers,
      body: err.message || 'Image proxy error'
    }
  }
}

module.exports = {
  handler: exports.handler,
  isAllowedHost,
  isPrivateOrReservedIP,
  verifyImageSignature
}
