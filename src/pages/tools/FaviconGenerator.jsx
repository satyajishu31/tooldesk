import React, { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ToolShell, { ToolCard } from '../../components/ToolShell'
import { TOOLS } from '../../constants'
import { saveFileWithFallback } from '../../utils/fileSaver'
import { safeFetchJSON } from '../../utils/safeFetch'
import { addToHistory } from '../../utils/history'

const tool = TOOLS.find(t => t.id === 'favicon')

const SIZES      = [128, 64, 32, 16]
const BG_PRESETS = ['#4F8EF7','#9C6FDE','#F06292','#FF9800','#4CAF50','#26C6DA','#E91E63','#FF5722','#0d0d1a','#ffffff']
const FG_PRESETS = ['#FFFFFF','#0d0d1a','#4F8EF7','#FFD700','#FF5252','#22c55e']
const EMOJI_LIST = ['🚀','💎','⚡','🔥','🎯','🧰','🌐','🔐','🎨','💡','⚙️','🌟','🦁','🐬','🦋','🍀']
const FONTS      = ['serif','sans-serif','monospace','cursive','fantasy']

/* ── Draw favicon to canvas ── */
function drawFavicon({ canvas, mode, text, bg, fg, font, bold, radius, uploadedImg, fit, bgGradient, bgColor2, gradAngle, shadowOn }) {
  if (!canvas) return
  const sz  = 256 // work at 256px internally for quality
  canvas.width  = sz
  canvas.height = sz
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, sz, sz)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  // Rounded rect clip path
  const r = Math.min(sz / 2, Math.max(0, (radius / 16) * (sz / 2)))
  ctx.beginPath()
  ctx.moveTo(r, 0)
  ctx.lineTo(sz - r, 0); ctx.quadraticCurveTo(sz, 0, sz, r)
  ctx.lineTo(sz, sz - r); ctx.quadraticCurveTo(sz, sz, sz - r, sz)
  ctx.lineTo(r, sz);     ctx.quadraticCurveTo(0, sz, 0, sz - r)
  ctx.lineTo(0, r);      ctx.quadraticCurveTo(0, 0, r, 0)
  ctx.closePath()

  // Background gradient or solid
  let fillStyle = bg
  if (bgGradient) {
    const angleRad = (gradAngle * Math.PI) / 180
    const half = sz / 2
    const x0 = half - Math.cos(angleRad) * half
    const y0 = half - Math.sin(angleRad) * half
    const x1 = half + Math.cos(angleRad) * half
    const y1 = half + Math.sin(angleRad) * half
    const grad = ctx.createLinearGradient(x0, y0, x1, y1)
    grad.addColorStop(0, bg)
    grad.addColorStop(1, bgColor2 || '#ffffff')
    fillStyle = grad
  }
  ctx.fillStyle = fillStyle
  ctx.fill()

  ctx.save()
  ctx.clip()

  if (shadowOn) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.28)'
    ctx.shadowBlur = 12
    ctx.shadowOffsetX = sz * 0.03
    ctx.shadowOffsetY = sz * 0.03
  }

  if ((mode === 'image' || mode === 'ai') && uploadedImg) {
    // Fit image inside
    const iw = uploadedImg.width, ih = uploadedImg.height
    let dx, dy, dw, dh
    if (fit === 'cover') {
      const scale = Math.max(sz / iw, sz / ih)
      dw = iw * scale; dh = ih * scale
      dx = (sz - dw) / 2; dy = (sz - dh) / 2
    } else if (fit === 'contain') {
      const scale = Math.min(sz / iw, sz / ih) * .88
      dw = iw * scale; dh = ih * scale
      dx = (sz - dw) / 2; dy = (sz - dh) / 2
    } else { // stretch
      dx = 0; dy = 0; dw = sz; dh = sz
    }
    ctx.drawImage(uploadedImg, dx, dy, dw, dh)
  } else {
    // Text / Emoji mode
    ctx.fillStyle  = fg
    ctx.textAlign  = 'center'
    ctx.textBaseline = 'middle'
    const fz = sz * (text.length > 1 ? .48 : .60)
    ctx.font = `${bold ? 'bold ' : ''}${fz}px ${font}`
    ctx.fillText(text.slice(0, 2), sz / 2, sz / 2 + sz * .02)
  }
  ctx.restore()
}

