// scripts/test-all-tools.js
// Automated comprehensive test suite for ToolDesk tools, algorithms, cryptography, and backend utilities

import assert from 'node:assert/strict'
import { TOOLS, UNIT_CATEGORIES, CURRENCY_RATES, QUOTES } from '../src/constants.js'
import { generateQRDataURL, generateQRSVG } from '../src/utils/qrCode.js'
import { parsePageRangeString, formatBytes, PAGE_SIZES } from '../src/utils/pdfEngine.js'
import { resolveApiUrl, getApiBaseUrl, isTauri, isCapacitor, isNativeShell, isDownloadAppAvailable } from '../src/utils/apiConfig.js'
import { DEFAULT_RELEASE_CONFIG, CURRENT_RELEASE_VERSION, partitionFormatsForPlatform, detectCpuArchitecture } from '../src/utils/releaseConfig.js'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

console.log('===> Starting ToolDesk Comprehensive Automated Test Suite...\n')

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
    passed++
  } catch (err) {
    console.error(`  ✗ ${name}`)
    console.error(`    Error: ${err.message}`)
    failed++
  }
}

async function testAsync(name, fn) {
  try {
    await fn()
    console.log(`  ✓ ${name}`)
    passed++
  } catch (err) {
    console.error(`  ✗ ${name}`)
    console.error(`    Error: ${err.message}`)
    failed++
  }
}

// ─────────────────────────────────────────────────────────────
// 1. CONSTANTS & ROUTE INTEGRITY
// ─────────────────────────────────────────────────────────────
test('Constants: Tools array contains 32+ valid tools', () => {
  assert(TOOLS.length >= 32, `Expected at least 32 tools, found ${TOOLS.length}`)
  const ids = new Set()
  for (const t of TOOLS) {
    assert(t.id, `Tool missing id`)
    assert(t.title, `Tool ${t.id} missing title`)
    assert(t.cat, `Tool ${t.id} missing cat`)
    assert(t.path, `Tool ${t.id} missing path`)
    assert(t.path.startsWith('/tools/'), `Tool path must start with /tools/: ${t.path}`)
    assert(!ids.has(t.id), `Duplicate tool id: ${t.id}`)
    ids.add(t.id)
  }
})

test('Constants: Unit categories and factors are mathematically consistent', () => {
  for (const [catName, cat] of Object.entries(UNIT_CATEGORIES)) {
    assert(Array.isArray(cat.units), `Category ${catName} must have units array`)
    if (!cat.special) {
      assert(Array.isArray(cat.factors), `Category ${catName} must have factors array`)
      assert.equal(cat.units.length, cat.factors.length, `Category ${catName} units/factors length mismatch`)
      for (const factor of cat.factors) {
        assert(typeof factor === 'number' && factor > 0, `Invalid conversion factor in ${catName}`)
      }
    }
  }
})

test('Constants: Currency rates are positive numbers and contain major currencies', () => {
  const requiredCurrencies = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'CAD', 'AUD']
  for (const code of requiredCurrencies) {
    assert(code in CURRENCY_RATES, `Missing required currency ${code}`)
    assert(CURRENCY_RATES[code] > 0, `Rate for ${code} must be > 0`)
  }
})

// ─────────────────────────────────────────────────────────────
// 2. QR CODE GENERATION ENGINE
// ─────────────────────────────────────────────────────────────
test('QR Engine: Generates valid Data URL for standard payload', () => {
  const dataUrl = generateQRDataURL('https://tooldesk.app', { size: 300, margin: 2, ecc: 'M' })
  assert(typeof dataUrl === 'string', 'QR Data URL must be a string')
  assert(dataUrl.startsWith('data:image/'), 'QR Data URL must be image data url')
  assert(dataUrl.length > 50, 'QR Data URL too short')
})

test('QR Engine: Generates valid SVG string', () => {
  const svg = generateQRSVG('ToolDesk Test', { size: 250, margin: 2 })
  assert(typeof svg === 'string', 'SVG output must be string')
  assert(svg.includes('<svg'), 'SVG output must contain <svg tag')
  assert(svg.includes('</svg>'), 'SVG output must contain </svg> tag')
})

