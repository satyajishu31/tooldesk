import { PDFDocument, StandardFonts, rgb, degrees, PDFName } from 'pdf-lib'
import JSZip from 'jszip'

/* ══════════════════════════════════════════════════════════
   TOOLDESK STRUCTURAL PDF ENGINE — High-Performance Processor
   ══════════════════════════════════════════════════════════ */

// Standard Page Dimensions in points (72 points = 1 inch)
export const PAGE_SIZES = {
  A4: { width: 595.28, height: 841.89 },
  LETTER: { width: 612.0, height: 792.0 },
  LEGAL: { width: 612.0, height: 1008.0 },
}

/**
 * Format bytes into human-readable string
 */
export function formatBytes(bytes) {
  if (!bytes || isNaN(bytes)) return '0 B'
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + ' MB'
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return bytes + ' B'
}

// Polyfill Promise.withResolvers for broader compatibility (Safari < 17.4, older Android WebViews)
if (typeof Promise.withResolvers === 'undefined') {
  Promise.withResolvers = function () {
    let resolve, reject
    const promise = new Promise((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }
}

/**
 * Dynamically load PDF.js library with web worker
 */
let _pdfjsPromise = null
export async function getPdfJs() {
  if (typeof window === 'undefined') throw new Error('PDF.js requires browser environment.')
  if (window.pdfjsLib) {
    if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
    }
    return window.pdfjsLib
  }

  if (!_pdfjsPromise) {
    _pdfjsPromise = (async () => {
      try {
        const pdfjs = await import('pdfjs-dist')
        const lib = pdfjs.default || pdfjs
        lib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
        window.pdfjsLib = lib
        return lib
      } catch (e) {
        console.error('[pdfEngine] Local pdfjs-dist import error:', e)
        throw new Error('Local PDF.js processing engine could not be loaded.')
      }
    })()
  }
  return _pdfjsPromise
}

/**
 * Safely convert File, Blob, Buffer, Uint8Array or ArrayBuffer into an ArrayBuffer
 */
export async function toSafeArrayBuffer(input) {
  if (!input) throw new Error('No PDF input provided.')
  if (input instanceof ArrayBuffer) return input
  if (ArrayBuffer.isView(input)) {
    return input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength)
  }
  if (typeof input.arrayBuffer === 'function') {
    return await input.arrayBuffer()
  }
  throw new Error('Unsupported binary data type.')
}

/**
 * Safely load a PDFDocument from ArrayBuffer, File, Blob, or TypedArray
 */
export async function safeLoadPdfDocument(input, filename = 'document.pdf') {
  try {
    const arrayBuffer = await toSafeArrayBuffer(input)
    return await PDFDocument.load(arrayBuffer, { ignoreEncryption: false })
  } catch (err) {
    const msg = err?.message || ''
    if (/encrypt|password/i.test(msg)) {
      throw new Error(`Cannot open "${filename}": the PDF is encrypted with a password.`)
    }
    throw new Error(`Failed to read "${filename}": ${msg || 'Corrupted or invalid PDF structure.'}`)
  }
}

const SAFE_MAX_PAGES_LIMIT = 2000
const MAX_RANGE_SPAN = 1000
const MAX_SEGMENTS = 100

/**
 * Parse page range string (e.g. "1-3, 5, 8-10") into unique, sorted array of 1-based page numbers.
 * Hardened against unbounded loops, huge allocations, and DoS inputs like "1-2000000000".
 */
export function parsePageRangeString(str, maxPages) {
  if (!str || typeof str !== 'string' || !str.trim()) return []

  const effectiveMax = (typeof maxPages === 'number' && Number.isFinite(maxPages) && maxPages > 0)
    ? Math.min(Math.floor(maxPages), SAFE_MAX_PAGES_LIMIT)
    : SAFE_MAX_PAGES_LIMIT

  const pages = new Set()
  const parts = str.split(',')
  if (parts.length > MAX_SEGMENTS) return []

  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue
    if (trimmed.includes('-')) {
      const [startStr, endStr] = trimmed.split('-')
      const start = parseInt(startStr, 10)
      const end = parseInt(endStr, 10)
      if (!isNaN(start) && !isNaN(end)) {
        if (start < 1 && end < 1) continue
        if (start > 100000 || end > 100000) continue

        const rawMin = Math.min(start, end)
        const rawMax = Math.max(start, end)
        if (rawMin > effectiveMax) continue

        if ((rawMax - rawMin) > MAX_RANGE_SPAN) continue

        const from = Math.max(1, rawMin)
        const to = Math.min(effectiveMax, rawMax)
        for (let p = from; p <= to; p++) {
          pages.add(p)
          if (pages.size >= SAFE_MAX_PAGES_LIMIT) break
        }
      }
    } else {
      const p = parseInt(trimmed, 10)
      if (!isNaN(p) && p >= 1 && p <= effectiveMax) {
        pages.add(p)
      }
    }
    if (pages.size >= SAFE_MAX_PAGES_LIMIT) break
  }
  return Array.from(pages).sort((a, b) => a - b)
}

/**
 * Format an array of 1-based page numbers into a concise human-readable range string
 */
export function formatPageRangeString(pageNumbers) {
  if (!pageNumbers || !pageNumbers.length) return ''
  const sorted = Array.from(new Set(pageNumbers.map(n => parseInt(n, 10)).filter(n => !isNaN(n) && n > 0))).sort((a, b) => a - b)
  if (!sorted.length) return ''

  const ranges = []
  let start = sorted[0]
  let prev = sorted[0]

  for (let i = 1; i < sorted.length; i++) {
    const curr = sorted[i]
    if (curr === prev + 1) {
      prev = curr
    } else {
      ranges.push(start === prev ? `${start}` : `${start}-${prev}`)
      start = curr
      prev = curr
    }
  }
  ranges.push(start === prev ? `${start}` : `${start}-${prev}`)
  return ranges.join(', ')
}

/**
 * Sanitize text to fit WinAnsi standard font encoding in PDF-lib
 */
export function sanitizeWinAnsi(str) {
  if (!str || typeof str !== 'string') return ''
  return str
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\x00-\x09\x0B\x0C\x0E-\x1F]/g, ' ')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014\u2015]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u2022\u25E6\u2023]/g, '*')
    .replace(/[\u00AB\u00BB]/g, '"')
    .replace(/[\u20AC]/g, 'EUR')
    .replace(/[\u2264]/g, '<=')
    .replace(/[\u2265]/g, '>=')
    .replace(/[\u2260]/g, '!=')
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, ' ')
}

