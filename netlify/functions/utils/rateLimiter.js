/**
 * Centralized, Distributed Rate Limiter for Netlify Serverless Functions.
 * 
 * Architecture:
 * 1. Primary: Distributed Upstash Redis (atomic Lua script with guaranteed TTL expiry).
 * 2. Fallback: High-efficiency in-memory sliding window for single-container execution.
 * 3. Enforces deterministic 429 responses with accurate Retry-After and quota headers.
 */

const https = require('https')
const { URL } = require('url')

// In-memory sliding-window fallback limiter per container
class LocalSlidingWindowLimiter {
  constructor(windowMs = 60000, maxReqs = 30, maxEntries = 5000) {
    this.windowMs = windowMs
    this.maxReqs = maxReqs
    this.maxEntries = maxEntries
    this.cache = new Map()
  }

  check(key) {
    if (!key || typeof key !== 'string') return { allowed: false, remaining: 0, retryAfter: 60 }
    const now = Date.now()
    const record = this.cache.get(key)

    if (record) {
      const valid = record.filter(ts => now - ts < this.windowMs)
      if (valid.length >= this.maxReqs) {
        this.cache.set(key, valid)
        const oldest = valid[0] || now
        const retryAfter = Math.max(1, Math.ceil((this.windowMs - (now - oldest)) / 1000))
        return { allowed: false, remaining: 0, retryAfter }
      }
      valid.push(now)
      this.cache.delete(key)
      this.cache.set(key, valid)
      return { allowed: true, remaining: Math.max(0, this.maxReqs - valid.length), retryAfter: 0 }
    }

    if (this.cache.size >= this.maxEntries) {
      // 1. Purge expired records first
      for (const [k, timestamps] of this.cache.entries()) {
        const stillValid = timestamps.filter(ts => now - ts < this.windowMs)
        if (stillValid.length === 0) {
          this.cache.delete(k)
        } else {
          this.cache.set(k, stillValid)
        }
      }

      // 2. If still at capacity, only evict non-blocked entries (never let attackers flush their block)
      if (this.cache.size >= this.maxEntries) {
        for (const [k, timestamps] of this.cache.entries()) {
          if (timestamps.length < this.maxReqs) {
            this.cache.delete(k)
            if (this.cache.size < this.maxEntries * 0.9) break
          }
        }
      }
    }

    this.cache.set(key, [now])
    return { allowed: true, remaining: this.maxReqs - 1, retryAfter: 0 }
  }
}

const localLimiters = new Map()

function getLocalLimiter(service, windowMs, maxReqs) {
  let limiter = localLimiters.get(service)
  if (!limiter) {
    limiter = new LocalSlidingWindowLimiter(windowMs, maxReqs, 5000)
    localLimiters.set(service, limiter)
  }
  return limiter
}

/**
 * Executes atomic rate limiting via Upstash Redis REST API.
 */
