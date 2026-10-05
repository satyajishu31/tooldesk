/**
 * ToolDesk Universal Batch Processing Engine
 * 
 * Manages multi-file processing with:
 * - Controlled concurrency (1-2 concurrent items to guarantee mobile heap safety)
 * - Immediate memory reclamation after each item completes
 * - Per-item progress and status tracking (queued -> processing -> done | failed | cancelled)
 * - Automatic packaging into a downloadable ZIP archive via JSZip
 * - Granular control: cancelAll, retryFailed, removeItem, clearCompleted
 */

import JSZip from 'jszip'
import { saveFileWithFallback } from './fileSaver.js'
import { createOutput } from './fileEngine.js'

export const BATCH_ITEM_STATUS = {
  QUEUED: 'queued',
  PROCESSING: 'processing',
  DONE: 'done',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
}

const IS_MOBILE = typeof navigator !== 'undefined' && /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent)
const DEFAULT_CONCURRENCY = IS_MOBILE ? 1 : 2

/**
 * Creates a new Batch Processing Session
 */
export function createBatchSession({
  tool,
  processItem,
  onUpdate,
  concurrency = DEFAULT_CONCURRENCY,
  zipFilename = 'tooldesk-batch-export.zip'
}) {
  if (typeof processItem !== 'function') {
    throw new Error('createBatchSession requires a processItem function')
  }

  const sessionId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  let items = []
  let activeWorkers = 0
  let isCancelled = false
  const activeControllers = new Map()

  function notify() {
    if (typeof onUpdate === 'function') {
      const total = items.length
      const done = items.filter(i => i.status === BATCH_ITEM_STATUS.DONE).length
      const failed = items.filter(i => i.status === BATCH_ITEM_STATUS.FAILED).length
      const progress = total > 0 ? Math.round(((done + failed) / total) * 100) : 0
      onUpdate({
        sessionId,
        items: [...items],
        total,
        done,
        failed,
        progress,
        isProcessing: activeWorkers > 0,
        isCancelled
      })
    }
  }

  async function processNext() {
    if (isCancelled) return
    if (activeWorkers >= concurrency) return

    const nextItem = items.find(i => i.status === BATCH_ITEM_STATUS.QUEUED)
    if (!nextItem) return

    activeWorkers++
    nextItem.status = BATCH_ITEM_STATUS.PROCESSING
    nextItem.progress = 10
    notify()

    const controller = new AbortController()
    activeControllers.set(nextItem.id, controller)

    try {
      const result = await processItem(nextItem.file, {
        signal: controller.signal,
        onProgress: (pct) => {
          nextItem.progress = Math.max(10, Math.min(95, Math.round(pct)))
          notify()
        }
      })

      if (controller.signal.aborted || isCancelled) {
        nextItem.status = BATCH_ITEM_STATUS.CANCELLED
      } else {
        nextItem.status = BATCH_ITEM_STATUS.DONE
        nextItem.progress = 100
        nextItem.result = result // Expected { blob, filename, mimeType }
      }
    } catch (err) {
      if (controller.signal.aborted || isCancelled) {
        nextItem.status = BATCH_ITEM_STATUS.CANCELLED
      } else {
        nextItem.status = BATCH_ITEM_STATUS.FAILED
        nextItem.error = err.message || 'Processing failed'
      }
    } finally {
      activeControllers.delete(nextItem.id)
      activeWorkers--
      notify()
      // Continue queue
      setTimeout(processNext, 20)
    }
  }

  const session = {
    sessionId,

    /**
     * Adds files to the batch session
     */
    addFiles(fileList) {
      const newItems = Array.from(fileList || []).map(file => ({
        id: `bitem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        status: BATCH_ITEM_STATUS.QUEUED,
        progress: 0,
        result: null,
        error: null
      }))
      items = [...items, ...newItems]
      notify()
      for (let i = 0; i < concurrency; i++) {
        processNext()
      }
    },

    /**
     * Cancels all items in progress or queued
     */
    cancelAll() {
      isCancelled = true
      for (const ctrl of activeControllers.values()) {
        try { ctrl.abort() } catch {}
      }
      activeControllers.clear()
      for (const item of items) {
        if (item.status === BATCH_ITEM_STATUS.QUEUED || item.status === BATCH_ITEM_STATUS.PROCESSING) {
          item.status = BATCH_ITEM_STATUS.CANCELLED
        }
      }
      activeWorkers = 0
      notify()
    },

    /**
     * Retries failed items
     */
    retryFailed() {
      isCancelled = false
      for (const item of items) {
        if (item.status === BATCH_ITEM_STATUS.FAILED || item.status === BATCH_ITEM_STATUS.CANCELLED) {
          item.status = BATCH_ITEM_STATUS.QUEUED
          item.progress = 0
          item.error = null
        }
      }
      notify()
      for (let i = 0; i < concurrency; i++) {
        processNext()
      }
    },

    /**
     * Removes an individual item
     */
    removeItem(id) {
      const ctrl = activeControllers.get(id)
      if (ctrl) {
        try { ctrl.abort() } catch {}
        activeControllers.delete(id)
      }
      items = items.filter(i => i.id !== id)
      notify()
    },

    /**
     * Clears all completed items to release memory
     */
    clearCompleted() {
      items = items.filter(i => i.status !== BATCH_ITEM_STATUS.DONE)
      notify()
    },

    /**
     * Packages all completed outputs into a ZIP archive and triggers download
     */
    async exportZip(customName) {
      const doneItems = items.filter(i => i.status === BATCH_ITEM_STATUS.DONE && i.result?.blob)
      if (!doneItems.length) return false

      const zip = new JSZip()
      const usedNames = new Set()

      for (const item of doneItems) {
        let name = (item.result?.filename || item.name || 'file')
          .replace(/[/\\]/g, '_')
          .replace(/[\x00-\x1f\x7f]/g, '')
          .trim() || 'file'
        let base = name
        let ext = ''
        const dot = name.lastIndexOf('.')
        if (dot > 0) {
          base = name.slice(0, dot)
          ext = name.slice(dot)
        }

        let counter = 1
        while (usedNames.has(name)) {
          name = `${base}_(${counter})${ext}`
          counter++
        }
        usedNames.add(name)

        zip.file(name, item.result.blob)
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const finalName = customName || zipFilename || 'tooldesk-batch-export.zip'
      const output = createOutput(zipBlob, {
        filename: finalName,
        mimeType: 'application/zip',
        tool: tool || 'batch',
        action: 'export-zip',
        metadata: { count: doneItems.length }
      })
      return await output.download()
    },

    /**
     * Returns current items
     */
    getItems() {
      return items
    }
  }

  return session
}
