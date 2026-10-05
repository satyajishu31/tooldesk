import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { PDFDocument, rgb } from 'pdf-lib'
import * as pdfjs from 'pdfjs-dist'

import {
  parseDocx,
  layoutDocxToPdf,
  convertDocxToPdf,
  convertImagesToPdf,
  convertTextToPdf,
  convertMarkdownToPdf,
  convertHtmlToPdf,
  convertCsvToPdf,
  convertJsonToPdf,
  convertXmlToPdf,
  mergePdfs,
  splitPdfPages,
  extractPagesToSinglePdf,
  reorderPdfPages,
  deletePdfPages,
  rotatePdfPages,
  cropPdfPages,
  readPdfMetadata,
  updatePdfMetadata,
  cleanPdfMetadata,
  watermarkPdf,
  addPageNumbers,
  addHeaderFooter,
  flattenPdf,
  getPdfFormFields,
  fillPdfForm,
  createPdfFormFields,
  signPdf,
  redactPdfPages,
  compressPdf,
  lockPdf,
  unlockPdf,
  changePdfPassword,
  comparePdfs,
  createZipFromFiles,
  parsePageRangeString,
  formatPageRangeString,
  getPdfjsDocumentOptions,
} from '../src/utils/pdfEngine.js'

console.log('===> Starting ToolDesk Advanced PDF Workstation Forensic Suite...\n')

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
// 1. MANDATORY TAX INVOICE REGRESSION FIXTURE (DOCX → PDF)
// ─────────────────────────────────────────────────────────────
await testAsync('DOCX Engine: Tax_Invoice_36-6.docx converts to EXACTLY 1 page with preserved geometry', async () => {
  const buf = fs.readFileSync('tests/fixtures/Tax_Invoice_36-6.docx')
  const fileObj = {
    name: 'Tax_Invoice_36-6.docx',
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  }

  const result = await convertDocxToPdf(fileObj)
  assert.equal(result.pageCount, 1, `Invoice MUST be exactly 1 page, got ${result.pageCount}`)
  assert(result.bytes.length > 1000, `Output PDF size seems too small: ${result.bytes.length}`)

  // Verify PDF structure with pdfjs
  const doc = await pdfjs.getDocument(getPdfjsDocumentOptions(result.bytes)).promise
  assert.equal(doc.numPages, 1, 'PDF.js must report exactly 1 page')

  const page = await doc.getPage(1)
  const content = await page.getTextContent()
  const textItems = content.items.map(it => it.str)
  const fullText = textItems.join(' ')

  // 1. Title is present
  assert(fullText.includes('TAX INVOICE'), 'Missing TAX INVOICE title')

  // 2. Recipient block (To) & Sender block (From)
  const toItem = content.items.find(it => it.str.includes('To') || it.str.includes('MRTC'))
  const fromItem = content.items.find(it => it.str.includes('From') || it.str.includes('Satya'))
  assert(toItem, 'Missing Recipient (To) block')
  assert(fromItem, 'Missing Sender (From) block')

  // Recipient must be on left (x < 100), Sender must be on right (x > 250)
  assert(toItem.transform[4] < 100, `Recipient block should be left-aligned (x < 100), got ${toItem.transform[4]}`)
  assert(fromItem.transform[4] > 250, `Sender block should be right-aligned (x > 250), got ${fromItem.transform[4]}`)

  // 3. Six-column item table headers
  const headers = ['Sl.No.', 'Description', 'Unit', 'Qty.', 'Rate', 'Amount']
  for (const h of headers) {
    assert(fullText.includes(h), `Missing table header "${h}" in output`)
  }

  // 4. Totals and taxes section
  assert(fullText.includes('Total:'), 'Missing Total row')
  assert(fullText.includes('CGST'), 'Missing CGST row')
  assert(fullText.includes('SGST'), 'Missing SGST row')
  assert(fullText.includes('Grand Total:'), 'Missing Grand Total row')
  assert(fullText.includes('4,720.00'), 'Missing Grand Total amount')

  // 5. Bank details and Signature section (must be present on Page 1)
  assert(fullText.includes('BANK DETAILS'), 'Missing Bank Details section on page 1')
  assert(fullText.includes('BARB0ATHARB'), 'Missing IFSC Code in bank details')
  assert(fullText.includes('Authorized Signatory'), 'Missing Authorized Signatory on page 1')
  assert(fullText.includes('Proprietor'), 'Missing Proprietor in signature area')
})

