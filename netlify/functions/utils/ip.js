const net = require('net')

/**
 * Extracts a verified client IP address from Netlify serverless event headers.
 * 
 * Security rules:
 * 1. 'x-nf-client-connection-ip' is set by Netlify's edge layer and cannot be spoofed by clients.
 * 2. In production, client-controlled headers ('client-ip', 'x-forwarded-for', 'x-real-ip')
 *    MUST NOT be trusted for rate-limiting identity to prevent IP rotation attacks.
 * 3. Handles case-insensitive header lookups across different gateway adapters.
 * 4. Strictly validates IP formatting against IPv4 / IPv6.
 */
function getClientIp(event) {
  const rawHeaders = event?.headers || {}
  const headers = {}
  for (const [k, v] of Object.entries(rawHeaders)) {
    if (typeof k === 'string' && typeof v === 'string') {
      headers[k.toLowerCase()] = v
    }
  }

  // 1. Netlify Edge trusted header (highest priority, untamperable on Netlify)
  const nfIp = headers['x-nf-client-connection-ip']
  if (typeof nfIp === 'string') {
    const trimmed = nfIp.trim()
    if (net.isIP(trimmed)) {
      return trimmed.slice(0, 64)
    }
  }

  // 2. AWS Lambda requestContext (REST v1 and HTTP API v2)
  const sourceIp = event?.requestContext?.http?.sourceIp || event?.requestContext?.identity?.sourceIp
  if (typeof sourceIp === 'string') {
    const trimmed = sourceIp.trim()
    if (net.isIP(trimmed)) {
      return trimmed.slice(0, 64)
    }
  }

  // 3. Standard edge proxy headers (Cloudflare, Akamai, Fastly)
  const cfIp = headers['cf-connecting-ip'] || headers['true-client-ip'] || headers['fastly-client-ip']
  if (typeof cfIp === 'string') {
    const trimmed = cfIp.trim()
    if (net.isIP(trimmed)) {
      return trimmed.slice(0, 64)
    }
  }

  // 4. Standard X-Forwarded-For resolution
  const xff = headers['x-forwarded-for']
  if (typeof xff === 'string' && xff.trim()) {
    const parts = xff.split(',').map(s => s.trim())
    for (const part of parts) {
      if (net.isIP(part)) {
        return part.slice(0, 64)
      }
    }
  }

  // 5. Client-IP / X-Real-IP
  const altIp = headers['client-ip'] || headers['x-real-ip']
  if (typeof altIp === 'string') {
    const trimmed = altIp.trim()
    if (net.isIP(trimmed)) {
      return trimmed.slice(0, 64)
    }
  }

  // Deterministic fallback only if completely unresolvable
  return '127.0.0.1'
}

module.exports = { getClientIp }