/* ══════════════════════════════════════════════════════════
   PDF RENDERING & THUMBNAIL EXTRACTION
   ══════════════════════════════════════════════════════════ */

export async function renderPdfPagesToImages(file, format = 'image/png', dpi = 150, onProgress) {
  const pdfjs = await getPdfJs()
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: arrayBuffer, isEvalSupported: false, enableScripting: false }).promise
  const numPages = pdf.numPages
  const images = []
  const scale = dpi / 72

  for (let i = 1; i <= numPages; i++) {
    if (onProgress) onProgress(`Rendering page ${i} of ${numPages} (${dpi} DPI)...`)
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    const ctx = canvas.getContext('2d')

    await page.render({ canvasContext: ctx, viewport }).promise

    const blob = await new Promise(res => canvas.toBlob(res, format, 0.92))
    const ext = format === 'image/jpeg' ? 'jpg' : 'png'
    const imgName = `${file.name.replace(/\.pdf$/i, '')}_page_${i}.${ext}`

    images.push({
      pageNumber: i,
      name: imgName,
      blob,
      size: blob.size,
      width: canvas.width,
      height: canvas.height,
    })

    canvas.width = 0
    canvas.height = 0
    if (typeof page.cleanup === 'function') page.cleanup()

    if (i % 2 === 0) await new Promise(r => setTimeout(r, 0))
  }

  return Object.assign(images, {
    images,
    totalPages: numPages,
  })
}

export async function generatePdfThumbnails(file, maxPages = 60, onProgress) {
  const pdfjs = await getPdfJs()
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: arrayBuffer, isEvalSupported: false, enableScripting: false }).promise
  const totalPages = pdf.numPages
  const pagesToRender = Math.min(totalPages, maxPages)
  const thumbnails = []

  for (let i = 1; i <= pagesToRender; i++) {
    if (onProgress) onProgress(`Generating thumbnail ${i} of ${pagesToRender}...`)
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 0.35 })

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    const ctx = canvas.getContext('2d')

    await page.render({ canvasContext: ctx, viewport }).promise
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8)

    thumbnails.push({
      pageNumber: i,
      dataUrl,
      width: canvas.width,
      height: canvas.height,
      rotation: page.rotate || 0,
    })

    canvas.width = 0
    canvas.height = 0
    if (typeof page.cleanup === 'function') page.cleanup()

    if (i % 5 === 0) await new Promise(r => setTimeout(r, 0))
  }

  return {
    totalPages,
    renderedPages: pagesToRender,
    thumbnails,
  }
}

/* ══════════════════════════════════════════════════════════
   PDF STRUCTURAL OPERATIONS
   ══════════════════════════════════════════════════════════ */

export async function mergePdfs(files, onProgress) {
  if (!files || files.length < 2) throw new Error('At least 2 PDF files are required to merge.')

  const mergedDoc = await PDFDocument.create()
  mergedDoc.setCreator('ToolDesk PDF Studio')

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    if (onProgress) onProgress(`Merging "${file.name}" (${i + 1} of ${files.length})...`)

    const buf = await file.arrayBuffer()
    const srcDoc = await safeLoadPdfDocument(buf, file.name)
    const indices = srcDoc.getPageIndices()
    const copiedPages = await mergedDoc.copyPages(srcDoc, indices)
    copiedPages.forEach(p => mergedDoc.addPage(p))
  }

  if (onProgress) onProgress('Compiling merged PDF...')
  const pdfBytes = await mergedDoc.save({ useObjectStreams: true })

  return {
    bytes: pdfBytes,
    blob: new Blob([pdfBytes], { type: 'application/pdf' }),
    name: 'merged-document.pdf',
    size: pdfBytes.length,
    pageCount: mergedDoc.getPageCount(),
  }
}

export async function splitPdfPages(file, pageIndices = null, onProgress) {
  const buf = await file.arrayBuffer()
  const srcDoc = await safeLoadPdfDocument(buf, file.name)
  const totalPages = srcDoc.getPageCount()

  const targetIndices = pageIndices && pageIndices.length
    ? pageIndices.filter(i => i >= 0 && i < totalPages)
    : Array.from({ length: totalPages }, (_, i) => i)

  if (!targetIndices.length) throw new Error('No valid pages specified for extraction.')

  const results = []
  for (let i = 0; i < targetIndices.length; i++) {
    const pageIdx = targetIndices[i]
    if (onProgress) onProgress(`Extracting page ${pageIdx + 1} (${i + 1} of ${targetIndices.length})...`)

    const singleDoc = await PDFDocument.create()
    const [copiedPage] = await singleDoc.copyPages(srcDoc, [pageIdx])
    singleDoc.addPage(copiedPage)

    const bytes = await singleDoc.save()
    results.push({
      pageNumber: pageIdx + 1,
      name: `page-${pageIdx + 1}.pdf`,
      blob: new Blob([bytes], { type: 'application/pdf' }),
      size: bytes.length,
    })

    if (i % 5 === 0) await new Promise(r => setTimeout(r, 0))
  }

  return results
}

export async function extractPagesToSinglePdf(file, selectedPages, onProgress) {
  if (!selectedPages || !selectedPages.length) throw new Error('Please select at least one page to extract.')

  const buf = await file.arrayBuffer()
  const srcDoc = await safeLoadPdfDocument(buf, file.name)
  const totalPages = srcDoc.getPageCount()

  const valid0Indices = selectedPages
    .map(p => p - 1)
    .filter(p => p >= 0 && p < totalPages)

  if (!valid0Indices.length) throw new Error('No valid pages selected for extraction.')

  if (onProgress) onProgress(`Extracting ${valid0Indices.length} pages into new document...`)
  const newDoc = await PDFDocument.create()
  const copiedPages = await newDoc.copyPages(srcDoc, valid0Indices)
  copiedPages.forEach(p => newDoc.addPage(p))

  const bytes = await newDoc.save()
  const rangeStr = formatPageRangeString(selectedPages)
  const baseName = file.name.replace(/\.pdf$/i, '')

  return {
    bytes,
    blob: new Blob([bytes], { type: 'application/pdf' }),
    name: `${baseName}_extracted_p${rangeStr.replace(/,\s*/g, '_')}.pdf`,
    size: bytes.length,
    pageCount: newDoc.getPageCount(),
  }
}