// ─────────────────────────────────────────────────────────────
// 2. COMPREHENSIVE DOCX FIXTURE TEST SUITE
// ─────────────────────────────────────────────────────────────
const testFixtures = [
  { file: 'tables.docx', minPages: 1, maxPages: 1 },
  { file: 'single-paragraph.docx', minPages: 1, maxPages: 1 },
  { file: 'simple-list.docx', minPages: 1, maxPages: 1 },
  { file: 'tiny-picture.docx', minPages: 1, maxPages: 1 },
  { file: 'underline.docx', minPages: 1, maxPages: 1 },
  { file: 'strikethrough.docx', minPages: 1, maxPages: 1 },
  { file: 'multipage.docx', minPages: 3, maxPages: 6 },
]

for (const fix of testFixtures) {
  await testAsync(`DOCX Engine: Fixture "${fix.file}" converts cleanly within expected page bounds`, async () => {
    const buf = fs.readFileSync(`tests/fixtures/${fix.file}`)
    const fileObj = {
      name: fix.file,
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    }
    const result = await convertDocxToPdf(fileObj)
    assert(result.pageCount >= fix.minPages, `Expected at least ${fix.minPages} pages, got ${result.pageCount}`)
    assert(result.pageCount <= fix.maxPages, `Expected at most ${fix.maxPages} pages, got ${result.pageCount}`)
    assert(result.bytes[0] === 0x25 && result.bytes[1] === 0x50 && result.bytes[2] === 0x44 && result.bytes[3] === 0x46, 'Invalid PDF magic bytes')
  })
}

// ─────────────────────────────────────────────────────────────
// 3. STRUCTURAL PDF ENGINE TESTS
// ─────────────────────────────────────────────────────────────

// Helper to create dummy PDF in memory
async function createSamplePdf(pageCount = 3, label = 'Doc') {
  const doc = await PDFDocument.create()
  for (let i = 1; i <= pageCount; i++) {
    const page = doc.addPage([595.28, 841.89])
    page.drawText(`${label} - Page ${i}`, { x: 50, y: 750, size: 24 })
  }
  const bytes = await doc.save()
  return {
    name: `${label}.pdf`,
    size: bytes.length,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  }
}

await testAsync('Structural Engine: mergePdfs combines multiple documents accurately', async () => {
  const docA = await createSamplePdf(2, 'DocA')
  const docB = await createSamplePdf(3, 'DocB')
  const merged = await mergePdfs([docA, docB])
  assert.equal(merged.pageCount, 5, `Merged PDF should have 5 pages, got ${merged.pageCount}`)
  assert(merged.bytes.length > 0, 'Merged PDF empty')
})

await testAsync('Structural Engine: splitPdfPages splits document into separate individual pages', async () => {
  const doc = await createSamplePdf(3, 'ToSplit')
  const pages = await splitPdfPages(doc)
  assert.equal(pages.length, 3, `Expected 3 split pages, got ${pages.length}`)
  assert.equal(pages[0].name, 'page-1.pdf')
  assert.equal(pages[1].name, 'page-2.pdf')
  assert.equal(pages[2].name, 'page-3.pdf')
})

await testAsync('Structural Engine: extractPagesToSinglePdf extracts specific selected pages', async () => {
  const doc = await createSamplePdf(5, 'ToExtract')
  const extracted = await extractPagesToSinglePdf(doc, [1, 3, 5])
  assert.equal(extracted.pageCount, 3, `Extracted PDF should have 3 pages, got ${extracted.pageCount}`)
})

