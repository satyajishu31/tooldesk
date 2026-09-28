import AppIcon from './AppIcon'
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { LayoutGrid, Sparkles, Info, Star, Clock, Download } from 'lucide-react'
import { isDownloadAppAvailable } from '../utils/apiConfig'
import { TOOLS } from '../constants'
import { smartSearchTools } from '../utils/smartSearch'
import { getSyncRecentTools } from '../utils/recentTools'
import { getFavoriteTools } from '../utils/favorites'

const TOOL_COUNT = TOOLS.length

const THEMES = [
  { name: 'Classic Blue', primary: '#4F8EF7', dark: '#3272d9' },
  { name: 'Neon Purple', primary: '#9C6FDE', dark: '#7c3aed' },
  { name: 'Forest Green', primary: '#22c55e', dark: '#16a34a' },
  { name: 'Sunset Orange', primary: '#ff6b6b', dark: '#e04d4d' },
  { name: 'Teal Ocean', primary: '#06b6d4', dark: '#0891b2' },
]

export default function Navbar() {
  const [scrolled,   setScrolled]   = useState(false)
  const [menuOpen,   setMenuOpen]   = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query,      setQuery]      = useState('')
  const inputRef  = useRef(null)
  const location  = useLocation()
  const navigate  = useNavigate()

  const [themeOpen, setThemeOpen] = useState(false)
  const [activeTheme, setActiveTheme] = useState('Classic Blue')
  const [actionToast, setActionToast] = useState('')
  const isMac = useMemo(() => typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent || navigator.platform || ''), [])

  const quickActions = useMemo(() => [
    {
      id: 'quick-password',
      icon: '⚡',
      title: 'Generate 32-Char Password',
      desc: 'Uniform high-entropy password copied to clipboard',
      run: () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+'
        const len = chars.length
        const limit = 4294967296 - (4294967296 % len)
        const buf = new Uint32Array(1)
        const res = []
        for (let i = 0; i < 32; i++) {
          let val
          do {
            window.crypto.getRandomValues(buf)
            val = buf[0]
          } while (val >= limit)
          res.push(chars[val % len])
        }
        navigator.clipboard?.writeText(res.join(''))
        setActionToast('⚡ Copied 32-char secure password!')
        setTimeout(() => { setActionToast(''); closeSearch() }, 1100)
      }
    },
    {
      id: 'quick-lock',
      icon: '🔒',
      title: 'Lock Password Vault (All Tabs)',
      desc: 'Purge credentials across all open browser tabs',
      run: () => {
        try {
          if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
            const ch = new BroadcastChannel('tooldesk_vault_channel')
            ch.postMessage('LOCK_VAULT')
            ch.close()
          }
        } catch {}
        setActionToast('🔒 Password Vault locked across all tabs!')
        setTimeout(() => { setActionToast(''); closeSearch() }, 1100)
      }
    },
    {
      id: 'quick-url',
      icon: '🔗',
      title: 'Copy Current Tool Link',
      desc: 'Copy current page URL to clipboard',
      run: () => {
        navigator.clipboard?.writeText(window.location.href)
        setActionToast('🔗 Tool link copied to clipboard!')
        setTimeout(() => { setActionToast(''); closeSearch() }, 1100)
      }
    }
  ], [])

  const mobileNavLinks = useMemo(() => [
    { label: 'All Tools', id: 'tools', icon: LayoutGrid },
    { label: 'Why ToolDesk', id: 'why', icon: Sparkles },
    { label: 'About', id: 'about', icon: Info },
    { label: 'Reviews', id: 'reviews', icon: Star },
  ], [])

  const changeTheme = (t) => {
    setActiveTheme(t.name)
    try { localStorage.setItem('tooldesk-theme', t.name) } catch {}
    document.documentElement.style.setProperty('--blue', t.primary)
    document.documentElement.style.setProperty('--blue-dk', t.dark)
    setThemeOpen(false)
  }

  useEffect(() => {
    try {
      const saved = localStorage.getItem('tooldesk-theme')
      if (saved) {
        const match = THEMES.find(t => t.name === saved)
        if (match) {
          document.documentElement.style.setProperty('--blue', match.primary)
          document.documentElement.style.setProperty('--blue-dk', match.dark)
          setActiveTheme(match.name)
        }
      }
    } catch {}
  }, [])

  useEffect(() => {
    let rafId = null
    const scrolledRef = { current: window.scrollY > 18 }
    const fn = () => {
      if (rafId) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        const isOver = window.scrollY > 18
        if (isOver !== scrolledRef.current) {
          scrolledRef.current = isOver
          setScrolled(isOver)
        }
      })
    }
    window.addEventListener('scroll', fn, { passive: true })
    return () => {
      window.removeEventListener('scroll', fn)
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [])

  useEffect(() => { setMenuOpen(false); setSearchOpen(false); setQuery('') }, [location.pathname])

  // Lock body scroll when mobile menu is open, restoring exact scroll position upon dismissal
  useEffect(() => {
    if (!menuOpen) return
    const scrollY = window.scrollY
    const prevOverflow = document.body.style.overflow
    const prevPosition = document.body.style.position
    const prevTop = document.body.style.top
    const prevWidth = document.body.style.width

    document.body.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.width = '100%'

    return () => {
      document.body.style.overflow = prevOverflow
      document.body.style.position = prevPosition
      document.body.style.top = prevTop
      document.body.style.width = prevWidth
      window.scrollTo(0, scrollY)
    }
  }, [menuOpen])

  useEffect(() => {
    if (searchOpen) {
      inputRef.current?.focus()
    }
  }, [searchOpen])

  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  useEffect(() => {
    const fn = e => {
      if (e.key === 'Escape') { setSearchOpen(false); setMenuOpen(false); setShortcutsOpen(false); setQuery('') }
      const isCmdK = (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey))
      const isSlash = (e.key === '/' && !['INPUT','TEXTAREA'].includes(document.activeElement?.tagName))
      if ((isCmdK || isSlash) && !searchOpen) {
        e.preventDefault(); setSearchOpen(true)
      }
      if (e.key === '?' && !['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) {
        e.preventDefault(); setShortcutsOpen(s => !s)
      }
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [searchOpen])

  const scrollTo = useCallback(id => {
    setMenuOpen(false)
    if (location.pathname !== '/') {
      navigate('/')
      setTimeout(() => {
        const el = document.getElementById(id) || document.getElementById('about') || document.querySelector('footer')
        el?.scrollIntoView({ behavior:'smooth', block:'start' })
      }, 380)
    } else {
      const el = document.getElementById(id) || document.getElementById('about') || document.querySelector('footer')
      el?.scrollIntoView({ behavior:'smooth', block:'start' })
    }
  }, [location.pathname, navigate])

  const results = useMemo(() => {
    return smartSearchTools(query, 10)
  }, [query])

  const recentToolsList = useMemo(() => {
    const ids = getSyncRecentTools()
    return ids.map(id => TOOLS.find(t => t.id === id)).filter(Boolean).slice(0, 4)
  }, [searchOpen])

  const favoriteToolsList = useMemo(() => {
    const ids = getFavoriteTools()
    return ids.map(id => TOOLS.find(t => t.id === id)).filter(Boolean).slice(0, 4)
  }, [searchOpen])

  const openSearch  = () => { setMenuOpen(false); setSearchOpen(true) }
  const closeSearch = () => { setSearchOpen(false); setQuery('') }

  return (
    <>
      {/* ═══ NAVBAR ═══ */}
      <nav className="tooldesk-nav-bar" style={{
        position:'fixed', top:0, left:0, right:0, zIndex:999,
        height: 'calc(64px + max(env(safe-area-inset-top, 0px), var(--safe-area-inset-top, 0px)))',
        paddingTop: 'max(env(safe-area-inset-top, 0px), var(--safe-area-inset-top, 0px))',
        paddingLeft: 'max(16px, env(safe-area-inset-left, 0px), var(--safe-area-inset-left, 0px))',
        paddingRight: 'max(16px, env(safe-area-inset-right, 0px), var(--safe-area-inset-right, 0px))',
        paddingBottom: 0,
        boxSizing: 'border-box',
        transform: 'translateZ(0)',
        willChange: 'background, border-color, box-shadow',
        background: scrolled ? 'rgba(255,255,255,.84)' : 'rgba(255,255,255,.70)',
        backdropFilter:'blur(20px) saturate(180%)', WebkitBackdropFilter:'blur(20px) saturate(180%)',
        borderBottom: scrolled ? '1px solid rgba(0,0,0,.06)' : '1px solid rgba(255,255,255,.55)',
        boxShadow: scrolled ? '0 4px 20px rgba(0,0,0,.03), inset 0 -0.5px 0 rgba(255,255,255,.75)' : 'inset 0 -0.5px 0 rgba(255,255,255,.4)',
        display:'flex', alignItems:'center', justifyContent:'space-between', gap:12,
        transition: 'background .2s cubic-bezier(0.16, 1, 0.3, 1), border-color .2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow .2s cubic-bezier(0.16, 1, 0.3, 1)',
      }}>
        {/* Brand — HD Transparent Logo */}
        <Link to="/" style={{ textDecoration:'none', display:'flex', alignItems:'center', flexShrink:0 }}>
          <motion.div
            whileHover={{ scale:1.03 }}
            whileTap={{ scale:.97 }}
            transition={{ type:'spring', stiffness:380, damping:22 }}
            style={{ display:'flex', alignItems:'center', userSelect:'none' }}>
            <img
              src="/logo.png"
              alt="ToolDesk"
              className="tooldesk-navbar-logo"
              onError={e => {
                if (!e.currentTarget.dataset.fallback) {
                  e.currentTarget.dataset.fallback = '1'
                  e.currentTarget.src = 'logo.png'
                }
              }}
              style={{
                height: 42,
                width: 'auto',
                display: 'block',
                objectFit: 'contain'
              }}
            />
          </motion.div>
        </Link>

        {/* Desktop nav */}
        <div className="nav-desktop" style={{ display:'flex', alignItems:'center', gap:4 }}>
          {[{label:'Tools',id:'tools'},{label:'Why',id:'why'},{label:'About',id:'about'},{label:'Reviews',id:'reviews'}].map(l => (
            <motion.button key={l.label} onClick={() => scrollTo(l.id)} whileHover={{ y:-1 }}
              style={{ padding:'7px 14px', borderRadius:999, fontSize:13.5, fontWeight:500, color:'#555', background:'none', border:'none', cursor:'pointer', fontFamily:'DM Sans,sans-serif', transition:'color .18s,background .18s' }}
              onMouseEnter={e=>{e.currentTarget.style.background='#f0f4ff';e.currentTarget.style.color='#4F8EF7'}}
              onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color='#555'}}>
              {l.label}
            </motion.button>
          ))}

          <motion.button
            onClick={() => {
              window.dispatchEvent(new CustomEvent('tooldesk-open-history'))
            }}
            whileHover={{ y:-1 }}
            style={{ padding:'7px 14px', borderRadius:999, fontSize:13.5, fontWeight:500, color:'#555', background:'none', border:'none', cursor:'pointer', fontFamily:'DM Sans,sans-serif', transition:'color .18s,background .18s', display:'flex', alignItems:'center', gap:6 }}
            onMouseEnter={e=>{e.currentTarget.style.background='#f0f4ff';e.currentTarget.style.color='#4F8EF7'}}
            onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color='#555'}}>
            <Clock size={13.5} strokeWidth={2} style={{ flexShrink: 0 }} />
            <span>History</span>
          </motion.button>
          <motion.button onClick={openSearch} whileHover={{ scale:1.04 }} whileTap={{ scale:.93 }}
            style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 14px', borderRadius:999, border:'1px solid rgba(0,0,0,.07)', background:'rgba(0,0,0,.035)', backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)', cursor:'pointer', fontSize:13, color:'#777', fontFamily:'DM Sans,sans-serif', marginLeft:4, transition:'all .18s', boxShadow:'inset 0 1px 0 rgba(255,255,255,.85), 0 1px 2px rgba(0,0,0,.02)' }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor='#4F8EF7'; e.currentTarget.style.background='rgba(79,142,247,.08)'}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(0,0,0,.07)'; e.currentTarget.style.background='rgba(0,0,0,.035)'}}>
            <span>🔍</span>
            <span style={{ fontSize:13, fontWeight:500 }}>Search</span>
            <kbd style={{ fontSize:11, fontWeight:600, color:'#64748b', background:'rgba(255,255,255,.85)', padding:'2px 6px', borderRadius:5, border:'1px solid rgba(0,0,0,.08)', fontFamily:'monospace', lineHeight:1.5 }}>{isMac ? '⌘K' : 'Ctrl K'}</kbd>
          </motion.button>
          
          <motion.button onClick={() => setShortcutsOpen(true)} whileHover={{ scale:1.04 }} whileTap={{ scale:.93 }}
            title="Keyboard Shortcuts (?)"
            style={{ display:'flex', alignItems:'center', justifyContent:'center', width:36, height:36, borderRadius:'50%', border:'1px solid rgba(0,0,0,.07)', background:'rgba(0,0,0,.035)', backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)', cursor:'pointer', fontSize:15, transition:'all .18s', marginLeft:4, boxShadow:'inset 0 1px 0 rgba(255,255,255,.85), 0 1px 2px rgba(0,0,0,.02)' }}
            onMouseEnter={e=>e.currentTarget.style.borderColor='var(--blue)'}
            onMouseLeave={e=>e.currentTarget.style.borderColor='rgba(0,0,0,.07)'}>
            ⌨️
          </motion.button>
          
          {/* Theme customizer */}
          <div style={{ position:'relative', display:'inline-block', marginLeft:4 }}>
            <motion.button onClick={() => setThemeOpen(o=>!o)} whileHover={{ scale:1.04 }} whileTap={{ scale:.93 }}
              style={{ display:'flex', alignItems:'center', justifyContent:'center', width:36, height:36, borderRadius:'50%', border:'1px solid rgba(0,0,0,.07)', background:'rgba(0,0,0,.035)', backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)', cursor:'pointer', fontSize:16, transition:'all .18s', boxShadow:'inset 0 1px 0 rgba(255,255,255,.85), 0 1px 2px rgba(0,0,0,.02)' }}
              onMouseEnter={e=>e.currentTarget.style.borderColor='var(--blue)'}
              onMouseLeave={e=>e.currentTarget.style.borderColor='rgba(0,0,0,.07)'}>
              🎨
            </motion.button>
            <AnimatePresence>
              {themeOpen && (
                <>
                  <div style={{ position:'fixed', inset:0, zIndex:998 }} onClick={() => setThemeOpen(false)}/>
                  <motion.div initial={{ opacity:0, y:-6 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-4 }} transition={{ duration:.16, ease:[.22,1,.36,1] }}
                    style={{ position:'absolute', top:44, right:0, background:'#ffffff', border:'1px solid rgba(0,0,0,.08)', borderRadius:16, padding:'8px', boxShadow:'0 16px 40px rgba(0,0,0,.12)', zIndex:999, display:'flex', flexDirection:'column', gap:4, minWidth:160 }}>
                    <div style={{ fontSize:11.5, fontWeight:700, color:'#64748b', padding:'4px 8px', textTransform:'uppercase', letterSpacing:'.5px' }}>Themes</div>
                    {THEMES.map(t => (
                      <button key={t.name} onClick={() => changeTheme(t)}
                        style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'8px 12px', border:'none', background:activeTheme===t.name?'rgba(79,142,247,.08)':'none', borderRadius:9, cursor:'pointer', fontSize:13.5, fontWeight:600, color:'#333', textAlign:'left', transition:'background .15s' }}
                        onMouseEnter={e=>e.currentTarget.style.background=activeTheme===t.name?'rgba(79,142,247,.1)':'#f5f7ff'}
                        onMouseLeave={e=>e.currentTarget.style.background=activeTheme===t.name?'rgba(79,142,247,.08)':'none'}>
                        <span style={{ width:12, height:12, borderRadius:'50%', background:t.primary, display:'block' }}/>
                        {t.name}
                      </button>
                    ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {isDownloadAppAvailable() && (
            <motion.button
              onClick={() => window.dispatchEvent(new CustomEvent('tooldesk-open-download'))}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  window.dispatchEvent(new CustomEvent('tooldesk-open-download'))
                }
              }}
              whileHover={{ scale:1.04, y:-1 }}
              whileTap={{ scale:.95 }}
              aria-label="Download ToolDesk App"
              aria-haspopup="dialog"
              title="Download ToolDesk App (Windows, macOS, Linux, Android, iOS)"
              style={{
                marginLeft: 6,
                padding: '8px 16px',
                borderRadius: 999,
                background: 'rgba(79,142,247,.1)',
                color: 'var(--blue, #4F8EF7)',
                border: '1px solid rgba(79,142,247,.22)',
                fontFamily: 'DM Sans,sans-serif',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all .18s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(79,142,247,.18)'; e.currentTarget.style.borderColor = 'var(--blue, #4F8EF7)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(79,142,247,.1)'; e.currentTarget.style.borderColor = 'rgba(79,142,247,.22)' }}>
              <Download size={14} strokeWidth={2.2} />
              <span>Download App</span>
            </motion.button>
          )}

          <motion.button onClick={() => scrollTo('tools')} whileHover={{ scale:1.04, y:-2 }} whileTap={{ scale:.96 }}
            style={{ marginLeft:6, padding:'9px 20px', borderRadius:999, background:'#0d0d1a', color:'#fff', border:'none', fontFamily:'DM Sans,sans-serif', fontWeight:600, fontSize:13.5, cursor:'pointer', boxShadow:'0 4px 14px rgba(13,13,26,.22)' }}>
            Explore →
          </motion.button>
        </div>

        {/* Mobile controls */}
        <div className="nav-mobile" style={{ display:'none', alignItems:'center', gap:6, flexShrink:0 }}>
          <motion.button onClick={openSearch} whileTap={{ scale:.9 }} aria-label="Open tool search"
            style={{ width:38, height:38, borderRadius:11, border:'1px solid rgba(0,0,0,.07)', background:'rgba(255,255,255,.82)', backdropFilter:'blur(14px)', WebkitBackdropFilter:'blur(14px)', boxShadow:'inset 0 1px 0 rgba(255,255,255,.95), 0 1px 3px rgba(0,0,0,.03)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, touchAction:'manipulation' }}>
            🔍
          </motion.button>
          <motion.button onClick={() => setMenuOpen(o=>!o)} whileTap={{ scale:.9 }} aria-label="Toggle navigation menu"
            style={{ width:38, height:38, background:'rgba(255,255,255,.82)', backdropFilter:'blur(14px)', WebkitBackdropFilter:'blur(14px)', border:'1px solid rgba(0,0,0,.07)', borderRadius:11, boxShadow:'inset 0 1px 0 rgba(255,255,255,.95), 0 1px 3px rgba(0,0,0,.03)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:4, padding:8, touchAction:'manipulation' }}>
            <motion.span animate={{ rotate:menuOpen?45:0, y:menuOpen?6:0 }} style={{ width:18, height:2, background:'#333', borderRadius:2, display:'block', transformOrigin:'center' }}/>
            <motion.span animate={{ opacity:menuOpen?0:1 }} style={{ width:18, height:2, background:'#333', borderRadius:2, display:'block' }}/>
            <motion.span animate={{ rotate:menuOpen?-45:0, y:menuOpen?-6:0 }} style={{ width:18, height:2, background:'#333', borderRadius:2, display:'block', transformOrigin:'center' }}/>
          </motion.button>
        </div>
      </nav>

      {/* ═══ SEARCH OVERLAY ═══ */}
      <AnimatePresence>
        {searchOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
              transition={{ duration: 0.15 }}
              onClick={closeSearch}
              style={{ position:'fixed', inset:0, background:'rgba(13,13,26,.36)', zIndex:1100, backdropFilter:'blur(8px)', WebkitBackdropFilter:'blur(8px)' }}
            />

            {/* Search panel — clean fade and slide, NO subpixel scaling */}
            <motion.div
              initial={{ opacity:0, y:-12 }}
              animate={{ opacity:1, y:0 }}
              exit={{ opacity:0, y:-8 }}
              transition={{ duration: 0.18, ease:[.22,1,.36,1] }}
              style={{
                position:'fixed',
                top: 'calc(74px + max(env(safe-area-inset-top, 0px), var(--safe-area-inset-top, 0px)))',
                left:12, right:12,
                maxWidth:620,
                minWidth:0,
                boxSizing:'border-box',
                margin:'0 auto',
                background:'#ffffff',
                borderRadius:22,
                boxShadow:'0 24px 64px rgba(0,0,0,.18), 0 4px 16px rgba(0,0,0,.06)',
                border:'1px solid rgba(0,0,0,.08)',
                zIndex:1101,
                overflow:'hidden',
                maxHeight:'calc(100dvh - 100px)',
                display:'flex', flexDirection:'column',
              }}>

              {/* Search input */}
              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'14px 18px', borderBottom:'1px solid rgba(0,0,0,.07)', flexShrink:0, minWidth:0 }}>
                <span style={{ fontSize:18, opacity:.4, flexShrink:0 }}>🔍</span>
                <input
                  ref={inputRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder={`Search all ${TOOL_COUNT} tools or quick actions…`}
                  autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false}
                  style={{ flex:1, minWidth:0, border:'none', outline:'none', fontFamily:'DM Sans,sans-serif', fontSize:16, color:'#1a1a2e', background:'transparent' }}
                />
                {query && (
                  <button onClick={() => setQuery('')} aria-label="Clear query"
                    style={{ width:28, height:28, borderRadius:'50%', background:'rgba(0,0,0,.08)', border:'none', cursor:'pointer', fontSize:12, color:'#666', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, touchAction:'manipulation' }}>
                    ✕
                  </button>
                )}
                <button onClick={closeSearch} className="search-esc-badge"
                  style={{ padding:'5px 10px', borderRadius:7, background:'#f0f0f5', border:'1px solid #e0e0e8', cursor:'pointer', fontSize:11, color:'#888', fontFamily:'monospace', flexShrink:0, touchAction:'manipulation' }}>
                  Esc
                </button>
              </div>

              {/* Action Toast */}
              {actionToast && (
                <div style={{ padding:'8px 18px', background:'rgba(34,197,94,.1)', borderBottom:'1px solid rgba(34,197,94,.2)', fontSize:12, fontWeight:700, color:'#15803d' }}>
                  {actionToast}
                </div>
              )}

              {/* Results container — scrollable, clipped horizontally as defense-in-depth
                  (the real fix is minWidth:0 on grid/flex items below, not this alone) */}
              <div style={{ overflowY:'auto', overflowX:'hidden', flex:1, WebkitOverflowScrolling:'touch', minWidth:0 }}>

                {/* No match */}
                {query.trim().length > 0 && results.length === 0 && (
                  <div style={{ padding:'36px 20px', textAlign:'center' }}>
                    <div style={{ fontSize:36, marginBottom:10 }}>🔍</div>
                    <div style={{ fontSize:14.5, color:'#475569' }}>No tools found for "<strong style={{color:'#0f172a'}}>{query}</strong>"</div>
                    <div style={{ fontSize:13.5, color:'#64748b', marginTop:5 }}>Try a different keyword</div>
                  </div>
                )}

                {/* Search results */}
                {results.length > 0 && (
                  <div>
                    <div style={{ padding:'10px 18px 6px', fontSize:12, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'.6px' }}>
                      {results.length} result{results.length !== 1 ? 's' : ''}
                    </div>
                    {results.map((t, ri) => (
                      <motion.div key={t.id}
                        initial={{ opacity:0, x:-8 }}
                        animate={{ opacity:1, x:0 }}
                        transition={{ duration:.22, delay:ri*.04, ease:[.22,1,.36,1] }}>
                      <Link to={t.path} onClick={closeSearch}
                        style={{ display:'flex', alignItems:'center', gap:13, padding:'12px 18px', textDecoration:'none', borderBottom:'1px solid rgba(0,0,0,.04)', transition:'background .14s', WebkitTapHighlightColor:'transparent' }}
                        onMouseEnter={e=>e.currentTarget.style.background='#f5f7ff'}
                        onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                        {t.icon
                          ? <AppIcon src={t.icon} alt={t.title} size={36}/>
                          : <div style={{ width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center', background:'#f5f5fa', borderRadius:9 }}><span style={{fontSize:22}}>{t.em}</span></div>}
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:15, fontWeight:600, color:'#1a1a2e', marginBottom:2 }}>{t.title}</div>
                          <div style={{ fontSize:13.5, color:'#64748b', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.desc}</div>
                        </div>
                        <span style={{ fontSize:12.5, fontWeight:700, color:'#4F8EF7', background:'rgba(79,142,247,.08)', padding:'4px 10px', borderRadius:999, flexShrink:0, whiteSpace:'nowrap' }}>
                          {t.cat}
                        </span>
                      </Link>
                      </motion.div>
                    ))}
                  </div>
                )}

                {/* Quick access — no query */}
                {query.trim().length === 0 && (
                  <div style={{ padding:'14px 18px 18px' }}>
                    {/* Quick Actions Bar */}
                    <div style={{ fontSize:12, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'.6px', marginBottom:8 }}>
                      ⚡ Quick Actions
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:16 }}>
                      {quickActions.map(act => (
                        <div key={act.id} onClick={act.run}
                          style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', minHeight:44, borderRadius:12, background:'#f8f9ff', border:'1px solid rgba(0,0,0,.06)', cursor:'pointer', transition:'all .15s', boxSizing:'border-box' }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(79,142,247,.08)'; e.currentTarget.style.borderColor = 'rgba(79,142,247,.2)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = '#f8f9ff'; e.currentTarget.style.borderColor = 'rgba(0,0,0,.06)' }}>
                          <span style={{ fontSize:16 }}>{act.icon}</span>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:13.5, fontWeight:700, color:'#1a1a2e' }}>{act.title}</div>
                            <div style={{ fontSize:13, color:'#475569' }}>{act.desc}</div>
                          </div>
                          <span style={{ fontSize:13, color:'#4F8EF7', fontWeight:700 }}>Run ⚡</span>
                        </div>
                      ))}
                    </div>

                    {/* Recent Tools if available */}
                    {recentToolsList.length > 0 && (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize:12, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'.6px', marginBottom:8, display:'flex', alignItems:'center', gap:5 }}>
                          <Clock size={13} style={{ color: '#4F8EF7' }} />
                          Recent Tools
                        </div>
                        <div className="popular-tools-grid" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                          {recentToolsList.map(t => (
                            <Link key={t.id} to={t.path} onClick={closeSearch}
                              style={{ display:'flex', alignItems:'center', gap:9, padding:'10px 12px', borderRadius:12, background:'rgba(79,142,247,.06)', border:'1px solid rgba(79,142,247,.16)', textDecoration:'none', transition:'background .14s', minWidth:0 }}
                              onMouseEnter={e=>e.currentTarget.style.background='rgba(79,142,247,.12)'}
                              onMouseLeave={e=>e.currentTarget.style.background='rgba(79,142,247,.06)'}>
                              <AppIcon src={t.icon} alt={t.title} size={24}/>
                              <span style={{ fontSize:13.5, fontWeight:600, color:'#1e293b', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', minWidth:0, flex:1 }}>{t.title}</span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Favorite Tools if available */}
                    {favoriteToolsList.length > 0 && (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize:12, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'.6px', marginBottom:8, display:'flex', alignItems:'center', gap:5 }}>
                          <Star size={13} style={{ color: '#d97706' }} />
                          Starred Tools
                        </div>
                        <div className="popular-tools-grid" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                          {favoriteToolsList.map(t => (
                            <Link key={t.id} to={t.path} onClick={closeSearch}
                              style={{ display:'flex', alignItems:'center', gap:9, padding:'10px 12px', borderRadius:12, background:'rgba(217,119,6,.06)', border:'1px solid rgba(217,119,6,.18)', textDecoration:'none', transition:'background .14s', minWidth:0 }}
                              onMouseEnter={e=>e.currentTarget.style.background='rgba(217,119,6,.12)'}
                              onMouseLeave={e=>e.currentTarget.style.background='rgba(217,119,6,.06)'}>
                              <AppIcon src={t.icon} alt={t.title} size={24}/>
                              <span style={{ fontSize:13.5, fontWeight:600, color:'#1e293b', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', minWidth:0, flex:1 }}>{t.title}</span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    <div style={{ fontSize:12, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'.6px', marginBottom:12 }}>
                      Popular Tools
                    </div>
                    {/* 2 columns on desktop; single column on mobile (see media query below) */}
                    <div className="popular-tools-grid" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                      {TOOLS.slice(0, 8).map(t => (
                        <Link key={t.id} to={t.path} onClick={closeSearch}
                          style={{ display:'flex', alignItems:'center', gap:9, padding:'11px 14px', borderRadius:12, background:'rgba(79,142,247,.05)', border:'1px solid rgba(79,142,247,.14)', boxShadow:'inset 0 1px 0 rgba(255,255,255,.8)', textDecoration:'none', transition:'background .14s', WebkitTapHighlightColor:'transparent', minWidth:0 }}
                          onMouseEnter={e=>e.currentTarget.style.background='rgba(79,142,247,.12)'}
                          onMouseLeave={e=>e.currentTarget.style.background='rgba(79,142,247,.05)'}>
                          <AppIcon src={t.icon} alt={t.title} size={26}/>
                          <span style={{ fontSize:14, fontWeight:600, color:'#4F8EF7', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', minWidth:0, flex:1 }}>{t.title}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ═══ MOBILE MENU ═══ */}
      <AnimatePresence>
        {menuOpen && (
          <>
            {/* Backdrop behind mobile menu — tap to close */}
            <motion.div
              initial={{ opacity:0 }}
              animate={{ opacity:1 }}
              exit={{ opacity:0 }}
              transition={{ duration: 0.15 }}
              onClick={() => setMenuOpen(false)}
              style={{
                position: 'fixed',
                top: 'calc(64px + max(env(safe-area-inset-top, 0px), var(--safe-area-inset-top, 0px)))',
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(13, 13, 26, 0.28)',
                backdropFilter: 'blur(4px)',
                WebkitBackdropFilter: 'blur(4px)',
                zIndex: 997,
              }}
            />

            <motion.div
              initial={{ opacity:0, y:-8 }}
              animate={{ opacity:1, y:0 }}
              exit={{ opacity:0, y:-6 }}
              transition={{ duration:.18, ease:[.22,1,.36,1] }}
              style={{
                position:'fixed',
                top: 'calc(64px + max(env(safe-area-inset-top, 0px), var(--safe-area-inset-top, 0px)))',
                left:0, right:0,
                zIndex:998,
                background:'#ffffff',
                borderBottom:'1px solid rgba(0,0,0,.08)',
                padding:'12px 16px 18px',
                display:'flex',
                flexDirection:'column',
                gap:3,
                boxShadow:'0 14px 40px rgba(0,0,0,.10)',
                maxHeight: 'calc(100dvh - (64px + max(env(safe-area-inset-top, 0px), var(--safe-area-inset-top, 0px))))',
                overflowY: 'auto',
                WebkitOverflowScrolling: 'touch',
                paddingBottom: 'max(18px, env(safe-area-inset-bottom, 0px))',
              }}>
              {mobileNavLinks.map(l => (
                <button key={l.id} onClick={()=>scrollTo(l.id)}
                  style={{ padding:'12px 16px', borderRadius:12, fontSize:15, fontWeight:500, color:'#333', background:'none', border:'none', cursor:'pointer', textAlign:'left', fontFamily:'DM Sans,sans-serif', transition:'background .15s, color .15s', touchAction:'manipulation', display:'flex', alignItems:'center', gap:12 }}
                  onMouseEnter={e=>{ e.currentTarget.style.background='#f5f7ff'; e.currentTarget.style.color='#4F8EF7' }}
                  onMouseLeave={e=>{ e.currentTarget.style.background='transparent'; e.currentTarget.style.color='#333' }}>
                  <l.icon size={18} strokeWidth={2} style={{ flexShrink:0, opacity:0.85 }} />
                  <span>{l.label}</span>
                </button>
              ))}

              <button onClick={() => {
                setMenuOpen(false);
                setTimeout(() => {
                  window.dispatchEvent(new CustomEvent('tooldesk-open-history'))
                }, 120)
              }}
                style={{ padding:'12px 16px', borderRadius:12, fontSize:15, fontWeight:500, color:'#4F8EF7', background:'rgba(79,142,247,.06)', border:'none', cursor:'pointer', textAlign:'left', fontFamily:'DM Sans,sans-serif', touchAction:'manipulation', display:'flex', alignItems:'center', gap:12, transition:'background .15s' }}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(79,142,247,.12)'}
                onMouseLeave={e=>e.currentTarget.style.background='rgba(79,142,247,.06)'}>
                <Clock size={18} strokeWidth={2} style={{ flexShrink:0 }} />
                <span>History</span>
              </button>

              {isDownloadAppAvailable() && (
                <button onClick={() => {
                  setMenuOpen(false);
                  setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('tooldesk-open-download'))
                  }, 120)
                }}
                  style={{ padding:'12px 16px', borderRadius:12, fontSize:15, fontWeight:500, color:'#333', background:'none', border:'none', cursor:'pointer', textAlign:'left', fontFamily:'DM Sans,sans-serif', touchAction:'manipulation', display:'flex', alignItems:'center', gap:12, transition:'background .15s, color .15s' }}
                  onMouseEnter={e=>{ e.currentTarget.style.background='#f5f7ff'; e.currentTarget.style.color='#4F8EF7' }}
                  onMouseLeave={e=>{ e.currentTarget.style.background='transparent'; e.currentTarget.style.color='#333' }}>
                  <Download size={18} strokeWidth={2} style={{ flexShrink:0, opacity:0.85 }} />
                  <span>Download App</span>
                </button>
              )}

              <button onClick={()=>scrollTo('tools')}
                style={{ marginTop:8, padding:'13px', borderRadius:12, background:'#0d0d1a', color:'#fff', border:'none', fontFamily:'DM Sans,sans-serif', fontWeight:600, fontSize:15, cursor:'pointer', touchAction:'manipulation', textAlign:'center', boxShadow:'0 4px 14px rgba(13,13,26,.18)' }}>
                Explore All {TOOL_COUNT} Tools →
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ═══ KEYBOARD SHORTCUTS CHEAT SHEET ═══ */}
      <AnimatePresence>
        {shortcutsOpen && (
          <>
            <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
              transition={{ duration: 0.15 }}
              onClick={() => setShortcutsOpen(false)}
              style={{ position:'fixed', inset:0, zIndex:999, background:'rgba(13,13,26,.36)', backdropFilter:'blur(8px)', WebkitBackdropFilter:'blur(8px)' }} />
            <motion.div
              initial={{ opacity:0, y:-12 }}
              animate={{ opacity:1, y:0 }}
              exit={{ opacity:0, y:-8 }}
              transition={{ duration: 0.18, ease:[.22,1,.36,1] }}
              style={{
                position:'fixed',
                top:100,
                left:16, right:16,
                margin:'0 auto',
                zIndex:1000,
                width:'100%', maxWidth:420,
                boxSizing:'border-box',
                background:'#ffffff',
                borderRadius:22, padding:24,
                boxShadow:'0 24px 60px rgba(0,0,0,.18), 0 4px 16px rgba(0,0,0,.06)',
                border:'1px solid rgba(0,0,0,.08)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                <div style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:17, color:'#0d0d1a' }}>
                  ⌨️ Keyboard Shortcuts
                </div>
                <button onClick={() => setShortcutsOpen(false)} style={{ background:'none', border:'none', fontSize:18, cursor:'pointer', color:'#aaa' }}>✕</button>
              </div>

              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {[
                  { keys: ['Ctrl', 'K'], desc: 'Universal Command Palette / Search' },
                  { keys: ['/'], desc: 'Quick Search Bar' },
                  { keys: ['Esc'], desc: 'Dismiss any modal, drawer, or search' },
                  { keys: ['Shift', '?'], desc: 'Toggle Keyboard Shortcuts' },
                ].map((s, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', background:'#f8f9ff', borderRadius:12, border:'1px solid rgba(0,0,0,.05)' }}>
                    <span style={{ fontSize:13.5, color:'#1e293b', fontWeight:500 }}>{s.desc}</span>
                    <div style={{ display:'flex', gap:4 }}>
                      {s.keys.map((k, ki) => (
                        <kbd key={ki} style={{ fontSize:12, fontWeight:700, color:'#0d0d1a', background:'#fff', padding:'2px 7px', borderRadius:5, border:'1px solid #ccc', boxShadow:'0 2px 0 #ddd', fontFamily:'monospace' }}>{k}</kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <p style={{ fontSize:12.5, color:'#64748b', textAlign:'center', marginTop:18 }}>
                Press <kbd style={{ fontSize:11, background:'#eee', padding:'1px 5px', borderRadius:4, fontFamily:'monospace' }}>Esc</kbd> anytime to dismiss
              </p>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <style>{`
        @media (max-width:700px) {
          .nav-desktop { display:none !important; }
          .nav-mobile  { display:flex !important; }
          .tooldesk-nav-bar {
            height: calc(64px + max(env(safe-area-inset-top, 0px), var(--safe-area-inset-top, 0px))) !important;
            padding-top: max(env(safe-area-inset-top, 0px), var(--safe-area-inset-top, 0px)) !important;
            padding-bottom: 0 !important;
            padding-left: max(12px, env(safe-area-inset-left, 0px), var(--safe-area-inset-left, 0px)) !important;
            padding-right: max(12px, env(safe-area-inset-right, 0px), var(--safe-area-inset-right, 0px)) !important;
            gap: 8px !important;
          }
          .tooldesk-navbar-logo { height: 39px !important; }
        }
        @media (max-width:380px) {
          .tooldesk-nav-bar {
            height: calc(64px + max(env(safe-area-inset-top, 0px), var(--safe-area-inset-top, 0px))) !important;
            padding-top: max(env(safe-area-inset-top, 0px), var(--safe-area-inset-top, 0px)) !important;
            padding-bottom: 0 !important;
            padding-left: max(8px, env(safe-area-inset-left, 0px), var(--safe-area-inset-left, 0px)) !important;
            padding-right: max(8px, env(safe-area-inset-right, 0px), var(--safe-area-inset-right, 0px)) !important;
            gap: 6px !important;
          }
          .tooldesk-navbar-logo { height: 37.5px !important; }
          .nav-mobile { gap: 4px !important; }
        }
        @media (max-width:560px) {
          .popular-tools-grid { grid-template-columns: 1fr !important; }
          .search-esc-badge   { display: none !important; }
        }
      `}</style>
    </>
  )
}
