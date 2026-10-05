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
  if (typeof window !== 'undefined' && window.pdfjsLib) {
    if (!window.pdfjsLib.GlobalWorkerOptions?.workerSrc) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
    }
    return window.pdfjsLib
  }

  if (!_pdfjsPromise) {
    _pdfjsPromise = (async () => {
      try {
        const pdfjs = await import('pdfjs-dist')
        const lib = pdfjs.default || pdfjs
        if (typeof window !== 'undefined') {
          lib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
          window.pdfjsLib = lib
        } else if (typeof globalThis !== 'undefined' && !globalThis.pdfjsLib) {
          globalThis.pdfjsLib = lib
        }
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
 * Resolves standard PDF.js document loading options with offline standard fonts and cmaps
 */
export function getPdfjsDocumentOptions(data, extraOptions = {}) {
  let standardFontDataUrl = '/fonts/'
  let cMapUrl = '/cmaps/'
  if (typeof window !== 'undefined' && window.location) {
    standardFontDataUrl = `${window.location.origin}/fonts/`
    cMapUrl = `${window.location.origin}/cmaps/`
  } else if (typeof process !== 'undefined' && process.cwd) {
    try {
      const cwd = process.cwd()
      standardFontDataUrl = `${cwd}/public/fonts/`
      cMapUrl = `${cwd}/public/cmaps/`
    } catch {}
  }
  return {
    data,
    standardFontDataUrl,
    cMapUrl,
    cMapPacked: true,
    isEvalSupported: false,
    enableScripting: false,
    ...extraOptions,
  }
}

/**
 * Safely convert File, Blob, Buffer, Uint8Array or ArrayBuffer into an ArrayBuffer
 */
export async function toSafeArrayBuffer(input, clone = false) {
  if (!input) throw new Error('No PDF input provided.')
  if (input instanceof ArrayBuffer) {
    if (typeof input.detached !== 'undefined' && input.detached) {
      throw new Error('Input ArrayBuffer is detached.')
    }
    return clone ? input.slice(0) : input
  }
  if (ArrayBuffer.isView(input)) {
    const res = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength)
    return clone ? res.slice(0) : res
  }
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(input)) {
    const res = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength)
    return clone ? res.slice(0) : res
  }
  // Check for wrapped properties
  if (input.blob) return await toSafeArrayBuffer(input.blob, clone)
  if (input.data) return await toSafeArrayBuffer(input.data, clone)
  if (input.file) return await toSafeArrayBuffer(input.file, clone)
  if (input.bytes && typeof input.bytes !== 'function') return await toSafeArrayBuffer(input.bytes, clone)

  if (typeof input.arrayBuffer === 'function') {
    const ab = await input.arrayBuffer()
    return clone ? ab.slice(0) : ab
  }
  if (typeof input.bytes === 'function') {
    const u8 = await input.bytes()
    const res = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength)
    return clone ? res.slice(0) : res
  }
  throw new Error('Unsupported binary data type.')
}

/**
 * Safely convert File, Blob, Buffer, Uint8Array or ArrayBuffer into a Uint8Array
 */
export async function toSafeUint8Array(input) {
  if (!input) throw new Error('No binary input provided.')
  if (input instanceof Uint8Array) return input
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
  }
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input)
  }
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
  }
  // Check for wrapped properties
  if (input.blob) return await toSafeUint8Array(input.blob)
  if (input.data) return await toSafeUint8Array(input.data)
  if (input.file) return await toSafeUint8Array(input.file)
  if (input.bytes && typeof input.bytes !== 'function') return await toSafeUint8Array(input.bytes)

  if (typeof input.bytes === 'function') {
    return await input.bytes()
  }
  if (typeof input.arrayBuffer === 'function') {
    const ab = await input.arrayBuffer()
    return new Uint8Array(ab)
  }
  throw new Error('Unsupported binary data type.')
}

/**
 * Robustly decode data URL or fetchable URL into ArrayBuffer across Browser & Node
 */
export async function dataUrlToArrayBuffer(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') throw new Error('Invalid image data URL provided.')
  if (dataUrl.startsWith('data:')) {
    const commaIdx = dataUrl.indexOf(',')
    if (commaIdx !== -1) {
      const base64 = dataUrl.slice(commaIdx + 1)
      if (typeof Buffer !== 'undefined') {
        const buf = Buffer.from(base64, 'base64')
        return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
      }
      const bin = atob(base64)
      const len = bin.length
      const bytes = new Uint8Array(len)
      for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i)
      return bytes.buffer
    }
  }
  const res = await fetch(dataUrl)
  return await res.arrayBuffer()
}

