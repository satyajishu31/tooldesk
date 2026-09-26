import React, { useState, useRef, useCallback, useEffect, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ToolShell, { ToolCard, Reveal } from '../../components/ToolShell'
import { useCopy } from '../../hooks'
import { TOOLS } from '../../constants'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { saveFileWithFallback } from '../../utils/fileSaver'

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
   PDF.JS  (CDN)
══════════════════════════════════════════ */
let _pdfjs = null
let _pdfjsPromise = null
async function getPdfJs() {
  if (_pdfjs) return _pdfjs
  if (!_pdfjsPromise) {
    _pdfjsPromise = (async () => {
      if (window.pdfjsLib) {
        _pdfjs = window.pdfjsLib
        _pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js'
        return _pdfjs
      }
      try {
        const pdfjs = await import('pdfjs-dist')
        _pdfjs = pdfjs.default || pdfjs
        _pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js'
        window.pdfjsLib = _pdfjs
        return _pdfjs
      } catch (err) {
        console.warn('[FileConverter] Local pdfjs import error, falling back:', err)
        const s = document.createElement('script')
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
        document.head.appendChild(s)
        await new Promise((res, rej) => { s.onload = res; s.onerror = rej })
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js'
        _pdfjs = window.pdfjsLib
        return _pdfjs
      }
    })()
  }
  return _pdfjsPromise
}
async function extractPdfText(ab) {
  const lib = await getPdfJs()
  const loadingTask = lib.getDocument({
    data: new Uint8Array(ab),
    cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
    cMapPacked: true,
  })
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
   TEXT → PDF
══════════════════════════════════════════ */
function sanitize(s) {
  if (!s || typeof s !== 'string') return ''
  return s
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014\u2015]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u2022\u25E6\u2023]/g, '*')
    .replace(/[\u00AB\u00BB]/g, '"')
    .replace(/[\u20AC]/g, 'EUR')
    .replace(/[\u2264]/g, '<=')
    .replace(/[\u2265]/g, '>=')
    .replace(/[\u2260]/g, '!=')
    .replace(/[\x00-\x09\x0B\x0C\x0E-\x1F]/g, ' ')
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '?')
}

function safeMeasureWidth(font, str, size) {
  try {
    return font.widthOfTextAtSize(str, size)
  } catch {
    const fallback = str.replace(/[^\x20-\x7E]/g, '?')
    try {
      return font.widthOfTextAtSize(fallback, size)
    } catch {
      return fallback.length * size * 0.55
    }
  }
}

