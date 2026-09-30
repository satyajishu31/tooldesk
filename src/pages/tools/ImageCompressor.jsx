import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Camera, Image, Globe, ShoppingBag, Smartphone, Monitor, Download, Trash2, Sliders, CheckCircle2, Minimize2, Zap, Info, Target, Bookmark, X, Check } from 'lucide-react'
import ToolShell, { ToolCard, Reveal } from '../../components/ToolShell'
import { TOOLS } from '../../constants'
import { saveFileWithFallback } from '../../utils/fileSaver'
import ChainedInputBanner from '../../components/ChainedInputBanner'
import ToolChainingBar from '../../components/ToolChainingBar'
import { addToHistory } from '../../utils/history'
import { getPresets } from '../../utils/presets'

const tool = TOOLS.find(t => t.id === 'imgcompress')

function fmt(n) {
  if (!n) return '—'
  if (n > 1048576) return (n/1048576).toFixed(2)+' MB'
  if (n > 1024) return (n/1024).toFixed(1)+' KB'
  return n + ' B'
}

const OUTPUT_FMTS = [
  { mime:'image/webp', label:'WebP', ext:'webp', lossy:true,  icon: Sparkles, note:'Best for web · modern & tiny',  tip:'25–35% smaller than JPEG' },
  { mime:'image/jpeg', label:'JPEG', ext:'jpg',  lossy:true,  icon: Camera,   note:'Universal · best for photos',    tip:'Supported everywhere' },
  { mime:'image/png',  label:'PNG',  ext:'png',  lossy:false, icon: Image,    note:'Lossless · transparency support', tip:'No quality loss' },
]

function StatBadge({ label, value, color, sub }) {
  return (
    <div style={{ background:'#fafbff', borderRadius:14, padding:'14px 12px',
      textAlign:'center', border:`1.5px solid ${color}20`, position:'relative', overflow:'hidden' }}>
      <div style={{ position:'absolute', top:0, left:0, right:0, height:3,
        background:color, borderRadius:'14px 14px 0 0' }}/>
      <div style={{ fontFamily:'Syne,sans-serif', fontSize:20, fontWeight:800,
        color, lineHeight:1, marginTop:4 }}>{value}</div>
      <div style={{ fontSize:11.5, color:'#64748b', fontWeight:700, textTransform:'uppercase',
        letterSpacing:'.5px', marginTop:5 }}>{label}</div>
      {sub && <div style={{ fontSize:11, color, fontWeight:700, marginTop:3 }}>{sub}</div>}
    </div>
  )
}

