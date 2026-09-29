/**
 * ToolDesk Inbound Share Manager
 * 
 * Handles incoming shared files from Android ACTION_SEND, ACTION_SEND_MULTIPLE, and ACTION_VIEW.
 * Routes received files safely to the corresponding ToolDesk tool:
 * - PDF documents -> PDF Studio (/tools/pdf)
 * - Image files -> File Converter (/tools/fileconvert) or Image Studio
 * - Text / Data files -> File Converter (/tools/fileconvert)
 */

let pendingFiles = []

function dataUrlToFile(dataUrl, filename) {
  try {
    const arr = dataUrl.split(',')
    const mime = arr[0].match(/:(.*?);/)?.[1] || 'application/octet-stream'
    const bstr = atob(arr[1])
    let n = bstr.length
    const u8arr = new Uint8Array(n)
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n)
    }
    return new File([u8arr], filename, { type: mime })
  } catch (err) {
    console.warn('[inboundShare] Failed to parse dataUrl:', err)
    return null
  }
}

export function routeIncomingFiles(rawFiles, navigate) {
  if (!Array.isArray(rawFiles) || !rawFiles.length) return

  const fileObjects = []
  for (const item of rawFiles) {
    if (item.dataUrl) {
      const f = dataUrlToFile(item.dataUrl, item.name || 'shared_file')
      if (f) fileObjects.push(f)
    } else {
      // Create empty/placeholder File with metadata if huge binary
      const f = new File([new Uint8Array(0)], item.name || 'shared_file', {
        type: item.mimeType || 'application/octet-stream'
      })
      f._cachePath = item.cachePath
      f._size = item.size
      fileObjects.push(f)
    }
  }

  if (!fileObjects.length) return
  pendingFiles = [...pendingFiles, ...fileObjects]

  // Determine primary target route
  const first = fileObjects[0]
  const isPdf = first.name.toLowerCase().endsWith('.pdf') || first.type === 'application/pdf'
  const isImage = first.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(first.name)

  let targetPath = '/tools/fileconvert'
  if (isPdf) {
    targetPath = '/tools/pdf'
  } else if (isImage) {
    targetPath = '/tools/fileconvert'
  }

  // Broadcast event for active tool
  window.dispatchEvent(new CustomEvent('tooldesk-shared-files-ready', { detail: fileObjects }))

  // Navigate if not already on the target tool
  if (typeof navigate === 'function') {
    navigate(targetPath)
  }
}

export function consumePendingInboundFiles() {
  const files = [...pendingFiles]
  pendingFiles = []
  return files
}

export function initInboundShare(navigate) {
  // 1. Check native bridge on startup
  if (typeof window !== 'undefined' && window.ToolDeskNativeBridge?.getPendingSharedFiles) {
    try {
      const rawJson = window.ToolDeskNativeBridge.getPendingSharedFiles()
      if (rawJson) {
        const parsed = JSON.parse(rawJson)
        if (Array.isArray(parsed) && parsed.length > 0) {
          window.ToolDeskNativeBridge.clearPendingSharedFiles()
          routeIncomingFiles(parsed, navigate)
        }
      }
    } catch (e) {
      console.warn('[inboundShare] Bridge check error:', e)
    }
  }

  // 2. Listen to real-time events from MainActivity
  const handleEvent = (e) => {
    if (e.detail) {
      routeIncomingFiles(e.detail, navigate)
    }
  }

  window.addEventListener('tooldesk-inbound-share', handleEvent)
  return () => {
    window.removeEventListener('tooldesk-inbound-share', handleEvent)
  }
}
