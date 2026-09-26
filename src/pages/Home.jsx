import React, { useState, useEffect, useRef, useCallback, memo , useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, useInView, AnimatePresence } from 'framer-motion'
import { TOOLS, HERO_TEXTS } from '../constants'
import ToolCard from '../components/ToolCard'
import Footer from '../components/Footer'
import GeometricBackground from '../components/GeometricBackground'
import AppIcon from '../components/AppIcon'
import ReviewsSection from '../components/ReviewsSection'
import ArchitectureShowcase from '../components/ArchitectureShowcase'
import { getFavoriteTools } from '../utils/favorites'

/* ─────────────────────────────────────────────────── */
/*  ROTATING HEADLINE                                  */
/* ─────────────────────────────────────────────────── */
const HERO_ITEMS = [
  { full: 'All Tools You Need',           mLine1: 'All Tools',     mLine2: 'You Need' },
  { full: 'Fast. Simple. Powerful.',      mLine1: 'Fast. Simple.', mLine2: 'Powerful.' },
  { full: 'Everything In Your Browser.',  mLine1: 'Everything In', mLine2: 'Your Browser.' },
]

const RotatingText = memo(function RotatingText() {
  const [idx, setIdx] = useState(0)
  const [out, setOut] = useState(false)
  useEffect(() => {
    let timeoutId = null
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      setOut(true)
      timeoutId = setTimeout(() => { setIdx(i => (i + 1) % HERO_ITEMS.length); setOut(false) }, 380)
    }, 3200)
    return () => {
      clearInterval(id)
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [])
  const item = HERO_ITEMS[idx]
  return (
    <span className="hero-rotating-text" style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      maxWidth: '100%',
      background: 'linear-gradient(130deg, #2563EB 0%, #4F8EF7 22%, #9333EA 52%, #EC4899 82%, #F43F5E 100%)',
      WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
      filter: 'drop-shadow(0 4px 18px rgba(124, 58, 237, 0.22))',
      minHeight: '2.4em',
      opacity:    out ? 0.35 : 1,
      transform:  out ? 'translateY(-6px)' : 'translateY(0)',
      transition: 'opacity .32s ease, transform .32s ease',
    }}>
      <span className="hero-text-desktop">{item.full}</span>
      <span className="hero-text-mobile">
        <span className="hero-headline-line">{item.mLine1}</span>
        <span className="hero-headline-line">{item.mLine2}</span>
      </span>
    </span>
  )
})

/* ─────────────────────────────────────────────────── */
/*  RIPPLE BUTTON                                      */
/* ─────────────────────────────────────────────────── */
const RippleBtn = memo(function RippleBtn({ children, style = {}, onClick, onMouseEnter, onMouseLeave }) {
  const [rips, setRips] = useState([])
  const isMounted = useRef(true)
  const timersRef = useRef(new Set())
  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
      timersRef.current.forEach(t => clearTimeout(t))
      timersRef.current.clear()
    }
  }, [])
  const fire = e => {
    const r = e.currentTarget.getBoundingClientRect()
    const id = Date.now() + Math.random()
    setRips(p => [...p, { x: e.clientX - r.left, y: e.clientY - r.top, id }])
    const timer = setTimeout(() => {
      timersRef.current.delete(timer)
      if (isMounted.current) setRips(p => p.filter(x => x.id !== id))
    }, 700)
    timersRef.current.add(timer)
    onClick?.()
  }
  return (
    <button onClick={fire} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}
      style={{ position: 'relative', overflow: 'hidden', cursor: 'pointer',
        border: 'none', WebkitTapHighlightColor: 'transparent', ...style }}>
      {children}
      {rips.map(r => (
        <span key={r.id} style={{
          position: 'absolute', left: r.x - 50, top: r.y - 50, width: 100, height: 100,
          borderRadius: '50%', background: 'rgba(255,255,255,.22)',
          transform: 'scale3d(0, 0, 1)', opacity: 1, willChange: 'transform,opacity',
          backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden',
          animation: 'hrpl .65s cubic-bezier(.16,1,.3,1) forwards', pointerEvents: 'none',
        }}/>
      ))}
      <style>{`@keyframes hrpl{from{transform:scale3d(0,0,1);opacity:.4} to{transform:scale3d(3.2,3.2,1);opacity:0}}`}</style>
    </button>
  )
})

/* ─────────────────────────────────────────────────── */
/*  ORBIT CHIPS                                        */
/* ─────────────────────────────────────────────────── */
const CHIPS_OUTER = [
  { id:'password',    label:'Password',  color:'#E91E63' },
  { id:'gradient',    label:'Gradient',  color:'#4F8EF7' },
  { id:'wordcount',   label:'Analytics', color:'#9C6FDE' },
  { id:'currency',    label:'Currency',  color:'#FF9800' },
  { id:'imgresizer',  label:'Images',    color:'#26C6DA' },
  { id:'pdf',         label:'PDF',       color:'#FF5722' },
  { id:'bcrypt',      label:'BCrypt',    color:'#22c55e' },
  { id:'fileconvert', label:'Converter', color:'#7C3AED' },
  { id:'bgremove',    label:'BG Remove', color:'#F43F5E' },
]
const CHIPS_INNER = [
  { id:'websiteanalyzer',    label:'SEO Audit',   color:'#22c55e' },
  { id:'colorpicker',        label:'Colors',      color:'#E91E63' },
  { id:'vault',              label:'Vault',        color:'#9C6FDE' },
  { id:'videoscreenshot',    label:'Video Shots',  color:'#FF9800' },
  { id:'quote',              label:'Quotes',      color:'#4F8EF7' },
  { id:'videotranscriber',   label:'Transcribe',  color:'#FF5722' },
]

const MOBILE_HERO_TOOLS = [
  {
    id: 'images',
    label: 'Images',
    path: '/tools/imgresizer',
    color: '#06B6D4',
    gradient: 'linear-gradient(135deg, #06B6D4 0%, #3B82F6 100%)',
    shadow: '0 4px 14px rgba(6, 182, 212, 0.35)',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="3" ry="3"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <path d="m21 15-5-5L5 21"/>
      </svg>
    )
  },
  {
    id: 'pdf',
    label: 'PDFs',
    path: '/tools/pdf',
    color: '#FF5722',
    gradient: 'linear-gradient(135deg, #FF6B4A 0%, #F43F5E 100%)',
    shadow: '0 4px 14px rgba(244, 63, 94, 0.35)',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
    )
  },
  {
    id: 'ocr',
    label: 'OCR',
    path: '/tools/image-tools',
    color: '#8B5CF6',
    gradient: 'linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%)',
    shadow: '0 4px 14px rgba(139, 92, 246, 0.35)',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 4H4v3"/>
        <path d="M17 4h3v3"/>
        <path d="M7 20H4v-3"/>
        <path d="M17 20h3v-3"/>
        <line x1="9" y1="9" x2="15" y2="9"/>
        <line x1="12" y1="9" x2="12" y2="15"/>
      </svg>
    )
  },
  {
    id: 'convert',
    label: 'Convert',
    path: '/tools/fileconvert',
    color: '#A855F7',
    gradient: 'linear-gradient(135deg, #A855F7 0%, #EC4899 100%)',
    shadow: '0 4px 14px rgba(168, 85, 247, 0.35)',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m16 3 4 4-4 4"/>
        <path d="M20 7H4"/>
        <path d="m8 21-4-4 4-4"/>
        <path d="M4 17h16"/>
      </svg>
    )
  },
  {
    id: 'security',
    label: 'Security',
    path: '/tools/password',
    color: '#10B981',
    gradient: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
    shadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
    )
  },
]

