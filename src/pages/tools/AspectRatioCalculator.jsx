import React, { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ToolShell, { ToolCard } from '../../components/ToolShell'
import { useCopy } from '../../hooks'
import { TOOLS } from '../../constants'
import { safeFetchJSON } from '../../utils/safeFetch'
import { addToHistory } from '../../utils/history'

const tool = TOOLS.find(t => t.id === 'aspectratio')

/* ─── Iterative GCD + simplify ─── */
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
function simplify(w, h) {
  const a = Math.round(Math.abs(w)), b = Math.round(Math.abs(h))
  if (!a || !b) return ['?', '?']
  const g = gcd(a, b)
  return [a / g, b / g]
}

/* ─── Common ratios ─── */
const COMMON = [
  { label:'16:9',  w:16, h:9,  note:'HD Video',    color:'#4F8EF7' },
  { label:'4:3',   w:4,  h:3,  note:'Classic TV',  color:'#9C6FDE' },
  { label:'1:1',   w:1,  h:1,  note:'Square',      color:'#F06292' },
  { label:'21:9',  w:21, h:9,  note:'Ultrawide',   color:'#FF9800' },
  { label:'9:16',  w:9,  h:16, note:'Portrait',    color:'#22c55e' },
  { label:'3:2',   w:3,  h:2,  note:'Photo',       color:'#26C6DA' },
  { label:'2:3',   w:2,  h:3,  note:'Print',       color:'#FF5722' },
  { label:'5:4',   w:5,  h:4,  note:'Monitor',     color:'#607D8B' },
]

const PLATFORM_PRESETS = [
  { platform: 'YouTube 1080p', ratio: '16:9', w: 1920, h: 1080, icon: '▶️', safeZone: '90% Title Safe (192px margins)', color: '#ef4444' },
  { platform: 'TikTok / Shorts / Reels', ratio: '9:16', w: 1080, h: 1920, icon: '📱', safeZone: 'Safe: Top 150px, Bottom 280px, Right 120px', color: '#06b6d4' },
  { platform: 'Instagram Square', ratio: '1:1', w: 1080, h: 1080, icon: '📷', safeZone: '100% Full-Frame Square', color: '#ec4899' },
  { platform: 'Instagram Portrait', ratio: '4:5', w: 1080, h: 1350, icon: '📸', safeZone: 'Feed Portrait (No crop in feed)', color: '#8b5cf6' },
  { platform: 'Twitter / X Post', ratio: '16:9', w: 1200, h: 675, icon: '🐦', safeZone: '2:1 & 16:9 Card Safe', color: '#3b82f6' },
  { platform: 'LinkedIn / Social Banner', ratio: '1.91:1', w: 1200, h: 627, icon: '💼', safeZone: 'Link preview card safe', color: '#0284c7' },
  { platform: 'Cinema DCI 4K', ratio: '2.39:1', w: 4096, h: 1716, icon: '🎬', safeZone: 'Theatrical Anamorphic', color: '#f59e0b' },
]

/* ════════════════════════════════════════
   ANIMATED PREVIEW — pure CSS + Framer Motion
   No canvas, no roundRect, no crashes
   ════════════════════════════════════════ */
function RatioPreview({ width, height, matchedColor }) {
  const MAX_W = 260, MAX_H = 160
  const wNum = parseFloat(width) || 0
  const hNum = parseFloat(height) || 0
  let r = (hNum > 0 && wNum > 0) ? wNum / hNum : 16 / 9
  if (!isFinite(r) || r <= 0) r = 16 / 9
  let pw, ph
  if (r > MAX_W / MAX_H) { pw = MAX_W; ph = MAX_W / r }
  else                    { ph = MAX_H; pw = MAX_H * r }
  pw = Math.max(20, Math.min(MAX_W, pw))
  ph = Math.max(14, Math.min(MAX_H, ph))

  const color = matchedColor || '#4F8EF7'
  const [rw, rh] = simplify(width, height)

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px 20px 16px', minHeight: 210, position: 'relative',
      background: 'linear-gradient(135deg,#e8f5e9,#f0f4ff)',
      borderRadius: 16, overflow: 'hidden',
    }}>
      {/* Dot grid background */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'radial-gradient(circle, rgba(79,142,247,.1) 1px, transparent 1px)',
        backgroundSize: '22px 22px',
        pointerEvents: 'none',
      }}/>

      {/* Animated rectangle */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* Width label */}
        <motion.div
          key={`w-${width}`}
          initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          style={{
            textAlign: 'center', fontSize: 11, fontWeight: 700,
            color: color, marginBottom: 6, fontFamily: 'DM Sans, sans-serif',
          }}>
          {width}px
        </motion.div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Height label */}
          <motion.div
            key={`h-${height}`}
            initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
            style={{
              writingMode: 'vertical-rl', textOrientation: 'mixed',
              transform: 'rotate(180deg)',
              fontSize: 11, fontWeight: 700, color: color,
              fontFamily: 'DM Sans, sans-serif',
            }}>
            {height}px
          </motion.div>

          {/* The morphing box */}
          <motion.div
            animate={{ width: pw, height: ph }}
            transition={{ type: 'spring', stiffness: 80, damping: 18 }}
            style={{
              background: `linear-gradient(135deg, ${color}20, ${color}0D)`,
              border: `2px solid ${color}90`,
              borderRadius: 8,
              position: 'relative',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>

            {/* Rule of thirds dashed lines */}
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              {[1/3, 2/3].map(f => (
                <React.Fragment key={f}>
                  <div style={{ position:'absolute', left:`${f*100}%`, top:0, bottom:0, width:1, background:`${color}18`, borderLeft:`1px dashed ${color}28` }}/>
                  <div style={{ position:'absolute', top:`${f*100}%`, left:0, right:0, height:1, background:`${color}18`, borderTop:`1px dashed ${color}28` }}/>
                </React.Fragment>
              ))}
            </div>

            {/* Ratio label in centre */}
            <motion.span
              key={`${rw}:${rh}`}
              initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 22 }}
              style={{
                fontFamily: 'Syne, sans-serif', fontWeight: 800,
                fontSize: Math.max(10, Math.min(18, pw * 0.09)),
                color: `${color}80`, userSelect: 'none', position: 'relative', zIndex: 1,
              }}>
              {rw}:{rh}
            </motion.span>

            {/* Corner handles — glow pulse */}
            {[[0,0],[100,0],[0,100],[100,100]].map(([px, py], i) => (
              <motion.div key={i}
                animate={{
                  scale: [1, 1.4, 1],
                  boxShadow: [`0 0 0px ${color}00`, `0 0 8px ${color}90`, `0 0 0px ${color}00`],
                }}
                transition={{ duration: 2, repeat: Infinity, delay: i * 0.4, ease: 'easeInOut' }}
                style={{
                  position: 'absolute',
                  left: `${px}%`, top: `${py}%`,
                  transform: 'translate(-50%, -50%)',
                  width: 10, height: 10, borderRadius: '50%',
                  background: color,
                  border: '2px solid #fff',
                }}
              />
            ))}
          </motion.div>
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════
   FOCUS INPUT — SVG border draw on focus
   ════════════════════════════════════════ */
