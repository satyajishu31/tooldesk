// netlify/functions/removebg.js
// Secure server-side proxy to the official remove.bg API.
// Supports key rotation, circuit-breaker health tracking, and Clipdrop fallback.

const https = require('https')
const crypto = require('crypto')
const { getClientIp } = require('./utils/ip')
const { handleCors } = require('./utils/cors')
const { enforceRateLimit } = require('./utils/rateLimiter')

const MAX_BYTES = 4.5 * 1024 * 1024 // 4.5MB cap to ensure base64 response fits under Netlify 6MB body limit
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])
const RETRYABLE_STATUS = new Set([402, 403, 429])

// Key health / circuit breaker state across invocations in the container
const keyCooldowns = new Map() // keyFingerprint -> cooldownUntilMs

function getKeyFingerprint(key) {
  if (!key || typeof key !== 'string') return ''
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 12)
}

function recordKeyHealth(key, statusCode) {
  const fp = getKeyFingerprint(key)
  if (!fp) return

  const now = Date.now()
  if (statusCode === 200) {
    keyCooldowns.delete(fp)
  } else if (statusCode === 402 || statusCode === 403) {
    // Quota exhausted (402) or revoked/invalid auth (403): 15-minute cooldown
    keyCooldowns.set(fp, now + 15 * 60 * 1000)
    console.warn(`[removebg] Key [${fp}] deactivated for 15m due to HTTP ${statusCode}`)
  } else if (statusCode === 429) {
    // Upstream rate limit: 3-minute cooldown
    keyCooldowns.set(fp, now + 3 * 60 * 1000)
    console.warn(`[removebg] Key [${fp}] cooldown for 3m due to HTTP 429`)
  }
}

function getActiveKeys() {
  const allKeys = [
    process.env.REMOVE_BG_API_KEY,
    process.env.REMOVE_BG_API_KEY_2,
    process.env.REMOVE_BG_API_KEY_3,
    process.env.REMOVE_BG_API_KEY_4,
  ].filter(k => typeof k === 'string' && k.trim().length > 0)

  const now = Date.now()
  // Clean expired cooldowns
  for (const [fp, exp] of keyCooldowns.entries()) {
    if (now >= exp) keyCooldowns.delete(fp)
  }

  // Filter out keys currently on cooldown
  const active = allKeys.filter(k => {
    const fp = getKeyFingerprint(k)
    return !keyCooldowns.has(fp)
  })

  // If ALL configured keys are in cooldown, allow one key to probe recovery
  if (active.length === 0 && allKeys.length > 0) {
    return [allKeys[0]]
  }

  return active
}

// Select starting key via uniform rejection sampling (no modulo bias)
function getStartingIndex(numKeys) {
  if (numKeys <= 1) return 0
  const limit = 4294967296 - (4294967296 % numKeys)
  let val
  do {
    val = crypto.randomBytes(4).readUInt32BE(0)
  } while (val >= limit)
  return val % numKeys
}

