import JSZip from 'jszip'

/**
 * High-Precision OOXML DOCX Parser
 * Extracts an intermediate document model from .docx files including:
 * - Document structure & sections (page dimensions, margins, orientation)
 * - Paragraphs with alignments, spacing, indentation, and keep-with-next
 * - Runs with font family, size, bold, italic, underline, colors, and text
 * - Tables with exact grid columns, merged cells (gridSpan/vMerge), borders, shading, cell padding, and row heights
 * - Inline & anchored drawings/images mapped to relationship media
 */

/**
 * Decode common XML entities
 */
export function decodeXmlEntities(str) {
  if (!str || typeof str !== 'string') return ''
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
}

/**
 * Sanitize text to fit standard WinAnsi / Latin PDF-lib font encodings
 */
export function sanitizeWinAnsiText(str) {
  if (!str) return ''
  return decodeXmlEntities(str)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ' ')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014\u2015]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u2022\u25E6\u2023]/g, '*')
    .replace(/[\u20AC]/g, 'EUR')
    .replace(/[\u2264]/g, '<=')
    .replace(/[\u2265]/g, '>=')
    .replace(/[\u2260]/g, '!=')
}

/**
 * Parse hex color code into standard hex string or null
 */
export function parseColor(colorStr) {
  if (!colorStr || colorStr === 'auto') return null
  const clean = colorStr.replace('#', '').trim()
  if (clean.length === 6) return `#${clean}`
  if (clean.length === 3) return `#${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`
  return null
}

/**
 * Parse relationship map from word/_rels/document.xml.rels
 */
async function parseRelationships(zip) {
  const rels = new Map()
  const relsFile = zip.file('word/_rels/document.xml.rels')
  if (!relsFile) return rels

  const relsXml = await relsFile.async('text')
  const relMatches = relsXml.matchAll(/<Relationship\s+([^>]+)(?:\/>|>[\s\S]*?<\/Relationship>)/gi)
  for (const match of relMatches) {
    const attrs = match[1]
    const idMatch = attrs.match(/\bId="([^"]+)"/i)
    const targetMatch = attrs.match(/\bTarget="([^"]+)"/i)
    if (idMatch && targetMatch) {
      rels.set(idMatch[1], targetMatch[1])
    }
  }
  return rels
}

/**
 * Parse default styles from word/styles.xml
 */
async function parseStyles(zip) {
  const styles = {
    defaultFont: 'Helvetica',
    defaultSizePt: 10,
    stylesById: {},
  }
  const stylesFile = zip.file('word/styles.xml')
  if (!stylesFile) return styles

  const stylesXml = await stylesFile.async('text')
  const rFontsMatch = stylesXml.match(/<w:rFonts\s+[^>]*w:ascii="([^"]+)"/)
  if (rFontsMatch) styles.defaultFont = rFontsMatch[1]

  const szMatch = stylesXml.match(/<w:sz\s+w:val="(\d+)"/)
  if (szMatch) styles.defaultSizePt = parseInt(szMatch[1], 10) / 2

  return styles
}

/**
 * Parse paragraph properties (<w:pPr>)
 */
function parseParagraphProperties(pPrXml, defaultStyles) {
  if (!pPrXml) {
    return {
      align: 'left',
      spaceBefore: 0,
      spaceAfter: 0,
      lineSpacing: null,
      lineRule: 'auto',
      keepNext: false,
      cantSplit: false,
      pageBreakBefore: false,
    }
  }

  let align = 'left'
  const jcMatch = pPrXml.match(/<w:jc\s+w:val="([^"]+)"/)
  if (jcMatch) {
    const val = jcMatch[1].toLowerCase()
    if (val === 'center') align = 'center'
    else if (val === 'right') align = 'right'
    else if (val === 'both' || val === 'justify') align = 'justify'
  }

  let spaceBefore = 0
  let spaceAfter = 0
  let lineSpacing = null
  let lineRule = 'auto'
  const spMatch = pPrXml.match(/<w:spacing\s+([^>]*)\/>/)
  if (spMatch) {
    const attrs = spMatch[1]
    const bM = attrs.match(/w:before="(\d+)"/)
    const aM = attrs.match(/w:after="(\d+)"/)
    const lM = attrs.match(/w:line="(\d+)"/)
    const rM = attrs.match(/w:lineRule="([^"]+)"/)
    if (bM) spaceBefore = parseInt(bM[1], 10) / 20
    if (aM) spaceAfter = parseInt(aM[1], 10) / 20
    if (lM) lineSpacing = parseInt(lM[1], 10) / 20
    if (rM) lineRule = rM[1]
  }

  const keepNext = /<w:keepNext(\s|\/|>)/.test(pPrXml)
  const pageBreakBefore = /<w:pageBreakBefore(\s|\/|>)/.test(pPrXml)

  return {
    align,
    spaceBefore,
    spaceAfter,
    lineSpacing,
    lineRule,
    keepNext,
    pageBreakBefore,
  }
}