function checkRedisRateLimit(urlStr, token, key, maxReqs, windowSeconds) {
  return new Promise((resolve) => {
    let settled = false
    const safeResolve = val => { if (!settled) { settled = true; resolve(val) } }

    let u
    try {
      u = new URL(urlStr)
    } catch {
      return safeResolve(null)
    }

    const now = Date.now()
    const windowMs = windowSeconds * 1000
    const member = `${now}-${Math.random().toString(36).slice(2, 8)}`

    // Atomic sliding-window Lua script using Redis Sorted Sets
    const luaScript = `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local windowMs = tonumber(ARGV[2])
      local maxReqs = tonumber(ARGV[3])
      local member = ARGV[4]
      local clearBefore = now - windowMs

      -- 1. Remove timestamps outside the sliding window
      redis.call('ZREMRANGEBYSCORE', key, '-inf', clearBefore)

      -- 2. Count requests currently in sliding window
      local current = redis.call('ZCARD', key)
      local ttlSeconds = math.ceil(windowMs / 1000) + 2

      if current < maxReqs then
        redis.call('ZADD', key, now, member)
        redis.call('EXPIRE', key, ttlSeconds)
        return {1, current + 1, 0}
      else
        local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
        local retryAfter = 1
        if #oldest >= 2 then
          local oldestTs = tonumber(oldest[2])
          retryAfter = math.max(1, math.ceil((oldestTs + windowMs - now) / 1000))
        end
        redis.call('EXPIRE', key, ttlSeconds)
        return {0, current, retryAfter}
      end
    `

    const body = JSON.stringify([
      'EVAL',
      luaScript,
      '1',
      key,
      String(now),
      String(windowMs),
      String(maxReqs),
      member
    ])

    let activeRes = null
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 2500, // Strict timeout to prevent blocking serverless execution
    }, res => {
      activeRes = res
      const chunks = []
      let byteCount = 0
      res.on('data', c => {
        byteCount += c.length
        if (byteCount > 65536) {
          res.destroy()
          req.destroy()
          safeResolve(null)
          return
        }
        chunks.push(c)
      })
      res.on('end', () => {
        try {
          const resp = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          if (Array.isArray(resp.result)) {
            const allowed = resp.result[0] === 1
            const count = Number(resp.result[1]) || 0
            const retryAfter = Number(resp.result[2]) || 0
            const remaining = Math.max(0, maxReqs - count)
            safeResolve({ allowed, remaining, retryAfter })
            return
          }
          safeResolve(null)
        } catch {
          safeResolve(null)
        }
      })
      res.on('error', () => safeResolve(null))
    })

    req.on('error', () => safeResolve(null))
    req.on('timeout', () => {
      req.destroy()
      if (activeRes) activeRes.destroy()
      safeResolve(null)
    })
    req.write(body)
    req.end()
  })
}

/**
 * Universal rate limit checker.
 * Supports both function signatures:
 *   enforceRateLimit({ service, ip, maxReqs, windowMs })
 *   enforceRateLimit(clientIp, { action, maxRequests, windowSeconds })
 */
async function enforceRateLimit(arg1, arg2 = {}) {
  let service = 'general'
  let ip = '127.0.0.1'
  let windowMs = 60000
  let maxReqs = 30

  if (typeof arg1 === 'string') {
    ip = arg1
    service = arg2.service || arg2.action || 'general'
    maxReqs = Math.max(1, parseInt(arg2.maxReqs || arg2.maxRequests, 10) || 30)
    const rawWindow = arg2.windowMs || (arg2.windowSeconds ? arg2.windowSeconds * 1000 : 60000)
    windowMs = Math.max(1000, parseInt(rawWindow, 10) || 60000)
  } else if (arg1 && typeof arg1 === 'object') {
    service = arg1.service || arg1.action || 'general'
    ip = arg1.ip || '127.0.0.1'
    maxReqs = Math.max(1, parseInt(arg1.maxReqs || arg1.maxRequests, 10) || 30)
    const rawWindow = arg1.windowMs || (arg1.windowSeconds ? arg1.windowSeconds * 1000 : 60000)
    windowMs = Math.max(1000, parseInt(rawWindow, 10) || 60000)
  }

  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN

  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000))
  const redisKey = `limit:${service}:${ip}`

  // 1. Try Distributed Redis
  if (upstashUrl && upstashToken) {
    const redisRes = await checkRedisRateLimit(upstashUrl, upstashToken, redisKey, maxReqs, windowSeconds)
    if (redisRes) {
      return redisRes
    }
  }

  // 2. Deterministic Local Sliding Window Fallback
  const localLimiter = getLocalLimiter(service, windowMs, maxReqs)
  return localLimiter.check(`${service}:${ip}`)
}

/**
 * Generates an RFC-compliant HTTP 429 response.
 */
function createRateLimitErrorResponse(corsHeaders, rateLimitResult, customMessage) {
  const retryAfter = rateLimitResult?.retryAfter || 60
  const message = customMessage || `Rate limit exceeded. Please wait ${retryAfter} second${retryAfter === 1 ? '' : 's'} before trying again.`
  return {
    statusCode: 429,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Retry-After': String(retryAfter),
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + retryAfter),
    },
    body: JSON.stringify({
      ok: false,
      error: message,
      retryAfter,
    })
  }
}

module.exports = {
  enforceRateLimit,
  createRateLimitErrorResponse
}
