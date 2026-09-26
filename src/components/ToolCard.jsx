import React, { useRef, useState, memo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence, useSpring } from 'framer-motion'
import { CAT_COLORS } from '../constants'
import AppIcon from './AppIcon'

/**
 * ToolCard — zero-delay Framer Motion hover.
 * Uses useSpring for instant-response physics.
 * No CSS classes for hover — pure Framer Motion.
 */
const ToolCard = memo(function ToolCard({ tool, index = 0 }) {
  const cat     = CAT_COLORS[tool.cat] || { bg:'#f5f5f5', text:'#555', border:'rgba(0,0,0,.1)' }
  const cardRef = useRef(null)
  const spotRef = useRef(null)
  const rectRef = useRef(null)
  const rafMoveRef = useRef(null)
  const [hov,   setHov]   = useState(false)
  const [drawn, setDrawn] = useState(false)

  /* Ultra-responsive spring — stiffness 500+ = near-instant */
  const ySpring    = useSpring(0,  { stiffness:500, damping:28, mass:.4 })
  const scaleSpring= useSpring(1,  { stiffness:500, damping:28, mass:.4 })

  const onEnter = () => {
    rectRef.current = cardRef.current?.getBoundingClientRect() || null
    ySpring.set(-6)
    scaleSpring.set(1.014)
    setHov(true)
    requestAnimationFrame(() => setDrawn(true))
  }

  const onMove = e => {
    if (!spotRef.current) return
    const clientX = e.clientX
    const clientY = e.clientY
    if (rafMoveRef.current) return
    rafMoveRef.current = requestAnimationFrame(() => {
      rafMoveRef.current = null
      if (!rectRef.current && cardRef.current) {
        rectRef.current = cardRef.current.getBoundingClientRect()
      }
      const r = rectRef.current
      if (!r || !spotRef.current) return
      const x = ((clientX - r.left) / r.width)  * 100
      const y = ((clientY - r.top)  / r.height) * 100
      spotRef.current.style.background = `radial-gradient(circle 140px at ${x}% ${y}%, ${cat.bg} 0%, transparent 70%)`
    })
  }

  const onLeave = () => {
    if (rafMoveRef.current) {
      cancelAnimationFrame(rafMoveRef.current)
      rafMoveRef.current = null
    }
    rectRef.current = null
    ySpring.set(0)
    scaleSpring.set(1)
    setHov(false)
    setDrawn(false)
  }

  useEffect(() => {
    return () => {
      if (rafMoveRef.current) cancelAnimationFrame(rafMoveRef.current)
    }
  }, [])

  /* Mount animation — stagger capped at 160ms */
  const delay = Math.min((index % 4) * .05, .16)

  const isFeatured = tool.featured || ['pdf', 'bgremove', 'vault', 'fileconvert', 'password', 'websiteanalyzer'].includes(tool.id) || (index % 4 === 1)

  return (
    <motion.div
      initial={{ opacity:0, y:14 }}
      whileInView={{ opacity:1, y:0 }}
      viewport={{ once:true, amount:0.01 }}
      transition={{ duration:.34, delay, ease:[.16,1,.3,1] }}
      whileTap={{ scale:.98 }}
      style={{ willChange:'transform,opacity', transform:'translateZ(0)' }}>

      <Link to={tool.path} style={{ textDecoration:'none', display:'block' }}>
        <motion.div
          ref={cardRef}
          onMouseMove={onMove}
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
          style={{
            y: ySpring,
            scale: scaleSpring,
            transform: 'translateZ(0)',
            willChange: 'transform, box-shadow',
            background: isFeatured
              ? (hov ? 'rgba(255, 255, 255, 0.90)' : 'rgba(255, 255, 255, 0.82)')
              : (hov ? 'rgba(255, 255, 255, 0.98)' : 'rgba(255, 255, 255, 0.92)'),
            backdropFilter: isFeatured ? 'blur(18px) saturate(180%)' : 'blur(12px) saturate(160%)',
            WebkitBackdropFilter: isFeatured ? 'blur(18px) saturate(180%)' : 'blur(12px) saturate(160%)',
            border: `1px solid ${hov ? `${cat.text}40` : isFeatured ? 'rgba(255, 255, 255, 0.90)' : 'rgba(0,0,0,.06)'}`,
            borderRadius: 24, padding: '24px 22px',
            cursor: 'pointer', position: 'relative', overflow: 'hidden',
            contain: 'paint layout',
            boxShadow: hov
              ? `0 20px 48px rgba(0,0,0,.08), 0 6px 18px ${cat.text}16, inset 0 1px 0 rgba(255,255,255,1)`
              : isFeatured
              ? '0 4px 20px rgba(0,0,0,.04), 0 1px 3px rgba(0,0,0,.02), inset 0 1px 0 rgba(255,255,255,.98)'
              : '0 2px 10px rgba(0,0,0,.03), 0 1px 2px rgba(0,0,0,.02), inset 0 1px 0 rgba(255,255,255,.9)',
            transition: 'box-shadow .18s, border-color .18s, background .18s',
            WebkitBackfaceVisibility: 'hidden',
            backfaceVisibility: 'hidden',
          }}>

          {/* Magnetic spotlight — GPU composited */}
          <motion.div
            ref={spotRef}
            animate={{ opacity: hov ? 1 : 0 }}
            transition={{ duration:.18 }}
            style={{
              position:'absolute', inset:0, pointerEvents:'none', zIndex:0,
              background:`radial-gradient(circle 140px at 50% 30%, ${cat.bg} 0%, transparent 70%)`,
              willChange:'opacity',
            }}/>

          {/* Ambient glow — top-right */}
          <motion.div
            animate={{ opacity: hov ? .95 : .3, scale: hov ? 1.12 : 1 }}
            transition={{ duration:.22, ease:[.22,1,.36,1] }}
            style={{
              position:'absolute', top:-36, right:-36, width:160, height:160,
              borderRadius:'50%', background:cat.bg,
              filter:'blur(32px)', pointerEvents:'none', zIndex:0,
              willChange:'opacity,transform',
            }}/>

          {/* SVG border draw */}
          <AnimatePresence>
            {drawn && hov && (
              <svg key="b"
                style={{ position:'absolute', inset:0, width:'100%', height:'100%',
                  pointerEvents:'none', borderRadius:24, zIndex:5, overflow:'visible' }}
                viewBox="0 0 100 100" preserveAspectRatio="none">
                <motion.rect
                  x=".8" y=".8" rx="8" ry="8" width="98.4" height="98.4"
                  fill="none" stroke={cat.text} strokeWidth=".9" strokeOpacity=".5"
                  initial={{ pathLength:0, opacity:0 }}
                  animate={{ pathLength:1, opacity:1 }}
                  exit={{ opacity:0 }}
                  transition={{ duration:.5, ease:[.22,1,.36,1] }}
                  vectorEffect="non-scaling-stroke"/>
              </svg>
            )}
          </AnimatePresence>

          {/* Icon + pulse ring */}
          <div style={{ position:'relative', zIndex:1, marginBottom:16, display:'inline-flex' }}>
            <motion.div
              animate={{ scale: hov ? 1.1 : 1, rotate: hov ? -4 : 0 }}
              transition={{ type:'spring', stiffness:400, damping:22, mass:.5 }}
              style={{ position:'relative' }}>
              <AppIcon src={tool.icon} alt={tool.title} size={48}/>
              <AnimatePresence>
                {hov && (
                  <motion.div key="ring"
                    initial={{ scale:.6, opacity:.8 }}
                    animate={{ scale:2, opacity:0 }}
                    exit={{ opacity:0 }}
                    transition={{ duration:.7, ease:'easeOut' }}
                    style={{ position:'absolute', inset:0, borderRadius:'30%',
                      background:cat.bg, zIndex:-1 }}/>
                )}
              </AnimatePresence>
            </motion.div>
          </div>

          {/* Category badge */}
          <div style={{ marginBottom:8, position:'relative', zIndex:1 }}>
            <span style={{ display:'inline-block', padding:'4.5px 13px', borderRadius:999,
              fontSize:12.5, fontWeight:700, letterSpacing:'.6px', textTransform:'uppercase',
              background:cat.bg, color:cat.text, border:`1px solid ${cat.border}`,
              backdropFilter:'blur(10px) saturate(160%)', WebkitBackdropFilter:'blur(10px) saturate(160%)',
              boxShadow:'0 1px 4px rgba(0,0,0,.02), inset 0 1px 0 rgba(255,255,255,.85)' }}>
              {tool.cat}
            </span>
          </div>

          {/* Title */}
          <div style={{ fontFamily:'Syne,sans-serif', fontSize:19, fontWeight:700,
            color:'#0d0d1a', marginBottom:7, lineHeight:1.25, position:'relative', zIndex:1 }}>
            {tool.title}
          </div>

          {/* Description */}
          <p style={{ fontSize:14, color:'#475569', lineHeight:1.62, marginBottom:18,
            fontWeight:400, position:'relative', zIndex:1 }}>
            {tool.desc}
          </p>

          {/* CTA row */}
          <div style={{ display:'flex', alignItems:'center', gap:6,
            position:'relative', zIndex:1 }}>
            <motion.span
              animate={{ color: hov ? cat.text : '#4F8EF7' }}
              transition={{ duration:.15 }}
              style={{ fontSize:14, fontWeight:700 }}>
              Open Tool
            </motion.span>
            <motion.span
              animate={{ x: hov ? 5 : 0, color: hov ? cat.text : '#4F8EF7' }}
              transition={{ type:'spring', stiffness:500, damping:24 }}
              style={{ fontSize:16, fontWeight:700 }}>→</motion.span>
          </div>

        </motion.div>
      </Link>
    </motion.div>
  )
})

export default ToolCard
