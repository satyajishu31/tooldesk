import { PDFDocument, StandardFonts, rgb, degrees, PDFName } from 'pdf-lib'
import JSZip from 'jszip'

/* ══════════════════════════════════════════════════════════
   TOOLDESK PDF ENGINE — High-Performance Client-Side Processor
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

  // Never allow Infinity as practical processing limit
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

        // Reject huge range widths (e.g. 1-2000000000) before any loop execution
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
 * Format an array of 1-based page numbers into a concise human-readable range string (e.g. "1-3, 5, 8-10")
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
   1. CONVERT TO PDF ENGINES
   ══════════════════════════════════════════════════════════ */

/**
 * Renders structured blocks containing multi-language Unicode (Hindi, Chinese, Cyrillic, Arabic, Emoji)
 * with high-DPI canvas rasterization at 2x resolution, embedding crisp PNGs into PDFDocument.
 */
async function typesetUnicodeDocument(blocks, doc, options = {}) {
  const { width = PAGE_SIZES.A4.width, height = PAGE_SIZES.A4.height } = options.pageSize || PAGE_SIZES.A4
  const scale = 2
  const cWidth = Math.round(width * scale)
  const cHeight = Math.round(height * scale)
  const margin = Math.round((options.margin !== undefined ? options.margin : 54) * scale)
  const maxContentW = cWidth - margin * 2
  const bottomMargin = margin + Math.round(30 * scale)

  const fontStack = 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Devanagari", "Noto Sans SC", "Noto Sans Arabic", "Apple Color Emoji", sans-serif'
  const monoStack = 'SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'

  const canvas = document.createElement('canvas')
  canvas.width = cWidth
  canvas.height = cHeight
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, cWidth, cHeight)

  let cursorY = margin
  let pageNumber = 1
  const pagesBitmaps = []

  const flushPage = async () => {
    ctx.font = `${Math.round(8.5 * scale)}px ${fontStack}`
    ctx.fillStyle = '#64748b'
    if (options.title) {
      ctx.fillText(options.title, margin, margin - 12 * scale)
    }
    const pageStr = `Page ${pageNumber}`
    const numW = ctx.measureText(pageStr).width
    ctx.fillText(pageStr, cWidth - margin - numW, cHeight - margin + 20 * scale)

    const blob = await new Promise(res => canvas.toBlob(res, 'image/png'))
    const buf = await blob.arrayBuffer()
    pagesBitmaps.push(buf)

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, cWidth, cHeight)
    pageNumber++
    cursorY = margin
  }

  const checkPageBreak = async (needed) => {
    if (cursorY + needed > cHeight - bottomMargin) {
      await flushPage()
    }
  }

  const wrapCanvasText = (str, fontSize, isBold = false, isMono = false) => {
    ctx.font = `${isBold ? 'bold ' : ''}${fontSize}px ${isMono ? monoStack : fontStack}`
    const words = String(str || '').split(' ')
    const lines = []
    let cur = ''
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w
      if (ctx.measureText(test).width <= maxContentW) {
        cur = test
      } else {
        if (cur) lines.push(cur)
        if (ctx.measureText(w).width > maxContentW) {
          let sub = ''
          for (let c = 0; c < w.length; c++) {
            if (ctx.measureText(sub + w[c]).width > maxContentW && sub) {
              lines.push(sub)
              sub = w[c]
            } else {
              sub += w[c]
            }
          }
          cur = sub
        } else {
          cur = w
        }
      }
    }
    if (cur) lines.push(cur)
    return lines
  }

  for (const block of blocks) {
    if (block.type === 'hr') {
      await checkPageBreak(24 * scale)
      cursorY += 10 * scale
      ctx.strokeStyle = '#e2e8f0'
      ctx.lineWidth = 1 * scale
      ctx.beginPath()
      ctx.moveTo(margin, cursorY)
      ctx.lineTo(cWidth - margin, cursorY)
      ctx.stroke()
      cursorY += 14 * scale
      continue
    }

    if (block.type === 'codeblock') {
      const fontSize = Math.round(9.5 * scale)
      const lineHeight = Math.round(14 * scale)
      const rawLines = (block.text || '').split('\n')
      await checkPageBreak(rawLines.length * lineHeight + 20 * scale)

      ctx.fillStyle = '#f8fafc'
      const startY = cursorY
      let codeHeight = 0
      for (const line of rawLines) {
        const wrapped = wrapCanvasText(line, fontSize, false, true)
        codeHeight += wrapped.length * lineHeight
      }
      ctx.fillRect(margin, startY, maxContentW, codeHeight + 16 * scale)

      cursorY += 10 * scale
      ctx.fillStyle = '#1e293b'
      for (const line of rawLines) {
        const wrapped = wrapCanvasText(line, fontSize, false, true)
        for (const wl of wrapped) {
          await checkPageBreak(lineHeight)
          ctx.fillText(wl, margin + 10 * scale, cursorY + fontSize)
          cursorY += lineHeight
        }
      }
      cursorY += 12 * scale
      continue
    }

    let fontSize = Math.round(11 * scale)
    let lineHeight = Math.round(16 * scale)
    let isBold = false
    let color = '#0f172a'
    let prefix = ''

    if (block.type === 'h1') {
      fontSize = Math.round(18 * scale)
      lineHeight = Math.round(25 * scale)
      isBold = true
      cursorY += 10 * scale
    } else if (block.type === 'h2') {
      fontSize = Math.round(15 * scale)
      lineHeight = Math.round(21 * scale)
      isBold = true
      cursorY += 8 * scale
    } else if (block.type === 'h3') {
      fontSize = Math.round(13 * scale)
      lineHeight = Math.round(18 * scale)
      isBold = true
      cursorY += 6 * scale
    } else if (block.type === 'bullet') {
      prefix = '•  '
    } else if (block.type === 'quote') {
      color = '#475569'
      prefix = '│  '
    }

    const wrapped = wrapCanvasText(prefix + (block.text || ''), fontSize, isBold, false)
    for (const line of wrapped) {
      await checkPageBreak(lineHeight)
      ctx.font = `${isBold ? 'bold ' : ''}${fontSize}px ${fontStack}`
      ctx.fillStyle = color
      ctx.fillText(line, margin, cursorY + fontSize)
      cursorY += lineHeight
    }
    cursorY += 4 * scale
  }

  await flushPage()

  for (const pageBuf of pagesBitmaps) {
    const embeddedImg = await doc.embedPng(pageBuf)
    const page = doc.addPage([width, height])
    page.drawImage(embeddedImg, { x: 0, y: 0, width, height })
  }

  canvas.width = 0
  canvas.height = 0

  return await doc.save()
}

/**
 * Typeset multi-line structured text blocks into PDFDocument
 */
