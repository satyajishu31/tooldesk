// netlify/functions/groq-ai.js
// Single universal Groq AI function for all ToolDesk tools
// Uses: llama-3.3-70b-versatile for text, whisper-large-v3 for audio
// GROQ_API_KEY is read from Netlify environment — never exposed to frontend

const https = require('https')

/* ── Prompt injection sanitizer ── */
function sanitizeForPrompt(val, maxLen = 500) {
  if (typeof val !== 'string') return ''
  return val
    .replace(/[\r\n]+/g, ' ')
    .replace(/["\u201C\u201D]/g, "'")
    .slice(0, maxLen)
    .trim()
}

/* ── Brave Search API helper ── */
function searchBrave(apiKey, query, count = 5, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    let settled = false
    const safeResolve = val => { if (!settled) { settled = true; resolve(val) } }
    const safeReject = err => { if (!settled) { settled = true; reject(err) } }
    const q   = encodeURIComponent(query.slice(0, 400))
    const path = `/res/v1/web/search?q=${q}&count=${count}&freshness=pm`   // pm = past month
    let activeRes = null
    const req = https.request({
      hostname: 'api.search.brave.com',
      path,
      method: 'GET',
      headers: {
        'Accept':         'application/json',
        'Accept-Encoding':'gzip',
        'X-Subscription-Token': apiKey,
      },
      timeout: Math.max(1000, Math.min(timeoutMs, 3500)),
    }, res => {
      activeRes = res
      const chunks = []
      let byteCount = 0
      const MAX_SEARCH = 2 * 1024 * 1024 // 2MB cap
      res.on('data', c => {
        byteCount += c.length
        if (byteCount > MAX_SEARCH) {
          res.destroy()
          req.destroy()
          if (res.socket && !res.socket.destroyed) res.socket.destroy()
          safeReject(new Error('Brave search response exceeded 2MB limit'))
          return
        }
        chunks.push(c)
      })
      res.on('end', () => {
        if (byteCount > MAX_SEARCH) return
        const raw = Buffer.concat(chunks)
        const zlib = require('zlib')
        if (raw.length >= 2 && raw[0] === 0x1f && raw[1] === 0x8b) {
          zlib.gunzip(raw, (err, buf) => {
            if (err) {
              try { safeResolve(JSON.parse(raw.toString('utf8'))) } catch (e) { safeReject(e) }
            } else {
              if (buf.length > MAX_SEARCH * 5) {
                safeReject(new Error('Decompressed Brave response exceeds safe limit'))
                return
              }
              try { safeResolve(JSON.parse(buf.toString('utf8'))) } catch (e) { safeReject(e) }
            }
          })
        } else {
          try {
            safeResolve(JSON.parse(raw.toString('utf8')))
          } catch (e) {
            safeReject(e)
          }
        }
      })
      res.on('error', safeReject)
    })
    req.on('error', safeReject)
    req.on('timeout', () => {
      req.destroy()
      if (activeRes) activeRes.destroy()
      safeReject(new Error('Brave search timed out'))
    })
    req.end()
  })
}
const { URL } = require('url')
const { getClientIp } = require('./utils/ip')
const { handleCors } = require('./utils/cors')
const { enforceRateLimit, createRateLimitErrorResponse } = require('./utils/rateLimiter')

/**
 * Safely retrieves an enumerated key from an object dictionary without
 * falling prey to prototype pollution or Object.prototype traversal (e.g. 'toString').
 */
function getSafeMapKey(dict, userKey, fallbackKey) {
  if (typeof userKey === 'string') {
    const clean = userKey.trim().toLowerCase()
    if (Object.prototype.hasOwnProperty.call(dict, clean) && typeof dict[clean] === 'string') {
      return clean
    }
  }
  return fallbackKey
}


const STABLE_GROQ_MODELS = [
  'llama-3.1-8b-instant',
  'llama-3.3-70b-versatile',
  'llama-3.2-11b-vision-preview',
  'llama-3.2-90b-vision-preview',
  'whisper-large-v3',
  'whisper-large-v3-turbo'
]
let _cachedGroqModels = null
let _lastModelsFetch = 0
let _modelsFetchPromise = null

function fetchGroqAvailableModels(key) {
  const now = Date.now()
  if (!key || typeof key !== 'string') return STABLE_GROQ_MODELS
  if (_cachedGroqModels && (now - _lastModelsFetch < 300000)) {
    return _cachedGroqModels
  }
  // If not cached, trigger background refresh asynchronously without blocking user's immediate request
  if (!_modelsFetchPromise) {
    _modelsFetchPromise = (async () => {
      try {
        const res = await new Promise((resolve, reject) => {
          let activeRes = null
          const req = https.request({
            hostname: 'api.groq.com',
            path: '/openai/v1/models',
            method: 'GET',
            headers: {
              Authorization: `Bearer ${key}`,
              'User-Agent': 'ToolDesk/1.0',
            },
            timeout: 3000,
          }, r => {
            activeRes = r
            const chunks = []
            let byteCount = 0
            const MAX_MODELS = 2 * 1024 * 1024 // 2MB cap
            r.on('data', c => {
              byteCount += c.length
              if (byteCount > MAX_MODELS) {
                r.destroy()
                req.destroy()
                if (r.socket && !r.socket.destroyed) r.socket.destroy()
                reject(new Error('Model list exceeded 2MB limit'))
                return
              }
              chunks.push(c)
            })
            r.on('end', () => resolve({ status: r.statusCode, body: Buffer.concat(chunks).toString('utf8') }))
            r.on('error', reject)
          })
          req.on('error', reject)
          req.on('timeout', () => {
            req.destroy()
            if (activeRes) activeRes.destroy()
            reject(new Error('timeout'))
          })
          req.end()
        })
        if (res.status === 200) {
          const d = JSON.parse(res.body)
          if (Array.isArray(d?.data)) {
            _cachedGroqModels = d.data.map(m => m.id)
            _lastModelsFetch = Date.now()
          }
        } else {
          _lastModelsFetch = Date.now() - 240000
        }
      } catch {
        _lastModelsFetch = Date.now() - 240000
      } finally {
        _modelsFetchPromise = null
      }
    })()
  }

  return _cachedGroqModels || STABLE_GROQ_MODELS
}

/* ── Groq chat completion with automatic model fallback & dynamic discovery ── */
async function groqChat(key, model, messages, options = {}) {
  const isMultimodal = Array.isArray(messages) && messages.some(m => Array.isArray(m.content) && m.content.some(c => c.type === 'image_url'))

  const availableModels = fetchGroqAvailableModels(key)

  const textPreferences = [
    model,
    process.env.GROQ_MODEL,
    'llama-3.1-8b-instant',
    'llama-3.3-70b-versatile',
  ].filter((m, idx, arr) => typeof m === 'string' && m.trim().length > 0 && arr.indexOf(m) === idx)

  const visionPreferences = [
    model,
    process.env.GROQ_VISION_MODEL,
    'llama-3.2-11b-vision-preview',
    'llama-3.2-90b-vision-preview',
  ].filter((m, idx, arr) => typeof m === 'string' && m.trim().length > 0 && arr.indexOf(m) === idx)

  let rawCandidates = isMultimodal ? visionPreferences : textPreferences
  let candidateModels = rawCandidates

  // If live available models are loaded, filter to only valid models to prevent "model does not exist" errors
  if (Array.isArray(availableModels) && availableModels.length > 0) {
    const valid = rawCandidates.filter(m => availableModels.includes(m))
    if (valid.length > 0) {
      candidateModels = valid
    }
  }

  let lastRes = null
  const deadline = Date.now() + 8500 // 8.5s total deadline budget to prevent unhandled Netlify lambda kill
  for (const candidate of candidateModels) {
    const remainingTime = deadline - Date.now()
    if (remainingTime <= 1000) break

    let effectiveMaxTokens = options.max_tokens ?? 1024
    // If we are retrying after a 429 on an earlier candidate, cap max_tokens to preserve quota
    if (lastRes && lastRes.status === 429 && effectiveMaxTokens > 512) {
      effectiveMaxTokens = 512
    }

    try {
      const res = await new Promise((resolve, reject) => {
        const body = JSON.stringify({
          model: candidate,
          messages,
          temperature: options.temperature ?? 0.7,
          max_tokens:  effectiveMaxTokens,
          stream: false,
        })

        const req = https.request({
          hostname: 'api.groq.com',
          path: '/openai/v1/chat/completions',
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
          timeout: Math.max(2000, Math.min(6500, remainingTime - 500)),
        }, res => {
          const chunks = []
          let byteCount = 0
          const MAX_STREAM = 5 * 1024 * 1024 // 5MB cap
          res.on('data', c => {
            byteCount += c.length
            if (byteCount > MAX_STREAM) {
              res.destroy()
              req.destroy()
              if (res.socket && !res.socket.destroyed) res.socket.destroy()
              reject(new Error('Groq response exceeded 5MB stream limit'))
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
          reject(new Error('Groq request timed out'))
        })
        req.write(body)
        req.end()
      })

      if (res.status === 200) {
        try {
          const parsed = JSON.parse(res.body)
          if (parsed?.choices?.[0]?.message?.content) {
            let text = parsed.choices[0].message.content
            text = text.replace(/<think>[\s\S]*?<\/think>\s*/gi, '').trim()
            parsed.choices[0].message.content = text
            res.body = JSON.stringify(parsed)
          }
        } catch {}
        return res
      }

      lastRes = res
      // If the error is model not found, decommissioned, rate limited (429), entity too large (413), or temporary outage (502/503), try next candidate
      let isRetryable = false
      if (res.status === 429 || res.status === 404 || res.status === 413 || res.status === 502 || res.status === 503) {
        isRetryable = true
      } else if (res.status === 400) {
        try {
          const parsed = JSON.parse(res.body)
          const msg = (parsed?.error?.message || '').toLowerCase()
          if (msg.includes('model') || msg.includes('limit') || msg.includes('token') || msg.includes('decommissioned') || msg.includes('access') || msg.includes('large')) {
            isRetryable = true
          }
        } catch {}
      }

      if (isRetryable && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 200))
        continue // Try next candidate model
      } else {
        break
      }
    } catch (e) {
      lastRes = { status: 504, body: JSON.stringify({ error: { message: e.message || 'Groq request failed or timed out' } }) }
      if (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 200))
        continue // Try next candidate model
      } else {
        break
      }
    }
  }

  return lastRes || { status: 504, body: JSON.stringify({ error: { message: 'All candidate Groq AI models timed out or were unavailable' } }) }
}