/**
 * Parse run properties and text (<w:r>)
 */
function parseRun(rXml, defaultStyles, rels, zip) {
  const rPrMatch = rXml.match(/<w:rPr[\s\S]*?<\/w:rPr>/)
  const rPr = rPrMatch ? rPrMatch[0] : ''

  const isBold = /<w:b(\s|\/|>)/.test(rPr) && !/<w:b\s+w:val="(false|0)"/.test(rPr)
  const isItalic = /<w:i(\s|\/|>)/.test(rPr) && !/<w:i\s+w:val="(false|0)"/.test(rPr)
  const isUnderline = /<w:u\s+[^>]*w:val="(?!none|nil)[^"]*"/.test(rPr) || /<w:u(\s|\/|>)/.test(rPr)
  const isStrike = /<w:strike(\s|\/|>)/.test(rPr)

  let fontSize = defaultStyles.defaultSizePt || 10
  const szMatch = rPr.match(/<w:sz\s+w:val="(\d+)"/)
  if (szMatch) {
    fontSize = parseInt(szMatch[1], 10) / 2
  }

  let fontFamily = defaultStyles.defaultFont || 'Helvetica'
  const fontMatch = rPr.match(/<w:rFonts\s+[^>]*w:ascii="([^"]+)"/)
  if (fontMatch) {
    fontFamily = fontMatch[1]
  }

  let color = null
  const colorMatch = rPr.match(/<w:color\s+w:val="([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})"/)
  if (colorMatch) {
    color = parseColor(colorMatch[1])
  }

  let highlight = null
  const hiMatch = rPr.match(/<w:highlight\s+w:val="([^"]+)"/)
  if (hiMatch && hiMatch[1] !== 'none') {
    highlight = hiMatch[1]
  }

  // Extract text
  const tMatches = Array.from(rXml.matchAll(/<w:t(?:\s+[^>]*)?>([\s\S]*?)<\/w:t>/g), m => m[1])
  let text = tMatches.join('')
  text = sanitizeWinAnsiText(text)

  const isTab = /<w:tab(\s|\/|>)/.test(rXml)
  const isBreak = /<w:br(\s|\/|>)/.test(rXml)
  const isPageBreak = /<w:br\s+[^>]*w:type="page"/.test(rXml)

  // Drawing / Image check
  let drawing = null
  const blipMatch = rXml.match(/<a:blip\s+[^>]*r:embed="([^"]+)"/)
  if (blipMatch) {
    const rId = blipMatch[1]
    const target = rels.get(rId)
    const extentMatch = rXml.match(/<wp:extent\s+[^>]*cx="(\d+)"[^>]*cy="(\d+)"/)
    let widthPt = 100
    let heightPt = 100
    if (extentMatch) {
      widthPt = parseInt(extentMatch[1], 10) / 12700
      heightPt = parseInt(extentMatch[2], 10) / 12700
    }
    drawing = {
      rId,
      target,
      widthPt,
      heightPt,
    }
  }

  return {
    text,
    isBold,
    isItalic,
    isUnderline,
    isStrike,
    fontSize,
    fontFamily,
    color,
    highlight,
    isTab,
    isBreak,
    isPageBreak,
    drawing,
  }
}

/**
 * Parse paragraph (<w:p>)
 */
function parseParagraph(pXml, defaultStyles, rels, zip) {
  const pPrMatch = pXml.match(/<w:pPr[\s\S]*?<\/w:pPr>/)
  const pPr = parseParagraphProperties(pPrMatch ? pPrMatch[0] : null, defaultStyles)

  const rMatches = pXml.split(/<w:r\b/).slice(1)
  const runs = []

  for (const rXml of rMatches) {
    const run = parseRun(rXml, defaultStyles, rels, zip)
    if (run.text || run.drawing || run.isTab || run.isBreak || run.isPageBreak) {
      runs.push(run)
    }
  }

  return {
    type: 'paragraph',
    ...pPr,
    runs,
  }
}