async function typesetDocument(blocks, doc, options = {}) {
  // If input contains non-WinAnsi Unicode (Hindi, Chinese, Arabic, Cyrillic, Emoji), route to high-DPI canvas typesetter
  const allText = blocks.map(b => b.text || '').join(' ')
  if (typeof document !== 'undefined' && /[^\x00-\x7F\xA0-\xFF]/.test(allText)) {
    return await typesetUnicodeDocument(blocks, doc, options)
  }

  const fontRegular = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)
  const fontMono = await doc.embedFont(StandardFonts.Courier)
  const fontMonoBold = await doc.embedFont(StandardFonts.CourierBold)

  const { width = PAGE_SIZES.A4.width, height = PAGE_SIZES.A4.height } = options.pageSize || PAGE_SIZES.A4
  const margin = options.margin !== undefined ? options.margin : 54
  const contentWidth = width - margin * 2
  const bottomMargin = margin + 30 // reserve footer space

  let page = doc.addPage([width, height])
  let cursorY = height - margin
  let pageNumber = 1

  const addHeaderFooter = (p, pNum) => {
    if (options.title) {
      p.drawText(sanitizeWinAnsi(options.title), {
        x: margin,
        y: height - margin + 18,
        size: 8,
        font: fontRegular,
        color: rgb(0.5, 0.5, 0.55),
      })
    }
    const numText = `Page ${pNum}`
    const numWidth = fontRegular.widthOfTextAtSize(numText, 9)
    p.drawText(numText, {
      x: width - margin - numWidth,
      y: margin - 20,
      size: 9,
      font: fontRegular,
      color: rgb(0.5, 0.5, 0.55),
    })
  }

  addHeaderFooter(page, pageNumber)

  const checkPageBreak = (neededHeight) => {
    if (cursorY - neededHeight < bottomMargin) {
      page = doc.addPage([width, height])
      pageNumber++
      cursorY = height - margin
      addHeaderFooter(page, pageNumber)
    }
  }

  // Helper to split text into wrapped lines given font and size
  const wrapText = (text, font, size, maxWidth) => {
    const clean = sanitizeWinAnsi(text)
    if (!clean.trim()) return ['']
    const words = clean.split(' ')
    const lines = []
    let currentLine = ''

    for (let i = 0; i < words.length; i++) {
      const word = words[i]
      const testLine = currentLine ? `${currentLine} ${word}` : word
      const textWidth = font.widthOfTextAtSize(testLine, size)

      if (textWidth <= maxWidth) {
        currentLine = testLine
      } else {
        if (currentLine) {
          lines.push(currentLine)
          currentLine = word
        } else {
          // Word itself is wider than maxWidth -> split word
          let sub = ''
          for (let c = 0; c < word.length; c++) {
            const testChar = sub + word[c]
            if (font.widthOfTextAtSize(testChar, size) <= maxWidth) {
              sub = testChar
            } else {
              lines.push(sub)
              sub = word[c]
            }
          }
          currentLine = sub
        }
      }
    }
    if (currentLine) lines.push(currentLine)
    return lines
  }

  for (const block of blocks) {
    if (block.type === 'hr') {
      checkPageBreak(24)
      cursorY -= 10
      page.drawLine({
        start: { x: margin, y: cursorY },
        end: { x: width - margin, y: cursorY },
        thickness: 1,
        color: rgb(0.85, 0.85, 0.9),
      })
      cursorY -= 14
      continue
    }

    if (block.type === 'codeblock') {
      const rawLines = block.text.split('\n')
      const codeFontSize = 9.5
      const lineHeight = 13.5
      const padding = 8

      checkPageBreak(lineHeight + padding * 2)
      cursorY -= 4

      for (const line of rawLines) {
        const wrapped = wrapText(line, fontMono, codeFontSize, contentWidth - padding * 2)
        for (const wLine of wrapped) {
          checkPageBreak(lineHeight)
          page.drawRectangle({
            x: margin,
            y: cursorY - 2,
            width: contentWidth,
            height: lineHeight,
            color: rgb(0.96, 0.96, 0.98),
          })
          page.drawText(wLine, {
            x: margin + padding,
            y: cursorY,
            size: codeFontSize,
            font: fontMono,
            color: rgb(0.15, 0.15, 0.25),
          })
          cursorY -= lineHeight
        }
      }
      cursorY -= 6
      continue
    }

    if (block.type === 'table') {
      const rows = block.rows || []
      if (!rows.length) continue
      const colCount = Math.max(...rows.map(r => r.length))
      if (colCount === 0) continue

      const colWidth = contentWidth / colCount
      const cellPadding = 6
      const rowFontSize = 9
      const rowLineHeight = 12

      for (let rIdx = 0; rIdx < rows.length; rIdx++) {
        const row = rows[rIdx]
        const isHeader = rIdx === 0 && block.hasHeader
        const font = isHeader ? fontBold : fontRegular

        // Calculate needed row height
        let maxLines = 1
        const wrappedCells = row.map(cell => {
          const lines = wrapText(String(cell || ''), font, rowFontSize, colWidth - cellPadding * 2)
          if (lines.length > maxLines) maxLines = lines.length
          return lines
        })
        const rowHeight = maxLines * rowLineHeight + cellPadding * 2

        checkPageBreak(rowHeight)

        // Draw row background
        if (isHeader) {
          page.drawRectangle({
            x: margin,
            y: cursorY - rowHeight,
            width: contentWidth,
            height: rowHeight,
            color: rgb(0.92, 0.94, 0.98),
          })
        } else if (rIdx % 2 === 1) {
          page.drawRectangle({
            x: margin,
            y: cursorY - rowHeight,
            width: contentWidth,
            height: rowHeight,
            color: rgb(0.98, 0.98, 1.0),
          })
        }

        // Draw cell contents and vertical borders
        for (let cIdx = 0; cIdx < colCount; cIdx++) {
          const cellX = margin + cIdx * colWidth
          const cellLines = wrappedCells[cIdx] || []

          let textY = cursorY - cellPadding - rowFontSize
          for (const l of cellLines) {
            page.drawText(l, {
              x: cellX + cellPadding,
              y: textY,
              size: rowFontSize,
              font,
              color: isHeader ? rgb(0.1, 0.15, 0.25) : rgb(0.18, 0.18, 0.2),
            })
            textY -= rowLineHeight
          }

          // Column divider
          if (cIdx > 0) {
            page.drawLine({
              start: { x: cellX, y: cursorY },
              end: { x: cellX, y: cursorY - rowHeight },
              thickness: 0.5,
              color: rgb(0.85, 0.88, 0.92),
            })
          }
        }

        // Row border
        page.drawLine({
          start: { x: margin, y: cursorY - rowHeight },
          end: { x: margin + contentWidth, y: cursorY - rowHeight },
          thickness: isHeader ? 1 : 0.5,
          color: isHeader ? rgb(0.7, 0.75, 0.85) : rgb(0.85, 0.88, 0.92),
        })

        cursorY -= rowHeight
      }
      cursorY -= 12
      continue
    }

    // Standard Typography Blocks (h1, h2, h3, p, bullet, quote)
    let fontSize = 11
    let lineHeight = 16
    let font = fontRegular
    let textColor = rgb(0.12, 0.12, 0.16)
    let indentX = 0
    let spaceBefore = 6
    let spaceAfter = 6

    if (block.type === 'h1') {
      fontSize = 22
      lineHeight = 27
      font = fontBold
      textColor = rgb(0.05, 0.08, 0.15)
      spaceBefore = 18
      spaceAfter = 8
    } else if (block.type === 'h2') {
      fontSize = 16
      lineHeight = 21
      font = fontBold
      textColor = rgb(0.08, 0.12, 0.2)
      spaceBefore = 14
      spaceAfter = 6
    } else if (block.type === 'h3') {
      fontSize = 13
      lineHeight = 18
      font = fontBold
      textColor = rgb(0.12, 0.16, 0.25)
      spaceBefore = 10
      spaceAfter = 4
    } else if (block.type === 'bullet') {
      indentX = 14
      spaceBefore = 2
      spaceAfter = 3
    } else if (block.type === 'quote') {
      indentX = 16
      font = fontRegular
      textColor = rgb(0.35, 0.35, 0.45)
      spaceBefore = 8
      spaceAfter = 8
    }

    const usableWidth = contentWidth - indentX
    const wrappedLines = wrapText(block.text || '', font, fontSize, usableWidth)
    const blockHeight = wrappedLines.length * lineHeight + spaceBefore + spaceAfter

    checkPageBreak(blockHeight)
    cursorY -= spaceBefore

    if (block.type === 'quote') {
      // Draw left quote accent bar
      page.drawLine({
        start: { x: margin + 4, y: cursorY + 2 },
        end: { x: margin + 4, y: cursorY - wrappedLines.length * lineHeight + 2 },
        thickness: 2.5,
        color: rgb(0.31, 0.56, 0.97), // #4F8EF7
      })
    }

    for (let i = 0; i < wrappedLines.length; i++) {
      const lineText = wrappedLines[i]
      if (block.type === 'bullet' && i === 0) {
        page.drawText('•', {
          x: margin + 4,
          y: cursorY,
          size: fontSize + 2,
          font: fontBold,
          color: rgb(0.31, 0.56, 0.97),
        })
      }

      page.drawText(lineText, {
        x: margin + indentX,
        y: cursorY,
        size: fontSize,
        font,
        color: textColor,
      })
      cursorY -= lineHeight
    }

    cursorY -= spaceAfter
  }

  return await doc.save()
}

/**
 * 1A. DOCX → PDF
 * Parses Word (.docx) documents into structured headings, paragraphs, lists, and tables,
 * then typesets into a crisp vector PDF document.
 */
export async function convertDocxToPdf(file, onProgress) {
  if (onProgress) onProgress('Reading Word document structure...')
  const arrayBuffer = await file.arrayBuffer()

  if (onProgress) onProgress('Extracting headings, tables, and paragraphs...')
  const { default: mammoth } = await import('mammoth')
  const buffer = typeof Buffer !== 'undefined' ? Buffer.from(arrayBuffer) : arrayBuffer
  const result = await mammoth.convertToHtml({ arrayBuffer, buffer })
  const html = result.value || ''

  if (!html.trim()) {
    throw new Error('The Word document does not contain any readable text or supported formatting.')
  }

  if (onProgress) onProgress('Typesetting vector PDF document...')
  const doc = await PDFDocument.create()
  doc.setTitle(file.name.replace(/\.docx?$/i, ''))
  doc.setCreator('ToolDesk PDF Studio')
  doc.setProducer('ToolDesk Engine via mammoth & pdf-lib')

  const blocks = []

  if (typeof DOMParser !== 'undefined') {
    const parser = new DOMParser()
    const dom = parser.parseFromString(`<div>${html}</div>`, 'text/html')

    const walkNodes = (parent) => {
      for (const node of parent.childNodes) {
        if (node.nodeType === 1) { // ELEMENT_NODE
          const tag = node.tagName.toLowerCase()
          const text = node.textContent?.trim() || ''

          if (tag === 'h1') blocks.push({ type: 'h1', text })
          else if (tag === 'h2') blocks.push({ type: 'h2', text })
          else if (tag === 'h3' || tag === 'h4') blocks.push({ type: 'h3', text })
          else if (tag === 'p' && text) blocks.push({ type: 'p', text })
          else if (tag === 'li' && text) blocks.push({ type: 'bullet', text })
          else if (tag === 'blockquote' && text) blocks.push({ type: 'quote', text })
          else if (tag === 'table') {
            const rows = []
            const trs = node.querySelectorAll('tr')
            trs.forEach(tr => {
              const cells = Array.from(tr.querySelectorAll('th, td')).map(td => td.textContent?.trim() || '')
              if (cells.length) rows.push(cells)
            })
            if (rows.length) {
              blocks.push({ type: 'table', rows, hasHeader: node.querySelector('th') !== null })
            }
          } else if (node.hasChildNodes()) {
            walkNodes(node)
          }
        }
      }
    }
    walkNodes(dom.body)
  } else {
    // Fallback regex parser for Node test environments
    const pMatches = html.match(/<(h[1-4]|p|li|blockquote)[^>]*>([\s\S]*?)<\/\1>/gi) || []
    for (const match of pMatches) {
      const tagMatch = match.match(/<(h[1-4]|p|li|blockquote)[^>]*>([\s\S]*?)<\/\1>/i)
      if (tagMatch) {
        const tag = tagMatch[1].toLowerCase()
        const text = tagMatch[2].replace(/<[^>]+>/g, '').trim()
        if (text) {
          if (tag === 'h1') blocks.push({ type: 'h1', text })
          else if (tag === 'h2') blocks.push({ type: 'h2', text })
          else if (tag === 'h3' || tag === 'h4') blocks.push({ type: 'h3', text })
          else if (tag === 'li') blocks.push({ type: 'bullet', text })
          else if (tag === 'blockquote') blocks.push({ type: 'quote', text })
          else blocks.push({ type: 'p', text })
        }
      }
    }
  }
  if (!blocks.length) {
    blocks.push({ type: 'p', text: dom.body.textContent?.trim() || 'Empty Document' })
  }

  const pdfBytes = await typesetDocument(blocks, doc, {
    title: file.name.replace(/\.docx?$/i, ''),
  })

  return {
    bytes: pdfBytes,
    blob: new Blob([pdfBytes], { type: 'application/pdf' }),
    name: `${file.name.replace(/\.docx?$/i, '')}.pdf`,
    size: pdfBytes.length,
  }
}

