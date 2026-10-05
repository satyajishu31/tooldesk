import { PDFDocument } from 'pdf-lib'
import {
  cropPdfPages,
  watermarkPdf,
  addPageNumbers,
  addHeaderFooter,
  flattenPdf,
  createPdfFormFields,
  signPdf,
  dataUrlToArrayBuffer,
} from '../src/utils/pdfStructuralEngine.js'

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

async function createTestPdf() {
  const doc = await PDFDocument.create()
  const page = doc.addPage([400, 600])
  page.drawText('Test page for micro hardening', { x: 50, y: 550, size: 14 })
  const bytes = await doc.save()
  return new File([bytes], 'micro-test.pdf', { type: 'application/pdf' })
}

async function run() {
  console.log('\n--- 1. Testing cropPdfPages with Degenerate / Negative Bounds ---')
  const pdf1 = await createTestPdf()
  // Passing 0 width and negative crop box
  const cropRes = await cropPdfPages(pdf1, { xPercent: 0.95, yPercent: 0.95, widthPercent: 0.001, heightPercent: -0.5 })
  const cropDoc = await PDFDocument.load(cropRes.bytes)
  const cPage = cropDoc.getPage(0)
  const mBox = cPage.getMediaBox()
  assert(mBox.width >= 10, `MediaBox width is at least 10pt (got ${mBox.width})`)
  assert(mBox.height >= 10, `MediaBox height is at least 10pt (got ${mBox.height})`)
  assert(mBox.x >= 0, `MediaBox x is >= 0 (got ${mBox.x})`)
  assert(mBox.y >= 0, `MediaBox y is >= 0 (got ${mBox.y})`)

  console.log('\n--- 2. Testing createPdfFormFields Name Deduplication ---')
  const pdf2 = await createTestPdf()
  // Add multiple fields with identical duplicate names
  const formRes = await createPdfFormFields(pdf2, [
    { name: 'duplicate_name', type: 'text', defaultValue: 'Field 1', x: 20, y: 400, width: 100, height: 20 },
    { name: 'duplicate_name', type: 'text', defaultValue: 'Field 2', x: 20, y: 350, width: 100, height: 20 },
    { name: 'duplicate_name', type: 'text', defaultValue: 'Field 3', x: 20, y: 300, width: 100, height: 20 },
    { name: 'duplicate_name', type: 'checkbox', defaultValue: true, x: 20, y: 250, width: 20, height: 20 },
  ])
  const formDoc = await PDFDocument.load(formRes.bytes)
  const fields = formDoc.getForm().getFields()
  assert(fields.length === 4, `Form has 4 fields (got ${fields.length})`)
  const fieldNames = fields.map(f => f.getName())
  const uniqueNames = new Set(fieldNames)
  assert(uniqueNames.size === 4, `All 4 form fields have unique deduplicated names: ${fieldNames.join(', ')}`)

  console.log('\n--- 3. Testing flattenPdf fieldCount Contract ---')
  const flatRes = await flattenPdf(new File([formRes.bytes], 'form-to-flat.pdf', { type: 'application/pdf' }))
  assert(flatRes.fieldCount === 4, `flattenPdf accurately returned fieldCount: 4 (got ${flatRes.fieldCount})`)
  const flatDoc = await PDFDocument.load(flatRes.bytes)
  const flatFields = flatDoc.getForm().getFields()
  assert(flatFields.length === 0, `All form fields flattened to zero static fields`)

  console.log('\n--- 4. Testing addPageNumbers startPage Aliasing ---')
  const pdf4 = await createTestPdf()
  const numRes = await addPageNumbers(pdf4, { startPage: 5, format: 'Page X' })
  assert(numRes.bytes && numRes.bytes.length > 0, 'addPageNumbers succeeded with startPage option')

  console.log('\n--- 5. Testing addHeaderFooter Alignment Options ---')
  const pdf5 = await createTestPdf()
  const hfRes = await addHeaderFooter(pdf5, {
    headerText: 'Company Confidential',
    headerAlign: 'center',
    footerText: 'Internal Use Only',
    footerAlign: 'left',
  })
  assert(hfRes.bytes && hfRes.bytes.length > 0, 'addHeaderFooter succeeded with UI alignment parameters')

  console.log('\n--- 6. Testing dataUrlToArrayBuffer without fetch ---')
  const sampleBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
  const dataUrl = `data:image/png;base64,${sampleBase64}`
  const buf = await dataUrlToArrayBuffer(dataUrl)
  assert(buf && buf.byteLength > 0, `dataUrlToArrayBuffer decoded ${buf.byteLength} bytes directly`)

  console.log('\n--- 7. Testing signPdf with Base64 Data URL ---')
  const pdf7 = await createTestPdf()
  const signRes = await signPdf(pdf7, dataUrl, 1, { xPercent: 0.1, yPercent: 0.1, widthPercent: 0.3, heightPercent: 0.1 })
  assert(signRes.bytes && signRes.bytes.length > 0, `signPdf embedded signature successfully (${signRes.size} bytes)`)

  console.log(`\n🎉 Micro Hardening Test Suite: ${passed} PASSED, ${failed} FAILED\n`)
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