/**
 * Parse table borders (<w:tblBorders> or <w:tcBorders>)
 */
function parseBorders(bordersXml) {
  const borders = {
    top: { style: 'single', size: 0.5, color: '#000000' },
    bottom: { style: 'single', size: 0.5, color: '#000000' },
    left: { style: 'single', size: 0.5, color: '#000000' },
    right: { style: 'single', size: 0.5, color: '#000000' },
  }
  if (!bordersXml) return borders

  const sides = ['top', 'bottom', 'left', 'right', 'insideH', 'insideV']
  for (const side of sides) {
    const match = bordersXml.match(new RegExp(`<w:${side}\\s+([^>]*)\\/>`))
    if (match) {
      const attrs = match[1]
      const valM = attrs.match(/w:val="([^"]+)"/)
      const szM = attrs.match(/w:sz="(\d+)"/)
      const colM = attrs.match(/w:color="([^"]+)"/)

      const val = valM ? valM[1] : 'single'
      if (val === 'none' || val === 'nil') {
        borders[side] = null
      } else {
        const sizePt = szM ? parseInt(szM[1], 10) / 8 : 0.5
        const color = colM ? parseColor(colM[1]) || '#000000' : '#000000'
        borders[side] = { style: val, size: sizePt, color }
      }
    }
  }
  return borders
}

/**
 * Parse cell padding / margins (<w:tcMar> or <w:tblCellMar>)
 */
function parseCellMargins(marXml) {
  const margins = { top: 2.5, bottom: 2.5, left: 5.4, right: 5.4 }
  if (!marXml) return margins

  const topM = marXml.match(/<w:top\s+[^>]*w:w="(\d+)"/)
  const botM = marXml.match(/<w:bottom\s+[^>]*w:w="(\d+)"/)
  const leftM = marXml.match(/<w:left\s+[^>]*w:w="(\d+)"/)
  const rightM = marXml.match(/<w:right\s+[^>]*w:w="(\d+)"/)

  if (topM) margins.top = parseInt(topM[1], 10) / 20
  if (botM) margins.bottom = parseInt(botM[1], 10) / 20
  if (leftM) margins.left = parseInt(leftM[1], 10) / 20
  if (rightM) margins.right = parseInt(rightM[1], 10) / 20

  return margins
}

/**
 * Parse table (<w:tbl>)
 */
