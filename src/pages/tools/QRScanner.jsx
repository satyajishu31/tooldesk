import React, { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import jsQR from 'jsqr'
import { ToolCard, Reveal } from '../../components/ToolShell'
import { useCopy } from '../../hooks'

export default function QRScanner({ isEmbedded = false }) {
  const [activeTab, setActiveTab] = useState('camera') // 'camera' or 'upload'
  const [facingMode, setFacingMode] = useState('environment') // 'environment' (rear) or 'user' (front)
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [scannedResult, setScannedResult] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [scanningImage, setScanningImage] = useState(false)
  const [copied, copy] = useCopy()

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const animFrameRef = useRef(null)
  const fileInputRef = useRef(null)
  const scanCanvasRef = useRef(null)
  const lastScanTimeRef = useRef(0)
  const isStartingRef = useRef(false)
  const audioCtxRef = useRef(null)

  // Single persistent AudioContext to prevent exceeding hardware limits
  const playBeep = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
      }
      const ctx = audioCtxRef.current
      if (ctx.state === 'suspended') {
        ctx.resume()
      }
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(800, ctx.currentTime)
      osc.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.1)
    } catch {}
  }, [])

  useEffect(() => {
    return () => {
      if (audioCtxRef.current) {
        try { audioCtxRef.current.close() } catch {}
        audioCtxRef.current = null
      }
    }
  }, [])

  // Stop camera stream safely
  const stopCamera = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setCameraActive(false)
  }, [])

  // Start camera stream with re-entrancy lock
  const startCamera = useCallback(async (facing = facingMode) => {
    if (isStartingRef.current) return
    isStartingRef.current = true
    stopCamera()
    setCameraError('')
    setScannedResult(null)

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Camera access is not supported by your browser or environment. Please use image upload.')
      isStartingRef.current = false
      return
    }

    try {
      const constraints = {
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.setAttribute('playsinline', 'true') // iOS Safari compatibility
        videoRef.current.muted = true
        await videoRef.current.play()
        setCameraActive(true)
        scanCameraLoop()
      }
    } catch (err) {
      console.warn('Camera access error:', err)
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('Camera permission was denied. Please allow camera access in your browser settings or upload an image instead.')
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraError('No camera found on this device. Please upload an image or screenshot.')
      } else {
        setCameraError(`Unable to start camera: ${err.message || 'Unknown error'}`)
      }
      setCameraActive(false)
    } finally {
      isStartingRef.current = false
    }
  }, [facingMode, stopCamera])

  // Continuous scan loop for camera video frames
  const scanCameraLoop = useCallback(() => {
    if (!videoRef.current || videoRef.current.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(scanCameraLoop)
      return
    }

    const now = performance.now()
    if (now - lastScanTimeRef.current < 60) {
      animFrameRef.current = requestAnimationFrame(scanCameraLoop)
      return
    }
    lastScanTimeRef.current = now

    const video = videoRef.current
    if (!scanCanvasRef.current) {
      scanCanvasRef.current = document.createElement('canvas')
    }
    const canvas = scanCanvasRef.current
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    const vw = video.videoWidth || 640
    const vh = video.videoHeight || 480
    const maxDim = 640
    let targetW = vw
    let targetH = vh
    if (vw > maxDim || vh > maxDim) {
      if (vw > vh) {
        targetW = maxDim
        targetH = Math.round((vh * maxDim) / vw)
      } else {
        targetH = maxDim
        targetW = Math.round((vw * maxDim) / vh)
      }
    }

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW
      canvas.height = targetH
    }
    ctx.drawImage(video, 0, 0, targetW, targetH)

    try {
      const imageData = ctx.getImageData(0, 0, targetW, targetH)
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'attemptBoth',
      })

      if (code && code.data) {
        setScannedResult({
          data: code.data,
          timestamp: new Date().toLocaleTimeString(),
          source: 'camera',
        })
        playBeep()
        return
      }
    } catch {}

    animFrameRef.current = requestAnimationFrame(scanCameraLoop)
  }, [playBeep])

  // Scan single image bitmap
  const previewUrlRef = useRef(null)

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
        previewUrlRef.current = null
      }
    }
  }, [])

  const processImageFile = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) return
    setScanningImage(true)
    setCameraError('')
    setScannedResult(null)

    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }

    const objectUrl = URL.createObjectURL(file)
    previewUrlRef.current = objectUrl
    setImagePreview(objectUrl)

    const img = new Image()
    img.onload = () => {
      try {
        let w = img.naturalWidth || img.width
        let h = img.naturalHeight || img.height
        const maxDim = 1600
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w)
            w = maxDim
          } else {
            w = Math.round((w * maxDim) / h)
            h = maxDim
          }
        }

        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(img, 0, 0, w, h)

        const imageData = ctx.getImageData(0, 0, w, h)
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'attemptBoth',
        })

        if (code && code.data) {
          setScannedResult({
            data: code.data,
            timestamp: new Date().toLocaleTimeString(),
            source: file.name || 'image',
          })
        } else {
          setCameraError('No QR code detected in this image. Try an image with higher resolution or contrast.')
        }
      } catch (err) {
        setCameraError('Could not parse image data: ' + (err.message || 'Invalid or protected image'))
      } finally {
        setScanningImage(false)
      }
    }
    img.onerror = () => {
      setCameraError('Failed to load image for scanning.')
      setScanningImage(false)
    }
    img.src = objectUrl
  }, [])


  // Handle clipboard paste
  useEffect(() => {
    const handlePaste = (e) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            setActiveTab('upload')
            stopCamera()
            processImageFile(file)
            break
          }
        }
      }
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [processImageFile, stopCamera])

  // Cleanup camera on unmount or tab switch
  useEffect(() => {
    if (activeTab === 'camera') {
      startCamera(facingMode)
    } else {
      stopCamera()
    }
    return () => stopCamera()
  }, [activeTab, facingMode, startCamera, stopCamera])

  // Parse result type
  const parsedType = useCallback((text) => {
    if (!text) return 'text'
    const trimmed = text.trim()
    if (/^https?:\/\//i.test(trimmed)) return 'url'
    if (/^mailto:/i.test(trimmed)) return 'email'
    if (/^tel:/i.test(trimmed)) return 'phone'
    if (/^smsto:/i.test(trimmed)) return 'sms'
    if (/^WIFI:/i.test(trimmed)) return 'wifi'
    if (/^BEGIN:VCARD/i.test(trimmed)) return 'vcard'
    if (/^upi:\/\/pay/i.test(trimmed)) return 'upi'
    return 'text'
  }, [])

  const parsePayloadDetails = useCallback((text, type) => {
    if (!text) return null
    const trimmed = text.trim()
    try {
      if (type === 'url') {
        const u = new URL(trimmed)
        return [
          { label: 'Protocol', val: u.protocol },
          { label: 'Host', val: u.hostname },
          { label: 'Path', val: u.pathname || '/' },
          ...(u.search ? [{ label: 'Query Parameters', val: u.search }] : [])
        ]
      }
      if (type === 'wifi') {
        const ssid = trimmed.match(/S:([^;]+)/)?.[1] || '—'
        const sec = trimmed.match(/T:([^;]+)/)?.[1] || 'WPA'
        const pass = trimmed.match(/P:([^;]+)/)?.[1] || '(None)'
        const hidden = trimmed.match(/H:([^;]+)/)?.[1] || 'false'
        return [
          { label: 'SSID / Network', val: ssid },
          { label: 'Security', val: sec },
          { label: 'Password', val: pass },
          { label: 'Hidden Network', val: hidden === 'true' ? 'Yes' : 'No' }
        ]
      }
      if (type === 'upi') {
        const u = new URL(trimmed)
        return [
          { label: 'Payee VPA', val: u.searchParams.get('pa') || '—' },
          { label: 'Payee Name', val: u.searchParams.get('pn') || '—' },
          { label: 'Amount', val: u.searchParams.get('am') ? `${u.searchParams.get('am')} ${u.searchParams.get('cu') || 'INR'}` : 'Open Amount' },
          { label: 'Note / Remarks', val: u.searchParams.get('tn') || '—' }
        ]
      }
      if (type === 'vcard') {
        const fn = trimmed.match(/FN:([^\r\n]+)/i)?.[1] || '—'
        const tel = trimmed.match(/TEL[^\:]*:([^\r\n]+)/i)?.[1] || '—'
        const email = trimmed.match(/EMAIL[^\:]*:([^\r\n]+)/i)?.[1] || '—'
        const org = trimmed.match(/ORG:([^\r\n]+)/i)?.[1] || '—'
        return [
          { label: 'Full Name', val: fn },
          { label: 'Phone', val: tel },
          { label: 'Email', val: email },
          { label: 'Organization', val: org }
        ]
      }
      if (type === 'sms') {
        const parts = trimmed.replace(/^smsto:/i, '').split(':')
        return [
          { label: 'Recipient Phone', val: parts[0] || '—' },
          { label: 'Message Body', val: parts.slice(1).join(':') || '—' }
        ]
      }
      if (type === 'email') {
        const emailUrl = new URL(trimmed)
        return [
          { label: 'Recipient', val: emailUrl.pathname || '—' },
          { label: 'Subject', val: emailUrl.searchParams.get('subject') || '—' },
          { label: 'Body', val: emailUrl.searchParams.get('body') || '—' }
        ]
      }
    } catch {
      return null
    }
    return null
  }, [])

  const card = (
    <ToolCard>
        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 18, background: 'rgba(0,0,0,.04)', padding: 4, borderRadius: 12 }}>
          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'camera' ? 'btn-primary' : 'btn-outline'}`}
            style={{ flex: 1, padding: '9px 12px', fontSize: 13, fontWeight: 700 }}
            onClick={() => setActiveTab('camera')}
          >
            📷 Real-Time Camera
          </button>
          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'upload' ? 'btn-primary' : 'btn-outline'}`}
            style={{ flex: 1, padding: '9px 12px', fontSize: 13, fontWeight: 700 }}
            onClick={() => setActiveTab('upload')}
          >
            🖼️ Upload Image / Paste Screenshot
          </button>
        </div>

        {/* Error / Advisory Message */}
        {cameraError && (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 12,
              background: 'rgba(239,68,68,.08)',
              border: '1.5px solid rgba(239,68,68,.25)',
              color: '#ef4444',
              fontSize: 13,
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <span style={{ fontSize: 18 }}>⚠️</span>
            <div style={{ flex: 1 }}>{cameraError}</div>
          </div>
        )}

        {/* ── CAMERA MODE ── */}
        {activeTab === 'camera' && (
          <div>
            <div
              style={{
                position: 'relative',
                width: '100%',
                maxWidth: 480,
                margin: '0 auto',
                borderRadius: 16,
                overflow: 'hidden',
                background: '#0d0d1a',
                aspectRatio: '4/3',
                boxShadow: '0 8px 30px rgba(0,0,0,.15)',
              }}
            >
              <video
                ref={videoRef}
                playsInline
                muted
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: cameraActive ? 'block' : 'none',
                }}
              />

              {!cameraActive && !cameraError && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14 }}>
                  ⏳ Starting camera stream...
                </div>
              )}

              {/* Viewfinder Target Overlay */}
              {cameraActive && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    pointerEvents: 'none',
                  }}
                >
                  <div
                    style={{
                      width: '65%',
                      height: '65%',
                      border: '2px solid rgba(79,142,247,.8)',
                      borderRadius: 16,
                      boxShadow: '0 0 0 9999px rgba(0,0,0,.35)',
                      position: 'relative',
                    }}
                  >
                    {/* Pulsing Scan Line */}
                    <motion.div
                      animate={{ y: ['0%', '100%', '0%'] }}
                      transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                      style={{
                        height: 2,
                        background: 'linear-gradient(90deg, transparent, #4F8EF7, transparent)',
                        boxShadow: '0 0 8px #4F8EF7',
                        width: '100%',
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Camera Controls */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 14 }}>
              <button
                type="button"
                className="btn btn-outline"
                style={{ padding: '8px 16px', fontSize: 12.5 }}
                aria-label={`Switch Camera to ${facingMode === 'environment' ? 'Front' : 'Rear'}`}
                onClick={() => {
                  const nextMode = facingMode === 'environment' ? 'user' : 'environment'
                  setFacingMode(nextMode)
                }}
              >
                🔄 Switch Camera ({facingMode === 'environment' ? 'Rear' : 'Front'})
              </button>
              {scannedResult && (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ padding: '8px 16px', fontSize: 12.5 }}
                  aria-label="Scan Another Code"
                  onClick={() => {
                    setScannedResult(null)
                    scanCameraLoop()
                  }}
                >
                  ▶ Scan Another Code
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── UPLOAD / PASTE MODE ── */}
        {activeTab === 'upload' && (
          <div>
            <div
              className="upzone"
              style={{ padding: '36px 20px', borderRadius: 16, cursor: 'pointer', textAlign: 'center' }}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault()
                if (e.dataTransfer.files?.[0]) processImageFile(e.dataTransfer.files[0])
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 8 }}>🖼️</div>
              <div style={{ fontWeight: 600, fontSize: 14.5, color: '#1a1a2e' }}>
                Drop QR image, click to browse, or paste (Ctrl+V / ⌘V)
              </div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                Supports PNG, JPG, WebP, SVG, screenshots
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={e => {
                  if (e.target.files?.[0]) {
                    processImageFile(e.target.files[0])
                    e.target.value = ''
                  }
                }}
              />
            </div>

            {imagePreview && (
              <div style={{ marginTop: 16, textAlign: 'center' }}>
                <img
                  src={imagePreview}
                  alt="Scanned preview"
                  style={{ maxWidth: 220, maxHeight: 220, borderRadius: 12, border: '1px solid rgba(0,0,0,.1)' }}
                />
              </div>
            )}

            {scanningImage && (
              <div style={{ padding: 12, textAlign: 'center', color: '#666', fontSize: 13 }}>
                ⏳ Scanning image for QR code patterns...
              </div>
            )}
          </div>
        )}

        {/* ── DECODED RESULT SAFE DISPLAY CARD ── */}
        <AnimatePresence>
          {scannedResult && (
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              style={{
                marginTop: 24,
                padding: '18px 20px',
                borderRadius: 16,
                background: 'rgba(79,142,247,.05)',
                border: '1.5px solid rgba(79,142,247,.3)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 20 }}>✅</span>
                  <span style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 15, color: '#1a1a2e' }}>
                    Decoded {parsedType(scannedResult.data).toUpperCase()}
                  </span>
                </div>
                <span style={{ fontSize: 11, color: '#888' }}>
                  {scannedResult.timestamp}
                </span>
              </div>

              {/* Safe Content Preview */}
              <div
                style={{
                  background: '#ffffff',
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: '1px solid rgba(0,0,0,.08)',
                  fontFamily: 'monospace',
                  fontSize: 13,
                  color: '#1a1a2e',
                  wordBreak: 'break-all',
                  whiteSpace: 'pre-wrap',
                  maxHeight: 180,
                  overflowY: 'auto',
                  marginBottom: 14,
                }}
              >
                {scannedResult.data}
              </div>

              {/* Parsed Payload Inspector */}
              {(() => {
                const details = parsePayloadDetails(scannedResult.data, parsedType(scannedResult.data))
                if (!details || !details.length) return null
                return (
                  <div style={{
                    marginBottom: 14,
                    padding: '12px 14px',
                    borderRadius: 10,
                    background: '#ffffff',
                    border: '1px solid rgba(79,142,247,.2)',
                  }}>
                    <div style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#4f8ef7',
                      textTransform: 'uppercase',
                      letterSpacing: '.5px',
                      marginBottom: 8,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}>
                      <span>🔎</span> Payload Inspector Details
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                      {details.map((d, i) => (
                        <div key={i} style={{ fontSize: 12, background: '#f8fafc', padding: '6px 10px', borderRadius: 6 }}>
                          <span style={{ color: '#64748b', fontWeight: 600 }}>{d.label}: </span>
                          <span style={{ color: '#0f172a', fontWeight: 500, wordBreak: 'break-all' }}>{d.val}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => copy(scannedResult.data)}
                  style={{ padding: '8px 16px', fontSize: 13, fontWeight: 700 }}
                >
                  {copied ? '✓ Copied Raw Text' : '📋 Copy Decoded Text'}
                </button>

                {/* Safe Link Navigation Warning & Button */}
                {parsedType(scannedResult.data) === 'url' && (
                  <a
                    href={scannedResult.data.trim()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary"
                    style={{ padding: '8px 16px', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}
                  >
                    🔗 Open Link in New Tab ↗
                  </a>
                )}

              </div>

              {parsedType(scannedResult.data) === 'url' && (
                <div style={{ fontSize: 11, color: '#666', marginTop: 10 }}>
                  🔒 Safety Check: Links are never automatically opened without your explicit confirmation.
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </ToolCard>
  )

  return card
}

