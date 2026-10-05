import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { parseDocx } from './docxParser.js'
import { layoutDocxToPdf } from './docxLayoutEngine.js'
import { PAGE_SIZES, sanitizeWinAnsi } from './pdfStructuralEngine.js'

const _convFontBytesCache = {}
async function loadFontBytes(filename) {
  if (_convFontBytesCache[filename]) return _convFontBytesCache[filename]
  if (typeof window !== 'undefined') {
    const res = await fetch(`/fonts/${filename}`)
    if (!res.ok) throw new Error(`Failed to fetch font: ${filename}`)
    const buf = await res.arrayBuffer()
    const bytes = new Uint8Array(buf)
    _convFontBytesCache[filename] = bytes
    return bytes
  } else {
    const fsMod = 'fs'
    const pathMod = 'path'
    const fs = await import(/* @vite-ignore */ fsMod)
    const path = await import(/* @vite-ignore */ pathMod)
    const p = path.resolve('public/fonts', filename)
    if (fs.existsSync(p)) {
      const bytes = fs.readFileSync(p)
      _convFontBytesCache[filename] = bytes
      return bytes
    }
    throw new Error(`Font file not found: ${p}`)
  }
}

/**
 * Typeset structured blocks containing multi-language Unicode (Hindi, Chinese, Cyrillic, Arabic, Emoji)
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

    if (block.type === 'table') {
      const rows = block.rows || []
      if (!rows.length) continue
      const colCount = Math.max(...rows.map(r => r.length))
      if (colCount === 0) continue

      const colWidth = maxContentW / colCount
      const cellPadding = Math.round(6 * scale)
      const rowFontSize = Math.round(9 * scale)
      const rowLineHeight = Math.round(13 * scale)

      for (let rIdx = 0; rIdx < rows.length; rIdx++) {
        const row = rows[rIdx]
        const isHeader = rIdx === 0 && block.hasHeader

        let maxLines = 1
        const wrappedCells = row.map(cell => {
          ctx.font = `${isHeader ? 'bold ' : ''}${rowFontSize}px ${fontStack}`
          const words = String(cell || '').split(' ')
          const lines = []
          let cur = ''
          for (const w of words) {
            const test = cur ? `${cur} ${w}` : w
            if (ctx.measureText(test).width <= colWidth - cellPadding * 2) {
              cur = test
            } else {
              if (cur) lines.push(cur)
              cur = w
            }
          }
          if (cur) lines.push(cur)
          if (lines.length > maxLines) maxLines = lines.length
          return lines
        })

        const rowHeight = maxLines * rowLineHeight + cellPadding * 2
        await checkPageBreak(rowHeight)

        if (isHeader) {
          ctx.fillStyle = '#f1f5f9'
          ctx.fillRect(margin, cursorY, maxContentW, rowHeight)
        } else if (rIdx % 2 === 1) {
          ctx.fillStyle = '#f8fafc'
          ctx.fillRect(margin, cursorY, maxContentW, rowHeight)
        }

        for (let cIdx = 0; cIdx < colCount; cIdx++) {
          const cellX = margin + cIdx * colWidth
          const cellLines = wrappedCells[cIdx] || []

          ctx.font = `${isHeader ? 'bold ' : ''}${rowFontSize}px ${fontStack}`
          ctx.fillStyle = isHeader ? '#0f172a' : '#1e293b'

          let textY = cursorY + cellPadding + rowFontSize
          for (const l of cellLines) {
            ctx.fillText(l, cellX + cellPadding, textY)
            textY += rowLineHeight
          }
        }

        // Row border
        ctx.strokeStyle = '#e2e8f0'
        ctx.lineWidth = 1 * scale
        ctx.beginPath()
        ctx.moveTo(margin, cursorY + rowHeight)
        ctx.lineTo(margin + maxContentW, cursorY + rowHeight)
        ctx.stroke()

        cursorY += rowHeight
      }
      cursorY += 10 * scale
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
  const allText = blocks.map(b => b.text || '').join(' ')
  if (typeof document !== 'undefined' && /[^\x00-\x7F\xA0-\xFF]/.test(allText)) {
    return await typesetUnicodeDocument(blocks, doc, options)
  }

  let fontRegular = null
  let fontBold = null
  let fontMono = null

  try {
    doc.registerFontkit(fontkit)
    const [regBytes, boldBytes] = await Promise.all([
      loadFontBytes('LiberationSans-Regular.ttf'),
      loadFontBytes('LiberationSans-Bold.ttf'),
    ])
    fontRegular = await doc.embedFont(regBytes, { subset: true })
    fontBold = await doc.embedFont(boldBytes, { subset: true })
    fontMono = fontRegular
  } catch (e) {
    fontRegular = await doc.embedFont(StandardFonts.Helvetica)
    fontBold = await doc.embedFont(StandardFonts.HelveticaBold)
    fontMono = await doc.embedFont(StandardFonts.Courier)
  }

  const { width = PAGE_SIZES.A4.width, height = PAGE_SIZES.A4.height } = options.pageSize || PAGE_SIZES.A4
  const margin = options.margin !== undefined ? options.margin : 54
  const contentWidth = width - margin * 2
  const bottomMargin = margin + 30

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
      const rawLines = (block.text || '').split('\n')
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

        let maxLines = 1
        const wrappedCells = row.map(cell => {
          const lines = wrapText(String(cell || ''), font, rowFontSize, colWidth - cellPadding * 2)
          if (lines.length > maxLines) maxLines = lines.length
          return lines
        })
        const rowHeight = maxLines * rowLineHeight + cellPadding * 2

        checkPageBreak(rowHeight)

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

          if (cIdx > 0) {
            page.drawLine({
              start: { x: cellX, y: cursorY },
              end: { x: cellX, y: cursorY - rowHeight },
              thickness: 0.5,
              color: rgb(0.85, 0.88, 0.92),
            })
          }
        }

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
      spaceAfter = 2
    } else if (block.type === 'quote') {
      indentX = 16
      textColor = rgb(0.3, 0.35, 0.45)
      spaceBefore = 6
      spaceAfter = 6
    }

    const wrappedLines = wrapText(block.text, font, fontSize, contentWidth - indentX)
    const blockHeight = wrappedLines.length * lineHeight + spaceBefore + spaceAfter

    checkPageBreak(blockHeight)
    cursorY -= spaceBefore

    if (block.type === 'bullet') {
      page.drawText('•', {
        x: margin + 2,
        y: cursorY - fontSize,
        size: fontSize + 2,
        font: fontBold,
        color: rgb(0.3, 0.4, 0.6),
      })
    } else if (block.type === 'quote') {
      page.drawLine({
        start: { x: margin + 4, y: cursorY },
        end: { x: margin + 4, y: cursorY - wrappedLines.length * lineHeight },
        thickness: 2.5,
        color: rgb(0.65, 0.72, 0.85),
      })
    }

    for (const line of wrappedLines) {
      page.drawText(line, {
        x: margin + indentX,
        y: cursorY - fontSize,
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

/* ══════════════════════════════════════════════════════════
   HIGH-FIDELITY CONVERSION ENGINES
   ══════════════════════════════════════════════════════════ */