function ChipPill({ chip, small }) {
  const t   = TOOLS.find(x => x.id === chip.id)
  const ico = small ? 22 : 34
  return (
    <Link to={t?.path || '/'} style={{ textDecoration: 'none', display: 'block' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: small ? 5 : 7,
        background: 'rgba(255,255,255,.84)',
        backdropFilter: 'blur(16px) saturate(180%)',
        WebkitBackdropFilter: 'blur(16px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.85)',
        borderRadius: 50,
        padding: small ? '5px 11px 5px 6px' : '9px 16px 9px 9px',
        boxShadow: `0 4px 16px ${chip.color}14, inset 0 1px 0 rgba(255,255,255,0.95)`,
        whiteSpace: 'nowrap', cursor: 'pointer',
        transform: 'translateZ(0)',
        willChange: 'transform, box-shadow',
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
        transition: 'transform .22s cubic-bezier(0.16, 1, 0.3, 1), box-shadow .22s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
        onMouseEnter={e => { e.currentTarget.style.transform='scale3d(1.08, 1.08, 1) translate3d(0, -2px, 0)'; e.currentTarget.style.boxShadow=`0 10px 28px ${chip.color}28, inset 0 1px 0 rgba(255,255,255,1)` }}
        onMouseLeave={e => { e.currentTarget.style.transform='scale3d(1, 1, 1) translate3d(0, 0, 0)'; e.currentTarget.style.boxShadow=`0 4px 16px ${chip.color}14, inset 0 1px 0 rgba(255,255,255,0.95)` }}>
        <span style={{ width:ico, height:ico, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          {t?.icon ? (
            <AppIcon src={t.icon} alt={chip.label} size={ico-2}/>
          ) : (
            <svg width={ico-6} height={ico-6} viewBox="0 0 24 24" fill="none" stroke={chip.color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
          )}
        </span>
        <span style={{ fontSize: small ? 11.5 : 13.5, fontWeight:700, color:'#1a1a2e', letterSpacing:'-.1px' }}>{chip.label}</span>
      </div>
    </Link>
  )
}

/* ─────────────────────────────────────────────────── */
/*  FLOATING BACKGROUND WORDS                          */
/* ─────────────────────────────────────────────────── */
const FLOAT_WORDS = [
  'Compress','Convert','Transcribe','Generate','Password',
  'Gradient','Color','PDF','Favicon','Resize',
  'Encrypt','Analyze','Extract','Design','Tools',
  'Privacy','Browser','Free','Secure','Creative',
  'Word Count','Text Case','Unit','Currency','BG Remove',
]

const FloatingWords = memo(function FloatingWords() {
  const words = useMemo(() => FLOAT_WORDS.map((word, i) => ({
    id: i, word,
    x:    2  + Math.random() * 92,
    y:    2  + Math.random() * 92,
    dur:  18 + Math.random() * 22,
    del: -(Math.random() * 18),
    size: 11 + Math.random() * 8,
    op:   0.04 + Math.random() * 0.06,
  })), [])

  return (
    <div style={{ position:'absolute', inset:0, overflow:'hidden',
      pointerEvents:'none', zIndex:0, contain:'strict' }}>
      <style>{`
        @keyframes fw-float {
          0%, 100% { transform: translate3d(0, 0, 0); }
          50%      { transform: translate3d(0, -16px, 0); }
        }
      `}</style>
      {words.map(w => (
        <div key={w.id} className="fw-word" style={{
          position:'absolute', left:`${w.x}%`, top:`${w.y}%`,
          fontSize:w.size, fontFamily:'Syne,sans-serif', fontWeight:700,
          color:'#4F8EF7', opacity:w.op, letterSpacing:'.5px',
          whiteSpace:'nowrap', userSelect:'none',
          transform: 'translate3d(0, 0, 0)',
          willChange: 'transform',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          animation:`fw-float ${w.dur}s ease-in-out infinite`,
          animationDelay:`${w.del}s`,
        }}>{w.word}</div>
      ))}
    </div>
  )
})

/* ─────────────────────────────────────────────────── */
/*  ANIMATED COUNTER                                   */
/* ─────────────────────────────────────────────────── */
const Counter = memo(function Counter({ target, label, icon }) {
  const ref    = useRef(null)
  const numRef = useRef(null)
  const inView = useInView(ref, { once: true, amount: 0.15 })

  useEffect(() => {
    if (!inView) return
    const num = parseInt(target.replace(/\D/g, '')) || 0
    if (!num) {
      if (numRef.current) numRef.current.textContent = target
      return
    }
    let startTimestamp = null
    let rafId = null
    const duration = 1200
    const suffix = target.includes('%') ? '%' : target.includes('ms') ? 'ms' : ''

    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp
      const elapsed = timestamp - startTimestamp
      const progress = Math.min(elapsed / duration, 1)
      const easeProgress = 1 - Math.pow(1 - progress, 3)
      const val = Math.round(easeProgress * num)
      if (numRef.current) {
        numRef.current.textContent = `${val}${suffix}`
      }
      if (progress < 1) {
        rafId = requestAnimationFrame(step)
      }
    }
    rafId = requestAnimationFrame(step)
    return () => {
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [inView, target])

  const initialVal = target.replace(/\d+/g, '0')
  return (
    <motion.div ref={ref} initial={{ opacity:0, y:18 }} whileInView={{ opacity:1, y:0 }} viewport={{ once:true, amount:0.12 }}
      style={{ textAlign:'center', padding:'24px 12px', willChange:'transform, opacity' }}>
      {icon && <div style={{ fontSize:28, marginBottom:8 }}>{icon}</div>}
      <div ref={numRef} style={{ fontFamily:'Syne,sans-serif', fontSize:'clamp(32px,5vw,54px)', fontWeight:800, lineHeight:1, marginBottom:7,
        background:'linear-gradient(135deg,#4F8EF7,#9C6FDE)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text',
        fontVariantNumeric:'tabular-nums' }}>
        {initialVal}
      </div>
      <div style={{ fontSize:13.5, color:'rgba(255,255,255,.72)', fontWeight:500 }}>{label}</div>
    </motion.div>
  )
})

/* ─────────────────────────────────────────────────── */
/*  SECTION HEADER                                     */
/* ─────────────────────────────────────────────────── */
function SectionHead({ tag, title, sub }) {
  // SEC-002 FIX: Render title safely as JSX instead of using dangerouslySetInnerHTML.
  // Titles only use <br/> for line breaks — split and render as safe React elements.
  const titleParts = typeof title === 'string' ? title.split(/<br\s*\/?>/gi) : [title]
  return (
    <div style={{ textAlign:'center', marginBottom:56 }}>
      <motion.span initial={{ opacity:0, y:10 }} whileInView={{ opacity:1, y:0 }} viewport={{ once:true, amount:0.12 }} transition={{ duration:.42, ease:[.22,1,.36,1] }}
        style={{ display:'inline-block', background:'rgba(79,142,247,.08)', color:'#4F8EF7', padding:'6px 20px', borderRadius:999, fontSize:12.5, fontWeight:700, marginBottom:16, border:'1px solid rgba(79,142,247,.20)', backdropFilter:'blur(12px) saturate(160%)', WebkitBackdropFilter:'blur(12px) saturate(160%)', boxShadow:'0 2px 8px rgba(79,142,247,.04), inset 0 1px 0 rgba(255,255,255,.9)', letterSpacing:'.4px' }}>
        {tag}
      </motion.span>
      <motion.h2 initial={{ opacity:0, y:18 }} whileInView={{ opacity:1, y:0 }} viewport={{ once:true, amount:0.12 }} transition={{ duration:.42, ease:[.22,1,.36,1] }}
        style={{ fontFamily:'Syne,sans-serif', fontSize:'clamp(21px,5.2vw,42px)', fontWeight:800, color:'#0d0d1a', marginBottom:10, lineHeight:1.15, wordBreak:'normal', overflowWrap:'break-word' }}>
        {titleParts.map((part, i) => (<span key={i}>{i > 0 && <br />}{part}</span>))}
      </motion.h2>
      <motion.p initial={{ opacity:0, y:8 }} whileInView={{ opacity:1, y:0 }} viewport={{ once:true, amount:0.12 }} transition={{ delay:.1, duration:.45 }}
        style={{ fontSize:'clamp(14.5px,2vw,16px)', color:'#475569', maxWidth:540, margin:'0 auto', fontWeight:400, lineHeight:1.75 }}>
        {sub}
      </motion.p>
    </div>
  )
}

/* ─────────────────────────────────────────────────── */
/*  FAQ ACCORDION                                      */
/* ─────────────────────────────────────────────────── */
const FAQS = [
  { q: 'Is ToolDesk really free?',                        a: 'Yes — 100% free, forever. Every single tool, every feature, no paywalls, no subscriptions, no hidden fees.' },
  { q: 'Do you store my files or data?',                a: 'Never. Processing happens client-side whenever possible using WebAssembly, Canvas, and Web Crypto. Proxied AI requests are zero-retention and never stored.' },
  { q: 'What browsers are supported?',                  a: 'All modern browsers — Chrome, Edge, Firefox, and Safari on desktop and mobile. WebAssembly and WebCrypto are leveraged for ultra-fast local processing.' },
  { q: 'Can I use ToolDesk on mobile?',                   a: 'Yes! Every tool is fully responsive and works on phones and tablets. The layout adjusts automatically for smaller screens.' },
  { q: 'How is the Password Generator secure?',         a: 'It uses window.crypto.getRandomValues() with mathematically uniform rejection sampling, eliminating modulo bias. Passwords are generated entirely on-device.' },
  { q: 'How does the Video Transcriber work?',          a: 'It extracts audio locally using WebAssembly (FFmpeg), then leverages Groq Whisper Large v3 to transcribe videos with millisecond timestamp accuracy.' },
  { q: 'How many tools does ToolDesk have?',              a: `Currently ${TOOLS.length} tools across categories: Password & Security, Image, Text, PDF, Video, Unit Converter, Color, and more. We add new tools regularly.` },
  { q: 'Can I suggest a new tool?',                     a: 'Absolutely! ToolDesk is built for its users. Every tool here was designed to solve a real problem fast.' },
]

function FAQ() {
  const [open, setOpen] = useState(null)
  const [copiedIdx, setCopiedIdx] = useState(null)
  const [query, setQuery] = useState('')

  const handleCopy = (e, text, idx) => {
    e.stopPropagation()
    navigator.clipboard?.writeText(text)
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 1800)
  }

  const filteredFaqs = query.trim()
    ? FAQS.filter(f => f.q.toLowerCase().includes(query.toLowerCase()) || f.a.toLowerCase().includes(query.toLowerCase()))
    : FAQS

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* FAQ Instant Search Filter */}
      <div style={{ position: 'relative', marginBottom: 4 }}>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Filter questions (e.g. free, private, mobile, password)..."
          style={{
            width: '100%',
            padding: '13px 40px 13px 44px',
            borderRadius: 999,
            border: '1.5px solid rgba(79, 142, 247, 0.22)',
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            fontFamily: 'DM Sans, sans-serif',
            fontSize: 14,
            color: '#0d0d1a',
            outline: 'none',
            boxSizing: 'border-box',
            boxShadow: '0 4px 14px rgba(79, 142, 247, 0.05), inset 0 1px 0 #ffffff',
            transition: 'border-color 0.2s, box-shadow 0.2s',
          }}
          onFocus={e => {
            e.currentTarget.style.borderColor = '#4F8EF7'
            e.currentTarget.style.boxShadow = '0 0 0 3px rgba(79, 142, 247, 0.16)'
          }}
          onBlur={e => {
            e.currentTarget.style.borderColor = 'rgba(79, 142, 247, 0.22)'
            e.currentTarget.style.boxShadow = '0 4px 14px rgba(79, 142, 247, 0.05)'
          }}
        />
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#94A3B8"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear filter"
            style={{
              position: 'absolute',
              right: 14,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#94A3B8',
              padding: 4,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {filteredFaqs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '36px 20px', color: '#64748b', fontSize: 14.5 }}>
          No questions found matching "{query}".
        </div>
      ) : (
        filteredFaqs.map((f, i) => {
          const isOpen = open === i
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.12 }}
              transition={{ delay: i * 0.04 }}
              style={{
                border: isOpen ? '1.5px solid rgba(79, 142, 247, 0.35)' : '1px solid rgba(0, 0, 0, 0.06)',
                borderRadius: 18,
                overflow: 'hidden',
                background: isOpen ? 'rgba(255, 255, 255, 0.98)' : 'rgba(255, 255, 255, 0.90)',
                backdropFilter: 'blur(16px) saturate(160%)',
                WebkitBackdropFilter: 'blur(16px) saturate(160%)',
                boxShadow: isOpen
                  ? '0 10px 28px rgba(79, 142, 247, 0.08), inset 0 1px 0 rgba(255, 255, 255, 1)'
                  : '0 2px 8px rgba(0, 0, 0, 0.02), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
                transition: 'border-color 0.22s, box-shadow 0.22s, background 0.22s',
              }}
            >
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                type="button"
                aria-expanded={isOpen}
                style={{
                  width: '100%',
                  padding: '18px 22px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 14,
                  fontFamily: 'DM Sans, sans-serif',
                  fontWeight: 700,
                  fontSize: 15.5,
                  color: '#0d0d1a',
                  textAlign: 'left',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(79,142,247,.03)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 7,
                      background: isOpen ? 'rgba(79,142,247,0.14)' : 'rgba(0,0,0,0.04)',
                      color: isOpen ? '#2563EB' : '#64748b',
                      fontSize: 11,
                      fontWeight: 800,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span>{f.q}</span>
                </div>

                <motion.span
                  animate={{ rotate: isOpen ? 45 : 0 }}
                  transition={{ type: 'spring', stiffness: 450, damping: 25 }}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: isOpen ? '#4F8EF7' : 'rgba(79,142,247,0.08)',
                    color: isOpen ? '#ffffff' : '#4F8EF7',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    transition: 'background 0.2s, color 0.2s',
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </motion.span>
              </button>

              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.26, ease: 'easeInOut' }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div
                      style={{
                        padding: '0 22px 18px 58px',
                        fontSize: 14.5,
                        color: '#475569',
                        lineHeight: 1.72,
                        fontWeight: 400,
                      }}
                    >
                      <div>{f.a}</div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(0,0,0,0.04)' }}>
                        <span style={{ fontSize: 11.5, color: '#94A3B8', fontWeight: 600 }}>100% Client-Side Fact</span>
                        <button
                          type="button"
                          onClick={(e) => handleCopy(e, f.a, i)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '4px 10px',
                            borderRadius: 999,
                            border: '1px solid rgba(79, 142, 247, 0.22)',
                            background: 'rgba(79, 142, 247, 0.06)',
                            color: '#2563EB',
                            fontSize: 11.5,
                            fontWeight: 700,
                            cursor: 'pointer',
                            outline: 'none',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {copiedIdx === i ? (
                            <>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                              <span style={{ color: '#16A34A' }}>Copied</span>
                            </>
                          ) : (
                            <>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                              </svg>
                              <span>Copy Answer</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )
        })
      )}
    </div>
  )
}


/* ─────────────────────────────────────────────────── */
/*  HOW IT WORKS STEPS                                 */
/* ─────────────────────────────────────────────────── */
const HOW_STEPS = [
  {
    n: '01',
    t: 'Choose a Tool',
    d: `Browse ${TOOLS.length}+ tools by category or search with Cmd+K. Every tool is one click away.`,
    color: '#4F8EF7',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4F8EF7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
        <circle cx="11" cy="11" r="3" fill="#4F8EF7" fillOpacity="0.25" />
      </svg>
    ),
  },
  {
    n: '02',
    t: 'Upload or Type',
    d: 'Drop a file, paste text, or just start typing. Most tools work instantly with zero configuration needed.',
    color: '#10B981',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
    ),
  },
  {
    n: '03',
    t: 'Customize Settings',
    d: 'Adjust quality, format, options, and parameters. Every tool has smart defaults so it works great out of the box.',
    color: '#9C6FDE',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9C6FDE" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="4" y1="21" x2="4" y2="14" />
        <line x1="4" y1="10" x2="4" y2="3" />
        <line x1="12" y1="21" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12" y2="3" />
        <line x1="20" y1="21" x2="20" y2="16" />
        <line x1="20" y1="12" x2="20" y2="3" />
        <line x1="1" y1="14" x2="7" y2="14" />
        <line x1="9" y1="8" x2="15" y2="8" />
        <line x1="17" y1="16" x2="23" y2="16" />
      </svg>
    ),
  },
  {
    n: '04',
    t: 'Download or Copy',
    d: 'Get your result instantly — download a file, copy text, or share your output. No waiting, no server.',
    color: '#06B6D4',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#06B6D4" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    ),
  },
]