function parseTable(tblXml, defaultStyles, rels, zip) {
  const tblPrMatch = tblXml.match(/<w:tblPr[\s\S]*?<\/w:tblPr>/)
  const tblPr = tblPrMatch ? tblPrMatch[0] : ''

  const defaultBorders = parseBorders(tblPr.match(/<w:tblBorders[\s\S]*?<\/w:tblBorders>/)?.[0])
  const defaultCellMar = parseCellMargins(tblPr.match(/<w:tblCellMar[\s\S]*?<\/w:tblCellMar>/)?.[0])

  // Table grid columns (exact column twips)
  const gridCols = (tblXml.match(/<w:gridCol\s+w:w="(\d+)"/g) || []).map(m => parseInt(m.match(/w:w="(\d+)"/)[1], 10))
  const gridColsPt = gridCols.map(tw => tw / 20)

  // Parse rows
  const trMatches = tblXml.split(/<w:tr\b/).slice(1)
  const rows = []

  for (const trXml of trMatches) {
    const trPrMatch = trXml.match(/<w:trPr[\s\S]*?<\/w:trPr>/)
    const trPr = trPrMatch ? trPrMatch[0] : ''

    const heightMatch = trPr.match(/<w:trHeight\s+[^>]*w:val="(\d+)"/)
    const minHeightPt = heightMatch ? parseInt(heightMatch[1], 10) / 20 : 0
    const cantSplit = /<w:cantSplit(\s|\/|>)/.test(trPr)
    const isHeader = /<w:tblHeader(\s|\/|>)/.test(trPr)

    const tcMatches = trXml.split(/<w:tc\b/).slice(1)
    const cells = []
    let currentColIdx = 0

    for (const tcXml of tcMatches) {
      const tcPrMatch = tcXml.match(/<w:tcPr[\s\S]*?<\/w:tcPr>/)
      const tcPr = tcPrMatch ? tcPrMatch[0] : ''

      const gridSpanMatch = tcPr.match(/<w:gridSpan\s+w:val="(\d+)"/)
      const span = gridSpanMatch ? parseInt(gridSpanMatch[1], 10) : 1

      // Vertical merge
      let vMerge = null
      const vMergeMatch = tcPr.match(/<w:vMerge(?:\s+w:val="([^"]+)")?/)
      if (vMergeMatch) {
        vMerge = vMergeMatch[1] === 'restart' ? 'restart' : 'continue'
      }

      // Explicit cell width in twips
      const tcWMatch = tcPr.match(/<w:tcW\s+[^>]*w:w="(\d+)"/)
      const definedWidthPt = tcWMatch ? parseInt(tcWMatch[1], 10) / 20 : null

      // Cell padding
      const cellMargins = parseCellMargins(tcPr.match(/<w:tcMar[\s\S]*?<\/w:tcMar>/)?.[0] || null)
      const padTop = cellMargins.top !== undefined ? cellMargins.top : defaultCellMar.top
      const padBottom = cellMargins.bottom !== undefined ? cellMargins.bottom : defaultCellMar.bottom
      const padLeft = cellMargins.left !== undefined ? cellMargins.left : defaultCellMar.left
      const padRight = cellMargins.right !== undefined ? cellMargins.right : defaultCellMar.right

      // Cell shading / background
      let bgColor = null
      const shdMatch = tcPr.match(/<w:shd\s+[^>]*w:fill="([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})"/)
      if (shdMatch && shdMatch[1].toLowerCase() !== 'auto') {
        bgColor = parseColor(shdMatch[1])
      }

      // Cell borders
      const cellBorders = parseBorders(tcPr.match(/<w:tcBorders[\s\S]*?<\/w:tcBorders>/)?.[0] || null)

      // Cell vertical alignment
      let vAlign = 'top'
      const vAlignMatch = tcPr.match(/<w:vAlign\s+w:val="([^"]+)"/)
      if (vAlignMatch) {
        const val = vAlignMatch[1].toLowerCase()
        if (val === 'center') vAlign = 'center'
        else if (val === 'bottom') vAlign = 'bottom'
      }

      // Paragraphs inside cell
      const pMatches = tcXml.split(/<w:p\b/).slice(1)
      const paragraphs = pMatches.map(pXml => parseParagraph(pXml, defaultStyles, rels, zip))

      cells.push({
        colIndex: currentColIdx,
        gridSpan: span,
        vMerge,
        definedWidthPt,
        padTop,
        padBottom,
        padLeft,
        padRight,
        bgColor,
        borders: cellBorders || defaultBorders,
        vAlign,
        paragraphs,
      })

      currentColIdx += span
    }

    rows.push({
      minHeightPt,
      cantSplit,
      isHeader,
      cells,
    })
  }

  return {
    type: 'table',
    gridColsPt,
    defaultBorders,
    defaultCellMar,
    rows,
  }
}

/**
 * Main DOCX Parser
 * Returns a high-fidelity Intermediate Document Model (IR)
 */
