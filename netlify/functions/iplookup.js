// netlify/functions/iplookup.js
// Multi-provider IP Geolocation with automatic failover
// Hardened against infrastructure metadata leaks, private IP probing, and spoofed headers.

const https = require('https')
const net   = require('net')
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

    if (o1 === 0) return true
    if (o1 === 10) return true
    if (o1 === 100 && o2 >= 64 && o2 <= 127) return true
    if (o1 === 127) return true
    if (o1 === 169 && o2 === 254) return true
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return true
    if (o1 === 192 && o2 === 0 && (o3 === 0 || o3 === 2)) return true
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

function get(url, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    if (!url || typeof url !== 'string' || !url.startsWith('https://')) {
      return reject(new Error('Insecure or invalid transport: only HTTPS is permitted'))
    }
    let settled = false
    const safeResolve = val => { if (!settled) { settled = true; resolve(val) } }
    const safeReject = err => { if (!settled) { settled = true; reject(err) } }

    let activeRes = null
    const req = https.get(url, { timeout: timeoutMs }, res => {
      activeRes = res
      const c = []
      let byteCount = 0
      const MAX_STREAM = 2 * 1024 * 1024
      res.on('error', safeReject)
      res.on('data', d => {
        byteCount += d.length
        if (byteCount > MAX_STREAM) {
          res.destroy()
          req.destroy()
          if (res.socket && !res.socket.destroyed) res.socket.destroy()
          safeReject(new Error('Response exceeded stream limit'))
          return
        }
        c.push(d)
      })
      res.on('end', () => safeResolve({ status: res.statusCode, body: Buffer.concat(c).toString('utf8') }))
    })
    req.on('error', safeReject)
    req.on('timeout', () => {
      req.destroy()
      if (activeRes) activeRes.destroy()
      safeReject(new Error('Request timed out'))
    })
  })
}