export async function reorderPdfPages(file, newPageOrder, onProgress) {
  if (!newPageOrder || !newPageOrder.length) throw new Error('Invalid page order provided.')

  const buf = await file.arrayBuffer()
  const srcDoc = await safeLoadPdfDocument(buf, file.name)
  const totalPages = srcDoc.getPageCount()

  const zeroIndices = newPageOrder
    .map(p => p - 1)
    .filter(p => p >= 0 && p < totalPages)

  if (zeroIndices.length !== totalPages) {
    throw new Error(`Reorder list must contain all ${totalPages} pages. Received ${zeroIndices.length}.`)
  }

  if (onProgress) onProgress('Reordering pages according to layout sequence...')
  const newDoc = await PDFDocument.create()
  const copiedPages = await newDoc.copyPages(srcDoc, zeroIndices)
  copiedPages.forEach(p => newDoc.addPage(p))

  const bytes = await newDoc.save()
  return {
    bytes,
    blob: new Blob([bytes], { type: 'application/pdf' }),
    name: `reordered-${file.name}`,
    size: bytes.length,
    pageCount: totalPages,
  }
}

export async function deletePdfPages(file, pagesToDelete, onProgress) {
  if (!pagesToDelete || !pagesToDelete.length) throw new Error('No pages selected to delete.')

  const buf = await file.arrayBuffer()
  const srcDoc = await safeLoadPdfDocument(buf, file.name)
  const totalPages = srcDoc.getPageCount()

  const deleteSet = new Set(pagesToDelete.map(p => p - 1))
  const keepIndices = []
  for (let i = 0; i < totalPages; i++) {
    if (!deleteSet.has(i)) keepIndices.push(i)
  }

  if (keepIndices.length === 0) {
    throw new Error('Cannot delete all pages from a document. At least 1 page must remain.')
  }

  if (onProgress) onProgress(`Preserving ${keepIndices.length} pages, removing ${deleteSet.size}...`)
  const newDoc = await PDFDocument.create()
  const copiedPages = await newDoc.copyPages(srcDoc, keepIndices)
  copiedPages.forEach(p => newDoc.addPage(p))

  const bytes = await newDoc.save()
  return {
    bytes,
    blob: new Blob([bytes], { type: 'application/pdf' }),
    name: `pruned-${file.name}`,
    size: bytes.length,
    pageCount: newDoc.getPageCount(),
    deletedCount: deleteSet.size,
  }
}

export async function rotatePdfPages(file, arg2 = 90, arg3 = null, onProgress = null) {
  let angleDegrees, targetPages
  if (Array.isArray(arg2)) {
    targetPages = arg2
    angleDegrees = typeof arg3 === 'number' ? arg3 : 90
  } else {
    angleDegrees = typeof arg2 === 'number' ? arg2 : 90
    targetPages = arg3
  }

  const buf = await file.arrayBuffer()
  const doc = await safeLoadPdfDocument(buf, file.name)
  const totalPages = doc.getPageCount()

  const pagesToRotate = targetPages && targetPages.length
    ? targetPages.map(p => p - 1).filter(p => p >= 0 && p < totalPages)
    : Array.from({ length: totalPages }, (_, i) => i)

  for (let i = 0; i < pagesToRotate.length; i++) {
    const pageIndex = pagesToRotate[i]
    if (onProgress) onProgress(`Rotating page ${pageIndex + 1} of ${totalPages}...`)
    const page = doc.getPage(pageIndex)
    const currentRot = page.getRotation().angle
    const newRot = (currentRot + angleDegrees + 360) % 360
    page.setRotation(degrees(newRot))
  }

  const bytes = await doc.save()
  return {
    bytes,
    blob: new Blob([bytes], { type: 'application/pdf' }),
    name: `rotated-${file.name}`,
    size: bytes.length,
    pageCount: totalPages,
    rotatedCount: pagesToRotate.length,
  }
}

export async function cropPdfPages(file, arg2, arg3 = null, onProgress = null) {
  let cropBox, targetPages
  if (Array.isArray(arg2)) {
    targetPages = arg2
    cropBox = arg3 || {}
  } else {
    cropBox = arg2 || {}
    targetPages = arg3
  }
  if (onProgress) onProgress('Loading PDF for page cropping...')
  const fileName = file?.name || 'document.pdf'
  const doc = await safeLoadPdfDocument(file, fileName)
  const totalPages = doc.getPageCount()
  const pagesToProcess = targetPages && targetPages.length
    ? targetPages.map(p => p - 1).filter(p => p >= 0 && p < totalPages)
    : Array.from({ length: totalPages }, (_, i) => i)

  for (let i = 0; i < pagesToProcess.length; i++) {
    const pageIndex = pagesToProcess[i]
    if (onProgress) onProgress(`Adjusting boundary on page ${pageIndex + 1} of ${totalPages}...`)
    const page = doc.getPage(pageIndex)
    const { width: pWidth, height: pHeight } = page.getSize()

    let x, y, width, height
    if (cropBox.xPercent !== undefined || cropBox.yPercent !== undefined) {
      x = Math.max(0, (cropBox.xPercent || 0) * pWidth)
      width = Math.min(pWidth - x, (cropBox.widthPercent || 1) * pWidth)
      height = Math.min(pHeight, (cropBox.heightPercent || 1) * pHeight)
      y = Math.max(0, pHeight - ((cropBox.yPercent || 0) + (cropBox.heightPercent || 1)) * pHeight)
    } else {
      x = Math.max(0, cropBox.x || 0)
      y = Math.max(0, cropBox.y || 0)
      width = Math.min(pWidth - x, cropBox.width || pWidth)
      height = Math.min(pHeight - y, cropBox.height || pHeight)
    }

    page.setCropBox(x, y, width, height)
    page.setMediaBox(x, y, width, height)
  }

  const bytes = await doc.save()
  return {
    bytes,
    blob: new Blob([bytes], { type: 'application/pdf' }),
    name: `cropped-${fileName}`,
    size: bytes.length,
    pageCount: totalPages,
    notice: 'Visual crop adjusted viewport. Underlying vectors outside crop boundaries are retained; use Permanent Redaction to securely destroy sensitive data.',
  }
}

