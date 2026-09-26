/**
 * Tool Chaining System — ToolDesk Universal Workflow Infrastructure
 * Enables seamless transition between compatible tools without manual download/re-upload.
 * In-memory reference avoids unnecessary re-encoding, large localStorage limits, and prevents memory leaks.
 */

let _chainedPayload = null
let _chainedPayloadTimer = null

/**
 * Set the current active chained payload.
 * Payload: {
 *   file?: File | Blob,
 *   dataUrl?: string,
 *   text?: string,
 *   filename: string,
 *   mimeType: string,
 *   sourceTool: string,
 *   type: 'image' | 'pdf' | 'video' | 'text' | 'json'
 * }
 */
export function setChainedPayload(payload) {
  if (_chainedPayloadTimer) clearTimeout(_chainedPayloadTimer)
  _chainedPayload = {
    ...payload,
    timestamp: Date.now()
  }

  // Auto-expire payload after 5 minutes if not consumed to prevent memory retention
  _chainedPayloadTimer = setTimeout(() => {
    clearChainedPayload()
  }, 5 * 60 * 1000)

  window.dispatchEvent(new CustomEvent('tooldesk-chain-updated', { detail: _chainedPayload }))
}

/**
 * Check if a chained payload is currently available for specified type(s)
 */
export function hasChainedPayload(acceptedTypes = []) {
  if (!_chainedPayload) return false
  if (!acceptedTypes.length) return true
  return acceptedTypes.includes(_chainedPayload.type)
}

/**
 * Consume and clear the current chained payload if type matches
 */
export function consumeChainedPayload(acceptedTypes = []) {
  if (!_chainedPayload) return null
  if (acceptedTypes.length && !acceptedTypes.includes(_chainedPayload.type)) {
    return null
  }
  const payload = _chainedPayload
  clearChainedPayload()
  return payload
}

/**
 * Clear current chained payload
 */
export function clearChainedPayload() {
  if (_chainedPayloadTimer) {
    clearTimeout(_chainedPayloadTimer)
    _chainedPayloadTimer = null
  }
  _chainedPayload = null
  window.dispatchEvent(new CustomEvent('tooldesk-chain-updated', { detail: null }))
}

/**
 * Next-compatible tools directory by payload type
 */
export const COMPATIBLE_TOOLS = {
  image: [
    { id: 'imgcompress', title: 'Compress Image', path: '/tools/imgcompress', icon: '🗜️' },
    { id: 'imgresizer', title: 'Resize Image', path: '/tools/imgresizer', icon: '🔭' },
    { id: 'imgconvert', title: 'Convert Format', path: '/tools/imgconvert', icon: '♻️' },
    { id: 'bgremove', title: 'Remove Background', path: '/tools/bgremove', icon: '🪄' },
    { id: 'imagetools', title: 'Image Tools Studio', path: '/tools/image-tools', icon: '✨' },
    { id: 'pdf', title: 'Convert to PDF', path: '/tools/pdf', icon: '📄' },
  ],
  pdf: [
    { id: 'pdf-compress', title: 'Compress PDF', path: '/tools/pdf', icon: '🗜️', action: 'compress' },
    { id: 'pdf-reorder', title: 'Organize Pages', path: '/tools/pdf', icon: '📑', action: 'reorder' },
    { id: 'pdf-protect', title: 'Protect PDF', path: '/tools/pdf', icon: '🔒', action: 'protect' },
    { id: 'pdf-redact', title: 'Redact PDF', path: '/tools/pdf', icon: '🙈', action: 'redact' },
    { id: 'pdf-ocr', title: 'OCR & Extract Text', path: '/tools/pdf', icon: '👁️', action: 'ocr' },
  ],
  video: [
    { id: 'videoscreenshot', title: 'Extract Frames', path: '/tools/video-screenshot', icon: '🎬' },
    { id: 'videotranscriber', title: 'Transcribe Audio', path: '/tools/video-transcriber', icon: '🎙️' },
  ],
  text: [
    { id: 'wordcount', title: 'Word & Text Analytics', path: '/tools/wordcount', icon: '📊' },
    { id: 'translator', title: 'Translate Text', path: '/tools/translator', icon: '🌐' },
    { id: 'textcase', title: 'Convert Case', path: '/tools/textcase', icon: '✏️' },
    { id: 'wordreplace', title: 'Find & Replace', path: '/tools/wordreplace', icon: '🔍' },
    { id: 'pdf', title: 'Export to PDF', path: '/tools/pdf', icon: '📄' },
  ]
}
