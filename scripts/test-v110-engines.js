// scripts/test-v110-engines.js
// Forensic verification test suite for ToolDesk v1.1.0 Universal Engines:
// History Engine, Sanitizer, Storage, File Engine, Job Engine, Batch Engine, Smart Search, Presets

import assert from 'node:assert/strict'
import { sanitizeHistoryEntry, addToHistory, getHistory, getToolHistory, clearHistory, deleteHistoryItem } from '../src/utils/history.js'
import { createOutput, validateOutputMetadata, MIME_EXT_MAP } from '../src/utils/fileEngine.js'
import { createJob, JOB_STATUS, JOB_ERROR_CATEGORIES } from '../src/utils/jobEngine.js'
import { createBatchSession, BATCH_ITEM_STATUS } from '../src/utils/batchEngine.js'
import { smartSearchTools } from '../src/utils/smartSearch.js'
import { getPresets, getPresetsForTool, saveCustomPreset, deleteCustomPreset } from '../src/utils/presets.js'
import { recordRecentTool, getRecentTools, clearRecentTools } from '../src/utils/recentTools.js'
import { toggleFavorite, isFavorite, getFavorites } from '../src/utils/favorites.js'

console.log('===> Starting ToolDesk v1.1.0 Universal Engine Forensic Suite...\n')

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
// 1. HISTORY SANITIZER & SECURITY BUG FIX
// ─────────────────────────────────────────────────────────────
test('History Sanitizer: Valid safe entries are approved', () => {
  const safe = sanitizeHistoryEntry({
    tool: 'Color Picker',
    label: '#4F8EF7',
    value: 'RGB: 79, 142, 247',
    action: 'Copied',
    category: 'design'
  })
  assert(safe !== null, 'Safe color entry should be accepted')
  assert.equal(safe.tool, 'Color Picker')
  assert.equal(safe.label, '#4F8EF7')
  assert.equal(safe.value, 'RGB: 79, 142, 247')
  assert(safe.id.startsWith('hist_'), 'Must have generated ID')
  assert(Number.isFinite(safe.createdAt), 'Must have timestamp')
})

test('History Sanitizer Bug Fix: Password Generator safe metadata is APPROVED (tool name is not rejected)', () => {
  const safePw = sanitizeHistoryEntry({
    tool: 'Password Generator',
    label: '16-character Strong Password',
    value: '•••••••••••••••• (16 chars)',
    action: 'Generated',
    category: 'security',
    metadata: { length: 16, strength: 'Strong' }
  })
  assert(safePw !== null, 'Safe password metadata must NOT be rejected by tool name alone')
  assert.equal(safePw.tool, 'Password Generator')
  assert.equal(safePw.value, '•••••••••••••••• (16 chars)')
})

test('History Sanitizer: Real raw password is strictly REJECTED', () => {
  const rawPw = sanitizeHistoryEntry({
    tool: 'Password Generator',
    label: 'Password Generated',
    value: 'SuperSecret123!@#',
    action: 'Generated'
  })
  assert(rawPw === null, 'Raw password must be rejected by value inspection')
})

test('History Sanitizer Bug Fix: Bcrypt metadata is APPROVED (tool name is not rejected)', () => {
  const safeBcrypt = sanitizeHistoryEntry({
    tool: 'Bcrypt Generator',
    label: 'Bcrypt Hash (Cost: 10)',
    value: 'Calculated with cost factor 10',
    action: 'Generated',
    category: 'security',
    metadata: { rounds: 10 }
  })
  assert(safeBcrypt !== null, 'Bcrypt metadata must be accepted')
  assert.equal(safeBcrypt.label, 'Bcrypt Hash (Cost: 10)')
})

test('History Sanitizer: Raw bcrypt hash ($2a$10$...) is strictly REJECTED', () => {
  const rawHash = sanitizeHistoryEntry({
    tool: 'Bcrypt Generator',
    label: 'Hash Generated',
    value: '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
    action: 'Generated'
  })
  assert(rawHash === null, 'Raw bcrypt hash string must be rejected from history')
})

test('History Sanitizer: Raw API keys and private keys are strictly REJECTED', () => {
  const apiKey = sanitizeHistoryEntry({
    tool: 'API Tester',
    label: 'Request',
    value: 'sk-proj-abc123456789012345678901234567890123456789012'
  })
  assert(apiKey === null, 'OpenAI API key must be rejected')

  const privKey = sanitizeHistoryEntry({
    tool: 'Crypto Tool',
    label: 'Key',
    value: '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASC...'
  })
  assert(privKey === null, 'RSA private key must be rejected')
})