/**
 * 1B. Images → PDF (Single or Multiple Images)
 * Supports PNG, JPEG, WebP, GIF, SVG, BMP.
 * Options: pageSize ('FIT', 'A4', 'LETTER'), orientation ('AUTO', 'PORTRAIT', 'LANDSCAPE'), margin (0, 20, 36)
 */
export async function convertImagesToPdf(files, options = {}, onProgress) {
  if (!files || !files.length) throw new Error('No images provided for PDF conversion.')

  const doc = await PDFDocument.create()
  doc.setCreator('ToolDesk PDF Studio')
  doc.setProducer('ToolDesk Engine')

  const { pageSize = 'A4', orientation = 'AUTO', margin = 20 } = options

  for (let idx = 0; idx < files.length; idx++) {
    const file = files[idx]
    if (onProgress) onProgress(`Processing image ${idx + 1} of ${files.length}: ${file.name}...`)

    // Load image into HTML Image object via ObjectURL
    const imgObj = await new Promise((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Failed to decode image: ${file.name}`)) }
      img.src = url
    })

    const naturalWidth = imgObj.naturalWidth || imgObj.width || 800
    const naturalHeight = imgObj.naturalHeight || imgObj.height || 600

    let renderW = naturalWidth
    let renderH = naturalHeight
    const MAX_IMG_DIM = 2560
    if (renderW > MAX_IMG_DIM || renderH > MAX_IMG_DIM) {
      if (renderW > renderH) {
        renderH = Math.round((naturalHeight * MAX_IMG_DIM) / naturalWidth)
        renderW = MAX_IMG_DIM
      } else {
        renderW = Math.round((naturalWidth * MAX_IMG_DIM) / naturalHeight)
        renderH = MAX_IMG_DIM
      }
    }

    // Render to offscreen canvas and convert to PNG Blob for crisp embedding
    const canvas = document.createElement('canvas')
    canvas.width = renderW
    canvas.height = renderH
    const ctx = canvas.getContext('2d')
    ctx.drawImage(imgObj, 0, 0, renderW, renderH)

    const pngBlob = await new Promise(r => canvas.toBlob(r, 'image/png'))
    if (!pngBlob) throw new Error(`Failed to encode image "${file.name}" to PNG.`)
    const pngArrayBuffer = await pngBlob.arrayBuffer()
    const embeddedImage = await doc.embedPng(pngArrayBuffer)

    let targetWidth, targetHeight
    const numericMargin = typeof margin === 'number'
      ? Math.max(0, margin)
      : (margin === 'none' || margin === '0' ? 0 : (margin === 'large' ? 36 : (margin === 'small' ? 10 : 20)))

    if (pageSize === 'FIT') {
      targetWidth = naturalWidth + numericMargin * 2
      targetHeight = naturalHeight + numericMargin * 2
    } else {
      const std = PAGE_SIZES[pageSize] || PAGE_SIZES.A4
      if (orientation === 'LANDSCAPE') {
        targetWidth = std.height
        targetHeight = std.width
      } else if (orientation === 'PORTRAIT') {
        targetWidth = std.width
        targetHeight = std.height
      } else {
        // AUTO orientation based on image aspect ratio
        if (naturalWidth > naturalHeight) {
          targetWidth = std.height
          targetHeight = std.width
        } else {
          targetWidth = std.width
          targetHeight = std.height
        }
      }
    }

    const page = doc.addPage([targetWidth, targetHeight])
    const maxDrawWidth = targetWidth - numericMargin * 2
    const maxDrawHeight = targetHeight - numericMargin * 2

    // Scale image while preserving aspect ratio
    const scale = Math.min(maxDrawWidth / naturalWidth, maxDrawHeight / naturalHeight)
    const drawWidth = naturalWidth * scale
    const drawHeight = naturalHeight * scale
    const drawX = numericMargin + (maxDrawWidth - drawWidth) / 2
    const drawY = numericMargin + (maxDrawHeight - drawHeight) / 2

    page.drawImage(embeddedImage, {
      x: drawX,
      y: drawY,
      width: drawWidth,
      height: drawHeight,
    })
  }

  if (onProgress) onProgress('Compiling PDF...')
  const pdfBytes = await doc.save()
  const defaultName = files.length === 1
    ? `${files[0].name.replace(/\.[^.]+$/, '')}.pdf`
    : 'combined-images.pdf'

  return {
    bytes: pdfBytes,
    blob: new Blob([pdfBytes], { type: 'application/pdf' }),
    name: defaultName,
    size: pdfBytes.length,
  }
}

/**
 * 1C. Plain Text (.txt) → PDF
 */
export async function convertTextToPdf(text, options = {}) {
  const doc = await PDFDocument.create()
  doc.setCreator('ToolDesk PDF Studio')
  const lines = text.split(/\r?\n/)
  const blocks = lines.map(line => ({ type: 'p', text: line || ' ' }))

  const pdfBytes = await typesetDocument(blocks, doc, {
    title: options.title || 'Document',
    margin: options.margin || 54,
  })

  return {
    bytes: pdfBytes,
    blob: new Blob([pdfBytes], { type: 'application/pdf' }),
    size: pdfBytes.length,
  }
}

/**
 * 1D. Markdown (.md) → PDF
 */
export async function convertMarkdownToPdf(markdown, options = {}) {
  const doc = await PDFDocument.create()
  doc.setCreator('ToolDesk PDF Studio')

  const lines = markdown.split(/\r?\n/)
  const blocks = []
  let inCodeBlock = false
  let codeBuffer = []

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    if (raw.startsWith('```')) {
      if (inCodeBlock) {
        blocks.push({ type: 'codeblock', text: codeBuffer.join('\n') })
        codeBuffer = []
        inCodeBlock = false
      } else {
        inCodeBlock = true
      }
      continue
    }

    if (inCodeBlock) {
      codeBuffer.push(raw)
      continue
    }

    const trimmed = raw.trim()
    if (!trimmed) continue

    if (trimmed.startsWith('# ')) {
      blocks.push({ type: 'h1', text: trimmed.replace(/^#\s+/, '') })
    } else if (trimmed.startsWith('## ')) {
      blocks.push({ type: 'h2', text: trimmed.replace(/^##\s+/, '') })
    } else if (trimmed.startsWith('### ')) {
      blocks.push({ type: 'h3', text: trimmed.replace(/^###\s+/, '') })
    } else if (/^[-*+]\s+/.test(trimmed)) {
      blocks.push({ type: 'bullet', text: trimmed.replace(/^[-*+]\s+/, '') })
    } else if (trimmed.startsWith('> ')) {
      blocks.push({ type: 'quote', text: trimmed.replace(/^>\s+/, '') })
    } else if (/^[-*_]{3,}$/.test(trimmed)) {
      blocks.push({ type: 'hr' })
    } else {
      blocks.push({ type: 'p', text: trimmed })
    }
  }

  if (inCodeBlock && codeBuffer.length) {
    blocks.push({ type: 'codeblock', text: codeBuffer.join('\n') })
  }

  const pdfBytes = await typesetDocument(blocks, doc, {
    title: options.title || 'Markdown Document',
  })

  return {
    bytes: pdfBytes,
    blob: new Blob([pdfBytes], { type: 'application/pdf' }),
    size: pdfBytes.length,
  }
}

/**
 * 1E. HTML → PDF
 */
export async function convertHtmlToPdf(htmlString, options = {}) {
  const doc = await PDFDocument.create()
  doc.setCreator('ToolDesk PDF Studio')

  const blocks = []

  if (typeof DOMParser !== 'undefined') {
    const parser = new DOMParser()
    const dom = parser.parseFromString(`<div>${htmlString}</div>`, 'text/html')

    const walk = (el) => {
      for (const node of el.childNodes) {
        if (node.nodeType === 1) { // ELEMENT_NODE
          const tag = node.tagName.toLowerCase()
          const text = node.textContent?.trim() || ''

          if (tag === 'h1') blocks.push({ type: 'h1', text })
          else if (tag === 'h2') blocks.push({ type: 'h2', text })
          else if (tag === 'h3' || tag === 'h4') blocks.push({ type: 'h3', text })
          else if (tag === 'p' && text) blocks.push({ type: 'p', text })
          else if (tag === 'li' && text) blocks.push({ type: 'bullet', text })
          else if (tag === 'blockquote' && text) blocks.push({ type: 'quote', text })
          else if (tag === 'pre' || tag === 'code') blocks.push({ type: 'codeblock', text: node.textContent || '' })
          else if (tag === 'hr') blocks.push({ type: 'hr' })
          else if (tag === 'table') {
            const rows = []
            node.querySelectorAll('tr').forEach(tr => {
              const cells = Array.from(tr.querySelectorAll('th, td')).map(td => td.textContent?.trim() || '')
              if (cells.length) rows.push(cells)
            })
            if (rows.length) blocks.push({ type: 'table', rows, hasHeader: node.querySelector('th') !== null })
          } else if (node.hasChildNodes()) {
            walk(node)
          }
        }
      }
    }
    walk(dom.body)
  } else {
    // Fallback parser when DOMParser is unavailable (e.g. Node environments)
    const stripped = htmlString.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    const pMatches = stripped.match(/<(h[1-4]|p|li|pre|blockquote)[^>]*>([\s\S]*?)<\/\1>/gi) || []
    for (const match of pMatches) {
      const tagMatch = match.match(/<(h[1-4]|p|li|pre|blockquote)[^>]*>([\s\S]*?)<\/\1>/i)
      if (tagMatch) {
        const tag = tagMatch[1].toLowerCase()
        const text = tagMatch[2].replace(/<[^>]+>/g, '').trim()
        if (text) {
          if (tag === 'h1') blocks.push({ type: 'h1', text })
          else if (tag === 'h2') blocks.push({ type: 'h2', text })
          else if (tag === 'h3' || tag === 'h4') blocks.push({ type: 'h3', text })
          else if (tag === 'li') blocks.push({ type: 'bullet', text })
          else if (tag === 'blockquote') blocks.push({ type: 'quote', text })
          else if (tag === 'pre') blocks.push({ type: 'codeblock', text })
          else blocks.push({ type: 'p', text })
        }
      }
    }
  }

  if (!blocks.length) {
    const rawText = htmlString.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    blocks.push({ type: 'p', text: rawText || 'Empty HTML Document' })
  }

  const pdfBytes = await typesetDocument(blocks, doc, {
    title: options.title || 'HTML Document',
  })

  return {
    bytes: pdfBytes,
    blob: new Blob([pdfBytes], { type: 'application/pdf' }),
    size: pdfBytes.length,
  }
}

/**
 * Helper to parse CSV string handling quoted cells and commas
 */
function parseCsv(csvText) {
  const rows = []
  let currentRow = []
  let currentVal = ''
  let inQuotes = false

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i]
    if (char === '"') {
      if (inQuotes && csvText[i + 1] === '"') {
        currentVal += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentVal.trim())
      currentVal = ''
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && csvText[i + 1] === '\n') i++
      currentRow.push(currentVal.trim())
      currentVal = ''
      if (currentRow.some(c => c.length > 0)) rows.push(currentRow)
      currentRow = []
    } else {
      currentVal += char
    }
  }
  if (currentVal.length > 0 || currentRow.length > 0) {
    currentRow.push(currentVal.trim())
    if (currentRow.some(c => c.length > 0)) rows.push(currentRow)
  }
  return rows
}

/**
 * 1F. CSV → PDF
 * Formats CSV into structured, zebra-striped tables
 */
export async function convertCsvToPdf(csvText, options = {}) {
  const rows = parseCsv(csvText)
  if (!rows.length) throw new Error('CSV document is empty.')

  const doc = await PDFDocument.create()
  doc.setCreator('ToolDesk PDF Studio')

  const blocks = [
    { type: 'h1', text: options.title || 'CSV Data Export' },
    { type: 'table', rows, hasHeader: true },
  ]

  const pdfBytes = await typesetDocument(blocks, doc, {
    title: options.title || 'CSV Report',
  })

  return {
    bytes: pdfBytes,
    blob: new Blob([pdfBytes], { type: 'application/pdf' }),
    size: pdfBytes.length,
  }
}

/**
 * 1G. JSON → PDF
 * Handles both JSON arrays (as structured data tables) and nested objects (as pretty-printed code)
 */
export async function convertJsonToPdf(jsonText, options = {}) {
  let parsed
  try {
    parsed = JSON.parse(jsonText)
  } catch (err) {
    throw new Error(`Invalid JSON syntax: ${err.message}`)
  }

  const doc = await PDFDocument.create()
  doc.setCreator('ToolDesk PDF Studio')

  const blocks = [
    { type: 'h1', text: options.title || 'JSON Data Export' },
  ]

  if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null) {
    const keys = Object.keys(parsed[0])
    const rows = [keys]
    for (const item of parsed) {
      rows.push(keys.map(k => {
        const v = item[k]
        return typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')
      }))
    }
    blocks.push({ type: 'table', rows, hasHeader: true })
  } else {
    blocks.push({
      type: 'codeblock',
      text: JSON.stringify(parsed, null, 2),
    })
  }

  const pdfBytes = await typesetDocument(blocks, doc, {
    title: options.title || 'JSON Document',
  })

  return {
    bytes: pdfBytes,
    blob: new Blob([pdfBytes], { type: 'application/pdf' }),
    size: pdfBytes.length,
  }
}

/**
 * 1H. XML → PDF
 */
export async function convertXmlToPdf(xmlText, options = {}) {
  if (typeof DOMParser !== 'undefined') {
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml')
    const parserError = xmlDoc.querySelector('parsererror')
    if (parserError) {
      throw new Error(`XML Parsing error: ${parserError.textContent?.slice(0, 100)}`)
    }
  }

  const doc = await PDFDocument.create()
  doc.setCreator('ToolDesk PDF Studio')

  // Format XML with pretty indentation
  const formatXml = (xmlStr) => {
    let formatted = ''
    let indent = ''
    const tab = '  '
    xmlStr.split(/>\s*</).forEach(node => {
      if (node.match(/^\/\w/)) indent = indent.substring(tab.length)
      formatted += indent + '<' + node + '>\n'
      if (node.match(/^<?\w[^>]*[^\/]$/)) indent += tab
    })
    return formatted.substring(1, formatted.length - 2)
  }

  const blocks = [
    { type: 'h1', text: options.title || 'XML Document Export' },
    { type: 'codeblock', text: formatXml(xmlText) },
  ]

  const pdfBytes = await typesetDocument(blocks, doc, {
    title: options.title || 'XML Document',
  })

  return {
    bytes: pdfBytes,
    blob: new Blob([pdfBytes], { type: 'application/pdf' }),
    size: pdfBytes.length,
  }
}

/* ══════════════════════════════════════════════════════════
   2. CONVERT FROM PDF ENGINES (PDF → PNG, PDF → JPG)
   ══════════════════════════════════════════════════════════ */

/**
 * Render all or specific PDF pages to PNG/JPG canvas images using PDF.js
 * @param {File|Blob|ArrayBuffer} file
 * @param {'image/png'|'image/jpeg'} format
 * @param {number} dpi - 150 (standard) or 300 (high-res)
 * @param {Function} onProgress
 */
export async function renderPdfPagesToImages(file, format = 'image/png', dpi = 150, onProgress) {
  const pdfjs = await getPdfJs()
  const arrayBuffer = file instanceof ArrayBuffer ? file : await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer), isEvalSupported: false, enableScripting: false }).promise

  const totalPages = pdf.numPages
  const pages = []
  const scale = dpi === 300 ? 3.0 : 1.75 // 1.75 ~= 126 DPI / crisp screen; 3.0 ~= 216+ DPI

  try {
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      if (onProgress) onProgress(`Rendering page ${pageNum} of ${totalPages}...`, pageNum, totalPages)

      const page = await pdf.getPage(pageNum)
      try {
        const viewport = page.getViewport({ scale })
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(viewport.width)
        canvas.height = Math.round(viewport.height)
        const ctx = canvas.getContext('2d')

        // Fill white background for JPEG rendering
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        await page.render({ canvasContext: ctx, viewport }).promise

        const blob = await new Promise(r => canvas.toBlob(r, format, format === 'image/jpeg' ? 0.92 : undefined))
        if (!blob) throw new Error(`Failed to render page ${pageNum} to image.`)
        const dataUrl = canvas.toDataURL(format, format === 'image/jpeg' ? 0.92 : undefined)
        const ext = format === 'image/jpeg' ? 'jpg' : 'png'

        pages.push({
          pageNumber: pageNum,
          blob,
          dataUrl,
          width: canvas.width,
          height: canvas.height,
          name: `page-${pageNum}.${ext}`,
          size: blob.size,
        })
      } finally {
        if (typeof page.cleanup === 'function') page.cleanup()
      }
    }
  } finally {
    if (typeof pdf.destroy === 'function') {
      try { await pdf.destroy() } catch { }
    }
  }

  return pages
}

/**
 * Fast generation of low-res page thumbnails for visual selection/organization
 */
export async function generatePdfThumbnails(file, maxPages = 60, onProgress) {
  const pdfjs = await getPdfJs()
  const arrayBuffer = file instanceof ArrayBuffer ? file : await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer), isEvalSupported: false, enableScripting: false }).promise

  const totalPages = pdf.numPages
  const count = Math.min(totalPages, maxPages)
  const thumbnails = []

  try {
    for (let pageNum = 1; pageNum <= count; pageNum++) {
      if (onProgress) onProgress(`Generating thumbnail ${pageNum} of ${count}...`, pageNum, count)

      const page = await pdf.getPage(pageNum)
      try {
        // Thumbnail scale ~0.35 (typically ~210x297px)
        const viewport = page.getViewport({ scale: 0.35 })
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(viewport.width)
        canvas.height = Math.round(viewport.height)
        const ctx = canvas.getContext('2d')

        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        await page.render({ canvasContext: ctx, viewport }).promise

        thumbnails.push({
          pageNumber: pageNum,
          thumbnailUrl: canvas.toDataURL('image/jpeg', 0.8),
          aspectRatio: viewport.width / viewport.height,
        })
      } finally {
        if (typeof page.cleanup === 'function') page.cleanup()
      }
    }
  } finally {
    if (typeof pdf.destroy === 'function') {
      try { await pdf.destroy() } catch { }
    }
  }

  return {
    totalPages,
    thumbnails,
  }
}

