/**
 * ToolDesk Centralized Release Metadata & Platform Distribution Layer
 * 
 * Single Source of Truth for:
 * - Versioning & release date
 * - Platform support & architecture
 * - Standalone binary artifacts (EXE, MSI, DMG, APP, AppImage, DEB, APK, AAB)
 * - Cryptographic SHA-256 checksums
 * - Safe download URL resolution (Env -> Remote manifest -> GitHub Releases -> Staged)
 */

import { resolveApiUrl } from './apiConfig.js'
import { safeFetchJSON } from './safeFetch.js'

export const CURRENT_RELEASE_VERSION = '1.0.0'
export const CURRENT_RELEASE_DATE = '2026-09-26'
export const MINIMUM_SUPPORTED_VERSION = '1.0.0'
export const GITHUB_REPO_DEFAULT = 'tooldesk/tooldesk'

/**
 * Static baseline release manifest.
 * Used as immediate fallback or initial hydration before remote fetch.
 */
export const DEFAULT_RELEASE_CONFIG = {
  version: CURRENT_RELEASE_VERSION,
  releaseDate: CURRENT_RELEASE_DATE,
  minimumSupportedVersion: MINIMUM_SUPPORTED_VERSION,
  notes: 'ToolDesk 1.0.0 universal release. 32+ offline developer and creative tools with zero telemetry.',
  platforms: {
    windows: {
      name: 'Windows',
      status: 'available',
      version: CURRENT_RELEASE_VERSION,
      badge: 'Desktop App',
      desc: 'Windows 10 & 11 • 64-bit Installer',
      formats: [
        {
          type: 'exe',
          label: 'Windows Setup (.exe)',
          arch: 'x64',
          filename: 'ToolDesk-Setup.exe',
          size: '89 MB',
          status: 'available',
          envKey: 'VITE_WINDOWS_EXE_URL',
          url: 'https://github.com/satyajishu31/tooldesk/releases/download/v1.0.0/ToolDesk-Setup.exe',
          checksum: 'd8863d7864eb980f33d6d9d5814259f54da3bd94ecfacf1a6004c349fd3bdf5d',
          recommended: true
        },
        {
          type: 'msi',
          label: 'Windows MSI (.msi)',
          arch: 'x64',
          filename: 'ToolDesk.msi',
          size: '89 MB',
          status: 'available',
          envKey: 'VITE_WINDOWS_MSI_URL',
          url: 'https://github.com/satyajishu31/tooldesk/releases/download/v1.0.0/ToolDesk.msi',
          checksum: '232e984e44c6e1f4237337af0198958d97ef40e3134e510b44b4f700aea81f11',
          recommended: false
        }
      ]
    },
    macos: {
      name: 'macOS',
      status: 'available',
      version: CURRENT_RELEASE_VERSION,
      badge: 'Universal .DMG',
      desc: 'Apple Silicon (M1/M2/M3/M4) & Intel • Standalone App',
      formats: [
        {
          type: 'dmg',
          label: 'macOS Apple Silicon (.dmg)',
          arch: 'Apple Silicon (arm64)',
          filename: 'ToolDesk-macos-arm64.dmg',
          size: '91 MB',
          status: 'available',
          envKey: 'VITE_MAC_DMG_ARM64_URL',
          url: 'https://github.com/satyajishu31/tooldesk/releases/download/v1.0.0/ToolDesk-macos-arm64.dmg',
          checksum: '3dffc07f852d40049c76100876cff5d78e32df98888456035d15a84d612f7602',
          recommended: true
        },
        {
          type: 'dmg',
          label: 'macOS Intel (.dmg)',
          arch: 'Intel (x64)',
          filename: 'ToolDesk-macos-x64.dmg',
          size: '90 MB',
          status: 'available',
          envKey: 'VITE_MAC_DMG_X64_URL',
          url: 'https://github.com/satyajishu31/tooldesk/releases/download/v1.0.0/ToolDesk-macos-x64.dmg',
          checksum: 'e02f911e984c13ff73369f05e0bd244e064bdc5908ccf378d10411f5a490b69f',
          recommended: false
        },
        {
          type: 'app',
          label: 'Application Archive (.zip)',
          arch: 'Apple Silicon (arm64)',
          filename: 'ToolDesk-macos-arm64.zip',
          size: '90 MB',
          status: 'available',
          envKey: 'VITE_MAC_APP_URL',
          url: 'https://github.com/satyajishu31/tooldesk/releases/download/v1.0.0/ToolDesk-macos-arm64.zip',
          checksum: 'd38c15029c1e90c4f43d3201adfd8e6c1951b9e2236ebe76645ffe4586708f68',
          recommended: false
        }
      ]
    },
    linux: {
      name: 'Linux',
      status: 'available',
      version: CURRENT_RELEASE_VERSION,
      badge: 'Universal Linux',
      desc: 'Debian, Ubuntu, Fedora, Arch • Wayland & X11',
      formats: [
        {
          type: 'appimage',
          label: 'Universal AppImage (.AppImage)',
          arch: 'x86_64',
          filename: 'ToolDesk.AppImage',
          size: '168 MB',
          status: 'available',
          envKey: 'VITE_LINUX_APPIMAGE_URL',
          url: 'https://github.com/satyajishu31/tooldesk/releases/download/v1.0.0/ToolDesk.AppImage',
          checksum: '5093aca4546939b8eec1da4a87634305a2bc17658c20d517d454973965797d3c',
          recommended: true
        },
        {
          type: 'deb',
          label: 'Debian / Ubuntu (.deb)',
          arch: 'amd64',
          filename: 'ToolDesk.deb',
          size: '89 MB',
          status: 'available',
          envKey: 'VITE_LINUX_DEB_URL',
          url: 'https://github.com/satyajishu31/tooldesk/releases/download/v1.0.0/ToolDesk.deb',
          checksum: '983242fb6eabe9b0781f9f91f2cfcc9ed8a84d0929456c48e7ba5cb08e74b6c4',
          recommended: false
        }
      ]
    },
    android: {
      name: 'Android',
      status: 'available',
      version: CURRENT_RELEASE_VERSION,
      badge: 'Official .APK',
      desc: 'Direct Sideload • 100% Offline & Private',
      formats: [
        {
          type: 'apk',
          label: 'Direct Android APK (.apk)',
          arch: 'arm64-v8a, armeabi-v7a, x86_64',
          filename: 'ToolDesk.apk',
          size: '34 MB',
          status: 'available',
          envKey: 'VITE_ANDROID_APK_URL',
          url: '/releases/android/ToolDesk.apk',
          checksum: '205668f42435077b7b2708f046bf9b92ffa1f80d5b3c8f901b9936ebb527160e',
          recommended: true,
          note: 'Direct standalone binary. Sideload on any Android device.'
        },
        {
          type: 'aab',
          label: 'Google Play Bundle (.aab)',
          arch: 'Universal Play Store Bundle',
          filename: 'ToolDesk.aab',
          size: '33 MB',
          status: 'store-bundle',
          envKey: 'VITE_ANDROID_AAB_URL',
          url: 'https://github.com/satyajishu31/tooldesk/releases/download/v1.0.0/ToolDesk.aab',
          checksum: 'd3637572187816914ce4117ea6f95695b76a415fcb33234add95be8af8120e14',
          recommended: false,
          note: 'Official Play Store publishing package'
        }
      ],
      storeUrl: '' // Populated via VITE_ANDROID_STORE_URL when published to Play Store
    },
    ios: {
      name: 'iPhone / iPad',
      status: 'pwa-ready',
      version: CURRENT_RELEASE_VERSION,
      badge: 'iOS Standalone',
      desc: 'Add to Home Screen from Safari • Full Screen App',
      formats: [],
      instructions: 'Open Safari → Tap Share (⎋) → Select "Add to Home Screen" (➕)',
      storeUrl: '', // Populated via VITE_IOS_STORE_URL when published to App Store
      testflightUrl: '' // Populated via VITE_IOS_TESTFLIGHT_URL
    },
    pwa: {
      name: 'Web App / PWA',
      status: 'available',
      version: CURRENT_RELEASE_VERSION,
      badge: 'Zero Install',
      desc: 'Runs in Chrome, Edge, Safari, Brave offline',
      formats: [
        {
          type: 'pwa',
          label: '1-Click Browser Install',
          arch: 'Any OS / Browser',
          filename: '',
          size: 'Instant (0 MB)',
          status: 'available',
          envKey: 'VITE_PWA_URL',
          url: '/',
          checksum: '',
          recommended: true
        }
      ]
    }
  }
}

