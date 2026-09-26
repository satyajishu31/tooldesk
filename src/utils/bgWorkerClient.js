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
    req.reject(new Error('Background remover worker terminated'))
  }
  activeRequests.clear()
}

function getWorker() {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') return null
  if (!worker) {
    try {
      worker = new Worker(new URL('../workers/bgremover.worker.js', import.meta.url), { type: 'module' })
      worker.onmessage = (e) => {
        if (!e.data || !e.data.id) return
        const req = activeRequests.get(e.data.id)
        if (!req) return

        clearTimeout(req.timer)
        if (req.signal && req.abortHandler) {
          req.signal.removeEventListener('abort', req.abortHandler)
        }
        activeRequests.delete(e.data.id)

        if (e.data.success) {
          req.resolve(e.data.out)
        } else {
          req.reject(new Error(e.data.error || 'Processing error'))
        }
      }
      worker.onerror = () => terminateWorker()
    } catch {
      worker = null
    }
  }
  return worker
}

export function processBackgroundInWorker(px, w, h, bgColors, threshold, feather, spillSupp, signal) {
  const wkr = getWorker()
  if (!wkr) return null
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).slice(2)

    const abortHandler = () => {
      const req = activeRequests.get(id)
      if (req) {
        clearTimeout(req.timer)
        activeRequests.delete(id)
      }
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
      reject(new Error('Background remover worker timeout'))
    }, 30000)

    activeRequests.set(id, { resolve, reject, timer, signal, abortHandler })

    try {
      const copy = new Uint8ClampedArray(px)
      wkr.postMessage({ id, px: copy, w, h, bgColors, threshold, feather, spillSupp }, [copy.buffer])
    } catch (postErr) {
      clearTimeout(timer)
      activeRequests.delete(id)
      if (signal && abortHandler) {
        signal.removeEventListener('abort', abortHandler)
      }
      reject(postErr)
    }
  })
}