async function textToPdf(text) {
  text = sanitize(text)
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const [W,H,M] = [595,842,55]
  const maxW = W-M*2
  const lines = []
  for (const raw of text.replace(/\r\n/g,'\n').split('\n')) {
    if (!raw.trim()) { lines.push({text:'',fs:5}); continue }
    const isH = /^#{1,3} /.test(raw)
    const clean = raw.replace(/^#{1,6}\s*/,'')
    const fs = raw.startsWith('# ')?18:raw.startsWith('## ')?15:raw.startsWith('### ')?13:11
    const f = isH?bold:font
    let cur=''
    for (const w of clean.split(' ')) {
      if (safeMeasureWidth(f, w, fs) > maxW) {
        if (cur) { lines.push({text:cur,isH,fs,f}); cur='' }
        let sub = ''
        for (let i = 0; i < w.length; i++) {
          const testSub = sub + w[i]
          if (safeMeasureWidth(f, testSub, fs) > maxW && sub) {
            lines.push({text:sub,isH,fs,f})
            sub = w[i]
          } else {
            sub = testSub
          }
        }
        cur = sub
      } else {
        const test = cur ? cur+' '+w : w
        if (safeMeasureWidth(f, test, fs) > maxW && cur) { lines.push({text:cur,isH,fs,f}); cur=w }
        else cur=test
      }
    }
    if (cur) lines.push({text:cur,isH,fs,f:isH?bold:font})
  }
  let page=doc.addPage([W,H]); let y=H-M
  for (const l of lines) {
    if (y<M+20){page=doc.addPage([W,H]);y=H-M}
    if (l.text) {
      try {
        page.drawText(l.text,{x:M,y,size:l.fs||11,font:l.f||font,color:rgb(.08,.08,.08)})
      } catch {
        const safe = l.text.replace(/[^\x20-\x7E]/g, '?')
        page.drawText(safe,{x:M,y,size:l.fs||11,font:l.f||font,color:rgb(.08,.08,.08)})
      }
    }
    y-=(l.fs||11)+7
  }
  return doc.save()
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
function parseCsvRow(row) {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < row.length; i++) {
    const char = row[i]
    if (char === '"') {
      if (inQuotes && row[i + 1] === '"') {
        current += '"' // Escaped quote
        i++
      } else {
        inQuotes = !inQuotes // Toggle quote state
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}
function splitCsvIntoRows(csvText) {
  const rows = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i]
    if (char === '"') {
      inQuotes = !inQuotes
      current += char
    } else if (char === '\n' && !inQuotes) {
      rows.push(current)
      current = ''
    } else if (char === '\r') {
      // Skip carriage return
    } else {
      current += char
    }
  }
  if (current) rows.push(current)
  return rows.filter(r => r.trim().length > 0)
}
function csvToJson(csv) {
  const rows = splitCsvIntoRows(csv)
  if (rows.length < 2) throw new Error('CSV needs a header row + at least one data row')
  if (rows.length > 50000) {
    throw new Error('CSV exceeds maximum capacity (50,000 rows). Please use smaller files to prevent browser freezing.')
  }
  const headers = parseCsvRow(rows[0]).map((h, i) => {
    const clean = h.replace(/^"|"$/g, '').trim()
    if (clean === '__proto__' || clean === 'constructor' || clean === 'prototype') {
      return `_${clean}`
    }
    return clean || `column_${i + 1}`
  })
  const data = rows.slice(1).map(r => {
    const vals = parseCsvRow(r).map(v => v.replace(/^"|"$/g, ''))
    const obj = {}
    for (let i = 0; i < headers.length; i++) {
      const key = headers[i]
      if (key !== '__proto__' && key !== 'constructor' && key !== 'prototype') {
        obj[key] = vals[i] ?? ''
      }
    }
    return obj
  })
  return JSON.stringify(data, null, 2)
}
function jsonToCsv(json) {
  const arr = (() => { const d = JSON.parse(json); return Array.isArray(d) ? d : [d] })()
  if (!arr.length) throw new Error('Empty JSON array')
  if (arr.length > 50000) {
    throw new Error('JSON exceeds maximum capacity (50,000 items). Please use smaller files to prevent browser freezing.')
  }
  const validObjects = arr.filter(item => item !== null && typeof item === 'object')
  if (!validObjects.length) throw new Error('JSON array must contain valid objects')
  const keys = [...new Set(validObjects.flatMap(Object.keys))].filter(k => k !== '__proto__' && k !== 'constructor' && k !== 'prototype')
  const esc = v => {
    let val = (v !== null && typeof v === 'object') ? JSON.stringify(v) : String(v ?? '')
    if (/^[=+\-@\t\r]/.test(val)) {
      val = "'" + val
    }
    return val.includes(',') || val.includes('"') || val.includes('\n') || val.includes('\r') ? `"${val.replace(/"/g, '""')}"` : val
  }
  return [keys.map(esc).join(','), ...validObjects.map(r => keys.map(k => esc(r[k])).join(','))].join('\n')
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
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm'
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
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
    id:'doc', label:'📄 Documents', color:'#ef4444', bg:'rgba(239,68,68,.07)',
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
    id:'data', label:'📊 Data', color:'#22c55e', bg:'rgba(34,197,94,.07)',
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
    id:'image', label:'🖼️ Images', color:'#4F8EF7', bg:'rgba(79,142,247,.07)',
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
    id:'video', label:'🎬 Video', color:'#9C6FDE', bg:'rgba(156,111,222,.07)',
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
async function doConvert(sub, textInput, binaryInput, mediaOpts, fileBlob) {
  const {from, to, binary, isMedia, mode} = sub
  const t = textInput

  // ── Media conversions — need original File/Blob, NOT the ArrayBuffer ──
  if (isMedia === 'image') {
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
    return { blob: result.blob, ext: result.ext, mime: result.mime, w: result.w, h: result.h, isBlob: true }
  }

  if (isMedia === 'video') {
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
  if (from==='TXT'&&to==='PDF')   return {content:await textToPdf(t), ext:'pdf', mime:'application/pdf', isPdfBytes:true}
  if (from==='MD' &&to==='PDF')   return {content:await textToPdf(mdToTxt(t)), ext:'pdf', mime:'application/pdf', isPdfBytes:true}
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
    <div style={{display:'flex',gap:6,marginBottom:20,flexWrap:'wrap'}}>
      {GROUPS.map(g=>(
        <button key={g.id} onClick={()=>onChange(g.id)}
          style={{display:'flex',alignItems:'center',gap:6,padding:'8px 16px',
            borderRadius:12,cursor:'pointer',transition:'all .18s',
            border:`1.5px solid ${active===g.id?g.color:'rgba(0,0,0,.09)'}`,
            background:active===g.id?g.bg:'#fafafa',
            color:active===g.id?g.color:'#666',
            fontFamily:'DM Sans,sans-serif',fontWeight:active===g.id?700:500,fontSize:13}}>
          {g.label}
        </button>
      ))}
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
function DropZone({ sub, onFile }) {
  const [drag, setDrag] = useState(false)
  return (
    <motion.label
      onDragOver={e=>{e.preventDefault();setDrag(true)}}
      onDragLeave={()=>setDrag(false)}
      onDrop={e=>{e.preventDefault();setDrag(false);onFile(e.dataTransfer.files[0])}}
      animate={{borderColor:drag?sub.groupColor:'rgba(0,0,0,.1)',scale:drag?1.01:1,
        background:drag?sub.groupBg:'transparent'}}
      style={{display:'block',border:'2px dashed rgba(0,0,0,.1)',borderRadius:14,
        padding:'30px 20px',textAlign:'center',cursor:'pointer',marginBottom:16}}>
      <input type="file" style={{display:'none'}} accept={sub.accept}
        onChange={e=>onFile(e.target.files[0])}/>
      <div style={{fontSize:36,marginBottom:8}}>{sub.icon}</div>
      <div style={{fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:14,
        color:'#0d0d1a',marginBottom:4}}>
        {drag?'Drop to convert':'Drop file here or click to browse'}
      </div>
      <div style={{fontSize:12,color:'#aaa'}}>{sub.accept.replace(/\./g,'').toUpperCase()}</div>
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
  const [mediaOpts,setOpts]     = useState({quality:85,maxWidth:0,maxHeight:0,videoPreset:'medium',videoCodec:'h264'})
  const [copied,   copy]        = useCopy()

  const subRef = useRef(sub)
  const lastFileRef = useRef(null)
  const mediaOptsRef = useRef(mediaOpts)
  const textRef = useRef('')
  const binaryRef = useRef(null)
  const blobFileRef = useRef(null)

  const curGroup = GROUPS.find(g=>g.id===groupId)

  // Reset when switching groups
  useEffect(()=>{
    const first = ALL_SUBS.find(s=>s.groupId===groupId)
    subRef.current = first
    setSub(first)
    reset()
  },[groupId])

  const reset = ()=>{
    lastFileRef.current = null
    textRef.current = ''
    binaryRef.current = null
    blobFileRef.current = null
    setText(''); setBinary(null); setBlobFile(null); setFname(''); setFsize(0)
    setOutput(null); setError(''); setProgress(0); setLoading(false)
  }

  const selectSub = s => {
    subRef.current = s
    setSub(s)
    setOutput(null); setError(''); setProgress(0); setLoading(false)

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

  const handleOptsChange = useCallback(newOpts => {
    mediaOptsRef.current = newOpts
    setOpts(newOpts)
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
    setError(''); setOutput(null); setLoading(true); setProgress(0)
    try {
      const optsWithCb = { ...(mediaOptsRef.current || mediaOpts), onProgress: p=>setProgress(p) }
      const result = await doConvert(activeSub, curText==='__BINARY__'?'':curText, curBinary, optsWithCb, curBlob)
      setOutput({ ...result, origSize: fsize })
      setProgress(100)
    } catch(e) {
      setError(e.message || 'Conversion failed.')
    } finally {
      setLoading(false)
    }
  }, [sub, text, binary, mediaOpts, fsize, blobFile])


  const handleDownload = ()=>{
    if (!output) return
    const name = fname ? fname.replace(/\.[^.]+$/,'.')+output.ext : 'converted.'+output.ext
    if (output.isBlob) {
      dlBlob(output.blob, name)
    } else if (output.isPdfBytes) {
      dlBlob(new Blob([output.content],{type:'application/pdf'}), name)
    } else {
      dlBlob(new Blob([output.content],{type:output.mime+';charset=utf-8'}), name)
    }
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

        {/* Input area */}
        {sub?.binary ? (
          fname
            ? <FileBadge name={fname} size={fsize} onClear={reset}/>
            : <DropZone sub={{...sub,groupColor:curGroup.color,groupBg:curGroup.bg}} onFile={handleFile}/>
        ) : (
          <div className="fgrp">
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
              <label className="lbl" style={{margin:0}}>Input ({sub?.from})</label>
              <div style={{display:'flex',gap:6}}>
                <input id="fc-file" type="file" style={{display:'none'}}
                  accept={sub?.accept||'*/*'}
                  onChange={e=>{if(e.target.files[0])handleFile(e.target.files[0]);e.target.value=''}}/>
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

        {/* Progress bar for media */}
        {loading && sub?.isMedia && (
          <div style={{marginBottom:14}}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}>
              <span style={{fontSize:12,fontWeight:600,color:'#4F8EF7'}}>
                {sub.isMedia==='video'?'Re-encoding video…':'Converting…'}
              </span>
              <span style={{fontSize:12,fontWeight:700,color:'#4F8EF7'}}>{progress}%</span>
            </div>
            <div style={{height:7,background:'#e5e7ef',borderRadius:4,overflow:'hidden'}}>
              <motion.div animate={{width:`${progress}%`}} transition={{duration:.4,ease:'easeOut'}}
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
    </ToolShell>
  )
}