/* ── Parse Groq response ── */
function parseChat(res) {
  if (res.status !== 200) {
    let msg = `Groq error ${res.status}`
    try { msg = JSON.parse(res.body)?.error?.message || msg } catch {}
    throw new Error(msg)
  }
  try {
    const data = JSON.parse(res.body)
    return data.choices?.[0]?.message?.content?.trim() || ''
  } catch {
    throw new Error('Invalid response from Groq API')
  }
}

/* ── Universal Robust JSON Extractor ── */
function extractJSON(str, isArray = false) {
  if (typeof str !== 'string' || !str.trim()) return null

  // 1. Direct parse attempt
  try {
    const direct = JSON.parse(str.trim())
    if (isArray) {
      if (Array.isArray(direct)) return direct
      if (direct && typeof direct === 'object') {
        const val = Object.values(direct).find(Array.isArray)
        if (val) return val
      }
    } else {
      if (direct && typeof direct === 'object' && !Array.isArray(direct)) return direct
    }
  } catch {}

  // 2. Bracket slice attempt
  const startChar = isArray ? '[' : '{'
  const endChar = isArray ? ']' : '}'
  const start = str.indexOf(startChar)
  const end = str.lastIndexOf(endChar)
  if (start !== -1 && end !== -1 && end > start) {
    const candidate = str.slice(start, end + 1)
    try {
      return JSON.parse(candidate)
    } catch {
      try {
        const cleaned = candidate.replace(/,(\s*[\]}])/g, '$1')
        return JSON.parse(cleaned)
      } catch {}
    }
  }

  // 3. If array was requested, check if model wrapped it in an outer object
  if (isArray) {
    const objStart = str.indexOf('{')
    const objEnd = str.lastIndexOf('}')
    if (objStart !== -1 && objEnd !== -1 && objEnd > objStart) {
      try {
        const candidate = str.slice(objStart, objEnd + 1)
        const cleaned = candidate.replace(/,(\s*[\]}])/g, '$1')
        const parsed = JSON.parse(cleaned)
        if (parsed && typeof parsed === 'object') {
          const val = Object.values(parsed).find(Array.isArray)
          if (val) return val
        }
      } catch {}
    }
  }

  return null
}

/* ══════════════════════════════════════════════════════
   TOOL HANDLERS
   Each handler receives { payload } and returns { result }
══════════════════════════════════════════════════════ */

/* 1. Word Counter — AI Summary */
async function handleSummarize(key, payload = {}) {
  const text = payload.text || payload.content || payload.prompt || payload.input || ''
  const style = payload.style || payload.format || 'concise'
  if (typeof text !== 'string' || !text.trim()) throw new Error('No valid text provided')

  const styleInstructions = {
    concise:      'Write a concise 2-3 sentence summary.',
    detailed:     'Write a detailed paragraph summary covering the main points.',
    bullets:      'Summarize as 5 bullet points (use • prefix). No other text.',
    headline:     'Write a single punchy headline (max 12 words) that captures the essence.',
    eli5:         'Explain this in simple terms a 10-year-old would understand (2-3 sentences).',
    professional: 'Write an executive summary in 3 formal sentences suitable for a business report.',
  }
  const cleanStyle = getSafeMapKey(styleInstructions, style, 'concise')

  const res = await groqChat(key, null, [
    { role: 'system', content: `You are a precise text summarizer. ${styleInstructions[cleanStyle]} Return ONLY the summary. No preamble, no "Here is...", no quotes around it.` },
    { role: 'user', content: text.slice(0, 8000) }
  ], { temperature: 0.4, max_tokens: 512 })

  return { summary: parseChat(res), style: cleanStyle }
}

/* 2. Word Counter — AI Keywords */
async function handleKeywords(key, payload = {}) {
  const text = payload.text || payload.content || payload.prompt || payload.input || ''
  if (typeof text !== 'string' || !text.trim()) throw new Error('No valid text provided')

  const res = await groqChat(key, null, [
    { role: 'system', content: 'Extract the 10 most important keywords/phrases from this text. Return ONLY a JSON array of strings, nothing else. Example: ["keyword1","phrase two","keyword3"]' },
    { role: 'user', content: text.slice(0, 6000) }
  ], { temperature: 0.2, max_tokens: 256 })

  const raw = parseChat(res)
  const parsed = extractJSON(raw, true)
  const keywords = Array.isArray(parsed) ? parsed.filter(x => typeof x === 'string') : []
  return { keywords }
}

/* 3. Word Replacer — AI Smart Suggestions */
async function handleSmartReplace(key, payload = {}) {
  const text = payload.text || payload.content || payload.prompt || payload.input || ''
  const target = payload.target || payload.find || payload.search || ''
  const goal = payload.goal || 'improve'
  if (typeof text !== 'string' || !text.trim()) throw new Error('No valid text provided')
  if (typeof target !== 'string' || !target.trim()) throw new Error('No valid target word/phrase provided')

  const goalMap = {
    improve:      'a stronger, more impactful alternative',
    simplify:     'a simpler, clearer alternative',
    formal:       'a more formal and professional alternative',
    casual:       'a more casual and conversational alternative',
    synonym:      'the best synonym',
    creative:     'a more creative and vivid alternative',
  }
  const cleanGoal = getSafeMapKey(goalMap, goal, 'improve')

  const res = await groqChat(key, null, [
    { role: 'system', content: `You are a precise writing assistant. Given text and a word/phrase to improve, suggest EXACTLY 5 alternatives that are ${goalMap[cleanGoal]}. Return ONLY a JSON array of 5 strings. No explanation. Example: ["option1","option2","option3","option4","option5"]` },
    { role: 'user', content: `Text context:\n${text.slice(0, 3000)}\n\nWord/phrase to replace: "${sanitizeForPrompt(target, 200)}"\n\nProvide 5 alternatives:` }
  ], { temperature: 0.7, max_tokens: 200 })

  const raw = parseChat(res)
  const parsed = extractJSON(raw, true)
  const suggestions = Array.isArray(parsed) ? parsed.slice(0, 5).map(String) : []
  return { suggestions, target, goal: cleanGoal }
}

/* 4. Text Case Converter — AI Rewrite */
async function handleRewrite(key, payload = {}) {
  const text = payload.text || payload.content || payload.prompt || payload.input || ''
  const mode = payload.mode || payload.tone || payload.style || 'formal'
  if (typeof text !== 'string' || !text.trim()) throw new Error('No valid text provided')

  const modeMap = {
    formal:       'Rewrite this text in a formal, professional tone. Maintain the meaning exactly.',
    casual:       'Rewrite this text in a casual, friendly, conversational tone.',
    persuasive:   'Rewrite this text to be highly persuasive and compelling.',
    concise:      'Rewrite this text to be as concise as possible. Remove all unnecessary words. Keep every important idea.',
    expand:       'Expand this text with more detail, examples, and explanation. Double its length.',
    academic:     'Rewrite this text in an academic, scholarly tone with precise vocabulary.',
    creative:     'Rewrite this text in an engaging, creative, vivid writing style.',
    active:       'Rewrite this text using only active voice. No passive constructions.',
    empathetic:   'Rewrite this text with more warmth, empathy and emotional connection.',
  }
  const cleanMode = getSafeMapKey(modeMap, mode, 'formal')
  const instruction = modeMap[cleanMode]

  const res = await groqChat(key, null, [
    { role: 'system', content: `You are a professional writer and editor. ${instruction} Return ONLY the rewritten text. No preamble, no labels, no explanation.` },
    { role: 'user', content: text.slice(0, 8000) }
  ], { temperature: 0.6, max_tokens: 2048 })

  return { rewritten: parseChat(res), mode: cleanMode }
}