function FocusInput({ label, value, onChange, color = '#4F8EF7', inputStyle = {}, ...rest }) {
  const [focused, setFocused] = useState(false)
  return (
    <div>
      {label && (
        <div style={{
          fontSize: 11.5, fontWeight: 700, color: '#64748b',
          textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6,
        }}>{label}</div>
      )}
      <div style={{ position: 'relative' }}>
        <input
          value={value}
          onChange={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            width: '100%', padding: '12px 14px',
            border: `1.5px solid ${focused ? color : 'rgba(0,0,0,.1)'}`,
            borderRadius: 10, fontFamily: 'DM Sans, sans-serif',
            fontSize: 14, color: '#2d2d3d', background: '#fafafa',
            outline: 'none', transition: 'border-color .2s, box-shadow .2s',
            boxShadow: focused ? `0 0 0 3px ${color}18` : 'none',
            ...inputStyle,
          }}
          {...rest}
        />
        {/* Animated SVG border draw on focus */}
        <AnimatePresence>
          {focused && (
            <motion.svg
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                position: 'absolute', inset: -2,
                width: 'calc(100% + 4px)', height: 'calc(100% + 4px)',
                overflow: 'visible', pointerEvents: 'none',
              }}>
              <motion.rect
                x="2" y="2" rx="11"
                fill="none"
                stroke={color}
                strokeWidth="2"
                initial={{ strokeDasharray: '0 2000', opacity: .8 }}
                animate={{ strokeDasharray: '2000 0', opacity: .5 }}
                transition={{ duration: .55, ease: 'easeOut' }}
                style={{ width: 'calc(100% - 4px)', height: 'calc(100% - 4px)' }}
              />
            </motion.svg>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════
   STAT BOX — hover lift + spring
   ════════════════════════════════════════ */
function StatBox({ label, value, color, sub }) {
  return (
    <motion.div
      whileHover={{ y: -5, scale: 1.03, boxShadow: `0 10px 26px ${color}22` }}
      transition={{ type: 'spring', stiffness: 300, damping: 22 }}
      style={{
        background: '#F5F7FF', borderRadius: 14, padding: '14px 12px',
        textAlign: 'center', border: `1px solid ${color}1A`, cursor: 'default',
      }}>
      <motion.div
        key={value}
        initial={{ y: -10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 28 }}
        style={{
          fontFamily: 'Syne, sans-serif', fontSize: 20,
          fontWeight: 800, color, lineHeight: 1, marginBottom: 4,
        }}>
        {value}
      </motion.div>
      <div style={{ fontSize: 11.5, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</div>
      {sub && <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 3 }}>{sub}</div>}
    </motion.div>
  )
}

/* ════════════════════════════════════════
   RATIO CHIP — active glow, hover lift
   ════════════════════════════════════════ */
function RatioChip({ r, active, onClick }) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -4, scale: 1.07 }}
      whileTap={{ scale: .93 }}
      style={{
        padding: '8px 14px', borderRadius: 999, cursor: 'pointer',
        border: `1.5px solid ${active ? r.color : 'rgba(0,0,0,.1)'}`,
        background: active ? `${r.color}14` : '#fafafa',
        color: active ? r.color : '#666',
        fontWeight: 700, fontSize: 12.5, fontFamily: 'DM Sans, sans-serif',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
        transition: 'border-color .18s, background .18s, color .18s',
        position: 'relative', overflow: 'hidden',
        boxShadow: active ? `0 4px 16px ${r.color}30` : 'none',
      }}>
      {active && (
        <motion.div
          initial={{ scale: 0, opacity: .7 }}
          animate={{ scale: 3, opacity: 0 }}
          transition={{ duration: .65 }}
          style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', background: `${r.color}25` }}
        />
      )}
      <span style={{ position: 'relative', zIndex: 1 }}>{r.label}</span>
      <span style={{ fontSize: 10.5, opacity: .8, fontWeight: 500, position: 'relative', zIndex: 1 }}>{r.note}</span>
    </motion.button>
  )
}

