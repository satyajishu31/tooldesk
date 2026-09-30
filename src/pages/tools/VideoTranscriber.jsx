import React, { useState, useRef, useCallback, useEffect, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ToolShell, { ToolCard, Reveal } from '../../components/ToolShell'
import { useCopy } from '../../hooks'
import { TOOLS } from '../../constants'
import { saveFileWithFallback } from '../../utils/fileSaver'
import { addToHistory } from '../../utils/history'
import { safeFetchJSON } from '../../utils/safeFetch'
import { resolveApiUrl, getApiHeaders } from '../../utils/apiConfig'
import { Search, Music, Scissors, Sparkles, GitMerge, Check, CheckCircle2, Film, HardDrive, Clock, X, AlertTriangle, Zap, UploadCloud, Loader2 } from 'lucide-react'

const tool = TOOLS.find(t => t.id === 'videotranscriber')

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */
const MAX_FILE_MB = 500                          // accept up to 500 MB input
const MAX_FILE_B = MAX_FILE_MB * 1024 * 1024
const CHUNK_MB = 4                            // 4 MB raw → ~5.3 MB base64, safe under Netlify 6 MB body limit
const CHUNK_B = CHUNK_MB * 1024 * 1024

const ACCEPT =
  'video/mp4,video/quicktime,video/x-msvideo,video/x-matroska,video/webm,video/x-m4v,' +
  'audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/aac,audio/flac,audio/webm,' +
  '.mp4,.mov,.avi,.mkv,.webm,.m4v,.mp3,.wav,.ogg,.m4a,.aac,.flac'

const LANGS = [
  { code: 'auto', label: 'Auto Detect', flag: '🌐' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'hi', label: 'Hindi', flag: '🇮🇳' },
  { code: 'bn', label: 'Bengali', flag: '🇮🇳' },
  { code: 'ta', label: 'Tamil', flag: '🇮🇳' },
  { code: 'te', label: 'Telugu', flag: '🇮🇳' },
  { code: 'ml', label: 'Malayalam', flag: '🇮🇳' },
  { code: 'mr', label: 'Marathi', flag: '🇮🇳' },
  { code: 'pa', label: 'Punjabi', flag: '🇮🇳' },
  { code: 'ur', label: 'Urdu', flag: '🇵🇰' },
  { code: 'ar', label: 'Arabic', flag: '🇸🇦' },
  { code: 'fr', label: 'French', flag: '🇫🇷' },
  { code: 'de', label: 'German', flag: '🇩🇪' },
  { code: 'es', label: 'Spanish', flag: '🇪🇸' },
  { code: 'pt', label: 'Portuguese', flag: '🇧🇷' },
  { code: 'ru', label: 'Russian', flag: '🇷🇺' },
  { code: 'ja', label: 'Japanese', flag: '🇯🇵' },
  { code: 'ko', label: 'Korean', flag: '🇰🇷' },
  { code: 'zh', label: 'Chinese', flag: '🇨🇳' },
  { code: 'it', label: 'Italian', flag: '🇮🇹' },
  { code: 'nl', label: 'Dutch', flag: '🇳🇱' },
  { code: 'tr', label: 'Turkish', flag: '🇹🇷' },
  { code: 'pl', label: 'Polish', flag: '🇵🇱' },
  { code: 'uk', label: 'Ukrainian', flag: '🇺🇦' },
  { code: 'vi', label: 'Vietnamese', flag: '🇻🇳' },
  { code: 'th', label: 'Thai', flag: '🇹🇭' },
  { code: 'id', label: 'Indonesian', flag: '🇮🇩' },
]

/* ─────────────────────────────────────────────
   PURE HELPERS
───────────────────────────────────────────── */
function fmtBytes(b) {
  if (b >= 1073741824) return (b / 1073741824).toFixed(2) + ' GB'
  if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB'
  return (b / 1024).toFixed(0) + ' KB'
}
function fmtDur(s) {
  if (!s || !isFinite(s)) return '--'
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60)
  return h > 0 ? `${h}h ${m}m ${sec}s` : m > 0 ? `${m}m ${sec}s` : `${sec}s`
}
function p2(n) { return String(Math.floor(Math.abs(n))).padStart(2, '0') }
function p3(n) { return String(Math.min(999, Math.max(0, Math.floor(n)))).padStart(3, '0') }
function fmtHMS(s) { return `${p2(s / 3600)}:${p2((s % 3600) / 60)}:${p2(s % 60)}` }
function fmtSRT(s) { return `${p2(s / 3600)}:${p2((s % 3600) / 60)}:${p2(s % 60)},${p3((s % 1) * 1000)}` }
function fmtVTT(s) { return `${p2(s / 3600)}:${p2((s % 3600) / 60)}:${p2(s % 60)}.${p3((s % 1) * 1000)}` }

function buildSRT(segs) {
  return segs.map((s, i) => `${i + 1}\n${fmtSRT(s.start)} --> ${fmtSRT(s.end)}\n${s.text}\n`).join('\n')
}
function buildVTT(segs) {
  return ['WEBVTT\n', ...segs.map(s => `${fmtVTT(s.start)} --> ${fmtVTT(s.end)}\n${s.text}\n`)].join('\n')
}
function dlFile(content, name, mime = 'text/plain') {
  saveFileWithFallback(content, name, mime)
  addToHistory({
    tool: 'Video Transcriber',
    label: `Exported ${name}`,
    value: name,
    action: 'Exported',
    category: 'Media',
    metadata: { filename: name, mime }
  })
}

/* ─────────────────────────────────────────────
   STEP 1 — ANALYZE FILE
   Returns { isVideo, isAudio, duration, name, size, mime }
───────────────────────────────────────────── */
function analyzeFile(file) {
  return new Promise((resolve, reject) => {
    const isAudio = file.type.startsWith('audio/')
    const isVideo = file.type.startsWith('video/')
    if (!isAudio && !isVideo) {
      return reject(new Error('Unsupported file. Please upload a video (MP4, MOV, MKV, WEBM, AVI) or audio (MP3, WAV, M4A, AAC, OGG, FLAC) file.'))
    }
    if (file.size > MAX_FILE_B) {
      return reject(new Error(`File is too large (${fmtBytes(file.size)}). Maximum allowed is ${MAX_FILE_MB} MB.`))
    }
    const url = URL.createObjectURL(file)
    const el = document.createElement(isVideo ? 'video' : 'audio')
    el.preload = 'metadata'
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve({ isVideo, isAudio: !isVideo, duration: el.duration, name: file.name, size: file.size, mime: file.type })
    }
    el.onerror = () => {
      URL.revokeObjectURL(url)
      // still resolve — some containers can't be analyzed in-browser but may still be processed
      resolve({ isVideo, isAudio: !isVideo, duration: null, name: file.name, size: file.size, mime: file.type })
    }
    el.src = url
  })
}

/* ─────────────────────────────────────────────
   SELF-HOSTED LOCAL FFMPEG LOADER
   Loads local assets from /ffmpeg/ without external CDN dependence
───────────────────────────────────────────── */
let _ff = null, _ffLoading = null

async function getFFmpeg(onLog) {
  if (_ff) return _ff
  if (_ffLoading) return _ffLoading

  _ffLoading = (async () => {
    if (typeof WebAssembly === 'undefined') {
      throw new Error('WebAssembly is not supported in this browser.')
    }

    const [{ FFmpeg }, { toBlobURL, fetchFile }] = await Promise.all([
      import('@ffmpeg/ffmpeg'),
      import('@ffmpeg/util')
    ])
    const ffmpeg = new FFmpeg()

    if (onLog) {
      ffmpeg.on('log', ({ message }) => onLog(message))
    }

    let coreURL = null
    let wasmURL = null
    try {
      const testRes = await fetch('/ffmpeg/ffmpeg-core.js', { method: 'HEAD' })
      if (testRes.ok) {
        coreURL = await toBlobURL('/ffmpeg/ffmpeg-core.js', 'text/javascript')
        wasmURL = await toBlobURL('/ffmpeg/ffmpeg-core.wasm', 'application/wasm')
      }
    } catch {}

    if (!coreURL || !wasmURL) {
      throw new Error('Self-hosted FFmpeg assets (/ffmpeg/) are not available. Please ensure public/ffmpeg/ files are present.')
    }

    await ffmpeg.load({ coreURL, wasmURL })

    _ff = {
      _fetchFile: (file) => fetchFile(file),
      _progressCb: null,
      on(evt, cb) {
        if (evt === 'progress') {
          this._progressCb = cb
          ffmpeg.on('progress', cb)
        }
      },
      off(evt, cb) {
        if (evt === 'progress') {
          this._progressCb = null
          if (cb) ffmpeg.off('progress', cb)
        }
      },
      async writeFile(name, data) {
        return await ffmpeg.writeFile(name, data)
      },
      async readFile(name) {
        return await ffmpeg.readFile(name)
      },
      async deleteFile(name) {
        try { return await ffmpeg.deleteFile(name) } catch {}
      },
      async exec(args) {
        return await ffmpeg.exec(args)
      }
    }
    return _ff
  })()

  try { return await _ffLoading }
  finally { _ffLoading = null }
}
function bufferToWav(buffer, sampleRate = 16000) {
  const numOfChan = 1
  const length = buffer.length * numOfChan * 2 + 44
  const out = new DataView(new ArrayBuffer(length))
  let sample = 0
  let pos = 0

  function writeString(str) {
    for (let i = 0; i < str.length; i++) {
      out.setUint8(pos++, str.charCodeAt(i))
    }
  }
  function setUint16(data) {
    out.setUint16(pos, data, true); pos += 2
  }
  function setUint32(data) {
    out.setUint32(pos, data, true); pos += 4
  }

  writeString('RIFF')
  setUint32(length - 8)
  writeString('WAVE')
  writeString('fmt ')
  setUint32(16)
  setUint16(1)
  setUint16(numOfChan)
  setUint32(sampleRate)
  setUint32(sampleRate * 2)
  setUint16(2)
  setUint16(16)
  writeString('data')
  setUint32(length - pos - 4)

  const channelData = buffer.getChannelData(0)
  for (let i = 0; i < buffer.length; i++) {
    sample = Math.max(-1, Math.min(1, channelData[i]))
    sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0
    out.setInt16(pos, sample, true)
    pos += 2
  }

  return new Blob([out], { type: 'audio/wav' })
}

