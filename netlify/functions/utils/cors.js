/**
 * CORS and Cross-Boundary Origin Verification for Netlify Serverless Functions.
 * 
 * Prevents unauthorized third-party websites from abusing paid AI, translation,
 * and proxy endpoints as an unmetered public API.
 */

function getNormalizedHeaders(event) {
  const raw = event?.headers || {}
  const normalized = {}
  for (const [k, v] of Object.entries(raw)) {
    if (typeof k === 'string' && typeof v === 'string') {
      normalized[k.toLowerCase()] = v
    }
  }
  return normalized
}

function getAllowedOrigins(event) {
  const allowed = new Set()

  // 1. Predefined site environment URLs
  allowed.add('https://tooldesk-app.netlify.app')
  allowed.add('https://tool-desk.netlify.app')
  allowed.add('https://sjenix-tooldesk.netlify.app')
  allowed.add('https://tooldesk.app')
  allowed.add('https://tooldesk.netlify.app')
  if (process.env.URL) allowed.add(process.env.URL.toLowerCase().replace(/\/$/, ''))
  if (process.env.DEPLOY_PRIME_URL) allowed.add(process.env.DEPLOY_PRIME_URL.toLowerCase().replace(/\/$/, ''))
  if (process.env.DEPLOY_URL) allowed.add(process.env.DEPLOY_URL.toLowerCase().replace(/\/$/, ''))
  if (process.env.SITE_URL) allowed.add(process.env.SITE_URL.toLowerCase().replace(/\/$/, ''))

  // 2. Explicitly configured allowed origins (comma-separated list)
  if (process.env.ALLOWED_ORIGINS) {
    process.env.ALLOWED_ORIGINS.split(',').forEach(o => {
      const trimmed = o.trim().toLowerCase().replace(/\/$/, '')
      if (trimmed) allowed.add(trimmed)
    })
  }

  // 3. Localhost in development
  allowed.add('http://localhost:8888')
  allowed.add('http://localhost:5173')
  allowed.add('http://localhost:4173')
  allowed.add('http://localhost:3000')
  allowed.add('http://127.0.0.1:8888')
  allowed.add('http://127.0.0.1:5173')
  allowed.add('http://127.0.0.1:4173')
  allowed.add('http://127.0.0.1:3000')

  // 4. Tauri Desktop & Capacitor Mobile WebViews
  allowed.add('tauri://localhost')
  allowed.add('https://tauri.localhost')
  allowed.add('http://tauri.localhost')
  allowed.add('capacitor://localhost')
  allowed.add('https://localhost')
  allowed.add('http://localhost')
  allowed.add('ionic://localhost')
  allowed.add('null')

  return allowed
}

function isOriginAllowed(origin, event) {
  if (!origin || typeof origin !== 'string') return false
  const cleanOrigin = origin.trim().toLowerCase().replace(/\/$/, '')
  const allowed = getAllowedOrigins(event)

  if (allowed.has(cleanOrigin)) return true

  // Allow legitimate subdomains of the primary site domain if deployed
  if (process.env.URL) {
    try {
      const primaryHostname = new URL(process.env.URL).hostname.toLowerCase()
      const originHostname = new URL(cleanOrigin).hostname.toLowerCase()
      if (originHostname === primaryHostname || originHostname.endsWith('.' + primaryHostname)) {
        return true
      }
    } catch {}
  }

  // Match legitimate netlify.app preview deploys for the configured site only
  if (cleanOrigin.endsWith('.netlify.app') && process.env.URL) {
    try {
      const primaryHost = new URL(process.env.URL).hostname.toLowerCase()
      const sitePrefix = primaryHost.split('.')[0]
      const originHost = new URL(cleanOrigin).hostname.toLowerCase()
      if (sitePrefix && (originHost === `${sitePrefix}.netlify.app` || originHost.endsWith(`--${sitePrefix}.netlify.app`))) {
        return true
      }
    } catch {}
  }

  return false
}