export async function readPdfMetadata(file) {
  const buf = await file.arrayBuffer()
  const doc = await safeLoadPdfDocument(buf, file.name)
  return {
    title: doc.getTitle() || '',
    author: doc.getAuthor() || '',
    subject: doc.getSubject() || '',
    keywords: doc.getKeywords() || '',
    creator: doc.getCreator() || '',
    producer: doc.getProducer() || '',
    creationDate: doc.getCreationDate() ? doc.getCreationDate().toISOString() : '',
    modificationDate: doc.getModificationDate() ? doc.getModificationDate().toISOString() : '',
    pageCount: doc.getPageCount(),
    fileSize: file.size || buf.byteLength,
  }
}

export async function updatePdfMetadata(file, metadata, onProgress) {
  if (onProgress) onProgress('Updating document properties...')
  const buf = await file.arrayBuffer()
  const doc = await safeLoadPdfDocument(buf, file.name)

  if (metadata.title !== undefined) doc.setTitle(metadata.title)
  if (metadata.author !== undefined) doc.setAuthor(metadata.author)
  if (metadata.subject !== undefined) doc.setSubject(metadata.subject)
  if (metadata.keywords !== undefined) doc.setKeywords(Array.isArray(metadata.keywords) ? metadata.keywords : [metadata.keywords])
  if (metadata.creator !== undefined) doc.setCreator(metadata.creator)
  if (metadata.producer !== undefined) doc.setProducer(metadata.producer)
  doc.setModificationDate(new Date())

  const bytes = await doc.save()
  return {
    bytes,
    blob: new Blob([bytes], { type: 'application/pdf' }),
    name: `metadata-${file.name}`,
    size: bytes.length,
  }
}

export async function cleanPdfMetadata(file, onProgress = null) {
  if (onProgress) onProgress('Scrubbing tracking metadata and XMP streams...')
  const fileName = file?.name || 'document.pdf'
  const doc = await safeLoadPdfDocument(file, fileName)

  doc.setTitle('')
  doc.setAuthor('')
  doc.setSubject('')
  doc.setKeywords([])
  doc.setCreator('')
  doc.setProducer('')
  doc.setCreationDate(new Date(0))
  doc.setModificationDate(new Date(0))

  // Strip catalog metadata reference if present
  try {
    const catalog = doc.catalog
    if (catalog.has(PDFName.of('Metadata'))) {
      catalog.delete(PDFName.of('Metadata'))
    }
    if (catalog.has(PDFName.of('PieceInfo'))) {
      catalog.delete(PDFName.of('PieceInfo'))
    }
  } catch (e) {
    console.warn('[cleanPdfMetadata] XMP catalog deletion notice:', e)
  }

  const bytes = await doc.save({ useObjectStreams: true })
  return {
    bytes,
    blob: new Blob([bytes], { type: 'application/pdf' }),
    name: `clean-${fileName}`,
    size: bytes.length,
    pageCount: doc.getPageCount(),
  }
}

export async function watermarkPdf(file, watermarkOptions = {}, onProgress) {
  const {
    type = 'text',
    text = 'CONFIDENTIAL',
    opacity = 0.25,
    rotation = -45,
    fontSize = 48,
    color = { r: 0.8, g: 0.2, b: 0.2 },
    isBelow = false,
    imageBlob = null,
  } = watermarkOptions

  if (onProgress) onProgress('Loading PDF for watermarking...')
  const buf = await file.arrayBuffer()
  const doc = await safeLoadPdfDocument(buf, file.name)
  const font = await doc.embedFont(StandardFonts.HelveticaBold)

  let embeddedImage = null
  if (type === 'image' && imageBlob) {
    const imgBuf = await imageBlob.arrayBuffer()
    embeddedImage = imageBlob.type === 'image/jpeg' ? await doc.embedJpg(imgBuf) : await doc.embedPng(imgBuf)
  }

  const pages = doc.getPages()
  for (let i = 0; i < pages.length; i++) {
    if (onProgress) onProgress(`Applying watermark to page ${i + 1} of ${pages.length}...`)
    const page = pages[i]
    const { width, height } = page.getSize()

    if (type === 'image' && embeddedImage) {
      const imgScale = Math.min(width * 0.5 / embeddedImage.width, height * 0.5 / embeddedImage.height)
      const imgW = embeddedImage.width * imgScale
      const imgH = embeddedImage.height * imgScale

      page.drawImage(embeddedImage, {
        x: (width - imgW) / 2,
        y: (height - imgH) / 2,
        width: imgW,
        height: imgH,
        opacity,
        rotate: degrees(rotation),
      })
    } else {
      const sanitized = sanitizeWinAnsi(text)
      const textWidth = font.widthOfTextAtSize(sanitized, fontSize)
      const rad = (rotation * Math.PI) / 180
      const cos = Math.cos(rad)
      const sin = Math.sin(rad)
      const originX = width / 2 - (textWidth / 2) * cos + (fontSize / 4) * sin
      const originY = height / 2 - (textWidth / 2) * sin - (fontSize / 4) * cos

      page.drawText(sanitized, {
        x: originX,
        y: originY,
        size: fontSize,
        font,
        color: rgb(color.r, color.g, color.b),
        opacity,
        rotate: degrees(rotation),
      })
    }
  }

  const bytes = await doc.save()
  return {
    bytes,
    blob: new Blob([bytes], { type: 'application/pdf' }),
    name: `watermarked-${file.name}`,
    size: bytes.length,
    pageCount: pages.length,
  }
}