async function extractAudioWebAudio(videoFile, { onProgress, signal } = {}) {
  // V-13: Cap Web Audio at 100MB — it loads the entire file into memory
  const WEB_AUDIO_MAX = 100 * 1024 * 1024
  if (videoFile.size > WEB_AUDIO_MAX) {
    throw new Error('File too large for native audio decoding, falling back to FFmpeg')
  }
  onProgress?.(10)
  const arrayBuffer = await videoFile.arrayBuffer()
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  onProgress?.(30)

  const tempCtx = new (window.AudioContext || window.webkitAudioContext)()
  let decodedBuffer
  try {
    decodedBuffer = await tempCtx.decodeAudioData(arrayBuffer)
  } finally {
    tempCtx.close().catch(() => { })
  }

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  onProgress?.(60)

  const targetSampleRate = 16000
  const offlineCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(
    1,
    Math.ceil(decodedBuffer.duration * targetSampleRate),
    targetSampleRate
  )

  const source = offlineCtx.createBufferSource()
  source.buffer = decodedBuffer
  source.connect(offlineCtx.destination)
  source.start(0)

  const resampledBuffer = await offlineCtx.startRendering()
  try { source.disconnect() } catch {}
  decodedBuffer = null

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  onProgress?.(90)

  const wavBlob = bufferToWav(resampledBuffer, targetSampleRate)
  onProgress?.(100)

  const audioFile = new File(
    [wavBlob],
    videoFile.name.replace(/\.[^.]+$/, '') + '_audio.wav',
    { type: 'audio/wav' }
  )
  return {
    audioFile,
    originalSize: videoFile.size,
    audioSize: audioFile.size,
    byteRate: 32000,
  }
}

async function extractAudio(videoFile, { onProgress, onLog, signal } = {}) {
  // If input file is ALREADY an audio file:
  // - If <= CHUNK_B, return directly without re-encoding overhead
  // - If > CHUNK_B and already WAV, return directly
  // - If > CHUNK_B and non-WAV, decode to 16kHz WAV so slicing preserves frame integrity
  if (videoFile.type.startsWith('audio/')) {
    const isWav = videoFile.type.includes('wav') || videoFile.name.toLowerCase().endsWith('.wav')
    if (videoFile.size <= CHUNK_B) {
      onProgress?.(100)
      return { audioFile: videoFile, originalSize: videoFile.size, audioSize: videoFile.size, byteRate: isWav ? 32000 : 8000 }
    }
    if (isWav) {
      onProgress?.(100)
      return { audioFile: videoFile, originalSize: videoFile.size, audioSize: videoFile.size, byteRate: 32000 }
    }
    onLog?.('Multi-chunk audio detected. Normalizing to 16kHz WAV for seamless frame alignment...')
  }

  // 1. Try Native Web Audio API first (0 WASM, 0 SharedArrayBuffer, instant)
  try {
    onLog?.('Decoding audio natively in browser...')
    return await extractAudioWebAudio(videoFile, { onProgress, signal })
  } catch (webAudioErr) {
    console.warn('[WebAudio] Native decode failed, falling back to FFmpeg WASM:', webAudioErr.message)
    onLog?.('Native decode failed. Fallback to FFmpeg WASM...')
  }

  // 2. FFmpeg WASM Fallback
  const logs = []
  const ff = await getFFmpeg(msg => {
    logs.push(msg)
    if (logs.length > 80) logs.shift()
    onLog?.(msg)
  })

  const uid = Math.random().toString(36).slice(2, 8)
  const ext = (videoFile.name.match(/\.[a-zA-Z0-9]+$/) || ['.bin'])[0]
  const inName = `input_${uid}${ext}`
  const outName = `output_${uid}.wav`

  let inputBytes
  try {
    inputBytes = await ff._fetchFile(videoFile)
  } catch (e) {
    throw new Error('Could not read the file — it may be corrupted or inaccessible. ' + e.message)
  }
  if (!inputBytes || inputBytes.length === 0)
    throw new Error('The selected file appears to be empty.')

  let ok = true
  let data = null

  const onProg = ({ progress }) => {
    const p = Math.min(99, Math.max(0, Math.round((progress || 0) * 100)))
    if (p > lastP) { lastP = p; onProgress?.(p) }
  }
  let lastP = 0

  try {
    await ff.writeFile(inName, inputBytes)
    inputBytes = null

    ff.on('progress', onProg)
    try {
      await ff.exec(['-y', '-i', inName, '-vn', '-ac', '1', '-ar', '16000', outName])
    } catch { ok = false }

    ff.off('progress', onProg)
    onProgress?.(100)

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    try { data = await ff.readFile(outName) } catch (e) { console.warn('readFile error:', e) }
  } finally {
    ff.off('progress', onProg)
    try { await ff.deleteFile(inName) } catch { }
    try { await ff.deleteFile(outName) } catch { }
  }

  if (!ok || !data || data.length === 0) {
    const tail = logs.slice(-5).join(' | ').slice(0, 300)
    throw new Error(
      'Audio extraction failed — this format or codec may not be supported in-browser.' +
      (tail ? ` Details: ${tail}` : '')
    )
  }

  const blob = new Blob([data.buffer], { type: 'audio/wav' })
  const audioFile = new File(
    [blob],
    videoFile.name.replace(/\.[^.]+$/, '') + '_audio.wav',
    { type: 'audio/wav' }
  )

  // Explicitly null out original video reference signal
  return {
    audioFile,
    originalSize: videoFile.size,
    audioSize: audioFile.size,
    byteRate: 32000,
  }
}