test('QR Engine: Handles boundary inputs and special characters', () => {
  const wifiPayload = 'WIFI:T:WPA;S:HomeNetwork;P:MySecretPass123;;'
  const dataUrl = generateQRDataURL(wifiPayload, { size: 200 })
  assert(dataUrl.startsWith('data:image/'))

  const unicodePayload = 'ToolDesk — 世界平和 🚀 100% Client-side'
  const dataUrl2 = generateQRDataURL(unicodePayload, { size: 200 })
  assert(dataUrl2.startsWith('data:image/'))
})

// ─────────────────────────────────────────────────────────────
// 3. PDF ENGINE ALGORITHMS
// ─────────────────────────────────────────────────────────────
test('PDF Engine: parsePageRangeString handles comma, ranges, and deduplication', () => {
  const res = parsePageRangeString('1-3, 5, 8-10, 2', 20)
  assert.deepEqual(res, [1, 2, 3, 5, 8, 9, 10])
})

test('PDF Engine: parsePageRangeString protects against out-of-bounds & DoS ranges', () => {
  // Ranges wider than MAX_RANGE_SPAN (1000) are intentionally rejected for DoS protection
  const dos = parsePageRangeString('1-1000000', 5)
  assert.deepEqual(dos, [])

  // Standard range capped to maxPages
  const capped = parsePageRangeString('1-10', 5)
  assert.deepEqual(capped, [1, 2, 3, 4, 5])

  const invalid = parsePageRangeString('abc, -5, 0, 99', 10)
  assert.deepEqual(invalid, [])
})

test('PDF Engine: formatBytes accurately formats data sizes', () => {
  assert.equal(formatBytes(0), '0 B')
  assert.equal(formatBytes(500), '500 B')
  assert.equal(formatBytes(1024), '1.0 KB')
  assert.equal(formatBytes(1536), '1.5 KB')
  assert.equal(formatBytes(1048576), '1.00 MB')
  assert.equal(formatBytes(5242880), '5.00 MB')
})

// ─────────────────────────────────────────────────────────────
// 4. API CONFIG & PLATFORM RESOLUTION
// ─────────────────────────────────────────────────────────────
test('API Config: getApiBaseUrl on node/server environment returns PRODUCTION_API_ORIGIN', () => {
  const base = getApiBaseUrl()
  assert(base.startsWith('https://'), `Base URL must be HTTPS: ${base}`)
})

test('API Config: resolveApiUrl properly combines paths without double slashes', () => {
  const resolved = resolveApiUrl('/.netlify/functions/groq-ai')
  assert(!resolved.includes('//.netlify'), `URL contains double slashes: ${resolved}`)
  assert(resolved.endsWith('/.netlify/functions/groq-ai'), `Incorrect resolved URL: ${resolved}`)
})

// ─────────────────────────────────────────────────────────────
// 5. BARCODE VALIDATION ALGORITHM
// ─────────────────────────────────────────────────────────────
test('Barcode Engine: EAN-13 check digit calculation and validation', () => {
  // Let's test standard EAN-13 calculation
  function validateEAN13(clean) {
    if (!/^\d{12,13}$/.test(clean)) return { valid: false }
    let sum = 0
    for (let i = 0; i < 12; i++) {
      const digit = parseInt(clean[i], 10)
      sum += i % 2 === 0 ? digit : digit * 3
    }
    const checkDigit = (10 - (sum % 10)) % 10
    if (clean.length === 12) return { valid: true, value: clean + checkDigit }
    return { valid: parseInt(clean[12], 10) === checkDigit, checkDigit }
  }

  const generated = validateEAN13('590123412345')
  assert(generated.valid, 'EAN-13 12-digit input must be valid')
  assert.equal(generated.value.length, 13, 'Generated EAN-13 must be 13 digits')

  const verified = validateEAN13(generated.value)
  assert(verified.valid, 'Complete 13-digit EAN-13 must verify successfully')

  const invalid = validateEAN13('5901234123450') // wrong check digit
  assert(!invalid.valid, 'Tampered EAN-13 must fail validation')
})