/* ── Download at a given size ── */
function downloadAt(mainCanvas, sz, name = 'favicon') {
  if (!mainCanvas) return
  const tmp = document.createElement('canvas')
  tmp.width = sz; tmp.height = sz
  const ctx = tmp.getContext('2d')
  if (!ctx) return
  ctx.drawImage(mainCanvas, 0, 0, sz, sz)
  const dataURL = tmp.toDataURL('image/png')
  saveFileWithFallback(dataURL, `${name}-${sz}x${sz}.png`, 'image/png')
  try {
    addToHistory({
      tool: 'Favicon Generator',
      label: `${name}-${sz}x${sz}.png`,
      value: `PNG Favicon (${sz}×${sz})`,
      action: 'Exported',
      category: 'media',
      metadata: { size: sz, format: 'png' }
    })
  } catch {}
}

/* ── Standards-compliant multi-resolution binary .ico generator (RFC / MS-ICO) ── */
async function generateIcoBlob(mainCanvas, sizes = [16, 32, 48]) {
  const pngBuffers = []
  for (const sz of sizes) {
    const tmp = document.createElement('canvas')
    tmp.width = sz; tmp.height = sz
    const ctx = tmp.getContext('2d')
    if (!ctx) continue
    ctx.drawImage(mainCanvas, 0, 0, sz, sz)
    const blob = await new Promise(r => {
      try { tmp.toBlob(r, 'image/png') } catch { r(null) }
    })
    if (!blob) continue
    const buf = await blob.arrayBuffer()
    pngBuffers.push({ size: sz, data: new Uint8Array(buf) })
  }

  const count = pngBuffers.length
  if (count === 0) return null
  const headerSize = 6 + 16 * count
  let currentOffset = headerSize
  const totalSize = headerSize + pngBuffers.reduce((sum, item) => sum + item.data.length, 0)

  const icoBuffer = new Uint8Array(totalSize)
  const view = new DataView(icoBuffer.buffer)

  // ICONDIR header
  view.setUint16(0, 0, true) // Reserved: 0
  view.setUint16(2, 1, true) // Type: 1 (Icon)
  view.setUint16(4, count, true) // Count

  for (let i = 0; i < count; i++) {
    const entryOffset = 6 + i * 16
    const { size, data } = pngBuffers[i]
    view.setUint8(entryOffset + 0, size === 256 ? 0 : size) // Width
    view.setUint8(entryOffset + 1, size === 256 ? 0 : size) // Height
    view.setUint8(entryOffset + 2, 0) // Color count
    view.setUint8(entryOffset + 3, 0) // Reserved
    view.setUint16(entryOffset + 4, 1, true) // Color planes: 1
    view.setUint16(entryOffset + 6, 32, true) // Bits per pixel: 32
    view.setUint32(entryOffset + 8, data.length, true) // Image size
    view.setUint32(entryOffset + 12, currentOffset, true) // Image offset

    icoBuffer.set(data, currentOffset)
    currentOffset += data.length
  }

  return new Blob([icoBuffer], { type: 'image/x-icon' })
}

async function downloadIco(mainCanvas, name = 'favicon') {
  if (!mainCanvas) return
  const blob = await generateIcoBlob(mainCanvas, [16, 32, 48])
  saveFileWithFallback(blob, `${name}.ico`, 'image/x-icon')
  try {
    addToHistory({
      tool: 'Favicon Generator',
      label: `${name}.ico`,
      value: 'Multi-resolution Windows ICO (16, 32, 48)',
      action: 'Exported',
      category: 'media',
      metadata: { format: 'ico' }
    })
  } catch {}
}

/* ── Checkerboard preview wrapper ── */
function PreviewBox({ src, size, label }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        width: size + 8, height: size + 8,
        background: 'repeating-conic-gradient(#e0e0e0 0% 25%,white 0% 50%) 0 0 / 12px 12px',
        borderRadius: 8, border: '1px solid rgba(0,0,0,.09)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto',
      }}>
        {src && <img src={src} width={size} height={size} style={{ display: 'block', imageRendering: size <= 32 ? 'pixelated' : 'auto', borderRadius: size / 8 }} alt={label} />}
      </div>
      <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 5, fontWeight: 600 }}>{label}</div>
    </div>
  )
}

/* ── Color Swatch Picker ── */
function SwatchPicker({ label, value, onChange, presets }) {
  return (
    <div className="fgrp">
      <label className="lbl">{label}</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 9 }}>
        <input type="color" value={value} onChange={e => onChange(e.target.value)}
          style={{ width: 42, height: 42, border: '1.5px solid rgba(0,0,0,.1)', borderRadius: 9, cursor: 'pointer', padding: 3, background: 'none' }} />
        <input className="inp" value={value} onChange={e => onChange(e.target.value)}
          style={{ flex: 1, fontFamily: 'monospace', fontSize: 13 }} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {presets.map(c => (
          <button key={c} onClick={() => onChange(c)}
            style={{
              width: 24, height: 24, borderRadius: 6, cursor: 'pointer',
              background: c, border: `2.5px solid ${value === c ? '#4F8EF7' : 'rgba(0,0,0,.12)'}`,
              transition: 'transform .15s, border-color .15s',
              boxShadow: c === '#ffffff' ? '0 0 0 1px rgba(0,0,0,.1)' : 'none',
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.25)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          />
        ))}
      </div>
    </div>
  )
}

