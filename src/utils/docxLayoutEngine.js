import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

/**
 * High-Fidelity DOCX Document Layout Engine
 * Calculates document geometry, table grid layouts, cell text wrapping,
 * row heights, vertical alignments, borders, embedded images, and pagination.
 */

// Memory cache for font binary buffers across conversions
const _cachedFontBytes = {}

async function loadFontBytes(filename) {
  if (_cachedFontBytes[filename]) return _cachedFontBytes[filename]
  if (typeof window !== 'undefined') {
    const res = await fetch(`/fonts/${filename}`)
    if (!res.ok) throw new Error(`Failed to fetch font /fonts/${filename}: ${res.statusText}`)
    const buf = await res.arrayBuffer()
    const bytes = new Uint8Array(buf)
    _cachedFontBytes[filename] = bytes
    return bytes
  } else {
    // Node.js environment (for tests / CLI / SSR)
    const fsMod = 'fs'
    const pathMod = 'path'
    const fs = await import(/* @vite-ignore */ fsMod)
    const path = await import(/* @vite-ignore */ pathMod)
    const p = path.resolve('public/fonts', filename)
    if (fs.existsSync(p)) {
      const bytes = fs.readFileSync(p)
      _cachedFontBytes[filename] = bytes
      return bytes
    }
    throw new Error(`Font file not found: ${p}`)
  }
}

// Helper to convert hex color (#RRGGBB) to pdf-lib rgb
export function hexToPdfRgb(hex, defaultColor = rgb(0, 0, 0)) {
  if (!hex || hex === 'auto') return defaultColor
  const clean = hex.replace('#', '').trim()
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16) / 255
    const g = parseInt(clean.slice(2, 4), 16) / 255
    const b = parseInt(clean.slice(4, 6), 16) / 255
    return rgb(r, g, b)
  }
  return defaultColor
}

/**
 * Layout and typeset a parsed DOCX document into a vector PDF
 */