/**
 * In-memory cache for release manifest to avoid duplicate network requests.
 */
let cachedManifest = null
let fetchPromise = null

/**
 * Safely resolves download URLs by checking environment overrides first,
 * then manifest URLs, then predictable GitHub release paths.
 */
export function resolveArtifactUrl(platformId, format, manifest = DEFAULT_RELEASE_CONFIG) {
  if (!platformId || !format) return ''

  // 1. Direct environment variable override (e.g. VITE_WINDOWS_EXE_URL, VITE_MAC_DMG_URL)
  if (typeof import.meta !== 'undefined' && import.meta?.env) {
    if (format.envKey && import.meta.env[format.envKey]) {
      return sanitizeUrl(import.meta.env[format.envKey])
    }
    // Generic fallback env vars
    const genericKey = `VITE_${platformId.toUpperCase()}_DOWNLOAD_URL`
    if (import.meta.env[genericKey]) {
      return sanitizeUrl(import.meta.env[genericKey])
    }
  }

  // 2. Explicit manifest URL if available and status is available
  if (format.url && format.status === 'available') {
    // If it's a relative path to Netlify release staging, resolve via resolveApiUrl
    if (format.url.startsWith('/')) {
      return resolveApiUrl(format.url)
    }
    return sanitizeUrl(format.url)
  }

  // 3. GitHub Releases predictable asset URL if repository is configured
  const githubRepo = (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_GITHUB_REPO) || ''
  if (githubRepo && format.filename && format.status === 'available') {
    const version = manifest.version || CURRENT_RELEASE_VERSION
    return `https://github.com/${githubRepo}/releases/download/v${version}/${format.filename}`
  }

  return ''
}