await testAsync('Structural Engine: reorderPdfPages rearranges page sequence', async () => {
  const doc = await createSamplePdf(3, 'ToReorder')
  const reordered = await reorderPdfPages(doc, [3, 1, 2])
  assert.equal(reordered.pageCount, 3, 'Reordered PDF page count mismatch')
})

await testAsync('Structural Engine: deletePdfPages removes selected pages', async () => {
  const doc = await createSamplePdf(4, 'ToDelete')
  const pruned = await deletePdfPages(doc, [2, 4])
  assert.equal(pruned.pageCount, 2, `Pruned PDF should have 2 pages, got ${pruned.pageCount}`)
  assert.equal(pruned.deletedCount, 2)
})

await testAsync('Structural Engine: rotatePdfPages rotates pages correctly', async () => {
  const doc = await createSamplePdf(2, 'ToRotate')
  const rotated = await rotatePdfPages(doc, 90, [1])
  assert.equal(rotated.pageCount, 2)
  assert.equal(rotated.rotatedCount, 1)
})

await testAsync('Structural Engine: cropPdfPages modifies crop and media boxes', async () => {
  const doc = await createSamplePdf(2, 'ToCrop')
  const cropped = await cropPdfPages(doc, { xPercent: 0.1, yPercent: 0.1, widthPercent: 0.8, heightPercent: 0.8 })
  assert.equal(cropped.pageCount, 2)
  assert(cropped.notice.includes('Visual crop adjusted viewport'))
})

await testAsync('Structural Engine: metadata read, update, and clean', async () => {
  const doc = await createSamplePdf(1, 'MetaDoc')
  const updated = await updatePdfMetadata(doc, {
    title: 'Forensic PDF Workstation',
    author: 'ToolDesk AI Team',
    keywords: ['pdf', 'workstation', 'forensics'],
  })

  const readBack = await readPdfMetadata({
    name: 'meta-check.pdf',
    arrayBuffer: async () => updated.bytes.buffer.slice(updated.bytes.byteOffset, updated.bytes.byteOffset + updated.bytes.byteLength),
  })
  assert.equal(readBack.title, 'Forensic PDF Workstation')
  assert.equal(readBack.author, 'ToolDesk AI Team')

  const cleaned = await cleanPdfMetadata({
    name: 'meta-check.pdf',
    arrayBuffer: async () => updated.bytes.buffer.slice(updated.bytes.byteOffset, updated.bytes.byteOffset + updated.bytes.byteLength),
  })
  const cleanRead = await readPdfMetadata({
    name: 'clean-check.pdf',
    arrayBuffer: async () => cleaned.bytes.buffer.slice(cleaned.bytes.byteOffset, cleaned.bytes.byteOffset + cleaned.bytes.byteLength),
  })
  assert.equal(cleanRead.title, '')
  assert.equal(cleanRead.author, '')
})

await testAsync('Structural Engine: watermarkPdf adds text watermark overlay', async () => {
  const doc = await createSamplePdf(2, 'WatermarkDoc')
  const watermarked = await watermarkPdf(doc, {
    type: 'text',
    text: 'CONFIDENTIAL TEST',
    opacity: 0.3,
    rotation: -45,
  })
  assert.equal(watermarked.pageCount, 2)
  assert(watermarked.bytes.length > 0)
})

await testAsync('Structural Engine: addPageNumbers stamps page numbers', async () => {
  const doc = await createSamplePdf(3, 'NumberDoc')
  const numbered = await addPageNumbers(doc, { format: 'Page X of Y', position: 'bottom-center' })
  assert.equal(numbered.pageCount, 3)
})

await testAsync('Structural Engine: addHeaderFooter stamps headers and footers', async () => {
  const doc = await createSamplePdf(2, 'HeaderDoc')
  const stamped = await addHeaderFooter(doc, {
    headerLeft: 'ToolDesk Studio',
    footerRight: 'Page {page} of {total}',
  })
  assert.equal(stamped.pageCount, 2)
})

