import bcrypt from 'bcryptjs'

// Browser WebCrypto fallback for bcryptjs so it never attempts to load Node crypto in web workers
if (typeof bcrypt.setRandomFallback === 'function') {
  bcrypt.setRandomFallback((len) => {
    const buf = new Uint8Array(len)
    if (typeof self !== 'undefined' && self.crypto && typeof self.crypto.getRandomValues === 'function') {
      self.crypto.getRandomValues(buf)
    } else if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      crypto.getRandomValues(buf)
    } else if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
      globalThis.crypto.getRandomValues(buf)
    } else {
      throw new Error('A cryptographically secure random number generator (crypto.getRandomValues) is required for salt generation but is unavailable.')
    }
    return Array.from(buf)
  })
}

const cancelledJobs = new Set()
const MAX_CANCELLED_JOBS = 1000

function recordCancellation(id) {
  if (cancelledJobs.size >= MAX_CANCELLED_JOBS) {
    const first = cancelledJobs.values().next().value
    if (first !== undefined) cancelledJobs.delete(first)
  }
  cancelledJobs.add(id)
}

function clampRounds(r) {
  const n = parseInt(r, 10)
  if (isNaN(n)) return 10
  return Math.min(14, Math.max(4, n))
}

self.onmessage = async (e) => {
  if (!e.data || typeof e.data !== 'object') return
  const { id, type, payload } = e.data
  if (!id) return

  if (type === 'CANCEL') {
    recordCancellation(id)
    return
  }

  try {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Payload must be an object')
    }

    if (type === 'HASH_SINGLE') {
      if (cancelledJobs.has(id)) { cancelledJobs.delete(id); return }
      const text = typeof payload.text === 'string' ? payload.text : String(payload.text || '')
      const rounds = clampRounds(payload.rounds)
      const salt = await bcrypt.genSalt(rounds)
      if (cancelledJobs.has(id)) { cancelledJobs.delete(id); return }
      const hash = await bcrypt.hash(text, salt)
      if (cancelledJobs.has(id)) { cancelledJobs.delete(id); return }
      self.postMessage({ id, success: true, result: { hash, salt } })
    } else if (type === 'COMPARE') {
      if (cancelledJobs.has(id)) { cancelledJobs.delete(id); return }
      const text = typeof payload.text === 'string' ? payload.text : ''
      const hash = typeof payload.hash === 'string' ? payload.hash : ''
      if (!hash || !hash.startsWith('$2')) {
        throw new Error('Invalid bcrypt hash format')
      }
      const match = await bcrypt.compare(text, hash)
      if (cancelledJobs.has(id)) { cancelledJobs.delete(id); return }
      self.postMessage({ id, success: true, result: { match } })
    } else if (type === 'HASH_BATCH') {
      const lines = Array.isArray(payload.lines) ? payload.lines.slice(0, 50) : []
      const rounds = clampRounds(payload.rounds)
      const results = []
      for (let i = 0; i < lines.length; i++) {
        if (cancelledJobs.has(id)) {
          cancelledJobs.delete(id)
          return
        }
        const line = typeof lines[i] === 'string' ? lines[i] : String(lines[i] || '')
        const salt = await bcrypt.genSalt(rounds)
        const hash = await bcrypt.hash(line, salt)
        results.push({ plain: line, hash })
        self.postMessage({
          id,
          type: 'PROGRESS',
          progress: Math.round(((i + 1) / lines.length) * 100),
          partial: results
        })
      }
      if (cancelledJobs.has(id)) { cancelledJobs.delete(id); return }
      self.postMessage({ id, success: true, result: { results } })
    } else {
      throw new Error(`Unsupported action type: ${type}`)
    }
  } catch (err) {
    self.postMessage({ id, success: false, error: err?.message || 'Worker processing error' })
  }
}
