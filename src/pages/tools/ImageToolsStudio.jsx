import React, { useState, useRef, useEffect, useCallback, useMemo, lazy, Suspense } from 'react'
import { useLocation } from 'react-router-dom'
import { motion, useSpring, useMotionValue, AnimatePresence } from 'framer-motion'
import ToolShell, { ToolCard, Reveal } from '../../components/ToolShell'
import { useCopy } from '../../hooks'
import { TOOLS } from '../../constants'
import { saveFileWithFallback } from '../../utils/fileSaver'
import { PDFDocument } from 'pdf-lib'
import JSZip from 'jszip'
import ToolChainingBar from '../../components/ToolChainingBar'
import { 
  X, Crop, EyeOff, ScanText, ScanSearch, Maximize2, Minimize2, 
  RefreshCw, RotateCw, Sliders, Palette, FileText, Zap, Frame, 
  Square, Code2, Droplets, ShieldCheck, Waves, Camera, Film, 
  Box, Sparkles, Moon, Star, UploadCloud, ImageIcon, CheckCircle2, 
  AlertTriangle, Check, Copy, Download, Archive, Loader2, ArrowUp, ArrowDown, Lock
} from 'lucide-react'
import ChainedInputBanner from '../../components/ChainedInputBanner'

const ManualCropStudio = lazy(() => import('./ManualCropStudio'))
const ImageRedactor = lazy(() => import('./ImageRedactor'))
const OCRImageText = lazy(() => import('./OCRImageText'))
const ImageDpiChecker = lazy(() => import('./ImageDpiChecker'))

const tool = TOOLS.find(t => t.id === 'imagetools')

/* ─────────────────────────────────────────────
   SHARED UTILITIES
───────────────────────────────────────────── */
function dlDataURL(dataURL, name) {
  saveFileWithFallback(dataURL, name)
}
function dlBlob(blob, name) {
  saveFileWithFallback(blob, name)
}
function cssRV(v) { return v >= 999 ? '50%' : `${v}px` }
function buildCSS(tl, tr, br, bl) {
  if (tl===tr && tr===br && br===bl) return `border-radius: ${cssRV(tl)};`
  return `border-radius: ${cssRV(tl)} ${cssRV(tr)} ${cssRV(br)} ${cssRV(bl)};`
}

/* ─────────────────────────────────────────────
   BORDER PRESETS
───────────────────────────────────────────── */
const BORDER_PRESETS = [
  { name:'Polaroid', color:'#fffdf5', bw:18, top:18, right:18, bottom:50, left:18, shadow:10, shadowColor:'rgba(0,0,0,.25)', shadowBlur:20, icon: Camera },
  { name:'Neon',     color:'#00fff0', bw:4,  top:4,  right:4,  bottom:4,  left:4,  shadow:0,  shadowColor:'transparent',      shadowBlur:0,  icon: Zap },
  { name:'Vintage',  color:'#d4a060', bw:12, top:12, right:12, bottom:12, left:12, shadow:6,  shadowColor:'rgba(0,0,0,.2)',    shadowBlur:12, icon: Film },
  { name:'Minimal',  color:'#e5e5e5', bw:2,  top:2,  right:2,  bottom:2,  left:2,  shadow:0,  shadowColor:'transparent',      shadowBlur:0,  icon: Square },
  { name:'Bold',     color:'#0d0d1a', bw:10, top:10, right:10, bottom:10, left:10, shadow:0,  shadowColor:'transparent',      shadowBlur:0,  icon: Box },
  { name:'Rainbow',  color:'#FF6B6B', bw:8,  top:8,  right:8,  bottom:8,  left:8,  shadow:8,  shadowColor:'rgba(255,107,107,.35)', shadowBlur:16, icon: Sparkles },
  { name:'Shadow',   color:'#ffffff', bw:16, top:16, right:16, bottom:16, left:16, shadow:20, shadowColor:'rgba(0,0,0,.35)',   shadowBlur:28, icon: Moon },
  { name:'Gold',     color:'#FFD700', bw:8,  top:8,  right:8,  bottom:8,  left:8,  shadow:6,  shadowColor:'rgba(255,215,0,.4)', shadowBlur:16, icon: Star },
]

/* ─────────────────────────────────────────────
   CORNER PRESETS
───────────────────────────────────────────── */
const CORNER_SHAPES = [
  { name:'Sharp',    tl:0,   tr:0,   br:0,   bl:0   },
  { name:'Slight',   tl:4,   tr:4,   br:4,   bl:4   },
  { name:'Rounded',  tl:12,  tr:12,  br:12,  bl:12  },
  { name:'Squircle', tl:24,  tr:24,  br:24,  bl:24  },
  { name:'Pill',     tl:999, tr:999, br:999, bl:999  },
  { name:'Leaf',     tl:0,   tr:999, br:0,   bl:999  },
  { name:'Bubble',   tl:999, tr:999, br:0,   bl:999  },
  { name:'Tear',     tl:999, tr:0,   br:0,   bl:0    },
  { name:'Wave',     tl:0,   tr:60,  br:0,   bl:60   },
  { name:'Notch',    tl:60,  tr:0,   br:60,  bl:0    },
]
const CORNER_USE_CASES = [
  { name:'Button',    tl:8,   tr:8,   br:8,   bl:8   },
  { name:'Card',      tl:16,  tr:16,  br:16,  bl:16  },
  { name:'Input',     tl:8,   tr:8,   br:8,   bl:8   },
  { name:'Avatar',    tl:999, tr:999, br:999, bl:999  },
  { name:'Tag',       tl:4,   tr:4,   br:4,   bl:4   },
  { name:'Modal',     tl:20,  tr:20,  br:20,  bl:20  },
]

/* ─────────────────────────────────────────────
   CANVAS RENDERERS
───────────────────────────────────────────── */
function renderBordered(imgEl, { color, top, right, bottom, left, shadow, shadowBlur, shadowColor }, filters, watermark) {
  const iw = Math.max(1, Math.min(16384, imgEl.naturalWidth || imgEl.width || 1))
  const ih = Math.max(1, Math.min(16384, imgEl.naturalHeight || imgEl.height || 1))
  const pad = shadow+4
  const cw=iw+left+right+pad*2, ch=ih+top+bottom+pad*2
  const c=document.createElement('canvas'); c.width=cw; c.height=ch
  const ctx=c.getContext('2d')
  ctx.clearRect(0,0,cw,ch)
  ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high'
  if (shadow>0) {
    ctx.save()
    ctx.shadowColor=shadowColor; ctx.shadowBlur=shadowBlur
    ctx.shadowOffsetX=shadow*.5; ctx.shadowOffsetY=shadow
    ctx.fillStyle=color; ctx.fillRect(pad,pad,iw+left+right,ih+top+bottom)
    ctx.restore()
  } else {
    ctx.fillStyle=color; ctx.fillRect(pad,pad,iw+left+right,ih+top+bottom)
  }
  ctx.save()
  if (filters) {
    ctx.filter = `brightness(${filters.brightness}%) contrast(${filters.contrast}%) grayscale(${filters.grayscale}%) blur(${filters.blur}px)`
  }
  ctx.drawImage(imgEl,pad+left,pad+top,iw,ih)
  ctx.restore()

  if (watermark && watermark.text) {
    ctx.save()
    const fontSize = Math.max(14, Math.round(iw * 0.045))
    ctx.font = `bold ${fontSize}px "DM Sans", sans-serif`
    ctx.fillStyle = `rgba(255, 255, 255, ${watermark.opacity / 100})`
    ctx.strokeStyle = `rgba(0, 0, 0, ${watermark.opacity / 150})`
    ctx.lineWidth = Math.max(1.5, fontSize * 0.04)
    ctx.textBaseline = 'bottom'
    ctx.textAlign = 'right'
    const wx = pad + left + iw - Math.max(10, Math.round(iw * 0.02))
    const wy = pad + top + ih - Math.max(10, Math.round(ih * 0.02))
    ctx.strokeText(watermark.text, wx, wy)
    ctx.fillText(watermark.text, wx, wy)
    ctx.restore()
  }
  try { return c.toDataURL('image/png') } catch { return '' }
}

function renderRoundedFull(img, tl, tr, br, bl, filters, watermark) {
  const w = Math.max(1, Math.min(16384, img.naturalWidth || img.width || 1))
  const h = Math.max(1, Math.min(16384, img.naturalHeight || img.height || 1))
  const c=document.createElement('canvas'); c.width=w; c.height=h
  const ctx=c.getContext('2d',{alpha:true})
  const r=v=>v>=999?Math.min(w,h)/2:Math.min(v,w/2,h/2)
  const rtl=r(tl),rtr=r(tr),rbr=r(br),rbl=r(bl)
  ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high'
  ctx.beginPath()
  ctx.moveTo(rtl,0)
  ctx.lineTo(w-rtr,0);  ctx.quadraticCurveTo(w,0,w,rtr)
  ctx.lineTo(w,h-rbr);  ctx.quadraticCurveTo(w,h,w-rbr,h)
  ctx.lineTo(rbl,h);    ctx.quadraticCurveTo(0,h,0,h-rbl)
  ctx.lineTo(0,rtl);    ctx.quadraticCurveTo(0,0,rtl,0)
  ctx.closePath(); ctx.clip()
  ctx.save()
  if (filters) {
    ctx.filter = `brightness(${filters.brightness}%) contrast(${filters.contrast}%) grayscale(${filters.grayscale}%) blur(${filters.blur}px)`
  }
  ctx.drawImage(img,0,0,w,h)
  ctx.restore()

  if (watermark && watermark.text) {
    ctx.save()
    const fontSize = Math.max(14, Math.round(w * 0.045))
    ctx.font = `bold ${fontSize}px "DM Sans", sans-serif`
    ctx.fillStyle = `rgba(255, 255, 255, ${watermark.opacity / 100})`
    ctx.strokeStyle = `rgba(0, 0, 0, ${watermark.opacity / 150})`
    ctx.lineWidth = Math.max(1.5, fontSize * 0.04)
    ctx.textBaseline = 'bottom'
    ctx.textAlign = 'right'
    const wx = w - Math.max(10, Math.round(w * 0.02))
    const wy = h - Math.max(10, Math.round(h * 0.02))
    ctx.strokeText(watermark.text, wx, wy)
    ctx.fillText(watermark.text, wx, wy)
    ctx.restore()
  }
  return c.toDataURL('image/png')
}

function renderRoundedScaled(img, tl, tr, br, bl, maxPx, filters, watermark) {
  const scale=Math.min(1,maxPx/Math.max(img.naturalWidth,img.naturalHeight))
  const w=Math.round(img.naturalWidth*scale), h=Math.round(img.naturalHeight*scale)
  const c=document.createElement('canvas'); c.width=w; c.height=h
  const ctx=c.getContext('2d',{alpha:true})
  const rs=v=>v>=999?Math.min(w,h)/2:Math.min(v*scale,w/2,h/2)
  const rtl=rs(tl),rtr=rs(tr),rbr=rs(br),rbl=rs(bl)
  ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high'
  ctx.beginPath()
  ctx.moveTo(rtl,0); ctx.lineTo(w-rtr,0); ctx.quadraticCurveTo(w,0,w,rtr)
  ctx.lineTo(w,h-rbr); ctx.quadraticCurveTo(w,h,w-rbr,h)
  ctx.lineTo(rbl,h); ctx.quadraticCurveTo(0,h,0,h-rbl)
  ctx.lineTo(0,rtl); ctx.quadraticCurveTo(0,0,rtl,0)
  ctx.closePath(); ctx.clip()
  ctx.save()
  if (filters) {
    const scaledBlur = filters.blur * scale
    ctx.filter = `brightness(${filters.brightness}%) contrast(${filters.contrast}%) grayscale(${filters.grayscale}%) blur(${scaledBlur}px)`
  }
  ctx.drawImage(img,0,0,w,h)
  ctx.restore()

  if (watermark && watermark.text) {
    ctx.save()
    const fontSize = Math.max(14, Math.round(w * 0.045))
    ctx.font = `bold ${fontSize}px "DM Sans", sans-serif`
    ctx.fillStyle = `rgba(255, 255, 255, ${watermark.opacity / 100})`
    ctx.strokeStyle = `rgba(0, 0, 0, ${watermark.opacity / 150})`
    ctx.lineWidth = Math.max(1.5, fontSize * 0.04)
    ctx.textBaseline = 'bottom'
    ctx.textAlign = 'right'
    const wx = w - Math.max(10, Math.round(w * 0.02))
    const wy = h - Math.max(10, Math.round(h * 0.02))
    ctx.strokeText(watermark.text, wx, wy)
    ctx.fillText(watermark.text, wx, wy)
    ctx.restore()
  }
  try { return c.toDataURL('image/png') } catch { return '' }
}

function renderWatermarked(imgEl, textSettings, logoSettings) {
  const w = Math.max(1, Math.min(16384, imgEl.naturalWidth || imgEl.width || 1))
  const h = Math.max(1, Math.min(16384, imgEl.naturalHeight || imgEl.height || 1))
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const ctx = c.getContext('2d')
  ctx.drawImage(imgEl, 0, 0, w, h)

  if (logoSettings && logoSettings.logoImg) {
    ctx.save()
    const logoImg = logoSettings.logoImg
    const scale = (Number(logoSettings.scale) || 20) / 100
    const logoW = logoImg.naturalWidth || logoImg.width || 1
    const logoH = logoImg.naturalHeight || logoImg.height || 1
    const lw = w * scale
    const lh = lw * (logoH / logoW)
    
    let lx = 10, ly = 10
    const margin = Math.max(10, Math.round(w * 0.02))
    
    if (logoSettings.position === 'top-left') {
      lx = margin
      ly = margin
    } else if (logoSettings.position === 'top-right') {
      lx = w - lw - margin
      ly = margin
    } else if (logoSettings.position === 'bottom-left') {
      lx = margin
      ly = h - lh - margin
    } else if (logoSettings.position === 'bottom-right') {
      lx = w - lw - margin
      ly = h - lh - margin
    } else if (logoSettings.position === 'center') {
      lx = (w - lw) / 2
      ly = (h - lh) / 2
    }
    
    ctx.globalAlpha = logoSettings.opacity / 100
    ctx.drawImage(logoImg, lx, ly, lw, lh)
    ctx.restore()
  }

  if (textSettings && textSettings.text) {
    ctx.save()
    const fontSize = Math.max(12, Math.round(w * (textSettings.size / 1000)))
    ctx.font = `bold ${fontSize}px "DM Sans", sans-serif`
    ctx.fillStyle = textSettings.color
    ctx.globalAlpha = textSettings.opacity / 100
    
    let tx = 10, ty = 10
    const margin = Math.max(10, Math.round(w * 0.02))
    
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    
    const textWidth = ctx.measureText(textSettings.text).width
    
    if (textSettings.position === 'top-left') {
      tx = margin
      ty = margin + fontSize / 2
    } else if (textSettings.position === 'top-right') {
      tx = w - textWidth - margin
      ty = margin + fontSize / 2
    } else if (textSettings.position === 'bottom-left') {
      tx = margin
      ty = h - margin - fontSize / 2
    } else if (textSettings.position === 'bottom-right') {
      tx = w - textWidth - margin
      ty = h - margin - fontSize / 2
    } else if (textSettings.position === 'center') {
      tx = (w - textWidth) / 2
      ty = h / 2
    }
    
    ctx.strokeStyle = textSettings.color === '#ffffff' ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)'
    ctx.lineWidth = Math.max(1, fontSize * 0.03)
    ctx.strokeText(textSettings.text, tx, ty)
    ctx.fillText(textSettings.text, tx, ty)
    ctx.restore()
  }

  try { return c.toDataURL('image/png') } catch { return '' }
}

