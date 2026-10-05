import React, { useState, useRef, useCallback, useEffect, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ToolShell, { ToolCard, Reveal } from '../../components/ToolShell'
import { useCopy } from '../../hooks'
import { TOOLS } from '../../constants'
import { saveFileWithFallback } from '../../utils/fileSaver'
import { createOutput } from '../../utils/fileEngine'
import { createJob, JOB_STATES } from '../../utils/jobEngine'
import { createBatchSession, BATCH_ITEM_STATUS } from '../../utils/batchEngine'
import { consumePendingInboundFiles } from '../../utils/inboundShare'
import { convertTextToPdf, convertMarkdownToPdf, getPdfJs, getPdfjsDocumentOptions } from '../../utils/pdfEngine'
import { addToHistory } from '../../utils/history'
import { useToolHistory } from '../../hooks/useToolHistory'
import { Clock, Trash2, ShieldCheck, FileText, Database, Image as ImageIcon, Film } from 'lucide-react'

const tool = TOOLS.find(t => t.id === 'fileconvert')

/* ══════════════════════════════════════════
   HELPERS
══════════════════════════════════════════ */
function fmtBytes(b) {
  if (!b) return '0 B'
  if (b >= 1073741824) return (b/1073741824).toFixed(2)+' GB'
  if (b >= 1048576)    return (b/1048576).toFixed(2)+' MB'
  if (b >= 1024)       return (b/1024).toFixed(1)+' KB'
  return b+' B'
}
function pct(before, after) {
  if (!before||!after) return 0
  return Math.round((1 - after/before)*100)
}
function dlBlob(blob, name) {
  saveFileWithFallback(blob, name)
}
function readAB(file) {
  return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsArrayBuffer(file)})
}
function readText(file) {
  return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsText(file)})
}
function readDataURL(file) {
  return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file)})
}
function uint8ToBase64(bytes) {
  let binary = ''
  const len = bytes.byteLength
  const CHUNK_SIZE = 0x8000 // 32768
  for (let i = 0; i < len; i += CHUNK_SIZE) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + CHUNK_SIZE, len)))
  }
  return btoa(binary)
}
function base64ToUtf8(b64) {
  const binary = atob(b64.trim().replace(/\s+/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new TextDecoder().decode(bytes)
}

/* ══════════════════════════════════════════
   PDF EXTRACTION (LOCAL)
══════════════════════════════════════════ */
async function extractPdfText(ab) {
  const lib = await getPdfJs()
  const loadingTask = lib.getDocument(getPdfjsDocumentOptions(new Uint8Array(ab)))
  const pdf = await loadingTask.promise
  const pages = []
  try {
    for (let i=1;i<=pdf.numPages;i++) {
      const page = await pdf.getPage(i)
      try {
        const content = await page.getTextContent()
        const txt = content.items.map(x=>x.str).join(' ').replace(/\s{2,}/g,' ').trim()
        if (txt) pages.push(txt)
      } finally {
        if (typeof page.cleanup === 'function') page.cleanup()
      }
    }
  } finally {
    if (typeof pdf?.destroy === 'function') {
      try { await pdf.destroy() } catch {}
    }
  }
  if (!pages.length) throw new Error('No text found. This PDF may be scanned or image-based.')
  return pages.join('\n\n')
}


/* ══════════════════════════════════════════
   TEXT CONVERTERS
══════════════════════════════════════════ */
function mdToHtml(md) {
  const e = md.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  const h = e
    .replace(/^### (.+)$/gm,'<h3>$1</h3>').replace(/^## (.+)$/gm,'<h2>$1</h2>').replace(/^# (.+)$/gm,'<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\*(.+?)\*/g,'<em>$1</em>')
    .replace(/`(.+?)`/g,'<code>$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, (_, label, url) => {
      const cleanUrl = /^(https?:\/\/|mailto:|tel:|\/|#)/i.test(url.trim()) ? url.trim() : '#'
      return `<a href="${cleanUrl}">${label}</a>`
    })
    .replace(/^> (.+)$/gm,'<blockquote>$1</blockquote>')
    .replace(/^[-*] (.+)$/gm,'<li>$1</li>').replace(/(<li>.*<\/li>\n?)+/g,'<ul>$&</ul>')
    .replace(/\n\n/g,'</p><p>')
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:system-ui,sans-serif;max-width:820px;margin:48px auto;padding:0 28px;line-height:1.8;color:#222}h1,h2,h3{font-weight:700;margin-top:1.6em;color:#111}code{background:#f3f4f6;padding:2px 6px;border-radius:4px;font-size:.9em}pre{background:#f3f4f6;padding:16px;border-radius:8px;overflow-x:auto}blockquote{border-left:3px solid #4F8EF7;margin:0;padding-left:16px;color:#666}a{color:#4F8EF7}ul{padding-left:1.6em}</style></head><body><p>${h}</p></body></html>`
}
function mdToTxt(md) {
  return md.replace(/#{1,6} /g,'').replace(/\*\*(.+?)\*\*/g,'$1').replace(/\*(.+?)\*/g,'$1')
    .replace(/`(.+?)`/g,'$1').replace(/\[(.+?)\]\(.+?\)/g,'$1')
    .replace(/^> /gm,'').replace(/^[-*+] /gm,'• ').trim()
}
function htmlToTxt(h) {
  return h.replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<script[\s\S]*?<\/script>/gi,'')
    .replace(/<br\s*\/?>/gi,'\n').replace(/<\/p>/gi,'\n\n').replace(/<\/h[1-6]>/gi,'\n\n').replace(/<li>/gi,'\n• ')
    .replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ')
    .replace(/\n{3,}/g,'\n\n').trim()
}
function htmlToMd(h) {
  return h
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi,'# $1\n').replace(/<h2[^>]*>(.*?)<\/h2>/gi,'## $1\n').replace(/<h3[^>]*>(.*?)<\/h3>/gi,'### $1\n')
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi,'**$1**').replace(/<b[^>]*>(.*?)<\/b>/gi,'**$1**')
    .replace(/<em[^>]*>(.*?)<\/em>/gi,'*$1*').replace(/<i[^>]*>(.*?)<\/i>/gi,'*$1*')
    .replace(/<code[^>]*>(.*?)<\/code>/gi,'`$1`').replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi,'[$2]($1)')
    .replace(/<li[^>]*>(.*?)<\/li>/gi,'- $1\n').replace(/<br\s*\/?>/gi,'\n')
    .replace(/<p[^>]*>(.*?)<\/p>/gi,'$1\n\n').replace(/<[^>]+>/g,'')
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ').trim()
}
export function parseCsv(csvText) {
  if (!csvText || typeof csvText !== 'string') return []
  const rows = []
  let currentRow = []
  let currentCell = ''
  let inQuotes = false
  let i = 0
  const len = csvText.length

  while (i < len) {
    const char = csvText[i]

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < len && csvText[i + 1] === '"') {
          // Escaped quote: "" -> literal "
          currentCell += '"'
          i += 2
          continue
        } else {
          // Closing quote
          inQuotes = false
          i++
          continue
        }
      } else {
        currentCell += char
        i++
        continue
      }
    } else {
      if (char === '"') {
        if (currentCell.trim() === '') {
          inQuotes = true
          currentCell = '' // Discard any whitespace preceding initial quote
          i++
          continue
        } else {
          currentCell += '"'
          i++
          continue
        }
      } else if (char === ',') {
        currentRow.push(currentCell)
        currentCell = ''
        i++
        continue
      } else if (char === '\r') {
        if (i + 1 < len && csvText[i + 1] === '\n') {
          i++
        }
        currentRow.push(currentCell)
        currentCell = ''
        rows.push(currentRow)
        currentRow = []
        i++
        continue
      } else if (char === '\n') {
        currentRow.push(currentCell)
        currentCell = ''
        rows.push(currentRow)
        currentRow = []
        i++
        continue
      } else {
        currentCell += char
        i++
        continue
      }
    }
  }

  if (currentCell || currentRow.length > 0) {
    currentRow.push(currentCell)
    rows.push(currentRow)
  }

  // Remove single trailing empty line if it resulted from a final newline
  if (rows.length > 0 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') {
    rows.pop()
  }

  return rows
}

export function csvToJson(csv) {
  const rows = parseCsv(csv)
  if (rows.length < 2) throw new Error('CSV needs a header row + at least one data row')
  if (rows.length > 50000) {
    throw new Error('CSV exceeds maximum capacity (50,000 rows). Please use smaller files to prevent browser freezing.')
  }
  const seenHeaders = new Map()
  const headers = rows[0].map((h, i) => {
    let clean = (typeof h === 'string' ? h.trim() : '')
    if (clean === '__proto__' || clean === 'constructor' || clean === 'prototype') {
      clean = `_${clean}`
    }
    clean = clean || `column_${i + 1}`
    const count = seenHeaders.get(clean) || 0
    seenHeaders.set(clean, count + 1)
    return count > 0 ? `${clean}_${count + 1}` : clean
  })
  const data = rows.slice(1).map(r => {
    const obj = {}
    for (let i = 0; i < headers.length; i++) {
      const key = headers[i]
      if (key !== '__proto__' && key !== 'constructor' && key !== 'prototype') {
        obj[key] = r[i] ?? ''
      }
    }
    return obj
  })
  return JSON.stringify(data, null, 2)
}

