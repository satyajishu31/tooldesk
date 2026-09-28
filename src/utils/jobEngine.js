/**
 * ToolDesk Universal Job Engine
 * 
 * Asynchronous job management and queueing infrastructure for heavy operations:
 * - OCR text extraction
 * - PDF document generation, compression, and merging
 * - High-resolution image compression and conversion
 * - Video frame extraction and audio transcription
 * - Multi-file ZIP archive creation
 * - Batch processing pipelines
 * 
 * Guarantees:
 * - Deterministic states: idle -> queued -> running -> progress -> completed | failed | cancelled | retrying
 * - Concurrency control with memory safety on mobile
 * - Automatic timeout, cancellation via AbortController, and resource cleanup
 * - Normalized error categorizations (NETWORK, FILE_FORMAT, TIMEOUT, MEMORY, CANCELLED, etc.)
 */

export const JOB_STATES = {
  IDLE: 'idle',
  QUEUED: 'queued',
  RUNNING: 'running',
  PROGRESS: 'progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  RETRYING: 'retrying',
}

export const ERROR_CATEGORIES = {
  USER_INPUT: 'USER_INPUT',
  FILE_FORMAT: 'FILE_FORMAT',
  FILE_SIZE: 'FILE_SIZE',
  NETWORK: 'NETWORK',
  TIMEOUT: 'TIMEOUT',
  UPSTREAM: 'UPSTREAM',
  PERMISSION: 'PERMISSION',
  STORAGE: 'STORAGE',
  PROCESSING: 'PROCESSING',
  MEMORY: 'MEMORY',
  CANCELLED: 'CANCELLED',
  UNKNOWN: 'UNKNOWN',
}

export const JOB_STATUS = JOB_STATES
export const JOB_ERROR_CATEGORIES = ERROR_CATEGORIES

// Active jobs registry and queue
const _jobs = new Map()
const _queue = []
let _runningCount = 0
const MAX_CONCURRENT_JOBS = typeof navigator !== 'undefined' && /Mobile|Android|iPhone/i.test(navigator.userAgent) ? 2 : 4

/**
 * Normalizes any error into a categorized structure
 */
export function normalizeJobError(err) {
  if (!err) return { category: ERROR_CATEGORIES.UNKNOWN, message: 'An unknown error occurred.' }
  if (err.name === 'AbortError' || err.message?.includes('aborted') || err.message?.includes('cancel')) {
    return { category: ERROR_CATEGORIES.CANCELLED, message: 'Operation was cancelled.' }
  }
  const str = String(err.message || err).toLowerCase()
  if (str.includes('timeout') || str.includes('timed out')) {
    return { category: ERROR_CATEGORIES.TIMEOUT, message: 'Operation timed out. Please try again.' }
  }
  if (str.includes('quota') || str.includes('storage')) {
    return { category: ERROR_CATEGORIES.STORAGE, message: 'Storage quota exceeded. Free up space.' }
  }
  if (str.includes('memory') || str.includes('heap') || str.includes('oom')) {
    return { category: ERROR_CATEGORIES.MEMORY, message: 'Out of memory during processing. Reduce file size.' }
  }
  if (str.includes('format') || str.includes('corrupt') || str.includes('invalid file')) {
    return { category: ERROR_CATEGORIES.FILE_FORMAT, message: 'File format is unsupported or corrupted.' }
  }
  if (str.includes('network') || str.includes('fetch') || str.includes('offline')) {
    return { category: ERROR_CATEGORIES.NETWORK, message: 'Network connection issue.' }
  }
  if (str.includes('permission') || str.includes('denied')) {
    return { category: ERROR_CATEGORIES.PERMISSION, message: 'Required permission was denied.' }
  }
  return { category: ERROR_CATEGORIES.PROCESSING, message: err.message || 'Processing failed.' }
}

/**
 * Creates and registers a new job
 */
export function createJob({
  tool,
  operation,
  input,
  execute,
  timeoutMs = 120000,
  maxRetries = 0,
  metadata = {}
}) {
  if (!execute || typeof execute !== 'function') {
    throw new Error('createJob requires an execute function')
  }

  const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  const abortController = new AbortController()
  const resourceCleanups = []

  const job = {
    id,
    tool: String(tool || 'tool'),
    operation: String(operation || 'process'),
    input,
    execute,
    state: JOB_STATES.IDLE,
    progress: 0,
    statusText: '',
    error: null,
    result: null,
    metadata,
    createdAt: Date.now(),
    startedAt: null,
    completedAt: null,
    timeoutMs,
    maxRetries,
    retryCount: 0,
    abortController,
    timeoutTimer: null,
    _listeners: new Map(),

    get status() {
      return this.state
    },

    on(event, fn) {
      if (!this._listeners.has(event)) this._listeners.set(event, new Set())
      this._listeners.get(event).add(fn)
      return () => this._listeners.get(event)?.delete(fn)
    },

    emit(event, ...args) {
      const set = this._listeners.get(event)
      if (set) {
        for (const fn of set) {
          try { fn(...args) } catch {}
        }
      }
    },

    start() {
      return new Promise((resolve, reject) => {
        this.on('completed', res => resolve(res))
        this.on('failed', err => reject(err))
        this.on('cancelled', () => {
          const err = new Error('Job cancelled')
          err.category = ERROR_CATEGORIES.CANCELLED
          reject(err)
        })
        enqueueJob(this)
      })
    },

    // Register resources to be automatically cleaned up on completion/cancellation
    registerCleanup(fn) {
      if (typeof fn === 'function') resourceCleanups.push(fn)
    },

    // Update job progress
    updateProgress(percent, text = '') {
      this.progress = Math.max(0, Math.min(100, Math.round(percent)))
      if (text) this.statusText = text
      this.state = JOB_STATES.PROGRESS
      this.emit('progress', this.progress, this.statusText)
      emitJobUpdate(this)
    },

    // Cancel job
    cancel(reason = 'Operation cancelled by user.') {
      if (this.state === JOB_STATES.COMPLETED || this.state === JOB_STATES.FAILED || this.state === JOB_STATES.CANCELLED) {
        return
      }
      this.state = JOB_STATES.CANCELLED
      this.error = { category: ERROR_CATEGORIES.CANCELLED, message: reason }
      this.completedAt = Date.now()
      this.abortController.abort()
      this.cleanup()
      this.emit('stateChange', this.state)
      this.emit('cancelled')
      emitJobUpdate(this)
      processQueue()
    },

    // Clean all registered resources
    cleanup() {
      if (this.timeoutTimer) {
        clearTimeout(this.timeoutTimer)
        this.timeoutTimer = null
      }
      while (resourceCleanups.length > 0) {
        try {
          const cleanFn = resourceCleanups.pop()
          cleanFn()
        } catch (e) {
          console.warn('[JobEngine] Cleanup callback failed:', e)
        }
      }
    }
  }

  _jobs.set(id, job)
  return job
}