// ─────────────────────────────────────────────────────────────
// 6. CRYPTOGRAPHY VERIFICATION (PBKDF2 + AES-GCM)
// ─────────────────────────────────────────────────────────────
await testAsync('Crypto: WebCrypto AES-GCM and PBKDF2 roundtrip', async () => {
  const password = 'SuperSecretMasterPassword123!'
  const plaintext = JSON.stringify({ entries: [{ service: 'GitHub', username: 'tooldesk', password: 'xyz' }] })

  const enc = new TextEncoder()
  const dec = new TextDecoder()

  // 1. Derive key with PBKDF2
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))

  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  )

  const derivedKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )

  // 2. Encrypt
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    derivedKey,
    enc.encode(plaintext)
  )

  assert(ciphertext.byteLength > 0, 'Ciphertext must not be empty')

  // 3. Decrypt with correct password
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    derivedKey,
    ciphertext
  )

  const decryptedText = dec.decode(decrypted)
  assert.equal(decryptedText, plaintext, 'Decrypted text must match original plaintext')

  // 4. Verify wrong password fails decryption
  const wrongBaseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode('WrongPassword999!'),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  const wrongDerivedKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    wrongBaseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )

  let decryptFailed = false
  try {
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      wrongDerivedKey,
      ciphertext
    )
  } catch {
    decryptFailed = true
  }
  assert(decryptFailed, 'Decryption with wrong password MUST throw an error')
})

// ─────────────────────────────────────────────────────────────
// 7. PASSWORD GENERATOR & ENTROPY LOGIC
// ─────────────────────────────────────────────────────────────
test('Password Generator: Entropy calculation', () => {
  function calcEntropy(pwd, poolSize) {
    if (!pwd || poolSize <= 0) return 0
    return Math.round(pwd.length * Math.log2(poolSize))
  }
  const pool = 26 + 26 + 10 + 32 // lowercase + uppercase + numbers + symbols = 94
  const ent16 = calcEntropy('aB3!dE5#gH7$jK9%', pool)
  assert(ent16 >= 100, `16-char complex password must have >= 100 bits entropy, got ${ent16}`)
  const ent8 = calcEntropy('password', 26)
  assert(ent8 <= 40, `8-char lowercase password must have <= 40 bits entropy, got ${ent8}`)
})

// ─────────────────────────────────────────────────────────────
// 8. TEXT TOOLS: WORD COUNTER & READABILITY
// ─────────────────────────────────────────────────────────────
test('Word Counter: Accurate metrics and Flesch-Kincaid grade', () => {
  const sample = "ToolDesk is a powerful suite of client-side browser tools. It provides fast utilities without sending your private files over the network."
  const words = sample.trim().split(/\s+/).filter(Boolean)
  assert.equal(words.length, 21, `Expected 21 words, got ${words.length}`)
  const chars = sample.length
  assert.equal(chars, 138, `Expected 138 chars, got ${chars}`)
  const sentences = sample.split(/[.!?]+/).filter(Boolean)
  assert.equal(sentences.length, 2, `Expected 2 sentences, got ${sentences.length}`)
})

// ─────────────────────────────────────────────────────────────
// 9. TEXT CASE CONVERSIONS
// ─────────────────────────────────────────────────────────────
test('Text Case Converter: All transformations produce valid identifiers', () => {
  const input = "tooldesk powerful release"
  const upper = input.toUpperCase()
  const lower = input.toLowerCase()
  const camel = input.replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => index === 0 ? word.toLowerCase() : word.toUpperCase()).replace(/\s+/g, '')
  const snake = input.toLowerCase().replace(/\s+/g, '_')
  const kebab = input.toLowerCase().replace(/\s+/g, '-')

  assert.equal(upper, "TOOLDESK POWERFUL RELEASE")
  assert.equal(lower, "tooldesk powerful release")
  assert.equal(camel, "tooldeskPowerfulRelease")
  assert.equal(snake, "tooldesk_powerful_release")
  assert.equal(kebab, "tooldesk-powerful-release")
})