function createWavHeader(dataByteLength, sampleRate = 16000) {
  const header = new Uint8Array(44)
  const dv = new DataView(header.buffer)
  const writeStr = (pos, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(pos + i, s.charCodeAt(i)) }
  writeStr(0, 'RIFF')
  dv.setUint32(4, 36 + dataByteLength, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  dv.setUint32(16, 16, true)
  dv.setUint16(20, 1, true) // PCM format
  dv.setUint16(22, 1, true) // Mono
  dv.setUint32(24, sampleRate, true)
  dv.setUint32(28, sampleRate * 2, true) // Byte rate (16000 * 2)
  dv.setUint16(32, 2, true) // Block align
  dv.setUint16(34, 16, true) // Bits per sample
  writeStr(36, 'data')
  dv.setUint32(40, dataByteLength, true)
  return header
}

/* ─────────────────────────────────────────────
   STEP 3 — SLICE AUDIO INTO VALID CONTAINER CHUNKS
───────────────────────────────────────────── */
async function sliceChunks(file, byteRate = 32000) {
  const isWav = file.type.includes('wav') || file.name.endsWith('.wav')
  const chunks = []

  if (isWav) {
    // Skip original 44-byte WAV header and slice raw PCM frames
    const pcmStart = 44
    let offset = pcmStart
    const step = Math.floor((CHUNK_B - 44) / 2) * 2 // ensure 16-bit sample alignment

    while (offset < file.size) {
      const end = Math.min(offset + step, file.size)
      const pcmBlob = file.slice(offset, end)
      const pcmBuf = await pcmBlob.arrayBuffer()
      const header = createWavHeader(pcmBuf.byteLength, 16000)

      // Assemble valid WAV chunk
      const fullChunk = new Uint8Array(header.byteLength + pcmBuf.byteLength)
      fullChunk.set(header, 0)
      fullChunk.set(new Uint8Array(pcmBuf), header.byteLength)

      const physicalDuration = pcmBuf.byteLength / 32000
      chunks.push({
        buf: fullChunk.buffer,
        index: chunks.length,
        start: offset,
        end,
        physicalDuration,
        mime: 'audio/wav',
        fileName: `chunk_${chunks.length}.wav`,
      })
      offset = end
    }
  } else {
    let offset = 0
    while (offset < file.size) {
      const end = Math.min(offset + CHUNK_B, file.size)
      const slice = file.slice(offset, end)
      const buf = await slice.arrayBuffer()
      const physicalDuration = buf.byteLength / (byteRate || 8000)
      chunks.push({
        buf,
        index: chunks.length,
        start: offset,
        end,
        physicalDuration,
        mime: file.type || 'audio/mpeg',
        fileName: file.name || 'audio.mp3',
      })
      offset = end
    }
  }

  return chunks
}

/* ─────────────────────────────────────────────
   ArrayBuffer → base64  (chunked, avoids call-stack overflow)
───────────────────────────────────────────── */
function ab2b64(ab) {
  const bytes = new Uint8Array(ab)
  let bin = ''
  const STEP = 8192
  for (let i = 0; i < bytes.length; i += STEP)
    bin += String.fromCharCode(...bytes.subarray(i, Math.min(i + STEP, bytes.length)))
  return btoa(bin)
}

/* ─────────────────────────────────────────────
   STEP 4 — TRANSCRIBE ONE CHUNK via Netlify function
───────────────────────────────────────────── */
async function transcribeChunk({ b64, mime, fileName, language, chunkIndex, totalChunks, signal }) {
  let res
  try {
    res = await fetch(resolveApiUrl('/.netlify/functions/transcribe'), {
      method: 'POST',
      headers: getApiHeaders({ 'Content-Type': 'application/json' }),
      signal,
      body: JSON.stringify({
        audioBase64: b64,
        mimeType: mime || 'audio/mpeg',
        fileName: fileName || 'audio.mp3',
        language: language === 'auto' ? null : language,
        chunkIndex,
        totalChunks,
      }),
    })
  } catch (e) {
    if (e.name === 'AbortError') throw e
    throw new Error('Network error — cannot reach the transcription server. Check your internet connection.')
  }

  if (!res.ok) {
    let msg = `Server error ${res.status}`
    try {
      const text = await res.text()
      try {
        const err = JSON.parse(text)
        if (err.error) {
          if (res.status === 503 || err.error.includes('GROQ_API_KEY'))
            msg = '🔑 GROQ_API_KEY is missing. Add it in Netlify → Site settings → Environment variables, then redeploy.'
          else if (res.status === 413)
            msg = `Chunk too large for server. Try a shorter or lower-bitrate file. (${err.error})`
          else
            msg = err.error
        }
      } catch {
        if (res.status === 502 || res.status === 504)
          msg = 'Server timed out — Groq API may be slow right now. Try again in a moment.'
        else if (res.status === 404)
          msg = 'Transcription function not found. Redeploy the Netlify site with functions enabled.'
        else if (text)
          msg = `Server error ${res.status}: ${text.slice(0, 180)}`
      }
    } catch { }
    throw new Error(msg)
  }

  return await res.json()
}

/* ─────────────────────────────────────────────
   STEP 5 — MERGE CHUNK RESULTS WITH PHYSICAL TIMESTAMPS
───────────────────────────────────────────── */
function mergeResults(chunkResults, byteRate) {
  const segments = []
  let fullText = ''
  let detectedLang = ''
  let offset = 0
  const rate = typeof byteRate === 'number' && byteRate > 0 ? byteRate : 8000

  for (const { data, chunkBytesSize, physicalDuration } of chunkResults) {
    if (!data || typeof data !== 'object') continue
    if (!detectedLang && typeof data.language === 'string') detectedLang = data.language

    const rawSegs = Array.isArray(data.segments) ? data.segments : []
    let chunkMaxEnd = 0
    for (const s of rawSegs) {
      if (!s || typeof s !== 'object') continue
      const segStart = (Number(s.start) || 0) + offset
      const segEnd = (Number(s.end) || 0) + offset
      if (s.end > chunkMaxEnd) chunkMaxEnd = Number(s.end) || 0
      segments.push({
        ...s,
        id: segments.length,
        start: segStart,
        end: segEnd,
        text: typeof s.text === 'string' ? s.text : '',
      })
    }

    const chunkText = typeof data.text === 'string'
      ? data.text.trim()
      : rawSegs.map(s => s?.text || '').filter(Boolean).join(' ').trim()
    fullText = fullText ? fullText + ' ' + chunkText : chunkText

    // Prioritize Whisper's exact decoded audio duration to eliminate subtitle timestamp drift
    const chunkDuration = (typeof data.duration === 'number' && data.duration > 0)
      ? data.duration
      : (chunkMaxEnd > 0
          ? chunkMaxEnd
          : ((typeof physicalDuration === 'number' && physicalDuration > 0)
              ? physicalDuration
              : ((Number(chunkBytesSize) || 0) / rate)))

    offset += chunkDuration
  }

  return { segments, fullText: fullText.trim(), detectedLang }
}

/* ─────────────────────────────────────────────
   WAVEFORM ANIMATION
───────────────────────────────────────────── */
const Waveform = memo(function Waveform({ active }) {
  const [heights, setHeights] = useState(() => Array.from({ length: 32 }, () => 4 + Math.random() * 28))
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => {
      setHeights(Array.from({ length: 32 }, (_, i) => {
        const base = 6 + Math.sin(Date.now() * .003 + i * .4) * 10
        return Math.max(4, Math.min(34, base + Math.random() * 18))
      }))
    }, 80)
    return () => clearInterval(id)
  }, [active])

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2.5, height: 40 }}>
      {heights.map((h, i) => (
        <motion.div key={i}
          animate={{ height: active ? `${h}px` : '3px', opacity: active ? .7 + (h / 34) * .3 : .15 }}
          transition={{ duration: .09, ease: 'linear' }}
          style={{
            width: 3.5, borderRadius: 3,
            background: active
              ? `linear-gradient(180deg,hsl(${200 + i * 3},90%,65%),hsl(${270 + i * 2},80%,60%))`
              : '#dde1ef',
            minHeight: 3
          }} />
      ))}
    </div>
  )
})

/* ─────────────────────────────────────────────
   PIPELINE STEP INDICATOR
   analyze → extract → chunk → ai → merge → done
───────────────────────────────────────────── */
const PIPELINE = [
  { id: 'analyze', label: 'Analyze', icon: Search },
  { id: 'extract', label: 'Extract', icon: Music },
  { id: 'chunk', label: 'Chunking', icon: Scissors },
  { id: 'ai', label: 'AI', icon: Sparkles },
  { id: 'merge', label: 'Merge', icon: GitMerge },
  { id: 'done', label: 'Done', icon: Check },
]
const PHASE_ORDER = ['', 'analyze', 'extract', 'chunk', 'ai', 'merge', 'done']

