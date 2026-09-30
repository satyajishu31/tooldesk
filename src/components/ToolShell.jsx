import React, { memo, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { CAT_COLORS } from '../constants'
import ToolAnimation from './ToolAnimation'
import GeometricBackground from './GeometricBackground'
import AppIcon from './AppIcon'
import { getToolPrivacyTier } from '../utils/privacyTier'
import { isToolFavorite, toggleToolFavorite } from '../utils/favorites'
import { recordRecentTool } from '../utils/recentTools'
import { Clock } from 'lucide-react'

/* ── Spring presets ── */
const SPRING_ENTER = { type:'spring', stiffness:320, damping:28, mass:.8 }
const EASE_OUT     = { duration:.55, ease:[.22,1,.36,1] }

export const Reveal = memo(function Reveal({ children, delay=0, y=16 }) {
  return (
    <motion.div
      initial={{ opacity:0, y }}
      animate={{ opacity:1, y:0 }}
      transition={{ duration:.42, delay, ease:[.22,1,.36,1] }}
    >{children}</motion.div>
  )
})

export const ToolCard = memo(function ToolCard({ children, style={}, className='' }) {
  return (
    <div
      className={`tool-card-glass ${className}`.trim()}
      style={{
        borderRadius: 22, padding: 'clamp(16px,4vw,26px)',
        backfaceVisibility: 'hidden',
        transition: 'box-shadow .18s ease',
        ...style,
      }}>{children}</div>
  )
})

export default function ToolShell({ tool, children }) {
  const cat = CAT_COLORS[tool.cat] || { bg:'#f5f5f5', text:'#555', border:'rgba(0,0,0,.08)' }
  const [favorite, setFavorite] = useState(false)
  const [showPrivacyModal, setShowPrivacyModal] = useState(false)
  const privacy = getToolPrivacyTier(tool.id)

  useEffect(() => {
    setFavorite(isToolFavorite(tool.id))
    recordRecentTool(tool.id)
    const onFavChanged = () => setFavorite(isToolFavorite(tool.id))
    window.addEventListener('tooldesk-favorites-changed', onFavChanged)
    return () => window.removeEventListener('tooldesk-favorites-changed', onFavChanged)
  }, [tool.id])

  const handleToggleFavorite = () => {
    const updated = toggleToolFavorite(tool.id)
    setFavorite(updated)
  }

  return (
    <motion.div
      className="tool-shell tool-page"
      initial={{ opacity:0, y:6 }}
      animate={{ opacity:1, y:0 }}
      exit={{ opacity:0 }}
      transition={{ duration:.22, ease:[.22,1,.36,1] }}
      style={{ paddingTop:'calc(64px + max(env(safe-area-inset-top, 0px), var(--safe-area-inset-top, 0px)))', paddingBottom:'calc(48px + max(env(safe-area-inset-bottom, 0px), var(--safe-area-inset-bottom, 0px)))', minHeight:'100vh', background:'#fafbff' }}
    >
      {/* ── HERO BANNER ── */}
      <div className="tool-shell-hero" style={{
        position:'relative', overflow:'hidden',
        padding:'clamp(28px, 4vw, 56px) 16px clamp(18px, 3.2vw, 42px)',
        textAlign:'center',
        background:`linear-gradient(160deg,${cat.bg}99 0%,#fafbff 52%)`,
      }}>
        <GeometricBackground variant="hero" opacity={.45}/>

        {/* ── Top Header Navigation Bar (Flex Container: Zero Collision Guarantee) ── */}
        <div style={{
          position: 'absolute', top: 12, left: 'clamp(10px, 3vw, 16px)', right: 'clamp(10px, 3vw, 16px)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          zIndex: 10, pointerEvents: 'none'
        }}>
          {/* ← Back button */}
          <motion.div
            initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
            transition={{ delay: .04, ...EASE_OUT }}
            style={{ pointerEvents: 'auto' }}>
            <Link to="/" style={{ textDecoration: 'none', display: 'inline-block' }} aria-label="Back to all tools">
              <motion.span
                whileHover={{ x: -2, background: 'rgba(255,255,255,.98)' }}
                whileTap={{ scale: .94 }}
                className="tool-shell-back-btn"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '7px 14px', minHeight: 38, border: '1px solid rgba(0,0,0,.07)',
                  borderRadius: 999, background: 'rgba(255,255,255,.86)',
                  fontFamily: 'DM Sans,sans-serif', fontSize: 13, fontWeight: 600,
                  color: '#334155', cursor: 'pointer',
                  backdropFilter: 'blur(16px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(16px) saturate(180%)',
                  boxShadow: '0 2px 10px rgba(0,0,0,.04), inset 0 1px 0 rgba(255,255,255,0.95)',
                  transition: 'background .18s, box-shadow .18s, color .18s',
                  boxSizing: 'border-box',
                }}>
                <span>←</span>
                <span className="tool-shell-back-label">All Tools</span>
              </motion.span>
            </Link>
          </motion.div>

          {/* Header Right Controls: Favorite Toggle */}
          <motion.div
            initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}
            transition={{ delay: .04, ...EASE_OUT }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, pointerEvents: 'auto' }}>

            {/* History Button */}
            <motion.button
              type="button"
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: .96 }}
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('tooldesk-open-history'))
                }
              }}
              title="Open Local History"
              aria-label="Open Local History"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                padding: '7px 12px', minHeight: 38, border: '1px solid rgba(0,0,0,.07)',
                borderRadius: 999, background: 'rgba(255,255,255,.86)',
                fontFamily: 'DM Sans,sans-serif', fontSize: 13, fontWeight: 600,
                color: '#475569',
                cursor: 'pointer',
                backdropFilter: 'blur(16px) saturate(180%)',
                WebkitBackdropFilter: 'blur(16px) saturate(180%)',
                boxShadow: '0 2px 10px rgba(0,0,0,.04), inset 0 1px 0 rgba(255,255,255,0.95)',
                boxSizing: 'border-box',
                whiteSpace: 'nowrap',
              }}
            >
              <Clock size={13} style={{ color: '#4F8EF7' }} />
              <span className="header-btn-text">History</span>
            </motion.button>

            {/* Favorite Toggle */}
            <motion.button
              type="button"
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: .96 }}
              onClick={handleToggleFavorite}
              title={favorite ? 'Remove from favorites' : 'Add to favorites'}
              aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                padding: '7px 14px', minHeight: 38, border: '1px solid rgba(0,0,0,.07)',
                borderRadius: 999, background: 'rgba(255,255,255,.86)',
                fontFamily: 'DM Sans,sans-serif', fontSize: 13, fontWeight: 600,
                color: favorite ? '#d97706' : '#475569',
                cursor: 'pointer',
                backdropFilter: 'blur(16px) saturate(180%)',
                WebkitBackdropFilter: 'blur(16px) saturate(180%)',
                boxShadow: '0 2px 10px rgba(0,0,0,.04), inset 0 1px 0 rgba(255,255,255,0.95)',
                boxSizing: 'border-box',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ fontSize: 14 }}>{favorite ? '★' : '☆'}</span>
              <span className="header-btn-text">{favorite ? 'Starred' : 'Favorite'}</span>
            </motion.button>
          </motion.div>
        </div>

        {/* ── Icon with orbiting rings — CSS animations (never stop on refresh) ── */}
        <motion.div
          initial={{opacity:0, y:-18}}
          animate={{opacity:1, y:0}}
          transition={{duration:.45, ease:[.22,1,.36,1]}}
          style={{ marginBottom:'clamp(14px, 2.5vw, 24px)', display:'inline-flex', position:'relative', zIndex:2 }}>

          {/* Outer ambient glow — CSS pulse */}
          <div style={{ position:'absolute',inset:-26,borderRadius:'50%',
            background:`radial-gradient(circle,${cat.text}22 0%,transparent 66%)`,
            animation:'ts-pulse 3.4s ease-in-out infinite',
            pointerEvents:'none' }}/>

          {/* Outer dashed ring — CSS clockwise */}
          <div style={{ position:'absolute',inset:-24,borderRadius:'50%',
            border:`1.5px dashed ${cat.text}45`,
            animation:'ts-spin-cw 12s linear infinite',
            pointerEvents:'none' }}>
            <div style={{ position:'absolute',top:-5,left:'50%',transform:'translateX(-50%)',
              width:10,height:10,borderRadius:'50%',background:cat.text,
              boxShadow:`0 0 12px 3px ${cat.text}70`,
              animation:'ts-dot-cw 2.4s ease-in-out infinite' }}/>
          </div>

          {/* Inner dashed ring — CSS counter-clockwise */}
          <div style={{ position:'absolute',inset:-12,borderRadius:'50%',
            border:`1.5px dashed ${cat.text}30`,
            animation:'ts-spin-ccw 7.5s linear infinite',
            pointerEvents:'none' }}>
            <div style={{ position:'absolute',bottom:-4,left:'50%',transform:'translateX(-50%)',
              width:7,height:7,borderRadius:'50%',background:cat.text,
              boxShadow:`0 0 8px 2px ${cat.text}55`,
              animation:'ts-dot-ccw 1.8s ease-in-out infinite .6s' }}/>
          </div>

          {/* Icon container — CSS float */}
          <div style={{ background:'rgba(255,255,255,0.92)', backdropFilter:'blur(20px) saturate(180%)', WebkitBackdropFilter:'blur(20px) saturate(180%)',
            borderRadius:Math.round(80*.30), padding:6,
            border:'1px solid rgba(255,255,255,0.90)',
            boxShadow:`0 18px 54px rgba(0,0,0,.10), 0 6px 18px ${cat.text}20, inset 0 1px 0 rgba(255,255,255,1)`,
            animation:'ts-float 3.8s ease-in-out infinite' }}>
            <AppIcon src={tool.icon} alt={tool.title} size={80} priority={true} style={{ boxShadow:'none' }}/>
          </div>
        </motion.div>

        {/* Category badge */}
        <motion.div
          initial={{opacity:0, y:6}} animate={{opacity:1, y:0}}
          transition={{delay:.12, duration:.35, ease:[.22,1,.36,1]}}
          style={{marginBottom:10,position:'relative',zIndex:2}}>
          <motion.span
            whileHover={{ scale:1.06 }}
            whileTap={{ scale:.96 }}
            style={{ display:'inline-block',padding:'5px 14px',borderRadius:999,
              fontSize:12.5,fontWeight:700,letterSpacing:'.7px',textTransform:'uppercase',
              background:`${cat.bg}cc`,color:cat.text,border:`1px solid ${cat.border||'rgba(0,0,0,.07)'}`,
              backdropFilter:'blur(12px) saturate(160%)',WebkitBackdropFilter:'blur(12px) saturate(160%)',
              boxShadow:'0 2px 8px rgba(0,0,0,.03), inset 0 1px 0 rgba(255,255,255,0.85)',
              cursor:'default' }}>{tool.cat}</motion.span>
        </motion.div>

        {/* Title — letters slide up */}
        <motion.h1
          initial={{opacity:0,y:18}} animate={{opacity:1,y:0}}
          transition={{duration:.42,delay:.16,...EASE_OUT}}
          style={{ fontFamily:'Syne,sans-serif',fontSize:'clamp(22px,5.2vw,48px)',
            fontWeight:800,color:'#0d0d1a',marginBottom:10,lineHeight:1.15,
            position:'relative',zIndex:2,maxWidth:'100%',padding:'0 6px',
            boxSizing:'border-box',wordBreak:'normal',overflowWrap:'break-word' }}>
          {tool.title}
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{opacity:0,y:10}} animate={{opacity:1,y:0}}
          transition={{duration:.38,delay:.22,ease:[.22,1,.36,1]}}
          style={{ fontSize:'clamp(14.5px,1.8vw,16.5px)',color:'#475569',maxWidth:540,
            margin:'0 auto',fontWeight:400,lineHeight:1.75,position:'relative',zIndex:2 }}>
          {tool.desc}
        </motion.p>
      </div>

      {/* ── CONTENT ── */}
      <div style={{ maxWidth:800,margin:'0 auto',padding:'clamp(10px,2.5vw,22px) clamp(10px,3.5vw,16px) 64px' }}>
        <Reveal delay={.04}>
          <div className="tool-anim-wrapper">
            <ToolAnimation toolId={tool.id}/>
          </div>
        </Reveal>
        <Reveal delay={.1}>
          {children}
        </Reveal>
      </div>

      {/* Fixed ambient bg blobs */}
      <div style={{ position:'fixed', inset:0, overflow:'hidden', pointerEvents:'none', zIndex:-1 }}>
        <div style={{ position:'absolute',top:'18%',right:'-8%',width:300,height:300,borderRadius:'50%',
            background:`radial-gradient(circle,${cat.bg} 0%,transparent 70%)`,
            filter:'blur(32px)',pointerEvents:'none',
            animation:'ts-pulse 10s ease-in-out infinite',
            willChange:'opacity' }}/>
        <div style={{ position:'absolute',bottom:'12%',left:'-7%',width:240,height:240,borderRadius:'50%',
            background:'radial-gradient(circle,rgba(156,111,222,.09) 0%,transparent 70%)',
            filter:'blur(28px)',pointerEvents:'none',
            animation:'ts-pulse 12s ease-in-out infinite 2s',
            willChange:'opacity' }}/>
      </div>
    </motion.div>
  )
}