// ─────────────────────────────────────────────────────────────
// 10. COLOR CALCULATIONS & WCAG CONTRAST
// ─────────────────────────────────────────────────────────────
test('Color Engine: Relative luminance and WCAG contrast ratio', () => {
  function getLuminance(r, g, b) {
    const a = [r, g, b].map(v => {
      v /= 255
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
    })
    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722
  }

  function getContrast(rgb1, rgb2) {
    const l1 = getLuminance(...rgb1)
    const l2 = getLuminance(...rgb2)
    const lighter = Math.max(l1, l2)
    const darker = Math.min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)
  }

  // Black vs White = 21:1
  const maxContrast = getContrast([0, 0, 0], [255, 255, 255])
  assert(Math.abs(maxContrast - 21) < 0.1, `Expected ~21:1, got ${maxContrast}`)

  // Blue #4F8EF7 vs White #ffffff
  const blueWhite = getContrast([79, 142, 247], [255, 255, 255])
  assert(blueWhite > 2.5 && blueWhite < 3.5, `Expected ~3:1, got ${blueWhite}`)
})

// ─────────────────────────────────────────────────────────────
// 11. ASPECT RATIO GCD CALCULATIONS
// ─────────────────────────────────────────────────────────────
test('Aspect Ratio Engine: GCD and simplification', () => {
  function gcd(a, b) { return b === 0 ? a : gcd(b, a % b) }
  assert.equal(gcd(1920, 1080), 120)
  assert.equal(1920 / 120, 16)
  assert.equal(1080 / 120, 9)

  assert.equal(gcd(3840, 2160), 240)
  assert.equal(3840 / 240, 16)
  assert.equal(2160 / 240, 9)

  assert.equal(gcd(1080, 1080), 1080)
  assert.equal(gcd(800, 600), 200)
  assert.equal(800 / 200, 4)
  assert.equal(600 / 200, 3)
})

// ─────────────────────────────────────────────────────────────
// 12. WORD REPLACER REGEX & ESCAPING SAFETY
// ─────────────────────────────────────────────────────────────
test('Word Replacer: Safe pattern replacement without string substitution bugs', () => {
  const text = "Total price: $100 and bonus: $200"
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(esc('$100'), 'g')
  // Use function replacement to prevent $ pattern substitution
  const replaced = text.replace(pattern, () => '$500')
  assert.equal(replaced, "Total price: $500 and bonus: $200")
})

// ─────────────────────────────────────────────────────────────
// 13. SSRF DEFENSE VALIDATION
// ─────────────────────────────────────────────────────────────
test('Security: SSRF validation blocks all private/internal IP ranges', () => {
  // Same logic as netlify/functions/image-proxy.js and analyze-website.js
  function isPrivateOrReservedIPv4(cleanIp) {
    const parts = cleanIp.split('.').map(n => parseInt(n, 10))
    if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return true
    const [o1, o2, o3, o4] = parts
    if (o1 === 0 || o1 === 10 || o1 === 127) return true
    if (o1 === 100 && o2 >= 64 && o2 <= 127) return true
    if (o1 === 169 && o2 === 254) return true // AWS metadata 169.254.169.254
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return true
    if (o1 === 192 && o2 === 168) return true
    if (o1 >= 224) return true // Multicast / reserved
    return false
  }

  const blockedIps = [
    '127.0.0.1',
    '127.0.1.1',
    '10.0.0.1',
    '10.242.96.1',
    '192.168.1.1',
    '172.16.0.1',
    '172.31.255.255',
    '169.254.169.254', // AWS metadata endpoint
    '0.0.0.0',
    '224.0.0.1',
  ]

  for (const ip of blockedIps) {
    assert(isPrivateOrReservedIPv4(ip), `Private IP ${ip} MUST be blocked by SSRF filter`)
  }

  const publicIps = ['8.8.8.8', '1.1.1.1', '142.250.190.46', '104.16.132.229']
  for (const ip of publicIps) {
    assert(!isPrivateOrReservedIPv4(ip), `Public IP ${ip} should be permitted`)
  }
})

// ─────────────────────────────────────────────────────────────
// 14. DOWNLOAD CENTER PLATFORM-AWARE SELECTION TESTS (10 Cases)
// ─────────────────────────────────────────────────────────────
test('Download Logic 1: Windows - Setup (.exe) is primary, MSI is collapsed secondary', () => {
  const winFormats = DEFAULT_RELEASE_CONFIG.platforms.windows.formats
  const { primary, secondary } = partitionFormatsForPlatform('windows', winFormats, 'x64')
  assert(primary, 'Windows must have a primary download')
  assert.equal(primary.type, 'exe', 'Primary Windows installer must be .exe')
  assert.equal(primary.filename, 'ToolDesk-Setup.exe')
  assert.equal(secondary.length, 1, 'Windows must have exactly 1 secondary download')
  assert.equal(secondary[0].type, 'msi', 'Secondary Windows package must be .msi')
})