export function jsonToCsv(json) {
  const parsed = typeof json === 'string' ? JSON.parse(json) : json
  const arr = Array.isArray(parsed) ? parsed : [parsed]
  if (!arr.length) throw new Error('Empty JSON array')
  if (arr.length > 50000) {
    throw new Error('JSON exceeds maximum capacity (50,000 items). Please use smaller files to prevent browser freezing.')
  }

  // Support arrays containing primitives e.g. [1, 2, 3] or ["apple", "banana"]
  const hasPrimitives = arr.some(item => item === null || typeof item !== 'object')
  let normalizedItems
  if (hasPrimitives) {
    normalizedItems = arr.map(item => {
      if (item === null || typeof item !== 'object') {
        return { value: item }
      }
      return item
    })
  } else {
    normalizedItems = arr
  }

  const keys = [...new Set(normalizedItems.flatMap(Object.keys))].filter(k => k !== '__proto__' && k !== 'constructor' && k !== 'prototype')
  if (!keys.length) keys.push('value')

  const esc = v => {
    let val = (v !== null && typeof v === 'object') ? JSON.stringify(v) : String(v ?? '')
    if (/^[=+\-@\t\r]/.test(val)) {
      val = "'" + val
    }
    return val.includes(',') || val.includes('"') || val.includes('\n') || val.includes('\r') ? `"${val.replace(/"/g, '""')}"` : val
  }
  return [keys.map(esc).join(','), ...normalizedItems.map(r => keys.map(k => esc(r[k])).join(','))].join('\n')
}

/* ══════════════════════════════════════════
   MEDIA COMPRESSION ENGINE
══════════════════════════════════════════ */
/* Image compress/resize/convert */
async function processImage(file, opts) {
  const {
    quality = 85,
    format = 'same',
    maxWidth = 0,
    maxHeight = 0,
    grayscale = false,
  } = opts

  // Ensure we have a Blob/File for createObjectURL
  let blob = file
  if (file instanceof ArrayBuffer) {
    blob = new Blob([file], { type: 'image/jpeg' })
  } else if (!(file instanceof Blob) && !(file instanceof File)) {
    throw new Error('Invalid image input: must be a File, Blob, or ArrayBuffer.')
  }

  const img = await new Promise((res, rej) => {
    const i = new Image()
    const objectURL = URL.createObjectURL(blob)
    i.onload = () => { URL.revokeObjectURL(objectURL); res(i) }
    i.onerror = () => { URL.revokeObjectURL(objectURL); rej(new Error('Failed to load image. Make sure it\'s a valid image file.')) }
    i.src = objectURL
  })

  let w = img.naturalWidth, h = img.naturalHeight
  if (!w || !h) throw new Error('Image has zero dimensions.')
  if (maxWidth  && w > maxWidth)  { h = Math.round(h * maxWidth  / w); w = maxWidth }
  if (maxHeight && h > maxHeight) { w = Math.round(w * maxHeight / h); h = maxHeight }
  w = Math.max(1, w)
  h = Math.max(1, h)

  // Determine output mime/ext
  const originalName = (file instanceof File) ? file.name : 'image.jpg'
  const srcExt = originalName.split('.').pop().toLowerCase()
  let outMime, outExt
  if (format === 'same') {
    outMime = (file instanceof File) ? (file.type || 'image/jpeg') : 'image/jpeg'
    outExt  = srcExt || 'jpg'
  } else if (format === 'webp') { outMime = 'image/webp'; outExt = 'webp' }
  else if (format === 'png')    { outMime = 'image/png';  outExt = 'png'  }
  else if (format === 'jpeg')   { outMime = 'image/jpeg'; outExt = 'jpg'  }
  else                          { outMime = 'image/jpeg'; outExt = 'jpg'  }

  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  if (outMime === 'image/jpeg') {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
  }
  if (grayscale) ctx.filter = 'grayscale(100%)'
  ctx.drawImage(img, 0, 0, w, h)

  const q = outMime==='image/png' ? undefined : quality/100

  return new Promise(res=>{
    canvas.toBlob(blob=>{
      canvas.width = 1
      canvas.height = 1
      res({ blob, ext:outExt, mime:outMime, w, h })
    }, outMime, q)
  })
}

/* ── Video compress: real encoder via ffmpeg.wasm (client-side, no server, no API key) ──
   Loaded lazily and cached — single-threaded core so it works without special
   COOP/COEP hosting headers and keeps memory bounded on low-RAM machines. */
let _ffmpegPromise = null
async function loadFFmpeg() {
  if (_ffmpegPromise) return _ffmpegPromise
  _ffmpegPromise = (async () => {
    try {
      const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
        import('@ffmpeg/ffmpeg'),
        import('@ffmpeg/util'),
      ])
      const ffmpeg = new FFmpeg()

      // Attempt self-hosted local assets first for offline & PWA capability
      let coreURL = null
      let wasmURL = null
      try {
        const testRes = await fetch('/ffmpeg/ffmpeg-core.js', { method: 'HEAD' })
        if (testRes.ok) {
          coreURL = await toBlobURL('/ffmpeg/ffmpeg-core.js', 'text/javascript')
          wasmURL = await toBlobURL('/ffmpeg/ffmpeg-core.wasm', 'application/wasm')
        }
      } catch {}

      // Validate self-hosted local assets
      if (!coreURL || !wasmURL) {
        throw new Error('Self-hosted FFmpeg assets (/ffmpeg/) are not available. Please ensure public/ffmpeg/ files are present.')
      }

      await ffmpeg.load({
        coreURL,
        wasmURL,
      })
      return ffmpeg
    } catch (err) {
      _ffmpegPromise = null
      throw err
    }
  })()
  return _ffmpegPromise
}

const VIDEO_PRESETS = {
  low:    { crf: 32, scale: 0.5,  label: 'Low — smallest file' },
  medium: { crf: 26, scale: 0.75, label: 'Medium — balanced' },
  high:   { crf: 20, scale: 1,    label: 'High — best quality' },
}

async function compressVideo(file, opts, onProgress) {
  if (!(file instanceof Blob) && !(file instanceof File)) {
    throw new Error('Video input must be a File or Blob. Please re-upload the video.')
  }
  if (file.size > 500 * 1024 * 1024) {
    throw new Error('Video file exceeds 500MB browser processing limit. Please select a smaller clip.')
  }
  const preset = VIDEO_PRESETS[opts.preset] || VIDEO_PRESETS.medium
  const codec = opts.codec === 'vp9' ? 'vp9' : 'h264'

  const { fetchFile } = await import('@ffmpeg/util')
  let ffmpeg
  try {
    ffmpeg = await loadFFmpeg()
  } catch (e) {
    if (e?.message?.includes('SharedArrayBuffer') || (typeof SharedArrayBuffer === 'undefined')) {
      throw new Error('Video encoding requires browser Cross-Origin Isolation. Please refresh the page or use a modern browser.')
    }
    throw new Error('Could not load the video encoder. Check your connection and try again.')
  }

  let lastPct = 0
  const onProgressEvent = ({ progress }) => {
    if (typeof progress === 'number' && isFinite(progress)) {
      lastPct = Math.max(lastPct, Math.min(99, Math.round(progress * 100)))
      onProgress?.(lastPct)
    }
  }
  ffmpeg.on('progress', onProgressEvent)

  const uid = Date.now().toString(36) + (typeof window !== 'undefined' && window.crypto?.randomUUID ? window.crypto.randomUUID().slice(0, 6) : Math.random().toString(36).slice(2, 6))
  const inExt = (file.name?.match(/\.\w+$/)?.[0] || '.mp4').toLowerCase()
  const inName = `in_${uid}${inExt}`
  const outExt = codec === 'vp9' ? 'webm' : 'mp4'
  const outName = `out_${uid}.${outExt}`

  try {
    await ffmpeg.writeFile(inName, await fetchFile(file))

    const args = ['-i', inName]
    if (preset.scale < 1) args.push('-vf', `scale=trunc(iw*${preset.scale}/2)*2:trunc(ih*${preset.scale}/2)*2`)

    if (codec === 'vp9') {
      args.push('-c:v', 'libvpx-vp9', '-crf', String(preset.crf), '-b:v', '0',
                 '-row-mt', '1', '-c:a', 'libopus', '-b:a', '96k')
    } else {
      args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(preset.crf),
                 '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart')
    }
    args.push(outName)

    await ffmpeg.exec(args)
    const data = await ffmpeg.readFile(outName)
    const mime = codec === 'vp9' ? 'video/webm' : 'video/mp4'
    return { blob: new Blob([data.buffer], { type: mime }), ext: outExt, mime }
  } finally {
    ffmpeg.off('progress', onProgressEvent)
    await ffmpeg.deleteFile(inName).catch(() => {})
    await ffmpeg.deleteFile(outName).catch(() => {})
  }
}

