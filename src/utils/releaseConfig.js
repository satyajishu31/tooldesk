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

export const CURRENT_RELEASE_VERSION = '1.0.2'
export const CURRENT_RELEASE_DATE = '2026-09-27'
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
  notes: 'ToolDesk 1.0.2 universal release. 32+ offline developer and creative tools with zero telemetry.',
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
          size: '25 MB',
          status: 'available',
          envKey: 'VITE_WINDOWS_EXE_URL',
          url: 'https://github.com/satyajishu31/tooldesk/releases/download/v1.0.2/ToolDesk-Setup.exe',
          checksum: '7fa7064ad70eb550f83ea2d85c91c33a38615272e0835e4ef022c9763108c075',
          recommended: true
        },
        {
          type: 'msi',
          label: 'Windows MSI (.msi)',
          arch: 'x64',
          filename: 'ToolDesk.msi',
          size: '25 MB',
          status: 'available',
          envKey: 'VITE_WINDOWS_MSI_URL',
          url: 'https://github.com/satyajishu31/tooldesk/releases/download/v1.0.2/ToolDesk.msi',
          checksum: 'bbf46e7b3822efa6b8b3631d8853a6f40975fa0585025c0fe8a74eb63db755b7',
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
          size: '26 MB',
          status: 'available',
          envKey: 'VITE_MAC_DMG_ARM64_URL',
          url: 'https://github.com/satyajishu31/tooldesk/releases/download/v1.0.2/ToolDesk-macos-arm64.dmg',
          checksum: 'e96b8b1b9837a18a4cb2d13ff00d058136d85b96dd5cbdae447f6af3715e029c',
          recommended: true
        },
        {
          type: 'dmg',
          label: 'macOS Intel (.dmg)',
          arch: 'Intel (x64)',
          filename: 'ToolDesk-macos-x64.dmg',
          size: '26 MB',
          status: 'available',
          envKey: 'VITE_MAC_DMG_X64_URL',
          url: 'https://github.com/satyajishu31/tooldesk/releases/download/v1.0.2/ToolDesk-macos-x64.dmg',
          checksum: 'acd3a9d997fdb6e63319117e593dea4feaadbb0242065f0f24e02fdf2b850f5b',
          recommended: false
        },
        {
          type: 'app',
          label: 'Application Archive (.zip)',
          arch: 'Apple Silicon (arm64)',
          filename: 'ToolDesk-macos-arm64.zip',
          size: '26 MB',
          status: 'available',
          envKey: 'VITE_MAC_APP_URL',
          url: 'https://github.com/satyajishu31/tooldesk/releases/download/v1.0.2/ToolDesk-macos-arm64.zip',
          checksum: '4f733f3e815837796a64387c8765cbe8692d0ccd5cbdfdc8e1f42115e23f6765',
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
          size: '103 MB',
          status: 'available',
          envKey: 'VITE_LINUX_APPIMAGE_URL',
          url: 'https://github.com/satyajishu31/tooldesk/releases/download/v1.0.2/ToolDesk.AppImage',
          checksum: 'a4124305df59d031a240a1893c02dd5eb2b33f8af3c43e56d0d539ace5c901a6',
          recommended: true
        },
        {
          type: 'deb',
          label: 'Debian / Ubuntu (.deb)',
          arch: 'amd64',
          filename: 'ToolDesk.deb',
          size: '25 MB',
          status: 'available',
          envKey: 'VITE_LINUX_DEB_URL',
          url: 'https://github.com/satyajishu31/tooldesk/releases/download/v1.0.2/ToolDesk.deb',
          checksum: '3dd8784c6060686b685b32eb1d7edb3990ac0de046fe115bc63c24c8f69a020d',
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
          size: '42 MB',
          status: 'available',
          envKey: 'VITE_ANDROID_APK_URL',
          url: 'https://github.com/satyajishu31/tooldesk/releases/download/v1.0.2/ToolDesk.apk',
          checksum: '9521c4ab8467e0528deee7352810a60a39fe673bd4a31aaa4f1cbbff918eaf9f',
          recommended: true,
          note: 'Direct standalone binary. Sideload on any Android device.'
        },
        {
          type: 'aab',
          label: 'Google Play Bundle (.aab)',
          arch: 'Universal Play Store Bundle',
          filename: 'ToolDesk.aab',
          size: '34 MB',
          status: 'store-bundle',
          envKey: 'VITE_ANDROID_AAB_URL',
          url: 'https://github.com/satyajishu31/tooldesk/releases/download/v1.0.2/ToolDesk.aab',
          checksum: 'cf5b150e64cbcdb18a332f81eed13477c117c726e851c9fa841fad0afd2a6443',
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
/**
 * Same-origin proxy paths for download artifacts.
 * Browsers silently ignore the `download` attribute on cross-origin <a> tags,
 * so we route through Netlify's same-origin redirects which set
 * `Content-Disposition: attachment` headers for reliable downloads.
 */
const SAME_ORIGIN_PROXY_PATHS = {
  'ToolDesk.apk':              '/releases/android/ToolDesk.apk',
  'ToolDesk.aab':              '/releases/android/ToolDesk.aab',
  'ToolDesk-macos-arm64.dmg':  '/releases/macos/ToolDesk.dmg',
  'ToolDesk-macos-x64.dmg':    '/releases/macos/ToolDesk.dmg',
  'ToolDesk-macos-arm64.zip':  '/releases/macos/ToolDesk-macOS.zip',
  'ToolDesk-Setup.exe':        '/releases/windows/ToolDesk-Setup.exe',
  'ToolDesk.msi':              '/releases/windows/ToolDesk.msi',
  'ToolDesk.AppImage':         '/releases/linux/ToolDesk.AppImage',
  'ToolDesk.deb':              '/releases/linux/ToolDesk.deb',
}

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

  // 2. Same-origin proxy path (preferred for reliable downloads with Content-Disposition headers)
  if (format.filename && format.status === 'available' && SAME_ORIGIN_PROXY_PATHS[format.filename]) {
    return SAME_ORIGIN_PROXY_PATHS[format.filename]
  }

  // 3. Explicit manifest URL if available and status is available
  if (format.url && format.status === 'available') {
    // If it's a relative path to Netlify release staging, resolve via resolveApiUrl
    if (format.url.startsWith('/')) {
      return resolveApiUrl(format.url)
    }
    return sanitizeUrl(format.url)
  }

  // 4. GitHub Releases predictable asset URL if repository is configured
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
  // Note: Ignore generic "MacIntel" platform token because modern Safari & Chrome report "MacIntel" on Apple Silicon for legacy compatibility
  const platNonMac = !/macintel/i.test(plat) ? plat : ''
  if (/arm64|aarch64/i.test(ua) || /arm64|aarch64/i.test(platNonMac)) {
    return 'arm64'
  }
  if (/x86_64|x86-64|win64|amd64|wow64/i.test(ua) || (/x86_64|x64/i.test(platNonMac))) {
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
          const hasAppleSilicon = /Apple M[0-9]|Apple GPU|Apple processor/i.test(renderer)
          const hasIntelOrAmd = /(?:Intel|Radeon|AMD)\s+(?:HD|Iris|UHD|Graphics|Pro|Radeon)/i.test(renderer) || /Intel\s*\(R\)/i.test(renderer) || /AMD\s+Radeon/i.test(renderer)

          // If conflicting signals appear, mark as ambiguous
          if (hasAppleSilicon && hasIntelOrAmd) {
            return 'ambiguous'
          }
          if (hasAppleSilicon) {
            return 'arm64'
          }
          if (hasIntelOrAmd) {
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
 * STRICT ARCHITECTURE SAFETY RULE FOR MACOS:
 * When platformId is 'macos' and cpuArch is unknown, ambiguous, or unsupported,
 * primary MUST BE null and architectureChoiceRequired MUST BE true.
 * Apple Silicon is NEVER guessed or assumed without verified evidence.
 * 
 * @param {string} platformId - 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'pwa'
 * @param {Array} formats - List of formats configured for the platform
 * @param {string} [cpuArch='unknown'] - 'arm64' | 'x64' | 'unknown' | 'ambiguous'
 * @returns {{ primary: Object|null, secondary: Array, architectureChoiceRequired: boolean, macVariants: Array }}
 */
export function partitionFormatsForPlatform(platformId, formats = [], cpuArch = 'unknown') {
  if (!formats || formats.length === 0) {
    return { primary: null, secondary: [], architectureChoiceRequired: false, macVariants: [] }
  }

  // Filter only available standalone artifacts (exclude store bundles like Play Store AAB)
  const available = formats.filter(f => f.status === 'available' && (f.resolvedUrl || f.url))
  if (available.length === 0) {
    return { primary: null, secondary: [], architectureChoiceRequired: false, macVariants: [] }
  }

  let primary = null
  let architectureChoiceRequired = false
  let macVariants = []

  if (platformId === 'macos') {
    const isArm64 = cpuArch === 'arm64'
    const isX64 = cpuArch === 'x64'

    if (isArm64) {
      primary = available.find(f => f.type === 'dmg' && /arm64|apple silicon/i.test(f.arch || f.label || '')) || null
    } else if (isX64) {
      primary = available.find(f => f.type === 'dmg' && /intel|x64/i.test(f.arch || f.label || '')) || null
    }

    if (primary) {
      // Reliably verified architecture: primary is matched DMG, secondary is remaining DMG + ZIP
      architectureChoiceRequired = false
      const secondary = available.filter(f => f !== primary)
      return { primary, secondary, architectureChoiceRequired, macVariants: [] }
    } else {
      // Unknown / Ambiguous or architecture could not be verified:
      // STRICT REQUIREMENT: NEVER automatically select Apple Silicon or Intel!
      // Return primary: null, architectureChoiceRequired: true
      // macVariants contains available DMG installers (Apple Silicon & Intel)
      // secondary contains non-DMG formats (e.g. Application Archive .zip)
      architectureChoiceRequired = true
      macVariants = available.filter(f => f.type === 'dmg')
      const secondary = available.filter(f => f.type !== 'dmg')
      return { primary: null, secondary, architectureChoiceRequired, macVariants }
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

  return { primary, secondary, architectureChoiceRequired: false, macVariants: [] }
}