/* ─────────────────────────────────────────────
   SHARED IMAGE UPLOADER WIDGET
───────────────────────────────────────────── */
function ImageUploader({ onImage, label = 'Drop image here', accept = 'image/*' }) {
  const fileRef = useRef(null)
  const [drag, setDrag] = useState(false)
  return (
    <motion.label
      onDragOver={e=>{e.preventDefault();setDrag(true)}}
      onDragLeave={()=>setDrag(false)}
      onDrop={e=>{e.preventDefault();setDrag(false);onImage(e.dataTransfer.files[0])}}
      animate={{borderColor:drag?'#4F8EF7':'rgba(0,0,0,.1)',scale:drag?1.01:1}}
      style={{display:'block',border:'2px dashed rgba(0,0,0,.1)',borderRadius:16,
        padding:'32px 20px',textAlign:'center',cursor:'pointer',marginBottom:16,
        background:drag?'rgba(79,142,247,.04)':'transparent',transition:'background .2s'}}>
      <input ref={fileRef} type="file" accept={accept} style={{display:'none'}}
        onChange={e=>{onImage(e.target.files[0]);e.target.value=''}}/>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10, color: drag ? '#4F8EF7' : '#888' }}>
        {drag ? <UploadCloud size={40} /> : <ImageIcon size={40} />}
      </div>
      <div style={{fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:14,color:'#0d0d1a',marginBottom:4}}>
        {drag?'Drop to upload':label}
      </div>
      <div style={{fontSize:12,color:'#aaa'}}>PNG · JPEG · WebP · GIF</div>
    </motion.label>
  )
}

/* ─────────────────────────────────────────────
   SLIDER COMPONENT
───────────────────────────────────────────── */
function Slider({ label, value, min=0, max=100, unit='', color='#4F8EF7', onChange }) {
  return (
    <div className="fgrp">
      <label className="lbl">{label}: <strong style={{color}}>{value}{unit}</strong></label>
      <input type="range" min={min} max={max} value={value} onChange={onChange}
                style={{ width:'100%', background:`linear-gradient(to right,#4F8EF7 0%,#4F8EF7 ${Math.max(0,Math.min(100,((value)-(min))/((max)-(min))*100))}%,#e2e4ef ${Math.max(0,Math.min(100,((value)-(min))/((max)-(min))*100))}%,#e2e4ef 100%)`, WebkitAppearance:'none', appearance:'none', height:5, borderRadius:3, outline:'none', cursor:'pointer' }} className="rs-thumb"/>
    </div>
  )
}

/* ─────────────────────────────────────────────
   TYPEWRITER HOOK
───────────────────────────────────────────── */
function useTypewriter(text, speed=8) {
  const [displayed, setDisplayed] = useState(text)
  const prev = useRef(text)
  useEffect(()=>{
    if (prev.current===text) return
    prev.current=text
    setDisplayed('')
    let i=0
    const id=setInterval(()=>{ i++; setDisplayed(text.slice(0,i)); if(i>=text.length)clearInterval(id) },speed)
    return ()=>clearInterval(id)
  },[text,speed])
  return displayed
}

