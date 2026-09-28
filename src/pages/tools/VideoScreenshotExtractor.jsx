import React, { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ToolShell, { ToolCard, Reveal } from '../../components/ToolShell'
import { TOOLS } from '../../constants'
import { saveFileWithFallback } from '../../utils/fileSaver'
import ToolChainingBar from '../../components/ToolChainingBar'

const tool = TOOLS.find(t => t.id === 'videoscreenshot')

const ACCEPT = 'video/mp4,video/quicktime,video/x-msvideo,video/x-matroska,video/webm,video/x-m4v,.mp4,.mov,.avi,.mkv,.webm,.m4v'

const INTERVAL_PRESETS = [
  { label:'Every 0.1s',  value:0.1  },
  { label:'Every 0.2s',  value:0.2  },
  { label:'Every 0.25s', value:0.25 },
  { label:'Every 0.5s',  value:0.5  },
  { label:'Every 1s',    value:1    },
  { label:'Every 2s',    value:2    },
  { label:'Every 3s',    value:3    },
  { label:'Every 5s',    value:5    },
  { label:'Every 10s',   value:10   },
  { label:'Custom',      value:'custom' },
]

const FORMATS  = ['PNG','JPG','WEBP']
const QUALITIES = [
  { label:'Low',      value:0.4 },
  { label:'Medium',   value:0.7 },
  { label:'High',     value:0.9 },
  { label:'Original', value:1.0 },
]

function fmtTime(s){
  const m=Math.floor(s/60), sec=Math.floor(s%60)
  return `${String(m).padStart(2,'0')}m${String(sec).padStart(2,'0')}s`
}
function fmtDisplay(s){
  const m=Math.floor(s/60), sec=Math.floor(s%60)
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
}
function fmtBytes(b){
  if(!b) return '—'
  if(b>1073741824) return (b/1073741824).toFixed(2)+' GB'
  if(b>1048576)    return (b/1048576).toFixed(2)+' MB'
  return (b/1024).toFixed(1)+' KB'
}
function gcd(a, b) {
  let x = Math.round(Math.abs(a)) || 0
  let y = Math.round(Math.abs(b)) || 0
  while (y) {
    const t = y
    y = x % y
    x = t
  }
  return x || 1
}

// ─────────────────────────────────────────────
// Pure JS ZIP builder — no CDN, no npm, fast
// Uses DEFLATE-less STORE method for speed
// ─────────────────────────────────────────────
function u32le(n){ const b=new Uint8Array(4); const v=new DataView(b.buffer); v.setUint32(0,n,true); return b }
function u16le(n){ const b=new Uint8Array(2); const v=new DataView(b.buffer); v.setUint16(0,n,true); return b }

function buildZip(files) {
  // files: [{ name: string, data: Uint8Array }]
  const enc     = new TextEncoder()
  const entries = []
  let offset    = 0

  const chunks = []

  for(const f of files){
    const name    = enc.encode(f.name)
    const data    = f.data
    const crc     = crc32(data)
    const size    = data.length

    // Local file header
    const lhdr = buildBytes([
      [0x50,0x4B,0x03,0x04],   // signature
      u16le(20),                // version needed
      u16le(0),                 // flags
      u16le(0),                 // compression: STORE
      u16le(0), u16le(0),       // mod time/date
      u32le(crc),               // crc32
      u32le(size),              // compressed size
      u32le(size),              // uncompressed size
      u16le(name.length),       // filename length
      u16le(0),                 // extra length
      name,
      data,
    ])

    entries.push({ name, crc, size, offset })
    chunks.push(lhdr)
    offset += lhdr.length
  }

  // Central directory
  let cdOffset = offset
  for(let i=0;i<files.length;i++){
    const {name,crc,size,offset:foff} = entries[i]
    const cdr = buildBytes([
      [0x50,0x4B,0x01,0x02],  // sig
      u16le(20),               // version made by
      u16le(20),               // version needed
      u16le(0),                // flags
      u16le(0),                // compression
      u16le(0),u16le(0),       // time/date
      u32le(crc),
      u32le(size),
      u32le(size),
      u16le(name.length),
      u16le(0),u16le(0),       // extra, comment
      u16le(0),                // disk start
      u16le(0),                // int attr
      u32le(0),                // ext attr
      u32le(foff),
      name,
    ])
    chunks.push(cdr)
  }
  const cdSize = chunks.slice(files.length).reduce((s,c)=>s+c.length,0)

  // End of central directory
  const eocd = buildBytes([
    [0x50,0x4B,0x05,0x06],
    u16le(0),u16le(0),
    u16le(files.length),
    u16le(files.length),
    u32le(cdSize),
    u32le(cdOffset),
    u16le(0),
  ])
  chunks.push(eocd)

  return chunks
}

function buildBytes(parts){
  const arrays = parts.map(p => p instanceof Uint8Array ? p : new Uint8Array(p))
  return mergeBytes(arrays)
}
function mergeBytes(arrays){
  const total = arrays.reduce((s,a)=>s+a.length,0)
  const out   = new Uint8Array(total)
  let pos = 0
  for(const a of arrays){ out.set(a,pos); pos+=a.length }
  return out
}

// CRC-32 table
const CRC_TABLE = (() => {
  const t=new Uint32Array(256)
  for(let i=0;i<256;i++){
    let c=i
    for(let j=0;j<8;j++) c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1)
    t[i]=c
  }
  return t
})()
function crc32(buf){
  let c=0xFFFFFFFF
  for(let i=0;i<buf.length;i++) c=CRC_TABLE[(c^buf[i])&0xFF]^(c>>>8)
  return (c^0xFFFFFFFF)>>>0
}

// dataURL → Uint8Array (base64 decode)
function dataURLtoBytes(dataURL){
  const b64  = dataURL.split(',')[1]
  const bin  = atob(b64)
  const out  = new Uint8Array(bin.length)
  for(let i=0;i<bin.length;i++) out[i]=bin.charCodeAt(i)
  return out
}

// ─────────────────────────────────────────────