export async function parseDocx(input) {
  let zip
  if (!input) {
    throw new Error('No DOCX input provided for parsing.')
  }
  let binaryData = input
  if (input.blob) binaryData = input.blob
  else if (input.data) binaryData = input.data
  else if (input.file) binaryData = input.file

  if (binaryData instanceof ArrayBuffer || ArrayBuffer.isView(binaryData)) {
    zip = await JSZip.loadAsync(binaryData)
  } else if (typeof Buffer !== 'undefined' && Buffer.isBuffer(binaryData)) {
    zip = await JSZip.loadAsync(binaryData)
  } else if (typeof binaryData.bytes === 'function') {
    const u8 = await binaryData.bytes()
    zip = await JSZip.loadAsync(u8)
  } else if (typeof binaryData.arrayBuffer === 'function') {
    const buf = await binaryData.arrayBuffer()
    zip = await JSZip.loadAsync(buf)
  } else {
    throw new Error('Unsupported input type for DOCX parsing.')
  }

  const docFile = zip.file('word/document.xml')
  if (!docFile) {
    throw new Error('Invalid DOCX format: word/document.xml not found.')
  }

  const docXml = await docFile.async('text')
  const rels = await parseRelationships(zip)
  const defaultStyles = await parseStyles(zip)

  // Parse section properties (page size, margins, orientation)
  const sectPrMatch = docXml.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/)
  const sectPr = sectPrMatch ? sectPrMatch[0] : ''

  const pgSzMatch = sectPr.match(/<w:pgSz\s+([^>]*)\/>/)
  let pageW = 595.28 // A4 default
  let pageH = 841.89
  let orientation = 'portrait'

  if (pgSzMatch) {
    const attrs = pgSzMatch[1]
    const wM = attrs.match(/w:w="(\d+)"/)
    const hM = attrs.match(/w:h="(\d+)"/)
    const oM = attrs.match(/w:orient="([^"]+)"/)
    if (wM) pageW = parseInt(wM[1], 10) / 20
    if (hM) pageH = parseInt(hM[1], 10) / 20
    if (oM && oM[1] === 'landscape') orientation = 'landscape'
  }

  const pgMarMatch = sectPr.match(/<w:pgMar\s+([^>]*)\/>/)
  let topMar = 36
  let botMar = 36
  let leftMar = 36
  let rightMar = 36
  let headerMar = 30
  let footerMar = 30

  if (pgMarMatch) {
    const attrs = pgMarMatch[1]
    const tM = attrs.match(/w:top="(\d+)"/)
    const bM = attrs.match(/w:bottom="(\d+)"/)
    const lM = attrs.match(/w:left="(\d+)"/)
    const rM = attrs.match(/w:right="(\d+)"/)
    const hM = attrs.match(/w:header="(\d+)"/)
    const fM = attrs.match(/w:footer="(\d+)"/)

    if (tM) topMar = parseInt(tM[1], 10) / 20
    if (bM) botMar = parseInt(bM[1], 10) / 20
    if (lM) leftMar = parseInt(lM[1], 10) / 20
    if (rM) rightMar = parseInt(rM[1], 10) / 20
    if (hM) headerMar = parseInt(hM[1], 10) / 20
    if (fM) footerMar = parseInt(fM[1], 10) / 20
  }

  // Pre-load embedded media images
  const mediaImages = new Map()
  for (const [rId, target] of rels.entries()) {
    if (target.startsWith('media/') || target.includes('/media/')) {
      const cleanPath = target.startsWith('/') ? target.slice(1) : (target.startsWith('word/') ? target : `word/${target}`)
      const fileInZip = zip.file(cleanPath)
      if (fileInZip) {
        const imageBuf = await fileInZip.async('arraybuffer')
        mediaImages.set(rId, {
          path: cleanPath,
          buffer: imageBuf,
          format: cleanPath.endsWith('.png') ? 'png' : (cleanPath.endsWith('.jpg') || cleanPath.endsWith('.jpeg') ? 'jpeg' : 'unknown'),
        })
      }
    }
  }

  // Parse document body elements in sequential order (<w:p> and <w:tbl>)
  const bodyMatch = docXml.match(/<w:body>([\s\S]*?)<\/w:body>/)
  const bodyXml = bodyMatch ? bodyMatch[1] : docXml

  const elements = []
  // Split tokens by top-level <w:p and <w:tbl
  const tokenRegex = /(<w:p\b[\s\S]*?<\/w:p>|<w:tbl\b[\s\S]*?<\/w:tbl>)/g
  let match
  while ((match = tokenRegex.exec(bodyXml)) !== null) {
    const chunk = match[0]
    if (chunk.startsWith('<w:p')) {
      elements.push(parseParagraph(chunk, defaultStyles, rels, zip))
    } else if (chunk.startsWith('<w:tbl')) {
      elements.push(parseTable(chunk, defaultStyles, rels, zip))
    }
  }

  return {
    pageSize: { width: pageW, height: pageH, orientation },
    margins: { top: topMar, bottom: botMar, left: leftMar, right: rightMar, header: headerMar, footer: footerMar },
    printableWidth: pageW - leftMar - rightMar,
    printableHeight: pageH - topMar - botMar,
    elements,
    mediaImages,
  }
}
