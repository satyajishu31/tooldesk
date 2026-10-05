import { PDFDocument } from 'pdf-lib'
import JSZip from 'jszip'
import {
  redactPdfPages,
  createZipFromFiles,
  sanitizeZipFilename,
  toSafeArrayBuffer,
  toSafeUint8Array,
  getPdfJs,
  compressPdf,
  comparePdfs,
  getPdfjsDocumentOptions,
} from '../src/utils/pdfStructuralEngine.js'
import {
  toSafeString,
  convertTextToPdf,
  convertMarkdownToPdf,
  convertCsvToPdf,
  convertJsonToPdf,
  convertXmlToPdf,
} from '../src/utils/documentConversionEngine.js'
import { parseDocx } from '../src/utils/docxParser.js'

let passed = 0
let failed = 0

function assert(cond, msg) {
  if (!cond) {
    console.error(`❌ FAIL: ${msg}`)
    failed++
    throw new Error(msg)
  }
  console.log(`✅ PASS: ${msg}`)
  passed++
}

// Setup canvas mock in Node if running in CLI
if (typeof document === 'undefined') {
  globalThis.document = {
    createElement: (tag) => {
      if (tag === 'canvas') {
        const c = {
          width: 0,
          height: 0,
          getContext: () => {
            const dummyCtx = {
              canvas: c,
              fillStyle: '',
              strokeStyle: '',
              measureText: (txt) => ({ width: (txt || '').length * 7 }),
              getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
              getLineDash: () => [],
              createImageData: () => ({ data: [] }),
              getImageData: () => ({ data: [] }),
            }
            return new Proxy(dummyCtx, {
              get: (target, prop) => (prop in target ? target[prop] : () => {})
            })
          },
          toDataURL: () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          toBlob: (cb) => cb(new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }))
        }
        return c
      }
      return {}
    }
  }
}