export async function addPageNumbers(file, options = {}, onProgress = null) {
  const {
    format = 'Page X of Y',
    position = 'bottom-center',
    margin = 36,
    fontSize = 10,
    startFrom = 1,
  } = options

  if (onProgress) onProgress('Loading document for numbering...')
  const fileName = file?.name || 'document.pdf'
  const doc = await safeLoadPdfDocument(file, fileName)
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const totalPages = doc.getPageCount()

  for (let i = 0; i < totalPages; i++) {
    if (onProgress) onProgress(`Numbering page ${i + 1} of ${totalPages}...`)
    const page = doc.getPage(i)
    const { width, height } = page.getSize()
    const pageNum = i + startFrom

    let label = ''
    if (format === 'Page X') label = `Page ${pageNum}`
    else if (format === 'Page X of Y') label = `Page ${pageNum} of ${totalPages}`
    else if (format === 'X / Y') label = `${pageNum} / ${totalPages}`
    else label = `${pageNum}`

    const textWidth = font.widthOfTextAtSize(label, fontSize)
    let x = margin
    let y = margin

    if (position.includes('center')) x = (width - textWidth) / 2
    else if (position.includes('right')) x = width - margin - textWidth

    if (position.startsWith('top')) y = height - margin

    page.drawText(label, {
      x,
      y,
      size: fontSize,
      font,
      color: rgb(0.3, 0.3, 0.35),
    })
  }

  const bytes = await doc.save()
  return {
    bytes,
    blob: new Blob([bytes], { type: 'application/pdf' }),
    name: `numbered-${fileName}`,
    size: bytes.length,
    pageCount: totalPages,
  }
}

export async function addHeaderFooter(file, options = {}, onProgress = null) {
  const {
    headerLeft = '', headerCenter = '', headerRight = '',
    footerLeft = '', footerCenter = '', footerRight = '',
    margin = 36,
    fontSize = 9,
    excludeFirstPage = false,
  } = options

  if (onProgress) onProgress('Loading document for header & footer...')
  const fileName = file?.name || 'document.pdf'
  const doc = await safeLoadPdfDocument(file, fileName)
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const totalPages = doc.getPageCount()
  const todayStr = new Date().toLocaleDateString()
  const titleStr = fileName.replace(/\.pdf$/i, '')

  const resolveVars = (tpl, pNum) => {
    if (!tpl) return ''
    return tpl
      .replace(/{page}/gi, String(pNum))
      .replace(/{total}/gi, String(totalPages))
      .replace(/{date}/gi, todayStr)
      .replace(/{title}/gi, titleStr)
  }

  for (let i = 0; i < totalPages; i++) {
    if (excludeFirstPage && i === 0) continue
    if (onProgress) onProgress(`Stamping header/footer on page ${i + 1} of ${totalPages}...`)
    const page = doc.getPage(i)
    const { width, height } = page.getSize()
    const pNum = i + 1

    const hl = sanitizeWinAnsi(resolveVars(headerLeft, pNum))
    const hc = sanitizeWinAnsi(resolveVars(headerCenter, pNum))
    const hr = sanitizeWinAnsi(resolveVars(headerRight, pNum))

    const fl = sanitizeWinAnsi(resolveVars(footerLeft, pNum))
    const fc = sanitizeWinAnsi(resolveVars(footerCenter, pNum))
    const fr = sanitizeWinAnsi(resolveVars(footerRight, pNum))

    const textColor = rgb(0.35, 0.35, 0.4)
    const topY = height - margin
    const botY = margin

    if (hl) page.drawText(hl, { x: margin, y: topY, size: fontSize, font, color: textColor })
    if (hc) {
      const w = font.widthOfTextAtSize(hc, fontSize)
      page.drawText(hc, { x: (width - w) / 2, y: topY, size: fontSize, font, color: textColor })
    }
    if (hr) {
      const w = font.widthOfTextAtSize(hr, fontSize)
      page.drawText(hr, { x: width - margin - w, y: topY, size: fontSize, font, color: textColor })
    }

    if (fl) page.drawText(fl, { x: margin, y: botY, size: fontSize, font, color: textColor })
    if (fc) {
      const w = font.widthOfTextAtSize(fc, fontSize)
      page.drawText(fc, { x: (width - w) / 2, y: botY, size: fontSize, font, color: textColor })
    }
    if (fr) {
      const w = font.widthOfTextAtSize(fr, fontSize)
      page.drawText(fr, { x: width - margin - w, y: botY, size: fontSize, font, color: textColor })
    }
  }

  const bytes = await doc.save()
  return {
    bytes,
    blob: new Blob([bytes], { type: 'application/pdf' }),
    name: `header-footer-${fileName}`,
    size: bytes.length,
    pageCount: totalPages,
  }
}

export async function flattenPdf(file, onProgress = null) {
  if (onProgress) onProgress('Flattening annotations and interactive forms...')
  const fileName = file?.name || 'document.pdf'
  const doc = await safeLoadPdfDocument(file, fileName)
  const form = doc.getForm()
  if (form) {
    try {
      form.flatten()
    } catch (e) {
      console.warn('[flattenPdf] Form flatten notice:', e)
    }
  }
  const bytes = await doc.save()
  return {
    bytes,
    blob: new Blob([bytes], { type: 'application/pdf' }),
    name: `flattened-${fileName}`,
    size: bytes.length,
    pageCount: doc.getPageCount(),
  }
}

export async function getPdfFormFields(file) {
  const fileName = file?.name || 'document.pdf'
  const doc = await safeLoadPdfDocument(file, fileName)
  const form = doc.getForm()
  if (!form) return []

  const fields = form.getFields()
  return fields.map(f => {
    const name = f.getName()
    const type = f.constructor.name.replace(/^PDF/, '')
    let value = ''
    try {
      if (typeof f.getText === 'function') value = f.getText() || ''
      else if (typeof f.isChecked === 'function') value = f.isChecked() ? 'true' : 'false'
      else if (typeof f.getSelected === 'function') value = f.getSelected() || ''
    } catch (e) {}

    return {
      name,
      type,
      value,
    }
  })
}

export async function fillPdfForm(file, formValues = {}, onProgress = null) {
  if (onProgress) onProgress('Locating form fields and populating values...')
  const fileName = file?.name || 'document.pdf'
  const doc = await safeLoadPdfDocument(file, fileName)
  const form = doc.getForm()
  if (!form) throw new Error('This PDF does not contain interactive form fields.')

  let updatedCount = 0
  for (const [name, val] of Object.entries(formValues)) {
    try {
      const field = form.getField(name)
      if (!field) continue

      if (typeof field.setText === 'function') {
        field.setText(sanitizeWinAnsi(String(val)))
        updatedCount++
      } else if (typeof field.check === 'function') {
        if (val === true || val === 'true') field.check()
        else field.uncheck()
        updatedCount++
      } else if (typeof field.select === 'function') {
        field.select(String(val))
        updatedCount++
      }
    } catch (err) {
      console.warn(`[fillPdfForm] Could not populate field "${name}":`, err)
    }
  }

  const bytes = await doc.save()
  return {
    bytes,
    blob: new Blob([bytes], { type: 'application/pdf' }),
    name: `filled-${fileName}`,
    size: bytes.length,
    updatedCount,
  }
}

