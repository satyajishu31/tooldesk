// netlify/functions/transcribe.js
// Groq Whisper — server-side audio transcription with origin protection and rate limiting.

const https = require('https')
const { getClientIp } = require('./utils/ip')
const { handleCors } = require('./utils/cors')
const { enforceRateLimit } = require('./utils/rateLimiter')

exports.handler = async function(event) {
  const cors = handleCors(event, { allowedMethods: 'POST,OPTIONS' })
  if (!cors.isAllowed || !cors.ok) return cors.response || { statusCode: cors.status || 403, headers: cors.headers, body: JSON.stringify({ error: cors.error }) }
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors.headers, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors.headers, body: 'Method Not Allowed' }

  const clientIp = getClientIp(event)
  const rl = await enforceRateLimit(clientIp, { action: 'transcribe', maxRequests: 20, windowSeconds: 60 })
  if (!rl.allowed) {
    return {
      statusCode: 429,
      headers: { ...cors.headers, 'Content-Type': 'application/json', 'Retry-After': String(rl.retryAfter) },
      body: JSON.stringify({ error: 'Rate limit exceeded. Please wait a minute before transcribing more audio chunks.' })
    }
  }

  const key = process.env.GROQ_API_KEY
  if (!key) {
    return {
      statusCode: 503,
      headers: { ...cors.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'GROQ_API_KEY is not configured in environment variables.',
      }),
    }
  }

  let body
  try {
    const parsed = JSON.parse(event.body || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { statusCode: 400, headers: cors.headers, body: JSON.stringify({ error: 'Request body must be a JSON object' }) }
    }
    body = parsed
  } catch {
    return { statusCode: 400, headers: cors.headers, body: JSON.stringify({ error: 'Invalid JSON body' }) }
  }

  const { audioBase64, mimeType = 'audio/mp4', fileName = 'audio.mp4', language, chunkIndex, totalChunks } = body

  if (!audioBase64 || typeof audioBase64 !== 'string') {
    return { statusCode: 400, headers: cors.headers, body: JSON.stringify({ error: 'Valid audioBase64 string is required' }) }
  }

  // Guard against payloads exceeding Netlify payload limit (~5.5MB)
  const approxBytes = audioBase64.length * 0.75
  if (approxBytes > 5.5 * 1024 * 1024) {
    return {
      statusCode: 413,
      headers: { ...cors.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: `Chunk too large (${(approxBytes / 1024 / 1024).toFixed(1)}MB). Netlify functions accept at most ~5.5MB per request. Please use smaller chunks.`,
      }),
    }
  }

  let audioBuffer
  try {
    const cleanB64 = audioBase64.includes(',') ? audioBase64.split(',')[1] : audioBase64
    audioBuffer = Buffer.from(cleanB64, 'base64')
  } catch (e) {
    return { statusCode: 400, headers: cors.headers, body: JSON.stringify({ error: 'Invalid base64 audio data' }) }
  }

  if (!audioBuffer || audioBuffer.length === 0) {
    return { statusCode: 400, headers: cors.headers, body: JSON.stringify({ error: 'Decoded audio buffer is empty' }) }
  }

  const boundary = `----ToolDeskBoundary${Date.now().toString(36)}`
  const parts = []

  const safeFileName = (typeof fileName === 'string' ? fileName : 'audio.mp4')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 100) || 'audio.mp4'
  const ALLOWED_AUDIO = new Set(['audio/mp4', 'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/x-m4a'])
  const safeMimeType = (typeof mimeType === 'string' && ALLOWED_AUDIO.has(mimeType))
    ? mimeType
    : 'audio/mp4'

  parts.push(Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${safeFileName}"\r\n` +
    `Content-Type: ${safeMimeType}\r\n\r\n`, 'utf8'
  ))
  parts.push(audioBuffer)
  parts.push(Buffer.from('\r\n', 'utf8'))

  const whisperModel = process.env.GROQ_WHISPER_MODEL || 'whisper-large-v3'
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${whisperModel}\r\n`, 'utf8'))
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\nverbose_json\r\n`, 'utf8'))
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="timestamp_granularities[]"\r\n\r\nsegment\r\n`, 'utf8'))

  if (typeof language === 'string' && language !== 'auto') {
    const rawIso = language.split('-')[0].split('_')[0].trim().toLowerCase()
    if (/^[a-z]{2,5}$/.test(rawIso)) {
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\n${rawIso}\r\n`, 'utf8'))
    }
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'))
  const totalLength = parts.reduce((sum, p) => sum + p.length, 0)

  let result
  try {
    result = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.groq.com',
        path: '/openai/v1/audio/transcriptions',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': totalLength,
        },
        timeout: 8500,
      }, res => {
        const chunks = []
        let byteCount = 0
        const MAX_STREAM = 5 * 1024 * 1024
        res.on('data', c => {
          byteCount += c.length
          if (byteCount > MAX_STREAM) {
            res.destroy()
            req.destroy()
            if (res.socket && !res.socket.destroyed) res.socket.destroy()
            reject(new Error('Groq transcription response exceeded 5MB limit'))
            return
          }
          chunks.push(c)
        })
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }))
        res.on('error', reject)
      })
      req.on('error', reject)
      req.on('timeout', () => {
        req.destroy()
        const err = new Error('Transcription request timed out. Please try a shorter audio chunk.')
        err.isTimeout = true
        reject(err)
      })
      for (const part of parts) {
        req.write(part)
      }
      req.end()
    })
  } catch (e) {
    const statusCode = e.isTimeout ? 504 : 502
    return {
      statusCode,
      headers: { ...cors.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: e.message || 'Network error communicating with Groq API' }),
    }
  }

  if (result.status !== 200) {
    let msg = `Groq API error (${result.status})`
    try { msg = JSON.parse(result.body)?.error?.message || msg } catch {}
    return { statusCode: result.status, headers: { ...cors.headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: msg }) }
  }

  let parsed = {}
  try {
    const rawParsed = JSON.parse(result.body)
    if (rawParsed && typeof rawParsed === 'object' && !Array.isArray(rawParsed)) {
      parsed = rawParsed
    }
  } catch {}

  if (typeof totalChunks === 'number' && totalChunks > 1) {
    parsed.chunkIndex = typeof chunkIndex === 'number' ? chunkIndex : 0
    parsed.totalChunks = totalChunks
  }

  return {
    statusCode: 200,
    headers: { ...cors.headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed),
  }
}