export default function ImageCompressor() {
  const [img,         setImg]      = useState(null)
  const [origSize,    setOrigSize] = useState(0)
  const [origName,    setOrigName] = useState('')
  const [origW,       setOrigW]    = useState(0)
  const [origH,       setOrigH]    = useState(0)
  const [quality,     setQuality]  = useState(78)
  const [outFmt,      setOutFmt]   = useState('image/webp')
  const [compSize,    setCompSize] = useState(0)
  const [previewSrc,  setPreview]  = useState('')
  const [dragging,    setDrag]     = useState(false)
  const [targetKB,    setTargetKB] = useState('')
  const [scale,       setScale]    = useState(100)
  const [comparing,   setComparing]= useState(false)
  const [history,     setHistory]  = useState([]) // [{quality, fmt, size, src}]
  const canvasRef   = useRef(null)
  const debounceRef = useRef(null)
  const prevUrlRef  = useRef(null)

  const presets = useMemo(() => getPresets('imgcompress'), [])

  useEffect(() => {
    return () => {
      if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current)
    }
  }, [])

  const fmtInfo = OUTPUT_FMTS.find(f => f.mime === outFmt)
  const isLossy = fmtInfo?.lossy ?? true

  const runCompress = useCallback((im, q, fmt, sc) => {
    const c = canvasRef.current
    if (!c || !im) return
    const w = Math.max(1, Math.round((im.naturalWidth  || im.width)  * sc / 100))
    const h = Math.max(1, Math.round((im.naturalHeight || im.height) * sc / 100))
    c.width = w; c.height = h
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, w, h)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    if (fmt === 'image/jpeg') { ctx.fillStyle='#fff'; ctx.fillRect(0,0,w,h) }
    ctx.drawImage(im, 0, 0, w, h)
    const qVal   = fmt === 'image/png' ? undefined : q/100
    const dataURL = c.toDataURL(fmt, qVal)
    setPreview(dataURL)
    const base64 = dataURL.split(',')[1] || ''
    setCompSize(Math.round(base64.length * 0.75))
  }, [])

  useEffect(() => {
    if (!img) return
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runCompress(img, quality, outFmt, scale), 60)
    return () => clearTimeout(debounceRef.current)
  }, [quality, outFmt, img, scale, runCompress])

  useEffect(() => {
    return () => {
      if (prevUrlRef.current) {
        URL.revokeObjectURL(prevUrlRef.current)
        prevUrlRef.current = null
      }
    }
  }, [])

  const loadFile = useCallback(f => {
    if (!f || !f.type.startsWith('image/')) return
    setOrigSize(f.size)
    setOrigName(f.name)
    if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current)
    const objUrl = URL.createObjectURL(f)
    prevUrlRef.current = objUrl
    const im = new Image()
    im.onload = () => {
      setImg(im)
      setOrigW(im.naturalWidth)
      setOrigH(im.naturalHeight)
      setHistory([])
      runCompress(im, quality, outFmt, scale)
    }
    im.onerror = () => {
      URL.revokeObjectURL(objUrl)
      if (prevUrlRef.current === objUrl) prevUrlRef.current = null
    }
    im.src = objUrl
  }, [quality, outFmt, scale, runCompress])

  // Auto-tune quality to hit target file size via binary search (async yielding)
  const autoTune = useCallback(async () => {
    const kb = parseFloat(targetKB)
    if (!kb || kb <= 0 || !img || outFmt === 'image/png') return
    const targetB = kb * 1024
    const c = canvasRef.current
    if (!c) return

    // Set canvas once at current scale
    const w = Math.max(1, Math.round(img.naturalWidth * scale / 100))
    const h = Math.max(1, Math.round(img.naturalHeight * scale / 100))
    c.width = w; c.height = h

    const ctx = c.getContext('2d')
    let lo = 1, hi = 100, best = 50

    for (let i = 0; i < 14; i++) {
      if (lo > hi) break
      const mid = Math.round((lo + hi) / 2)
      ctx.clearRect(0, 0, w, h)
      if (outFmt === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h) }
      ctx.drawImage(img, 0, 0, w, h)
      const b64 = c.toDataURL(outFmt, mid / 100).split(',')[1] || ''
      const size = Math.round(b64.length * 0.75)
      if (size <= targetB) { best = mid; lo = mid + 1 }
      else { hi = mid - 1 }
      // Yield to browser to keep UI interactive on high-resolution images
      if (i % 2 === 0) await new Promise(r => setTimeout(r, 0))
    }

    setQuality(Math.max(1, Math.min(100, best)))
  }, [targetKB, img, scale, outFmt])

  const saveSnapshot = useCallback(() => {
    if (!previewSrc || !compSize) return
    setHistory(h => [{quality, fmt:outFmt, size:compSize, src:previewSrc, scale}, ...h.slice(0,4)])
  }, [previewSrc, compSize, quality, outFmt, scale])

  const saved   = origSize && compSize ? Math.max(0, Math.round((1 - compSize/origSize)*100)) : 0
  const newW    = Math.round(origW * scale / 100)
  const newH    = Math.round(origH * scale / 100)

  const download = useCallback(() => {
    const im = img
    const c = canvasRef.current
    if (!im || !c) return
    const w = Math.max(1, Math.round((im.naturalWidth || im.width) * scale / 100))
    const h = Math.max(1, Math.round((im.naturalHeight || im.height) * scale / 100))
    c.width = w; c.height = h
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, w, h)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    if (outFmt === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h) }
    ctx.drawImage(im, 0, 0, w, h)
    const qVal = outFmt === 'image/png' ? undefined : quality / 100
    const dataURL = c.toDataURL(outFmt, qVal)
    const ext = fmtInfo?.ext || (outFmt === 'image/jpeg' ? 'jpg' : outFmt === 'image/png' ? 'png' : 'webp')
    const base = (origName || 'image').replace(/\.[^.]+$/, '')
    saveFileWithFallback(dataURL, `${base}_q${quality}_${scale}pct.${ext}`, fmtInfo?.mime || outFmt)
    try {
      addToHistory({
        tool: 'Image Compressor',
        label: origName || 'image',
        value: `${fmt(origSize)} → ${fmt(compSize)} (${saved}% saved)`,
        action: 'Compressed',
        category: 'media',
        metadata: { originalSize: origSize, compressedSize: compSize, saved, quality, format: ext }
      })
    } catch {}
  }, [img, outFmt, quality, scale, fmtInfo, origName, origSize, compSize, saved])

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
      <canvas ref={canvasRef} style={{display:'none'}}/>
      <ChainedInputBanner acceptedTypes={['image']} onAccept={handleChainedImage} />

      {!img ? (
        <ToolCard>
          <motion.label
            onDragOver={e=>{e.preventDefault();setDrag(true)}}
            onDragLeave={()=>setDrag(false)}
            onDrop={e=>{e.preventDefault();setDrag(false);loadFile(e.dataTransfer.files[0])}}
            animate={{ borderColor: dragging?'#4F8EF7':'rgba(0,0,0,.1)',
              scale: dragging ? 1.01 : 1 }}
            style={{ display:'block', border:'2px dashed rgba(0,0,0,.1)',
              borderRadius:18, padding:'48px 24px', textAlign:'center',
              cursor:'pointer', transition:'background .2s',
              background: dragging ? 'rgba(79,142,247,.04)' : '#fafbff' }}>
            <input type="file" accept="image/*" style={{display:'none'}}
              onChange={e=>loadFile(e.target.files[0])}/>
            <motion.div animate={{y:[0,-6,0]}} transition={{duration:2.8,repeat:Infinity,ease:'easeInOut'}}
              style={{display:'flex',justifyContent:'center',marginBottom:14}}>
              <div style={{width:64,height:64,borderRadius:18,background:'rgba(79,142,247,.1)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                <Minimize2 size={34} color="#4F8EF7" />
              </div>
            </motion.div>
            <div style={{fontFamily:'Syne,sans-serif',fontSize:20,fontWeight:800,
              color:'#0d0d1a',marginBottom:8}}>
              Drop an image to compress
            </div>
            <div style={{fontSize:13,color:'#aaa',marginBottom:20}}>
              PNG · JPEG · WebP · GIF · BMP
            </div>
            <div style={{display:'inline-flex',gap:6,flexWrap:'wrap',justifyContent:'center'}}>
              {['Auto Quality Tuning','Scale Down','Side-by-Side Preview','Snapshot History'].map(f=>(
                <span key={f} style={{fontSize:11,padding:'4px 12px',borderRadius:999,
                  background:'rgba(79,142,247,.07)',color:'#4F8EF7',
                  border:'1px solid rgba(79,142,247,.15)',fontWeight:600}}>{f}</span>
              ))}
            </div>
          </motion.label>
        </ToolCard>
      ) : (
        <>
          {/* Stats row */}
          <Reveal>
            <div className="tool-grid-4" style={{gap:10,marginBottom:18}}>
              <StatBadge label="Original"   value={fmt(origSize)} color="#888"     sub={`${origW}×${origH}`}/>
              <StatBadge label="Compressed" value={fmt(compSize)} color={saved>30?'#22c55e':'#4F8EF7'}/>
              <StatBadge label="Saved"       value={`${saved}%`}  color={saved>40?'#22c55e':saved>20?'#f97316':'#aaa'}/>
              <StatBadge label="Dimensions"  value={`${newW}×${newH}`} color="#9C6FDE" sub={scale===100?'Original':'Scaled'}/>
            </div>
          </Reveal>

          {/* Main controls */}
          <Reveal delay={.04}>
            <ToolCard style={{marginBottom:16}}>
              {/* Presets */}
              {presets?.length > 0 && (
                <div style={{marginBottom:18}}>
                  <label style={{fontSize:11,fontWeight:700,color:'#888',textTransform:'uppercase',
                    letterSpacing:'.6px',display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
                    <Zap size={13} color="#f59e0b" />
                    <span>Quick Presets</span>
                  </label>
                  <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                    {presets.map(p=>(
                      <motion.button key={p.id} type="button" whileTap={{scale:.96}}
                        onClick={()=>{
                          if (p.values?.quality) setQuality(p.values.quality)
                          if (p.values?.format) setOutFmt(p.values.format)
                          if (p.values?.scale) setScale(p.values.scale)
                        }}
                        style={{padding:'6px 12px',borderRadius:8,fontSize:12,fontWeight:600,
                          cursor:'pointer',border:'1px solid rgba(0,0,0,.08)',
                          background:'#fafbff',color:'#334155',transition:'all .15s'}}
                        onMouseEnter={e=>e.currentTarget.style.borderColor='#4F8EF7'}
                        onMouseLeave={e=>e.currentTarget.style.borderColor='rgba(0,0,0,.08)'}>
                        {p.name}
                      </motion.button>
                    ))}
                  </div>
                </div>
              )}

              {/* Format */}
              <div style={{marginBottom:18}}>
                <label style={{fontSize:11,fontWeight:700,color:'#888',textTransform:'uppercase',
                  letterSpacing:'.6px',display:'block',marginBottom:9}}>Output Format</label>
                <div className="tool-grid-3 tool-format-grid" style={{gap:8}}>
                  {OUTPUT_FMTS.map(f=>{
                    const FmtIcon = f.icon
                    return (
                      <motion.div key={f.mime} whileHover={{y:-2}} whileTap={{scale:.97}}
                        onClick={()=>setOutFmt(f.mime)}
                        className="tool-option-card"
                        style={{padding:'12px 10px',borderRadius:13,textAlign:'center',cursor:'pointer',
                          border:`1.5px solid ${outFmt===f.mime?'#4F8EF7':'rgba(0,0,0,.08)'}`,
                          background:outFmt===f.mime?'rgba(79,142,247,.09)':'var(--tool-glass-l2-bg)',
                          transition:'all .18s'}}>
                        <div style={{display:'flex',justifyContent:'center',marginBottom:6}}>
                          <FmtIcon size={22} color={outFmt===f.mime?'#4F8EF7':'#64748b'} />
                        </div>
                        <div style={{fontWeight:700,color:outFmt===f.mime?'#4F8EF7':'#1e293b',fontSize:14}}>{f.label}</div>
                        <div style={{fontSize:11.5,color:'#64748b',marginTop:3}}>{f.tip}</div>
                      </motion.div>
                    )
                  })}
                </div>
              </div>

              {/* Quality slider */}
              <div style={{marginBottom:18}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                  <label style={{fontSize:11,fontWeight:700,color:'#888',
                    textTransform:'uppercase',letterSpacing:'.6px'}}>
                    Quality {!isLossy && <span style={{color:'#22c55e'}}>(Lossless)</span>}
                  </label>
                  <span style={{fontFamily:'Syne,sans-serif',fontWeight:800,
                    fontSize:22,color:'#4F8EF7'}}>{quality}%</span>
                </div>
                <input type="range" min={10} max={100} value={quality}
                  disabled={!isLossy}
                  onChange={e=>setQuality(+e.target.value)}
                  style={{ width:'100%',accentColor:'#4F8EF7',opacity:isLossy?1:.4, background:`linear-gradient(to right,#4F8EF7 0%,#4F8EF7 ${Math.max(0,Math.min(100,((quality)-(10))/((100)-(10))*100))}%,#e2e4ef ${Math.max(0,Math.min(100,((quality)-(10))/((100)-(10))*100))}%,#e2e4ef 100%)`, WebkitAppearance:'none', appearance:'none', height:5, borderRadius:3, outline:'none' }} className="rs-thumb"/>
                <div style={{display:'flex',justifyContent:'space-between',
                  fontSize:11.5,color:'#64748b',marginTop:5,fontWeight:500}}>
                  <span>Smallest file</span><span>Best quality</span>
                </div>
              </div>

              {/* Scale */}
              <div style={{marginBottom:18}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                  <label style={{fontSize:11,fontWeight:700,color:'#888',
                    textTransform:'uppercase',letterSpacing:'.6px'}}>
                    Resize Scale
                  </label>
                  <span style={{fontFamily:'Syne,sans-serif',fontWeight:800,
                    fontSize:22,color:'#9C6FDE'}}>{scale}%</span>
                </div>
                <input type="range" min={10} max={100} value={scale}
                  onChange={e=>setScale(+e.target.value)}
                  style={{ width:'100%',accentColor:'#9C6FDE', background:`linear-gradient(to right,#9C6FDE 0%,#9C6FDE ${Math.max(0,Math.min(100,((scale)-(10))/((100)-(10))*100))}%,#e2e4ef ${Math.max(0,Math.min(100,((scale)-(10))/((100)-(10))*100))}%,#e2e4ef 100%)`, WebkitAppearance:'none', appearance:'none', height:5, borderRadius:3, outline:'none' }} className="rs-thumb"/>
                <div style={{display:'flex',justifyContent:'space-between',
                  fontSize:11.5,color:'#64748b',marginTop:5,fontWeight:600}}>
                  <span>10% ({Math.round(origW*.1)}×{Math.round(origH*.1)})</span>
                  <span>100% — Original</span>
                </div>
              </div>

              {/* ── ADVANCED ENHANCEMENT: CORE WEB & DELIVERY OPTIMIZATION PRESETS ── */}
              <div style={{
                background: 'linear-gradient(180deg, rgba(79,142,247,0.04) 0%, rgba(156,111,222,0.03) 100%)',
                border: '1px solid rgba(79,142,247,0.22)',
                borderRadius: 16,
                padding: 18,
                marginBottom: 20
              }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Zap size={18} color="#f59e0b" />
                    <div>
                      <h4 style={{ fontFamily: 'Syne, sans-serif', fontSize: 15, fontWeight: 800, margin: 0, color: '#111' }}>
                        Core Web / Delivery Optimization Presets
                      </h4>
                      <span style={{ fontSize: 11.5, color: '#666' }}>
                        Calculated target dimensions, modern format, and bandwidth reduction targets
                      </span>
                    </div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 6, background: 'rgba(79,142,247,0.12)', color: '#4F8EF7' }}>
                    PRESET OPTIMIZER
                  </span>
                </div>

                {/* Preset Selector */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(140px, 100%), 1fr))', gap: 8, marginBottom: 14 }}>
                  {[
                    { id: 'hero', label: 'Website Hero', icon: Globe, maxW: 1920, q: 82, fmt: 'image/webp', desc: 'Above-the-fold desktop LCP hero' },
                    { id: 'product', label: 'Product Image', icon: ShoppingBag, maxW: 1000, q: 85, fmt: 'image/webp', desc: 'E-commerce cards & catalog zoom' },
                    { id: 'thumb', label: 'Mobile Thumbnail', icon: Smartphone, maxW: 400, q: 75, fmt: 'image/webp', desc: 'Ultra-lightweight responsive feed' },
                    { id: 'retina', label: 'Retina Display', icon: Monitor, maxW: Math.min(origW || 2400, 2400), q: 78, fmt: 'image/webp', desc: '2x HiDPI sharpness with lower artifacting' }
                  ].map(p => {
                    const PIcon = p.icon
                    const calcScale = origW > p.maxW ? Math.max(10, Math.round((p.maxW / origW) * 100)) : 100
                    const targetW = Math.round((origW || 1) * calcScale / 100)
                    const targetH = Math.round((origH || 1) * calcScale / 100)
                    // Heuristic estimated size based on pixel count & webp factor (~0.08 bytes per pixel at 80% quality)
                    const estBytes = Math.round(targetW * targetH * (p.q / 100) * 0.11)

                    return (
                      <div
                        key={p.id}
                        style={{
                          background: '#fff',
                          borderRadius: 12,
                          border: '1px solid rgba(0,0,0,0.08)',
                          padding: '12px 10px',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 13, color: '#111', marginBottom: 2, display:'flex', alignItems:'center', gap:6 }}>
                            <PIcon size={14} color="#4F8EF7" />
                            <span>{p.label}</span>
                          </div>
                          <div style={{ fontSize: 10.5, color: '#888', marginBottom: 8, lineHeight: 1.3 }}>{p.desc}</div>
                          
                          <div style={{ fontSize: 11, display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 10 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: '#777' }}>Target:</span>
                              <strong>{targetW}×{targetH}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: '#777' }}>Format:</span>
                              <strong>WebP (q{p.q})</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: '#777' }}>Est. Payload:</span>
                              <span style={{ color: '#16a34a', fontWeight: 700 }}>~{fmt(estBytes)}</span>
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setOutFmt(p.fmt)
                            setQuality(p.q)
                            setScale(calcScale)
                          }}
                          className="btn btn-outline btn-sm"
                          style={{
                            width: '100%',
                            fontSize: 11.5,
                            fontWeight: 700,
                            padding: '6px',
                            color: '#4F8EF7',
                            borderColor: 'rgba(79,142,247,0.3)',
                            background: 'rgba(79,142,247,0.04)'
                          }}
                        >
                          Apply Preset →
                        </button>
                      </div>
                    )
                  })}
                </div>

                {/* Original vs Optimized Comparison Matrix */}
                <div style={{
                  background: '#fff',
                  borderRadius: 12,
                  padding: '12px 16px',
                  border: '1px solid rgba(0,0,0,0.06)',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))',
                  gap: 12,
                  alignItems: 'center'
                }}>
                  <div>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Original Source</div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1e293b', marginTop: 2 }}>
                      {origW} × {origH} px · {fmt(origSize)}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>Original file encoding</div>
                  </div>

                  <div style={{ fontSize: 18, color: '#4F8EF7', textAlign: 'center' }}>
                    →
                  </div>

                  <div>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: '#16a34a', textTransform: 'uppercase' }}>Current Output</div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: '#16a34a', marginTop: 2 }}>
                      {newW} × {newH} px · {fmt(compSize)} ({saved}% reduced)
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{fmtInfo?.label} @ {quality}% Quality ({scale}% Scale)</div>
                  </div>
                </div>

                <div style={{ marginTop: 10, fontSize: 12, color: '#64748b', lineHeight: 1.5, display:'flex', alignItems:'flex-start', gap:6 }}>
                  <Info size={14} color="#3b82f6" style={{flexShrink:0, marginTop:2}} />
                  <div>
                    <strong style={{ color:'#334155' }}>Delivery Estimate Disclosure:</strong> Estimated characteristics reflect calculated target pixel density and WebP compression efficiency. Actual page speed (LCP) also depends on your CDN, HTTP/3 delivery, and responsive <code>srcset</code> attributes.
                  </div>
                </div>
              </div>

              {/* Target size auto-tune */}
              <div style={{background:'rgba(168,85,247,.04)',border:'1px solid rgba(168,85,247,.15)',
                borderRadius:13,padding:'14px 16px',marginBottom:18}}>
                <div style={{fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:13,
                  color:'#a855f7',marginBottom:10, display:'flex', alignItems:'center', gap:6}}>
                  <Target size={15} color="#a855f7" />
                  <span>Auto-Tune to Target Size</span>
                </div>
                <div style={{display:'flex',gap:9,alignItems:'center'}}>
                  <input type="number" value={targetKB} onChange={e=>setTargetKB(e.target.value)}
                    placeholder="Target KB (e.g. 100)"
                    style={{flex:1,padding:'9px 13px',borderRadius:10,border:'1.5px solid rgba(168,85,247,.3)',
                      fontFamily:'DM Sans,sans-serif',fontSize:13,outline:'none',
                      background:'#fff',color:'#333'}}/>
                  <span style={{fontSize:12,color:'#aaa',fontWeight:600,whiteSpace:'nowrap'}}>KB</span>
                  <motion.button whileHover={{scale:1.04}} whileTap={{scale:.96}}
                    onClick={autoTune} disabled={!targetKB}
                    style={{padding:'9px 18px',borderRadius:10,border:'none',
                      background: targetKB ? 'linear-gradient(135deg,#a855f7,#7c3aed)' : '#e5e7ef',
                      color:'#fff',fontWeight:700,fontSize:13,cursor:targetKB?'pointer':'not-allowed'}}>
                    Tune
                  </motion.button>
                </div>
              </div>

              {/* Action buttons */}
              <div style={{display:'flex',gap:9,flexWrap:'wrap'}}>
                <motion.button whileHover={{scale:1.02,y:-2}} whileTap={{scale:.97}}
                  onClick={download}
                  style={{flex:2,padding:'14px',borderRadius:13,border:'none',
                    background:'linear-gradient(135deg,#4F8EF7,#7c3aed)',color:'#fff',
                    fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:15,cursor:'pointer',
                    boxShadow:'0 6px 20px rgba(79,142,247,.3)'}}>
                  ⬇ Download · {fmt(compSize)} ({saved}% smaller)
                </motion.button>
                <motion.button whileHover={{scale:1.04}} whileTap={{scale:.96}}
                  onClick={saveSnapshot}
                  style={{flex:1,padding:'14px',borderRadius:13,
                    border:'1.5px solid rgba(0,0,0,.1)',background:'#fff',
                    color:'#555',fontWeight:700,fontSize:13,cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6}}>
                  <Bookmark size={14} />
                  <span>Snapshot</span>
                </motion.button>
                <motion.button whileHover={{scale:1.04}} whileTap={{scale:.96}}
                  onClick={()=>{setImg(null);setOrigSize(0);setCompSize(0);setPreview('');setHistory([])}}
                  style={{flex:1,padding:'14px',borderRadius:13,
                    border:'1.5px solid rgba(239,68,68,.2)',background:'rgba(239,68,68,.04)',
                    color:'#ef4444',fontWeight:700,fontSize:13,cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6}}>
                  <X size={14} />
                  <span>New</span>
                </motion.button>
              </div>
            </ToolCard>
          </Reveal>

          {/* Side-by-side preview */}
          <Reveal delay={.06}>
            <ToolCard style={{marginBottom:16}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                <div style={{fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:14,color:'#0d0d1a', display:'flex', alignItems:'center', gap:6}}>
                  <Image size={15} color="#4F8EF7" />
                  <span>Preview</span>
                </div>
                <motion.button whileHover={{scale:1.04}} onClick={()=>setComparing(c=>!c)}
                  style={{padding:'5px 13px',borderRadius:999,fontSize:11.5,fontWeight:700,
                    border:`1.5px solid ${comparing?'#4F8EF7':'rgba(0,0,0,.1)'}`,
                    background:comparing?'rgba(79,142,247,.08)':'transparent',
                    color:comparing?'#4F8EF7':'#888',cursor:'pointer', display:'inline-flex', alignItems:'center', gap:5}}>
                  {comparing && <Check size={12} />}
                  <span>{comparing ? 'Side-by-Side' : 'Side-by-Side'}</span>
                </motion.button>
              </div>
              {comparing ? (
                <div className="tool-grid-2-compact">
                  {[{label:'Original',src:img.src,size:fmt(origSize)},
                    {label:`Compressed · ${saved}% saved`,src:previewSrc,size:fmt(compSize)}].map(p=>(
                    <div key={p.label}>
                      <div style={{fontSize:10.5,fontWeight:700,color:'#888',
                        textTransform:'uppercase',letterSpacing:'.5px',marginBottom:6}}>{p.label}</div>
                      <div style={{borderRadius:11,overflow:'hidden',
                        border:'1px solid rgba(0,0,0,.08)',background:'#f5f5f5',position:'relative',minHeight:80}}>
                        <img decoding="async" loading="lazy" src={p.src} alt={p.label}
                          style={{width:'100%',display:'block',maxHeight:200,objectFit:'contain'}}/>
                        <div style={{position:'absolute',bottom:6,right:8,
                          background:'rgba(0,0,0,.6)',color:'#fff',borderRadius:999,
                          padding:'2px 8px',fontSize:10,fontWeight:700}}>{p.size}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{borderRadius:13,overflow:'hidden',
                  border:'1px solid rgba(0,0,0,.08)',background:'#f0f0f5',position:'relative'}}>
                  <img decoding="async" loading="eager" src={previewSrc} alt="Compressed"
                    style={{width:'100%',display:'block',maxHeight:320,objectFit:'contain'}}/>
                  <div style={{position:'absolute',bottom:10,right:12,
                    background:'rgba(0,0,0,.76)',color:'#fff',borderRadius:10,
                    padding:'5px 12px',fontSize:12,fontWeight:700}}>
                    {fmt(compSize)} · {saved}% saved · {newW}×{newH}
                  </div>
                </div>
              )}
            </ToolCard>
          </Reveal>

          {/* Workflow Tool Chaining */}
          {previewSrc && (
            <div style={{marginBottom:16}}>
              <ToolChainingBar
                payload={{
                  dataUrl: previewSrc,
                  filename: `${origName.replace(/\.[^.]+$/, '') || 'image'}_compressed.${fmtInfo?.ext || 'webp'}`,
                  mimeType: fmtInfo?.mime || 'image/webp',
                  type: 'image',
                  sourceTool: 'imgcompress'
                }}
              />
            </div>
          )}

          {/* Snapshot history */}
          <AnimatePresence>
            {history.length > 0 && (
              <Reveal delay={.08}>
                <ToolCard style={{marginBottom:16}}>
                  <div style={{fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:14,
                    color:'#0d0d1a',marginBottom:12, display:'flex', alignItems:'center', gap:6}}>
                    <Bookmark size={15} color="#4F8EF7" />
                    <span>Snapshots</span>
                  </div>
                  <div style={{display:'flex',flexDirection:'column',gap:8}}>
                    {history.map((h,i)=>{
                      const hFmt = OUTPUT_FMTS.find(f=>f.mime===h.fmt)
                      return (
                        <motion.div key={i} initial={{opacity:0,x:-10}} animate={{opacity:1,x:0}}
                          style={{display:'flex',alignItems:'center',gap:12,
                            padding:'10px 14px',background:'#fafbff',borderRadius:12,
                            border:'1px solid rgba(79,142,247,.1)'}}>
                          <img decoding="async" loading="lazy" src={h.src} alt="snap"
                            style={{width:48,height:36,objectFit:'cover',borderRadius:8,
                              border:'1px solid rgba(0,0,0,.08)',flexShrink:0}}/>
                          <div style={{flex:1,fontSize:12,color:'#555'}}>
                            <div style={{fontWeight:700,color:'#333'}}>
                              {hFmt?.label} · Q{h.quality} · {h.scale}%
                            </div>
                            <div style={{color:'#aaa',marginTop:2}}>{fmt(h.size)}</div>
                          </div>
                          <motion.button whileHover={{scale:1.04}} onClick={()=>{
                            setQuality(h.quality);setOutFmt(h.fmt);setScale(h.scale)
                          }} style={{padding:'5px 12px',borderRadius:8,fontSize:11,fontWeight:700,
                            border:'1.5px solid rgba(79,142,247,.2)',
                            background:'rgba(79,142,247,.07)',color:'#4F8EF7',cursor:'pointer'}}>
                            Restore
                          </motion.button>
                        </motion.div>
                      )
                    })}
                  </div>
                </ToolCard>
              </Reveal>
            )}
          </AnimatePresence>
        </>
      )}
    </ToolShell>
  )
}