export async function createPdfFormFields(file, fields = [], onProgress = null) {
  if (!fields.length) throw new Error('No form fields defined to add.')
  if (onProgress) onProgress('Initializing PDF form designer...')
  const fileName = file?.name || 'document.pdf'
  const doc = await safeLoadPdfDocument(file, fileName)
  const form = doc.getForm()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const totalPages = doc.getPageCount()

  for (const f of fields) {
    const pageIndex = Math.max(0, Math.min(totalPages - 1, (f.page || 1) - 1))
    const page = doc.getPage(pageIndex)
    const { width: pWidth, height: pHeight } = page.getSize()

    const x = f.xPercent !== undefined ? f.xPercent * pWidth : (f.x || 50)
    const y = f.yPercent !== undefined ? pHeight - (f.yPercent + (f.heightPercent || 0.05)) * pHeight : (f.y || 50)
    const w = f.widthPercent !== undefined ? f.widthPercent * pWidth : (f.width || 150)
    const h = f.heightPercent !== undefined ? f.heightPercent * pHeight : (f.height || 25)

    if (f.type === 'checkbox') {
      const cb = form.createCheckBox(f.name)
      cb.addToPage(page, { x, y, width: Math.min(w, h), height: Math.min(w, h) })
      if (f.defaultValue) cb.check()
    } else if (f.type === 'dropdown' && f.options) {
      const dd = form.createDropdown(f.name)
      dd.addOptions(f.options)
      dd.addToPage(page, { x, y, width: w, height: h })
      if (f.defaultValue) dd.select(f.defaultValue)
    } else {
      const tf = form.createTextField(f.name)
      tf.addToPage(page, { x, y, width: w, height: h })
      if (f.defaultValue) tf.setText(sanitizeWinAnsi(f.defaultValue))
    }
  }

  const bytes = await doc.save()
  return {
    bytes,
    blob: new Blob([bytes], { type: 'application/pdf' }),
    name: `forms-${fileName}`,
    size: bytes.length,
    pageCount: totalPages,
    fieldsAdded: fields.length,
  }
}

export async function signPdf(file, signatureDataUrl, pageNumber = 1, rect = {}, onProgress = null) {
  if (onProgress) onProgress('Embedding visual signature into document...')
  const fileName = file?.name || 'document.pdf'
  const doc = await safeLoadPdfDocument(file, fileName)
  const totalPages = doc.getPageCount()
  const targetPageIdx = Math.max(0, Math.min(totalPages - 1, pageNumber - 1))
  const page = doc.getPage(targetPageIdx)
  const { width: pWidth, height: pHeight } = page.getSize()

  const imgBuf = await fetch(signatureDataUrl).then(r => r.arrayBuffer())
  let embeddedImg
  if (signatureDataUrl.includes('image/jpeg')) {
    embeddedImg = await doc.embedJpg(imgBuf)
  } else {
    embeddedImg = await doc.embedPng(imgBuf)
  }

  const defW = 160
  const defH = 60
  let x = rect.xPercent !== undefined ? rect.xPercent * pWidth : (pWidth - defW - 40)
  let y = rect.yPercent !== undefined ? pHeight - (rect.yPercent + (rect.heightPercent || 0.08)) * pHeight : 40
  let w = rect.widthPercent !== undefined ? rect.widthPercent * pWidth : defW
  let h = rect.heightPercent !== undefined ? rect.heightPercent * pHeight : defH

  page.drawImage(embeddedImg, {
    x,
    y,
    width: w,
    height: h,
    opacity: rect.opacity !== undefined ? rect.opacity : 1.0,
  })

  const bytes = await doc.save()
  return {
    bytes,
    blob: new Blob([bytes], { type: 'application/pdf' }),
    name: `signed-${fileName}`,
    size: bytes.length,
    pageCount: totalPages,
    notice: 'Visual signature placed. Note: This represents an authenticated visual stamp and not a cryptographic digital certificate signature.',
  }
}

/**
 * Permanent Redaction: Irreversibly obliterates sensitive text & graphics by rasterizing
 * redacted pages to flat pixels without text streams or vector objects.
 */
export async function redactPdfPages(file, redactionsByPage, onProgress = null) {
  if (onProgress) onProgress('Initializing permanent PDF redaction engine...')
  const pdfjs = await getPdfJs()
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: arrayBuffer, isEvalSupported: false, enableScripting: false }).promise
  const numPages = pdf.numPages

  const srcDoc = await safeLoadPdfDocument(arrayBuffer.slice(0), file.name)
  const outDoc = await PDFDocument.create()

  for (let p = 1; p <= numPages; p++) {
    const pageRedactions = redactionsByPage[p] || []
    if (pageRedactions.length > 0) {
      if (onProgress) onProgress(`Obliterating sensitive content on page ${p} of ${numPages}...`)
      const page = await pdf.getPage(p)
      const origViewport = page.getViewport({ scale: 1.0 })
      const scale = 2.0
      const viewport = page.getViewport({ scale })

      const canvas = document.createElement('canvas')
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      const ctx = canvas.getContext('2d')

      await page.render({ canvasContext: ctx, viewport }).promise

      // Burn redaction boxes directly into pixel canvas
      for (const r of pageRedactions) {
        ctx.fillStyle = r.color || '#000000'
        const rx = r.xPercent * canvas.width
        const ry = r.yPercent * canvas.height
        const rw = r.widthPercent * canvas.width
        const rh = r.heightPercent * canvas.height
        ctx.fillRect(rx, ry, rw, rh)
      }

      const pngBlob = await new Promise(res => canvas.toBlob(res, 'image/png'))
      const pngBytes = await pngBlob.arrayBuffer()
      const embeddedImg = await outDoc.embedPng(pngBytes)

      const newPage = outDoc.addPage([origViewport.width, origViewport.height])
      newPage.drawImage(embeddedImg, {
        x: 0,
        y: 0,
        width: origViewport.width,
        height: origViewport.height,
      })

      canvas.width = 0
      canvas.height = 0
      if (typeof page.cleanup === 'function') page.cleanup()
    } else {
      if (onProgress) onProgress(`Preserving page ${p} vector structure...`)
      const [copiedPage] = await outDoc.copyPages(srcDoc, [p - 1])
      outDoc.addPage(copiedPage)
    }
  }

  const bytes = await outDoc.save()
  return {
    bytes,
    blob: new Blob([bytes], { type: 'application/pdf' }),
    name: `redacted-${file.name}`,
    size: bytes.length,
    pageCount: numPages,
    notice: 'Permanent redaction complete. Text layer and underlying vector objects on redacted pages have been irreversibly destroyed.',
  }
}

