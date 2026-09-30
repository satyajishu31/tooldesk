import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Square, Grid, Cloud, EyeOff, Upload, Sparkles, Loader2, Undo2, Trash2, RotateCcw, Download, CheckCircle2, AlertTriangle, Info } from 'lucide-react'
import { Reveal } from '../../components/ToolShell'
import { saveFileWithFallback } from '../../utils/fileSaver'
import Tesseract from 'tesseract.js'

const REDACTION_MODES = [
  { id: 'blackout', label: 'Blackout Box', icon: Square, desc: 'Solid opaque block' },
  { id: 'pixelate', label: 'Pixelate',     icon: Grid,   desc: 'Mosaic downsampling' },
  { id: 'blur',     label: 'Blur',         icon: Cloud,  desc: 'Gaussian softening' },
]

const COLORS = [
  { label: 'Black', hex: '#000000' },
  { label: 'Dark Gray', hex: '#1e293b' },
  { label: 'White', hex: '#ffffff' },
  { label: 'Red', hex: '#ef4444' },
  { label: 'Navy', hex: '#1e3a8a' },
]

export default function ImageRedactor({ isEmbedded = false }) {
  const [file, setFile] = useState(null)
  const [imgUrl, setImgUrl] = useState('')
  const [imgEl, setImgEl] = useState(null)
  const [naturalW, setNaturalW] = useState(0)
  const [naturalH, setNaturalH] = useState(0)

  // Redaction regions array: [{ id, x, y, w, h, mode: 'blackout'|'pixelate'|'blur', color, pixelSize, blurRadius }]
  const [regions, setRegions] = useState([])
  const [history, setHistory] = useState([]) // Undo stack
  const [selectedId, setSelectedId] = useState(null)

  // Active creation tool
  const [activeMode, setActiveMode] = useState('blackout')
  const [activeColor, setActiveColor] = useState('#000000')
  const [pixelSize, setPixelSize] = useState(14)
  const [blurRadius, setBlurRadius] = useState(12)

  const [exportFormat, setExportFormat] = useState('png')
  const [exportQuality, setExportQuality] = useState(92)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isDetecting, setIsDetecting] = useState(false)
  const [detectStatus, setDetectStatus] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const containerRef = useRef(null)
  const imageRef = useRef(null)
  const interactionRef = useRef({
    action: null, // 'drawing', 'moving', 'resize-...'
    startX: 0,
    startY: 0,
    targetId: null,
    initialRegion: null,
    handle: null,
  })

  const imgUrlRef = useRef(null)

  // Cleanup object URLs
  useEffect(() => {
    return () => {
      if (imgUrlRef.current && typeof imgUrlRef.current === 'string' && imgUrlRef.current.startsWith('blob:')) {
        try { URL.revokeObjectURL(imgUrlRef.current) } catch {}
      }
    }
  }, [])

  const loadImageSource = useCallback((source, name = 'image.png') => {
    setErrorMsg('')
    if (imgUrlRef.current && typeof imgUrlRef.current === 'string' && imgUrlRef.current.startsWith('blob:')) {
      try { URL.revokeObjectURL(imgUrlRef.current) } catch {}
    }
    const isFile = source instanceof File || source instanceof Blob
    const url = isFile ? URL.createObjectURL(source) : source
    imgUrlRef.current = url
    setImgUrl(url)
    if (isFile) setFile(source)

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const nw = img.naturalWidth || img.width
      const nh = img.naturalHeight || img.height
      if (nw <= 0 || nh <= 0) {
        setErrorMsg('Could not read image dimensions.')
        return
      }
      setImgEl(img)
      setNaturalW(nw)
      setNaturalH(nh)
      setRegions([])
      setHistory([])
      setSelectedId(null)
    }
    img.onerror = () => {
      setErrorMsg('Failed to load image. File may be corrupted or unsupported.')
    }
    img.src = url
  }, [])

  // Paste from clipboard support
  useEffect(() => {
    const handlePaste = (e) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile()
          if (blob) {
            loadImageSource(blob, 'pasted-image.png')
            break
          }
        }
      }
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [loadImageSource])

  const handleFileInput = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.type.startsWith('image/')) {
      setErrorMsg('Please upload a valid image file.')
      return
    }
    if (f.size > 50 * 1024 * 1024) {
      setErrorMsg('Image size exceeds 50MB limit.')
      return
    }
    loadImageSource(f, f.name)
  }

  // Push state to undo stack
  const recordHistory = useCallback((newRegions) => {
    setHistory(h => [...h.slice(-15), regions])
    setRegions(newRegions)
  }, [regions])

  const handleUndo = () => {
    if (history.length === 0) return
    const prev = history[history.length - 1]
    setHistory(h => h.slice(0, -1))
    setRegions(prev)
    setSelectedId(null)
  }

  // Auto-Detect and redact sensitive personal data (PII) using local WebAssembly OCR
  const detectAndRedactPII = async () => {
    if (!imgUrl || !naturalW || !naturalH || isDetecting) return
    setIsDetecting(true)
    setDetectStatus('Scanning image for sensitive text & PII…')
    setErrorMsg('')
    try {
      const { data } = await Tesseract.recognize(imgUrl, 'eng', {
        workerPath: '/tesseract/worker.min.js',
        corePath: '/tesseract/core',
        langPath: '/tesseract/lang-data',
        gzip: true,
      })
      const words = data?.words || []
      const PII_PATTERNS = [
        { type: 'Email', regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/ },
        { type: 'Phone', regex: /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/ },
        { type: 'Credit Card', regex: /\b(?:\d[ -]*?){13,19}\b/ },
        { type: 'SSN / ID', regex: /\b\d{3}-\d{2}-\d{4}\b/ },
        { type: 'Secret Key', regex: /\b(?:sk_live|ghp_|AKIA|AIza)[0-9a-zA-Z_-]{10,}\b/i },
        { type: 'Password', regex: /password\s*[:=]\s*\S+/i }
      ]

      const matchedRegions = []
      const seenBoxes = new Set()

      const addBox = (bbox, pad = 4) => {
        if (!bbox) return
        const rx = Math.max(0, Math.round(bbox.x0 - pad))
        const ry = Math.max(0, Math.round(bbox.y0 - pad))
        const rw = Math.min(naturalW - rx, Math.round((bbox.x1 - bbox.x0) + pad * 2))
        const rh = Math.min(naturalH - ry, Math.round((bbox.y1 - bbox.y0) + pad * 2))
        const key = `${rx}_${ry}_${rw}_${rh}`
        if (!seenBoxes.has(key) && rw > 4 && rh > 4) {
          seenBoxes.add(key)
          matchedRegions.push({
            id: 'pii_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            x: rx,
            y: ry,
            w: Math.max(8, rw),
            h: Math.max(8, rh),
            mode: activeMode,
            color: activeColor,
            pixelSize,
            blurRadius,
          })
        }
      }

      // Check lines for multi-word matches (e.g. credit cards with spaces, phone numbers)
      const lines = data?.lines || []
      for (const line of lines) {
        const lineTxt = (line.text || '').trim()
        if (!lineTxt) continue
        for (const p of PII_PATTERNS) {
          if (p.regex.test(lineTxt)) {
            // If line contains matching words, redact them or the line bbox
            if (Array.isArray(line.words) && line.words.length > 0) {
              for (const w of line.words) {
                const wTxt = (w.text || '').trim()
                if (wTxt && (p.regex.test(wTxt) || p.regex.test(lineTxt))) {
                  addBox(w.bbox, 3)
                }
              }
            } else if (line.bbox) {
              addBox(line.bbox, 4)
            }
          }
        }
      }

      // Also check individual words for single token entities (emails, tokens, keys)
      for (const w of words) {
        const txt = (w.text || '').trim()
        if (!txt) continue
        if (PII_PATTERNS.some(p => p.regex.test(txt))) {
          addBox(w.bbox, 4)
        }
      }

      if (matchedRegions.length > 0) {
        recordHistory([...regions, ...matchedRegions])
        setDetectStatus({ type: 'success', text: `Redacted ${matchedRegions.length} sensitive items (card numbers, emails, or IDs)!` })
      } else {
        setDetectStatus({ type: 'info', text: 'No sensitive PII detected in recognized text.' })
      }
    } catch (err) {
      console.warn('PII detection error:', err)
      setDetectStatus({ type: 'warning', text: 'Auto-detection encountered an error. You can still manually redact.' })
    } finally {
      setIsDetecting(false)
      setTimeout(() => setDetectStatus(null), 4500)
    }
  }

  const handleDeleteSelected = () => {
    if (!selectedId) return
    recordHistory(regions.filter(r => r.id !== selectedId))
    setSelectedId(null)
  }

  const handleResetAll = () => {
    if (regions.length === 0) return
    recordHistory([])
    setSelectedId(null)
  }

  // Pointer down on canvas/image to start drawing or moving
  const handlePointerDownContainer = (e) => {
    if (!naturalW || !naturalH || !imageRef.current) return
    if (e.target !== containerRef.current && e.target !== imageRef.current) return

    const rect = imageRef.current.getBoundingClientRect()
    const scaleX = naturalW / rect.width
    const scaleY = naturalH / rect.height

    const clickX = Math.max(0, Math.min(naturalW, Math.round((e.clientX - rect.left) * scaleX)))
    const clickY = Math.max(0, Math.min(naturalH, Math.round((e.clientY - rect.top) * scaleY)))

    const newId = 'r_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4)
    const newRegion = {
      id: newId,
      x: clickX,
      y: clickY,
      w: 1,
      h: 1,
      mode: activeMode,
      color: activeColor,
      pixelSize,
      blurRadius,
    }

    interactionRef.current = {
      action: 'drawing',
      startX: e.clientX,
      startY: e.clientY,
      targetId: newId,
      initialRegion: newRegion,
    }

    setRegions(prev => [...prev, newRegion])
    setSelectedId(newId)

    const onPointerMove = (moveEvt) => {
      const { action, startX, startY, targetId } = interactionRef.current
      if (action !== 'drawing' || !targetId) return

      const deltaX = (moveEvt.clientX - startX) * scaleX
      const deltaY = (moveEvt.clientY - startY) * scaleY

      setRegions(prevList => prevList.map(item => {
        if (item.id !== targetId) return item
        const origX = clickX
        const origY = clickY

        const curX = Math.max(0, Math.min(naturalW, Math.round(origX + deltaX)))
        const curY = Math.max(0, Math.min(naturalH, Math.round(origY + deltaY)))

        const x = Math.min(origX, curX)
        const y = Math.min(origY, curY)
        const w = Math.max(4, Math.abs(curX - origX))
        const h = Math.max(4, Math.abs(curY - origY))
        return { ...item, x, y, w, h }
      }))
    }

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
      interactionRef.current.action = null
      // Filter out accidental micro clicks
      setRegions(prev => prev.filter(r => r.w >= 8 && r.h >= 8))
    }

    const onPointerCancel = () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
      interactionRef.current.action = null
    }

    window.addEventListener('pointermove', onPointerMove, { passive: false })
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
  }

  // Pointer down on existing region to move or resize
  const handlePointerDownRegion = (region, actionType, handleName, e) => {
    e.stopPropagation()
    e.preventDefault()
    setSelectedId(region.id)

    if (!naturalW || !naturalH || !imageRef.current) return
    const rect = imageRef.current.getBoundingClientRect()
    const scaleX = naturalW / rect.width
    const scaleY = naturalH / rect.height

    interactionRef.current = {
      action: actionType,
      startX: e.clientX,
      startY: e.clientY,
      targetId: region.id,
      initialRegion: { ...region },
      handle: handleName,
    }

    const onPointerMove = (moveEvt) => {
      const { action, startX, startY, targetId, initialRegion, handle } = interactionRef.current
      if (!action || !targetId || !initialRegion) return

      const deltaX = (moveEvt.clientX - startX) * scaleX
      const deltaY = (moveEvt.clientY - startY) * scaleY

      setRegions(prevList => prevList.map(item => {
        if (item.id !== targetId) return item
        let { x, y, w, h } = initialRegion

        if (action === 'moving') {
          x = Math.max(0, Math.min(naturalW - w, Math.round(initialRegion.x + deltaX)))
          y = Math.max(0, Math.min(naturalH - h, Math.round(initialRegion.y + deltaY)))
          return { ...item, x, y }
        }

        if (action === 'resizing' && handle) {
          let left = x
          let top = y
          let right = x + w
          let bottom = y + h
          const minDim = 8

          if (handle.includes('w')) left = Math.min(right - minDim, Math.max(0, Math.round(initialRegion.x + deltaX)))
          if (handle.includes('e')) right = Math.max(left + minDim, Math.min(naturalW, Math.round(initialRegion.x + initialRegion.w + deltaX)))
          if (handle.includes('n')) top = Math.min(bottom - minDim, Math.max(0, Math.round(initialRegion.y + deltaY)))
          if (handle.includes('s')) bottom = Math.max(top + minDim, Math.min(naturalH, Math.round(initialRegion.y + initialRegion.h + deltaY)))

          return {
            ...item,
            x: left,
            y: top,
            w: right - left,
            h: bottom - top,
          }
        }
        return item
      }))
    }

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
      interactionRef.current.action = null
    }

    const onPointerCancel = () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
      interactionRef.current.action = null
    }

    window.addEventListener('pointermove', onPointerMove, { passive: false })
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
  }

  // Flatten and render full-resolution export canvas
  const renderFlattenedCanvas = useCallback(() => {
    if (!imgEl || !naturalW || !naturalH) return null

    const canvas = document.createElement('canvas')
    canvas.width = naturalW
    canvas.height = naturalH
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    // 1. Draw full original image
    ctx.drawImage(imgEl, 0, 0, naturalW, naturalH)

    // 2. Permanently apply each redaction box onto pixel buffer
    for (const r of regions) {
      const rx = Math.max(0, Math.min(naturalW - 1, r.x))
      const ry = Math.max(0, Math.min(naturalH - 1, r.y))
      const rw = Math.max(1, Math.min(naturalW - rx, r.w))
      const rh = Math.max(1, Math.min(naturalH - ry, r.h))

      if (r.mode === 'blackout') {
        ctx.fillStyle = r.color || '#000000'
        ctx.fillRect(rx, ry, rw, rh)
      } else if (r.mode === 'pixelate') {
        const blockSize = Math.max(4, r.pixelSize || 14)
        const tinyW = Math.max(1, Math.floor(rw / blockSize))
        const tinyH = Math.max(1, Math.floor(rh / blockSize))

        const tinyCanvas = document.createElement('canvas')
        tinyCanvas.width = tinyW
        tinyCanvas.height = tinyH
        const tinyCtx = tinyCanvas.getContext('2d')
        tinyCtx.imageSmoothingEnabled = false
        // Downscale slice
        tinyCtx.drawImage(canvas, rx, ry, rw, rh, 0, 0, tinyW, tinyH)

        // Upscale back with nearest neighbor to permanently destroy underlying subpixels
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(tinyCanvas, 0, 0, tinyW, tinyH, rx, ry, rw, rh)
        ctx.imageSmoothingEnabled = true
      } else if (r.mode === 'blur') {
        const rad = Math.max(4, r.blurRadius || 12)
        // Multi-pass downscale & box blur
        const smallCanvas = document.createElement('canvas')
        smallCanvas.width = Math.max(2, Math.floor(rw / rad))
        smallCanvas.height = Math.max(2, Math.floor(rh / rad))
        const smallCtx = smallCanvas.getContext('2d')
        smallCtx.imageSmoothingEnabled = true
        smallCtx.drawImage(canvas, rx, ry, rw, rh, 0, 0, smallCanvas.width, smallCanvas.height)

        ctx.save()
        ctx.filter = `blur(${Math.round(rad * 0.7)}px)`
        ctx.drawImage(smallCanvas, 0, 0, smallCanvas.width, smallCanvas.height, rx, ry, rw, rh)
        ctx.restore()
      }
    }

    return canvas
  }, [imgEl, naturalW, naturalH, regions])

  // Download flattened image
  const handleDownload = () => {
    const canvas = renderFlattenedCanvas()
    if (!canvas) return
    setIsProcessing(true)

    const mime = exportFormat === 'jpeg' ? 'image/jpeg' : 'image/png'
    const q = exportFormat === 'jpeg' ? Math.max(0.1, Math.min(1, exportQuality / 100)) : undefined

    canvas.toBlob((blob) => {
      setIsProcessing(false)
      if (!blob) {
        setErrorMsg('Failed to export flattened image.')
        return
      }
      const baseName = file?.name ? file.name.replace(/\.[^.]+$/, '') : 'redacted_image'
      const ext = exportFormat === 'jpeg' ? 'jpg' : 'png'
      saveFileWithFallback(blob, `${baseName}_redacted.${ext}`)
    }, mime, q)
  }

  // Compute display scaling for interactive handles
  const scale = useMemo(() => {
    if (!imageRef.current || !naturalW || !naturalH) return { sx: 1, sy: 1 }
    const rect = imageRef.current.getBoundingClientRect()
    return {
      sx: rect.width / naturalW,
      sy: rect.height / naturalH,
    }
  }, [naturalW, naturalH, regions])

  const resizeHandles = [
    { name: 'nw', cursor: 'nwse-resize', style: { top: -5, left: -5 } },
    { name: 'ne', cursor: 'nesw-resize', style: { top: -5, right: -5 } },
    { name: 'se', cursor: 'nwse-resize', style: { bottom: -5, right: -5 } },
    { name: 'sw', cursor: 'nesw-resize', style: { bottom: -5, left: -5 } },
  ]

  const content = (
    <div>
      {!imgEl ? (
          <div style={{ textAlign: 'center', padding: '48px 20px' }}>
            <div style={{
              width: 76, height: 76, borderRadius: 20, margin: '0 auto 18px',
              background: 'rgba(239,68,68,.08)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: '#ef4444',
              border: '1.5px dashed rgba(239,68,68,.3)'
            }}>
              <EyeOff size={36} color="#ef4444" />
            </div>
            <h3 style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 20, color: '#0d0d1a', marginBottom: 6 }}>
              Image Redactor
            </h3>
            <p style={{ fontSize: 13.5, color: '#777', maxWidth: 460, margin: '0 auto 20px', lineHeight: 1.6 }}>
              Censor passwords, names, sensitive details, and personal data. Permanently destroys underlying pixels using blackout boxes, pixelation, or blur.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <label className="btn btn-primary btn-lg" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <Upload size={16} />
                <span>Upload Image</span>
                <input type="file" accept="image/*" onChange={handleFileInput} style={{ display: 'none' }} />
              </label>
            </div>
            <p style={{ fontSize: 12, color: '#999', marginTop: 12 }}>
              Tip: You can also paste an image directly from your clipboard (<strong>Cmd+V</strong> or <strong>Ctrl+V</strong>).
            </p>
            {errorMsg && (
              <p style={{ color: '#ef4444', fontSize: 13, marginTop: 14 }}>{errorMsg}</p>
            )}
          </div>
        ) : (
          <Reveal>
            {/* Header & Undo Toolbar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h3 style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 18, color: '#0d0d1a', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <EyeOff size={18} color="#ef4444" /> Image Redactor
                </h3>
                <p style={{ fontSize: 12, color: '#888', margin: '4px 0 0' }}>
                  {regions.length} redaction area{regions.length !== 1 ? 's' : ''} applied · Click & drag on image to create
                </p>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={isDetecting}
                  onClick={detectAndRedactPII}
                  style={{ background: 'linear-gradient(135deg, #7c3aed, #4F8EF7)', color: '#fff', border: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  title="Auto-detect emails, credit cards, phones, and IDs using local AI vision">
                  {isDetecting ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />}
                  <span>{isDetecting ? 'Scanning PII…' : 'Auto-Redact PII'}</span>
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={history.length === 0}
                  onClick={handleUndo}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  title="Undo last change (Ctrl+Z)">
                  <Undo2 size={13} />
                  <span>Undo</span>
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={!selectedId}
                  onClick={handleDeleteSelected}
                  style={{ color: selectedId ? '#ef4444' : undefined, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  title="Delete currently selected region">
                  <Trash2 size={13} />
                  <span>Delete Selected</span>
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={regions.length === 0}
                  onClick={handleResetAll}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <RotateCcw size={13} />
                  <span>Clear All</span>
                </button>
                <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer', margin: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Upload size={13} />
                  <span>Change Image</span>
                  <input type="file" accept="image/*" onChange={handleFileInput} style={{ display: 'none' }} />
                </label>
              </div>
            </div>

            {detectStatus && (
              <div style={{
                padding: '8px 14px', borderRadius: 8, fontSize: 12.5, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8,
                background: detectStatus.type === 'success' ? 'rgba(34,197,94,.1)' : detectStatus.type === 'warning' ? 'rgba(239,68,68,.1)' : 'rgba(59,130,246,.1)',
                border: `1px solid ${detectStatus.type === 'success' ? 'rgba(34,197,94,.3)' : detectStatus.type === 'warning' ? 'rgba(239,68,68,.3)' : 'rgba(59,130,246,.3)'}`,
                color: detectStatus.type === 'success' ? '#15803d' : detectStatus.type === 'warning' ? '#b91c1c' : '#1d4ed8'
              }}>
                {detectStatus.type === 'success' && <CheckCircle2 size={14} />}
                {detectStatus.type === 'warning' && <AlertTriangle size={14} />}
                {detectStatus.type === 'info' && <Info size={14} />}
                <span>{detectStatus.text}</span>
              </div>
            )}

            {/* Redaction Style Controls */}
            <div style={{
              display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap',
              padding: 12, background: '#fafbff', borderRadius: 12,
              border: '1px solid rgba(79,142,247,.12)', marginBottom: 16
            }}>
              <div style={{ display: 'flex', gap: 6 }}>
                {REDACTION_MODES.map(m => {
                  const Icon = m.icon
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setActiveMode(m.id)}
                      className={`btn btn-sm ${activeMode === m.id ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ fontSize: 12, padding: '6px 14px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Icon size={13} />
                      <span>{m.label}</span>
                    </button>
                  )
                })}
              </div>

              {activeMode === 'blackout' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#555' }}>Color:</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {COLORS.map(c => (
                      <button
                        key={c.hex}
                        type="button"
                        onClick={() => setActiveColor(c.hex)}
                        title={c.label}
                        style={{
                          width: 24, height: 24, borderRadius: '50%', background: c.hex,
                          border: activeColor === c.hex ? '2.5px solid #4F8EF7' : '1px solid rgba(0,0,0,.15)',
                          cursor: 'pointer', transform: activeColor === c.hex ? 'scale(1.15)' : 'scale(1)',
                          transition: 'transform .15s'
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {activeMode === 'pixelate' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 180px' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#555' }}>Cell Size: {pixelSize}px</span>
                  <input
                    type="range"
                    min="6"
                    max="32"
                    value={pixelSize}
                    onChange={e => setPixelSize(+e.target.value)}
                    style={{ flex: 1 }}
                  />
                </div>
              )}

              {activeMode === 'blur' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 180px' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#555' }}>Blur Strength: {blurRadius}px</span>
                  <input
                    type="range"
                    min="4"
                    max="28"
                    value={blurRadius}
                    onChange={e => setBlurRadius(+e.target.value)}
                    style={{ flex: 1 }}
                  />
                </div>
              )}
            </div>

            {/* Interactive Image Viewport */}
            <div
              ref={containerRef}
              onPointerDown={handlePointerDownContainer}
              style={{
                position: 'relative',
                background: 'repeating-conic-gradient(#f0f0f4 0% 25%, #ffffff 0% 50%) 0 0/16px 16px',
                borderRadius: 14,
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 280,
                maxHeight: '68vh',
                border: '1px solid rgba(0,0,0,.08)',
                marginBottom: 18,
                userSelect: 'none',
                touchAction: 'none',
                cursor: 'crosshair',
              }}>
              <div style={{ position: 'relative', display: 'inline-block', lineHeight: 0 }}>
                <img
                  ref={imageRef}
                  src={imgUrl}
                  alt="Redaction source"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '68vh',
                    display: 'block',
                    objectFit: 'contain',
                    pointerEvents: 'none',
                  }}
                />

                {/* Rendered Redaction Overlays */}
                {regions.map(r => {
                  const left = r.x * scale.sx
                  const top = r.y * scale.sy
                  const width = Math.max(4, r.w * scale.sx)
                  const height = Math.max(4, r.h * scale.sy)
                  const isSelected = r.id === selectedId

                  return (
                    <div
                      key={r.id}
                      onPointerDown={(e) => handlePointerDownRegion(r, 'moving', null, e)}
                      style={{
                        position: 'absolute',
                        left,
                        top,
                        width,
                        height,
                        cursor: 'move',
                        outline: isSelected ? '2px solid #4F8EF7' : '1px dashed rgba(255,255,255,.6)',
                        boxShadow: isSelected ? '0 0 0 2px rgba(79,142,247,.3)' : 'none',
                        background: r.mode === 'blackout' ? (r.color || '#000000') : undefined,
                        backdropFilter: r.mode === 'blur' ? `blur(${r.blurRadius || 12}px)` : undefined,
                        WebkitBackdropFilter: r.mode === 'blur' ? `blur(${r.blurRadius || 12}px)` : undefined,
                        overflow: 'hidden',
                      }}>
                      {/* Pixelate visual pattern */}
                      {r.mode === 'pixelate' && (
                        <div style={{
                          position: 'absolute', inset: 0,
                          background: 'rgba(0,0,0,0.18)',
                          backgroundImage: 'radial-gradient(rgba(0,0,0,0.4) 15%, transparent 16%)',
                          backgroundSize: `${Math.max(4, Math.round((r.pixelSize || 14) * scale.sx))}px ${Math.max(4, Math.round((r.pixelSize || 14) * scale.sy))}px`,
                          backdropFilter: 'blur(3px)',
                          WebkitBackdropFilter: 'blur(3px)',
                        }} />
                      )}

                      {/* Resize Handles on selected */}
                      {isSelected && resizeHandles.map(h => (
                        <div
                          key={h.name}
                          onPointerDown={(e) => handlePointerDownRegion(r, 'resizing', h.name, e)}
                          style={{
                            position: 'absolute',
                            width: 12,
                            height: 12,
                            background: '#ffffff',
                            border: '2px solid #4F8EF7',
                            borderRadius: 3,
                            cursor: h.cursor,
                            touchAction: 'none',
                            zIndex: 10,
                            ...h.style,
                          }}
                        >
                          {/* Invisible touch hitbox expansion (36px) for mobile */}
                          <div style={{
                            position: 'absolute',
                            top: -12,
                            left: -12,
                            width: 36,
                            height: 36,
                            pointerEvents: 'auto',
                          }} />
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Export Settings & Download Button */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#555' }}>Output Format:</span>
                <select
                  className="fsel"
                  value={exportFormat}
                  onChange={e => setExportFormat(e.target.value)}
                  style={{ padding: '6px 10px', fontSize: 13, borderRadius: 8 }}>
                  <option value="png">PNG (Lossless, High Fidelity)</option>
                  <option value="jpeg">JPEG (Compressed)</option>
                </select>
              </div>

              {exportFormat === 'jpeg' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 180px' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#555' }}>Quality: {exportQuality}%</span>
                  <input
                    type="range"
                    min="20"
                    max="100"
                    value={exportQuality}
                    onChange={e => setExportQuality(+e.target.value)}
                    style={{ flex: 1 }}
                  />
                </div>
              )}
            </div>

            <button
              type="button"
              className="btn btn-primary btn-w btn-lg"
              disabled={isProcessing || regions.length === 0}
              onClick={handleDownload}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Download size={16} />
              <span>Download Permanently Redacted Image ({regions.length} region{regions.length !== 1 ? 's' : ''})</span>
            </button>
          </Reveal>
        )}
    </div>
  )

  return content
}
