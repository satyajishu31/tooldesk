// netlify/functions/hibp.js
// Have I Been Pwned — password & email breach check
// k-anonymity model for passwords, HIBP API key for email lookup

const https = require('https')
const { getClientIp } = require('./utils/ip')
const { handleCors } = require('./utils/cors')
const { enforceRateLimit } = require('./utils/rateLimiter')

function httpsGet(options) {
  return new Promise((resolve, reject) => {
    let settled = false
    const safeResolve = val => { if (!settled) { settled = true; resolve(val) } }
    const safeReject = err => { if (!settled) { settled = true; reject(err) } }

    let activeRes = null
    const req = https.request(options, res => {
      activeRes = res
      const chunks = []
      let byteCount = 0
      const MAX_STREAM = 5 * 1024 * 1024
      res.on('error', safeReject)
      res.on('data', c => {
        byteCount += c.length
        if (byteCount > MAX_STREAM) {
          res.destroy()
          req.destroy()
          if (res.socket && !res.socket.destroyed) res.socket.destroy()
          safeReject(new Error('Response exceeded 5MB limit'))
          return
        }
        chunks.push(c)
      })
      res.on('end', () => safeResolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }))
    })
    req.on('error', safeReject)
    req.on('timeout', () => {
      req.destroy()
      if (activeRes) activeRes.destroy()
      safeReject(new Error('Timeout'))
    })
    req.end()
  })
}

exports.handler = async function(event) {
  const cors = handleCors(event, { allowedMethods: 'POST,OPTIONS' })
  if (!cors.isAllowed || !cors.ok) return cors.response || { statusCode: cors.status || 403, headers: cors.headers, body: JSON.stringify({ error: cors.error }) }
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors.headers, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors.headers, body: JSON.stringify({ error: 'Method not allowed' }) }

  const clientIp = getClientIp(event)

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

  const { type, value } = payload

  /* ── Password check via k-anonymity ── */
  if (type === 'password') {
    const rl = await enforceRateLimit(clientIp, { action: 'hibp-password', maxRequests: 30, windowSeconds: 60 })
    if (!rl.allowed) {
      return {
        statusCode: 429,
        headers: { ...cors.headers, 'Content-Type': 'application/json', 'Retry-After': String(rl.retryAfter) },
        body: JSON.stringify({ error: 'Too many password checks. Please wait a minute.' })
      }
    }

    const { prefix } = payload
    if (typeof prefix !== 'string' || !/^[0-9A-Fa-f]{5}$/.test(prefix)) {
      return { statusCode: 400, headers: cors.headers, body: JSON.stringify({ error: 'prefix must be exactly 5 hex characters' }) }
    }

    try {
      const res = await httpsGet({
        hostname: 'api.pwnedpasswords.com',
        path: `/range/${prefix}`,
        method: 'GET',
        headers: { 'User-Agent': 'ToolDesk-PasswordChecker', 'Add-Padding': 'true' },
        timeout: 6500,
      })
      if (res.status !== 200) return { statusCode: 502, headers: cors.headers, body: JSON.stringify({ error: `HIBP error ${res.status}` }) }
      return {
        statusCode: 200,
        headers: { ...cors.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ range: res.body, hash_prefix: prefix })
      }
    } catch(e) {
      const statusCode = e.message === 'Timeout' ? 504 : 502
      return { statusCode, headers: cors.headers, body: JSON.stringify({ error: e.message || 'HIBP upstream connection error' }) }
    }
  }

  /* ── Email breach check ── */
  if (type === 'email') {
    const key = process.env.HIBP_API_KEY
    if (!key) return { statusCode: 503, headers: cors.headers, body: JSON.stringify({ error: 'HIBP_API_KEY not configured. Get a free key at haveibeenpwned.com/API/Key' }) }

    const trimmedVal = typeof value === 'string' ? value.trim() : ''
    if (!trimmedVal || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedVal) || trimmedVal.length > 254) {
      return { statusCode: 400, headers: cors.headers, body: JSON.stringify({ error: 'Valid email required' }) }
    }

    const rl = await enforceRateLimit(clientIp, { action: 'hibp-email', maxRequests: 8, windowSeconds: 60 })
    if (!rl.allowed) {
      return {
        statusCode: 429,
        headers: { ...cors.headers, 'Content-Type': 'application/json', 'Retry-After': String(rl.retryAfter) },
        body: JSON.stringify({ error: 'Too many email checks. Please wait a minute.' })
      }
    }

    try {
      const res = await httpsGet({
        hostname: 'haveibeenpwned.com',
        path: `/api/v3/breachedaccount/${encodeURIComponent(trimmedVal)}?truncateResponse=false`,
        method: 'GET',
        headers: {
          'hibp-api-key': key,
          'User-Agent': 'ToolDesk-BreachChecker',
          'Content-Type': 'application/json',
        },
        timeout: 6500,
      })

      if (res.status === 404) return { statusCode: 200, headers: { ...cors.headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ pwned: false, breaches: [], count: 0 }) }
      if (res.status === 401) return { statusCode: 401, headers: cors.headers, body: JSON.stringify({ error: 'Invalid HIBP API key' }) }
      if (res.status === 429) return { statusCode: 429, headers: cors.headers, body: JSON.stringify({ error: 'Rate limited. Try again in a moment.' }) }
      if (res.status !== 200) return { statusCode: res.status, headers: cors.headers, body: JSON.stringify({ error: `HIBP error ${res.status}` }) }

      let breaches
      try { breaches = JSON.parse(res.body) } catch { breaches = [] }
      if (!Array.isArray(breaches)) return { statusCode: 502, headers: cors.headers, body: JSON.stringify({ error: 'Unexpected response format from HIBP' }) }

      return {
        statusCode: 200,
        headers: { ...cors.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pwned: true,
          count: breaches.length,
          breaches: breaches.filter(b => b && typeof b === 'object').map(b => ({
            name: typeof b.Name === 'string' ? b.Name : 'Unknown Breach',
            domain: typeof b.Domain === 'string' ? b.Domain : '',
            date: typeof b.BreachDate === 'string' ? b.BreachDate : '',
            dataClasses: Array.isArray(b.DataClasses) ? b.DataClasses.filter(d => typeof d === 'string') : [],
            description: typeof b.Description === 'string' ? b.Description.slice(0, 1000).replace(/<[^>]*>/g, '').slice(0, 200) : '',
            logoPath: typeof b.LogoPath === 'string' ? b.LogoPath : '',
          })),
        })
      }
    } catch(e) {
      const statusCode = e.message === 'Timeout' ? 504 : 502
      return { statusCode, headers: cors.headers, body: JSON.stringify({ error: e.message || 'HIBP upstream connection error' }) }
    }
  }

  return { statusCode: 400, headers: cors.headers, body: JSON.stringify({ error: 'type must be "password" or "email"' }) }
}
