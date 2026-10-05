/* ══════════════════════════════════════════════════════════
   TOOLDESK PDF STUDIO ENGINE — Universal Master Architecture
   v1.3.x Modular Separation:
   - Structural PDF Engine: pdfStructuralEngine.js
   - Document Rendering & Conversion Engine: documentConversionEngine.js
   - High-Fidelity DOCX Parser: docxParser.js
   - High-Fidelity DOCX Layout Engine: docxLayoutEngine.js
   ══════════════════════════════════════════════════════════ */

// 1. Structural PDF Engine (organization, security, metadata, transforms)
export {
  PAGE_SIZES,
  formatBytes,
  getPdfJs,
  getPdfjsDocumentOptions,
  toSafeArrayBuffer,
  safeLoadPdfDocument,
  parsePageRangeString,
  formatPageRangeString,
  sanitizeWinAnsi,
  renderPdfPagesToImages,
  generatePdfThumbnails,
  mergePdfs,
  splitPdfPages,
  extractPagesToSinglePdf,
  extractPagesToSinglePdf as extractPdfPages,
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
  toSafeUint8Array,
  sanitizeZipFilename,
} from './pdfStructuralEngine.js'

// 2. Document Rendering / Conversion Engine (DOCX, HTML, Markdown, CSV, JSON, XML, TXT, Images)
export {
  convertDocxToPdf,
  convertImagesToPdf,
  convertTextToPdf,
  convertMarkdownToPdf,
  convertHtmlToPdf,
  convertCsvToPdf,
  convertJsonToPdf,
  convertXmlToPdf,
} from './documentConversionEngine.js'

// 3. High-Precision OOXML DOCX Parser & Layout Engine
export { parseDocx } from './docxParser.js'
export { layoutDocxToPdf } from './docxLayoutEngine.js'
