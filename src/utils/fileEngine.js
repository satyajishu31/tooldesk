/**
 * ToolDesk Universal File Engine & Workspace
 * 
 * Provides unified abstraction for generated files, user uploads, and workspace outputs.
 * Seamlessly integrates with platform download strategies:
 * - Web/PWA: Universal DOM anchor download with safe lifecycle retention
 * - Android Native: Direct MediaStore.Downloads save (Downloads/ToolDesk/) strictly bypassing share sheet
 * - iOS Native: System Files/Share sheet integration
 * - Desktop Tauri: Native filesystem save
 * 
 * Workspace metadata is indexed in IndexedDB ('files' store) without duplicating giant binary payloads.
 */

import { saveFileWithFallback, shareFile, downloadFile } from './fileSaver.js'
import { dbPut, dbGetAll, dbGet, dbDelete, dbClear } from './storage.js'

// Standard MIME dictionary
export const MIME_EXT_MAP = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/x-icon': 'ico',
  'application/zip': 'zip',
  'application/json': 'json',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/x-subrip': 'srt',
  'text/vtt': 'vtt',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'video/mp4': 'mp4'
}

/**
 * Validates output properties before creation
 */
export function validateOutputMetadata({ filename, mimeType, size }) {
  const errors = []
  if (!filename || typeof filename !== 'string') {
    errors.push('Filename is required and must be a string')
  } else if (/[\x00-\x1f\x80-\x9f]/.test(filename)) {
    errors.push('Filename contains invalid control characters')
  }

  if (size !== undefined && typeof size === 'number' && size < 0) {
    errors.push('File size cannot be negative')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Creates a normalized File Output instance
 */
export function createOutput(arg1, arg2 = {}) {
  let blob, filename, mimeType, sourceTool, metadata
  if (arg1 instanceof Blob || (typeof Blob !== 'undefined' && (arg1 instanceof Uint8Array || ArrayBuffer.isView(arg1) || arg1 instanceof ArrayBuffer))) {
    blob = arg1 instanceof Blob ? arg1 : new Blob([arg1])
    filename = arg2.filename
    mimeType = arg2.mimeType || blob?.type
    sourceTool = arg2.tool || arg2.sourceTool || 'ToolDesk'
    metadata = arg2.metadata || {}
  } else if (arg1 && arg1.size !== undefined && arg2 && typeof arg2 === 'object') {
    blob = arg1
    filename = arg2.filename
    mimeType = arg2.mimeType || blob?.type
    sourceTool = arg2.tool || arg2.sourceTool || 'ToolDesk'
    metadata = arg2.metadata || {}
  } else if (arg1 && typeof arg1 === 'object') {
    blob = arg1.blob
    if (blob && !(blob instanceof Blob) && typeof Blob !== 'undefined' && (arg1.blob instanceof Uint8Array || ArrayBuffer.isView(arg1.blob) || arg1.blob instanceof ArrayBuffer)) {
      blob = new Blob([blob])
    }
    filename = arg1.filename
    mimeType = arg1.mimeType || blob?.type
    sourceTool = arg1.sourceTool || arg1.tool || 'ToolDesk'
    metadata = arg1.metadata || {}
  } else {
    throw new Error('createOutput requires valid file data or options')
  }
  const id = `file_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  const cleanName = String(filename || 'output')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .trim() || 'output'

  const resolvedMime = mimeType || blob?.type || 'application/octet-stream'
  const size = blob ? (blob.size || 0) : 0

  const output = {
    id,
    filename: cleanName,
    mimeType: resolvedMime,
    size,
    sourceTool: String(sourceTool),
    metadata,
    createdAt: Date.now(),
    blob, // in-memory reference

    /**
     * Validates output
     */
    validate() {
      return validateOutputMetadata({ filename: this.filename, mimeType: this.mimeType, size: this.size })
    },

    /**
     * Downloads/saves file to disk according to platform rules
     */
    async download() {
      if (!this.blob) throw new Error('File data is no longer in memory.')
      const res = await saveFileWithFallback(this.blob, this.filename, this.mimeType)
      await registerWorkspaceFile(this)
      return res
    },

    /**
     * Alias for save()
     */
    async save() {
      return this.download()
    },

    /**
     * Shares file via native or Web Share API
     */
    async share() {
      if (!this.blob) throw new Error('File data is no longer in memory.')
      return shareFile({ blob: this.blob, filename: this.filename, mimeType: this.mimeType })
    },

    /**
     * Renames output
     */
    rename(newName) {
      if (!newName || typeof newName !== 'string') return
      this.filename = newName.replace(/[/\\?%*:|"<>]/g, '_').trim()
      updateWorkspaceFileName(this.id, this.filename)
    },

    /**
     * Triggers file preview modal event
     */
    preview() {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('tooldesk-preview-file', { detail: this }))
      }
    },

    /**
     * Copies text content to clipboard if plain text/json/csv
     */
    async copy() {
      if (!this.blob) return false
      try {
        const text = await this.blob.text()
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
          await navigator.clipboard.writeText(text)
          return true
        }
      } catch (e) {
        console.warn('[FileEngine] Copy to clipboard failed:', e)
      }
      return false
    }
  }

  return output
}

/**
 * Registers a completed output into the local File Workspace
 */
export async function registerWorkspaceFile(output) {
  if (!output || !output.id) return false
  const record = {
    id: output.id,
    filename: output.filename,
    mimeType: output.mimeType,
    size: output.size,
    sourceTool: output.sourceTool,
    createdAt: output.createdAt || Date.now(),
    metadata: output.metadata || {}
  }

  try {
    await dbPut('files', record)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tooldesk-workspace-updated', { detail: record }))
    }
    return true
  } catch (e) {
    console.warn('[Workspace] Registration failed:', e)
    return false
  }
}

/**
 * Updates filename in workspace metadata
 */
async function updateWorkspaceFileName(id, newName) {
  try {
    const existing = await dbGet('files', id)
    if (existing) {
      existing.filename = newName
      await dbPut('files', existing)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('tooldesk-workspace-updated', { detail: existing }))
      }
    }
  } catch {}
}

/**
 * Retrieves workspace files with search & pagination
 */
export async function getWorkspaceFiles({ sourceTool = null, search = '', limit = 50 } = {}) {
  try {
    let files = await dbGetAll('files')
    if (!files) return []

    files.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))

    if (sourceTool) {
      const lowerTool = sourceTool.toLowerCase()
      files = files.filter(f => f.sourceTool && f.sourceTool.toLowerCase().includes(lowerTool))
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase()
      files = files.filter(f =>
        (f.filename && f.filename.toLowerCase().includes(q)) ||
        (f.sourceTool && f.sourceTool.toLowerCase().includes(q)) ||
        (f.mimeType && f.mimeType.toLowerCase().includes(q))
      )
    }

    return files.slice(0, limit)
  } catch (e) {
    console.warn('[Workspace] Read failed:', e)
    return []
  }
}

/**
 * Deletes a file from the workspace
 */
export async function deleteWorkspaceFile(id) {
  if (!id) return false
  try {
    await dbDelete('files', id)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tooldesk-workspace-updated', { detail: { id, deleted: true } }))
    }
    return true
  } catch (e) {
    console.warn('[Workspace] Delete failed:', e)
    return false
  }
}

/**
 * Clears all workspace records
 */
export async function clearWorkspace() {
  try {
    await dbClear('files')
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tooldesk-workspace-updated', { detail: { cleared: true } }))
    }
    return true
  } catch (e) {
    return false
  }
}