/* ══════════════════════════════════════════════════════════
   3. PDF ORGANIZATION ENGINES (Merge, Split, Extract, Reorder, Delete, Rotate)
   ══════════════════════════════════════════════════════════ */

/**
 * Merge multiple PDF files into one
 */
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
  const pdfBytes = await mergedDoc.save()

  return {
    bytes: pdfBytes,
    blob: new Blob([pdfBytes], { type: 'application/pdf' }),
    name: 'merged-document.pdf',
    size: pdfBytes.length,
    pageCount: mergedDoc.getPageCount(),
  }
}

/**
 * Split PDF: Extract specific pages or all pages into separate PDFs
 * @param {File} file
 * @param {number[]} pageIndices - 0-indexed page numbers to extract
 * @param {Function} onProgress
 */
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

    // Yield control to event loop every 5 pages
    if (i % 5 === 0) await new Promise(r => setTimeout(r, 0))
  }

  return results
}

/**
 * Extract selected pages into a single new consolidated PDF
 */
export async function extractPagesToSinglePdf(file, selectedPages, onProgress) {
  const fileName = file?.name || 'document.pdf'
  const srcDoc = await safeLoadPdfDocument(file, fileName)
  const totalPages = srcDoc.getPageCount()

  // Convert 1-based page numbers to 0-based indices
  const indices = selectedPages
    .map(p => p - 1)
    .filter(i => i >= 0 && i < totalPages)

  if (!indices.length) throw new Error('Please select at least one page to extract.')

  if (onProgress) onProgress(`Extracting ${indices.length} pages into new document...`)
  const newDoc = await PDFDocument.create()
  const copiedPages = await newDoc.copyPages(srcDoc, indices)
  copiedPages.forEach(p => newDoc.addPage(p))

  const bytes = await newDoc.save()
  const originalName = fileName.replace(/\.pdf$/i, '')

  return {
    bytes,
    blob: new Blob([bytes], { type: 'application/pdf' }),
    name: `${originalName}-extracted.pdf`,
    size: bytes.length,
    pageCount: indices.length,
  }
}