function PipelineBar({ phase }) {
  const cur = PHASE_ORDER.indexOf(phase)
  return (
    <div style={{ display: 'flex', gap: 3, marginBottom: 20 }}>
      {PIPELINE.map((s, i) => {
        const isActive = cur === i + 1
        const isDone = cur > i + 1
        const IconComp = s.icon
        return (
          <div key={s.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <motion.div
              animate={isActive ? { scale: [1, 1.18, 1] } : { scale: 1 }}
              transition={{ duration: .65, repeat: isActive ? Infinity : 0 }}
              style={{
                width: 34, height: 34, borderRadius: '50%',
                background: isDone ? '#22c55e' : isActive ? '#4F8EF7' : '#e8eaef',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background .3s',
                boxShadow: isActive ? '0 0 0 6px rgba(79,142,247,.15)' : isDone ? '0 0 0 4px rgba(34,197,94,.15)' : 'none'
              }}>
              {isDone ? <Check size={16} color="#ffffff" /> : <IconComp size={15} color={isActive ? '#ffffff' : '#64748b'} />}
            </motion.div>
            <div style={{
              fontSize: 9, fontWeight: 600, textAlign: 'center', letterSpacing: '.2px',
              color: isActive ? '#4F8EF7' : isDone ? '#22c55e' : '#ccc'
            }}>
              {s.label}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ─────────────────────────────────────────────
   FILE INFO BAR
───────────────────────────────────────────── */
function FileBar({ info, onClear }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px',
        background: 'linear-gradient(135deg,rgba(79,142,247,.06),rgba(156,111,222,.04))',
        borderRadius: 16, border: '1px solid rgba(79,142,247,.14)', marginBottom: 18
      }}>
      <div style={{
        width: 46, height: 46, borderRadius: 13, flexShrink: 0,
        background: 'linear-gradient(135deg,#4F8EF7,#9C6FDE)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 4px 14px rgba(79,142,247,.3)'
      }}>
        {info.isAudio ? <Music size={22} color="#fff" /> : <Film size={22} color="#fff" />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 14, color: '#0d0d1a',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
        }}>{info.name}</div>
        <div style={{ fontSize: 11.5, color: '#888', marginTop: 3, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}><HardDrive size={12} /> {fmtBytes(info.size)}</span>
          {info.duration && <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}><Clock size={12} /> {fmtDur(info.duration)}</span>}
          <span style={{ color: info.isAudio ? '#22c55e' : '#f59e0b', fontWeight: 600, display:'inline-flex', alignItems:'center', gap:4 }}>
            {info.isAudio ? <><Music size={12} /> Audio file</> : <><Film size={12} /> Video file</>}
          </span>
        </div>
      </div>
      <button onClick={onClear}
        style={{
          padding: '7px 14px', borderRadius: 999, border: '1.5px solid rgba(0,0,0,.1)',
          background: '#fff', fontSize: 12, fontWeight: 600, color: '#666', cursor: 'pointer', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
        <X size={14} />
      </button>
    </motion.div>
  )
}

/* ═══════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════ */
export default function VideoTranscriber() {
  /* ── State ── */
  const [fileInfo, setFileInfo] = useState(null)     // analyzed file metadata
  const [rawFile, setRawFile] = useState(null)     // the actual File object
  const [isDrag, setDrag] = useState(false)
  const [lang, setLang] = useState('auto')
  const langRef = useRef('auto')

  const handleLangChange = useCallback((newLang) => {
    langRef.current = newLang
    setLang(newLang)
  }, [])

  const [running, setRunning] = useState(false)
  const [phase, setPhase] = useState('')       // pipeline phase id
  const [progress, setProgress] = useState(0)
  const [chunkProg, setChunkProg] = useState({ current: 0, total: 0 })

  const [error, setError] = useState('')
  const [segments, setSegs] = useState([])
  const [fullText, setFull] = useState('')
  const [detLang, setDetLang] = useState('')
  const [stats, setStats] = useState(null)

  const [extractInfo, setExtractInfo] = useState(null)  // { before, after } bytes

  const [exportFmt, setExportFmt] = useState('TXT')
  const [searchQ, setSearch] = useState('')
  const [editMode, setEdit] = useState(false)
  const [timeOffset, setTimeOffset] = useState(0)
  const [activeEditIdx, setActiveEditIdx] = useState(null)
  const [copied, copy] = useCopy()

  /* AI Video Intelligence Studio State */
  const [aiInsights, setAiInsights] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [mediaUrl, setMediaUrl] = useState(null)
  const mediaRef = useRef(null)

  useEffect(() => {
    if (rawFile) {
      const url = URL.createObjectURL(rawFile)
      setMediaUrl(url)
      return () => URL.revokeObjectURL(url)
    } else {
      setMediaUrl(null)
    }
  }, [rawFile])

  const seekTo = (sec) => {
    if (mediaRef.current && Number.isFinite(sec)) {
      try {
        const dur = Number.isFinite(mediaRef.current.duration) && mediaRef.current.duration > 0
          ? mediaRef.current.duration
          : Infinity
        mediaRef.current.currentTime = Math.min(dur, Math.max(0, sec))
        mediaRef.current.play().catch(() => {})
      } catch (e) {
        console.warn('Seek error:', e)
      }
    }
  }

  const handleGenerateInsights = async () => {
    if (!fullText.trim()) return
    setAiLoading(true)
    setAiError('')
    try {
      const data = await safeFetchJSON('/.netlify/functions/groq-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'videoInsights',
          payload: {
            transcript: fullText.slice(0, 25000),
            duration: fileInfo?.duration || 0
          }
        })
      })
      if (data?.error) throw new Error(data.error)
      if (!data?.insights) throw new Error('No insights returned from AI')
      setAiInsights(data.insights)
    } catch (err) {
      setAiError(err?.message || 'Failed to generate video intelligence')
    } finally {
      setAiLoading(false)
    }
  }

  const fileRef = useRef(null)
  const abortCtrl = useRef(null)
  const startTs = useRef(0)
  const segListRef = useRef(null)
  const byteRateRef = useRef(8000)

  const isDone = phase === 'done'
  const wordCount = fullText.trim() ? fullText.trim().split(/s+/).filter(Boolean).length : 0
  const filtSegs = segments.filter(s => !searchQ || s.text.toLowerCase().includes(searchQ.toLowerCase()))
  const currentLang = LANGS.find(l => l.code === lang) || LANGS[0]

  useEffect(() => {
    if (segListRef.current)
      segListRef.current.scrollTop = segListRef.current.scrollHeight
  }, [segments])

  useEffect(() => {
    return () => {
      abortCtrl.current?.abort()
    }
  }, [])

  /* ── Reset everything ── */
  const reset = useCallback(() => {
    abortCtrl.current?.abort()
    setFileInfo(null); setRawFile(null)
    setSegs([]); setFull(''); setPhase(''); setProgress(0)
    setError(''); setStats(null); setDetLang(''); setRunning(false)
    setEdit(false); setChunkProg({ current: 0, total: 0 }); setExtractInfo(null)
    setAiInsights(null); setAiLoading(false); setAiError('')
  }, [])

  /* ── Load & analyze a dropped/chosen file ── */
  const loadFile = useCallback(async (f) => {
    if (!f) return
    setError(''); setSegs([]); setFull(''); setPhase('loading')
    setProgress(0); setStats(null); setDetLang(''); setChunkProg({ current: 0, total: 0 }); setExtractInfo(null)

    try {
      const info = await analyzeFile(f)
      setRawFile(f)
      setFileInfo(info)
      setPhase('ready')
    } catch (e) {
      setError(e.message)
      setPhase('')
    }
  }, [])

  /* ════════════════════════════════════════
     MAIN PIPELINE
     1. Analyze  (done during loadFile)
     2. Extract audio (if video)
     3. Chunk audio
     4. Transcribe each chunk
     5. Merge results
  ════════════════════════════════════════ */
  const run = useCallback(async () => {
    if (!rawFile || !fileInfo) return
    abortCtrl.current = new AbortController()
    const { signal } = abortCtrl.current

    setRunning(true); setError(''); setSegs([]); setFull('')
    setStats(null); setDetLang(''); setProgress(3); setExtractInfo(null)
    startTs.current = Date.now()

    try {
      /* ── PHASE: extract ── */
      let workFile = rawFile

      setPhase('extract'); setProgress(5)

      const result = await extractAudio(rawFile, {
        onProgress: p => setProgress(5 + Math.round(p * 0.20)),   // 5% → 25%
        signal,
      })

      if (signal.aborted) return

      workFile = result.audioFile
      byteRateRef.current = result.byteRate || 8000
      setExtractInfo({ before: result.originalSize, after: result.audioSize })

      // Null out the original File reference from our state so GC can free it
      setRawFile(null)

      if (signal.aborted) return

      /* ── PHASE: chunk ── */
      setPhase('chunk'); setProgress(28)
      const chunks = await sliceChunks(workFile, byteRateRef.current)
      const total = chunks.length
      setChunkProg({ current: 0, total })

      if (signal.aborted) return

      /* ── PHASE: ai — transcribe each chunk ── */
      setPhase('ai'); setProgress(32)

      const chunkResults = []

      for (let i = 0; i < chunks.length; i++) {
        if (signal.aborted) return
        setChunkProg({ current: i + 1, total })

        const b64 = ab2b64(chunks[i].buf)
        const data = await transcribeChunk({
          b64,
          mime: chunks[i].mime || workFile.type || 'audio/wav',
          fileName: chunks[i].fileName || workFile.name || 'audio.wav',
          language: langRef.current || lang,
          chunkIndex: i,
          totalChunks: total,
          signal,
        })

        if (signal.aborted) return

        chunkResults.push({
          data,
          chunkBytesSize: chunks[i].buf.byteLength,
          physicalDuration: chunks[i].physicalDuration,
        })

        // Live update after each chunk
        const partial = mergeResults(chunkResults, byteRateRef.current)
        setSegs([...partial.segments])
        setFull(partial.fullText)
        if (partial.detectedLang) setDetLang(partial.detectedLang)

        setProgress(32 + Math.round(((i + 1) / total) * 55))   // 32% → 87%
      }

      if (signal.aborted) return

      /* ── PHASE: merge ── */
      setPhase('merge'); setProgress(92)
      if (total > 1) await new Promise(r => setTimeout(r, 500))

      // Final merge
      const final = mergeResults(chunkResults, byteRateRef.current)
      setSegs(final.segments)
      setFull(final.fullText)
      if (final.detectedLang) setDetLang(final.detectedLang)

      /* ── DONE ── */
      setPhase('done'); setProgress(100)
      const elapsed = ((Date.now() - startTs.current) / 1000).toFixed(1)
      const wordCount = final.fullText.trim().split(/\s+/).filter(Boolean).length
      setStats({
        words: wordCount,
        segs: final.segments.length,
        chars: final.fullText.length,
        elapsed,
        chunks: total,
        lang: final.detectedLang,
      })
      addToHistory({
        tool: 'Video Transcriber',
        label: `${fileInfo?.name || 'Media'}: ${final.segments.length} segments (${wordCount} words)`,
        value: `${fileInfo?.name || 'Media'} transcribed in ${final.detectedLang || 'auto'}`,
        action: 'Transcribed',
        category: 'Media',
        metadata: {
          filename: fileInfo?.name,
          duration: fileInfo?.duration,
          segmentsCount: final.segments.length,
          wordCount,
          lang: final.detectedLang
        }
      })

    } catch (e) {
      if (e.name !== 'AbortError' && !signal.aborted) {
        setError(e.message || 'Transcription failed. Please try again.')
        setPhase('error')
      }
    } finally {
      setRunning(false)
    }
  }, [rawFile, fileInfo, lang])

  /* ─────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────── */
  return (
    <ToolShell tool={tool}>

      {/* ── UPLOAD ZONE ── */}
      {!fileInfo && phase !== 'loading' && (
        <ToolCard style={{ marginBottom: 20 }}>
          <motion.label
            onDragOver={e => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); loadFile(e.dataTransfer.files[0]) }}
            animate={{
              scale: isDrag ? 1.015 : 1,
              borderColor: isDrag ? '#4F8EF7' : 'rgba(0,0,0,.1)',
              background: isDrag ? 'rgba(79,142,247,.04)' : '#fff',
            }}
            style={{
              display: 'block', border: '2px dashed rgba(0,0,0,.1)', borderRadius: 20,
              padding: '52px 24px', textAlign: 'center', cursor: 'pointer', transition: 'background .2s'
            }}>
            <input ref={fileRef} type="file" accept={ACCEPT} style={{ display: 'none' }}
              onChange={e => loadFile(e.target.files[0])} />
            <motion.div animate={{ y: isDrag ? -10 : 0 }} transition={{ type: 'spring', stiffness: 280, damping: 22 }}>
              <motion.div
                animate={{ scale: [1, 1.06, 1], filter: ['drop-shadow(0 4px 12px rgba(79,142,247,.2))', 'drop-shadow(0 8px 24px rgba(79,142,247,.4))', 'drop-shadow(0 4px 12px rgba(79,142,247,.2))'] }}
                transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
                style={{ fontSize: 56, marginBottom: 16 }}>
                {isDrag ? '📂' : '🎙️'}
              </motion.div>
              <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 20, fontWeight: 800, color: '#0d0d1a', marginBottom: 8 }}>
                {isDrag ? 'Drop to analyze & transcribe' : 'Drop your video or audio file'}
              </div>
              <div style={{ fontSize: 13, color: '#aaa', marginBottom: 4, lineHeight: 1.9 }}>
                Video: MP4 · MOV · MKV · WEBM · AVI · M4V
              </div>
              <div style={{ fontSize: 13, color: '#aaa', marginBottom: 24, lineHeight: 1.9 }}>
                Audio: MP3 · WAV · M4A · AAC · OGG · FLAC
              </div>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 16px', borderRadius: 999, marginBottom: 22,
                background: 'linear-gradient(135deg,rgba(79,142,247,.1),rgba(156,111,222,.08))',
                border: '1px solid rgba(79,142,247,.2)'
              }}>
                <Zap size={13} color="#4F8EF7" />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#4F8EF7' }}>Up to {MAX_FILE_MB} MB</span>
              </div>
              <br />
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: 'linear-gradient(135deg,#0d0d1a,#1a1040)', color: '#fff',
                padding: '14px 34px', borderRadius: 999, fontFamily: 'Syne,sans-serif',
                fontWeight: 700, fontSize: 14, boxShadow: '0 8px 26px rgba(13,13,26,.28)'
              }}>
                <UploadCloud size={16} /> Choose File
              </div>
            </motion.div>
          </motion.label>

          {/* Feature badges */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 18 }}>
            {['Auto-Analysis', 'Audio Extraction', 'Smart Chunking', 'Groq Whisper v3', '27 Languages', 'TXT · SRT · VTT'].map(t => (
              <span key={t} style={{
                fontSize: 11.5, padding: '5px 13px', borderRadius: 999, fontWeight: 600,
                background: 'rgba(79,142,247,.07)', color: '#4F8EF7', border: '1px solid rgba(79,142,247,.16)'
              }}>
                {t}
              </span>
            ))}
          </div>
        </ToolCard>
      )}

      {/* ── ANALYZING SPINNER ── */}
      {phase === 'loading' && (
        <ToolCard style={{ marginBottom: 18, textAlign: 'center', padding: '36px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <Loader2 size={38} color="#4F8EF7" className="spin" />
          </div>
          <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 15, color: '#0d0d1a' }}>
            Analyzing file…
          </div>
          <div style={{ fontSize: 12.5, color: '#aaa', marginTop: 6 }}>
            Detecting type, format and duration
          </div>
        </ToolCard>
      )}

      {/* ── ERROR ── */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
            style={{
              background: 'rgba(239,68,68,.06)', border: '1.5px solid rgba(239,68,68,.2)',
              borderRadius: 14, padding: '14px 18px', marginBottom: 16, fontSize: 13,
              color: '#b91c1c', lineHeight: 1.75
            }}>
            <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}><AlertTriangle size={15} color="#b91c1c" /> <strong>{running ? 'Warning:' : 'Error:'}</strong></span> {error}
            <button onClick={() => setError('')}
              style={{
                marginLeft: 14, fontSize: 12, fontWeight: 700, color: '#b91c1c',
                background: 'none', border: '1px solid rgba(185,28,28,.3)',
                borderRadius: 8, padding: '3px 10px', cursor: 'pointer'
              }}>Dismiss</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── FILE INFO + SETTINGS ── */}
      {fileInfo && !running && (phase === 'ready' || phase === 'error') && (
        <Reveal>
          <ToolCard style={{ marginBottom: 18 }}>
            <FileBar info={fileInfo} onClear={reset} />

            {/* Analysis result */}
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
              style={{
                background: 'linear-gradient(135deg,rgba(34,197,94,.06),rgba(79,142,247,.04))',
                border: '1px solid rgba(34,197,94,.2)', borderRadius: 13, padding: '13px 16px', marginBottom: 16
              }}>
              <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 13, color: '#166534', marginBottom: 6, display:'flex', alignItems:'center', gap:6 }}>
                <CheckCircle2 size={15} color="#166534" /> File Analyzed
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12.5, color: '#3f6b4f' }}>
                <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}><HardDrive size={12} /> Size: <strong>{fmtBytes(fileInfo.size)}</strong></span>
                {fileInfo.duration && <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}><Clock size={12} /> Duration: <strong>{fmtDur(fileInfo.duration)}</strong></span>}
                <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}>{fileInfo.isVideo ? <Film size={12} /> : <Music size={12} />} Type: <strong>{fileInfo.isVideo ? 'Video' : 'Audio'}</strong></span>
                {fileInfo.isVideo && (
                  <span style={{ color: '#1e3a8a', fontWeight: 600, display:'inline-flex', alignItems:'center', gap:4 }}>
                    <Music size={12} /> Audio will be extracted before transcription
                  </span>
                )}
              </div>
            </motion.div>

            {/* Language */}
            <div style={{ marginBottom: 16 }}>
              <label className="lbl">Transcription Language</label>
              <div style={{ position: 'relative' }}>
                <select className="inp sel" value={lang} onChange={e => handleLangChange(e.target.value)}
                  style={{ fontWeight: 600, paddingLeft: 38 }}>
                  {LANGS.map(l => <option key={l.code} value={l.code}>{l.flag} {l.label}</option>)}
                </select>
                <span style={{
                  position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)',
                  fontSize: 16, pointerEvents: 'none'
                }}>{currentLang.flag}</span>
              </div>
              {lang === 'auto' && (
                <div style={{ fontSize: 11.5, color: '#4F8EF7', marginTop: 5, fontWeight: 500 }}>
                  ✨ Whisper will automatically detect the spoken language
                </div>
              )}
            </div>

            {/* Pipeline preview */}
            <div style={{
              background: 'rgba(79,142,247,.04)', border: '1px solid rgba(79,142,247,.12)',
              borderRadius: 13, padding: '12px 16px'
            }}>
              <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 13, color: '#0d0d1a', marginBottom: 8 }}>
                🔄 Pipeline
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#555', flexWrap: 'wrap' }}>
                {(fileInfo.isVideo
                  ? [['🔍', 'Analyze'], ['🎵', 'Extract Audio'], ['✂️', 'Chunk'], ['🤖', 'AI Transcribe'], ['🔗', 'Merge'], ['📄', 'Output']]
                  : [['🔍', 'Analyze'], ['✂️', 'Chunk'], ['🤖', 'AI Transcribe'], ['🔗', 'Merge'], ['📄', 'Output']]
                ).map(([stepIcon, label], i, arr) => (
                  <React.Fragment key={label}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span>{stepIcon}</span><span style={{ fontWeight: 600 }}>{label}</span>
                    </span>
                    {i < arr.length - 1 && <span style={{ color: '#ccc' }}>→</span>}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </ToolCard>
        </Reveal>
      )}

      {/* ── START BUTTON ── */}
      {fileInfo && !running && (phase === 'ready' || phase === 'error') && (
        <Reveal delay={0.05}>
          <motion.button
            whileHover={{ scale: 1.02, y: -2, boxShadow: '0 16px 44px rgba(79,142,247,.42)' }}
            whileTap={{ scale: .97 }}
            onClick={run}
            style={{
              width: '100%', padding: '18px', borderRadius: 18,
              background: 'linear-gradient(135deg,#0d0d1a,#1e1040)', color: '#fff',
              border: 'none', fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 17,
              cursor: 'pointer', marginBottom: 14, boxShadow: '0 8px 28px rgba(13,13,26,.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, letterSpacing: '-.3px'
            }}>
            <span style={{ fontSize: 24 }}>🤖</span>
            {phase === 'error' ? 'Retry Transcription' : 'Start Transcription'}
          </motion.button>
        </Reveal>
      )}

      {/* ── PROCESSING ── */}
      {running && (
        <Reveal>
          <ToolCard style={{ marginBottom: 18 }}>
            <PipelineBar phase={phase} />

            {/* Waveform + status */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: 'rgba(79,142,247,.04)', borderRadius: 14, padding: '10px 16px',
              marginBottom: 14, border: '1px solid rgba(79,142,247,.1)'
            }}>
              <Waveform active={running} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#4F8EF7' }}>
                  {phase === 'analyze' ? '🔍 Analyzing file…'
                    : phase === 'extract' ? '🎵 Extracting audio from video…'
                      : phase === 'chunk' ? '✂️ Splitting into chunks…'
                        : phase === 'ai' ? '🤖 Groq Whisper transcribing…'
                          : phase === 'merge' ? '🔗 Merging all chunks…'
                            : 'Processing…'}
                </div>
                <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>
                  {phase === 'extract'
                    ? 'Converting video to small audio file in-browser (this may take a moment)'
                    : chunkProg.total > 1
                      ? `Chunk ${chunkProg.current} of ${chunkProg.total}`
                      : `${currentLang.flag} ${lang === 'auto' ? 'Auto language detection' : currentLang.label}`}
                </div>
              </div>
              <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 18, color: '#4F8EF7' }}>
                {Math.round(progress)}%
              </div>
            </div>

            {/* Progress bar */}
            <div style={{ height: 7, background: '#e5e7ef', borderRadius: 4, overflow: 'hidden', marginBottom: 14 }}>
              <motion.div animate={{ width: `${progress}%` }} transition={{ duration: .7, ease: 'easeOut' }}
                style={{ height: '100%', background: 'linear-gradient(90deg,#7c3aed,#4F8EF7,#06b6d4)', borderRadius: 4 }} />
            </div>

            {/* Chunk dots */}
            {chunkProg.total > 1 && (
              <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
                {Array.from({ length: chunkProg.total }).map((_, i) => (
                  <motion.div key={i}
                    animate={{ background: i < chunkProg.current ? '#22c55e' : i === chunkProg.current - 1 ? '#4F8EF7' : '#e8eaef', scale: i === chunkProg.current - 1 ? 1.15 : 1 }}
                    style={{ flex: 1, height: 6, borderRadius: 3, minWidth: 14 }} />
                ))}
              </div>
            )}

            {/* Live stats */}
            {wordCount > 0 && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                {[{ l: 'Words', v: wordCount.toLocaleString() }, { l: 'Segments', v: segments.length }, { l: 'Progress', v: `${Math.round(progress)}%` }].map(s => (
                  <div key={s.l} style={{
                    flex: 1, background: '#f8f9ff', borderRadius: 10, padding: '9px 10px',
                    textAlign: 'center', border: '1px solid rgba(0,0,0,.06)'
                  }}>
                    <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 17, color: '#4F8EF7' }}>{s.v}</div>
                    <div style={{ fontSize: 9.5, color: '#bbb', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px', marginTop: 2 }}>{s.l}</div>
                  </div>
                ))}
              </div>
            )}

            <motion.button whileTap={{ scale: .96 }}
              onClick={() => { abortCtrl.current?.abort(); setRunning(false); setPhase('error') }}
              style={{
                width: '100%', padding: '10px', borderRadius: 11,
                border: '1.5px solid rgba(239,68,68,.25)', background: 'rgba(239,68,68,.05)',
                color: '#dc2626', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif'
              }}>
              ⏹ Cancel
            </motion.button>
          </ToolCard>
        </Reveal>
      )}

      {/* ── DONE STATS ── */}
      {isDone && stats && (
        <Reveal>
          <motion.div initial={{ opacity: 0, y: 8, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            style={{
              background: 'linear-gradient(135deg,rgba(34,197,94,.07),rgba(79,142,247,.05))',
              border: '1.5px solid rgba(34,197,94,.22)', borderRadius: 18, padding: '18px 22px', marginBottom: 18
            }}>
            <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 16, color: '#15803d', marginBottom: 14 }}>
              ✅ Transcription Complete
            </div>
            <div className="tool-grid-4" style={{ gap: 10 }}>
              {[
                { l: 'Words', v: stats.words.toLocaleString(), c: '#22c55e' },
                { l: 'Segments', v: stats.segs, c: '#4F8EF7' },
                { l: 'Chars', v: stats.chars.toLocaleString(), c: '#9C6FDE' },
                { l: 'Time', v: stats.elapsed + 's', c: '#f59e0b' },
              ].map(s => (
                <div key={s.l} style={{
                  background: 'rgba(255,255,255,.75)', borderRadius: 12,
                  padding: '12px 8px', textAlign: 'center', border: '1px solid rgba(0,0,0,.06)'
                }}>
                  <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 20, color: s.c }}>{s.v}</div>
                  <div style={{
                    fontSize: 9.5, color: '#999', marginTop: 3, fontWeight: 600,
                    textTransform: 'uppercase', letterSpacing: '.4px'
                  }}>{s.l}</div>
                </div>
              ))}
            </div>
            {detLang && (
              <div style={{
                marginTop: 10, fontSize: 12.5, color: '#555',
                background: 'rgba(79,142,247,.06)', borderRadius: 9, padding: '7px 13px',
                border: '1px solid rgba(79,142,247,.12)'
              }}>
                🌐 Detected language: <strong>{detLang}</strong>
              </div>
            )}
            {extractInfo && (
              <div style={{
                marginTop: 8, fontSize: 12, color: '#3f6b4f',
                background: 'rgba(34,197,94,.05)', borderRadius: 9, padding: '7px 13px',
                border: '1px solid rgba(34,197,94,.15)', display: 'flex', gap: 10, alignItems: 'center'
              }}>
                🎵 Audio extracted: <strong>{fmtBytes(extractInfo.before)}</strong>
                <span style={{ opacity: .4 }}>→</span>
                <strong style={{ color: '#22c55e' }}>{fmtBytes(extractInfo.after)}</strong>
                <span style={{ color: '#aaa', marginLeft: 'auto' }}>
                  {Math.round((1 - extractInfo.after / extractInfo.before) * 100)}% smaller
                </span>
              </div>
            )}
            {stats.chunks > 1 && (
              <div style={{
                marginTop: 8, fontSize: 12, color: '#888',
                background: 'rgba(34,197,94,.05)', borderRadius: 9, padding: '7px 13px',
                border: '1px solid rgba(34,197,94,.15)'
              }}>
                ⚡ Processed in <strong>{stats.chunks} chunks</strong> — all merged seamlessly
              </div>
            )}
          </motion.div>
        </Reveal>
      )}

      {/* ── TRANSCRIBE ANOTHER ── */}
      {isDone && (
        <Reveal>
          <motion.button whileHover={{ scale: 1.01, y: -1 }} whileTap={{ scale: .98 }}
            onClick={reset}
            style={{
              width: '100%', padding: '12px', borderRadius: 14, background: '#fff',
              color: '#555', border: '1.5px solid rgba(0,0,0,.1)', fontFamily: 'DM Sans,sans-serif',
              fontWeight: 600, fontSize: 14, cursor: 'pointer', marginBottom: 18,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
            }}>
            🔄 Transcribe Another File
          </motion.button>
        </Reveal>
      )}

      {/* ── TRANSCRIPT ── */}
      {(fullText || segments.length > 0) && (
        <Reveal delay={0.04}>
          <ToolCard style={{ marginBottom: 18 }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: 16, flexWrap: 'wrap', gap: 10
            }}>
              <div>
                <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 16, color: '#0d0d1a' }}>
                  📄 Transcript
                </div>
                <div style={{ fontSize: 11.5, color: '#aaa', marginTop: 3 }}>
                  {wordCount.toLocaleString()} words · {fullText.length.toLocaleString()} chars
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: .96 }}
                  onClick={() => setEdit(e => !e)}
                  style={{
                    padding: '7px 14px', borderRadius: 999,
                    border: `1.5px solid ${editMode ? '#9C6FDE' : 'rgba(0,0,0,.1)'}`,
                    background: editMode ? 'rgba(156,111,222,.08)' : '#fff',
                    color: editMode ? '#9C6FDE' : '#666', fontSize: 12, fontWeight: 700, cursor: 'pointer'
                  }}>
                  {editMode ? '✓ Done' : '✏️ Edit'}
                </motion.button>
                <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: .96 }}
                  onClick={() => copy(fullText)}
                  style={{
                    padding: '7px 16px', borderRadius: 999,
                    border: `1.5px solid ${copied ? '#22c55e' : 'rgba(0,0,0,.1)'}`,
                    background: copied ? '#22c55e' : '#fff',
                    color: copied ? '#fff' : '#555', fontSize: 12, fontWeight: 700,
                    cursor: 'pointer', transition: 'all .2s'
                  }}>
                  {copied ? '✓ Copied!' : '📋 Copy'}
                </motion.button>
              </div>
            </div>

            {segments.length > 0 && (
              <div style={{ marginBottom: 14, position: 'relative' }}>
                <span style={{
                  position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)',
                  fontSize: 14, opacity: .4
                }}>🔍</span>
                <input className="inp" placeholder="Search transcript…" value={searchQ}
                  onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 38 }} />
              </div>
            )}

            <textarea className="inp tall" value={fullText} onChange={e => setFull(e.target.value)}
              readOnly={!editMode}
              style={{
                marginBottom: 16, minHeight: 220, fontSize: 14, lineHeight: 1.9,
                resize: 'vertical', fontFamily: 'DM Sans,sans-serif',
                background: editMode ? '#fffbf5' : '#fafbff',
                border: editMode ? '1.5px solid rgba(156,111,222,.3)' : '1.5px solid rgba(0,0,0,.08)',
                transition: 'all .2s', cursor: editMode ? 'text' : 'default'
              }}
              placeholder="Your transcript will appear here…" />

            {segments.length > 0 && (
              <div>
                <div style={{
                  fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 13,
                  color: '#0d0d1a', marginBottom: 10
                }}>
                  ⏱️ Timestamped Segments ({filtSegs.length})
                </div>
                <div ref={segListRef}
                  style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {filtSegs.map((s, i) => {
                    const match = searchQ && s.text.toLowerCase().includes(searchQ.toLowerCase())
                    return (
                      <motion.div key={i}
                        initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: .18, delay: Math.min(i * .005, .2) }}
                        style={{
                          display: 'flex', gap: 10, padding: '9px 13px', borderRadius: 11,
                          background: match ? 'rgba(79,142,247,.07)' : '#f8f9ff',
                          border: `1px solid ${match ? 'rgba(79,142,247,.2)' : 'rgba(0,0,0,.06)'}`,
                          alignItems: 'flex-start'
                        }}>
                        <span style={{
                          fontFamily: 'monospace', fontSize: 11, color: '#4F8EF7',
                          fontWeight: 700, whiteSpace: 'nowrap', marginTop: 2, flexShrink: 0
                        }}>
                          {fmtHMS(s.start)}
                        </span>
                        {activeEditIdx === i ? (
                          <input
                            type="text"
                            value={s.text}
                            autoFocus
                            onChange={(e) => {
                              const newText = e.target.value
                              setSegs(prev => {
                                const updated = [...prev]
                                const idx = prev.findIndex(item => item.start === s.start && item.end === s.end)
                                if (idx !== -1) updated[idx] = { ...updated[idx], text: newText }
                                setFull(updated.map(seg => seg.text).join(' '))
                                return updated
                              })
                            }}
                            onBlur={() => setActiveEditIdx(null)}
                            onKeyDown={(e) => e.key === 'Enter' && setActiveEditIdx(null)}
                            style={{
                              flex: 1,
                              fontSize: 13.5,
                              padding: '2px 6px',
                              border: '1.5px solid #9c6fde',
                              borderRadius: 6,
                              outline: 'none',
                              background: '#fffbf5',
                              fontFamily: 'DM Sans, sans-serif',
                              boxSizing: 'border-box',
                              width: '100%'
                            }}
                          />
                        ) : (
                          <span
                            onDoubleClick={() => setActiveEditIdx(i)}
                            title="Double-click to correct text directly"
                            style={{ fontSize: 13.5, color: '#1a1a2e', lineHeight: 1.7, flex: 1, cursor: 'pointer' }}>
                            {searchQ
                              ? s.text.split(new RegExp(`(${searchQ.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
                                .map((p, j) => p.toLowerCase() === searchQ.toLowerCase()
                                  ? <mark key={j} style={{ background: '#fef08a', borderRadius: 3, padding: '0 2px' }}>{p}</mark>
                                  : p)
                              : s.text}
                          </span>
                        )}
                      </motion.div>
                    )
                  })}
                  {searchQ && filtSegs.length === 0 && (
                    <div style={{ textAlign: 'center', color: '#bbb', fontSize: 13, padding: 24 }}>
                      No results for &quot;{searchQ}&quot;
                    </div>
                  )}
                </div>
              </div>
            )}
          </ToolCard>
        </Reveal>
      )}

      {/* ── AI VIDEO INTELLIGENCE STUDIO ── */}
      {fullText && (
        <Reveal delay={0.05}>
          <ToolCard style={{ marginBottom: 18 }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: 16, flexWrap: 'wrap', gap: 10
            }}>
              <div>
                <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 16, color: '#0d0d1a', display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span>🤖</span> AI Video Intelligence & Smart Chapters
                </div>
                <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 3 }}>
                  Executive meeting minutes, timestamped chapter navigation, and action item extraction.
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                {aiInsights && (
                  <button
                    type="button"
                    onClick={() => {
                      const report = [
                        `# AI Video Intelligence Report`,
                        `File: ${fileInfo?.name || 'Transcript'}`,
                        `\n## Executive Summary\n${aiInsights.summary || ''}`,
                        `\n## Chapters\n${(aiInsights.chapters || []).map(c => `- [${c.timestamp}] ${c.title}`).join('\n')}`,
                        `\n## Action Items\n${(aiInsights.actionItems || []).map(a => `- [${a.urgency || 'Normal'}] ${a.task} (Assignee: ${a.assignee || 'Unassigned'})`).join('\n')}`,
                        `\n## Key Takeaways\n${(aiInsights.keyTakeaways || []).map(t => `- ${t}`).join('\n')}`
                      ].join('\n')
                      copy(report)
                    }}
                    className="btn btn-sm btn-outline"
                    style={{ fontSize: 12, padding: '7px 14px', borderRadius: 999 }}
                  >
                    📋 Copy Report
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleGenerateInsights}
                  disabled={aiLoading}
                  className="btn btn-sm btn-primary"
                  style={{ fontSize: 12, padding: '7px 16px', borderRadius: 999, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  {aiLoading ? (
                    <>
                      <span className="spinner-border spinner-border-sm" />
                      <span>Analyzing Transcript...</span>
                    </>
                  ) : (
                    <>
                      <span>✨</span>
                      <span>{aiInsights ? 'Regenerate Intelligence' : 'Generate AI Intelligence'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {aiError && (
              <div style={{ padding: '9px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, color: '#ef4444', fontSize: 12, marginBottom: 14 }}>
                ⚠️ {aiError}
              </div>
            )}

            {/* Media Player for Seek Navigation */}
            {mediaUrl && (
              <div style={{ marginBottom: 16 }}>
                {fileInfo?.isVideo ? (
                  <video
                    ref={mediaRef}
                    src={mediaUrl}
                    controls
                    style={{ width: '100%', maxHeight: 260, borderRadius: 12, background: '#0d0d1a', display: 'block' }}
                  />
                ) : (
                  <audio
                    ref={mediaRef}
                    src={mediaUrl}
                    controls
                    style={{ width: '100%', display: 'block', borderRadius: 8 }}
                  />
                )}
              </div>
            )}

            {aiInsights ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Executive Summary */}
                {aiInsights.summary && (
                  <div style={{
                    padding: '14px 16px',
                    borderRadius: 12,
                    background: 'linear-gradient(135deg, rgba(79,142,247,0.06), rgba(156,111,222,0.06))',
                    border: '1px solid rgba(79,142,247,0.2)'
                  }}>
                    <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 13, color: '#0d0d1a', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>📌</span> Executive Summary
                    </div>
                    <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.7, whiteSpace: 'pre-line' }}>
                      {aiInsights.summary}
                    </div>
                  </div>
                )}

                {/* Smart Chapters Navigation */}
                {Array.isArray(aiInsights.chapters) && aiInsights.chapters.length > 0 && (
                  <div>
                    <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 13, color: '#0d0d1a', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>🎬</span> Smart Chapters & Timestamps (Click to jump)
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
                      {aiInsights.chapters.map((ch, idx) => (
                        <motion.div
                          key={idx}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => seekTo(ch.seconds || 0)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '8px 12px',
                            background: '#f8f9ff',
                            border: '1px solid rgba(79,142,247,0.18)',
                            borderRadius: 10,
                            cursor: 'pointer'
                          }}
                        >
                          <span style={{
                            fontFamily: 'monospace',
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '3px 7px',
                            borderRadius: 6,
                            background: '#4F8EF7',
                            color: '#fff',
                            flexShrink: 0
                          }}>
                            ▶ {ch.timestamp || '00:00'}
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#0d0d1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ch.title || `Chapter ${idx + 1}`}
                          </span>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Items & Next Steps */}
                {Array.isArray(aiInsights.actionItems) && aiInsights.actionItems.length > 0 && (
                  <div>
                    <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 13, color: '#0d0d1a', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>✅</span> Action Items & Deliverables
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {aiInsights.actionItems.map((item, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            borderRadius: 8,
                            background: '#ffffff',
                            border: '1px solid rgba(0,0,0,0.08)',
                            fontSize: 12.5,
                            gap: 8,
                            flexWrap: 'wrap'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 200 }}>
                            <span style={{ color: '#4F8EF7' }}>•</span>
                            <span style={{ color: '#1e293b', fontWeight: 500 }}>{item.task}</span>
                          </div>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            {item.assignee && item.assignee !== 'Unassigned' && (
                              <span style={{ fontSize: 10.5, padding: '2px 8px', borderRadius: 999, background: '#f1f5f9', color: '#475569', fontWeight: 600 }}>
                                👤 {item.assignee}
                              </span>
                            )}
                            <span style={{
                              fontSize: 10.5,
                              padding: '2px 8px',
                              borderRadius: 999,
                              fontWeight: 700,
                              background: item.urgency === 'High' ? 'rgba(239,68,68,0.1)' : item.urgency === 'Medium' ? 'rgba(245,158,11,0.1)' : 'rgba(79,142,247,0.1)',
                              color: item.urgency === 'High' ? '#ef4444' : item.urgency === 'Medium' ? '#d97706' : '#2563eb'
                            }}>
                              {item.urgency || 'Normal'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Key Takeaways */}
                {Array.isArray(aiInsights.keyTakeaways) && aiInsights.keyTakeaways.length > 0 && (
                  <div>
                    <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 13, color: '#0d0d1a', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>💡</span> Key Takeaways
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {aiInsights.keyTakeaways.map((takeaway, idx) => (
                        <div
                          key={idx}
                          style={{
                            padding: '6px 12px',
                            background: '#f8faff',
                            border: '1px solid rgba(79,142,247,0.15)',
                            borderRadius: 8,
                            fontSize: 12,
                            color: '#334155'
                          }}
                        >
                          ✦ {takeaway}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{
                textAlign: 'center',
                padding: '24px 16px',
                border: '1.5px dashed rgba(79,142,247,0.25)',
                borderRadius: 12,
                background: '#fafbff'
              }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🎙️</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0d0d1a' }}>Instant AI Meeting Intelligence Ready</div>
                <div style={{ fontSize: 12, color: '#64748b', maxWidth: 420, margin: '4px auto 14px' }}>
                  Click &quot;Generate AI Intelligence&quot; to synthesize your transcript into an executive summary, interactive timestamped chapters, and action items.
                </div>
                <button
                  type="button"
                  onClick={handleGenerateInsights}
                  disabled={aiLoading}
                  className="btn btn-sm btn-primary"
                  style={{ fontSize: 12, padding: '8px 18px', borderRadius: 999, fontWeight: 700 }}
                >
                  ✨ Analyze with AI Now
                </button>
              </div>
            )}
          </ToolCard>
        </Reveal>
      )}

      {/* ── EXPORT ── */}
      {fullText && (
        <Reveal delay={0.06}>
          <ToolCard style={{ marginBottom: 18 }}>
            <div style={{
              fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 15,
              color: '#0d0d1a', marginBottom: 16
            }}>⬇️ Export Transcript</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[{ f: 'TXT', icon: '📝' }, { f: 'SRT', icon: '🎬' }, { f: 'VTT', icon: '🌐' }, { f: 'JSON', icon: '📊' }, { f: 'MD', icon: '📑' }].map(({ f, icon }) => (
                  <button key={f} onClick={() => setExportFmt(f)}
                    style={{
                      padding: '9px 14px', borderRadius: 12,
                      border: `1.5px solid ${exportFmt === f ? '#4F8EF7' : 'rgba(0,0,0,.1)'}`,
                      background: exportFmt === f ? 'rgba(79,142,247,.09)' : '#fafafa',
                      cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', fontWeight: 700,
                      fontSize: 13, color: exportFmt === f ? '#4F8EF7' : '#666', transition: 'all .18s'
                    }}>
                    {icon} {f}
                  </button>
                ))}
              </div>

              {/* Subtitle Timestamp Offset adjustment */}
              {(exportFmt === 'SRT' || exportFmt === 'VTT') && (
                <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#f5f7ff', borderRadius: 10, border: '1px solid rgba(79,142,247,.15)', marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#4F8EF7' }}>⏱️ Time Offset: {timeOffset > 0 ? `+${timeOffset}s` : `${timeOffset}s`}</span>
                  <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                    <button onClick={() => setTimeOffset(t => Math.max(-30, Math.round((t - 0.5) * 10) / 10))} style={{ padding: '2px 8px', borderRadius: 6, border: '1px solid rgba(0,0,0,.1)', background: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>-0.5s</button>
                    <button onClick={() => setTimeOffset(t => Math.min(30, Math.round((t + 0.5) * 10) / 10))} style={{ padding: '2px 8px', borderRadius: 6, border: '1px solid rgba(0,0,0,.1)', background: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>+0.5s</button>
                    {timeOffset !== 0 && (
                      <button onClick={() => setTimeOffset(0)} style={{ padding: '2px 8px', borderRadius: 6, border: '1px solid rgba(239,68,68,.2)', background: 'rgba(239,68,68,.05)', color: '#ef4444', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Reset</button>
                    )}
                  </div>
                </div>
              )}

              <motion.button whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: .96 }}
                onClick={() => {
                  const base = fileInfo?.name?.replace(/\.[^.]+$/, '') || 'transcript'
                  const shiftedSegs = timeOffset === 0 ? segments : segments.map(s => ({
                    ...s,
                    start: Math.max(0, s.start + timeOffset),
                    end: Math.max(0, s.end + timeOffset),
                  }))

                  if (exportFmt === 'TXT') dlFile(fullText, `${base}.txt`)
                  else if (exportFmt === 'SRT') dlFile(buildSRT(shiftedSegs), `${base}.srt`)
                  else if (exportFmt === 'VTT') dlFile(buildVTT(shiftedSegs), `${base}.vtt`, 'text/vtt')
                  else if (exportFmt === 'JSON') dlFile(JSON.stringify({ fullText, segments: shiftedSegs }, null, 2), `${base}.json`, 'application/json')
                  else if (exportFmt === 'MD') dlFile(`# Transcript: ${base}\n\n${fullText}\n\n## Timestamps\n\n${shiftedSegs.map(s => `- **[${fmtHMS(s.start)}]**: ${s.text}`).join('\n')}`, `${base}.md`, 'text/markdown')
                }}
                style={{
                  flex: 1, minWidth: 140, padding: '13px 20px', borderRadius: 14,
                  background: 'linear-gradient(135deg,#4F8EF7,#7C6FF7)', color: '#fff',
                  border: 'none', fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 15,
                  cursor: 'pointer', boxShadow: '0 6px 20px rgba(79,142,247,.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                }}>
                ⬇ Download {exportFmt}
              </motion.button>
            </div>
          </ToolCard>
        </Reveal>
      )}

      {/* ── HOW IT WORKS ── */}
      <Reveal delay={0.1}>
        <ToolCard>
          <div style={{
            fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 15,
            color: '#0d0d1a', marginBottom: 16
          }}>ℹ️ How It Works</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { q: 'What happens to my video?', a: 'Your video is analyzed first to detect format and duration. Then the audio is extracted in your browser using WebAssembly (ffmpeg.wasm) — the video data is immediately freed from memory after extraction. Only the small audio file is sent to the server.' },
              { q: 'How are large files handled?', a: 'Audio is split into 4 MB chunks and sent to Groq Whisper one by one. Each chunk result arrives live and is merged with precise timestamps — no matter how long your video is.' },
              { q: 'What if my video is very large?', a: 'The extraction step compresses your video to a mono 16kHz 64kbps MP3, typically shrinking a 200 MB video to under 15 MB. After that, chunking and transcription are fast.' },
              { q: 'Is my file private?', a: 'Your API key lives only in Netlify environment variables — never in the browser. Files are sent over HTTPS and are not stored or logged by Groq.' },
              { q: 'Which formats are supported?', a: 'Video: MP4, MOV, MKV, WEBM, AVI, M4V. Audio: MP3, WAV, M4A, AAC, OGG, FLAC. Up to 500 MB.' },
            ].map(({ q, a }) => (
              <div key={q} style={{
                padding: '12px 14px', background: '#f8f9ff',
                borderRadius: 12, border: '1px solid rgba(0,0,0,.06)'
              }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#0d0d1a', marginBottom: 4 }}>❓ {q}</div>
                <div style={{ fontSize: 12.5, color: '#666', lineHeight: 1.65 }}>{a}</div>
              </div>
            ))}
          </div>
          <div style={{
            marginTop: 16, padding: '11px 16px',
            background: 'rgba(34,197,94,.05)', border: '1px solid rgba(34,197,94,.18)',
            borderRadius: 11, fontSize: 12.5, color: '#166534', lineHeight: 1.65
          }}>
            🔒 Powered by <strong>Groq Whisper Large v3</strong> — server-side only. API key never exposed to the browser.
          </div>
        </ToolCard>
      </Reveal>

    </ToolShell>
  )
}
