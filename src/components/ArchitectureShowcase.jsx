import React, { memo } from 'react'
import { motion } from 'framer-motion'
import { TOOLS } from '../constants'

/* ─────────────────────────────────────────────────── */
/*  COMPARISON DATA DEFINITIONS                        */
/* ─────────────────────────────────────────────────── */
const COMPARISON_DIMENSIONS = [
  {
    category: 'Data Privacy & Storage',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    ),
    cloud: 'Uploaded to third-party AWS/GCP servers. Cached on remote disks with risk of logs, subpoenas, and leaks.',
    cloudBadge: 'Remote Server Upload',
    tooldesk: 'Zero network packets transmitted. Every byte stays sandboxed in your device’s isolated browser RAM.',
    tooldeskBadge: '100% Private RAM',
  },
  {
    category: 'Processing Speed & Latency',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
    cloud: 'Bottlenecked by home uplink bandwidth, queue wait times, and server roundtrips (typically 5s – 45s).',
    cloudBadge: '5s – 45s Wait Delay',
    tooldesk: 'Instant hardware execution via WebAssembly, WebGL, and Web Workers directly on your local CPU/GPU.',
    tooldeskBadge: '< 16ms Instant',
  },
  {
    category: 'File Size & Batch Capacity',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    ),
    cloud: 'Artificial free ceilings capping uploads at 10MB – 25MB; requires paid upgrades for large or batch files.',
    cloudBadge: 'Capped at 25MB',
    tooldesk: 'No artificial caps. Seamlessly process gigabyte-scale videos and massive batches limited only by your device.',
    tooldeskBadge: 'Unlimited GBs',
  },
  {
    category: 'Offline Usability & Resilience',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="1" y1="1" x2="23" y2="23" />
        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
        <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
        <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
        <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
        <line x1="12" y1="20" x2="12.01" y2="20" />
      </svg>
    ),
    cloud: 'Completely inoperable without an active internet connection. Fails during flights, subway rides, or outages.',
    cloudBadge: 'Requires Online Connection',
    tooldesk: 'Fully functional offline. Progressive Web App (PWA) service worker pre-caches tools for instant offline use.',
    tooldeskBadge: '100% Offline PWA',
  },
  {
    category: 'Pricing & Commercial Ethics',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
    cloud: 'Freemium traps, intrusive banner ads, forced signups, daily conversion limits, and $15/mo subscriptions.',
    cloudBadge: '$12 – $24/mo Paywall',
    tooldesk: 'Completely free forever. No paywalls, no account required, no ads, no watermarks, and no credit system.',
    tooldeskBadge: 'Free Forever',
  },
  {
    category: 'Enterprise Compliance (HIPAA / GDPR)',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
    cloud: 'Requires formal Data Processing Agreements (DPA) and legal clearance before uploading proprietary data.',
    cloudBadge: 'Compliance Liability',
    tooldesk: 'Inherently compliant by design. Since zero customer data is collected or sent, there is zero audit liability.',
    tooldeskBadge: 'Zero-Trust Compliant',
  },
]