await testAsync('Structural Engine: createPdfFormFields and fillPdfForm', async () => {
  const doc = await createSamplePdf(1, 'FormDoc')
  const withFields = await createPdfFormFields(doc, [
    { name: 'fullName', type: 'text', x: 50, y: 700, width: 200, height: 25 },
    { name: 'agreeTerms', type: 'checkbox', x: 50, y: 650, width: 20, height: 20 },
  ])
  assert.equal(withFields.fieldsAdded, 2)

  const filled = await fillPdfForm({
    name: 'form-to-fill.pdf',
    arrayBuffer: async () => withFields.bytes.buffer.slice(withFields.bytes.byteOffset, withFields.bytes.byteOffset + withFields.bytes.byteLength),
  }, {
    fullName: 'Satya Rana',
    agreeTerms: true,
  })
  assert.equal(filled.updatedCount, 2)

  const flattened = await flattenPdf({
    name: 'form-to-flatten.pdf',
    arrayBuffer: async () => filled.bytes.buffer.slice(filled.bytes.byteOffset, filled.bytes.byteOffset + filled.bytes.byteLength),
  })
  assert.equal(flattened.pageCount, 1)
})

await testAsync('Structural Engine: signPdf places visual signature', async () => {
  const doc = await createSamplePdf(1, 'SignDoc')
  // Minimal valid 1x1 PNG data URL
  const fakePng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  const signed = await signPdf(doc, fakePng, 1, { xPercent: 0.5, yPercent: 0.8, widthPercent: 0.2, heightPercent: 0.1 })
  assert.equal(signed.pageCount, 1)
  assert(signed.notice.includes('visual stamp'))
})

await testAsync('Structural Engine: compressPdf lossless compression works and compares size', async () => {
  const doc = await createSamplePdf(3, 'CompressDoc')
  const compressed = await compressPdf(doc, { preset: 'lossless' })
  assert(compressed.size > 0)
  assert(typeof compressed.savedPct === 'number')
})

await testAsync('Structural Engine: genuine AES-256 lockPdf and unlockPdf cycle', async () => {
  const doc = await createSamplePdf(2, 'SecretDoc')
  const locked = await lockPdf(doc, 'SuperSecurePassword!2026', { algorithm: 'AES-256' })
  assert.equal(locked.algorithm, 'AES-256')
  assert.equal(locked.pageCount, 2)

  // Verify opening without password fails
  let failedWithoutPassword = false
  try {
    await safeLoadPdfDocument(locked.bytes, 'locked.pdf')
  } catch (err) {
    failedWithoutPassword = true
  }
  assert(failedWithoutPassword, 'Encrypted document must not open without authentication')

  // Verify unlocking with correct password succeeds
  const unlocked = await unlockPdf(locked.bytes, 'SuperSecurePassword!2026')
  assert.equal(unlocked.pageCount, 2)
  assert.equal(unlocked.mode, 'lossless-vector')

  // Verify wrong password fails
  let wrongPassFailed = false
  try {
    await unlockPdf(locked.bytes, 'TotallyWrongPassword!')
  } catch (err) {
    wrongPassFailed = true
  }
  assert(wrongPassFailed, 'Wrong password must fail authentication')

  // Verify password rotation
  const reLocked = await changePdfPassword(locked.bytes, 'SuperSecurePassword!2026', 'NewPass2026!')
  assert(reLocked.bytes.length > 0)
  const reUnlocked = await unlockPdf(reLocked.bytes, 'NewPass2026!')
  assert.equal(reUnlocked.pageCount, 2)
})

await testAsync('Structural Engine: comparePdfs inspects two documents', async () => {
  const docA = await createSamplePdf(2, 'DocA')
  const docB = await createSamplePdf(3, 'DocB')
  const diff = await comparePdfs(docA, docB)
  assert.equal(diff.samePageCount, false)
  assert.equal(diff.pageDifference, 1)
})