function buildMultipart(buffer, filename, mimeType, size) {
  const boundary = '----tooldeskRemoveBg' + crypto.randomBytes(12).toString('hex')
  const safeFilename = (typeof filename === 'string' ? filename : 'image.png')
    .replace(/[\r\n"]/g, '')
    .trim()
    .slice(0, 120) || 'image.png'
  const safeMime = (typeof mimeType === 'string' && ALLOWED_MIME.has(mimeType))
    ? mimeType.replace(/[\r\n]/g, '')
    : 'image/png'
  const safeSize = (typeof size === 'string' ? size : 'auto')
    .replace(/[\r\n]/g, '')
    .slice(0, 10)

  const pre = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="image_file"; filename="${safeFilename}"\r\n` +
    `Content-Type: ${safeMime}\r\n\r\n`
  )
  const mid = Buffer.from(
    `\r\n--${boundary}\r\n` +
    `Content-Disposition: form-data; name="size"\r\n\r\n${safeSize}\r\n` +
    `--${boundary}--\r\n`
  )
  return { pre, buffer, mid, boundary, length: pre.length + buffer.length + mid.length }
}

function attempt(key, multipart, timeoutMs = 5500) {
  return new Promise(resolve => {
    let resolved = false
    const safeResolve = val => { if (!resolved) { resolved = true; resolve(val) } }

    const req = https.request({
      hostname: 'api.remove.bg',
      path: '/v1.0/removebg',
      method: 'POST',
      headers: {
        'X-Api-Key': key,
        'Content-Type': `multipart/form-data; boundary=${multipart.boundary}`,
        'Content-Length': multipart.length,
      },
      timeout: timeoutMs,
    }, res => {
      const chunks = []
      let byteCount = 0
      res.on('error', () => safeResolve({ ok: false, statusCode: 500, retryable: true, network: true }))
      res.on('data', c => {
        byteCount += c.length
        if (byteCount > 4.5 * 1024 * 1024) {
          res.destroy()
          req.destroy()
          if (res.socket && !res.socket.destroyed) res.socket.destroy()
          safeResolve({ ok: false, statusCode: 502, retryable: true, network: true })
          return
        }
        chunks.push(c)
      })
      res.on('end', () => {
        recordKeyHealth(key, res.statusCode)

        if (byteCount > 4.5 * 1024 * 1024) {
          safeResolve({ ok: false, statusCode: 500, retryable: true, network: true })
          return
        }
        if (res.statusCode === 200) {
          const bodyBuf = Buffer.concat(chunks)
          chunks.length = 0
          safeResolve({ ok: true, statusCode: 200, body: bodyBuf.toString('base64') })
          return
        }
        let apiMsg = ''
        try {
          const bodyBuf = Buffer.concat(chunks)
          chunks.length = 0
          apiMsg = JSON.parse(bodyBuf.toString('utf8')).errors?.[0]?.title || ''
        } catch {}
        chunks.length = 0
        safeResolve({
          ok: false,
          statusCode: res.statusCode,
          apiMsg,
          retryable: RETRYABLE_STATUS.has(res.statusCode) || res.statusCode >= 500,
        })
      })
    })
    req.on('error', () => safeResolve({ ok: false, statusCode: 0, retryable: true, network: true }))
    req.on('timeout', () => { req.destroy(); safeResolve({ ok: false, statusCode: 0, retryable: true, timeout: true }) })
    req.write(multipart.pre)
    req.write(multipart.buffer)
    req.write(multipart.mid)
    req.end()
  })
}

function errorResponse(last, corsHeaders) {
  const jsonResp = (code, obj) => ({
    statusCode: code,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(obj)
  })

  if (!last) return jsonResp(503, { error: 'Background removal is not configured on this server.' })
  if (last.timeout) return jsonResp(504, { error: 'Background removal timed out. Please try again.' })
  if (last.network) return jsonResp(500, { error: 'Network error while removing the background. Please try again.' })
  switch (last.statusCode) {
    case 400: return jsonResp(400, { error: 'This image could not be processed. Please try a different image.' })
    case 403: return jsonResp(403, { error: 'Background removal credentials invalid or expired on server.' })
    case 402: return jsonResp(402, { error: 'Background removal monthly quota limit reached. Please try again later.' })
    case 429: return jsonResp(429, { error: 'Background removal service is busy. Please try again shortly.' })
    default:
      if (last.statusCode >= 500) return jsonResp(502, { error: 'Background removal service is temporarily unavailable.' })
      return jsonResp(last.statusCode || 500, { error: last.apiMsg || 'Background removal failed. Please try again.' })
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
  const rl = await enforceRateLimit(clientIp, { action: 'removebg', maxRequests: 12, windowSeconds: 60 })
  if (!rl.allowed) {
    return {
      statusCode: 429,
      headers: { ...cors.headers, 'Content-Type': 'application/json', 'Retry-After': String(rl.retryAfter) },
      body: JSON.stringify({ error: 'Rate limit exceeded. Please wait a minute before removing backgrounds from more images.' })
    }
  }

  const keys = getActiveKeys()
  if (!keys.length && !process.env.CLIPDROP_API_KEY) {
    return {
      statusCode: 503,
      headers: { ...cors.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Background removal service is currently unavailable or quota exhausted.' })
    }
  }

  let payload
  try {
    const parsed = JSON.parse(event.body || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { statusCode: 400, headers: cors.headers, body: JSON.stringify({ error: 'Request body must be a valid JSON object.' }) }
    }
    payload = parsed
  } catch {
    return { statusCode: 400, headers: cors.headers, body: JSON.stringify({ error: 'Invalid request body.' }) }
  }

  const { imageBase64, filename, mimeType } = payload
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return { statusCode: 400, headers: cors.headers, body: JSON.stringify({ error: 'No image provided. Please upload an image and try again.' }) }
  }
  if (mimeType && !ALLOWED_MIME.has(mimeType)) {
    return { statusCode: 400, headers: cors.headers, body: JSON.stringify({ error: 'Unsupported image type. Please use a JPEG, PNG, or WebP image.' }) }
  }

  // Fast-fail before base64 decoding giant payloads to preserve heap
  if (imageBase64.length > (MAX_BYTES * 4 / 3 + 2048)) {
    return { statusCode: 400, headers: cors.headers, body: JSON.stringify({ error: `Image is too large (max ${Math.round(MAX_BYTES / 1024 / 1024)}MB). Please use a smaller image.` }) }
  }

  let buffer
  try {
    const b64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64
    buffer = Buffer.from(b64, 'base64')
  } catch {
    return { statusCode: 400, headers: cors.headers, body: JSON.stringify({ error: 'Could not read the uploaded image. Please try a different file.' }) }
  }
  if (!buffer.length) return { statusCode: 400, headers: cors.headers, body: JSON.stringify({ error: 'The uploaded image appears to be empty.' }) }
  if (buffer.length > MAX_BYTES) {
    return { statusCode: 400, headers: cors.headers, body: JSON.stringify({ error: `Image is too large (max ${Math.round(MAX_BYTES / 1024 / 1024)}MB). Please use a smaller image.` }) }
  }

  let lastFailure = null
  const deadline = Date.now() + 8500 // 8.5s hard execution budget to prevent unhandled 504 lambda kill

  if (keys.length > 0) {
    const startIdx = getStartingIndex(keys.length)
    for (let i = 0; i < keys.length; i++) {
      const remainingTime = deadline - Date.now()
      if (remainingTime < 1500) break

      const key = keys[(startIdx + i) % keys.length]
      const multipart = buildMultipart(buffer, filename, mimeType, 'auto')
      const attemptTimeout = Math.max(2000, Math.min(5000, remainingTime - 500))
      const result = await attempt(key, multipart, attemptTimeout)

      if (result.ok) {
        return {
          statusCode: 200,
          headers: { ...cors.headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ result: `data:image/png;base64,${result.body}` })
        }
      }

      lastFailure = result
      if (!result.retryable) break // bad image (400) — do not cycle other keys
    }
  }

  // Provider #2 Fallback: Clipdrop API
  const remainingForClipdrop = deadline - Date.now()
  if (process.env.CLIPDROP_API_KEY && remainingForClipdrop >= 2000) {
    try {
      const clipdropRes = await new Promise(resolve => {
        const multipart = buildMultipart(buffer, filename, mimeType, 'auto')
        const req = https.request({
          hostname: 'clipdrop-api.co',
          path: '/remove-background/v1',
          method: 'POST',
          headers: {
            'x-api-key': process.env.CLIPDROP_API_KEY,
            'Content-Type': `multipart/form-data; boundary=${multipart.boundary}`,
            'Content-Length': multipart.length,
          },
          timeout: Math.max(1800, remainingForClipdrop - 500),
        }, res => {
          const chunks = []
          let byteCount = 0
          res.on('data', c => {
            byteCount += c.length
            if (byteCount > 4.5 * 1024 * 1024) {
              res.destroy()
              req.destroy()
              if (res.socket && !res.socket.destroyed) res.socket.destroy()
              resolve({ ok: false, error: 'Stream limit exceeded' })
              return
            }
            chunks.push(c)
          })
          res.on('error', () => resolve({ ok: false }))
          res.on('end', () => {
            if (res.statusCode === 200 && byteCount <= 4.5 * 1024 * 1024) {
              const bodyBuf = Buffer.concat(chunks)
              chunks.length = 0
              resolve({ ok: true, body: bodyBuf.toString('base64') })
            } else {
              chunks.length = 0
              resolve({ ok: false })
            }
          })
        })
        req.on('error', () => resolve({ ok: false }))
        req.on('timeout', () => { req.destroy(); resolve({ ok: false }) })
        req.write(multipart.pre)
        req.write(multipart.buffer)
        req.write(multipart.mid)
        req.end()
      })

      if (clipdropRes.ok) {
        return {
          statusCode: 200,
          headers: { ...cors.headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ result: `data:image/png;base64,${clipdropRes.body}` })
        }
      }
    } catch (e) {}
  }

  return errorResponse(lastFailure, cors.headers)
}