/* ─────────────────────────────────────────────────── */
/*  MAIN COMPONENT: CLOUD VS TOOLDESK SHOWCASE         */
/* ─────────────────────────────────────────────────── */
export default memo(function ArchitectureShowcase() {

  return (
    <section
      id="cloud-vs-tooldesk"
      className="home-section-deferred"
      style={{
        position: 'relative',
        padding: 'clamp(64px, 8vw, 100px) 0',
        background: 'linear-gradient(180deg, #ffffff 0%, #f8faff 50%, #ffffff 100%)',
        overflow: 'hidden',
      }}
    >
      {/* Dynamic Responsive Styles with Ultra-Premium Glassmorphism */}
      <style>{`
        .tooldesk-summary-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 24px;
          margin-bottom: 32px;
        }
        @media (max-width: 820px) {
          .tooldesk-summary-grid {
            grid-template-columns: 1fr;
            gap: 18px;
          }
        }
        .tooldesk-matrix-row {
          display: grid;
          grid-template-columns: 240px 1fr 1fr;
          gap: 24px;
          align-items: center;
          padding: 22px 28px;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.78);
          backdrop-filter: blur(32px) saturate(200%);
          -webkit-backdrop-filter: blur(32px) saturate(200%);
          border: 1px solid rgba(226, 232, 240, 0.8);
          box-shadow: 0 10px 32px -4px rgba(15, 23, 42, 0.03), 0 2px 8px rgba(15, 23, 42, 0.02), inset 0 1px 0 rgba(255, 255, 255, 0.98);
          transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.35s cubic-bezier(0.16, 1, 0.3, 1), background 0.3s ease, border-color 0.3s ease;
          position: relative;
        }
        .tooldesk-matrix-row:hover {
          background: rgba(255, 255, 255, 0.96);
          border-color: rgba(79, 142, 247, 0.38);
          box-shadow: 0 20px 48px -10px rgba(79, 142, 247, 0.16), 0 4px 12px rgba(15, 23, 42, 0.03), inset 0 1px 0 #ffffff;
          transform: translateY(-3px);
        }
        @media (max-width: 860px) {
          .tooldesk-matrix-row {
            grid-template-columns: 1fr;
            gap: 14px;
            padding: 20px 20px;
          }
          .tooldesk-matrix-row-category {
            padding-bottom: 4px;
          }
        }
      `}</style>

      {/* Ambient Radial Mesh Background Glows */}
      <div
        style={{
          position: 'absolute',
          top: '15%',
          right: '4%',
          width: 550,
          height: 550,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(79, 142, 247, 0.07) 0%, transparent 70%)',
          filter: 'blur(70px)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '12%',
          left: '3%',
          width: 520,
          height: 520,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(34, 197, 94, 0.06) 0%, transparent 70%)',
          filter: 'blur(70px)',
          pointerEvents: 'none',
        }}
      />

      <div style={{ maxWidth: 1140, margin: '0 auto', padding: '0 20px', position: 'relative', zIndex: 1 }}>
        {/* Section Header */}
        <div style={{ textAlign: 'center', marginBottom: 44 }}>
          {/* Eyebrow Pill */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.12 }}
            transition={{ duration: 0.4 }}
            style={{ textAlign: 'center', marginBottom: 18 }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: 'rgba(79, 142, 247, 0.07)',
                border: '1px solid rgba(79, 142, 247, 0.2)',
                padding: '5px 18px',
                borderRadius: 999,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: '#06b6d4',
                  boxShadow: '0 0 8px #06b6d4',
                  display: 'inline-block',
                  animation: 'sjpulse 1.6s ease-in-out infinite',
                }}
              />
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#4F8EF7',
                  letterSpacing: '.9px',
                  textTransform: 'uppercase',
                }}
              >
                Zero-Trust Comparison
              </span>
            </span>
          </motion.div>

          {/* Headline - Clean Typography without any underline line */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.12 }}
            transition={{ duration: 0.5, delay: 0.06 }}
          >
            <h2
              style={{
                fontFamily: 'Syne, sans-serif',
                fontSize: 'clamp(30px, 4.8vw, 48px)',
                fontWeight: 900,
                color: '#0d0d1a',
                lineHeight: 1.15,
                letterSpacing: '-1.5px',
                margin: 0,
              }}
            >
              Traditional Cloud <span style={{ color: '#94a3b8', fontWeight: 500 }}>vs.</span>{' '}
              <span
                style={{
                  background: 'linear-gradient(125deg, #06b6d4, #4F8EF7, #7c3aed)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  display: 'inline-block',
                }}
              >
                ToolDesk Local-First
              </span>
            </h2>

            <p
              style={{
                fontFamily: 'DM Sans, sans-serif',
                fontSize: 15.5,
                color: '#64748b',
                marginTop: 14,
                fontWeight: 400,
                letterSpacing: '.1px',
                maxWidth: 680,
                margin: '14px auto 0',
                lineHeight: 1.62,
              }}
            >
              Why upload your private files, documents, and secrets to a remote server when your browser can process them locally with zero latency, zero tracking, and zero leakage?
            </p>
          </motion.div>
        </div>

        {/* ── TOP DUO: ARCHITECTURAL OVERVIEW SUMMARY CARDS ── */}
        <div className="tooldesk-summary-grid">
          {/* Left Card: Legacy Cloud Converters */}
          <motion.div
            initial={{ opacity: 0, y: 22 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.12 }}
            transition={{ duration: 0.45 }}
            whileHover={{ y: -4, transition: { type: 'spring', stiffness: 400, damping: 25 } }}
            style={{
              borderRadius: 24,
              padding: 'clamp(24px, 3.2vw, 34px)',
              background: 'linear-gradient(145deg, rgba(255, 255, 255, 0.88) 0%, rgba(254, 242, 242, 0.65) 100%)',
              backdropFilter: 'blur(30px) saturate(190%)',
              WebkitBackdropFilter: 'blur(30px) saturate(190%)',
              border: '1px solid rgba(255, 255, 255, 0.85)',
              boxShadow: '0 20px 45px -12px rgba(239, 68, 68, 0.07), 0 2px 10px rgba(0, 0, 0, 0.02), inset 0 1px 0 rgba(255, 255, 255, 0.95)',
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 18 }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: '#dc2626',
                    background: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.22)',
                    padding: '4px 12px',
                    borderRadius: 999,
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                  <span>Legacy Cloud Converters</span>
                </span>
                <span style={{ fontSize: 11.5, color: '#94a3b8', fontWeight: 600 }}>External Servers</span>
              </div>

              <h3 style={{ fontFamily: 'Syne, sans-serif', fontSize: 19, fontWeight: 800, color: '#0f172a', margin: '0 0 10px 0' }}>
                Remote Infrastructure Vulnerability
              </h3>
              <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13.5, color: '#64748b', lineHeight: 1.58, margin: '0 0 20px 0' }}>
                Traditional utility websites stream your uploaded PDFs, images, and credentials to off-site cloud servers where they are queued, processed, and temporarily retained.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                {[
                  'Mandatory server uploads over public internet',
                  'Files stored in temporary caches and logs',
                  'Strict 15MB–25MB caps with recurring paywalls',
                  'Completely broken without active internet',
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#64748b' }}>
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        background: 'rgba(239, 68, 68, 0.1)',
                        color: '#dc2626',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </div>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                marginTop: 26,
                padding: '12px 18px',
                borderRadius: 14,
                background: 'rgba(239, 68, 68, 0.04)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, color: '#dc2626' }}>Data Exposure Risk</span>
              <span style={{ fontSize: 11.5, color: '#94a3b8', fontWeight: 600 }}>High Network Overhead</span>
            </div>
          </motion.div>

          {/* Right Card: ToolDesk Local-First Sandbox (Hero Winner) */}
          <motion.div
            initial={{ opacity: 0, y: 22 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.12 }}
            transition={{ duration: 0.45, delay: 0.08 }}
            whileHover={{ y: -4, transition: { type: 'spring', stiffness: 400, damping: 25 } }}
            style={{
              borderRadius: 24,
              padding: 'clamp(24px, 3.2vw, 34px)',
              background: 'linear-gradient(145deg, rgba(255, 255, 255, 0.92) 0%, rgba(240, 249, 255, 0.85) 50%, rgba(236, 253, 245, 0.72) 100%)',
              backdropFilter: 'blur(32px) saturate(200%)',
              WebkitBackdropFilter: 'blur(32px) saturate(200%)',
              border: '1.5px solid rgba(79, 142, 247, 0.28)',
              boxShadow: '0 20px 50px -12px rgba(79, 142, 247, 0.16), 0 4px 20px rgba(34, 197, 94, 0.08), inset 0 1px 0 #ffffff',
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 18 }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: '#2563eb',
                    background: 'rgba(37, 99, 235, 0.08)',
                    border: '1px solid rgba(37, 99, 235, 0.22)',
                    padding: '4px 12px',
                    borderRadius: 999,
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>ToolDesk Local-First</span>
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: '#16a34a',
                    background: 'rgba(34, 197, 94, 0.12)',
                    border: '1px solid rgba(34, 197, 94, 0.25)',
                    padding: '3px 10px',
                    borderRadius: 999,
                    letterSpacing: '0.4px',
                    textTransform: 'uppercase',
                  }}
                >
                  Winner
                </span>
              </div>

              <h3 style={{ fontFamily: 'Syne, sans-serif', fontSize: 19, fontWeight: 800, color: '#0f172a', margin: '0 0 10px 0' }}>
                Zero-Trust In-Browser Execution
              </h3>
              <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13.5, color: '#475569', lineHeight: 1.58, margin: '0 0 20px 0' }}>
                All processing happens strictly on your device using WebAssembly, HTML5 Canvas, and Web Crypto APIs. Your confidential files never leave local RAM.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                {[
                  '0 network packets transmitted (verify in DevTools)',
                  'Direct hardware-accelerated processing (< 16ms)',
                  'Uncapped file sizes & batch queues (no paywalls)',
                  '100% offline ready via Progressive Web App (PWA)',
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#1e293b', fontWeight: 600 }}>
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        background: 'rgba(34, 197, 94, 0.15)',
                        color: '#16a34a',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                marginTop: 26,
                padding: '12px 18px',
                borderRadius: 14,
                background: 'rgba(34, 197, 94, 0.06)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 800, color: '#16a34a' }}>0 Network Packets Ever</span>
              <span style={{ fontSize: 11.5, color: '#2563eb', fontWeight: 700 }}>100% Free Forever</span>
            </div>
          </motion.div>
        </div>

        {/* ── DEEP COMPARISON MATRIX ROWS ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {COMPARISON_DIMENSIONS.map((row, idx) => (
            <motion.div
              key={row.category}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.08 }}
              transition={{ duration: 0.35, delay: idx * 0.05 }}
              className="tooldesk-matrix-row"
            >
              {/* Category / Dimension */}
              <div className="tooldesk-matrix-row-category" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 12,
                    background: 'rgba(79, 142, 247, 0.08)',
                    border: '1px solid rgba(79, 142, 247, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#2563eb',
                    flexShrink: 0,
                  }}
                >
                  {row.icon}
                </div>
                <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 14.5, fontWeight: 800, color: '#0f172a', lineHeight: 1.3 }}>
                  {row.category}
                </div>
              </div>

              {/* Cloud Alternative Column */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: '#dc2626',
                      background: 'rgba(239, 68, 68, 0.08)',
                      border: '1px solid rgba(239, 68, 68, 0.18)',
                      padding: '2px 8px',
                      borderRadius: 6,
                    }}
                  >
                    {row.cloudBadge}
                  </span>
                </div>
                <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: '#64748b', lineHeight: 1.5, margin: 0 }}>
                  {row.cloud}
                </p>
              </div>

              {/* ToolDesk Superpower Column */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 800,
                      color: '#16a34a',
                      background: 'rgba(34, 197, 94, 0.12)',
                      border: '1px solid rgba(34, 197, 94, 0.25)',
                      padding: '2px 8px',
                      borderRadius: 6,
                      letterSpacing: '0.2px',
                    }}
                  >
                    {row.tooldeskBadge}
                  </span>
                </div>
                <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: '#0f172a', fontWeight: 600, lineHeight: 1.5, margin: 0 }}>
                  {row.tooldesk}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* ── BOTTOM VERIFICATION RIBBON ── */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.12 }}
          transition={{ duration: 0.45, delay: 0.2 }}
          whileHover={{ y: -3, transition: { type: 'spring', stiffness: 400, damping: 25 } }}
          style={{
            marginTop: 36,
            padding: 'clamp(20px, 2.8vw, 28px)',
            borderRadius: 24,
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.92) 0%, rgba(240, 249, 255, 0.86) 100%)',
            backdropFilter: 'blur(28px) saturate(190%)',
            WebkitBackdropFilter: 'blur(28px) saturate(190%)',
            border: '1px solid rgba(79, 142, 247, 0.22)',
            boxShadow: '0 16px 40px -10px rgba(79, 142, 247, 0.08), inset 0 1px 0 #ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                background: 'linear-gradient(135deg, #06b6d4, #4F8EF7)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 6px 16px rgba(79, 142, 247, 0.3)',
                flexShrink: 0,
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div>
              <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                Verify Zero Packets Yourself in Real Time
              </div>
              <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: '#64748b', marginTop: 2 }}>
                Open Chrome/Safari DevTools (<code style={{ background: 'rgba(0,0,0,0.05)', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>F12 → Network</code>) while using any ToolDesk tool. You will observe exactly 0 outgoing bytes.
              </div>
            </div>
          </div>

          <a
            href="#tools"
            onClick={(e) => {
              const el = document.getElementById('tools')
              if (el) {
                e.preventDefault()
                el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                try {
                  window.history.pushState(null, '', '#tools')
                } catch {}
              }
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '11px 24px',
              borderRadius: 999,
              background: 'linear-gradient(135deg, #4F8EF7 0%, #3b82f6 100%)',
              color: '#ffffff',
              fontFamily: 'DM Sans, sans-serif',
              fontSize: 13.5,
              fontWeight: 700,
              textDecoration: 'none',
              boxShadow: '0 6px 20px rgba(79, 142, 247, 0.35)',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              flexShrink: 0,
              cursor: 'pointer',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = '0 8px 26px rgba(79, 142, 247, 0.45)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(79, 142, 247, 0.35)'
            }}
          >
            <span>Explore All {TOOLS.length} Zero-Trust Tools</span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </a>
        </motion.div>
      </div>
    </section>
  )
})
