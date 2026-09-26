// netlify/functions/deepl.js
// DeepL Translation API with Groq AI & MyMemory fallbacks
// Differentiates upstream failures from total outages without hiding quota or auth issues.

const https = require('https')
const { getClientIp } = require('./utils/ip')
const { handleCors } = require('./utils/cors')
const { enforceRateLimit } = require('./utils/rateLimiter')

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
  const rl = await enforceRateLimit(clientIp, { action: 'deepl', maxRequests: 30, windowSeconds: 60 })
  if (!rl.allowed) {
    return {
      statusCode: 429,
      headers: { ...cors.headers, 'Content-Type': 'application/json', 'Retry-After': String(rl.retryAfter) },
      body: JSON.stringify({ error: 'Rate limit exceeded. Please wait a minute before translating more text.' })
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

  const { text, target_lang, source_lang } = payload
  if (typeof text !== 'string' || !text.trim()) {
    return { statusCode: 400, headers: cors.headers, body: JSON.stringify({ error: 'text required' }) }
  }
  if (typeof target_lang !== 'string' || !target_lang.trim()) {
    return { statusCode: 400, headers: cors.headers, body: JSON.stringify({ error: 'target_lang required' }) }
  }

  const LANG_REGEX = /^[a-zA-Z]{2,4}(-[a-zA-Z]{2,4})?$/
  if (!LANG_REGEX.test(target_lang.trim())) {
    return { statusCode: 400, headers: cors.headers, body: JSON.stringify({ error: 'Invalid target_lang code' }) }
  }
  if (source_lang && typeof source_lang === 'string' && source_lang !== 'auto' && !LANG_REGEX.test(source_lang.trim())) {
    return { statusCode: 400, headers: cors.headers, body: JSON.stringify({ error: 'Invalid source_lang code' }) }
  }

  if (text.length > 50000) {
    return { statusCode: 400, headers: cors.headers, body: JSON.stringify({ error: 'Text too long (max 50,000 chars per request)' }) }
  }

  async function translateWithGroq(text, target_lang, source_lang) {
    const groqKey = process.env.GROQ_API_KEY
    if (!groqKey) throw new Error('GROQ_API_KEY not configured')
    const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'
    const bodyPayload = JSON.stringify({
      model,
      messages: [
        { role: 'system', content: `You are a professional translator. Translate the given text accurately to target language code "${target_lang}". Preserve all formatting, markdown, and punctuation. Return ONLY the translation, with no commentary, intro, or surrounding quotes.` },
        { role: 'user', content: text }
      ],
      temperature: 0.1
    })

    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.groq.com',
        path: '/openai/v1/chat/completions',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${groqKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyPayload)
        },
        timeout: 12000
      }, res => {
        const chunks = []
        let byteCount = 0
        const MAX_STREAM = 5 * 1024 * 1024
        res.on('data', c => {
          byteCount += c.length
          if (byteCount > MAX_STREAM) {
            res.destroy()
            req.destroy()
            reject(new Error('Groq translation response exceeded 5MB limit'))
            return
          }
          chunks.push(c)
        })
        res.on('end', () => {
          try {
            const d = Buffer.concat(chunks).toString('utf8')
            const parsed = JSON.parse(d)
            let trans = parsed.choices?.[0]?.message?.content?.trim()
            if (trans) {
              trans = trans.replace(/<think>[\s\S]*?<\/think>\s*/gi, '').trim()
              resolve({
                translation: trans,
                detected_source: source_lang || '',
                chars_used: text.length,
                fallback: true,
                provider: 'groq'
              })
            } else {
              reject(new Error(parsed.error?.message || 'No translation from Groq'))
            }
          } catch (e) {
            reject(e)
          }
        })
      })
      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('Groq translation timeout')) })
      req.write(bodyPayload)
      req.end()
    })
  }

  async function runFallback(text, target_lang, source_lang, primaryFailureReason = null) {
    // Privacy-preserving Groq AI fallback (encrypted server-side POST, zero public logging)
    if (process.env.GROQ_API_KEY) {
      try {
        const groqResult = await translateWithGroq(text, target_lang, source_lang)
        return {
          statusCode: 200,
          headers: { ...cors.headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...groqResult,
            primary_status: primaryFailureReason || 'UNCONFIGURED'
          })
        }
      } catch (groqErr) {
        // Return clear error if both failed
        const outStatus = primaryFailureReason === 'UPSTREAM_QUOTA' ? 429 : 502
        return {
          statusCode: outStatus,
          headers: { ...cors.headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: `Translation failed: primary service (${primaryFailureReason || 'none'}) and AI fallback failed (${groqErr.message})`,
            primary_status: primaryFailureReason || 'UNCONFIGURED'
          })
        }
      }
    }

    const outStatus = primaryFailureReason === 'UPSTREAM_QUOTA' ? 429
                    : primaryFailureReason === 'UPSTREAM_AUTH_ERROR' ? 403
                    : 503
    return {
      statusCode: outStatus,
      headers: { ...cors.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: primaryFailureReason ? `Primary translation service failed (${primaryFailureReason}) and no secondary provider is configured.` : 'Translation service unavailable. Please configure API keys.',
        primary_status: primaryFailureReason || 'UNCONFIGURED'
      })
    }
  }

  const key = process.env.DEEPL_API_KEY
  if (!key) {
    return await runFallback(text, target_lang, source_lang, 'UNCONFIGURED')
  }

  const isFree = key.endsWith(':fx')
  const host   = isFree ? 'api-free.deepl.com' : 'api.deepl.com'

  const bodyData = JSON.stringify({
    text: [text],
    target_lang: target_lang.toUpperCase(),
    ...(typeof source_lang === 'string' && source_lang ? { source_lang: source_lang.toUpperCase() } : {}),
    split_sentences: '1',
    preserve_formatting: true,
  })

  return new Promise(resolve => {
    let settled = false
    const safeResolve = val => { if (!settled) { settled = true; resolve(val) } }

    const req = https.request({
      hostname: host,
      path: '/v2/translate',
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${key}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyData),
      },
      timeout: 4500,
    }, res => {
      const chunks = []
      let byteCount = 0
      const MAX_STREAM = 5 * 1024 * 1024

      res.on('error', async () => {
        const fb = await runFallback(text, target_lang, source_lang, 'UPSTREAM_NETWORK_ERROR')
        safeResolve(fb)
      })

      res.on('data', c => {
        byteCount += c.length
        if (byteCount > MAX_STREAM) {
          res.destroy()
          req.destroy()
          if (res.socket && !res.socket.destroyed) res.socket.destroy()
          runFallback(text, target_lang, source_lang, 'UPSTREAM_OVERSIZED_RESPONSE').then(safeResolve)
          return
        }
        chunks.push(c)
      })

      res.on('end', async () => {
        if (res.statusCode === 200) {
          try {
            const data = JSON.parse(Buffer.concat(chunks).toString('utf8'))
            if (data.translations?.[0]?.text) {
              safeResolve({
                statusCode: 200,
                headers: { ...cors.headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  translation: data.translations[0].text,
                  detected_source: data.translations[0].detected_source_language || '',
                  chars_used: text.length,
                  fallback: false,
                  provider: 'deepl'
                })
              })
              return
            }
          } catch {}
        }

        // Map status code
        let reason = 'UPSTREAM_SERVER_ERROR'
        if (res.statusCode === 456 || res.statusCode === 429) {
          reason = 'UPSTREAM_QUOTA'
        } else if (res.statusCode === 403) {
          reason = 'UPSTREAM_AUTH_ERROR'
        } else if (res.statusCode >= 500) {
          reason = 'UPSTREAM_SERVER_ERROR'
        }

        console.warn(`[deepl] DeepL returned status ${res.statusCode} (${reason}), triggering fallback`)
        const fb = await runFallback(text, target_lang, source_lang, reason)
        safeResolve(fb)
      })
    })

    req.on('error', async () => {
      const fb = await runFallback(text, target_lang, source_lang, 'UPSTREAM_NETWORK_ERROR')
      safeResolve(fb)
    })

    req.on('timeout', async () => {
      req.destroy()
      const fb = await runFallback(text, target_lang, source_lang, 'UPSTREAM_TIMEOUT')
      safeResolve(fb)
    })

    req.write(bodyData)
    req.end()
  })
}
