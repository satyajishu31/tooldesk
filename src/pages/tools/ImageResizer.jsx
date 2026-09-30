import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, X, UploadCloud, Loader2, Image, Upload, Maximize2, Package, Palette, Settings, Check } from 'lucide-react'
import ToolShell, { ToolCard, Reveal } from '../../components/ToolShell'
import { TOOLS } from '../../constants'
import { saveFileWithFallback } from '../../utils/fileSaver'
import { addToHistory } from '../../utils/history'
import ChainedInputBanner from '../../components/ChainedInputBanner'
import ToolChainingBar from '../../components/ToolChainingBar'

const tool = TOOLS.find(t => t.id === 'imgresizer')

/* ═══════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════ */
const PRESETS = [
  { label:'Instagram Post',   w:1080, h:1080, cat:'Social',  icon:'📸' },
  { label:'Instagram Story',  w:1080, h:1920, cat:'Social',  icon:'📱' },
  { label:'Instagram Reel',   w:1080, h:1920, cat:'Social',  icon:'🎬' },
  { label:'Twitter/X Post',   w:1200, h:675,  cat:'Social',  icon:'🐦' },
  { label:'Twitter Header',   w:1500, h:500,  cat:'Social',  icon:'🐦' },
  { label:'Facebook Cover',   w:1200, h:630,  cat:'Social',  icon:'📘' },
  { label:'LinkedIn Banner',  w:1584, h:396,  cat:'Social',  icon:'💼' },
  { label:'YouTube Thumb',    w:1280, h:720,  cat:'Social',  icon:'▶️' },
  { label:'HD 720p',          w:1280, h:720,  cat:'Video',   icon:'🎥' },
  { label:'Full HD 1080p',    w:1920, h:1080, cat:'Video',   icon:'🎥' },
  { label:'2K',               w:2560, h:1440, cat:'Video',   icon:'🎥' },
  { label:'4K UHD',           w:3840, h:2160, cat:'Video',   icon:'🎥' },
  { label:'A4 Portrait',      w:2480, h:3508, cat:'Print',   icon:'🖨️' },
  { label:'A4 Landscape',     w:3508, h:2480, cat:'Print',   icon:'🖨️' },
  { label:'US Letter',        w:2550, h:3300, cat:'Print',   icon:'🖨️' },
  { label:'Square 500',       w:500,  h:500,  cat:'Web',     icon:'🌐' },
  { label:'Square 1000',      w:1000, h:1000, cat:'Web',     icon:'🌐' },
  { label:'OG Image',         w:1200, h:630,  cat:'Web',     icon:'🌐' },
  { label:'Favicon 32',       w:32,   h:32,   cat:'Web',     icon:'🌐' },
  { label:'Favicon 64',       w:64,   h:64,   cat:'Web',     icon:'🌐' },
]
const CATS = ['All','Social','Video','Print','Web']

const FORMATS = [
  { mime:'image/png',  label:'PNG',  ext:'png',  icon:'🖼️', note:'Lossless · transparency' },
  { mime:'image/jpeg', label:'JPEG', ext:'jpg',  icon:'📷', note:'Smaller · no alpha' },
  { mime:'image/webp', label:'WebP', ext:'webp', icon:'✨', note:'Best compression' },
]

const ALGORITHMS = [
  { id:'default',   label:'Auto',       note:'Best for most images' },
  { id:'lanczos',   label:'Lanczos',    note:'Sharpest downscale' },
  { id:'bilinear',  label:'Bilinear',   note:'Fast & smooth' },
  { id:'pixelated', label:'Pixel-art',  note:'No interpolation' },
]

const fmtSize = n => !n ? '—' : n>1048576 ? (n/1048576).toFixed(2)+' MB' : (n/1024).toFixed(1)+' KB'

/* ═══════════════════════════════════════
   CANVAS RENDER ENGINE
═══════════════════════════════════════ */
function renderToCanvas(img, w, h, mime, quality, algorithm) {
  const targetW = Math.max(1, Math.min(16384, Math.round(Number(w) || 1)))
  const targetH = Math.max(1, Math.min(16384, Math.round(Number(h) || 1)))
  const c = document.createElement('canvas')
  c.width = targetW; c.height = targetH
  const ctx = c.getContext('2d')

  // Algorithm
  if (algorithm === 'pixelated') {
    ctx.imageSmoothingEnabled = false
  } else {
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = algorithm === 'lanczos' ? 'high' : algorithm === 'bilinear' ? 'low' : 'high'
  }

  // White bg for JPEG (no transparency)
  if (mime === 'image/jpeg') { ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,targetW,targetH) }

  // Multi-pass downscale — dramatically improves quality for large reductions
  const srcW = img.naturalWidth || img.width || 1
  const srcH = img.naturalHeight || img.height || 1
  const ratio = Math.min(targetW/srcW, targetH/srcH)

  if (ratio < 0.5 && algorithm !== 'pixelated') {
    // Step downscale in halves
    let curW = srcW, curH = srcH
    let tmp = document.createElement('canvas')
    let tmpCtx = tmp.getContext('2d')
    tmpCtx.imageSmoothingEnabled = true; tmpCtx.imageSmoothingQuality = 'high'
    let src = img

    let steps = 0
    while ((curW/2 > targetW || curH/2 > targetH) && steps < 16) {
      steps++
      curW = Math.max(Math.round(curW/2), targetW)
      curH = Math.max(Math.round(curH/2), targetH)
      tmp.width = curW; tmp.height = curH
      if (mime==='image/jpeg') { tmpCtx.fillStyle='#fff'; tmpCtx.fillRect(0,0,curW,curH) }
      tmpCtx.drawImage(src, 0, 0, curW, curH)
      src = tmp
      tmp = document.createElement('canvas')
      tmpCtx = tmp.getContext('2d')
      tmpCtx.imageSmoothingEnabled = true; tmpCtx.imageSmoothingQuality = 'high'
    }
    ctx.drawImage(src, 0, 0, targetW, targetH)
  } else {
    ctx.drawImage(img, 0, 0, targetW, targetH)
  }

  return c
}

