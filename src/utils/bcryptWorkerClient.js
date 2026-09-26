let worker = null
const activeRequests = new Map()

export function terminateWorker() {
  if (worker) {
    try { worker.terminate() } catch {}
    worker = null
  }
  for (const [id, req] of activeRequests) {
    clearTimeout(req.timer)
    if (req.signal && req.abortHandler) {
      req.signal.removeEventListener('abort', req.abortHandler)
    }
    req.reject(new Error('Worker terminated'))
  }
  activeRequests.clear()
}

function getWorker() {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') return null
  if (!worker) {
    try {
      worker = new Worker(new URL('../workers/bcrypt.worker.js', import.meta.url), { type: 'module' })
      worker.onmessage = (e) => {
        if (!e.data || !e.data.id) return
        const req = activeRequests.get(e.data.id)
        if (!req) return

        if (e.data.type === 'PROGRESS') {
          req.onProgress?.(e.data.progress, e.data.partial)
          return
        }

        clearTimeout(req.timer)
        if (req.signal && req.abortHandler) {
          req.signal.removeEventListener('abort', req.abortHandler)
        }
        activeRequests.delete(e.data.id)

        if (e.data.success) {
          req.resolve(req.type === 'HASH_SINGLE' ? e.data.result.hash : req.type === 'COMPARE' ? e.data.result.match : e.data.result.results)
        } else {
          req.reject(new Error(e.data.error || 'Worker error'))
        }
      }
      worker.onerror = () => {
        terminateWorker()
      }
    } catch {
      worker = null
    }
  }
  return worker
}

function executeWorkerJob(type, payload, onProgress, signal, timeoutMs = 30000) {
  const w = getWorker()
  if (!w) return null

  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).slice(2)

    const abortHandler = () => {
      const req = activeRequests.get(id)
      if (req) {
        clearTimeout(req.timer)
        activeRequests.delete(id)
      }
      try {
        w.postMessage({ id, type: 'CANCEL' })
      } catch {}
      reject(new DOMException('Aborted by user', 'AbortError'))
    }

    if (signal) {
      if (signal.aborted) return abortHandler()
      signal.addEventListener('abort', abortHandler, { once: true })
    }

    const timer = setTimeout(() => {
      const req = activeRequests.get(id)
      if (req) {
        if (req.signal && req.abortHandler) {
          req.signal.removeEventListener('abort', req.abortHandler)
        }
        activeRequests.delete(id)
      }
      try { w.postMessage({ id, type: 'CANCEL' }) } catch {}
      reject(new Error('Worker job timeout'))
    }, timeoutMs)

    activeRequests.set(id, {
      type,
      resolve,
      reject,
      onProgress,
      timer,
      signal,
      abortHandler,
    })

    w.postMessage({ id, type, payload })
  })
}

export async function hashSingleWorker(text, rounds, signal) {
  return executeWorkerJob('HASH_SINGLE', { text, rounds }, null, signal, 25000)
}

export async function compareWorker(text, hash, signal) {
  return executeWorkerJob('COMPARE', { text, hash }, null, signal, 25000)
}

export function hashBatchWorker(lines, rounds, onProgress, signal) {
  return executeWorkerJob('HASH_BATCH', { lines, rounds }, onProgress, signal, 60000)
}