export const extractPdfPages = extractPagesToSinglePdf

/**
 * Reorder PDF pages according to new sequence of 1-based page numbers
 */
export async function reorderPdfPages(file, newPageOrder, onProgress) {
  const fileName = file?.name || 'document.pdf'
  const srcDoc = await safeLoadPdfDocument(file, fileName)
  const totalPages = srcDoc.getPageCount()

  if (newPageOrder.length !== totalPages) {
    throw new Error(`Page count mismatch: expected ${totalPages} pages but received ${newPageOrder.length}.`)
  }

  if (onProgress) onProgress('Reordering pages...')
  const newDoc = await PDFDocument.create()
  const indices = newPageOrder.map(p => p - 1)
  const copiedPages = await newDoc.copyPages(srcDoc, indices)
  copiedPages.forEach(p => newDoc.addPage(p))

  const bytes = await newDoc.save()
  return {
    bytes,
    blob: new Blob([bytes], { type: 'application/pdf' }),
    name: `${fileName.replace(/\.pdf$/i, '')}-reordered.pdf`,
    size: bytes.length,
    pageCount: totalPages,
  }
}

/**
 * Delete specified pages from PDF
 * @param {File} file
 * @param {number[]} pagesToDelete - array of 1-based page numbers
 */
export async function deletePdfPages(file, pagesToDelete, onProgress) {
  const fileName = file?.name || 'document.pdf'
  const srcDoc = await safeLoadPdfDocument(file, fileName)
  const totalPages = srcDoc.getPageCount()

  const deleteSet = new Set(pagesToDelete)
  const remainingIndices = []
  for (let p = 1; p <= totalPages; p++) {
    if (!deleteSet.has(p)) remainingIndices.push(p - 1)
  }

  if (remainingIndices.length === 0) {
    throw new Error('Cannot delete all pages. The PDF must retain at least one page.')
  }

  if (onProgress) onProgress(`Removing ${pagesToDelete.length} pages (${remainingIndices.length} remaining)...`)
  const newDoc = await PDFDocument.create()
  const copiedPages = await newDoc.copyPages(srcDoc, remainingIndices)
  copiedPages.forEach(p => newDoc.addPage(p))

  const bytes = await newDoc.save()
  return {
    bytes,
    blob: new Blob([bytes], { type: 'application/pdf' }),
    name: `${fileName.replace(/\.pdf$/i, '')}-modified.pdf`,
    size: bytes.length,
    pageCount: remainingIndices.length,
  }
}

/**
 * Rotate PDF pages by 90, 180, or 270 degrees
 * @param {File} file
 * @param {number} angleDeg - 90, 180, 270
 * @param {number[]|null} targetPages - array of 1-based page numbers, or null for all pages
 */
export async function rotatePdfPages(file, arg2 = 90, arg3 = null, onProgress = null) {
  let angleDeg = 90
  let targetPages = null
  if (typeof arg2 === 'number') {
    angleDeg = arg2
    targetPages = Array.isArray(arg3) ? arg3 : null
  } else if (Array.isArray(arg2)) {
    targetPages = arg2
    angleDeg = typeof arg3 === 'number' ? arg3 : 90
  }
  const progressFn = typeof arg3 === 'function' ? arg3 : onProgress
  const fileName = file?.name || 'document.pdf'
  const doc = await safeLoadPdfDocument(file, fileName)
  const pages = doc.getPages()
  const targetSet = targetPages && targetPages.length ? new Set(targetPages) : null

  if (progressFn) progressFn(`Rotating pages by ${angleDeg}°...`)

  pages.forEach((page, i) => {
    const pageNum = i + 1
    if (!targetSet || targetSet.has(pageNum)) {
      const currentAngle = page.getRotation()?.angle || 0
      page.setRotation(degrees((currentAngle + angleDeg) % 360))
    }
  })

  const bytes = await doc.save()
  return {
    bytes,
    blob: new Blob([bytes], { type: 'application/pdf' }),
    name: `${fileName.replace(/\.pdf$/i, '')}-rotated.pdf`,
    size: bytes.length,
  }
}

/* ══════════════════════════════════════════════════════════
   4. OPTIMIZE & METADATA ENGINES
   ══════════════════════════════════════════════════════════ */

/**
 * Compress PDF via multi-tier strategy:
 * 1. Object Streams & structural clean-up (lossless)
 * 2. Downsampling of raster images where enabled (balanced / high presets)
 * Honest reporting of before/after/reduction, never falsely claiming savings.
 */