exports.handler = async function(event) {
  const cors = handleCors(event, { allowedMethods: 'POST,OPTIONS' })
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors.headers }
  }
  if (!cors.isAllowed) {
    return { statusCode: cors.status, headers: cors.headers, body: JSON.stringify({ error: cors.error }) }
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors.headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const clientIp = getClientIp(event)
  const rl = await enforceRateLimit(clientIp, { action: 'iplookup', maxRequests: 30, windowSeconds: 60 })
  if (!rl.allowed) {
    return {
      statusCode: 429,
      headers: { ...cors.headers, 'Content-Type': 'application/json', 'Retry-After': String(rl.retryAfter) },
      body: JSON.stringify({ error: 'Rate limit exceeded. Please wait a minute before performing more IP lookups.' })
    }
  }

  let payload
  try {
    const parsed = JSON.parse(event.body || '{}')
    payload = (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {}
  } catch {
    return { statusCode: 400, headers: cors.headers, body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  const ip = typeof payload?.ip === 'string' ? payload.ip : null
  const isSelf = (!ip || ip === 'me')
  let target = ''

  if (!isSelf && typeof ip === 'string') {
    const trimmed = ip.trim().slice(0, 64)
    if (!net.isIP(trimmed)) {
      return {
        statusCode: 400,
        headers: { ...cors.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Only valid IP addresses are accepted. Hostnames are not allowed.' })
      }
    }
    if (isPrivateOrReservedIP(trimmed)) {
      return {
        statusCode: 400,
        headers: { ...cors.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Private, loopback, or reserved IP addresses cannot be geolocated.' })
      }
    }
    target = trimmed
  } else {
    // Explicit self check: verify clientIp is valid and not private
    if (clientIp && net.isIP(clientIp) && !isPrivateOrReservedIP(clientIp)) {
      target = clientIp
    } else {
      // P1-07: Never fallback to empty target which would query the server's own egress IP!
      return {
        statusCode: 400,
        headers: { ...cors.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Client IP is private, local, or could not be verified. Cannot geolocate private network addresses.' })
      }
    }
  }

  // Double check target is strictly non-empty to completely prevent serverless infrastructure leak
  if (!target) {
    return {
      statusCode: 400,
      headers: { ...cors.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'A valid public IP address is required for geolocation.' })
    }
  }

  const encodedTarget = encodeURIComponent(target)
  const deadline = Date.now() + 7500

  // 1. Provider 1: ipapi.co
  if (Date.now() < deadline - 1000) {
    try {
      const remaining = Math.min(2000, Math.max(1200, deadline - Date.now() - 300))
      const url = `https://ipapi.co/${encodedTarget}/json/`
      const res = await get(url, remaining)
      if (res.status === 200) {
        const d = JSON.parse(res.body)
        if (!d.error && d.ip) {
          return {
            statusCode: 200,
            headers: { ...cors.headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ip: d.ip, city: d.city, region: d.region, country: d.country_name,
              country_code: d.country_code, continent: d.continent_code,
              lat: d.latitude, lon: d.longitude, timezone: d.timezone,
              org: d.org, asn: d.asn, postal: d.postal,
              currency: d.currency, calling_code: d.country_calling_code,
              languages: d.languages,
            })
          }
        }
      }
    } catch (e1) {}
  }

  // 2. Provider 2: ipwho.is
  if (Date.now() < deadline - 1000) {
    try {
      const remaining = Math.min(2000, Math.max(1200, deadline - Date.now() - 300))
      const iwUrl = `https://ipwho.is/${encodedTarget}`
      const iw = await get(iwUrl, remaining)
      if (iw.status === 200) {
        const d = JSON.parse(iw.body)
        if (d.success && d.ip) {
          return {
            statusCode: 200,
            headers: { ...cors.headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ip: d.ip, city: d.city, region: d.region, country: d.country,
              country_code: d.country_code, continent: d.continent_code,
              lat: d.latitude, lon: d.longitude, timezone: d.timezone?.id,
              org: d.connection?.isp || d.connection?.org, asn: d.connection?.asn, postal: d.postal,
              currency: d.currency?.code, calling_code: d.calling_code, languages: null,
            })
          }
        }
      }
    } catch (e2) {}
  }

  // 3. Provider 3: ipwhois.app
  if (Date.now() < deadline - 1000) {
    try {
      const remaining = Math.min(2000, Math.max(1200, deadline - Date.now() - 300))
      const appUrl = `https://ipwhois.app/json/${encodedTarget}`
      const app = await get(appUrl, remaining)
      if (app.status === 200) {
        const d = JSON.parse(app.body)
        if (d.success && d.ip) {
          return {
            statusCode: 200,
            headers: { ...cors.headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ip: d.ip, city: d.city, region: d.region, country: d.country,
              country_code: d.country_code, continent: d.continent_code,
              lat: d.latitude, lon: d.longitude, timezone: d.timezone?.id,
              org: d.connection?.isp || d.connection?.org, asn: d.connection?.asn, postal: d.postal,
              currency: d.currency?.code, calling_code: d.calling_code, languages: null,
            })
          }
        }
      }
    } catch (e3) {}
  }

  // 4. Provider 4: freeipapi.com
  if (Date.now() < deadline - 1000) {
    try {
      const remaining = Math.min(2000, Math.max(1200, deadline - Date.now() - 300))
      const freeUrl = `https://freeipapi.com/api/json/${encodedTarget}`
      const freeRes = await get(freeUrl, remaining)
      if (freeRes.status === 200) {
        const d = JSON.parse(freeRes.body)
        if (d && d.countryName) {
          return {
            statusCode: 200,
            headers: { ...cors.headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ip: d.ipAddress || target, city: d.cityName, region: d.regionName, country: d.countryName,
              country_code: d.countryCode, continent: d.continentCode || d.continent,
              lat: d.latitude, lon: d.longitude, timezone: d.timeZone,
              org: null, asn: null, postal: d.zipCode,
              currency: d.currency?.code || null, calling_code: null, languages: null,
            })
          }
        }
      }
    } catch (e4) {}
  }

  return {
    statusCode: 502,
    headers: cors.headers,
    body: JSON.stringify({ error: 'All IP lookup providers are currently unreachable or busy. Please try again shortly.' })
  }
}
