import React, { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Camera, Image, Settings, Download, Trash2, RefreshCw, CheckCircle2, Loader2, ArrowRight } from 'lucide-react'
import ToolShell, { ToolCard, Reveal } from '../../components/ToolShell'
import { TOOLS } from '../../constants'
import { saveFileWithFallback } from '../../utils/fileSaver'
import { addToHistory } from '../../utils/history'
import ChainedInputBanner from '../../components/ChainedInputBanner'
import ToolChainingBar from '../../components/ToolChainingBar'

const tool = TOOLS.find(t => t.id === 'imgconvert')

const FORMATS = [
  { mime:'image/webp', ext:'webp', label:'WebP', icon: Sparkles, desc:'Modern format — best compression + transparency. Ideal for all web use.',      pros:['Superior compression','Transparency','All modern browsers'] },
  { mime:'image/jpeg', ext:'jpg',  label:'JPEG', icon: Camera,   desc:'Universal lossy format — smallest files, best for photos and sharing.',          pros:['Smallest file','Universal support','Best for photos'] },
  { mime:'image/png',  ext:'png',  label:'PNG',  icon: Image,    desc:'Lossless quality — perfect for logos, graphics, screenshots with transparency.',  pros:['Lossless quality','Transparency','Sharp edges'] },
]

function fmtBytes(n) {
  if (!n) return '—'
  if (n > 1048576) return (n/1048576).toFixed(2)+' MB'
  return (n/1024).toFixed(1)+' KB'
}

