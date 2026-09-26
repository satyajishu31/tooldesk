import { resolveApiUrl, getApiHeaders } from './apiConfig'

/**
 * Universal safe fetch wrapper for JSON endpoints.
 * Handles timeouts, network aborts, CORS, HTML error pages, and normalized error shapes.
 */
export async function safeFetchJSON(url, options = {}, timeoutMs = 25000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  
  const onAbort = () => controller.abort()
  if (options.signal) {
    if (options.signal.aborted) controller.abort()
    else options.signal.addEventListener('abort', onAbort)
  }

  let res
  try {
    const targetUrl = resolveApiUrl(url)
    res = await fetch(targetUrl, {
      ...options,
      headers: getApiHeaders(options.headers || {}),
      signal: controller.signal
    })
  } catch (e) {
    clearTimeout(timer)
    if (options.signal) options.signal.removeEventListener('abort', onAbort)
    if (e.name === 'AbortError') {
      return { error: options.signal?.aborted ? 'Request cancelled by user.' : 'Request timed out. Please try again.' }
    }
    return { error: 'Network error — unable to reach the ToolDesk service. Please check your internet connection.' }
  }
  clearTimeout(timer)
  if (options.signal) options.signal.removeEventListener('abort', onAbort)

  const contentType = (res.headers.get('content-type') || '').toLowerCase()
  let text = ''
  try {
    text = await res.text()
  } catch {
    return { error: `Server response could not be read (HTTP ${res.status}).` }
  }

  const trimmed = (text || '').trim()

  // 1. Handle empty responses
  if (!trimmed) {
    return {
      error: res.ok
        ? 'Server returned an empty response.'
        : `Server error (HTTP ${res.status}). Please try again.`
    }
  }

  // 2. Detect HTML responses (e.g. 404, 502/504 gateway errors, SPA index.html fallbacks)
  const isHtml = contentType.includes('text/html') || trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')
  if (isHtml) {
    if (res.status === 404) {
      return { error: 'Service endpoint not found (HTTP 404). Please verify connection.' }
    }
    if (res.status === 403) {
      return { error: 'Access to this service is restricted (HTTP 403).' }
    }
    if (res.status === 429) {
      return { error: 'Rate limit reached. Please wait a moment before trying again.' }
    }
    if (res.status === 502 || res.status === 504) {
      return { error: 'Service temporarily unreachable or timed out. Please try again in a few moments.' }
    }
    if (res.status >= 500) {
      return { error: 'The server encountered a temporary issue (HTTP 500). Please try again.' }
    }
    return { error: `The server returned an unexpected response page (HTTP ${res.status}).` }
  }

  // 3. Attempt JSON parse
  let data
  try {
    data = JSON.parse(trimmed)
  } catch {
    // If not JSON and not HTML, it could be a plain text or markdown response or raw error
    if (res.ok) {
      return { result: trimmed, text: trimmed, response: trimmed }
    }
    return { error: `Server error (HTTP ${res.status}): ${trimmed.slice(0, 140)}` }
  }

  // 4. Normalize JSON errors
  if (!res.ok && !data.error) {
    if (res.status === 429) {
      data.error = 'Rate limit reached. Please wait a moment before trying again.'
    } else if (res.status === 502 || res.status === 504) {
      data.error = 'Service temporarily unreachable. Please try again.'
    } else if (res.status >= 500) {
      data.error = 'The server encountered a temporary issue. Please try again.'
    } else {
      data.error = `Server request failed (HTTP ${res.status}).`
    }
  }

  return data
}

/**
 * Universal safe fetch wrapper for plain text / markdown / stream endpoints.
 */
export async function safeFetchText(url, options = {}, timeoutMs = 25000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  
  const onAbort = () => controller.abort()
  if (options.signal) {
    if (options.signal.aborted) controller.abort()
    else options.signal.addEventListener('abort', onAbort)
  }

  try {
    const targetUrl = resolveApiUrl(url)
    const res = await fetch(targetUrl, {
      ...options,
      headers: getApiHeaders(options.headers || {}),
      signal: controller.signal
    })
    clearTimeout(timer)
    if (options.signal) options.signal.removeEventListener('abort', onAbort)
    const text = await res.text()
    if (!res.ok) {
      return { error: `Server request failed (HTTP ${res.status}).`, text }
    }
    return { text }
  } catch (e) {
    clearTimeout(timer)
    if (options.signal) options.signal.removeEventListener('abort', onAbort)
    if (e.name === 'AbortError') return { error: 'Request timed out. Please try again.' }
    return { error: 'Network error — check your internet connection.' }
  }
}

export function safeTimeoutSignal(ms = 10000) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms)
  }
  const controller = new AbortController()
  setTimeout(() => controller.abort(), ms)
  return controller.signal
}

