import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Download, Copy, Check } from 'lucide-react'
import {
  DEFAULT_RELEASE_CONFIG,
  getReleaseManifest,
  resolveArtifactUrl,
  CURRENT_RELEASE_VERSION,
  detectCpuArchitecture,
  partitionFormatsForPlatform,
} from '../utils/releaseConfig'
import { isDownloadAppAvailable } from '../utils/apiConfig'

export function detectUserPlatform() {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = (navigator.userAgent || '').toLowerCase()
  const plat = (navigator.platform || '').toLowerCase()

  // iPadOS in Safari requests desktop site by default, reporting MacIntel with touch points
  const isIPad = (plat === 'macintel' || /macintosh/.test(ua)) && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1
  if (/iphone|ipad|ipod/.test(ua) || isIPad) return 'ios'
  if (/android/.test(ua)) return 'android'
  if (/win/.test(plat) || /windows/.test(ua)) return 'windows'
  if (/mac/.test(plat) || /macintosh/.test(ua)) return 'macos'
  if (/linux/.test(plat) || /linux/.test(ua)) return 'linux'

  return 'web'
}

export function detectInAppBrowser() {
  if (typeof navigator === 'undefined') return null
  const ua = (navigator.userAgent || '').toLowerCase()
  if (/instagram/.test(ua)) return 'Instagram'
  if (/fban|fbav|fb_iab/.test(ua)) return 'Facebook'
  if (/whatsapp/.test(ua)) return 'WhatsApp'
  if (/telegram/.test(ua)) return 'Telegram'
  if (/tiktok|musical_ly|bytedance/.test(ua)) return 'TikTok'
  if (/line\//.test(ua)) return 'Line'
  if (/\btwitter\b|twitterandroid|twitter for iphone/.test(ua)) return 'X (Twitter)'
  if (/micromessenger/.test(ua)) return 'WeChat'
  if (/snapchat/.test(ua)) return 'Snapchat'
  return null
}

export function isStandaloneMode() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true ||
    (typeof document !== 'undefined' && document.referrer.includes('android-app://'))
  )
}

/* ──────────────────────────────────────────────────────────
   PLATFORM BRAND ICON BADGES
   Apple-grade illuminated squircle badges for each OS
   ────────────────────────────────────────────────────────── */
