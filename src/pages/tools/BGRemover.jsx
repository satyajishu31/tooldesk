import React, { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ToolShell, { ToolCard } from '../../components/ToolShell'
import { TOOLS } from '../../constants'
import { safeFetchJSON, safeTimeoutSignal } from '../../utils/safeFetch'
import { processBackgroundInWorker } from '../../utils/bgWorkerClient'
import { saveFileWithFallback } from '../../utils/fileSaver'
import { resolveApiUrl } from '../../utils/apiConfig'

const tool = TOOLS.find(t => t.id === 'bgremove')

/* ══════════════════════════════════════════════════════════════
   INDUSTRIAL BG REMOVAL ENGINE v2
   Multi-pass: Edge sample → Color model → Flood fill →
               GrabCut-style iterative refine → Feather + spill
   ══════════════════════════════════════════════════════════════ */

function colorDist(r1,g1,b1,r2,g2,b2) {
  // Perceptual weighted Euclidean
  const rmean = (r1+r2)/2
  const dr=r1-r2, dg=g1-g2, db=b1-b2
  return Math.sqrt((2+rmean/256)*dr*dr + 4*dg*dg + (2+(255-rmean)/256)*db*db)
}

function parseHexColor(colorStr, defaultRgb = [255, 255, 255]) {
  if (!colorStr || typeof colorStr !== 'string') return defaultRgb
  let hex = colorStr.replace('#', '').trim()
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('')
  }
  if (hex.length >= 6) {
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
      return [r, g, b]
    }
  }
  return defaultRgb
}

// Sample multiple border bands from CPU memory without GPU-to-CPU pipeline stalls
function sampleBackground(ctx, w, h, existingPixels) {
  const band = Math.max(2, Math.floor(Math.min(w,h)*0.04))
  const samples = []
  const step = Math.max(1, Math.floor(Math.min(w,h)/80))
  const px = existingPixels || ctx.getImageData(0, 0, w, h).data

  for (let x=0; x<w; x+=step) {
    for (let b=0; b<band; b++) {
      const i1 = (b * w + x) * 4
      samples.push([px[i1], px[i1+1], px[i1+2]])
      const i2 = ((h - 1 - b) * w + x) * 4
      samples.push([px[i2], px[i2+1], px[i2+2]])
    }
  }
  for (let y=band; y<h-band; y+=step) {
    for (let b=0; b<band; b++) {
      const i1 = (y * w + b) * 4
      samples.push([px[i1], px[i1+1], px[i1+2]])
      const i2 = (y * w + (w - 1 - b)) * 4
      samples.push([px[i2], px[i2+1], px[i2+2]])
    }
  }
  // Cluster analysis — find dominant color group
  const clusters = []
  for (const s of samples) {
    let found = false
    for (const c of clusters) {
      if (colorDist(s[0],s[1],s[2],c.r,c.g,c.b) < 30) {
        c.r=(c.r*c.n+s[0])/(c.n+1); c.g=(c.g*c.n+s[1])/(c.n+1); c.b=(c.b*c.n+s[2])/(c.n+1); c.n++
        found=true; break
      }
    }
    if (!found) clusters.push({r:s[0],g:s[1],b:s[2],n:1})
  }
  clusters.sort((a,b)=>b.n-a.n)
  // Return top 3 color clusters (handles gradients / multi-color BGs)
  return clusters.slice(0,3).map(c=>([Math.round(c.r),Math.round(c.g),Math.round(c.b)]))
}

function buildMask(px, w, h, bgColors, threshold) {
  const total = w*h
  const mask = new Uint8Array(total)  // 0=fg, 1=maybe bg, 2=bg (removed)

  // 1. Color match pass — mark candidates
  for (let i=0; i<total; i++) {
    const idx=i*4, r=px[idx], g=px[idx+1], b=px[idx+2]
    let minDist = Infinity
    for (const [br,bg2,bb] of bgColors) {
      const d = colorDist(r,g,b,br,bg2,bb)
      if (d<minDist) minDist=d
    }
    mask[i] = minDist < threshold ? 1 : 0
  }

  // 2. Flood fill from ALL 4 edges
  const visited = new Uint8Array(total)
  const queue   = new Int32Array(total)
  let head=0, tail=0
  const enqueue = idx => { if (!visited[idx]) { queue[tail++]=idx; visited[idx]=1 } }

  for (let x=0; x<w; x++)   { enqueue(x); enqueue((h-1)*w+x) }
  for (let y=1; y<h-1; y++) { enqueue(y*w); enqueue(y*w+w-1) }

  while (head < tail) {
    const idx = queue[head++]
    if (mask[idx]===1) {
      mask[idx]=2
      const x=idx%w, y=Math.floor(idx/w)
      if (x>0)   enqueue(idx-1)
      if (x<w-1) enqueue(idx+1)
      if (y>0)   enqueue(idx-w)
      if (y<h-1) enqueue(idx+w)
    }
  }

  // 3. Iterative interior refinement (2 passes)
  for (let pass=0; pass<2; pass++) {
    for (let y=1; y<h-1; y++) {
      for (let x=1; x<w-1; x++) {
        const i = y*w+x
        if (mask[i]===0) {
          // Count adjacent bg pixels — if surrounded mostly by bg, likely interior hole
          const nbg = [i-1,i+1,i-w,i+w,i-w-1,i-w+1,i+w-1,i+w+1].filter(n=>n>=0&&n<total&&mask[n]===2).length
          if (nbg >= 6) mask[i]=2
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

// Process in chunks to avoid blocking UI
async function processInChunks(fn, total, chunkSize, onProgress) {
  for (let i=0; i<total; i+=chunkSize) {
    fn(i, Math.min(i+chunkSize, total))
    if (i%chunkSize===0) {
      await new Promise(r=>setTimeout(r,0))
      onProgress && onProgress(Math.min(1, (i+chunkSize)/total))
    }
  }
}

/* ─────────────────────────────────────────────────────────────
   MANUAL TOUCH-UP CANVAS EDITOR
   Runs 100% locally. Erase (destination-out) / Restore (clip)
   ───────────────────────────────────────────────────────────── */
function TouchUpCanvas({ resultUrl, originalImg, brushMode, brushSize, onSave, onCancel }) {
  const canvasRef = useRef(null)
  const isDrawing = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })
  const [history, setHistory] = useState([])
  const [redoList, setRedoList] = useState([])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      canvas.width = img.naturalWidth || img.width
      canvas.height = img.naturalHeight || img.height
      ctx.drawImage(img, 0, 0)
      const initialData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      setHistory([initialData])
    }
    img.src = resultUrl
  }, [resultUrl])

  const getCoordinates = (e) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    }
  }

  const startDrawing = (e) => {
    isDrawing.current = true
    const pos = getCoordinates(e)
    lastPos.current = pos
    draw(e)
  }

  const draw = (e) => {
    if (!isDrawing.current) return
    if (e.cancelable) e.preventDefault()
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const currentPos = getCoordinates(e)
    
    ctx.save()
    if (brushMode === 'erase') {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.beginPath()
      ctx.moveTo(lastPos.current.x, lastPos.current.y)
      ctx.lineTo(currentPos.x, currentPos.y)
      ctx.lineWidth = brushSize
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.stroke()
    } else {
      const lastX = lastPos.current.x
      const lastY = lastPos.current.y
      const currentX = currentPos.x
      const currentY = currentPos.y
      const dist = Math.hypot(currentX - lastX, currentY - lastY)
      const steps = Math.ceil(dist / 2)
      
      ctx.beginPath()
      for (let i = 0; i <= steps; i++) {
        const t = steps === 0 ? 0 : i / steps
        const cx = lastX + (currentX - lastX) * t
        const cy = lastY + (currentY - lastY) * t
        ctx.moveTo(cx, cy)
        ctx.arc(cx, cy, brushSize / 2, 0, Math.PI * 2)
      }
      ctx.clip()
      ctx.drawImage(originalImg, 0, 0, canvas.width, canvas.height)
    }
    ctx.restore()
    lastPos.current = currentPos
  }

  const stopDrawing = () => {
    if (!isDrawing.current) return
    isDrawing.current = false
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const currentData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    setHistory(prev => [...prev.slice(-4), currentData])
    setRedoList([])
  }

  const undo = () => {
    if (history.length <= 1) return
    const newHistory = history.slice(0, -1)
    const activeState = newHistory[newHistory.length - 1]
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.putImageData(activeState, 0, 0)
    setRedoList(prev => [history[history.length - 1], ...prev])
    setHistory(newHistory)
  }

  const redo = () => {
    if (!redoList.length) return
    const activeState = redoList[0]
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.putImageData(activeState, 0, 0)
    setHistory(prev => [...prev, activeState])
    setRedoList(prev => prev.slice(1))
  }

  const save = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    onSave(canvas.toDataURL('image/png'))
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'#f8f9ff', padding:'8px 14px', borderRadius:12, border:'1px solid rgba(0,0,0,.06)' }}>
        <span style={{ fontSize:12.5, fontWeight:700, color:'#0d0d1a' }}>🖌️ Brush Editor</span>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          <button onClick={undo} disabled={history.length <= 1} className="btn btn-outline btn-sm" style={{ padding:'4px 10px', fontSize:11, height:'auto' }}>↩️ Undo</button>
          <button onClick={redo} disabled={!redoList.length} className="btn btn-outline btn-sm" style={{ padding:'4px 10px', fontSize:11, height:'auto' }}>↪️ Redo</button>
        </div>
      </div>
      
      <div style={{ 
        position:'relative', 
        borderRadius:16, 
        overflow:'hidden', 
        border:'1.5px solid rgba(0,0,0,.1)', 
        background:'repeating-conic-gradient(#d8d8dc 0% 25%,white 0% 50%) 0 0/16px 16px',
        maxHeight:400,
        display:'flex',
        alignItems:'center',
        justifyContent:'center'
      }}>
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          style={{ 
            maxWidth:'100%', 
            maxHeight:380, 
            display:'block', 
            objectFit:'contain',
            touchAction:'none',
            cursor:'crosshair'
          }}
        />
      </div>

      <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:6, flexWrap:'wrap' }}>
        <button onClick={onCancel} className="btn btn-outline btn-sm">✕ Discard</button>
        <button onClick={save} className="btn btn-blue btn-sm">💾 Apply Changes</button>
      </div>
    </div>
  )
}