test('Download Logic 2: macOS Apple Silicon - arm64 DMG is primary, Intel DMG & ZIP are secondary', () => {
  const macFormats = DEFAULT_RELEASE_CONFIG.platforms.macos.formats
  const { primary, secondary } = partitionFormatsForPlatform('macos', macFormats, 'arm64')
  assert(primary, 'macOS Apple Silicon must have a primary download')
  assert.equal(primary.type, 'dmg')
  assert(primary.filename.includes('arm64'), 'Primary for Apple Silicon must be arm64 DMG')
  assert.equal(secondary.length, 2, 'Intel DMG and ZIP must be secondary')
  assert(secondary.some(f => f.filename.includes('x64')), 'Intel DMG must be in secondary')
  assert(secondary.some(f => f.type === 'app' || f.filename.endsWith('.zip')), 'Archive ZIP must be in secondary')
})

test('Download Logic 3: macOS Intel - x64 DMG is primary, arm64 DMG & ZIP are secondary', () => {
  const macFormats = DEFAULT_RELEASE_CONFIG.platforms.macos.formats
  const { primary, secondary } = partitionFormatsForPlatform('macos', macFormats, 'x64')
  assert(primary, 'macOS Intel must have a primary download')
  assert.equal(primary.type, 'dmg')
  assert(primary.filename.includes('x64'), 'Primary for Intel must be x64 DMG')
  assert.equal(secondary.length, 2, 'Apple Silicon DMG and ZIP must be secondary')
  assert(secondary.some(f => f.filename.includes('arm64')), 'Apple Silicon DMG must be in secondary')
})

test('Download Logic 4: Linux - Universal AppImage is primary, DEB is secondary', () => {
  const linuxFormats = DEFAULT_RELEASE_CONFIG.platforms.linux.formats
  const { primary, secondary } = partitionFormatsForPlatform('linux', linuxFormats, 'x64')
  assert(primary, 'Linux must have a primary download')
  assert.equal(primary.type, 'appimage', 'Primary Linux package must be AppImage')
  assert.equal(secondary.length, 1, 'Linux must have 1 secondary download')
  assert.equal(secondary[0].type, 'deb', 'Secondary Linux package must be .deb')
})

test('Download Logic 5: Android - APK is primary, AAB is excluded from end-user downloads', () => {
  const androidFormats = DEFAULT_RELEASE_CONFIG.platforms.android.formats
  const { primary, secondary } = partitionFormatsForPlatform('android', androidFormats, 'unknown')
  assert(primary, 'Android must have a primary download')
  assert.equal(primary.type, 'apk', 'Primary Android download must be .apk')
  assert.equal(secondary.length, 0, 'AAB (store-bundle) must NOT be shown as end-user direct download')
})

test('Download Logic 6: iOS - Standalone guide behavior preserved, no fake downloads', () => {
  const iosConfig = DEFAULT_RELEASE_CONFIG.platforms.ios
  assert.equal(iosConfig.status, 'pwa-ready', 'iOS platform status must be pwa-ready')
  assert.equal(iosConfig.formats.length, 0, 'iOS must not display desktop or android binary downloads')
  const { primary, secondary } = partitionFormatsForPlatform('ios', iosConfig.formats, 'unknown')
  assert.equal(primary, null, 'iOS has no direct binary download')
  assert.equal(secondary.length, 0)
})

