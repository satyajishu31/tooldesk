function colorDist(r1, g1, b1, r2, g2, b2) {
  const rmean = (r1 + r2) / 2
  const r = r1 - r2
  const g = g1 - g2
  const b = b1 - b2
  return Math.sqrt((((512 + rmean) * r * r) >> 8) + 4 * g * g + (((767 - rmean) * b * b) >> 8))
}

function buildMask(px, w, h, bgColors, threshold) {
  const total = w * h
  const mask = new Uint8Array(total)

  for (let i = 0; i < total; i++) {
    const idx = i * 4
    const r = px[idx]
    const g = px[idx + 1]
    const b = px[idx + 2]
    let minDist = Infinity
    for (const [br, bg2, bb] of bgColors) {
      const d = colorDist(r, g, b, br, bg2, bb)
      if (d < minDist) minDist = d
    }
    mask[i] = minDist < threshold ? 1 : 0
  }

  const visited = new Uint8Array(total)
  const queue = new Int32Array(total)
  let head = 0
  let tail = 0
  const enqueue = idx => {
    if (!visited[idx]) {
      queue[tail++] = idx
      visited[idx] = 1
    }
  }

  for (let x = 0; x < w; x++) {
    enqueue(x)
    enqueue((h - 1) * w + x)
  }
  for (let y = 1; y < h - 1; y++) {
    enqueue(y * w)
    enqueue(y * w + w - 1)
  }

  while (head < tail) {
    const idx = queue[head++]
    if (mask[idx] === 1) {
      mask[idx] = 2
      const x = idx % w
      const y = Math.floor(idx / w)
      if (x > 0) enqueue(idx - 1)
      if (x < w - 1) enqueue(idx + 1)
      if (y > 0) enqueue(idx - w)
      if (y < h - 1) enqueue(idx + w)
    }
  }

  for (let pass = 0; pass < 2; pass++) {
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x
        if (mask[i] === 0) {
          const nbg = [
            i - 1, i + 1, i - w, i + w,
            i - w - 1, i - w + 1, i + w - 1, i + w + 1
          ].filter(n => n >= 0 && n < total && mask[n] === 2).length
          if (nbg >= 6) mask[i] = 2
        }
      }
    }
  }

  return mask
}

function applyAlpha(px, mask, w, h, feather, spillSupp) {
  const out = new Uint8ClampedArray(px)
  const total = w * h

  if (feather === 0) {
    for (let i = 0; i < total; i++) {
      if (mask[i] === 2) out[i * 4 + 3] = 0
    }
    return out
  }

  const fRadius = Math.max(1, Math.min(32, Math.round(feather)))
  const dist = new Float32Array(total).fill(Infinity)
  const queue = new Int32Array(total)
  let qHead = 0, qTail = 0

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x
      if (mask[idx] === 2) {
        out[idx * 4 + 3] = 0
        dist[idx] = 0
        const hasFgNeighbor = (x > 0 && mask[idx - 1] !== 2) ||
                              (x < w - 1 && mask[idx + 1] !== 2) ||
                              (y > 0 && mask[idx - w] !== 2) ||
                              (y < h - 1 && mask[idx + w] !== 2)
        if (hasFgNeighbor) {
          if (qTail < queue.length) queue[qTail++] = idx
        }
      }
    }
  }

  const qLimit = fRadius + 1
  while (qHead < qTail) {
    const curr = queue[qHead++]
    const cx = curr % w
    const cy = Math.floor(curr / w)
    const curDist = dist[curr]
    if (curDist >= qLimit) continue

    const neighbors = [
      cx > 0 ? curr - 1 : -1,
      cx < w - 1 ? curr + 1 : -1,
      cy > 0 ? curr - w : -1,
      cy < h - 1 ? curr + w : -1
    ]

    for (let k = 0; k < 4; k++) {
      const nIdx = neighbors[k]
      if (nIdx >= 0 && mask[nIdx] !== 2) {
        const nextDist = curDist + 1
        if (nextDist < dist[nIdx] && nextDist <= qLimit) {
          dist[nIdx] = nextDist
          if (qTail < queue.length) queue[qTail++] = nIdx
        }
      }
    }
  }

  for (let i = 0; i < total; i++) {
    if (mask[i] === 2) continue
    const d = dist[i]
    if (d <= fRadius) {
      const t = d / fRadius
      const smooth = t * t * (3 - 2 * t)
      const idx = i * 4
      out[idx + 3] = Math.round(smooth * 255)

      if (spillSupp && smooth < 0.8) {
        const gray = out[idx] * 0.299 + out[idx + 1] * 0.587 + out[idx + 2] * 0.114
        const blend = Math.min(1, smooth * 1.5)
        out[idx]     = Math.round(out[idx] * blend + gray * (1 - blend))
        out[idx + 1] = Math.round(out[idx + 1] * blend + gray * (1 - blend))
        out[idx + 2] = Math.round(out[idx + 2] * blend + gray * (1 - blend))
      }
    }
  }

  return out
}

self.onmessage = (e) => {
  if (!e.data || typeof e.data !== 'object') return
  const { id, px, w, h, bgColors, threshold, feather, spillSupp } = e.data

  try {
    const width = Math.min(4096, Math.max(1, parseInt(w, 10) || 0))
    const height = Math.min(4096, Math.max(1, parseInt(h, 10) || 0))
    const total = width * height

    // V-24: Pixel budget cap — protect mobile Safari / low-memory devices from OOM crashes
    const MAX_PIXELS = 4 * 1024 * 1024 // 4 million pixels (~2048x2048)
    if (total > MAX_PIXELS) {
      throw new Error(`Image is too large for client-side processing (${width}x${height} = ${(total / 1e6).toFixed(1)}MP). Maximum is 4.2MP (~2048x2048).`)
    }

    if (!px || px.length !== total * 4) {
      throw new Error('Invalid pixel buffer dimensions')
    }

    const safeThreshold = Math.min(255, Math.max(1, Number(threshold) || 30))
    const safeFeather = Math.min(16, Math.max(0, parseInt(feather, 10) || 0))
    const safeBg = Array.isArray(bgColors) ? bgColors.slice(0, 10) : [[255, 255, 255]]

    const mask = buildMask(px, width, height, safeBg, safeThreshold)
    const out = applyAlpha(px, mask, width, height, safeFeather, Boolean(spillSupp))
    self.postMessage({ id, success: true, out }, [out.buffer])
  } catch (err) {
    self.postMessage({ id, success: false, error: err?.message || 'Processing error' })
  }
}