export default function FaviconGenerator() {
  const [mode,    setMode]    = useState('text')     // 'text' | 'image'
  const [text,    setText]    = useState('T')
  const [bg,      setBg]      = useState('#4F8EF7')
  const [fg,      setFg]      = useState('#FFFFFF')
  const [font,    setFont]    = useState('serif')
  const [radius,  setRadius]  = useState(8)
  const [bold,    setBold]    = useState(true)
  const [preview, setPreview] = useState('')
  const [uploadedImg, setUploadedImg] = useState(null)
  const [bgGradient,  setBgGrad]      = useState(false)
  const [bgColor2,    setBgColor2]    = useState('#9C6FDE')
  const [gradAngle,   setGradAngle]   = useState(135)
  const [shadowOn,    setShadow]      = useState(false)
  const [paddingPct,  setPadding]     = useState(10)
  const [fit,     setFit]     = useState('cover')    // cover | contain | stretch
  const [dragging, setDrag]   = useState(false)
  const canvasRef  = useRef(null)
  const prevUrlRef = useRef(null)

  useEffect(() => {
    return () => {
      if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current)
    }
  }, [])

  // Redraw whenever params change
  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    drawFavicon({ canvas, mode, text, bg, fg, font, bold, radius, uploadedImg, fit, bgGradient, bgColor2, gradAngle, shadowOn })
    setPreview(canvas.toDataURL('image/png'))
  }, [mode, text, bg, fg, font, bold, radius, uploadedImg, fit, bgGradient, bgColor2, gradAngle, shadowOn])

  useEffect(() => { redraw() }, [redraw])

  const loadImageFile = file => {
    if (!file || !file.type.startsWith('image/')) return
    if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current)
    const objUrl = URL.createObjectURL(file)
    prevUrlRef.current = objUrl
    const im = new Image()
    im.onload = () => { setUploadedImg(im); setMode('image') }
    im.onerror = () => {
      URL.revokeObjectURL(objUrl)
      if (prevUrlRef.current === objUrl) prevUrlRef.current = null
    }
    im.src = objUrl
  }

  const onImgInput   = e => loadImageFile(e.target.files[0])
  const onDrop       = e => { e.preventDefault(); setDrag(false); loadImageFile(e.dataTransfer.files[0]) }
  const onDragOver   = e => { e.preventDefault(); setDrag(true) }
  const onDragLeave  = () => setDrag(false)

  const [aiPrompt, setAiPrompt] = useState('Modern geometric rocket ship icon with sleek gradient wings')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [aiSvg, setAiSvg] = useState(null)

  const handleGenerateSvg = async () => {
    if (!aiPrompt.trim()) return
    setAiLoading(true)
    setAiError('')
    try {
      const data = await safeFetchJSON('/.netlify/functions/groq-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'generateFaviconSvg',
          payload: { prompt: aiPrompt.trim() }
        })
      })
      if (data?.error) throw new Error(data.error)
      const svgStr = data?.svg
      if (!svgStr || !svgStr.includes('<svg')) throw new Error('No valid SVG returned from AI')

      setAiSvg(svgStr)
      if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current)
      const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
      const objUrl = URL.createObjectURL(blob)
      prevUrlRef.current = objUrl
      const im = new Image()
      im.onload = () => {
        setUploadedImg(im)
        setFit('contain')
        setMode('ai')
      }
      im.onerror = () => {
        setAiError('Generated SVG could not be rendered. Please try another prompt.')
        URL.revokeObjectURL(objUrl)
        if (prevUrlRef.current === objUrl) prevUrlRef.current = null
      }
      im.src = objUrl
    } catch (err) {
      setAiError(err?.message || 'Failed to generate SVG favicon')
    } finally {
      setAiLoading(false)
    }
  }

  const downloadSvgFile = () => {
    if (!aiSvg) return
    const blob = new Blob([aiSvg], { type: 'image/svg+xml;charset=utf-8' })
    saveFileWithFallback(blob, 'favicon.svg', 'image/svg+xml')
    try {
      addToHistory({
        tool: 'Favicon Generator',
        label: 'favicon.svg',
        value: 'Scalable Vector Favicon',
        action: 'Exported',
        category: 'media',
        metadata: { format: 'svg' }
      })
    } catch {}
  }

  const safeBaseName = mode === 'ai' ? 'ai-favicon' : ((typeof text === 'string' ? text.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 8) : '') || 'favicon')
  const dl  = sz => downloadAt(canvasRef.current, sz, safeBaseName)
  const dlAll = () => {
    SIZES.forEach((s, i) => setTimeout(() => dl(s), i * 120))
    setTimeout(() => downloadIco(canvasRef.current, safeBaseName), SIZES.length * 120)
  }

  const TABS = [
    { id: 'text',  label: '🔤 Text / Emoji' },
    { id: 'image', label: '🖼️ Upload Image' },
    { id: 'ai',    label: '✨ AI Vector Generator' },
  ]

  return (
    <ToolShell tool={tool}>
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <ToolCard>

        {/* ── PREVIEW ROW ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 26, flexWrap: 'wrap', justifyContent: 'center' }}>
          {SIZES.map(s => (
            <motion.div key={s} whileHover={{ scale: 1.1, y: -4 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }}>
              <PreviewBox src={preview} size={s} label={`${s}×${s}`} />
            </motion.div>
          ))}
        </div>

        {/* ── MODE TABS ── */}
        <div style={{ display: 'flex', gap: 3, marginBottom: 22, borderRadius: 14, padding: 4, border: '1px solid rgba(0,0,0,.04)', background: 'rgba(0,0,0,.045)' }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setMode(tab.id)}
              style={{
                flex: 1, padding: '9px 0', border: 'none', cursor: 'pointer', borderRadius: 10,
                fontFamily: 'DM Sans,sans-serif', fontSize: 13, fontWeight: 600,
                background: mode === tab.id ? '#ffffff' : 'transparent',
                color: mode === tab.id ? '#0d0d1a' : '#666',
                boxShadow: mode === tab.id ? '0 2px 8px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.03), inset 0 1px 0 rgba(255,255,255,1)' : 'none',
                transition: 'all .18s cubic-bezier(.22,1,.36,1)',
              }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── TEXT / EMOJI MODE ── */}
        <AnimatePresence mode="wait">
          {mode === 'text' && (
            <motion.div key="text" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: .22 }}>
              <div className="fgrp">
                <label className="lbl">Text or Emoji (max 2 characters)</label>
                <input className="inp big" value={text} onChange={e => setText(e.target.value)} maxLength={2}
                  style={{ textAlign: 'center', fontFamily: font, fontWeight: bold ? 700 : 400, fontSize: 28, letterSpacing: 2 }} />
                {/* Quick emoji picker */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 10 }}>
                  {EMOJI_LIST.map(e => (
                    <motion.button key={e} onClick={() => setText(e)}
                      whileHover={{ scale: 1.2 }} whileTap={{ scale: .9 }}
                      style={{
                        width: 38, height: 38, borderRadius: 9, cursor: 'pointer', fontSize: 20, border: 'none',
                        background: text === e ? 'rgba(79,142,247,.12)' : '#f5f5f8',
                        boxShadow: text === e ? '0 0 0 2px #4F8EF7' : 'none',
                        transition: 'background .15s, box-shadow .15s',
                      }}>{e}</motion.button>
                  ))}
                </div>
              </div>

              <div className="frow">
                <SwatchPicker label="Background Color" value={bg} onChange={setBg} presets={BG_PRESETS} />

                {/* Gradient toggle */}
                <div style={{display:'flex',alignItems:'center',gap:10,marginTop:6}}>
                  <div onClick={()=>setBgGrad(g=>!g)}
                    style={{width:36,height:20,borderRadius:10,position:'relative',flexShrink:0,
                      background:bgGradient?'#4F8EF7':'#ddd',transition:'background .2s',cursor:'pointer'}}>
                    <div style={{position:'absolute',top:2,width:16,height:16,borderRadius:'50%',
                      background:'#fff',boxShadow:'0 1px 3px rgba(0,0,0,.2)',
                      left:bgGradient?16:2,transition:'left .2s'}}/>
                  </div>
                  <span style={{fontSize:12,color:'#666',fontWeight:600}}>Gradient background</span>
                </div>
                {bgGradient && (
                  <div style={{display:'flex',flexDirection:'column',gap:8,marginTop:8,
                    padding:'12px',background:'rgba(79,142,247,.04)',borderRadius:11,
                    border:'1px solid rgba(79,142,247,.12)'}}>
                    <SwatchPicker label="Gradient Color 2" value={bgColor2} onChange={setBgColor2}
                      presets={['#9C6FDE','#F06292','#22c55e','#f59e0b','#06b6d4','#ef4444','#0d0d1a','#fff']}/>
                    <div>
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}>
                        <span style={{fontSize:11,fontWeight:700,color:'#aaa'}}>Angle</span>
                        <span style={{fontSize:12,fontWeight:700,color:'#4F8EF7'}}>{gradAngle}°</span>
                      </div>
                      <input type="range" min={0} max={360} value={gradAngle}
                        onChange={e=>setGradAngle(+e.target.value)}
                        style={{ width:'100%',accentColor:'#4F8EF7', background:`linear-gradient(to right,#4F8EF7 0%,#4F8EF7 ${Math.max(0,Math.min(100,((gradAngle)-(0))/((360)-(0))*100))}%,#e2e4ef ${Math.max(0,Math.min(100,((gradAngle)-(0))/((360)-(0))*100))}%,#e2e4ef 100%)`, WebkitAppearance:'none', appearance:'none', height:5, borderRadius:3, outline:'none' }} className="rs-thumb"/>
                    </div>
                  </div>
                )}
                {/* Shadow */}
                <div style={{display:'flex',alignItems:'center',gap:10,marginTop:4}}>
                  <div onClick={()=>setShadow(s=>!s)}
                    style={{width:36,height:20,borderRadius:10,position:'relative',flexShrink:0,
                      background:shadowOn?'#4F8EF7':'#ddd',transition:'background .2s',cursor:'pointer'}}>
                    <div style={{position:'absolute',top:2,width:16,height:16,borderRadius:'50%',
                      background:'#fff',boxShadow:'0 1px 3px rgba(0,0,0,.2)',
                      left:shadowOn?16:2,transition:'left .2s'}}/>
                  </div>
                  <span style={{fontSize:12,color:'#666',fontWeight:600}}>Drop shadow</span>
                </div>
                <SwatchPicker label="Text Color" value={fg} onChange={setFg} presets={FG_PRESETS} />
              </div>

              <div className="frow">
                <div className="fgrp">
                  <label className="lbl">Font Family</label>
                  <select className="inp sel" value={font} onChange={e => setFont(e.target.value)}>
                    {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div className="fgrp">
                  <label className="lbl" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Corner Radius</span><span style={{ color: '#4F8EF7', fontWeight: 700 }}>{radius}</span>
                  </label>
                  <input type="range" min={0} max={16} value={radius} onChange={e => setRadius(+e.target.value)}
                    style={{ width:'100%', background:`linear-gradient(to right,#4F8EF7 0%,#4F8EF7 ${Math.max(0,Math.min(100,((radius)-(0))/((16)-(0))*100))}%,#e2e4ef ${Math.max(0,Math.min(100,((radius)-(0))/((16)-(0))*100))}%,#e2e4ef 100%)`, WebkitAppearance:'none', appearance:'none', height:5, borderRadius:3, outline:'none', cursor:'pointer' }} className="rs-thumb"/>
                </div>
                <div className="fgrp" style={{ display: 'flex', alignItems: 'center', paddingTop: 24 }}>
                  <label className="chkrow">
                    <input type="checkbox" checked={bold} onChange={e => setBold(e.target.checked)} />
                    <span style={{ fontWeight: 500 }}>Bold Text</span>
                  </label>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── IMAGE UPLOAD MODE ── */}
          {mode === 'image' && (
            <motion.div key="image" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: .22 }}>
              {!uploadedImg ? (
                <label>
                  <div className="upzone"
                    style={{ borderColor: dragging ? '#4F8EF7' : undefined, background: dragging ? 'rgba(79,142,247,.07)' : undefined }}
                    onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}>
                    <div className="upzone-icon">🖼️</div>
                    <div className="upzone-t">Drop your image here or click to upload</div>
                    <div className="upzone-s">PNG, JPEG, WebP, SVG — any size, any format</div>
                  </div>
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={onImgInput} />
                </label>
              ) : (
                <div>
                  {/* Uploaded image preview */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', background: '#f5f7ff', borderRadius: 12, border: '1px solid rgba(79,142,247,.12)', marginBottom: 18 }}>
                    <img src={uploadedImg.src} alt="uploaded"
                      style={{ width: 60, height: 60, objectFit: 'contain', borderRadius: 9, border: '1px solid rgba(0,0,0,.07)', background: '#fff' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: '#1e293b', marginBottom: 3 }}>Image loaded</div>
                      <div style={{ fontSize: 12.5, color: '#64748b' }}>{uploadedImg.width} × {uploadedImg.height}px</div>
                    </div>
                    <button className="btn btn-outline btn-sm" onClick={() => setUploadedImg(null)}>Change</button>
                  </div>

                  {/* Fit mode */}
                  <div className="fgrp">
                    <label className="lbl">Fit Mode</label>
                    <div className="tool-grid-3" style={{ gap: 9 }}>
                      {[
                        { id: 'cover',   icon: '⬛', desc: 'Fill & crop' },
                        { id: 'contain', icon: '⬜', desc: 'Fit inside'  },
                        { id: 'stretch', icon: '↔️', desc: 'Stretch'      },
                      ].map(f => (
                        <div key={f.id} onClick={() => setFit(f.id)}
                          style={{ padding: '10px 8px', borderRadius: 10, textAlign: 'center', cursor: 'pointer', border: `1.5px solid ${fit === f.id ? 'rgba(79,142,247,.5)' : 'rgba(0,0,0,.08)'}`, background: fit === f.id ? 'rgba(79,142,247,.06)' : '#FAFAFA', transition: 'all .18s' }}>
                          <div style={{ fontSize: 20, marginBottom: 5 }}>{f.icon}</div>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: fit === f.id ? '#4F8EF7' : '#334155' }}>{f.id}</div>
                          <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>{f.desc}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Background color for transparent images */}
                  <SwatchPicker label="Background (for transparent images)" value={bg} onChange={setBg} presets={BG_PRESETS} />
                </div>
              )}

              {/* Corner radius always available */}
              <div className="fgrp">
                <label className="lbl" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Corner Radius</span><span style={{ color: '#4F8EF7', fontWeight: 700 }}>{radius}</span>
                </label>
                <input type="range" min={0} max={16} value={radius} onChange={e => setRadius(+e.target.value)}
                  style={{ width:'100%', background:`linear-gradient(to right,#4F8EF7 0%,#4F8EF7 ${Math.max(0,Math.min(100,((radius)-(0))/((16)-(0))*100))}%,#e2e4ef ${Math.max(0,Math.min(100,((radius)-(0))/((16)-(0))*100))}%,#e2e4ef 100%)`, WebkitAppearance:'none', appearance:'none', height:5, borderRadius:3, outline:'none', cursor:'pointer' }} className="rs-thumb"/>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', marginTop: 4 }}>
                  <span>Square</span><span>Rounded</span><span>Circle</span>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── AI VECTOR GENERATOR MODE ── */}
          {mode === 'ai' && (
            <motion.div key="ai" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: .22 }}>
              <div className="fgrp">
                <label className="lbl">Describe your Favicon / App Icon</label>
                <textarea
                  className="inp"
                  value={aiPrompt}
                  onChange={e => setAiPrompt(e.target.value)}
                  placeholder="e.g. Modern geometric rocket ship with neon gradient wings, clean minimalist flat design"
                  style={{ width: '100%', minHeight: 75, resize: 'vertical', fontSize: 13, marginBottom: 8 }}
                />

                {/* Preset Prompt Ideas */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  <span style={{ fontSize: 11, color: '#64748b', alignSelf: 'center' }}>Ideas:</span>
                  {[
                    '🚀 Modern Rocket Ship',
                    '⚡ Glowing Neon Bolt',
                    '🛡️ Cyber Security Shield',
                    '💎 Crystal Diamond',
                    '🧠 Neural AI Brain',
                    '🍀 Minimalist Leaf'
                  ].map(idea => (
                    <button
                      key={idea}
                      type="button"
                      onClick={() => setAiPrompt(idea)}
                      className="btn btn-sm btn-outline"
                      style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6 }}
                    >
                      {idea}
                    </button>
                  ))}
                </div>

                {aiError && (
                  <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#ef4444', fontSize: 12, marginBottom: 10 }}>
                    ⚠️ {aiError}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleGenerateSvg}
                  disabled={aiLoading || !aiPrompt.trim()}
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '12px', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 14 }}
                >
                  {aiLoading ? (
                    <>
                      <span className="spinner-border spinner-border-sm" />
                      <span>Synthesizing Vector SVG...</span>
                    </>
                  ) : (
                    <>
                      <span>✨</span>
                      <span>Generate AI Vector Favicon</span>
                    </>
                  )}
                </button>
              </div>

              {/* Background color for SVG icon */}
              <SwatchPicker label="Canvas Background Color" value={bg} onChange={setBg} presets={BG_PRESETS} />

              {/* Corner radius always available */}
              <div className="fgrp">
                <label className="lbl" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Corner Radius</span><span style={{ color: '#4F8EF7', fontWeight: 700 }}>{radius}</span>
                </label>
                <input type="range" min={0} max={16} value={radius} onChange={e => setRadius(+e.target.value)}
                  style={{ width:'100%', background:`linear-gradient(to right,#4F8EF7 0%,#4F8EF7 ${Math.max(0,Math.min(100,((radius)-(0))/((16)-(0))*100))}%,#e2e4ef ${Math.max(0,Math.min(100,((radius)-(0))/((16)-(0))*100))}%,#e2e4ef 100%)`, WebkitAppearance:'none', appearance:'none', height:5, borderRadius:3, outline:'none', cursor:'pointer' }} className="rs-thumb"/>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#ccc', marginTop: 3 }}>
                  <span>Square</span><span>Rounded</span><span>Circle</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── DOWNLOAD BUTTONS ── */}
        <div style={{ marginTop: 8 }}>
          {aiSvg && (
            <motion.button
              className="btn btn-outline btn-w"
              onClick={downloadSvgFile}
              whileHover={{ scale: 1.01 }} whileTap={{ scale: .98 }}
              style={{ fontFamily: 'DM Sans,sans-serif', padding: '10px', fontSize: 13, fontWeight: 700, marginBottom: 10, borderColor: '#9C6FDE', color: '#9C6FDE' }}
            >
              📐 Download Clean Vector SVG (favicon.svg)
            </motion.button>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 8, marginBottom: 10 }}>
            {SIZES.map(s => (
              <motion.button key={s} className="btn btn-outline btn-sm" onClick={() => dl(s)}
                whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: .97 }}
                style={{ fontFamily: 'DM Sans,sans-serif' }}>
                ⬇ {s}×{s} PNG
              </motion.button>
            ))}
          </div>
          <motion.button className="btn btn-primary btn-w" onClick={dlAll}
            whileHover={{ scale: 1.01 }} whileTap={{ scale: .98 }}
            style={{ fontFamily: 'DM Sans,sans-serif', padding: '13px', fontSize: 15 }}>
            ⬇ Download All Sizes (16 · 32 · 64 · 128)
          </motion.button>
          <p style={{ fontSize: 12.5, color: '#64748b', textAlign: 'center', marginTop: 10 }}>
            💡 Real multi-resolution binary <code style={{ background: '#f0f0f0', padding: '1px 5px', borderRadius: 4, color: '#1e293b' }}>favicon.ico</code> (16, 32, 48px) is automatically bundled with Download All.
          </p>
        </div>

      </ToolCard>

      {/* ── ADVANCED ENHANCEMENT: FAVICON PREVIEW LAB (MULTI-CONTEXT SIMULATOR) ── */}
      <ToolCard style={{ marginTop: 20, border: '1px solid rgba(79,142,247,0.25)', background: 'linear-gradient(180deg, rgba(79,142,247,0.02) 0%, rgba(0,0,0,0.01) 100%)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(79,142,247,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
              🧪
            </div>
            <div>
              <h3 style={{ fontFamily: 'Syne, sans-serif', fontSize: 16.5, fontWeight: 800, margin: 0, color: '#0f172a' }}>
                Favicon Preview Lab & Context Simulator
              </h3>
              <span style={{ fontSize: 13, color: '#475569' }}>
                Test legibility and contrast across realistic OS, browser, and search surfaces
              </span>
            </div>
          </div>

          <div style={{ padding: '5px 12px', borderRadius: 6, background: 'rgba(0,0,0,0.05)', fontSize: 12, fontWeight: 700, color: '#475569', letterSpacing: '0.4px' }}>
            SIMULATED PREVIEW • REAL LIVE FAVICON
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: 16 }}>
          
          {/* Context 1: Browser Desktop Tab (Light Mode) */}
          <div style={{ background: '#e3e6eb', borderRadius: 12, padding: '10px 10px 0 10px', border: '1px solid rgba(0,0,0,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, px: 2 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>💻 Browser Tab (Light Theme)</span>
              <span style={{ fontSize: 11.5, color: '#64748b' }}>16×16px Icon</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', height: 36, gap: 4 }}>
              <div style={{
                background: '#fff', borderRadius: '8px 8px 0 0', height: 32, padding: '0 12px',
                display: 'flex', alignItems: 'center', gap: 8, maxWidth: 210, width: '100%',
                boxShadow: '0 -1px 3px rgba(0,0,0,0.05)'
              }}>
                {preview ? (
                  <img src={preview} width={16} height={16} style={{ borderRadius: 2, flexShrink: 0 }} alt="Favicon" />
                ) : (
                  <div style={{ width: 16, height: 16, background: '#ccc', borderRadius: 2 }} />
                )}
                <span style={{ fontSize: 12.5, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                  ToolDesk — Web Suite
                </span>
                <span style={{ fontSize: 12, color: '#64748b', marginLeft: 'auto' }}>×</span>
              </div>
            </div>
            <div style={{ background: '#fff', height: 18, borderTop: '1px solid #d5d9df' }} />
          </div>

          {/* Context 2: Browser Desktop Tab (Dark Mode) */}
          <div style={{ background: '#202124', borderRadius: 12, padding: '10px 10px 0 10px', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, px: 2 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>🌙 Browser Tab (Dark Theme)</span>
              <span style={{ fontSize: 11.5, color: '#94a3b8' }}>16×16px Icon</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', height: 36, gap: 4 }}>
              <div style={{
                background: '#323639', borderRadius: '8px 8px 0 0', height: 32, padding: '0 12px',
                display: 'flex', alignItems: 'center', gap: 8, maxWidth: 210, width: '100%'
              }}>
                {preview ? (
                  <img src={preview} width={16} height={16} style={{ borderRadius: 2, flexShrink: 0 }} alt="Favicon" />
                ) : (
                  <div style={{ width: 16, height: 16, background: '#555', borderRadius: 2 }} />
                )}
                <span style={{ fontSize: 12.5, color: '#e8eaed', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                  ToolDesk — Web Suite
                </span>
                <span style={{ fontSize: 12, color: '#9aa0a6', marginLeft: 'auto' }}>×</span>
              </div>
            </div>
            <div style={{ background: '#282a2d', height: 18, borderTop: '1px solid #3c4043' }} />
          </div>

          {/* Context 3: Browser Bookmark / Favorites Bar */}
          <div style={{ background: '#fff', borderRadius: 12, padding: 14, border: '1px solid rgba(0,0,0,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>⭐ Bookmarks Bar</span>
              <span style={{ fontSize: 11.5, color: '#64748b' }}>Compact List View</span>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 9px', background: 'rgba(0,0,0,0.03)', borderRadius: 6, border: '1px solid rgba(0,0,0,0.06)' }}>
                {preview && <img src={preview} width={14} height={14} style={{ borderRadius: 2 }} alt="Favicon" />}
                <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1e293b' }}>ToolDesk Tools</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 9px', background: 'rgba(0,0,0,0.02)', borderRadius: 6 }}>
                <span style={{ fontSize: 12 }}>📁</span>
                <span style={{ fontSize: 12, color: '#475569' }}>Projects</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 9px', background: 'rgba(0,0,0,0.02)', borderRadius: 6 }}>
                <span style={{ fontSize: 12 }}>🐙</span>
                <span style={{ fontSize: 12, color: '#475569' }}>GitHub</span>
              </div>
            </div>
          </div>

          {/* Context 4: Search Result Snippet (SERP) */}
          <div style={{ background: '#fff', borderRadius: 12, padding: 14, border: '1px solid rgba(0,0,0,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>🔍 Search Result SERP</span>
              <span style={{ fontSize: 11.5, color: '#64748b' }}>Mobile/Desktop Snippet</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#f1f3f4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {preview ? (
                    <img src={preview} width={16} height={16} style={{ borderRadius: 2 }} alt="Favicon" />
                  ) : null}
                </div>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: '#202124', lineHeight: 1.1 }}>tooldesk.app</div>
                  <div style={{ fontSize: 12, color: '#5f6368' }}>https://tooldesk.app › tools › favicon</div>
                </div>
              </div>
              <div style={{ fontSize: 13, color: '#1a0dab', fontWeight: 600, marginTop: 2, cursor: 'pointer' }}>
                Next-Gen Favicon & App Icon Generator — Multi-Resolution
              </div>
            </div>
          </div>

          {/* Context 5: Mobile Home Screen App Icon */}
          <div style={{
            background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
            borderRadius: 12, padding: 16, color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center'
          }}>
            <div style={{ alignSelf: 'flex-start', fontSize: 12.5, fontWeight: 700, color: 'rgba(255,255,255,0.95)', marginBottom: 12 }}>
              📱 Mobile Home Screen
            </div>
            <div style={{
              width: 58, height: 58, borderRadius: 14, background: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 20px rgba(0,0,0,0.3)', overflow: 'hidden'
            }}>
              {preview ? (
                <img src={preview} width={58} height={58} alt="App Icon" />
              ) : null}
            </div>
            <span style={{ fontSize: 12.5, fontWeight: 600, marginTop: 8, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}>
              ToolDesk
            </span>
          </div>

          {/* Context 6: Desktop App Dock / Taskbar */}
          <div style={{
            background: 'linear-gradient(180deg, #2c3e50 0%, #1a252f 100%)',
            borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <div style={{ alignSelf: 'flex-start', fontSize: 12.5, fontWeight: 700, color: 'rgba(255,255,255,0.95)' }}>
              🖥️ Desktop Dock Icon (48×48)
            </div>
            <div style={{
              background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)',
              padding: '8px 18px', borderRadius: 18, border: '1px solid rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', gap: 14, marginTop: 10
            }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
                {preview && <img src={preview} width={44} height={44} alt="Dock Icon" />}
              </div>
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(255,255,255,0.9)', alignSelf: 'flex-end', marginBottom: -2 }} />
            </div>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 8 }}>Simulated macOS / Linux Dock</span>
          </div>

        </div>
      </ToolCard>
    </ToolShell>
  )
}