/* 5. Quote Generator — AI Quote on Any Topic */
async function handleGenerateQuote(key, payload = {}) {
  const topic = payload.topic || payload.category || payload.theme || 'life and wisdom'
  const style = payload.style || payload.mood || 'inspirational'
  const count = payload.count || 3

  const styleMap = {
    inspirational: 'inspiring and motivational',
    philosophical: 'philosophical and thought-provoking',
    humorous:      'witty and humorous',
    stoic:         'stoic and disciplined',
    poetic:        'poetic and lyrical',
    business:      'business and entrepreneurship focused',
    scientific:    'scientific and analytical',
  }
  const cleanStyle = getSafeMapKey(styleMap, style, 'inspirational')

  const n = Math.min(10, Math.max(1, parseInt(count, 10) || 3))
  const res = await groqChat(key, null, [
    { role: 'system', content: `You are a master quote writer. Generate exactly ${n} original, ${styleMap[cleanStyle]} quotes about the given topic. Return ONLY a JSON array of objects. Each object must have "text" (the quote) and "author" (fictional attribution, e.g. "— Ancient Wisdom" or "— Unknown"). No other text. Example: [{"text":"Your quote here.","author":"— Source"}]` },
    { role: 'user', content: `Topic: ${sanitizeForPrompt(typeof topic === 'string' ? topic : 'life and wisdom', 500)}` }
  ], { temperature: 0.9, max_tokens: 1024 })

  const raw = parseChat(res)
  const parsed = extractJSON(raw, true)
  const quotes = Array.isArray(parsed) ? parsed.slice(0, n) : []
  return { quotes, topic, style: cleanStyle }
}

/* 6. Password Generator — AI Memorable Passphrase */
async function handlePassphrase(key, payload = {}) {
  const topic = payload.topic || payload.theme || ''
  const wordCount = payload.wordCount || payload.words || 4
  const style = payload.style || 'memorable'

  const n = Math.min(8, Math.max(3, parseInt(wordCount, 10) || 4))
  const styleMap = {
    memorable: 'creative, vivid and easy to remember',
    story:     'forming a short narrative or story fragment',
    technical: 'technical and computer science themed',
    nature:    'nature and environment themed',
    abstract:  'abstract and conceptual',
  }
  const cleanStyle = getSafeMapKey(styleMap, style, 'memorable')

  const res = await groqChat(key, null, [
    { role: 'system', content: `You are a passphrase generator. Create exactly 5 unique passphrases, each exactly ${n} words long. Each phrase should be ${styleMap[cleanStyle]}${topic ? ` and related to: ${sanitizeForPrompt(topic, 200)}` : ''}. Words should be easy to type and remember. Return ONLY a JSON array of 5 strings. Each string is a passphrase with words separated by hyphens. Example: ["correct-horse-battery-staple","vivid-moon-silver-peak"]` },
    { role: 'user', content: `Generate 5 passphrases of ${n} words${topic ? ` related to: "${sanitizeForPrompt(topic, 200)}"` : ''}.` }
  ], { temperature: 0.95, max_tokens: 300 })

  const raw = parseChat(res)
  const parsed = extractJSON(raw, true)
  const passphrases = Array.isArray(parsed) ? parsed.slice(0, 5).map(String) : []
  return { passphrases, topic, style: cleanStyle }
}

/* 7. Image Alt Text / Description */
async function handleImageDescription(key, payload = {}) {
  const rawImage = payload.imageBase64 || payload.image || payload.file || ''
  if (typeof rawImage !== 'string' || !rawImage.trim()) throw new Error('No valid image provided')

  let safeMime = payload.mimeType || 'image/jpeg'
  let cleanBase64 = rawImage.trim()

  const dataUriMatch = cleanBase64.match(/^data:(image\/[a-z0-9+.-]+);base64,(.+)$/i)
  if (dataUriMatch) {
    safeMime = dataUriMatch[1]
    cleanBase64 = dataUriMatch[2]
  }

  if (cleanBase64.length > 7 * 1024 * 1024) throw new Error('Image too large (max 5MB)')
  const allowedMime = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  if (!allowedMime.includes(safeMime.toLowerCase().trim())) safeMime = 'image/jpeg'

  const style = payload.style || 'alt'
  const styleMap = {
    alt:           'Write a concise, accurate HTML alt attribute for this image (max 125 characters). Return ONLY the alt text string.',
    detailed:      'Describe this image in detail in 2-3 sentences. Include objects, colors, composition and mood.',
    accessibility: 'Write a screen-reader-friendly description of this image. Focus on what information it conveys.',
    seo:           'Write an SEO-optimized image description including likely keywords. 1-2 sentences.',
  }
  const cleanStyle = getSafeMapKey(styleMap, style, 'alt')

  const res = await groqChat(key,
    process.env.GROQ_VISION_MODEL || null,
    [
      { role: 'user', content: [
        { type: 'image_url', image_url: { url: `data:${safeMime};base64,${cleanBase64}` } },
        { type: 'text', text: styleMap[cleanStyle] },
      ]}
    ],
    { temperature: 0.3, max_tokens: 256 }
  )

  return { description: parseChat(res), style: cleanStyle }
}

/* 8. Website Analyzer — AI SEO Recommendations */
async function handleSeoSuggestions(key, payload = {}) {
  const data = payload.data || payload
  const title = payload.title || data?.title || ''
  const description = payload.description || data?.metaDesc || data?.description || ''
  const h1 = payload.h1 || (Array.isArray(data?.h1s) ? data.h1s[0] : (data?.h1 || ''))
  const h2Count = payload.h2Count ?? (Array.isArray(data?.h2s) ? data.h2s.length : (data?.h2 || 0))
  const issues = payload.issues || (Array.isArray(data?.seoChecks) ? data.seoChecks.filter(c => !c.pass).map(c => c.name) : [])
  const url = payload.url || data?.url || ''
  const score = payload.score ?? data?.seoScore ?? 0

  const res = await groqChat(key, null, [
    { role: 'system', content: 'You are an expert SEO consultant. Analyze the provided page data and give exactly 5 specific, actionable recommendations to improve SEO. Return ONLY a JSON array of 5 objects. Each object: {"priority":"high|medium|low","category":"Title|Meta|Content|Links|Technical|Schema|Performance","action":"specific action to take","impact":"why this matters"}. No other text.' },
    { role: 'user', content: JSON.stringify({ url, title, description, h1, h2Count, currentScore: score, issues }) }
  ], { temperature: 0.4, max_tokens: 800 })

  const raw = parseChat(res)
  const parsed = extractJSON(raw, true)
  const suggestions = Array.isArray(parsed) ? parsed.slice(0, 5) : []
  return { suggestions }
}

/* 9. PDF Toolkit — AI Document Summary */
async function handleDocSummary(key, payload = {}) {
  const text = payload.text || payload.content || payload.prompt || ''
  const format = payload.format || 'executive'
  if (typeof text !== 'string' || !text.trim()) throw new Error('No valid text provided')

  const formatMap = {
    executive:  'Write a 3-sentence executive summary covering the main purpose, key points, and conclusion.',
    detailed:   'Write a detailed summary with: 1) Main Topic 2) Key Arguments 3) Supporting Evidence 4) Conclusions. Use these exact headers.',
    bullets:    'Extract the 7 most important points as bullet points (• prefix). Key findings and conclusions only.',
    abstract:   'Write a formal academic abstract (150-200 words) for this document.',
  }
  const cleanFormat = getSafeMapKey(formatMap, format, 'executive')

  const res = await groqChat(key, null, [
    { role: 'system', content: `You are a document analysis expert. ${formatMap[cleanFormat]} Return ONLY the summary content.` },
    { role: 'user', content: text.slice(0, 20000) }
  ], { temperature: 0.3, max_tokens: 1024 })

  return { summary: parseChat(res), format: cleanFormat }
}

/* 10. Unit Converter — AI Explain Conversion */
async function handleExplainUnit(key, payload = {}) {
  const { from, to, value, result, category } = payload
  const res = await groqChat(key, null, [
    { role: 'system', content: 'You are a helpful unit conversion explainer. Give a brief, interesting explanation of the conversion result in 1-2 sentences. Include a real-world reference or analogy to make it relatable. Be concise and engaging.' },
    { role: 'user', content: `${sanitizeForPrompt(String(value || ''), 50)} ${sanitizeForPrompt(from || '', 50)} = ${sanitizeForPrompt(String(result || ''), 50)} ${sanitizeForPrompt(to || '', 50)} (category: ${sanitizeForPrompt(category || '', 50)})` }
  ], { temperature: 0.7, max_tokens: 150 })

  return { explanation: parseChat(res) }
}