function canvasToBlob(canvas, mime, quality) {
  return new Promise(resolve => {
    try {
      canvas.toBlob(blob => resolve(blob || null), mime, mime==='image/png' ? undefined : quality)
    } catch {
      resolve(null)
    }
  })
}

/* ═══════════════════════════════════════
   LIVE PREVIEW CANVAS (small thumbnail)
═══════════════════════════════════════ */
function PreviewCanvas({ imgEl, outW, outH, origW, origH, animate: doAnimate }) {
  const cRef = useRef(null)
  const rafRef = useRef(null)
  const sw = useRef(100), sh = useRef(66), t = useRef(0)

  useEffect(() => {
    const canvas = cRef.current; if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio||1,2)
    const P = canvas.parentElement
    const CW = Math.min(P?.clientWidth || 360, window.innerWidth - 32), CH = 200
    canvas.width = CW*dpr; canvas.height = CH*dpr
    canvas.style.width = CW+'px'; canvas.style.height = CH+'px'
    canvas.style.maxWidth = '100%'
    canvas.style.boxSizing = 'border-box'
    const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr)

    const rr = (c,x,y,w,h,r)=>{
      const R=Math.min(r,w/2,h/2)
      c.beginPath()
      c.moveTo(x+R,y);c.lineTo(x+w-R,y);c.quadraticCurveTo(x+w,y,x+w,y+R)
      c.lineTo(x+w,y+h-R);c.quadraticCurveTo(x+w,y+h,x+w-R,y+h)
      c.lineTo(x+R,y+h);c.quadraticCurveTo(x,y+h,x,y+h-R)
      c.lineTo(x,y+R);c.quadraticCurveTo(x,y,x+R,y)
      c.closePath()
    }

    const tick = () => {
      t.current += 1/60; ctx.clearRect(0,0,CW,CH)
      let targetW, targetH

      if (imgEl && origW > 0 && outW > 0 && outH > 0) {
        const scale = Math.min(260 / outW, 150 / outH, 1)
        targetW = Math.max(20, outW * scale)
        targetH = Math.max(14, outH * scale)
      } else {
        const auto = 80+Math.sin(t.current*0.7)*60
        targetW = auto; targetH = auto*0.62
      }

      sw.current += (targetW-sw.current)*0.09
      sh.current += (targetH-sh.current)*0.09
      const rw = sw.current, rh = sh.current
      const rx = (CW-rw)/2, ry = (CH-rh)/2

      // Grid dots
      ctx.fillStyle = 'rgba(79,142,247,.05)'
      const gs = 18
      for (let x=rx%gs; x<CW; x+=gs)
        for (let y=ry%gs; y<CH; y+=gs) {
          ctx.beginPath(); ctx.arc(x,y,1.5,0,Math.PI*2); ctx.fill()
        }

      // Drop shadow
      ctx.save()
      ctx.shadowColor='rgba(79,142,247,.15)'; ctx.shadowBlur=20; ctx.shadowOffsetY=8
      ctx.fillStyle='rgba(0,0,0,.04)'; rr(ctx,rx+6,ry+10,rw,rh,10); ctx.fill()
      ctx.restore()

      // Main box fill
      const grad = ctx.createLinearGradient(rx,ry,rx+rw,ry+rh)
      grad.addColorStop(0,'rgba(79,142,247,.15)'); grad.addColorStop(1,'rgba(156,111,222,.1)')
      ctx.fillStyle = grad; ctx.strokeStyle = 'rgba(79,142,247,.55)'; ctx.lineWidth = 1.8
      rr(ctx,rx,ry,rw,rh,10); ctx.fill(); ctx.stroke()

      // Rule of thirds
      ctx.strokeStyle='rgba(79,142,247,.08)'; ctx.lineWidth=.8; ctx.setLineDash([3,4])
      for (const f of [1/3,2/3]) {
        ctx.beginPath(); ctx.moveTo(rx+rw*f,ry); ctx.lineTo(rx+rw*f,ry+rh); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(rx,ry+rh*f); ctx.lineTo(rx+rw,ry+rh*f); ctx.stroke()
      }
      ctx.setLineDash([])

      // Actual image preview
      if (imgEl) {
        ctx.save(); rr(ctx,rx,ry,rw,rh,10); ctx.clip()
        ctx.globalAlpha = 0.5; ctx.drawImage(imgEl,rx,ry,rw,rh); ctx.restore()
      }

      // Animated corner handles
      for (const [hx,hy] of [[rx,ry],[rx+rw,ry],[rx,ry+rh],[rx+rw,ry+rh]]) {
        const phase = 0.5+0.5*Math.sin(t.current*2.5)
        ctx.save()
        ctx.shadowColor=`rgba(79,142,247,${phase*.8})`; ctx.shadowBlur=12
        ctx.fillStyle='#4F8EF7'; ctx.beginPath(); ctx.arc(hx,hy,5.5,0,Math.PI*2); ctx.fill()
        ctx.restore()
        ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(hx,hy,2.5,0,Math.PI*2); ctx.fill()
      }

      // Dimension labels
      ctx.font='700 11px DM Sans,sans-serif'; ctx.fillStyle='#4F8EF7'; ctx.textAlign='center'; ctx.textBaseline='bottom'
      ctx.fillText(imgEl&&origW>0?`${outW} px`:`${Math.round(rw*6)} px`, CW/2, ry-5)
      ctx.textAlign='left'; ctx.textBaseline='middle'
      ctx.fillText(imgEl&&origH>0?`${outH} px`:`${Math.round(rh*6)} px`, rx+rw+14, ry+rh/2)

      // Scale badge
      if (imgEl&&origW>0) {
        const pct = Math.round(outW/origW*100)
        const bw=48,bh=20,bx=CW/2-bw/2,by=ry+rh+10
        ctx.fillStyle='rgba(79,142,247,.9)'; ctx.beginPath()
        ctx.roundRect(bx,by,bw,bh,999); ctx.fill()
        ctx.fillStyle='#fff'; ctx.font='700 10px DM Sans,sans-serif'
        ctx.textAlign='center'; ctx.textBaseline='middle'
        ctx.fillText(`${pct}%`,bx+bw/2,by+bh/2)
      }

      rafRef.current = requestAnimationFrame(tick)
    }
    tick()
    return ()=>cancelAnimationFrame(rafRef.current)
  }, [imgEl, outW, outH, origW, origH])

  return <canvas ref={cRef} style={{display:'block',width:'100%',borderRadius:12}}/>
}