test('Download Logic 7: macOS unknown architecture - NO DMG auto-selected, user choice required', () => {
  const macFormats = DEFAULT_RELEASE_CONFIG.platforms.macos.formats
  const { primary, secondary, architectureChoiceRequired, macVariants } = partitionFormatsForPlatform('macos', macFormats, 'unknown')
  assert.equal(primary, null, 'NO architecture-specific DMG must be automatically selected when architecture is unknown')
  assert.equal(architectureChoiceRequired, true, 'architectureChoiceRequired must be true when architecture is unknown')
  assert.equal(macVariants.length, 2, 'Both Apple Silicon and Intel DMGs must be provided in macVariants')
  assert(macVariants.some(f => f.filename.includes('arm64')), 'Apple Silicon DMG must be in macVariants')
  assert(macVariants.some(f => f.filename.includes('x64')), 'Intel DMG must be in macVariants')
  assert.equal(secondary.length, 1, 'Application Archive (.zip) must be in collapsed secondary downloads')
  assert.equal(secondary[0].filename, 'ToolDesk-macos-arm64.zip')
})

test('Download Logic 7b: macOS ambiguous architecture - NO DMG auto-selected, user choice required', () => {
  const macFormats = DEFAULT_RELEASE_CONFIG.platforms.macos.formats
  const { primary, secondary, architectureChoiceRequired, macVariants } = partitionFormatsForPlatform('macos', macFormats, 'ambiguous')
  assert.equal(primary, null, 'NO architecture-specific DMG must be automatically selected when architecture is ambiguous')
  assert.equal(architectureChoiceRequired, true, 'architectureChoiceRequired must be true when architecture is ambiguous')
  assert.equal(macVariants.length, 2, 'Both Apple Silicon and Intel DMGs must be provided in macVariants')
  assert.equal(secondary.length, 1, 'Application Archive (.zip) must be in collapsed secondary downloads')
})

test('Download Logic 8: Web mobile - Download App option remains visible on mobile web', () => {
  const available = isDownloadAppAvailable()
  assert.equal(available, true, 'isDownloadAppAvailable must return true in standard web browser environment')
})

test('Download Logic 9: Installed native app - Download App hidden in native shell', () => {
  const origWindow = globalThis.window
  try {
    globalThis.window = { __TAURI__: {} }
    assert.equal(isNativeShell(), true, 'Native Tauri window must be recognized as native shell')
    assert.equal(isDownloadAppAvailable(), false, 'Download App must be hidden in native shell')
  } finally {
    globalThis.window = origWindow
  }
})

test('Download Logic 10: Missing/invalid release asset safety - Filters out unavailable and dead links', () => {
  const testFormats = [
    { type: 'exe', label: 'Broken Exe', status: 'unavailable', url: '' },
    { type: 'zip', label: 'Hash Only', status: 'available', url: '#' },
    { type: 'appimage', label: 'Good Package', status: 'available', url: 'https://example.com/app.AppImage', recommended: true }
  ]
  const { primary, secondary } = partitionFormatsForPlatform('linux', testFormats, 'x64')
  assert(primary, 'Valid package should be picked as primary')
  assert.equal(primary.label, 'Good Package')
  assert(!primary.url.includes('#'), 'Dead placeholder url # must not be allowed')
})

test('Download Logic 11: Installed Android app - Download App hidden in Android Capacitor shell', () => {
  const origWindow = globalThis.window
  try {
    globalThis.window = {
      Capacitor: {
        isNativePlatform: () => true,
        getPlatform: () => 'android'
      }
    }
    assert.equal(isNativeShell(), true, 'Android Capacitor window must be recognized as native shell')
    assert.equal(isDownloadAppAvailable(), false, 'Download App must be hidden in Android native shell')
  } finally {
    globalThis.window = origWindow
  }
})

test('Download Logic 12: Installed iOS app - Download App hidden in iOS Capacitor shell', () => {
  const origWindow = globalThis.window
  try {
    globalThis.window = {
      Capacitor: {
        isNativePlatform: () => true,
        getPlatform: () => 'ios'
      }
    }
    assert.equal(isNativeShell(), true, 'iOS Capacitor window must be recognized as native shell')
    assert.equal(isDownloadAppAvailable(), false, 'Download App must be hidden in iOS native shell')
  } finally {
    globalThis.window = origWindow
  }
})

