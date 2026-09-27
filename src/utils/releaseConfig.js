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

import { resolveApiUrl } from './apiConfig'
import { safeFetchJSON } from './safeFetch'

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
      status: 'coming-soon', // Mark available if VITE_WINDOWS_EXE_URL is provided or on release publish
      version: CURRENT_RELEASE_VERSION,
      badge: 'Desktop App',
      desc: 'Windows 10 & 11 • 64-bit Installer',
      formats: [
        {
          type: 'exe',
          label: 'Windows Setup (.exe)',
          arch: 'x64',
          filename: 'ToolDesk-Setup.exe',
          size: '68 MB',
          status: 'coming-soon',
          envKey: 'VITE_WINDOWS_EXE_URL',
          url: '',
          checksum: '',
          recommended: true
        },
        {
          type: 'msi',
          label: 'Windows MSI (.msi)',
          arch: 'x64',
          filename: 'ToolDesk.msi',
          size: '72 MB',
          status: 'coming-soon',
          envKey: 'VITE_WINDOWS_MSI_URL',
          url: '',
          checksum: '',
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
          label: 'macOS Installer (.dmg)',
          arch: 'Universal / Apple Silicon & Intel',
          filename: 'ToolDesk.dmg',
          size: '397 MB',
          status: 'available',
          envKey: 'VITE_MAC_DMG_URL',
          url: '/releases/macos/ToolDesk.dmg',
          checksum: 'ccbe4d36d53830b2715baf2d31ac93de1ef60ba7d069d36299d15d62796f9911',
          recommended: true
        },
        {
          type: 'app',
          label: 'Application Archive (.zip)',
          arch: 'Apple Silicon (arm64)',
          filename: 'ToolDesk-macOS.zip',
          size: '156 MB',
          status: 'available',
          envKey: 'VITE_MAC_APP_URL',
          url: '/releases/macos/ToolDesk-macOS.zip',
          checksum: '45106a67b46dd410eeca22dea078fac4d94238e51ae720137376b8083aabb19d',
          recommended: false
        }
      ]
    },
    linux: {
      name: 'Linux',
      status: 'coming-soon',
      version: CURRENT_RELEASE_VERSION,
      badge: 'Universal Linux',
      desc: 'Debian, Ubuntu, Fedora, Arch • Wayland & X11',
      formats: [
        {
          type: 'appimage',
          label: 'Universal AppImage (.AppImage)',
          arch: 'x86_64',
          filename: 'ToolDesk.AppImage',
          size: '85 MB',
          status: 'coming-soon',
          envKey: 'VITE_LINUX_APPIMAGE_URL',
          url: '',
          checksum: '',
          recommended: true
        },
        {
          type: 'deb',
          label: 'Debian / Ubuntu (.deb)',
          arch: 'amd64',
          filename: 'ToolDesk.deb',
          size: '78 MB',
          status: 'coming-soon',
          envKey: 'VITE_LINUX_DEB_URL',
          url: '',
          checksum: '',
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
          url: '/releases/android/ToolDesk.aab',
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
      merged.platforms[key] = {
        ...(DEFAULT_RELEASE_CONFIG.platforms[key] || {}),
        ...plat,
        formats: (plat.formats || DEFAULT_RELEASE_CONFIG.platforms[key]?.formats || []).map(fmt => {
          const defaultFmt = DEFAULT_RELEASE_CONFIG.platforms[key]?.formats?.find(f => f.type === fmt.type) || {}
          return { ...defaultFmt, ...fmt }
        })
      }
    }
  }

  return merged
}
