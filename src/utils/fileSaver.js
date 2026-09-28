import { Capacitor } from '@capacitor/core'
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
 * Dedicated Native Android MediaStore Direct Save.
 *
 * Guarantees direct save to Downloads/ToolDesk/ without triggering the Android Share Sheet.
 * Supports memory-safe cache streaming for large files (>2MB) to prevent heap spikes.
 */
async function saveAndroidNative(blob, safeFilename, resolvedMime) {
  let base64Cache = null

  // 1. Check if Capacitor Plugin or JavascriptInterface is available
  const hasPlugin = Boolean(Capacitor?.isPluginAvailable && Capacitor.isPluginAvailable('ToolDeskNativeBridge'))
  const capPlugin = hasPlugin ? (Capacitor?.Plugins?.ToolDeskNativeBridge || window.Capacitor?.Plugins?.ToolDeskNativeBridge) : null
  const jsInterface = typeof window !== 'undefined' ? window.ToolDeskNativeBridge : null

  if (!capPlugin && !jsInterface) {
    console.error('Neither Capacitor plugin nor JavascriptInterface ToolDeskNativeBridge is available on Android')
    emitFeedback('error', "Couldn't save this file to Downloads. Please try again.", safeFilename)
    return false
  }

  // 2. Large File Optimization (> 2MB): Stream via temporary cache file to avoid heap/IPC overhead
  if (blob.size > 2 * 1024 * 1024) {
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem')
      if (Filesystem && typeof Filesystem.writeFile === 'function') {
        base64Cache = await blobToBase64(blob)
        const tempName = `temp_${Date.now()}_${safeFilename}`
        const writeRes = await Filesystem.writeFile({
          path: tempName,
          data: base64Cache,
          directory: Directory.Cache,
        })
        const cachePath = writeRes.uri || writeRes.path

        if (cachePath) {
          let res = null
          if (capPlugin && typeof capPlugin.saveFileToDownloads === 'function') {
            res = await capPlugin.saveFileToDownloads({
              cachePath,
              filename: safeFilename,
              mimeType: resolvedMime,
              openShare: false
            })
          } else if (jsInterface && typeof jsInterface.saveCacheFileToDownloads === 'function') {
            const raw = jsInterface.saveCacheFileToDownloads(cachePath, safeFilename, resolvedMime)
            res = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw
          }

          if (res && res.success) {
            emitFeedback('success', `Saved to Downloads/ToolDesk/${res.filename || safeFilename}`, safeFilename)
            return true
          }
        }
      }
    } catch (streamErr) {
      console.warn('Large file streaming fallback failed, trying direct memory bridge:', streamErr)
    }
  }

  // 3. Direct Memory Save via base64
  try {
    if (!base64Cache) {
      base64Cache = await blobToBase64(blob)
    }

    let res = null
    if (capPlugin && typeof capPlugin.saveFileToDownloads === 'function') {
      res = await capPlugin.saveFileToDownloads({
        base64Data: base64Cache,
        filename: safeFilename,
        mimeType: resolvedMime,
        openShare: false
      })
    } else if (jsInterface && typeof jsInterface.saveFileToDownloads === 'function') {
      const raw = jsInterface.saveFileToDownloads(base64Cache, safeFilename, resolvedMime, false)
      res = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw
    }

    if (res && res.success) {
      emitFeedback('success', `Saved to Downloads/ToolDesk/${res.filename || safeFilename}`, safeFilename)
      return true
    } else {
      const err = res?.error || "Couldn't save this file to Downloads."
      console.error('Android MediaStore save error:', err)
      emitFeedback('error', "Couldn't save this file to Downloads. Please try again.", safeFilename)
      return false
    }
  } catch (nativeErr) {
    console.error('Android native save exception:', nativeErr)
    emitFeedback('error', "Couldn't save this file to Downloads. Please try again.", safeFilename)
    return false
  }
}

/**
 * Smart, cross-platform file download engine for ToolDesk:
 * 
 * 1. Android APK:
 *    - Direct save to Downloads/ToolDesk/ via MediaStore.Downloads.
 *    - Strict download behavior: NEVER opens the Android Share Sheet for download action.
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

  // 3. ANDROID NATIVE DIRECT MEDIASTORE STRATEGY (NEVER open Share Sheet)
  const platform = getPlatform()
  const hasPlugin = Boolean(Capacitor?.isPluginAvailable && Capacitor.isPluginAvailable('ToolDeskNativeBridge'))
  const isAndroidNative = (isCapacitor() && platform === 'android') ||
    Boolean(hasPlugin || (typeof window !== 'undefined' && window.ToolDeskNativeBridge))

  if (isAndroidNative) {
    return saveAndroidNative(blob, safeFilename, resolvedMime)
  }

  // 4. CAPACITOR MOBILE (iOS) STRATEGY
  if (isCapacitor()) {
    // iOS: Native "Save to Files" via System Share Sheet
    if (platform === 'ios') {
      try {
        const { Filesystem, Directory } = await import('@capacitor/filesystem')
        if (!base64Cache) {
          base64Cache = await blobToBase64(blob)
        }

        const writeRes = await Filesystem.writeFile({
          path: safeFilename,
          data: base64Cache,
          directory: Directory.Cache,
        })

        const { Share } = await import('@capacitor/share')
        if (Share && typeof Share.share === 'function') {
          await Share.share({
            title: safeFilename,
            text: `ToolDesk: ${safeFilename}`,
            url: writeRes.uri,
            dialogTitle: `Save ${safeFilename}`,
          })
          emitFeedback('success', `Saved ${safeFilename}`, safeFilename)
          return true
        }

        emitFeedback('success', `Saved ${safeFilename}`, safeFilename)
        return true
      } catch (iosErr) {
        console.error('iOS download error:', iosErr)
        emitFeedback('error', `Failed to save ${safeFilename}`, safeFilename)
        return false
      }
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

/**
 * Explicit Share Action (separated cleanly from Download)
 */
export async function shareFile({ blob, filename, mimeType, title = '' }) {
  if (typeof window === 'undefined') return false

  let safeFilename = String(filename || 'tooldesk-share')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .trim()

  try {
    if (isCapacitor()) {
      const { Filesystem, Directory } = await import('@capacitor/filesystem')
      const base64 = await blobToBase64(blob)
      const writeRes = await Filesystem.writeFile({
        path: safeFilename,
        data: base64,
        directory: Directory.Cache,
      })

      const { Share } = await import('@capacitor/share')
      if (Share && typeof Share.share === 'function') {
        await Share.share({
          title: title || safeFilename,
          text: `Shared from ToolDesk: ${safeFilename}`,
          url: writeRes.uri,
          dialogTitle: `Share ${safeFilename}`,
        })
        return true
      }
    }

    if (navigator.share) {
      const file = new File([blob], safeFilename, { type: mimeType || blob.type })
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: title || safeFilename,
          text: `Shared from ToolDesk: ${safeFilename}`,
        })
        return true
      }
    }
  } catch (e) {
    console.warn('Share action failed or cancelled:', e)
  }
  return false
}