export async function compressPdf(file, arg2 = null, arg3 = null) {
  const onProgress = typeof arg2 === 'function' ? arg2 : (typeof arg3 === 'function' ? arg3 : null)
  const options = (arg2 && typeof arg2 === 'object') ? arg2 : {}
  const preset = options.preset || 'balanced' // 'balanced', 'high', 'lossless'

  if (onProgress) onProgress('Analyzing PDF structures...')
  const buf = await file.arrayBuffer()
  const origSize = file.size || buf.byteLength

  // 1. First attempt fast lossless object stream compression
  const doc = await safeLoadPdfDocument(buf.slice(0), file.name)
  const losslessBytes = await doc.save({
    useObjectStreams: true,
    addDefaultPage: false,
    updateFieldAppearances: false,
  })

  let bestBytes = losslessBytes.length < origSize ? losslessBytes : new Uint8Array(buf)
  let bestSize = bestBytes.length
  let reductionNotice = ''

  // 2. If balanced, high compression, or explicit DPI requested and in browser environment with PDF.js available:
  const isLosslessOnly = preset === 'lossless' && !options.dpi
  if (!isLosslessOnly && typeof window !== 'undefined' && typeof document !== 'undefined') {
    try {
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
      console.warn('[PDF Compress] Raster downsampling skipped, kept lossless:', e)
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

/**
 * Inspect PDF details and read metadata
 */
export async function readPdfMetadata(file) {
  const buf = await file.arrayBuffer()
  const doc = await safeLoadPdfDocument(buf, file.name)
  const pages = doc.getPages()
  const page1 = pages[0]

  const fmtDate = d => (d instanceof Date && !isNaN(d.getTime())) ? d.toISOString().slice(0, 10) : '—'

  return {
    filename: file.name,
    fileSize: file.size,
    pageCount: pages.length,
    page1Width: page1 ? Math.round(page1.getWidth()) : 0,
    page1Height: page1 ? Math.round(page1.getHeight()) : 0,
    title: doc.getTitle() || '',
    author: doc.getAuthor() || '',
    subject: doc.getSubject() || '',
    keywords: doc.getKeywords() || '',
    creator: doc.getCreator() || '',
    producer: doc.getProducer() || '',
    creationDate: fmtDate(doc.getCreationDate()),
    modificationDate: fmtDate(doc.getModificationDate()),
  }
}

/**
 * Update PDF metadata fields and re-save
 */
export async function updatePdfMetadata(file, metadata, onProgress) {
  if (onProgress) onProgress('Updating document metadata...')
  const buf = await file.arrayBuffer()
  const doc = await safeLoadPdfDocument(buf, file.name)

  if (metadata.title !== undefined) doc.setTitle(metadata.title)
  if (metadata.author !== undefined) doc.setAuthor(metadata.author)
  if (metadata.subject !== undefined) doc.setSubject(metadata.subject)
  if (metadata.keywords !== undefined) {
    const kw = Array.isArray(metadata.keywords)
      ? metadata.keywords
      : metadata.keywords.split(',').map(s => s.trim()).filter(Boolean)
    doc.setKeywords(kw)
  }
  if (metadata.creator !== undefined) doc.setCreator(metadata.creator)
  if (metadata.producer !== undefined) doc.setProducer(metadata.producer)
  doc.setModificationDate(new Date())

  const bytes = await doc.save()
  return {
    bytes,
    blob: new Blob([bytes], { type: 'application/pdf' }),
    name: `${file.name.replace(/\.pdf$/i, '')}-metadata.pdf`,
    size: bytes.length,
  }
}

/**
 * Add customizable text or image watermark across pages
 */
export async function watermarkPdf(file, watermarkOptions = {}, onProgress) {
  if (onProgress) onProgress('Applying watermarks to PDF pages...')
  const buf = await file.arrayBuffer()
  const doc = await safeLoadPdfDocument(buf, file.name)
  const font = await doc.embedFont(StandardFonts.HelveticaBold)

  const {
    text = 'CONFIDENTIAL',
    opacity = 0.3,
    angle = 45,
    fontSize = null,
    color = rgb(0.65, 0.65, 0.65),
    image = null, // image File, Blob, or dataURL
    targetPages = null,
  } = watermarkOptions

  let embeddedImage = null
  if (image) {
    let imgBytes
    if (typeof image === 'string' && image.startsWith('data:')) {
      const resp = await fetch(image)
      imgBytes = await resp.arrayBuffer()
    } else if (image instanceof Blob || image instanceof File) {
      imgBytes = await image.arrayBuffer()
    }
    if (imgBytes) {
      try {
        embeddedImage = await doc.embedPng(imgBytes)
      } catch {
        embeddedImage = await doc.embedJpg(imgBytes)
      }
    }
  }

  const cleanText = sanitizeWinAnsi(text.trim() || 'CONFIDENTIAL')
  const pages = doc.getPages()
  const pageIndices = targetPages && targetPages.length
    ? targetPages.map(p => p - 1).filter(p => p >= 0 && p < pages.length)
    : pages.map((_, i) => i)

  pageIndices.forEach(idx => {
    const page = pages[idx]
    const { width, height } = page.getSize()

    if (embeddedImage) {
      const scale = Math.min((width * 0.4) / embeddedImage.width, (height * 0.4) / embeddedImage.height)
      const imgW = embeddedImage.width * scale
      const imgH = embeddedImage.height * scale
      page.drawImage(embeddedImage, {
        x: (width - imgW) / 2,
        y: (height - imgH) / 2,
        width: imgW,
        height: imgH,
        opacity: Math.max(0.05, Math.min(1, opacity)),
        rotate: degrees(angle),
      })
    } else {
      const calculatedSize = fontSize || Math.min(width, height) / 9
      const textWidth = font.widthOfTextAtSize(cleanText, calculatedSize)
      const textHeight = font.heightAtSize(calculatedSize)

      let x, y
      if (angle === 45) {
        const dx = (Math.SQRT2 / 4) * (textWidth - textHeight)
        const dy = (Math.SQRT2 / 4) * (textWidth + textHeight)
        x = (width / 2) - dx
        y = (height / 2) - dy
      } else {
        x = (width - textWidth) / 2
        y = (height - textHeight) / 2
      }

      page.drawText(cleanText, {
        x,
        y,
        size: calculatedSize,
        font,
        color,
        opacity: Math.max(0.05, Math.min(1, opacity)),
        rotate: degrees(angle),
      })
    }
  })

  const bytes = await doc.save()
  return {
    bytes,
    blob: new Blob([bytes], { type: 'application/pdf' }),
    name: `watermarked-${file.name}`,
    size: bytes.length,
    pageCount: pages.length,
  }
}

/**
 * Add customizable page numbering to a PDF document (Page X or Page X of Y)
 */
export async function addPageNumbers(file, options = {}, onProgress = null) {
  if (onProgress) onProgress('Loading document for page numbering...')
  const buf = await file.arrayBuffer()
  const doc = await safeLoadPdfDocument(buf, file.name)
  const pages = doc.getPages()
  const totalPages = pages.length

  const {
    format = 'page_x_of_y', // 'page_x', 'page_x_of_y', 'x_of_y', 'x'
    position = 'bottom-center', // 'bottom-center', 'bottom-right', 'bottom-left', 'top-right', 'top-center'
    startPage = 1, // 1-based page to start numbering (e.g. 2 skips cover page)
    fontSize = 10,
    margin = 25,
    color = rgb(0.35, 0.4, 0.5),
  } = options

  const font = await doc.embedFont(StandardFonts.Helvetica)

  if (onProgress) onProgress('Numbering pages...')
  for (let i = 0; i < totalPages; i++) {
    const pageNum = i + 1
    if (pageNum < startPage) continue

    const page = pages[i]
    const pWidth = page.getWidth()
    const pHeight = page.getHeight()

    let text = ''
    if (format === 'page_x_of_y') text = `Page ${pageNum} of ${totalPages}`
    else if (format === 'page_x') text = `Page ${pageNum}`
    else if (format === 'x_of_y') text = `${pageNum} / ${totalPages}`
    else text = `${pageNum}`

    const textWidth = font.widthOfTextAtSize(text, fontSize)
    let x = (pWidth - textWidth) / 2
    let y = margin

    if (position === 'bottom-right') x = pWidth - margin - textWidth
    else if (position === 'bottom-left') x = margin
    else if (position === 'top-right') { x = pWidth - margin - textWidth; y = pHeight - margin }
    else if (position === 'top-left') { x = margin; y = pHeight - margin }
    else if (position === 'top-center') { x = (pWidth - textWidth) / 2; y = pHeight - margin }

    page.drawText(text, {
      x,
      y,
      size: fontSize,
      font,
      color,
    })
  }

  const bytes = await doc.save()
  return {
    bytes,
    blob: new Blob([bytes], { type: 'application/pdf' }),
    name: `numbered-${file.name}`,
    size: bytes.length,
    pageCount: totalPages,
  }
}

/**
 * Add Header & Footer text with page number variables to PDF document
 */
export async function addHeaderFooter(file, options = {}, onProgress = null) {
  if (onProgress) onProgress('Preparing headers and footers...')
  const buf = await file.arrayBuffer()
  const doc = await safeLoadPdfDocument(buf, file.name)
  const pages = doc.getPages()
  const totalPages = pages.length

  const {
    headerText = '',
    headerAlign = 'center', // 'left', 'center', 'right'
    footerText = '',
    footerAlign = 'center',
    fontSize = 9,
    margin = 25,
    startPage = 1,
    color = rgb(0.4, 0.45, 0.55),
  } = options

  const font = await doc.embedFont(StandardFonts.Helvetica)

  for (let i = 0; i < totalPages; i++) {
    const pageNum = i + 1
    if (pageNum < startPage) continue

    const page = pages[i]
    const pWidth = page.getWidth()
    const pHeight = page.getHeight()

    const resolveVars = (tpl) => {
      return String(tpl || '')
        .replace(/\{page\}/gi, String(pageNum))
        .replace(/\{total\}/gi, String(totalPages))
        .replace(/\{title\}/gi, file.name.replace(/\.pdf$/i, ''))
        .replace(/\{date\}/gi, new Date().toISOString().slice(0, 10))
    }

    if (headerText) {
      const hText = sanitizeWinAnsi(resolveVars(headerText))
      const hWidth = font.widthOfTextAtSize(hText, fontSize)
      let hX = (pWidth - hWidth) / 2
      if (headerAlign === 'left') hX = margin
      else if (headerAlign === 'right') hX = pWidth - margin - hWidth
      page.drawText(hText, {
        x: hX,
        y: pHeight - margin,
        size: fontSize,
        font,
        color,
      })
    }

    if (footerText) {
      const fText = sanitizeWinAnsi(resolveVars(footerText))
      const fWidth = font.widthOfTextAtSize(fText, fontSize)
      let fX = (pWidth - fWidth) / 2
      if (footerAlign === 'left') fX = margin
      else if (footerAlign === 'right') fX = pWidth - margin - fWidth
      page.drawText(fText, {
        x: fX,
        y: margin,
        size: fontSize,
        font,
        color,
      })
    }
  }

  const bytes = await doc.save()
  return {
    bytes,
    blob: new Blob([bytes], { type: 'application/pdf' }),
    name: `header-footer-${file.name}`,
    size: bytes.length,
    pageCount: totalPages,
  }
}

/**
 * Visual/Manual PDF Page Cropping (Adjusts CropBox and MediaBox without rasterizing)
 * @param {File|Blob} file
 * @param {{ xPercent: number, yPercent: number, widthPercent: number, heightPercent: number }} cropBox
 * @param {number[]|null} targetPages 1-based page numbers or null for all
 * @param {Function} onProgress
 */
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
  const blob = new Blob([bytes], { type: 'application/pdf' })
  return {
    bytes,
    blob,
    name: `cropped-${fileName}`,
    size: bytes.length,
    pageCount: totalPages,
  }
}

/**
 * Flatten form fields and annotations into static page content
 * @param {File|Blob} file
 * @param {Function} onProgress
 */
export async function flattenPdf(file, onProgress = null) {
  if (onProgress) onProgress('Inspecting interactive form fields...')
  const fileName = file?.name || 'document.pdf'
  const doc = await safeLoadPdfDocument(file, fileName)
  let fieldCount = 0
  try {
    const form = doc.getForm()
    const fields = form.getFields()
    fieldCount = fields.length
    if (fieldCount > 0) {
      if (onProgress) onProgress(`Flattening ${fieldCount} form field(s)...`)
      form.flatten()
    }
  } catch (e) {
    console.warn('Form flattening notice:', e.message)
  }

  const bytes = await doc.save()
  const blob = new Blob([bytes], { type: 'application/pdf' })
  return {
    bytes,
    blob,
    name: `flattened-${fileName}`,
    size: bytes.length,
    fieldCount,
  }
}

/**
 * Remove all metadata (Title, Author, Subject, Keywords, Creator, Producer, Dates, XMP stream)
 * @param {File|Blob} file
 * @param {Function} onProgress
 */
export async function cleanPdfMetadata(file, onProgress = null) {
  if (onProgress) onProgress('Scrubbing PDF metadata and tracking streams...')
  const fileName = file?.name || 'document.pdf'
  const doc = await safeLoadPdfDocument(file, fileName)

  doc.setTitle('')
  doc.setAuthor('')
  doc.setSubject('')
  doc.setKeywords([])
  doc.setProducer('')
  doc.setCreator('')
  doc.setCreationDate(new Date(0))
  doc.setModificationDate(new Date(0))

  try {
    doc.catalog.delete(PDFName.of('Metadata'))
  } catch { }

  const bytes = await doc.save()
  const blob = new Blob([bytes], { type: 'application/pdf' })
  return {
    bytes,
    blob,
    name: `clean-${fileName}`,
    size: bytes.length,
  }
}

/**
 * Standards-compliant PDF encryption and password locking
 * Implements AES-256 (PDF Standard) or RC4-128 with granular permissions.
 * @param {File|Blob} file
 * @param {string} password User password to open document
 * @param {Object} options { confirmPassword, ownerPassword, algorithm, permissions }
 * @param {Function} onProgress
 */
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

  // Verify that input is a valid PDF
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

  const blob = new Blob([encryptedBytes], { type: 'application/pdf' })
  return {
    bytes: encryptedBytes,
    blob,
    name: `protected-${baseName}.pdf`,
    size: encryptedBytes.length,
    pageCount,
    algorithm,
    permissions: encryptOpts.permissions || null,
  }
}

/**
 * Authorized PDF decryption using provided password
 * Attempts direct lossless vector decryption via @pdfsmaller/pdf-decrypt,
 * with fallback to authenticated PDF.js rendering for proprietary legacy dialects.
 * @param {File|Blob|Uint8Array|ArrayBuffer} file
 * @param {string} password
 * @param {Function} onProgress
 */
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
      const blob = new Blob([decryptedBytes], { type: 'application/pdf' })
      return {
        bytes: decryptedBytes,
        blob,
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
    canvas.width = renderViewport.width
    canvas.height = renderViewport.height
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
  const blob = new Blob([bytes], { type: 'application/pdf' })
  return {
    bytes,
    blob,
    name: `unlocked-${baseName}.pdf`,
    size: bytes.length,
    pageCount: numPages,
    mode: 'authenticated-render',
  }
}

/**
 * Change or rotate password on an encrypted PDF document
 * @param {File|Blob|Uint8Array|ArrayBuffer} file
 * @param {string} currentPassword
 * @param {string} newPassword
 * @param {Object} options
 * @param {Function} onProgress
 */
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

/**
 * Permanent visual redaction of PDF pages
 * For affected pages: rasterizes at 2x resolution with solid blackout/colored boxes
 * directly burned into pixel data, destroying underlying text layer and vectors permanently.
 * @param {File|Blob} file
 * @param {Object} redactionsByPage { [pageNumber1Based]: Array<{ xPercent, yPercent, widthPercent, heightPercent, color }> }
 * @param {Function} onProgress
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
      canvas.width = viewport.width
      canvas.height = viewport.height
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
    } else {
      if (onProgress) onProgress(`Preserving page ${p} vector structure...`)
      const [copiedPage] = await outDoc.copyPages(srcDoc, [p - 1])
      outDoc.addPage(copiedPage)
    }
  }

  const bytes = await outDoc.save()
  const blob = new Blob([bytes], { type: 'application/pdf' })
  return {
    bytes,
    blob,
    name: `redacted-${file.name}`,
    size: bytes.length,
    pageCount: numPages,
  }
}

/**
 * Add visual signature image/drawing to a specific page
 * @param {File|Blob} file
 * @param {string} signatureDataUrl
 * @param {number} pageNumber 1-based
 * @param {{ xPercent: number, yPercent: number, widthPercent: number, heightPercent: number }} rect
 * @param {Function} onProgress
 */
export async function signPdf(file, signatureDataUrl, pageNumber = 1, rect = {}, onProgress = null) {
  if (onProgress) onProgress('Embedding visual signature into document...')
  const doc = await safeLoadPdfDocument(await file.arrayBuffer(), file.name)
  const totalPages = doc.getPageCount()
  const pIdx = Math.max(0, Math.min(totalPages - 1, (pageNumber || 1) - 1))
  const page = doc.getPage(pIdx)
  const { width: pWidth, height: pHeight } = page.getSize()

  const sigResp = await fetch(signatureDataUrl)
  const sigBytes = await sigResp.arrayBuffer()
  const sigImg = await doc.embedPng(sigBytes)

  const x = (rect.xPercent !== undefined ? rect.xPercent : 0.6) * pWidth
  const w = (rect.widthPercent !== undefined ? rect.widthPercent : 0.3) * pWidth
  const h = (rect.heightPercent !== undefined ? rect.heightPercent : 0.1) * pHeight
  const y = pHeight - ((rect.yPercent !== undefined ? rect.yPercent : 0.8) + (rect.heightPercent !== undefined ? rect.heightPercent : 0.1)) * pHeight

  page.drawImage(sigImg, {
    x: Math.max(0, x),
    y: Math.max(0, y),
    width: Math.min(pWidth, w),
    height: Math.min(pHeight, h),
  })

  const bytes = await doc.save()
  const blob = new Blob([bytes], { type: 'application/pdf' })
  return {
    bytes,
    blob,
    name: `signed-${file.name}`,
    size: bytes.length,
    pageCount: totalPages,
  }
}

/**
 * Extract interactive form fields from PDF
 * @param {File|Blob} file
 */
export async function getPdfFormFields(file) {
  const fileName = file?.name || 'document.pdf'
  const doc = await safeLoadPdfDocument(file, fileName)
  let form
  try {
    form = doc.getForm()
  } catch {
    return []
  }
  if (!form) return []

  const fields = form.getFields()
  return fields.map(f => {
    const name = f.getName()
    const constructorName = f.constructor?.name || ''
    let type = 'text'
    let value = ''
    let options = []

    if (constructorName.includes('CheckBox')) {
      type = 'checkbox'
      value = typeof f.isChecked === 'function' ? f.isChecked() : false
    } else if (constructorName.includes('RadioGroup')) {
      type = 'radio'
      options = typeof f.getOptions === 'function' ? f.getOptions() : []
      value = typeof f.getSelected === 'function' ? f.getSelected() : ''
    } else if (constructorName.includes('Dropdown') || constructorName.includes('OptionList')) {
      type = 'dropdown'
      options = typeof f.getOptions === 'function' ? f.getOptions() : []
      const sel = typeof f.getSelected === 'function' ? f.getSelected() : []
      value = Array.isArray(sel) ? (sel[0] || '') : (sel || '')
    } else {
      type = 'text'
      value = typeof f.getText === 'function' ? (f.getText() || '') : ''
    }

    return { name, type, value, options }
  })
}

/**
 * Fill interactive PDF form fields and export resulting PDF
 * @param {File|Blob} file
 * @param {Object} formValues { [fieldName]: string|boolean }
 * @param {Function} onProgress
 */
export async function fillPdfForm(file, formValues = {}, onProgress = null) {
  if (onProgress) onProgress('Applying values to PDF form fields...')
  const fileName = file?.name || 'document.pdf'
  const doc = await safeLoadPdfDocument(file, fileName)
  const form = doc.getForm()
  if (!form) throw new Error('No interactive form found in this PDF.')

  for (const [name, val] of Object.entries(formValues)) {
    try {
      const field = form.getField(name)
      const constructorName = field.constructor?.name || ''
      if (constructorName.includes('CheckBox')) {
        if (val) field.check()
        else field.uncheck()
      } else if (constructorName.includes('RadioGroup') || constructorName.includes('Dropdown')) {
        if (val) field.select(val)
      } else {
        if (typeof val === 'string') field.setText(val)
      }
    } catch (e) {
      console.warn(`Could not set form field "${name}":`, e.message)
    }
  }

  const bytes = await doc.save()
  const blob = new Blob([bytes], { type: 'application/pdf' })
  return {
    bytes,
    blob,
    name: `filled-${fileName}`,
    size: bytes.length,
  }
}

/**
 * Create interactive AcroForm fields (text, checkbox, dropdown) on PDF pages
 * @param {File|Blob} file
 * @param {Array<{ pageNumber: number, type: 'text'|'checkbox'|'dropdown', name: string, rect?: { x, y, width, height }, xPercent?: number, yPercent?: number, widthPercent?: number, heightPercent?: number, defaultValue?: string|boolean, options?: string[] }>} fields
 * @param {Function} onProgress
 */
export async function createPdfFormFields(file, fields = [], onProgress = null) {
  if (onProgress) onProgress('Initializing interactive PDF form builder...')
  const fileName = file?.name || 'document.pdf'
  const buf = await file.arrayBuffer()
  const doc = await safeLoadPdfDocument(buf, fileName)
  const pages = doc.getPages()
  const form = doc.getForm()

  let fieldIndex = 1
  for (const f of fields) {
    const pNum = Math.max(1, Math.min(pages.length, f.pageNumber || 1))
    const page = pages[pNum - 1]
    const pWidth = page.getWidth()
    const pHeight = page.getHeight()

    const name = f.name || `field_${fieldIndex++}`
    const x = f.rect?.x !== undefined ? f.rect.x : (f.xPercent !== undefined ? f.xPercent * pWidth : 50)
    const y = f.rect?.y !== undefined ? f.rect.y : (f.yPercent !== undefined ? (1 - f.yPercent) * pHeight : 100)
    const width = f.rect?.width !== undefined ? f.rect.width : (f.widthPercent !== undefined ? f.widthPercent * pWidth : 200)
    const height = f.rect?.height !== undefined ? f.rect.height : (f.heightPercent !== undefined ? f.heightPercent * pHeight : 24)

    if (f.type === 'checkbox') {
      const cb = form.createCheckBox(name)
      if (f.defaultValue) cb.check()
      cb.addToPage(page, { x, y, width: Math.max(14, height), height: Math.max(14, height) })
    } else if (f.type === 'dropdown') {
      const dd = form.createDropdown(name)
      if (Array.isArray(f.options) && f.options.length) {
        dd.setOptions(f.options)
      } else {
        dd.setOptions(['Option 1', 'Option 2', 'Option 3'])
      }
      if (f.defaultValue) dd.select(String(f.defaultValue))
      dd.addToPage(page, { x, y, width, height })
    } else if (f.type === 'radio') {
      const rg = form.createRadioGroup(name)
      const optVal = f.value || `option_${fieldIndex}`
      rg.addOptionToPage(optVal, page, { x, y, width: Math.max(14, height), height: Math.max(14, height) })
      if (f.defaultValue === optVal || f.defaultValue === true) rg.select(optVal)
    } else {
      // Default: text field
      const tf = form.createTextField(name)
      if (f.defaultValue) tf.setText(String(f.defaultValue))
      tf.addToPage(page, { x, y, width, height })
    }
  }

  const bytes = await doc.save()
  const blob = new Blob([bytes], { type: 'application/pdf' })
  return {
    bytes,
    blob,
    name: `form-${fileName}`,
    size: bytes.length,
    pageCount: pages.length,
    fieldCount: fields.length,
  }
}

/* ══════════════════════════════════════════════════════════
   5. ZIP ARCHIVING UTILITY (WITH DIRECTORY TRAVERSAL PROTECTION)
   ══════════════════════════════════════════════════════════ */

/**
 * Package multiple Blobs into a single ZIP archive for 1-click batch download
 * Protects against zip slip path traversal and duplicates
 * @param {Array<{ name: string, blob: Blob }>} items
 * @param {string} zipFilename
 * @param {Function} onProgress
 */
export async function createZipFromFiles(items, zipFilename = 'export.zip', onProgress) {
  const MAX_FILES = 150
  const MAX_BYTES = 250 * 1024 * 1024
  if (items.length > MAX_FILES) {
    throw new Error(`Maximum limit of ${MAX_FILES} files per ZIP exceeded.`)
  }

  const zip = new JSZip()
  const seenNames = new Map()
  let totalBytes = 0

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    let fileData = item.blob
    if (fileData && typeof fileData.arrayBuffer === 'function') {
      fileData = await fileData.arrayBuffer()
    }
    totalBytes += fileData?.byteLength || 0
    if (totalBytes > MAX_BYTES) {
      throw new Error(`Total batch size exceeded safe limit of ${formatBytes(MAX_BYTES)}.`)
    }

    // Sanitize filename: strip drive letters (C:), path traversal (..), separators, null bytes, and control chars
    let safeName = (item.name || `file_${i + 1}`)
      .replace(/^[a-zA-Z]:/g, '') // Strip drive letters
      .replace(/\0/g, '') // Strip null bytes
      .replace(/[\x00-\x1F\x7F]/g, '') // Strip control characters
      .replace(/^(\.\.(\/|\\|$))+/g, '') // Strip leading directory traversals
      .replace(/(\.\.[/\\])/g, '_') // Strip inline traversals
      .replace(/[/\\]+/g, '_') // Replace forward/back slashes
      .replace(/^\.+|\.+$/g, '') // Strip leading/trailing dots
      .trim() || `file_${i + 1}`

    if (seenNames.has(safeName)) {
      const count = seenNames.get(safeName) + 1
      seenNames.set(safeName, count)
      const extMatch = safeName.match(/\.([^.]+)$/)
      if (extMatch) {
        safeName = safeName.replace(new RegExp(`\\.${extMatch[1]}$`), ` (${count}).${extMatch[1]}`)
      } else {
        safeName = `${safeName} (${count})`
      }
    } else {
      seenNames.set(safeName, 0)
    }

    zip.file(safeName, fileData)
  }

  const zipBlob = await zip.generateAsync(
    {
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    },
    metadata => {
      if (onProgress) onProgress(`Compressing ZIP archive: ${Math.round(metadata.percent)}%`)
    }
  )

  return {
    blob: zipBlob,
    name: zipFilename.endsWith('.zip') ? zipFilename : `${zipFilename}.zip`,
    size: zipBlob.size,
    count: items.length,
  }
}