export default function VideoScreenshotExtractor(){
  const [file,         setFile]    = useState(null)
  const [videoInfo,    setInfo]    = useState(null)
  const [isDrag,       setIsDrag]  = useState(false)
  const [intervalMode, setMode]    = useState(3)      // default: Every 0.5s
  const [customInt,    setCust]    = useState('0.5')
  const [format,       setFormat]  = useState('JPG')
  const [qualityIdx,   setQual]    = useState(2)      // High
  const [rangeAll,     setRangeAll]= useState(true)
  const [startT,       setStartT]  = useState('0')
  const [endT,         setEndT]    = useState('0')
  const [frames,       setFrames]  = useState([])
  const [progress,     setProgress]= useState(0)
  const [processing,   setProc]    = useState(false)
  const [error,        setError]   = useState('')
  const [done,         setDone]    = useState(false)
  const [zipBuilding,  setZipBld]  = useState(false)
  const [withTimestamp,setWithTS]  = useState(false)
  const [singleTs,     setSingleTs]= useState(0)
  const [singleFrame,  setSingleFr]= useState(null)
  
  const [extractStrategy, setExtractStrategy] = useState('interval') // 'interval' | 'scene'
  const [sceneSensitivity, setSceneSensitivity] = useState('medium') // 'low' (0.28) | 'medium' (0.18) | 'high' (0.10)
  const [sceneStats,       setSceneStats]      = useState({ evaluated: 0, detected: 0 })

  const [gifStart,     setGifStart] = useState('0')
  const [gifDuration,  setGifDuration] = useState('3')
  const [gifFps,       setGifFps]      = useState(10)
  const [gifWidth,     setGifWidth]    = useState(480)
  const [compilingGif, setCompilingGif]= useState(false)
  const [gifProgress,  setGifProgress] = useState(0)
  const [compiledGif,  setCompiledGif] = useState(null)

  const videoRef  = useRef(null)
  const canvasRef = useRef(null)
  const fileInput = useRef(null)
  const abortRef  = useRef(false)
  const framesRef = useRef([])   // live ref for ZIP
  const videoUrlRef = useRef(null)

  useEffect(() => {
    return () => {
      abortRef.current = true
      if (videoUrlRef.current) {
        URL.revokeObjectURL(videoUrlRef.current)
        videoUrlRef.current = null
      }
    }
  }, [])

  const loadVideo = useCallback(f => {
    setError(''); setFrames([]); setDone(false); setProgress(0)
    framesRef.current = []
    if(!f.type.startsWith('video/')){
      const ext = f.name.split('.').pop().toLowerCase()
      if(!['mp4','mov','avi','mkv','webm','m4v'].includes(ext)){
        setError('❌ Unsupported format. Please upload MP4, MOV, AVI, MKV, WEBM or M4V.')
        return
      }
    }
    setFile(f)
    if (videoUrlRef.current) {
      URL.revokeObjectURL(videoUrlRef.current)
      videoUrlRef.current = null
    }
    const url = URL.createObjectURL(f)
    videoUrlRef.current = url
    const v   = document.createElement('video')
    v.preload = 'metadata'; v.src = url
    v.onloadedmetadata = () => {
      const w = v.videoWidth, h = v.videoHeight
      if (!w || !h) {
        setError('❌ This file contains no video track or 0px dimensions (audio-only file).')
        return
      }
      setInfo({
        duration:v.duration, width:w, height:h,
        aspect: w&&h ? `${w/gcd(w,h)}:${h/gcd(w,h)}` : '—',
        size:f.size, name:f.name, url,
      })
      setEndT(String(Math.floor(v.duration)))
      if(videoRef.current){ videoRef.current.src=url; videoRef.current.load() }
    }
    v.onerror = () => setError('❌ Could not read video. The file may be corrupted or unsupported.')
  },[])

  const getInterval = () => {
    const p = INTERVAL_PRESETS[intervalMode]
    if(p.value === 'custom') return Math.max(0.05, parseFloat(customInt)||0.5)
    return p.value
  }

  const estimatedCount = () => {
    if(!videoInfo) return 0
    const start = rangeAll ? 0 : Math.max(0, parseFloat(startT)||0)
    const end   = rangeAll ? videoInfo.duration : Math.min(videoInfo.duration, parseFloat(endT)||videoInfo.duration)
    return Math.max(1, Math.floor((end-start)/getInterval())+1)
  }

  function seekTo(video, time){
    return new Promise((res) => {
      let tid
      const onSeeked = () => {
        clearTimeout(tid)
        video.removeEventListener('seeked', onSeeked)
        res()
      }
      video.addEventListener('seeked', onSeeked)
      video.currentTime = time
      // Fallback if seeked never fires
      tid = setTimeout(() => {
        video.removeEventListener('seeked', onSeeked)
        res()
      }, 3000)
    })
  }
  const sleep = ms => new Promise(r=>setTimeout(r,ms))

  const extractFrames = async () => {
    if(!videoInfo) return
    setError(''); setFrames([]); setDone(false); setProc(true); setProgress(0)
    framesRef.current = []
    abortRef.current  = false

    const interval = getInterval()
    const start = rangeAll ? 0 : Math.max(0, parseFloat(startT)||0)
    const end   = rangeAll ? videoInfo.duration : Math.min(videoInfo.duration, parseFloat(endT)||videoInfo.duration)

    if(start >= end){
      setError('❌ Start time must be less than end time.')
      setProc(false); return
    }

    const canvas = canvasRef.current
    const ctx    = canvas.getContext('2d')
    const video  = videoRef.current
    const q      = QUALITIES[qualityIdx].value
    const mime   = format==='PNG'?'image/png':format==='JPG'?'image/jpeg':'image/webp'
    const ext    = format.toLowerCase()==='jpg'?'jpg':format.toLowerCase()

    video.pause()
    const pendingBatch = []
    let num = 1

    if (extractStrategy === 'scene') {
      // ── SCENE CHANGE / KEYFRAME DETECTION MODE ──
      const threshold = sceneSensitivity === 'low' ? 0.28 : sceneSensitivity === 'high' ? 0.10 : 0.18
      const step = 0.35 // sample candidate frames every 350ms
      const dw = 64, dh = 36 // bounded downscaled diff resolution
      const diffCanvas = document.createElement('canvas')
      diffCanvas.width = dw
      diffCanvas.height = dh
      const diffCtx = diffCanvas.getContext('2d', { willReadFrequently: true })

      let lastBuffer = null
      let ts = start
      let cutsDetected = 0
      let framesEvaluated = 0

      while (ts <= end + 0.001 && !abortRef.current && cutsDetected < 150) {
        try {
          await seekTo(video, Math.min(ts, videoInfo.duration))
          diffCtx.drawImage(video, 0, 0, dw, dh)
          const imgData = diffCtx.getImageData(0, 0, dw, dh).data
          framesEvaluated++

          let isCut = false
          let delta = 0

          if (!lastBuffer) {
            isCut = true // first frame anchor
            delta = 1.0
          } else {
            let sumDiff = 0
            const totalPixels = dw * dh
            for (let i = 0; i < imgData.length; i += 4) {
              sumDiff += Math.abs(imgData[i] - lastBuffer[i])
              sumDiff += Math.abs(imgData[i+1] - lastBuffer[i+1])
              sumDiff += Math.abs(imgData[i+2] - lastBuffer[i+2])
            }
            delta = sumDiff / (totalPixels * 3 * 255)
            if (delta >= threshold) {
              isCut = true
            }
          }

          if (isCut) {
            lastBuffer = new Uint8Array(imgData)
            cutsDetected++
            canvas.width  = videoInfo.width
            canvas.height = videoInfo.height
            ctx.drawImage(video, 0, 0, videoInfo.width, videoInfo.height)

            if (withTimestamp) {
              const fontSize = Math.max(12, Math.round(videoInfo.height * 0.045))
              ctx.font = `bold ${fontSize}px monospace`
              const text = fmtDisplay(ts)
              const padding = Math.max(6, Math.round(videoInfo.height * 0.015))
              const textWidth = ctx.measureText(text).width
              ctx.fillStyle = 'rgba(0, 0, 0, 0.65)'
              const boxX = videoInfo.width - textWidth - padding * 3
              const boxY = videoInfo.height - fontSize - padding * 2.5
              ctx.fillRect(boxX, boxY, textWidth + padding * 2, fontSize + padding * 1.5)
              ctx.fillStyle = '#ffffff'
              ctx.textBaseline = 'top'
              ctx.fillText(text, boxX + padding, boxY + padding * 0.75)
            }

            const dataURL = canvas.toDataURL(mime, q)
            const entry   = {
              url: dataURL,
              ts,
              num,
              ext,
              isSceneCut: true,
              deltaPct: Math.round(delta * 100),
              name: `scene_${String(cutsDetected).padStart(3,'0')}_${fmtTime(ts)}.${ext}`
            }
            framesRef.current.push(entry)
            pendingBatch.push(entry)
            if (pendingBatch.length >= 4 || ts + step > end) {
              const toAdd = [...pendingBatch]
              setFrames(f => [...f, ...toAdd])
              pendingBatch.length = 0
            }
            num++
          }

          setProgress(Math.round(((ts - start) / (end - start)) * 100))
          ts = +(ts + step).toFixed(4)
        } catch (e) {
          console.warn('Scene eval skip @', ts, e)
          ts = +(ts + step).toFixed(4)
        }
        if (framesEvaluated % 8 === 0) await sleep(0)
      }

      setSceneStats({ evaluated: framesEvaluated, detected: cutsDetected })
    } else {
      // ── FIXED INTERVAL EXTRACTION MODE ──
      const count = Math.floor((end - start) / interval) + 1
      if (count > 300) {
        setError(`⚠️ This will extract ~${count} frames (max 300 frames allowed). Use a longer interval or shorter time range to prevent browser memory exhaustion.`)
        setProc(false); return
      }

      let ts = start
      while (ts <= end + 0.001 && !abortRef.current) {
        try {
          await seekTo(video, Math.min(ts, videoInfo.duration))
          canvas.width  = videoInfo.width
          canvas.height = videoInfo.height
          ctx.drawImage(video, 0, 0, videoInfo.width, videoInfo.height)

          if (withTimestamp) {
            const fontSize = Math.max(12, Math.round(videoInfo.height * 0.045))
            ctx.font = `bold ${fontSize}px monospace`
            const text = fmtDisplay(ts)
            const padding = Math.max(6, Math.round(videoInfo.height * 0.015))
            const textWidth = ctx.measureText(text).width
            ctx.fillStyle = 'rgba(0, 0, 0, 0.65)'
            const boxX = videoInfo.width - textWidth - padding * 3
            const boxY = videoInfo.height - fontSize - padding * 2.5
            ctx.fillRect(boxX, boxY, textWidth + padding * 2, fontSize + padding * 1.5)
            ctx.fillStyle = '#ffffff'
            ctx.textBaseline = 'top'
            ctx.fillText(text, boxX + padding, boxY + padding * 0.75)
          }

          const dataURL = canvas.toDataURL(mime, q)
          const entry   = { url:dataURL, ts, num, ext, name:`frame_${String(num).padStart(4,'0')}_${fmtTime(ts)}.${ext}` }
          framesRef.current.push(entry)
          pendingBatch.push(entry)
          if (pendingBatch.length >= 6 || ts + interval > end) {
            const toAdd = [...pendingBatch]
            setFrames(f => [...f, ...toAdd])
            pendingBatch.length = 0
          }
          setProgress(Math.round(((ts - start) / (end - start)) * 100))
          num++
          ts = +(ts + interval).toFixed(4)
        } catch (e) {
          console.warn('Frame skip @', ts, e)
          ts = +(ts + interval).toFixed(4)
        }
        if (num % 6 === 0) await sleep(0)
      }
    }

    if (pendingBatch.length > 0) {
      const remaining = [...pendingBatch]
      setFrames(f => [...f, ...remaining])
      pendingBatch.length = 0
    }

    setProgress(100)
    setProc(false)
    setDone(true)
  }

  const compileAnimation = async () => {
    if (!videoInfo) return
    setError(''); setCompiledGif(null); setCompilingGif(true); setGifProgress(0)
    
    if (!window.gifshot) {
      try {
        if (!document.querySelector('script[data-gifshot]')) {
          const script = document.createElement('script')
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/gifshot/0.3.2/gifshot.min.js'
          script.setAttribute('data-gifshot', 'true')
          script.crossOrigin = 'anonymous'
          script.integrity = 'sha384-j34d9QcqMUAh6dmGjkk8xdnaBmm8OcINQMgcgX9/bJB2FPdqeXvuPNIQTLDzWP7q'
          document.body.appendChild(script)
        }
        for (let attempt = 0; attempt < 50; attempt++) {
          if (window.gifshot) break
          await new Promise(r => setTimeout(r, 100))
        }
        if (!window.gifshot) throw new Error('Failed to load GIF compiler library.')
      } catch (err) {
        setError('❌ Failed to load GIF compiler library: ' + err.message)
        setCompilingGif(false)
        return
      }
    }

    const start = Math.max(0, parseFloat(gifStart) || 0)
    const dur = Math.min(5, Math.max(0.5, parseFloat(gifDuration) || 3))
    const end = Math.min(videoInfo.duration, start + dur)
    const fps = Math.min(20, Math.max(5, parseInt(gifFps) || 10))
    const width = parseInt(gifWidth) || 480
    const height = Math.max(1, Math.round(width * ((videoInfo.height || 1) / (videoInfo.width || 1))))
    
    const interval = 1 / fps
    const totalFrames = Math.ceil((end - start) / interval)

    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = width
    tempCanvas.height = height
    const tempCtx = tempCanvas.getContext('2d')
    const video = videoRef.current
    
    const framesList = []
    let currentT = start
    video.pause()

    try {
      for (let i = 0; i < totalFrames; i++) {
        if (currentT > end) break
        await seekTo(video, currentT)
        tempCtx.drawImage(video, 0, 0, width, height)
        framesList.push(tempCanvas.toDataURL('image/jpeg', 0.85))
        setGifProgress(Math.round(((i + 1) / totalFrames) * 90))
        currentT += interval
        await sleep(0)
      }

      setGifProgress(92)
      
      window.gifshot.createGIF({
        images: framesList,
        gifWidth: width,
        gifHeight: height,
        interval: interval,
        numFrames: framesList.length,
        sampleInterval: 10,
        numWorkers: 2
      }, function (obj) {
        setCompilingGif(false)
        if (!obj.error) {
          setCompiledGif(obj.image)
          setGifProgress(100)
        } else {
          setError('❌ GIF Compilation failed: ' + obj.errorMsg)
        }
      })
    } catch (e) {
      setError('❌ Error during animation compilation: ' + e.message)
      setCompilingGif(false)
    }
  }

  const downloadZip = async () => {
    const all = framesRef.current
    if(!all.length) return
    setZipBld(true)
    setError('')

    try {
      // Build in chunks to avoid blocking UI
      const files = []
      for(let i=0; i<all.length; i++){
        files.push({ name: all[i].name, data: dataURLtoBytes(all[i].url) })
        if(i%20===0) await sleep(0) // yield every 20 frames
      }

      const zipChunks = buildZip(files)
      const blob      = new Blob(zipChunks, { type:'application/zip' })
      await saveFileWithFallback(blob, 'screenshots.zip', 'application/zip')
    } catch(e){
      setError('❌ Failed to create ZIP: ' + e.message)
    } finally {
      setZipBld(false)
    }
  }

  const reset = () => {
    abortRef.current = true
    setFile(null); setInfo(null); setFrames([]); setDone(false)
    setProgress(0); setError(''); setProc(false)
    framesRef.current = []
    if (videoUrlRef.current) {
      URL.revokeObjectURL(videoUrlRef.current)
      videoUrlRef.current = null
    }
  }

  return (
    <ToolShell tool={tool}>

      {/* Hidden canvas + video */}
      <canvas ref={canvasRef} style={{display:'none'}}/>
      <video  ref={videoRef}  style={{position:'absolute', width:'1px', height:'1px', opacity:0, pointerEvents:'none', overflow:'hidden'}} crossOrigin="anonymous" preload="auto" playsInline muted/>

      {/* ── UPLOAD ── */}
      {!videoInfo && (
        <ToolCard style={{marginBottom:22}}>
          <div
            className={`upzone${isDrag?' drop-active':''}`}
            onClick={()=>fileInput.current?.click()}
            onDragOver={e=>{e.preventDefault();setIsDrag(true)}}
            onDragLeave={()=>setIsDrag(false)}
            onDrop={e=>{e.preventDefault();setIsDrag(false);e.dataTransfer.files[0]&&loadVideo(e.dataTransfer.files[0])}}
            style={{padding:'44px 24px'}}>
            <span className="upzone-icon">🎬</span>
            <div className="upzone-t" style={{fontWeight:600,fontSize:15}}>Drop a video file here</div>
            <div className="upzone-s">MP4 · MOV · AVI · MKV · WEBM · M4V</div>
            <div style={{marginTop:16}}>
              <motion.button whileHover={{scale:1.04}} whileTap={{scale:.96}}
                className="btn btn-primary" style={{ pointerEvents:'none' }}>
                📁 Choose Video
              </motion.button>
            </div>
          </div>
          <input ref={fileInput} type="file" accept={ACCEPT} style={{display:'none'}}
            onChange={e=>e.target.files[0]&&loadVideo(e.target.files[0])}/>
        </ToolCard>
      )}

      {/* ── ERROR ── */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} exit={{opacity:0}}
            className="info-bar amber" style={{marginBottom:18}}>
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── VIDEO INFO ── */}
      {videoInfo && (
        <Reveal>
          <ToolCard style={{marginBottom:22}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16,flexWrap:'wrap',gap:10}}>
              <div>
                <div style={{fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:16,color:'#0d0d1a',marginBottom:3}}>
                  📹 {videoInfo.name}
                </div>
                <div style={{fontSize:13,color:'#64748b'}}>Video loaded — configure extraction below</div>
              </div>
              <motion.button whileHover={{scale:1.04}} whileTap={{scale:.94}}
                onClick={reset} className="btn btn-outline btn-sm">✕ Remove</motion.button>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))',gap:10}}>
              {[
                {label:'Duration',    val:fmtDisplay(videoInfo.duration)},
                {label:'Resolution',  val:`${videoInfo.width}×${videoInfo.height}`},
                {label:'Aspect Ratio',val:videoInfo.aspect},
                {label:'File Size',   val:fmtBytes(videoInfo.size)},
              ].map(s=>(
                <div key={s.label} style={{background:'#f8f9ff',border:'1px solid rgba(79,142,247,.12)',borderRadius:12,padding:'12px 14px',textAlign:'center'}}>
                  <div style={{fontFamily:'Syne,sans-serif',fontSize:15,fontWeight:800,color:'#0d0d1a'}}>{s.val}</div>
                  <div style={{fontSize:11.5,color:'#64748b',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px',marginTop:4}}>{s.label}</div>
                </div>
              ))}
            </div>
          </ToolCard>
        </Reveal>
      )}

      {/* ── SETTINGS ── */}
      {videoInfo && (
        <Reveal delay={0.06}>
          <ToolCard style={{marginBottom:22}}>
            <div style={{fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:15,color:'#0d0d1a',marginBottom:18}}>
              ⚙️ Extraction Settings
            </div>

            {/* ── ADVANCED ENHANCEMENT: EXTRACTION STRATEGY TOGGLE ── */}
            <div className="fgrp">
              <label className="lbl">Extraction Mode</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: 8, marginBottom: 12 }}>
                <button
                  type="button"
                  onClick={() => setExtractStrategy('interval')}
                  style={{
                    padding: '10px 14px', borderRadius: 10, fontSize: 12.5, fontWeight: 700,
                    border: `1.5px solid ${extractStrategy === 'interval' ? '#4F8EF7' : 'rgba(0,0,0,0.1)'}`,
                    background: extractStrategy === 'interval' ? 'rgba(79,142,247,0.08)' : '#fafafa',
                    color: extractStrategy === 'interval' ? '#4F8EF7' : '#666',
                    cursor: 'pointer', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 2
                  }}
                >
                  <span style={{ fontWeight: 800 }}>⏱️ Fixed Time Interval</span>
                  <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>Extract frames periodically (every N seconds)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setExtractStrategy('scene')}
                  style={{
                    padding: '10px 14px', borderRadius: 10, fontSize: 12.5, fontWeight: 700,
                    border: `1.5px solid ${extractStrategy === 'scene' ? '#9C6FDE' : 'rgba(0,0,0,0.1)'}`,
                    background: extractStrategy === 'scene' ? 'rgba(156,111,222,0.08)' : '#fafafa',
                    color: extractStrategy === 'scene' ? '#9C6FDE' : '#666',
                    cursor: 'pointer', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 2
                  }}
                >
                  <span style={{ fontWeight: 800 }}>🎬 Auto Keyframe / Scene Change</span>
                  <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>Only capture camera cuts & slide transitions</span>
                </button>
              </div>
            </div>

            {/* Interval Mode Controls */}
            {extractStrategy === 'interval' ? (
              <div className="fgrp">
                <label className="lbl">Screenshot Interval</label>
                <div className="tags" style={{marginBottom: intervalMode===INTERVAL_PRESETS.length-1?12:0}}>
                  {INTERVAL_PRESETS.map((p,i)=>(
                    <button key={p.label}
                      className={`tag ${intervalMode===i?'on':'off'}`}
                      onClick={()=>setMode(i)}>
                      {p.label}
                    </button>
                  ))}
                </div>
                {intervalMode===INTERVAL_PRESETS.length-1 && (
                  <motion.div initial={{opacity:0,y:-6}} animate={{opacity:1,y:0}}>
                    <input className="inp" type="number" min="0.05" step="0.05"
                      value={customInt} onChange={e=>setCust(e.target.value)}
                      placeholder="e.g. 0.5 (seconds)" style={{marginTop:8}}/>
                    <div style={{fontSize:12,color:'#64748b',marginTop:5}}>Minimum: 0.05 seconds</div>
                  </motion.div>
                )}
              </div>
            ) : (
              /* Scene Change Sensitivity Controls */
              <div className="fgrp" style={{ padding: 14, borderRadius: 12, background: 'rgba(156,111,222,0.04)', border: '1px solid rgba(156,111,222,0.15)', marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label className="lbl" style={{ margin: 0, color: '#7c3aed' }}>
                    🔍 Scene Transition Sensitivity
                  </label>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase' }}>
                    {sceneSensitivity} Sensitivity
                  </span>
                </div>
                <div className="tags" style={{ marginBottom: 10 }}>
                  {[
                    { id: 'low', label: 'Low (28% Δ) — Major Camera Cuts / Slides', desc: 'Captures distinct scene transitions and slide flips' },
                    { id: 'medium', label: 'Medium (18% Δ) — Balanced Detection', desc: 'Optimal for webinars, films, podcasts and lectures' },
                    { id: 'high', label: 'High (10% Δ) — Sensitive to Micro-Movement', desc: 'Detects subtle scene and content variations' }
                  ].map(s => (
                    <button
                      key={s.id}
                      className={`tag ${sceneSensitivity === s.id ? 'on' : 'off'}`}
                      onClick={() => setSceneSensitivity(s.id)}
                      style={{ fontSize: 12, padding: '6px 12px' }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 11.5, color: '#666', lineHeight: 1.45 }}>
                  💡 <strong>Deterministic Pixel Difference:</strong> Client-side downscaled RGB differencing compares consecutive video frames to pinpoint scene changes. Zero video data is uploaded to any server.
                </div>
              </div>
            )}

            {/* Format + Quality */}
            <div className="frow fgrp">
              <div>
                <label className="lbl">Format</label>
                <div className="tags">
                  {FORMATS.map(f=>(
                    <button key={f} className={`tag ${format===f?'on':'off'}`} onClick={()=>setFormat(f)}>{f}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="lbl">Quality</label>
                <div className="tags">
                  {QUALITIES.map((q,i)=>(
                    <button key={q.label} className={`tag ${qualityIdx===i?'on':'off'}`} onClick={()=>setQual(i)}>{q.label}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* Range */}
            <div className="fgrp">
              <label className="lbl">Time Range</label>
              <div className="tags" style={{marginBottom:12}}>
                <button className={`tag ${rangeAll?'on':'off'}`} onClick={()=>setRangeAll(true)}>Entire Video</button>
                <button className={`tag ${!rangeAll?'on':'off'}`} onClick={()=>setRangeAll(false)}>Custom Range</button>
              </div>
              {!rangeAll && (
                <motion.div initial={{opacity:0,y:-6}} animate={{opacity:1,y:0}} className="frow">
                  <div>
                    <label className="lbl">Start (seconds)</label>
                    <input className="inp" type="number" min="0" step="0.1"
                      value={startT} onChange={e=>setStartT(e.target.value)} placeholder="0"/>
                  </div>
                  <div>
                    <label className="lbl">End (seconds)</label>
                    <input className="inp" type="number" min="0" step="0.1"
                      value={endT} onChange={e=>setEndT(e.target.value)}
                      placeholder={String(Math.floor(videoInfo.duration))}/>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Timestamp overlay toggle */}
            <div className="fgrp">
              <label style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer'}}>
                <div onClick={()=>setWithTS(t=>!t)}
                  style={{width:38,height:20,borderRadius:10,position:'relative',cursor:'pointer',
                    background:withTimestamp?'#4F8EF7':'#ddd',transition:'background .2s'}}>
                  <div style={{position:'absolute',top:2,width:16,height:16,borderRadius:'50%',
                    background:'#fff',transition:'left .2s',boxShadow:'0 1px 4px rgba(0,0,0,.2)',
                    left:withTimestamp?18:2}}/>
                </div>
                <span style={{fontSize:13,color:'#555',fontWeight:500}}>
                  Burn timestamp into frames
                </span>
              </label>
            </div>

            {/* Estimate */}
            <div className="info-bar blue" style={{marginBottom:0}}>
              🎬 Estimated: <strong>{estimatedCount()}</strong> screenshots at <strong>{getInterval()}s</strong> intervals
            </div>
          </ToolCard>
        </Reveal>
      )}

      {/* ── ANIMATED GIF GENERATOR ── */}
      {videoInfo && !processing && !done && (
        <Reveal delay={0.08}>
          <ToolCard style={{marginBottom:22}}>
            <div style={{fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:15,color:'#0d0d1a',marginBottom:18}}>
              🎞️ Compile Animated GIF
            </div>

            <div className="frow" style={{display:'flex',gap:12,marginBottom:12}}>
              <div className="fgrp" style={{flex:1}}>
                <label className="lbl">Start Time (seconds)</label>
                <input className="inp" type="number" min="0" step="0.1"
                  value={gifStart} onChange={e=>setGifStart(e.target.value)} placeholder="0"/>
              </div>
              <div className="fgrp" style={{flex:1}}>
                <label className="lbl">Duration (seconds, max 5s)</label>
                <input className="inp" type="number" min="0.5" max="5" step="0.5"
                  value={gifDuration} onChange={e=>setGifDuration(e.target.value)} placeholder="3"/>
              </div>
            </div>

            <div className="frow" style={{display:'flex',gap:12,marginBottom:12}}>
              <div className="fgrp" style={{flex:1}}>
                <label className="lbl">Frame Rate (FPS)</label>
                <select className="inp" value={gifFps} onChange={e=>setGifFps(parseInt(e.target.value))} style={{width:'100%', height:'48px', padding:'0 14px', borderRadius:13, border:'1.5px solid rgba(0,0,0,.08)', background:'#fafafa'}}>
                  <option value="5">5 FPS (Small File)</option>
                  <option value="8">8 FPS</option>
                  <option value="10">10 FPS (Standard)</option>
                  <option value="12">12 FPS</option>
                  <option value="15">15 FPS (Smooth)</option>
                </select>
              </div>
              <div className="fgrp" style={{flex:1}}>
                <label className="lbl">Resolution Width</label>
                <select className="inp" value={gifWidth} onChange={e=>setGifWidth(parseInt(e.target.value))} style={{width:'100%', height:'48px', padding:'0 14px', borderRadius:13, border:'1.5px solid rgba(0,0,0,.08)', background:'#fafafa'}}>
                  <option value="320">320px (Mobile-friendly)</option>
                  <option value="480">480px (Standard)</option>
                  <option value="640">640px (High Res)</option>
                </select>
              </div>
            </div>

            {compiledGif && (
              <motion.div initial={{opacity:0, scale:0.95}} animate={{opacity:1, scale:1}} style={{marginTop:16, border:'1px solid rgba(0,0,0,0.06)', borderRadius:14, padding:14, background:'#f8f9ff', textAlign:'center'}}>
                <div style={{fontSize:12.5, fontWeight:700, color:'#0d0d1a', marginBottom:10}}>Preview Compiled GIF</div>
                <img src={compiledGif} alt="Compiled GIF preview" style={{maxWidth:'100%', borderRadius:8, boxShadow:'0 4px 12px rgba(0,0,0,0.1)'}}/>
                <div style={{marginTop:14}}>
                  <button onClick={() => saveFileWithFallback(compiledGif, 'tooldesk-clip.gif', 'image/gif')} className="btn btn-blue" style={{display:'inline-block', width:'auto', padding:'10px 20px', textAlign:'center', cursor:'pointer'}}>
                    ⬇️ Download Animated GIF
                  </button>
                </div>
              </motion.div>
            )}

            {compilingGif ? (
              <div style={{marginTop:16, textAlign:'center'}}>
                <div style={{fontSize:13, fontWeight:600, color:'#666', marginBottom:8}}>Compiling Animation ({gifProgress}%)…</div>
                <div style={{width:'100%',height:6,background:'#e5e7ef',borderRadius:4,overflow:'hidden',marginBottom:12}}>
                  <div style={{width:`${gifProgress}%`, height:'100%', background:'linear-gradient(90deg,#9C6FDE,#4F8EF7)', transition:'width .2s'}}/>
                </div>
              </div>
            ) : (
              <motion.button
                whileHover={{scale:1.02}} whileTap={{scale:.98}}
                onClick={compileAnimation}
                className="btn btn-outline"
                style={{width:'100%', marginTop:12, borderColor:'#4F8EF7', color:'#4F8EF7', background:'rgba(79,142,247,0.04)'}}>
                ⚡ Generate Animated GIF
              </motion.button>
            )}
          </ToolCard>
        </Reveal>
      )}

      {/* ── EXTRACT BUTTON ── */}
      {videoInfo && !processing && !done && (
        <Reveal delay={0.1}>
          <motion.button
            whileHover={{scale:1.03,y:-2}} whileTap={{scale:.96}}
            onClick={extractFrames}
            className="btn btn-primary btn-lg btn-w"
            style={{ marginBottom:22 }}>
            🎬 Extract Screenshots
          </motion.button>
        </Reveal>
      )}

      {/* ── PROGRESS ── */}
      {processing && (
        <Reveal>
          <ToolCard style={{marginBottom:22,textAlign:'center'}}>
            <div style={{fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:16,color:'#0d0d1a',marginBottom:14}}>
              ⚙️ Extracting Frames…
            </div>
            <div style={{width:'100%',height:8,background:'#e5e7ef',borderRadius:4,overflow:'hidden',marginBottom:12}}>
              <motion.div animate={{width:`${progress}%`}} transition={{duration:.3}}
                style={{height:'100%',background:'linear-gradient(90deg,#b94fff,#4F8EF7,#00d2ff)',borderRadius:4}}/>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:13,fontWeight:600,color:'#666',marginBottom:14}}>
              <span>{progress}% complete</span>
              <span>{frames.length} frames captured</span>
            </div>
            <motion.button whileTap={{scale:.95}}
              onClick={()=>{abortRef.current=true;setProc(false)}}
              className="btn btn-outline btn-sm">
              ✕ Cancel
            </motion.button>
          </ToolCard>
        </Reveal>
      )}

      {/* ── RESULTS ── */}
      {frames.length > 0 && (
        <Reveal delay={0.05}>
          <ToolCard style={{marginBottom:22}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16,flexWrap:'wrap',gap:10}}>
              <div>
                <div style={{fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:16,color:'#0d0d1a'}}>
                  🖼️ {frames.length} {extractStrategy === 'scene' ? 'Scene Keyframes' : 'Screenshots'} Ready
                </div>
                <div style={{fontSize:12,color:'#aaa',marginTop:3}}>
                  {extractStrategy === 'scene' ? `Auto Scene Cuts (${sceneStats.evaluated} frames sampled) · ${format}` : `${format} · ${QUALITIES[qualityIdx].label} quality`}
                </div>
              </div>
              {done && (
                <motion.button
                  whileHover={{scale:1.04,y:-2}} whileTap={{scale:.96}}
                  onClick={downloadZip}
                  disabled={zipBuilding}
                  className="btn btn-blue"
                  style={{ opacity:zipBuilding?.7:1 }}>
                  {zipBuilding ? '⏳ Building ZIP…' : '⬇ Download ZIP'}
                </motion.button>
              )}
            </div>

            {/* Preview grid */}
            <div style={{
              display:'grid',
              gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))',
              gap:10,
              maxHeight:480,
              overflowY:'auto',
              paddingRight:4,
            }}>
              {frames.map((f,i)=>(
                <motion.div key={i}
                  initial={{opacity:0,y:8}}
                  animate={{opacity:1,y:0}}
                  transition={{duration:.18,delay:Math.min(i*.015,.3)}}
                  whileHover={{scale:1.03,boxShadow:'0 8px 24px rgba(0,0,0,.16)'}}
                  style={{ borderRadius:10,overflow:'hidden',border:'1px solid rgba(0,0,0,.08)',boxShadow:'0 2px 8px rgba(0,0,0,.06)',cursor:'pointer'}}>
                  <img decoding="async" src={f.url} alt={`Frame ${f.num}`}
                    loading="lazy"
                    style={{width:'100%',height:80,objectFit:'cover',display:'block'}}/>
                  <div style={{background:'rgba(0,0,0,.78)',padding:'5px 8px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{fontSize:11.5,color:'#fff',fontWeight:700}}>#{f.num}</span>
                    {f.isSceneCut && (
                      <span style={{fontSize:11,color:'#c4b5fd',fontWeight:800}}>🎬 Δ{f.deltaPct}%</span>
                    )}
                    <span style={{fontSize:11,color:'rgba(255,255,255,.85)'}}>{fmtDisplay(f.ts)}</span>
                  </div>
                </motion.div>
              ))}
            </div>

            {done && (
              <React.Fragment>
                <div style={{marginTop:16,display:'flex',gap:10,flexWrap:'wrap'}}>
                  <motion.button
                    whileHover={{scale:1.03,y:-1}} whileTap={{scale:.96}}
                    onClick={downloadZip}
                    disabled={zipBuilding}
                    className="btn btn-blue"
                    style={{ opacity:zipBuilding?.7:1 }}>
                    {zipBuilding ? '⏳ Building ZIP…' : `⬇ Download All ${frames.length} as ZIP`}
                  </motion.button>
                  <motion.button whileHover={{scale:1.03}} whileTap={{scale:.96}}
                    onClick={()=>{setFrames([]);setDone(false);framesRef.current=[]}}
                    className="btn btn-outline">
                    🔄 Extract Again
                  </motion.button>
                </div>

                {/* Workflow Tool Chaining */}
                {frames.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <ToolChainingBar
                      payload={{
                        dataUrl: frames[0].url,
                        filename: frames[0].name || `frame_001.${format.toLowerCase()}`,
                        mimeType: format === 'PNG' ? 'image/png' : format === 'JPG' ? 'image/jpeg' : 'image/webp',
                        type: 'image',
                        sourceTool: 'videoscreenshot'
                      }}
                    />
                  </div>
                )}
              </React.Fragment>
            )}
          </ToolCard>
        </Reveal>
      )}

      {/* ── SINGLE FRAME CAPTURE ── */}
      {videoInfo && !processing && (
        <Reveal delay={0.12}>
          <ToolCard style={{marginBottom:22}}>
            <div style={{fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:14,color:'#0d0d1a',marginBottom:14}}>
              🎯 Capture Single Frame
            </div>
            <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:12,flexWrap:'wrap'}}>
              <div style={{flex:1,minWidth:140}}>
                <label style={{fontSize:12,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'.5px',display:'block',marginBottom:6}}>
                  Timestamp (seconds)
                </label>
                <input type="number" min={0} max={videoInfo.duration} step={0.1}
                  value={singleTs} onChange={e=>setSingleTs(Math.min(videoInfo.duration, Math.max(0, parseFloat(e.target.value)||0)))}
                  style={{width:'100%',padding:'10px 12px',borderRadius:10,border:'1.5px solid rgba(0,0,0,.1)',
                    fontFamily:'DM Sans,sans-serif',fontSize:14,outline:'none',boxSizing:'border-box'}}/>
                <div style={{fontSize:12,color:'#64748b',marginTop:4}}>
                  Max: {fmtDisplay(videoInfo.duration)} ({Math.floor(videoInfo.duration)}s)
                </div>
              </div>
              <motion.button whileHover={{scale:1.04,y:-2}} whileTap={{scale:.95}}
                onClick={async()=>{
                  const canvas=canvasRef.current, video=videoRef.current
                  if(!canvas||!video) return
                  await new Promise(res=>{
                    const h=()=>{video.removeEventListener('seeked',h);res()}
                    video.addEventListener('seeked',h)
                    video.currentTime=singleTs
                    setTimeout(()=>{video.removeEventListener('seeked',h);res()},3000)
                  })
                  canvas.width=videoInfo.width; canvas.height=videoInfo.height
                  const ctx = canvas.getContext('2d')
                  ctx.drawImage(video,0,0,videoInfo.width,videoInfo.height)
                  if (withTimestamp) {
                    const fontSize = Math.max(12, Math.round(videoInfo.height * 0.045))
                    ctx.font = `bold ${fontSize}px monospace`
                    const text = fmtDisplay(singleTs)
                    const padding = Math.max(6, Math.round(videoInfo.height * 0.015))
                    const textWidth = ctx.measureText(text).width
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)'
                    const boxX = videoInfo.width - textWidth - padding * 3
                    const boxY = videoInfo.height - fontSize - padding * 2.5
                    ctx.fillRect(boxX, boxY, textWidth + padding * 2, fontSize + padding * 1.5)
                    ctx.fillStyle = '#ffffff'
                    ctx.textBaseline = 'top'
                    ctx.fillText(text, boxX + padding, boxY + padding * 0.75)
                  }
                  const mime=format==='PNG'?'image/png':format==='JPG'?'image/jpeg':'image/webp'
                  setSingleFr({url:canvas.toDataURL(mime,QUALITIES[qualityIdx].value),ts:singleTs})
                }}
                style={{padding:'10px 20px',borderRadius:11,border:'none',
                  background:'linear-gradient(135deg,#4F8EF7,#7c3aed)',
                  color:'#fff',fontWeight:700,fontSize:13,cursor:'pointer',alignSelf:'flex-end',flexShrink:0}}>
                📸 Capture
              </motion.button>
            </div>
            {singleFrame&&(
              <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}}
                style={{borderRadius:12,overflow:'hidden',border:'1px solid rgba(79,142,247,.15)',position:'relative'}}>
                <img decoding="async" loading="lazy" src={singleFrame.url} alt="Single frame" style={{width:'100%',display:'block',maxHeight:200,objectFit:'contain',background:'#0d0d1a'}}/>
                <div style={{position:'absolute',bottom:0,left:0,right:0,
                  background:'linear-gradient(transparent,rgba(0,0,0,.7))',
                  padding:'16px 12px 10px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{color:'rgba(255,255,255,.8)',fontSize:11,fontWeight:700}}>{fmtDisplay(singleFrame.ts)}</span>
                  <motion.button whileHover={{scale:1.06}} whileTap={{scale:.93}}
                    onClick={()=>{
                      const ext = format.toLowerCase()
                      const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`
                      saveFileWithFallback(singleFrame.url, `frame_${fmtTime(singleFrame.ts)}.${ext}`, mime)
                    }}
                    style={{padding:'5px 14px',borderRadius:8,border:'none',
                      background:'rgba(79,142,247,.9)',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer'}}>
                    ⬇ Save
                  </motion.button>
                </div>
              </motion.div>
            )}
          </ToolCard>
        </Reveal>
      )}

      {/* ── HOW TO USE ── */}
      <Reveal delay={0.15}>
        <ToolCard>
          <div style={{fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:15,color:'#0d0d1a',marginBottom:14}}>
            💡 How to use
          </div>
          {[
            ['1','Upload your video','Drop any MP4, MOV, AVI, MKV, WEBM or M4V file.'],
            ['2','Set interval & format','Choose how often to extract frames and in which format (PNG/JPG/WEBP).'],
            ['3','Extract','Hit Extract — frames appear live in a preview grid as they\'re captured.'],
            ['4','Download','Click Download ZIP to get all screenshots in one file instantly.'],
          ].map(([n,t,d])=>(
            <div key={n} style={{display:'flex',gap:14,marginBottom:14}}>
              <div style={{width:28,height:28,borderRadius:'50%',background:'rgba(79,142,247,.1)',color:'#4F8EF7',fontWeight:800,fontSize:13,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Syne,sans-serif'}}>{n}</div>
              <div>
                <div style={{fontWeight:700,fontSize:13.5,color:'#1a1a2e',marginBottom:2}}>{t}</div>
                <div style={{fontSize:12.5,color:'#888',lineHeight:1.6}}>{d}</div>
              </div>
            </div>
          ))}
          <div className="info-bar green" style={{marginBottom:0}}>
            🔒 <strong>100% private</strong> — all processing happens in your browser. No video is ever uploaded.
          </div>
        </ToolCard>
      </Reveal>
    </ToolShell>
  )
}
