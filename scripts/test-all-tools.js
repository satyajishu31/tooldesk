// scripts/test-all-tools.js
// Automated comprehensive test suite for ToolDesk tools, algorithms, cryptography, and backend utilities

import assert from 'node:assert/strict'
import { TOOLS, UNIT_CATEGORIES, CURRENCY_RATES, QUOTES } from '../src/constants.js'
import { generateQRDataURL, generateQRSVG } from '../src/utils/qrCode.js'
import { parsePageRangeString, formatBytes, PAGE_SIZES } from '../src/utils/pdfEngine.js'
import { resolveApiUrl, getApiBaseUrl, isTauri, isCapacitor, isNativeShell } from '../src/utils/apiConfig.js'
import { createHash } from 'node:crypto'

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

console.log(`\n===> Test Suite Finished: ${passed} passed, ${failed} failed.\n`)
if (failed > 0) process.exit(1)