/**
 * Compare two PDF documents: page counts, metadata, and extractable text differences
 */
export async function comparePdfs(fileA, fileB, onProgress) {
  if (onProgress) onProgress('Reading first PDF metadata...')
  const metaA = await readPdfMetadata(fileA)
  if (onProgress) onProgress('Reading second PDF metadata...')
  const metaB = await readPdfMetadata(fileB)

  if (onProgress) onProgress('Extracting and analyzing text structures...')
  const pdfjs = await getPdfJs()
  
  const textA = []
  try {
    const bufA = await fileA.arrayBuffer()
    const loadingTaskA = pdfjs.getDocument({ data: new Uint8Array(bufA), isEvalSupported: false, enableScripting: false })
    const pdfA = await loadingTaskA.promise
    for (let i = 1; i <= Math.min(pdfA.numPages, 50); i++) {
      const page = await pdfA.getPage(i)
      const content = await page.getTextContent()
      const str = content.items.map(it => it.str).join(' ').trim()
      textA.push(str)
    }
  } catch (e) {
    console.warn('Text extraction for file A failed:', e)
  }

  const textB = []
  try {
    const bufB = await fileB.arrayBuffer()
    const loadingTaskB = pdfjs.getDocument({ data: new Uint8Array(bufB), isEvalSupported: false, enableScripting: false })
    const pdfB = await loadingTaskB.promise
    for (let i = 1; i <= Math.min(pdfB.numPages, 50); i++) {
      const page = await pdfB.getPage(i)
      const content = await page.getTextContent()
      const str = content.items.map(it => it.str).join(' ').trim()
      textB.push(str)
    }
  } catch (e) {
    console.warn('Text extraction for file B failed:', e)
  }

  const pageCountDiff = metaB.pageCount - metaA.pageCount
  const sizeDiff = fileB.size - fileA.size
  const pageDiffs = []
  const maxPages = Math.max(textA.length, textB.length)

  for (let i = 0; i < maxPages; i++) {
    const pA = textA[i] || ''
    const pB = textB[i] || ''
    if (!textA[i] && textB[i]) {
      pageDiffs.push({ page: i + 1, status: 'added', desc: `Page ${i + 1} added in newer document (${pB.length} chars)` })
    } else if (textA[i] && !textB[i]) {
      pageDiffs.push({ page: i + 1, status: 'removed', desc: `Page ${i + 1} removed from newer document` })
    } else if (pA !== pB) {
      pageDiffs.push({ page: i + 1, status: 'modified', desc: `Page ${i + 1} text differs (${pA.length} vs ${pB.length} chars)` })
    } else {
      pageDiffs.push({ page: i + 1, status: 'identical', desc: `Page ${i + 1} text layers match` })
    }
  }

  const metaDiffs = []
  if (metaA.title !== metaB.title) metaDiffs.push({ field: 'Title', before: metaA.title || '(None)', after: metaB.title || '(None)' })
  if (metaA.author !== metaB.author) metaDiffs.push({ field: 'Author', before: metaA.author || '(None)', after: metaB.author || '(None)' })
  if (metaA.producer !== metaB.producer) metaDiffs.push({ field: 'Producer', before: metaA.producer || '(None)', after: metaB.producer || '(None)' })

  return {
    fileA: { name: fileA.name, size: fileA.size, pageCount: metaA.pageCount },
    fileB: { name: fileB.name, size: fileB.size, pageCount: metaB.pageCount },
    pageCountDiff,
    sizeDiff,
    metaDiffs,
    pageDiffs,
    identicalPagesCount: pageDiffs.filter(p => p.status === 'identical').length,
    modifiedPagesCount: pageDiffs.filter(p => p.status === 'modified').length,
    addedPagesCount: pageDiffs.filter(p => p.status === 'added').length,
    removedPagesCount: pageDiffs.filter(p => p.status === 'removed').length,
  }
}