/**
 * Submits a job to the execution queue
 */
export function enqueueJob(job) {
  if (!job || !job.id) return
  job.state = JOB_STATES.QUEUED
  job.emit('stateChange', job.state)
  emitJobUpdate(job)
  _queue.push(job)
  processQueue()
}

/**
 * Executes the next queued job within concurrency bounds
 */
function processQueue() {
  while (_runningCount < MAX_CONCURRENT_JOBS && _queue.length > 0) {
    const job = _queue.shift()
    if (job.state === JOB_STATES.CANCELLED) continue
    runJob(job)
  }
}

/**
 * Runs an individual job
 */
async function runJob(job) {
  _runningCount++
  job.state = JOB_STATES.RUNNING
  job.startedAt = Date.now()
  job.emit('stateChange', job.state)
  emitJobUpdate(job)

  // Setup execution timeout
  job.timeoutTimer = setTimeout(() => {
    if (job.state === JOB_STATES.RUNNING || job.state === JOB_STATES.PROGRESS) {
      job.abortController.abort()
      job.state = JOB_STATES.FAILED
      job.error = { category: ERROR_CATEGORIES.TIMEOUT, message: `Operation timed out after ${Math.round(job.timeoutMs / 1000)}s.` }
      job.completedAt = Date.now()
      job.cleanup()
      job.emit('stateChange', job.state)
      job.emit('failed', job.error)
      emitJobUpdate(job)
      _runningCount = Math.max(0, _runningCount - 1)
      processQueue()
    }
  }, job.timeoutMs)

  try {
    const onProgress = (pct, txt) => job.updateProgress(pct, txt)
    const signal = job.abortController.signal
    signal.signal = signal
    signal.onProgress = onProgress
    signal.registerCleanup = (fn) => job.registerCleanup(fn)

    let result
    if (typeof job.execute === 'function') {
      result = await job.execute(signal, onProgress, job)
    }

    if (job.abortController.signal.aborted || job.state === JOB_STATES.CANCELLED) {
      return
    }

    job.state = JOB_STATES.COMPLETED
    job.progress = 100
    job.result = result
    job.completedAt = Date.now()
    job.cleanup()
    job.emit('stateChange', job.state)
    job.emit('completed', result)
    emitJobUpdate(job)
  } catch (err) {
    if (job.abortController.signal.aborted || job.state === JOB_STATES.CANCELLED) {
      return
    }

    // Handle retry logic if allowed
    if (job.retryCount < job.maxRetries) {
      job.retryCount++
      job.state = JOB_STATES.RETRYING
      job.emit('stateChange', job.state)
      emitJobUpdate(job)
      setTimeout(() => {
        enqueueJob(job)
      }, 1000)
      return
    }

    job.state = JOB_STATES.FAILED
    job.error = normalizeJobError(err)
    job.completedAt = Date.now()
    job.cleanup()
    job.emit('stateChange', job.state)
    job.emit('failed', job.error)
    emitJobUpdate(job)
  } finally {
    _runningCount = Math.max(0, _runningCount - 1)
    processQueue()
  }
}

/**
 * Dispatches custom events for UI updates
 */
function emitJobUpdate(job) {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new CustomEvent('tooldesk-job-updated', {
      detail: {
        id: job.id,
        tool: job.tool,
        operation: job.operation,
        state: job.state,
        progress: job.progress,
        statusText: job.statusText,
        error: job.error,
        completedAt: job.completedAt
      }
    }))
  } catch {}
}

/**
 * Returns a job by ID
 */
export function getJob(id) {
  return _jobs.get(id) || null
}

/**
 * Cancels a job by ID
 */
export function cancelJob(id) {
  const job = _jobs.get(id)
  if (job) job.cancel()
}

/**
 * Convenience helper to run a job and await its output
 */
export async function runJobSync(spec) {
  const job = createJob(spec)
  enqueueJob(job)
  return new Promise((resolve, reject) => {
    const handler = (e) => {
      if (e.detail?.id === job.id) {
        if (e.detail.state === JOB_STATES.COMPLETED) {
          window.removeEventListener('tooldesk-job-updated', handler)
          resolve(job.result)
        } else if (e.detail.state === JOB_STATES.FAILED || e.detail.state === JOB_STATES.CANCELLED) {
          window.removeEventListener('tooldesk-job-updated', handler)
          reject(new Error(job.error?.message || 'Job execution failed'))
        }
      }
    }
    window.addEventListener('tooldesk-job-updated', handler)
  })
}