/* 11. Deep AI Website Analysis */
async function handleDeepWebAnalysis(key, payload = {}) {
  const data = payload.data || payload.siteData || (payload.url ? payload : null)
  if (!data) throw new Error('No website data provided')

  const summary = {
    url:          data.url,
    title:        data.title,
    description:  data.metaDesc,
    cms:          data.cms,
    seoScore:     data.seoScore,
    secScore:     data.secScore,
    perfScore:    data.perfScore,
    overallScore: data.overallScore,
    techStack:    data.techStack?.slice(0,10),
    socialLinks:  data.socialLinks,
    h1:           data.h1, h2: data.h2,
    hasHttps:     data.https,
    hasSitemap:   data.sitemap,
    hasRobots:    data.robotsTxt,
    hasSchema:    data.hasJsonLd,
    schemaTypes:  data.schemaTypes,
    imgCount:     data.imgCount,
    imgNoAlt:     data.imgNoAlt,
    jsFiles:      data.jsFiles,
    cssFiles:     data.cssFiles,
    pageSize:     data.pageSize,
    lang:         data.lang,
    canonical:    data.canonical,
    ogTags:       Object.keys(data.og || {}).length,
    twitterCard:  data.twitterCard,
    seoIssues:    data.seoIssues?.slice(0,8),
    domSize:      data.domSize,
    hasDarkMode:  data.hasDarkMode,
    fonts:        data.fonts?.slice(0,4),
    internalLinks: data.internalLinks,
    externalLinks: data.externalLinks,
    server:       data.server,
  }

  const res = await groqChat(key, null, [
    {
      role: 'system',
      content: `You are an elite web analyst and digital strategist. Given comprehensive website data, produce a deep professional analysis.

Return ONLY a JSON object with these exact keys:
{
  "executiveSummary": "3-4 sentence executive overview of the website's digital health and positioning",
  "strengths": ["array of 4-5 specific strengths with brief explanation each"],
  "criticalIssues": ["array of 3-4 critical issues that need immediate attention"],
  "quickWins": ["array of 4 specific quick wins that can be implemented in <1 day"],
  "contentInsights": "2-3 sentence analysis of content quality based on available signals",
  "technicalHealth": "2-3 sentence assessment of technical infrastructure and performance",
  "competitivePosition": "2 sentences on how this site appears to be positioned vs typical competitors",
  "priorityActions": [
    {"action": "specific action", "impact": "high|medium|low", "effort": "hours|days|weeks", "category": "SEO|Security|Performance|UX|Content"}
  ],
  "overallVerdict": "single sentence bottom-line verdict"
}

Be specific, data-driven, and actionable. Reference actual values from the data.`,
    },
    { role: 'user', content: JSON.stringify(summary) }
  ], { temperature: 0.4, max_tokens: 2000 })

  const raw = parseChat(res)
  const parsed = extractJSON(raw, false)
  const analysis = (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
    ? parsed
    : { executiveSummary: raw, strengths: [], criticalIssues: [], quickWins: [], priorityActions: [] }
  return { analysis }
}

/* 12. Website Blueprint Generator — full human-readable report */
async function handleGenerateBlueprint(key, payload = {}) {
  const data = payload.data || payload.siteData || (payload.url ? payload : null)
  if (!data) throw new Error('No website analysis data provided')

  const summary = {
    url: data.url, domain: data.domain, title: data.title, metaDesc: data.metaDesc,
    h1Text: data.h1Text, headingCounts: data.headingCounts,
    designStyle: data.designStyle, techStack: data.techStack,
    colors: data.colors, typography: data.typography, spacing: data.spacing,
    buttons: data.buttons, animations: data.animations,
    conversionElements: data.conversionElements,
    sections: data.sections, sectionCount: data.sectionCount,
    imgCount: data.imgCount, formCount: data.formCount, wordCount: data.wordCount,
  }

  const res = await groqChat(key, null, [
    {
      role: 'system',
      content: `You are an elite web design analyst and front-end architect. Given raw structural data extracted from a live website, produce a complete, human-readable "Website Blueprint Report" that explains exactly how the site appears to be designed and built — detailed enough that a developer could recreate something very similar.

Return ONLY a JSON object with these exact keys:
{
  "designSystem": "2-3 paragraph analysis of the overall visual design system: colors, style classification, visual hierarchy, what kind of brand/business this design suits",
  "typography": "1-2 paragraph analysis of the font choices, sizing scale, and text hierarchy strategy",
  "headerAnalysis": "1-2 paragraph analysis of the header/navigation structure and strategy",
  "heroAnalysis": "2 paragraph analysis of the hero section's messaging strategy, layout, and conversion psychology",
  "sectionBreakdown": [
    {"name":"section name","purpose":"what this section is for","layoutNotes":"layout/structure description","conversionGoal":"what action it drives"}
  ],
  "buttonAnalysis": "1 paragraph on CTA/button design patterns and strategy",
  "animationAnalysis": "1 paragraph on animation/motion design patterns used",
  "responsiveNotes": "1 paragraph on likely responsive design approach based on signals found",
  "conversionStrategy": "2 paragraph analysis of trust-building, urgency, social proof and conversion tactics used",
  "pageStructureMap": ["ordered array of section names top to bottom, e.g. Header, Hero, Features, Testimonials, Pricing, FAQ, Footer"],
  "designStyleLabel": "single short label like 'Modern SaaS' or 'Minimal Corporate'"
}

Be specific and reference the actual data provided. Write in clear, confident, professional language — like a senior designer explaining their work to a client.`,
    },
    { role: 'user', content: JSON.stringify(summary) },
  ], { temperature: 0.5, max_tokens: 3000 })

  const raw = parseChat(res)
  const parsed = extractJSON(raw, false)
  const blueprint = (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
    ? parsed
    : { designSystem: raw, sectionBreakdown: [], pageStructureMap: [] }
  return { blueprint }
}

/* 13. AI Recreation Prompt — PREMIUM feature
   Generates a massive, copy-paste-ready prompt for ChatGPT/Claude/Cursor/
   Bolt/Lovable/Windsurf to rebuild a similar website from scratch. */
async function handleGenerateRecreationPrompt(key, payload = {}) {
  const data = payload.data || payload.siteData || (payload.url ? payload : null)
  if (!data) throw new Error('No website analysis data provided')

  const blueprint = payload.blueprint
  const framework = payload.framework || 'React + Tailwind CSS'

  const context = {
    title: data.title, designStyle: data.designStyle,
    colors: data.colors, typography: data.typography, spacing: data.spacing,
    buttons: data.buttons, animations: data.animations,
    conversionElements: data.conversionElements,
    sections: data.sections?.map(s => ({ type: s.type, tag: s.tag })),
    pageStructureMap: blueprint?.pageStructureMap || [],
    sectionBreakdown: blueprint?.sectionBreakdown || [],
    designSystemSummary: blueprint?.designSystem || '',
    conversionStrategySummary: blueprint?.conversionStrategy || '',
  }

  const res = await groqChat(key, null, [
    {
      role: 'system',
      content: `You are an expert prompt engineer who writes extremely detailed AI build prompts for tools like Claude, ChatGPT, Cursor, Bolt.new, Lovable, and Windsurf.

Given a structured analysis of an existing website's design system, generate ONE massive, extremely detailed, copy-paste-ready prompt that a developer could paste directly into an AI coding tool to rebuild a highly similar website using ${framework}.

The prompt must include, written as clear instructions:
- Project overview and purpose
- Exact color palette with hex codes and where each color is used (primary, secondary, accent, backgrounds, buttons, hover states)
- Typography system: font choices, size scale, weight scale, hierarchy rules
- Spacing/sizing scale (padding, margins, gaps, border-radius values)
- Full page structure in order (every section, top to bottom)
- For each section: purpose, layout approach (grid/flex/columns), content type, visual style
- Button and CTA design specification (shape, color, hover behavior, placement strategy)
- Animation and motion design instructions (what should animate, how, timing)
- Responsive design instructions (mobile-first approach, breakpoint behavior)
- Conversion/trust elements to include (testimonials, social proof, guarantees, etc. — only if detected)

Write this as ONE continuous, well-organized prompt using markdown headers and bullet points, ready to paste directly into an AI tool. Start with "Build a [framework] website with the following exact specifications:" and be extremely thorough — aim for maximum detail and clarity so the AI rebuilding it has everything it needs in one shot.

Return ONLY the prompt text. No JSON, no preamble, no meta-commentary about the prompt itself.`,
    },
    { role: 'user', content: JSON.stringify(context) },
  ], { temperature: 0.4, max_tokens: 4000 })

  return { prompt: parseChat(res) }
}

/* 14. Gradient Generator — AI Color Palette from Description */
async function handleGradientFromDescription(key, payload = {}) {
  const description = payload.description || payload.prompt || payload.text || payload.mood || ''
  const style = payload.style || 'modern'
  if (!description?.trim()) throw new Error('No description provided')

  const res = await groqChat(key, null, [
    { role: 'system', content: `You are an expert UI/UX color designer. Given a description or mood, generate 5 beautiful gradient combinations. Return ONLY a JSON array of 5 objects. Each object: {"name":"gradient name","stops":["#hex1","#hex2"],"angle":135,"style":"linear|radial|conic","description":"one sentence about this gradient's feeling/use"}. Use 2-3 color stops. No other text.` },
    { role: 'user', content: `Create 5 gradients for: "${sanitizeForPrompt(description, 300)}" (style: ${sanitizeForPrompt(style, 30)})` }
  ], { temperature: 0.85, max_tokens: 600 })

  const raw = parseChat(res)
  const gradients = extractJSON(raw, true)
  if (!gradients || !Array.isArray(gradients) || gradients.length === 0) {
    const fallback = [
      { name: 'Neon Horizon', stops: ['#7c3aed', '#06b6d4'], angle: 135, style: 'linear', description: 'Electric violet to bright cyan gradient' },
      { name: 'Cyber Twilight', stops: ['#4c1d95', '#0ea5e9'], angle: 135, style: 'linear', description: 'Deep futuristic dusk glow' },
      { name: 'Electric Pulse', stops: ['#8b5cf6', '#14b8a6'], angle: 135, style: 'linear', description: 'Vibrant luminous sweep' }
    ]
    return { gradients: fallback, description }
  }
  return { gradients: gradients.slice(0, 5), description }
}

/* 15. Image Tools — AI Smart Crop Suggestions */
async function handleSmartCropSuggestions(key, payload = {}) {
  const { width, height, subject, platform } = payload
  const res = await groqChat(key, null, [
    { role: 'system', content: 'You are a professional photo editor. Given image dimensions, subject, and target platform, suggest the optimal crop ratio and dimensions. Return ONLY a JSON object: {"ratio":"16:9","width":1920,"height":1080,"tip":"brief advice on composition and focal point","platforms":["platform1","platform2"]}. No other text.' },
    { role: 'user', content: `Image: ${Math.max(1, parseInt(width, 10) || 0)}x${Math.max(1, parseInt(height, 10) || 0)}px. Subject: ${sanitizeForPrompt(subject, 100) || "general"}. Target platform: ${sanitizeForPrompt(platform, 50) || "web"}` }
  ], { temperature: 0.3, max_tokens: 200 })

  const raw = parseChat(res)
  const suggestion = extractJSON(raw, false) || {}
  return { suggestion }
}

/* 16. Color Picker — AI Color Name & Context */
async function handleColorContext(key, payload = {}) {
  const { hex, r, g, b, hsl } = payload
  const res = await groqChat(key, null, [
    { role: 'system', content: 'You are a color expert and designer. Given a hex color, provide rich context. Return ONLY a JSON object: {"name":"creative color name","mood":"mood/feeling this color evokes","uses":["best use case 1","use case 2","use case 3"],"psychology":"1 sentence on color psychology","brands":["brand known for similar color"],"season":"Spring|Summer|Autumn|Winter","complementPair":"brief description of what pairs well"}. No other text.' },
    { role: 'user', content: `Color: ${sanitizeForPrompt(hex, 10)} (RGB: ${sanitizeForPrompt(String(r), 5)},${sanitizeForPrompt(String(g), 5)},${sanitizeForPrompt(String(b), 5)}, HSL: ${sanitizeForPrompt(String(hsl), 30)})` }
  ], { temperature: 0.7, max_tokens: 400 })

  const raw = parseChat(res)
  const context = extractJSON(raw, false) || {}
  return { context }
}

/* 20. Color Picker — AI Palette Generator */
async function handleColorPalette(key, payload = {}) {
  const hex = payload.hex || '#4F8EF7'
  const rgb = payload.rgb || ''
  const mood = payload.mood || payload.description || payload.theme || 'modern vibrant'

  const res = await groqChat(key, null, [
    {
      role: 'system',
      content: 'You are an expert color theorist and designer. Generate 5 beautiful color palettes (each containing exactly 5 hex color codes) matching the given mood/theme and base color. Return ONLY a JSON array of 5 objects, where each object is: {"name":"palette name","colors":["#hex1","#hex2","#hex3","#hex4","#hex5"]}. No other text.'
    },
    {
      role: 'user',
      content: `Base color: ${sanitizeForPrompt(hex, 10)} (RGB: ${sanitizeForPrompt(String(rgb), 30)}), Mood/Theme: "${sanitizeForPrompt(mood, 100)}"`
    }
  ], { temperature: 0.8, max_tokens: 600 })

  const raw = parseChat(res)
  let palettes = extractJSON(raw, true) || []
  if (!Array.isArray(palettes) || palettes.length === 0) {
    palettes = [
      { name: 'Vibrant Modern', colors: [hex, '#7c3aed', '#06b6d4', '#10b981', '#f59e0b'] },
      { name: 'Deep Ocean', colors: ['#0f172a', '#1e293b', hex, '#38bdf8', '#e0f2fe'] },
      { name: 'Sunset Glow', colors: ['#4c1d95', '#7c3aed', '#ec4899', '#f97316', '#fde047'] },
      { name: 'Neon Cyber', colors: ['#09090b', '#27272a', hex, '#22c55e', '#a855f7'] },
      { name: 'Soft Minimal', colors: ['#f8fafc', '#e2e8f0', hex, '#64748b', '#0f172a'] }
    ]
  }
  return { palettes: palettes.slice(0, 5) }
}

/* 17. Random Name/Address — AI Backstory Generator */
async function handleGenerateBackstory(key, payload = {}) {
  const name = payload.name || payload.full || payload.person || 'Alex Morgan'
  const country = payload.country || 'United States'
  const gender = payload.gender || 'unspecified'

  const res = await groqChat(key, null, [
    { role: 'system', content: 'You are a creative fiction writer. Generate a brief, believable backstory for a fictional person. Return ONLY a JSON object: {"occupation":"their job","bio":"2-3 sentence backstory","personality":"3 personality traits","hobby":"their main hobby","funFact":"one interesting fact about them"}. Keep it realistic and culturally appropriate.' },
    { role: 'user', content: `Name: ${sanitizeForPrompt(name, 100)}, Country: ${sanitizeForPrompt(country, 60)}, Gender: ${sanitizeForPrompt(gender, 20)}` }
  ], { temperature: 0.9, max_tokens: 300 })

  const raw = parseChat(res)
  let backstory = extractJSON(raw, false)
  if (!backstory || typeof backstory !== 'object' || !backstory.bio) {
    backstory = {
      occupation: backstory?.occupation || 'Creative Professional',
      bio: backstory?.bio || raw.trim(),
      personality: backstory?.personality || 'Thoughtful, determined, curious',
      hobby: backstory?.hobby || 'Exploring new places',
      funFact: backstory?.funFact || 'Always has an interesting perspective.'
    }
  }
  return { backstory }
}

/* 18. PDF Toolkit — AI Key Points Extractor */
async function handleExtractKeyPoints(key, payload = {}) {
  const text = payload.text || payload.content || payload.prompt || ''
  if (typeof text !== 'string' || !text.trim()) throw new Error('No valid text provided')
  const n = Math.min(20, Math.max(3, parseInt(payload.count, 10) || 10))

  const res = await groqChat(key, null, [
    { role: 'system', content: `Extract exactly ${n} key points, facts, or insights from this document. Return ONLY a JSON array of ${n} strings. Each string is a complete, standalone key point. No numbering, no bullet prefixes. Just the array.` },
    { role: 'user', content: text.slice(0, 10000) }
  ], { temperature: 0.3, max_tokens: 1500 })

  const raw = parseChat(res)
  const points = extractJSON(raw, true) || []
  return { points: points.slice(0, n) }
}

/* 19. PDF Toolkit — AI Vision OCR Fallback for Scanned Documents */
async function handleScanDocVision(key, payload = {}) {
  const rawImage = payload.imageBase64 || payload.image || payload.file || ''
  if (typeof rawImage !== 'string' || !rawImage.trim()) throw new Error('No valid document image provided')

  let cleanBase64 = rawImage.trim()
  if (cleanBase64.length > 7 * 1024 * 1024) throw new Error('Document image too large (max 5MB)')

  let safeMime = 'image/jpeg'
  if (cleanBase64.startsWith('data:image/')) {
    const commaIdx = cleanBase64.indexOf(',')
    if (commaIdx !== -1 && commaIdx < 120) {
      const header = cleanBase64.slice(0, commaIdx)
      const mimeMatch = header.match(/^data:(image\/[a-z0-9+.-]+);base64$/i)
      if (mimeMatch) {
        safeMime = mimeMatch[1]
        cleanBase64 = cleanBase64.slice(commaIdx + 1)
      }
    }
  }

  const res = await groqChat(key,
    process.env.GROQ_VISION_MODEL || null,
    [
      { role: 'user', content: [
        { type: 'image_url', image_url: { url: `data:${safeMime};base64,${cleanBase64}` } },
        { type: 'text', text: 'Extract and transcribe all readable text, titles, headings, and data from this scanned document page accurately. Return only the extracted text verbatim. Do not add conversational commentary.' },
      ]}
    ],
    { temperature: 0.1, max_tokens: 600 }
  )

  const text = parseChat(res)
  return { text }
}

/* 20. AI Helper — Navigational Assistant */
async function handleAIHelper(key, payload = {}) {
  const { messages, currentPage } = payload
  const safePage = sanitizeForPrompt(currentPage, 100)
  const systemPrompt = `You are a helpful assistant for ToolDesk, a multi-tool platform with 32+ free browser-based tools:
1. Video: Video Transcriber (Whisper), Video Screenshot Extractor
2. Security: Email Breach Checker, Bcrypt Tool, Password Vault, Password Generator
3. Images: Image Converter, Image Compressor, Image Resizer, Background Remover (AI-powered), Favicon Generator, YouTube Thumbnail, Aspect Ratio Calculator, Color Picker, Gradient Generator, Image Tools Studio
4. Text: Text Case Converter, Text Translator, Word Counter, Word Replacer
5. File: PDF Toolkit (Merge, Split, Rotate, Compress, OCR), File Converter (video/image compression)
6. Utility: IP Lookup, Unit Converter, Currency Converter, QR Generator, Random Name Generator, Random Address Generator, System Info, Website Analyzer

${safePage ? `The user is currently on the "${safePage}" page — prioritize answering in that context if their question is ambiguous, but you can still recommend other tools if that's genuinely what they need.` : ''}

Your job is to recommend the best tool for the user's needs, explain how to use it, or answer general questions. If they want to find a tool, recommend it clearly. Keep your responses short and friendly (max 3 sentences).`

  let safeMessages = Array.isArray(messages)
    ? messages.slice(-8).filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').map(m => ({ role: m.role, content: m.content.slice(0, 1000) }))
    : []

  const singlePrompt = typeof payload?.prompt === 'string' ? payload.prompt : (typeof payload?.message === 'string' ? payload.message : '')
  if (singlePrompt && !safeMessages.some(m => m.role === 'user')) {
    safeMessages.push({ role: 'user', content: singlePrompt.slice(0, 1000) })
  }

  // Ensure there is at least one user message so minijinja templating never fails
  if (!safeMessages.some(m => m.role === 'user')) {
    safeMessages.push({ role: 'user', content: 'What free tools does ToolDesk offer, and how can you help me?' })
  }

  const res = await groqChat(key, 'llama-3.1-8b-instant', [
    { role: 'system', content: systemPrompt },
    ...safeMessages
  ], { temperature: 0.7, max_tokens: 256 })

  const answer = parseChat(res)
  return { result: answer, response: answer }
}

/* 20. Video Transcriber — AI Video & Meeting Intelligence */
async function handleVideoInsights(key, payload = {}) {
  const transcript = typeof payload.transcript === 'string' ? payload.transcript.trim() : ''
  if (!transcript) throw new Error('Valid transcript text is required')
  const duration = Number(payload.duration) || 0

  const res = await groqChat(key, 'llama-3.3-70b-versatile', [
    {
      role: 'system',
      content: `You are an elite executive assistant and media analyst. Analyze the following spoken transcript and extract structured meeting/video intelligence. Return ONLY a valid JSON object matching this schema:
{
  "summary": "3-4 concise, high-impact bullet points summarizing the core discussion or topic",
  "chapters": [
    { "timestamp": "00:00", "seconds": 0, "title": "Introduction / Topic Overview" },
    { "timestamp": "01:45", "seconds": 105, "title": "Key Discussion / Feature Review" }
  ],
  "actionItems": [
    { "task": "Specific deliverable or next step", "assignee": "Name or Role or Unassigned", "urgency": "High | Medium | Normal" }
  ],
  "keyTakeaways": ["Key insight 1", "Key insight 2", "Key insight 3"]
}
Ensure timestamps are formatted as MM:SS and start at 00:00.`
    },
    { role: 'user', content: `Transcript (${duration ? `duration approx ${Math.round(duration)}s` : 'audio file'}):\n\n${transcript.slice(0, 20000)}` }
  ], { temperature: 0.2, max_tokens: 1500 })

  const raw = parseChat(res)
  let insights = extractJSON(raw, false)
  if (!insights || typeof insights !== 'object') {
    insights = {
      summary: raw.trim().slice(0, 500),
      chapters: [{ timestamp: '00:00', seconds: 0, title: 'Overview' }],
      actionItems: [],
      keyTakeaways: []
    }
  }
  return { insights }
}

/* 21. QR Generator — AI Magic Intent & Contact Card Parser */
async function handleMagicQRIntent(key, payload = {}) {
  const text = typeof payload.text === 'string' ? payload.text.trim() : ''
  if (!text) throw new Error('Text is required for magic intent parsing')

  const res = await groqChat(key, 'llama-3.1-8b-instant', [
    {
      role: 'system',
      content: `You are an intelligent entity extraction parser for QR code generation. The user provides unstructured text (e.g. an email signature, business card, Wi-Fi password slip, payment note, URL, or calendar note).
Classify the intent and extract structured fields. Return ONLY a JSON object:
{
  "mode": "vcard" | "wifi" | "url" | "upi" | "sms" | "email" | "phone" | "text",
  "vcard": { "name": "", "phone": "", "email": "", "org": "" },
  "wifi": { "ssid": "", "password": "", "type": "WPA" },
  "upi": { "id": "", "name": "", "amount": "", "note": "" },
  "sms": { "phone": "", "body": "" },
  "url": "",
  "email": "",
  "phone": "",
  "text": ""
}
Extract whatever fields are available. Omit or leave empty string if not present.`
    },
    { role: 'user', content: text.slice(0, 2500) }
  ], { temperature: 0.1, max_tokens: 450 })

  const raw = parseChat(res)
  const parsed = extractJSON(raw, false) || { mode: 'text', text }
  return { result: parsed }
}

/* 22. PDF Toolkit — AI Contract & Legal Risk Auditor */
async function handleContractAuditor(key, payload = {}) {
  const text = typeof payload.text === 'string' ? payload.text.trim() : ''
  const query = typeof payload.query === 'string' ? payload.query.trim() : ''
  if (!text) throw new Error('Document text is required')

  const prompt = query
    ? `Answer the user question about this document based strictly on the text provided: "${sanitizeForPrompt(query, 500)}"`
    : `Audit this contract or legal document. Identify critical clauses, hidden liabilities, auto-renewal terms, termination conditions, and provide an overall risk assessment.`

  const res = await groqChat(key, 'llama-3.3-70b-versatile', [
    {
      role: 'system',
      content: `You are an expert contract and legal document analyst. Analyze the document thoroughly and return ONLY a JSON object:
{
  "riskScore": 1-100,
  "riskLevel": "Low | Moderate | High | Critical",
  "summary": "2-3 sentence overview of what this agreement governs",
  "criticalClauses": [
    { "title": "Clause Title (e.g. Termination / Liability)", "risk": "High | Medium | Low", "detail": "Explanation of potential trap or term" }
  ],
  "recommendations": ["Recommendation 1", "Recommendation 2"],
  "answer": "If a query was asked, provide the direct answer here, otherwise leave empty"
}`
    },
    { role: 'user', content: `Task: ${prompt}\n\nDocument text excerpt:\n\n${text.slice(0, 20000)}` }
  ], { temperature: 0.2, max_tokens: 1500 })

  const raw = parseChat(res)
  const audit = extractJSON(raw, false) || {
    riskScore: 50,
    riskLevel: 'Moderate',
    summary: raw.slice(0, 400),
    criticalClauses: [],
    recommendations: []
  }
  return { audit }
}

/* 23. Favicon Generator — AI Prompt-to-Vector SVG Favicon Generator */
async function handleGenerateFaviconSvg(key, payload = {}) {
  const prompt = typeof payload.prompt === 'string' ? payload.prompt.trim() : ''
  if (!prompt) throw new Error('Favicon description prompt is required')

  const res = await groqChat(key, 'llama-3.3-70b-versatile', [
    {
      role: 'system',
      content: `You are an elite vector icon designer and brand identity specialist. Generate a clean, modern, ultra-sharp vector SVG icon suitable for a 32x32 to 512x512 app favicon.
RULES:
1. Return ONLY the raw valid SVG markup starting with <svg and ending with </svg>. No markdown code blocks, no backticks, no explanatory text.
2. The SVG MUST have: xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256".
3. Use modern aesthetic visuals: sleek rounded geometry, vibrant harmonious gradients (<defs><linearGradient...>), and distinct contrast.
4. Keep the design readable at small sizes (bold shapes, minimal clutter).`
    },
    { role: 'user', content: `Design a favicon for: "${sanitizeForPrompt(prompt, 300)}"` }
  ], { temperature: 0.7, max_tokens: 1200 })

  let svg = parseChat(res).trim()
  if (svg.includes('```xml')) svg = svg.replace(/```xml/g, '').replace(/```/g, '').trim()
  if (svg.includes('```svg')) svg = svg.replace(/```svg/g, '').replace(/```/g, '').trim()
  if (svg.includes('```')) svg = svg.replace(/```/g, '').trim()
  const match = svg.match(/<svg[\s\S]*?<\/svg>/i)
  if (match) {
    svg = match[0]
  }
  if (!svg.startsWith('<svg')) {
    svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256"><rect width="256" height="256" rx="64" fill="#4F8EF7"/><circle cx="128" cy="128" r="64" fill="#ffffff"/></svg>`
  }

  // Micro-level zero-trust SVG sanitization: purge scripts, event handlers, foreignObject, javascript:
  svg = svg.replace(/<script[\s\S]*?<\/script>/gi, '')
           .replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, '')
           .replace(/\bon\w+\s*=\s*[^>\s]+/gi, '')
           .replace(/javascript:/gi, '')
           .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')

  return { svg }
}

/* 24. Text Case Converter — AI Code Identifier & Interface Generator */
async function handleCodeIdentifier(key, payload = {}) {
  const text = typeof payload.text === 'string' ? payload.text.trim() : ''
  if (!text) throw new Error('Identifier specification text is required')

  const res = await groqChat(key, 'llama-3.1-8b-instant', [
    {
      role: 'system',
      content: `You are an expert compiler and software naming specialist. Given a natural language requirement or variable concept, generate idiomatic code identifiers across common languages and a TypeScript interface.
Return ONLY a valid JSON object:
{
  "camelCase": "calculateDiscountedTotal",
  "snake_case": "calculate_discounted_total",
  "pascalCase": "CalculateDiscountedTotal",
  "kebabCase": "calculate-discounted-total",
  "constantCase": "CALCULATE_DISCOUNTED_TOTAL",
  "functionSignature": "function calculateDiscountedTotal(amount: number, discountRate: number): number",
  "tsInterface": "export interface DiscountResult {\\n  originalAmount: number;\\n  discountedTotal: number;\\n}",
  "explanation": "Brief 1-sentence description of the naming logic"
}`
    },
    { role: 'user', content: sanitizeForPrompt(text, 500) }
  ], { temperature: 0.2, max_tokens: 700 })

  const raw = parseChat(res)
  const identifiers = extractJSON(raw, false) || {
    camelCase: text.replace(/\s+(.)/g, (_, c) => c.toUpperCase()).replace(/\s/g, ''),
    snake_case: text.toLowerCase().replace(/\s+/g, '_'),
    pascalCase: text.replace(/(^\w|\s+\w)/g, m => m.trim().toUpperCase()),
    kebabCase: text.toLowerCase().replace(/\s+/g, '-'),
    constantCase: text.toUpperCase().replace(/\s+/g, '_'),
    explanation: 'Generated from input'
  }
  return { identifiers }
}

/* 25. YouTube Thumbnail & Social Media — AI Viral Titles, Hooks & Thumbnail Concepts */
async function handleThumbnailIdeas(key, payload = {}) {
  const title = typeof payload.title === 'string' ? payload.title.trim() : ''
  const topic = typeof payload.topic === 'string' ? payload.topic.trim() : ''
  const query = title || topic || ''
  if (!query) throw new Error('Video title or topic is required')

  const res = await groqChat(key, 'llama-3.3-70b-versatile', [
    {
      role: 'system',
      content: `You are an elite YouTube growth strategist and viral media producer. Given a video topic or title, produce high-CTR titles, opening curiosity hooks, and visual thumbnail concepts.
Return ONLY a valid JSON object matching this schema:
{
  "viralTitles": [
    { "title": "Catchy Title", "ctrReason": "Why this drives clicks" }
  ],
  "thumbnailConcepts": [
    { "concept": "Visual scene description", "focalPoint": "Main subject", "overlayText": "Short 2-3 word bold text", "contrast": "Color contrast suggestion" }
  ],
  "curiosityHooks": [
    "Opening 5-second video hook sentence"
  ]
}`
    },
    { role: 'user', content: `Video Topic / Title: "${sanitizeForPrompt(query, 300)}"` }
  ], { temperature: 0.7, max_tokens: 1000 })

  const raw = parseChat(res)
  const ideas = extractJSON(raw, false) || {
    viralTitles: [{ title: query, ctrReason: 'Direct topic focus' }],
    thumbnailConcepts: [{ concept: 'Clear subject close-up with high contrast background', focalPoint: 'Main subject', overlayText: 'WATCH THIS', contrast: 'Bold yellow and black' }],
    curiosityHooks: ['In this video, we uncover the exact truth you need to know.']
  }
  return { ideas }
}

/* 26. Aspect Ratio Calculator — AI Social Media Framing & Safe Zone Advisor */
async function handleAspectRatioAdvisor(key, payload = {}) {
  const format = typeof payload.format === 'string' ? payload.format.trim() : 'video'
  const description = typeof payload.description === 'string' ? payload.description.trim() : ''
  const currentRatio = typeof payload.ratio === 'string' ? payload.ratio.trim() : '16:9'

  const res = await groqChat(key, 'llama-3.1-8b-instant', [
    {
      role: 'system',
      content: `You are a professional video editor, cinematographer, and social media media specialist. Given a media format or content description, recommend optimal aspect ratios, resolutions, safe zones, and UI overlay rules.
Return ONLY a valid JSON object:
{
  "recommendedRatio": "9:16 | 16:9 | 1:1 | 4:5 | 21:9",
  "bestPlatforms": ["TikTok", "Instagram Reels", "YouTube Shorts"],
  "recommendedDimensions": "1080x1920",
  "safeZones": "Guidance on where platform UI buttons cover content",
  "cinematicNotes": "Tips for composition and framing",
  "commonTraps": "Mistakes to avoid (e.g. text cutoff)"
}`
    },
    { role: 'user', content: `Current ratio: ${currentRatio}, Media type: ${format}, Context: ${sanitizeForPrompt(description || 'General social and web content', 300)}` }
  ], { temperature: 0.3, max_tokens: 600 })

  const raw = parseChat(res)
  const advice = extractJSON(raw, false) || {
    recommendedRatio: currentRatio,
    bestPlatforms: ['Web', 'Social'],
    recommendedDimensions: '1920x1080',
    safeZones: 'Keep critical subjects centered within 80% inner margin.',
    cinematicNotes: 'Balance headroom and rule-of-thirds.',
    commonTraps: 'Avoid placing crucial subtitles near bottom 20% where platform controls sit.'
  }
  return { advice }
}

/* 27. Currency Converter — AI Global Macro & Purchasing Power Analyst */
async function handleCurrencyMacro(key, payload = {}) {
  const from = typeof payload.from === 'string' ? payload.from.trim().toUpperCase() : 'USD'
  const to = typeof payload.to === 'string' ? payload.to.trim().toUpperCase() : 'EUR'
  const rate = payload.rate || 1

  const res = await groqChat(key, 'llama-3.1-8b-instant', [
    {
      role: 'system',
      content: `You are a financial macroeconomist and foreign exchange analyst. Given an FX currency pair, provide a concise, factual breakdown of economic drivers, relative purchasing power parity (PPP), and practical travel/business context.
Return ONLY a valid JSON object:
{
  "macroSummary": "2-sentence overview of the economic dynamics between these two currencies",
  "purchasingPower": "Relative cost of living comparison (e.g. what 100 units buys locally)",
  "keyDrivers": ["Interest rate differential", "Inflation trends", "Trade balance factor"],
  "practicalAdvice": "Actionable note for travelers, freelancers, or cross-border shoppers"
}`
    },
    { role: 'user', content: `Currency pair: ${from} to ${to}, Exchange rate reference: 1 ${from} = ${rate} ${to}` }
  ], { temperature: 0.3, max_tokens: 700 })

  const raw = parseChat(res)
  const macro = extractJSON(raw, false) || {
    macroSummary: `Exchange rate dynamics between ${from} and ${to} reflecting central bank monetary policy differences.`,
    purchasingPower: `Relative purchasing power varies depending on local housing, transport, and consumer goods.`,
    keyDrivers: ['Central bank policy', 'Inflation rates', 'Trade balances'],
    practicalAdvice: 'Check for local card foreign transaction fees before transacting.'
  }
  return { macro }
}

/* 28. Word Counter — AI Tone, Formality & Reading Grade Auditor */
async function handleToneAuditor(key, payload = {}) {
  const text = typeof payload.text === 'string' ? payload.text.trim() : ''
  if (!text) throw new Error('Text is required for tone analysis')

  const res = await groqChat(key, 'llama-3.3-70b-versatile', [
    {
      role: 'system',
      content: `You are an expert computational linguist and communications editor. Analyze the provided text and return ONLY a valid JSON object:
{
  "primaryTone": "Professional | Conversational | Persuasive | Academic | Empathetic | Urgency",
  "secondaryTone": "Direct | Informative | Humorous | Critical | Inspiring",
  "readingGradeLevel": "e.g. Grade 9 (High School) or College Level",
  "formalityScore": 1-100,
  "sentiment": "Positive | Neutral | Negative",
  "strengths": ["Clear concise messaging", "Good active voice"],
  "improvements": ["Consider breaking up long compound sentences", "Reduce passive phrasing"]
}`
    },
    { role: 'user', content: `Analyze the tone of this text:\n\n${sanitizeForPrompt(text, 10000)}` }
  ], { temperature: 0.2, max_tokens: 700 })

  const raw = parseChat(res)
  const toneAnalysis = extractJSON(raw, false) || {
    primaryTone: 'Informative',
    secondaryTone: 'Direct',
    readingGradeLevel: 'General Reader',
    formalityScore: 65,
    sentiment: 'Neutral',
    strengths: ['Clear phrasing'],
    improvements: ['Maintain consistent sentence lengths']
  }
  return { toneAnalysis }
}

exports.handler = async function(event) {
  const corsResult = handleCors(event, { isPaid: true, allowMethods: 'POST,OPTIONS' })
  if (!corsResult.ok) return corsResult.response
  const CORS = corsResult.headers

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' }

  const ip = getClientIp(event)
  const rateLimitResult = await enforceRateLimit({
    service: 'groq-ai',
    ip,
    windowMs: 3600 * 1000,
    maxReqs: 20
  })

  if (!rateLimitResult.allowed) {
    return createRateLimitErrorResponse(
      CORS,
      rateLimitResult,
      'Rate limit exceeded. You can make 20 AI requests per hour. Please try again later.'
    )
  }

  const key = process.env.GROQ_API_KEY
  if (!key) {
    return {
      statusCode: 503,
      headers: CORS,
      body: JSON.stringify({ error: 'GROQ_API_KEY not configured. Go to Netlify → Site settings → Environment variables → add GROQ_API_KEY → redeploy.' }),
    }
  }

  let body
  try {
    const parsed = JSON.parse(event.body || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Request body must be a JSON object' }) }
    }
    body = parsed
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  let { tool, payload } = body

  if (!tool || typeof tool !== 'string') {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'tool string is required' }) }
  }

  if (payload && (typeof payload !== 'object' || Array.isArray(payload))) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'payload must be a JSON object' }) }
  }

  if (!payload) {
    payload = {}
  }


  const HANDLERS = {
    summarize:     () => handleSummarize(key, payload),
    keywords:      () => handleKeywords(key, payload),
    smartReplace:  () => handleSmartReplace(key, payload),
    rewrite:       () => handleRewrite(key, payload),
    generateQuote: () => handleGenerateQuote(key, payload),
    passphrase:    () => handlePassphrase(key, payload),
    imageDesc:     () => handleImageDescription(key, payload),
    seoSuggest:     () => handleSeoSuggestions(key, payload),
    docSummary:     () => handleDocSummary(key, payload),
    deepWebAnalysis:() => handleDeepWebAnalysis(key, payload),
    generateBlueprint:() => handleGenerateBlueprint(key, payload),
    recreationPrompt:() => handleGenerateRecreationPrompt(key, payload),
    explainUnit:   () => handleExplainUnit(key, payload),
    gradientFromDesc:() => handleGradientFromDescription(key, payload),
    smartCrop:     () => handleSmartCropSuggestions(key, payload),
    colorContext:  () => handleColorContext(key, payload),
    colorPalette:  () => handleColorPalette(key, payload),
    generateBackstory:() => handleGenerateBackstory(key, payload),
    extractKeyPoints:() => handleExtractKeyPoints(key, payload),
    scanDocVision:   () => handleScanDocVision(key, payload),
    aiHelper:      () => handleAIHelper(key, payload),
    videoInsights: () => handleVideoInsights(key, payload),
    magicQRIntent: () => handleMagicQRIntent(key, payload),
    contractAuditor: () => handleContractAuditor(key, payload),
    generateFaviconSvg: () => handleGenerateFaviconSvg(key, payload),
    codeIdentifier: () => handleCodeIdentifier(key, payload),
    thumbnailIdeas: () => handleThumbnailIdeas(key, payload),
    aspectRatioAdvisor: () => handleAspectRatioAdvisor(key, payload),
    currencyMacro: () => handleCurrencyMacro(key, payload),
    toneAuditor: () => handleToneAuditor(key, payload),
    calibrateTranslationTone: async () => {
      const text = typeof payload?.text === 'string' ? payload.text.trim().slice(0, 1500) : ''
      const tone = typeof payload?.tone === 'string' ? payload.tone.trim().slice(0, 50) : 'everyday'
      const targetLang = typeof payload?.targetLang === 'string' ? payload.targetLang.trim().slice(0, 50) : 'Spanish'
      const sourceLang = typeof payload?.sourceLang === 'string' ? payload.sourceLang.trim().slice(0, 50) : 'English'

      if (!text) throw new Error('Translated text is required.')

      const sys = `You are a cross-cultural localization and native register specialist for ToolDesk.
The user provides a translated text in ${targetLang}.
Calibrate this translation to sound natural and native for the requested register: "${tone}".
Return ONLY a valid JSON object with the exact keys:
{
  "calibratedText": "Calibrated phrasing in ${targetLang}",
  "toneNuance": "Carefully framed explanation of context/register nuance",
  "idiomaticAlternative": "Natural idiomatic equivalent if applicable, or null",
  "falseFriendWarning": "False friend or common register misconception warning if applicable, or null"
}
Rules:
- Do NOT make rigid or generalized claims about an entire culture.
- Use descriptive language such as: 'Commonly used in informal conversation' or 'In business contexts, this phrasing is often preferred'.`

      const res = await groqChat(key, null, [
        { role: 'system', content: sys },
        { role: 'user', content: `Source: "${payload?.sourceText || ''}"\nTranslation: "${text}"\nTone: ${tone}` }
      ], { temperature: 0.35, max_tokens: 500 })

      const raw = parseChat(res)
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0])
        } catch {}
      }
      return {
        calibratedText: text,
        toneNuance: "Wording maintained directly with base translation.",
        idiomaticAlternative: null,
        falseFriendWarning: null
      }
    },
    countryAssistant: async () => {
      const text = typeof payload?.prompt === 'string' && payload.prompt.trim()
        ? payload.prompt.trim().slice(0, 2000)
        : (typeof payload?.query === 'string' && payload.query.trim()
            ? payload.query.trim().slice(0, 2000)
            : (typeof payload?.text === 'string' && payload.text.trim()
                ? payload.text.trim().slice(0, 2000)
                : (typeof payload?.message === 'string' && payload.message.trim()
                    ? payload.message.trim().slice(0, 2000)
                    : '')))
      if (!text) throw new Error('Valid prompt string is required')

      // Strictly lock down system prompt on the server to prevent jailbreaking
      const sys = 'You are an expert world geography, demographics, and cultural analyst for the ToolDesk platform. Answer the user query using structured facts, emojis, and bullet points. If current web data is provided below, use it and cite sources as [1], [2]. Do not perform non-geographical tasks. Max 250 words.'
      const useSearch = typeof payload?.useSearch === 'boolean' ? payload.useSearch : true


      let searchContext = ''
      let sources = []

      // ── Web search for current data (past 30 days) ──────────────────
      if (useSearch) {
        const braveKey = process.env.BRAVE_SEARCH_API_KEY
        if (braveKey) {
          try {
            const rawQuery = typeof payload?.searchQuery === 'string' && payload.searchQuery.trim() ? payload.searchQuery.trim() : text
            const q = rawQuery.slice(0, 300)
            const searchRes = await searchBrave(braveKey, q, 5, 2500)
            if (searchRes.results?.length) {
              sources = searchRes.results.map(r => ({
                title:   typeof r.title === 'string' ? r.title : '',
                url:     typeof r.url === 'string' ? r.url : '',
                snippet: typeof (r.description || r.snippet) === 'string' ? (r.description || r.snippet) : '',
                date:    r.page_age || r.age || null,
              }))
              searchContext = `\n\n--- CURRENT WEB DATA (searched: "${q}", today: ${new Date().toISOString().slice(0,10)}) ---\n` +
                sources.map((s,i) => `[${i+1}] ${s.title}\n${s.snippet}\nSource: ${s.url}${s.date?'\nDate: '+s.date:''}`).join('\n\n') +
                '\n--- END WEB DATA ---\n\nUse the above current data to answer accurately. Cite sources as [1], [2] etc.'
            }
          } catch (e) {
            // search failed silently — fall back to training data
          }
        }
      }

      const fullSys = sys + searchContext

      const res = await groqChat(key, null, [
        { role: 'system', content: fullSys },
        { role: 'user',   content: text }
      ], { temperature: 0.6, max_tokens: 640 })

      const answer = parseChat(res)
      return { result: answer, response: answer, sources }
    }
  }

  const isAllowedHandler = tool && typeof tool === 'string' && Object.prototype.hasOwnProperty.call(HANDLERS, tool)
  const handler = isAllowedHandler ? HANDLERS[tool] : null
  if (!handler || typeof handler !== 'function') {
    return { statusCode: 400, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, error: 'Unknown or unsupported tool identifier.', tool }) }
  }

  try {
    const result = await handler()
    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, tool, result: result.result !== undefined ? result.result : result.response, ...result }),
    }
  } catch (e) {
    const msg = e.message || 'AI processing failed'
    let statusCode = 500
    if (msg.includes('No valid') || msg.includes('required') || msg.includes('too large') || msg.includes('must be')) {
      statusCode = 400
    } else if (msg.includes('Rate limit') || msg.includes('429')) {
      statusCode = 429
    } else if (msg.includes('timed out') || msg.includes('timeout') || msg.includes('504')) {
      statusCode = 504
    } else if (msg.includes('Network') || msg.includes('502') || msg.includes('Groq error')) {
      statusCode = 502
    }
    return {
      statusCode,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: msg, tool }),
    }
  }
}
