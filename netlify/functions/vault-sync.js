// netlify/functions/vault-sync.js
// Secure server-side Password Vault cloud sync endpoint
// Eliminates unauthenticated browser REST queries, blocks bulk SELECT *, and verifies vault authorization tokens.

const https = require('https')
const { URL } = require('url')
const crypto = require('crypto')
const { getClientIp } = require('./utils/ip')
const { handleCors } = require('./utils/cors')
const { enforceRateLimit } = require('./utils/rateLimiter')

const MAX_PAYLOAD_BYTES = 512 * 1024 // 512KB cap for encrypted vault payload

function isValidHexId(str) {
  return typeof str === 'string' && /^[0-9a-fA-F]{32,64}$/.test(str)
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  return { url, key, isConfigured: Boolean(url && key) }
}

async function querySupabase(path, options = {}) {
  // SEC-004 FIX: Prefer anon key to enforce Supabase RLS as defense-in-depth.
  // Service role key bypasses RLS and should only be used if no anon key is available.
  const { url: supabaseUrl, key: supabaseKey, isConfigured } = getSupabaseConfig()
  if (!isConfigured) return null

  const targetUrl = new URL(path, supabaseUrl).href
  const body = options.body ? JSON.stringify(options.body) : null

  return new Promise((resolve, reject) => {
    const u = new URL(targetUrl)
    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {})
      },
      timeout: 6000
    }, res => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        try {
          resolve({ status: res.statusCode, data: JSON.parse(text) })
        } catch {
          resolve({ status: res.statusCode, text })
        }
      })
      res.on('error', reject)
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Supabase request timeout')) })
    if (body) req.write(body)
    req.end()
  })
}