/**
 * Embed image blob, file, or data buffer into PDFDoc with automatic format normalization
 */
async function ensureEmbeddedImage(doc, imageBlobOrBuffer) {
  let buf
  let type = ''
  if (typeof imageBlobOrBuffer === 'string') {
    buf = await dataUrlToArrayBuffer(imageBlobOrBuffer)
    type = imageBlobOrBuffer.includes('image/jpeg') ? 'image/jpeg' : 'image/png'
  } else {
    if (imageBlobOrBuffer?.type) {
      type = imageBlobOrBuffer.type
    }
    buf = await toSafeArrayBuffer(imageBlobOrBuffer)
  }

  const isJpg = type === 'image/jpeg' || type === 'image/jpg'
  if (isJpg) {
    try {
      return await doc.embedJpg(buf)
    } catch (_) {}
  }
  try {
    return await doc.embedPng(buf)
  } catch (_) {}
  try {
    return await doc.embedJpg(buf)
  } catch (_) {}

  // If format is WebP or unhandled and in browser, rasterize via HTML canvas
  if (typeof document !== 'undefined' && typeof Image !== 'undefined') {
    const blob = new Blob([buf], { type: type || 'image/png' })
    const url = URL.createObjectURL(blob)
    try {
      const img = new Image()
      await new Promise((res, rej) => {
        img.onload = res
        img.onerror = rej
        img.src = url
      })
      const naturalW = img.naturalWidth || img.width || 100
      const naturalH = img.naturalHeight || img.height || 100
      const maxDim = Math.max(naturalW, naturalH)
      const scale = maxDim > 4096 ? 4096 / maxDim : 1
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(naturalW * scale)
      canvas.height = Math.round(naturalH * scale)
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      let pngBlob = await new Promise(r => canvas.toBlob(r, 'image/png'))
      if (!pngBlob) {
        const dataUrl = canvas.toDataURL('image/png')
        if (dataUrl) {
          const bin = atob(dataUrl.split(',')[1])
          const u8 = new Uint8Array(bin.length)
          for (let k = 0; k < bin.length; k++) u8[k] = bin.charCodeAt(k)
          pngBlob = new Blob([u8], { type: 'image/png' })
        }
      }
      if (pngBlob) {
        const pngBuf = await pngBlob.arrayBuffer()
        canvas.width = 0
        canvas.height = 0
        return await doc.embedPng(pngBuf)
      }
      canvas.width = 0
      canvas.height = 0
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  throw new Error('Unsupported or corrupted image format. Please use PNG or JPG.')
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
  const arrayBuffer = await toSafeArrayBuffer(file, true)
  const pdf = await pdfjs.getDocument(getPdfjsDocumentOptions(arrayBuffer.slice(0))).promise
  const numPages = pdf.numPages
  const images = []
  const targetDpi = Math.max(72, Math.min(300, Number(dpi) || 150))
  const baseScale = targetDpi / 72

  for (let i = 1; i <= numPages; i++) {
    if (onProgress) onProgress(`Rendering page ${i} of ${numPages} (${targetDpi} DPI)...`)
    const page = await pdf.getPage(i)

    // Clamp canvas dimensions to maximum 4096px to avoid mobile/browser GPU crash
    let scale = baseScale
    const unscaled = page.getViewport({ scale: 1.0 })
    const maxDim = Math.max(unscaled.width, unscaled.height)
    if (maxDim * scale > 4096) {
      scale = 4096 / maxDim
    }
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    const ctx = canvas.getContext('2d')

    await page.render({ canvasContext: ctx, viewport }).promise

    const dataUrl = canvas.toDataURL(format, 0.92)
    let blob = await new Promise(res => canvas.toBlob(res, format, 0.92))

    // Fallback if toBlob returned null due to memory pressure
    if (!blob && dataUrl) {
      const bin = atob(dataUrl.split(',')[1])
      const u8 = new Uint8Array(bin.length)
      for (let k = 0; k < bin.length; k++) u8[k] = bin.charCodeAt(k)
      blob = new Blob([u8], { type: format })
    }

    const ext = format === 'image/jpeg' ? 'jpg' : 'png'
    const baseName = file?.name ? file.name.replace(/\.pdf$/i, '') : 'document'
    const imgName = `${baseName}_page_${i}.${ext}`

    images.push({
      pageNumber: i,
      name: imgName,
      blob,
      dataUrl,
      thumbnailUrl: dataUrl,
      size: blob ? blob.size : (dataUrl ? dataUrl.length : 0),
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
  const arrayBuffer = await toSafeArrayBuffer(file, true)
  const pdf = await pdfjs.getDocument(getPdfjsDocumentOptions(arrayBuffer.slice(0))).promise
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
      thumbnailUrl: dataUrl,
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
    const fileName = file?.name || `document_${i + 1}.pdf`
    if (onProgress) onProgress(`Merging "${fileName}" (${i + 1} of ${files.length})...`)

    const srcDoc = await safeLoadPdfDocument(file, fileName)
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
  const fileName = file?.name || 'document.pdf'
  const srcDoc = await safeLoadPdfDocument(file, fileName)
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

  const fileName = file?.name || 'document.pdf'
  const srcDoc = await safeLoadPdfDocument(file, fileName)
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
  const baseName = fileName.replace(/\.pdf$/i, '')

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

  const fileName = file?.name || 'document.pdf'
  const srcDoc = await safeLoadPdfDocument(file, fileName)
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
    name: `reordered-${fileName}`,
    size: bytes.length,
    pageCount: totalPages,
  }
}

export async function deletePdfPages(file, pagesToDelete, onProgress) {
  if (!pagesToDelete || !pagesToDelete.length) throw new Error('No pages selected to delete.')

  const fileName = file?.name || 'document.pdf'
  const srcDoc = await safeLoadPdfDocument(file, fileName)
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
    name: `pruned-${fileName}`,
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

  const fileName = file?.name || 'document.pdf'
  const doc = await safeLoadPdfDocument(file, fileName)
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
    name: `rotated-${file?.name || 'document.pdf'}`,
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
      x = Math.max(0, Math.min(pWidth - 10, (cropBox.xPercent || 0) * pWidth))
      width = Math.max(10, Math.min(pWidth - x, (cropBox.widthPercent || 1) * pWidth))
      height = Math.max(10, Math.min(pHeight, (cropBox.heightPercent || 1) * pHeight))
      y = Math.max(0, Math.min(pHeight - height, pHeight - ((cropBox.yPercent || 0) + (cropBox.heightPercent || 1)) * pHeight))
    } else {
      x = Math.max(0, Math.min(pWidth - 10, cropBox.x || 0))
      y = Math.max(0, Math.min(pHeight - 10, cropBox.y || 0))
      width = Math.max(10, Math.min(pWidth - x, cropBox.width || pWidth))
      height = Math.max(10, Math.min(pHeight - y, cropBox.height || pHeight))
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
  const fileName = file?.name || 'document.pdf'
  const doc = await safeLoadPdfDocument(file, fileName)
  const size = file?.size || (await toSafeArrayBuffer(file)).byteLength
  const pageCount = doc.getPageCount()
  const firstPage = pageCount > 0 ? doc.getPage(0) : null
  const pageSize = firstPage ? { width: Math.round(firstPage.getWidth()), height: Math.round(firstPage.getHeight()) } : null

  return {
    title: doc.getTitle() || '',
    author: doc.getAuthor() || '',
    subject: doc.getSubject() || '',
    keywords: doc.getKeywords() || '',
    creator: doc.getCreator() || '',
    producer: doc.getProducer() || '',
    creationDate: doc.getCreationDate() ? doc.getCreationDate().toISOString() : '',
    modificationDate: doc.getModificationDate() ? doc.getModificationDate().toISOString() : '',
    pageCount,
    pageSize,
    fileSize: size,
  }
}

export async function updatePdfMetadata(file, metadata, onProgress) {
  if (onProgress) onProgress('Updating document properties...')
  const fileName = file?.name || 'document.pdf'
  const doc = await safeLoadPdfDocument(file, fileName)

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
    name: `metadata-${fileName}`,
    size: bytes.length,
    pageCount: doc.getPageCount(),
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
  const imageBlob = watermarkOptions.imageBlob || watermarkOptions.image || null
  const type = watermarkOptions.type || (imageBlob ? 'image' : 'text')
  const text = watermarkOptions.text || 'CONFIDENTIAL'
  const opacity = watermarkOptions.opacity !== undefined ? watermarkOptions.opacity : 0.25
  const rotation = watermarkOptions.rotation !== undefined ? watermarkOptions.rotation : (watermarkOptions.angle !== undefined ? watermarkOptions.angle : -45)
  const fontSize = watermarkOptions.fontSize || 48
  const rawColor = watermarkOptions.color || { r: 0.8, g: 0.2, b: 0.2 }
  let watermarkColor = rgb(0.8, 0.2, 0.2)
  if (typeof rawColor === 'string') {
    const cleanHex = rawColor.replace('#', '').trim()
    if (cleanHex.length === 6) {
      watermarkColor = rgb(
        parseInt(cleanHex.slice(0, 2), 16) / 255,
        parseInt(cleanHex.slice(2, 4), 16) / 255,
        parseInt(cleanHex.slice(4, 6), 16) / 255
      )
    }
  } else if (rawColor && typeof rawColor === 'object') {
    const r = Number(rawColor.r) || 0
    const g = Number(rawColor.g) || 0
    const b = Number(rawColor.b) || 0
    watermarkColor = rgb(
      r > 1 ? r / 255 : r,
      g > 1 ? g / 255 : g,
      b > 1 ? b / 255 : b
    )
  }

  if (onProgress) onProgress('Loading PDF for watermarking...')
  const fileName = file?.name || 'document.pdf'
  const doc = await safeLoadPdfDocument(file, fileName)
  const font = await doc.embedFont(StandardFonts.HelveticaBold)

  let embeddedImage = null
  if (type === 'image' && imageBlob) {
    embeddedImage = await ensureEmbeddedImage(doc, imageBlob)
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
        color: watermarkColor,
        opacity,
        rotate: degrees(rotation),
      })
    }
  }

  const bytes = await doc.save()
  return {
    bytes,
    blob: new Blob([bytes], { type: 'application/pdf' }),
    name: `watermarked-${fileName}`,
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
  } = options
  const startFrom = options.startFrom !== undefined ? options.startFrom : (options.startPage !== undefined ? options.startPage : 1)

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
  let headerLeft = options.headerLeft || ''
  let headerCenter = options.headerCenter || ''
  let headerRight = options.headerRight || ''
  let footerLeft = options.footerLeft || ''
  let footerCenter = options.footerCenter || ''
  let footerRight = options.footerRight || ''

  // Support alignment-based parameters from UI (headerText/headerAlign, footerText/footerAlign)
  if (options.headerText) {
    const align = options.headerAlign || 'center'
    if (align === 'left') headerLeft = options.headerText
    else if (align === 'right') headerRight = options.headerText
    else headerCenter = options.headerText
  }
  if (options.footerText) {
    const align = options.footerAlign || 'center'
    if (align === 'left') footerLeft = options.footerText
    else if (align === 'right') footerRight = options.footerText
    else footerCenter = options.footerText
  }

  const margin = options.margin !== undefined ? options.margin : 36
  const fontSize = options.fontSize || 9
  const excludeFirstPage = Boolean(options.excludeFirstPage)

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
  let fieldCount = 0
  if (form) {
    try {
      fieldCount = form.getFields().length
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
    fieldCount,
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
  const existingNames = new Set(form.getFields().map(f => f.getName()))

  for (let idx = 0; idx < fields.length; idx++) {
    const f = fields[idx]
    const pageIndex = Math.max(0, Math.min(totalPages - 1, (f.page || 1) - 1))
    const page = doc.getPage(pageIndex)
    const { width: pWidth, height: pHeight } = page.getSize()

    let baseName = (f.name || `field_${idx + 1}`).trim()
    let safeName = baseName
    let counter = 1
    while (existingNames.has(safeName)) {
      safeName = `${baseName}_${counter++}`
    }
    existingNames.add(safeName)

    const rawX = f.xPercent !== undefined ? f.xPercent * pWidth : (f.x || 50)
    const rawY = f.yPercent !== undefined ? pHeight - (f.yPercent + (f.heightPercent || 0.05)) * pHeight : (f.y || 50)
    const rawW = f.widthPercent !== undefined ? f.widthPercent * pWidth : (f.width || 150)
    const rawH = f.heightPercent !== undefined ? f.heightPercent * pHeight : (f.height || 25)

    const w = Math.max(10, Math.min(pWidth, rawW))
    const h = Math.max(10, Math.min(pHeight, rawH))
    const x = Math.max(0, Math.min(pWidth - w, rawX))
    const y = Math.max(0, Math.min(pHeight - h, rawY))

    if (f.type === 'checkbox') {
      const cb = form.createCheckBox(safeName)
      cb.addToPage(page, { x, y, width: Math.min(w, h), height: Math.min(w, h) })
      if (f.defaultValue) cb.check()
    } else if (f.type === 'dropdown' && f.options) {
      const dd = form.createDropdown(safeName)
      dd.addOptions(f.options)
      dd.addToPage(page, { x, y, width: w, height: h })
      if (f.defaultValue) dd.select(f.defaultValue)
    } else {
      const tf = form.createTextField(safeName)
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

  const embeddedImg = await ensureEmbeddedImage(doc, signatureDataUrl)

  const defW = 160
  const defH = 60
  const rawX = rect.xPercent !== undefined ? rect.xPercent * pWidth : (pWidth - defW - 40)
  const rawY = rect.yPercent !== undefined ? pHeight - (rect.yPercent + (rect.heightPercent || 0.08)) * pHeight : 40
  const rawW = rect.widthPercent !== undefined ? rect.widthPercent * pWidth : defW
  const rawH = rect.heightPercent !== undefined ? rect.heightPercent * pHeight : defH

  const w = Math.max(10, Math.min(pWidth, rawW))
  const h = Math.max(10, Math.min(pHeight, rawH))
  const x = Math.max(0, Math.min(pWidth - w, rawX))
  const y = Math.max(0, Math.min(pHeight - h, rawY))

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
  // Ensure an independent, safe ArrayBuffer from any input type (File, Blob, ArrayBuffer, Uint8Array)
  const originalBuffer = await toSafeArrayBuffer(file, true)

  // PDF.js worker may detach whatever buffer is given in { data: ... }
  // So provide PDF.js with its own dedicated clone:
  const pdfjsData = originalBuffer.slice(0)
  const pdf = await pdfjs.getDocument(getPdfjsDocumentOptions(pdfjsData)).promise
  const numPages = pdf.numPages

  // safeLoadPdfDocument receives its own independent copy
  const srcDoc = await safeLoadPdfDocument(originalBuffer.slice(0), file?.name || 'document.pdf')
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
        const xp = Math.max(0, Math.min(1, Number(r.xPercent) || 0))
        const yp = Math.max(0, Math.min(1, Number(r.yPercent) || 0))
        const wp = Math.max(0, Math.min(1 - xp, Number(r.widthPercent) || 0))
        const hp = Math.max(0, Math.min(1 - yp, Number(r.heightPercent) || 0))
        const rx = xp * canvas.width
        const ry = yp * canvas.height
        const rw = wp * canvas.width
        const rh = hp * canvas.height
        ctx.fillRect(rx, ry, rw, rh)
      }

      let pngBlob = await new Promise(res => canvas.toBlob(res, 'image/png'))
      if (!pngBlob) {
        const dataUrl = canvas.toDataURL('image/png')
        if (dataUrl) {
          const bin = atob(dataUrl.split(',')[1])
          const u8 = new Uint8Array(bin.length)
          for (let k = 0; k < bin.length; k++) u8[k] = bin.charCodeAt(k)
          pngBlob = new Blob([u8], { type: 'image/png' })
        }
      }
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
    name: `redacted-${file?.name || 'document.pdf'}`,
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
  const buf = await toSafeArrayBuffer(file, true)
  const origSize = file?.size || buf.byteLength
  const fileName = file?.name || 'document.pdf'

  // 1. Lossless object stream compaction and metadata cleanup
  const doc = await safeLoadPdfDocument(buf.slice(0), fileName)
  const totalPages = doc.getPageCount()
  const losslessBytes = await doc.save({
    useObjectStreams: true,
    addDefaultPage: false,
    updateFieldAppearances: false,
  })

  let bestBytes = losslessBytes.length < origSize ? losslessBytes : new Uint8Array(buf)
  let bestSize = bestBytes.length
  let reductionNotice = ''
  let rasterized = false

  // 2. High-compression raster downsampling ONLY for scanned/image documents or explicit high preset
  const canAttemptRaster = (preset === 'high' || options.dpi) && typeof window !== 'undefined' && typeof document !== 'undefined'
  if (canAttemptRaster) {
    try {
      if (onProgress) onProgress(`Performing raster downsampling...`)
      const pdfjs = await getPdfJs()
      const loadingTask = pdfjs.getDocument(getPdfjsDocumentOptions(buf.slice(0)))
      const pdf = await loadingTask.promise
      const numPages = pdf.numPages

      // Check if document has vector text or is predominantly scanned images
      let totalTextChars = 0
      for (let i = 1; i <= Math.min(numPages, 3); i++) {
        const page = await pdf.getPage(i)
        const tc = await page.getTextContent()
        totalTextChars += tc.items.reduce((acc, it) => acc + (it.str || '').length, 0)
        if (typeof page.cleanup === 'function') page.cleanup()
      }

      // If document is vector text-heavy and not explicitly configured for rasterization, preserve vector text
      const isVectorHeavy = totalTextChars > 50 && !options.forceRasterize
      if (!isVectorHeavy) {
        const targetDpi = options.dpi || 72
        const targetScale = options.dpi ? (options.dpi / 72) : 1.0
        const jpegQuality = options.quality !== undefined ? Math.max(0.1, Math.min(1.0, options.quality)) : 0.65
        if (onProgress) onProgress(`Applying ${targetDpi} DPI (${preset}) optimization...`)

        const outDoc = await PDFDocument.create()

        for (let i = 1; i <= numPages; i++) {
          if (onProgress) onProgress(`Optimizing page ${i} of ${numPages}...`)
          const page = await pdf.getPage(i)

          // Clamp max dimension to 4096px
          let pageScale = targetScale
          const unscaled = page.getViewport({ scale: 1.0 })
          const maxDim = Math.max(unscaled.width, unscaled.height)
          if (maxDim * pageScale > 4096) {
            pageScale = 4096 / maxDim
          }
          const viewport = page.getViewport({ scale: pageScale })

          const canvas = document.createElement('canvas')
          canvas.width = Math.round(viewport.width)
          canvas.height = Math.round(viewport.height)
          const ctx = canvas.getContext('2d')

          await page.render({ canvasContext: ctx, viewport }).promise

          let jpegBlob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', jpegQuality))
          if (!jpegBlob) {
            const dataUrl = canvas.toDataURL('image/jpeg', jpegQuality)
            if (dataUrl) {
              const bin = atob(dataUrl.split(',')[1])
              const u8 = new Uint8Array(bin.length)
              for (let k = 0; k < bin.length; k++) u8[k] = bin.charCodeAt(k)
              jpegBlob = new Blob([u8], { type: 'image/jpeg' })
            }
          }
          if (jpegBlob) {
            const jpegBuf = await jpegBlob.arrayBuffer()
            const embedded = await outDoc.embedJpg(jpegBuf)
            const origVp = page.getViewport({ scale: 1.0 })
            const p = outDoc.addPage([origVp.width, origVp.height])
            p.drawImage(embedded, { x: 0, y: 0, width: origVp.width, height: origVp.height })
          } else {
            const [copied] = await outDoc.copyPages(doc, [i - 1])
            outDoc.addPage(copied)
          }

          canvas.width = 0
          canvas.height = 0
          if (typeof page.cleanup === 'function') page.cleanup()
        }

        const rasterBytes = await outDoc.save({ useObjectStreams: true })
        if (rasterBytes.length < bestSize) {
          bestBytes = rasterBytes
          bestSize = rasterBytes.length
          rasterized = true
        }
      } else {
        reductionNotice = 'Preserved high-fidelity vector text streams without lossy rasterization.'
      }
    } catch (e) {
      console.warn('[PDF Compress] Raster downsampling skipped, preserved vector layout:', e)
    }
  }

  const savedBytes = Math.max(0, origSize - bestSize)
  const savedPct = origSize > 0 ? Math.round((savedBytes / origSize) * 100) : 0

  if (savedBytes === 0) {
    reductionNotice = 'Document is already optimally compressed. Preserved original file.'
    bestBytes = new Uint8Array(buf)
    bestSize = origSize
  }

  return {
    bytes: bestBytes,
    blob: new Blob([bestBytes], { type: 'application/pdf' }),
    name: `compressed-${file?.name || 'document.pdf'}`,
    origSize,
    size: bestSize,
    savedBytes,
    savedPct,
    reductionNotice,
    rasterized,
    pageCount: totalPages,
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
    isEncrypted: true,
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
    const loadingTask = pdfjs.getDocument(getPdfjsDocumentOptions(arrayBuffer.slice(0), { password }))
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
  const bufA = await toSafeArrayBuffer(fileA, true)
  const bufB = await toSafeArrayBuffer(fileB, true)

  const docA = await safeLoadPdfDocument(bufA, fileA?.name || 'documentA.pdf')
  const docB = await safeLoadPdfDocument(bufB, fileB?.name || 'documentB.pdf')

  const pagesA = docA.getPageCount()
  const pagesB = docB.getPageCount()
  const maxPages = Math.max(pagesA, pagesB)

  // 1. Metadata extraction & comparison
  const metaFields = [
    { field: 'Title', get: d => d.getTitle() },
    { field: 'Author', get: d => d.getAuthor() },
    { field: 'Subject', get: d => d.getSubject() },
    { field: 'Creator', get: d => d.getCreator() },
    { field: 'Producer', get: d => d.getProducer() },
    { field: 'Keywords', get: d => d.getKeywords() },
  ]

  const metaDiffs = []
  for (const m of metaFields) {
    const valA = m.get(docA) || ''
    const valB = m.get(docB) || ''
    if (valA !== valB) {
      metaDiffs.push({
        field: m.field,
        before: valA || '(empty)',
        after: valB || '(empty)',
      })
    }
  }

  // 2. Page-by-page comparison (geometry, rotation, and text content)
  let pageTextsA = []
  let pageTextsB = []

  if (typeof window !== 'undefined') {
    try {
      const pdfjs = await getPdfJs()
      const pdfjsDocA = await pdfjs.getDocument(getPdfjsDocumentOptions(bufA.slice(0))).promise
      const pdfjsDocB = await pdfjs.getDocument(getPdfjsDocumentOptions(bufB.slice(0))).promise

      for (let i = 1; i <= pagesA; i++) {
        const page = await pdfjsDocA.getPage(i)
        const textContent = await page.getTextContent()
        const text = textContent.items.map(it => it.str || '').join(' ').trim()
        pageTextsA.push(text)
        if (typeof page.cleanup === 'function') page.cleanup()
      }

      for (let i = 1; i <= pagesB; i++) {
        const page = await pdfjsDocB.getPage(i)
        const textContent = await page.getTextContent()
        const text = textContent.items.map(it => it.str || '').join(' ').trim()
        pageTextsB.push(text)
        if (typeof page.cleanup === 'function') page.cleanup()
      }
    } catch (e) {
      console.warn('[PDF Compare] PDF.js text layer extraction skipped, falling back to structural geometry:', e)
    }
  }

  const pageDiffs = []
  let identicalPagesCount = 0
  let modifiedPagesCount = 0
  let addedPagesCount = 0
  let removedPagesCount = 0

  for (let p = 1; p <= maxPages; p++) {
    if (p > pagesA) {
      // Page added in Doc B
      pageDiffs.push({
        page: p,
        status: 'added',
        desc: `Page ${p} exists only in Document B`,
      })
      addedPagesCount++
    } else if (p > pagesB) {
      // Page removed in Doc B
      pageDiffs.push({
        page: p,
        status: 'removed',
        desc: `Page ${p} was deleted in Document B`,
      })
      removedPagesCount++
    } else {
      // Page exists in both: compare geometry, rotation, and text
      const pageObjA = docA.getPage(p - 1)
      const pageObjB = docB.getPage(p - 1)
      const sizeA = pageObjA.getSize()
      const sizeB = pageObjB.getSize()
      const rotA = pageObjA.getRotation().angle
      const rotB = pageObjB.getRotation().angle

      const geomMatches = Math.abs(sizeA.width - sizeB.width) < 1 &&
                          Math.abs(sizeA.height - sizeB.height) < 1 &&
                          rotA === rotB

      const textA = pageTextsA[p - 1] !== undefined ? pageTextsA[p - 1] : null
      const textB = pageTextsB[p - 1] !== undefined ? pageTextsB[p - 1] : null
      const textMatches = textA === null || textB === null ? true : (textA === textB)

      if (geomMatches && textMatches) {
        pageDiffs.push({
          page: p,
          status: 'identical',
          desc: 'Identical layout and content',
        })
        identicalPagesCount++
      } else {
        const changes = []
        if (!geomMatches) {
          changes.push(`Dimensions: ${Math.round(sizeA.width)}×${Math.round(sizeA.height)}pt → ${Math.round(sizeB.width)}×${Math.round(sizeB.height)}pt`)
          if (rotA !== rotB) changes.push(`Rotation: ${rotA}° → ${rotB}°`)
        }
        if (!textMatches) {
          const wA = (textA || '').split(/\s+/).filter(Boolean).length
          const wB = (textB || '').split(/\s+/).filter(Boolean).length
          changes.push(`Text modified (${wA} words → ${wB} words)`)
        }
        pageDiffs.push({
          page: p,
          status: 'modified',
          desc: changes.join(' · ') || 'Visual or textual differences detected',
        })
        modifiedPagesCount++
      }
    }
  }

  const isIdentical = identicalPagesCount === maxPages && metaDiffs.length === 0 && pagesA === pagesB

  return {
    success: true,
    summary: isIdentical ? 'Documents are identical in layout, text, and metadata' : 'Differences detected between documents',
    fileA: {
      name: fileA?.name || 'Document A',
      size: fileA?.size || bufA.byteLength,
      pageCount: pagesA,
      title: docA.getTitle() || 'Untitled',
    },
    fileB: {
      name: fileB?.name || 'Document B',
      size: fileB?.size || bufB.byteLength,
      pageCount: pagesB,
      title: docB.getTitle() || 'Untitled',
    },
    samePageCount: pagesA === pagesB,
    pageDifference: Math.abs(pagesA - pagesB),
    pageCountDiff: pagesB - pagesA,
    sizeDiffBytes: (fileB.size || bufB.byteLength) - (fileA.size || bufA.byteLength),
    sizeDiff: (fileB.size || bufB.byteLength) - (fileA.size || bufA.byteLength),
    metaDiffs,
    pageDiffs,
    identicalPagesCount,
    modifiedPagesCount,
    addedPagesCount,
    removedPagesCount,
  }
}

/**
 * Sanitize filename for ZIP archive entries to prevent path traversal,
 * null byte injection, and directory structure hijacking.
 */
export function sanitizeZipFilename(name, fallback = 'document.pdf') {
  if (!name || typeof name !== 'string') return fallback
  let clean = name.replace(/\0/g, '')
  clean = clean.replace(/\\/g, '/')
  const segments = clean.split('/').filter(Boolean)
  clean = segments.pop() || fallback
  clean = clean.replace(/^(\.\.)+/, '').replace(/[\x00-\x1f\x7f]/g, '').trim()
  if (!clean || clean === '.' || clean === '..') clean = fallback
  if (clean.length > 180) {
    const dotIdx = clean.lastIndexOf('.')
    if (dotIdx > 0 && dotIdx > clean.length - 20) {
      const ext = clean.slice(dotIdx)
      clean = clean.slice(0, 180 - ext.length) + ext
    } else {
      clean = clean.slice(0, 180)
    }
  }
  return clean
}

export async function createZipFromFiles(items, zipFilename = 'export.zip', onProgress) {
  if (onProgress) onProgress('Archiving outputs into ZIP...')
  const zip = new JSZip()
  const usedNames = new Set()
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    let rawData = item
    if (item && typeof item === 'object') {
      if (item.blob) {
        rawData = item.blob
      } else if (item.bytes && typeof item.bytes !== 'function') {
        rawData = item.bytes
      } else if (item.file) {
        rawData = item.file
      }
    }
    const rawName = item?.name || `document_${i + 1}.pdf`
    let cleanName = sanitizeZipFilename(rawName, `document_${i + 1}.pdf`)

    // Disambiguate duplicate names in archive
    let finalEntryName = cleanName
    let base = cleanName
    let ext = ''
    const dot = cleanName.lastIndexOf('.')
    if (dot > 0) {
      base = cleanName.slice(0, dot)
      ext = cleanName.slice(dot)
    }
    let counter = 1
    while (usedNames.has(finalEntryName)) {
      finalEntryName = `${base}_(${counter})${ext}`
      counter++
    }
    usedNames.add(finalEntryName)

    // Convert rawData to Uint8Array safely across all environments (browser Blob/File, Node File/Buffer, Uint8Array, ArrayBuffer)
    const u8 = await toSafeUint8Array(rawData)
    zip.file(finalEntryName, u8)
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' }, metadata => {
    if (onProgress) onProgress(`Compressing archive: ${Math.round(metadata.percent)}%...`)
  })
  return {
    blob: zipBlob,
    name: sanitizeZipFilename(zipFilename, 'export.zip'),
    size: zipBlob.size,
  }
}