/**
 * PDF Compression Pipeline
 * Fixes numPages reference bug, performs lossless object-stream compression
 * and memory-safe sequential balanced/high downsampling.
 */
export async function compressPdf(file, arg2 = null, arg3 = null) {
  const onProgress = typeof arg2 === 'function' ? arg2 : (typeof arg3 === 'function' ? arg3 : null)
  const options = (arg2 && typeof arg2 === 'object') ? arg2 : {}
  const preset = options.preset || 'balanced' // 'balanced', 'high', 'lossless'

  if (onProgress) onProgress('Analyzing PDF structures...')
  const buf = await file.arrayBuffer()
  const origSize = file.size || buf.byteLength

  // 1. Lossless object stream compression
  const doc = await safeLoadPdfDocument(buf.slice(0), file.name)
  const losslessBytes = await doc.save({
    useObjectStreams: true,
    addDefaultPage: false,
    updateFieldAppearances: false,
  })

  let bestBytes = losslessBytes.length < origSize ? losslessBytes : new Uint8Array(buf)
  let bestSize = bestBytes.length
  let reductionNotice = ''

  // 2. Balanced or high raster downsampling in browser environment
  const isLosslessOnly = preset === 'lossless' && !options.dpi
  if (!isLosslessOnly && typeof window !== 'undefined' && typeof document !== 'undefined') {
    try {
      const pdfjs = await getPdfJs()
      const loadingTask = pdfjs.getDocument({ data: buf.slice(0), isEvalSupported: false, enableScripting: false })
      const pdf = await loadingTask.promise
      const numPages = pdf.numPages

      const targetDpi = options.dpi || (preset === 'high' ? 72 : 96)
      const targetScale = options.dpi ? (options.dpi / 72) : (preset === 'high' ? 1.0 : 1.33)
      const jpegQuality = options.quality !== undefined ? Math.max(0.1, Math.min(1.0, options.quality)) : (preset === 'high' ? 0.50 : 0.70)
      if (onProgress) onProgress(`Applying ${targetDpi} DPI (${preset}) optimization...`)

      const outDoc = await PDFDocument.create()

      for (let i = 1; i <= numPages; i++) {
        if (onProgress) onProgress(`Optimizing page ${i} of ${numPages}...`)
        const page = await pdf.getPage(i)
        const viewport = page.getViewport({ scale: targetScale })

        const canvas = document.createElement('canvas')
        canvas.width = Math.round(viewport.width)
        canvas.height = Math.round(viewport.height)
        const ctx = canvas.getContext('2d')

        await page.render({ canvasContext: ctx, viewport }).promise

        const jpegBlob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', jpegQuality))
        if (jpegBlob) {
          const jpegBuf = await jpegBlob.arrayBuffer()
          const embedded = await outDoc.embedJpg(jpegBuf)
          const origVp = page.getViewport({ scale: 1.0 })
          const p = outDoc.addPage([origVp.width, origVp.height])
          p.drawImage(embedded, { x: 0, y: 0, width: origVp.width, height: origVp.height })
        }

        canvas.width = 0
        canvas.height = 0
        if (typeof page.cleanup === 'function') page.cleanup()
      }

      const rasterBytes = await outDoc.save({ useObjectStreams: true })
      if (rasterBytes.length < bestSize) {
        bestBytes = rasterBytes
        bestSize = rasterBytes.length
      }
    } catch (e) {
      console.warn('[PDF Compress] Raster downsampling skipped, preserved lossless:', e)
    }
  }

  const savedBytes = Math.max(0, origSize - bestSize)
  const savedPct = origSize > 0 ? Math.round((savedBytes / origSize) * 100) : 0

  if (savedBytes === 0) {
    reductionNotice = 'Document is already optimally compressed. Preserved original file.'
  }

  return {
    bytes: bestBytes,
    blob: new Blob([bestBytes], { type: 'application/pdf' }),
    name: `compressed-${file.name}`,
    origSize,
    size: bestSize,
    savedBytes,
    savedPct,
    reductionNotice,
  }
}

export async function lockPdf(file, password, options = {}, onProgress = null) {
  if (!password || typeof password !== 'string' || !password.trim()) {
    throw new Error('A non-empty password is required to lock this PDF.')
  }
  if (options.confirmPassword && password !== options.confirmPassword) {
    throw new Error('Passwords do not match. Please confirm your password.')
  }

  if (onProgress) onProgress('Importing cryptographic engine and analyzing PDF structure...')
  const { encryptPDF } = await import('@pdfsmaller/pdf-encrypt')
  const arrayBuffer = await toSafeArrayBuffer(file)
  const uint8 = new Uint8Array(arrayBuffer)
  const baseName = file?.name ? file.name.replace(/\.pdf$/i, '') : 'document'

  const pdfDoc = await safeLoadPdfDocument(arrayBuffer.slice(0), baseName)
  const pageCount = pdfDoc.getPageCount()

  if (onProgress) onProgress('Applying cryptographic encryption and permission restrictions...')

  const algorithm = options.algorithm === 'RC4-128' ? 'RC4-128' : 'AES-256'
  const encryptOpts = {
    algorithm,
  }

  if (options.ownerPassword && options.ownerPassword.trim()) {
    encryptOpts.ownerPassword = options.ownerPassword.trim()
  }

  if (options.permissions) {
    encryptOpts.permissions = {
      print: options.permissions.print || 'highResolution',
      copy: options.permissions.copy !== false,
      modify: options.permissions.modify !== false,
      annotate: options.permissions.annotate !== false,
      fillForms: options.permissions.fillForms !== false,
      assemble: options.permissions.assemble !== false,
    }
  }

  const encryptedBytes = await encryptPDF(uint8, password, encryptOpts)
  return {
    bytes: encryptedBytes,
    blob: new Blob([encryptedBytes], { type: 'application/pdf' }),
    name: `protected-${baseName}.pdf`,
    size: encryptedBytes.length,
    pageCount,
    algorithm,
    permissions: encryptOpts.permissions || null,
  }
}