async function runContractTests() {
  console.log('══════════════════════════════════════════════════════════════')
  console.log('🧪 RUNNING FORENSIC REMEDIATION CONTRACT TESTS (P1 + P2)')
  console.log('══════════════════════════════════════════════════════════════\n')

  // ──────────────────────────────────────────────────────────
  // 1. P1-ENG-REDACT-01 CONTRACT TESTS
  // ──────────────────────────────────────────────────────────
  console.log('--- TEST GROUP 1: P1-ENG-REDACT-01 Redaction Buffer Detachment & Ownership ---')

  // 1A. Create a test PDF with sensitive tokens
  const secDoc = await PDFDocument.create()
  const p1 = secDoc.addPage([595, 842])
  p1.drawText('HEADER: PUBLIC CONFIDENTIAL HEADER', { x: 50, y: 750, size: 14 })
  p1.drawText('SECRET TOKEN: SECRET-123456', { x: 50, y: 700, size: 14 })
  p1.drawText('PRIVATE TOKEN: PRIVATE-DATA', { x: 50, y: 650, size: 14 })
  p1.drawText('ACCOUNT TOKEN: ACCOUNT-TEST-001', { x: 50, y: 600, size: 14 })
  const p2 = secDoc.addPage([595, 842])
  p2.drawText('PAGE 2 UNTOUCHED VECTOR TEXT LAYER', { x: 50, y: 700, size: 14 })
  const secBytes = await secDoc.save()

  // 1B. Caller owns this ArrayBuffer
  const callerArrayBuffer = secBytes.buffer.slice(secBytes.byteOffset, secBytes.byteOffset + secBytes.byteLength)
  const initialLength = callerArrayBuffer.byteLength
  assert(initialLength > 0, `Caller ArrayBuffer created (${initialLength} bytes)`)

  // 1C. Execute redaction passing caller's ArrayBuffer
  const redRes = await redactPdfPages(callerArrayBuffer, {
    1: [{ xPercent: 0.05, yPercent: 0.15, widthPercent: 0.5, heightPercent: 0.25, color: '#000000' }]
  })
  assert(redRes.bytes && redRes.bytes.length > 0, `Redaction produced output PDF (${redRes.bytes.length} bytes)`)

  // 1D. CRITICAL CHECK: Caller's buffer must NOT be detached
  assert(callerArrayBuffer.byteLength === initialLength, `Caller buffer byteLength preserved (${callerArrayBuffer.byteLength} === ${initialLength})`)
  let sliceSucceeded = false
  try {
    const testSlice = callerArrayBuffer.slice(0)
    sliceSucceeded = testSlice.byteLength === initialLength
  } catch (e) {
    sliceSucceeded = false
  }
  assert(sliceSucceeded, 'Caller ArrayBuffer slice(0) succeeded cleanly (NOT detached)')

  // 1E. Security Check: Sensitive tokens must NOT exist on page 1
  const pdfjs = await getPdfJs()
  const parsedRed = await pdfjs.getDocument(getPdfjsDocumentOptions(redRes.bytes.buffer)).promise
  const p1Content = await (await parsedRed.getPage(1)).getTextContent()
  const p1Text = p1Content.items.map(it => it.str).join(' ')
  assert(!p1Text.includes('SECRET-123456'), 'Sensitive string SECRET-123456 eliminated')
  assert(!p1Text.includes('PRIVATE-DATA'), 'Sensitive string PRIVATE-DATA eliminated')
  assert(!p1Text.includes('ACCOUNT-TEST-001'), 'Sensitive string ACCOUNT-TEST-001 eliminated')

  // 1F. Fidelity Check: Page 2 untouched vector text must survive
  const p2Content = await (await parsedRed.getPage(2)).getTextContent()
  const p2Text = p2Content.items.map(it => it.str).join(' ')
  assert(p2Text.includes('PAGE 2 UNTOUCHED VECTOR TEXT LAYER'), 'Page 2 unredacted vector text layer survived intact')

  // ──────────────────────────────────────────────────────────
  // 2. P2-ENG-ZIP-01 CONTRACT TESTS
  // ──────────────────────────────────────────────────────────
  console.log('\n--- TEST GROUP 2: P2-ENG-ZIP-01 ZIP Input Normalization & Security ---')

  // 2A. Test filename sanitization
  assert(sanitizeZipFilename('../../etc/passwd.pdf') === 'passwd.pdf', 'Path traversal ../ stripped from ZIP entry name')
  assert(sanitizeZipFilename('..\\..\\windows\\cmd.exe') === 'cmd.exe', 'Backslash traversal ..\\ stripped from ZIP entry name')
  assert(sanitizeZipFilename('null\0byte.pdf') === 'nullbyte.pdf', 'Null byte stripped from ZIP entry name')
  assert(sanitizeZipFilename('../malicious.zip', 'export.zip') === 'malicious.zip', 'Archive name traversal stripped')
  assert(sanitizeZipFilename('Unicode_中文_हिंदी_عربي.pdf') === 'Unicode_中文_हिंदी_عربي.pdf', 'Unicode characters preserved in ZIP entry name')
  assert(sanitizeZipFilename('..') === 'document.pdf', 'Bare .. resolves to fallback')

  // 2B. Test multi-representation input types into createZipFromFiles
  const samplePdfDoc = await PDFDocument.create()
  samplePdfDoc.addPage([400, 400])
  const pdfSampleBytes = await samplePdfDoc.save()

  const nodeFile = new File([pdfSampleBytes], 'sample_node_file.pdf', { type: 'application/pdf' })
  const blobFile = new Blob([pdfSampleBytes], { type: 'application/pdf' })
  const rawUint8 = new Uint8Array(pdfSampleBytes)
  const rawArrayBuf = rawUint8.buffer.slice(rawUint8.byteOffset, rawUint8.byteOffset + rawUint8.byteLength)
  const nodeBuf = Buffer.from(pdfSampleBytes)

  const items = [
    { name: '../../traversal/node-file.pdf', blob: nodeFile },
    { name: 'blob-file.pdf', blob: blobFile },
    { name: 'uint8-file.pdf', bytes: rawUint8 },
    { name: 'arraybuf-file.pdf', blob: rawArrayBuf },
    { name: 'nodebuf-file.pdf', bytes: nodeBuf },
    { name: 'unicode_हिंदी_中文.pdf', file: nodeFile },
  ]

  const zipResult = await createZipFromFiles(items, '../output_archive.zip')
  assert(zipResult.blob && zipResult.blob.size > 200, `createZipFromFiles generated ZIP archive (${zipResult.size} bytes)`)
  assert(zipResult.name === 'output_archive.zip', `Sanitized archive name: ${zipResult.name}`)

  // 2C. Inspect generated ZIP archive contents with JSZip
  const zipAb = await zipResult.blob.arrayBuffer()
  const readZip = await JSZip.loadAsync(zipAb)
  const fileEntries = Object.keys(readZip.files)
  assert(fileEntries.length === 6, `ZIP archive contains exactly 6 entries (got ${fileEntries.length})`)
  assert(fileEntries.includes('node-file.pdf'), 'node-file.pdf correctly un-traversed')
  assert(fileEntries.includes('blob-file.pdf'), 'blob-file.pdf entry present')
  assert(fileEntries.includes('uint8-file.pdf'), 'uint8-file.pdf entry present')
  assert(fileEntries.includes('arraybuf-file.pdf'), 'arraybuf-file.pdf entry present')
  assert(fileEntries.includes('nodebuf-file.pdf'), 'nodebuf-file.pdf entry present')
  assert(fileEntries.includes('unicode_हिंदी_中文.pdf'), 'unicode_हिंदी_中文.pdf entry present')

  // 2D. Extract each PDF from ZIP and parse it independently
  for (const entryName of fileEntries) {
    const entryData = await readZip.file(entryName).async('uint8array')
    const extractedDoc = await PDFDocument.load(entryData)
    assert(extractedDoc.getPageCount() === 1, `Extracted entry "${entryName}" is a valid 1-page PDF`)
  }

  // ──────────────────────────────────────────────────────────
  // 3. MICRO-HARDENING & UNIVERSAL INPUT CONTRACT TESTS
  // ──────────────────────────────────────────────────────────
  console.log('\n--- TEST GROUP 3: Universal Input Normalization & Converter Hardening ---')

  // 3A. toSafeString multi-representation tests
  assert(await toSafeString('Hello Direct') === 'Hello Direct', 'toSafeString handled raw string')
  assert(await toSafeString(Buffer.from('Hello Buffer')) === 'Hello Buffer', 'toSafeString handled Buffer')
  assert(await toSafeString(new TextEncoder().encode('Hello Uint8')) === 'Hello Uint8', 'toSafeString handled Uint8Array')
  assert(await toSafeString(new Blob(['Hello Blob'])) === 'Hello Blob', 'toSafeString handled Blob')
  assert(await toSafeString({ blob: new Blob(['Hello Wrapped Blob']) }) === 'Hello Wrapped Blob', 'toSafeString handled wrapped { blob }')
  assert(await toSafeString({ data: Buffer.from('Hello Wrapped Data') }) === 'Hello Wrapped Data', 'toSafeString handled wrapped { data }')

  // 3B. toSafeArrayBuffer multi-representation & detachment tests
  const testBuf = Buffer.from('Test Buffer Content')
  const safeAbFromBuf = await toSafeArrayBuffer(testBuf, true)
  assert(safeAbFromBuf instanceof ArrayBuffer, 'toSafeArrayBuffer handled Node Buffer')
  const safeAbFromWrapped = await toSafeArrayBuffer({ bytes: new Uint8Array([1, 2, 3, 4]) }, true)
  assert(safeAbFromWrapped.byteLength === 4, 'toSafeArrayBuffer handled wrapped { bytes: Uint8Array }')

  // 3C. toSafeUint8Array multi-representation tests
  const safeU8FromWrapped = await toSafeUint8Array({ data: new Uint8Array([10, 20, 30]) })
  assert(safeU8FromWrapped instanceof Uint8Array && safeU8FromWrapped.length === 3, 'toSafeUint8Array handled wrapped { data }')

  // 3D. Document converters with Buffer / Blob inputs
  const txtRes = await convertTextToPdf(Buffer.from('Header Line\nSecond line with info\nThird line'))
  assert(txtRes.bytes && txtRes.bytes.length > 500, `convertTextToPdf accepted Buffer (${txtRes.bytes.length} bytes)`)

  const mdRes = await convertMarkdownToPdf(Buffer.from('# Document Title\n\nSome paragraph text.\n\n| Item | Qty |\n|---|---|\n| Alpha | 10 |\n| Beta | 20 |'))
  assert(mdRes.bytes && mdRes.bytes.length > 500, `convertMarkdownToPdf accepted Buffer with table (${mdRes.bytes.length} bytes)`)

  const csvRes = await convertCsvToPdf(new Blob(['Name,Department,Salary\nJohn,Engineering,90000\nJane,Design,95000']))
  assert(csvRes.bytes && csvRes.bytes.length > 500, `convertCsvToPdf accepted Blob (${csvRes.bytes.length} bytes)`)

  const jsonRes = await convertJsonToPdf(Buffer.from(JSON.stringify({ project: 'ToolDesk', status: 'hardened', active: true })))
  assert(jsonRes.bytes && jsonRes.bytes.length > 500, `convertJsonToPdf accepted Buffer (${jsonRes.bytes.length} bytes)`)

  const xmlRes = await convertXmlToPdf(Buffer.from('<root><item id="1">First</item><item id="2">Second</item></root>'))
  assert(xmlRes.bytes && xmlRes.bytes.length > 500, `convertXmlToPdf accepted Buffer (${xmlRes.bytes.length} bytes)`)

  // 3E. compressPdf with Uint8Array input
  const compRes = await compressPdf(pdfSampleBytes, { preset: 'lossless' })
  assert(compRes.bytes && compRes.bytes.length > 0, `compressPdf accepted raw Uint8Array (${compRes.bytes.length} bytes)`)

  // 3F. comparePdfs with Uint8Array inputs
  const diffRes = await comparePdfs(pdfSampleBytes, pdfSampleBytes)
  assert(diffRes && diffRes.fileA?.pageCount === 1 && diffRes.fileB?.pageCount === 1, 'comparePdfs accepted raw Uint8Array inputs')

  console.log('\n══════════════════════════════════════════════════════════════')
  console.log(`🎉 REMEDIATION CONTRACT TESTS COMPLETE: ${passed} PASSED, ${failed} FAILED`)
  console.log('══════════════════════════════════════════════════════════════\n')
}

runContractTests().catch(err => {
  console.error('Fatal contract test error:', err)
  process.exit(1)
})
