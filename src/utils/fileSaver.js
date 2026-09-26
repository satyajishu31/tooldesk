import { isCapacitor, isTauri } from './apiConfig'

/**
 * Smart, cross-platform file saver for ToolDesk:
 * - Web (Desktop & Mobile browsers): Universal standard DOM anchor download
 *   directly saves to the browser Downloads folder with exact filename and MIME type.
 * - Capacitor Native App (Android / iOS): Uses native share/save sheet when WebView
 *   restricts direct Blob downloads.
 * - Tauri Desktop App: Direct desktop file output via DOM anchor / webview.
 */
export async function saveFileWithFallback(blobOrContent, filename, mimeType = 'application/octet-stream') {
  let blob

  if (blobOrContent instanceof Blob) {
    blob = blobOrContent
  } else if (typeof blobOrContent === 'string' && blobOrContent.startsWith('data:')) {
    // Correctly convert data: URI to a binary Blob
    try {
      const parts = blobOrContent.split(',')
      const mimeMatch = parts[0].match(/:(.*?);/)
      const resolvedMime = (mimeMatch && mimeMatch[1]) || mimeType || 'application/octet-stream'
      const byteString = atob(parts[1] || '')
      const ab = new ArrayBuffer(byteString.length)
      const ia = new Uint8Array(ab)
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i)
      }
      blob = new Blob([ab], { type: resolvedMime })
    } catch {
      blob = new Blob([blobOrContent], { type: mimeType })
    }
  } else {
    blob = new Blob([blobOrContent], { type: mimeType })
  }

  const safeFilename = String(filename || 'download')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/[\x00-\x1f\x80-\x9f]/g, '')
    .trim() || 'download'

  // 1. Capacitor Native Mobile Fallback (iOS / Android native WebView shells)
  // In native Capacitor shells, standard blob: anchor downloads are blocked by WebKit/Android WebView security sandboxes.
  if (isCapacitor() && typeof navigator !== 'undefined' && navigator.share && navigator.canShare) {
    try {
      const file = new File([blob], safeFilename, { type: blob.type || mimeType })
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: safeFilename,
        })
        return true
      }
    } catch (shareErr) {
      if (shareErr.name === 'AbortError') return false
      // Continue to anchor download if share fails
    }
  }

  // 2. Universal Web & Desktop Download (Chrome, Firefox, Safari, Edge, Tauri Desktop)
  // Preserves normal browser download behavior directly into the user's Downloads folder
  try {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = safeFilename
    a.rel = 'noopener'
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    setTimeout(() => {
      try {
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      } catch {}
    }, 60000)
    return true
  } catch (domErr) {
    console.error('DOM anchor download failed:', domErr)
    return false
  }
}

