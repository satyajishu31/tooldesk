import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Crop, Upload, Download, RotateCcw } from 'lucide-react'
import { Reveal } from '../../components/ToolShell'
import { saveFileWithFallback } from '../../utils/fileSaver'

const RATIO_PRESETS = [
  { id: 'free', label: 'Freeform', ratio: null },
  { id: '1:1', label: '1:1 Square', ratio: 1 },
  { id: '4:3', label: '4:3 Standard', ratio: 4 / 3 },
  { id: '3:2', label: '3:2 Classic', ratio: 3 / 2 },
  { id: '16:9', label: '16:9 Widescreen', ratio: 16 / 9 },
  { id: '9:16', label: '9:16 Story / Reel', ratio: 9 / 16 },
  { id: '2:3', label: '2:3 Portrait', ratio: 2 / 3 },
  { id: '3:4', label: '3:4 Portrait', ratio: 3 / 4 },
  { id: 'custom', label: 'Custom Ratio', ratio: null },
]

export default function ManualCropStudio({ embeddedImg = null, onEmbeddedExport = null, isEmbedded = false }) {
  const [file, setFile] = useState(null)
  const [originalUrl, setOriginalUrl] = useState('')
  const [imgEl, setImgEl] = useState(null)
  const [naturalW, setNaturalW] = useState(0)
  const [naturalH, setNaturalH] = useState(0)

  // Crop box in natural source pixel coordinates
  const [crop, setCrop] = useState({ x: 0, y: 0, w: 0, h: 0 })
  const [selectedRatio, setSelectedRatio] = useState('free')
  const [customRatioW, setCustomRatioW] = useState(16)
  const [customRatioH, setCustomRatioH] = useState(9)
  const [exportFormat, setExportFormat] = useState('png')
  const [exportQuality, setExportQuality] = useState(92)
  const [croppedPreviewUrl, setCroppedPreviewUrl] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const containerRef = useRef(null)
  const imageRef = useRef(null)
  const originalUrlRef = useRef(null)
  const interactionRef = useRef({
    mode: null, // 'move', 'nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'
    startX: 0,
    startY: 0,
    initialCrop: { x: 0, y: 0, w: 0, h: 0 },
  })

  const selectedRatioRef = useRef('free')
  selectedRatioRef.current = selectedRatio
  const customRatioWRef = useRef(16)
  customRatioWRef.current = customRatioW
  const customRatioHRef = useRef(9)
  customRatioHRef.current = customRatioH

  // Clean up object URLs
  useEffect(() => {
    return () => {
      if (originalUrlRef.current && !embeddedImg) {
        try { URL.revokeObjectURL(originalUrlRef.current) } catch {}
      }
      if (croppedPreviewUrl) {
        try { URL.revokeObjectURL(croppedPreviewUrl) } catch {}
      }
    }
  }, [croppedPreviewUrl, embeddedImg])

  const loadSource = useCallback((source, filename = 'image.png') => {
    setErrorMsg('')
    if (originalUrlRef.current && !embeddedImg && typeof originalUrlRef.current === 'string' && originalUrlRef.current.startsWith('blob:')) {
      try { URL.revokeObjectURL(originalUrlRef.current) } catch {}
    }
    const isFile = source instanceof File || source instanceof Blob
    const url = isFile ? URL.createObjectURL(source) : source
    originalUrlRef.current = url
    setOriginalUrl(url)
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

      // Respect the user's selected aspect ratio if already configured
      const ratioId = selectedRatioRef.current
      let targetRatio = null
      if (ratioId === 'custom') {
        const rw = Number(customRatioWRef.current) || 1
        const rh = Number(customRatioHRef.current) || 1
        targetRatio = rw / rh
      } else if (ratioId && ratioId !== 'free') {
        const found = RATIO_PRESETS.find(p => p.id === ratioId)
        targetRatio = found ? found.ratio : null
      }

      let initialW = Math.round(nw * 0.8)
      let initialH = Math.round(nh * 0.8)

      if (targetRatio && targetRatio > 0) {
        initialW = Math.round(nw * 0.8)
        initialH = Math.round(initialW / targetRatio)
        if (initialH > nh * 0.85) {
          initialH = Math.round(nh * 0.85)
          initialW = Math.round(initialH * targetRatio)
        }
        if (initialW > nw) {
          initialW = nw
          initialH = Math.round(initialW / targetRatio)
        }
      }

      const initialX = Math.max(0, Math.round((nw - initialW) / 2))
      const initialY = Math.max(0, Math.round((nh - initialH) / 2))
      setCrop({ x: initialX, y: initialY, w: initialW, h: initialH })
    }
    img.onerror = () => {
      setErrorMsg('Failed to load image. File may be corrupted or in an unsupported format.')
    }
    img.src = url
  }, [])

  useEffect(() => {
    if (embeddedImg) {
      loadSource(embeddedImg)
    }
  }, [embeddedImg, loadSource])

  const handleFileInput = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.type.startsWith('image/')) {
      setErrorMsg('Please select a valid image file.')
      return
    }
    if (f.size > 50 * 1024 * 1024) {
      setErrorMsg('Image exceeds 50MB limit. Please choose a smaller image.')
      return
    }
    loadSource(f, f.name)
  }

  // Active target aspect ratio
  const activeRatio = useMemo(() => {
    if (selectedRatio === 'free') return null
    if (selectedRatio === 'custom') {
      const rw = Number(customRatioW) || 1
      const rh = Number(customRatioH) || 1
      return rw / rh
    }
    const found = RATIO_PRESETS.find(p => p.id === selectedRatio)
    return found ? found.ratio : null
  }, [selectedRatio, customRatioW, customRatioH])

  // Apply ratio constraint
  const applyRatioConstraint = useCallback((ratioId, customW = customRatioW, customH = customRatioH) => {
    setSelectedRatio(ratioId)
    if (!naturalW || !naturalH) return

    let targetRatio = null
    if (ratioId === 'custom') {
      targetRatio = (Number(customW) || 1) / (Number(customH) || 1)
    } else {
      const match = RATIO_PRESETS.find(p => p.id === ratioId)
      targetRatio = match ? match.ratio : null
    }

    if (!targetRatio) return

    setCrop(prev => {
      let newW = prev.w
      let newH = Math.round(newW / targetRatio)

      if (newH > naturalH) {
        newH = naturalH
        newW = Math.round(newH * targetRatio)
      }
      if (newW > naturalW) {
        newW = naturalW
        newH = Math.round(newW / targetRatio)
      }

      const newX = Math.max(0, Math.min(naturalW - newW, prev.x))
      const newY = Math.max(0, Math.min(naturalH - newH, prev.y))
      return { x: newX, y: newY, w: newW, h: newH }
    })
  }, [naturalW, naturalH, customRatioW, customRatioH])

  // Coordinate display and scaling
  const displayRect = useMemo(() => {
    if (!imageRef.current || !naturalW || !naturalH) {
      return { left: 0, top: 0, width: 0, height: 0, scaleX: 1, scaleY: 1 }
    }
    const rect = imageRef.current.getBoundingClientRect()
    const scaleX = rect.width / naturalW
    const scaleY = rect.height / naturalH
    return {
      left: crop.x * scaleX,
      top: crop.y * scaleY,
      width: Math.max(8, crop.w * scaleX),
      height: Math.max(8, crop.h * scaleY),
      scaleX,
      scaleY,
    }
  }, [crop, naturalW, naturalH])

  // Pointer drag/resize handler
  const handlePointerDown = (mode, e) => {
    e.preventDefault()
    e.stopPropagation()
    e.target.setPointerCapture?.(e.pointerId)
    interactionRef.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      initialCrop: { ...crop },
      pointerId: e.pointerId,
    }

    const onPointerMove = (moveEvent) => {
      const { mode: currentMode, startX, startY, initialCrop } = interactionRef.current
      if (!currentMode || !naturalW || !naturalH) return
      const imgDom = imageRef.current
      if (!imgDom) return

      const rect = imgDom.getBoundingClientRect()
      const scaleX = naturalW / rect.width
      const scaleY = naturalH / rect.height

      const deltaX = (moveEvent.clientX - startX) * scaleX
      const deltaY = (moveEvent.clientY - startY) * scaleY

      setCrop(() => {
        let { x, y, w, h } = initialCrop
        const minSize = 10

        if (currentMode === 'move') {
          x = Math.max(0, Math.min(naturalW - w, Math.round(initialCrop.x + deltaX)))
          y = Math.max(0, Math.min(naturalH - h, Math.round(initialCrop.y + deltaY)))
          return { x, y, w, h }
        }

        let newLeft = x
        let newTop = y
        let newRight = x + w
        let newBottom = y + h

        if (currentMode.includes('w')) {
          newLeft = Math.min(newRight - minSize, Math.max(0, Math.round(initialCrop.x + deltaX)))
        }
        if (currentMode.includes('e')) {
          newRight = Math.max(newLeft + minSize, Math.min(naturalW, Math.round(initialCrop.x + initialCrop.w + deltaX)))
        }
        if (currentMode.includes('n')) {
          newTop = Math.min(newBottom - minSize, Math.max(0, Math.round(initialCrop.y + deltaY)))
        }
        if (currentMode.includes('s')) {
          newBottom = Math.max(newTop + minSize, Math.min(naturalH, Math.round(initialCrop.y + initialCrop.h + deltaY)))
        }

        let finalW = newRight - newLeft
        let finalH = newBottom - newTop

        if (activeRatio) {
          if (currentMode === 'e' || currentMode === 'w') {
            finalH = Math.round(finalW / activeRatio)
            if (newTop + finalH > naturalH) {
              finalH = naturalH - newTop
              finalW = Math.round(finalH * activeRatio)
            }
          } else {
            finalW = Math.round(finalH * activeRatio)
            if (newLeft + finalW > naturalW) {
              finalW = naturalW - newLeft
              finalH = Math.round(finalW / activeRatio)
            }
          }
        }

        return {
          x: Math.max(0, Math.min(naturalW - finalW, newLeft)),
          y: Math.max(0, Math.min(naturalH - finalH, newTop)),
          w: Math.max(minSize, Math.min(naturalW, finalW)),
          h: Math.max(minSize, Math.min(naturalH, finalH)),
        }
      })
    }

    const onPointerUp = (upEvent) => {
      try { upEvent.target.releasePointerCapture?.(upEvent.pointerId) } catch {}
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
      interactionRef.current.mode = null
    }

    const onPointerCancel = (cancelEvent) => {
      try { cancelEvent.target.releasePointerCapture?.(cancelEvent.pointerId) } catch {}
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
      interactionRef.current.mode = null
    }

    window.addEventListener('pointermove', onPointerMove, { passive: false })
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
  }

  // Exact numerical changes
  const updateCropField = (field, val) => {
    const num = Math.max(0, Math.round(Number(val) || 0))
    setCrop(prev => {
      const next = { ...prev, [field]: num }
      if (field === 'x') next.x = Math.min(num, naturalW - next.w)
      if (field === 'y') next.y = Math.min(num, naturalH - next.h)
      if (field === 'w') {
        next.w = Math.max(10, Math.min(num, naturalW - next.x))
        if (activeRatio) next.h = Math.round(next.w / activeRatio)
      }
      if (field === 'h') {
        next.h = Math.max(10, Math.min(num, naturalH - next.y))
        if (activeRatio) next.w = Math.round(next.h * activeRatio)
      }
      return next
    })
  }

  // Reset to full image
  const handleReset = () => {
    if (!naturalW || !naturalH) return
    setCrop({ x: 0, y: 0, w: naturalW, h: naturalH })
    setSelectedRatio('free')
  }

  // Generate cropped output canvas
  const renderCroppedCanvas = useCallback(() => {
    if (!imgEl || !naturalW || !naturalH) return null
    const sx = Math.max(0, Math.min(naturalW - 1, crop.x))
    const sy = Math.max(0, Math.min(naturalH - 1, crop.y))
    const sw = Math.max(1, Math.min(naturalW - sx, crop.w))
    const sh = Math.max(1, Math.min(naturalH - sy, crop.h))

    const offscreen = document.createElement('canvas')
    offscreen.width = sw
    offscreen.height = sh
    const ctx = offscreen.getContext('2d')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(imgEl, sx, sy, sw, sh, 0, 0, sw, sh)
    return offscreen
  }, [imgEl, naturalW, naturalH, crop])

  // Download cropped file
  const handleDownload = () => {
    const canvas = renderCroppedCanvas()
    if (!canvas) return
    setIsProcessing(true)

    const mime = exportFormat === 'jpeg' ? 'image/jpeg' : exportFormat === 'webp' ? 'image/webp' : 'image/png'
    const q = exportFormat === 'png' ? undefined : Math.max(0.1, Math.min(1, exportQuality / 100))

    canvas.toBlob((blob) => {
      setIsProcessing(false)
      canvas.width = 1
      canvas.height = 1
      if (!blob) {
        setErrorMsg('Failed to create cropped image blob.')
        return
      }
      const origBase = file?.name ? file.name.replace(/\.[^.]+$/, '') : 'cropped-image'
      const ext = exportFormat === 'jpeg' ? 'jpg' : exportFormat
      const outName = `${origBase}_crop_${crop.w}x${crop.h}.${ext}`

      if (onEmbeddedExport) {
        onEmbeddedExport(blob, outName)
      } else {
        saveFileWithFallback(blob, outName)
      }
    }, mime, q)
  }

  // Apply crop in place
  const handleApplyCropInPlace = () => {
    const canvas = renderCroppedCanvas()
    if (!canvas) return
    const mime = 'image/png'
    canvas.toBlob((blob) => {
      canvas.width = 1
      canvas.height = 1
      if (!blob) return
      loadSource(blob, (file?.name || 'cropped') + '.png')
    }, mime)
  }

  const handles = [
    { id: 'nw', cursor: 'nwse-resize', style: { top: -6, left: -6 } },
    { id: 'n',  cursor: 'ns-resize',   style: { top: -6, left: 'calc(50% - 6px)' } },
    { id: 'ne', cursor: 'nesw-resize', style: { top: -6, right: -6 } },
    { id: 'e',  cursor: 'ew-resize',   style: { top: 'calc(50% - 6px)', right: -6 } },
    { id: 'se', cursor: 'nwse-resize', style: { bottom: -6, right: -6 } },
    { id: 's',  cursor: 'ns-resize',   style: { bottom: -6, left: 'calc(50% - 6px)' } },
    { id: 'sw', cursor: 'nesw-resize', style: { bottom: -6, left: -6 } },
    { id: 'w',  cursor: 'ew-resize',   style: { top: 'calc(50% - 6px)', left: -6 } },
  ]

  const content = (
    <div>
      {!imgEl ? (
          <div style={{ textAlign: 'center', padding: '48px 20px' }}>
            <div style={{
              width: 76, height: 76, borderRadius: 20, margin: '0 auto 18px',
              background: 'rgba(79,142,247,.08)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: '#4F8EF7',
              border: '1.5px dashed rgba(79,142,247,.3)'
            }}>
              <Crop size={36} color="#4F8EF7" />
            </div>
            <h3 style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 20, color: '#0d0d1a', marginBottom: 6 }}>
              Upload Image to Crop
            </h3>
            <p style={{ fontSize: 13.5, color: '#777', maxWidth: 460, margin: '0 auto 20px', lineHeight: 1.6 }}>
              True manual crop with interactive 8-handle box, freeform precision, standard ratios, and lossless full-resolution export.
            </p>
            <label className="btn btn-primary btn-lg" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <Upload size={16} />
              <span>Select Image</span>
              <input type="file" accept="image/*" onChange={handleFileInput} style={{ display: 'none' }} />
            </label>
            {errorMsg && (
              <p style={{ color: '#ef4444', fontSize: 13, marginTop: 14 }}>{errorMsg}</p>
            )}
          </div>
        ) : (
          <Reveal>
            {/* Top Toolbar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h3 style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 18, color: '#0d0d1a', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Crop size={18} color="#4F8EF7" /> Manual Crop Studio
                </h3>
                <p style={{ fontSize: 12, color: '#888', margin: '4px 0 0' }}>
                  Original: <strong>{naturalW} × {naturalH} px</strong> · Selection: <strong style={{ color: '#4F8EF7' }}>{crop.w} × {crop.h} px</strong>
                </p>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={handleReset} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <RotateCcw size={13} /> Full Reset
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={handleApplyCropInPlace} title="Crop and continue editing this selection" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Crop size={13} /> Crop In-Place
                </button>
                <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer', margin: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Upload size={13} />
                  <span>Change Image</span>
                  <input type="file" accept="image/*" onChange={handleFileInput} style={{ display: 'none' }} />
                </label>
              </div>
            </div>

            {/* Ratio Selector Buttons */}
            <div className="fgrp" style={{ marginBottom: 16 }}>
              <label className="lbl">Aspect Ratio</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: 4, background: 'rgba(0,0,0,0.03)', borderRadius: 14 }}>
                {RATIO_PRESETS.map(r => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => applyRatioConstraint(r.id)}
                    style={{
                      fontSize: 12, padding: '7px 14px', borderRadius: 11, cursor: 'pointer',
                      border: selectedRatio === r.id ? '1.5px solid rgba(79,142,247,0.35)' : '1.5px solid transparent',
                      background: selectedRatio === r.id ? 'rgba(79,142,247,0.12)' : 'transparent',
                      color: selectedRatio === r.id ? '#3B7BE8' : '#64748b',
                      fontWeight: 700, transition: 'all 0.16s ease',
                      boxShadow: selectedRatio === r.id ? '0 2px 8px rgba(79,142,247,0.15)' : 'none'
                    }}>
                    {r.label}
                  </button>
                ))}
              </div>

              {selectedRatio === 'custom' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                  <span style={{ fontSize: 12, color: '#666' }}>Width:</span>
                  <input
                    type="number"
                    min="1"
                    className="txt"
                    style={{ width: 70, padding: '5px 8px', fontSize: 13 }}
                    value={customRatioW}
                    onChange={(e) => {
                      const v = Math.max(1, +e.target.value)
                      setCustomRatioW(v)
                      applyRatioConstraint('custom', v, customRatioH)
                    }}
                  />
                  <span style={{ fontSize: 12, color: '#666' }}>Height:</span>
                  <input
                    type="number"
                    min="1"
                    className="txt"
                    style={{ width: 70, padding: '5px 8px', fontSize: 13 }}
                    value={customRatioH}
                    onChange={(e) => {
                      const v = Math.max(1, +e.target.value)
                      setCustomRatioH(v)
                      applyRatioConstraint('custom', customRatioW, v)
                    }}
                  />
                </div>
              )}
            </div>

            {/* Interactive Crop Viewport */}
            <div
              ref={containerRef}
              style={{
                position: 'relative',
                background: 'repeating-conic-gradient(#f0f0f4 0% 25%, #ffffff 0% 50%) 0 0/16px 16px',
                borderRadius: 14,
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 280,
                maxHeight: '65vh',
                border: '1px solid rgba(0,0,0,.08)',
                marginBottom: 18,
                userSelect: 'none',
                touchAction: 'none',
              }}>
              <div style={{ position: 'relative', display: 'inline-block', lineHeight: 0 }}>
                <img
                  ref={imageRef}
                  src={originalUrl}
                  alt="Source for cropping"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '65vh',
                    display: 'block',
                    objectFit: 'contain',
                    pointerEvents: 'none',
                  }}
                />

                {/* Darkened overlay outside crop box */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    pointerEvents: 'none',
                    background: 'rgba(0, 0, 0, 0.45)',
                    clipPath: `polygon(
                      0% 0%, 100% 0%, 100% 100%, 0% 100%,
                      0% 0%,
                      ${displayRect.left}px ${displayRect.top}px,
                      ${displayRect.left}px ${displayRect.top + displayRect.height}px,
                      ${displayRect.left + displayRect.width}px ${displayRect.top + displayRect.height}px,
                      ${displayRect.left + displayRect.width}px ${displayRect.top}px,
                      ${displayRect.left}px ${displayRect.top}px
                    )`,
                  }}
                />

                {/* Interactive Crop Box */}
                <div
                  onPointerDown={(e) => handlePointerDown('move', e)}
                  style={{
                    position: 'absolute',
                    left: displayRect.left,
                    top: displayRect.top,
                    width: displayRect.width,
                    height: displayRect.height,
                    border: '2px solid #4F8EF7',
                    boxShadow: '0 0 0 1px rgba(255,255,255,0.8), 0 4px 16px rgba(0,0,0,0.25)',
                    cursor: 'move',
                    touchAction: 'none',
                  }}>
                  {/* Rule of Thirds Grid lines */}
                  <div style={{ position: 'absolute', left: '33.333%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.4)', pointerEvents: 'none' }} />
                  <div style={{ position: 'absolute', left: '66.666%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.4)', pointerEvents: 'none' }} />
                  <div style={{ position: 'absolute', top: '33.333%', left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.4)', pointerEvents: 'none' }} />
                  <div style={{ position: 'absolute', top: '66.666%', left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.4)', pointerEvents: 'none' }} />

                  {/* 8 Resize Handles */}
                  {handles.map(h => (
                    <div
                      key={h.id}
                      onPointerDown={(e) => handlePointerDown(h.id, e)}
                      style={{
                        position: 'absolute',
                        width: 14,
                        height: 14,
                        borderRadius: 4,
                        background: '#ffffff',
                        border: '2.5px solid #4F8EF7',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                        cursor: h.cursor,
                        touchAction: 'none',
                        zIndex: 10,
                        ...h.style,
                      }}
                    >
                      {/* Touch target expansion for mobile (40px hit area) */}
                      <div style={{
                        position: 'absolute',
                        top: -13,
                        left: -13,
                        width: 40,
                        height: 40,
                        pointerEvents: 'auto',
                      }} />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Exact Pixel Coordinates Form Inputs */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))',
              gap: 10, padding: 14, background: '#fafbff', borderRadius: 12,
              border: '1px solid rgba(79,142,247,.12)', marginBottom: 18, width: '100%', boxSizing: 'border-box'
            }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#666', display: 'block', marginBottom: 4 }}>
                  X Position (px)
                </label>
                <input
                  type="number"
                  min="0"
                  max={naturalW}
                  className="txt"
                  value={crop.x}
                  onChange={e => updateCropField('x', e.target.value)}
                  style={{ width: '100%', padding: '6px 10px', fontSize: 13 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#666', display: 'block', marginBottom: 4 }}>
                  Y Position (px)
                </label>
                <input
                  type="number"
                  min="0"
                  max={naturalH}
                  className="txt"
                  value={crop.y}
                  onChange={e => updateCropField('y', e.target.value)}
                  style={{ width: '100%', padding: '6px 10px', fontSize: 13 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#666', display: 'block', marginBottom: 4 }}>
                  Crop Width (px)
                </label>
                <input
                  type="number"
                  min="10"
                  max={naturalW}
                  className="txt"
                  value={crop.w}
                  onChange={e => updateCropField('w', e.target.value)}
                  style={{ width: '100%', padding: '6px 10px', fontSize: 13 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#666', display: 'block', marginBottom: 4 }}>
                  Crop Height (px)
                </label>
                <input
                  type="number"
                  min="10"
                  max={naturalH}
                  className="txt"
                  value={crop.h}
                  onChange={e => updateCropField('h', e.target.value)}
                  style={{ width: '100%', padding: '6px 10px', fontSize: 13 }}
                />
              </div>
            </div>

            {/* Export Settings & Download Button */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#555' }}>Format:</span>
                <select
                  className="fsel"
                  value={exportFormat}
                  onChange={e => setExportFormat(e.target.value)}
                  style={{ padding: '6px 10px', fontSize: 13, borderRadius: 8 }}>
                  <option value="png">PNG (Lossless & Alpha)</option>
                  <option value="jpeg">JPEG (Compressed)</option>
                  <option value="webp">WebP (Modern Web)</option>
                </select>
              </div>

              {exportFormat !== 'png' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 180px' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#555' }}>Quality: {exportQuality}%</span>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={exportQuality}
                    onChange={e => setExportQuality(+e.target.value)}
                    className="rs-thumb"
                    style={{
                      flex: 1, accentColor: '#4F8EF7',
                      background: `linear-gradient(to right,#4F8EF7 0%,#4F8EF7 ${Math.max(0,Math.min(100,((exportQuality)-(10))/((100)-(10))*100))}%,#e2e4ef ${Math.max(0,Math.min(100,((exportQuality)-(10))/((100)-(10))*100))}%,#e2e4ef 100%)`,
                      WebkitAppearance: 'none', appearance: 'none', height: 5, borderRadius: 3, outline: 'none', cursor: 'pointer'
                    }}
                  />
                </div>
              )}
            </div>

            <button
              type="button"
              className="btn btn-primary btn-w btn-lg"
              disabled={isProcessing || !crop.w || !crop.h}
              onClick={handleDownload}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12 }}>
              <Download size={16} />
              <span>Download Cropped Image ({crop.w} × {crop.h} px)</span>
            </button>
          </Reveal>
        )}
    </div>
  )

  return content
}