/* ══════════════════════════════════════════
   CONVERSION GROUPS CONFIG
══════════════════════════════════════════ */
const GROUPS = [
  {
    id:'doc', label:'Documents', icon: FileText, color:'#ef4444', bg:'rgba(239,68,68,.07)',
    desc:'PDF, TXT, Markdown, HTML — convert between text formats',
    subs: [
      {id:'pdf-txt',  from:'PDF',  to:'TXT',  label:'PDF → TXT',  desc:'Extract text from PDF',      accept:'.pdf',            binary:true,  icon:'📕→📄'},
      {id:'pdf-md',   from:'PDF',  to:'MD',   label:'PDF → MD',   desc:'PDF to Markdown',             accept:'.pdf',            binary:true,  icon:'📕→📝'},
      {id:'pdf-html', from:'PDF',  to:'HTML', label:'PDF → HTML', desc:'PDF content to HTML',         accept:'.pdf',            binary:true,  icon:'📕→🌐'},
      {id:'txt-pdf',  from:'TXT',  to:'PDF',  label:'TXT → PDF',  desc:'Plain text to PDF',           accept:'.txt,.md',        binary:false, icon:'📄→📕'},
      {id:'md-pdf',   from:'MD',   to:'PDF',  label:'MD → PDF',   desc:'Markdown to PDF',             accept:'.md,.txt',        binary:false, icon:'📝→📕'},
      {id:'txt-md',   from:'TXT',  to:'MD',   label:'TXT → MD',   desc:'Text to Markdown',            accept:'.txt',            binary:false, icon:'📄→📝'},
      {id:'txt-html', from:'TXT',  to:'HTML', label:'TXT → HTML', desc:'Text to HTML page',           accept:'.txt',            binary:false, icon:'📄→🌐'},
      {id:'md-html',  from:'MD',   to:'HTML', label:'MD → HTML',  desc:'Markdown to HTML',            accept:'.md,.txt',        binary:false, icon:'📝→🌐'},
      {id:'md-txt',   from:'MD',   to:'TXT',  label:'MD → TXT',   desc:'Strip all Markdown',          accept:'.md,.txt',        binary:false, icon:'📝→📄'},
      {id:'html-txt', from:'HTML', to:'TXT',  label:'HTML → TXT', desc:'Strip HTML tags',             accept:'.html,.htm',      binary:false, icon:'🌐→📄'},
      {id:'html-md',  from:'HTML', to:'MD',   label:'HTML → MD',  desc:'HTML to Markdown',            accept:'.html,.htm',      binary:false, icon:'🌐→📝'},
    ],
  },
  {
    id:'data', label:'Data', icon: Database, color:'#22c55e', bg:'rgba(34,197,94,.07)',
    desc:'CSV, JSON, XML, YAML — convert data formats instantly',
    subs: [
      {id:'csv-json',  from:'CSV',  to:'JSON', label:'CSV → JSON',  desc:'Table to JSON array',       accept:'.csv',            binary:false, icon:'📊→💾'},
      {id:'json-csv',  from:'JSON', to:'CSV',  label:'JSON → CSV',  desc:'JSON array to table',       accept:'.json',           binary:false, icon:'💾→📊'},
      {id:'json-txt',  from:'JSON', to:'TXT',  label:'JSON → TXT',  desc:'Pretty-print JSON',         accept:'.json',           binary:false, icon:'💾→📄'},
      {id:'txt-b64',   from:'TXT',  to:'B64',  label:'TXT → Base64',desc:'Encode text',               accept:'.txt,.json,.csv', binary:false, icon:'📄→🔡'},
      {id:'b64-txt',   from:'B64',  to:'TXT',  label:'Base64 → TXT',desc:'Decode Base64',             accept:'.txt',            binary:false, icon:'🔡→📄'},
    ],
  },
  {
    id:'image', label:'Images', icon: ImageIcon, color:'#4F8EF7', bg:'rgba(79,142,247,.07)',
    desc:'Compress, resize, convert or reformat any image',
    subs: [
      {id:'img-compress', from:'IMAGE', to:'COMPRESSED', label:'Compress Image', desc:'Reduce file size with quality control', accept:'image/*', binary:true, icon:'🖼️→⚡', isMedia:'image', mode:'compress'},
      {id:'img-resize',   from:'IMAGE', to:'RESIZED',    label:'Resize Image',   desc:'Change dimensions precisely',          accept:'image/*', binary:true, icon:'🖼️→📐', isMedia:'image', mode:'resize'},
      {id:'img-webp',     from:'IMAGE', to:'WEBP',       label:'→ WebP',         desc:'Convert to modern WebP format',        accept:'image/*', binary:true, icon:'🖼️→WebP', isMedia:'image', mode:'webp'},
      {id:'img-png',      from:'IMAGE', to:'PNG',        label:'→ PNG',          desc:'Convert to lossless PNG',              accept:'image/*', binary:true, icon:'🖼️→PNG', isMedia:'image', mode:'png'},
      {id:'img-jpg',      from:'IMAGE', to:'JPEG',       label:'→ JPEG',         desc:'Convert to JPEG',                      accept:'image/*', binary:true, icon:'🖼️→JPG', isMedia:'image', mode:'jpeg'},
      {id:'img-gray',     from:'IMAGE', to:'GRAYSCALE',  label:'Grayscale',      desc:'Convert to black & white',             accept:'image/*', binary:true, icon:'🖼️→⚫', isMedia:'image', mode:'grayscale'},
    ],
  },
  {
    id:'video', label:'Video', icon: Film, color:'#9C6FDE', bg:'rgba(156,111,222,.07)',
    desc:'Compress or re-encode video with a real H.264/VP9 encoder, in the browser',
    subs: [
      {id:'video-compress', from:'VIDEO', to:'MP4', label:'Compress Video', desc:'Reduce video size with quality presets & codec choice', accept:'video/*,.mp4,.mov,.webm,.avi,.mkv', binary:true, icon:'🎬→⚡', isMedia:'video', mode:'compress'},
    ],
  },
]

const ALL_SUBS = GROUPS.flatMap(g=>g.subs.map(s=>({...s,groupColor:g.color,groupBg:g.bg,groupId:g.id})))

/* ══════════════════════════════════════════
   CONVERSION ENGINE
══════════════════════════════════════════ */
async function doConvert(sub, textInput, binaryInput, mediaOpts, fileBlob, signal) {
  if (signal?.aborted) throw new Error('Operation was cancelled')
  const {from, to, binary, isMedia, mode} = sub
  const t = textInput

  // ── Media conversions — need original File/Blob, NOT the ArrayBuffer ──
  if (isMedia === 'image') {
    if (signal?.aborted) throw new Error('Operation was cancelled')
    const src = fileBlob || binaryInput
    if (!src) throw new Error('Please upload an image file.')
    // processImage accepts both File and ArrayBuffer — convert AB to blob if needed
    const imgFile = (src instanceof Blob || src instanceof File)
      ? src
      : new Blob([src], { type: 'image/jpeg' })
    const opts = {
      quality:   mediaOpts.quality || 85,
      format:    mode === 'compress' ? 'same' : mode === 'webp' ? 'webp'
               : mode === 'png' ? 'png' : mode === 'jpeg' ? 'jpeg' : 'same',
      maxWidth:  mode === 'resize' ? (mediaOpts.maxWidth  || 0) : 0,
      maxHeight: mode === 'resize' ? (mediaOpts.maxHeight || 0) : 0,
      grayscale: mode === 'grayscale',
    }
    const result = await processImage(imgFile, opts)
    if (signal?.aborted) throw new Error('Operation was cancelled')
    return { blob: result.blob, ext: result.ext, mime: result.mime, w: result.w, h: result.h, isBlob: true }
  }

  if (isMedia === 'video') {
    if (signal?.aborted) throw new Error('Operation was cancelled')
    // compressVideo expects a File/Blob — use fileBlob directly
    const videoFile = fileBlob
    if (!videoFile) throw new Error('Please upload a video file.')
    if (!(videoFile instanceof Blob) && !(videoFile instanceof File)) {
      throw new Error('Video source is not a valid file. Please re-upload.')
    }
    const result = await compressVideo(videoFile, {
      preset: mediaOpts.videoPreset || 'medium',
      codec: mediaOpts.videoCodec || 'h264',
    }, mediaOpts.onProgress)
    if (signal?.aborted) throw new Error('Operation was cancelled')
    return { blob: result.blob, ext: result.ext, mime: result.mime, isBlob: true }
  }

  // ── PDF ──
  if (from==='PDF') {
    if (!binaryInput) throw new Error('Please upload a PDF file.')
    const text = await extractPdfText(binaryInput)
    if (to==='TXT')  return {content:text,             ext:'txt', mime:'text/plain'}
    if (to==='MD')   return {content:text.split('\n').filter(Boolean).join('\n\n'), ext:'md',  mime:'text/markdown'}
    if (to==='HTML') return {content:mdToHtml(text),   ext:'html',mime:'text/html'}
  }

  // ── Text formats ──
  if (from==='TXT'&&to==='PDF') {
    const res = await convertTextToPdf(t, { title: 'Document' })
    return { content: res.bytes, ext: 'pdf', mime: 'application/pdf', isPdfBytes: true }
  }
  if (from==='MD' &&to==='PDF') {
    const res = await convertMarkdownToPdf(t, { title: 'Markdown Document' })
    return { content: res.bytes, ext: 'pdf', mime: 'application/pdf', isPdfBytes: true }
  }
  if (from==='TXT'&&to==='MD')    return {content:t,                  ext:'md',  mime:'text/markdown'}
  if (from==='TXT'&&to==='HTML')  return {content:`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:system-ui;max-width:820px;margin:48px auto;padding:0 28px;line-height:1.85;white-space:pre-wrap;color:#222}</style></head><body>${t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</body></html>`, ext:'html', mime:'text/html'}
  if (from==='TXT'&&to==='B64')   return {content:uint8ToBase64(new TextEncoder().encode(t)), ext:'txt', mime:'text/plain'}
  if (from==='MD' &&to==='HTML')  return {content:mdToHtml(t),        ext:'html',mime:'text/html'}
  if (from==='MD' &&to==='TXT')   return {content:mdToTxt(t),         ext:'txt', mime:'text/plain'}
  if (from==='HTML'&&to==='TXT')  return {content:htmlToTxt(t),        ext:'txt', mime:'text/plain'}
  if (from==='HTML'&&to==='MD')   return {content:htmlToMd(t),         ext:'md',  mime:'text/markdown'}
  if (from==='CSV'&&to==='JSON')  return {content:csvToJson(t),        ext:'json',mime:'application/json'}
  if (from==='JSON'&&to==='CSV')  return {content:jsonToCsv(t),        ext:'csv', mime:'text/csv'}
  if (from==='JSON'&&to==='TXT')  return {content:JSON.stringify(JSON.parse(t),null,2), ext:'txt', mime:'text/plain'}
  if (from==='B64'&&to==='TXT') {
    try { return {content:base64ToUtf8(t), ext:'txt', mime:'text/plain'} }
    catch { throw new Error('Invalid Base64 input') }
  }

  throw new Error(`Unsupported conversion: ${from} → ${to}`)
}

