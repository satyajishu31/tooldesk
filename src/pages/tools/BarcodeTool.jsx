import React, { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import JsBarcode from 'jsbarcode'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { Barcode, ScanLine, Camera, UploadCloud, RefreshCw, Copy, Check, ExternalLink, Download, AlertTriangle, Palette, CheckCircle2, Play } from 'lucide-react'
import { ToolCard, Reveal } from '../../components/ToolShell'
import { useCopy } from '../../hooks'
import { saveFileWithFallback } from '../../utils/fileSaver'

const SUPPORTED_FORMATS = [
  { id: 'CODE128', label: 'Code 128 (Standard)', desc: 'Full ASCII alphanumeric', defaultVal: 'TOOLDESK-128' },
  { id: 'EAN13', label: 'EAN-13 (Retail Product)', desc: '12 or 13 numeric digits', defaultVal: '590123412345' },
  { id: 'UPC', label: 'UPC-A (North America)', desc: '11 or 12 numeric digits', defaultVal: '01234567890' },
  { id: 'EAN8', label: 'EAN-8 (Small Packages)', desc: '7 or 8 numeric digits', defaultVal: '9638507' },
  { id: 'CODE39', label: 'Code 39', desc: 'A-Z, 0-9, symbols', defaultVal: 'CODE39-TEST' },
  { id: 'ITF14', label: 'ITF-14 (Cartons)', desc: '13 or 14 numeric digits', defaultVal: '1001234567890' },
  { id: 'MSI', label: 'MSI Plessey', desc: 'Numeric warehouse coding', defaultVal: '1234567' },
  { id: 'pharmacode', label: 'Pharmacode', desc: 'Pharmaceutical packaging (3-131070)', defaultVal: '12345' },
  { id: 'codabar', label: 'Codabar (FedEx / Blood)', desc: '0-9 with A-D delimiters', defaultVal: 'A12345678B' },
]

// Validate format-specific inputs and compute check digits
function validateAndFormatInput(rawInput, format) {
  const clean = (rawInput || '').trim()
  if (!clean) return { valid: false, error: 'Please enter a barcode value.' }

  if (format === 'CODE128') {
    if (!/^[\x00-\x7F]+$/.test(clean)) {
      return { valid: false, error: 'Code 128 supports standard ASCII characters only (no non-ASCII unicode or emojis).' }
    }
  }

  if (format === 'EAN13') {
    if (!/^\d{12,13}$/.test(clean)) {
      return { valid: false, error: 'EAN-13 requires exactly 12 or 13 numeric digits.' }
    }
    let sum = 0
    for (let i = 0; i < 12; i++) {
      const digit = parseInt(clean[i], 10)
      sum += i % 2 === 0 ? digit : digit * 3
    }
    const checkDigit = (10 - (sum % 10)) % 10
    if (clean.length === 12) {
      return { valid: true, value: clean + checkDigit }
    } else {
      const expected = parseInt(clean[12], 10)
      if (expected !== checkDigit) {
        return { valid: false, error: `Invalid EAN-13 check digit. Expected ${checkDigit}, got ${expected}.` }
      }
    }
  }

  if (format === 'UPC') {
    if (!/^\d{11,12}$/.test(clean)) {
      return { valid: false, error: 'UPC-A requires exactly 11 or 12 numeric digits.' }
    }
    let sum = 0
    for (let i = 0; i < 11; i++) {
      const digit = parseInt(clean[i], 10)
      sum += i % 2 === 0 ? digit * 3 : digit
    }
    const checkDigit = (10 - (sum % 10)) % 10
    if (clean.length === 11) {
      return { valid: true, value: clean + checkDigit }
    } else {
      const expected = parseInt(clean[11], 10)
      if (expected !== checkDigit) {
        return { valid: false, error: `Invalid UPC-A check digit. Expected ${checkDigit}, got ${expected}.` }
      }
    }
  }

  if (format === 'EAN8') {
    if (!/^\d{7,8}$/.test(clean)) {
      return { valid: false, error: 'EAN-8 requires exactly 7 or 8 numeric digits.' }
    }
    let sum = 0
    for (let i = 0; i < 7; i++) {
      const digit = parseInt(clean[i], 10)
      sum += i % 2 === 0 ? digit * 3 : digit
    }
    const checkDigit = (10 - (sum % 10)) % 10
    if (clean.length === 7) {
      return { valid: true, value: clean + checkDigit }
    } else {
      const expected = parseInt(clean[7], 10)
      if (expected !== checkDigit) {
        return { valid: false, error: `Invalid EAN-8 check digit. Expected ${checkDigit}, got ${expected}.` }
      }
    }
  }

  if (format === 'ITF14') {
    if (!/^\d{13,14}$/.test(clean)) {
      return { valid: false, error: 'ITF-14 requires exactly 13 or 14 numeric digits.' }
    }
    let sum = 0
    for (let i = 0; i < 13; i++) {
      const d = parseInt(clean[i], 10)
      sum += i % 2 === 0 ? d * 3 : d
    }
    const checkDigit = (10 - (sum % 10)) % 10
    if (clean.length === 13) {
      return { valid: true, value: clean + checkDigit }
    } else {
      const expected = parseInt(clean[13], 10)
      if (expected !== checkDigit) {
        return { valid: false, error: `Invalid ITF-14 check digit. Expected ${checkDigit}, got ${expected}.` }
      }
    }
  }

  if (format === 'MSI') {
    if (!/^\d+$/.test(clean)) {
      return { valid: false, error: 'MSI Plessey requires numeric digits only.' }
    }
  }

  if (format === 'pharmacode') {
    if (!/^\d+$/.test(clean)) {
      return { valid: false, error: 'Pharmacode must be a numeric integer between 3 and 131070.' }
    }
    const num = parseInt(clean, 10)
    if (isNaN(num) || num < 3 || num > 131070) {
      return { valid: false, error: 'Pharmacode must be a numeric integer between 3 and 131070.' }
    }
  }

  if (format === 'codabar') {
    if (!/^[A-Da-d0-9\-$:/.+]+$/.test(clean)) {
      return { valid: false, error: 'Codabar only supports digits 0-9, symbols - $ : / . + and delimiters A-D.' }
    }
    if (!/^[A-Da-d].*[A-Da-d]$/.test(clean)) {
      return { valid: true, value: `A${clean}B` }
    }
  }

  if (format === 'CODE39') {
    if (!/^[0-9A-Z\-.$/+% ]+$/.test(clean.toUpperCase())) {
      return { valid: false, error: 'Code 39 only supports uppercase letters, digits, and - . $ / + % space.' }
    }
    return { valid: true, value: clean.toUpperCase() }
  }

  return { valid: true, value: clean }
}

export default function BarcodeTool({ isEmbedded = false }) {
  const [activeTab, setActiveTab] = useState('generate') // 'generate' or 'scan'

  // Generator State
  const [format, setFormat] = useState('CODE128')
  const [inputVal, setInputVal] = useState('TOOLDESK-128')
  const [barWidth, setBarWidth] = useState(2)
  const [barHeight, setBarHeight] = useState(80)
  const [displayValue, setDisplayValue] = useState(true)
  const [fontSize, setFontSize] = useState(16)
  const [margin, setMargin] = useState(10)
  const [lineColor, setLineColor] = useState('#000000')
  const [bgColor, setBgColor] = useState('#ffffff')
  const [genError, setGenError] = useState('')
  const [previewDataUrl, setPreviewDataUrl] = useState('')

  // Scanner State
  const [scanMode, setScanMode] = useState('camera') // 'camera' or 'upload'
  const [facingMode, setFacingMode] = useState('environment')
  const [isScanning, setIsScanning] = useState(false)
  const [scanError, setScanError] = useState('')
  const [scannedBarcode, setScannedBarcode] = useState(null)
  const [copied, copy] = useCopy()

  const canvasRef = useRef(null)
  const videoRef = useRef(null)
  const codeReaderRef = useRef(null)
  const scanControlsRef = useRef(null)
  const fileInputRef = useRef(null)
  const isStartingRef = useRef(false)

  // Generate barcode rendering
  const renderBarcode = useCallback(() => {
    const check = validateAndFormatInput(inputVal, format)
    if (!check.valid) {
      setGenError(check.error)
      setPreviewDataUrl('')
      return
    }

    setGenError('')

    try {
      const offscreen = document.createElement('canvas')
      JsBarcode(offscreen, check.value, {
        format: format,
        width: Number(barWidth) || 2,
        height: Number(barHeight) || 80,
        displayValue: Boolean(displayValue),
        fontSize: Number(fontSize) || 16,
        font: 'DM Sans',
        margin: Number(margin) || 10,
        lineColor: lineColor || '#000000',
        background: bgColor || '#ffffff',
      })

      setPreviewDataUrl(offscreen.toDataURL('image/png'))
    } catch (err) {
      console.warn('JsBarcode rendering error:', err)
      setGenError(err?.message || 'Failed to render barcode with current options.')
      setPreviewDataUrl('')
    }
  }, [inputVal, format, barWidth, barHeight, displayValue, fontSize, margin, lineColor, bgColor])

  useEffect(() => {
    if (activeTab === 'generate') {
      renderBarcode()
    }
  }, [activeTab, renderBarcode])

  // Download PNG
  const downloadPng = () => {
    if (!previewDataUrl) return
    const safeName = inputVal.trim().replace(/[^a-zA-Z0-9_-]/g, '_')
    saveFileWithFallback(previewDataUrl, `barcode-${format.toLowerCase()}-${safeName}.png`, 'image/png')
  }

  // Download SVG
  const downloadSvg = () => {
    const check = validateAndFormatInput(inputVal, format)
    if (!check.valid) return

    const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    try {
      JsBarcode(svgElement, check.value, {
        format: format,
        width: Number(barWidth) || 2,
        height: Number(barHeight) || 80,
        displayValue: Boolean(displayValue),
        fontSize: Number(fontSize) || 16,
        font: 'DM Sans',
        margin: Number(margin) || 10,
        lineColor: lineColor || '#000000',
        background: bgColor || '#ffffff',
      })
      const serializer = new XMLSerializer()
      const svgString = serializer.serializeToString(svgElement)
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
      const safeName = inputVal.trim().replace(/[^a-zA-Z0-9_-]/g, '_')
      saveFileWithFallback(blob, `barcode-${format.toLowerCase()}-${safeName}.svg`, 'image/svg+xml')
    } catch (e) {
      console.error('SVG export error:', e)
    }
  }

  // Stop camera scanner
  const stopScanner = useCallback(() => {
    if (scanControlsRef.current) {
      try {
        scanControlsRef.current.stop()
      } catch {}
      scanControlsRef.current = null
    }
    if (codeReaderRef.current) {
      try {
        codeReaderRef.current.reset()
      } catch {}
    }
    if (videoRef.current && videoRef.current.srcObject) {
      try {
        const stream = videoRef.current.srcObject
        if (stream.getTracks) {
          stream.getTracks().forEach(track => track.stop())
        }
      } catch {}
      videoRef.current.srcObject = null
    }
    setIsScanning(false)
  }, [])

  // Start camera scanner using @zxing/browser
  const startScanner = useCallback(async (facing = facingMode) => {
    if (isStartingRef.current) return
    isStartingRef.current = true
    stopScanner()
    setScanError('')
    setScannedBarcode(null)

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setScanError('Camera is not supported on this browser/platform. Please use image upload.')
      isStartingRef.current = false
      return
    }

    try {
      if (!codeReaderRef.current) {
        codeReaderRef.current = new BrowserMultiFormatReader()
      }

      setIsScanning(true)
      const constraints = {
        video: { facingMode: { ideal: facing }, width: { ideal: 1280 } },
      }

      const controls = await codeReaderRef.current.decodeFromConstraints(
        constraints,
        videoRef.current,
        (result, err) => {
          if (result) {
            setScannedBarcode({
              text: result.getText(),
              format: result.getBarcodeFormat() ? String(result.getBarcodeFormat()) : '1D/2D Barcode',
              timestamp: new Date().toLocaleTimeString(),
            })
            // Stop scanning and turn off camera after successful detection
            stopScanner()
          }
        }
      )
      scanControlsRef.current = controls
    } catch (err) {
      console.warn('Barcode scanner start error:', err)
      setIsScanning(false)
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setScanError('Camera permission was denied. Please allow camera access in browser settings.')
      } else {
        setScanError(`Camera initialization failed: ${err.message || 'Unknown error'}`)
      }
    } finally {
      isStartingRef.current = false
    }
  }, [facingMode, stopScanner])

  // Decode barcode from image file
  const decodeImageFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return
    setScanError('')
    setScannedBarcode(null)

    const reader = new FileReader()
    reader.onload = async (e) => {
      const img = new Image()
      img.onload = async () => {
        try {
          if (!codeReaderRef.current) codeReaderRef.current = new BrowserMultiFormatReader()
          const result = await codeReaderRef.current.decodeFromImageElement(img)
          if (result) {
            setScannedBarcode({
              text: result.getText(),
              format: result.getBarcodeFormat() ? String(result.getBarcodeFormat()) : 'Barcode',
              timestamp: new Date().toLocaleTimeString(),
            })
          }
        } catch (err) {
          console.warn('Image decode error:', err)
          setScanError('No standard barcode detected in this image. Ensure the barcode is sharp, unblurred, and well-lit.')
        }
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  }

  // Handle clipboard paste
  useEffect(() => {
    const onPaste = (e) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            setActiveTab('scan')
            setScanMode('upload')
            stopScanner()
            decodeImageFile(file)
            break
          }
        }
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [stopScanner])

  // Lifecycle for scanner
  useEffect(() => {
    if (activeTab === 'scan' && scanMode === 'camera') {
      startScanner(facingMode)
    } else {
      stopScanner()
    }
    return () => stopScanner()
  }, [activeTab, scanMode, facingMode, startScanner, stopScanner])

  const card = (
    <ToolCard>
        {/* Main Tab Switcher */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, background: 'rgba(0,0,0,.04)', padding: 4, borderRadius: 12 }}>
          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'generate' ? 'btn-primary' : 'btn-outline'}`}
            style={{ flex: 1, padding: '10px 14px', fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
            onClick={() => setActiveTab('generate')}
          >
            <Barcode size={15} /> Barcode Generator
          </button>
          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'scan' ? 'btn-primary' : 'btn-outline'}`}
            style={{ flex: 1, padding: '10px 14px', fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
            onClick={() => setActiveTab('scan')}
          >
            <ScanLine size={15} /> Barcode Scanner
          </button>
        </div>

        {/* ══════════════════════════════════════════════════════
           1. BARCODE GENERATOR PANEL
           ══════════════════════════════════════════════════════ */}
        {activeTab === 'generate' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24, alignItems: 'start' }}>
            {/* Left: Input & Customization */}
            <div>
              {/* Format Selector */}
              <div className="fgrp">
                <label className="lbl">Barcode Symbology Format</label>
                <select
                  className="inp sel"
                  value={format}
                  onChange={e => {
                    const newFmt = e.target.value
                    setFormat(newFmt)
                    const fmtObj = SUPPORTED_FORMATS.find(f => f.id === newFmt)
                    if (fmtObj && fmtObj.defaultVal) {
                      setInputVal(fmtObj.defaultVal)
                    }
                  }}
                >
                  {SUPPORTED_FORMATS.map(f => (
                    <option key={f.id} value={f.id}>{f.label} — {f.desc}</option>
                  ))}
                </select>
              </div>

              {/* Data Input */}
              <div className="fgrp">
                <label className="lbl">Barcode Value / Payload</label>
                <input
                  type="text"
                  className="inp"
                  value={inputVal}
                  onChange={e => setInputVal(e.target.value)}
                  placeholder="Enter barcode characters..."
                />
              </div>

              {genError && (
                <div style={{ padding: '10px 12px', background: 'rgba(239,68,68,.08)', border: '1.5px solid rgba(239,68,68,.25)', borderRadius: 10, color: '#ef4444', fontSize: 12, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertTriangle size={15} style={{ flexShrink: 0 }} /> {genError}
                </div>
              )}

              {/* Customization Options */}
              <div style={{ background: 'rgba(139,92,246,.04)', border: '1px solid rgba(139,92,246,.15)', borderRadius: 14, padding: '16px 18px', marginTop: 16 }}>
                <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 13, color: '#1a1a2e', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Palette size={15} color="#8b5cf6" /> Dimensions & Appearance
                </div>

                <div className="tool-grid-2-compact" style={{ marginBottom: 12 }}>
                  <div>
                    <label className="lbl">Bar Width ({barWidth}px)</label>
                    <input
                      type="range" min={1} max={4} step={1} value={barWidth}
                      onChange={e => setBarWidth(+e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label className="lbl">Height ({barHeight}px)</label>
                    <input
                      type="range" min={30} max={150} step={5} value={barHeight}
                      onChange={e => setBarHeight(+e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>

                <div className="tool-grid-2-compact" style={{ marginBottom: 12 }}>
                  <div>
                    <label className="lbl">Margin ({margin}px)</label>
                    <input
                      type="range" min={0} max={30} step={2} value={margin}
                      onChange={e => setMargin(+e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label className="lbl">Font Size ({fontSize}px)</label>
                    <input
                      type="range" min={10} max={24} step={1} value={fontSize}
                      onChange={e => setFontSize(+e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={displayValue}
                      onChange={e => setDisplayValue(e.target.checked)}
                    />
                    <span>Show Human-Readable Text</span>
                  </label>
                </div>

                <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                  <div>
                    <label className="lbl">Bar Color</label>
                    <input type="color" value={lineColor} onChange={e => setLineColor(e.target.value)} style={{ width: 40, height: 32, borderRadius: 6, border: '1px solid #ccc', cursor: 'pointer' }} />
                  </div>
                  <div>
                    <label className="lbl">Background</label>
                    <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} style={{ width: 40, height: 32, borderRadius: 6, border: '1px solid #ccc', cursor: 'pointer' }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Live Preview & Export */}
            <div>
              <div style={{ background: '#f8f9fc', border: '1.5px solid rgba(0,0,0,.08)', borderRadius: 16, padding: '24px 20px', textAlign: 'center', minHeight: 220, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                {previewDataUrl ? (
                  <img
                    src={previewDataUrl}
                    alt={`Barcode ${format} ${inputVal}`}
                    style={{ maxWidth: '100%', height: 'auto', display: 'block', margin: '0 auto', borderRadius: 8, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}
                  />
                ) : (
                  <div style={{ color: '#888', fontSize: 13 }}>
                    Barcode preview will appear here
                  </div>
                )}
              </div>

              {previewDataUrl && (
                <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ flex: 1, padding: '12px', fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
                    onClick={downloadPng}
                  >
                    <Download size={14} /> Download PNG
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ flex: 1, padding: '12px', fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
                    onClick={downloadSvg}
                  >
                    <Download size={14} /> Download SVG
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
           2. BARCODE SCANNER PANEL
           ══════════════════════════════════════════════════════ */}
        {activeTab === 'scan' && (
          <div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
              <button
                type="button"
                className={`btn btn-sm ${scanMode === 'camera' ? 'btn-primary' : 'btn-outline'}`}
                style={{ padding: '7px 14px', fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                onClick={() => setScanMode('camera')}
              >
                <Camera size={14} /> Live Camera
              </button>
              <button
                type="button"
                className={`btn btn-sm ${scanMode === 'upload' ? 'btn-primary' : 'btn-outline'}`}
                style={{ padding: '7px 14px', fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                onClick={() => setScanMode('upload')}
              >
                <UploadCloud size={14} /> Upload / Paste Image
              </button>
            </div>

            {scanError && (
              <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(239,68,68,.08)', border: '1.5px solid rgba(239,68,68,.25)', color: '#ef4444', fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={15} style={{ flexShrink: 0 }} /> {scanError}
              </div>
            )}

            {scanMode === 'camera' && (
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
                  }}
                >
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  {/* Aim target line */}
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
                    <div style={{ width: '80%', height: 2, background: 'red', boxShadow: '0 0 8px red' }} />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 14 }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ padding: '8px 16px', fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    onClick={() => {
                      const next = facingMode === 'environment' ? 'user' : 'environment'
                      setFacingMode(next)
                    }}
                  >
                    <RefreshCw size={13} /> Switch Camera ({facingMode === 'environment' ? 'Rear' : 'Front'})
                  </button>
                  {scannedBarcode && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ padding: '8px 16px', fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      onClick={() => {
                        setScannedBarcode(null)
                        startScanner(facingMode)
                      }}
                    >
                      <Play size={13} /> Scan Next Barcode
                    </button>
                  )}
                </div>
              </div>
            )}

            {scanMode === 'upload' && (
              <div
                className="upzone"
                style={{ padding: '36px 20px', borderRadius: 16, cursor: 'pointer', textAlign: 'center' }}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault()
                  if (e.dataTransfer.files?.[0]) decodeImageFile(e.dataTransfer.files[0])
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                  <Barcode size={38} color="#8b5cf6" />
                </div>
                <div style={{ fontWeight: 600, fontSize: 14.5, color: '#1a1a2e' }}>
                  Drop Barcode image, click to browse, or paste (Ctrl+V)
                </div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                  Supports 1D barcodes (Code 128, EAN, UPC, Code 39, ITF) and 2D barcodes
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={e => {
                    if (e.target.files?.[0]) {
                      decodeImageFile(e.target.files[0])
                      e.target.value = ''
                    }
                  }}
                />
              </div>
            )}

            {/* Decoded Result Safe Display */}
            <AnimatePresence>
              {scannedBarcode && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  style={{
                    marginTop: 20,
                    padding: '18px 20px',
                    borderRadius: 16,
                    background: 'rgba(139,92,246,.06)',
                    border: '1.5px solid rgba(139,92,246,.3)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <CheckCircle2 size={18} color="#22c55e" />
                      <strong style={{ fontFamily: 'Syne,sans-serif', fontSize: 15, color: '#1a1a2e' }}>
                        Decoded Barcode
                      </strong>
                    </div>
                    <span style={{ fontSize: 11, color: '#888' }}>{scannedBarcode.timestamp}</span>
                  </div>

                  <div style={{ background: '#fff', padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(0,0,0,.08)', fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: '#1a1a2e', marginBottom: 14, wordBreak: 'break-all' }}>
                    {scannedBarcode.text}
                  </div>

                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => copy(scannedBarcode.text)}
                      style={{ padding: '8px 16px', fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                      {copied ? 'Copied Value' : 'Copy Value'}
                    </button>
                    <a
                      href={`https://www.google.com/search?q=${encodeURIComponent(scannedBarcode.text)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-outline"
                      style={{ padding: '8px 16px', fontSize: 13, fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      Search Product on Google <ExternalLink size={13} />
                    </a>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </ToolCard>
  )

  return card
}