export async function layoutDocxToPdf(docIR, onProgress = null) {
  if (!docIR) throw new Error('No DOCX document structure provided for layout.')

  if (onProgress) onProgress('Initializing vector typesetting engine...')
  const pdfDoc = await PDFDocument.create()
  pdfDoc.registerFontkit(fontkit)

  // Embed standard typography fonts as fallback
  const fontTimes = await pdfDoc.embedFont(StandardFonts.TimesRoman)
  const fontTimesBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold)
  const fontTimesItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic)
  const fontTimesBoldItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanBoldItalic)

  const fontHelvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontHelveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const fontHelveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique)
  const fontHelveticaBoldOblique = await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique)

  const fontCourier = await pdfDoc.embedFont(StandardFonts.Courier)
  const fontCourierBold = await pdfDoc.embedFont(StandardFonts.CourierBold)

  // Pre-load and embed TrueType Unicode fonts for full multi-language and currency support
  let unicodeRegular = null
  let unicodeBold = null
  let unicodeItalic = null
  let unicodeBoldItalic = null

  try {
    const [regBytes, boldBytes, itBytes, biBytes] = await Promise.all([
      loadFontBytes('LiberationSans-Regular.ttf'),
      loadFontBytes('LiberationSans-Bold.ttf'),
      loadFontBytes('LiberationSans-Italic.ttf').catch(() => null),
      loadFontBytes('LiberationSans-BoldItalic.ttf').catch(() => null),
    ])
    unicodeRegular = await pdfDoc.embedFont(regBytes, { subset: true })
    unicodeBold = await pdfDoc.embedFont(boldBytes, { subset: true })
    if (itBytes) unicodeItalic = await pdfDoc.embedFont(itBytes, { subset: true })
    if (biBytes) unicodeBoldItalic = await pdfDoc.embedFont(biBytes, { subset: true })
  } catch (err) {
    console.warn('[docxLayout] TrueType font loading fallback to standard fonts:', err.message)
  }

  function resolveFont(family, bold, italic) {
    // If TrueType Unicode font is loaded, use it to ensure zero WinAnsi encoding crashes
    if (unicodeRegular) {
      if (bold && italic) return unicodeBoldItalic || unicodeBold || unicodeRegular
      if (bold) return unicodeBold || unicodeRegular
      if (italic) return unicodeItalic || unicodeRegular
      return unicodeRegular
    }

    const fam = (family || '').toLowerCase()
    if (fam.includes('times') || fam.includes('serif') || fam.includes('cambria') || fam.includes('georgia')) {
      if (bold && italic) return fontTimesBoldItalic
      if (bold) return fontTimesBold
      if (italic) return fontTimesItalic
      return fontTimes
    }
    if (fam.includes('courier') || fam.includes('mono') || fam.includes('consolas')) {
      if (bold) return fontCourierBold
      return fontCourier
    }
    // Default to clean Helvetica / Arial
    if (bold && italic) return fontHelveticaBoldOblique
    if (bold) return fontHelveticaBold
    if (italic) return fontHelveticaOblique
    return fontHelvetica
  }

  // Pre-embed media images
  const embeddedImages = new Map()
  if (docIR.mediaImages && docIR.mediaImages.size > 0) {
    if (onProgress) onProgress('Embedding document images...')
    for (const [rId, media] of docIR.mediaImages.entries()) {
      try {
        let embedded
        if (media.format === 'png') {
          try {
            embedded = await pdfDoc.embedPng(media.buffer)
          } catch (_) {
            embedded = await pdfDoc.embedJpg(media.buffer)
          }
        } else {
          try {
            embedded = await pdfDoc.embedJpg(media.buffer)
          } catch (_) {
            embedded = await pdfDoc.embedPng(media.buffer)
          }
        }
        embeddedImages.set(rId, embedded)
      } catch (err) {
        console.warn(`[docxLayout] Could not embed image ${rId}:`, err)
      }
    }
  }

  const { pageSize, margins, printableWidth, printableHeight } = docIR
  const pageW = pageSize.width
  const pageH = pageSize.height
  const leftMar = margins.left
  const rightMar = margins.right
  const topMar = margins.top
  const botMar = margins.bottom

  let page = pdfDoc.addPage([pageW, pageH])
  let cursorY = pageH - topMar
  let pageNumber = 1

  function checkPageBreak(neededHeight) {
    if (cursorY - neededHeight < botMar) {
      page = pdfDoc.addPage([pageW, pageH])
      pageNumber++
      cursorY = pageH - topMar
      return true
    }
    return false
  }

  // Helper to wrap a sequence of runs into lines for a specific width
  function wrapParagraphRuns(p, targetWidth) {
    const availW = Math.max(10, targetWidth)
    const lines = []
    let curLineRuns = []
    let curLineWidth = 0

    for (const run of p.runs) {
      if (run.drawing && embeddedImages.has(run.drawing.rId)) {
        // Drawing inline image
        const img = embeddedImages.get(run.drawing.rId)
        const scale = Math.min(1, availW / (run.drawing.widthPt || 100))
        const drawW = (run.drawing.widthPt || 100) * scale
        const drawH = (run.drawing.heightPt || 100) * scale

        if (curLineWidth + drawW > availW && curLineRuns.length > 0) {
          lines.push({ runs: curLineRuns, width: curLineWidth })
          curLineRuns = []
          curLineWidth = 0
        }
        curLineRuns.push({ drawing: run.drawing, embeddedImg: img, width: drawW, height: drawH, run })
        curLineWidth += drawW
        continue
      }

      if (!run.text) continue

      const font = resolveFont(run.fontFamily, run.isBold, run.isItalic)
      const fontSize = run.fontSize || 10
      const words = run.text.split(/(?<=\s)|(?=\s)/) // preserve spaces

      for (const w of words) {
        let wWidth = font.widthOfTextAtSize(w, fontSize)
        if (wWidth > availW && !w.includes(' ')) {
          // Break oversized unbroken word into character chunks that fit within availW
          let chunk = ''
          for (let c = 0; c < w.length; c++) {
            const nextChunk = chunk + w[c]
            if (font.widthOfTextAtSize(nextChunk, fontSize) > availW && chunk) {
              const cWidth = font.widthOfTextAtSize(chunk, fontSize)
              if (curLineWidth + cWidth > availW && curLineRuns.length > 0) {
                lines.push({ runs: curLineRuns, width: curLineWidth })
                curLineRuns = []
                curLineWidth = 0
              }
              curLineRuns.push({ text: chunk, width: cWidth, font, fontSize, run })
              lines.push({ runs: curLineRuns, width: curLineWidth + cWidth })
              curLineRuns = []
              curLineWidth = 0
              chunk = w[c]
            } else {
              chunk = nextChunk
            }
          }
          if (chunk) {
            const cWidth = font.widthOfTextAtSize(chunk, fontSize)
            curLineRuns.push({ text: chunk, width: cWidth, font, fontSize, run })
            curLineWidth += cWidth
          }
          continue
        }

        if (curLineWidth + wWidth <= availW || curLineRuns.length === 0) {
          curLineRuns.push({ text: w, width: wWidth, font, fontSize, run })
          curLineWidth += wWidth
        } else {
          lines.push({ runs: curLineRuns, width: curLineWidth })
          curLineRuns = [{ text: w, width: wWidth, font, fontSize, run }]
          curLineWidth = wWidth
        }
      }
    }

    if (curLineRuns.length > 0) {
      lines.push({ runs: curLineRuns, width: curLineWidth })
    }

    // Measure line heights
    const measuredLines = []
    for (const line of lines) {
      let maxFontSz = 10
      let maxDrawH = 0
      for (const r of line.runs) {
        if (r.height && r.height > maxDrawH) maxDrawH = r.height
        if (r.fontSize && r.fontSize > maxFontSz) maxFontSz = r.fontSize
      }

      const lineH = maxDrawH > 0
        ? maxDrawH + 4
        : (p.lineSpacing ? Math.max(p.lineSpacing, maxFontSz * 1.15) : (maxFontSz * 1.25))

      measuredLines.push({
        ...line,
        height: lineH,
        fontSz: maxFontSz,
      })
    }

    if (measuredLines.length === 0) {
      // Empty line / spacer
      measuredLines.push({
        runs: [],
        width: 0,
        height: p.lineSpacing || 12,
        fontSz: 10,
      })
    }

    const totalHeight = (p.spaceBefore || 0) + measuredLines.reduce((acc, l) => acc + l.height, 0) + (p.spaceAfter || 0)
    return {
      ...p,
      lines: measuredLines,
      totalHeight,
    }
  }

  // Draw wrapped paragraph lines at specific coordinates
  function renderParagraph(pMeasured, originX, startY, targetWidth) {
    let textCursorY = startY - (pMeasured.spaceBefore || 0)

    for (const line of pMeasured.lines) {
      textCursorY -= line.height
      const baselineY = textCursorY + (line.height - line.fontSz) * 0.35

      let lineX = originX
      if (pMeasured.align === 'center') {
        lineX = originX + Math.max(0, (targetWidth - line.width) / 2)
      } else if (pMeasured.align === 'right') {
        lineX = originX + Math.max(0, targetWidth - line.width)
      }

      // Merge adjacent tokens from same run for optimal PDF text streams and searchability
      const mergedSegments = []
      for (const seg of line.runs) {
        const last = mergedSegments[mergedSegments.length - 1]
        if (last && !last.embeddedImg && !seg.embeddedImg && last.run === seg.run) {
          last.text += seg.text
          last.width += seg.width
        } else {
          mergedSegments.push({ ...seg })
        }
      }

      let segX = lineX
      for (const seg of mergedSegments) {
        if (seg.embeddedImg) {
          page.drawImage(seg.embeddedImg, {
            x: segX,
            y: textCursorY + (line.height - seg.height) / 2,
            width: seg.width,
            height: seg.height,
          })
          segX += seg.width
          continue
        }

        const color = seg.run.color ? hexToPdfRgb(seg.run.color) : rgb(0, 0, 0)
        try {
          page.drawText(seg.text, {
            x: segX,
            y: baselineY,
            size: seg.fontSize,
            font: seg.font,
            color,
          })
        } catch (encErr) {
          try {
            const fallbackText = (seg.text || '').replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ')
            page.drawText(fallbackText, {
              x: segX,
              y: baselineY,
              size: seg.fontSize,
              font: fontHelvetica,
              color,
            })
          } catch (_) {}
        }

        // Underline decoration
        if (seg.run.isUnderline) {
          page.drawLine({
            start: { x: segX, y: baselineY - 1.5 },
            end: { x: segX + seg.width, y: baselineY - 1.5 },
            thickness: 0.6,
            color,
          })
        }
        // Strikethrough decoration
        if (seg.run.isStrike) {
          page.drawLine({
            start: { x: segX, y: baselineY + seg.fontSize * 0.35 },
            end: { x: segX + seg.width, y: baselineY + seg.fontSize * 0.35 },
            thickness: 0.6,
            color,
          })
        }

        segX += seg.width
      }

      textCursorY -= (pMeasured.spaceAfter || 0)
    }

    return startY - pMeasured.totalHeight
  }

  // Process all document elements sequentially
  for (let eIdx = 0; eIdx < docIR.elements.length; eIdx++) {
    const el = docIR.elements[eIdx]

    if (el.type === 'paragraph') {
      if (el.pageBreakBefore) {
        page = pdfDoc.addPage([pageW, pageH])
        pageNumber++
        cursorY = pageH - topMar
      }

      const pMeasured = wrapParagraphRuns(el, printableWidth)
      checkPageBreak(pMeasured.totalHeight)

      renderParagraph(pMeasured, leftMar, cursorY, printableWidth)
      cursorY -= pMeasured.totalHeight
      continue
    }

    if (el.type === 'table') {
      if (onProgress) onProgress(`Typesetting structured table (${eIdx + 1}/${docIR.elements.length})...`)

      // Calculate column widths from gridColsPt
      const gridColsPt = el.gridColsPt || []
      const sumGridPt = gridColsPt.reduce((a, b) => a + b, 0)
      const scaleX = (sumGridPt > 0 && Math.abs(sumGridPt - printableWidth) > 0.5)
        ? (printableWidth / sumGridPt)
        : 1.0

      const colWidths = gridColsPt.length > 0
        ? gridColsPt.map(w => w * scaleX)
        : [printableWidth]

      // Pre-measure all rows and cells
      const measuredRows = []
      let headerRow = null

      for (const row of el.rows) {
        let maxCellH = row.minHeightPt || 0
        const measuredCells = []

        for (const cell of row.cells) {
          // Calculate cell width across spans
          let cellW = 0
          for (let s = 0; s < cell.gridSpan && (cell.colIndex + s) < colWidths.length; s++) {
            cellW += colWidths[cell.colIndex + s]
          }
          if (cellW <= 0) cellW = printableWidth

          const availW = Math.max(10, cellW - cell.padLeft - cell.padRight)
          const measuredParas = cell.paragraphs.map(p => wrapParagraphRuns(p, availW))
          const contentH = measuredParas.reduce((sum, p) => sum + p.totalHeight, 0)
          const totalCellH = contentH + cell.padTop + cell.padBottom

          if (totalCellH > maxCellH) {
            maxCellH = totalCellH
          }

          measuredCells.push({
            ...cell,
            width: cellW,
            measuredParas,
            contentHeight: contentH,
            calculatedHeight: totalCellH,
          })
        }

        const measuredRow = {
          ...row,
          actualHeight: maxCellH,
          cells: measuredCells,
        }

        if (row.isHeader && !headerRow) {
          headerRow = measuredRow
        }

        measuredRows.push(measuredRow)
      }

      // Resolve vMerge spans across rows
      for (let rIdx = 0; rIdx < measuredRows.length; rIdx++) {
        const row = measuredRows[rIdx]
        for (const cell of row.cells) {
          if (cell.vMerge === 'restart') {
            cell.rowSpan = 1
            cell.isMergeRestart = true
            let totalSpanH = row.actualHeight
            let lastR = rIdx
            for (let nextR = rIdx + 1; nextR < measuredRows.length; nextR++) {
              const nextRow = measuredRows[nextR]
              const continueCell = nextRow.cells.find(c => c.colIndex === cell.colIndex)
              if (continueCell && continueCell.vMerge === 'continue') {
                cell.rowSpan++
                totalSpanH += nextRow.actualHeight
                continueCell.isMergeContinue = true
                continueCell.masterCell = cell
                lastR = nextR
              } else {
                break
              }
            }
            cell.spannedHeight = totalSpanH
            if (lastR > rIdx) {
              const lastCell = measuredRows[lastR].cells.find(c => c.colIndex === cell.colIndex)
              if (lastCell) lastCell.isLastInMerge = true
            } else {
              cell.isLastInMerge = true
            }
          } else if (cell.vMerge === 'continue') {
            cell.isMergeContinue = true
          }
        }
      }

      // Render rows with pagination awareness
      for (let rIdx = 0; rIdx < measuredRows.length; rIdx++) {
        const row = measuredRows[rIdx]
        const rowH = row.actualHeight

        // Check if row fits on current page
        if (cursorY - rowH < botMar) {
          page = pdfDoc.addPage([pageW, pageH])
          pageNumber++
          cursorY = pageH - topMar

          // Repeat header row if present
          if (headerRow && rIdx > 0) {
            renderTableRow(headerRow, cursorY)
            cursorY -= headerRow.actualHeight
          }
        }

        renderTableRow(row, cursorY)
        cursorY -= rowH
      }
    }
  }

  function renderTableRow(row, rowTopY) {
    const rowH = row.actualHeight
    let cellX = leftMar

    for (const cell of row.cells) {
      const cellW = cell.width
      const cellY = rowTopY - rowH

      // If cell is part of vertical merge continuation
      if (cell.isMergeContinue) {
        // Draw continue cell borders: suppress top border, suppress bottom border unless last in merge
        const borders = cell.borders || {}
        const defaultBorderColor = rgb(0, 0, 0)

        if (cell.isLastInMerge && borders.bottom) {
          page.drawLine({
            start: { x: cellX, y: cellY },
            end: { x: cellX + cellW, y: cellY },
            thickness: borders.bottom.size || 0.75,
            color: hexToPdfRgb(borders.bottom.color, defaultBorderColor),
          })
        }
        if (borders.left) {
          page.drawLine({
            start: { x: cellX, y: cellY },
            end: { x: cellX, y: rowTopY },
            thickness: borders.left.size || 0.75,
            color: hexToPdfRgb(borders.left.color, defaultBorderColor),
          })
        }
        if (borders.right) {
          page.drawLine({
            start: { x: cellX + cellW, y: cellY },
            end: { x: cellX + cellW, y: rowTopY },
            thickness: borders.right.size || 0.75,
            color: hexToPdfRgb(borders.right.color, defaultBorderColor),
          })
        }

        // Render any paragraphs explicitly placed in continue cell
        if (cell.measuredParas && cell.measuredParas.length > 0) {
          let pCursorY = rowTopY - cell.padTop
          const innerW = Math.max(10, cellW - cell.padLeft - cell.padRight)
          for (const p of cell.measuredParas) {
            renderParagraph(p, cellX + cell.padLeft, pCursorY, innerW)
            pCursorY -= p.totalHeight
          }
        }

        cellX += cellW
        continue
      }

      // If cell is a vertical merge restart with span > 1
      const isMultiRowSpan = cell.isMergeRestart && cell.rowSpan > 1
      const effectiveH = isMultiRowSpan ? cell.spannedHeight : rowH
      const effectiveBottomY = rowTopY - effectiveH

      // Draw background shading
      if (cell.bgColor) {
        page.drawRectangle({
          x: cellX,
          y: effectiveBottomY,
          width: cellW,
          height: effectiveH,
          color: hexToPdfRgb(cell.bgColor),
        })
      }

      // Calculate vertical alignment offset
      let vOffset = 0
      if (cell.vAlign === 'center') {
        vOffset = Math.max(0, (effectiveH - cell.padTop - cell.padBottom - cell.contentHeight) / 2)
      } else if (cell.vAlign === 'bottom') {
        vOffset = Math.max(0, effectiveH - cell.padTop - cell.padBottom - cell.contentHeight)
      }

      // Draw cell text paragraphs
      let pCursorY = rowTopY - cell.padTop - vOffset
      const innerW = Math.max(10, cellW - cell.padLeft - cell.padRight)

      for (const p of cell.measuredParas) {
        renderParagraph(p, cellX + cell.padLeft, pCursorY, innerW)
        pCursorY -= p.totalHeight
      }

      // Draw cell borders
      const borders = cell.borders || {}
      const defaultBorderColor = rgb(0, 0, 0)

      if (borders.top) {
        page.drawLine({
          start: { x: cellX, y: rowTopY },
          end: { x: cellX + cellW, y: rowTopY },
          thickness: borders.top.size || 0.75,
          color: hexToPdfRgb(borders.top.color, defaultBorderColor),
        })
      }
      if (!isMultiRowSpan && borders.bottom) {
        page.drawLine({
          start: { x: cellX, y: cellY },
          end: { x: cellX + cellW, y: cellY },
          thickness: borders.bottom.size || 0.75,
          color: hexToPdfRgb(borders.bottom.color, defaultBorderColor),
        })
      }
      if (borders.left) {
        page.drawLine({
          start: { x: cellX, y: cellY },
          end: { x: cellX, y: rowTopY },
          thickness: borders.left.size || 0.75,
          color: hexToPdfRgb(borders.left.color, defaultBorderColor),
        })
      }
      if (borders.right) {
        page.drawLine({
          start: { x: cellX + cellW, y: cellY },
          end: { x: cellX + cellW, y: rowTopY },
          thickness: borders.right.size || 0.75,
          color: hexToPdfRgb(borders.right.color, defaultBorderColor),
        })
      }

      cellX += cellW
    }
  }

  if (onProgress) onProgress('Finalizing and generating PDF document...')
  const pdfBytes = await pdfDoc.save({ useObjectStreams: true })
  return {
    bytes: pdfBytes,
    pageCount: pdfDoc.getPageCount(),
    pageSize: { width: pageW, height: pageH },
  }
}