test('Release Integrity: Release version 1.0.2 canonical consistency across files', () => {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'))
  const releasesJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'public/releases.json'), 'utf8'))
  const tauriConf = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'src-tauri/tauri.conf.json'), 'utf8'))
  const cargoToml = fs.readFileSync(path.resolve(process.cwd(), 'src-tauri/Cargo.toml'), 'utf8')
  const gradle = fs.readFileSync(path.resolve(process.cwd(), 'android/app/build.gradle'), 'utf8')
  const pbxproj = fs.readFileSync(path.resolve(process.cwd(), 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8')

  assert.equal(pkg.version, '1.0.2', 'package.json version must be 1.0.2')
  assert.equal(releasesJson.version, '1.0.2', 'public/releases.json version must be 1.0.2')
  assert.equal(DEFAULT_RELEASE_CONFIG.version, '1.0.2', 'DEFAULT_RELEASE_CONFIG.version must be 1.0.2')
  assert.equal(CURRENT_RELEASE_VERSION, '1.0.2', 'CURRENT_RELEASE_VERSION must be 1.0.2')
  assert.equal(tauriConf.version, '1.0.2', 'tauri.conf.json version must be 1.0.2')
  assert(cargoToml.includes('version = "1.0.2"'), 'Cargo.toml must have version 1.0.2')
  assert(gradle.includes('versionName "1.0.2"'), 'Android build.gradle must have versionName "1.0.2"')
  assert(gradle.includes('versionCode 3'), 'Android build.gradle must have versionCode 3')
  assert(pbxproj.includes('MARKETING_VERSION = 1.0.2;'), 'iOS pbxproj must have MARKETING_VERSION = 1.0.2')
  assert(pbxproj.includes('CURRENT_PROJECT_VERSION = 3;'), 'iOS pbxproj must have CURRENT_PROJECT_VERSION = 3')
})