function ExifCleanerStudio() {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState('')
  const [exifData, setExifData] = useState(null)
  const [cleaned, setCleaned] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  const handleFile = (f) => {
    if (!f || !f.type.startsWith('image/')) return
    setFile(f)
    setCleaned(false)
    if (preview) URL.revokeObjectURL(preview)
    const url = URL.createObjectURL(f)
    setPreview(url)
    const reader = new FileReader()
    reader.onload = (e) => {
      let hasExif = false
      let details = { gps: false, camera: false }
      try {
        const view = new DataView(e.target.result)
        if (view.byteLength >= 4 && view.getUint16(0, false) === 0xFFD8) {
          let offset = 2
          while (offset + 4 <= view.byteLength) {
            const marker = view.getUint16(offset, false)
            if (marker === 0xFFDA || marker === 0xFFD9) break
            if (marker === 0xFFE1) {
              hasExif = true; details.gps = true; details.camera = true; break
            }
            const len = view.getUint16(offset + 2, false)
            if (len < 2) break
            offset += 2 + len
          }
        }
      } catch (_) {}

      setExifData({
        fileName: f.name,
        size: (f.size / 1024).toFixed(1) + ' KB',
        type: f.type,
        hasExif,
        details
      })
    }
    reader.onerror = () => {
      setExifData({
        fileName: f.name,
        size: (f.size / 1024).toFixed(1) + ' KB',
        type: f.type,
        hasExif: false,
        details: { gps: false, camera: false }
      })
    }
    reader.readAsArrayBuffer(f.slice(0, 128 * 1024))
  }

  const cleanExif = () => {
    if (!preview || !file) return
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)

      canvas.toBlob((blob) => {
        if (blob) {
          const cleanName = (file.name ? file.name.replace(/\.[^.]+$/, '') : 'image') + '_privacy_cleaned.png'
          dlBlob(blob, cleanName)
          setCleaned(true)
        }
        canvas.width = 0
        canvas.height = 0
      }, 'image/png')
    }
    img.onerror = () => {}
    img.src = preview
  }

  return (
    <div style={{ marginTop: 10 }}>
      {!file ? (
        <div onClick={() => fileRef.current?.click()} style={{
          border: '2px dashed rgba(79,142,247,.3)', borderRadius: 16, padding: '40px 20px',
          textAlign: 'center', cursor: 'pointer', background: 'rgba(79,142,247,.03)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
            <ShieldCheck size={38} style={{ color: '#4F8EF7' }} />
          </div>
          <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 15, color: '#0d0d1a' }}>
            Upload Photo to Inspect & Clean EXIF Privacy
          </div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
            Strips GPS coordinates, camera model info, and hidden metadata
          </div>
          <input type="file" accept="image/*" ref={fileRef} style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', gap: 16, marginBottom: 16, alignItems: 'center' }}>
            <img src={preview} alt="Preview" style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 12, border: '1px solid #ddd' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#0d0d1a' }}>{exifData?.fileName}</div>
              <div style={{ fontSize: 11.5, color: '#888', marginTop: 2 }}>{exifData?.size} · {exifData?.type}</div>
              <div style={{ marginTop: 8 }}>
                {exifData?.hasExif ? (
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', background: 'rgba(239,68,68,.1)', padding: '3px 8px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <AlertTriangle size={13} /> EXIF Metadata Detected (Location/Camera Info)
                  </span>
                ) : (
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', background: 'rgba(34,197,94,.1)', padding: '3px 8px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <CheckCircle2 size={13} /> Clean (No EXIF markers found)
                  </span>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={cleanExif}>
              <ShieldCheck size={15} /> {cleaned ? 'Cleaned & Downloaded!' : 'Clean EXIF & Download Clean Image'}
            </button>
            <button className="btn btn-outline" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => { setFile(null); setPreview(''); setExifData(null); setCleaned(false) }}>
              <X size={14} /> Choose Another
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function WaveBlobStudio() {
  const [mode, setMode] = useState('wave')
  const [color1, setColor1] = useState('#4F8EF7')
  const [color2, setColor2] = useState('#9C6FDE')
  const [complexity, setComplexity] = useState(4)
  const [copiedCode, copyCode] = useCopy()

  const safeC1 = /^#[0-9a-fA-F]{3,8}$/.test(color1) ? color1 : '#4F8EF7'
  const safeC2 = /^#[0-9a-fA-F]{3,8}$/.test(color2) ? color2 : '#9C6FDE'
  const safeComp = Math.min(8, Math.max(1, parseInt(complexity, 10) || 4))

  const svgCode = mode === 'wave' ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 400" width="100%" height="100%">
  <defs>
    <linearGradient id="waveGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${safeC1}" />
      <stop offset="100%" stop-color="${safeC2}" />
    </linearGradient>
  </defs>
  <path fill="url(#waveGrad)" d="M 0 400 L 0 200 Q 300 ${200 - safeComp * 20}, 600 200 T 1200 200 L 1200 400 Z" />
</svg>` : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="100%" height="100%">
  <defs>
    <linearGradient id="blobGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${safeC1}" />
      <stop offset="100%" stop-color="${safeC2}" />
    </linearGradient>
  </defs>
  <path fill="url(#blobGrad)" d="M 250 50 Q ${350 + safeComp * 15} 100, 400 250 T 250 450 T 100 250 T 250 50 Z" />
</svg>`

  const downloadSvg = () => {
    const blob = new Blob([svgCode], { type: 'image/svg+xml' })
    dlBlob(blob, `${mode}-graphic.svg`)
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
        <button className={`btn ${mode === 'wave' ? 'btn-primary' : 'btn-outline'} btn-sm`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setMode('wave')}>
          <Waves size={14} /> Wave Divider
        </button>
        <button className={`btn ${mode === 'blob' ? 'btn-primary' : 'btn-outline'} btn-sm`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setMode('blob')}>
          <Sparkles size={14} /> Organic Blob
        </button>
      </div>

      <div className="tool-grid-3" style={{ marginBottom: 14 }}>
        <div>
          <label className="lbl">Color 1</label>
          <input type="color" value={color1} onChange={e => setColor1(e.target.value)} style={{ width: '100%', height: 38, borderRadius: 8, cursor: 'pointer' }} />
        </div>
        <div>
          <label className="lbl">Color 2</label>
          <input type="color" value={color2} onChange={e => setColor2(e.target.value)} style={{ width: '100%', height: 38, borderRadius: 8, cursor: 'pointer' }} />
        </div>
        <div>
          <label className="lbl">Complexity: {complexity}</label>
          <input type="range" min={1} max={8} value={complexity} onChange={e => setComplexity(+e.target.value)} style={{ width: '100%' }} />
        </div>
      </div>

      <div style={{
        height: 180, background: '#0d0d1a', borderRadius: 14, overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14
      }} dangerouslySetInnerHTML={{ __html: svgCode }} />

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => copyCode(svgCode)}>
          {copiedCode ? <Check size={14} /> : <Copy size={14} />} {copiedCode ? 'Copied SVG' : 'Copy SVG Code'}
        </button>
        <button className="btn btn-outline btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={downloadSvg}>
          <Download size={14} /> Download .SVG
        </button>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────
   NEW STUDIO TOOLS: CROP, RESIZE, COMPRESS,
   CONVERT, ROTATE, ADJUST, PALETTE, PDF, BATCH
───────────────────────────────────────────── */

function CropStudio() {
  const [file, setFile] = useState(null)
  const [imgUrl, setImgUrl] = useState('')
  const [imgEl, setImgEl] = useState(null)
  const [aspectRatio, setAspectRatio] = useState('free')
  const [cropBox, setCropBox] = useState({ x: 10, y: 10, w: 80, h: 80 })
  const previewCanvasRef = useRef(null)

  useEffect(() => {
    return () => { if (imgUrl) URL.revokeObjectURL(imgUrl) }
  }, [imgUrl])

  const handleImage = (f) => {
    if (!f || !f.type.startsWith('image/')) return
    setFile(f)
    if (imgUrl) URL.revokeObjectURL(imgUrl)
    const url = URL.createObjectURL(f)
    setImgUrl(url)
    const img = new Image()
    img.onload = () => {
      setImgEl(img)
      setCropBox({ x: 10, y: 10, w: 80, h: 80 })
    }
    img.src = url
  }

  const applyRatio = (ratio) => {
    setAspectRatio(ratio)
    if (!imgEl) return
    if (ratio === 'free') {
      setCropBox({ x: 10, y: 10, w: 80, h: 80 })
      return
    }
    const [rw, rh] = ratio.split(':').map(Number)
    const targetRatio = rw / rh
    const imgRatio = imgEl.naturalWidth / imgEl.naturalHeight

    let w, h
    if (targetRatio > imgRatio) {
      w = 80
      h = Math.min(90, Math.round((w * imgRatio) / targetRatio))
    } else {
      h = 80
      w = Math.min(90, Math.round((h * targetRatio) / imgRatio))
    }
    const x = Math.max(0, Math.round((100 - w) / 2))
    const y = Math.max(0, Math.round((100 - h) / 2))
    setCropBox({ x, y, w, h })
  }

  useEffect(() => {
    if (!imgEl || !previewCanvasRef.current) return
    const canvas = previewCanvasRef.current
    const ctx = canvas.getContext('2d')
    const natW = imgEl.naturalWidth
    const natH = imgEl.naturalHeight

    const sx = Math.round((cropBox.x / 100) * natW)
    const sy = Math.round((cropBox.y / 100) * natH)
    const sw = Math.max(1, Math.round((cropBox.w / 100) * natW))
    const sh = Math.max(1, Math.round((cropBox.h / 100) * natH))

    canvas.width = sw
    canvas.height = sh
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(imgEl, sx, sy, sw, sh, 0, 0, sw, sh)
  }, [imgEl, cropBox])

  const handleDownload = () => {
    if (!imgEl) return
    const natW = imgEl.naturalWidth
    const natH = imgEl.naturalHeight
    const sx = Math.round((cropBox.x / 100) * natW)
    const sy = Math.round((cropBox.y / 100) * natH)
    const sw = Math.max(1, Math.round((cropBox.w / 100) * natW))
    const sh = Math.max(1, Math.round((cropBox.h / 100) * natH))

    const off = document.createElement('canvas')
    off.width = sw
    off.height = sh
    const ctx = off.getContext('2d')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(imgEl, sx, sy, sw, sh, 0, 0, sw, sh)

    off.toBlob((blob) => {
      if (blob) {
        const outName = (file?.name ? file.name.replace(/\.[^.]+$/, '') : 'cropped') + '_cropped.png'
        dlBlob(blob, outName)
      }
    }, 'image/png')
  }

  return (
    <div>
      {!imgEl ? (
        <ImageUploader onImage={handleImage} label="Drop image to crop" />
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 15, color: '#0d0d1a', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Crop size={16} style={{ color: '#4F8EF7' }} /> Image Crop Studio
              </div>
              <div style={{ fontSize: 12, color: '#888' }}>
                Original: {imgEl.naturalWidth} × {imgEl.naturalHeight} px · Cropped: {Math.round((cropBox.w / 100) * imgEl.naturalWidth)} × {Math.round((cropBox.h / 100) * imgEl.naturalHeight)} px
              </div>
            </div>
            <button className="btn btn-outline btn-sm" onClick={() => { setImgEl(null); setFile(null) }}>
              Change Image
            </button>
          </div>

          <div className="fgrp">
            <label className="lbl">Aspect Ratio Preset</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[
                { id: 'free', label: 'Freeform' },
                { id: '1:1', label: '1:1 Square' },
                { id: '16:9', label: '16:9 Widescreen' },
                { id: '4:3', label: '4:3 Standard' },
                { id: '3:2', label: '3:2 Classic' },
                { id: '9:16', label: '9:16 Story/Reel' },
              ].map(r => (
                <button
                  key={r.id}
                  type="button"
                  className={`btn btn-sm ${aspectRatio === r.id ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: 12, padding: '5px 12px' }}
                  onClick={() => applyRatio(r.id)}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
            <Slider label="Crop Width" value={cropBox.w} min={10} max={100} unit="%" onChange={e => {
              const w = +e.target.value
              setCropBox(b => ({ ...b, w, x: Math.min(b.x, 100 - w) }))
            }} />
            <Slider label="Crop Height" value={cropBox.h} min={10} max={100} unit="%" onChange={e => {
              const h = +e.target.value
              setCropBox(b => ({ ...b, h, y: Math.min(b.y, 100 - h) }))
            }} />
            <Slider label="Position X" value={cropBox.x} min={0} max={Math.max(0, 100 - cropBox.w)} unit="%" onChange={e => {
              setCropBox(b => ({ ...b, x: +e.target.value }))
            }} />
            <Slider label="Position Y" value={cropBox.y} min={0} max={Math.max(0, 100 - cropBox.h)} unit="%" onChange={e => {
              setCropBox(b => ({ ...b, y: +e.target.value }))
            }} />
          </div>

          <div style={{ textAlign: 'center', background: '#fafafa', borderRadius: 14, padding: 16, border: '1px solid rgba(0,0,0,0.06)', marginBottom: 16 }}>
            <canvas ref={previewCanvasRef} style={{ maxWidth: '100%', maxHeight: 360, borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }} />
          </div>

          <button className="btn btn-primary btn-w btn-lg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }} onClick={handleDownload}>
            <Download size={16} /> Download Cropped Image (PNG)
          </button>
        </div>
      )}
    </div>
  )
}

function ResizeStudio() {
  const [file, setFile] = useState(null)
  const [imgEl, setImgEl] = useState(null)
  const [imgUrl, setImgUrl] = useState('')
  const [width, setWidth] = useState(800)
  const [height, setHeight] = useState(600)
  const [lockRatio, setLockRatio] = useState(true)
  const [format, setFormat] = useState('image/png')
  const [quality, setQuality] = useState(90)
  const previewCanvasRef = useRef(null)

  useEffect(() => {
    return () => { if (imgUrl) URL.revokeObjectURL(imgUrl) }
  }, [imgUrl])

  const handleImage = (f) => {
    if (!f || !f.type.startsWith('image/')) return
    setFile(f)
    if (imgUrl) URL.revokeObjectURL(imgUrl)
    const url = URL.createObjectURL(f)
    setImgUrl(url)
    const img = new Image()
    img.onload = () => {
      setImgEl(img)
      setWidth(img.naturalWidth)
      setHeight(img.naturalHeight)
    }
    img.src = url
  }

  const handleWidthChange = (val) => {
    const w = Math.max(16, Math.min(8192, parseInt(val, 10) || 16))
    setWidth(w)
    if (lockRatio && imgEl) {
      const ratio = imgEl.naturalWidth / imgEl.naturalHeight
      setHeight(Math.round(w / ratio))
    }
  }

  const handleHeightChange = (val) => {
    const h = Math.max(16, Math.min(8192, parseInt(val, 10) || 16))
    setHeight(h)
    if (lockRatio && imgEl) {
      const ratio = imgEl.naturalWidth / imgEl.naturalHeight
      setWidth(Math.round(h * ratio))
    }
  }

  const applyScalePercent = (pct) => {
    if (!imgEl) return
    const w = Math.round((imgEl.naturalWidth * pct) / 100)
    const h = Math.round((imgEl.naturalHeight * pct) / 100)
    setWidth(w)
    setHeight(h)
  }

  useEffect(() => {
    if (!imgEl || !previewCanvasRef.current) return
    const canvas = previewCanvasRef.current
    canvas.width = Math.min(width, 1200)
    canvas.height = Math.round(canvas.width * (height / width))
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(imgEl, 0, 0, canvas.width, canvas.height)
  }, [imgEl, width, height])

  const handleDownload = () => {
    if (!imgEl) return
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(imgEl, 0, 0, width, height)

    canvas.toBlob((blob) => {
      if (blob) {
        const ext = format === 'image/jpeg' ? '.jpg' : format === 'image/webp' ? '.webp' : '.png'
        const outName = (file?.name ? file.name.replace(/\.[^.]+$/, '') : 'resized') + `_${width}x${height}${ext}`
        dlBlob(blob, outName)
      }
    }, format, quality / 100)
  }

  return (
    <div>
      {!imgEl ? (
        <ImageUploader onImage={handleImage} label="Drop image to resize" />
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 15, color: '#0d0d1a', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Maximize2 size={16} style={{ color: '#4F8EF7' }} /> Smart Image Resizer
              </div>
              <div style={{ fontSize: 12, color: '#888' }}>
                Original: {imgEl.naturalWidth} × {imgEl.naturalHeight} px · Target: {width} × {height} px
              </div>
            </div>
            <button className="btn btn-outline btn-sm" onClick={() => { setImgEl(null); setFile(null) }}>
              Change Image
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 16 }}>
            <div className="fgrp">
              <label className="lbl">Width (px)</label>
              <input className="inp" type="number" min="16" max="8192" value={width} onChange={e => handleWidthChange(e.target.value)} />
            </div>
            <div className="fgrp">
              <label className="lbl">Height (px)</label>
              <input className="inp" type="number" min="16" max="8192" value={height} onChange={e => handleHeightChange(e.target.value)} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#333', cursor: 'pointer' }}>
              <input type="checkbox" checked={lockRatio} onChange={e => setLockRatio(e.target.checked)} />
              <Lock size={13} style={{ color: '#4F8EF7' }} /> Maintain Aspect Ratio
            </label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[25, 50, 75, 100, 150, 200].map(pct => (
                <button key={pct} type="button" className="btn btn-secondary btn-sm" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => applyScalePercent(pct)}>
                  {pct}%
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 16 }}>
            <div className="fgrp">
              <label className="lbl">Output Format</label>
              <select className="inp" value={format} onChange={e => setFormat(e.target.value)}>
                <option value="image/png">PNG (Lossless)</option>
                <option value="image/jpeg">JPEG</option>
                <option value="image/webp">WebP (Modern)</option>
              </select>
            </div>
            {format !== 'image/png' && (
              <Slider label="Quality" value={quality} min={20} max={100} unit="%" onChange={e => setQuality(+e.target.value)} />
            )}
          </div>

          <div style={{ textAlign: 'center', background: '#fafafa', borderRadius: 14, padding: 16, border: '1px solid rgba(0,0,0,0.06)', marginBottom: 16 }}>
            <canvas ref={previewCanvasRef} style={{ maxWidth: '100%', maxHeight: 320, borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }} />
          </div>

          <button className="btn btn-primary btn-w btn-lg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }} onClick={handleDownload}>
            <Download size={16} /> Download Resized Image ({width} × {height} px)
          </button>
        </div>
      )}
    </div>
  )
}

function CompressStudio() {
  const [file, setFile] = useState(null)
  const [imgEl, setImgEl] = useState(null)
  const [imgUrl, setImgUrl] = useState('')
  const [quality, setQuality] = useState(75)
  const [format, setFormat] = useState('image/jpeg')
  const [compBlob, setCompBlob] = useState(null)
  const [compUrl, setCompUrl] = useState('')

  useEffect(() => {
    return () => {
      if (imgUrl) URL.revokeObjectURL(imgUrl)
      if (compUrl) URL.revokeObjectURL(compUrl)
    }
  }, [imgUrl, compUrl])

  const handleImage = (f) => {
    if (!f || !f.type.startsWith('image/')) return
    setFile(f)
    if (imgUrl) URL.revokeObjectURL(imgUrl)
    const url = URL.createObjectURL(f)
    setImgUrl(url)
    const img = new Image()
    img.onload = () => setImgEl(img)
    img.src = url
  }

  useEffect(() => {
    if (!imgEl) return
    const canvas = document.createElement('canvas')
    canvas.width = imgEl.naturalWidth
    canvas.height = imgEl.naturalHeight
    const ctx = canvas.getContext('2d')
    if (format === 'image/jpeg') {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    ctx.drawImage(imgEl, 0, 0)

    canvas.toBlob((blob) => {
      if (blob) {
        setCompBlob(blob)
        if (compUrl) URL.revokeObjectURL(compUrl)
        setCompUrl(URL.createObjectURL(blob))
      }
    }, format, quality / 100)
  }, [imgEl, quality, format])

  const origSize = file ? (file.size / 1024).toFixed(1) : 0
  const newSize = compBlob ? (compBlob.size / 1024).toFixed(1) : 0
  const pctSaved = file && compBlob ? Math.max(0, ((file.size - compBlob.size) / file.size) * 100).toFixed(1) : 0

  return (
    <div>
      {!imgEl ? (
        <ImageUploader onImage={handleImage} label="Drop image to compress" />
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 15, color: '#0d0d1a', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Minimize2 size={16} style={{ color: '#4F8EF7' }} /> Real Image Compressor
              </div>
              <div style={{ fontSize: 12, color: '#888' }}>
                Before: {origSize} KB → After: {newSize} KB ({pctSaved}% saved)
              </div>
            </div>
            <button className="btn btn-outline btn-sm" onClick={() => { setImgEl(null); setFile(null) }}>
              Change Image
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 16 }}>
            <div className="fgrp">
              <label className="lbl">Compression Format</label>
              <select className="inp" value={format} onChange={e => setFormat(e.target.value)}>
                <option value="image/jpeg">JPEG (Universal)</option>
                <option value="image/webp">WebP (High Efficiency)</option>
              </select>
            </div>
            <Slider label="Quality Factor" value={quality} min={10} max={95} unit="%" onChange={e => setQuality(+e.target.value)} />
          </div>

          <div style={{ display: 'flex', gap: 14, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200, padding: 14, background: '#fafafa', borderRadius: 12, border: '1px solid #eee', textAlign: 'center' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase' }}>Original File</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#0d0d1a', marginTop: 4 }}>{origSize} KB</div>
              <div style={{ fontSize: 11.5, color: '#999' }}>{file?.type}</div>
            </div>
            <div style={{ flex: 1, minWidth: 200, padding: 14, background: '#eff6ff', borderRadius: 12, border: '1px solid #bfdbfe', textAlign: 'center' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase' }}>Compressed Output</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#1d4ed8', marginTop: 4 }}>{newSize} KB</div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#22c55e' }}>-{pctSaved}% Reduction</div>
            </div>
          </div>

          {compUrl && (
            <div style={{ textAlign: 'center', background: '#fafafa', borderRadius: 14, padding: 16, border: '1px solid rgba(0,0,0,0.06)', marginBottom: 16 }}>
              <img src={compUrl} alt="Compressed preview" style={{ maxWidth: '100%', maxHeight: 320, borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }} />
            </div>
          )}

          <button className="btn btn-primary btn-w btn-lg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }} onClick={() => compBlob && dlBlob(compBlob, (file?.name ? file.name.replace(/\.[^.]+$/, '') : 'compressed') + `_compressed.${format === 'image/webp' ? 'webp' : 'jpg'}`)}>
            <Download size={16} /> Download Compressed File ({newSize} KB)
          </button>
        </div>
      )}
    </div>
  )
}

function ConvertStudio() {
  const [file, setFile] = useState(null)
  const [imgEl, setImgEl] = useState(null)
  const [imgUrl, setImgUrl] = useState('')
  const [format, setFormat] = useState('image/png')
  const [bgColor, setBgColor] = useState('#ffffff')
  const [quality, setQuality] = useState(90)

  useEffect(() => {
    return () => { if (imgUrl) URL.revokeObjectURL(imgUrl) }
  }, [imgUrl])

  const handleImage = (f) => {
    if (!f || !f.type.startsWith('image/')) return
    setFile(f)
    if (imgUrl) URL.revokeObjectURL(imgUrl)
    const url = URL.createObjectURL(f)
    setImgUrl(url)
    const img = new Image()
    img.onload = () => setImgEl(img)
    img.src = url
  }

  const handleConvert = () => {
    if (!imgEl) return
    const canvas = document.createElement('canvas')
    canvas.width = imgEl.naturalWidth
    canvas.height = imgEl.naturalHeight
    const ctx = canvas.getContext('2d')

    if (format === 'image/jpeg') {
      ctx.fillStyle = bgColor
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    ctx.drawImage(imgEl, 0, 0)

    canvas.toBlob((blob) => {
      if (blob) {
        const ext = format === 'image/jpeg' ? '.jpg' : format === 'image/webp' ? '.webp' : '.png'
        const baseName = file?.name ? file.name.replace(/\.[^.]+$/, '') : 'converted'
        dlBlob(blob, `${baseName}_converted${ext}`)
      }
    }, format, quality / 100)
  }

  return (
    <div>
      {!imgEl ? (
        <ImageUploader onImage={handleImage} label="Drop image to convert format" />
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 15, color: '#0d0d1a', display: 'flex', alignItems: 'center', gap: 6 }}>
                <RefreshCw size={16} style={{ color: '#4F8EF7' }} /> Image Format Converter
              </div>
              <div style={{ fontSize: 12, color: '#888' }}>
                Current format: {file?.type} · Resolution: {imgEl.naturalWidth} × {imgEl.naturalHeight} px
              </div>
            </div>
            <button className="btn btn-outline btn-sm" onClick={() => { setImgEl(null); setFile(null) }}>
              Change Image
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 16 }}>
            <div className="fgrp">
              <label className="lbl">Target Format</label>
              <select className="inp" value={format} onChange={e => setFormat(e.target.value)}>
                <option value="image/png">PNG (Preserves Transparency)</option>
                <option value="image/jpeg">JPEG (Universal)</option>
                <option value="image/webp">WebP (Modern Compact)</option>
              </select>
            </div>
            {format === 'image/jpeg' ? (
              <div className="fgrp">
                <label className="lbl">Background Color (for alpha replacement)</label>
                <input className="inp" type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} style={{ height: 42, padding: 4 }} />
              </div>
            ) : (
              <Slider label="Quality" value={quality} min={20} max={100} unit="%" onChange={e => setQuality(+e.target.value)} />
            )}
          </div>

          <div style={{ textAlign: 'center', background: '#fafafa', borderRadius: 14, padding: 16, border: '1px solid rgba(0,0,0,0.06)', marginBottom: 16 }}>
            <img src={imgUrl} alt="Preview" style={{ maxWidth: '100%', maxHeight: 320, borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }} />
          </div>

          <button className="btn btn-primary btn-w btn-lg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }} onClick={handleConvert}>
            <Zap size={16} /> Convert & Download ({format.replace('image/', '').toUpperCase()})
          </button>
        </div>
      )}
    </div>
  )
}

function RotateFlipStudio() {
  const [file, setFile] = useState(null)
  const [imgEl, setImgEl] = useState(null)
  const [imgUrl, setImgUrl] = useState('')
  const [angle, setAngle] = useState(0)
  const [flipH, setFlipH] = useState(false)
  const [flipV, setFlipV] = useState(false)
  const previewCanvasRef = useRef(null)

  useEffect(() => {
    return () => { if (imgUrl) URL.revokeObjectURL(imgUrl) }
  }, [imgUrl])

  const handleImage = (f) => {
    if (!f || !f.type.startsWith('image/')) return
    setFile(f)
    if (imgUrl) URL.revokeObjectURL(imgUrl)
    const url = URL.createObjectURL(f)
    setImgUrl(url)
    const img = new Image()
    img.onload = () => setImgEl(img)
    img.src = url
    setAngle(0)
    setFlipH(false)
    setFlipV(false)
  }

  useEffect(() => {
    if (!imgEl || !previewCanvasRef.current) return
    const canvas = previewCanvasRef.current
    const isRotated = angle === 90 || angle === 270
    const cw = isRotated ? imgEl.naturalHeight : imgEl.naturalWidth
    const ch = isRotated ? imgEl.naturalWidth : imgEl.naturalHeight

    canvas.width = cw
    canvas.height = ch
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, cw, ch)
    ctx.save()

    ctx.translate(cw / 2, ch / 2)
    ctx.rotate((angle * Math.PI) / 180)
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1)
    ctx.drawImage(imgEl, -imgEl.naturalWidth / 2, -imgEl.naturalHeight / 2)
    ctx.restore()
  }, [imgEl, angle, flipH, flipV])

  const handleDownload = () => {
    if (!imgEl) return
    const isRotated = angle === 90 || angle === 270
    const cw = isRotated ? imgEl.naturalHeight : imgEl.naturalWidth
    const ch = isRotated ? imgEl.naturalWidth : imgEl.naturalHeight

    const off = document.createElement('canvas')
    off.width = cw
    off.height = ch
    const ctx = off.getContext('2d')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.translate(cw / 2, ch / 2)
    ctx.rotate((angle * Math.PI) / 180)
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1)
    ctx.drawImage(imgEl, -imgEl.naturalWidth / 2, -imgEl.naturalHeight / 2)

    off.toBlob((blob) => {
      if (blob) {
        const baseName = file?.name ? file.name.replace(/\.[^.]+$/, '') : 'transformed'
        dlBlob(blob, `${baseName}_r${angle}${flipH ? '_fh' : ''}${flipV ? '_fv' : ''}.png`)
      }
    }, 'image/png')
  }

  return (
    <div>
      {!imgEl ? (
        <ImageUploader onImage={handleImage} label="Drop image to rotate or flip" />
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 15, color: '#0d0d1a', display: 'flex', alignItems: 'center', gap: 6 }}>
                <RotateCw size={16} style={{ color: '#4F8EF7' }} /> Rotate & Flip Studio
              </div>
              <div style={{ fontSize: 12, color: '#888' }}>
                Rotation: {angle}° · Flip: {flipH ? 'H' : ''}{flipV ? 'V' : ''} {!flipH && !flipV ? 'None' : ''}
              </div>
            </div>
            <button className="btn btn-outline btn-sm" onClick={() => { setImgEl(null); setFile(null) }}>
              Change Image
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            <button type="button" className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={() => setAngle(a => (a + 90) % 360)}>
              <RotateCw size={13} /> Rotate 90° CW
            </button>
            <button type="button" className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={() => setAngle(a => (a + 270) % 360)}>
              <RotateCw size={13} style={{ transform: 'scaleX(-1)' }} /> Rotate 90° CCW
            </button>
            <button type="button" className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={() => setAngle(a => (a + 180) % 360)}>
              <RefreshCw size={13} /> 180° Flip
            </button>
            <button type="button" className={`btn btn-sm ${flipH ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFlipH(f => !f)}>
              Flip Horizontal
            </button>
            <button type="button" className={`btn btn-sm ${flipV ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFlipV(f => !f)}>
              Flip Vertical
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => { setAngle(0); setFlipH(false); setFlipV(false) }}>
              Reset
            </button>
          </div>

          <div style={{ textAlign: 'center', background: '#fafafa', borderRadius: 14, padding: 16, border: '1px solid rgba(0,0,0,0.06)', marginBottom: 16 }}>
            <canvas ref={previewCanvasRef} style={{ maxWidth: '100%', maxHeight: 360, borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }} />
          </div>

          <button className="btn btn-primary btn-w btn-lg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }} onClick={handleDownload}>
            <Download size={16} /> Download Transformed Image (PNG)
          </button>
        </div>
      )}
    </div>
  )
}

function AdjustFilterStudio() {
  const [file, setFile] = useState(null)
  const [imgEl, setImgEl] = useState(null)
  const [imgUrl, setImgUrl] = useState('')
  const [brightness, setBrightness] = useState(100)
  const [contrast, setContrast] = useState(100)
  const [saturation, setSaturation] = useState(100)
  const [grayscale, setGrayscale] = useState(0)
  const [sepia, setSepia] = useState(0)
  const [blur, setBlur] = useState(0)
  const previewCanvasRef = useRef(null)

  useEffect(() => {
    return () => { if (imgUrl) URL.revokeObjectURL(imgUrl) }
  }, [imgUrl])

  const handleImage = (f) => {
    if (!f || !f.type.startsWith('image/')) return
    setFile(f)
    if (imgUrl) URL.revokeObjectURL(imgUrl)
    const url = URL.createObjectURL(f)
    setImgUrl(url)
    const img = new Image()
    img.onload = () => setImgEl(img)
    img.src = url
  }

  const applyPreset = (name) => {
    if (name === 'normal') {
      setBrightness(100); setContrast(100); setSaturation(100); setGrayscale(0); setSepia(0); setBlur(0)
    } else if (name === 'bw') {
      setBrightness(100); setContrast(125); setSaturation(0); setGrayscale(100); setSepia(0); setBlur(0)
    } else if (name === 'sepia') {
      setBrightness(95); setContrast(110); setSaturation(90); setGrayscale(0); setSepia(80); setBlur(0)
    } else if (name === 'dramatic') {
      setBrightness(105); setContrast(140); setSaturation(130); setGrayscale(0); setSepia(0); setBlur(0)
    } else if (name === 'warm') {
      setBrightness(105); setContrast(105); setSaturation(120); setGrayscale(0); setSepia(25); setBlur(0)
    } else if (name === 'soft') {
      setBrightness(110); setContrast(95); setSaturation(105); setGrayscale(0); setSepia(0); setBlur(1)
    }
  }

  useEffect(() => {
    if (!imgEl || !previewCanvasRef.current) return
    const canvas = previewCanvasRef.current
    canvas.width = imgEl.naturalWidth
    canvas.height = imgEl.naturalHeight
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) grayscale(${grayscale}%) sepia(${sepia}%) blur(${blur}px)`
    ctx.drawImage(imgEl, 0, 0)
  }, [imgEl, brightness, contrast, saturation, grayscale, sepia, blur])

  const handleDownload = () => {
    if (!imgEl) return
    const off = document.createElement('canvas')
    off.width = imgEl.naturalWidth
    off.height = imgEl.naturalHeight
    const ctx = off.getContext('2d')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) grayscale(${grayscale}%) sepia(${sepia}%) blur(${blur}px)`
    ctx.drawImage(imgEl, 0, 0)

    off.toBlob((blob) => {
      if (blob) {
        const baseName = file?.name ? file.name.replace(/\.[^.]+$/, '') : 'adjusted'
        dlBlob(blob, `${baseName}_adjusted.png`)
      }
    }, 'image/png')
  }

  return (
    <div>
      {!imgEl ? (
        <ImageUploader onImage={handleImage} label="Drop image to adjust colors & filters" />
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 15, color: '#0d0d1a', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Sliders size={16} style={{ color: '#4F8EF7' }} /> Adjustments & Filter Studio
              </div>
              <div style={{ fontSize: 12, color: '#888' }}>
                Resolution: {imgEl.naturalWidth} × {imgEl.naturalHeight} px
              </div>
            </div>
            <button className="btn btn-outline btn-sm" onClick={() => { setImgEl(null); setFile(null) }}>
              Change Image
            </button>
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {[
              { id: 'normal', label: 'Default' },
              { id: 'bw', label: 'Classic B&W' },
              { id: 'sepia', label: 'Vintage Sepia' },
              { id: 'dramatic', label: 'Dramatic' },
              { id: 'warm', label: 'Warm Sunlight' },
              { id: 'soft', label: 'Soft Dream' },
            ].map(p => (
              <button key={p.id} type="button" className="btn btn-secondary btn-sm" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => applyPreset(p.id)}>
                {p.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
            <Slider label="Brightness" value={brightness} min={50} max={160} unit="%" onChange={e => setBrightness(+e.target.value)} />
            <Slider label="Contrast" value={contrast} min={50} max={160} unit="%" onChange={e => setContrast(+e.target.value)} />
            <Slider label="Saturation" value={saturation} min={0} max={200} unit="%" onChange={e => setSaturation(+e.target.value)} />
            <Slider label="Grayscale" value={grayscale} min={0} max={100} unit="%" onChange={e => setGrayscale(+e.target.value)} />
            <Slider label="Sepia" value={sepia} min={0} max={100} unit="%" onChange={e => setSepia(+e.target.value)} />
            <Slider label="Blur" value={blur} min={0} max={10} unit="px" onChange={e => setBlur(+e.target.value)} />
          </div>

          <div style={{ textAlign: 'center', background: '#fafafa', borderRadius: 14, padding: 16, border: '1px solid rgba(0,0,0,0.06)', marginBottom: 16 }}>
            <canvas ref={previewCanvasRef} style={{ maxWidth: '100%', maxHeight: 360, borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }} />
          </div>

          <button className="btn btn-primary btn-w btn-lg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }} onClick={handleDownload}>
            <Download size={16} /> Download Adjusted Image (PNG)
          </button>
        </div>
      )}
    </div>
  )
}

function PaletteStudio() {
  const [file, setFile] = useState(null)
  const [imgUrl, setImgUrl] = useState('')
  const [colors, setColors] = useState([])
  const [copiedColor, setCopiedColor] = useState('')

  useEffect(() => {
    return () => { if (imgUrl) URL.revokeObjectURL(imgUrl) }
  }, [imgUrl])

  const handleImage = (f) => {
    if (!f || !f.type.startsWith('image/')) return
    setFile(f)
    if (imgUrl) URL.revokeObjectURL(imgUrl)
    const url = URL.createObjectURL(f)
    setImgUrl(url)
    const img = new Image()
    img.onload = () => {
      extractPalette(img)
    }
    img.src = url
  }

  const extractPalette = (img) => {
    const canvas = document.createElement('canvas')
    const size = 100
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0, size, size)
    const data = ctx.getImageData(0, 0, size, size).data

    const bucketMap = new Map()
    for (let i = 0; i < data.length; i += 16) {
      const a = data[i + 3]
      if (a < 128) continue
      const r = Math.round(data[i] / 24) * 24
      const g = Math.round(data[i + 1] / 24) * 24
      const b = Math.round(data[i + 2] / 24) * 24
      const key = `${r},${g},${b}`
      bucketMap.set(key, (bucketMap.get(key) || 0) + 1)
    }

    const sorted = Array.from(bucketMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)

    const hexPalette = sorted.map(([k]) => {
      const [r, g, b] = k.split(',').map(Number)
      const hex = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')
      return { hex: hex.toUpperCase(), rgb: `rgb(${r}, ${g}, ${b})` }
    })
    setColors(hexPalette)
  }

  const copyHex = (hex) => {
    navigator.clipboard?.writeText(hex)
    setCopiedColor(hex)
    setTimeout(() => setCopiedColor(''), 1500)
  }

  return (
    <div>
      {!imgUrl ? (
        <ImageUploader onImage={handleImage} label="Drop image to extract color palette" />
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 15, color: '#0d0d1a', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Palette size={16} style={{ color: '#4F8EF7' }} /> Dominant Color Palette Extractor
              </div>
              <div style={{ fontSize: 12, color: '#888' }}>
                Extracted top dominant color clusters directly from image pixels
              </div>
            </div>
            <button className="btn btn-outline btn-sm" onClick={() => { setImgUrl(''); setFile(null); setColors([]) }}>
              Change Image
            </button>
          </div>

          <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
            <img src={imgUrl} alt="Sample" style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 12, border: '1px solid #ddd' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#0d0d1a' }}>{file?.name}</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Click any color card to copy its HEX value</div>
              {copiedColor && (
                <div style={{ fontSize: 12, fontWeight: 700, color: '#22c55e', marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <Check size={13} /> Copied {copiedColor} to clipboard!
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 110px), 1fr))', gap: 10, width: '100%', boxSizing: 'border-box' }}>
            {colors.map((c, i) => (
              <div
                key={i}
                onClick={() => copyHex(c.hex)}
                style={{
                  padding: 12,
                  background: '#fafafa',
                  borderRadius: 12,
                  border: '1px solid #eee',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'transform .15s',
                }}>
                <div style={{ height: 48, borderRadius: 8, background: c.hex, marginBottom: 8, border: '1px solid rgba(0,0,0,0.1)' }} />
                <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 13, color: '#0d0d1a' }}>{c.hex}</div>
                <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>{c.rgb}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ImageToPdfStudio() {
  const [images, setImages] = useState([])
  const [pageSize, setPageSize] = useState('A4')
  const [orientation, setOrientation] = useState('portrait')
  const [margin, setMargin] = useState(18)
  const [generating, setGenerating] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const imagesRef = useRef(images)
  imagesRef.current = images
  useEffect(() => {
    return () => {
      imagesRef.current.forEach(item => {
        if (item.url) {
          try { URL.revokeObjectURL(item.url) } catch {}
        }
      })
    }
  }, [])

  const handleFiles = (fileList) => {
    const files = Array.from(fileList).filter(f => f.type.startsWith('image/'))
    if (!files.length) return
    const newItems = files.map(f => ({
      id: Math.random().toString(36).slice(2),
      file: f,
      name: f.name,
      url: URL.createObjectURL(f),
    }))
    setImages(prev => [...prev, ...newItems])
  }

  const moveItem = (index, dir) => {
    setImages(prev => {
      const next = [...prev]
      const target = index + dir
      if (target < 0 || target >= next.length) return prev
      const temp = next[index]
      next[index] = next[target]
      next[target] = temp
      return next
    })
  }

  const removeItem = (id) => {
    setImages(prev => {
      const item = prev.find(x => x.id === id)
      if (item) URL.revokeObjectURL(item.url)
      return prev.filter(x => x.id !== id)
    })
  }

  const generatePdf = async () => {
    if (!images.length) return
    setGenerating(true)
    setErrorMsg('')
    try {
      const pdfDoc = await PDFDocument.create()

      for (const item of images) {
        const arrayBuf = await item.file.arrayBuffer()
        let embeddedImage

        if (item.file.type === 'image/jpeg' || item.file.type === 'image/jpg') {
          embeddedImage = await pdfDoc.embedJpg(arrayBuf)
        } else if (item.file.type === 'image/png') {
          embeddedImage = await pdfDoc.embedPng(arrayBuf)
        } else {
          const img = new Image()
          await new Promise((res, rej) => {
            img.onload = res
            img.onerror = rej
            img.src = item.url
          })
          const c = document.createElement('canvas')
          c.width = img.naturalWidth
          c.height = img.naturalHeight
          const ctx = c.getContext('2d')
          ctx.drawImage(img, 0, 0)
          const pngBlob = await new Promise(r => c.toBlob(r, 'image/png'))
          const pngBuf = await pngBlob.arrayBuffer()
          embeddedImage = await pdfDoc.embedPng(pngBuf)
        }

        const imgDims = embeddedImage.scale(1)
        let pageW, pageH

        if (pageSize === 'fit') {
          pageW = imgDims.width + margin * 2
          pageH = imgDims.height + margin * 2
        } else {
          const dims = pageSize === 'Letter' ? [612, 792] : [595.28, 841.89]
          if (orientation === 'landscape') {
            pageW = dims[1]
            pageH = dims[0]
          } else {
            pageW = dims[0]
            pageH = dims[1]
          }
        }

        const page = pdfDoc.addPage([pageW, pageH])
        const availW = pageW - margin * 2
        const availH = pageH - margin * 2

        const scale = Math.min(availW / imgDims.width, availH / imgDims.height, 1)
        const drawW = imgDims.width * scale
        const drawH = imgDims.height * scale
        const drawX = margin + (availW - drawW) / 2
        const drawY = margin + (availH - drawH) / 2

        page.drawImage(embeddedImage, {
          x: drawX,
          y: drawY,
          width: drawW,
          height: drawH,
        })
      }

      const pdfBytes = await pdfDoc.save()
      const blob = new Blob([pdfBytes], { type: 'application/pdf' })
      dlBlob(blob, 'converted_images.pdf')
    } catch (err) {
      setErrorMsg(err?.message || 'Failed to generate PDF document.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 15, color: '#0d0d1a', display: 'flex', alignItems: 'center', gap: 6 }}>
            <FileText size={16} style={{ color: '#4F8EF7' }} /> Image to PDF Converter
          </div>
          <div style={{ fontSize: 12, color: '#888' }}>
            Combine single or multiple photos into a crisp, vector-scaled PDF document
          </div>
        </div>
      </div>

      <div className="fgrp">
        <label className="btn btn-outline btn-w" style={{ cursor: 'pointer', textAlign: 'center', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <UploadCloud size={16} /> Select / Add Images
          <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => handleFiles(e.target.files)} />
        </label>
      </div>

      {images.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
            <div className="fgrp">
              <label className="lbl">Page Size</label>
              <select className="inp" value={pageSize} onChange={e => setPageSize(e.target.value)}>
                <option value="A4">A4 (Standard)</option>
                <option value="Letter">US Letter</option>
                <option value="fit">Fit to Image</option>
              </select>
            </div>
            <div className="fgrp">
              <label className="lbl">Orientation</label>
              <select className="inp" value={orientation} onChange={e => setOrientation(e.target.value)}>
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </div>
            <div className="fgrp">
              <label className="lbl">Margin</label>
              <select className="inp" value={margin} onChange={e => setMargin(+e.target.value)}>
                <option value={0}>No Margin</option>
                <option value={18}>Compact (18pt)</option>
                <option value={36}>Standard (36pt)</option>
              </select>
            </div>
          </div>

          <div style={{ background: '#fafafa', borderRadius: 14, padding: 14, border: '1px solid #eee', marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#666', marginBottom: 8 }}>
              Pages ({images.length} image{images.length !== 1 ? 's' : ''})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
              {images.map((item, idx) => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, background: '#fff', borderRadius: 8, border: '1px solid #e5e5e5' }}>
                  <img src={item.url} alt="Thumb" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4 }} />
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: '#333', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {idx + 1}. {item.name}
                  </span>
                  <button type="button" className="btn btn-secondary btn-sm" style={{ padding: '4px 6px', display: 'inline-flex', alignItems: 'center' }} onClick={() => moveItem(idx, -1)} disabled={idx === 0}>
                    <ArrowUp size={13} />
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" style={{ padding: '4px 6px', display: 'inline-flex', alignItems: 'center' }} onClick={() => moveItem(idx, 1)} disabled={idx === images.length - 1}>
                    <ArrowDown size={13} />
                  </button>
                  <button type="button" className="btn btn-outline btn-sm" style={{ padding: '4px 6px', color: '#ef4444', display: 'inline-flex', alignItems: 'center' }} onClick={() => removeItem(item.id)}>
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {errorMsg && (
            <div style={{ color: '#ef4444', fontSize: 12, fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
              <AlertTriangle size={14} /> {errorMsg}
            </div>
          )}

          <button className="btn btn-primary btn-w btn-lg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }} onClick={generatePdf} disabled={generating}>
            {generating ? <Loader2 size={16} className="spin" /> : <FileText size={16} />}
            {generating ? 'Building PDF Document…' : `Export ${images.length} Image(s) as PDF`}
          </button>
        </div>
      )}
    </div>
  )
}

function BatchStudio() {
  const [queue, setQueue] = useState([])
  const [action, setAction] = useState('webp')
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)

  const handleFiles = (fileList) => {
    const files = Array.from(fileList).filter(f => f.type.startsWith('image/')).slice(0, 10)
    if (!files.length) return
    const newItems = files.map(f => ({
      id: Math.random().toString(36).slice(2),
      file: f,
      name: f.name,
      size: (f.size / 1024).toFixed(1) + ' KB',
      status: 'QUEUED',
      outBlob: null,
      outName: '',
      error: '',
    }))
    setQueue(prev => [...prev, ...newItems])
  }

  const runBatch = async () => {
    if (!queue.length || processing) return
    setProcessing(true)
    setProgress(0)

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i]
      if (item.status === 'SUCCESS' && item.outBlob) continue

      setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, status: 'PROCESSING' } : q))

      let url = null
      let canvas = null
      try {
        url = URL.createObjectURL(item.file)
        const img = new Image()
        await new Promise((res, rej) => {
          img.onload = res
          img.onerror = rej
          img.src = url
        })

        canvas = document.createElement('canvas')
        const scale = action === 'scale50' ? 0.5 : 1
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'

        let format = 'image/png'
        let quality = 0.9
        let ext = '.png'

        if (action === 'webp') {
          format = 'image/webp'
          quality = 0.85
          ext = '.webp'
        } else if (action === 'jpg' || action === 'comp70') {
          format = 'image/jpeg'
          quality = action === 'comp70' ? 0.7 : 0.85
          ext = '.jpg'
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
        }

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

        const outBlob = await new Promise(r => canvas.toBlob(r, format, quality))
        const outName = item.name.replace(/\.[^.]+$/, '') + `_${action}${ext}`

        setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, status: 'SUCCESS', outBlob, outName } : q))
      } catch (err) {
        setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, status: 'FAILED', error: err?.message || 'Failed' } : q))
      } finally {
        if (url) {
          try { URL.revokeObjectURL(url) } catch {}
        }
        if (canvas) {
          canvas.width = 1
          canvas.height = 1
        }
      }

      setProgress(Math.round(((i + 1) / queue.length) * 100))
    }

    setProcessing(false)
  }

  const downloadAllZip = async () => {
    const successItems = queue.filter(q => q.status === 'SUCCESS' && q.outBlob)
    if (!successItems.length) return

    const zip = new JSZip()
    for (const item of successItems) {
      zip.file(item.outName, item.outBlob)
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' })
    dlBlob(zipBlob, 'batch_processed_images.zip')
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 15, color: '#0d0d1a', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Zap size={16} style={{ color: '#4F8EF7' }} /> Batch Processing Studio
          </div>
          <div style={{ fontSize: 12, color: '#888' }}>
            Process multiple images in bulk (Convert, Resize, Compress) with ZIP archive export
          </div>
        </div>
      </div>

      <div className="fgrp">
        <label className="btn btn-outline btn-w" style={{ cursor: 'pointer', textAlign: 'center', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <UploadCloud size={16} /> Upload Files for Batch Queue (Max 10)
          <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => handleFiles(e.target.files)} />
        </label>
      </div>

      {queue.length > 0 && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 16 }}>
            <div className="fgrp">
              <label className="lbl">Batch Operation</label>
              <select className="inp" value={action} onChange={e => setAction(e.target.value)}>
                <option value="webp">Convert to WebP (85% Quality)</option>
                <option value="png">Convert to PNG (Lossless)</option>
                <option value="jpg">Convert to JPEG (85% Quality)</option>
                <option value="scale50">Scale Down 50%</option>
                <option value="comp70">Compress JPEG (70% Quality)</option>
              </select>
            </div>
          </div>

          <div style={{ background: '#fafafa', borderRadius: 14, padding: 14, border: '1px solid #eee', marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#666' }}>
                Queue ({queue.length} file{queue.length !== 1 ? 's' : ''})
              </div>
              <button type="button" className="btn btn-outline btn-sm" style={{ padding: '2px 8px' }} onClick={() => setQueue([])}>
                Clear Queue
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
              {queue.map((item, idx) => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#fff', borderRadius: 8, border: '1px solid #eee' }}>
                  <div style={{ minWidth: 0, flex: 1, paddingRight: 10 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {idx + 1}. {item.name}
                    </div>
                    <div style={{ fontSize: 11, color: '#999' }}>{item.size}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: 4,
                      background: item.status === 'SUCCESS' ? 'rgba(34,197,94,.1)' : item.status === 'PROCESSING' ? 'rgba(79,142,247,.1)' : item.status === 'FAILED' ? 'rgba(239,68,68,.1)' : 'rgba(0,0,0,.05)',
                      color: item.status === 'SUCCESS' ? '#22c55e' : item.status === 'PROCESSING' ? '#4F8EF7' : item.status === 'FAILED' ? '#ef4444' : '#888',
                    }}>
                      {item.status}
                    </span>
                    {item.outBlob && (
                      <button type="button" className="btn btn-secondary btn-sm" style={{ padding: '4px 8px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={() => dlBlob(item.outBlob, item.outName)}>
                        <Download size={12} /> Save
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {processing && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#666', marginBottom: 6 }}>
                Processing queue ({progress}%)…
              </div>
              <div style={{ width: '100%', height: 6, background: '#eee', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${progress}%`, height: '100%', background: '#4F8EF7', transition: 'width .2s' }} />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary btn-lg" style={{ flex: 2, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }} onClick={runBatch} disabled={processing}>
              {processing ? <Loader2 size={16} className="spin" /> : <Zap size={16} />}
              {processing ? 'Processing Batch…' : 'Start Batch Processing'}
            </button>
            {queue.some(q => q.status === 'SUCCESS') && (
              <button className="btn btn-secondary btn-lg" style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }} onClick={downloadAllZip}>
                <Archive size={16} /> Download All (ZIP)
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const TABS = [
  { id:'crop',       icon: Crop,        label:'Crop Image',            desc:'True manual crop with 8 handles & exact pixel coordinates' },
  { id:'redact',     icon: EyeOff,      label:'Image Redactor',        desc:'Permanent blur, pixelate & blackout privacy redaction' },
  { id:'ocr',        icon: ScanText,    label:'Image to Text (OCR)',   desc:'Extract authentic text from images & documents with Tesseract' },
  { id:'dpi',        icon: ScanSearch,  label:'Image DPI & Resolution',desc:'Authentic DPI metadata & print size calculator' },
  { id:'resize',     icon: Maximize2,   label:'Resize',         desc:'Resample width & height with presets' },
  { id:'compress',   icon: Minimize2,   label:'Compress',       desc:'Reduce file size with live before/after' },
  { id:'convert',    icon: RefreshCw,   label:'Converter',      desc:'Convert between PNG, JPG, WebP' },
  { id:'rotate',     icon: RotateCw,    label:'Rotate & Flip',  desc:'Rotate 90°/180° and mirror image' },
  { id:'adjust',     icon: Sliders,     label:'Adjust & Filter', desc:'Brightness, contrast, saturation, tones' },
  { id:'palette',    icon: Palette,     label:'Color Palette',  desc:'Extract dominant HEX/RGB palettes' },
  { id:'img2pdf',    icon: FileText,    label:'Image to PDF',   desc:'Convert single or multi-images to PDF' },
  { id:'batch',      icon: Zap,         label:'Batch Studio',   desc:'Batch convert, resize & ZIP download' },
  { id:'border',     icon: Frame,       label:'Border',         desc:'Add stylish borders & shadows' },
  { id:'corner',     icon: Square,      label:'Round Corners',   desc:'Apply border-radius to images' },
  { id:'cornerCSS',  icon: Code2,       label:'CSS Generator',  desc:'Generate border-radius CSS code' },
  { id:'watermark',  icon: Droplets,    label:'Watermarking',   desc:'Apply text & logo overlays in bulk' },
  { id:'exif',       icon: ShieldCheck, label:'EXIF Privacy',    desc:'Inspect & strip location/camera metadata' },
  { id:'wave',       icon: Waves,       label:'Wave & Blob',     desc:'Generate organic SVG waves & blobs' },
]

/* ─────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────── */
export default function ImageToolsStudio() {
  const location = useLocation()
  const initialTab = useMemo(() => {
    if (location.pathname.includes('roundcorner')) return 'corner'
    if (location.pathname.includes('imgborder')) return 'border'
    const params = new URLSearchParams(location.search)
    const tabParam = params.get('tab') || params.get('tool') || location.hash.replace('#', '')
    if (tabParam && TABS.some(t => t.id === tabParam)) return tabParam
    return 'crop'
  }, [location.pathname, location.search, location.hash])

  const [activeTab, setActiveTab] = useState(initialTab)

  useEffect(() => {
    if (location.pathname.includes('roundcorner')) {
      setActiveTab('corner')
    } else if (location.pathname.includes('imgborder')) {
      setActiveTab('border')
    } else {
      const params = new URLSearchParams(location.search)
      const tabParam = params.get('tab') || params.get('tool') || location.hash.replace('#', '')
      if (tabParam && TABS.some(t => t.id === tabParam)) {
        setActiveTab(tabParam)
      }
    }
  }, [location.pathname, location.search, location.hash])

  /* ── BORDER STATE ── */
  const [bImg,       setBImg]      = useState(null)
  const [bPreview,   setBPreview]  = useState('')
  const [bColor,     setBColor]    = useState('#ffffff')
  const [bTop,       setBTop]      = useState(12)
  const [bRight,     setBRight]    = useState(12)
  const [bBottom,    setBBottom]   = useState(12)
  const [bLeft,      setBLeft]     = useState(12)
  const [bShadow,    setBShadow]   = useState(0)
  const [bShadowBlur,setBShadowBlur]=useState(16)
  const [bShadowColor,setBShadowColor]=useState('rgba(0,0,0,.25)')
  const [bUniform,   setBUniform]  = useState(true)
  const [bPreset,    setBPreset]   = useState(null)
  const [bStatus,    setBStatus]   = useState('idle') // idle|saving|done
  const bFileRef = useRef(null)

  /* ── CORNER STATE ── */
  const [cImg,       setCImg]      = useState(null)
  const [cOrigSrc,   setCOrigSrc]  = useState('')
  const [cResult,    setCResult]   = useState('')
  const [cDrag,      setCDrag]     = useState(false)
  const [cTl, setCTl] = useState(24)
  const [cTr, setCTr] = useState(24)
  const [cBr, setCBr] = useState(24)
  const [cBl, setCBl] = useState(24)
  const [cUniform,   setCUniform]  = useState(true)
  const [copied,     copy]         = useCopy()
  const cFileRef = useRef(null)
  const cRenderTimer = useRef(null)
  const PREVIEW_MAX = 800

  /* ── ADVANCED EFFECTS & WATERMARK STATE ── */
  const [fBrightness, setFBrightness] = useState(100)
  const [fContrast,   setFContrast]   = useState(100)
  const [fGrayscale,  setFGrayscale]  = useState(0)
  const [fBlur,       setFBlur]       = useState(0)
  const [wText,       setWText]       = useState('')
  const [wOpacity,    setWOpacity]    = useState(40)

  /* ── BULK WATERMARK STUDIO STATE ── */
  const [wmFiles,     setWmFiles]     = useState([])
  const [wmText,      setWmText]      = useState('© Copyright')
  const [wmTextColor, setWmTextColor] = useState('#ffffff')
  const [wmTextSize,  setWmTextSize]  = useState(45)
  const [wmTextOpacity, setWmTextOpacity] = useState(70)
  const [wmTextPos,   setWmTextPos]   = useState('bottom-right')
  
  const [wmLogoImg,   setWmLogoImg]   = useState(null)
  const wmLogoUrlRef                  = useRef(null)
  const [wmLogoScale, setWmLogoScale] = useState(15)
  const [wmLogoOpacity, setWmLogoOpacity] = useState(60)
  const [wmLogoPos,   setWmLogoPos]   = useState('bottom-left')
  const [wmBulkProcessing, setWmBulkProcessing] = useState(false)
  const [wmBulkProgress, setWmBulkProgress] = useState(0)
  const [wmPreviewUrl, setWmPreviewUrl] = useState('')

  useEffect(() => {
    return () => {
      if (wmLogoUrlRef.current) URL.revokeObjectURL(wmLogoUrlRef.current)
    }
  }, [])

  const filtersData = useMemo(() => ({ brightness: fBrightness, contrast: fContrast, grayscale: fGrayscale, blur: fBlur }), [fBrightness, fContrast, fGrayscale, fBlur])
  const watermarkData = useMemo(() => ({ text: wText, opacity: wOpacity }), [wText, wOpacity])

  const setCAll = useCallback(v=>{setCTl(v);setCTr(v);setCBr(v);setCBl(v)},[])
  const cssText = buildCSS(cTl, cTr, cBr, cBl)
  const typewriter = useTypewriter(cssText)

  /* ── Border: load image ── */
  const loadBorderImage = useCallback(file=>{
    if (!file||!file.type.startsWith('image/')) return
    const url=URL.createObjectURL(file)
    const img=new Image()
    img.onload=()=>{ setBImg(img); URL.revokeObjectURL(url) }
    img.onerror=()=>{ URL.revokeObjectURL(url) }
    img.src=url
  },[])

  /* ── Border: render preview ── */
  useEffect(()=>{
    if (!bImg) return
    try {
      const preview = renderBordered(bImg,{
        color: bColor,
        top: bUniform?bTop:bTop, right: bUniform?bTop:bRight,
        bottom: bUniform?bTop:bBottom, left: bUniform?bTop:bLeft,
        shadow: bShadow, shadowBlur: bShadowBlur, shadowColor: bShadowColor,
      }, filtersData, watermarkData)
      setBPreview(preview)
    } catch(e) { console.warn('Border render error',e) }
  },[bImg,bColor,bTop,bRight,bBottom,bLeft,bShadow,bShadowBlur,bShadowColor,bUniform,filtersData,watermarkData])

  /* ── Border: apply preset ── */
  const applyBorderPreset = useCallback(p=>{
    setBPreset(p.name); setBColor(p.color); setBUniform(true); setBTop(p.bw)
    setBRight(p.bw); setBBottom(p.bw); setBLeft(p.bw)
    setBShadow(p.shadow); setBShadowBlur(p.shadowBlur); setBShadowColor(p.shadowColor)
  },[])

  /* ── Border: download ── */
  const downloadBorder = useCallback(()=>{
    if (!bImg||!bPreview) return
    setBStatus('saving')
    setTimeout(()=>{ dlDataURL(bPreview,'bordered-image.png'); setBStatus('done') },400)
    setTimeout(()=>setBStatus('idle'),2500)
  },[bImg,bPreview])

  /* ── Bulk Watermark: Preview update & Processing ── */
  useEffect(() => {
    if (wmFiles.length === 0) {
      setWmPreviewUrl('')
      return
    }
    const firstFile = wmFiles[0]
    const url = URL.createObjectURL(firstFile)
    const img = new Image()
    let active = true
    img.onload = () => {
      if (!active) { URL.revokeObjectURL(url); return }
      const rendered = renderWatermarked(img, {
        text: wmText,
        color: wmTextColor,
        size: wmTextSize,
        opacity: wmTextOpacity,
        position: wmTextPos
      }, {
        logoImg: wmLogoImg,
        scale: wmLogoScale,
        opacity: wmLogoOpacity,
        position: wmLogoPos
      })
      setWmPreviewUrl(rendered)
      URL.revokeObjectURL(url)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
    }
    img.src = url
    return () => {
      active = false
      URL.revokeObjectURL(url)
    }
  }, [wmFiles, wmText, wmTextColor, wmTextSize, wmTextOpacity, wmTextPos, wmLogoImg, wmLogoScale, wmLogoOpacity, wmLogoPos])

  const applyBulkWatermark = async () => {
    if (wmFiles.length === 0) return
    setWmBulkProcessing(true)
    setWmBulkProgress(0)
    
    try {
      for (let i = 0; i < wmFiles.length; i++) {
        const file = wmFiles[i]
        const url = URL.createObjectURL(file)
        
        await new Promise((resolve) => {
          const img = new Image()
          img.onload = () => {
            try {
              const watermarkedUrl = renderWatermarked(img, {
                text: wmText,
                color: wmTextColor,
                size: wmTextSize,
                opacity: wmTextOpacity,
                position: wmTextPos
              }, {
                logoImg: wmLogoImg,
                scale: wmLogoScale,
                opacity: wmLogoOpacity,
                position: wmLogoPos
              })
              
              const name = (file.name ? file.name.replace(/\.[^.]+$/, '') : 'image') + '-watermarked.png'
              dlDataURL(watermarkedUrl, name)
            } finally {
              URL.revokeObjectURL(url)
              resolve()
            }
          }
          img.onerror = () => {
            URL.revokeObjectURL(url)
            resolve()
          }
          img.src = url
        })
        
        setWmBulkProgress(Math.round(((i + 1) / wmFiles.length) * 100))
        await new Promise(r => setTimeout(r, 200))
      }
      alert('Bulk watermarking completed successfully!')
    } catch (e) {
      alert('Error during bulk processing: ' + e.message)
    } finally {
      setWmBulkProcessing(false)
      setWmBulkProgress(0)
    }
  }

  /* ── Corner: load image ── */
  const cOrigUrlRef = useRef(null)
  useEffect(() => {
    return () => {
      if (cOrigUrlRef.current) URL.revokeObjectURL(cOrigUrlRef.current)
    }
  }, [])
  const loadCornerImage = useCallback(file=>{
    if (!file||!file.type.startsWith('image/')) return
    if (cOrigUrlRef.current) URL.revokeObjectURL(cOrigUrlRef.current)
    const url=URL.createObjectURL(file)
    cOrigUrlRef.current = url
    const img=new Image()
    img.onload=()=>{
      setCImg(img)
      setCOrigSrc(url)
    }
    img.onerror=()=>{
      URL.revokeObjectURL(url)
      if (cOrigUrlRef.current === url) cOrigUrlRef.current = null
    }
    img.src=url
  },[])

  /* ── Corner: render preview (debounced) ── */
  useEffect(()=>{
    if (!cImg) return
    clearTimeout(cRenderTimer.current)
    cRenderTimer.current=setTimeout(()=>{
      try { setCResult(renderRoundedScaled(cImg,cTl,cTr,cBr,cBl,PREVIEW_MAX,filtersData,watermarkData)) }
      catch(e) { console.warn('Corner render error',e) }
    },60)
    return ()=>clearTimeout(cRenderTimer.current)
  },[cImg,cTl,cTr,cBr,cBl,filtersData,watermarkData])

  /* ── Corner: download full res ── */
  const downloadCorner = useCallback(()=>{
    if (!cImg) return
    try {
      dlDataURL(renderRoundedFull(cImg,cTl,cTr,cBr,cBl,filtersData,watermarkData),'rounded-image.png')
    } catch(e) { alert('Download failed: '+e.message) }
  },[cImg,cTl,cTr,cBr,cBl,filtersData,watermarkData])


  /* ─── UI ─── */
  return (
    <ToolShell tool={tool}>
      <ChainedInputBanner
        acceptedTypes={['image']}
        onAccept={(payload) => {
          if (payload) {
            setActiveTab('crop')
          }
        }}
      />
      <ToolCard>
        {/* Tab bar */}
        <div className="image-studio-tab-bar" style={{display:'flex',gap:6,marginBottom:22,flexWrap:'wrap'}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setActiveTab(t.id)}
              className="image-studio-tab-item"
              style={{display:'flex',flexDirection:'column',alignItems:'flex-start',
                padding:'10px 16px',borderRadius:13,cursor:'pointer',flex:'1 1 auto',
                minWidth:120,transition:'all .18s',textAlign:'left',
                border:`1.5px solid ${activeTab===t.id?'#4F8EF7':'rgba(0,0,0,.09)'}`,
                background:activeTab===t.id?'rgba(79,142,247,.08)':'#fafafa',
                boxShadow:activeTab===t.id?'0 0 0 3px rgba(79,142,247,.12)':'none'}}>
              <span style={{fontSize:14,fontWeight:700,
                display:'inline-flex',alignItems:'center',gap:7,
                color:activeTab===t.id?'#4F8EF7':'#0d0d1a',fontFamily:'Syne,sans-serif'}}>
                {t.icon && <t.icon size={15} style={{color:activeTab===t.id?'#4F8EF7':'#666',flexShrink:0}} />}
                {t.label}
              </span>
              <span style={{fontSize:11,color:'#aaa',marginTop:2}}>{t.desc}</span>
            </button>
          ))}
        </div>

        {/* ═══════════════ BORDER TAB ═══════════════ */}
        {activeTab==='border' && (
          <Reveal>
            {!bImg ? (
              <ImageUploader onImage={loadBorderImage} label="Drop image to add a border"/>
            ) : (
              <div>
                {/* Preview */}
                <div style={{textAlign:'center',marginBottom:20,
                  background:'repeating-conic-gradient(#eaeaee 0% 25%,white 0% 50%) 0 0/12px 12px',
                  borderRadius:14,padding:16,minHeight:120,
                  display:'flex',alignItems:'center',justifyContent:'center'}}>
                  {bPreview && (
                    <motion.img src={bPreview} alt="Preview"
                      initial={{opacity:0,y:4}} animate={{opacity:1,y:0}}
                      style={{maxWidth:'100%',maxHeight:340,objectFit:'contain',
                        borderRadius:4,boxShadow:'0 4px 20px rgba(0,0,0,.15)'}}/>
                  )}
                </div>

                {/* Presets */}
                <div style={{marginBottom:18}}>
                  <label className="lbl">Quick Presets</label>
                  <div style={{display:'flex',gap:7,flexWrap:'wrap'}}>
                    {BORDER_PRESETS.map(p=>(
                      <motion.button key={p.name} whileHover={{y:-3,scale:1.04}} whileTap={{scale:.93}}
                        onClick={()=>applyBorderPreset(p)}
                        style={{padding:'7px 13px',borderRadius:999,fontSize:12,fontWeight:700,
                          cursor:'pointer',transition:'all .18s',display:'inline-flex',alignItems:'center',gap:5,
                          border:`1.5px solid ${bPreset===p.name?'#4F8EF7':'rgba(0,0,0,.1)'}`,
                          background:bPreset===p.name?'rgba(79,142,247,.09)':'#fafafa',
                          color:bPreset===p.name?'#4F8EF7':'#555'}}>
                        {p.icon && <p.icon size={13} style={{flexShrink:0}} />}
                        {p.name}
                      </motion.button>
                    ))}
                  </div>
                </div>

                {/* Color */}
                <div className="fgrp">
                  <label className="lbl">Border Color</label>
                  <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:10}}>
                    <input type="color" value={bColor} onChange={e=>setBColor(e.target.value)}
                      style={{width:46,height:46,border:'1.5px solid rgba(0,0,0,.1)',
                        borderRadius:11,cursor:'pointer',padding:3}}/>
                    <input className="inp" value={bColor} onChange={e=>setBColor(e.target.value)}
                      style={{flex:1,fontFamily:'monospace',fontSize:13}}/>
                  </div>
                  <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                    {['#ffffff','#000000','#fffdf5','#d4a060','#4F8EF7','#9C6FDE','#FF6B6B','#22c55e','#FFD700','#FF5722'].map(c=>(
                      <motion.button key={c} onClick={()=>setBColor(c)}
                        whileHover={{scale:1.2,y:-2}} whileTap={{scale:.9}}
                        style={{width:26,height:26,borderRadius:7,background:c,cursor:'pointer',
                          border:`2.5px solid ${bColor===c?'#4F8EF7':'rgba(0,0,0,.1)'}`,
                          boxShadow:c==='#ffffff'?'0 0 0 1px rgba(0,0,0,.1)':''}}/>
                    ))}
                  </div>
                </div>

                {/* Uniform toggle */}
                <div className="fgrp">
                  <label className="chkrow" style={{marginBottom:10}}>
                    <input type="checkbox" checked={bUniform} onChange={e=>setBUniform(e.target.checked)}
                      style={{accentColor:'#4F8EF7',width:15,height:15}}/>
                    <span style={{fontSize:13,color:'#666'}}>Uniform border size</span>
                  </label>

                  {bUniform ? (
                    <Slider label="Border Width" value={bTop} min={0} max={80} unit="px"
                      color="#4F8EF7" onChange={e=>{const v=+e.target.value;setBTop(v);setBRight(v);setBBottom(v);setBLeft(v)}}/>
                  ) : (
                    <div className="tool-grid-2-compact">
                      {[['Top',bTop,setBTop,'#4F8EF7'],['Right',bRight,setBRight,'#9C6FDE'],
                        ['Bottom',bBottom,setBBottom,'#F06292'],['Left',bLeft,setBLeft,'#FF9800']].map(([l,v,s,c])=>(
                        <div key={l}>
                          <label className="lbl" style={{color:c}}>{l}: {v}px</label>
                          <input type="range" min={0} max={100} value={v}
                            onChange={e=>s(+e.target.value)}
                style={{ width:'100%', background:`linear-gradient(to right,#4F8EF7 0%,#4F8EF7 ${Math.max(0,Math.min(100,((v)-(0))/((100)-(0))*100))}%,#e2e4ef ${Math.max(0,Math.min(100,((v)-(0))/((100)-(0))*100))}%,#e2e4ef 100%)`, WebkitAppearance:'none', appearance:'none', height:5, borderRadius:3, outline:'none', cursor:'pointer' }} className="rs-thumb"/>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Advanced adjustments */}
                <div style={{ margin: '20px 0', borderTop: '1px solid rgba(0,0,0,.08)', paddingTop: 16 }}>
                  <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 13.5, color: '#0d0d1a', marginBottom: 12 }}>
                    ✨ Advanced Image Adjustments
                  </div>
                  <div className="tool-grid-2-compact">
                    <Slider label="Brightness" value={fBrightness} min={50} max={150} unit="%"
                      color="#4F8EF7" onChange={e => setFBrightness(+e.target.value)} />
                    <Slider label="Contrast" value={fContrast} min={50} max={150} unit="%"
                      color="#9C6FDE" onChange={e => setFContrast(+e.target.value)} />
                  </div>
                  <div className="tool-grid-2-compact" style={{ marginTop: 8 }}>
                    <Slider label="Grayscale" value={fGrayscale} min={0} max={100} unit="%"
                      color="#666" onChange={e => setFGrayscale(+e.target.value)} />
                    <Slider label="Blur" value={fBlur} min={0} max={15} unit="px"
                      color="#FF5722" onChange={e => setFBlur(+e.target.value)} />
                  </div>
                  <div style={{ marginTop: 14 }}>
                    <label className="lbl">Text Watermark</label>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <input className="inp" placeholder="Enter watermark text..." value={wText}
                        onChange={e => setWText(e.target.value)} style={{ flex: 1, fontSize: 13 }} />
                      <div style={{ width: 120 }}>
                        <input type="range" min={10} max={100} value={wOpacity} onChange={e => setWOpacity(+e.target.value)}
                          style={{ width: '100%', accentColor: '#4F8EF7' }} />
                        <div style={{ fontSize: 10, color: '#aaa', textAlign: 'center', marginTop: 2 }}>Opacity: {wOpacity}%</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div style={{display:'flex',gap:9,marginTop:4}}>
                  <motion.button whileHover={{scale:1.02,y:-1}} whileTap={{scale:.97}}
                    onClick={downloadBorder}
                    style={{flex:2,padding:'14px',borderRadius:13,border:'none',cursor:'pointer',
                      fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:15,color:'#fff',
                      background:bStatus==='done'?'linear-gradient(135deg,#22c55e,#16a34a)':'linear-gradient(135deg,#4F8EF7,#9C6FDE)',
                      boxShadow:bStatus==='done'?'0 8px 22px rgba(34,197,94,.3)':'0 8px 22px rgba(79,142,247,.3)',
                      display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
                    <span style={{fontSize:18}}>{bStatus==='saving'?'⏳':bStatus==='done'?'✅':'⬇️'}</span>
                    {bStatus==='saving'?'Saving…':bStatus==='done'?'Downloaded!':'Download PNG'}
                  </motion.button>
                  <motion.button whileHover={{scale:1.02}} whileTap={{scale:.97}}
                    onClick={()=>{setBImg(null);setBPreview('');setBPreset(null);setBStatus('idle')}}
                    style={{flex:1,padding:'14px',borderRadius:13,cursor:'pointer',fontSize:14,
                      fontWeight:600,color:'#555',border:'1.5px solid rgba(0,0,0,.1)',background:'#fff'}}>
                    🔄 New Image
                  </motion.button>
                </div>
              </div>
            )}
          </Reveal>
        )}

        {/* ═══════════════ CORNER TAB ═══════════════ */}
        {activeTab==='corner' && (
          <Reveal>
            {/* Corner shape presets */}
            <div style={{marginBottom:18}}>
              <label className="lbl">Shape Presets</label>
              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                {CORNER_SHAPES.map(s=>(
                  <motion.button key={s.name} whileHover={{y:-3,scale:1.04}} whileTap={{scale:.93}}
                    onClick={()=>{setCTl(s.tl);setCTr(s.tr);setCBr(s.br);setCBl(s.bl)}}
                    style={{padding:'7px 13px',borderRadius:999,fontSize:12,fontWeight:700,
                      cursor:'pointer',transition:'all .18s',
                      border:'1.5px solid rgba(0,0,0,.1)',background:'#fafafa',color:'#555'}}>
                    {s.name}
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Radius sliders */}
            <div style={{marginBottom:16}}>
              <label className="chkrow" style={{marginBottom:12}}>
                <input type="checkbox" checked={cUniform} onChange={e=>setCUniform(e.target.checked)}
                  style={{accentColor:'#4F8EF7',width:15,height:15}}/>
                <span style={{fontSize:13,color:'#666'}}>Uniform radius</span>
              </label>
              {cUniform ? (
                <Slider label="Border Radius" value={cTl} min={0} max={200} unit="px"
                  color="#4F8EF7" onChange={e=>setCAll(+e.target.value)}/>
              ) : (
                <div className="tool-grid-2-compact">
                  {[['↖ TL',cTl,setCTl,'#4F8EF7'],['↗ TR',cTr,setCTr,'#9C6FDE'],
                    ['↘ BR',cBr,setCBr,'#F06292'],['↙ BL',cBl,setCBl,'#FF9800']].map(([l,v,s,c])=>(
                    <div key={l}>
                      <label className="lbl" style={{color:c}}>{l}: {v>=999?'50%':v+'px'}</label>
                      <input type="range" min={0} max={200} value={Math.min(v,200)}
                        onChange={e=>s(+e.target.value)}
                style={{ width:'100%', background:`linear-gradient(to right,#4F8EF7 0%,#4F8EF7 ${Math.max(0,Math.min(100,((Math.min(v,200))-(0))/((200)-(0))*100))}%,#e2e4ef ${Math.max(0,Math.min(100,((Math.min(v,200))-(0))/((200)-(0))*100))}%,#e2e4ef 100%)`, WebkitAppearance:'none', appearance:'none', height:5, borderRadius:3, outline:'none', cursor:'pointer' }} className="rs-thumb"/>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Image upload / preview */}
            {!cImg ? (
              <ImageUploader onImage={loadCornerImage} label="Drop image to apply rounded corners"/>
            ) : (
              <div>
                <div className="tool-grid-2-compact" style={{marginBottom:14}}>
                  {[{label:'Original',src:cOrigSrc,border:'rgba(0,0,0,.08)',lc:'#bbb',bg:'#f5f5f8'},
                    {label:'Rounded',src:cResult,border:'rgba(79,142,247,.3)',lc:'#4F8EF7',
                     bg:'repeating-conic-gradient(#eaeaee 0% 25%,white 0% 50%) 0 0/12px 12px'}
                  ].map(p=>(
                    <div key={p.label}>
                      <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',
                        letterSpacing:'.6px',color:p.lc,textAlign:'center',marginBottom:6}}>
                        {p.label}
                      </div>
                      <div style={{borderRadius:10,overflow:'hidden',border:`1.5px solid ${p.border}`,
                        background:p.bg,minHeight:80,display:'flex',
                        alignItems:'center',justifyContent:'center'}}>
                        {p.src && <img decoding="async" loading="lazy" src={p.src} alt={p.label}
                          style={{maxWidth:'100%',maxHeight:140,objectFit:'contain'}}/>}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Advanced adjustments */}
                <div style={{ margin: '20px 0', borderTop: '1px solid rgba(0,0,0,.08)', paddingTop: 16 }}>
                  <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 13.5, color: '#0d0d1a', marginBottom: 12 }}>
                    ✨ Advanced Image Adjustments
                  </div>
                  <div className="tool-grid-2-compact">
                    <Slider label="Brightness" value={fBrightness} min={50} max={150} unit="%"
                      color="#4F8EF7" onChange={e => setFBrightness(+e.target.value)} />
                    <Slider label="Contrast" value={fContrast} min={50} max={150} unit="%"
                      color="#9C6FDE" onChange={e => setFContrast(+e.target.value)} />
                  </div>
                  <div className="tool-grid-2-compact" style={{ marginTop: 8 }}>
                    <Slider label="Grayscale" value={fGrayscale} min={0} max={100} unit="%"
                      color="#666" onChange={e => setFGrayscale(+e.target.value)} />
                    <Slider label="Blur" value={fBlur} min={0} max={15} unit="px"
                      color="#FF5722" onChange={e => setFBlur(+e.target.value)} />
                  </div>
                  <div style={{ marginTop: 14 }}>
                    <label className="lbl">Text Watermark</label>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <input className="inp" placeholder="Enter watermark text..." value={wText}
                        onChange={e => setWText(e.target.value)} style={{ flex: 1, fontSize: 13 }} />
                      <div style={{ width: 120 }}>
                        <input type="range" min={10} max={100} value={wOpacity} onChange={e => setWOpacity(+e.target.value)}
                          style={{ width: '100%', accentColor: '#4F8EF7' }} />
                        <div style={{ fontSize: 10, color: '#aaa', textAlign: 'center', marginTop: 2 }}>Opacity: {wOpacity}%</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{display:'flex',gap:8,marginBottom:14}}>
                  <motion.button whileHover={{scale:1.02,y:-1}} whileTap={{scale:.97}}
                    onClick={downloadCorner} disabled={!cResult}
                    style={{flex:2,padding:'13px',borderRadius:13,border:'none',cursor:'pointer',
                      fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:14,color:'#fff',
                      background:'linear-gradient(135deg,#4F8EF7,#9C6FDE)',
                      boxShadow:'0 8px 22px rgba(79,142,247,.3)',
                      display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
                    ⬇️ Download Full-Res PNG
                  </motion.button>
                  <button onClick={()=>{setCImg(null);setCOrigSrc('');setCResult('')}}
                    style={{flex:1,padding:'13px',borderRadius:13,fontSize:13,fontWeight:600,
                      cursor:'pointer',color:'#555',border:'1.5px solid rgba(0,0,0,.1)',background:'#fff'}}>
                    🔄 New
                  </button>
                </div>

                <div style={{padding:'10px 14px',background:'rgba(79,142,247,.06)',
                  borderRadius:10,border:'1px solid rgba(79,142,247,.15)',fontSize:12,color:'#4F8EF7'}}>
                  💡 Adjust the sliders above — the preview updates live!
                </div>
              </div>
            )}
          </Reveal>
        )}

        {/* ═══════════════ CSS GENERATOR TAB ═══════════════ */}
        {activeTab==='cornerCSS' && (
          <Reveal>
            {/* Live shape preview */}
            <div style={{display:'flex',justifyContent:'center',marginBottom:24}}>
              <div style={{position:'relative'}}>
                <motion.div
                  animate={{
                    borderRadius:`${cssRV(cTl)} ${cssRV(cTr)} ${cssRV(cBr)} ${cssRV(cBl)}`,
                  }}
                  transition={{type:'spring',stiffness:240,damping:24}}
                  style={{width:160,height:110,background:'linear-gradient(135deg,#4F8EF7,#9C6FDE)',
                    boxShadow:'0 8px 32px rgba(79,142,247,.35)'}}/>
              </div>
            </div>

            {/* Corner shape presets */}
            <div style={{marginBottom:18}}>
              <label className="lbl">Shape Presets</label>
              <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:10}}>
                {CORNER_SHAPES.map(s=>(
                  <motion.button key={s.name} whileHover={{y:-2,scale:1.04}} whileTap={{scale:.93}}
                    onClick={()=>{setCTl(s.tl);setCTr(s.tr);setCBr(s.br);setCBl(s.bl)}}
                    style={{padding:'7px 13px',borderRadius:999,fontSize:12,fontWeight:700,
                      cursor:'pointer',transition:'all .18s',
                      border:'1.5px solid rgba(0,0,0,.1)',background:'#fafafa',color:'#555'}}>
                    {s.name}
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Sliders */}
            <div style={{marginBottom:16}}>
              <label className="chkrow" style={{marginBottom:12}}>
                <input type="checkbox" checked={cUniform} onChange={e=>setCUniform(e.target.checked)}
                  style={{accentColor:'#4F8EF7',width:15,height:15}}/>
                <span style={{fontSize:13,color:'#666'}}>Uniform radius</span>
              </label>
              {cUniform ? (
                <Slider label="Border Radius" value={cTl} min={0} max={200} unit="px"
                  color="#4F8EF7" onChange={e=>setCAll(+e.target.value)}/>
              ) : (
                <div className="tool-grid-2-compact">
                  {[['↖ Top-Left',cTl,setCTl,'#4F8EF7'],['↗ Top-Right',cTr,setCTr,'#9C6FDE'],
                    ['↘ Bottom-Right',cBr,setCBr,'#F06292'],['↙ Bottom-Left',cBl,setCBl,'#FF9800']].map(([l,v,s,c])=>(
                    <div key={l}>
                      <label className="lbl" style={{color:c}}>{l}: <strong>{v>=999?'50%':v+'px'}</strong></label>
                      <input type="range" min={0} max={200} value={Math.min(v,200)}
                        onChange={e=>s(+e.target.value)}
                style={{ width:'100%', background:`linear-gradient(to right,#4F8EF7 0%,#4F8EF7 ${Math.max(0,Math.min(100,((Math.min(v,200))-(0))/((200)-(0))*100))}%,#e2e4ef ${Math.max(0,Math.min(100,((Math.min(v,200))-(0))/((200)-(0))*100))}%,#e2e4ef 100%)`, WebkitAppearance:'none', appearance:'none', height:5, borderRadius:3, outline:'none', cursor:'pointer' }} className="rs-thumb"/>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* CSS Output */}
            <div className="fgrp">
              <label className="lbl">CSS Output</label>
              <div style={{background:'#1e1e2e',borderRadius:12,padding:'16px 18px',
                fontFamily:'monospace',fontSize:14,lineHeight:1.7,
                border:'1px solid rgba(0,0,0,.12)',minHeight:54}}>
                <span style={{color:'#cba6f7'}}>border-radius</span>
                <span style={{color:'#fff'}}>: </span>
                <span style={{color:'#a6e3a1'}}>{typewriter.replace('border-radius: ','').replace(';','')}</span>
                <span style={{color:'#fff'}}>;</span>
              </div>
              <div style={{display:'flex',gap:8,marginTop:10}}>
                <button className={`btn ${copied?'btn-success':'btn-primary'} btn-w`}
                  onClick={()=>copy(cssText)}>
                  {copied?'✓ Copied!':'📋 Copy CSS'}
                </button>
                <button className="btn btn-outline"
                  onClick={()=>copy(`border-radius: ${cssRV(cTl)} ${cssRV(cTr)} ${cssRV(cBr)} ${cssRV(cBl)};`)}>
                  Shorthand
                </button>
              </div>
            </div>

            {/* UI use cases */}
            <div className="fgrp">
              <label className="lbl">Common UI Elements</label>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(100px,1fr))',gap:8}}>
                {CORNER_USE_CASES.map(uc=>(
                  <button key={uc.name}
                    onClick={()=>{setCTl(uc.tl);setCTr(uc.tr);setCBr(uc.br);setCBl(uc.bl)}}
                    style={{padding:'12px 10px',cursor:'pointer',fontSize:12,fontWeight:600,
                      border:'1.5px solid rgba(0,0,0,.1)',borderRadius:10,
                      background:'#fafafa',color:'#555',transition:'all .18s',textAlign:'center'}}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor='#4F8EF7';e.currentTarget.style.color='#4F8EF7';e.currentTarget.style.background='rgba(79,142,247,.06)'}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(0,0,0,.1)';e.currentTarget.style.color='#555';e.currentTarget.style.background='#fafafa'}}>
                    <div style={{width:28,height:18,background:'rgba(79,142,247,.18)',
                      border:'1.5px solid rgba(79,142,247,.4)',margin:'0 auto 6px',
                      borderRadius:`${Math.min(uc.tl,9)}px ${Math.min(uc.tr,9)}px ${Math.min(uc.br,9)}px ${Math.min(uc.bl,9)}px`}}/>
                    {uc.name}
                  </button>
                ))}
              </div>
            </div>
          </Reveal>
        )}

        {/* ═══════════════ WATERMARK TAB ═══════════════ */}
        {activeTab==='watermark' && (
          <Reveal>
            {wmFiles.length === 0 ? (
              <div style={{border:'2px dashed rgba(0,0,0,.1)',borderRadius:16,padding:'44px 20px',textAlign:'center',background:'transparent',cursor:'pointer',position:'relative'}}
                onDragOver={e=>{e.preventDefault(); e.currentTarget.style.background='rgba(79,142,247,.04)'}}
                onDragLeave={e=>{e.currentTarget.style.background='transparent'}}
                onDrop={e=>{e.preventDefault(); e.currentTarget.style.background='transparent'; const uploaded=Array.from(e.dataTransfer.files).filter(f=>f.type.startsWith('image/')); if(uploaded.length) setWmFiles(prev=>[...prev, ...uploaded])}}>
                <input type="file" accept="image/*" multiple style={{position:'absolute',inset:0,opacity:0,cursor:'pointer'}}
                  onChange={e=>{const uploaded=Array.from(e.target.files).filter(f=>f.type.startsWith('image/')); if(uploaded.length) setWmFiles(prev=>[...prev, ...uploaded])}}/>
                <div style={{fontSize:42,marginBottom:12}}>💧</div>
                <div style={{fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:15,color:'#0d0d1a',marginBottom:4}}>
                  Upload images to watermark in bulk
                </div>
                <div style={{fontSize:12,color:'#aaa'}}>Select or drop multiple files together</div>
              </div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:20}}>
                {/* Preview Box */}
                <div style={{textAlign:'center',background:'repeating-conic-gradient(#eaeaee 0% 25%,white 0% 50%) 0 0/12px 12px',borderRadius:14,padding:16,minHeight:120,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
                  <div style={{fontSize:11,color:'#888',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px',marginBottom:8}}>Preview (First Image)</div>
                  {wmPreviewUrl && (
                    <motion.img src={wmPreviewUrl} alt="Watermark preview"
                      initial={{opacity:0,y:4}} animate={{opacity:1,y:0}}
                      style={{maxWidth:'100%',maxHeight:300,objectFit:'contain',borderRadius:8,boxShadow:'0 4px 20px rgba(0,0,0,.15)'}}/>
                  )}
                </div>

                {/* Configurations */}
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(260px, 100%),1fr))',gap:20}}>
                  {/* Left Column: Text Watermark */}
                  <div style={{background:'#fafafa',borderRadius:16,padding:16,border:'1px solid rgba(0,0,0,0.06)'}}>
                    <div style={{fontFamily:'Syne,sans-serif',fontWeight:800,fontSize:14,color:'#0d0d1a',marginBottom:14}}>📝 Text Watermark</div>
                    <div className="fgrp">
                      <label className="lbl">Watermark Text</label>
                      <input className="inp" value={wmText} onChange={e=>setWmText(e.target.value)} placeholder="© Copyright 2026"/>
                    </div>
                    <div className="fgrp">
                      <label className="lbl">Text Color</label>
                      <div style={{display:'flex',gap:10,alignItems:'center'}}>
                        <input type="color" value={wmTextColor} onChange={e=>setWmTextColor(e.target.value)} style={{width:40,height:40,borderRadius:8,border:'1px solid #ddd',cursor:'pointer'}}/>
                        <input className="inp" value={wmTextColor} onChange={e=>setWmTextColor(e.target.value)} style={{flex:1,fontFamily:'monospace',fontSize:13}}/>
                      </div>
                    </div>
                    <Slider label="Text Size Scale" value={wmTextSize} min={10} max={100} onChange={e=>setWmTextSize(+e.target.value)}/>
                    <Slider label="Text Opacity" value={wmTextOpacity} min={10} max={100} onChange={e=>setWmTextOpacity(+e.target.value)} unit="%"/>
                    <div className="fgrp">
                      <label className="lbl">Text Position</label>
                      <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                        {['top-left','top-right','bottom-left','bottom-right','center'].map(p=>(
                          <button key={p} className={`tag ${wmTextPos===p?'on':'off'}`} onClick={()=>setWmTextPos(p)} style={{fontSize:11}}>{p.replace('-',' ')}</button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Logo Watermark */}
                  <div style={{background:'#fafafa',borderRadius:16,padding:16,border:'1px solid rgba(0,0,0,0.06)'}}>
                    <div style={{fontFamily:'Syne,sans-serif',fontWeight:800,fontSize:14,color:'#0d0d1a',marginBottom:14}}>🖼️ Logo Watermark</div>
                    <div className="fgrp">
                      <label className="lbl">Watermark Logo Image</label>
                      {wmLogoImg ? (
                        <div style={{display:'flex',gap:10,alignItems:'center',background:'#fff',padding:10,borderRadius:10,border:'1px solid #eee'}}>
                          <img src={wmLogoImg.src} alt="Uploaded logo preview" style={{height:32,objectFit:'contain',borderRadius:4}}/>
                          <span style={{fontSize:12,color:'#555',fontWeight:600,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>Logo loaded</span>
                          <button className="btn btn-outline btn-sm" onClick={()=>{
                            if (wmLogoUrlRef.current) { URL.revokeObjectURL(wmLogoUrlRef.current); wmLogoUrlRef.current = null }
                            setWmLogoImg(null)
                          }} style={{width:'auto',padding:'4px 8px'}}>Remove</button>
                        </div>
                      ) : (
                        <div style={{border:'1.5px dashed rgba(79,142,247,.3)',borderRadius:12,padding:'16px',textAlign:'center',background:'rgba(79,142,247,.02)',cursor:'pointer',position:'relative'}}>
                          <input type="file" accept="image/*" style={{position:'absolute',inset:0,opacity:0,cursor:'pointer'}}
                            onChange={e=>{
                              const f=e.target.files[0]; if(!f) return
                              if (wmLogoUrlRef.current) URL.revokeObjectURL(wmLogoUrlRef.current)
                              const url=URL.createObjectURL(f)
                              wmLogoUrlRef.current = url
                              const img=new Image()
                              img.onload=()=>{ setWmLogoImg(img) }
                              img.onerror=()=>{
                                URL.revokeObjectURL(url)
                                if (wmLogoUrlRef.current === url) wmLogoUrlRef.current = null
                              }
                              img.src=url
                            }}/>
                          <span style={{fontSize:12,fontWeight:700,color:'#4F8EF7'}}>📁 Upload Transparent PNG Logo</span>
                        </div>
                      )}
                    </div>
                    {wmLogoImg && (
                      <>
                        <Slider label="Logo Size Scale" value={wmLogoScale} min={5} max={50} onChange={e=>setWmLogoScale(+e.target.value)} unit="%"/>
                        <Slider label="Logo Opacity" value={wmLogoOpacity} min={10} max={100} onChange={e=>setWmLogoOpacity(+e.target.value)} unit="%"/>
                        <div className="fgrp">
                          <label className="lbl">Logo Position</label>
                          <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                            {['top-left','top-right','bottom-left','bottom-right','center'].map(p=>(
                              <button key={p} className={`tag ${wmLogoPos===p?'on':'off'}`} onClick={()=>setWmLogoPos(p)} style={{fontSize:11}}>{p.replace('-',' ')}</button>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Bulk Files Grid */}
                <div style={{background:'#ffffff',borderRadius:16,padding:16,border:'1px solid rgba(0,0,0,0.06)'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                    <div style={{fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:14,color:'#0d0d1a'}}>Queue ({wmFiles.length} file{wmFiles.length !== 1 ? 's' : ''})</div>
                    <label className="btn btn-outline btn-sm" style={{cursor:'pointer',width:'auto',margin:0}}>
                      + Add More Files
                      <input type="file" accept="image/*" multiple style={{display:'none'}}
                        onChange={e=>{const uploaded=Array.from(e.target.files).filter(f=>f.type.startsWith('image/')); if(uploaded.length) setWmFiles(prev=>[...prev, ...uploaded])}}/>
                    </label>
                  </div>
                  <div style={{maxHeight:140,overflowY:'auto',display:'flex',flexDirection:'column',gap:6}}>
                    {wmFiles.map((f,idx)=>(
                      <div key={idx} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 12px',background:'#fafafa',borderRadius:10,border:'1px solid #eee'}}>
                        <span style={{fontSize:12.5,fontWeight:600,color:'#333',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'70%'}}>{f.name}</span>
                        <div style={{display:'flex',gap:10,alignItems:'center'}}>
                          <span style={{fontSize:11,color:'#aaa'}}>{(f.size/1024).toFixed(0)} KB</span>
                          <button onClick={()=>setWmFiles(prev=>prev.filter((_,i)=>i!==idx))} style={{border:'none',background:'none',color:'#bbb',cursor:'pointer',padding:2,display:'flex',alignItems:'center'}} onMouseEnter={e=>e.currentTarget.style.color='#ef4444'} onMouseLeave={e=>e.currentTarget.style.color='#bbb'}>
                            <X size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bulk Progress & Action Button */}
                {wmBulkProcessing ? (
                  <div style={{textAlign:'center',padding:12}}>
                    <div style={{fontSize:13,fontWeight:600,color:'#666',marginBottom:8}}>Watermarking files ({wmBulkProgress}% complete)…</div>
                    <div style={{width:'100%',height:8,background:'#e5e7ef',borderRadius:4,overflow:'hidden'}}>
                      <div style={{width:`${wmBulkProgress}%`,height:'100%',background:'linear-gradient(90deg,#4F8EF7,#9C6FDE)',transition:'width .2s'}}/>
                    </div>
                  </div>
                ) : (
                  <div style={{display:'flex',gap:10}}>
                    <motion.button whileHover={{scale:1.02}} whileTap={{scale:.98}}
                      onClick={applyBulkWatermark}
                      className="btn btn-primary btn-lg btn-w" style={{flex:2}}>
                      ⚡ Apply Watermark & Download All
                    </motion.button>
                    <button onClick={()=>{setWmFiles([]); setWmLogoImg(null)}} className="btn btn-outline" style={{flex:1}}>
                      🗑️ Reset Studio
                    </button>
                  </div>
                )}
              </div>
            )}
          </Reveal>
        )}

        {activeTab === 'exif' && (
          <Reveal>
            <ExifCleanerStudio />
          </Reveal>
        )}

        {activeTab === 'wave' && (
          <Reveal>
            <WaveBlobStudio />
          </Reveal>
        )}

        {activeTab === 'crop' && (
          <Reveal>
            <Suspense fallback={<div style={{ padding: 48, textAlign: 'center', color: '#64748b', fontSize: 14, fontFamily: 'DM Sans,sans-serif' }}>Loading Crop Studio…</div>}>
              <ManualCropStudio isEmbedded={true} />
            </Suspense>
          </Reveal>
        )}

        {activeTab === 'redact' && (
          <Reveal>
            <Suspense fallback={<div style={{ padding: 48, textAlign: 'center', color: '#64748b', fontSize: 14, fontFamily: 'DM Sans,sans-serif' }}>Loading Redactor…</div>}>
              <ImageRedactor isEmbedded={true} />
            </Suspense>
          </Reveal>
        )}

        {activeTab === 'ocr' && (
          <Reveal>
            <Suspense fallback={<div style={{ padding: 48, textAlign: 'center', color: '#64748b', fontSize: 14, fontFamily: 'DM Sans,sans-serif' }}>Loading OCR Engine…</div>}>
              <OCRImageText isEmbedded={true} />
            </Suspense>
          </Reveal>
        )}

        {activeTab === 'dpi' && (
          <Reveal>
            <Suspense fallback={<div style={{ padding: 48, textAlign: 'center', color: '#64748b', fontSize: 14, fontFamily: 'DM Sans,sans-serif' }}>Loading DPI Checker…</div>}>
              <ImageDpiChecker isEmbedded={true} />
            </Suspense>
          </Reveal>
        )}

        {activeTab === 'resize' && (
          <Reveal>
            <ResizeStudio />
          </Reveal>
        )}

        {activeTab === 'compress' && (
          <Reveal>
            <CompressStudio />
          </Reveal>
        )}

        {activeTab === 'convert' && (
          <Reveal>
            <ConvertStudio />
          </Reveal>
        )}

        {activeTab === 'rotate' && (
          <Reveal>
            <RotateFlipStudio />
          </Reveal>
        )}

        {activeTab === 'adjust' && (
          <Reveal>
            <AdjustFilterStudio />
          </Reveal>
        )}

        {activeTab === 'palette' && (
          <Reveal>
            <PaletteStudio />
          </Reveal>
        )}

        {activeTab === 'img2pdf' && (
          <Reveal>
            <ImageToPdfStudio />
          </Reveal>
        )}

        {activeTab === 'batch' && (
          <Reveal>
            <BatchStudio />
          </Reveal>
        )}
      </ToolCard>
      {bPreview && (
        <div style={{ marginTop: 16 }}>
          <ToolChainingBar
            payload={{
              dataUrl: bPreview,
              filename: 'processed-image.png',
              mimeType: 'image/png',
              type: 'image',
              sourceTool: 'imagetools'
            }}
          />
        </div>
      )}
    </ToolShell>
  )
}