/* ═══════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════ */
export default function ImageResizer() {
  const [imgEl,    setImgEl]   = useState(null)
  const [origSrc,  setOrigSrc] = useState('')
  const [origW,    setOrigW]   = useState(0)
  const [origH,    setOrigH]   = useState(0)
  const [origName, setName]    = useState('')
  const [origSize, setOSize]   = useState(0)
  const [origFmt,  setOFmt]    = useState('')
  const [outW,     setOutW]    = useState(800)
  const [outH,     setOutH]    = useState(600)
  const [lock,     setLock]    = useState(true)
  const [fmt,      setFmt]     = useState('image/jpeg')
  const [quality,  setQuality] = useState(0.92)
  const [algo,     setAlgo]    = useState('default')
  const [cat,      setCat]     = useState('All')
  const [drag,     setDrag]    = useState(false)
  const [prevSrc,  setPrevSrc] = useState('')
  const [prevSize, setPrevSize]= useState(null)
  const [status,   setStatus]  = useState('idle') // idle|loading|processing|done|error
  const [errMsg,   setErrMsg]  = useState('')
  const [cropMode, setCropMode]= useState('stretch') // stretch|fit|fill
  const [tab,      setTab]     = useState('resize')  // resize|presets|format|advanced
  const fileRef = useRef(null)
  const debRef  = useRef(null)
  const prevSrcRef = useRef('')
  const userExplicitFmtRef = useRef(false)

  const handleFormatSelect = useCallback((selectedMime) => {
    userExplicitFmtRef.current = true
    setFmt(selectedMime)
  }, [])

  useEffect(() => {
    return () => {
      if (prevSrcRef.current) URL.revokeObjectURL(prevSrcRef.current)
    }
  }, [])

  /* ── Live preview generation ── */
  useEffect(() => {
    if (!imgEl) {
      if (prevSrcRef.current) { URL.revokeObjectURL(prevSrcRef.current); prevSrcRef.current = '' }
      setPrevSrc(''); setPrevSize(null); return
    }
    clearTimeout(debRef.current)
    debRef.current = setTimeout(async () => {
      try {
        const MAX = 240
        const scale = Math.min(MAX/outW, MAX/outH, 1)
        const pw = Math.max(1, Math.round(outW*scale))
        const ph = Math.max(1, Math.round(outH*scale))
        const canvas = renderToCanvas(imgEl, pw, ph, fmt, quality, algo)
        const blob = await canvasToBlob(canvas, fmt, quality)
        if (!blob) return
        setPrevSize(blob.size)
        if (prevSrcRef.current) URL.revokeObjectURL(prevSrcRef.current)
        const url = URL.createObjectURL(blob)
        prevSrcRef.current = url
        setPrevSrc(url)
      } catch(_) {}
    }, 200)
    return () => clearTimeout(debRef.current)
  }, [imgEl, outW, outH, fmt, quality, algo])

  /* ── Load file ── */
  const loadFile = useCallback(f => {
    if (!f) return
    if (!f.type.startsWith('image/')) { setErrMsg('Please upload an image file.'); return }
    setStatus('loading'); setErrMsg('')
    const reader = new FileReader()
    reader.onload = ev => {
      const img = new Image()
      img.onload = () => {
        setImgEl(img); setOrigSrc(ev.target.result)
        setOrigW(img.naturalWidth); setOrigH(img.naturalHeight)
        setName(f.name); setOSize(f.size)
        setOFmt(f.type)
        setOutW(img.naturalWidth); setOutH(img.naturalHeight)
        // Auto-select format based on source only if user hasn't explicitly chosen an output format
        if (!userExplicitFmtRef.current) {
          if (f.type==='image/png') setFmt('image/png')
          else if (f.type==='image/webp') setFmt('image/webp')
          else setFmt('image/jpeg')
        }
        setStatus('idle')
      }
      img.onerror = () => { setStatus('idle'); setErrMsg('Cannot decode this image.') }
      img.src = ev.target.result
    }
    reader.onerror = () => { setStatus('idle'); setErrMsg('Cannot read this file.') }
    reader.readAsDataURL(f)
  }, [])

  const onDrop      = useCallback(e => { e.preventDefault(); setDrag(false); loadFile(e.dataTransfer.files[0]) }, [loadFile])
  const onDragOver  = e => { e.preventDefault(); setDrag(true) }
  const onDragLeave = () => setDrag(false)

  /* ── Dimension setters ── */
  const applyW = useCallback(v => {
    const n = Math.max(1, Math.min(8000, parseInt(v)||1))
    setOutW(n)
    if (lock && origW>0) setOutH(Math.max(1, Math.round(n*origH/origW)))
  }, [lock, origW, origH])

  const applyH = useCallback(v => {
    const n = Math.max(1, Math.min(8000, parseInt(v)||1))
    setOutH(n)
    if (lock && origH>0) setOutW(Math.max(1, Math.round(n*origW/origH)))
  }, [lock, origW, origH])

  const applyPreset = useCallback(p => {
    if (lock && origW>0) {
      // Fit within preset dimensions keeping AR
      const scale = Math.min(p.w/origW, p.h/origH)
      setOutW(Math.max(1, Math.round(origW*scale)))
      setOutH(Math.max(1, Math.round(origH*scale)))
    } else {
      setOutW(Math.max(1, p.w)); setOutH(Math.max(1, p.h))
    }
  }, [lock, origW, origH])

  const applyScale = useCallback(pct => {
    if (!origW) return
    setOutW(Math.max(1,Math.round(origW*pct/100)))
    setOutH(Math.max(1,Math.round(origH*pct/100)))
  }, [origW, origH])

  /* ── Download ── */
  const download = useCallback(async () => {
    if (!imgEl) return
    setStatus('processing')
    try {
      await new Promise(r=>setTimeout(r,20))
      const canvas = renderToCanvas(imgEl, outW, outH, fmt, quality, algo)
      const blob   = await canvasToBlob(canvas, fmt, quality)
      if (!blob) throw new Error('Failed to generate image blob from canvas.')
      const ext    = FORMATS.find(f=>f.mime===fmt)?.ext||'png'
      const baseName = origName.replace(/\.[^/.]+$/,'')||'image'
      await saveFileWithFallback(blob, `${baseName}_${outW}x${outH}.${ext}`, fmt)
      addToHistory({
        tool: 'Image Resizer',
        label: `${baseName}: ${origW}x${origH} → ${outW}x${outH}`,
        value: `${baseName}_${outW}x${outH}.${ext}`,
        action: 'Resized',
        category: 'Image',
        metadata: {
          origName,
          origDimensions: `${origW}x${origH}`,
          outDimensions: `${outW}x${outH}`,
          format: ext.toUpperCase(),
          sizeBytes: blob.size
        }
      })
      setStatus('done')
      setTimeout(()=>setStatus('idle'), 3000)
    } catch(e) {
      setErrMsg('Download failed: '+e.message); setStatus('error')
      setTimeout(()=>setStatus('idle'),3000)
    }
  }, [imgEl, outW, outH, fmt, quality, algo, origName, origW, origH])

  const reset = useCallback(() => {
    setImgEl(null); setOrigSrc(''); setPrevSrc(''); setPrevSize(null)
    setStatus('idle'); setErrMsg(''); setOutW(800); setOutH(600)
  }, [])

  /* ── Computed ── */
  const scaleAmt  = origW>0 ? `${Math.round(outW/origW*100)}%` : '—'
  const mpx       = ((outW*outH)/1e6).toFixed(1)
  const ar        = origW>0 ? (outW/outH).toFixed(3) : '—'
  const filtPresets = cat==='All' ? PRESETS : PRESETS.filter(p=>p.cat===cat)
  const isLarger  = outW>origW || outH>origH
  const isDone    = status==='done'
  const isProc    = status==='processing'

  const handleChainedImage = useCallback(async (payload) => {
    if (!payload) return
    if (payload.file) {
      loadFile(payload.file)
    } else if (payload.dataUrl) {
      try {
        const res = await fetch(payload.dataUrl)
        const blob = await res.blob()
        const f = new File([blob], payload.filename || 'chained-image.png', { type: payload.mimeType || blob.type || 'image/png' })
        loadFile(f)
      } catch (e) {
        console.error('Failed to load chained image', e)
      }
    }
  }, [loadFile])

  return (
    <ToolShell tool={tool}>
      <ChainedInputBanner acceptedTypes={['image']} onAccept={handleChainedImage} />

      {/* ── Live canvas preview ── */}
      <div style={{marginBottom:20,borderRadius:18,overflow:'hidden',border:'1px solid rgba(79,142,247,.12)',background:'linear-gradient(135deg,#f0f6ff,#f4f0ff)',padding:'14px 14px 10px',boxShadow:'0 4px 24px rgba(79,142,247,.08)'}}>
        <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.6px',color:'#aaa',marginBottom:8,paddingLeft:4,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span>Live Canvas Preview</span>
          {imgEl&&origW>0 && <span style={{color:'#4F8EF7'}}>{outW}×{outH} → {mpx}MP</span>}
        </div>
        <PreviewCanvas imgEl={imgEl} outW={outW} outH={outH} origW={origW} origH={origH}/>
      </div>

      {/* ── Error ── */}
      <AnimatePresence>
        {errMsg && (
          <motion.div initial={{opacity:0,y:-6}} animate={{opacity:1,y:0}} exit={{opacity:0,height:0}}
            style={{background:'rgba(239,68,68,.06)',border:'1.5px solid rgba(239,68,68,.18)',borderRadius:13,padding:'12px 16px',marginBottom:16,fontSize:13,color:'#b91c1c',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span style={{display:'flex',alignItems:'center',gap:8}}>
              <AlertTriangle size={15} style={{flexShrink:0}} />
              <span>{errMsg}</span>
            </span>
            <button onClick={()=>setErrMsg('')} style={{background:'none',border:'none',color:'#b91c1c',cursor:'pointer',padding:4,display:'flex',alignItems:'center'}}>
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <ToolCard>
        {!imgEl ? (
          /* ═══════ UPLOAD ═══════ */
          <motion.label
            onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
            animate={{scale:drag?1.01:1,borderColor:drag?'#4F8EF7':'rgba(0,0,0,.1)',background:drag?'rgba(79,142,247,.05)':'#fff'}}
            style={{display:'block',border:'2px dashed rgba(0,0,0,.1)',borderRadius:18,padding:'52px 24px',textAlign:'center',cursor:'pointer',transition:'background .2s'}}>
            <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}} onChange={e=>loadFile(e.target.files[0])}/>
            <motion.div animate={{y:drag?-8:0}}>
              <div style={{display:'flex',justifyContent:'center',marginBottom:14}}>
                {drag ? (
                  <UploadCloud size={54} color="#4F8EF7" />
                ) : status === 'loading' ? (
                  <Loader2 size={54} className="spin" color="#4F8EF7" />
                ) : (
                  <Image size={54} color="#4F8EF7" />
                )}
              </div>
              <div style={{fontFamily:'Syne,sans-serif',fontSize:18,fontWeight:800,color:'#0d0d1a',marginBottom:8}}>
                {drag?'Drop image to resize':status==='loading'?'Loading image…':'Drag & drop your image'}
              </div>
              <div style={{fontSize:13,color:'#aaa',marginBottom:22}}>PNG · JPEG · WebP · GIF · BMP · AVIF · SVG</div>
              <div style={{display:'inline-flex',alignItems:'center',gap:8,background:'linear-gradient(135deg,#0d0d1a,#1a1040)',color:'#fff',padding:'13px 30px',borderRadius:999,fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:14,boxShadow:'0 6px 22px rgba(13,13,26,.25)'}}>
                <Upload size={15} />
                <span>Choose Image</span>
              </div>
            </motion.div>
          </motion.label>

        ) : (
          /* ═══════ EDITOR ═══════ */
          <div>

            {/* File info bar */}
            <div style={{display:'flex',alignItems:'center',gap:13,padding:'12px 14px',background:'#f8f9ff',borderRadius:14,border:'1px solid rgba(79,142,247,.1)',marginBottom:20}}>
              <div style={{width:44,height:44,borderRadius:12,overflow:'hidden',flexShrink:0,border:'1px solid rgba(0,0,0,.08)',background:'#f0f0f0',display:'flex',alignItems:'center',justifyContent:'center'}}>
                {prevSrc ? <img decoding="async" loading="eager" src={prevSrc} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/> : <Image size={20} color="#888" />}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:700,color:'#0d0d1a',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{origName}</div>
                <div style={{fontSize:11.5,color:'#aaa',marginTop:3,display:'flex',gap:10,flexWrap:'wrap'}}>
                  <span>{origW}×{origH}px</span>
                  <span>{fmtSize(origSize)}</span>
                  <span>{origFmt.split('/')[1]?.toUpperCase()||'IMG'}</span>
                </div>
              </div>
              <button onClick={reset} style={{padding:'7px 12px',borderRadius:999,border:'1.5px solid rgba(0,0,0,.1)',background:'#fff',fontSize:12,fontWeight:600,color:'#666',cursor:'pointer',flexShrink:0,display:'inline-flex',alignItems:'center',justifyContent:'center'}}>
                <X size={13} />
              </button>
            </div>

            {/* Before / After thumbnails */}
            <div className="tool-grid-2-compact" style={{marginBottom:20}}>
              {[
                {label:'Original',  src:origSrc,  bg:'#f5f5f8',      border:'rgba(0,0,0,.08)',  color:'#bbb',  info:`${origW}×${origH} · ${fmtSize(origSize)}`},
                {label:'Output',    src:prevSrc,   bg:'repeating-conic-gradient(#e8e8ec 0% 25%,white 0% 50%) 0 0/12px 12px', border:'rgba(79,142,247,.22)', color:'#4F8EF7', info:`${outW}×${outH} · ${prevSize?fmtSize(prevSize):'…'}`},
              ].map(p=>(
                <div key={p.label}>
                  <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.6px',color:p.color,marginBottom:7,display:'flex',justifyContent:'space-between'}}>
                    <span>{p.label}</span>
                    {p.label==='Output'&&isLarger&&<span style={{color:'#f97316',fontSize:9}}>⚠️ Upscaling</span>}
                  </div>
                  <div style={{borderRadius:13,overflow:'hidden',border:`1.5px solid ${p.border}`,background:p.bg,minHeight:90,display:'flex',alignItems:'center',justifyContent:'center',transform:'translateZ(0)'}}>
                    {p.src ? <img decoding="async" loading="lazy" src={p.src} alt={p.label} style={{maxWidth:'100%',maxHeight:150,objectFit:'contain',display:'block'}}/> : <div style={{fontSize:12,color:'#ddd',padding:16}}>…</div>}
                  </div>
                  <div style={{fontSize:10.5,color:p.color,fontWeight:600,marginTop:5,textAlign:'center'}}>{p.info}</div>
                </div>
              ))}
            </div>

            {/* Savings badge */}
            {prevSize && origSize && (
              <div style={{marginBottom:18}}>
                {prevSize < origSize ? (
                  <div style={{padding:'9px 14px',background:'rgba(34,197,94,.07)',border:'1px solid rgba(34,197,94,.2)',borderRadius:11,fontSize:12.5,color:'#166534',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span>✅ Estimated output size: <strong>{fmtSize(prevSize)}</strong></span>
                    <span style={{fontSize:11,color:'#22c55e',fontWeight:700}}>-{Math.round((1-prevSize/origSize)*100)}% smaller</span>
                  </div>
                ) : (
                  <div style={{padding:'9px 14px',background:'rgba(251,146,60,.07)',border:'1px solid rgba(251,146,60,.2)',borderRadius:11,fontSize:12.5,color:'#9a3412'}}>
                    ⚠️ Estimated output: <strong>{fmtSize(prevSize)}</strong> — upscaling increases file size
                  </div>
                )}
              </div>
            )}

            {/* ── TAB NAV ── */}
            <div style={{display:'flex',gap:6,background:'rgba(0,0,0,0.03)',borderRadius:14,padding:4,marginBottom:20}}>
              {[
                {id:'resize', label:'Resize', Icon: Maximize2},
                {id:'presets', label:'Presets', Icon: Package},
                {id:'format', label:'Format', Icon: Palette},
                {id:'advanced', label:'Advanced', Icon: Settings}
              ].map(t=>(
                <button key={t.id} onClick={()=>setTab(t.id)}
                  style={{flex:1,padding:'8px 10px',borderRadius:11,border: tab===t.id ? '1.5px solid rgba(79,142,247,0.35)' : '1.5px solid transparent',cursor:'pointer',fontSize:12,fontWeight:700,transition:'all .16s ease',background:tab===t.id?'rgba(79,142,247,0.12)':'transparent',color:tab===t.id?'#3B7BE8':'#777',boxShadow:tab===t.id?'0 2px 8px rgba(79,142,247,0.15)':'none',display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6}}>
                  <t.Icon size={14} />
                  <span>{t.label}</span>
                </button>
              ))}
            </div>

            {/* ── TAB: RESIZE ── */}
            {tab==='resize' && (
              <motion.div initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} transition={{duration:.22}}>
                {/* Lock ratio */}
                <div style={{display:'flex',justifyContent:'flex-end',marginBottom:10}}>
                  <label style={{display:'flex',alignItems:'center',gap:7,cursor:'pointer',userSelect:'none',fontSize:13,fontWeight:600,color:lock?'#4F8EF7':'#aaa',background:lock?'rgba(79,142,247,.07)':'#f5f5f8',padding:'6px 14px',borderRadius:999,border:`1.5px solid ${lock?'rgba(79,142,247,.25)':'rgba(0,0,0,.08)'}`,transition:'all .18s'}}>
                    <input type="checkbox" checked={lock} onChange={e=>setLock(e.target.checked)} style={{accentColor:'#4F8EF7',width:14,height:14}}/>
                    {lock?'🔒 Locked ratio':'🔓 Free resize'}
                  </label>
                </div>

                {/* W × H inputs */}
                <div style={{display:'grid',gridTemplateColumns:'1fr auto 1fr',gap:10,alignItems:'flex-end',marginBottom:16}}>
                  <div>
                    <div style={{fontSize:10,fontWeight:700,color:'#4F8EF7',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:6}}>Width (px)</div>
                    <input value={outW} onChange={e=>applyW(e.target.value)} type="number" min={1} max={8000}
                      className="inp" inputMode="numeric"
                      style={{textAlign:'center',fontFamily:'Syne,sans-serif',fontSize:22,fontWeight:800,color:'#4F8EF7'}}/>
                  </div>
                  <div style={{paddingBottom:14,fontSize:18,color:'#ddd',fontWeight:700,textAlign:'center'}}>×</div>
                  <div>
                    <div style={{fontSize:10,fontWeight:700,color:'#9C6FDE',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:6}}>Height (px)</div>
                    <input value={outH} onChange={e=>applyH(e.target.value)} type="number" min={1} max={8000}
                      className="inp" inputMode="numeric"
                      style={{textAlign:'center',fontFamily:'Syne,sans-serif',fontSize:22,fontWeight:800,color:'#9C6FDE'}}/>
                  </div>
                </div>

                {/* Scale % quick buttons */}
                <div style={{marginBottom:16}}>
                  <div style={{fontSize:10.5,fontWeight:700,color:'#bbb',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:8}}>Quick Scale</div>
                  <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                    {[10,25,50,75,100,125,150,200].map(pct=>{
                      const active = origW>0 && Math.round(outW/origW*100)===pct
                      return (
                        <button key={pct} onClick={()=>applyScale(pct)}
                          style={{padding:'6px 13px',borderRadius:999,fontSize:12,fontWeight:700,cursor:'pointer',border:`1.5px solid ${active?'#4F8EF7':'rgba(0,0,0,.1)'}`,background:active?'rgba(79,142,247,.1)':'#fafafa',color:active?'#4F8EF7':'#888',transition:'all .15s cubic-bezier(.22,1,.36,1)'}}>
                          {pct}%
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Stat chips */}
                <div className="tool-grid-4" style={{gap:8}}>
                  {[
                    {l:'Width',  v:`${outW}px`,  c:'#4F8EF7'},
                    {l:'Height', v:`${outH}px`,  c:'#9C6FDE'},
                    {l:'Scale',  v:scaleAmt,     c:'#22c55e'},
                    {l:'Megapx', v:`${mpx}MP`,   c:'#f59e0b'},
                  ].map(s=>(
                    <div key={s.l} style={{background:'#f8f9ff',borderRadius:12,padding:'11px 8px',textAlign:'center',border:'1px solid rgba(0,0,0,.06)'}}>
                      <div style={{fontFamily:'Syne,sans-serif',fontSize:15,fontWeight:800,color:s.c,lineHeight:1,marginBottom:3}}>{s.v}</div>
                      <div style={{fontSize:9.5,color:'#bbb',fontWeight:700,textTransform:'uppercase',letterSpacing:'.4px'}}>{s.l}</div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ── TAB: PRESETS ── */}
            {tab==='presets' && (
              <motion.div initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} transition={{duration:.22}}>
                <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:14,padding:4,background:'rgba(0,0,0,0.03)',borderRadius:12}}>
                  {CATS.map(c=>(
                    <button key={c} onClick={()=>setCat(c)}
                      style={{padding:'5px 13px',borderRadius:9,fontSize:11.5,fontWeight:700,cursor:'pointer',border: cat===c ? '1.5px solid rgba(79,142,247,0.35)' : '1.5px solid transparent',background:cat===c?'rgba(79,142,247,.12)':'transparent',color:cat===c?'#3B7BE8':'#666',transition:'all .16s ease'}}>
                      {c}
                    </button>
                  ))}
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:8,maxHeight:360,overflowY:'auto',paddingRight:2}}>
                  {filtPresets.map(p=>{
                    const active = outW===p.w&&outH===p.h
                    return (
                      <motion.button key={p.label} whileHover={{y:-2}} whileTap={{scale:.96}}
                        onClick={()=>applyPreset(p)}
                        style={{
                          padding:'12px 10px', borderRadius:13, textAlign:'left', cursor:'pointer',
                          border:`2.5px solid ${active?'#4F8EF7':'rgba(0,0,0,.08)'}`,
                          background:active?'linear-gradient(135deg,rgba(79,142,247,.12),rgba(156,111,222,.08))':'#fafafa',
                          transition:'all .18s', position:'relative',
                          boxShadow:active?'0 4px 16px rgba(79,142,247,.2)':'none',
                        }}>
                        {active && (
                          <div style={{position:'absolute',top:6,right:7,width:16,height:16,borderRadius:'50%',background:'#4F8EF7',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,color:'#fff',fontWeight:800}}>✓</div>
                        )}
                        <div style={{fontSize:20,marginBottom:6}}>{p.icon}</div>
                        <div style={{fontSize:12,fontWeight:700,color:active?'#4F8EF7':'#333',marginBottom:3,lineHeight:1.3}}>{p.label}</div>
                        <div style={{fontSize:10.5,color:active?'#9C6FDE':'#bbb'}}>{p.w}×{p.h}</div>
                      </motion.button>
                    )
                  })}
                </div>
              </motion.div>
            )}

            {/* ── TAB: FORMAT ── */}
            {tab==='format' && (
              <motion.div initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} transition={{duration:.22}}>
                <div className="tool-grid-3 tool-format-grid" style={{gap:10,marginBottom:18}}>
                  {FORMATS.map(f=>(
                    <div key={f.mime} onClick={()=>handleFormatSelect(f.mime)}
                      className="tool-option-card"
                      style={{padding:'16px 10px',borderRadius:14,textAlign:'center',cursor:'pointer',border:`1.5px solid ${fmt===f.mime?'#4F8EF7':'rgba(0,0,0,.08)'}`,background:fmt===f.mime?'rgba(79,142,247,.09)':'var(--tool-glass-l2-bg)',transition:'all .18s'}}>
                      <div style={{fontSize:28,marginBottom:8}}>{f.icon}</div>
                      <div style={{fontWeight:800,color:fmt===f.mime?'#4F8EF7':'#333',fontSize:15,marginBottom:4}}>{f.label}</div>
                      <div style={{fontSize:11,color:'#bbb',lineHeight:1.4}}>{f.note}</div>
                    </div>
                  ))}
                </div>
                {fmt!=='image/png' && (
                  <div className="fgrp">
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                      <label className="lbl" style={{margin:0}}>Quality</label>
                      <span style={{fontSize:14,fontWeight:800,color:'#4F8EF7'}}>{Math.round(quality*100)}%</span>
                    </div>
                    <input type="range" min={10} max={100} value={Math.round(quality*100)} onChange={e=>setQuality(e.target.value/100)}
                style={{ width:'100%', background:`linear-gradient(to right,#4F8EF7 0%,#4F8EF7 ${Math.max(0,Math.min(100,((Math.round(quality*100))-(10))/((100)-(10))*100))}%,#e2e4ef ${Math.max(0,Math.min(100,((Math.round(quality*100))-(10))/((100)-(10))*100))}%,#e2e4ef 100%)`, WebkitAppearance:'none', appearance:'none', height:5, borderRadius:3, outline:'none', cursor:'pointer' }} className="rs-thumb"/>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:10.5,color:'#bbb',marginTop:5}}>
                      <span>Low quality · tiny file</span>
                      <span>Best quality · large file</span>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* ── TAB: ADVANCED ── */}
            {tab==='advanced' && (
              <motion.div initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} transition={{duration:.22}}>
                <div className="fgrp">
                  <label className="lbl">Resize Algorithm</label>
                  <div style={{display:'flex',flexDirection:'column',gap:7}}>
                    {ALGORITHMS.map(a=>(
                      <button key={a.id} onClick={()=>setAlgo(a.id)}
                        style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'11px 14px',borderRadius:12,border:`1.5px solid ${algo===a.id?'#4F8EF7':'rgba(0,0,0,.08)'}`,background:algo===a.id?'rgba(79,142,247,.07)':'#fafafa',cursor:'pointer',transition:'all .18s',textAlign:'left'}}>
                        <div>
                          <div style={{fontSize:13,fontWeight:700,color:algo===a.id?'#4F8EF7':'#333'}}>{a.label}</div>
                          <div style={{fontSize:11.5,color:'#bbb',marginTop:2}}>{a.note}</div>
                        </div>
                        {algo===a.id && <span style={{color:'#4F8EF7',fontSize:18}}>✓</span>}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="fgrp" style={{background:'rgba(79,142,247,.04)',border:'1px solid rgba(79,142,247,.12)',borderRadius:13,padding:'14px'}}>
                  <div style={{fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:13,color:'#0d0d1a',marginBottom:12}}>Image Info</div>
                  {[
                    ['Original size', `${origW} × ${origH} px`],
                    ['Original file', fmtSize(origSize)],
                    ['Original format', origFmt.split('/')[1]?.toUpperCase()||'—'],
                    ['Output size', `${outW} × ${outH} px`],
                    ['Output format', FORMATS.find(f=>f.mime===fmt)?.label||'—'],
                    ['Aspect ratio', origW>0?(outW/outH).toFixed(3):'—'],
                    ['Scale', scaleAmt],
                    ['Megapixels', `${mpx} MP`],
                  ].map(([k,v])=>(
                    <div key={k} style={{display:'flex',justifyContent:'space-between',fontSize:12.5,padding:'5px 0',borderBottom:'1px solid rgba(0,0,0,.05)'}}>
                      <span style={{color:'#888'}}>{k}</span>
                      <span style={{fontWeight:700,color:'#0d0d1a'}}>{v}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ── DOWNLOAD BUTTON ── */}
            <motion.button
              whileHover={!isProc?{scale:1.02,y:-2}:{}}
              whileTap={!isProc?{scale:.97}:{}}
              onClick={download}
              disabled={isProc}
              style={{
                marginTop:22, width:'100%', padding:'17px', borderRadius:16,
                background: isDone ? 'linear-gradient(135deg,#22c55e,#16a34a)' : isProc ? '#f5f5f8' : 'linear-gradient(135deg,#4F8EF7,#9C6FDE)',
                color: isProc ? '#bbb' : '#fff', border:'none',
                fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:16,
                cursor: isProc?'wait':'pointer',
                display:'flex', alignItems:'center', justifyContent:'center', gap:10,
                boxShadow: isDone?'0 8px 28px rgba(34,197,94,.32)':isProc?'none':'0 8px 28px rgba(79,142,247,.32)',
                transition:'background .4s, box-shadow .4s',
                letterSpacing:'-.3px',
              }}>
              <span style={{fontSize:22}}>
                {isDone?'✅':isProc?'⏳':'⬇️'}
              </span>
              {isDone ? 'Downloaded! Check your Downloads folder'
                : isProc ? 'Processing…'
                : `Resize & Download — ${outW}×${outH} px`}
            </motion.button>

            {isDone && (
              <motion.p initial={{opacity:0,y:4}} animate={{opacity:1,y:0}}
                style={{textAlign:'center',fontSize:12.5,color:'#22c55e',marginTop:10,fontWeight:600}}>
                🎉 File saved! Format: {FORMATS.find(f=>f.mime===fmt)?.label} · Size: {outW}×{outH}px
              </motion.p>
            )}

            {/* Workflow Tool Chaining */}
            {prevSrc && (
              <div style={{marginTop: 18}}>
                <ToolChainingBar
                  payload={{
                    dataUrl: prevSrc,
                    filename: `${origName.replace(/\.[^/.]+$/,'') || 'image'}_${outW}x${outH}.${FORMATS.find(f=>f.mime===fmt)?.ext || 'png'}`,
                    mimeType: fmt,
                    type: 'image',
                    sourceTool: 'imgresizer'
                  }}
                />
              </div>
            )}
          </div>
        )}
      </ToolCard>
    </ToolShell>
  )
}