export async function unlockPdf(file, password, onProgress = null) {
  if (!password || typeof password !== 'string' || !password.trim()) {
    throw new Error('Password is required to decrypt this document.')
  }
  if (onProgress) onProgress('Authenticating credentials and decrypting document...')
  const arrayBuffer = await toSafeArrayBuffer(file)
  const uint8 = new Uint8Array(arrayBuffer)
  const baseName = file?.name ? file.name.replace(/\.pdf$/i, '') : 'document'

  // 1. Primary: Direct standards-compliant lossless vector decryption
  try {
    const { decryptPDF } = await import('@pdfsmaller/pdf-decrypt')
    const decryptedBytes = await decryptPDF(uint8, password)
    if (decryptedBytes && decryptedBytes.length > 0) {
      const doc = await PDFDocument.load(decryptedBytes, { ignoreEncryption: false })
      const numPages = doc.getPageCount()
      return {
        bytes: decryptedBytes,
        blob: new Blob([decryptedBytes], { type: 'application/pdf' }),
        name: `unlocked-${baseName}.pdf`,
        size: decryptedBytes.length,
        pageCount: numPages,
        mode: 'lossless-vector',
      }
    }
  } catch (decErr) {
    const msg = decErr?.message || ''
    if (/incorrect password/i.test(msg) || /wrong password/i.test(msg)) {
      throw new Error('Incorrect password. The encrypted PDF could not be decrypted.')
    }
    console.warn('[unlockPdf] Primary decrypt failed, attempting PDF.js fallback:', decErr)
  }

  // 2. Secondary Fallback: Authenticated render via PDF.js
  const pdfjs = await getPdfJs()
  let pdf
  try {
    const loadingTask = pdfjs.getDocument({ data: arrayBuffer.slice(0), password, isEvalSupported: false, enableScripting: false })
    pdf = await loadingTask.promise
  } catch (err) {
    if (/password|incorrect/i.test(err?.message || '')) {
      throw new Error('Incorrect password. The encrypted PDF could not be decrypted.')
    }
    throw new Error(`Failed to decrypt PDF: ${err?.message || 'Invalid or unsupported format.'}`)
  }

  const numPages = pdf.numPages
  const newPdfDoc = await PDFDocument.create()

  for (let i = 1; i <= numPages; i++) {
    if (onProgress) onProgress(`Decrypting and rebuilding page ${i} of ${numPages}...`)
    const page = await pdf.getPage(i)
    const origViewport = page.getViewport({ scale: 1.0 })
    const renderViewport = page.getViewport({ scale: 2.0 })

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(renderViewport.width)
    canvas.height = Math.round(renderViewport.height)
    const ctx = canvas.getContext('2d')

    await page.render({ canvasContext: ctx, viewport: renderViewport }).promise

    const pngBlob = await new Promise(res => canvas.toBlob(res, 'image/png'))
    const pngBytes = await pngBlob.arrayBuffer()
    const embeddedImg = await newPdfDoc.embedPng(pngBytes)

    const newPage = newPdfDoc.addPage([origViewport.width, origViewport.height])
    newPage.drawImage(embeddedImg, {
      x: 0,
      y: 0,
      width: origViewport.width,
      height: origViewport.height,
    })

    canvas.width = 0
    canvas.height = 0
    if (typeof page.cleanup === 'function') page.cleanup()
  }

  const bytes = await newPdfDoc.save()
  return {
    bytes,
    blob: new Blob([bytes], { type: 'application/pdf' }),
    name: `unlocked-${baseName}.pdf`,
    size: bytes.length,
    pageCount: numPages,
    mode: 'authenticated-render',
  }
}

export async function changePdfPassword(file, currentPassword, newPassword, options = {}, onProgress = null) {
  if (!currentPassword) throw new Error('Current password is required.')
  if (!newPassword) throw new Error('New password is required.')
  if (options.confirmPassword && newPassword !== options.confirmPassword) {
    throw new Error('New passwords do not match.')
  }

  if (onProgress) onProgress('Authenticating current password and unlocking...')
  const unlocked = await unlockPdf(file, currentPassword, onProgress)

  if (onProgress) onProgress('Applying new encryption password and permissions...')
  const baseName = file?.name ? file.name.replace(/\.pdf$/i, '') : 'document'
  const result = await lockPdf(unlocked.blob, newPassword, options, onProgress)
  return {
    ...result,
    name: `re-encrypted-${baseName}.pdf`,
  }
}

export async function comparePdfs(fileA, fileB, onProgress) {
  if (onProgress) onProgress('Analyzing documents for comparison...')
  const bufA = await fileA.arrayBuffer()
  const bufB = await fileB.arrayBuffer()

  const docA = await safeLoadPdfDocument(bufA, fileA.name)
  const docB = await safeLoadPdfDocument(bufB, fileB.name)

  const pagesA = docA.getPageCount()
  const pagesB = docB.getPageCount()

  const titleA = docA.getTitle() || 'Untitled'
  const titleB = docB.getTitle() || 'Untitled'

  return {
    fileA: { name: fileA.name, size: fileA.size, pages: pagesA, title: titleA },
    fileB: { name: fileB.name, size: fileB.size, pages: pagesB, title: titleB },
    samePageCount: pagesA === pagesB,
    pageDifference: Math.abs(pagesA - pagesB),
    sizeDiffBytes: fileA.size - fileB.size,
    identicalMetadata: titleA === titleB && docA.getAuthor() === docB.getAuthor(),
  }
}

export async function createZipFromFiles(items, zipFilename = 'export.zip', onProgress) {
  if (onProgress) onProgress('Archiving outputs into ZIP...')
  const zip = new JSZip()
  for (const item of items) {
    const data = item.blob || item.bytes || item
    const name = item.name || 'document.pdf'
    zip.file(name, data)
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' }, metadata => {
    if (onProgress) onProgress(`Compressing archive: ${Math.round(metadata.percent)}%...`)
  })
  return {
    blob: zipBlob,
    name: zipFilename,
    size: zipBlob.size,
  }
}