/* ─────────────────────────────────────────────────── */
/*  WHY CARDS                                          */
/* ─────────────────────────────────────────────────── */
const WHY = [
  {
    t: '100% Private',
    badge: '0 KB Uploaded',
    d: 'Everything runs in your browser. Zero data leaves your device — ever.',
    color: '#10B981',
    bg: '#E8F5E9',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
  },
  {
    t: 'Instant Results',
    badge: '< 16ms Latency',
    d: 'No server round-trips. No loading spinners. Results appear in milliseconds.',
    color: '#F59E0B',
    bg: '#FFF8E1',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
  },
  {
    t: 'Works Everywhere',
    badge: 'Offline PWA',
    d: 'Any device, any browser, any OS. Open ToolDesk and start — nothing to install.',
    color: '#4F8EF7',
    bg: '#E8F4FD',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4F8EF7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
  },
  {
    t: 'Completely Free',
    badge: '$0 Forever',
    d: 'Every tool, every feature, forever. No paywalls, no accounts, no limits.',
    color: '#9C6FDE',
    bg: '#F3F0FF',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9C6FDE" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
  },
  {
    t: 'No Installation',
    badge: 'Zero Setup',
    d: 'No downloads, no extensions, no sign-ups. Open the page and go.',
    color: '#3B82F6',
    bg: '#EFF6FF',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="21 8 21 21 3 21 3 8" />
        <rect x="1" y="3" width="22" height="5" />
        <line x1="10" y1="12" x2="14" y2="12" />
      </svg>
    ),
  },
  {
    t: 'Professional Grade',
    badge: 'Strict Standards',
    d: 'Built to production standards — used by developers, designers and content creators.',
    color: '#EC4899',
    bg: '#FCE4EC',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#EC4899" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 3h12l4 6-10 13L2 9z" />
      </svg>
    ),
  },
  {
    t: 'Open & Transparent',
    badge: 'Zero Trackers',
    d: 'No trackers, no ads, no data collection. What you do in ToolDesk stays in ToolDesk.',
    color: '#06B6D4',
    bg: '#E0F7FA',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#06B6D4" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <polyline points="9 12 11 14 15 10" />
      </svg>
    ),
  },
  {
    t: 'Always Up to Date',
    badge: 'Continuous CI',
    d: 'New tools added regularly. Existing tools constantly improved based on user needs.',
    color: '#F97316',
    bg: '#FFF3E0',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m12 14 4-4" />
        <path d="M3.34 19a10 10 0 1 1 17.32 0" />
      </svg>
    ),
  },
]

/* ─────────────────────────────────────────────────── */
/*  TESTIMONIALS / USE CASES                           */
/* ─────────────────────────────────────────────────── */
const USE_CASES = [
  {
    role: 'Developer',
    use: 'Generate secure passwords, encode Base64, hash with BCrypt — all without leaving the browser.',
    color: '#4F8EF7',
    tag: 'Engineering',
    tools: [
      { name: 'BCrypt', path: '/tools/bcrypt' },
      { name: 'Password', path: '/tools/password' },
      { name: 'System Info', path: '/tools/system-info' },
    ],
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4F8EF7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
  },
  {
    role: 'Designer',
    use: 'Create gradients, pick colors, resize images, remove backgrounds for your next project.',
    color: '#EC4899',
    tag: 'Visual & UI',
    tools: [
      { name: 'Color Picker', path: '/tools/colorpicker' },
      { name: 'Gradients', path: '/tools/gradient' },
      { name: 'BG Remove', path: '/tools/bgremove' },
    ],
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#EC4899" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="13.5" cy="6.5" r=".5" fill="#EC4899" />
        <circle cx="17.5" cy="10.5" r=".5" fill="#EC4899" />
        <circle cx="8.5" cy="7.5" r=".5" fill="#EC4899" />
        <circle cx="6.5" cy="12.5" r=".5" fill="#EC4899" />
        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
      </svg>
    ),
  },
  {
    role: 'Content Creator',
    use: 'Count words, check readability, convert text case, transcribe video to subtitles.',
    color: '#8B5CF6',
    tag: 'Writing & Media',
    tools: [
      { name: 'Word Count', path: '/tools/wordcount' },
      { name: 'Text Case', path: '/tools/textcase' },
      { name: 'Transcribe', path: '/tools/video-transcriber' },
    ],
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
      </svg>
    ),
  },
  {
    role: 'Video Creator',
    use: 'Extract stills from footage, generate subtitles, and export SRT files in seconds.',
    color: '#F97316',
    tag: 'Video Production',
    tools: [
      { name: 'Video Shots', path: '/tools/video-screenshot' },
      { name: 'Transcriber', path: '/tools/video-transcriber' },
      { name: 'Thumbnail', path: '/tools/thumbnail' },
    ],
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
        <line x1="7" y1="2" x2="7" y2="22" />
        <line x1="17" y1="2" x2="17" y2="22" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <line x1="2" y1="7" x2="7" y2="7" />
        <line x1="2" y1="17" x2="7" y2="17" />
        <line x1="17" y1="17" x2="22" y2="17" />
        <line x1="17" y1="7" x2="22" y2="7" />
      </svg>
    ),
  },
  {
    role: 'Data Analyst',
    use: 'Convert units, calculate file sizes, convert CSV to JSON — fast and accurate.',
    color: '#10B981',
    tag: 'Analytics & Math',
    tools: [
      { name: 'Units', path: '/tools/units' },
      { name: 'File Convert', path: '/tools/fileconvert' },
      { name: 'Aspect Ratio', path: '/tools/aspectratio' },
    ],
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    role: 'Student',
    use: 'Check essay word count, readability score, clean up text and export notes.',
    color: '#06B6D4',
    tag: 'Academic & Research',
    tools: [
      { name: 'Word Count', path: '/tools/wordcount' },
      { name: 'PDF Studio', path: '/tools/pdf' },
      { name: 'Translator', path: '/tools/translator' },
    ],
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#06B6D4" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
        <path d="M6 12v5c3 3 9 3 12 0v-5" />
      </svg>
    ),
  },
]