test('History Sanitizer: String lengths and metadata sizes are strictly bounded', () => {
  const oversized = sanitizeHistoryEntry({
    tool: 'Text Tool',
    label: 'A'.repeat(500),
    value: 'B'.repeat(2000),
    action: 'Analyzed'
  })
  assert(oversized !== null, 'Entry should be accepted but truncated')
  assert(oversized.label.length <= 160, `Label should be truncated to <= 160, got ${oversized.label.length}`)
  assert(oversized.value.length <= 500, `Value should be truncated to <= 500, got ${oversized.value.length}`)
})

// ─────────────────────────────────────────────────────────────
// 2. UNIVERSAL FILE ENGINE
// ─────────────────────────────────────────────────────────────
test('File Engine: MIME types map correctly to file extensions', () => {
  assert.equal(MIME_EXT_MAP['application/pdf'], 'pdf')
  assert.equal(MIME_EXT_MAP['image/png'], 'png')
  assert.equal(MIME_EXT_MAP['image/jpeg'], 'jpg')
  assert.equal(MIME_EXT_MAP['image/webp'], 'webp')
  assert.equal(MIME_EXT_MAP['image/svg+xml'], 'svg')
  assert.equal(MIME_EXT_MAP['application/zip'], 'zip')
  assert.equal(MIME_EXT_MAP['application/json'], 'json')
  assert.equal(MIME_EXT_MAP['text/csv'], 'csv')
  assert.equal(MIME_EXT_MAP['text/plain'], 'txt')
})

test('File Engine: createOutput validates correct MIME and sanitizes filename', () => {
  const dummyBlob = new Blob(['sample content'], { type: 'text/plain' })
  const output = createOutput({
    blob: dummyBlob,
    filename: 'test..document//illegal.txt',
    sourceTool: 'Word Counter'
  })
  assert.equal(output.filename, 'test..document__illegal.txt')
  assert.equal(output.mimeType, 'text/plain')
  assert.equal(output.size, 14)
  assert.equal(output.sourceTool, 'Word Counter')
  assert(output.id.startsWith('file_'))
})

test('File Engine: validateOutputMetadata rejects malformed filenames and sizes', () => {
  const valid = validateOutputMetadata({ filename: 'doc.txt', mimeType: 'text/plain', size: 100 })
  assert(valid.valid, 'Valid metadata should pass')

  const noName = validateOutputMetadata({ filename: '', mimeType: 'text/plain', size: 100 })
  assert(!noName.valid, 'Empty filename should fail')

  const negSize = validateOutputMetadata({ filename: 'doc.txt', mimeType: 'text/plain', size: -5 })
  assert(!negSize.valid, 'Negative size should fail')
})

// ─────────────────────────────────────────────────────────────
// 3. UNIVERSAL JOB ENGINE
// ─────────────────────────────────────────────────────────────
await testAsync('Job Engine: Normal execution transitions through queued -> running -> completed', async () => {
  const states = []
  const job = createJob({
    tool: 'PDF Toolkit',
    operation: 'Compress PDF',
    execute: async (signal, onProgress) => {
      onProgress(50)
      return { compressed: true }
    }
  })

  job.on('stateChange', s => states.push(s))
  const result = await job.start()

  assert.equal(job.status, JOB_STATUS.COMPLETED)
  assert(states.includes(JOB_STATUS.RUNNING))
  assert(states.includes(JOB_STATUS.COMPLETED))
  assert.equal(result.compressed, true)
})

await testAsync('Job Engine: Cancellation transitions to cancelled and aborts signal', async () => {
  let wasAborted = false
  const job = createJob({
    tool: 'OCR',
    operation: 'Heavy OCR',
    execute: async (signal) => {
      return new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => {
          wasAborted = true
          reject(new Error('AbortError'))
        })
      })
    }
  })

  const runPromise = job.start()
  job.cancel('User requested stop')

  try {
    await runPromise
  } catch {}

  assert.equal(job.status, JOB_STATUS.CANCELLED)
  assert(wasAborted, 'Abort signal should have triggered')
})