/* ════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════ */
export default function AspectRatioCalculator() {
  const [widthInput,  setWidthInput]  = useState('1920')
  const [heightInput, setHeightInput] = useState('1080')
  const [targetW, setTargetW] = useState('1280')
  const [imgSrc,  setImgSrc]  = useState('')
  const [imgName, setImgName] = useState('')
  const [drag,    setDrag]    = useState(false)
  const [copied,  copy]       = useCopy()
  const fileRef = useRef(null)
  const prevUrlRef = useRef(null)

  /* AI Framing & Social Safe Zone Advisor */
  const [aiFormat, setAiFormat] = useState('video')
  const [aiDesc, setAiDesc] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [aiAdvice, setAiAdvice] = useState(null)

  const handleGetAdvice = async () => {
    setAiLoading(true)
    setAiError('')
    try {
      const data = await safeFetchJSON('/.netlify/functions/groq-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'aspectRatioAdvisor',
          payload: {
            format: aiFormat,
            description: aiDesc.trim(),
            ratio: `${rw}:${rh}`
          }
        })
      })
      if (data?.error) throw new Error(data.error)
      if (!data?.advice) throw new Error('No framing advice returned')
      setAiAdvice(data.advice)
    } catch (err) {
      setAiError(err?.message || 'Failed to get framing advice')
    } finally {
      setAiLoading(false)
    }
  }

  useEffect(() => {
    return () => {
      if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current)
    }
  }, [])

  const width = Math.max(1, parseInt(widthInput) || 1920)
  const height = Math.max(1, parseInt(heightInput) || 1080)

  /* Computed values */
  const [rw, rh]  = simplify(width, height)
  const ratio     = `${rw}:${rh}`
  const decimal   = height > 0 ? (width / height).toFixed(4) : '—'
  const targetWNum = Math.max(1, parseInt(targetW) || 1)
  const computed  = height > 0 && width > 0 ? Math.round(targetWNum * height / width) : 0
  const megapixels= ((width * height) / 1_000_000).toFixed(1)

  const matched = COMMON.find(r => rw === r.w && rh === r.h)

  /* Debounced history tracking on stabilized calculation */
  useEffect(() => {
    if (!width || !height || width <= 0 || height <= 0) return
    const timer = setTimeout(() => {
      try {
        addToHistory({
          tool: 'Aspect Ratio',
          label: `${width}×${height} → ${ratio}`,
          value: `${decimal} (${matched?.note || 'Custom'})`,
          action: 'Calculated',
          category: 'calculator',
          metadata: { width, height, ratio, decimal }
        })
      } catch {}
    }, 1200)
    return () => clearTimeout(timer)
  }, [width, height, ratio, decimal, matched])

  /* Load image and auto-detect dimensions */
  const loadImage = useCallback(f => {
    if (!f || !f.type.startsWith('image/')) return
    if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current)
    const objectUrl = URL.createObjectURL(f)
    prevUrlRef.current = objectUrl
    const img = new Image()
    img.onload = () => {
      setWidthInput(String(img.naturalWidth))
      setHeightInput(String(img.naturalHeight))
      setImgSrc(objectUrl)
      setImgName(f.name)
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      if (prevUrlRef.current === objectUrl) prevUrlRef.current = null
    }
    img.src = objectUrl
  }, [])

  const onInput    = e => { loadImage(e.target.files?.[0]); e.target.value = '' }
  const onDrop     = e => { e.preventDefault(); setDrag(false); loadImage(e.dataTransfer.files?.[0]) }
  const onDragOver = e => { e.preventDefault(); setDrag(true) }
  const onDragLeave= () => setDrag(false)

  const handleW = e => setWidthInput(e.target.value.replace(/[^0-9]/g, ''))
  const handleH = e => setHeightInput(e.target.value.replace(/[^0-9]/g, ''))

  return (
    <ToolShell tool={tool}>

      {/* ── ANIMATED RATIO PREVIEW ── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: .5, ease: [.22, 1, .36, 1] }}
        style={{ marginBottom: 22 }}>
        <RatioPreview width={width} height={height} matchedColor={matched?.color}/>
      </motion.div>

      <ToolCard>

        {/* ── IMAGE UPLOAD ── */}
        <div style={{ marginBottom: 20 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: '#888',
            textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 8,
          }}>Upload Image to Auto-Detect Ratio</div>

          <motion.div
            onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
            onClick={() => fileRef.current?.click()}
            animate={{
              borderColor: drag ? '#4F8EF7' : 'rgba(79,142,247,.25)',
              background:  drag ? 'rgba(79,142,247,.07)' : 'rgba(79,142,247,.02)',
            }}
            whileHover={{ scale: 1.008 }}
            style={{
              border: '2px dashed rgba(79,142,247,.25)', borderRadius: 14,
              padding: '16px 20px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 14,
              flexWrap: 'wrap', justifyContent: 'center',
            }}>

            <AnimatePresence mode="wait">
              {imgSrc ? (
                <motion.div key="loaded"
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', justifyContent: 'center' }}>
                  <img decoding="async" loading="eager" src={imgSrc} alt="uploaded" style={{
                    height: 52, maxWidth: 80, objectFit: 'contain',
                    borderRadius: 9, border: '1px solid rgba(0,0,0,.08)', background: '#fff',
                  }}/>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#333', marginBottom: 3 }}>
                      ✅ {imgName || 'Image loaded'}
                    </div>
                    <div style={{ fontSize: 12, color: '#4F8EF7', fontWeight: 600 }}>
                      {width} × {height}px → {ratio}
                    </div>
                    <div style={{ fontSize: 10, color: '#bbb', marginTop: 2 }}>Click to change</div>
                  </div>
                </motion.div>
              ) : (
                <motion.div key="empty"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <motion.span
                    animate={{ y: [0, -6, 0] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    style={{ fontSize: 28 }}>🖼️</motion.span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 2 }}>
                      Drop image here or click to upload
                    </div>
                    <div style={{ fontSize: 11, color: '#aaa' }}>
                      Auto-detects the exact aspect ratio from any image
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onInput}/>
        </div>

        {/* ── MANUAL DIMENSIONS ── */}
        <div style={{ marginBottom: 20 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: '#888',
            textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 8,
          }}>Or Enter Dimensions Manually</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 32px 1fr', gap: 8, alignItems: 'flex-end' }}>
            <FocusInput
              label="Width (px)"
              value={widthInput}
              onChange={handleW}
              type="text"
              inputMode="numeric"
              color="#4F8EF7"
              inputStyle={{ textAlign: 'center', fontFamily: 'Syne,sans-serif', fontSize: 20, fontWeight: 800, color: '#4F8EF7' }}
            />
            <div style={{ textAlign: 'center', paddingBottom: 14, fontSize: 18, color: '#ddd', userSelect: 'none' }}>×</div>
            <FocusInput
              label="Height (px)"
              value={heightInput}
              onChange={handleH}
              type="text"
              inputMode="numeric"
              color="#9C6FDE"
              inputStyle={{ textAlign: 'center', fontFamily: 'Syne,sans-serif', fontSize: 20, fontWeight: 800, color: '#9C6FDE' }}
            />
          </div>
        </div>

        {/* ── STAT BOXES ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 9, marginBottom: 22 }}>
          <StatBox label="Ratio"      value={ratio}           color="#4F8EF7"/>
          <StatBox label="Decimal"    value={decimal}         color="#9C6FDE"/>
          <StatBox label="Megapixels" value={`${megapixels}MP`} color="#F06292"/>
          <StatBox label="Match"      value={matched?.label || '—'} color={matched ? '#22c55e' : '#ccc'}/>
        </div>

        {/* ── COMMON RATIO CHIPS ── */}
        <div style={{ marginBottom: 22 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: '#888',
            textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 10,
          }}>Common Ratios — Click to Apply</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {COMMON.map(r => (
              <RatioChip
                key={r.label}
                r={r}
                active={matched?.label === r.label}
                onClick={() => { setWidthInput(String(r.w * 100)); setHeightInput(String(r.h * 100)); setImgSrc(''); setImgName('') }}
              />
            ))}
          </div>
        </div>

        {/* ── PLATFORM PRESETS & MATHEMATICAL SAFE-ZONES ── */}
        <div style={{ marginBottom: 22 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: '#888',
            textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 10,
          }}>Platform Specs & Safe-Zones — 1-Click Apply</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {PLATFORM_PRESETS.map(p => (
              <motion.button
                key={p.platform}
                type="button"
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  setWidthInput(String(p.w))
                  setHeightInput(String(p.h))
                  setImgSrc('')
                  setImgName('')
                }}
                style={{
                  padding: '10px 12px',
                  borderRadius: 14,
                  border: (width === p.w && height === p.h) ? `2px solid ${p.color}` : '1px solid rgba(0,0,0,0.08)',
                  background: (width === p.w && height === p.h) ? `${p.color}10` : '#fafafa',
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  transition: 'all 0.18s ease'
                }}
              >
                <span style={{ fontSize: 20 }}>{p.icon}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: '#1e293b' }}>{p.platform}</span>
                    <span style={{ fontSize: 11, fontWeight: 800, color: p.color }}>{p.ratio}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                    {p.w} × {p.h}px
                  </div>
                  <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.safeZone}
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        </div>

        {/* ── HEIGHT CALCULATOR ── */}
        <div style={{
          background: 'rgba(79,142,247,.04)', border: '1px solid rgba(79,142,247,.12)',
          borderRadius: 14, padding: '16px', marginBottom: 22,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: '#4F8EF7',
            textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 12,
          }}>📐 Calculate Height from Width</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 28px 1fr', gap: 8, alignItems: 'flex-end' }}>
            <FocusInput
              label="Target Width (px)"
              value={targetW}
              onChange={e => setTargetW(e.target.value.replace(/[^0-9]/g, ''))}
              type="text"
              inputMode="numeric"
              min={1}
              color="#4F8EF7"
            />
            <div style={{ textAlign: 'center', paddingBottom: 14, color: '#ddd', fontSize: 16 }}>→</div>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>
                Resulting Height
              </div>
              <motion.div
                key={computed}
                initial={{ scale: .88, opacity: .5 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                style={{
                  background: '#F5F7FF', border: '1.5px solid rgba(79,142,247,.2)',
                  borderRadius: 10, padding: '12px 14px',
                  fontFamily: 'Syne,sans-serif', fontSize: 20,
                  fontWeight: 800, color: '#9C6FDE', textAlign: 'center',
                }}>
                {computed}
              </motion.div>
            </div>
          </div>

          {/* Compact result display */}
          {computed > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              style={{
                marginTop: 12, padding: '8px 12px',
                background: 'rgba(79,142,247,.06)', borderRadius: 8,
                fontSize: 12.5, color: '#4F8EF7', fontWeight: 600, textAlign: 'center',
              }}>
              At {targetW}px wide → {computed}px tall · Ratio stays {ratio}
            </motion.div>
          )}
        </div>

        {/* ── COPY BUTTON ── */}
        <motion.button
          onClick={() => copy(
            `Aspect Ratio: ${ratio} (${decimal}:1)\nOriginal: ${width} × ${height} px (${megapixels}MP)\nAt ${targetW}px: ${targetW} × ${computed} px\nMatch: ${matched?.label || 'Custom'}`
          )}
          whileHover={{ scale: 1.01, y: -2 }}
          whileTap={{ scale: .97 }}
          style={{
            width: '100%', padding: '14px', borderRadius: 12, border: 'none',
            cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
            fontWeight: 700, fontSize: 15.5, color: '#fff',
            background: copied
              ? 'linear-gradient(135deg,#22c55e,#16a34a)'
              : 'linear-gradient(135deg,#4F8EF7,#9C6FDE)',
            boxShadow: copied
              ? '0 6px 20px rgba(34,197,94,.3)'
              : '0 6px 20px rgba(79,142,247,.28)',
            transition: 'background .35s, box-shadow .35s',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
          }}>
          <span style={{ fontSize: 18 }}>{copied ? '✅' : '📋'}</span>
          {copied ? 'Copied to clipboard!' : 'Copy All Results'}
        </motion.button>

      </ToolCard>

      {/* ── AI SOCIAL FRAMING & SAFE ZONE ADVISOR ── */}
      <ToolCard style={{ marginTop: 18 }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 14, flexWrap: 'wrap', gap: 10
        }}>
          <div>
            <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 16, color: '#0d0d1a', display: 'flex', alignItems: 'center', gap: 7 }}>
              <span>🤖</span> AI Social Framing & Safe-Zone Advisor
            </div>
            <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
              Get platform-specific aspect ratio, dimension, and safe-zone rules for TikTok, Reels, Shorts, and ads.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <select
            className="inp"
            value={aiFormat}
            onChange={e => setAiFormat(e.target.value)}
            style={{ width: 140, fontSize: 13, background: '#fff' }}
          >
            <option value="video">🎬 Short Video / Reel</option>
            <option value="photo">📸 Feed Photo</option>
            <option value="carousel">📑 Carousel Slide</option>
            <option value="ad">📢 Paid Social Ad</option>
            <option value="cinema">🎥 Cinematic Video</option>
          </select>
          <input
            className="inp"
            value={aiDesc}
            onChange={e => setAiDesc(e.target.value)}
            placeholder={`Content context: e.g. "Talking head tutorial with on-screen text overlays"`}
            style={{ flex: 1, minWidth: 240, fontSize: 13 }}
            onKeyDown={e => e.key === 'Enter' && handleGetAdvice()}
          />
          <button
            type="button"
            onClick={handleGetAdvice}
            disabled={aiLoading}
            className="btn btn-primary"
            style={{ padding: '8px 18px', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {aiLoading ? (
              <>
                <span className="spinner-border spinner-border-sm" />
                <span>Auditing...</span>
              </>
            ) : (
              <>
                <span>✨</span>
                <span>Get Advice</span>
              </>
            )}
          </button>
        </div>

        {aiError && (
          <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, color: '#ef4444', fontSize: 12, marginBottom: 14 }}>
            ⚠️ {aiError}
          </div>
        )}

        {aiAdvice ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
          >
            {/* Recommendation Pills */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10,
              padding: '14px', borderRadius: 12, background: '#f8faff', border: '1px solid rgba(79,142,247,0.18)'
            }}>
              <div>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Recommended Ratio</div>
                <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 20, fontWeight: 800, color: '#4F8EF7' }}>
                  {aiAdvice.recommendedRatio || ratio}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Standard Dimensions</div>
                <div style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700, color: '#0d0d1a', marginTop: 2 }}>
                  {aiAdvice.recommendedDimensions || '1080×1920'}
                </div>
                {aiAdvice.recommendedDimensions && (
                  <button
                    type="button"
                    onClick={() => {
                      const match = (aiAdvice.recommendedDimensions || '').match(/(\d+)\s*[×xX*]\s*(\d+)/)
                      if (match) {
                        setWidthInput(match[1])
                        setHeightInput(match[2])
                      }
                    }}
                    style={{
                      marginTop: 4,
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: '#4F8EF7',
                      background: 'rgba(79,142,247,.08)',
                      border: '1px solid rgba(79,142,247,.25)',
                      borderRadius: 6,
                      padding: '2px 8px',
                      cursor: 'pointer'
                    }}>
                    Apply to Calculator →
                  </button>
                )}
              </div>
              <div>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Best Fit Platforms</div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', marginTop: 2 }}>
                  {Array.isArray(aiAdvice.bestPlatforms) ? aiAdvice.bestPlatforms.join(' · ') : 'Social Platforms'}
                </div>
              </div>
            </div>

            {/* Safe Zones & UI Rules */}
            {aiAdvice.safeZones && (
              <div style={{ padding: '12px 14px', borderRadius: 10, background: '#fffbeb', border: '1px solid rgba(245,158,11,0.25)', fontSize: 12.5, color: '#78350f', lineHeight: 1.6 }}>
                <strong>🛡️ Safe-Zone Guidance:</strong> {aiAdvice.safeZones}
              </div>
            )}

            {/* Cinematic Notes & Traps */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
              {aiAdvice.cinematicNotes && (
                <div style={{ padding: '12px 14px', borderRadius: 10, background: '#f8f9ff', border: '1px solid rgba(79,142,247,0.15)', fontSize: 12, color: '#334155' }}>
                  <div style={{ fontWeight: 700, color: '#0d0d1a', marginBottom: 4 }}>🎬 Composition Tips</div>
                  {aiAdvice.cinematicNotes}
                </div>
              )}
              {aiAdvice.commonTraps && (
                <div style={{ padding: '12px 14px', borderRadius: 10, background: '#fff1f2', border: '1px solid rgba(239,68,68,0.15)', fontSize: 12, color: '#881337' }}>
                  <div style={{ fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>⚠️ Common Traps to Avoid</div>
                  {aiAdvice.commonTraps}
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          <div style={{
            textAlign: 'center',
            padding: '20px 16px',
            borderRadius: 12,
            background: '#fafbff',
            border: '1.5px dashed rgba(79,142,247,0.2)'
          }}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>📐</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0d0d1a' }}>Multi-Platform Framing Intelligence</div>
            <div style={{ fontSize: 11.5, color: '#64748b', maxWidth: 420, margin: '4px auto 10px' }}>
              Select a media format or describe your video/photo to get AI guidance on optimal ratios, exact resolutions, and platform UI safe zones.
            </div>
            <button
              type="button"
              onClick={handleGetAdvice}
              disabled={aiLoading}
              className="btn btn-sm btn-primary"
              style={{ fontSize: 12, padding: '6px 14px', borderRadius: 999 }}
            >
              ✨ Analyze Framing for Current Ratio ({ratio})
            </button>
          </div>
        )}
      </ToolCard>
    </ToolShell>
  )
}