export default function ImageConverter() {
  const [files,   setFiles]   = useState([]) // [{img, orig, preview, outFmt, quality, done}]
  const [batchFmt, setBatchFmt]= useState('image/webp')
  const [batchQ,   setBatchQ]  = useState(90)
  const [dragging, setDrag]    = useState(false)
  const [converting, setConv]  = useState(false)
  const canvasRef = useRef(null)

  // Single source of truth: instantaneous synchronous configuration ref
  const activeFormatRef = useRef({ fmt: 'image/webp', q: 90 })
  const filesRef = useRef([])
  filesRef.current = files

  const handleFormatChange = useCallback((newFmt) => {
    activeFormatRef.current.fmt = newFmt
    setBatchFmt(newFmt)
  }, [])

  const handleQualityChange = useCallback((newQ) => {
    activeFormatRef.current.q = newQ
    setBatchQ(newQ)
  }, [])

  const processFile = useCallback((f, fmt, q) => {
    return new Promise(resolve => {
      if (!f || !f.type.startsWith('image/')) return resolve(null)
      const reader = new FileReader()
      reader.onerror = () => resolve(null)
      reader.onload = ev => {
        const im = new Image()
        im.onerror = () => resolve(null)
        im.onload = () => {
          try {
            const c = canvasRef.current || document.createElement('canvas')
            const w = Math.max(1, im.naturalWidth || im.width || 1)
            const h = Math.max(1, im.naturalHeight || im.height || 1)
            c.width  = w
            c.height = h
            const ctx = c.getContext('2d')
            ctx.clearRect(0, 0, w, h)
            if (fmt === 'image/jpeg') { ctx.fillStyle='#fff'; ctx.fillRect(0,0,w,h) }
            ctx.drawImage(im, 0, 0, w, h)
            const url = c.toDataURL(fmt, fmt === 'image/png' ? undefined : q/100)
            c.width = 1
            c.height = 1
            const b64 = url.split(',')[1] || ''
            resolve({
              src: url,
              origName: f.name,
              origSize: f.size,
              outSize: Math.round(b64.length * 0.75),
              w, h,
              fmt, q, origType: f.type
            })
          } catch {
            resolve(null)
          }
        }
        im.src = ev.target.result
      }
      reader.readAsDataURL(f)
    })
  }, [])

  // Auto-synchronize already-loaded files whenever the user switches format or adjusts quality
  const prevConfigRef = useRef({ fmt: batchFmt, q: batchQ })
  useEffect(() => {
    if (prevConfigRef.current.fmt === batchFmt && prevConfigRef.current.q === batchQ) return
    prevConfigRef.current = { fmt: batchFmt, q: batchQ }

    if (filesRef.current.length === 0) return

    const timer = setTimeout(async () => {
      const currentList = filesRef.current
      if (!currentList.length) return
      setConv(true)
      const results = []
      for (const item of currentList) {
        if (item.rawFile) {
          const r = await processFile(item.rawFile, batchFmt, batchQ)
          results.push(r ? { ...r, rawFile: item.rawFile } : item)
        } else {
          results.push(item)
        }
      }
      setFiles(results)
      setConv(false)
    }, 60)

    return () => clearTimeout(timer)
  }, [batchFmt, batchQ, processFile])

  const loadFiles = useCallback(async (fileList) => {
    const arr = [...fileList].filter(f => f.type.startsWith('image/')).slice(0, 20)
    if (!arr.length) return
    setConv(true)
    const currentFmt = activeFormatRef.current.fmt
    const currentQ = activeFormatRef.current.q
    const results = []
    for (const f of arr) {
      const r = await processFile(f, currentFmt, currentQ)
      if (r) {
        results.push({ ...r, rawFile: f })
        const fmtInfo = FORMATS.find(fi => fi.mime === r.fmt)
        const base = r.origName.replace(/\.[^.]+$/, '')
        const ext = fmtInfo?.ext || 'webp'
        addToHistory({
          tool: 'Image Converter',
          label: `${r.origName} → ${base}.${ext}`,
          value: `${base}.${ext} (${ext.toUpperCase()})`,
          action: 'Converted',
          category: 'Image',
          metadata: {
            origName: r.origName,
            targetFormat: ext.toUpperCase(),
            origSize: r.origSize,
            newSize: r.size
          }
        })
      }
    }
    setFiles(prev => [...prev, ...results])
    setConv(false)
  }, [processFile])

  const downloadOne = (item) => {
    const fmtInfo = FORMATS.find(f => f.mime === item.fmt)
    const base    = item.origName.replace(/\.[^.]+$/, '')
    const ext     = fmtInfo?.ext || 'webp'
    saveFileWithFallback(item.src, `${base}.${ext}`, fmtInfo?.mime || 'image/webp')
    addToHistory({
      tool: 'Image Converter',
      label: `Downloaded ${base}.${ext}`,
      value: `${base}.${ext}`,
      action: 'Downloaded',
      category: 'Image',
      metadata: { origName: item.origName, format: ext.toUpperCase() }
    })
  }

  const downloadAll = async () => {
    setConv(true)
    try {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      const usedNames = new Map()
      files.forEach(item => {
        const fmtInfo = FORMATS.find(f => f.mime === item.fmt)
        const base = item.origName.replace(/\.[^.]+$/, '').replace(/[/\\?%*:|"<>]/g, '_') || 'image'
        const ext = fmtInfo?.ext || 'webp'
        let filename = `${base}.${ext}`
        if (usedNames.has(filename)) {
          const count = usedNames.get(filename) + 1
          usedNames.set(filename, count)
          filename = `${base}-${count}.${ext}`
        } else {
          usedNames.set(filename, 0)
        }
        const base64 = item.src?.includes(',') ? item.src.split(',')[1] : null
        if (base64) zip.file(filename, base64, { base64: true })
      })
      const content = await zip.generateAsync({ type: 'blob' })
      await saveFileWithFallback(content, 'converted-images.zip', 'application/zip')
    } catch(err) {
      console.warn('Zip download failed, downloading files individually:', err)
      files.forEach((item, i) => {
        setTimeout(() => downloadOne(item), i * 200)
      })
    }
    setConv(false)
  }

  const reconvertAll = useCallback(async () => {
    if (!files.length) return
    setConv(true)
    const results = []
    for (const item of files) {
      if (item.rawFile) {
        const r = await processFile(item.rawFile, batchFmt, batchQ)
        if (r) {
          results.push({ ...r, rawFile: item.rawFile })
        } else {
          results.push(item)
        }
      } else {
        const im = new Image()
        await new Promise(r => { im.onload = r; im.onerror = r; im.src = item.src })
        try {
          const c = canvasRef.current || document.createElement('canvas')
          const w = Math.max(1, im.naturalWidth || 1)
          const h = Math.max(1, im.naturalHeight || 1)
          c.width = w; c.height = h
          const ctx = c.getContext('2d')
          ctx.clearRect(0, 0, w, h)
          if (batchFmt === 'image/jpeg') { ctx.fillStyle='#fff'; ctx.fillRect(0,0,w,h) }
          ctx.drawImage(im, 0, 0, w, h)
          const url = c.toDataURL(batchFmt, batchFmt === 'image/png' ? undefined : batchQ/100)
          const b64 = url.split(',')[1] || ''
          results.push({ ...item, src:url, outSize:Math.round(b64.length*.75), fmt:batchFmt, q:batchQ })
        } catch {
          results.push(item)
        }
      }
    }
    setFiles(results)
    setConv(false)
  }, [files, batchFmt, batchQ, processFile])

  const totalSaved = files.reduce((a, f) => a + Math.max(0, f.origSize - f.outSize), 0)

  const handleChainedImage = useCallback(async (payload) => {
    if (!payload) return
    if (payload.file) {
      loadFiles([payload.file])
    } else if (payload.dataUrl) {
      try {
        const res = await fetch(payload.dataUrl)
        const blob = await res.blob()
        const f = new File([blob], payload.filename || 'chained-image.png', { type: payload.mimeType || blob.type || 'image/png' })
        loadFiles([f])
      } catch (e) {
        console.error('Failed to load chained image in converter', e)
      }
    }
  }, [loadFiles])

  return (
    <ToolShell tool={tool}>
      <canvas ref={canvasRef} style={{display:'none'}}/>
      <ChainedInputBanner acceptedTypes={['image']} onAccept={handleChainedImage} />

      {/* Format + quality selector — always visible */}
      <Reveal>
        <ToolCard style={{marginBottom:16}}>
          <div style={{fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:14,
            color:'#0d0d1a',marginBottom:14, display:'flex', alignItems:'center', gap:7}}>
            <Settings size={15} color="#4F8EF7" /> Conversion Settings
          </div>

          <div className="tool-grid-3" style={{gap:8,marginBottom:16}}>
            {FORMATS.map(f=>{
              const FmtIcon = f.icon
              return (
                <motion.div key={f.mime} whileHover={{y:-2}} whileTap={{scale:.97}}
                  onClick={()=>handleFormatChange(f.mime)}
                  style={{padding:'13px 10px',borderRadius:13,textAlign:'center',cursor:'pointer',
                    border:`1.5px solid ${batchFmt===f.mime?'rgba(79,142,247,0.35)':'rgba(0,0,0,.08)'}`,
                    background:batchFmt===f.mime?'rgba(79,142,247,.12)':'var(--tool-glass-l2-bg)',
                    boxShadow:batchFmt===f.mime?'0 2px 8px rgba(79,142,247,0.15)':'none',
                    transition:'all .16s ease'}}>
                  <div style={{display:'flex',justifyContent:'center',marginBottom:6}}>
                    <FmtIcon size={22} color={batchFmt===f.mime?'#4F8EF7':'#64748b'} />
                  </div>
                  <div style={{fontWeight:700,color:batchFmt===f.mime?'#4F8EF7':'#333',
                    fontSize:13,marginBottom:3}}>{f.label}</div>
                  <div style={{fontSize:9.5,color:'#bbb',lineHeight:1.4}}>{f.pros[0]}</div>
                </motion.div>
              )
            })}
          </div>

          {batchFmt !== 'image/png' && (
            <div>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:7}}>
                <span style={{fontSize:11,fontWeight:700,color:'#888',
                  textTransform:'uppercase',letterSpacing:'.6px'}}>Quality</span>
                <span style={{fontFamily:'Syne,sans-serif',fontWeight:800,
                  fontSize:20,color:'#4F8EF7'}}>{batchQ}%</span>
              </div>
              <input type="range" min={10} max={100} value={batchQ}
                onChange={e=>handleQualityChange(+e.target.value)}
                style={{ width:'100%',accentColor:'#4F8EF7', background:`linear-gradient(to right,#4F8EF7 0%,#4F8EF7 ${Math.max(0,Math.min(100,((batchQ)-(10))/((100)-(10))*100))}%,#e2e4ef ${Math.max(0,Math.min(100,((batchQ)-(10))/((100)-(10))*100))}%,#e2e4ef 100%)`, WebkitAppearance:'none', appearance:'none', height:5, borderRadius:3, outline:'none' }} className="rs-thumb"/>
              <div style={{display:'flex',justifyContent:'space-between',
                fontSize:10,color:'#ccc',marginTop:4}}>
                <span>Smallest</span><span>Best quality</span>
              </div>
            </div>
          )}
        </ToolCard>
      </Reveal>

      {/* Drop zone */}
      <Reveal delay={.04}>
        <motion.label
          onDragOver={e=>{e.preventDefault();setDrag(true)}}
          onDragLeave={()=>setDrag(false)}
          onDrop={e=>{e.preventDefault();setDrag(false);loadFiles(e.dataTransfer.files)}}
          animate={{borderColor:dragging?'#4F8EF7':'rgba(0,0,0,.1)', scale:dragging?1.01:1}}
          style={{display:'block',border:'2px dashed rgba(0,0,0,.1)',borderRadius:18,
            padding:'32px 24px',textAlign:'center',cursor:'pointer',marginBottom:16,
            background:dragging?'rgba(79,142,247,.04)':'#fafbff',transition:'background .2s'}}>
          <input type="file" accept="image/*" multiple style={{display:'none'}}
            onChange={e=>loadFiles(e.target.files)}/>
          <div style={{display:'flex',justifyContent:'center',marginBottom:10}}>
            {converting ? <Loader2 size={36} className="spin" color="#4F8EF7" /> : <RefreshCw size={34} color="#4F8EF7" />}
          </div>
          <div style={{fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:16,color:'#0d0d1a',marginBottom:6}}>
            {converting ? 'Converting…' : 'Drop images here (up to 20 at once)'}
          </div>
          <div style={{fontSize:12.5,color:'#aaa'}}>PNG · JPEG · WebP · GIF · BMP · SVG</div>
        </motion.label>
      </Reveal>

      {/* Results */}
      <AnimatePresence>
        {files.length > 0 && (
          <React.Fragment>
            <Reveal delay={.06}>
              <ToolCard style={{marginBottom:16}}>
              {/* Summary bar */}
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',
                marginBottom:14,flexWrap:'wrap',gap:10}}>
                <div>
                  <div style={{fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:14,color:'#0d0d1a', display:'flex', alignItems:'center', gap:7}}>
                    <CheckCircle2 size={16} color="#22c55e" />
                    <span>{files.length} Image{files.length!==1?'s':''} Converted</span>
                  </div>
                  <div style={{fontSize:12,color:'#22c55e',fontWeight:600,marginTop:2}}>
                    Total saved: {fmtBytes(totalSaved)}
                  </div>
                </div>
                <div style={{display:'flex',gap:8}}>
                  <motion.button whileHover={{scale:1.04}} whileTap={{scale:.96}}
                    onClick={reconvertAll}
                    style={{padding:'8px 16px',borderRadius:10,border:'1.5px solid rgba(79,142,247,.3)',
                      background:'rgba(79,142,247,.07)',color:'#4F8EF7',
                      fontSize:12,fontWeight:700,cursor:'pointer', display:'inline-flex', alignItems:'center', gap:6}}>
                    <RefreshCw size={13} />
                    <span>Reconvert All</span>
                  </motion.button>
                  <motion.button whileHover={{scale:1.04}} whileTap={{scale:.96}}
                    onClick={downloadAll}
                    style={{padding:'8px 16px',borderRadius:10,border:'none',
                      background:'linear-gradient(135deg,#4F8EF7,#7c3aed)',
                      color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer', display:'inline-flex', alignItems:'center', gap:6}}>
                    <Download size={13} />
                    <span>Download All</span>
                  </motion.button>
                  <motion.button whileHover={{scale:1.04}} whileTap={{scale:.96}}
                    onClick={()=>setFiles([])}
                    style={{padding:'8px 14px',borderRadius:10,
                      border:'1.5px solid rgba(239,68,68,.2)',
                      background:'rgba(239,68,68,.04)',
                      color:'#ef4444',fontSize:12,fontWeight:700,cursor:'pointer', display:'inline-flex', alignItems:'center', gap:6}}>
                    <Trash2 size={13} />
                    <span>Clear</span>
                  </motion.button>
                </div>
              </div>

              {/* File list */}
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {files.map((item, i) => {
                  const fmtInfo  = FORMATS.find(f => f.mime === item.fmt)
                  const origFmt  = FORMATS.find(f => f.mime === item.origType)
                  const saved    = Math.max(0, Math.round((1 - item.outSize/item.origSize)*100))
                  return (
                    <motion.div key={i} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}}
                      transition={{delay:i*.04}}
                      style={{display:'flex',alignItems:'center',gap:12,padding:'11px 14px',
                        background:'#fafbff',borderRadius:13,
                        border:'1px solid rgba(79,142,247,.08)'}}>
                      <img decoding="async" loading="lazy" src={item.src} alt=""
                        style={{width:52,height:40,objectFit:'cover',borderRadius:8,
                          border:'1px solid rgba(0,0,0,.08)',flexShrink:0}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12.5,fontWeight:600,color:'#333',
                          overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                          {item.origName}
                        </div>
                        <div style={{fontSize:11,color:'#aaa',marginTop:2,display:'flex',gap:8,flexWrap:'wrap'}}>
                          <span>{origFmt?.label || '?'} → {fmtInfo?.label}</span>
                          <span>{fmtBytes(item.origSize)} → {fmtBytes(item.outSize)}</span>
                          <span style={{color:saved>0?'#22c55e':'#aaa',fontWeight:700}}>
                            {saved>0?`${saved}% smaller`:'same size'}
                          </span>
                          <span>{item.w}×{item.h}</span>
                        </div>
                      </div>
                      <motion.button whileHover={{scale:1.05}} whileTap={{scale:.95}}
                        onClick={()=>downloadOne(item)}
                        style={{padding:'7px 14px',borderRadius:9,border:'none',
                          background:'linear-gradient(135deg,#4F8EF7,#7c3aed)',
                          color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',flexShrink:0, display:'inline-flex', alignItems:'center', justifyContent:'center'}}>
                        <Download size={13} />
                      </motion.button>
                    </motion.div>
                  )
                })}
              </div>
            </ToolCard>
          </Reveal>

          {/* Workflow Tool Chaining */}
          <div style={{marginBottom: 16}}>
            <ToolChainingBar
              payload={{
                dataUrl: files[0].src,
                filename: files[0].origName.replace(/\.[^.]+$/, '') + '.' + (FORMATS.find(f => f.mime === files[0].fmt)?.ext || 'webp'),
                mimeType: files[0].fmt,
                type: 'image',
                sourceTool: 'imgconvert'
              }}
            />
          </div>
        </React.Fragment>
      )}
    </AnimatePresence>
    </ToolShell>
  )
}