// ─────────────────────────────────────────────────────────────
// 4. DOCUMENT CONVERSION ENGINE TESTS
// ─────────────────────────────────────────────────────────────

await testAsync('Conversion Engine: convertMarkdownToPdf formats headings, lists, tables, and code', async () => {
  const md = `# Project Specification
## Architectural Features
- High-Fidelity DOCX Parser
- Two-Tier Engine Architecture
- Genuine Standards Encryption

> Privacy is our paramount objective.

\`\`\`javascript
const pdf = await convertDocxToPdf(file);
console.log(pdf.pageCount);
\`\`\`
`
  const res = await convertMarkdownToPdf(md, { title: 'Spec' })
  assert(res.bytes.length > 1000)
  const doc = await PDFDocument.load(res.bytes)
  assert(doc.getPageCount() >= 1)
})

await testAsync('Conversion Engine: convertHtmlToPdf converts HTML tags and tables', async () => {
  const html = `
    <h1>Monthly Summary</h1>
    <p>All tool operations performed smoothly.</p>
    <table>
      <tr><th>Metric</th><th>Score</th></tr>
      <tr><td>Visual Fidelity</td><td>100%</td></tr>
      <tr><td>Execution Speed</td><td>Fast</td></tr>
    </table>
  `
  const res = await convertHtmlToPdf(html, { title: 'Report' })
  assert(res.bytes.length > 1000)
  const doc = await PDFDocument.load(res.bytes)
  assert.equal(doc.getPageCount(), 1)
})

await testAsync('Conversion Engine: convertTextToPdf converts text with line wrapping', async () => {
  const txt = 'ToolDesk PDF Studio plain text converter.\nTesting multi-line paragraph pagination.\nLine 3.'
  const res = await convertTextToPdf(txt, { title: 'Notes' })
  assert(res.bytes.length > 500)
})

await testAsync('Conversion Engine: convertCsvToPdf formats tabular data', async () => {
  const csv = 'ID,Name,Role,Status\n1,Satya,Architect,Active\n2,Sweta,Engineer,Active\n3,Alex,Reviewer,Active'
  const res = await convertCsvToPdf(csv, { title: 'Team Roster' })
  assert(res.bytes.length > 1000)
})

await testAsync('Conversion Engine: convertJsonToPdf formats JSON code structure', async () => {
  const json = JSON.stringify({ app: 'ToolDesk', version: '1.3.0', status: 'verified' }, null, 2)
  const res = await convertJsonToPdf(json, { title: 'Config' })
  assert(res.bytes.length > 1000)
})

await testAsync('Conversion Engine: convertXmlToPdf formats XML document', async () => {
  const xml = '<tooldesk><version>1.3.0</version><engine>modular</engine></tooldesk>'
  const res = await convertXmlToPdf(xml, { title: 'Manifest' })
  assert(res.bytes.length > 1000)
})

// ─────────────────────────────────────────────────────────────
// 5. BOUNDARY, SAFETY & SANITIZATION TESTS
// ─────────────────────────────────────────────────────────────

test('Safety: parsePageRangeString rejects DoS range widths and malformed strings', () => {
  assert.deepEqual(parsePageRangeString('1-2000000000', 50), [], 'Huge span must be rejected')
  assert.deepEqual(parsePageRangeString('1-5', 3), [1, 2, 3], 'Must clamp to maxPages')
  assert.deepEqual(parsePageRangeString('3, 1, 2', 10), [1, 2, 3], 'Must sort and deduplicate')
  assert.deepEqual(parsePageRangeString('abc, -5', 10), [], 'Invalid entries ignored')
  assert.equal(formatPageRangeString([1, 2, 3, 5, 8, 9, 10]), '1-3, 5, 8-10')
})

console.log(`\n===> PDF Studio Workstation Forensic Suite Finished: ${passed} passed, ${failed} failed.\n`)

if (failed > 0) {
  process.exit(1)
}
