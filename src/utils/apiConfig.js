/**
 * ToolDesk Centralized API Configuration & Platform Resolver
 * 
 * Manages routing between Web, Tauri Desktop, and Capacitor Mobile
 * without scattering platform logic across individual tools.
 * 
 * Web: Uses relative paths (e.g. `/.netlify/functions/groq-ai`)
 * Desktop/Mobile: Prepends the configured production backend origin
 */

import { Capacitor } from '@capacitor/core'

export const PRODUCTION_API_ORIGIN = (typeof process !== 'undefined' && process.env?.VITE_API_ORIGIN) ||
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_ORIGIN) ||
  (typeof window !== 'undefined' && window.location?.origin && window.location.origin.includes('tooldesk-app.netlify.app') ? window.location.origin : 'https://tooldesk-app.netlify.app')

export function isTauri() {
  if (typeof window === 'undefined') return false
  if (Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__ || window.__TAURI_METADATA__)) return true
  if (typeof navigator !== 'undefined' && /tauri/i.test(navigator.userAgent || '')) return true
  if (window.location) {
    const { protocol, hostname, origin } = window.location
    if (protocol === 'tauri:' || hostname === 'tauri.localhost' || (origin && origin.includes('tauri'))) return true
  }
  return false
}

export function isCapacitor() {
  if (typeof window === 'undefined') return false
  try {
    if (Capacitor && typeof Capacitor.isNativePlatform === 'function' && Capacitor.isNativePlatform()) {
      return true
    }
    if (Capacitor && typeof Capacitor.getPlatform === 'function') {
      const p = Capacitor.getPlatform()
      if (p === 'android' || p === 'ios') return true
    }
  } catch {}
  if (
    window.Capacitor?.isNativePlatform?.() ||
    window.Capacitor?.getPlatform?.() === 'android' ||
    window.Capacitor?.getPlatform?.() === 'ios' ||
    (typeof window.Capacitor !== 'undefined' && window.Capacitor.platform && window.Capacitor.platform !== 'web') ||
    window.location?.protocol === 'capacitor:'
  ) return true
  if (window.location) {
    const { protocol, hostname, port } = window.location
    if (protocol === 'https:' && hostname === 'localhost' && !port) return true
    if (protocol === 'http:' && hostname === 'localhost' && !port && !isTauri()) return true
  }
  return false
}

export function getPlatform() {
  if (typeof window === 'undefined') return 'server'
  if (isTauri()) return 'desktop'
  if (isCapacitor()) {
    try {
      const cp = Capacitor?.getPlatform?.()
      if (cp === 'android' || cp === 'ios') return cp
    } catch {}
    const p = window.Capacitor?.getPlatform?.()
    if (p === 'android' || p === 'ios') return p
    return 'android'
  }
  return 'web'
}

export function isNativeShell() {
  if (typeof window === 'undefined') return false
  if (isTauri() || isCapacitor()) return true
  if (window.location) {
    const { protocol, hostname, port, origin } = window.location
    if (protocol === 'capacitor:' || protocol === 'tauri:' || protocol === 'file:') return true
    if (hostname === 'tauri.localhost' || (origin && origin.includes('tauri'))) return true
    if (hostname === 'localhost' && !port) return true
  }
  return false
}

/**
 * Returns the base URL for API requests.
 * On web (served via Netlify or Vite dev), empty string is used for relative URLs.
 * On desktop/mobile shells (Capacitor Android/iOS, Tauri Desktop), uses the production Netlify deployment endpoint.
 */
export function getApiBaseUrl() {
  // 1. Explicit environment variable override (highest priority)
  const envBase = (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_API_BASE_URL
    ? import.meta.env.VITE_API_BASE_URL
    : (typeof process !== 'undefined' ? process.env?.VITE_API_BASE_URL || '' : '')
  ).trim().replace(/\/$/, '')
  if (envBase) return envBase

  // 2. Native shells (Capacitor on Android/iOS, Tauri Desktop) or Node/server test environment
  if (isNativeShell() || typeof window === 'undefined') {
    return PRODUCTION_API_ORIGIN
  }

  // 3. Web browser on standard HTTP/HTTPS: use relative URL (empty string)
  return ''
}

/**
 * Resolves a given endpoint to the correct URL based on runtime platform.
 * e.g. resolveApiUrl('/.netlify/functions/groq-ai')
 */
export function resolveApiUrl(endpoint) {
  if (!endpoint) return ''
  // If it's already an absolute URL (e.g. https://...), return as-is
  if (/^https?:\/\//i.test(endpoint)) return endpoint

  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  const base = getApiBaseUrl()

  return base ? `${base}${cleanEndpoint}` : cleanEndpoint
}

/**
 * Determines whether the "Download App" feature (modal, nav buttons, promo buttons)
 * should be offered to the user.
 *
 * - Web Browser & PWA: Visible (users can download native desktop/mobile builds or install PWA)
 * - Capacitor Native (Android / iOS): Hidden (app is already installed natively)
 * - Tauri Native Desktop: Hidden (app is already installed natively)
 */
export function isDownloadAppAvailable() {
  if (typeof window === 'undefined') return true
  if (isNativeShell()) return false
  return true
}

/**
 * Returns standardized request headers.
 * Sends X-ToolDesk-Client for verified native shells so Netlify serverless functions
 * authenticate legitimate native requests even across strict CORS/WebView boundaries.
 */
export function getApiHeaders(customHeaders = {}) {
  const headers = { ...customHeaders }
  if (isNativeShell()) {
    headers['X-ToolDesk-Client'] = 'native'
  }
  return headers
}
