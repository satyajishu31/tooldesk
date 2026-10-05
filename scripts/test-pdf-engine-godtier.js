import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist';
import {
  comparePdfs,
  generatePdfThumbnails,
  compressPdf,
  mergePdfs,
  splitPdfPages,
  rotatePdfPages,
  cropPdfPages,
  watermarkPdf,
  addPageNumbers,
  addHeaderFooter,
  cleanPdfMetadata,
  updatePdfMetadata,
  createZipFromFiles,
  lockPdf,
  unlockPdf,
  getPdfjsDocumentOptions,
} from '../src/utils/pdfStructuralEngine.js';
import { parseDocx } from '../src/utils/docxParser.js';
import { layoutDocxToPdf } from '../src/utils/docxLayoutEngine.js';
import {
  convertMarkdownToPdf,
  convertTextToPdf,
  convertImagesToPdf,
} from '../src/utils/documentConversionEngine.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    failed++;
    throw new Error(message);
  } else {
    console.log(`✅ PASS: ${message}`);
    passed++;
  }
}

async function createSamplePdf(title = 'Sample Document', pageCount = 2) {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setAuthor('ToolDesk Tester');
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([595.28, 841.89]);
    page.drawText(`Page ${i + 1} content for ${title}`, { x: 50, y: 750, size: 12 });
  }
  const bytes = await doc.save();
  return new File([bytes], `${title.replace(/\s+/g, '_')}.pdf`, { type: 'application/pdf' });
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 TOOLDESK PDF STUDIO — GOD-TIER ENGINE TEST SUITE');
  console.log('======================================================\n');

  // TEST 1: Compare PDFs (P0 Fix)
  console.log('--- 1. Testing Compare PDFs Contract & Integrity ---');
  const fileA = await createSamplePdf('Contract A', 2);
  const fileB = await createSamplePdf('Contract B (Modified)', 3);
  const compareRes = await comparePdfs(fileA, fileB);
  
  assert(compareRes.success === true, 'comparePdfs returned success: true');
  assert(compareRes.fileA && compareRes.fileA.pageCount === 2, 'fileA pageCount is 2');
  assert(compareRes.fileB && compareRes.fileB.pageCount === 3, 'fileB pageCount is 3');
  assert(Array.isArray(compareRes.metaDiffs), 'metaDiffs is an array');
  assert(compareRes.metaDiffs.length > 0, 'metaDiffs detected title difference');
  assert(Array.isArray(compareRes.pageDiffs), 'pageDiffs is an array');
  assert(compareRes.pageDiffs.length === 3, 'pageDiffs has 3 entries for max pages');
  assert(typeof compareRes.identicalPagesCount === 'number', 'identicalPagesCount is number');
  assert(typeof compareRes.modifiedPagesCount === 'number', 'modifiedPagesCount is number');
  assert(typeof compareRes.addedPagesCount === 'number', 'addedPagesCount is number');

  // TEST 2: DOCX Tax Invoice Mandatory Regression (Must be exactly 1 page)
  console.log('\n--- 2. Testing DOCX Tax Invoice Mandatory Regression ---');
  const invoiceBuf = fs.readFileSync('tests/fixtures/Tax_Invoice_36-6.docx');
  const invoiceFile = new File([invoiceBuf], 'Tax_Invoice_36-6.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  const invoiceIR = await parseDocx(invoiceFile);
  const invoiceResult = await layoutDocxToPdf(invoiceIR);
  assert(invoiceResult.pageCount === 1, `Tax Invoice is EXACTLY 1 page (got ${invoiceResult.pageCount})`);
  assert(invoiceResult.bytes.length > 5000, `Tax Invoice bytes valid (${invoiceResult.bytes.length} bytes)`);

  // Verify text content inside Tax Invoice
  const invoicePdf = await pdfjs.getDocument(getPdfjsDocumentOptions(new Uint8Array(invoiceResult.bytes))).promise;
  const p1 = await invoicePdf.getPage(1);
  const tc = await p1.getTextContent();
  const fullText = tc.items.map(it => it.str).join(' ');
  assert(fullText.includes('TAX INVOICE'), 'Generated PDF contains "TAX INVOICE" header');
  assert(fullText.includes('MRTC INDIA'), 'Generated PDF contains recipient "MRTC INDIA"');
  assert(fullText.includes('4,720.00'), 'Generated PDF contains Grand Total "4,720.00"');
  assert(fullText.includes('BANK DETAILS'), 'Generated PDF contains bank details block');

  // TEST 3: DOCX Unicode Multi-Language & Currency (P0 Fix - No WinAnsi error)
  console.log('\n--- 3. Testing DOCX Unicode Multi-Language & Currency ---');
  const unicodeDocIR = {
    pageSize: { width: 595.28, height: 841.89 },
    margins: { left: 40, right: 40, top: 40, bottom: 40 },
    printableWidth: 515.28,
    printableHeight: 761.89,
    elements: [
      {
        type: 'paragraph',
        runs: [
          { text: 'Testing Rupee symbol: ₹ 5,000 and Euro: € 200' },
          { text: ' Cyrillic: Москва, Россия' },
          { text: ' Hindi: टैक्स इनवॉयस' },
          { text: ' Chinese: 发票测试' },
        ],
      },
    ],
  };
  const unicodeRes = await layoutDocxToPdf(unicodeDocIR);
  assert(unicodeRes.pageCount === 1, 'Unicode DOCX typeset successfully without WinAnsi error');
  assert(unicodeRes.bytes.length > 5000, `Unicode PDF bytes valid (${unicodeRes.bytes.length} bytes)`);

  // TEST 4: DOCX vMerge Layout Validation
  console.log('\n--- 4. Testing DOCX vMerge Vertical Cell Merge Layout ---');
  const vMergeDocIR = {
    pageSize: { width: 595.28, height: 841.89 },
    margins: { left: 40, right: 40, top: 40, bottom: 40 },
    printableWidth: 515.28,
    printableHeight: 761.89,
    elements: [
      {
        type: 'table',
        gridColsPt: [100, 200, 215.28],
        rows: [
          {
            actualHeight: 30,
            cells: [
              { colIndex: 0, gridSpan: 1, vMerge: 'restart', padTop: 4, padBottom: 4, padLeft: 4, padRight: 4, paragraphs: [{ runs: [{ text: 'Merged Col 1' }] }] },
              { colIndex: 1, gridSpan: 1, vMerge: null, padTop: 4, padBottom: 4, padLeft: 4, padRight: 4, paragraphs: [{ runs: [{ text: 'Row 1 Col 2' }] }] },
              { colIndex: 2, gridSpan: 1, vMerge: null, padTop: 4, padBottom: 4, padLeft: 4, padRight: 4, paragraphs: [{ runs: [{ text: 'Row 1 Col 3' }] }] },
            ],
          },
          {
            actualHeight: 30,
            cells: [
              { colIndex: 0, gridSpan: 1, vMerge: 'continue', padTop: 4, padBottom: 4, padLeft: 4, padRight: 4, paragraphs: [] },
              { colIndex: 1, gridSpan: 1, vMerge: null, padTop: 4, padBottom: 4, padLeft: 4, padRight: 4, paragraphs: [{ runs: [{ text: 'Row 2 Col 2' }] }] },
              { colIndex: 2, gridSpan: 1, vMerge: null, padTop: 4, padBottom: 4, padLeft: 4, padRight: 4, paragraphs: [{ runs: [{ text: 'Row 2 Col 3' }] }] },
            ],
          },
        ],
      },
    ],
  };
  const vMergeRes = await layoutDocxToPdf(vMergeDocIR);
  assert(vMergeRes.pageCount === 1, 'vMerge table rendered successfully to 1 page');

  // TEST 5: PDF Compression Smart Vector Preservation
  console.log('\n--- 5. Testing PDF Compression Smart Vector Preservation ---');
  const compDoc = await createSamplePdf('Compress Vector Test', 2);
  const compRes = await compressPdf(compDoc, { preset: 'balanced' });
  assert(compRes.bytes && compRes.bytes.length > 0, 'compressPdf returned bytes');
  assert(typeof compRes.savedBytes === 'number', 'savedBytes is a number');
  assert(typeof compRes.reductionNotice === 'string', 'reductionNotice is a string');
  assert(compRes.rasterized === false, 'Vector text PDF was NOT destructively rasterized into JPEG');

  // TEST 6: Markdown to PDF with Tables and Lists
  console.log('\n--- 6. Testing Markdown to PDF with Tables ---');
  const sampleMd = `
# Project Plan
Quarterly projections:

| Milestone | Due Date | Status |
| :--- | :--- | :--- |
| Phase 1 | Jan 15 | Complete |
| Phase 2 | Feb 28 | In Progress |

* Note 1: On budget
* Note 2: Security verified
`;
  const mdRes = await convertMarkdownToPdf(sampleMd);
  assert(mdRes.bytes && mdRes.bytes.length > 1000, 'convertMarkdownToPdf produced valid PDF');

  // TEST 7: Text to PDF
  console.log('\n--- 7. Testing Text to PDF ---');
  const sampleTxt = 'ToolDesk Plain Text Document\nLine 2 with accents: Café, Résumé\nLine 3 with numbers: 12345.';
  const txtRes = await convertTextToPdf(sampleTxt);
  assert(txtRes.bytes && txtRes.bytes.length > 1000, 'convertTextToPdf produced valid PDF');

  // TEST 8: PDF Merge
  console.log('\n--- 8. Testing Merge PDFs ---');
  const doc1 = await createSamplePdf('Part 1', 1);
  const doc2 = await createSamplePdf('Part 2', 2);
  const merged = await mergePdfs([doc1, doc2]);
  assert(merged.bytes && merged.bytes.length > 0, 'mergePdfs returned bytes');
  const mergedPdf = await pdfjs.getDocument(getPdfjsDocumentOptions(new Uint8Array(merged.bytes))).promise;
  assert(mergedPdf.numPages === 3, `Merged PDF has exactly 3 pages (1 + 2 = ${mergedPdf.numPages})`);

  // TEST 9: PDF Split
  console.log('\n--- 9. Testing Split PDF ---');
  const splitSource = await createSamplePdf('To Split', 3);
  const splitFiles = await splitPdfPages(splitSource);
  assert(splitFiles.length === 3, `splitPdfPages created 3 files (got ${splitFiles.length})`);

  // TEST 10: PDF Rotate
  console.log('\n--- 10. Testing Rotate PDF ---');
  const rotateSource = await createSamplePdf('To Rotate', 1);
  const rotated = await rotatePdfPages(rotateSource, 90);
  assert(rotated.bytes && rotated.bytes.length > 0, 'rotatePdfPages returned bytes');
  const rotPdf = await pdfjs.getDocument(getPdfjsDocumentOptions(new Uint8Array(rotated.bytes))).promise;
  const rotP1 = await rotPdf.getPage(1);
  assert(rotP1.rotate === 90, `Page rotation is 90° (got ${rotP1.rotate}°)`);

  // TEST 11: PDF Watermark
  console.log('\n--- 11. Testing Watermark PDF ---');
  const wmSource = await createSamplePdf('To Watermark', 1);
  const wmRes = await watermarkPdf(wmSource, { text: 'CONFIDENTIAL', opacity: 0.3, size: 40 });
  assert(wmRes.bytes && wmRes.bytes.length > 0, 'watermarkPdf returned bytes');

  // TEST 12: Page Numbers
  console.log('\n--- 12. Testing Page Numbers ---');
  const pnSource = await createSamplePdf('To Number', 2);
  const pnRes = await addPageNumbers(pnSource, { position: 'bottom-center', format: 'PAGE_OF_TOTAL' });
  assert(pnRes.bytes && pnRes.bytes.length > 0, 'addPageNumbers returned bytes');

  // TEST 13: Header & Footer
  console.log('\n--- 13. Testing Header & Footer ---');
  const hfSource = await createSamplePdf('To HeaderFooter', 2);
  const hfRes = await addHeaderFooter(hfSource, { headerText: 'Company Confidential', footerText: 'Page {page}' });
  assert(hfRes.bytes && hfRes.bytes.length > 0, 'addHeaderFooter returned bytes');

  // TEST 14: Metadata Clean and Edit
  console.log('\n--- 14. Testing Metadata Clean and Edit ---');
  const metaSource = await createSamplePdf('Meta Source', 1);
  const editedMeta = await updatePdfMetadata(metaSource, { title: 'Updated Title', author: 'New Author' });
  assert(editedMeta.bytes && editedMeta.bytes.length > 0, 'updatePdfMetadata returned bytes');
  const cleanedMeta = await cleanPdfMetadata(metaSource);
  assert(cleanedMeta.bytes && cleanedMeta.bytes.length > 0, 'cleanPdfMetadata returned bytes');

  // TEST 15: Lock and Unlock PDF
  console.log('\n--- 15. Testing Lock and Unlock PDF ---');
  const lockSource = await createSamplePdf('To Lock', 1);
  const lockedRes = await lockPdf(lockSource, 'Secret123', { confirmPassword: 'Secret123' });
  assert(lockedRes.bytes && lockedRes.bytes.length > 0, 'lockPdf successfully locked document');
  const unlockedRes = await unlockPdf(lockedRes.blob, 'Secret123');
  assert(unlockedRes.bytes && unlockedRes.bytes.length > 0, 'unlockPdf successfully authenticated and unlocked document');

  // TEST 16: Create ZIP from Files
  console.log('\n--- 16. Testing ZIP Archive Creation ---');
  const zipRes = await createZipFromFiles([doc1, doc2], 'test-export.zip');
  assert(zipRes.blob && zipRes.size > 0, `createZipFromFiles created valid ZIP (${zipRes.size} bytes)`);

  console.log('\n======================================================');
  console.log(`🎉 ALL ${passed} TESTS PASSED! (${failed} FAILED)`);
  console.log('======================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ TEST RUNNER ABORTED WITH ERROR:', err);
  process.exit(1);
});