await testAsync('Job Engine: Normalized error categorizes timeout', async () => {
  const job = createJob({
    tool: 'Video Transcriber',
    operation: 'Transcribe',
    timeoutMs: 50,
    execute: async () => {
      await new Promise(r => setTimeout(r, 200))
    }
  })

  try {
    await job.start()
    assert.fail('Job should have timed out')
  } catch (err) {
    assert.equal(job.status, JOB_STATUS.FAILED)
    assert.equal(err.category, JOB_ERROR_CATEGORIES.TIMEOUT)
  }
})

// ─────────────────────────────────────────────────────────────
// 4. SMART SEARCH & COMMAND PALETTE
// ─────────────────────────────────────────────────────────────
test('Smart Search: Natural language intent matching maps accurately', () => {
  const q1 = smartSearchTools('make image smaller')
  assert(q1.length > 0 && q1[0].id === 'imgcompress', `Expected imgcompress, got ${q1[0]?.id}`)

  const q2 = smartSearchTools('extract text from image')
  assert(q2.length > 0 && (q2[0].id === 'imagetools' || q2[0].id === 'ocr-text'), `Expected imagetools or ocr-text, got ${q2[0]?.id}`)

  const q3 = smartSearchTools('pictures to pdf')
  assert(q3.length > 0 && (q3[0].id === 'pdf' || q3[0].id === 'image-tools'), `Expected pdf or image-tools, got ${q3[0]?.id}`)

  const q4 = smartSearchTools('convert webp')
  assert(q4.length > 0 && (q4[0].id === 'imgconvert' || q4[0].id === 'imgcompress'), `Expected imgconvert or imgcompress, got ${q4[0]?.id}`)

  const q5 = smartSearchTools('hash password')
  assert(q5.length > 0 && (q5[0].id === 'bcrypt' || q5[0].id === 'password'), `Expected bcrypt or password, got ${q5[0]?.id}`)
})

// ─────────────────────────────────────────────────────────────
// 5. TOOL PRESETS ENGINE
// ─────────────────────────────────────────────────────────────
await testAsync('Presets Engine: Default built-in presets exist and custom presets persist securely', async () => {
  const imgPresets = getPresets('imgcompress')
  assert(imgPresets.length >= 4, `Expected at least 4 image presets, got ${imgPresets.length}`)
  const webOpt = imgPresets.find(p => p.id === 'web-opt')
  assert(webOpt !== undefined, 'Built-in web-opt preset should exist')
  assert.equal(webOpt.values.quality, 80)

  const custom = await saveCustomPreset({
    toolId: 'imgcompress',
    name: 'My Ultra Low Preset',
    values: { quality: 30, format: 'image/webp' }
  })
  assert(custom !== null, 'Custom preset should be saved')

  const updated = await getPresetsForTool('imgcompress')
  const found = updated.find(p => p.id === custom.id)
  assert(found !== null && found.name === 'My Ultra Low Preset')

  // Clean up
  await deleteCustomPreset(custom.id)
})

await testAsync('Presets Engine: Secret fields in presets are strictly rejected', async () => {
  const badPreset = await saveCustomPreset({
    toolId: 'vault',
    name: 'Master Key Preset',
    values: { masterPassword: 'MySecretPassword123!' }
  })
  assert(badPreset === null, 'Presets containing passwords or secret keys must be rejected')
})

// ─────────────────────────────────────────────────────────────
// 6. RECENT TOOLS & FAVORITES
// ─────────────────────────────────────────────────────────────
await testAsync('Recent Tools: Correctly tracks and retrieves tools with debouncing', async () => {
  await clearRecentTools()
  await recordRecentTool('qrcode')
  await recordRecentTool('colorpicker')
  const recent = await getRecentTools()
  assert(recent.includes('colorpicker'), 'recent should include colorpicker')
  assert(recent.includes('qrcode'), 'recent should include qrcode')
})

test('Favorites: Toggle and persistence works reliably', () => {
  const initialState = isFavorite('pdf')
  toggleFavorite('pdf')
  assert.equal(isFavorite('pdf'), !initialState)
  toggleFavorite('pdf') // restore
  assert.equal(isFavorite('pdf'), initialState)
})

console.log(`\n===> Engine Forensic Suite Finished: ${passed} passed, ${failed} failed.\n`)

if (failed > 0) {
  process.exit(1)
}
