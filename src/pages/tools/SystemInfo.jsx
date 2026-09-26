import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ToolShell, { ToolCard, Reveal } from '../../components/ToolShell'
import { TOOLS } from '../../constants'
import DeveloperUtilities from '../../components/DeveloperUtilities'

const tool = TOOLS.find(t => t.id === 'systeminfo')

export default function SystemInfo() {
  const [activeSection, setActiveSection] = useState('audit') // 'audit' | 'fingerprint' | 'dev'
  const [sysData, setSysData] = useState({
    userAgent: 'Loading...',
    platform: 'Loading...',
    screenRes: 'Loading...',
    colorDepth: 'Loading...',
    cpuCores: 'Loading...',
    deviceMemory: 'Loading...',
    online: true,
    dnt: 'Loading...',
    secureContext: 'Loading...',
    cookiesEnabled: 'Loading...',
    gpuRenderer: 'Loading...',
    adBlockActive: false,
    networkSpeed: 'Loading...',
    networkType: 'Loading...',
    batteryLevel: 'Loading...',
    batteryCharging: 'Loading...'
  })
  
  const [adCheckDone, setAdCheckDone] = useState(false)

  useEffect(() => {
    // 1. Basic properties
    const ua = navigator.userAgent
    const plat = navigator.userAgentData?.platform || navigator.platform
    const res = `${window.screen.width} x ${window.screen.height}`
    const depth = `${window.screen.colorDepth}-bit`
    const cores = navigator.hardwareConcurrency || 'Unknown'
    const mem = navigator.deviceMemory ? `${navigator.deviceMemory} GB` : 'Not exposed'
    const isOnline = navigator.onLine
    const doNotTrack = navigator.doNotTrack === '1' || navigator.doNotTrack === 'yes' ? 'Enabled' : 'Disabled'
    const isSecure = window.isSecureContext ? 'Yes (Secure Context)' : 'No (Insecure Context)'
    const cookies = navigator.cookieEnabled ? 'Enabled' : 'Disabled'

    // 2. GPU Detection (Release context immediately to prevent memory/context leak)
    let gpu = 'Unknown/Not Detected'
    try {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
        if (debugInfo) {
          gpu = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || gl.getParameter(gl.RENDERER) || 'Generic WebGL'
        } else {
          gpu = gl.getParameter(gl.RENDERER) || 'Generic WebGL (Masked)'
        }
        gl.getExtension('WEBGL_lose_context')?.loseContext()
      }
    } catch {}

    // 3. Network speed
    let speed = 'N/A'
    let type = 'N/A'
    if (navigator.connection) {
      speed = navigator.connection.downlink ? `${navigator.connection.downlink} Mbps` : 'N/A'
      type = navigator.connection.effectiveType || 'N/A'
    }

    setSysData(prev => ({
      ...prev,
      userAgent: ua,
      platform: plat,
      screenRes: res,
      colorDepth: depth,
      cpuCores: cores,
      deviceMemory: mem,
      online: isOnline,
      dnt: doNotTrack,
      secureContext: isSecure,
      cookiesEnabled: cookies,
      gpuRenderer: gpu,
      networkSpeed: speed,
      networkType: type
    }))

    // 4. Battery status with cleanup
    let activeBat = null
    let updateBatteryFn = null
    let mounted = true
    if (navigator.getBattery) {
      navigator.getBattery().then(bat => {
        if (!mounted) return
        activeBat = bat
        updateBatteryFn = () => {
          if (!mounted) return
          setSysData(prev => ({
            ...prev,
            batteryLevel: `${Math.round(bat.level * 100)}%`,
            batteryCharging: bat.charging ? 'Charging' : 'Discharging'
          }))
        }
        updateBatteryFn()
        bat.addEventListener('levelchange', updateBatteryFn)
        bat.addEventListener('chargingchange', updateBatteryFn)
      }).catch(() => {
        if (!mounted) return
        setSysData(prev => ({ ...prev, batteryLevel: 'N/A', batteryCharging: 'N/A' }))
      })
    } else {
      setSysData(prev => ({ ...prev, batteryLevel: 'Unsupported', batteryCharging: 'Unsupported' }))
    }

    // 5. AdBlocker Check (Privacy-preserving DOM bait element detection — works offline without external network leaks)
    try {
      const bait = document.createElement('div')
      bait.className = 'pub_300x250 pub_300x250m pub_728x90 text-ad textAd text_ad text_ads text-ads text-ad-links ad-banner adsbox'
      bait.setAttribute('style', 'width: 1px !important; height: 1px !important; position: absolute !important; left: -10000px !important; top: -1000px !important;')
      document.body.appendChild(bait)
      const computed = window.getComputedStyle(bait)
      const isBlocked = computed.display === 'none' ||
                        computed.visibility === 'hidden' ||
                        bait.offsetParent === null ||
                        bait.offsetHeight === 0 ||
                        bait.offsetWidth === 0 ||
                        bait.clientHeight === 0
      document.body.removeChild(bait)
      setSysData(prev => ({ ...prev, adBlockActive: isBlocked }))
      setAdCheckDone(true)
    } catch {
      setSysData(prev => ({ ...prev, adBlockActive: false }))
      setAdCheckDone(true)
    }

    return () => {
      mounted = false
      if (activeBat && updateBatteryFn) {
        activeBat.removeEventListener('levelchange', updateBatteryFn)
        activeBat.removeEventListener('chargingchange', updateBatteryFn)
      }
    }
  }, [])

  // Browser Fingerprint Uniqueness / Privacy Auditor
  const [fpData, setFpData] = useState({
    analyzed: false,
    loading: false,
    canvasHash: 'Not sampled',
    audioHash: 'Not sampled',
    webglVendor: 'Scanning...',
    webglRenderer: 'Scanning...',
    webglExtensions: 0,
    timezone: 'Scanning...',
    locale: 'Scanning...',
    screenMetrics: 'Scanning...',
    devicePixelRatio: 1,
    touchPoints: 0,
    surfaceLevel: 'Calculating...', // 'LOW' | 'MODERATE' | 'HIGH'
    surfaceScore: 0, // out of 100
    exposedFactors: []
  })

  const [activeFpTab, setActiveFpTab] = useState('audit') // 'audit' | 'signals' | 'mitigations'

  const runFingerprintAudit = () => {
    setFpData(prev => ({ ...prev, loading: true }))
    
    setTimeout(() => {
      // 1. Fast FNV-1a hash function for strings
      const fnv1a = (str) => {
        let hash = 2166136261
        for (let i = 0; i < str.length; i++) {
          hash ^= str.charCodeAt(i)
          hash = Math.imul(hash, 16777619)
        }
        return (hash >>> 0).toString(16).padStart(8, '0')
      }

      // 2. Canvas 2D Signature
      let canvasHash = 'Unavailable/Blocked'
      try {
        const c = document.createElement('canvas')
        c.width = 240
        c.height = 60
        const ctx = c.getContext('2d')
        if (ctx) {
          ctx.textBaseline = 'top'
          ctx.font = '14px Arial, sans-serif'
          ctx.textBaseline = 'alphabetic'
          ctx.fillStyle = '#f60'
          ctx.fillRect(125, 1, 62, 20)
          ctx.fillStyle = '#069'
          ctx.fillText('ToolDesk Security Audit 🛡️', 2, 15)
          ctx.fillStyle = 'rgba(102, 204, 0, 0.7)'
          ctx.fillText('ToolDesk Security Audit 🛡️', 4, 17)
          const dataUrl = c.toDataURL()
          canvasHash = '0x' + fnv1a(dataUrl)
        }
      } catch {
        canvasHash = 'Blocked by Privacy Shield'
      }

      // 3. WebGL Deep Attributes
      let glVendor = 'Unknown'
      let glRenderer = 'Unknown'
      let extCount = 0
      try {
        const glCanvas = document.createElement('canvas')
        const gl = glCanvas.getContext('webgl') || glCanvas.getContext('experimental-webgl')
        if (gl) {
          const dbg = gl.getExtension('WEBGL_debug_renderer_info')
          if (dbg) {
            glVendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || gl.getParameter(gl.VENDOR) || 'Generic'
            glRenderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || gl.getParameter(gl.RENDERER) || 'Generic'
          } else {
            glVendor = gl.getParameter(gl.VENDOR) || 'Generic / Masked'
            glRenderer = gl.getParameter(gl.RENDERER) || 'Generic / Masked'
          }
          const exts = gl.getSupportedExtensions()
          extCount = exts ? exts.length : 0
          gl.getExtension('WEBGL_lose_context')?.loseContext()
        }
      } catch {}

      // 4. AudioContext Architecture Signature
      let audioSig = 'Unavailable'
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext
        if (AudioCtx) {
          const actx = new AudioCtx()
          const sampleRate = actx.sampleRate || 44100
          const channels = actx.destination?.maxChannelCount || 2
          const state = actx.state
          audioSig = `${sampleRate}Hz | ${channels}ch | ${fnv1a(`${sampleRate}-${channels}-${state}`)}`
          if (actx.state !== 'closed') {
            actx.close().catch(() => {})
          }
        }
      } catch {
        audioSig = 'Blocked / Not Supported'
      }

      // 5. System Locale & Timezone
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown'
      const languages = navigator.languages ? navigator.languages.join(', ') : (navigator.language || 'Unknown')
      const dpr = window.devicePixelRatio || 1
      const touchPoints = navigator.maxTouchPoints || 0
      const screenSpec = `${window.screen.width}×${window.screen.height} (Avail: ${window.screen.availWidth}×${window.screen.availHeight})`

      // 6. Calculate Relative Surface Score (Heuristic, not false population claims)
      let score = 0
      const factors = []

      // WebGL Renderer exposure
      if (glRenderer !== 'Unknown' && !glRenderer.includes('SwiftShader') && !glRenderer.includes('Generic')) {
        score += 25
        factors.push({ name: 'Unmasked Hardware GPU', entropy: 'High', stability: 'Permanent', status: 'Exposed', desc: glRenderer })
      } else {
        score += 5
        factors.push({ name: 'Hardware GPU Masking', entropy: 'Low', stability: 'Generic', status: 'Protected', desc: 'Generic or Software Rasterizer' })
      }

      // Canvas 2D Fingerprint
      if (canvasHash !== 'Blocked by Privacy Shield' && canvasHash !== 'Unavailable/Blocked') {
        score += 20
        factors.push({ name: 'Canvas 2D Geometry & Font Raster', entropy: 'High', stability: 'Permanent', status: 'Exposed', desc: `Hash: ${canvasHash}` })
      } else {
        factors.push({ name: 'Canvas 2D Protection', entropy: 'Zero', stability: 'Dynamic', status: 'Protected', desc: 'Blocked or spoofed by browser' })
      }

      // Screen Geometry & DPR
      if (window.screen.width % 100 !== 0 || dpr !== 1) {
        score += 15
        factors.push({ name: 'Exact Display Resolution & DPI', entropy: 'Medium', stability: 'Stable', status: 'Exposed', desc: `${screenSpec} @ ${dpr}x` })
      } else {
        score += 8
        factors.push({ name: 'Standard Display Geometry', entropy: 'Low', stability: 'Standard', status: 'Common', desc: `${screenSpec}` })
      }

      // Audio Architecture
      if (audioSig.includes('Hz')) {
        score += 15
        factors.push({ name: 'Audio Hardware Pipeline', entropy: 'Medium', stability: 'Stable', status: 'Exposed', desc: audioSig })
      }

      // CPU Cores & Memory
      if (navigator.hardwareConcurrency && navigator.hardwareConcurrency > 4) {
        score += 10
        factors.push({ name: 'Concurrency Thread Count', entropy: 'Medium', stability: 'Permanent', status: 'Exposed', desc: `${navigator.hardwareConcurrency} Logical Cores` })
      }

      // Timezone & Language
      if (tz !== 'UTC') {
        score += 15
        factors.push({ name: 'Timezone & Locale Vector', entropy: 'Medium', stability: 'Persistent', status: 'Exposed', desc: `${tz} [${languages}]` })
      }

      let surfaceLevel = 'MODERATE'
      if (score >= 70) surfaceLevel = 'HIGH'
      else if (score < 40) surfaceLevel = 'LOW'

      setFpData({
        analyzed: true,
        loading: false,
        canvasHash,
        audioHash: audioSig,
        webglVendor: glVendor,
        webglRenderer: glRenderer,
        webglExtensions: extCount,
        timezone: tz,
        locale: languages,
        screenMetrics: screenSpec,
        devicePixelRatio: dpr,
        touchPoints,
        surfaceLevel,
        surfaceScore: Math.min(score, 100),
        exposedFactors: factors
      })
    }, 450)
  }

  // Run audit once on initial load
  useEffect(() => {
    runFingerprintAudit()
  }, [])

  return (
    <ToolShell tool={tool}>
      {/* Category Sub-Navigation Bar */}
      <div
        className="system-info-tabs"
        style={{
          display: 'flex',
          gap: 6,
          padding: 4,
          background: 'rgba(0, 0, 0, 0.04)',
          borderRadius: 14,
          marginBottom: 20,
          flexWrap: 'wrap',
        }}
      >
        {[
          { id: 'audit', label: 'System & Hardware', icon: '💻' },
          { id: 'fingerprint', label: 'Fingerprint Surface', icon: '🛡️' },
          { id: 'dev', label: 'Developer Utilities Studio', icon: '🛠️' },
        ].map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveSection(tab.id)}
            style={{
              flex: '1 1 140px',
              padding: '10px 14px',
              borderRadius: 10,
              border: 'none',
              background: activeSection === tab.id ? '#ffffff' : 'transparent',
              color: activeSection === tab.id ? '#0f172a' : '#64748b',
              boxShadow: activeSection === tab.id ? '0 2px 10px rgba(0,0,0,0.06)' : 'none',
              fontFamily: 'DM Sans, sans-serif',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.18s ease',
              textAlign: 'center',
            }}
          >
            <span style={{ marginRight: 6 }}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* 0. DEVELOPER UTILITIES STUDIO */}
      {activeSection === 'dev' && (
        <Reveal delay={0.04}>
          <ToolCard style={{ marginBottom: 20 }}>
            <h3 style={{ fontFamily: 'Syne, sans-serif', fontSize: 18, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>
              🛠️ Developer Utilities Studio
            </h3>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px 0' }}>
              Full suite of client-side developer tools: JSON Studio, JWT Inspector, Regex Studio, SQL Formatter, UUID Generator, Timestamp Studio, and URL Toolkit.
            </p>
            <DeveloperUtilities />
          </ToolCard>
        </Reveal>
      )}

      {/* 1. Core Hardware & Privacy Grid */}
      {activeSection === 'audit' && (
        <Reveal>
          <ToolCard style={{ marginBottom: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))', gap: 20 }}>
              
              {/* Hardware & System */}
              <div style={{ background: 'rgba(0,0,0,0.02)', padding: 20, borderRadius: 16, border: '1px solid rgba(0,0,0,0.06)' }}>
                <h3 style={{ fontFamily: 'Syne, sans-serif', fontSize: 16, fontWeight: 700, marginBottom: 16, color: 'var(--blue)' }}>
                💻 Hardware & Core OS
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={styles.statRow}>
                  <span style={styles.statLabel}>Operating System</span>
                  <span style={styles.statVal}>{sysData.platform}</span>
                </div>
                <div style={styles.statRow}>
                  <span style={styles.statLabel}>CPU Cores</span>
                  <span style={styles.statVal}>{sysData.cpuCores} Threads</span>
                </div>
                <div style={styles.statRow}>
                  <span style={styles.statLabel}>Estimated Memory</span>
                  <span style={styles.statVal}>{sysData.deviceMemory}</span>
                </div>
                <div style={styles.statRow}>
                  <span style={styles.statLabel}>Screen Resolution</span>
                  <span style={styles.statVal}>{sysData.screenRes} ({sysData.colorDepth})</span>
                </div>
                <div style={styles.statRow}>
                  <span style={styles.statLabel}>Battery Status</span>
                  <span style={styles.statVal}>
                    {sysData.batteryLevel} {sysData.batteryCharging !== 'Unsupported' && `(${sysData.batteryCharging})`}
                  </span>
                </div>
              </div>
            </div>

            {/* Browser Privacy & Auditing */}
            <div style={{ background: 'rgba(0,0,0,0.02)', padding: 20, borderRadius: 16, border: '1px solid rgba(0,0,0,0.06)' }}>
              <h3 style={{ fontFamily: 'Syne, sans-serif', fontSize: 16, fontWeight: 700, marginBottom: 16, color: 'var(--purple, #9C6FDE)' }}>
                🛡️ Privacy & Security Audit
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={styles.statRow}>
                  <span style={styles.statLabel}>Secure Context</span>
                  <span style={{ ...styles.statVal, color: sysData.secureContext.includes('Yes') ? '#22c55e' : '#ef4444' }}>
                    {sysData.secureContext}
                  </span>
                </div>
                <div style={styles.statRow}>
                  <span style={styles.statLabel}>Cookies Status</span>
                  <span style={{ ...styles.statVal, color: sysData.cookiesEnabled === 'Enabled' ? '#22c55e' : '#ef4444' }}>
                    {sysData.cookiesEnabled}
                  </span>
                </div>
                <div style={styles.statRow}>
                  <span style={styles.statLabel}>Do Not Track (DNT)</span>
                  <span style={styles.statVal}>{sysData.dnt}</span>
                </div>
                <div style={styles.statRow}>
                  <span style={styles.statLabel}>Ad-Blocker Active</span>
                  <span style={{ ...styles.statVal, color: sysData.adBlockActive ? '#22c55e' : '#f59e0b' }}>
                    {!adCheckDone ? 'Scanning...' : sysData.adBlockActive ? 'Detected (Yes)' : 'Not Active (No)'}
                  </span>
                </div>
                <div style={styles.statRow}>
                  <span style={styles.statLabel}>Connection Mode</span>
                  <span style={{ ...styles.statVal, color: sysData.online ? '#22c55e' : '#ef4444' }}>
                    {sysData.online ? 'Online' : 'Offline'}
                  </span>
                </div>
              </div>
            </div>

          </div>
        </ToolCard>
      </Reveal>
      )}

      {/* 2. ADVANCED ENHANCEMENT: Browser Fingerprint Uniqueness & Privacy Surface Auditor */}
      {activeSection === 'fingerprint' && (
      <Reveal delay={0.08}>
        <ToolCard style={{ marginBottom: 20, border: '1px solid rgba(156,111,222,0.25)', background: 'linear-gradient(180deg, rgba(156,111,222,0.03) 0%, rgba(0,0,0,0.01) 100%)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(156,111,222,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                🔬
              </div>
              <div>
                <h3 style={{ fontFamily: 'Syne, sans-serif', fontSize: 17, fontWeight: 800, margin: 0, color: '#111' }}>
                  Relative Browser Fingerprint Surface Auditor
                </h3>
                <span style={{ fontSize: 12, color: '#666' }}>
                  Deterministic heuristic analysis of exposed tracking vectors (No false census statistics)
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                onClick={runFingerprintAudit}
                disabled={fpData.loading}
                style={{
                  background: 'rgba(0,0,0,0.04)',
                  border: '1px solid rgba(0,0,0,0.1)',
                  borderRadius: 8,
                  padding: '7px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: fpData.loading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                🔄 {fpData.loading ? 'Sampling...' : 'Re-Sample Surface'}
              </button>

              <div
                style={{
                  padding: '6px 14px',
                  borderRadius: 20,
                  fontWeight: 800,
                  fontSize: 12.5,
                  letterSpacing: '0.5px',
                  background: fpData.surfaceLevel === 'HIGH' ? 'rgba(239,68,68,0.12)' : fpData.surfaceLevel === 'MODERATE' ? 'rgba(245,158,11,0.12)' : 'rgba(34,197,94,0.12)',
                  color: fpData.surfaceLevel === 'HIGH' ? '#dc2626' : fpData.surfaceLevel === 'MODERATE' ? '#d97706' : '#16a34a',
                  border: `1px solid ${fpData.surfaceLevel === 'HIGH' ? 'rgba(239,68,68,0.3)' : fpData.surfaceLevel === 'MODERATE' ? 'rgba(245,158,11,0.3)' : 'rgba(34,197,94,0.3)'}`
                }}
              >
                SURFACE: {fpData.surfaceLevel} ({fpData.surfaceScore}/100)
              </div>
            </div>
          </div>

          {/* Navigation Sub-Tabs */}
          <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid rgba(0,0,0,0.08)', paddingBottom: 10, marginBottom: 18 }}>
            {[
              { id: 'audit', label: '📊 Surface Analysis' },
              { id: 'signals', label: '🧬 Hardware Signals' },
              { id: 'mitigations', label: '🛡️ Privacy Trade-offs' }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveFpTab(tab.id)}
                style={{
                  background: activeFpTab === tab.id ? 'var(--blue, #2563eb)' : 'transparent',
                  color: activeFpTab === tab.id ? '#fff' : '#666',
                  border: 'none',
                  padding: '6px 14px',
                  borderRadius: 8,
                  fontSize: 12.5,
                  fontWeight: activeFpTab === tab.id ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab 1: Surface Analysis */}
          {activeFpTab === 'audit' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: 12, marginBottom: 16 }}>
                <div style={{ padding: 14, background: '#fff', borderRadius: 12, border: '1px solid rgba(0,0,0,0.06)' }}>
                  <div style={{ fontSize: 11, color: '#888', fontWeight: 600, textTransform: 'uppercase' }}>Surface Classification</div>
                  <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4, color: fpData.surfaceLevel === 'HIGH' ? '#dc2626' : fpData.surfaceLevel === 'MODERATE' ? '#d97706' : '#16a34a' }}>
                    {fpData.surfaceLevel} IDENTIFIABILITY
                  </div>
                  <div style={{ fontSize: 11.5, color: '#666', marginTop: 4, lineHeight: 1.4 }}>
                    {fpData.surfaceLevel === 'HIGH'
                      ? 'Multiple unmasked hardware identifiers provide strong persistent cross-site linkability.'
                      : fpData.surfaceLevel === 'MODERATE'
                      ? 'Typical browser profile. Individual traits are standard, but the combination allows moderate clustering.'
                      : 'High resistance to passive profiling. Hardware details appear normalized or masked.'}
                  </div>
                </div>

                <div style={{ padding: 14, background: '#fff', borderRadius: 12, border: '1px solid rgba(0,0,0,0.06)' }}>
                  <div style={{ fontSize: 11, color: '#888', fontWeight: 600, textTransform: 'uppercase' }}>Canvas 2D Entropy</div>
                  <div style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, marginTop: 4, color: '#111' }}>
                    {fpData.canvasHash}
                  </div>
                  <div style={{ fontSize: 11.5, color: '#666', marginTop: 4, lineHeight: 1.4 }}>
                    Sub-pixel font rendering and antialiasing quirks produce a repeatable device signature.
                  </div>
                </div>

                <div style={{ padding: 14, background: '#fff', borderRadius: 12, border: '1px solid rgba(0,0,0,0.06)' }}>
                  <div style={{ fontSize: 11, color: '#888', fontWeight: 600, textTransform: 'uppercase' }}>AudioContext Pipeline</div>
                  <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, marginTop: 4, color: '#111' }}>
                    {fpData.audioHash.split('|')[0] || 'Available'}
                  </div>
                  <div style={{ fontSize: 11.5, color: '#666', marginTop: 4, lineHeight: 1.4 }}>
                    DSP hardware sample rates and audio buffer processing differences act as an extra beacon.
                  </div>
                </div>
              </div>

              {/* Breakdown Table of Detected Attributes */}
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                <div style={{ padding: '10px 16px', background: 'rgba(0,0,0,0.02)', borderBottom: '1px solid rgba(0,0,0,0.06)', fontSize: 12, fontWeight: 700, color: '#444' }}>
                  Observed Fingerprint Surface Vectors
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.05)', color: '#888', fontSize: 11, textTransform: 'uppercase' }}>
                        <th style={{ padding: '8px 16px' }}>Vector</th>
                        <th style={{ padding: '8px 16px' }}>Entropy Contribution</th>
                        <th style={{ padding: '8px 16px' }}>Observed Value / State</th>
                        <th style={{ padding: '8px 16px' }}>Stability</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fpData.exposedFactors.map((factor, idx) => (
                        <tr key={idx} style={{ borderBottom: idx < fpData.exposedFactors.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none' }}>
                          <td style={{ padding: '10px 16px', fontWeight: 600, color: '#222' }}>{factor.name}</td>
                          <td style={{ padding: '10px 16px' }}>
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 700,
                              background: factor.entropy === 'High' ? 'rgba(239,68,68,0.1)' : factor.entropy === 'Medium' ? 'rgba(245,158,11,0.1)' : 'rgba(34,197,94,0.1)',
                              color: factor.entropy === 'High' ? '#dc2626' : factor.entropy === 'Medium' ? '#d97706' : '#16a34a'
                            }}>
                              {factor.entropy}
                            </span>
                          </td>
                          <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontSize: 11.5, color: '#444', maxWidth: 280, wordBreak: 'break-all' }}>
                            {factor.desc}
                          </td>
                          <td style={{ padding: '10px 16px', color: '#666' }}>{factor.stability}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Raw Signals */}
          {activeFpTab === 'signals' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: 14 }}>
              <div style={{ padding: 14, background: '#fff', borderRadius: 12, border: '1px solid rgba(0,0,0,0.06)' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: 13, fontWeight: 700, color: '#111' }}>🎮 WebGL Environment</h4>
                <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div><strong style={{ color: '#666' }}>Unmasked Vendor:</strong> <span style={{ fontFamily: 'monospace' }}>{fpData.webglVendor}</span></div>
                  <div><strong style={{ color: '#666' }}>Unmasked Renderer:</strong> <span style={{ fontFamily: 'monospace' }}>{fpData.webglRenderer}</span></div>
                  <div><strong style={{ color: '#666' }}>Supported WebGL Extensions:</strong> <span style={{ fontFamily: 'monospace' }}>{fpData.webglExtensions} available</span></div>
                </div>
              </div>

              <div style={{ padding: 14, background: '#fff', borderRadius: 12, border: '1px solid rgba(0,0,0,0.06)' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: 13, fontWeight: 700, color: '#111' }}>🖥️ Display & Input Architecture</h4>
                <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div><strong style={{ color: '#666' }}>Screen Geometry:</strong> <span style={{ fontFamily: 'monospace' }}>{fpData.screenMetrics}</span></div>
                  <div><strong style={{ color: '#666' }}>Device Pixel Ratio (DPR):</strong> <span style={{ fontFamily: 'monospace' }}>{fpData.devicePixelRatio}x</span></div>
                  <div><strong style={{ color: '#666' }}>Max Touch Points:</strong> <span style={{ fontFamily: 'monospace' }}>{fpData.touchPoints}</span></div>
                </div>
              </div>

              <div style={{ padding: 14, background: '#fff', borderRadius: 12, border: '1px solid rgba(0,0,0,0.06)' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: 13, fontWeight: 700, color: '#111' }}>🌐 Temporal & Locale Anchor</h4>
                <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div><strong style={{ color: '#666' }}>System Timezone:</strong> <span style={{ fontFamily: 'monospace' }}>{fpData.timezone}</span></div>
                  <div><strong style={{ color: '#666' }}>Language Priorities:</strong> <span style={{ fontFamily: 'monospace' }}>{fpData.locale}</span></div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: Mitigations & Realistic Trade-offs */}
          {activeFpTab === 'mitigations' && (
            <div style={{ background: '#fff', padding: 16, borderRadius: 12, border: '1px solid rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#111' }}>
                🛡️ Understanding Fingerprint Mitigations & Trade-Offs
              </h4>
              <p style={{ margin: 0, fontSize: 12.5, color: '#555', lineHeight: 1.5 }}>
                Browser fingerprinting does not rely on stored cookies or local storage. Instead, advertising trackers and fraud engines silently measure micro-variations in your device hardware, GPU driver quirks, and system fonts to calculate a semi-unique identifier.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginTop: 4 }}>
                <div style={{ padding: 12, borderRadius: 10, background: 'rgba(37,99,235,0.04)', border: '1px solid rgba(37,99,235,0.15)' }}>
                  <div style={{ fontWeight: 700, fontSize: 12.5, color: '#2563eb', marginBottom: 4 }}>
                    Standardizing vs. Randomizing
                  </div>
                  <div style={{ fontSize: 11.5, color: '#555', lineHeight: 1.45 }}>
                    Randomizing fingerprint values on every request paradoxically makes you stand out as an anomaly. Privacy browsers like Tor Browser and Firefox (with <code>privacy.resistFingerprinting</code>) standardize screen dimensions (e.g. letterboxing) and spoof generic GPU renderers so you blend into a large crowd.
                  </div>
                </div>

                <div style={{ padding: 12, borderRadius: 10, background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.15)' }}>
                  <div style={{ fontWeight: 700, fontSize: 12.5, color: '#d97706', marginBottom: 4 }}>
                    Functional Web Trade-Offs
                  </div>
                  <div style={{ fontSize: 11.5, color: '#555', lineHeight: 1.45 }}>
                    Blocking Canvas reads or disabling WebGL entirely reduces tracking surface to minimum, but may break web games, 3D maps (Google Maps, CAD viewers), interactive design tools (Figma, Canva), and streaming video DRM players.
                  </div>
                </div>
              </div>

              <div style={{ padding: 10, borderRadius: 8, background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.05)', fontSize: 11.5, color: '#777', lineHeight: 1.4 }}>
                <strong>Defensive Scientific Disclosure:</strong> ToolDesk evaluates the breadth of exposed API vectors to compute a relative surface score. ToolDesk strictly refrains from publishing false population claims (e.g. &quot;1 in 250,000 devices&quot;) because authentic uniqueness requires access to a continuously verified global population census.
              </div>
            </div>
          )}
        </ToolCard>
      </Reveal>
      )}

      {/* 3, 4, 5: System Hardware Diagnostics */}
      {activeSection === 'audit' && (
        <>
          {/* 3. WebGL GPU scan info */}
          <Reveal delay={0.12}>
            <ToolCard style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                  🔍 Graphic Renderer GPU (WebGL Fingerprint)
                </span>
                <span style={{ fontFamily: 'monospace', fontSize: 13.5, color: '#0d0d1a', wordBreak: 'break-all' }}>
                  {sysData.gpuRenderer}
                </span>
                <span style={{ fontSize: 11, color: '#888', marginTop: 4, lineHeight: 1.5 }}>
                  ⚠️ WebGL unmasks your physical GPU model. Advertisers and tracking engines use this data combined with window specs to build a unique hardware signature of your device (Fingerprinting).
                </span>
              </div>
            </ToolCard>
          </Reveal>

          {/* 4. Network Connection Details */}
          <Reveal delay={0.16}>
            <ToolCard style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                  ⚡ Network Connection Details
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginTop: 4 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#999' }}>Estimate Downlink Speed</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#333' }}>{sysData.networkSpeed}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#999' }}>Network Class</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#333', textTransform: 'uppercase' }}>{sysData.networkType}</div>
                  </div>
                </div>
              </div>
            </ToolCard>
          </Reveal>

          {/* 5. Complete User Agent */}
          <Reveal delay={0.22}>
            <ToolCard style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                  🌐 Complete User Agent Header
                </span>
                <span style={{ fontFamily: 'monospace', fontSize: 12.5, color: '#555', wordBreak: 'break-all', lineHeight: 1.6 }}>
                  {sysData.userAgent}
                </span>
              </div>
            </ToolCard>
          </Reveal>
        </>
      )}
    </ToolShell>
  )
}

const styles = {
  statRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid rgba(0,0,0,0.05)',
    gap: 16
  },
  statLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: '#666'
  },
  statVal: {
    fontSize: 13.5,
    fontWeight: 700,
    color: '#333',
    textAlign: 'right',
    wordBreak: 'break-all'
  }
}
