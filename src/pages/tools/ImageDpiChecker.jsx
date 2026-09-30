import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ScanSearch, Upload, Copy, Check, X } from 'lucide-react'
import { Reveal } from '../../components/ToolShell'
import { useCopy } from '../../hooks'
import { parseBinaryImageMetadata } from '../../utils/imageMetadata'

function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b)
}

function getAspectRatioString(w, h) {
  if (!w || !h) return '—'
  const d = gcd(w, h)
  const rw = w / d
  const rh = h / d
  // If ratio numbers are huge, show decimal approximation
  if (rw > 30 || rh > 30) {
    return `${(w / h).toFixed(2)}:1`
  }
  return `${rw}:${rh}`
}

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + ' MB'
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return bytes + ' B'
}

function formatOrientation(ori) {
  switch (ori) {
    case 1: return 'Normal (0°)'
    case 3: return 'Rotated 180°'
    case 6: return 'Rotated 90° CW'
    case 8: return 'Rotated 270° CW'
    case 2: return 'Flipped Horizontal'
    case 4: return 'Flipped Vertical'
    default: return 'Normal / Unspecified'
  }
}

export default function ImageDpiChecker({ isEmbedded = false }) {
  const [file, setFile] = useState(null)
  const [imgUrl, setImgUrl] = useState('')
  const [meta, setMeta] = useState(null)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [copied, copy] = useCopy()

  useEffect(() => {
    return () => {
      if (imgUrl) URL.revokeObjectURL(imgUrl)
    }
  }, [imgUrl])

  const processImage = useCallback(async (f) => {
    if (!f) return
    setErrorMsg('')
    setLoading(true)

    if (imgUrl) URL.revokeObjectURL(imgUrl)
    const url = URL.createObjectURL(f)
    setFile(f)
    setImgUrl(url)

    try {
      // 1. Read binary metadata
      const ab = await f.arrayBuffer()
      const binaryMeta = parseBinaryImageMetadata(ab)

      // 2. Read natural pixel dimensions from Image element
      const img = new Image()
      img.onload = () => {
        const w = img.naturalWidth || img.width
        const h = img.naturalHeight || img.height
        const megapixels = ((w * h) / 1000000).toFixed(2)
        const aspect = getAspectRatioString(w, h)

        // 3. Detect alpha channel / transparency
        let hasTransparency = false
        if (binaryMeta.colorType?.includes('Alpha')) {
          hasTransparency = true
        } else {
          try {
            const canvas = document.createElement('canvas')
            const sampleW = Math.min(200, w)
            const sampleH = Math.min(200, h)
            canvas.width = sampleW
            canvas.height = sampleH
            const ctx = canvas.getContext('2d')
            ctx.drawImage(img, 0, 0, sampleW, sampleH)
            const imgData = ctx.getImageData(0, 0, sampleW, sampleH).data
            for (let i = 3; i < imgData.length; i += 4) {
              if (imgData[i] < 255) {
                hasTransparency = true
                break
              }
            }
            canvas.width = 1
            canvas.height = 1
          } catch {}
        }

        setMeta({
          filename: f.name,
          fileSize: f.size,
          width: w,
          height: h,
          megapixels,
          aspectRatio: aspect,
          hasTransparency,
          ...binaryMeta,
        })
        setLoading(false)
      }
      img.onerror = () => {
        setErrorMsg('Failed to load image for visual analysis.')
        setLoading(false)
      }
      img.src = url
    } catch (err) {
      console.error('Image analysis error:', err)
      setErrorMsg(`Analysis failed: ${err.message}`)
      setLoading(false)
    }
  }, [imgUrl])

  const handleFileInput = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.type.startsWith('image/')) {
      setErrorMsg('Please select a valid image file.')
      return
    }
    processImage(f)
  }

  const handleClear = () => {
    if (imgUrl) URL.revokeObjectURL(imgUrl)
    setFile(null)
    setImgUrl('')
    setMeta(null)
    setErrorMsg('')
  }

  // Calculate print sizes in inches and cm
  const calcPrint = (dpiTarget) => {
    if (!meta) return { wIn: '0', hIn: '0', wCm: '0', hCm: '0' }
    const wIn = (meta.width / dpiTarget).toFixed(2)
    const hIn = (meta.height / dpiTarget).toFixed(2)
    const wCm = ((meta.width / dpiTarget) * 2.54).toFixed(2)
    const hCm = ((meta.height / dpiTarget) * 2.54).toFixed(2)
    return { wIn, hIn, wCm, hCm }
  }

  const p300 = calcPrint(300)
  const p150 = calcPrint(150)
  const p96  = calcPrint(96)

  const copyReport = () => {
    if (!meta) return
    const report = `Image Resolution & DPI Report:
File: ${meta.filename} (${formatBytes(meta.fileSize)})
Dimensions: ${meta.width} × ${meta.height} px
Megapixels: ${meta.megapixels} MP
Aspect Ratio: ${meta.aspectRatio}
Format: ${meta.verifiedFormat} (${meta.mimeType})
Transparency: ${meta.hasTransparency ? 'Yes (Alpha Channel)' : 'No (Opaque)'}
EXIF Orientation: ${formatOrientation(meta.orientation)}
Embedded DPI: ${meta.hasEmbeddedDpi ? `${meta.dpiX} × ${meta.dpiY} DPI` : 'No DPI metadata embedded'}

Print Dimensions:
• 300 DPI (High Quality Photo): ${p300.wIn}" × ${p300.hIn}" (${p300.wCm} × ${p300.hCm} cm)
• 150 DPI (Magazine / Flyer): ${p150.wIn}" × ${p150.hIn}" (${p150.wCm} × ${p150.hCm} cm)
• 96 DPI (Standard Display): ${p96.wIn}" × ${p96.hIn}" (${p96.wCm} × ${p96.hCm} cm)
Generated via ToolDesk Image DPI Analyzer`
    copy(report)
  }

  const content = (
    <div>
      {!meta ? (
          <div style={{ textAlign: 'center', padding: '48px 20px' }}>
            <div style={{
              width: 76, height: 76, borderRadius: 20, margin: '0 auto 18px',
              background: 'rgba(38,198,218,.08)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: '#26C6DA',
              border: '1.5px dashed rgba(38,198,218,.3)'
            }}>
              <ScanSearch size={36} color="#26C6DA" />
            </div>
            <h3 style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 20, color: '#0d0d1a', marginBottom: 6 }}>
              Image DPI & Print Resolution Analyzer
            </h3>
            <p style={{ fontSize: 13.5, color: '#777', maxWidth: 460, margin: '0 auto 20px', lineHeight: 1.6 }}>
              Inspect genuine binary metadata (PNG pHYs, JPEG JFIF / EXIF) to detect authentic embedded DPI without guessing or fabricating values.
            </p>
            <label className="btn btn-primary btn-lg" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <Upload size={16} />
              <span>Select Image to Analyze</span>
              <input type="file" accept="image/*" onChange={handleFileInput} style={{ display: 'none' }} />
            </label>
            {errorMsg && (
              <p style={{ color: '#ef4444', fontSize: 13, marginTop: 14 }}>{errorMsg}</p>
            )}
          </div>
        ) : (
          <Reveal>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h3 style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 18, color: '#0d0d1a', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ScanSearch size={18} color="#26C6DA" /> Resolution & DPI Analysis
                </h3>
                <p style={{ fontSize: 12, color: '#888', margin: '4px 0 0' }}>
                  {meta.filename} · {formatBytes(meta.fileSize)}
                </p>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={copyReport} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  <span>{copied ? 'Report Copied' : 'Copy Report'}</span>
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={handleClear} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <X size={13} />
                  <span>Clear</span>
                </button>
                <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer', margin: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Upload size={13} />
                  <span>Analyze Another</span>
                  <input type="file" accept="image/*" onChange={handleFileInput} style={{ display: 'none' }} />
                </label>
              </div>
            </div>

            {/* Main Stats Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 12, marginBottom: 20 }}>
              {/* 1. Dimensions */}
              <div style={{ padding: 14, background: '#fafbff', borderRadius: 12, border: '1px solid rgba(79,142,247,.15)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                  Dimensions
                </div>
                <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 18, color: '#0d0d1a', marginTop: 4 }}>
                  {meta.width} × {meta.height}
                </div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{meta.aspectRatio} aspect ratio</div>
              </div>

              {/* 2. Embedded DPI */}
              <div style={{ padding: 14, background: '#fafbff', borderRadius: 12, border: '1px solid rgba(79,142,247,.15)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                  Embedded DPI / PPI
                </div>
                <div style={{
                  fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 18,
                  color: meta.hasEmbeddedDpi ? '#22c55e' : '#f59e0b', marginTop: 4
                }}>
                  {meta.hasEmbeddedDpi ? `${meta.dpiX} DPI` : 'No DPI metadata'}
                </div>
                <div style={{ fontSize: 11.5, color: '#888', marginTop: 2 }}>
                  {meta.hasEmbeddedDpi ? 'Authentic file header tag' : 'No physical DPI embedded'}
                </div>
              </div>

              {/* 3. Megapixels & File Size */}
              <div style={{ padding: 14, background: '#fafbff', borderRadius: 12, border: '1px solid rgba(79,142,247,.15)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                  Megapixels & Size
                </div>
                <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 18, color: '#0d0d1a', marginTop: 4 }}>
                  {meta.megapixels} MP
                </div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{formatBytes(meta.fileSize)}</div>
              </div>

              {/* 4. Format & MIME */}
              <div style={{ padding: 14, background: '#fafbff', borderRadius: 12, border: '1px solid rgba(79,142,247,.15)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                  Format & MIME
                </div>
                <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 18, color: '#0d0d1a', marginTop: 4 }}>
                  {meta.verifiedFormat}
                </div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{meta.mimeType}</div>
              </div>

              {/* 5. Alpha Transparency */}
              <div style={{ padding: 14, background: '#fafbff', borderRadius: 12, border: '1px solid rgba(79,142,247,.15)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                  Transparency
                </div>
                <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 18, color: '#0d0d1a', marginTop: 4 }}>
                  {meta.hasTransparency ? 'Alpha Channel' : 'Opaque'}
                </div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                  {meta.hasTransparency ? 'Transparent background' : 'Solid pixels (No alpha)'}
                </div>
              </div>

              {/* 6. EXIF Orientation */}
              <div style={{ padding: 14, background: '#fafbff', borderRadius: 12, border: '1px solid rgba(79,142,247,.15)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                  EXIF Orientation
                </div>
                <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 18, color: '#0d0d1a', marginTop: 4 }}>
                  {formatOrientation(meta.orientation)}
                </div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                  {meta.orientation ? `Tag: ${meta.orientation}` : 'Default orientation'}
                </div>
              </div>
            </div>

            {/* Projected Print Sizes at Standard Resolutions */}
            <h4 style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 15, color: '#0d0d1a', marginBottom: 12 }}>
              📐 Projected Physical Print Dimensions
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14, marginBottom: 20 }}>
              {/* 300 DPI */}
              <div style={{ padding: 16, background: '#fff', borderRadius: 14, border: '1.5px solid rgba(34,197,94,.25)', boxShadow: '0 2px 10px rgba(34,197,94,.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 14, color: '#15803d' }}>
                    300 DPI (Photo Quality)
                  </span>
                  <span style={{ fontSize: 10, background: 'rgba(34,197,94,.12)', color: '#15803d', fontWeight: 700, padding: '2px 8px', borderRadius: 999 }}>
                    Fine Art
                  </span>
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#0d0d1a' }}>
                  {p300.wIn}" × {p300.hIn}"
                </div>
                <div style={{ fontSize: 12.5, color: '#666', marginTop: 4 }}>
                  {p300.wCm} × {p300.hCm} cm
                </div>
              </div>

              {/* 150 DPI */}
              <div style={{ padding: 16, background: '#fff', borderRadius: 14, border: '1.5px solid rgba(79,142,247,.25)', boxShadow: '0 2px 10px rgba(79,142,247,.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 14, color: '#1d4ed8' }}>
                    150 DPI (Magazine / Flyer)
                  </span>
                  <span style={{ fontSize: 10, background: 'rgba(79,142,247,.12)', color: '#1d4ed8', fontWeight: 700, padding: '2px 8px', borderRadius: 999 }}>
                    Commercial
                  </span>
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#0d0d1a' }}>
                  {p150.wIn}" × {p150.hIn}"
                </div>
                <div style={{ fontSize: 12.5, color: '#666', marginTop: 4 }}>
                  {p150.wCm} × {p150.hCm} cm
                </div>
              </div>

              {/* 96 DPI */}
              <div style={{ padding: 16, background: '#fff', borderRadius: 14, border: '1.5px solid rgba(245,158,11,.25)', boxShadow: '0 2px 10px rgba(245,158,11,.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 14, color: '#b45309' }}>
                    96 DPI (Web Display)
                  </span>
                  <span style={{ fontSize: 10, background: 'rgba(245,158,11,.12)', color: '#b45309', fontWeight: 700, padding: '2px 8px', borderRadius: 999 }}>
                    Screen
                  </span>
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#0d0d1a' }}>
                  {p96.wIn}" × {p96.hIn}"
                </div>
                <div style={{ fontSize: 12.5, color: '#666', marginTop: 4 }}>
                  {p96.wCm} × {p96.hCm} cm
                </div>
              </div>
            </div>

            {/* Thumbnail Preview */}
            <div style={{
              background: 'repeating-conic-gradient(#f0f0f4 0% 25%, #ffffff 0% 50%) 0 0/14px 14px',
              borderRadius: 14, padding: 14, textAlign: 'center', border: '1px solid rgba(0,0,0,.08)'
            }}>
              <img
                src={imgUrl}
                alt="Analyzed preview"
                style={{
                  maxWidth: '100%', maxHeight: 260, objectFit: 'contain',
                  borderRadius: 8, boxShadow: '0 2px 10px rgba(0,0,0,.08)'
                }}
              />
            </div>
          </Reveal>
        )}
    </div>
  )

  return content
}
