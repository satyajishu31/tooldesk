/**
 * QR Code generation utilities for ToolDesk.
 * Uses the battle-tested `qrcode` npm package (ISO/IEC 18004 compliant)
 * for reliable, scannable QR code output.
 * Zero external API calls — 100% client-side, privacy-first.
 */
import QRCode from 'qrcode'

/**
 * Generate a QR Code as a PNG data URL.
 * @param {string} text  – The content to encode
 * @param {object} opts  – { size, color, bgColor, ecc, margin }
 * @returns {string}     – data:image/png;base64,… string (or '' on error)
 */
export function generateQRDataURL(text, options = {}) {
  const {
    size = 256,
    color = '#000000',
    bgColor = '#ffffff',
    ecc = 'M',
    margin = 2,
  } = options

  if (!text || typeof text !== 'string' || !text.trim()) return ''

  try {
    // qrcode.toDataURL is async, but .create() + canvas render is sync
    const qr = QRCode.create(text.trim(), {
      errorCorrectionLevel: (ecc || 'M').toUpperCase(),
    })

    const modules = qr.modules
    const moduleCount = modules.size
    const quietZone = Math.max(0, margin)
    const totalModules = moduleCount + quietZone * 2
    const cellSize = Math.max(2, Math.floor((size || 256) / totalModules))
    const canvasSize = cellSize * totalModules

    if (typeof document === 'undefined') {
      // SSR fallback: return SVG data URL
      const svg = generateQRSVG(text, options)
      return svg ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) : ''
    }

    const canvas = document.createElement('canvas')
    canvas.width = canvasSize
    canvas.height = canvasSize
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''

    // Background
    ctx.fillStyle = bgColor
    ctx.fillRect(0, 0, canvasSize, canvasSize)

    // Dark modules
    ctx.fillStyle = color
    for (let y = 0; y < moduleCount; y++) {
      for (let x = 0; x < moduleCount; x++) {
        if (modules.get(x, y)) {
          ctx.fillRect(
            (x + quietZone) * cellSize,
            (y + quietZone) * cellSize,
            cellSize,
            cellSize
          )
        }
      }
    }

    return canvas.toDataURL('image/png')
  } catch (e) {
    console.error('QR generation error:', e)
    return ''
  }
}

/**
 * Generate a QR Code as an SVG string.
 * @param {string} text  – The content to encode
 * @param {object} opts  – { size, color, bgColor, ecc, margin }
 * @returns {string}     – SVG markup string (or '' on error)
 */
export function generateQRSVG(text, options = {}) {
  const {
    size = 256,
    color = '#000000',
    bgColor = '#ffffff',
    ecc = 'M',
    margin = 2,
  } = options

  if (!text || typeof text !== 'string' || !text.trim()) return ''

  try {
    const qr = QRCode.create(text.trim(), {
      errorCorrectionLevel: (ecc || 'M').toUpperCase(),
    })

    const modules = qr.modules
    const moduleCount = modules.size
    const quietZone = Math.max(0, margin)
    const totalModules = moduleCount + quietZone * 2

    let rects = ''
    for (let y = 0; y < moduleCount; y++) {
      for (let x = 0; x < moduleCount; x++) {
        if (modules.get(x, y)) {
          rects += `<rect x="${x + quietZone}" y="${y + quietZone}" width="1" height="1" fill="${color}"/>`
        }
      }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalModules} ${totalModules}" width="${size}" height="${size}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="${bgColor}"/>${rects}</svg>`
  } catch (e) {
    console.error('QR SVG generation error:', e)
    return ''
  }
}

/**
 * Generate the raw QR code matrix (boolean grid).
 * Kept for backward compatibility if anything uses it.
 * @param {string} text
 * @param {string} eccLevel
 * @returns {number[][]}
 */
export function generateQRMatrix(text, eccLevel = 'M') {
  if (!text || typeof text !== 'string') return []

  try {
    const qr = QRCode.create(text.trim(), {
      errorCorrectionLevel: (eccLevel || 'M').toUpperCase(),
    })

    const modules = qr.modules
    const n = modules.size
    const matrix = []

    for (let y = 0; y < n; y++) {
      const row = []
      for (let x = 0; x < n; x++) {
        row.push(modules.get(x, y) ? 1 : 0)
      }
      matrix.push(row)
    }

    return matrix
  } catch (e) {
    console.error('QR matrix generation error:', e)
    return []
  }
}
