import React from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { TOOLS } from '../constants'
import AppIcon from './AppIcon'

const FOOTER_STYLE = `
.footer-link:hover { background:rgba(255,255,255,.06)!important; color:#fff!important; transform:translateX(3px)!important; }
.footer-link { transition: background .14s, color .14s, transform .14s !important; will-change: transform; }
`

const TOOL_COUNT = TOOLS.length

const COLS = [
  { title: 'Text & Security', cats: ['Text', 'Security', 'Inspire'] },
  { title: 'Convert & Math',  cats: ['Math', 'Finance', 'Utility'] },
  { title: 'Image & Design',  cats: ['Image', 'Design'] },
  { title: 'Docs & Video',    cats: ['Document', 'Social', 'Vault', 'Generate', 'Video'] },
].map(c => ({
  ...c,
  tools: TOOLS.filter(t => c.cats.includes(t.cat))
}))

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <>
    <style>{FOOTER_STYLE}</style>
    <motion.footer
      initial={{ opacity:0 }}
      whileInView={{ opacity:1 }}
      viewport={{ once:true, amount:0.12 }}
      transition={{ duration:.38, ease:[.22,1,.36,1] }}
      style={{
        willChange:'opacity',
        background: 'linear-gradient(180deg, #0f0f1e 0%, #0a0a14 100%)',
        color: '#fff',
        fontFamily: 'DM Sans, sans-serif',
        borderTop: '1px solid rgba(255,255,255,.06)',
      }}>

      {/* ── BRAND STRIP ── */}
      <div style={{
        maxWidth: 1180, margin: '0 auto',
        padding: '48px 24px 0',
        display: 'flex', alignItems: 'flex-start',
        justifyContent: 'space-between', gap: 32, flexWrap: 'wrap',
      }}>

        {/* Brand — HD Transparent Logo */}
        <div style={{ minWidth: 200, maxWidth: 240 }}>
          <Link to="/" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', marginBottom: 14 }}>
            <img
              src="/logo-white.png"
              alt="ToolDesk"
              onError={e => {
                if (!e.currentTarget.dataset.fallback) {
                  e.currentTarget.dataset.fallback = '1'
                  e.currentTarget.src = 'logo-white.png'
                }
              }}
              style={{
                height: 40,
                width: 'auto',
                maxWidth: '100%',
                display: 'block',
                objectFit: 'contain',
                filter: 'drop-shadow(0 2px 12px rgba(79, 142, 247, 0.22))'
              }}
            />
          </Link>

          <p style={{ fontSize: 14, color: 'rgba(255,255,255,.7)', lineHeight: 1.68, fontWeight: 400, marginBottom: 20 }}>
            {TOOL_COUNT} powerful browser tools. No installs, no accounts, no uploads — ever.
          </p>

          {/* Badges */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {[
              {
                icon: (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                ),
                label: '100% Private',
                color: '#22c55e',
              },
              {
                icon: (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4F8EF7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                ),
                label: 'Zero server uploads',
                color: '#4F8EF7',
              },
              {
                icon: (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                ),
                label: 'Free forever',
                color: '#a855f7',
              },
            ].map(b => (
              <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}>
                  {b.icon}
                </span>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,.82)', fontWeight: 500 }}>{b.label}</span>
              </div>
            ))}
          </div>

          {/* Author credit */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.14)',
            padding: '7px 14px', borderRadius: 10,
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,.16)',
          }}>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,.75)', fontWeight: 400 }}>Built by</span>
            <span style={{
              fontSize: 13, fontWeight: 700,
              background: 'linear-gradient(125deg, #4F8EF7, #9C6FDE)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}>Satyajishu</span>
          </div>
        </div>

        {/* Tool columns */}
        <div style={{
          flex: 1, display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))',
          gap: '28px 24px',
        }}>
          {COLS.map(col => (
            <div key={col.title}>
              <div style={{
                fontSize: 12.5, fontWeight: 700, letterSpacing: '1px',
                textTransform: 'uppercase', color: 'rgba(255,255,255,.85)',
                marginBottom: 16, paddingBottom: 10,
                borderBottom: '1px solid rgba(255,255,255,.06)',
              }}>{col.title}</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {col.tools.map(t => (
                  <Link key={t.id} to={t.path}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 9,
                      padding: '6px 8px', borderRadius: 9,
                      fontSize: 14, color: 'rgba(255,255,255,.72)',
                      textDecoration: 'none', fontWeight: 400,
                      transition: 'all .15s ease',
                    }}
                    className="footer-link">
                    {/* Apple-style mini icon */}
                    <AppIcon src={t.icon} alt="" size={26}/>
                    <span style={{ lineHeight: 1.3 }}>{t.title}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── BOTTOM BAR ── */}
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 24px' }}>
        <div style={{ borderTop: '1px solid rgba(255,255,255,.06)', marginTop: 40 }}/>
        <div style={{
          padding: '18px 0 28px',
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', flexWrap: 'wrap', gap: 12,
        }}>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,.7)', fontWeight: 400 }}>
            © {year} ToolDesk · All Rights Reserved ·{' '}
            <span style={{
              fontWeight: 700, color: 'rgba(255,255,255,.85)',
              background: 'linear-gradient(125deg, #4F8EF7, #9C6FDE)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}>Satyajishu</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              {
                label: `${TOOL_COUNT} Tools`,
                icon: (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4F8EF7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                  </svg>
                ),
              },
              {
                label: 'Free Forever',
                icon: (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                ),
              },
              {
                label: 'Browser-Only',
                icon: (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                ),
              },
              {
                label: 'No Login Required',
                icon: (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <polyline points="9 12 11 14 15 10" />
                  </svg>
                ),
              },
            ].map(b => (
              <span key={b.label} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 12px', borderRadius: 999,
                border: '1px solid rgba(255,255,255,.12)',
                background: 'rgba(255,255,255,.06)',
                backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,.10)',
                fontSize: 12.5, color: 'rgba(255,255,255,.88)', fontWeight: 600,
              }}>
                {b.icon}
                <span>{b.label}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </motion.footer>
  </>
  )
}
