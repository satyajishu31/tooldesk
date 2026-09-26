import React, { memo, useState } from 'react'

/**
 * AppIcon — Apple iOS squircle style icon.
 * Memoized — same src/size never re-renders.
 * Supports priority/eager loading for above-the-fold icons and fallback for failed image loads.
 */
export default memo(function AppIcon({ src, alt = '', size = 54, priority = false, style = {} }) {
  const radius = Math.round(size * 0.30)
  const [hasError, setHasError] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const isEager = priority || size >= 64

  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: radius,
      overflow: 'hidden',
      flexShrink: 0,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, rgba(79,142,247,0.12) 0%, rgba(156,111,222,0.12) 100%)',
      boxShadow: `0 ${Math.round(size*0.05)}px ${Math.round(size*0.22)}px rgba(0,0,0,0.14), 0 1px 4px rgba(0,0,0,0.08)`,
      position: 'relative',
      ...style,
    }}>
      {!hasError && src ? (
        <img
          src={src}
          alt={alt}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center',
            display: 'block',
            opacity: loaded ? 1 : 0.9,
            transition: 'opacity 0.15s ease',
          }}
          loading={isEager ? 'eager' : 'lazy'}
          decoding={isEager ? 'sync' : 'async'}
          onLoad={() => setLoaded(true)}
          onError={() => setHasError(true)}
        />
      ) : (
        <div style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #4F8EF7 0%, #9333EA 100%)',
          color: '#ffffff',
          fontSize: Math.round(size * 0.44),
          fontWeight: 800,
          fontFamily: 'Syne, sans-serif',
          userSelect: 'none',
        }}>
          {alt ? (
            alt.charAt(0).toUpperCase()
          ) : (
            <svg width={Math.round(size * 0.44)} height={Math.round(size * 0.44)} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          )}
        </div>
      )}
    </div>
  )
})