/**
 * 1A. High-Fidelity DOCX → PDF
 * Forensic parser + exact layout engine preserving table geometry, spans, and alignments.
 */
export async function convertDocxToPdf(file, onProgress = null) {
  if (onProgress) onProgress('Parsing Word document structure...')
  const arrayBuffer = await file.arrayBuffer()
  const docIR = await parseDocx(arrayBuffer)

  if (onProgress) onProgress('Typesetting high-fidelity document layout...')
  const result = await layoutDocxToPdf(docIR, onProgress)

  const baseName = file.name.replace(/\.docx?$/i, '')
  return {
    bytes: result.bytes,
    blob: new Blob([result.bytes], { type: 'application/pdf' }),
    name: `${baseName}.pdf`,
    size: result.bytes.length,
    pageCount: result.pageCount,
  }
}

/**
 * 1B. Images → PDF
 */
export async function convertImagesToPdf(files, options = {}, onProgress = null) {
  if (!files || !files.length) throw new Error('No images provided for PDF conversion.')

  const doc = await PDFDocument.create()
  doc.setCreator('ToolDesk PDF Studio')
  doc.setProducer('ToolDesk Engine')

  const { pageSize = 'A4', orientation = 'AUTO', margin = 20 } = options

  for (let idx = 0; idx < files.length; idx++) {
    const file = files[idx]
    if (onProgress) onProgress(`Processing image ${idx + 1} of ${files.length}: ${file.name}...`)

    const imgObj = await new Promise((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(url)
        resolve(img)
      }
      img.onerror = (e) => {
        URL.revokeObjectURL(url)
        reject(new Error(`Failed to load image: ${file.name}`))
      }
      img.src = url
    })

    const naturalWidth = imgObj.naturalWidth || imgObj.width || 800
    const naturalHeight = imgObj.naturalHeight || imgObj.height || 600

    let pWidth, pHeight
    if (pageSize === 'FIT') {
      pWidth = naturalWidth + margin * 2
      pHeight = naturalHeight + margin * 2
    } else {
      const baseDim = PAGE_SIZES[pageSize] || PAGE_SIZES.A4
      const isLandscape = orientation === 'LANDSCAPE' || (orientation === 'AUTO' && naturalWidth > naturalHeight)
      pWidth = isLandscape ? Math.max(baseDim.width, baseDim.height) : Math.min(baseDim.width, baseDim.height)
      pHeight = isLandscape ? Math.min(baseDim.width, baseDim.height) : Math.max(baseDim.width, baseDim.height)
    }

    const availW = Math.max(10, pWidth - margin * 2)
    const availH = Math.max(10, pHeight - margin * 2)
    const scale = Math.min(availW / naturalWidth, availH / naturalHeight)
    const finalW = naturalWidth * scale
    const finalH = naturalHeight * scale
    const posX = margin + (availW - finalW) / 2
    const posY = margin + (availH - finalH) / 2

    const arrayBuffer = await file.arrayBuffer()
    let embeddedImg
    if (file.type === 'image/jpeg' || file.name.match(/\.jpe?g$/i)) {
      embeddedImg = await doc.embedJpg(arrayBuffer)
    } else if (file.type === 'image/png' || file.name.match(/\.png$/i)) {
      embeddedImg = await doc.embedPng(arrayBuffer)
    } else {
      // Re-encode WebP/GIF/SVG/BMP to PNG via canvas
      const canvas = document.createElement('canvas')
      canvas.width = naturalWidth
      canvas.height = naturalHeight
      const ctx = canvas.getContext('2d')
      ctx.drawImage(imgObj, 0, 0)
      const pngBlob = await new Promise(res => canvas.toBlob(res, 'image/png'))
      const pngBuf = await pngBlob.arrayBuffer()
      embeddedImg = await doc.embedPng(pngBuf)
      canvas.width = 0
      canvas.height = 0
    }

    const page = doc.addPage([pWidth, pHeight])
    page.drawImage(embeddedImg, {
      x: posX,
      y: posY,
      width: finalW,
      height: finalH,
    })
  }

  const pdfBytes = await doc.save()
  const singleName = files.length === 1 ? files[0].name.replace(/\.[^/.]+$/, '') : 'combined-images'

  return {
    bytes: pdfBytes,
    blob: new Blob([pdfBytes], { type: 'application/pdf' }),
    name: `${singleName}.pdf`,
    size: pdfBytes.length,
    pageCount: files.length,
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
    title: options.title || 'Text Document',
    pageSize: PAGE_SIZES[options.pageSize] || PAGE_SIZES.A4,
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
    } else if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      // Parse Markdown table
      const tableRows = []
      let tIdx = i
      while (tIdx < lines.length) {
        const tTrim = lines[tIdx].trim()
        if (tTrim.startsWith('|') && tTrim.endsWith('|')) {
          if (/^\|(\s*[-:]+[-| :]*)\|$/.test(tTrim)) {
            tIdx++
            continue
          }
          const cells = tTrim.slice(1, -1).split('|').map(c => c.trim())
          tableRows.push(cells)
          tIdx++
        } else {
          break
        }
      }
      if (tableRows.length > 0) {
        blocks.push({
          type: 'table',
          rows: tableRows,
          hasHeader: tableRows.length > 1,
        })
        i = tIdx - 1
        continue
      }
      blocks.push({ type: 'p', text: trimmed })
    } else if (/^[-*+]\s+/.test(trimmed)) {
      blocks.push({ type: 'bullet', text: trimmed.replace(/^[-*+]\s+/, '') })
    } else if (/^\d+\.\s+/.test(trimmed)) {
      blocks.push({ type: 'bullet', text: trimmed })
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
 * 1F. CSV → PDF
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
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && csvText[i + 1] === '\n') i++
      currentRow.push(currentVal.trim())
      if (currentRow.some(c => c !== '')) rows.push(currentRow)
      currentRow = []
      currentVal = ''
    } else {
      currentVal += char
    }
  }
  if (currentVal || currentRow.length) {
    currentRow.push(currentVal.trim())
    if (currentRow.some(c => c !== '')) rows.push(currentRow)
  }
  return rows
}

