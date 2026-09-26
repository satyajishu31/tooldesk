/**
 * Pure binary metadata parser for image files.
 * Extracts authentic DPI/PPI, pixel dimensions, format signature,
 * and EXIF orientation directly from byte buffers without fabricating values.
 */

export function parseBinaryImageMetadata(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer)
  const view = new DataView(arrayBuffer)

  // 1. Detect verified format by magic bytes
  let verifiedFormat = 'unknown'
  let mimeType = 'application/octet-stream'

  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    verifiedFormat = 'PNG'
    mimeType = 'image/png'
  } else if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    verifiedFormat = 'JPEG'
    mimeType = 'image/jpeg'
  } else if (bytes.length >= 12 &&
             String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
             String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP') {
    verifiedFormat = 'WebP'
    mimeType = 'image/webp'
  } else if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    verifiedFormat = 'GIF'
    mimeType = 'image/gif'
  } else if (bytes[0] === 0x42 && bytes[1] === 0x4D) {
    verifiedFormat = 'BMP'
    mimeType = 'image/bmp'
  } else if (bytes.length >= 4 && ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2A && bytes[3] === 0x00) ||
                                  (bytes[0] === 0x4D && bytes[1] === 0x4D && bytes[2] === 0x00 && bytes[3] === 0x2A))) {
    verifiedFormat = 'TIFF'
    mimeType = 'image/tiff'
  }

  let dpiX = null
  let dpiY = null
  let dpiUnit = null // 'DPI' | 'DPC'
  let orientation = null
  let colorType = null

  // ── HELPER: TIFF IFD PARSER (Used by TIFF, JPEG EXIF, and WebP EXIF) ──
  function parseTiffDirectory(tiffStart) {
    if (tiffStart + 8 > bytes.length) return null
    const endian = String.fromCharCode(bytes[tiffStart], bytes[tiffStart + 1])
    if (endian !== 'II' && endian !== 'MM') return null
    const littleEndian = endian === 'II'

    const magic = view.getUint16(tiffStart + 2, littleEndian)
    if (magic !== 42 && magic !== 0x2A) return null

    const ifdOffset = view.getUint32(tiffStart + 4, littleEndian)
    let cur = tiffStart + ifdOffset

    if (cur + 2 > bytes.length) return null
    const numEntries = view.getUint16(cur, littleEndian)
    cur += 2

    let parsedOrientation = null
    let resUnit = 2 // 2 = inches, 3 = cm
    let rawXRes = null
    let rawYRes = null

    for (let i = 0; i < numEntries; i++) {
      const entry = cur + i * 12
      if (entry + 12 > bytes.length) break
      const tag = view.getUint16(entry, littleEndian)
      const valOffset = view.getUint32(entry + 8, littleEndian)

      if (tag === 0x0112) {
        parsedOrientation = view.getUint16(entry + 8, littleEndian)
      } else if (tag === 0x0128) {
        resUnit = view.getUint16(entry + 8, littleEndian)
      } else if (tag === 0x011A) {
        const p = tiffStart + valOffset
        if (p + 8 <= bytes.length) {
          const num = view.getUint32(p, littleEndian)
          const den = view.getUint32(p + 4, littleEndian)
          if (den > 0) rawXRes = num / den
        }
      } else if (tag === 0x011B) {
        const p = tiffStart + valOffset
        if (p + 8 <= bytes.length) {
          const num = view.getUint32(p, littleEndian)
          const den = view.getUint32(p + 4, littleEndian)
          if (den > 0) rawYRes = num / den
        }
      }
    }

    let parsedDpiX = null
    let parsedDpiY = null
    let parsedDpiUnit = null
    if (rawXRes && rawXRes > 0) {
      if (resUnit === 3) {
        parsedDpiX = Math.round(rawXRes * 2.54)
        parsedDpiY = rawYRes ? Math.round(rawYRes * 2.54) : parsedDpiX
      } else {
        parsedDpiX = Math.round(rawXRes)
        parsedDpiY = rawYRes ? Math.round(rawYRes) : parsedDpiX
      }
      parsedDpiUnit = 'DPI'
    }

    return { orientation: parsedOrientation, dpiX: parsedDpiX, dpiY: parsedDpiY, dpiUnit: parsedDpiUnit }
  }

  // ── PNG METADATA (pHYs chunk) ──
  if (verifiedFormat === 'PNG') {
    let offset = 8 // Skip 8-byte PNG signature
    while (offset + 8 < bytes.length) {
      const chunkLen = view.getUint32(offset, false)
      const chunkType = String.fromCharCode(
        bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]
      )

      if (chunkType === 'IHDR' && chunkLen >= 13) {
        const ct = bytes[offset + 8 + 9]
        colorType = (ct === 4 || ct === 6) ? 'Has Alpha Channel' : 'Opaque'
      }

      if (chunkType === 'pHYs' && chunkLen >= 9) {
        const dataOffset = offset + 8
        const ppuX = view.getUint32(dataOffset, false)
        const ppuY = view.getUint32(dataOffset + 4, false)
        const unitSpec = bytes[dataOffset + 8]

        if (unitSpec === 1) {
          dpiX = Math.round(ppuX * 0.0254)
          dpiY = Math.round(ppuY * 0.0254)
          dpiUnit = 'DPI'
        } else if (ppuX > 0 && ppuY > 0) {
          dpiUnit = 'ratio-only'
        }
        break
      }

      if (chunkType === 'IEND') break
      offset += 12 + chunkLen
    }
  }

  // ── JPEG METADATA (APP0 JFIF & APP1 EXIF) ──
  if (verifiedFormat === 'JPEG') {
    let offset = 2 // Skip SOI marker 0xFFD8
    while (offset < bytes.length) {
      if (bytes[offset] !== 0xFF) break
      const marker = bytes[offset + 1]

      if (marker === 0xDA || marker === 0xD9) break

      const len = view.getUint16(offset + 2, false)
      if (len < 2) break

      // APP0 (JFIF)
      if (marker === 0xE0) {
        const id = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8))
        if (id === 'JFIF') {
          const densityUnit = bytes[offset + 11]
          const xDensity = view.getUint16(offset + 12, false)
          const yDensity = view.getUint16(offset + 14, false)

          if (densityUnit === 1 && xDensity > 0) {
            dpiX = xDensity
            dpiY = yDensity
            dpiUnit = 'DPI'
          } else if (densityUnit === 2 && xDensity > 0) {
            dpiX = Math.round(xDensity * 2.54)
            dpiY = Math.round(yDensity * 2.54)
            dpiUnit = 'DPI'
          }
        }
      }

      // APP1 (EXIF)
      if (marker === 0xE1) {
        const id = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8))
        if (id === 'Exif') {
          const tiffResult = parseTiffDirectory(offset + 10)
          if (tiffResult) {
            if (tiffResult.orientation) orientation = tiffResult.orientation
            if (tiffResult.dpiX && !dpiX) {
              dpiX = tiffResult.dpiX
              dpiY = tiffResult.dpiY
              dpiUnit = tiffResult.dpiUnit
            }
          }
        }
      }

      offset += 2 + len
    }
  }

  // ── STANDALONE TIFF METADATA ──
  if (verifiedFormat === 'TIFF') {
    const tiffResult = parseTiffDirectory(0)
    if (tiffResult) {
      if (tiffResult.orientation) orientation = tiffResult.orientation
      if (tiffResult.dpiX) {
        dpiX = tiffResult.dpiX
        dpiY = tiffResult.dpiY
        dpiUnit = tiffResult.dpiUnit
      }
    }
  }

  // ── BMP METADATA (DIB header XPelsPerMeter / YPelsPerMeter) ──
  if (verifiedFormat === 'BMP' && bytes.length >= 46) {
    const dibHeaderSize = view.getUint32(14, true)
    if (dibHeaderSize >= 40) {
      const xPpm = view.getInt32(38, true)
      const yPpm = view.getInt32(42, true)
      if (xPpm > 0 && yPpm > 0) {
        dpiX = Math.round(xPpm * 0.0254)
        dpiY = Math.round(yPpm * 0.0254)
        dpiUnit = 'DPI'
      }
    }
  }

  // ── WEBP METADATA (EXIF chunk) ──
  if (verifiedFormat === 'WebP') {
    let offset = 12 // Skip 'RIFF' + 4-byte size + 'WEBP'
    while (offset + 8 < bytes.length) {
      const chunkTag = String.fromCharCode(...bytes.subarray(offset, offset + 4))
      const chunkSize = view.getUint32(offset + 4, true)
      const chunkPayload = offset + 8

      if (chunkTag === 'EXIF' && chunkPayload + chunkSize <= bytes.length) {
        let tiffStart = chunkPayload
        // EXIF chunk in WebP can sometimes prefix with 'Exif\0\0'
        if (chunkSize >= 6 && String.fromCharCode(...bytes.subarray(chunkPayload, chunkPayload + 4)) === 'Exif') {
          tiffStart = chunkPayload + 6
        }
        const tiffResult = parseTiffDirectory(tiffStart)
        if (tiffResult) {
          if (tiffResult.orientation) orientation = tiffResult.orientation
          if (tiffResult.dpiX) {
            dpiX = tiffResult.dpiX
            dpiY = tiffResult.dpiY
            dpiUnit = tiffResult.dpiUnit
          }
        }
        break
      }

      // WebP chunks are padded to even length
      offset += 8 + chunkSize + (chunkSize % 2)
    }
  }

  return {
    verifiedFormat,
    format: verifiedFormat,
    mimeType,
    hasEmbeddedDpi: dpiX !== null && dpiX > 0 && dpiUnit === 'DPI',
    dpiX,
    dpiY,
    dpiUnit,
    orientation,
    colorType,
    hasAlpha: colorType === 'Has Alpha Channel',
  }
}

export const parseImageMetadata = parseBinaryImageMetadata