/* ══════════════════════════════════════════
   SUB-COMPONENTS
══════════════════════════════════════════ */
function GroupTabs({ active, onChange }) {
  return (
    <div className="tool-tabs apple-segmented" style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 20, background: 'rgba(0,0,0,.042)', padding: 4, borderRadius: 14, border: '1px solid rgba(0,0,0,.035)', overflowX: 'auto', overflowY: 'hidden', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
      {GROUPS.map(g => {
        const Icon = g.icon
        const isAct = active === g.id
        return (
          <button
            key={g.id}
            onClick={() => onChange(g.id)}
            className={`tool-tab apple-segmented-item ${isAct ? 'active' : ''}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              padding: '9px 16px',
              minHeight: 42,
              borderRadius: 12,
              cursor: 'pointer',
              transition: 'all .18s',
              border: isAct ? `1px solid ${g.color}35` : '1px solid transparent',
              background: isAct ? '#ffffff' : 'transparent',
              boxShadow: isAct ? '0 2px 8px rgba(15,23,42,0.08)' : 'none',
              color: isAct ? g.color : '#555',
              fontFamily: 'DM Sans,sans-serif',
              fontWeight: isAct ? 700 : 600,
              fontSize: 13,
              flex: '1 0 auto',
              minWidth: 'max-content',
              whiteSpace: 'nowrap',
              boxSizing: 'border-box'
            }}
          >
            {Icon && <Icon size={15} style={{ flexShrink: 0 }} />}
            <span style={{ display: 'inline-block', whiteSpace: 'nowrap', minWidth: 'max-content' }}>{g.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function SubPill({ item, selected, onClick }) {
  const isActive = selected?.id===item.id
  return (
    <motion.button whileHover={{scale:1.02}} whileTap={{scale:.97}}
      onClick={onClick}
      style={{display:'flex',alignItems:'center',gap:8,padding:'10px 14px',
        borderRadius:13,cursor:'pointer',textAlign:'left',width:'100%',
        transition:'all .18s',
        border:`1.5px solid ${isActive?item.groupColor:'rgba(0,0,0,.08)'}`,
        background:isActive?item.groupBg:'#fafafa',
        boxShadow:isActive?`0 0 0 3px ${item.groupColor}18`:'none'}}>
      <span style={{fontSize:18,flexShrink:0}}>{item.icon}</span>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:13,
          color:isActive?item.groupColor:'#0d0d1a'}}>{item.label}</div>
        <div style={{fontSize:11,color:'#aaa',marginTop:1,lineHeight:1.4}}>{item.desc}</div>
      </div>
      {isActive && (
        <motion.div initial={{scale:0}} animate={{scale:1}}
          style={{width:8,height:8,borderRadius:'50%',background:item.groupColor,flexShrink:0}}/>
      )}
    </motion.button>
  )
}

/* ── Media options panel ── */
function MediaOpts({ sub, opts, onChange }) {
  const { isMedia, mode } = sub
  return (
    <div style={{background:'rgba(79,142,247,.04)',borderRadius:14,
      border:'1px solid rgba(79,142,247,.12)',padding:'14px 16px',marginBottom:18}}>
      <div style={{fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:13,
        color:'#0d0d1a',marginBottom:14}}>⚙️ Options</div>

      {/* Image compress / convert quality */}
      {isMedia==='image' && (mode==='compress'||mode==='jpeg'||mode==='webp') && (
        <div className="fgrp">
          <label className="lbl">Quality: {opts.quality}%
            <span style={{fontSize:11,color:'#aaa',marginLeft:8,fontWeight:400}}>
              {opts.quality>=90?'Near lossless':opts.quality>=75?'High quality':opts.quality>=55?'Balanced':'Aggressive'}
            </span>
          </label>
          <input type="range" min={10} max={100}
            value={opts.quality} onChange={e=>onChange({...opts,quality:+e.target.value})}
                style={{ width:'100%', background:`linear-gradient(to right,#4F8EF7 0%,#4F8EF7 ${Math.max(0,Math.min(100,((opts.quality)-(10))/((100)-(10))*100))}%,#e2e4ef ${Math.max(0,Math.min(100,((opts.quality)-(10))/((100)-(10))*100))}%,#e2e4ef 100%)`, WebkitAppearance:'none', appearance:'none', height:5, borderRadius:3, outline:'none', cursor:'pointer' }} className="rs-thumb"/>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:'#ccc',marginTop:3}}>
            <span>Smallest</span><span>Largest</span>
          </div>
        </div>
      )}

      {/* Resize dimensions */}
      {isMedia==='image' && mode==='resize' && (
        <div style={{display:'flex',gap:12}}>
          <div className="fgrp" style={{flex:1}}>
            <label className="lbl">Max Width (px)</label>
            <input className="inp" type="number" min={1} max={8000} placeholder="e.g. 1920"
              value={opts.maxWidth||''} onChange={e=>onChange({...opts,maxWidth:+e.target.value})}/>
          </div>
          <div className="fgrp" style={{flex:1}}>
            <label className="lbl">Max Height (px)</label>
            <input className="inp" type="number" min={1} max={8000} placeholder="e.g. 1080"
              value={opts.maxHeight||''} onChange={e=>onChange({...opts,maxHeight:+e.target.value})}/>
          </div>
        </div>
      )}

      {/* Video preset + codec */}
      {isMedia==='video' && (
        <>
          <div className="fgrp">
            <label className="lbl">Quality Preset</label>
            <div style={{display:'flex',gap:8,marginTop:4}}>
              {Object.entries(VIDEO_PRESETS).map(([key,p])=>(
                <button key={key} type="button"
                  onClick={()=>onChange({...opts,videoPreset:key})}
                  style={{
                    flex:1, padding:'9px 10px', borderRadius:10, cursor:'pointer',
                    fontSize:12.5, fontWeight:600, fontFamily:'DM Sans,sans-serif',
                    border: (opts.videoPreset||'medium')===key ? '1.5px solid #9C6FDE' : '1.5px solid rgba(0,0,0,.1)',
                    background: (opts.videoPreset||'medium')===key ? 'rgba(156,111,222,.1)' : '#fff',
                    color: (opts.videoPreset||'medium')===key ? '#6d3fc4' : '#666',
                    transition:'all .15s ease',
                  }}>
                  {p.label.split(' — ')[0]}
                </button>
              ))}
            </div>
            <div style={{fontSize:11,color:'#999',marginTop:6}}>
              {VIDEO_PRESETS[opts.videoPreset||'medium'].label}
            </div>
          </div>

          <div className="fgrp">
            <label className="lbl">Output Codec</label>
            <div style={{display:'flex',gap:8,marginTop:4}}>
              {[{k:'h264',t:'MP4 (H.264)',d:'Best compatibility'},{k:'vp9',t:'WebM (VP9)',d:'Smallest file size'}].map(c=>(
                <button key={c.k} type="button"
                  onClick={()=>onChange({...opts,videoCodec:c.k})}
                  style={{
                    flex:1, padding:'9px 10px', borderRadius:10, cursor:'pointer', textAlign:'left',
                    fontFamily:'DM Sans,sans-serif',
                    border: (opts.videoCodec||'h264')===c.k ? '1.5px solid #9C6FDE' : '1.5px solid rgba(0,0,0,.1)',
                    background: (opts.videoCodec||'h264')===c.k ? 'rgba(156,111,222,.1)' : '#fff',
                  }}>
                  <div style={{fontSize:12.5,fontWeight:600,color:(opts.videoCodec||'h264')===c.k?'#6d3fc4':'#444'}}>{c.t}</div>
                  <div style={{fontSize:10.5,color:'#999'}}>{c.d}</div>
                </button>
              ))}
            </div>
          </div>

          <div style={{padding:'10px 12px',background:'rgba(156,111,222,.07)',borderRadius:10,
            border:'1px solid rgba(156,111,222,.2)',fontSize:12,color:'#5b3a94',lineHeight:1.6}}>
            ⚡ Encoded with a real H.264/VP9 encoder running in your browser (ffmpeg.wasm) —
            no upload, no API key. First run downloads the encoder (~30MB, cached after that).
            Very large or long videos may take a while and use significant memory.
          </div>
        </>
      )}
    </div>
  )
}

/* ── Drop zone ── */
function DropZone({ sub, onFile, onFiles }) {
  const [drag, setDrag] = useState(false)
  return (
    <motion.label
      onDragOver={e=>{e.preventDefault();setDrag(true)}}
      onDragLeave={()=>setDrag(false)}
      onDrop={e=>{
        e.preventDefault();setDrag(false);
        const dropped = Array.from(e.dataTransfer.files || []).filter(Boolean)
        if (dropped.length > 1 && onFiles) {
          onFiles(dropped)
        } else if (dropped.length > 0) {
          onFile(dropped[0])
        }
      }}
      animate={{borderColor:drag?sub.groupColor:'rgba(0,0,0,.1)',scale:drag?1.01:1,
        background:drag?sub.groupBg:'transparent'}}
      style={{display:'block',border:'2px dashed rgba(0,0,0,.1)',borderRadius:14,
        padding:'30px 20px',textAlign:'center',cursor:'pointer',marginBottom:16}}>
      <input type="file" multiple style={{display:'none'}} accept={sub.accept}
        onChange={e=>{
          const selected = Array.from(e.target.files || []).filter(Boolean)
          if (selected.length > 1 && onFiles) {
            onFiles(selected)
          } else if (selected.length > 0) {
            onFile(selected[0])
          }
          e.target.value = ''
        }}/>
      <div style={{fontSize:36,marginBottom:8}}>{sub.icon}</div>
      <div style={{fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:14,
        color:'#0d0d1a',marginBottom:4}}>
        {drag?'Drop to convert':'Drop file(s) here or click to browse'}
      </div>
      <div style={{fontSize:12,color:'#aaa'}}>
        {sub.accept.replace(/\./g,'').toUpperCase()} • Multi-file batch supported
      </div>
    </motion.label>
  )
}

/* ── File badge ── */
function FileBadge({ name, size, origSize, onClear }) {
  const saved = origSize && size < origSize ? pct(origSize,size) : null
  return (
    <motion.div initial={{opacity:0,y:6}} animate={{opacity:1,y:0}}
      style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',
        background:'rgba(34,197,94,.06)',border:'1.5px solid rgba(34,197,94,.2)',
        borderRadius:14,marginBottom:16}}>
      <div style={{width:40,height:40,borderRadius:11,background:'rgba(34,197,94,.12)',
        display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,flexShrink:0}}>📄</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:13.5,fontWeight:700,color:'#166534',
          overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{name}</div>
        <div style={{fontSize:11.5,color:'#6b9e78',marginTop:2,display:'flex',gap:10}}>
          <span>{fmtBytes(size)}</span>
          {saved>0 && <span style={{color:'#22c55e',fontWeight:700}}>↓ {saved}% saved</span>}
        </div>
      </div>
      <button onClick={onClear}
        style={{width:28,height:28,borderRadius:8,background:'rgba(0,0,0,.06)',
          border:'none',cursor:'pointer',display:'flex',alignItems:'center',
          justifyContent:'center',fontSize:12,color:'#888'}}>✕</button>
    </motion.div>
  )
}

/* ── Size comparison bar ── */
function SizeBar({ before, after }) {
  if (!before||!after) return null
  const ratio = Math.min(1, after/before)
  const saved = pct(before,after)
  return (
    <div style={{marginBottom:16,padding:'14px 16px',background:'#f8f9ff',
      borderRadius:14,border:'1px solid rgba(0,0,0,.07)'}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
        <span style={{fontSize:12.5,fontWeight:600,color:'#555'}}>Size comparison</span>
        <span style={{fontSize:12.5,fontWeight:700,
          color:saved>0?'#22c55e':saved<0?'#ef4444':'#888'}}>
          {saved>0?`↓ ${saved}% smaller`:saved<0?`↑ ${Math.abs(saved)}% larger`:'Same size'}
        </span>
      </div>
      <div style={{display:'flex',gap:8,marginBottom:8}}>
        {[{label:'Before',val:before,pct:100,c:'#e5e7eb'},
          {label:'After', val:after, pct:Math.round(ratio*100), c:saved>0?'#22c55e':'#4F8EF7'}].map(r=>(
          <div key={r.label} style={{flex:1}}>
            <div style={{fontSize:10.5,color:'#999',fontWeight:600,marginBottom:4}}>{r.label}</div>
            <div style={{height:8,background:'#e5e7ef',borderRadius:3,overflow:'hidden'}}>
              <motion.div initial={{width:0}} animate={{width:`${r.pct}%`}}
                transition={{duration:.9,ease:[.22,1,.36,1]}}
                style={{height:'100%',borderRadius:3,background:r.c}}/>
            </div>
            <div style={{fontSize:11,fontWeight:600,color:'#444',marginTop:4}}>{fmtBytes(r.val)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════ */
export default function FileConverter() {
  const { history: convertHistory, remove: removeHistoryItem, clear: clearToolHistory } = useToolHistory('File Converter', 15)
  const [groupId,  setGroupId]  = useState('doc')
  const [sub,      setSub]      = useState(ALL_SUBS.find(s=>s.groupId==='doc'))
  const [text,     setText]     = useState('')
  const [binary,   setBinary]   = useState(null)
  const [blobFile, setBlobFile] = useState(null) // { file, size }
  const [fname,    setFname]    = useState('')
  const [fsize,    setFsize]    = useState(0)
  const [output,   setOutput]   = useState(null)
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressText, setProgressText] = useState('')
  const [batchSession, setBatchSession] = useState(null)
  const [batchState, setBatchState] = useState(null)
  const [mediaOpts,setOpts]     = useState({quality:85,maxWidth:0,maxHeight:0,videoPreset:'medium',videoCodec:'h264'})
  const [copied,   copy]        = useCopy()

  const subRef = useRef(sub)
  const lastFileRef = useRef(null)
  const mediaOptsRef = useRef(mediaOpts)
  const textRef = useRef('')
  const binaryRef = useRef(null)
  const blobFileRef = useRef(null)
  const activeJobRef = useRef(null)

  const curGroup = GROUPS.find(g=>g.id===groupId)

  // Reset when switching groups
  useEffect(()=>{
    const first = ALL_SUBS.find(s=>s.groupId===groupId)
    subRef.current = first
    setSub(first)
    reset()
  },[groupId])

  const reset = ()=>{
    if (activeJobRef.current) {
      try { activeJobRef.current.cancel('Reset') } catch {}
      activeJobRef.current = null
    }
    lastFileRef.current = null
    textRef.current = ''
    binaryRef.current = null
    blobFileRef.current = null
    setText(''); setBinary(null); setBlobFile(null); setFname(''); setFsize(0)
    setOutput(null); setError(''); setProgress(0); setProgressText(''); setLoading(false)
  }

  const selectSub = s => {
    if (activeJobRef.current) {
      try { activeJobRef.current.cancel('Sub changed') } catch {}
      activeJobRef.current = null
    }
    subRef.current = s
    setSub(s)
    setOutput(null); setError(''); setProgress(0); setProgressText(''); setLoading(false)

    // Preserve and adapt existing input file if user already loaded one
    if (lastFileRef.current) {
      const file = lastFileRef.current
      if (s.binary) {
        if (!binaryRef.current) {
          readAB(file).then(ab => {
            binaryRef.current = ab
            blobFileRef.current = file
            textRef.current = '__BINARY__'
            setBinary(ab); setBlobFile(file); setText('__BINARY__')
          }).catch(() => setError('Failed to read file'))
        }
      } else {
        if (!textRef.current || textRef.current === '__BINARY__') {
          readText(file).then(t => {
            textRef.current = t
            binaryRef.current = null
            blobFileRef.current = null
            setText(t); setBinary(null); setBlobFile(null)
          }).catch(() => setError('Failed to read file'))
        }
      }
    }
  }

  const handleFile = useCallback(file=>{
    if (!file) return
    lastFileRef.current = file
    setOutput(null); setError(''); setFname(file.name); setFsize(file.size)
    const targetSub = subRef.current || sub
    if (targetSub.binary) {
      blobFileRef.current = file
      setBlobFile(file)
      readAB(file).then(ab=>{
        binaryRef.current = ab
        textRef.current = '__BINARY__'
        setBinary(ab); setText('__BINARY__')
      }).catch(()=>setError('Failed to read file'))
    } else {
      binaryRef.current = null
      blobFileRef.current = null
      setBinary(null); setBlobFile(null)
      readText(file).then(t=>{
        textRef.current = t
        setText(t)
      }).catch(()=>setError('Failed to read file'))
    }
  },[sub])

  const handleFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList || []).filter(Boolean)
    if (!files.length) return

    if (files.length === 1) {
      handleFile(files[0])
      return
    }

    const activeSub = subRef.current || sub
    setError('')
    setOutput(null)

    const session = createBatchSession({
      tool: 'File Converter',
      concurrency: typeof navigator !== 'undefined' && /Mobile|Android|iPhone/i.test(navigator.userAgent) ? 1 : 2,
      zipFilename: `tooldesk-${activeSub.from.toLowerCase()}-to-${activeSub.to.toLowerCase()}-batch.zip`,
      onUpdate: (state) => setBatchState(state),
      processItem: async (file, { signal, onProgress }) => {
        if (signal?.aborted) throw new Error('Cancelled')
        let curText = ''
        let curBinary = null
        if (activeSub.binary) {
          curBinary = await readAB(file)
        } else {
          curText = await readText(file)
        }

        const optsWithCb = {
          ...(mediaOptsRef.current || mediaOpts),
          signal,
          onProgress: (p) => onProgress(p)
        }

        const res = await doConvert(
          activeSub,
          curText,
          curBinary,
          optsWithCb,
          file,
          signal
        )

        let blob
        if (res.isBlob) {
          blob = res.blob
        } else if (res.isPdfBytes) {
          blob = new Blob([res.content], { type: 'application/pdf' })
        } else {
          blob = new Blob([res.content], { type: (res.mime || 'text/plain') + ';charset=utf-8' })
        }

        const outName = file.name.replace(/\.[^.]+$/, '') + '.' + res.ext
        return { blob, filename: outName, mimeType: res.mime || blob.type }
      }
    })

    setBatchSession(session)
    session.addFiles(files)
  }, [sub, handleFile, mediaOpts])

  useEffect(() => {
    const pending = consumePendingInboundFiles()
    if (pending && pending.length > 0) {
      if (pending.length > 1) {
        handleFiles(pending)
      } else {
        handleFile(pending[0])
      }
    }
    const handleShared = (e) => {
      if (e.detail && e.detail.length > 0) {
        if (e.detail.length > 1) {
          handleFiles(e.detail)
        } else {
          handleFile(e.detail[0])
        }
      }
    }
    window.addEventListener('tooldesk-shared-files-ready', handleShared)
    return () => window.removeEventListener('tooldesk-shared-files-ready', handleShared)
  }, [handleFile, handleFiles])

  const handleOptsChange = useCallback(newOpts => {
    mediaOptsRef.current = newOpts
    setOpts(newOpts)
  }, [])

  const handleCancel = useCallback(() => {
    if (activeJobRef.current) {
      activeJobRef.current.cancel('Operation cancelled by user')
      activeJobRef.current = null
      setLoading(false)
      setProgress(0)
      setProgressText('')
      setError('Conversion was cancelled.')
    }
  }, [])

  const handleConvert = useCallback(async()=>{
    const activeSub = subRef.current || sub
    const curText = textRef.current !== undefined ? textRef.current : text
    const curBinary = binaryRef.current !== undefined ? binaryRef.current : binary
    const curBlob = blobFileRef.current !== undefined ? blobFileRef.current : blobFile

    if (!curText && !curBinary && !curBlob && !lastFileRef.current) {
      setError('Please upload a file or enter input first.')
      return
    }

    if (fsize > 250 * 1024 * 1024) {
      setError('File exceeds maximum 250MB safety limit.')
      return
    }
    if (curText && curText !== '__BINARY__' && curText.length > 25000000) {
      setError('Text content exceeds maximum 25MB safety limit.')
      return
    }

    setError('')
    setOutput(null)
    setLoading(true)
    setProgress(0)
    setProgressText('Queued…')

    const job = createJob({
      tool: 'File Converter',
      operation: `${activeSub.from}_to_${activeSub.to}`,
      input: { fname, fsize, from: activeSub.from, to: activeSub.to },
      execute: async (signal, onProgress) => {
        if (signal?.aborted) throw new Error('Operation was cancelled')
        const optsWithCb = {
          ...(mediaOptsRef.current || mediaOpts),
          signal,
          onProgress: (p) => {
            onProgress(p, `Processing ${activeSub.from} → ${activeSub.to} (${Math.round(p)}%)`)
          }
        }
        return await doConvert(
          activeSub,
          curText === '__BINARY__' ? '' : curText,
          curBinary,
          optsWithCb,
          curBlob,
          signal
        )
      }
    })

    activeJobRef.current = job

    job.on('progress', (p, txt) => {
      setProgress(p)
      if (txt) setProgressText(txt)
    })

    try {
      const result = await job.start()
      setOutput({ ...result, origSize: fsize })
      setProgress(100)
      setProgressText('Completed')
      try {
        addToHistory({
          tool: 'File Converter',
          label: `${activeSub.label} (${activeSub.from} → ${activeSub.to})`,
          value: `Converted to .${result.ext}`,
          action: 'Converted',
          category: 'convert',
          metadata: { from: activeSub.from, to: activeSub.to, ext: result.ext }
        })
      } catch {}
    } catch(e) {
      if (e.category === 'CANCELLED' || e.message?.includes('cancelled') || e.message?.includes('aborted')) {
        setError('Conversion was cancelled.')
      } else {
        setError(e.message || 'Conversion failed.')
      }
    } finally {
      setLoading(false)
      activeJobRef.current = null
    }
  }, [sub, text, binary, mediaOpts, fsize, blobFile, fname])

  const handleDownload = async () => {
    if (!output) return
    const name = fname ? fname.replace(/\.[^.]+$/,'.')+output.ext : 'converted.'+output.ext
    let blob
    if (output.isBlob) {
      blob = output.blob
    } else if (output.isPdfBytes) {
      blob = new Blob([output.content], { type: 'application/pdf' })
    } else {
      blob = new Blob([output.content], { type: (output.mime || 'text/plain') + ';charset=utf-8' })
    }

    const fileOutput = createOutput({
      blob,
      filename: name,
      mimeType: output.mime || blob.type,
      sourceTool: 'File Converter',
      metadata: {
        from: sub?.from,
        to: sub?.to,
        originalSize: fsize || (text ? text.length : 0),
        outputSize: blob.size,
      }
    })

    await fileOutput.download()
  }

  const outputSize = output?.isBlob ? output.blob?.size : output?.isPdfBytes ? output.content?.length : output?.content?.length
  const hasInput = !!text || !!binary
  const canConvert = hasInput && !loading

  const PLACEHOLDERS = {
    TXT:'Paste plain text here…', MD:'# Title\n\n**Bold** and *italic* text…',
    HTML:'<h1>Title</h1>\n<p>Paste HTML here…</p>',
    CSV:'name,age,city\nAlice,30,Paris\nBob,25,London',
    JSON:'[\n  { "name": "Alice", "age": 30 }\n]',
    B64:'SGVsbG8gV29ybGQ=',
  }

  return (
    <ToolShell tool={tool}>
      <ToolCard>
        {/* Group tabs */}
        <GroupTabs active={groupId} onChange={setGroupId}/>

        {/* Group description */}
        <div style={{fontSize:13,color:'#888',marginBottom:16,
          padding:'8px 14px',background:curGroup.bg,borderRadius:10,
          border:`1px solid ${curGroup.color}22`,fontWeight:500}}>
          {curGroup.desc}
        </div>

        {/* Sub-conversion grid */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',
          gap:8,marginBottom:22}}>
          {curGroup.subs.map(s=>(
            <SubPill key={s.id}
              item={{...s,groupColor:curGroup.color,groupBg:curGroup.bg}}
              selected={sub}
              onClick={()=>selectSub({...s,groupColor:curGroup.color,groupBg:curGroup.bg,groupId})}/>
          ))}
        </div>

        {/* Active conversion header */}
        <motion.div key={sub?.id} initial={{opacity:0,y:4}} animate={{opacity:1,y:0}}
          style={{display:'flex',alignItems:'center',gap:12,padding:'13px 16px',
            borderRadius:14,border:`1px solid ${curGroup.color}22`,
            background:curGroup.bg,marginBottom:20}}>
          <span style={{fontSize:26}}>{sub?.icon}</span>
          <div style={{flex:1}}>
            <div style={{fontFamily:'Syne,sans-serif',fontWeight:800,fontSize:15,color:'#0d0d1a'}}>
              {sub?.label}
            </div>
            <div style={{fontSize:12,color:'#888',marginTop:2}}>{sub?.desc}</div>
          </div>
          <span style={{fontSize:10.5,fontWeight:700,padding:'3px 11px',borderRadius:999,
            background:'rgba(34,197,94,.1)',color:'#22c55e',
            border:'1px solid rgba(34,197,94,.18)',whiteSpace:'nowrap'}}>🔒 Local</span>
        </motion.div>

        {/* Media options */}
        {sub?.isMedia && (
          <MediaOpts sub={sub} opts={mediaOpts} onChange={handleOptsChange}/>
        )}

        {/* Batch Queue Section */}
        {batchState && batchState.items.length > 0 && (
          <div style={{marginBottom:20,padding:'16px 18px',background:'#F8FAFC',borderRadius:14,border:'1.5px solid rgba(79,142,247,.2)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,flexWrap:'wrap',gap:8}}>
              <div>
                <div style={{fontSize:14,fontWeight:700,color:'#0d0d1a',fontFamily:'Syne,sans-serif'}}>
                  📦 Batch Processing Queue ({batchState.items.length} files)
                </div>
                <div style={{fontSize:12,color:'#64748B',marginTop:2}}>
                  Completed: {batchState.done}/{batchState.total} • Failed: {batchState.failed} • {batchState.isProcessing ? '⚡ Processing…' : 'Idle'}
                </div>
              </div>
              <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                {batchState.isProcessing && (
                  <button onClick={() => batchSession?.cancelAll()}
                    style={{padding:'6px 12px',borderRadius:8,background:'rgba(239,68,68,.1)',border:'1px solid rgba(239,68,68,.2)',color:'#ef4444',fontSize:12,fontWeight:600,cursor:'pointer'}}>
                    ✕ Cancel Batch
                  </button>
                )}
                {batchState.failed > 0 && !batchState.isProcessing && (
                  <button onClick={() => batchSession?.retryFailed()}
                    style={{padding:'6px 12px',borderRadius:8,background:'#F1F5F9',border:'1px solid #CBD5E1',color:'#334155',fontSize:12,fontWeight:600,cursor:'pointer'}}>
                    🔄 Retry Failed
                  </button>
                )}
                {batchState.done > 0 && !batchState.isProcessing && (
                  <button onClick={() => batchSession?.exportZip()}
                    style={{padding:'6px 14px',borderRadius:8,background:'#22C55E',border:'none',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',boxShadow:'0 2px 8px rgba(34,197,94,.3)'}}>
                    ⬇️ Download Batch (ZIP)
                  </button>
                )}
                {!batchState.isProcessing && (
                  <button onClick={() => { batchSession?.clear(); setBatchState(null); setBatchSession(null) }}
                    style={{padding:'6px 10px',borderRadius:8,background:'transparent',border:'1px solid #E2E8F0',color:'#64748B',fontSize:12,cursor:'pointer'}}>
                    Clear
                  </button>
                )}
              </div>
            </div>
            <div style={{height:6,background:'#E2E8F0',borderRadius:3,overflow:'hidden',marginBottom:12}}>
              <div style={{height:'100%',width:`${batchState.progress}%`,background:'#4F8EF7',transition:'width 0.3s ease'}}/>
            </div>
            <div style={{maxHeight:160,overflowY:'auto',display:'flex',flexDirection:'column',gap:6}}>
              {batchState.items.map(it => (
                <div key={it.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 10px',background:'#fff',borderRadius:8,border:'1px solid #E2E8F0',fontSize:12}}>
                  <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'60%',color:'#1E293B',fontWeight:500}}>
                    {it.name}
                  </span>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    {it.status === 'processing' && <span style={{color:'#4F8EF7',fontWeight:600}}>⚡ {it.progress}%</span>}
                    {it.status === 'done' && <span style={{color:'#16A34A',fontWeight:600}}>✓ Done</span>}
                    {it.status === 'failed' && <span style={{color:'#DC2626',fontWeight:600}} title={it.error}>✕ Failed</span>}
                    {it.status === 'cancelled' && <span style={{color:'#64748B'}}>Cancelled</span>}
                    {it.status === 'queued' && <span style={{color:'#94A3B8'}}>Queued</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Input area */}
        {sub?.binary ? (
          fname
            ? <FileBadge name={fname} size={fsize} onClear={reset}/>
            : <DropZone sub={{...sub,groupColor:curGroup.color,groupBg:curGroup.bg}} onFile={handleFile} onFiles={handleFiles}/>
        ) : (
          <div className="fgrp">
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
              <label className="lbl" style={{margin:0}}>Input ({sub?.from})</label>
              <div style={{display:'flex',gap:6}}>
                <input id="fc-file" type="file" multiple style={{display:'none'}}
                  accept={sub?.accept||'*/*'}
                  onChange={e=>{
                    const selected = Array.from(e.target.files || []).filter(Boolean)
                    if (selected.length > 1) {
                      handleFiles(selected)
                    } else if (selected.length === 1) {
                      handleFile(selected[0])
                    }
                    e.target.value=''
                  }}/>
                <label htmlFor="fc-file"
                  style={{display:'inline-flex',alignItems:'center',gap:5,padding:'6px 13px',
                    borderRadius:999,background:'#f0f1f8',border:'1.5px solid rgba(0,0,0,.08)',
                    cursor:'pointer',fontSize:12.5,fontWeight:600,color:'#555'}}>
                  📁 Upload
                </label>
                {text && <button onClick={reset}
                  style={{display:'inline-flex',alignItems:'center',gap:4,padding:'6px 11px',
                    borderRadius:999,background:'none',border:'1.5px solid rgba(0,0,0,.08)',
                    cursor:'pointer',fontSize:12.5,fontWeight:600,color:'#888'}}>
                  ✕ Clear
                </button>}
              </div>
            </div>
            <textarea value={text}
              onChange={e=>{textRef.current=e.target.value;setText(e.target.value);setOutput(null);setError('')}}
              placeholder={PLACEHOLDERS[sub?.from]||'Paste input here…'} rows={7}
              style={{width:'100%',padding:'13px 16px',resize:'vertical',
                fontFamily:['JSON','CSV','B64','HTML'].includes(sub?.from)?"'Courier New',monospace":'DM Sans,sans-serif',
                fontSize:13,borderRadius:13,border:'1.5px solid rgba(0,0,0,.09)',
                background:'#FAFBFF',color:'#1e1e2e',lineHeight:1.65,outline:'none',boxSizing:'border-box',
                transition:'border .18s,box-shadow .18s'}}
              onFocus={e=>{e.target.style.borderColor='rgba(79,142,247,.4)';e.target.style.boxShadow='0 0 0 3.5px rgba(79,142,247,.09)'}}
              onBlur={e=>{e.target.style.borderColor='rgba(0,0,0,.09)';e.target.style.boxShadow='none'}}/>
            {text && <div style={{fontSize:11,color:'#bbb',marginTop:4}}>{text.length.toLocaleString()} chars</div>}
          </div>
        )}

        {/* Universal JobEngine Progress Bar & Real Cancel Button */}
        {loading && (
          <div style={{marginBottom:14}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:5}}>
              <span style={{fontSize:12,fontWeight:600,color:'#4F8EF7'}}>
                {progressText || (sub?.isMedia==='video'?'Re-encoding video…':'Converting…')}
              </span>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <span style={{fontSize:12,fontWeight:700,color:'#4F8EF7'}}>{progress}%</span>
                <button onClick={handleCancel}
                  style={{padding:'2px 8px',borderRadius:6,background:'rgba(239,68,68,.1)',
                    border:'1px solid rgba(239,68,68,.25)',color:'#ef4444',fontSize:11,fontWeight:600,cursor:'pointer'}}>
                  ✕ Cancel
                </button>
              </div>
            </div>
            <div style={{height:7,background:'#e5e7ef',borderRadius:4,overflow:'hidden'}}>
              <motion.div animate={{width:`${progress}%`}} transition={{duration:.2,ease:'easeOut'}}
                style={{height:'100%',background:`linear-gradient(90deg,${curGroup.color}99,${curGroup.color})`,borderRadius:4}}/>
            </div>
          </div>
        )}

        {/* Convert button */}
        <motion.button onClick={handleConvert} disabled={!canConvert}
          whileHover={canConvert?{scale:1.01,y:-1}:{}} whileTap={{scale:.97}}
          style={{width:'100%',marginBottom:16,display:'flex',alignItems:'center',
            justifyContent:'center',gap:10,fontSize:15,fontWeight:700,
            padding:'15px 20px',borderRadius:14,border:'none',
            cursor:canConvert?'pointer':'not-allowed',fontFamily:'DM Sans,sans-serif',
            background:canConvert?`linear-gradient(135deg,${curGroup.color},${curGroup.color}bb)`:'#e5e7eb',
            color:canConvert?'#fff':'#aaa',transition:'all .18s',
            boxShadow:canConvert?`0 6px 22px ${curGroup.color}40`:'none'}}>
          {loading
            ? <><motion.div animate={{rotate:360}} transition={{duration:.7,repeat:Infinity,ease:'linear'}}
                style={{width:18,height:18,borderRadius:'50%',border:'2.5px solid rgba(255,255,255,.3)',
                  borderTopColor:'#fff',flexShrink:0}}/> Processing…</>
            : `⚡ Convert: ${sub?.label}`}
        </motion.button>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}
              style={{display:'flex',gap:10,alignItems:'flex-start',padding:'13px 16px',
                background:'rgba(239,68,68,.06)',border:'1.5px solid rgba(239,68,68,.2)',
                borderRadius:13,marginBottom:16}}>
              <span style={{color:'#ef4444',flexShrink:0,marginTop:1}}>⚠️</span>
              <span style={{fontSize:13,color:'#ef4444',lineHeight:1.55}}>{error}</span>
              <button onClick={()=>setError('')}
                style={{marginLeft:'auto',background:'none',border:'none',cursor:'pointer',
                  fontSize:14,color:'#aaa',flexShrink:0}}>✕</button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Output */}
        <AnimatePresence>
          {output && !loading && (
            <motion.div initial={{opacity:0,y:14}} animate={{opacity:1,y:0}} exit={{opacity:0}}>

              {/* Size comparison for media */}
              {sub?.isMedia && <SizeBar before={fsize} after={outputSize}/>}

              {/* Header */}
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                <label className="lbl" style={{margin:0}}>
                  Output ({sub?.to})
                  {output.w && output.h && <span style={{fontSize:11,color:'#aaa',marginLeft:8,fontWeight:400}}>
                    {output.w}×{output.h}px
                  </span>}
                </label>
                <div style={{display:'flex',gap:7}}>
                  {!output.isBlob && !output.isPdfBytes && !output.binary && (
                    <button onClick={()=>copy(output.content)}
                      style={{display:'inline-flex',alignItems:'center',gap:5,padding:'6px 13px',
                        borderRadius:999,background:copied?'rgba(34,197,94,.1)':'#f0f1f8',
                        border:`1.5px solid ${copied?'rgba(34,197,94,.3)':'rgba(0,0,0,.08)'}`,
                        cursor:'pointer',fontSize:12.5,fontWeight:600,
                        color:copied?'#22c55e':'#555',transition:'all .18s'}}>
                      {copied?'✓ Copied':'📋 Copy'}
                    </button>
                  )}
                  <button onClick={handleDownload}
                    style={{display:'inline-flex',alignItems:'center',gap:5,padding:'6px 14px',
                      borderRadius:999,border:'none',cursor:'pointer',fontSize:12.5,fontWeight:700,
                      color:'#fff',background:`linear-gradient(135deg,${curGroup.color},${curGroup.color}bb)`,
                      boxShadow:`0 3px 10px ${curGroup.color}40`}}>
                    ⬇ .{output.ext}
                  </button>
                </div>
              </div>

              {/* PDF binary success */}
              {(output.isPdfBytes || output.isBlob && output.ext==='pdf') && (
                <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}}
                  style={{textAlign:'center',padding:'28px 20px',
                    background:'rgba(239,68,68,.04)',border:'1.5px solid rgba(239,68,68,.16)',
                    borderRadius:16}}>
                  <motion.div animate={{y:[0,-5,0]}} transition={{duration:2,repeat:Infinity,ease:'easeInOut'}}
                    style={{fontSize:48,marginBottom:10}}>📕</motion.div>
                  <div style={{fontFamily:'Syne,sans-serif',fontWeight:800,fontSize:18,
                    color:'#0d0d1a',marginBottom:6}}>PDF Ready!</div>
                  <div style={{fontSize:12.5,color:'#888',marginBottom:18}}>
                    {fmtBytes(output.content?.length)} · {sub?.label}
                  </div>
                  <button onClick={handleDownload}
                    style={{display:'inline-flex',alignItems:'center',gap:7,padding:'12px 28px',
                      borderRadius:999,background:'linear-gradient(135deg,#ef4444,#ef4444bb)',
                      border:'none',cursor:'pointer',fontSize:14,fontWeight:700,color:'#fff',
                      boxShadow:'0 6px 18px rgba(239,68,68,.35)'}}>
                    ⬇ Download PDF
                  </button>
                </motion.div>
              )}

              {/* Media blob success */}
              {output.isBlob && output.ext!=='pdf' && (
                <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}}
                  style={{textAlign:'center',padding:'28px 20px',
                    background:curGroup.bg,border:`1.5px solid ${curGroup.color}28`,borderRadius:16}}>
                  <div style={{fontSize:48,marginBottom:10}}>
                    {sub?.isMedia==='image'?'🖼️':'🎬'}
                  </div>
                  <div style={{fontFamily:'Syne,sans-serif',fontWeight:800,fontSize:17,
                    color:'#0d0d1a',marginBottom:6}}>
                    {sub?.label} Complete!
                  </div>
                  <div style={{fontSize:13,color:'#888',marginBottom:6}}>
                    {fmtBytes(outputSize)} output
                    {output.w && output.h && ` · ${output.w}×${output.h}px`}
                  </div>
                  {fsize && pct(fsize,outputSize)>0 && (
                    <div style={{fontSize:13,fontWeight:700,color:'#22c55e',marginBottom:18}}>
                      ↓ {pct(fsize,outputSize)}% smaller than original
                    </div>
                  )}
                  <button onClick={handleDownload}
                    style={{display:'inline-flex',alignItems:'center',gap:7,padding:'12px 28px',
                      borderRadius:999,border:'none',cursor:'pointer',fontSize:14,fontWeight:700,
                      color:'#fff',background:`linear-gradient(135deg,${curGroup.color},${curGroup.color}bb)`,
                      boxShadow:`0 6px 18px ${curGroup.color}40`}}>
                    ⬇ Download .{output.ext}
                  </button>
                </motion.div>
              )}

              {/* Text output */}
              {!output.isBlob && !output.isPdfBytes && !output.binary && (
                <>
                  <textarea readOnly value={output.content} rows={10}
                    style={{width:'100%',padding:'13px 16px',resize:'vertical',
                      fontFamily:['json','csv'].includes(output.ext)?"'Courier New',monospace":'DM Sans,sans-serif',
                      fontSize:12.5,borderRadius:13,border:'1.5px solid rgba(34,197,94,.25)',
                      background:'rgba(34,197,94,.025)',color:'#1a5e35',
                      outline:'none',lineHeight:1.65,boxSizing:'border-box'}}/>
                  <div style={{display:'flex',gap:7,marginTop:10,flexWrap:'wrap'}}>
                    {[
                      {l:`.${output.ext}`, c:curGroup.color},
                      {l:`${output.content.length.toLocaleString()} chars`, c:'#9C6FDE'},
                      {l:'local · no upload', c:'#22c55e'},
                    ].map(b=>(
                      <span key={b.l} style={{fontSize:10.5,fontWeight:700,padding:'3px 11px',
                        borderRadius:999,background:`${b.c}10`,color:b.c,border:`1px solid ${b.c}20`}}>
                        {b.l}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </ToolCard>

      {convertHistory.length > 0 && (
        <Reveal delay={0.06}>
          <ToolCard style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Clock size={16} style={{ color: '#4F8EF7' }} />
                <span style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 14, color: '#0d0d1a' }}>
                  Recent File Conversions <span style={{ fontSize: 12, fontWeight: 500, color: '#aaa' }}>({convertHistory.length})</span>
                </span>
              </div>
              <motion.button whileTap={{ scale: 0.95 }}
                onClick={clearToolHistory}
                className="btn btn-outline btn-sm" style={{ color: '#EF5350', borderColor: 'rgba(239,83,80,.25)' }}>
                <Trash2 size={13} style={{ marginRight: 4 }} /> Clear
              </motion.button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto' }}>
              {convertHistory.map((h) => (
                <div key={h.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: '#fafbff', borderRadius: 10, padding: '8px 12px', border: '1px solid rgba(0,0,0,.06)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, overflow: 'hidden', marginRight: 8 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1e293b' }}>
                      {h.label}
                    </span>
                    <span style={{ fontSize: 11, color: '#64748b' }}>
                      {h.value} • <span style={{ color: '#94a3b8' }}>{h.timestamp}</span>
                    </span>
                  </div>
                  <motion.button whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.9 }}
                    onClick={() => removeHistoryItem(h.id)}
                    title="Delete entry"
                    style={{ padding: '4px 8px', borderRadius: 7, border: '1px solid rgba(0,0,0,.08)',
                      background: '#fff', color: '#94a3b8', fontSize: 11, cursor: 'pointer' }}>
                    <Trash2 size={11} />
                  </motion.button>
                </div>
              ))}
            </div>
            <div className="info-bar blue" style={{ marginTop: 10, marginBottom: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
              <ShieldCheck size={14} style={{ flexShrink: 0 }} /> Conversion history is kept strictly in local browser storage. File payloads are never persisted or transmitted.
            </div>
          </ToolCard>
        </Reveal>
      )}
    </ToolShell>
  )
}