export async function convertCsvToPdf(csvText, options = {}) {
  const rows = parseCsv(csvText)
  if (!rows.length) throw new Error('CSV file is empty.')

  const doc = await PDFDocument.create()
  doc.setCreator('ToolDesk PDF Studio')

  const blocks = [
    { type: 'h2', text: options.title || 'CSV Data Table' },
    { type: 'table', rows, hasHeader: true },
  ]

  const pdfBytes = await typesetDocument(blocks, doc, {
    title: options.title || 'CSV Export',
  })

  return {
    bytes: pdfBytes,
    blob: new Blob([pdfBytes], { type: 'application/pdf' }),
    size: pdfBytes.length,
  }
}

/**
 * 1G. JSON → PDF
 */
export async function convertJsonToPdf(jsonText, options = {}) {
  let parsed
  try {
    parsed = JSON.parse(jsonText)
  } catch (e) {
    throw new Error('Invalid JSON string provided.')
  }

  const formatted = JSON.stringify(parsed, null, 2)
  const doc = await PDFDocument.create()
  doc.setCreator('ToolDesk PDF Studio')

  const blocks = [
    { type: 'h2', text: options.title || 'JSON Document' },
    { type: 'codeblock', text: formatted },
  ]

  const pdfBytes = await typesetDocument(blocks, doc, {
    title: options.title || 'JSON Export',
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
  if (!xmlText || !xmlText.trim()) throw new Error('XML file is empty.')

  const doc = await PDFDocument.create()
  doc.setCreator('ToolDesk PDF Studio')

  const blocks = [
    { type: 'h2', text: options.title || 'XML Document' },
    { type: 'codeblock', text: xmlText.trim() },
  ]

  const pdfBytes = await typesetDocument(blocks, doc, {
    title: options.title || 'XML Export',
  })

  return {
    bytes: pdfBytes,
    blob: new Blob([pdfBytes], { type: 'application/pdf' }),
    size: pdfBytes.length,
  }
}