const MODES = [
  { id:'ai',         label:'🤖 AI',         thr:0,  desc:'Professional AI removal — handles hair & complex edges perfectly', isAI:true },
  { id:'precise',    label:'🔬 Precise',    thr:35, desc:'Best for complex edges, hair, fur' },
  { id:'auto',       label:'⚙️ Auto',       thr:55, desc:'Best for most photos' },
  { id:'aggressive', label:'⚡ Aggressive', thr:85, desc:'Best for simple solid backgrounds' },
]

export default function BGRemover() {
  const [img,          setImg]         = useState(null)
  const [result,       setResult]      = useState(null)
  const [transparentResult, setTransparentResult] = useState(null)
  const [loading,      setLoading]     = useState(false)
  const [progress,     setProgress]    = useState(0)
  const [progressMsg,  setProgressMsg] = useState('')
  const [threshold,    setThr]         = useState(55)
  const [feather,      setFeather]     = useState(5)
  const [spillSupp,    setSpill]       = useState(true)
  const [mode,         setMode]        = useState('auto')   // 'auto'|'aggressive'|'precise'
  const [isDragging,   setDragging]    = useState(false)
  const [downloadName, setDlName]      = useState('background-removed')
  const [comparePos,   setCompPos]     = useState(50)
  const [compareMode,  setCompMode]    = useState(false)
  const [bgColor,      setBgColor]     = useState('#ffffff')
  const [replaceMode,  setReplaceMode] = useState('transparent') // 'transparent'|'color'
  const [imgSize,      setImgSize]     = useState(null)
  const [manualBgColors, setManualBgColors] = useState([])
  const [isSampling,   setIsSampling]  = useState(false)
  const [isTouchUp,    setIsTouchUp]   = useState(false)
  const [brushMode,    setBrushMode]   = useState('erase')
  const [brushSize,    setBrushSize]   = useState(20)

  // Batch states
  const [batchMode,       setBatchMode]       = useState(false)
  const [batchFiles,      setBatchFiles]      = useState([])
  const [batchProcessing, setBatchProcessing] = useState(false)
  const [batchProgress,   setBatchProgress]   = useState(0)
  const [zippingBatch,    setZippingBatch]    = useState(false)

  const canvasRef  = useRef(null)
  const compareRef = useRef(null)
  const compareActive = useRef(false)
  const fileNameRef = useRef('image')
  const batchFilesRef = useRef([])
  batchFilesRef.current = batchFiles

  // Clean up all object URLs created during batch mode on unmount
  useEffect(() => {
    return () => {
      batchFilesRef.current.forEach(item => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
        if (item.resultUrl && typeof item.resultUrl === 'string' && item.resultUrl.startsWith('blob:')) {
          URL.revokeObjectURL(item.resultUrl)
        }
      })
    }
  }, [])

  // Single source of truth: instantaneous synchronous configuration ref
  // Prevents stale closure/render scheduling bugs when user clicks option then process
  const activeConfigRef = useRef({
    mode: 'auto',
    threshold: 55,
    feather: 5,
    spillSupp: true,
    replaceMode: 'transparent',
    bgColor: '#ffffff',
    manualBgColors: []
  })

  // Job ID / versioning to prevent outdated async jobs from overwriting newer user results
  const activeJobIdRef = useRef(0)

  // Keep ref synchronized with state changes
  const handleModeChange = useCallback((newMode) => {
    activeConfigRef.current.mode = newMode
    setMode(newMode)
    setIsSampling(false)
  }, [])

  const handleThrChange = useCallback((val) => {
    activeConfigRef.current.threshold = val
    setThr(val)
  }, [])

  const handleFeatherChange = useCallback((val) => {
    activeConfigRef.current.feather = val
    setFeather(val)
  }, [])

  const handleSpillChange = useCallback((val) => {
    activeConfigRef.current.spillSupp = val
    setSpill(val)
  }, [])

  const handleReplaceModeChange = useCallback((val) => {
    activeConfigRef.current.replaceMode = val
    setReplaceMode(val)
  }, [])

  const handleBgColorChange = useCallback((val) => {
    activeConfigRef.current.bgColor = val
    setBgColor(val)
  }, [])

  const applyBackground = useCallback((sourceUrl, rMode, color) => {
    if (!sourceUrl) return
    if (rMode === 'transparent') {
      setResult(sourceUrl)
      return
    }
    const tempImg = new Image()
    tempImg.onload = () => {
      const oc = document.createElement('canvas')
      oc.width = tempImg.naturalWidth || tempImg.width
      oc.height = tempImg.naturalHeight || tempImg.height
      const octx = oc.getContext('2d')
      const [fr, fg, fb] = parseHexColor(color)
      octx.fillStyle = `rgb(${fr},${fg},${fb})`
      octx.fillRect(0, 0, oc.width, oc.height)
      octx.drawImage(tempImg, 0, 0)
      setResult(oc.toDataURL('image/png'))
    }
    tempImg.src = sourceUrl
  }, [])

  useEffect(() => {
    if (transparentResult) {
      applyBackground(transparentResult, replaceMode, bgColor)
    }
  }, [transparentResult, replaceMode, bgColor, applyBackground])

  const loadFile = useCallback(f => {
    if (!f||!f.type.startsWith('image/')) return
    setResult(null); setTransparentResult(null); setCompMode(false)
    setManualBgColors([])
    activeConfigRef.current.manualBgColors = []
    setIsSampling(false)
    setIsTouchUp(false)
    const base = f.name.replace(/\.[^/.]+$/,'')||'image'
    fileNameRef.current = base
    setDlName(base+'-no-bg')
    const reader = new FileReader()
    reader.onload = ev => {
      const im = new Image()
      im.onload = () => {
        setImg(im)
        setImgSize({ w:im.naturalWidth, h:im.naturalHeight })
      }
      im.src = ev.target.result
    }
    reader.readAsDataURL(f)
  }, [])

  const loadMultipleFiles = useCallback(filesList => {
    const list = Array.from(filesList).filter(f => f.type.startsWith('image/'))
    if (!list.length) return

    if (list.length === 1 && !batchMode && batchFiles.length === 0) {
      loadFile(list[0])
      return
    }

    setBatchMode(true)
    const newItems = list.map(f => ({
      id: Math.random().toString(36).slice(2, 9),
      rawFile: f,
      previewUrl: URL.createObjectURL(f),
      name: f.name,
      size: f.size,
      resultUrl: null,
      status: 'pending',
      errorMsg: ''
    }))
    setBatchFiles(prev => [...prev, ...newItems])
  }, [batchMode, batchFiles.length, loadFile])

  const clearBatch = useCallback(() => {
    setBatchFiles(prev => {
      prev.forEach(item => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
        if (item.resultUrl && typeof item.resultUrl === 'string' && item.resultUrl.startsWith('blob:')) {
          URL.revokeObjectURL(item.resultUrl)
        }
      })
      return []
    })
  }, [])

  const processBatchItem = useCallback((item) => {
    return new Promise((resolve) => {
      const activeConf = activeConfigRef.current
      const currentMode = activeConf.mode
      const modeConfig = MODES.find(m => m.id === currentMode) || MODES[2]
      const thr = currentMode === 'auto' ? activeConf.threshold : (modeConfig.thr || 55)
      const fthr = activeConf.feather
      const spill = activeConf.spillSupp
      const rMode = activeConf.replaceMode
      const bgCol = activeConf.bgColor

      const reader = new FileReader()
      reader.onload = ev => {
        const tempImg = new Image()
        tempImg.onload = async () => {
          try {
            const natW = tempImg.naturalWidth || tempImg.width
            const natH = tempImg.naturalHeight || tempImg.height
            const MAX_DIM = 2048
            let targetW = natW
            let targetH = natH
            if (targetW > MAX_DIM || targetH > MAX_DIM) {
              if (targetW > targetH) {
                targetW = MAX_DIM
                targetH = Math.round((natH * MAX_DIM) / natW)
              } else {
                targetH = MAX_DIM
                targetW = Math.round((natW * MAX_DIM) / natH)
              }
            }

            const canvas = document.createElement('canvas')
            canvas.width = targetW
            canvas.height = targetH
            const ctx = canvas.getContext('2d', { willReadFrequently: true })
            ctx.drawImage(tempImg, 0, 0, canvas.width, canvas.height)

            const bgColors = sampleBackground(ctx, canvas.width, canvas.height)
            const iData = ctx.getImageData(0, 0, canvas.width, canvas.height)
            
            let outData
            try {
              outData = await processBackgroundInWorker(iData.data, canvas.width, canvas.height, bgColors, thr, fthr, spill)
            } catch {}
            if (!outData) {
              const mask = buildMask(iData.data, canvas.width, canvas.height, bgColors, thr)
              outData = applyAlpha(iData.data, mask, canvas.width, canvas.height, fthr, spill)
            }
            const out = new ImageData(outData, canvas.width, canvas.height)

            if (rMode === 'color') {
              const [fr, fg, fb] = parseHexColor(bgCol)
              const fill = new Uint8ClampedArray(outData)
              for (let i = 0; i < fill.length; i += 4) {
                if (fill[i + 3] < 128) { fill[i] = fr; fill[i + 1] = fg; fill[i + 2] = fb; fill[i + 3] = 255 }
              }
              ctx.putImageData(new ImageData(fill, canvas.width, canvas.height), 0, 0)
            } else {
              ctx.putImageData(out, 0, 0)
            }

            const url = canvas.toDataURL('image/png')
            canvas.width = 1
            canvas.height = 1
            resolve({ status: 'done', resultUrl: url })
          } catch (err) {
            resolve({ status: 'error', errorMsg: err.message || 'Processing failed' })
          }
        }
        tempImg.onerror = () => resolve({ status: 'error', errorMsg: 'Failed to load image resource' })
        tempImg.src = ev.target.result
      }
      reader.onerror = () => resolve({ status: 'error', errorMsg: 'Failed to read file' })
      reader.readAsDataURL(item.rawFile)
    })
  }, [])

  const runBatchProcessing = async () => {
    if (batchProcessing) return
    setBatchProcessing(true)
    setBatchProgress(0)

    let doneCount = 0
    const total = batchFiles.length

    for (let i = 0; i < total; i++) {
      const item = batchFiles[i]
      if (item.status === 'done') {
        doneCount++
        setBatchProgress(Math.round((doneCount / total) * 100))
        continue
      }

      setBatchFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'processing' } : f))
      const res = await processBatchItem(item)
      
      setBatchFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: res.status, resultUrl: res.resultUrl, errorMsg: res.errorMsg || '' } : f))
      doneCount++
      setBatchProgress(Math.round((doneCount / total) * 100))
    }

    setBatchProcessing(false)
  }

  const downloadBatchZip = async () => {
    const completed = batchFiles.filter(f => f.status === 'done' && f.resultUrl)
    if (!completed.length) return
    setZippingBatch(true)

    try {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      const usedNames = new Map()
      completed.forEach(item => {
        const base = (item.name || 'image').replace(/\.[^.]+$/, '')
        let filename = `${base}-no-bg.png`
        if (usedNames.has(filename)) {
          const count = usedNames.get(filename) + 1
          usedNames.set(filename, count)
          filename = `${base}-no-bg-${count}.png`
        } else {
          usedNames.set(filename, 1)
        }
        const base64 = item.resultUrl.includes(',') ? item.resultUrl.split(',')[1] : null
        if (base64) zip.file(filename, base64, { base64: true })
      })
      const content = await zip.generateAsync({ type: 'blob' })
      await saveFileWithFallback(content, 'tooldesk-bg-removed-images.zip', 'application/zip')
    } catch (e) {
      alert('Failed to generate ZIP archive: ' + e.message)
    } finally {
      setZippingBatch(false)
    }
  }

  const handleImageClick = (e) => {
    if (!isSampling || !img) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const scaleX = img.naturalWidth / rect.width
    const scaleY = img.naturalHeight / rect.height
    const pxX = Math.round(x * scaleX)
    const pxY = Math.round(y * scaleY)

    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = img.naturalWidth
    tempCanvas.height = img.naturalHeight
    const tempCtx = tempCanvas.getContext('2d')
    tempCtx.drawImage(img, 0, 0)
    try {
      const pixel = tempCtx.getImageData(pxX, pxY, 1, 1).data
      const rgb = [pixel[0], pixel[1], pixel[2]]
      setManualBgColors(prev => {
        const next = [...prev, rgb]
        activeConfigRef.current.manualBgColors = next
        return next
      })
    } catch (err) {
      console.error("Failed to sample pixel color", err)
    }
    setIsSampling(false)
  }

  const handleRemoveManualBg = useCallback((idx) => {
    setManualBgColors(prev => {
      const next = prev.filter((_, i) => i !== idx)
      activeConfigRef.current.manualBgColors = next
      return next
    })
  }, [])

  const handleClearManualBg = useCallback(() => {
    activeConfigRef.current.manualBgColors = []
    setManualBgColors([])
  }, [])

  const onDragOver  = e => { e.preventDefault(); setDragging(true) }
  const onDragLeave = e => { e.preventDefault(); setDragging(false) }
  const onDrop      = e => { e.preventDefault(); setDragging(false); loadFile(e.dataTransfer.files[0]) }

  const remove = useCallback(async () => {
    if (!img) return
    const jobId = ++activeJobIdRef.current

    // Snapshot current active configuration synchronously at processing trigger
    const currentConfig = { ...activeConfigRef.current }
    const currentMode = currentConfig.mode
    const modeConfig = MODES.find(m => m.id === currentMode) || MODES[2]
    const currentThr = currentMode === 'auto' ? currentConfig.threshold : (modeConfig.thr || 55)
    const currentFeather = currentConfig.feather
    const currentSpill = currentConfig.spillSupp
    const currentReplaceMode = currentConfig.replaceMode
    const currentBgColor = currentConfig.bgColor
    const currentManualColors = [...currentConfig.manualBgColors]

    setLoading(true); setProgress(2); setResult(null); setCompMode(false)
    setProgressMsg('Reading image…')

    if (currentMode === 'ai') {
      try {
        setProgressMsg('Optimizing image payload…'); setProgress(12)
        
        // Resize to max 1920px to ensure compressed JPEG payload (<1.5MB instead of 25MB PNG)
        const maxDim = 1920
        let w = img.naturalWidth || img.width
        let h = img.naturalHeight || img.height
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = Math.round(h * maxDim / w); w = maxDim }
          else { w = Math.round(w * maxDim / h); h = maxDim }
        }
        
        const c = canvasRef.current
        c.width = w; c.height = h
        const ctx = c.getContext('2d', { willReadFrequently: true })
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, 0, 0, w, h)
        const srcDataUrl = c.toDataURL('image/jpeg', 0.94)

        if (jobId !== activeJobIdRef.current) return

        setProgressMsg('Removing background via Server AI…'); setProgress(30)
        
        const res = await fetch(resolveApiUrl('/.netlify/functions/removebg'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: safeTimeoutSignal(20000),
          body: JSON.stringify({
            imageBase64: srcDataUrl,
            filename: (fileNameRef.current || 'image') + '.jpg',
            mimeType: 'image/jpeg',
          }),
        })

        if (res.ok) {
          const data = await res.json()
          if (data?.result) {
            if (jobId !== activeJobIdRef.current) return
            setProgress(100); setProgressMsg('Done!')
            setTransparentResult(data.result)
            applyBackground(data.result, currentReplaceMode, currentBgColor)
            setLoading(false)
            setTimeout(() => {
              if (jobId === activeJobIdRef.current) setCompMode(true)
            }, 100)
            return
          }
        }

        // Graceful fallback to built-in Auto engine if server keys fail or limit reached
        console.warn('Server AI API call failed or keys not set. Falling back to built-in engine...')
        setProgressMsg('Server AI unavailable — using built-in industrial engine…')
      } catch (e) {
        if (jobId !== activeJobIdRef.current) return
        console.warn('AI removal error:', e)
        setProgressMsg('Switching to built-in industrial engine…')
      }
    }

    if (jobId !== activeJobIdRef.current) return

    await new Promise(r => setTimeout(r, 20))
    if (jobId !== activeJobIdRef.current) return

    const natW = img.naturalWidth || img.width
    const natH = img.naturalHeight || img.height
    // Cap to safe 4MP / max 2048px to prevent uncontrolled memory allocation & browser crashes on mobile
    const MAX_DIM = 2048
    let targetW = natW
    let targetH = natH
    if (targetW > MAX_DIM || targetH > MAX_DIM) {
      if (targetW > targetH) {
        targetW = MAX_DIM
        targetH = Math.round((natH * MAX_DIM) / natW)
      } else {
        targetH = MAX_DIM
        targetW = Math.round((natW * MAX_DIM) / natH)
      }
    }

    const c = canvasRef.current
    c.width  = targetW
    c.height = targetH
    const ctx = c.getContext('2d', { willReadFrequently: true })
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, c.width, c.height)
    setProgress(12); setProgressMsg('Analysing background colors…')
    await new Promise(r => setTimeout(r, 0))
    if (jobId !== activeJobIdRef.current) return

    const bgColors = [...sampleBackground(ctx, c.width, c.height), ...currentManualColors]
    setProgress(25); setProgressMsg(`Found ${bgColors.length} background color(s)…`)
    await new Promise(r => setTimeout(r, 0))
    if (jobId !== activeJobIdRef.current) return

    const iData = ctx.getImageData(0, 0, c.width, c.height)
    // If AI failed/fell back, use tolerance 55 rather than 0
    const effectiveThr = currentMode === 'ai' ? 55 : currentThr
    setProgress(38); setProgressMsg('Building pixel mask…')
    await new Promise(r => setTimeout(r, 0))
    if (jobId !== activeJobIdRef.current) return

    let outData
    try {
      outData = await processBackgroundInWorker(iData.data, c.width, c.height, bgColors, effectiveThr, currentFeather, currentSpill)
    } catch {}
    if (!outData) {
      const mask = buildMask(iData.data, c.width, c.height, bgColors, effectiveThr)
      outData = applyAlpha(iData.data, mask, c.width, c.height, currentFeather, currentSpill)
    }
    if (jobId !== activeJobIdRef.current) return

    setProgress(88); setProgressMsg('Rendering result…')
    await new Promise(r => setTimeout(r, 0))
    if (jobId !== activeJobIdRef.current) return

    const out = new ImageData(outData, c.width, c.height)
    ctx.putImageData(out, 0, 0)
    const transparentUrl = c.toDataURL('image/png')
    setTransparentResult(transparentUrl)

    if (currentReplaceMode === 'color') {
      const [fr, fg, fb] = parseHexColor(currentBgColor)
      const fill = new Uint8ClampedArray(outData)
      for (let i = 0; i < fill.length; i += 4) {
        if (fill[i + 3] < 128) { fill[i] = fr; fill[i + 1] = fg; fill[i + 2] = fb; fill[i + 3] = 255 }
      }
      ctx.putImageData(new ImageData(fill, c.width, c.height), 0, 0)
      setResult(c.toDataURL('image/png'))
    } else {
      setResult(transparentUrl)
    }

    setLoading(false); setProgress(100); setProgressMsg('Done!')
    setTimeout(() => {
      if (jobId === activeJobIdRef.current) setCompMode(true)
    }, 100)
  }, [img, applyBackground])

  const download = useCallback(() => {
    if (!result) return
    saveFileWithFallback(result, `${downloadName || 'background-removed'}.png`, 'image/png')
  }, [result, downloadName])

  // Drag-to-compare
  const startCompare = e => { compareActive.current=true; handleCompare(e) }
  const endCompare   = () => { compareActive.current=false }
  const handleCompare = useCallback(e => {
    if (!compareRef.current) return
    const r = compareRef.current.getBoundingClientRect()
    const cx = e.touches ? e.touches[0].clientX : e.clientX
    setCompPos(Math.max(0, Math.min(100, ((cx-r.left)/r.width)*100)))
  }, [])

  const doneCount = batchFiles.filter(f => f.status === 'done').length

  if (batchMode) {
    return (
      <ToolShell tool={tool}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 18, alignItems: 'start' }} className="batch-remover-layout">
          {/* Main Panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <ToolCard>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <h3 style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 18, color: '#0d0d1a', margin: 0 }}>
                    ⚙️ Batch Background Remover
                  </h3>
                  <p style={{ fontSize: 12, color: '#888', margin: '4px 0 0 0' }}>
                    {batchFiles.length} file{batchFiles.length !== 1 ? 's' : ''} queued
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: .96 }}
                    onClick={() => {
                      clearBatch()
                      setBatchMode(false)
                      setImg(null)
                      setResult(null)
                    }}
                    style={{ padding: '8px 14px', borderRadius: 10, border: '1.5px solid rgba(239,68,68,.2)', background: 'rgba(239,68,68,.04)', color: '#ef4444', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    ✕ Clear All
                  </motion.button>
                  <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: .96 }}
                    onClick={() => {
                      clearBatch()
                      setBatchMode(false)
                    }}
                    style={{ padding: '8px 14px', borderRadius: 10, border: '1.5px solid rgba(0,0,0,.1)', background: '#fff', color: '#555', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    ← Single Mode
                  </motion.button>
                </div>
              </div>

              {/* Progress Bar */}
              {batchProcessing && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: '#4F8EF7', marginBottom: 6 }}>
                    <span>Processing Queue…</span>
                    <span>{batchProgress}%</span>
                  </div>
                  <div style={{ height: 6, background: '#e2e5ec', borderRadius: 3, overflow: 'hidden' }}>
                    <motion.div animate={{ width: `${batchProgress}%` }} style={{ height: '100%', background: '#4F8EF7', borderRadius: 3 }} />
                  </div>
                </div>
              )}

              {/* Drop area inside batch */}
              <motion.label
                onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
                animate={{ background: isDragging ? 'rgba(79,142,247,.06)' : '#fafbff', borderColor: isDragging ? '#4F8EF7' : 'rgba(0,0,0,.08)' }}
                style={{ display: 'block', border: '1.5px dashed rgba(0,0,0,.08)', borderRadius: 12, padding: '24px', textAlign: 'center', cursor: 'pointer', marginBottom: 14 }}>
                <span style={{ fontSize: 24, display: 'block', marginBottom: 6 }}>📂</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#333' }}>Drag & drop more images here</span>
                <span style={{ fontSize: 11, color: '#aaa', display: 'block', marginTop: 2 }}>or click to browse</span>
                <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => loadMultipleFiles(e.target.files)} />
              </motion.label>

              {/* Queue List Grid */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 400, overflowY: 'auto', paddingRight: 4 }}>
                {batchFiles.map((item, index) => (
                  <motion.div key={item.id} layout
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#fafbff', borderRadius: 12, border: '1px solid rgba(0,0,0,.04)' }}>
                    {/* Thumbnail preview */}
                    <div style={{ width: 44, height: 44, borderRadius: 8, overflow: 'hidden', background: '#e2e5ec', flexShrink: 0 }}>
                      <img src={item.resultUrl || item.previewUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    {/* Filename & size */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#222', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.name}
                      </div>
                      <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>
                        {fmtBytes(item.size)}
                      </div>
                    </div>
                    {/* Status badges */}
                    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                      {item.status === 'pending' && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,.08)', padding: '2px 8px', borderRadius: 6 }}>
                          Pending
                        </span>
                      )}
                      {item.status === 'processing' && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#4f8ef7', background: 'rgba(79,142,247,.08)', padding: '2px 8px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', border: '2px solid #4f8ef7', borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />
                          Running
                        </span>
                      )}
                      {item.status === 'done' && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', background: 'rgba(34,197,94,.08)', padding: '2px 8px', borderRadius: 6 }}>
                          ✓ Done
                        </span>
                      )}
                      {item.status === 'error' && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', background: 'rgba(239,68,68,.08)', padding: '2px 8px', borderRadius: 6 }} title={item.errorMsg}>
                          ⚠️ Failed
                        </span>
                      )}

                      {/* Download Individual */}
                      {item.status === 'done' && item.resultUrl && (
                        <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                          onClick={() => {
                            const name = `${(item.name || 'image').replace(/\.[^.]+$/, '')}-no-bg.png`
                            saveFileWithFallback(item.resultUrl, name, 'image/png')
                          }}
                          style={{ border: 'none', background: 'none', color: '#4F8EF7', cursor: 'pointer', fontSize: 16 }}>
                          ⬇️
                        </motion.button>
                      )}

                      {/* Remove item */}
                      <button disabled={batchProcessing}
                        onClick={() => setBatchFiles(prev => {
                          const it = prev.find(x => x.id === item.id)
                          if (it?.previewUrl) URL.revokeObjectURL(it.previewUrl)
                          if (it?.resultUrl && typeof it.resultUrl === 'string' && it.resultUrl.startsWith('blob:')) {
                            URL.revokeObjectURL(it.resultUrl)
                          }
                          return prev.filter(x => x.id !== item.id)
                        })}
                        style={{ border: 'none', background: 'none', color: '#ccc', cursor: 'pointer', fontSize: 16 }}>
                        ✕
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </ToolCard>
          </div>

          {/* Sidebar / Batch Controller */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <ToolCard>
              <h4 style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 14, color: '#0d0d1a', margin: '0 0 14px 0' }}>
                ⚡ Processing Actions
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  onClick={runBatchProcessing} disabled={batchProcessing || batchFiles.length === 0}
                  style={{ width: '100%', padding: '10px 16px', borderRadius: 10, border: 'none', background: batchProcessing || batchFiles.length === 0 ? '#e2e5ec' : 'linear-gradient(135deg,#4F8EF7,#7c3aed)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: batchProcessing || batchFiles.length === 0 ? 'not-allowed' : 'pointer' }}>
                  {batchProcessing ? '⚡ Processing Queue…' : '⚡ Start Batch Process'}
                </motion.button>
                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  onClick={downloadBatchZip} disabled={doneCount === 0 || zippingBatch}
                  style={{ width: '100%', padding: '10px 16px', borderRadius: 10, border: '1.5px solid rgba(79,142,247,.3)', background: 'rgba(79,142,247,.04)', color: '#4F8EF7', fontSize: 13, fontWeight: 700, cursor: doneCount === 0 || zippingBatch ? 'not-allowed' : 'pointer' }}>
                  {zippingBatch ? '⏳ Zipping…' : `⬇ Download All (${doneCount} PNGs)`}
                </motion.button>
              </div>
            </ToolCard>

            <ToolCard>
              <h4 style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 14, color: '#0d0d1a', margin: '0 0 14px 0' }}>
                ⚙️ Batch Settings
              </h4>
              
              {/* Mode Select */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.4px', display: 'block', marginBottom: 6 }}>Removal Mode</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {MODES.filter(m => m.id !== 'ai').map(m => ( // Strip AI mode in batch local processing
                    <button key={m.id} onClick={() => handleModeChange(m.id)} disabled={batchProcessing}
                      style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: `1.5px solid ${mode === m.id ? '#4F8EF7' : 'rgba(0,0,0,.08)'}`, background: mode === m.id ? 'rgba(79,142,247,.08)' : '#fff', color: mode === m.id ? '#4F8EF7' : '#555', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                      {m.label.split(' ')[1]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sliders */}
              {mode === 'auto' && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.4px' }}>Tolerance</label>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#4F8EF7' }}>{threshold}</span>
                  </div>
                  <input type="range" min={10} max={150} value={threshold} onChange={e => handleThrChange(+e.target.value)} disabled={batchProcessing}
                    style={{ width: '100%', accentColor: '#4F8EF7' }} />
                </div>
              )}

              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.4px' }}>Feathering</label>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#4F8EF7' }}>{feather}px</span>
                </div>
                <input type="range" min={0} max={25} value={feather} onChange={e => handleFeatherChange(+e.target.value)} disabled={batchProcessing}
                  style={{ width: '100%', accentColor: '#4F8EF7' }} />
              </div>

              {/* Background replace type */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.4px', display: 'block', marginBottom: 6 }}>Background</label>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  <button onClick={() => handleReplaceModeChange('transparent')} disabled={batchProcessing}
                    style={{ flex: 1, padding: 8, borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: `1.5px solid ${replaceMode === 'transparent' ? '#4F8EF7' : 'rgba(0,0,0,.08)'}`, background: replaceMode === 'transparent' ? 'rgba(79,142,247,.08)' : '#fff', color: replaceMode === 'transparent' ? '#4F8EF7' : '#666' }}>
                    Transparent
                  </button>
                  <button onClick={() => handleReplaceModeChange('color')} disabled={batchProcessing}
                    style={{ flex: 1, padding: 8, borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: `1.5px solid ${replaceMode === 'color' ? '#4F8EF7' : 'rgba(0,0,0,.08)'}`, background: replaceMode === 'color' ? 'rgba(79,142,247,.08)' : '#fff', color: replaceMode === 'color' ? '#4F8EF7' : '#666' }}>
                    Solid Color
                  </button>
                </div>
                {replaceMode === 'color' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="color" value={bgColor} onChange={e => handleBgColorChange(e.target.value)} disabled={batchProcessing}
                      style={{ width: 34, height: 34, padding: 0, border: 'none', borderRadius: 6, cursor: 'pointer' }} />
                    <input type="text" value={bgColor} onChange={e => handleBgColorChange(e.target.value)} disabled={batchProcessing}
                      style={{ flex: 1, padding: '7px 10px', border: '1.5px solid rgba(0,0,0,.1)', borderRadius: 8, fontSize: 12, fontFamily: 'monospace' }} />
                  </div>
                )}
              </div>
            </ToolCard>
          </div>
        </div>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          @media (max-width: 768px) {
            .batch-remover-layout { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </ToolShell>
    )
  }

  return (
    <ToolShell tool={tool}>
      <canvas ref={canvasRef} style={{display:'none'}}/>
      <ToolCard>

        {/* ── Info bar ── */}
        <div style={{ background:'linear-gradient(135deg,rgba(79,142,247,.06),rgba(156,111,222,.04))', border:'1px solid rgba(79,142,247,.15)', borderRadius:14, padding:'13px 16px', marginBottom:18, fontSize:12.5, color:'#1050a0', lineHeight:1.65 }}>
          🏭 <strong>Industrial-grade engine:</strong> Multi-cluster color sampling → Perceptual color distance → Flood-fill edge detection → 2-pass interior refinement → Smoothstep feathering → Spill suppression.
        </div>

        {/* ── Mode selector (Single source of truth: persistent across upload lifecycle) ── */}
        <div style={{marginBottom:18}}>
          <label className="lbl">Removal Mode</label>
          <div className="tool-grid-4" style={{gap:7}}>
            {MODES.map(m=>(
              <button key={m.id} onClick={()=>handleModeChange(m.id)}
                style={{flex:1,padding:'10px 8px',borderRadius:12,border:`1.5px solid ${mode===m.id?'#4F8EF7':'rgba(0,0,0,.1)'}`,background:mode===m.id?'rgba(79,142,247,.08)':'#fafafa',cursor:'pointer',fontFamily:'DM Sans,sans-serif',fontSize:11.5,fontWeight:700,color:mode===m.id?'#4F8EF7':'#666',transition:'all .18s',lineHeight:1.4,height:'auto'}}>
                <div>{m.label}</div>
                <div style={{fontSize:9.5,color:'#bbb',fontWeight:400,marginTop:2}}>{m.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* ── UPLOAD ── */}
        {!img ? (
          <motion.label
            onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
            animate={{ scale:isDragging?1.02:1, background:isDragging?'rgba(79,142,247,.07)':'#f8f9ff', borderColor:isDragging?'#4F8EF7':'rgba(0,0,0,.11)' }}
            style={{ display:'block', border:'2px dashed rgba(0,0,0,.11)', borderRadius:20, padding:'56px 24px', textAlign:'center', cursor:'pointer' }}>
            <motion.div animate={{y:isDragging?-10:0}} style={{pointerEvents:'none'}}>
              <div style={{fontSize:56,marginBottom:16,filter:'drop-shadow(0 8px 24px rgba(156,111,222,.3))'}}>{isDragging?'📂':'✂️'}</div>
              <div style={{fontFamily:'Syne,sans-serif',fontSize:18,fontWeight:800,color:'#0d0d1a',marginBottom:8}}>
                {isDragging?'Drop image to upload':'Drag & drop your image'}
              </div>
              <div style={{fontSize:13,color:'#aaa',fontWeight:300,marginBottom:16}}>PNG · JPG · WebP · GIF — any size</div>
              <div style={{display:'inline-flex',alignItems:'center',gap:8,background:'#0d0d1a',color:'#fff',padding:'11px 26px',borderRadius:999,fontWeight:700,fontSize:14}}>
                📁 Choose Image
              </div>
            </motion.div>
            <input type="file" accept="image/*" multiple style={{display:'none'}} onChange={e=>loadMultipleFiles(e.target.files)}/>
          </motion.label>
        ) : (
          <>
            {/* ── Touch-up Canvas Editor ── */}
            {isTouchUp && result ? (
              <div style={{ marginBottom: 20 }}>
                <TouchUpCanvas
                  resultUrl={result}
                  originalImg={img}
                  brushMode={brushMode}
                  brushSize={brushSize}
                  onSave={(newUrl) => {
                    setResult(newUrl)
                    setIsTouchUp(false)
                  }}
                  onCancel={() => setIsTouchUp(false)}
                />
                <div className="tool-grid-2-compact" style={{ marginTop: 14, background: '#fafafa', padding: 14, borderRadius: 12, border: '1px solid rgba(0,0,0,.04)' }}>
                  <div>
                    <label className="lbl">Brush Mode</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => setBrushMode('erase')}
                        style={{ flex: 1, padding: 8, borderRadius: 9, cursor: 'pointer', border: `1.5px solid ${brushMode === 'erase' ? '#ef4444' : 'rgba(0,0,0,.1)'}`, background: brushMode === 'erase' ? 'rgba(239,68,68,.08)' : '#fff', color: brushMode === 'erase' ? '#ef4444' : '#666', fontSize: 12, fontWeight: 700, height: 'auto' }}>
                        🧹 Erase BG
                      </button>
                      <button
                        onClick={() => setBrushMode('restore')}
                        style={{ flex: 1, padding: 8, borderRadius: 9, cursor: 'pointer', border: `1.5px solid ${brushMode === 'restore' ? '#22c55e' : 'rgba(0,0,0,.1)'}`, background: brushMode === 'restore' ? 'rgba(34,197,94,.08)' : '#fff', color: brushMode === 'restore' ? '#22c55e' : '#666', fontSize: 12, fontWeight: 700, height: 'auto' }}>
                        ✨ Restore original
                      </button>
                    </div>
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <label className="lbl" style={{ margin: 0 }}>Brush Size</label>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#9C6FDE' }}>{brushSize}px</span>
                    </div>
                    <input type="range" min={3} max={80} value={brushSize} onChange={(e) => setBrushSize(+e.target.value)}
                      style={{ width: '100%', accentColor: '#9C6FDE', background: `linear-gradient(to right,#9C6FDE 0%,#9C6FDE ${Math.max(0, Math.min(100, ((brushSize) - (3)) / ((80) - (3)) * 100))}%,#e2e4ef ${Math.max(0, Math.min(100, ((brushSize) - (3)) / ((80) - (3)) * 100))}%,#e2e4ef 100%)`, WebkitAppearance: 'none', appearance: 'none', height: 5, borderRadius: 3, outline: 'none', cursor: 'pointer' }} className="rs-thumb" />
                  </div>
                </div>
              </div>
            ) : compareMode && result ? (
              <div style={{marginBottom:20}}>
                <div style={{fontSize:12,color:'#888',fontWeight:700,letterSpacing:'.4px',textTransform:'uppercase',marginBottom:10,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span>Drag to compare</span>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <button onClick={()=>setCompMode(false)} style={{background:'none',border:'none',color:'#4F8EF7',fontSize:12,fontWeight:600,cursor:'pointer'}}>Grid view ▣</button>
                    <button onClick={() => setIsTouchUp(true)} style={{ background: 'none', border: 'none', color: '#9C6FDE', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>🖌️ Touch Up</button>
                  </div>
                </div>
                <div ref={compareRef}
                  onMouseDown={startCompare} onMouseMove={e=>compareActive.current&&handleCompare(e)} onMouseUp={endCompare} onMouseLeave={endCompare}
                  onTouchStart={startCompare} onTouchMove={handleCompare} onTouchEnd={endCompare}
                  style={{position:'relative',borderRadius:16,overflow:'hidden',border:'1px solid rgba(0,0,0,.08)',cursor:'col-resize',userSelect:'none',touchAction:'none',boxShadow:'0 8px 32px rgba(0,0,0,.12)'}}>
                  {/* Result layer */}
                  <div style={{background:'repeating-conic-gradient(#d8d8dc 0% 25%,white 0% 50%) 0 0/16px 16px'}}>
                    <img src={result} alt="Result" style={{width:'100%',display:'block',maxHeight:380,objectFit:'contain'}}/>
                  </div>
                  {/* Original overlay */}
                  <div style={{position:'absolute',top:0,left:0,right:0,bottom:0,clipPath:`inset(0 ${100-comparePos}% 0 0)`}}>
                    <img src={img.src} alt="Original" style={{width:'100%',height:'100%',objectFit:'contain',background:'#f0f0f0'}}/>
                  </div>
                  {/* Divider */}
                  <div style={{position:'absolute',top:0,bottom:0,left:`${comparePos}%`,width:3,background:'#fff',transform:'translateX(-50%)',zIndex:10,boxShadow:'0 0 12px rgba(0,0,0,.3)'}}>
                    <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:38,height:38,borderRadius:'50%',background:'#fff',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 3px 14px rgba(0,0,0,.25)',fontSize:16,fontWeight:700}}>⟺</div>
                  </div>
                  {/* Labels */}
                  <div style={{position:'absolute',top:10,left:12,background:'rgba(0,0,0,.55)',color:'#fff',fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:999}}>Original</div>
                  <div style={{position:'absolute',top:10,right:12,background:'rgba(79,142,247,.88)',color:'#fff',fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:999}}>Removed</div>
                </div>
              </div>
            ) : (
              /* Grid view */
              <div style={{marginBottom:20}}>
                <div style={{fontSize:12,color:'#888',fontWeight:700,letterSpacing:'.4px',textTransform:'uppercase',marginBottom:10,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span>Before / After Grid</span>
                  <div style={{ display: 'flex', gap: 12 }}>
                    {result && <button onClick={()=>setCompMode(true)} style={{background:'none',border:'none',color:'#4F8EF7',fontSize:12,fontWeight:600,cursor:'pointer'}}>Compare view ↔</button>}
                    {result && <button onClick={() => setIsTouchUp(true)} style={{ background: 'none', border: 'none', color: '#9C6FDE', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>🖌️ Touch Up</button>}
                  </div>
                </div>
                <div className="tool-grid-2-compact">
                  <div>
                    <div style={{fontSize:10.5,color:'#888',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px',marginBottom:7}}>
                      Original {isSampling && <span style={{color:'#ef4444',textTransform:'none',fontWeight:600}}>— Click to pick color</span>}
                    </div>
                    <div style={{borderRadius:14,overflow:'hidden',border:'1.5px solid rgba(0,0,0,.08)',background:'#f0f0f3',minHeight:110,display:'flex',alignItems:'center',justifyContent:'center'}}>
                      <img 
                        src={img.src} 
                        onClick={handleImageClick}
                        alt="Original" 
                        style={{
                          maxWidth:'100%',
                          maxHeight:220,
                          display:'block',
                          objectFit:'contain',
                          cursor: isSampling ? 'crosshair' : 'default',
                          border: isSampling ? '2px dashed #ef4444' : 'none'
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <div style={{fontSize:10.5,color:'#888',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px',marginBottom:7}}>Result</div>
                    <div style={{borderRadius:14,overflow:'hidden',border:'1.5px solid rgba(0,0,0,.08)',background:'repeating-conic-gradient(#d8d8dc 0% 25%,white 0% 50%) 0 0/14px 14px',minHeight:110,display:'flex',alignItems:'center',justifyContent:'center'}}>
                      {result
                        ? <img src={result} alt="Result" style={{maxWidth:'100%',maxHeight:220,display:'block',objectFit:'contain'}}/>
                        : <div style={{fontSize:12,color:'#bbb',padding:16,textAlign:'center'}}>{loading?`${progressMsg} ${progress}%`:'Result here'}</div>}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Progress ── */}
            <AnimatePresence>
              {loading && (
                <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}}
                  style={{marginBottom:18,overflow:'hidden'}}>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:12.5,color:'#555',marginBottom:7,fontWeight:500}}>
                    <span>{progressMsg}</span><span style={{fontWeight:700,color:'#4F8EF7'}}>{progress}%</span>
                  </div>
                  <div style={{height:7,background:'#e5e7eb',borderRadius:4,overflow:'hidden'}}>
                    <motion.div animate={{width:`${progress}%`}} transition={{ease:'easeOut'}}
                       style={{height:'100%',background:'linear-gradient(90deg,#4F8EF7,#9C6FDE,#F06292)',borderRadius:4}}/>
                  </div>
                  <div style={{fontSize:10.5,color:'#bbb',marginTop:5,textAlign:'center'}}>
                    Processing {imgSize?.w}×{imgSize?.h}px — {(imgSize?.w*imgSize?.h/1e6).toFixed(1)}MP
                  </div>
                </motion.div>
              )}
            </AnimatePresence>


            {/* Eyedropper Custom Color Keying */}
            {mode !== 'ai' && (
              <div className="fgrp">
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                  <label className="lbl" style={{ margin:0 }}>Custom Colors to Key Out</label>
                  <button 
                    onClick={() => { setCompMode(false); setIsSampling(s => !s) }}
                    className="btn btn-outline btn-sm"
                    style={{ 
                      padding:'3px 9px', 
                      fontSize:11.5,
                      height:'auto',
                      borderColor: isSampling ? '#ef4444' : 'rgba(0,0,0,.15)',
                      background: isSampling ? 'rgba(239,68,68,.06)' : '#fff',
                      color: isSampling ? '#ef4444' : '#4F8EF7'
                    }}>
                    {isSampling ? '✕ Cancel' : '🔍 Eyedropper'}
                  </button>
                </div>
                
                {isSampling && (
                  <div style={{ fontSize:11.5, color:'#f59e0b', fontWeight:600, marginBottom:8, animation:'sjpulse2 1.5s ease-in-out infinite' }}>
                    🎯 Click on the original image above to select a background color to remove.
                  </div>
                )}

                {manualBgColors.length > 0 ? (
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center', background:'#fafafa', padding:'8px 10px', borderRadius:10, border:'1px solid rgba(0,0,0,.05)' }}>
                    {manualBgColors.map((rgb, idx) => (
                      <div key={idx} 
                        onClick={() => handleRemoveManualBg(idx)}
                        style={{ 
                          background: `rgb(${rgb.join(',')})`, 
                          width: 24, 
                          height: 24, 
                          borderRadius: '50%', 
                          border: '2px solid #fff', 
                          boxShadow: '0 2px 6px rgba(0,0,0,.15)', 
                          cursor: 'pointer',
                          position: 'relative',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                        title="Click to remove">
                        <span style={{ fontSize:9, color: (rgb[0]+rgb[1]+rgb[2])/3 > 128 ? '#000' : '#fff', fontWeight:'bold' }}>✕</span>
                      </div>
                    ))}
                    <button 
                      onClick={handleClearManualBg}
                      style={{ background:'none', border:'none', color:'#aaa', fontSize:11, cursor:'pointer', textDecoration:'underline' }}>
                      Clear All
                    </button>
                  </div>
                ) : (
                  <div style={{ fontSize:11, color:'#bbb' }}>No custom colors selected. Use eyedropper to key out specific pixels.</div>
                )}
              </div>
            )}

            {/* Threshold — only show in auto mode */}
            {mode==='auto' && (
              <div className="fgrp">
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:7}}>
                  <label className="lbl" style={{margin:0}}>Color Tolerance</label>
                  <span style={{fontSize:13,fontWeight:800,color:'#4F8EF7'}}>{threshold}</span>
                </div>
                <input type="range" min={5} max={140} value={threshold} onChange={e=>handleThrChange(+e.target.value)}
                style={{ width:'100%', background:`linear-gradient(to right,#4F8EF7 0%,#4F8EF7 ${Math.max(0,Math.min(100,((threshold)-(5))/((140)-(5))*100))}%,#e2e4ef ${Math.max(0,Math.min(100,((threshold)-(5))/((140)-(5))*100))}%,#e2e4ef 100%)`, WebkitAppearance:'none', appearance:'none', height:5, borderRadius:3, outline:'none', cursor:'pointer' }} className="rs-thumb"/>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:10.5,color:'#bbb',marginTop:4}}><span>↔ Precise edges</span><span>Wide removal →</span></div>
              </div>
            )}

            {/* Feather */}
            <div className="fgrp">
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:7}}>
                <label className="lbl" style={{margin:0}}>Edge Feather</label>
                <span style={{fontSize:13,fontWeight:800,color:'#9C6FDE'}}>{feather}px</span>
              </div>
              <input type="range" min={0} max={16} value={feather} onChange={e=>handleFeatherChange(+e.target.value)}
                style={{ width:'100%', background:`linear-gradient(to right,#4F8EF7 0%,#4F8EF7 ${Math.max(0,Math.min(100,((feather)-(0))/((16)-(0))*100))}%,#e2e4ef ${Math.max(0,Math.min(100,((feather)-(0))/((16)-(0))*100))}%,#e2e4ef 100%)`, WebkitAppearance:'none', appearance:'none', height:5, borderRadius:3, outline:'none', cursor:'pointer' }} className="rs-thumb"/>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:10.5,color:'#bbb',marginTop:4}}><span>Hard</span><span>Soft</span></div>
            </div>

            {/* Background preset colors */}
            {replaceMode==='color' && (
              <div style={{display:'flex',gap:7,flexWrap:'wrap',marginBottom:4}}>
                {['#ffffff','#000000','#f0f0f0','#1a1a2e','#4F8EF7','#22c55e','#f59e0b','#ef4444','#9C6FDE','#06b6d4'].map(c=>(
                  <button key={c} onClick={()=>handleBgColorChange(c)}
                    style={{width:28,height:28,borderRadius:7,background:c,cursor:'pointer',
                      border:`2.5px solid ${bgColor===c?'#4F8EF7':'rgba(0,0,0,.15)'}`,
                      boxShadow:bgColor===c?'0 0 0 2px rgba(79,142,247,.35)':'none',
                      transition:'all .15s'}}/>
                ))}
              </div>
            )}

            {/* Spill suppression */}
            <div className="fgrp">
              <label className="chkrow">
                <input type="checkbox" checked={spillSupp} onChange={e=>handleSpillChange(e.target.checked)}/>
                <span style={{fontSize:13}}><strong>Spill suppression</strong> — removes color fringing and haloing at edges</span>
              </label>
            </div>

            {/* Output mode */}
            <div className="fgrp">
              <label className="lbl">Output Background</label>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <button onClick={()=>handleReplaceModeChange('transparent')}
                  style={{flex:1,padding:'9px',borderRadius:11,border:`1.5px solid ${replaceMode==='transparent'?'#4F8EF7':'rgba(0,0,0,.1)'}`,background:replaceMode==='transparent'?'rgba(79,142,247,.08)':'#fafafa',cursor:'pointer',fontSize:12.5,fontWeight:700,color:replaceMode==='transparent'?'#4F8EF7':'#666',transition:'all .18s'}}>
                  ☐ Transparent PNG
                </button>
                <button onClick={()=>handleReplaceModeChange('color')}
                  style={{flex:1,padding:'9px',borderRadius:11,border:`1.5px solid ${replaceMode==='color'?'#4F8EF7':'rgba(0,0,0,.1)'}`,background:replaceMode==='color'?'rgba(79,142,247,.08)':'#fafafa',cursor:'pointer',fontSize:12.5,fontWeight:700,color:replaceMode==='color'?'#4F8EF7':'#666',transition:'all .18s'}}>
                  🎨 Solid Color
                </button>
                {replaceMode==='color' && (
                  <input type="color" value={bgColor} onChange={e=>handleBgColorChange(e.target.value)}
                    style={{width:40,height:36,border:'1.5px solid rgba(0,0,0,.12)',borderRadius:9,cursor:'pointer',padding:3}}/>
                )}
              </div>
            </div>

            {/* Download name */}
            {result && (
              <div className="fgrp">
                <label className="lbl">Download filename</label>
                <div style={{display:'flex',gap:8,alignItems:'center'}}>
                  <input className="inp" value={downloadName} onChange={e=>setDlName(e.target.value.replace(/[<>:"/\\|?*]/g,''))} placeholder="background-removed" style={{flex:1}}/>
                  <span style={{fontSize:13,color:'#999',flexShrink:0,fontWeight:500}}>.png</span>
                </div>
              </div>
            )}

                        {/* Stats — above actions */}
            {result && imgSize && (
              <motion.div initial={{opacity:0,y:6}} animate={{opacity:1,y:0}}
                className="tool-grid-3"
                style={{gap:8,marginBottom:14}}>
                {[
                  {l:'Dimensions',v:`${imgSize.w}×${imgSize.h}`,c:'#4F8EF7'},
                  {l:'Mode',      v:mode.charAt(0).toUpperCase()+mode.slice(1),c:'#9C6FDE'},
                  {l:'Output',    v:'PNG w/ α',c:'#22c55e'},
                ].map(s=>(
                  <div key={s.l} style={{textAlign:'center',padding:'10px 6px',background:'#f8f9ff',
                    borderRadius:11,border:'1px solid rgba(0,0,0,.06)',minWidth:0}}>
                    <div style={{fontFamily:'Syne,sans-serif',fontSize:13,fontWeight:800,color:s.c,
                      overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.v}</div>
                    <div style={{fontSize:9.5,color:'#bbb',fontWeight:700,textTransform:'uppercase',
                      letterSpacing:'.4px',marginTop:3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.l}</div>
                  </div>
                ))}
              </motion.div>
            )}

            {/* Actions */}
            <div className="tool-actions-row" style={{display:'grid',
              gridTemplateColumns:result?'2fr 1fr 1fr':'1fr 1fr',
              gap:9}}>
              <button className="btn btn-primary" style={{minWidth:0}} onClick={remove} disabled={loading}>
                {loading ? `${progressMsg} ${progress}%` : '✂️ Remove Background'}
              </button>
              {result && (
                <motion.button initial={{opacity:0,y:4}} animate={{opacity:1,y:0}}
                  className="btn btn-blue" style={{minWidth:0}} onClick={download}>
                  ⬇ Download PNG
                </motion.button>
              )}
              <label style={{display:'block',cursor:'pointer',minWidth:0}}>
                <div className="btn btn-outline" style={{textAlign:'center',width:'100%'}}>📁 New Image</div>
                <input type="file" accept="image/*" style={{display:'none'}} onChange={e=>loadFile(e.target.files[0])}/>
              </label>
            </div>

            {result && (
              <p style={{fontSize:11.5,color:'#888',textAlign:'center',marginTop:14,lineHeight:1.75}}>
                Transparent PNG ready to use. Edges rough? Increase feather. Too much removed? Switch to Precise mode or lower tolerance.
              </p>
            )}
          </>
        )}
      </ToolCard>
    </ToolShell>
  )
}
