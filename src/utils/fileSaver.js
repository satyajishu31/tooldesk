import { isCapacitor, isTauri, getPlatform } from './apiConfig.js'

/**
 * MIME and Extension Normalization Dictionary
 */
const MIME_TO_EXT = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'image/gif': 'gif',
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
  'application/json': 'json',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/x-subrip': 'srt',
  'text/vtt': 'vtt',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'video/mp4': 'mp4',
}

const EXT_TO_MIME = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  gif: 'image/gif',
  zip: 'application/zip',
  json: 'application/json',
  csv: 'text/csv',
  txt: 'text/plain',
  srt: 'application/x-subrip',
  vtt: 'text/vtt',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  'tooldesk-vault': 'application/octet-stream',
}

/**
 * Converts a Blob or File to a Base64 string safely across browsers and WebViews
 */
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const dataUrl = reader.result
      if (typeof dataUrl === 'string') {
        const commaIdx = dataUrl.indexOf(',')
        resolve(commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : dataUrl)
      } else {
        reject(new Error('FileReader did not return a string'))
      }
    }
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'))
    reader.readAsDataURL(blob)
  })
}

/**
 * Dispatches a standard user-facing feedback event
 */
function emitFeedback(status, message, filename) {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(
      new CustomEvent('tooldesk-notification', {
        detail: {
          type: status,
          text: message,
          filename,
          timestamp: Date.now(),
        },
      })
    )
  } catch {}
}

/**
 * Smart, cross-platform file download engine for ToolDesk:
 * 
 * 1. Android APK (Capacitor Native):
 *    - Uses native ToolDeskNativeBridge via MediaStore.Downloads (Downloads/ToolDesk folder).
 *    - Falls back to @capacitor/filesystem + @capacitor/share if bridge is unattached.
 * 2. iOS Native App (Capacitor Native):
 *    - Uses @capacitor/filesystem + @capacitor/share to trigger native "Save to Files" dialog.
 * 3. Tauri Desktop App:
 *    - Standard webview/desktop anchor download with direct filesystem destination.
 * 4. Web (Chrome, Firefox, Safari, Edge):
 *    - Universal DOM anchor download with safe lifecycle retention (60s before revoke).
 */
export async function saveFileWithFallback(blobOrContent, filename, mimeType = '') {
  let blob
  let base64Cache = null

  // 1. Normalize input to Blob
  if (blobOrContent instanceof Blob) {
    blob = blobOrContent
  } else if (typeof blobOrContent === 'string' && blobOrContent.startsWith('data:')) {
    try {
      const parts = blobOrContent.split(',')
      const mimeMatch = parts[0].match(/:(.*?);/)
      const resolvedFromData = (mimeMatch && mimeMatch[1]) || mimeType || 'application/octet-stream'
      base64Cache = parts[1] || ''
      const byteString = atob(base64Cache)
      const ab = new ArrayBuffer(byteString.length)
      const ia = new Uint8Array(ab)
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i)
      }
      blob = new Blob([ab], { type: resolvedFromData })
    } catch {
      blob = new Blob([blobOrContent], { type: mimeType || 'application/octet-stream' })
    }
  } else if (typeof blobOrContent === 'string') {
    blob = new Blob([blobOrContent], { type: mimeType || 'text/plain;charset=utf-8' })
  } else if (blobOrContent instanceof ArrayBuffer) {
    blob = new Blob([blobOrContent], { type: mimeType || 'application/octet-stream' })
  } else {
    try {
      blob = new Blob([blobOrContent], { type: mimeType || 'application/octet-stream' })
    } catch {
      blob = new Blob([String(blobOrContent)], { type: mimeType || 'text/plain' })
    }
  }

  // 2. Sanitize and validate filename and MIME
  let safeFilename = String(filename || 'tooldesk-download')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/[\x00-\x1f\x80-\x9f]/g, '')
    .trim() || 'tooldesk-download'

  const extMatch = safeFilename.match(/\.([a-zA-Z0-9_-]+)$/)
  const currentExt = extMatch ? extMatch[1].toLowerCase() : ''

  let resolvedMime = mimeType || blob.type || ''
  if (!resolvedMime || resolvedMime === 'application/octet-stream') {
    if (currentExt && EXT_TO_MIME[currentExt]) {
      resolvedMime = EXT_TO_MIME[currentExt]
    } else {
      resolvedMime = 'application/octet-stream'
    }
  }

  if (!currentExt && MIME_TO_EXT[resolvedMime]) {
    safeFilename = `${safeFilename}.${MIME_TO_EXT[resolvedMime]}`
  }

  // 3. CAPACITOR ANDROID NATIVE STRATEGY
  if (isCapacitor()) {
    const platform = getPlatform()

    // 3A. Android: Try high-performance direct MediaStore bridge first
    if (platform === 'android' && typeof window !== 'undefined' && window.ToolDeskNativeBridge?.saveFileToDownloads) {
      try {
        if (!base64Cache) {
          base64Cache = await blobToBase64(blob)
        }
        const rawRes = window.ToolDeskNativeBridge.saveFileToDownloads(base64Cache, safeFilename, resolvedMime, false)
        const parsed = JSON.parse(rawRes || '{}')
        if (parsed.success) {
          emitFeedback('success', `Saved ${safeFilename} to Downloads/ToolDesk`, safeFilename)
          return true
        }
      } catch (bridgeErr) {
        console.warn('Native bridge save failed, trying @capacitor/filesystem fallback:', bridgeErr)
      }
    }

    // 3B. Capacitor Native Fallback (@capacitor/filesystem & @capacitor/share) for Android and iOS
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem')
      if (!base64Cache) {
        base64Cache = await blobToBase64(blob)
      }

      // Write file into Cache or Documents directory
      const writeRes = await Filesystem.writeFile({
        path: safeFilename,
        data: base64Cache,
        directory: Directory.Cache,
      })

      // On iOS or when needed, present native system share/save sheet
      const { Share } = await import('@capacitor/share')
      if (Share && typeof Share.share === 'function') {
        await Share.share({
          title: safeFilename,
          text: `ToolDesk: ${safeFilename}`,
          url: writeRes.uri,
          dialogTitle: `Save ${safeFilename}`,
        })
        emitFeedback('success', `Exported ${safeFilename}`, safeFilename)
        return true
      }

      emitFeedback('success', `Saved ${safeFilename}`, safeFilename)
      return true
    } catch (capErr) {
      console.warn('Capacitor filesystem/share fallback failed, trying DOM download:', capErr)
    }
  }

  // 4. UNIVERSAL WEB & TAURI DESKTOP STRATEGY (DOM Anchor)
  try {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = safeFilename
    a.rel = 'noopener'
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()

    // Retain object URL for 60 seconds to ensure slow downloads or mobile viewports finish consuming it
    setTimeout(() => {
      try {
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      } catch {}
    }, 60000)

    emitFeedback('success', `Downloaded ${safeFilename}`, safeFilename)
    return true
  } catch (domErr) {
    console.error('DOM anchor download failed:', domErr)
    emitFeedback('error', `Failed to download ${safeFilename}`, safeFilename)
    return false
  }
}

/**
 * Unified alias as specified in requirements
 */
export async function downloadFile({ blob, filename, mimeType, options = {} }) {
  return saveFileWithFallback(blob, filename, mimeType)
}