/**
 * Validates request origin for sensitive/paid endpoints.
 * Returns consistent object matching both { ok, response } and { isAllowed, status, headers } patterns.
 */
function handleCors(event, options = {}) {
  const isPaid = options.isPaid !== false // Default to true for paid/server protection
  const allowMethods = options.allowedMethods || options.allowMethods || 'POST,OPTIONS'
  const headers = getNormalizedHeaders(event)
  const origin = headers['origin']
  const referer = headers['referer']
  const secFetchSite = headers['sec-fetch-site']

  let effectiveOrigin = origin
  if (!effectiveOrigin && referer) {
    try {
      effectiveOrigin = new URL(referer).origin
    } catch {}
  }

  const clientHeader = (headers['x-tooldesk-client'] || '').toLowerCase()
  const isNativeClient = clientHeader === 'native' || clientHeader === 'tauri' || clientHeader === 'capacitor' || clientHeader === 'tooldesk'

  const isAllowed = isNativeClient || (effectiveOrigin ? isOriginAllowed(effectiveOrigin, event) : (!secFetchSite || secFetchSite === 'none' || secFetchSite === 'same-origin'))
  const isSameSiteContext = secFetchSite === 'same-origin' || secFetchSite === 'same-site'

  // Handle preflight OPTIONS
  if (event.httpMethod === 'OPTIONS') {
    if (isPaid && !isAllowed && !isSameSiteContext) {
      const errBody = JSON.stringify({ error: 'Cross-origin access from this origin is forbidden.' })
      return {
        ok: false,
        isAllowed: false,
        status: 403,
        error: 'Cross-origin access from this origin is forbidden.',
        headers: { 'Content-Type': 'application/json' },
        response: {
          statusCode: 403,
          headers: { 'Content-Type': 'application/json' },
          body: errBody
        }
      }
    }

    const allowOrigin = (isAllowed && effectiveOrigin && effectiveOrigin !== 'null') ? effectiveOrigin : '*'
    const optHeaders = {
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': allowMethods,
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-ToolDesk-Client',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    }
    return {
      ok: true,
      isAllowed: true,
      status: 204,
      headers: optHeaders,
      response: {
        statusCode: 204,
        headers: optHeaders,
        body: ''
      }
    }
  }

  // Reject explicit cross-site browser requests on protected endpoints
  if (isPaid) {
    if (secFetchSite === 'cross-site' && !isAllowed) {
      const errBody = JSON.stringify({ error: 'Cross-site invocation of paid APIs is not permitted.' })
      return {
        ok: false,
        isAllowed: false,
        status: 403,
        error: 'Cross-site invocation of paid APIs is not permitted.',
        headers: { 'Content-Type': 'application/json' },
        response: {
          statusCode: 403,
          headers: { 'Content-Type': 'application/json' },
          body: errBody
        }
      }
    }

    // Require an authorized Origin or Referer or native client
    if (!isAllowed && !isSameSiteContext) {
      const errBody = JSON.stringify({ error: 'Unauthorized origin for this protected service.' })
      return {
        ok: false,
        isAllowed: false,
        status: 403,
        error: 'Unauthorized origin for this protected service.',
        headers: { 'Content-Type': 'application/json' },
        response: {
          statusCode: 403,
          headers: { 'Content-Type': 'application/json' },
          body: errBody
        }
      }
    }
  }

  const corsHeaders = {
    'Access-Control-Allow-Origin': (isAllowed && effectiveOrigin && effectiveOrigin !== 'null') ? effectiveOrigin : '*',
    'Access-Control-Allow-Methods': allowMethods,
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-ToolDesk-Client',
    'Vary': 'Origin',
  }

  return {
    ok: true,
    isAllowed: true,
    status: 200,
    headers: corsHeaders,
    response: {
      statusCode: 200,
      headers: corsHeaders
    }
  }
}

module.exports = {
  handleCors,
  isOriginAllowed,
  getAllowedOrigins
}