function PlatformIcon({ id, size = 30 }) {
  const r = Math.round(size * 0.28)
  switch (id) {
    case 'macos':
      return (
        <div style={{
          width: size, height: size, borderRadius: r,
          background: 'linear-gradient(135deg, #232736 0%, #11131a 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.25)',
          color: '#ffffff', flexShrink: 0,
        }}>
          <svg width={Math.round(size * 0.56)} height={Math.round(size * 0.56)} viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.4c.66-.82 1.11-1.96.99-3.1-.96.04-2.11.64-2.8 1.45-.6.7-1.13 1.83-1 2.93 1.08.08 2.16-.54 2.81-1.28"/>
          </svg>
        </div>
      )
    case 'windows':
      return (
        <div style={{
          width: size, height: size, borderRadius: r,
          background: 'linear-gradient(135deg, #0078D4 0%, #00539C 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0,120,212,0.26), inset 0 1px 0 rgba(255,255,255,0.3)',
          color: '#ffffff', flexShrink: 0,
        }}>
          <svg width={Math.round(size * 0.5)} height={Math.round(size * 0.5)} viewBox="0 0 24 24" fill="currentColor">
            <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.949-1.801"/>
          </svg>
        </div>
      )
    case 'android':
      return (
        <div style={{
          width: size, height: size, borderRadius: r,
          background: 'linear-gradient(135deg, #3DDC84 0%, #16A34A 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(22,163,74,0.26), inset 0 1px 0 rgba(255,255,255,0.35)',
          color: '#ffffff', flexShrink: 0,
        }}>
          <svg width={Math.round(size * 0.56)} height={Math.round(size * 0.56)} viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-1.0003 0-.5517.4482-1.0003.9993-1.0003.5517 0 .9997.4486.9997 1.0003 0 .5517-.448 1.0003-.9997 1.0003m-11.046 0c-.5511 0-.9993-.4486-.9993-1.0003 0-.5517.4482-1.0003.9993-1.0003.5517 0 .9997.4486.9997 1.0003 0 .5517-.448 1.0003-.9997 1.0003m11.4045-6.02l1.9973-3.4592a.416.416 0 00-.1521-.5676.416.416 0 00-.5676.1521l-2.0223 3.503C15.5902 8.4116 13.8533 8.089 12 8.089c-1.8535 0-3.5905.3226-5.1367.8607L4.841 5.4467a.4161.4161 0 00-.5677-.1521.4157.4157 0 00-.1521.5676l1.9973 3.4592C2.6889 11.1867.3432 14.6589 0 18.761h24c-.3435-4.1021-2.6892-7.5743-6.1185-9.4396"/>
          </svg>
        </div>
      )
    case 'linux':
      return (
        <div style={{
          width: size, height: size, borderRadius: r,
          background: 'linear-gradient(135deg, #374151 0%, #1e2530 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.2)',
          color: '#ffffff', flexShrink: 0,
        }}>
          <span style={{ fontSize: Math.round(size * 0.54), lineHeight: 1 }}>🐧</span>
        </div>
      )
    case 'ios':
      return (
        <div style={{
          width: size, height: size, borderRadius: r,
          background: 'linear-gradient(135deg, #6366F1 0%, #4338CA 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(99,102,241,0.26), inset 0 1px 0 rgba(255,255,255,0.3)',
          color: '#ffffff', flexShrink: 0,
        }}>
          <svg width={Math.round(size * 0.5)} height={Math.round(size * 0.5)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="2" width="14" height="20" rx="3" ry="3"/>
            <line x1="12" y1="18" x2="12.01" y2="18"/>
          </svg>
        </div>
      )
    case 'pwa':
    default:
      return (
        <div style={{
          width: size, height: size, borderRadius: r,
          background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(245,158,11,0.26), inset 0 1px 0 rgba(255,255,255,0.35)',
          color: '#ffffff', flexShrink: 0,
        }}>
          <svg width={Math.round(size * 0.52)} height={Math.round(size * 0.52)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
        </div>
      )
  }
}

export default function DownloadAppModal({ isOpen, onClose }) {
  if (!isDownloadAppAvailable()) return null

  const [platform, setPlatform] = useState('unknown')
  const [cpuArch, setCpuArch] = useState('unknown')
  const [showAll, setShowAll] = useState(false)
  const [expandedOthers, setExpandedOthers] = useState({})
  const [expandedPrimaryOther, setExpandedPrimaryOther] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [pwaInstalled, setPwaInstalled] = useState(false)
  const [inAppBrowser, setInAppBrowser] = useState(null)
  const [showInstallGuide, setShowInstallGuide] = useState(false)
  const [installSuccess, setInstallSuccess] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [copiedMacCmd, setCopiedMacCmd] = useState(false)
  const [showMacGatekeeper, setShowMacGatekeeper] = useState(false)
  const [copiedChecksum, setCopiedChecksum] = useState('')
  const [downloadingId, setDownloadingId] = useState('')
  const [showIosSafariGuide, setShowIosSafariGuide] = useState(false)
  const modalRef = useRef(null)

  const toggleOtherDownloads = useCallback((platformId) => {
    setExpandedOthers(prev => ({
      ...prev,
      [platformId]: !prev[platformId]
    }))
  }, [])

  // Centralized Release Manifest State
  const [manifest, setManifest] = useState(DEFAULT_RELEASE_CONFIG)

  // Load latest verified release manifest asynchronously
  useEffect(() => {
    let isMounted = true
    getReleaseManifest().then((data) => {
      if (isMounted && data) {
        setManifest(data)
      }
    }).catch(() => {})
    return () => { isMounted = false }
  }, [])

  // Platform and install prompt listeners
  useEffect(() => {
    setPlatform(detectUserPlatform())
    setCpuArch(detectCpuArchitecture())

    // Progressive enhancement: modern Chromium Client Hints for high-entropy architecture
    if (typeof navigator !== 'undefined' && navigator.userAgentData?.getHighEntropyValues) {
      navigator.userAgentData.getHighEntropyValues(['architecture']).then((values) => {
        if (values?.architecture === 'arm') {
          setCpuArch('arm64')
        } else if (values?.architecture === 'x86') {
          setCpuArch('x64')
        }
      }).catch(() => {})
    }

    setInAppBrowser(detectInAppBrowser())
    if (isStandaloneMode()) {
      setPwaInstalled(true)
    }

    if (typeof window !== 'undefined' && window.__tooldeskInstallPrompt) {
      setDeferredPrompt(window.__tooldeskInstallPrompt)
    }

    const handleBeforeInstall = (e) => {
      e.preventDefault()
      window.__tooldeskInstallPrompt = e
      setDeferredPrompt(e)
    }

    const handleCustomReady = (e) => {
      if (e.detail) {
        setDeferredPrompt(e.detail)
      } else if (window.__tooldeskInstallPrompt) {
        setDeferredPrompt(window.__tooldeskInstallPrompt)
      }
    }

    const handleAppInstalled = () => {
      setPwaInstalled(true)
      setInstallSuccess(true)
      setDeferredPrompt(null)
      if (typeof window !== 'undefined') {
        window.__tooldeskInstallPrompt = null
      }
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    window.addEventListener('tooldesk-install-ready', handleCustomReady)
    window.addEventListener('appinstalled', handleAppInstalled)
    window.addEventListener('tooldesk-installed', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      window.removeEventListener('tooldesk-install-ready', handleCustomReady)
      window.removeEventListener('appinstalled', handleAppInstalled)
      window.removeEventListener('tooldesk-installed', handleAppInstalled)
    }
  }, [])

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  // Lock background body scroll while modal is active
  useEffect(() => {
    if (!isOpen) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [isOpen])

  // Focus management and accessibility trap
  useEffect(() => {
    if (!isOpen) return
    const prevActive = document.activeElement

    const timer = setTimeout(() => {
      if (modalRef.current) {
        const closeBtn = modalRef.current.querySelector('button[aria-label="Close download dialog"]')
        if (closeBtn) closeBtn.focus()
      }
    }, 60)

    const handleKeyDown = (e) => {
      if (e.key === 'Tab' && modalRef.current) {
        const focusables = modalRef.current.querySelectorAll(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault()
            last.focus()
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault()
            first.focus()
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('keydown', handleKeyDown)
      if (prevActive && typeof prevActive.focus === 'function') {
        try { prevActive.focus() } catch {}
      }
    }
  }, [isOpen])

  const copyMacCommand = (e) => {
    e?.stopPropagation()
    navigator.clipboard?.writeText('xattr -cr /Applications/ToolDesk.app')
    setCopiedMacCmd(true)
    setTimeout(() => setCopiedMacCmd(false), 2500)
  }

  const copyChecksum = (e, hash) => {
    e?.stopPropagation()
    if (!hash) return
    navigator.clipboard?.writeText(hash)
    setCopiedChecksum(hash)
    setTimeout(() => setCopiedChecksum(''), 2500)
  }

  // 1-Click PWA Browser Install Trigger
  const handlePwaInstall = async () => {
    const promptEvent = deferredPrompt || (typeof window !== 'undefined' ? window.__tooldeskInstallPrompt : null)
    if (promptEvent) {
      try {
        promptEvent.prompt()
        const { outcome } = await promptEvent.userChoice
        if (outcome === 'accepted') {
          setPwaInstalled(true)
          setInstallSuccess(true)
        }
      } catch (err) {
        console.warn('Install prompt error:', err)
        setShowInstallGuide(true)
      }
      setDeferredPrompt(null)
      if (typeof window !== 'undefined') window.__tooldeskInstallPrompt = null
    } else {
      setShowInstallGuide(prev => !prev)
    }
  }

  // Trigger download with responsive feedback state
  const handleDownloadClick = useCallback((id, url) => {
    if (!url) return
    setDownloadingId(id)
    setTimeout(() => {
      setDownloadingId('')
    }, 3200)
  }, [])

  // Compile full platform cards merged with live manifest
  const platforms = useMemo(() => {
    const list = [
      {
        id: 'windows',
        name: manifest.platforms?.windows?.name || 'Windows',
        badge: manifest.platforms?.windows?.badge || 'Desktop App',
        desc: manifest.platforms?.windows?.desc || 'Windows 10 & 11 • 64-bit Installer',
        status: manifest.platforms?.windows?.status || 'coming-soon',
        formats: (manifest.platforms?.windows?.formats || []).map(f => ({
          ...f,
          resolvedUrl: resolveArtifactUrl('windows', f, manifest)
        }))
      },
      {
        id: 'macos',
        name: manifest.platforms?.macos?.name || 'macOS',
        badge: manifest.platforms?.macos?.badge || 'Universal .DMG',
        desc: manifest.platforms?.macos?.desc || 'Apple Silicon & Intel • Standalone App',
        status: manifest.platforms?.macos?.status || 'available',
        formats: (manifest.platforms?.macos?.formats || []).map(f => ({
          ...f,
          resolvedUrl: resolveArtifactUrl('macos', f, manifest)
        }))
      },
      {
        id: 'linux',
        name: manifest.platforms?.linux?.name || 'Linux',
        badge: manifest.platforms?.linux?.badge || 'Universal Linux',
        desc: manifest.platforms?.linux?.desc || 'Wayland & X11 • Desktop Packages',
        status: manifest.platforms?.linux?.status || 'coming-soon',
        formats: (manifest.platforms?.linux?.formats || []).map(f => ({
          ...f,
          resolvedUrl: resolveArtifactUrl('linux', f, manifest)
        }))
      },
      {
        id: 'android',
        name: manifest.platforms?.android?.name || 'Android',
        badge: manifest.platforms?.android?.badge || 'Official .APK',
        desc: manifest.platforms?.android?.desc || 'Direct Standalone .APK • Offline & Private',
        status: manifest.platforms?.android?.status || 'available',
        storeUrl: manifest.platforms?.android?.storeUrl || '',
        formats: (manifest.platforms?.android?.formats || []).map(f => ({
          ...f,
          resolvedUrl: resolveArtifactUrl('android', f, manifest)
        }))
      },
      {
        id: 'ios',
        name: manifest.platforms?.ios?.name || 'iPhone / iPad',
        badge: manifest.platforms?.ios?.badge || 'iOS Standalone',
        desc: manifest.platforms?.ios?.desc || 'Add to Home Screen • Full Screen Offline',
        status: manifest.platforms?.ios?.status || 'pwa-ready',
        storeUrl: manifest.platforms?.ios?.storeUrl || '',
        testflightUrl: manifest.platforms?.ios?.testflightUrl || '',
        formats: []
      },
      {
        id: 'pwa',
        name: manifest.platforms?.pwa?.name || 'Web App (PWA)',
        badge: manifest.platforms?.pwa?.badge || 'Zero Install',
        desc: manifest.platforms?.pwa?.desc || 'Runs in Chrome, Edge, Safari offline',
        status: 'available',
        formats: [
          {
            type: 'pwa',
            label: '1-Click Browser Install',
            arch: 'Any Browser',
            filename: '',
            size: 'Instant',
            status: 'available',
            resolvedUrl: '/'
          }
        ]
      }
    ]

    return list
  }, [manifest])

  const detectedConfig = platforms.find(p => p.id === platform) || platforms[0]

  return (
    <AnimatePresence>
      {isOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1200 }}>
          {/* Subtle ~30% Frosted Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(10, 12, 24, 0.52)',
              backdropFilter: 'blur(16px) saturate(160%)',
              WebkitBackdropFilter: 'blur(16px) saturate(160%)',
            }}
          />

          {/* Centered Scrollable Viewport Container */}
          <div
            style={{
              position: 'fixed',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              paddingTop: 'max(clamp(10px, 3vw, 24px), env(safe-area-inset-top, 0px))',
              paddingBottom: 'max(clamp(10px, 3vw, 24px), env(safe-area-inset-bottom, 0px))',
              paddingLeft: 'max(clamp(10px, 3vw, 24px), env(safe-area-inset-left, 0px))',
              paddingRight: 'max(clamp(10px, 3vw, 24px), env(safe-area-inset-right, 0px))',
              pointerEvents: 'none',
              overflowY: 'auto',
              boxSizing: 'border-box',
            }}>
            <motion.div
              ref={modalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="tooldesk-download-title"
              initial={{ opacity: 0, scale: 0.94, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ type: 'spring', stiffness: 420, damping: 28 }}
              style={{
                pointerEvents: 'auto',
                width: '100%',
                maxWidth: 510,
                maxHeight: 'min(93vh, 740px)',
                display: 'flex',
                flexDirection: 'column',
                background: 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                borderRadius: 26,
                boxShadow: '0 32px 84px rgba(10, 14, 29, 0.28), 0 4px 20px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 1)',
                border: '1px solid rgba(255, 255, 255, 0.85)',
                fontFamily: 'DM Sans, sans-serif',
                boxSizing: 'border-box',
                overflow: 'hidden',
                margin: 'auto',
                position: 'relative',
              }}>

              {/* Ambient Glow Gradient */}
              <div style={{
                position: 'absolute',
                top: -70,
                right: -70,
                width: 240,
                height: 240,
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(79,142,247,0.2) 0%, rgba(156,111,222,0.12) 40%, transparent 70%)',
                filter: 'blur(20px)',
                pointerEvents: 'none',
              }} />

              {/* Modal Header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 'clamp(14px, 3.5vw, 18px) clamp(16px, 4vw, 22px) 14px',
                borderBottom: '1px solid rgba(0,0,0,0.06)',
                flexShrink: 0,
                position: 'relative',
                zIndex: 2,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: '1 1 auto' }}>
                  {/* Floating 3D Cloud Download Icon */}
                  <motion.div
                    animate={{ y: [0, -3, 0] }}
                    transition={{ repeat: Infinity, duration: 3.2, ease: 'easeInOut' }}
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.95 }}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 14,
                      background: 'linear-gradient(135deg, rgba(79,142,247,0.16) 0%, rgba(156,111,222,0.2) 100%)',
                      border: '1px solid rgba(79,142,247,0.28)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      padding: 5,
                      boxShadow: '0 6px 18px rgba(79,142,247,0.18), inset 0 1px 0 rgba(255,255,255,0.95)',
                    }}>
                    <img
                      src="/download-logo.png"
                      alt="ToolDesk"
                      onError={e => {
                        if (!e.currentTarget.dataset.fallback) {
                          e.currentTarget.dataset.fallback = '1'
                          e.currentTarget.src = 'download-logo.png'
                        }
                      }}
                      style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                    />
                  </motion.div>

                  <div style={{ minWidth: 0, flex: '1 1 auto' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <h3
                        id="tooldesk-download-title"
                        style={{
                          fontFamily: 'Syne, sans-serif',
                          fontWeight: 800,
                          fontSize: 'clamp(16px, 4vw, 19px)',
                          margin: 0,
                          color: '#0d0d1a',
                          letterSpacing: '-0.35px',
                          lineHeight: 1.2,
                        }}>
                        ToolDesk App
                      </h3>
                      <span style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: '#2563eb',
                        background: 'rgba(79,142,247,0.12)',
                        padding: '1px 6px',
                        borderRadius: 6,
                        border: '1px solid rgba(79,142,247,0.2)',
                      }}>
                        v{manifest.version || CURRENT_RELEASE_VERSION}
                      </span>
                    </div>
                    <p style={{ margin: '3px 0 0', fontSize: 'clamp(11.5px, 2.6vw, 13px)', color: '#64748b', fontWeight: 400, lineHeight: 1.35 }}>
                      Use ToolDesk wherever you work • 100% private &amp; offline
                    </p>
                  </div>
                </div>

                <motion.button
                  onClick={onClose}
                  aria-label="Close download dialog"
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.92 }}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 12,
                    border: '1px solid rgba(0,0,0,0.07)',
                    background: 'rgba(241, 245, 249, 0.85)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#64748b',
                    fontSize: 14,
                    fontWeight: 700,
                    flexShrink: 0,
                    marginLeft: 8,
                  }}>
                  ✕
                </motion.button>
              </div>

              {/* Modal Body */}
              <div style={{ padding: '16px 20px 28px', overflowY: 'auto', flex: 1, minHeight: 0, WebkitOverflowScrolling: 'touch', position: 'relative', zIndex: 1 }}>

                {/* ═══ In-App Browser Warning ═══ */}
                {inAppBrowser && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                      background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
                      border: '1px solid #fcd34d',
                      borderRadius: 14,
                      padding: '10px 14px',
                      marginBottom: 14,
                      fontSize: 12.5,
                      color: '#92400e',
                      lineHeight: 1.45,
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                    }}>
                    <span style={{ fontSize: 16 }}>⚠️</span>
                    <div>
                      <strong>Viewing inside {inAppBrowser}:</strong> Tap the menu (⋮ or ⋯) and select <strong>"Open in Chrome"</strong> or <strong>"Open in Safari"</strong> for instant install and direct downloads.
                    </div>
                  </motion.div>
                )}

                {/* ═══ Success Confirmation Banner ═══ */}
                {installSuccess && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    style={{
                      background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
                      border: '1px solid #6ee7b7',
                      borderRadius: 14,
                      padding: '12px 14px',
                      marginBottom: 14,
                      fontSize: 13,
                      color: '#065f46',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                    }}>
                    <span style={{ fontSize: 18 }}>🎉</span>
                    <span>ToolDesk is installed! Launch it anytime from your Home Screen or Applications.</span>
                  </motion.div>
                )}

                {/* ═══ Detected Platform Primary Card ═══ */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05, duration: 0.25 }}
                  style={{
                    background: 'linear-gradient(150deg, #f8faff 0%, #edf4ff 100%)',
                    border: '1.5px solid rgba(79,142,247,0.28)',
                    borderRadius: 22,
                    padding: '16px 18px',
                    marginBottom: 14,
                    boxShadow: '0 12px 30px rgba(79,142,247,0.1), inset 0 1px 0 rgba(255,255,255,0.95)',
                    position: 'relative',
                    overflow: 'hidden',
                  }}>

                  {/* Header Row: Badge & Version */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '.4px',
                      color: '#2563eb',
                      background: 'rgba(79,142,247,0.12)',
                      border: '1px solid rgba(79,142,247,0.2)',
                      padding: '3px 9px',
                      borderRadius: 999,
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2563eb', display: 'inline-block' }} />
                      <span>Recommended for {detectedConfig.name}</span>
                    </span>

                    <span style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#64748b',
                      background: 'rgba(255,255,255,0.85)',
                      padding: '2px 8px',
                      borderRadius: 8,
                      border: '1px solid rgba(0,0,0,0.05)',
                    }}>
                      v{manifest.version || '1.0.0'} • Offline Suite
                    </span>
                  </div>

                  {/* Platform Brand Row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                    <PlatformIcon id={detectedConfig.id} size={42} />
                    <div style={{ minWidth: 0, flex: '1 1 auto' }}>
                      <div style={{
                        fontFamily: 'Syne, sans-serif',
                        fontWeight: 800,
                        fontSize: 'clamp(16px, 4vw, 18px)',
                        color: '#0d0d1a',
                        letterSpacing: '-0.3px',
                        lineHeight: 1.25,
                      }}>
                        ToolDesk for {detectedConfig.name}
                      </div>
                      <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 2, fontWeight: 500, lineHeight: 1.35 }}>
                        {detectedConfig.desc}
                      </div>
                    </div>
                  </div>

                  {/* Quick Feature Pillars */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 6,
                    marginBottom: 14,
                    padding: '8px 10px',
                    borderRadius: 12,
                    background: 'rgba(255, 255, 255, 0.75)',
                    border: '1px solid rgba(79,142,247,0.15)',
                    fontSize: 11.5,
                    color: '#334155',
                    fontWeight: 600,
                    textAlign: 'center',
                  }}>
                    <div>⚡ 1-Sec Launch</div>
                    <div>📴 100% Offline</div>
                    <div>🔒 Zero Telemetry</div>
                  </div>

                  {/* 1. macOS Primary Action */}
                  {platform === 'macos' && (() => {
                    const { primary: macPrimary, secondary: macSecondary } = partitionFormatsForPlatform('macos', detectedConfig.formats, cpuArch)
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {macPrimary && macPrimary.resolvedUrl && (
                          <motion.a
                            key={macPrimary.filename || macPrimary.type}
                            href={macPrimary.resolvedUrl}
                            download={macPrimary.filename || 'ToolDesk.dmg'}
                            onClick={() => handleDownloadClick('macos-primary', macPrimary.resolvedUrl)}
                            role="button"
                            whileHover={{ scale: 1.02, y: -1 }}
                            whileTap={{ scale: 0.97 }}
                            style={{
                              position: 'relative',
                              overflow: 'hidden',
                              width: '100%',
                              minHeight: 52,
                              padding: '12px 18px',
                              borderRadius: 14,
                              background: 'linear-gradient(135deg, #1e2530 0%, #11141c 100%)',
                              color: '#ffffff',
                              border: '1px solid rgba(255, 255, 255, 0.2)',
                              fontWeight: 700,
                              fontFamily: 'DM Sans, sans-serif',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 12,
                              boxShadow: '0 8px 24px rgba(13,13,26,0.26), inset 0 1px 0 rgba(255,255,255,0.25)',
                              boxSizing: 'border-box',
                              textDecoration: 'none'
                            }}>
                            <PlatformIcon id="macos" size={24} />
                            <div style={{ textAlign: 'left' }}>
                              <div style={{ fontWeight: 800, fontSize: 14.5, lineHeight: 1.2 }}>
                                {downloadingId === 'macos-primary' ? 'Preparing download…' : (
                                  cpuArch === 'x64'
                                    ? 'Download for Mac (Intel .dmg)'
                                    : (cpuArch === 'arm64' ? 'Download for Mac (Apple Silicon .dmg)' : 'Download for Mac (.dmg)')
                                )}
                              </div>
                              <div style={{ fontSize: 11, opacity: 0.9, fontWeight: 500 }}>
                                {macPrimary.arch || 'Apple Silicon & Intel'} • {macPrimary.size} • Standalone
                              </div>
                            </div>
                          </motion.a>
                        )}

                        {/* macOS Secondary Format (.zip) & SHA-256 */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap', fontSize: 11.5, color: '#475569', padding: '0 4px' }}>
                          <span>Drag into Applications to install.</span>
                          {macPrimary?.checksum && (
                            <button
                              type="button"
                              onClick={(e) => copyChecksum(e, macPrimary.checksum)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#2563eb',
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                              }}>
                              <Copy size={12} />
                              <span>{copiedChecksum === macPrimary.checksum ? '✓ SHA-256 Copied' : 'Copy SHA-256'}</span>
                            </button>
                          )}
                        </div>

                        {/* Collapsed Other Downloads for macOS */}
                        {macSecondary && macSecondary.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <motion.button
                              type="button"
                              onClick={() => setExpandedPrimaryOther(s => !s)}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedPrimaryOther(s => !s); } }}
                              aria-expanded={expandedPrimaryOther}
                              aria-controls="macos-other-primary"
                              whileHover={{ scale: 1.01 }}
                              whileTap={{ scale: 0.98 }}
                              style={{
                                background: 'none',
                                border: 'none',
                                padding: '4px 6px',
                                color: '#475569',
                                fontSize: 11.5,
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                                alignSelf: 'flex-start',
                              }}>
                              <span>Other downloads</span>
                              <motion.span
                                animate={{ rotate: expandedPrimaryOther ? 180 : 0 }}
                                transition={{ duration: 0.2 }}
                                style={{ display: 'inline-flex', alignItems: 'center' }}>
                                <ChevronDown size={13} />
                              </motion.span>
                            </motion.button>

                            <AnimatePresence initial={false}>
                              {expandedPrimaryOther && (
                                <motion.div
                                  id="macos-other-primary"
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  exit={{ opacity: 0, height: 0 }}
                                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                                  style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 2 }}>
                                  {macSecondary.map(fmt => (
                                    <div
                                      key={fmt.filename || fmt.label}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: 8,
                                        padding: '7px 10px',
                                        borderRadius: 10,
                                        background: '#ffffff',
                                        border: '1px solid rgba(0,0,0,0.08)',
                                      }}>
                                      <motion.a
                                        href={fmt.resolvedUrl}
                                        download={fmt.filename || true}
                                        onClick={() => handleDownloadClick(`mac-${fmt.filename}`, fmt.resolvedUrl)}
                                        role="button"
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: 6,
                                          fontSize: 12,
                                          fontWeight: 700,
                                          color: '#0d0d1a',
                                          textDecoration: 'none',
                                          minWidth: 0,
                                        }}>
                                        <Download size={13} color="#2563eb" />
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                          {downloadingId === `mac-${fmt.filename}` ? 'Preparing…' : fmt.label}
                                        </span>
                                        <span style={{ fontSize: 10.5, color: '#64748b', fontWeight: 500 }}>({fmt.size})</span>
                                      </motion.a>
                                      {fmt.checksum && (
                                        <button
                                          type="button"
                                          onClick={(e) => copyChecksum(e, fmt.checksum)}
                                          title={`SHA-256: ${fmt.checksum}`}
                                          style={{
                                            padding: '3px 7px',
                                            borderRadius: 6,
                                            background: 'rgba(0,0,0,0.04)',
                                            border: '1px solid rgba(0,0,0,0.06)',
                                            fontSize: 10,
                                            fontWeight: 600,
                                            color: '#475569',
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 3,
                                            flexShrink: 0,
                                          }}>
                                          <Copy size={10} />
                                          <span>{copiedChecksum === fmt.checksum ? '✓' : 'SHA-256'}</span>
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )}

                        {/* Gatekeeper Helper */}
                        <div style={{
                          background: '#fefce8',
                          border: '1px solid #fef08a',
                          borderRadius: 12,
                          padding: '10px 12px',
                          fontSize: 12,
                          color: '#713f12',
                          lineHeight: 1.45,
                        }}>
                          <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                            <span>🛡️ If macOS flags <em>"damaged and can't be opened"</em>:</span>
                            <button
                              type="button"
                              onClick={() => setShowMacGatekeeper(s => !s)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#ca8a04',
                                fontWeight: 700,
                                fontSize: 11.5,
                                cursor: 'pointer',
                                textDecoration: 'underline',
                              }}>
                              {showMacGatekeeper ? 'Hide' : 'Quick fix'}
                            </button>
                          </div>
                          {showMacGatekeeper && (
                            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                              <div>Run this in Terminal or Right-Click <strong>ToolDesk.app</strong> → click <strong>Open</strong>:</div>
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                background: '#1e293b',
                                color: '#38bdf8',
                                padding: '6px 10px',
                                borderRadius: 8,
                                fontFamily: 'monospace',
                                fontSize: 11.5,
                                gap: 6,
                              }}>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>xattr -cr /Applications/ToolDesk.app</span>
                                <button
                                  type="button"
                                  onClick={copyMacCommand}
                                  style={{
                                    background: copiedMacCmd ? '#16a34a' : 'rgba(255,255,255,0.18)',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: 6,
                                    padding: '3px 8px',
                                    fontSize: 10.5,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                  }}>
                                  {copiedMacCmd ? '✓ Copied' : 'Copy'}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Optional 1-Click Browser Install */}
                        <button
                          type="button"
                          onClick={handlePwaInstall}
                          style={{
                            width: '100%',
                            padding: '9px 14px',
                            borderRadius: 12,
                            background: '#ffffff',
                            border: '1px solid rgba(0,0,0,0.08)',
                            color: '#334155',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                          }}>
                          <span>⚡</span>
                          <span>Or 1-Click Install via Browser (Instant / No DMG)</span>
                        </button>
                      </div>
                    )
                  })()}

                  {/* 2. Android Primary Action */}
                  {platform === 'android' && (() => {
                    const { primary: androidPrimary } = partitionFormatsForPlatform('android', detectedConfig.formats, cpuArch)
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {androidPrimary && androidPrimary.resolvedUrl && (
                          <motion.a
                            key={androidPrimary.type}
                            href={androidPrimary.resolvedUrl}
                            download={androidPrimary.filename || 'ToolDesk.apk'}
                            onClick={() => handleDownloadClick('android-apk', androidPrimary.resolvedUrl)}
                            role="button"
                            whileHover={{ scale: 1.02, y: -1 }}
                            whileTap={{ scale: 0.97 }}
                            style={{
                              position: 'relative',
                              overflow: 'hidden',
                              width: '100%',
                              minHeight: 52,
                              padding: '12px 18px',
                              borderRadius: 14,
                              background: 'linear-gradient(135deg, #15803d 0%, #16a34a 50%, #14532d 100%)',
                              color: '#ffffff',
                              border: '1px solid rgba(255, 255, 255, 0.25)',
                              fontWeight: 700,
                              fontFamily: 'DM Sans, sans-serif',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 12,
                              boxShadow: '0 8px 24px rgba(22,163,74,0.28), inset 0 1px 0 rgba(255,255,255,0.3)',
                              boxSizing: 'border-box',
                              textDecoration: 'none'
                            }}>
                            <Download size={22} color="#ffffff" />
                            <div style={{ textAlign: 'left' }}>
                              <div style={{ fontWeight: 800, fontSize: 14.5, lineHeight: 1.2 }}>
                                {downloadingId === 'android-apk' ? 'Preparing APK download…' : 'Download Android APK (.apk)'}
                              </div>
                              <div style={{ fontSize: 11, opacity: 0.92, fontWeight: 500 }}>
                                Standalone Sideload • {androidPrimary.size} • Full Offline
                              </div>
                            </div>
                          </motion.a>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap', fontSize: 11.5, color: '#15803d', fontWeight: 600, padding: '0 4px' }}>
                          <span>✓ Sideload ready. Tap downloaded file to install.</span>
                          {androidPrimary?.checksum && (
                            <button
                              type="button"
                              onClick={(e) => copyChecksum(e, androidPrimary.checksum)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#15803d',
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                              }}>
                              <Copy size={12} />
                              <span>{copiedChecksum === androidPrimary.checksum ? '✓ SHA-256 Copied' : 'Copy SHA-256'}</span>
                            </button>
                          )}
                        </div>

                        {/* 1-Click Browser Install */}
                        <button
                          type="button"
                          onClick={handlePwaInstall}
                          style={{
                            width: '100%',
                            padding: '9px 14px',
                            borderRadius: 12,
                            background: '#ffffff',
                            border: '1px solid rgba(0,0,0,0.08)',
                            color: '#334155',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                          }}>
                          <span>⚡</span>
                          <span>Or 1-Click Install via Browser (Instant / No APK)</span>
                        </button>

                        {showInstallGuide && !pwaInstalled && (
                          <div style={{
                            background: '#ffffff',
                            border: '1px solid rgba(79,142,247,0.25)',
                            borderRadius: 12,
                            padding: '10px 12px',
                            fontSize: 12,
                            color: '#334155',
                            lineHeight: 1.45,
                          }}>
                            <strong style={{ color: '#16a34a', display: 'block', marginBottom: 4 }}>
                              📲 How to install in Chrome / Samsung Internet:
                            </strong>
                            1. Tap the three dots (⋮) in your browser top-right.<br />
                            2. Tap <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {/* 3. iOS (iPhone / iPad) Primary Action */}
                  {platform === 'ios' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{
                        background: '#ffffff',
                        border: '1px solid rgba(99,102,241,0.22)',
                        borderRadius: 16,
                        padding: '14px 16px',
                        boxShadow: '0 4px 14px rgba(99,102,241,0.08)',
                      }}>
                        <div style={{ fontWeight: 700, fontSize: 13.5, color: '#1e1b4b', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>📱</span>
                          <span>Install on iPhone / iPad (3 Easy Steps)</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5, color: '#475569', lineHeight: 1.4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#6366F1', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>1</span>
                            <span>Tap the <strong>Share</strong> button (<strong>⎋</strong> with arrow) at the bottom of Safari.</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#6366F1', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>2</span>
                            <span>Scroll down and tap <strong>"Add to Home Screen"</strong> (➕).</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#6366F1', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>3</span>
                            <span>Tap <strong>"Add"</strong> in the top right corner.</span>
                          </div>
                        </div>
                        <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px dashed rgba(0,0,0,0.08)', fontSize: 11.5, color: '#6366F1', fontWeight: 600 }}>
                          ✨ Installs as a standalone full-screen offline application!
                        </div>
                      </div>

                      {detectedConfig.storeUrl && (
                        <a
                          href={detectedConfig.storeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          role="button"
                          style={{
                            width: '100%',
                            padding: '10px 14px',
                            borderRadius: 12,
                            background: '#000000',
                            color: '#fff',
                            fontSize: 13,
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            textDecoration: 'none',
                            boxSizing: 'border-box'
                          }}>
                          <span></span>
                          <span>Get on App Store</span>
                        </a>
                      )}
                    </div>
                  )}

                  {/* 4. Windows Primary Action */}
                  {platform === 'windows' && (() => {
                    const { primary: winPrimary, secondary: winSecondary } = partitionFormatsForPlatform('windows', detectedConfig.formats, cpuArch)
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {winPrimary && winPrimary.status === 'available' && winPrimary.resolvedUrl ? (
                          <>
                            <motion.a
                              key={winPrimary.filename || winPrimary.type}
                              href={winPrimary.resolvedUrl}
                              download={winPrimary.filename || 'ToolDesk-Setup.exe'}
                              onClick={() => handleDownloadClick('win-primary', winPrimary.resolvedUrl)}
                              role="button"
                              whileHover={{ scale: 1.02, y: -1 }}
                              whileTap={{ scale: 0.97 }}
                              style={{
                                width: '100%',
                                minHeight: 50,
                                padding: '12px 18px',
                                borderRadius: 14,
                                background: 'linear-gradient(135deg, #0078D4 0%, #00539C 100%)',
                                color: '#ffffff',
                                border: '1px solid rgba(255, 255, 255, 0.25)',
                                fontWeight: 700,
                                fontFamily: 'DM Sans, sans-serif',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 12,
                                boxShadow: '0 8px 24px rgba(0,120,212,0.28)',
                                boxSizing: 'border-box',
                                textDecoration: 'none'
                              }}>
                              <PlatformIcon id="windows" size={24} />
                              <div style={{ textAlign: 'left' }}>
                                <div style={{ fontWeight: 800, fontSize: 14.5 }}>
                                  {downloadingId === 'win-primary' ? 'Preparing download…' : `Download ${winPrimary.label}`}
                                </div>
                                <div style={{ fontSize: 11, opacity: 0.9 }}>
                                  Windows 10 &amp; 11 • {winPrimary.arch || 'x64'} • {winPrimary.size}
                                </div>
                              </div>
                            </motion.a>

                            {/* Windows Primary SHA-256 */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap', fontSize: 11.5, color: '#475569', padding: '0 4px' }}>
                              <span>Official 64-bit installer for Windows.</span>
                              {winPrimary.checksum && (
                                <button
                                  type="button"
                                  onClick={(e) => copyChecksum(e, winPrimary.checksum)}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#0078D4',
                                    fontSize: 11,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4,
                                  }}>
                                  <Copy size={12} />
                                  <span>{copiedChecksum === winPrimary.checksum ? '✓ SHA-256 Copied' : 'Copy SHA-256'}</span>
                                </button>
                              )}
                            </div>

                            {/* Collapsed Secondary Windows downloads (.msi) */}
                            {winSecondary && winSecondary.length > 0 && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <motion.button
                                  type="button"
                                  onClick={() => setExpandedPrimaryOther(s => !s)}
                                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedPrimaryOther(s => !s); } }}
                                  aria-expanded={expandedPrimaryOther}
                                  aria-controls="win-other-primary"
                                  whileHover={{ scale: 1.01 }}
                                  whileTap={{ scale: 0.98 }}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    padding: '4px 6px',
                                    color: '#475569',
                                    fontSize: 11.5,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 5,
                                    alignSelf: 'flex-start',
                                  }}>
                                  <span>Other downloads</span>
                                  <motion.span
                                    animate={{ rotate: expandedPrimaryOther ? 180 : 0 }}
                                    transition={{ duration: 0.2 }}
                                    style={{ display: 'inline-flex', alignItems: 'center' }}>
                                    <ChevronDown size={13} />
                                  </motion.span>
                                </motion.button>

                                <AnimatePresence initial={false}>
                                  {expandedPrimaryOther && (
                                    <motion.div
                                      id="win-other-primary"
                                      initial={{ opacity: 0, height: 0 }}
                                      animate={{ opacity: 1, height: 'auto' }}
                                      exit={{ opacity: 0, height: 0 }}
                                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                                      style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 2 }}>
                                      {winSecondary.map(fmt => (
                                        <div
                                          key={fmt.filename || fmt.label}
                                          style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: 8,
                                            padding: '7px 10px',
                                            borderRadius: 10,
                                            background: '#ffffff',
                                            border: '1px solid rgba(0,0,0,0.08)',
                                          }}>
                                          <motion.a
                                            href={fmt.resolvedUrl}
                                            download={fmt.filename || true}
                                            onClick={() => handleDownloadClick(`win-${fmt.filename}`, fmt.resolvedUrl)}
                                            role="button"
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                            style={{
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              gap: 6,
                                              fontSize: 12,
                                              fontWeight: 700,
                                              color: '#0d0d1a',
                                              textDecoration: 'none',
                                              minWidth: 0,
                                            }}>
                                            <Download size={13} color="#0078D4" />
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                              {downloadingId === `win-${fmt.filename}` ? 'Preparing…' : fmt.label}
                                            </span>
                                            <span style={{ fontSize: 10.5, color: '#64748b', fontWeight: 500 }}>({fmt.size})</span>
                                          </motion.a>
                                          {fmt.checksum && (
                                            <button
                                              type="button"
                                              onClick={(e) => copyChecksum(e, fmt.checksum)}
                                              title={`SHA-256: ${fmt.checksum}`}
                                              style={{
                                                padding: '3px 7px',
                                                borderRadius: 6,
                                                background: 'rgba(0,0,0,0.04)',
                                                border: '1px solid rgba(0,0,0,0.06)',
                                                fontSize: 10,
                                                fontWeight: 600,
                                                color: '#475569',
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: 3,
                                                flexShrink: 0,
                                              }}>
                                              <Copy size={10} />
                                              <span>{copiedChecksum === fmt.checksum ? '✓' : 'SHA-256'}</span>
                                            </button>
                                          )}
                                        </div>
                                      ))}
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            )}
                          </>
                        ) : (
                          /* Fallback PWA button if installer not available */
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <motion.button
                              onClick={handlePwaInstall}
                              whileHover={{ scale: 1.02, y: -1 }}
                              whileTap={{ scale: 0.97 }}
                              style={{
                                width: '100%',
                                minHeight: 50,
                                padding: '12px 18px',
                                borderRadius: 14,
                                background: 'linear-gradient(135deg, #0078D4 0%, #00539C 100%)',
                                color: '#ffffff',
                                border: '1px solid rgba(255, 255, 255, 0.25)',
                                fontWeight: 700,
                                fontFamily: 'DM Sans, sans-serif',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 12,
                                boxShadow: '0 8px 24px rgba(0,120,212,0.28)',
                              }}>
                              <PlatformIcon id="windows" size={24} />
                              <div style={{ textAlign: 'left' }}>
                                <div style={{ fontWeight: 800, fontSize: 14.5 }}>
                                  {pwaInstalled ? '✓ ToolDesk is Installed' : 'Install ToolDesk on Windows (1-Click)'}
                                </div>
                                <div style={{ fontSize: 11, opacity: 0.9 }}>
                                  Desktop Window • Works Offline • Zero Install Delay
                                </div>
                              </div>
                            </motion.button>
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {/* 5. Linux Primary Action */}
                  {platform === 'linux' && (() => {
                    const { primary: linuxPrimary, secondary: linuxSecondary } = partitionFormatsForPlatform('linux', detectedConfig.formats, cpuArch)
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {linuxPrimary && linuxPrimary.status === 'available' && linuxPrimary.resolvedUrl ? (
                          <>
                            <motion.a
                              key={linuxPrimary.filename || linuxPrimary.type}
                              href={linuxPrimary.resolvedUrl}
                              download={linuxPrimary.filename || 'ToolDesk.AppImage'}
                              onClick={() => handleDownloadClick('linux-primary', linuxPrimary.resolvedUrl)}
                              role="button"
                              whileHover={{ scale: 1.02, y: -1 }}
                              whileTap={{ scale: 0.97 }}
                              style={{
                                width: '100%',
                                minHeight: 50,
                                padding: '12px 18px',
                                borderRadius: 14,
                                background: 'linear-gradient(135deg, #374151 0%, #1e2530 100%)',
                                color: '#ffffff',
                                border: '1px solid rgba(255, 255, 255, 0.2)',
                                fontWeight: 700,
                                fontFamily: 'DM Sans, sans-serif',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 12,
                                boxShadow: '0 8px 24px rgba(0,0,0,0.22)',
                                boxSizing: 'border-box',
                                textDecoration: 'none'
                              }}>
                              <PlatformIcon id="linux" size={24} />
                              <div style={{ textAlign: 'left' }}>
                                <div style={{ fontWeight: 800, fontSize: 14.5 }}>
                                  {downloadingId === 'linux-primary' ? 'Preparing download…' : `Download ${linuxPrimary.label}`}
                                </div>
                                <div style={{ fontSize: 11, opacity: 0.9 }}>
                                  Wayland &amp; X11 • {linuxPrimary.arch || 'x86_64'} • {linuxPrimary.size}
                                </div>
                              </div>
                            </motion.a>

                            {/* Linux Primary SHA-256 */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap', fontSize: 11.5, color: '#475569', padding: '0 4px' }}>
                              <span>chmod +x &amp; run standalone binary.</span>
                              {linuxPrimary.checksum && (
                                <button
                                  type="button"
                                  onClick={(e) => copyChecksum(e, linuxPrimary.checksum)}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#2563eb',
                                    fontSize: 11,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4,
                                  }}>
                                  <Copy size={12} />
                                  <span>{copiedChecksum === linuxPrimary.checksum ? '✓ SHA-256 Copied' : 'Copy SHA-256'}</span>
                                </button>
                              )}
                            </div>

                            {/* Collapsed Secondary Linux downloads (.deb) */}
                            {linuxSecondary && linuxSecondary.length > 0 && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <motion.button
                                  type="button"
                                  onClick={() => setExpandedPrimaryOther(s => !s)}
                                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedPrimaryOther(s => !s); } }}
                                  aria-expanded={expandedPrimaryOther}
                                  aria-controls="linux-other-primary"
                                  whileHover={{ scale: 1.01 }}
                                  whileTap={{ scale: 0.98 }}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    padding: '4px 6px',
                                    color: '#475569',
                                    fontSize: 11.5,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 5,
                                    alignSelf: 'flex-start',
                                  }}>
                                  <span>Other downloads</span>
                                  <motion.span
                                    animate={{ rotate: expandedPrimaryOther ? 180 : 0 }}
                                    transition={{ duration: 0.2 }}
                                    style={{ display: 'inline-flex', alignItems: 'center' }}>
                                    <ChevronDown size={13} />
                                  </motion.span>
                                </motion.button>

                                <AnimatePresence initial={false}>
                                  {expandedPrimaryOther && (
                                    <motion.div
                                      id="linux-other-primary"
                                      initial={{ opacity: 0, height: 0 }}
                                      animate={{ opacity: 1, height: 'auto' }}
                                      exit={{ opacity: 0, height: 0 }}
                                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                                      style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 2 }}>
                                      {linuxSecondary.map(fmt => (
                                        <div
                                          key={fmt.filename || fmt.label}
                                          style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: 8,
                                            padding: '7px 10px',
                                            borderRadius: 10,
                                            background: '#ffffff',
                                            border: '1px solid rgba(0,0,0,0.08)',
                                          }}>
                                          <motion.a
                                            href={fmt.resolvedUrl}
                                            download={fmt.filename || true}
                                            onClick={() => handleDownloadClick(`linux-${fmt.filename}`, fmt.resolvedUrl)}
                                            role="button"
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                            style={{
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              gap: 6,
                                              fontSize: 12,
                                              fontWeight: 700,
                                              color: '#0d0d1a',
                                              textDecoration: 'none',
                                              minWidth: 0,
                                            }}>
                                            <Download size={13} color="#2563eb" />
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                              {downloadingId === `linux-${fmt.filename}` ? 'Preparing…' : fmt.label}
                                            </span>
                                            <span style={{ fontSize: 10.5, color: '#64748b', fontWeight: 500 }}>({fmt.size})</span>
                                          </motion.a>
                                          {fmt.checksum && (
                                            <button
                                              type="button"
                                              onClick={(e) => copyChecksum(e, fmt.checksum)}
                                              title={`SHA-256: ${fmt.checksum}`}
                                              style={{
                                                padding: '3px 7px',
                                                borderRadius: 6,
                                                background: 'rgba(0,0,0,0.04)',
                                                border: '1px solid rgba(0,0,0,0.06)',
                                                fontSize: 10,
                                                fontWeight: 600,
                                                color: '#475569',
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: 3,
                                                flexShrink: 0,
                                              }}>
                                              <Copy size={10} />
                                              <span>{copiedChecksum === fmt.checksum ? '✓' : 'SHA-256'}</span>
                                            </button>
                                          )}
                                        </div>
                                      ))}
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            )}

                            {/* 1-Click Browser Install */}
                            <button
                              type="button"
                              onClick={handlePwaInstall}
                              style={{
                                width: '100%',
                                padding: '9px 14px',
                                borderRadius: 12,
                                background: '#ffffff',
                                border: '1px solid rgba(0,0,0,0.08)',
                                color: '#334155',
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 6,
                              }}>
                              <span>⚡</span>
                              <span>Or 1-Click Install via Browser (Instant PWA)</span>
                            </button>
                          </>
                        ) : (
                          /* PWA button */
                          <motion.button
                            onClick={handlePwaInstall}
                            whileHover={{ scale: 1.02, y: -1 }}
                            whileTap={{ scale: 0.97 }}
                            style={{
                              position: 'relative',
                              overflow: 'hidden',
                              width: '100%',
                              minHeight: 50,
                              padding: '12px 18px',
                              borderRadius: 14,
                              background: 'linear-gradient(135deg, #101426 0%, #1a2238 50%, #0d0d1a 100%)',
                              color: '#ffffff',
                              border: '1px solid rgba(255, 255, 255, 0.15)',
                              fontWeight: 700,
                              fontFamily: 'DM Sans, sans-serif',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 12,
                              boxShadow: '0 8px 24px rgba(13,13,26,0.22)',
                            }}>
                            <PlatformIcon id="linux" size={24} />
                            <div style={{ textAlign: 'left' }}>
                              <div style={{ fontWeight: 800, fontSize: 14.5 }}>
                                {pwaInstalled ? '✓ ToolDesk is Installed' : 'Install ToolDesk for Linux'}
                              </div>
                              <div style={{ fontSize: 11, opacity: 0.9 }}>
                                Standalone Desktop App • 100% Offline • Zero Install Size
                              </div>
                            </div>
                          </motion.button>
                        )}
                      </div>
                    )
                  })()}

                  {/* 6. Web / Unknown Browsers Primary Action */}
                  {(platform === 'web' || platform === 'unknown') && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <motion.button
                        onClick={handlePwaInstall}
                        whileHover={{ scale: 1.02, y: -1 }}
                        whileTap={{ scale: 0.97 }}
                        style={{
                          position: 'relative',
                          overflow: 'hidden',
                          width: '100%',
                          minHeight: 50,
                          padding: '12px 18px',
                          borderRadius: 14,
                          background: 'linear-gradient(135deg, #101426 0%, #1a2238 50%, #0d0d1a 100%)',
                          color: '#ffffff',
                          border: '1px solid rgba(255, 255, 255, 0.15)',
                          fontWeight: 700,
                          fontFamily: 'DM Sans, sans-serif',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 12,
                          boxShadow: '0 8px 24px rgba(13,13,26,0.22)',
                        }}>
                        <PlatformIcon id={detectedConfig.id} size={24} />
                        <div style={{ textAlign: 'left' }}>
                          <div style={{ fontWeight: 800, fontSize: 14.5 }}>
                            {pwaInstalled ? '✓ ToolDesk is Installed' : `Install ToolDesk for ${detectedConfig.name}`}
                          </div>
                          <div style={{ fontSize: 11, opacity: 0.9 }}>
                            Standalone Desktop App • 100% Offline • Zero Install Size
                          </div>
                        </div>
                      </motion.button>

                      {showInstallGuide && !pwaInstalled && (
                        <div style={{
                          background: '#ffffff',
                          border: '1px solid rgba(79,142,247,0.25)',
                          borderRadius: 12,
                          padding: '10px 12px',
                          fontSize: 12,
                          color: '#334155',
                          lineHeight: 1.45,
                        }}>
                          <strong style={{ color: '#2563eb', display: 'block', marginBottom: 4 }}>
                            💻 How to install in your browser:
                          </strong>
                          1. Click the <strong>Install icon (⊕ or ⬇)</strong> on the right side of your URL address bar.<br />
                          2. Or click browser menu (⋮) → select <strong>"Install ToolDesk..."</strong>.
                        </div>
                      )}
                    </div>
                  )}

                </motion.div>

                {/* ═══ Direct Standalone Downloads Quick Shelf (Always Visible) ═══ */}
                <div style={{
                  marginBottom: 14,
                  padding: '12px 14px',
                  borderRadius: 16,
                  background: 'linear-gradient(135deg, #f0f7ff 0%, #e6efff 100%)',
                  border: '1px solid rgba(79,142,247,0.22)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: '#1e3a8a', textTransform: 'uppercase', letterSpacing: '.4px' }}>
                      📦 Standalone Release Artifacts
                    </span>
                    <span style={{ fontSize: 10.5, color: '#3b82f6', fontWeight: 600 }}>100% Client-Side Privacy</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
                    {/* Android APK */}
                    {platforms.find(p => p.id === 'android')?.formats.find(f => f.type === 'apk')?.resolvedUrl ? (
                      <a
                        href={platforms.find(p => p.id === 'android')?.formats.find(f => f.type === 'apk')?.resolvedUrl}
                        download="ToolDesk.apk"
                        onClick={() => handleDownloadClick('shelf-apk', true)}
                        style={{ textDecoration: 'none' }}>
                        <motion.div
                          whileHover={{ scale: 1.02, background: '#ffffff', borderColor: '#16a34a' }}
                          whileTap={{ scale: 0.97 }}
                          style={{
                            background: 'rgba(255,255,255,0.85)',
                            border: '1px solid rgba(22,163,74,0.3)',
                            borderRadius: 12,
                            padding: '8px 10px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            cursor: 'pointer',
                          }}>
                          <PlatformIcon id="android" size={26} />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontWeight: 800, fontSize: 11.5, color: '#0d0d1a', lineHeight: 1.25 }}>Android APK</div>
                            <div style={{ fontSize: 10.5, color: '#16a34a', fontWeight: 700 }}>
                              .apk • {platforms.find(p => p.id === 'android')?.formats.find(f => f.type === 'apk')?.size || '34 MB'} ⬇️
                            </div>
                          </div>
                        </motion.div>
                      </a>
                    ) : null}

                    {/* macOS DMG */}
                    {platforms.find(p => p.id === 'macos')?.formats.find(f => f.type === 'dmg')?.resolvedUrl ? (
                      <a
                        href={platforms.find(p => p.id === 'macos')?.formats.find(f => f.type === 'dmg')?.resolvedUrl}
                        download="ToolDesk.dmg"
                        onClick={() => handleDownloadClick('shelf-dmg', true)}
                        style={{ textDecoration: 'none' }}>
                        <motion.div
                          whileHover={{ scale: 1.02, background: '#ffffff', borderColor: '#232736' }}
                          whileTap={{ scale: 0.97 }}
                          style={{
                            background: 'rgba(255,255,255,0.85)',
                            border: '1px solid rgba(0,0,0,0.15)',
                            borderRadius: 12,
                            padding: '8px 10px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            cursor: 'pointer',
                          }}>
                          <PlatformIcon id="macos" size={26} />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontWeight: 800, fontSize: 11.5, color: '#0d0d1a', lineHeight: 1.25 }}>macOS DMG</div>
                            <div style={{ fontSize: 10.5, color: '#2563eb', fontWeight: 700 }}>
                              .dmg • {platforms.find(p => p.id === 'macos')?.formats.find(f => f.type === 'dmg')?.size || '91 MB'} ⬇️
                            </div>
                          </div>
                        </motion.div>
                      </a>
                    ) : null}

                    {/* Windows App */}
                    <motion.div
                      onClick={() => {
                        const winFmt = platforms.find(p => p.id === 'windows')?.formats.find(f => f.status === 'available' && f.resolvedUrl)
                        if (winFmt) {
                          window.location.href = winFmt.resolvedUrl
                        } else {
                          handlePwaInstall()
                        }
                      }}
                      whileHover={{ scale: 1.02, background: '#ffffff', borderColor: '#0078D4' }}
                      whileTap={{ scale: 0.97 }}
                      style={{
                        background: 'rgba(255,255,255,0.85)',
                        border: '1px solid rgba(0,120,212,0.25)',
                        borderRadius: 12,
                        padding: '8px 10px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        cursor: 'pointer',
                      }}>
                      <PlatformIcon id="windows" size={26} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 800, fontSize: 11.5, color: '#0d0d1a', lineHeight: 1.25 }}>Windows App</div>
                        <div style={{ fontSize: 10.5, color: '#0078D4', fontWeight: 700 }}>Desktop ⚡</div>
                      </div>
                    </motion.div>

                    {/* iOS / Web Universal */}
                    <motion.div
                      onClick={() => {
                        if (platform === 'ios') {
                          setShowIosSafariGuide(prev => !prev)
                        } else {
                          handlePwaInstall()
                        }
                      }}
                      whileHover={{ scale: 1.02, background: '#ffffff', borderColor: '#6366F1' }}
                      whileTap={{ scale: 0.97 }}
                      style={{
                        background: 'rgba(255,255,255,0.85)',
                        border: '1px solid rgba(99,102,241,0.25)',
                        borderRadius: 12,
                        padding: '8px 10px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        cursor: 'pointer',
                      }}>
                      <PlatformIcon id={platform === 'ios' ? 'ios' : 'pwa'} size={26} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 800, fontSize: 11.5, color: '#0d0d1a', lineHeight: 1.25 }}>
                          {platform === 'ios' ? 'iOS Safari' : 'Web / Linux'}
                        </div>
                        <div style={{ fontSize: 10.5, color: '#6366F1', fontWeight: 700 }}>
                          {platform === 'ios' ? 'Home Screen ➕' : 'Instant ⚡'}
                        </div>
                      </div>
                    </motion.div>
                  </div>

                  {/* Inline iOS Safari installation helper */}
                  {showIosSafariGuide && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      style={{
                        marginTop: 4,
                        padding: '12px 14px',
                        background: 'linear-gradient(135deg, #ffffff 0%, #f5f3ff 100%)',
                        border: '1px solid #c7d2fe',
                        borderRadius: 14,
                        fontSize: 12,
                        color: '#312e81',
                        lineHeight: 1.5,
                      }}>
                      <div style={{ fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>📲 Safari Home Screen Install (3 Steps):</span>
                        <button
                          type="button"
                          onClick={() => setShowIosSafariGuide(false)}
                          style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                          ✕
                        </button>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <div>1. In Safari, tap the <strong>Share</strong> button (<strong>⎋</strong> with arrow) at bottom.</div>
                        <div>2. Scroll down and tap <strong>"Add to Home Screen"</strong> (➕).</div>
                        <div>3. Tap <strong>"Add"</strong> in top-right corner. Runs 100% offline!</div>
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* ═══ VIEW ALL PLATFORMS Accordion ═══ */}
                <motion.button
                  onClick={() => setShowAll(s => !s)}
                  whileHover={{ scale: 1.01, background: '#f0f5ff' }}
                  whileTap={{ scale: 0.99 }}
                  aria-expanded={showAll}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: 16,
                    background: '#f8fafd',
                    border: '1px solid rgba(0,0,0,0.07)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    boxSizing: 'border-box',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: '#1e293b' }}>
                      View all platforms ({platforms.length})
                    </span>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#4F8EF7',
                      background: 'rgba(79,142,247,0.12)',
                      padding: '2px 8px',
                      borderRadius: 999,
                      textTransform: 'uppercase',
                    }}>
                      All OS
                    </span>
                  </div>
                  <motion.span
                    animate={{ rotate: showAll ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    style={{ fontSize: 12, color: '#64748b' }}>
                    ▼
                  </motion.span>
                </motion.button>

                {/* ═══ All Platforms Expanded Staggered List ═══ */}
                <AnimatePresence>
                  {showAll && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      style={{ overflow: 'hidden', marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {platforms.map((p, idx) => {
                        const isUserDevice = p.id === platform
                        const { primary: pPrimary, secondary: pSecondary } = partitionFormatsForPlatform(
                          p.id,
                          p.formats,
                          isUserDevice ? cpuArch : 'unknown'
                        )

                        return (
                          <motion.div
                            key={p.id}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2, delay: idx * 0.03 }}
                            style={{
                              padding: '12px 14px',
                              borderRadius: 16,
                              background: isUserDevice ? 'rgba(79,142,247,0.06)' : '#f8fafd',
                              border: isUserDevice ? '1.5px solid rgba(79,142,247,0.28)' : '1px solid rgba(0,0,0,0.05)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 10,
                            }}>
                            {/* Header */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                                <PlatformIcon id={p.id} size={34} />
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontWeight: 700, fontSize: 14, color: '#0d0d1a' }}>{p.name}</span>
                                    {isUserDevice && (
                                      <span style={{
                                        fontSize: 9.5,
                                        fontWeight: 800,
                                        color: '#2563eb',
                                        background: 'rgba(79,142,247,0.12)',
                                        padding: '1px 6px',
                                        borderRadius: 999,
                                        textTransform: 'uppercase',
                                      }}>
                                        Your Device
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ fontSize: 11.5, color: '#64748b' }}>{p.desc}</div>
                                </div>
                              </div>

                              {/* Status Tag */}
                              <span style={{
                                fontSize: 10,
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                padding: '2px 7px',
                                borderRadius: 6,
                                color: p.status === 'available' ? '#16a34a' : (p.status === 'pwa-ready' ? '#6366F1' : '#64748b'),
                                background: p.status === 'available' ? 'rgba(22,163,74,0.1)' : (p.status === 'pwa-ready' ? 'rgba(99,102,241,0.1)' : 'rgba(0,0,0,0.05)'),
                              }}>
                                {p.status === 'available' ? 'Available' : (p.status === 'pwa-ready' ? 'PWA Ready' : 'Coming Soon')}
                              </span>
                            </div>

                            {/* Formats & Action Buttons */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                                {pPrimary && pPrimary.resolvedUrl && pPrimary.status === 'available' ? (
                                  <>
                                    <motion.a
                                      href={pPrimary.resolvedUrl}
                                      download={pPrimary.filename || true}
                                      onClick={() => handleDownloadClick(`${p.id}-${pPrimary.type}-${pPrimary.filename || ''}`, pPrimary.resolvedUrl)}
                                      role="button"
                                      whileHover={{ scale: 1.03, background: '#2563eb' }}
                                      whileTap={{ scale: 0.96 }}
                                      style={{
                                        padding: '6px 12px',
                                        borderRadius: 999,
                                        background: '#0d0d1a',
                                        color: '#ffffff',
                                        border: 'none',
                                        fontSize: 12,
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
                                        textDecoration: 'none'
                                      }}>
                                      <Download size={13} color="#ffffff" />
                                      <span>{downloadingId === `${p.id}-${pPrimary.type}-${pPrimary.filename || ''}` ? 'Preparing…' : pPrimary.label}</span>
                                      <span style={{ opacity: 0.8, fontSize: 10.5 }}>({pPrimary.size})</span>
                                    </motion.a>

                                    {pPrimary.checksum && (
                                      <button
                                        type="button"
                                        onClick={(e) => copyChecksum(e, pPrimary.checksum)}
                                        title={`SHA-256: ${pPrimary.checksum}`}
                                        style={{
                                          padding: '5px 8px',
                                          borderRadius: 999,
                                          background: 'rgba(0,0,0,0.04)',
                                          border: '1px solid rgba(0,0,0,0.06)',
                                          fontSize: 10,
                                          fontWeight: 600,
                                          color: '#475569',
                                          cursor: 'pointer',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: 3,
                                        }}>
                                        <Copy size={11} />
                                        <span>{copiedChecksum === pPrimary.checksum ? '✓' : 'SHA-256'}</span>
                                      </button>
                                    )}

                                    {/* Collapsed Secondary Formats Toggle */}
                                    {pSecondary && pSecondary.length > 0 && (
                                      <motion.button
                                        type="button"
                                        onClick={() => toggleOtherDownloads(p.id)}
                                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleOtherDownloads(p.id); } }}
                                        aria-expanded={!!expandedOthers[p.id]}
                                        aria-controls={`${p.id}-other-downloads`}
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        style={{
                                          padding: '4px 9px',
                                          borderRadius: 999,
                                          background: expandedOthers[p.id] ? 'rgba(79,142,247,0.12)' : 'rgba(0,0,0,0.04)',
                                          border: '1px solid ' + (expandedOthers[p.id] ? 'rgba(79,142,247,0.3)' : 'rgba(0,0,0,0.07)'),
                                          fontSize: 11,
                                          fontWeight: 600,
                                          color: expandedOthers[p.id] ? '#1d4ed8' : '#475569',
                                          cursor: 'pointer',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: 4,
                                          transition: 'all 0.15s ease',
                                        }}>
                                        <span>Other downloads</span>
                                        <motion.span
                                          animate={{ rotate: expandedOthers[p.id] ? 180 : 0 }}
                                          transition={{ duration: 0.2 }}
                                          style={{ display: 'inline-flex', alignItems: 'center' }}>
                                          <ChevronDown size={12} />
                                        </motion.span>
                                      </motion.button>
                                    )}
                                  </>
                                ) : null}

                                {/* PWA / iOS fallback buttons */}
                                {p.id === 'ios' && (
                                  <button
                                    type="button"
                                    onClick={() => setShowIosSafariGuide(prev => !prev)}
                                    style={{
                                      padding: '6px 12px',
                                      borderRadius: 999,
                                      background: '#6366F1',
                                      color: '#ffffff',
                                      border: 'none',
                                      fontSize: 12,
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 5,
                                    }}>
                                    <span>Safari Install Steps</span>
                                    <span>➕</span>
                                  </button>
                                )}

                                {p.id === 'pwa' && (
                                  <button
                                    type="button"
                                    onClick={handlePwaInstall}
                                    style={{
                                      padding: '6px 12px',
                                      borderRadius: 999,
                                      background: '#2563eb',
                                      color: '#ffffff',
                                      border: 'none',
                                      fontSize: 12,
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 5,
                                    }}>
                                    <span>{pwaInstalled ? '✓ Installed' : '1-Click Install'}</span>
                                    <span>⚡</span>
                                  </button>
                                )}
                              </div>

                              {/* Secondary Formats Collapsible Area */}
                              {pSecondary && pSecondary.length > 0 && (
                                <AnimatePresence initial={false}>
                                  {expandedOthers[p.id] && (
                                    <motion.div
                                      id={`${p.id}-other-downloads`}
                                      initial={{ opacity: 0, height: 0 }}
                                      animate={{ opacity: 1, height: 'auto' }}
                                      exit={{ opacity: 0, height: 0 }}
                                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                                      style={{
                                        overflow: 'hidden',
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        alignItems: 'center',
                                        gap: 6,
                                        paddingTop: 6,
                                        borderTop: '1px dashed rgba(0,0,0,0.08)',
                                        marginTop: 2,
                                      }}>
                                      {pSecondary.map((fmt) => (
                                        <div key={fmt.filename || fmt.type} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                          <motion.a
                                            href={fmt.resolvedUrl}
                                            download={fmt.filename || true}
                                            onClick={() => handleDownloadClick(`${p.id}-${fmt.type}-${fmt.filename || ''}`, fmt.resolvedUrl)}
                                            role="button"
                                            whileHover={{ scale: 1.03, background: '#2563eb' }}
                                            whileTap={{ scale: 0.96 }}
                                            style={{
                                              padding: '5px 11px',
                                              borderRadius: 999,
                                              background: '#334155',
                                              color: '#ffffff',
                                              border: 'none',
                                              fontSize: 11.5,
                                              fontWeight: 600,
                                              cursor: 'pointer',
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              gap: 5,
                                              boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
                                              textDecoration: 'none',
                                            }}>
                                            <Download size={12} color="#93c5fd" />
                                            <span>{downloadingId === `${p.id}-${fmt.type}-${fmt.filename || ''}` ? 'Preparing…' : fmt.label}</span>
                                            <span style={{ opacity: 0.8, fontSize: 10 }}>({fmt.size})</span>
                                          </motion.a>
                                          {fmt.checksum && (
                                            <button
                                              type="button"
                                              onClick={(e) => copyChecksum(e, fmt.checksum)}
                                              title={`SHA-256: ${fmt.checksum}`}
                                              style={{
                                                padding: '4px 7px',
                                                borderRadius: 999,
                                                background: 'rgba(0,0,0,0.04)',
                                                border: '1px solid rgba(0,0,0,0.06)',
                                                fontSize: 9.5,
                                                fontWeight: 600,
                                                color: '#475569',
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: 3,
                                              }}>
                                              <Copy size={9} />
                                              <span>{copiedChecksum === fmt.checksum ? '✓' : 'SHA-256'}</span>
                                            </button>
                                          )}
                                        </div>
                                      ))}
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              )}
                            </div>
                          </motion.div>
                        )
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* ═══ Release Notes & Build Metadata Toggle ═══ */}
                <div style={{ marginTop: 14, textAlign: 'center' }}>
                  <button
                    type="button"
                    onClick={() => setShowDetails(s => !s)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#64748b',
                      fontSize: 11.5,
                      textDecoration: 'underline',
                      cursor: 'pointer',
                      padding: 4,
                    }}>
                    {showDetails ? 'Hide release metadata' : 'View release metadata & build details'}
                  </button>
                  {showDetails && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      style={{
                        marginTop: 8,
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: 12,
                        padding: '10px 14px',
                        fontSize: 11.5,
                        color: '#475569',
                        textAlign: 'left',
                        lineHeight: 1.5,
                      }}>
                      <div><strong>Version:</strong> {manifest.version} ({manifest.releaseDate})</div>
                      <div><strong>Packaging:</strong> Tauri 2.0 (macOS, Windows, Linux) • Capacitor 8.5 (Android, iOS)</div>
                      <div style={{ marginTop: 4 }}><strong>Checksums (SHA-256):</strong></div>
                      <div style={{ fontFamily: 'monospace', fontSize: 10, wordBreak: 'break-all', marginTop: 2 }}>
                        macOS DMG: ccbe4d36d53830b2715baf2d31ac93de1ef60ba7d069d36299d15d62796f9911<br />
                        macOS App ZIP: 45106a67b46dd410eeca22dea078fac4d94238e51ae720137376b8083aabb19d<br />
                        Android APK: 6fae98202c292751f4b8c440c010f30cbfa5d309487f5f171931f7231105a945<br />
                        Android AAB: 9bd27368bbaaf9ff227b23d6f5557821776001bd081993c4062fc95a39532347
                      </div>
                    </motion.div>
                  )}
                </div>

              </div>

              {/* Modal Footer */}
              <div style={{
                padding: '12px 20px',
                borderTop: '1px solid rgba(0,0,0,0.06)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                fontSize: 12,
                color: '#64748b',
                background: 'rgba(250, 252, 255, 0.9)',
                flexShrink: 0,
              }}>
                <span style={{ fontWeight: 600 }}>🔒 100% Client-Side Privacy</span>
                <span>•</span>
                <span>Zero Telemetry</span>
                <span>•</span>
                <span>Open &amp; Free</span>
              </div>

            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  )
}