/**
 * Sanitizes URLs to prevent javascript:, data:, or unsafe schemes.
 */
export function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return ''
  const trimmed = url.trim()
  if (/^(https?:\/\/|\/)/i.test(trimmed)) {
    return trimmed
  }
  return ''
}

/**
 * Asynchronously loads release manifest from /releases.json or Netlify Function /api/releases.
 * Falls back gracefully to DEFAULT_RELEASE_CONFIG on network failure.
 */
export async function getReleaseManifest() {
  if (cachedManifest) return cachedManifest
  if (fetchPromise) return fetchPromise

  fetchPromise = (async () => {
    try {
      const data = await safeFetchJSON('/releases.json', { headers: { 'Accept': 'application/json' } }, 3500)
      if (data && !data.error && data.version && data.platforms) {
        cachedManifest = mergeManifestWithDefaults(data)
        return cachedManifest
      }
    } catch {}

    try {
      const fnData = await safeFetchJSON('/.netlify/functions/releases', { headers: { 'Accept': 'application/json' } }, 3500)
      if (fnData && !fnData.error && fnData.version && fnData.platforms) {
        cachedManifest = mergeManifestWithDefaults(fnData)
        return cachedManifest
      }
    } catch {}

    cachedManifest = DEFAULT_RELEASE_CONFIG
    return cachedManifest
  })()

  return fetchPromise
}

/**
 * Merges loaded remote manifest with defaults so missing keys never cause runtime crashes.
 */
function mergeManifestWithDefaults(remote) {
  const merged = { ...DEFAULT_RELEASE_CONFIG, ...remote }
  merged.platforms = { ...DEFAULT_RELEASE_CONFIG.platforms }

  if (remote.platforms) {
    for (const [key, plat] of Object.entries(remote.platforms)) {
      const defaultFormats = DEFAULT_RELEASE_CONFIG.platforms[key]?.formats || []
      merged.platforms[key] = {
        ...(DEFAULT_RELEASE_CONFIG.platforms[key] || {}),
        ...plat,
        formats: (plat.formats || defaultFormats).map(fmt => {
          const defaultFmt = defaultFormats.find(f => 
            (fmt.filename && f.filename === fmt.filename) ||
            (f.type === fmt.type && f.arch === fmt.arch) ||
            (f.type === fmt.type)
          ) || {}
          return { ...defaultFmt, ...fmt }
        })
      }
    }
  }

  return merged
}