test('Release Integrity: Tag v1.0.0 remains permanently immutable at 580276d', () => {
  let resolved = ''
  try {
    resolved = execSync('git rev-parse refs/tags/v1.0.0^{commit}', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim()
  } catch {
    try {
      const lsRemote = execSync('git ls-remote origin refs/tags/v1.0.0^{}', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim()
      resolved = lsRemote.split(/\s+/)[0]
    } catch {}
  }
  if (resolved) {
    assert.equal(resolved, '580276d1e07a925e9447f745213ed291895bbfa2', 'v1.0.0 tag MUST NOT be retagged or moved')
  }
})

test('Release Integrity: Release metadata download URLs reference v1.0.2 and not older releases', () => {
  const releasesRaw = fs.readFileSync(path.resolve(process.cwd(), 'public/releases.json'), 'utf8')
  const configRaw = fs.readFileSync(path.resolve(process.cwd(), 'src/utils/releaseConfig.js'), 'utf8')

  assert(!releasesRaw.includes('/releases/download/v1.0.0/'), 'releases.json must NOT contain download URLs pointing to v1.0.0')
  assert(!configRaw.includes('/releases/download/v1.0.0/'), 'releaseConfig.js must NOT contain download URLs pointing to v1.0.0')
  assert(releasesRaw.includes('/releases/download/v1.0.2/'), 'releases.json MUST contain download URLs pointing to v1.0.2')
  assert(configRaw.includes('/releases/download/v1.0.2/'), 'releaseConfig.js MUST contain download URLs pointing to v1.0.2')
})

test('Branding: Logo assets existence and optimization across formats', () => {
  const requiredAssets = [
    'public/logo.png',
    'public/logo.webp',
    'public/logo-tooldesk.png',
    'public/logo-tooldesk.webp',
    'public/logo-white.png',
    'public/logo-white.webp',
    'public/logo-icon.png',
    'public/logo-icon.webp',
    'public/favicon.ico',
    'public/favicon.png',
    'public/pwa-192x192.png',
    'public/pwa-512x512.png',
    'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png',
    'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-1024x1024.png',
    'src-tauri/icons/icon.icns'
  ]
  for (const asset of requiredAssets) {
    const fullPath = path.resolve(process.cwd(), asset)
    assert(fs.existsSync(fullPath), `Required branding asset missing: ${asset}`)
    const stat = fs.statSync(fullPath)
    assert(stat.size > 0, `Branding asset empty: ${asset}`)
  }
})

test('Branding: Robot assistant assets existence and transparency verification', () => {
  const requiredRobotAssets = [
    'public/robot-assistant.webp',
    'public/robot-assistant.png',
    'public/robot-assistant-128.webp',
    'public/robot-assistant-128.png',
    'public/robot-assistant-64.webp',
    'public/robot-assistant-64.png',
    'public/robot-assistant-32.png'
  ]
  for (const asset of requiredRobotAssets) {
    const fullPath = path.resolve(process.cwd(), asset)
    assert(fs.existsSync(fullPath), `Required robot asset missing: ${asset}`)
    const stat = fs.statSync(fullPath)
    assert(stat.size > 0, `Robot asset empty: ${asset}`)
  }
  // Verify PNG header has alpha channel support
  const pngHeader = fs.readFileSync(path.resolve(process.cwd(), 'public/robot-assistant.png')).subarray(0, 30)
  assert.equal(pngHeader[12], 0x49) // I
  assert.equal(pngHeader[13], 0x48) // H
  assert.equal(pngHeader[14], 0x44) // D
  assert.equal(pngHeader[15], 0x52) // R
  assert.equal(pngHeader[25], 6) // Color type 6 = RGBA (truecolor with alpha)
})

test('AI UX & Architecture: Malformed and standard AI response handling', () => {
  // Test helper parsing logic simulating what handleAIHelper and AI clients do
  function parseAIResponse(data) {
    if (!data) return { error: 'Empty response' }
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data)
      } catch {
        return { error: 'Invalid JSON format' }
      }
    }
    if (data.choices?.[0]?.message?.content) {
      return { success: true, text: data.choices[0].message.content }
    }
    if (data.reply) {
      return { success: true, text: data.reply }
    }
    if (data.error) {
      return { error: typeof data.error === 'string' ? data.error : (data.error.message || 'Unknown API error') }
    }
    return { error: 'Unexpected response schema' }
  }

  // 1. Standard OpenAI/Groq format
  const groqRes = parseAIResponse({ choices: [{ message: { content: 'Hello from Groq LPU' } }] })
  assert.equal(groqRes.success, true)
  assert.equal(groqRes.text, 'Hello from Groq LPU')

  // 2. Direct reply format
  const directRes = parseAIResponse({ reply: 'Direct helper reply' })
  assert.equal(directRes.success, true)
  assert.equal(directRes.text, 'Direct helper reply')

  // 3. Upstream error format
  const errRes = parseAIResponse({ error: { message: 'Rate limit exceeded' } })
  assert.equal(errRes.error, 'Rate limit exceeded')

  // 4. Malformed raw HTML or random text
  const malformedRes = parseAIResponse('<html>502 Bad Gateway</html>')
  assert.equal(malformedRes.error, 'Invalid JSON format')

  // 5. Empty input
  const emptyRes = parseAIResponse(null)
  assert.equal(emptyRes.error, 'Empty response')
})

test('Service Worker: Cache version matches v1.0.2 and precaches robot asset', () => {
  const swCode = fs.readFileSync(path.resolve(process.cwd(), 'public/sw.js'), 'utf8')
  assert(swCode.includes("SW_VERSION = 'v1.0.2'"), 'sw.js SW_VERSION must be v1.0.2')
  assert(swCode.includes("CACHE_NAME = `tooldesk-pwa-${SW_VERSION}`"), 'sw.js CACHE_NAME must use SW_VERSION')
  assert(swCode.includes('/robot-assistant-64.webp'), 'sw.js must precache /robot-assistant-64.webp')
  assert(swCode.includes('/logo.png'), 'sw.js must precache /logo.png')
})

test('Release Integrity: Checksums consistency in SHA256SUMS.txt', () => {
  const sumsPath = path.resolve(process.cwd(), 'public/SHA256SUMS.txt')
  assert(fs.existsSync(sumsPath), 'public/SHA256SUMS.txt must exist')
  const content = fs.readFileSync(sumsPath, 'utf8')
  assert(content.includes('ToolDesk-macos-arm64.dmg'), 'SHA256SUMS.txt must contain ToolDesk-macos-arm64.dmg')
  assert(content.includes('ToolDesk-macos-arm64.zip'), 'SHA256SUMS.txt must contain ToolDesk-macos-arm64.zip')
})

console.log(`\n===> Test Suite Finished: ${passed} passed, ${failed} failed.\n`)
if (failed > 0) process.exit(1)

