import React, { memo } from 'react'

/* ══════════════════════════════════════════════════════
   GeometricBackground — Advanced layered background
   Pure CSS + SVG. GPU-accelerated. Zero JS runtime.
   ══════════════════════════════════════════════════════ */
export default memo(function GeometricBackground({ variant = 'hero', opacity = 1 }) {
  const dark = variant === 'dark'
  const ga   = dark ? '.20' : '.08'
  const da   = dark ? '.12' : '.06'
  const id   = dark ? 'gd' : 'gl'

  return (
    <div style={{
      position: 'absolute', inset: 0,
      overflow: 'hidden', zIndex: 0,
      pointerEvents: 'none', opacity,
      contain: 'strict',
    }}>

      {/* ── Fine grid (SVG pattern) ── */}
      <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%' }} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id={`${id}-sm`} width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none"
              stroke={`rgba(79,142,247,${ga})`} strokeWidth=".5"/>
          </pattern>
          <pattern id={`${id}-lg`} width="200" height="200" patternUnits="userSpaceOnUse">
            <path d="M 200 0 L 0 0 0 200" fill="none"
              stroke={`rgba(79,142,247,${dark ? '.30' : '.13'})`} strokeWidth="1"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${id}-sm)`}/>
        <rect width="100%" height="100%" fill={`url(#${id}-lg)`}/>
      </svg>

      {/* ── Diagonal shimmer bands — smooth bidirectional sway, zero snapping ── */}
      <div style={{ position:'absolute', inset:0 }}>
        {[0, 1].map(i => (
          <div key={i} style={{
            position: 'absolute', inset: 0,
            background: `linear-gradient(${i === 0 ? '128' : '-52'}deg,
              transparent 30%,
              rgba(${i === 0 ? '79,142,247' : '156,111,222'},${da}) 50%,
              transparent 70%)`,
            animation: `diag${i} ${18 + i * 6}s ease-in-out infinite`,
            willChange: 'transform,opacity',
          }}/>
        ))}
      </div>

      {/* ── Large ambient colour orbs ── */}
      <div style={{
        position: 'absolute', top: '-20%', right: '-14%',
        width: '50%', height: '60%',
        background: `radial-gradient(ellipse, rgba(79,142,247,${dark ? '.14' : '.10'}) 0%, transparent 68%)`,
        animation: 'orb1 16s ease-in-out infinite',
        willChange: 'transform',
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
        borderRadius: '50%',
      }}/>
      <div style={{
        position: 'absolute', bottom: '-20%', left: '-14%',
        width: '45%', height: '55%',
        background: `radial-gradient(ellipse, rgba(156,111,222,${dark ? '.12' : '.08'}) 0%, transparent 68%)`,
        animation: 'orb2 20s ease-in-out infinite',
        willChange: 'transform',
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
        borderRadius: '50%',
      }}/>
      {/* Third orb — pink accent, lighter */}
      {!dark && (
        <div style={{
          position: 'absolute', top: '25%', right: '-6%',
          width: '30%', height: '40%',
          background: 'radial-gradient(ellipse, rgba(240,98,146,.05) 0%, transparent 70%)',
          animation: 'orb3 26s ease-in-out infinite',
          willChange: 'transform',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          borderRadius: '50%',
        }}/>
      )}

      {/* ── Floating geometric shapes (hero only) ── */}
      {!dark && (
        <svg className="geo-float-shapes" style={{ position:'absolute', inset:0, width:'100%', height:'100%', overflow:'visible' }} xmlns="http://www.w3.org/2000/svg">
          {/* Top-left triangle */}
          <polygon points="60,80 120,80 90,30"
            fill="rgba(79,142,247,.05)" stroke="rgba(79,142,247,.12)" strokeWidth=".8"
            style={{ animation:'floatShape1 12s ease-in-out infinite' }}/>
          {/* Top-right diamond */}
          <g style={{ transform: 'translate(calc(100% - 80px), 90px)' }}>
            <polygon points="0,-30 30,0 0,30 -30,0"
              fill="rgba(156,111,222,.06)" stroke="rgba(156,111,222,.14)" strokeWidth=".8"
              style={{ animation:'floatShape2 15s ease-in-out infinite' }}/>
          </g>
          {/* Bottom-left circle ring */}
          <circle cx="8%" cy="78%" r="40"
            fill="none" stroke="rgba(240,98,146,.10)" strokeWidth="1"
            style={{ animation:'floatShape3 18s ease-in-out infinite' }}/>
          <circle cx="8%" cy="78%" r="25"
            fill="none" stroke="rgba(240,98,146,.07)" strokeWidth=".6"
            style={{ animation:'floatShape3 18s ease-in-out infinite reverse' }}/>
          {/* Bottom-right hexagon-ish */}
          <g style={{ transform: 'translate(calc(100% - 60px), calc(100% - 65px))' }}>
            <polygon points="0,35 30,10 30,-20 0,-30 -30,-5 -30,25"
              fill="rgba(79,142,247,.04)" stroke="rgba(79,142,247,.10)" strokeWidth=".8"
              style={{ animation:'floatShape2 20s ease-in-out infinite reverse' }}/>
          </g>
          {/* Mid-left crosshair */}
          <line x1="5%" y1="46%" x2="5%" y2="56%" stroke="rgba(79,142,247,.13)" strokeWidth=".8" style={{ animation:'floatShape1 10s ease-in-out infinite' }}/>
          <line x1="3%" y1="51%" x2="7%" y2="51%" stroke="rgba(79,142,247,.13)" strokeWidth=".8" style={{ animation:'floatShape1 10s ease-in-out infinite' }}/>
        </svg>
      )}

      {/* ── Noise texture overlay for premium feel ── */}
      <div className="geo-noise" style={{
        position: 'absolute', inset: 0,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E")`,
        opacity: dark ? 0.4 : 0.3,
      }}/>

      {/* Centre vignette for readability (hero only) */}
      {!dark && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse 62% 50% at 50% 50%, rgba(255,255,255,.80) 0%, rgba(255,255,255,.20) 65%, transparent 100%)',
        }}/>
      )}

      <style>{`
        @keyframes diag0 { 0%, 100% { transform:translate3d(0,0,0); opacity:.65; } 50% { transform:translate3d(6%,0,0); opacity:.95; } }
        @keyframes diag1 { 0%, 100% { transform:translate3d(0,0,0); opacity:.55; } 50% { transform:translate3d(-6%,0,0); opacity:.85; } }
        @keyframes orb1  { 0%,100%{transform:translate3d(0,0,0) scale3d(1,1,1)} 35%{transform:translate3d(-4%,5%,0) scale3d(1.08,1.08,1)} 65%{transform:translate3d(3%,-4%,0) scale3d(.94,.94,1)} }
        @keyframes orb2  { 0%,100%{transform:translate3d(0,0,0) scale3d(1,1,1)} 40%{transform:translate3d(5%,-4%,0) scale3d(1.06,1.06,1)} 70%{transform:translate3d(-3%,5%,0) scale3d(.96,.96,1)} }
        @keyframes orb3  { 0%,100%{transform:translate3d(0,0,0) scale3d(1,1,1)} 50%{transform:translate3d(-6%,3%,0) scale3d(1.1,1.1,1)} }
        @keyframes floatShape1 { 0%,100%{transform:translate3d(0,0,0) rotate3d(0,0,1,0deg)} 50%{transform:translate3d(8px,-12px,0) rotate3d(0,0,1,8deg)} }
        @keyframes floatShape2 { 0%,100%{transform:translate3d(0,0,0) rotate3d(0,0,1,0deg)} 50%{transform:translate3d(-6px,10px,0) rotate3d(0,0,1,-6deg)} }
        @keyframes floatShape3 { 0%,100%{transform:translate3d(0,0,0) scale3d(1,1,1)} 50%{transform:translate3d(5px,-8px,0) scale3d(1.08,1.08,1)} }

        /* Mobile: trim the priciest decorative layers (noise raster + tiny SVG shapes barely
           visible on small screens anyway) so the hero stays smooth on low-end phones.
           Nothing here touches desktop. */
        @media (max-width: 760px) {
          .geo-noise        { display: none; }
          .geo-float-shapes { display: none; }
        }
      `}</style>
    </div>
  )
})