/**
 * Detects client CPU architecture with graceful fallback.
 * Checks UA/platform tokens and WebGL GPU renderer string where available.
 * 
 * Returns: 'arm64' | 'x64' | 'unknown'
 */
export function detectCpuArchitecture() {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = (navigator.userAgent || '').toLowerCase()
  const plat = (navigator.platform || '').toLowerCase()

  // 1. Direct explicit architecture tokens in UA or platform
  if (/arm64|aarch64/i.test(ua) || /arm64|aarch64/i.test(plat)) {
    return 'arm64'
  }
  if (/x86_64|x86-64|win64|x64|amd64|wow64/i.test(ua) || /x86_64|x64/i.test(plat)) {
    return 'x64'
  }

  // 2. Hardware / GPU heuristic for macOS: distinguish Apple Silicon M-series from Intel
  if (typeof document !== 'undefined' && (/mac/.test(plat) || /macintosh/.test(ua))) {
    try {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
        if (debugInfo) {
          const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || ''
          if (/Apple M[0-9]|Apple GPU|Apple processor/i.test(renderer)) {
            return 'arm64'
          }
          if (/Intel|Radeon|AMD/i.test(renderer)) {
            return 'x64'
          }
        }
      }
    } catch {}
  }

  return 'unknown'
}

/**
 * Partitions available formats for a platform into ONE primary recommended download
 * and a list of secondary/alternative downloads.
 * 
 * @param {string} platformId - 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'pwa'
 * @param {Array} formats - List of formats configured for the platform
 * @param {string} [cpuArch='unknown'] - 'arm64' | 'x64' | 'unknown'
 * @returns {{ primary: Object|null, secondary: Array }}
 */
export function partitionFormatsForPlatform(platformId, formats = [], cpuArch = 'unknown') {
  if (!formats || formats.length === 0) {
    return { primary: null, secondary: [] }
  }

  // Filter only available standalone artifacts (exclude store bundles like Play Store AAB)
  const available = formats.filter(f => f.status === 'available' && (f.resolvedUrl || f.url))
  if (available.length === 0) {
    return { primary: null, secondary: [] }
  }

  let primary = null

  if (platformId === 'macos') {
    if (cpuArch === 'x64') {
      // Prioritize Intel DMG for verified Intel Macs
      primary = available.find(f => f.type === 'dmg' && /intel|x64/i.test(f.arch || f.label || ''))
    } else if (cpuArch === 'arm64') {
      // Prioritize Apple Silicon DMG for verified Apple Silicon Macs
      primary = available.find(f => f.type === 'dmg' && /arm64|apple silicon/i.test(f.arch || f.label || ''))
    }

    // Fallback: If arch is unknown or specific arch DMG wasn't matched, pick recommended DMG or first DMG
    if (!primary) {
      primary = available.find(f => f.recommended && f.type === 'dmg') ||
                available.find(f => f.type === 'dmg') ||
                available[0]
    }
  } else if (platformId === 'windows') {
    // Windows: Primary is always Setup (.exe) installer
    primary = available.find(f => f.type === 'exe' && f.recommended) ||
              available.find(f => f.type === 'exe') ||
              available[0]
  } else if (platformId === 'linux') {
    // Linux: Primary is Universal AppImage (.AppImage)
    primary = available.find(f => f.type === 'appimage' && f.recommended) ||
              available.find(f => f.type === 'appimage') ||
              available[0]
  } else if (platformId === 'android') {
    // Android: Primary is standalone APK sideload
    primary = available.find(f => f.type === 'apk') || available[0]
  } else {
    // Other / Default: recommended format or first available
    primary = available.find(f => f.recommended) || available[0]
  }

  // Secondary formats: all other available formats excluding the primary
  const secondary = available.filter(f => f !== primary)

  return { primary, secondary }
}