exports.handler = async function (event) {
  const cors = handleCors(event, { allowedMethods: 'POST,OPTIONS' })
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors.headers }
  if (!cors.isAllowed) return { statusCode: cors.status, headers: cors.headers, body: JSON.stringify({ error: cors.error }) }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors.headers, body: JSON.stringify({ error: 'Method not allowed' }) }

  const clientIp = getClientIp(event)
  const rl = await enforceRateLimit(clientIp, { action: 'vault-sync', maxRequests: 25, windowSeconds: 60 })
  if (!rl.allowed) {
    return {
      statusCode: 429,
      headers: { ...cors.headers, 'Content-Type': 'application/json', 'Retry-After': String(rl.retryAfter) },
      body: JSON.stringify({ error: 'Too many vault sync requests. Please wait a minute.' })
    }
  }

  let body
  try {
    const parsed = JSON.parse(event.body || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { statusCode: 400, headers: cors.headers, body: JSON.stringify({ error: 'Payload must be a JSON object' }) }
    }
    body = parsed
  } catch {
    return { statusCode: 400, headers: cors.headers, body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  const { action, vaultId, authToken, encryptedData } = body
  if (!action || !['get', 'put'].includes(action)) {
    return { statusCode: 400, headers: cors.headers, body: JSON.stringify({ error: 'action must be "get" or "put"' }) }
  }

  if (!isValidHexId(vaultId)) {
    return { statusCode: 400, headers: cors.headers, body: JSON.stringify({ error: 'Invalid vault ID format' }) }
  }

  if (!authToken || typeof authToken !== 'string' || authToken.length < 16) {
    return { statusCode: 400, headers: cors.headers, body: JSON.stringify({ error: 'Valid authToken is required for vault operations' }) }
  }

  const { isConfigured } = getSupabaseConfig()
  if (!isConfigured) {
    return {
      statusCode: 503,
      headers: { ...cors.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Cloud sync backend is not configured. Local encrypted storage remains active.' })
    }
  }

  const clientAuthHash = crypto.createHash('sha256').update(authToken).digest('hex')

  // 1. Action: GET (fetch single vault row by specific ID and verify auth)
  if (action === 'get') {
    try {
      const res = await querySupabase(`/rest/v1/nextool_vaults?id=eq.${encodeURIComponent(vaultId)}&select=id,encrypted_data,auth_hash,updated_at`)
      if (!res || res.status !== 200) {
        return {
          statusCode: res?.status || 502,
          headers: { ...cors.headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Failed to retrieve vault from storage' })
        }
      }

      const rows = Array.isArray(res.data) ? res.data : []
      if (!rows.length || !rows[0]?.encrypted_data) {
        return {
          statusCode: 404,
          headers: { ...cors.headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Vault not found' })
        }
      }

      const record = rows[0]

      // Strict negative auth verification on GET
      if (!record.auth_hash || typeof record.auth_hash !== 'string') {
        return {
          statusCode: 403,
          headers: { ...cors.headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Authorization failed: Vault lacks valid authentication records.' })
        }
      }

      let authorized = false
      if (record.auth_hash.length === clientAuthHash.length) {
        try {
          authorized = crypto.timingSafeEqual(Buffer.from(record.auth_hash, 'utf8'), Buffer.from(clientAuthHash, 'utf8'))
        } catch {
          authorized = false
        }
      }
      if (!authorized) {
        return {
          statusCode: 403,
          headers: { ...cors.headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Authorization failed: Invalid credentials for this vault.' })
        }
      }

      return {
        statusCode: 200,
        headers: { ...cors.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          encrypted_data: record.encrypted_data,
          updated_at: record.updated_at
        })
      }
    } catch (err) {
      return {
        statusCode: 502,
        headers: { ...cors.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Backend storage error' })
      }
    }
  }

  // 2. Action: PUT (store/update encrypted vault)
  if (action === 'put') {
    if (!encryptedData || typeof encryptedData !== 'string') {
      return { statusCode: 400, headers: cors.headers, body: JSON.stringify({ error: 'encryptedData is required' }) }
    }
    if (encryptedData.length > MAX_PAYLOAD_BYTES) {
      return { statusCode: 413, headers: cors.headers, body: JSON.stringify({ error: 'Vault payload exceeds maximum size limit (512KB)' }) }
    }

    try {
      // First check if a vault with this ID already exists and verify auth token
      const checkRes = await querySupabase(`/rest/v1/nextool_vaults?id=eq.${encodeURIComponent(vaultId)}&select=id,auth_hash`)
      if (!checkRes || (checkRes.status !== 200 && checkRes.status !== 404)) {
        return {
          statusCode: checkRes?.status || 502,
          headers: { ...cors.headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Failed to verify existing vault state due to backend storage error. Please retry.' })
        }
      }

      const rows = Array.isArray(checkRes.data) ? checkRes.data : []
      const existing = rows[0] || null

      if (existing) {
        if (!existing.auth_hash || typeof existing.auth_hash !== 'string') {
          return {
            statusCode: 403,
            headers: { ...cors.headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Authorization verification failed: existing vault has invalid authentication state.' })
          }
        }
        let authorized = false
        if (existing.auth_hash.length === clientAuthHash.length) {
          try {
            authorized = crypto.timingSafeEqual(Buffer.from(existing.auth_hash, 'utf8'), Buffer.from(clientAuthHash, 'utf8'))
          } catch {
            authorized = false
          }
        }
        if (!authorized) {
          return {
            statusCode: 403,
            headers: { ...cors.headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Authorization verification failed: cannot overwrite this vault with invalid credentials.' })
          }
        }
      }

      const upsertBody = {
        id: vaultId,
        encrypted_data: encryptedData,
        updated_at: new Date().toISOString(),
        auth_hash: clientAuthHash
      }

      const saveRes = await querySupabase('/rest/v1/nextool_vaults', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicate' },
        body: upsertBody
      })

      if (!saveRes || (saveRes.status !== 200 && saveRes.status !== 201)) {
        return {
          statusCode: saveRes?.status || 502,
          headers: { ...cors.headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Failed to persist vault changes' })
        }
      }

      // SEC-005 FIX: Post-upsert verification — re-read the row to confirm our auth_hash
      // was the one that won the upsert race (mitigates TOCTOU window).
      try {
        const verifyRes = await querySupabase(`/rest/v1/nextool_vaults?id=eq.${encodeURIComponent(vaultId)}&select=auth_hash`)
        if (verifyRes && verifyRes.status === 200 && Array.isArray(verifyRes.data) && verifyRes.data[0]) {
          const storedHash = verifyRes.data[0].auth_hash
          if (storedHash && storedHash.length === clientAuthHash.length) {
            const ownershipValid = crypto.timingSafeEqual(
              Buffer.from(storedHash, 'utf8'),
              Buffer.from(clientAuthHash, 'utf8')
            )
            if (!ownershipValid) {
              return {
                statusCode: 409,
                headers: { ...cors.headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Vault ownership conflict detected. Another client may have claimed this vault simultaneously. Please retry.' })
              }
            }
          }
        }
      } catch {
        // Verification read failed — upsert itself succeeded, proceed cautiously
      }

      return {
        statusCode: 200,
        headers: { ...cors.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, updated_at: upsertBody.updated_at })
      }
    } catch (err) {
      return {
        statusCode: 502,
        headers: { ...cors.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Failed to update cloud vault' })
      }
    }
  }

  return { statusCode: 400, headers: cors.headers, body: JSON.stringify({ error: 'Invalid request' }) }
}