/* ─────────────────────────────────────────────────── */
/*  CATEGORY MICRO-ICONS (BESPOKE VECTOR SVGS)         */
/* ─────────────────────────────────────────────────── */
const CAT_ICONS = {
  All: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  Favorites: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="#F59E0B" stroke="#D97706" strokeWidth="1">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  ),
  Security: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  Text: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  ),
  Math: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="5" x2="5" y2="19" />
      <circle cx="6.5" cy="6.5" r="1.5" fill="currentColor" />
      <circle cx="17.5" cy="17.5" r="1.5" fill="currentColor" />
    </svg>
  ),
  Finance: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M14.8 9A2 2 0 0 0 13 8h-2a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4h-2a2 2 0 0 1-1.8-1" />
      <line x1="12" y1="6" x2="12" y2="18" />
    </svg>
  ),
  Design: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
    </svg>
  ),
  Inspire: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  Social: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  ),
  Image: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  ),
  Document: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  Utility: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  ),
  Vault: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
  Generate: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  ),
  Dev: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  ),
  Video: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  ),
  SEO: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
}

/* ─────────────────────────────────────────────────── */
/*  HOME PAGE                                          */
/* ─────────────────────────────────────────────────── */


export default function Home() {
  const navigate   = useNavigate()
  const toolsRef   = useRef(null)
  const scroll     = useCallback(() => toolsRef.current?.scrollIntoView({ behavior:'smooth', block:'start' }), [])
  const TOOL_COUNT = TOOLS.length
  // mountKey forces Framer Motion to re-run all animations on every page load/refresh
  const [mountKey] = useState(() => Date.now())
  const [filterCat, setFilterCat] = useState('All')
  const [favoriteList, setFavoriteList] = useState(() => getFavoriteTools())
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsStandalone(
        window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true ||
        (typeof document !== 'undefined' && document.referrer.includes('android-app://'))
      )
    }
  }, [])

  useEffect(() => {
    const onFavChanged = (e) => setFavoriteList(e.detail || getFavoriteTools())
    window.addEventListener('tooldesk-favorites-changed', onFavChanged)
    return () => window.removeEventListener('tooldesk-favorites-changed', onFavChanged)
  }, [])

  const categories = useMemo(() => {
    const set = new Set(TOOLS.map(t => t.cat))
    return ['All', ...(favoriteList.length > 0 ? ['Favorites'] : []), ...Array.from(set)]
  }, [favoriteList.length])

  const filteredTools = useMemo(() => {
    if (filterCat === 'Favorites') return TOOLS.filter(t => favoriteList.includes(t.id))
    if (filterCat !== 'All') return TOOLS.filter(t => t.cat === filterCat)
    return TOOLS
  }, [filterCat, favoriteList])

  return (
    <div key={mountKey} style={{ background:'#fff', fontFamily:'DM Sans,sans-serif', overflowX:'hidden' }}>

      {/* ════════════════════════════════════════════ */}
      {/* HERO                                         */}
      {/* ════════════════════════════════════════════ */}
      <section className="hero-section" style={{
        minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
        position:'relative', overflow:'hidden',
        padding:'100px 24px 80px',
        background:'linear-gradient(160deg,#edf1ff 0%,#e8e3ff 40%,#eedff8 70%,#fce4f0 100%)',
        textAlign:'center',
      }}>
        <GeometricBackground variant="hero" opacity={1}/>
        <FloatingWords/>

        {/* Mobile ambient glow aura */}
        <div className="mobile-hero-glow" style={{ display:'none' }}/>

        {/* Dual orbit — strictly desktop */}
        <div className="orbit-shell desktop-only-orbit" style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', zIndex:2, pointerEvents:'none', perspective:1000 }}>
          <div className="desktop-only-orbit-ring" style={{ position:'absolute', width:760, height:760, borderRadius:'50%', border:'1.5px dashed rgba(79,142,247,.12)', pointerEvents:'none' }}/>
          <div className="desktop-only-orbit-ring" style={{ position:'absolute', width:520, height:520, borderRadius:'50%', border:'1.5px dashed rgba(156,111,222,.14)', pointerEvents:'none' }}/>

          <div style={{ position:'absolute', width:760, height:760, borderRadius:'50%', animation:'orbit-cw 38s linear infinite', pointerEvents:'none', willChange:'transform' }}>
            {CHIPS_OUTER.map((chip,i) => {
              const deg = (i/CHIPS_OUTER.length)*360
              return (
                <div key={chip.id} style={{ position:'absolute', top:'50%', left:'50%', transform:`rotate(${deg}deg) translateX(380px) translateY(-50%)`, transformOrigin:'0 0', pointerEvents:'auto' }}>
                  <div style={{ animation:'orbit-ccw 38s linear infinite', willChange:'transform' }}>
                    <ChipPill chip={chip} small={false}/>
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ position:'absolute', width:520, height:520, borderRadius:'50%', animation:'orbit-ccw 28s linear infinite', pointerEvents:'none', willChange:'transform' }}>
            {CHIPS_INNER.map((chip,i) => {
              const deg = (i/CHIPS_INNER.length)*360
              return (
                <div key={chip.id} style={{ position:'absolute', top:'50%', left:'50%', transform:`rotate(${deg}deg) translateX(260px) translateY(-50%)`, transformOrigin:'0 0', pointerEvents:'auto' }}>
                  <div style={{ animation:'orbit-cw 28s linear infinite', willChange:'transform' }}>
                    <ChipPill chip={chip} small={true}/>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Central content */}
        <div className="hero-content-wrap" style={{ maxWidth:400, width:'100%', position:'relative', zIndex:3, display:'flex', flexDirection:'column', alignItems:'center', boxSizing:'border-box', padding:'0 8px' }}>
          <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ duration:.45, delay:.02, ease:[.22,1,.36,1] }}
            className="hero-eyebrow"
            style={{ display:'inline-flex', alignItems:'center', gap:7, padding:'6px 14px', borderRadius:999,
              background:'rgba(255,255,255,.88)', border:'1.5px solid rgba(79,142,247,.22)',
              boxShadow:'0 4px 16px rgba(79,142,247,.08), inset 0 1px 0 rgba(255,255,255,.98)', marginBottom:14,
              backdropFilter:'blur(16px) saturate(180%)', WebkitBackdropFilter:'blur(16px) saturate(180%)' }}>
            <span className="hero-badge-dot" style={{ width:7, height:7, borderRadius:'50%', background:'#22C55E',
              boxShadow:'0 0 10px #22C55E', animation:'sjpulse 1.8s ease-in-out infinite', flexShrink:0 }}/>
            <span className="hero-eyebrow-text" style={{ fontSize:12.5, fontWeight:700, color:'#1e293b', letterSpacing:'.2px', whiteSpace:'nowrap' }}>
              <span className="eyebrow-desktop">{TOOL_COUNT} Tools • 100% In-Browser • Zero Server Uploads</span>
              <span className="eyebrow-mobile">{TOOL_COUNT} Tools • 100% In-Browser • Zero Uploads</span>
            </span>
          </motion.div>

          <motion.h1 initial={{ opacity:0, y:24 }} animate={{ opacity:1, y:0 }} transition={{ duration:.6, delay:.13, ease:[.22,1,.36,1] }}
            className="hero-h1"
            style={{ fontFamily:'Syne,sans-serif', fontSize:'clamp(24px, 3.5vw, 40px)', fontWeight:800, lineHeight:1.15, letterSpacing:'-0.5px', color:'#0d0d1a', marginBottom:14,
              textAlign:'center', maxWidth:'100%', width:'100%', boxSizing:'border-box', overflowWrap:'break-word', wordBreak:'normal', hyphens:'none', whiteSpace:'normal' }}>
            <RotatingText/>
          </motion.h1>

          <motion.p initial={{ opacity:0, y:14 }} animate={{ opacity:1, y:0 }} transition={{ duration:.54, delay:.25 }}
            className="hero-sub"
            style={{ fontSize:'clamp(14px,1.35vw,15.5px)', color:'#475569', lineHeight:1.62, fontWeight:400, maxWidth:370, width:'100%', boxSizing:'border-box', margin:'0 auto 18px', padding:'0 4px', textWrap:'balance' }}>
            {TOOL_COUNT} powerful browser tools —{' '}
            <span style={{ fontWeight:600, color:'#2563EB' }}>no installs, no accounts, no limits.</span>
            <br/>
            <span className="hero-sub-secondary" style={{ fontSize:'clamp(12.5px,1.15vw,13.5px)', color:'#64748b', fontWeight:400, display:'inline-block', marginTop:5 }}>
              Privacy-first tools trusted by developers, designers &amp; creators worldwide.
            </span>
          </motion.p>

          <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ duration:.5, delay:.35 }}
            style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap', marginBottom:0, alignItems:'center' }}>
            <RippleBtn onClick={scroll}
              className="hero-cta-btn"
              style={{ background:'#0d0d1a', color:'#fff', padding:'12px 28px', borderRadius:999, fontFamily:'DM Sans,sans-serif', fontWeight:700, fontSize:14.5, border:'1px solid rgba(255,255,255,0.14)', boxShadow:'0 8px 24px rgba(13,13,26,.22), inset 0 1px 0 rgba(255,255,255,.2)', maxWidth:'calc(100vw - 48px)', width:'fit-content', transition:'transform .2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow .2s cubic-bezier(0.16, 1, 0.3, 1)', willChange:'transform', display:'inline-flex', alignItems:'center', gap:8 }}
              onMouseEnter={e=>{ e.currentTarget.style.transform='translate3d(0, -2.5px, 0)'; e.currentTarget.style.boxShadow='0 14px 36px rgba(13,13,26,.32)' }}
              onMouseLeave={e=>{ e.currentTarget.style.transform='translate3d(0, 0, 0)'; e.currentTarget.style.boxShadow='0 8px 24px rgba(13,13,26,.22)' }}>
              <span>Explore All {TOOL_COUNT} Tools</span>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="cta-arrow" style={{ transition:'transform .22s cubic-bezier(0.16, 1, 0.3, 1)' }}>
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </RippleBtn>

            {!isStandalone && (
              <RippleBtn onClick={() => window.dispatchEvent(new CustomEvent('tooldesk-open-download'))}
                className="hero-download-btn"
                style={{ background:'rgba(255,255,255,0.85)', color:'#0d0d1a', padding:'12px 24px', borderRadius:999, fontFamily:'DM Sans,sans-serif', fontWeight:700, fontSize:14.5, border:'1.5px solid rgba(79,142,247,0.3)', backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)', boxShadow:'0 4px 16px rgba(79,142,247,0.12), inset 0 1px 0 #fff', maxWidth:'calc(100vw - 48px)', width:'fit-content', transition:'all .2s cubic-bezier(0.16, 1, 0.3, 1)', display:'inline-flex', alignItems:'center', gap:8, willChange:'transform' }}
                onMouseEnter={e=>{ e.currentTarget.style.transform='translate3d(0, -2.5px, 0)'; e.currentTarget.style.borderColor='#4F8EF7'; e.currentTarget.style.boxShadow='0 10px 28px rgba(79,142,247,.25)' }}
                onMouseLeave={e=>{ e.currentTarget.style.transform='translate3d(0, 0, 0)'; e.currentTarget.style.borderColor='rgba(79,142,247,0.3)'; e.currentTarget.style.boxShadow='0 4px 16px rgba(79,142,247,0.12)' }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>Download App</span>
              </RippleBtn>
            )}
          </motion.div>

          {/* Mobile Category Cards — Unique, Luminous Glass Capsules */}
          <div className="mobile-hero-cards" style={{ display:'none' }}>
            <div className="mobile-cards-row">
              {MOBILE_HERO_TOOLS.slice(0, 3).map((tool) => (
                <div key={tool.id} className="mobile-card-pill">
                  <Link
                    to={tool.path}
                    onClick={(e) => {
                      e.preventDefault()
                      navigate(tool.path)
                    }}
                    className="mobile-card-link"
                    style={{ '--glow-col': `${tool.color || '#4F8EF7'}26` }}
                  >
                    <span className="mobile-card-badge" style={{ background: tool.gradient, boxShadow: tool.shadow }}>
                      {tool.icon}
                    </span>
                    <span className="mobile-card-name">{tool.label}</span>
                  </Link>
                </div>
              ))}
            </div>
            <div className="mobile-cards-row">
              {MOBILE_HERO_TOOLS.slice(3, 5).map((tool) => (
                <div key={tool.id} className="mobile-card-pill">
                  <Link
                    to={tool.path}
                    onClick={(e) => {
                      e.preventDefault()
                      navigate(tool.path)
                    }}
                    className="mobile-card-link"
                    style={{ '--glow-col': `${tool.color || '#4F8EF7'}26` }}
                  >
                    <span className="mobile-card-badge" style={{ background: tool.gradient, boxShadow: tool.shadow }}>
                      {tool.icon}
                    </span>
                    <span className="mobile-card-name">{tool.label}</span>
                  </Link>
                </div>
              ))}
            </div>
          </div>

          {/* Mobile Scroll Indicator — in-flow natural rhythm, never collides */}
          <motion.div
            initial={{ opacity:0, y:6 }}
            animate={{ opacity:1, y:0 }}
            transition={{ delay:0.65, duration:0.5, ease:[.22, 1, .36, 1] }}
            onClick={scroll}
            className="mobile-hero-scroll"
            style={{
              display:'none', flexDirection:'column', alignItems:'center', gap:4,
              cursor:'pointer', marginTop:14, WebkitTapHighlightColor:'transparent',
            }}
          >
            <span style={{ fontSize:11, color:'#64748b', letterSpacing:'2px', textTransform:'uppercase', fontWeight:700 }}>Scroll</span>
            <div style={{ animation:'scrollBounce 1.8s ease-in-out infinite' }}>
              <div style={{ width:18, height:26, border:'1.5px solid rgba(79,142,247,.3)', borderRadius:9, display:'flex', alignItems:'flex-start', justifyContent:'center', paddingTop:3, background:'rgba(255,255,255,0.7)', backdropFilter:'blur(8px)', WebkitBackdropFilter:'blur(8px)', boxShadow:'0 2px 6px rgba(0,0,0,0.03)' }}>
                <div style={{ width:2.5, height:6, background:'#4F8EF7', borderRadius:2 }}/>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Desktop Scroll Indicator — preserved exactly as before for desktop */}
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:2.2 }} onClick={scroll}
          className="hero-scroll-indicator desktop-scroll"
          style={{ position:'absolute', bottom:22, left:'50%', transform:'translateX(-50%)', display:'flex', flexDirection:'column', alignItems:'center', gap:6, cursor:'pointer', zIndex:5 }}>
          <span style={{ fontSize:11.5, color:'#64748b', letterSpacing:'2.5px', textTransform:'uppercase', fontWeight:700 }}>Scroll</span>
          <div style={{ animation:'scrollBounce 1.6s ease-in-out infinite' }}>
            <div style={{ width:20, height:30, border:'1.5px solid rgba(79,142,247,.25)', borderRadius:10, display:'flex', alignItems:'flex-start', justifyContent:'center', paddingTop:4, background:'rgba(255,255,255,0.65)', backdropFilter:'blur(10px)', WebkitBackdropFilter:'blur(10px)', boxShadow:'inset 0 1px 0 rgba(255,255,255,0.9), 0 2px 8px rgba(0,0,0,0.03)' }}>
              <div style={{ width:3, height:7, background:'rgba(79,142,247,.55)', borderRadius:2 }}/>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ════════════════════════════════════════════ */}
      {/* ALL TOOLS GRID                               */}
      {/* ════════════════════════════════════════════ */}
      <section id="tools" ref={toolsRef} className="home-section-deferred" style={{ background:'#F8F9FC', padding:'88px 0', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', inset:0, backgroundImage:'radial-gradient(circle,rgba(79,142,247,.038) 1px,transparent 1px)', backgroundSize:'38px 38px', pointerEvents:'none' }}/>
        <div style={{ maxWidth:1200, margin:'0 auto', padding:'0 20px', position:'relative' }}>
          <SectionHead tag="All Tools" title="Everything You Need,<br/>Right in Your Browser" sub={`${TOOL_COUNT} tools — no installs, no accounts, no uploads, no limits.`}/>
          
          {/* Category & Favorites Filter Pills */}
          <div
            className="category-pills-bar"
            style={{
              display: 'flex',
              gap: 8,
              overflowX: 'auto',
              paddingTop: 2,
              paddingBottom: 6,
              marginBottom: 24,
              justifyContent: 'flex-start',
              alignItems: 'center',
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none'
            }}
          >
            {categories.map(cat => {
              const count = cat === 'All' ? TOOLS.length : cat === 'Favorites' ? favoriteList.length : TOOLS.filter(t => t.cat === cat).length
              const isActive = filterCat === cat
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setFilterCat(cat)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    padding: '8px 16px',
                    minHeight: 38,
                    borderRadius: 999,
                    border: isActive ? '1px solid #3b82f6' : '1px solid rgba(0,0,0,0.08)',
                    background: isActive ? '#3b82f6' : '#ffffff',
                    color: isActive ? '#ffffff' : '#334155',
                    fontFamily: 'DM Sans, sans-serif',
                    fontSize: 13.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    boxShadow: isActive ? '0 4px 14px rgba(59,130,246,0.28)' : '0 1px 3px rgba(0,0,0,0.03)',
                    transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                  }}
                  onMouseEnter={e => {
                    if (!isActive) {
                      e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.35)'
                      e.currentTarget.style.transform = 'translateY(-1px)'
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)'
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isActive) {
                      e.currentTarget.style.borderColor = 'rgba(0,0,0,0.08)'
                      e.currentTarget.style.transform = 'translateY(0)'
                      e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.03)'
                    }
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {CAT_ICONS[cat] && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', opacity: isActive ? 1 : 0.8 }}>
                        {CAT_ICONS[cat]}
                      </span>
                    )}
                    <span>{cat === 'Favorites' ? 'Starred' : cat}</span>
                  </span>
                  <span style={{
                    fontSize: 12,
                    fontWeight: 700,
                    padding: '2px 7.5px',
                    borderRadius: 999,
                    background: isActive ? 'rgba(255,255,255,0.26)' : '#f1f5f9',
                    color: isActive ? '#ffffff' : '#64748b',
                    transition: 'background 0.18s, color 0.18s',
                  }}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          {filteredTools.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', background: '#ffffff', borderRadius: 16, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block' }}>
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </div>
              <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 16, fontWeight: 700, color: '#1e293b' }}>
                No Starred Tools Yet
              </div>
              <div style={{ fontSize: 13, color: '#64748b', marginTop: 4, maxWidth: 360, margin: '4px auto 16px' }}>
                Click the favorite button on any tool to add it here for quick 1-click access.
              </div>
              <button
                type="button"
                onClick={() => setFilterCat('All')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 16px',
                  borderRadius: 999,
                  background: '#4F8EF7',
                  color: '#fff',
                  border: 'none',
                  fontFamily: 'DM Sans, sans-serif',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer'
                }}
              >
                <span>Browse All Tools</span>
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(255px, 1fr))', gap: 16 }}>
              {filteredTools.map((t, i) => (
                <ToolCard key={t.id} tool={t} index={i} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ════════════════════════════════════════════ */}
      {/* HOW IT WORKS                                 */}
      {/* ════════════════════════════════════════════ */}
      <section className="home-section-deferred" style={{ background:'#fff', padding:'88px 0' }}>
        <div style={{ maxWidth:1200, margin:'0 auto', padding:'0 20px' }}>
          <SectionHead tag="How It Works" title="Four Steps to Any Result" sub="ToolDesk is designed to get you from zero to done in under 30 seconds."/>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:24, position:'relative' }}>
            {HOW_STEPS.map((s,i) => (
              <motion.div key={s.n}
                initial={{ opacity:0, y:28 }} whileInView={{ opacity:1, y:0 }} viewport={{ once:true, amount:0.02 }}
                transition={{ duration:.5, delay:i*.1, ease:[.22,1,.36,1] }}
                whileHover={{ y:-6, boxShadow:'0 20px 48px rgba(79,142,247,.14)' }}
                whileTap={{ y:2, scale:0.98 }}
                style={{
                  borderRadius:22, border:'1px solid rgba(255,255,255,.85)',
                  background:'rgba(250, 251, 255, 0.88)',
                  backdropFilter:'blur(14px) saturate(160%)',
                  WebkitBackdropFilter:'blur(14px) saturate(160%)',
                  boxShadow:'0 4px 20px rgba(79,142,247,.05), inset 0 1px 0 rgba(255,255,255,.95)',
                  padding:'30px 24px', cursor:'default', transition:'box-shadow .3s', textAlign:'center',
                  position: 'relative', overflow: 'hidden'
                }}>
                {/* Luminous Top Accent Stripe */}
                <div style={{ position:'absolute', top:0, left:'15%', right:'15%', height:2.5, background:`linear-gradient(90deg, transparent, ${s.color}, transparent)`, borderRadius:999 }} />
                <div style={{ fontFamily:'Syne,sans-serif', fontSize:12.5, fontWeight:800, color:s.color, letterSpacing:'2px', textTransform:'uppercase', marginBottom:14 }}>{s.n}</div>
                <div style={{
                  width: 58, height: 58, borderRadius: 18,
                  background: `linear-gradient(135deg, ${s.color}15, ${s.color}06)`,
                  border: `1px solid ${s.color}25`,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: `0 8px 24px -4px ${s.color}28, inset 0 1px 0 rgba(255,255,255,0.9)`,
                  marginBottom: 16,
                }}>
                  {s.icon}
                </div>
                <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:17, color:'#0d0d1a', marginBottom:10 }}>{s.t}</div>
                <p style={{ fontSize:'clamp(14px,1.1vw,14.5px)', color:'#475569', lineHeight:1.68, fontWeight:400, margin:0 }}>{s.d}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════ */}
      {/* WHO USES TOOLDESK / ABOUT                    */}
      {/* ════════════════════════════════════════════ */}
      <section id="about" className="home-section-deferred" style={{ background:'#F8F9FC', padding:'88px 0' }}>
        <div style={{ maxWidth:1200, margin:'0 auto', padding:'0 20px' }}>
          <SectionHead tag="Who Uses ToolDesk" title="Built for Every Kind<br/>of Creator" sub="Whether you code, design, write or create — there's a tool here for you."/>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:20 }}>
            {USE_CASES.map((u,i) => (
              <motion.div key={u.role}
                initial={{ opacity:0, y:24 }} whileInView={{ opacity:1, y:0 }} viewport={{ once:true, amount:0.02 }}
                transition={{ duration:.38, delay:i*.07 }}
                whileHover={{ y:-5, boxShadow:'0 16px 40px rgba(0,0,0,.1)' }}
                whileTap={{ y:2, scale:0.98 }}
                style={{
                  background:'rgba(255, 255, 255, 0.90)',
                  backdropFilter:'blur(14px) saturate(160%)',
                  WebkitBackdropFilter:'blur(14px) saturate(160%)',
                  borderRadius:20, border:'1px solid rgba(255, 255, 255, 0.85)',
                  boxShadow:'0 4px 20px rgba(0,0,0,.03), inset 0 1px 0 rgba(255,255,255,.95)',
                  padding:'26px 24px', cursor:'default', transition:'box-shadow .3s',
                  position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
                }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div style={{
                      width: 50, height: 50, borderRadius: 16,
                      background: `linear-gradient(135deg, ${u.color}15, ${u.color}06)`,
                      border: `1px solid ${u.color}25`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: `0 8px 20px -4px ${u.color}25, inset 0 1px 0 rgba(255,255,255,0.9)`,
                    }}>
                      {u.icon}
                    </div>
                    <span style={{
                      fontSize: 11.5, fontWeight: 700, color: u.color,
                      background: `${u.color}10`, border: `1px solid ${u.color}22`,
                      padding: '3px 10px', borderRadius: 999, letterSpacing: '.2px'
                    }}>
                      {u.tag}
                    </span>
                  </div>
                  <div style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:17, color:'#0d0d1a', marginBottom:8 }}>{u.role}</div>
                  <p style={{ fontSize:'clamp(14px,1.1vw,14.5px)', color:'#475569', lineHeight:1.68, fontWeight:400, margin:'0 0 18px 0' }}>{u.use}</p>
                </div>

                {/* Micro-Tool Pills */}
                {u.tools && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingTop: 14, borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                    {u.tools.map(t => (
                      <Link key={t.name} to={t.path} style={{ textDecoration: 'none' }}>
                        <span style={{
                          fontSize: 11.5, fontWeight: 700, color: '#334155',
                          background: 'rgba(241, 245, 249, 0.85)', border: '1px solid rgba(226, 232, 240, 0.8)',
                          padding: '3px 9px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 4,
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = `${u.color}15`; e.currentTarget.style.color = u.color; e.currentTarget.style.borderColor = `${u.color}35` }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(241, 245, 249, 0.85)'; e.currentTarget.style.color = '#334155'; e.currentTarget.style.borderColor = 'rgba(226, 232, 240, 0.8)' }}>
                          <span>{t.name}</span>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="5" y1="12" x2="19" y2="12" />
                            <polyline points="12 5 19 12 12 19" />
                          </svg>
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════ */}
      {/* WHY TOOLDESK                                 */}
      {/* ════════════════════════════════════════════ */}
      <section id="why" className="home-section-deferred" style={{ padding:'88px 0', background:'#fff', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', inset:0, backgroundImage:'radial-gradient(circle,rgba(79,142,247,.04) 1px,transparent 1px)', backgroundSize:'40px 40px', pointerEvents:'none' }}/>
        <div style={{ maxWidth:1200, margin:'0 auto', padding:'0 20px', position:'relative' }}>
          <SectionHead tag="Why ToolDesk" title="Built Different. Works Better." sub="Every decision made to make your workflow faster, simpler and more private."/>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(255px,1fr))', gap:16 }}>
            {WHY.map((f,i) => (
              <motion.div key={f.t}
                initial={{ opacity:0, y:18 }} whileInView={{ opacity:1, y:0 }} viewport={{ once:true, amount:0.02 }}
                transition={{ duration:.5, delay:i*.06, ease:[.22,1,.36,1] }}
                whileHover={{ y:-8, boxShadow:'0 20px 48px rgba(0,0,0,.12)' }}
                whileTap={{ y:2, scale:0.98 }}
                style={{
                  background: (i === 0 || i === 5) ? 'rgba(255, 255, 255, 0.84)' : 'rgba(250, 250, 252, 0.92)',
                  backdropFilter: 'blur(16px) saturate(160%)',
                  WebkitBackdropFilter: 'blur(16px) saturate(160%)',
                  border: '1px solid rgba(255, 255, 255, 0.88)',
                  borderRadius: 22, padding: 26, cursor: 'default', position: 'relative', overflow: 'hidden',
                  boxShadow: '0 4px 20px rgba(0,0,0,.03), inset 0 1px 0 rgba(255,255,255,.95)',
                  transition: 'background .22s, box-shadow .3s'
                }}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,.98)'}
                onMouseLeave={e=>e.currentTarget.style.background=(i === 0 || i === 5) ? 'rgba(255, 255, 255, 0.84)' : 'rgba(250, 250, 252, 0.92)'}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <motion.div
                    whileHover={{ rotate:[-6, 6, -3, 0], scale:1.12 }}
                    transition={{ type:'spring', stiffness:480, damping:24 }}
                    style={{
                      width: 48, height: 48, borderRadius: 16,
                      background: `linear-gradient(135deg, ${f.color}15, ${f.color}05)`,
                      border: `1px solid ${f.color}25`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: `0 8px 20px -4px ${f.color}22, inset 0 1px 0 rgba(255,255,255,0.9)`,
                    }}>
                    {f.icon}
                  </motion.div>
                  {f.badge && (
                    <span style={{
                      fontSize: 11, fontWeight: 800, color: f.color,
                      background: `${f.color}10`, border: `1px solid ${f.color}25`,
                      padding: '3px 9px', borderRadius: 999, letterSpacing: '.3px', textTransform: 'uppercase'
                    }}>
                      {f.badge}
                    </span>
                  )}
                </div>
                <div style={{ fontFamily:'Syne,sans-serif', fontSize:17, fontWeight:700, color:'#0d0d1a', marginBottom:8 }}>{f.t}</div>
                <p style={{ fontSize:14.5, color:'#475569', lineHeight:1.65, fontWeight:400, margin:0 }}>{f.d}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

{/* ════════════════════════════════════════════ */}
      {/* ZERO-TRUST PLATFORM ARCHITECTURE & SANDBOX   */}
      {/* ════════════════════════════════════════════ */}
      <ArchitectureShowcase />

      {/* ════════════ STATS ════════════ */}
      <section id="home-stats-section" className="home-section-deferred" style={{ padding:'0 20px 64px', overflow:'hidden' }}>
        <div style={{ maxWidth:1100, margin:'0 auto' }}>

          {/* Top label */}
          <motion.div initial={{ opacity:0, y:10 }} whileInView={{ opacity:1, y:0 }}
            viewport={{ once:true, amount:0.12 }} transition={{ duration:.4 }}
            style={{ textAlign:'center', marginBottom:20 }}>
            <span style={{ display:'inline-flex', alignItems:'center', gap:7,
              background:'rgba(79,142,247,.07)', border:'1px solid rgba(79,142,247,.18)',
              padding:'5px 16px', borderRadius:999 }}>
              <span style={{ width:6, height:6, borderRadius:'50%', background:'#4F8EF7',
                boxShadow:'0 0 8px #4F8EF7', display:'inline-block',
                animation:'sjpulse 1.6s ease-in-out infinite' }}/>
              <span style={{ fontSize:12, fontWeight:700, color:'#4F8EF7',
                letterSpacing:'.9px', textTransform:'uppercase' }}>Live Stats</span>
            </span>
          </motion.div>

          {/* Headline */}
          <motion.div initial={{ opacity:0, y:18 }} whileInView={{ opacity:1, y:0 }}
            viewport={{ once:true, amount:0.12 }} transition={{ duration:.5, delay:.06 }}
            style={{ textAlign:'center', marginBottom:52 }}>
            <h2 style={{ fontFamily:'Syne,sans-serif',
              fontSize:'clamp(32px,5vw,52px)', fontWeight:900,
              color:'#0d0d1a', lineHeight:1.05, letterSpacing:'-2px', margin:0 }}>
              Numbers That{' '}
              <span style={{ position:'relative', display:'inline-block' }}>
                <span style={{ background:'linear-gradient(125deg,#7c3aed,#4F8EF7,#06b6d4)',
                  WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent',
                  backgroundClip:'text' }}>Speak</span>
              </span>
            </h2>
            <p style={{ fontSize:15.5, color:'#64748b', marginTop:14, fontWeight:400, letterSpacing:'.1px' }}>
              Built different. Proven by results.
            </p>
          </motion.div>

          {/* ── 4 STATS — responsive: 4col desktop, 2x2 mobile ── */}
          <motion.div initial={{ opacity:0, y:28 }} whileInView={{ opacity:1, y:0 }}
            viewport={{ once:true, amount:0.12 }} transition={{ duration:.42, ease:[.22,1,.36,1] }}
            className="stats-grid-section"
            style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap: 16,
              position:'relative', marginBottom:44 }}>

            <style>{`
              @media (max-width: 640px) {
                .stats-grid-section {
                  grid-template-columns: repeat(2, 1fr) !important;
                  gap: 12px !important;
                }
              }
            `}</style>

            {[
              { n: String(TOOL_COUNT), label:'Tools Available', sub:'& counting',      accent:'#4F8EF7', iconSrc:'/icons/stats/stat-tools.png' },
              { n:'0',                 label:'Server Uploads',  sub:'Zero. Ever.',     accent:'#22c55e', iconSrc:'/icons/stats/stat-uploads.png' },
              { n:'100',               label:'% Free Forever',  sub:'No paywalls',     accent:'#a855f7', iconSrc:'/icons/stats/stat-free.png' },
              { n:'0',                 label:'ms Wait Time',    sub:'Instant results', accent:'#f97316', iconSrc:'/icons/stats/stat-speed.png' },
            ].map((s, i) => (
              <motion.div key={s.label}
                initial={{ opacity:0, y:20 }} whileInView={{ opacity:1, y:0 }}
                viewport={{ once:true, amount:0.12 }}
                transition={{ duration:.45, delay:i*.1, ease:[.22,1,.36,1] }}
                whileHover={{ y:-4, transition:{ type:'spring', stiffness:450, damping:24 } }}
                style={{
                  textAlign:'center',
                  padding:'24px 18px',
                  borderRadius: 22,
                  background: 'rgba(255, 255, 255, 0.78)',
                  backdropFilter: 'blur(24px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                  border: '1px solid rgba(255, 255, 255, 0.9)',
                  boxShadow: '0 8px 30px rgba(15, 23, 42, 0.03), inset 0 1px 0 rgba(255, 255, 255, 0.95)',
                  cursor:'default'
                }}>

                {/* 3D cartoon glossy icon container */}
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 52,
                  height: 52,
                  borderRadius: 16,
                  background: 'rgba(255, 255, 255, 0.85)',
                  border: `1px solid ${s.accent}2a`,
                  boxShadow: `0 8px 24px -4px ${s.accent}2e, inset 0 1px 0 rgba(255, 255, 255, 0.95)`,
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  marginBottom: 14,
                  animation: `sjfloat ${2.6 + i * 0.3}s ease-in-out infinite`,
                  animationDelay: `${i * 0.35}s`,
                }}>
                  <img
                    src={s.iconSrc}
                    alt={s.label}
                    width={38}
                    height={38}
                    style={{
                      width: 38,
                      height: 38,
                      objectFit: 'contain',
                      filter: `drop-shadow(0 4px 10px ${s.accent}44)`,
                    }}
                    loading="lazy"
                  />
                </div>

                {/* big number */}
                <Counter target={s.n} label="" icon=""/>

                {/* label */}
                <div style={{ fontSize:13.5, color:'#334155', fontWeight:600,
                  marginTop:8, letterSpacing:'.1px' }}>{s.label}</div>

                {/* sub — colored accent */}
                <div style={{ fontSize:12.5, color:s.accent, fontWeight:700,
                  marginTop:5, letterSpacing:'.3px' }}>{s.sub}</div>

                {/* glow dot below */}
                <div style={{ width:6, height:6, borderRadius:'50%',
                  background:s.accent, margin:'14px auto 0',
                  boxShadow:`0 0 10px 3px ${s.accent}66`,
                  animation:'sjpulse 1.8s ease-in-out infinite',
                  animationDelay:`${i*.3}s` }}/>
              </motion.div>
            ))}
          </motion.div>

          {/* ── Feature pills in arc ── */}
          <motion.div initial={{ opacity:0, y:12 }} whileInView={{ opacity:1, y:0 }}
            viewport={{ once:true, amount:0.12 }} transition={{ duration:.4, delay:.25 }}
            style={{ display:'flex', flexWrap:'wrap', gap:10,
              justifyContent:'center' }}>
            {[
              ['Web Crypto API', '#4F8EF7', (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4F8EF7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              )],
              ['Canvas API', '#22c55e', (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              )],
              ['Web Speech API', '#a855f7', (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
              )],
              ['PDF-lib', '#f97316', (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              )],
              ['FileReader API', '#06b6d4', (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              )],
            ].map(([label, c, iconSvg], i) => (
              <motion.div key={label}
                initial={{ opacity:0, y:8 }} whileInView={{ opacity:1, y:0 }}
                viewport={{ once:true, amount:0.12 }}
                transition={{ delay:.3 + i*.06, duration:.35 }}
                whileHover={{ scale:1.06, y:-3,
                  boxShadow:`0 8px 24px ${c}25, inset 0 1px 0 rgba(255,255,255,0.95)` }}
                style={{ display:'flex', alignItems:'center', gap:7,
                  padding:'9px 18px', borderRadius:999,
                  background:'rgba(255,255,255,.85)',
                  backdropFilter:'blur(16px) saturate(170%)',
                  WebkitBackdropFilter:'blur(16px) saturate(170%)',
                  border:`1px solid rgba(255,255,255,0.85)`,
                  boxShadow:`0 4px 14px ${c}12, inset 0 1px 0 rgba(255,255,255,.95)`,
                  fontSize:13.5, color:'#1e293b', fontWeight:600,
                  cursor:'default', transition:'box-shadow .2s' }}>
                <span style={{ display:'inline-flex', alignItems:'center' }}>{iconSvg}</span>
                <span>{label}</span>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ════════════════════════════════════════════ */}
      {/* REVIEWS & COMMUNITY FEEDBACK                 */}
      {/* ════════════════════════════════════════════ */}
      <ReviewsSection />

      {/* ════════════════════════════════════════════ */}
      {/* FAQ                                          */}
      {/* ════════════════════════════════════════════ */}
      <section className="home-section-deferred" style={{ background:'#fff', padding:'88px 0' }}>
        <div style={{ maxWidth:1200, margin:'0 auto', padding:'0 20px' }}>
          <SectionHead tag="FAQ" title="Common Questions,<br/>Honest Answers" sub="Everything you need to know about ToolDesk — no jargon, no fluff."/>
          <FAQ/>
        </div>
      </section>

      {/* ════════════════════════════════════════════ */}
      {/* CTA                                          */}
      {/* ════════════════════════════════════════════ */}
      <section className="home-section-deferred" style={{ padding:'0 20px 88px' }}>
        <div style={{ maxWidth:1200, margin:'0 auto' }}>
          <motion.div initial={{ opacity:0, y:24 }} whileInView={{ opacity:1, y:0 }} viewport={{ once:true, amount:0.12 }}
            style={{
              background:'linear-gradient(135deg,#0d0d1a,#12102a)',
              borderRadius:28, padding:'clamp(50px,7vw,80px) 32px', textAlign:'center',
              position:'relative', overflow:'hidden',
              border:'1px solid rgba(255,255,255,.12)',
              boxShadow:'0 24px 64px rgba(13,13,26,.28), inset 0 1px 0 rgba(255,255,255,.20)',
              backdropFilter:'blur(24px)', WebkitBackdropFilter:'blur(24px)'
            }}>
            <GeometricBackground variant="dark" opacity={.85}/>
            <div style={{ position:'relative', zIndex:2 }}>
              <motion.h2 initial={{ opacity:0, y:12 }} whileInView={{ opacity:1, y:0 }} viewport={{ once:true, amount:0.12 }}
                style={{ fontFamily:'Syne,sans-serif', fontSize:'clamp(26px,4.5vw,48px)', fontWeight:800, color:'#fff', marginBottom:12 }}>
                Ready to Get Started?
              </motion.h2>
              <p style={{ fontSize:15.5, color:'rgba(255,255,255,.75)', marginBottom:10, fontWeight:400 }}>
                {TOOL_COUNT} powerful tools. Zero friction. Zero cost.
              </p>
              <p style={{ fontSize:14, color:'rgba(255,255,255,.55)', marginBottom:36, fontWeight:400 }}>
                No sign-up required. Open any tool and start immediately.
              </p>
              <RippleBtn onClick={scroll}
                style={{
                  background: '#ffffff',
                  color: '#0d0d1a',
                  padding: '14px 42px',
                  borderRadius: 999,
                  fontFamily: 'DM Sans,sans-serif',
                  fontWeight: 700,
                  fontSize: 16,
                  boxShadow: '0 8px 30px rgba(79,142,247,.35), inset 0 1px 0 #ffffff',
                  transition: 'all .22s cubic-bezier(0.16, 1, 0.3, 1)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 10,
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-2px)'
                  e.currentTarget.style.boxShadow = '0 16px 44px rgba(79,142,247,.55)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.boxShadow = '0 8px 30px rgba(79,142,247,.35)'
                }}>
                <span>Explore All {TOOL_COUNT} Tools</span>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </RippleBtn>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer/>

      <style>{`
        /* ═══════════════════════════════════════════
           DESKTOP DEFAULTS & INTERMEDIATE TABLET
           ═══════════════════════════════════════════ */
        .orbit-shell         { display: flex !important; }
        .desktop-scroll      { display: flex !important; }
        .mobile-hero-pills   { display: none !important; }
        .mobile-hero-scroll  { display: none !important; }
        .mobile-hero-glow    { display: none !important; }
        .mobile-orbit-frame  { display: none !important; }

        @media (min-width: 761px) and (max-width: 940px) {
          .orbit-shell       { transform: scale(0.86) translateZ(0) !important; }
          .hero-content-wrap { transform: scale(0.94); }
        }

        /* ═══════════════════════════════════════════
           MOBILE HERO REFINEMENT (<= 760px)
           ═══════════════════════════════════════════ */
        @keyframes livePulse {
          0%, 100% { box-shadow: 0 0 0 3px rgba(34,197,94,.18); transform: scale3d(1, 1, 1); }
          50% { box-shadow: 0 0 0 5px rgba(34,197,94,.32); transform: scale3d(1.08, 1.08, 1); }
        }
        .hero-badge-dot {
          animation: livePulse 2.8s ease-in-out infinite;
          will-change: transform, box-shadow;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }

        @keyframes mobilePillFloatA {
          0%, 100% { transform: translate3d(0, 0, 0); }
          50% { transform: translate3d(0, -2px, 0); }
        }
        @keyframes mobilePillFloatB {
          0%, 100% { transform: translate3d(0, 0, 0); }
          50% { transform: translate3d(0, 2px, 0); }
        }
        .mobile-pill-float-a {
          animation: mobilePillFloatA 4.2s ease-in-out infinite;
          will-change: transform;
          backface-visibility: hidden;
        }
        .mobile-pill-float-b {
          animation: mobilePillFloatB 4.8s ease-in-out infinite;
          will-change: transform;
          backface-visibility: hidden;
        }

        .hero-cta-btn:active {
          transform: scale3d(0.96, 0.96, 1) translate3d(0, 1px, 0) !important;
        }
        .hero-cta-btn:active .cta-arrow {
          transform: translate3d(3px, 0, 0) !important;
        }

        @media (max-width: 760px) {
          .hero-section {
            min-height: auto !important;
            padding-top: calc(64px + max(env(safe-area-inset-top, 0px), var(--safe-area-inset-top, 0px)) + 24px) !important;
            padding-bottom: calc(32px + max(env(safe-area-inset-bottom, 0px), var(--safe-area-inset-bottom, 0px))) !important;
            padding-left: 16px !important;
            padding-right: 16px !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: flex-start !important;
          }
          .hero-content-wrap {
            max-width: 100% !important;
            width: 100% !important;
            padding: 0 4px !important;
            margin: 0 auto !important;
          }
          .hero-h1 {
            font-size: clamp(21px, 6.2vw, 30px) !important;
            line-height: 1.18 !important;
            letter-spacing: -0.4px !important;
            margin-bottom: 14px !important;
            max-width: 100% !important;
            width: 100% !important;
            box-sizing: border-box !important;
            word-break: normal !important;
            overflow-wrap: break-word !important;
            hyphens: none !important;
            text-align: center !important;
          }
          .hero-rotating-text {
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            width: 100% !important;
            max-width: 100% !important;
          }
          .hero-text-desktop {
            display: none !important;
          }
          .hero-text-mobile {
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            width: 100% !important;
            max-width: 100% !important;
          }
          .hero-headline-line {
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            text-align: center !important;
            white-space: normal !important;
            word-break: break-word !important;
            overflow-wrap: break-word !important;
            line-height: 1.18 !important;
            margin: 0 auto !important;
          }
          .hero-sub {
            font-size: clamp(13.5px, 3.4vw, 15px) !important;
            line-height: 1.54 !important;
            max-width: 340px !important;
            margin: 0 auto 18px !important;
          }
          .orbit-shell {
            display: none !important;
          }
          .desktop-scroll {
            display: none !important;
          }
          .hero-scroll-indicator {
            display: none !important;
          }
          .mobile-hero-glow {
            display: block !important;
            position: absolute;
            top: 40%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 300px;
            height: 300px;
            border-radius: 50%;
            background: radial-gradient(circle, rgba(156,111,222,0.12) 0%, rgba(79,142,247,0.07) 50%, transparent 72%);
            pointer-events: none;
            z-index: 1;
            filter: blur(24px);
          }
          .mobile-orbit-frame {
            display: block !important;
            position: absolute;
            top: 46%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 330px;
            height: 330px;
            border-radius: 50%;
            border: 1px dashed rgba(156,111,222,0.18);
            pointer-events: none;
            z-index: 1;
          }
          .mobile-hero-pills {
            display: block !important;
            width: 100% !important;
            margin-top: 18px !important;
            margin-bottom: 4px !important;
          }
          .mobile-hero-scroll {
            display: flex !important;
          }
          .fw-word:nth-child(2n+1) {
            display: none !important;
          }
          .fw-word {
            opacity: 0.035 !important;
          }
        .eyebrow-mobile { display: none !important; }
        .eyebrow-desktop { display: inline !important; }
        @media (max-width: 400px) {
          .eyebrow-desktop { display: none !important; }
          .eyebrow-mobile { display: inline !important; }
          .hero-eyebrow { padding: 5px 11px !important; }
          .hero-eyebrow-text { font-size: 11px !important; }
        }

        @media (max-width: 380px) {
          .hero-section {
            padding-top: calc(64px + max(env(safe-area-inset-top, 0px), var(--safe-area-inset-top, 0px)) + 20px) !important;
            padding-bottom: calc(24px + max(env(safe-area-inset-bottom, 0px), var(--safe-area-inset-bottom, 0px))) !important;
            padding-left: 10px !important;
            padding-right: 10px !important;
          }
          .hero-h1 {
            font-size: clamp(19px, 5.8vw, 23px) !important;
            line-height: 1.18 !important;
            letter-spacing: -0.3px !important;
          }
          .hero-sub {
            font-size: 13px !important;
            max-width: 290px !important;
            margin-bottom: 14px !important;
          }
          .mobile-orbit-frame {
            width: 290px !important;
            height: 290px !important;
          }
          .mobile-hero-pills {
            margin-top: 14px !important;
          }
          .mobile-hero-scroll {
            margin-top: 14px !important;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .hero-badge-dot,
          .mobile-pill-float-a,
          .mobile-pill-float-b {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  )
}
