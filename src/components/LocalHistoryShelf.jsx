import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export default function LocalHistoryShelf() {
  const [isOpen, setIsOpen] = useState(false)
  const [history, setHistory] = useState([])
  const [copiedId, setCopiedId] = useState(null)
  const drawerRef = useRef(null)
  const copyTimerRef = useRef(null)

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    }
  }, [])

  const loadHistory = () => {
    try {
      const raw = localStorage.getItem('tooldesk-history')
      setHistory(raw ? JSON.parse(raw) : [])
    } catch {
      setHistory([])
    }
  }

  useEffect(() => {
    loadHistory()
    const handleOpen = () => setIsOpen(true)
    window.addEventListener('tooldesk-history-updated', loadHistory)
    window.addEventListener('tooldesk-open-history', handleOpen)
    return () => {
      window.removeEventListener('tooldesk-history-updated', loadHistory)
      window.removeEventListener('tooldesk-open-history', handleOpen)
    }
  }, [])

  // Close drawer if user clicks outside or presses Escape
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (isOpen && drawerRef.current && !drawerRef.current.contains(e.target) && !e.target.closest('.history-toggle-btn')) {
        setIsOpen(false)
      }
    }
    const handleKeyDown = (e) => {
      if (isOpen && e.key === 'Escape') {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('touchstart', handleOutsideClick, { passive: true })
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('touchstart', handleOutsideClick)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const copyItem = (item) => {
    navigator.clipboard?.writeText(String(item?.value || ''))
    setCopiedId(item.id)
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    copyTimerRef.current = setTimeout(() => setCopiedId(null), 2000)
  }

  const deleteItem = (id) => {
    try {
      const updated = history.filter(item => item.id !== id)
      localStorage.setItem('tooldesk-history', JSON.stringify(updated))
      setHistory(updated)
    } catch (e) {
      console.error(e)
    }
  }

  const clearAll = () => {
    if (window.confirm('Clear all local history? This cannot be undone.')) {
      try {
        localStorage.removeItem('tooldesk-history')
        setHistory([])
      } catch (e) {
        console.error(e)
      }
    }
  }

  return (
    <>
      {/* Floating button — hidden, but kept for event compatibility */}
      <div style={{ display:'none' }}>
        <button className="history-toggle-btn" onClick={() => setIsOpen(o => !o)}/>
      </div>

      {/* Backdrop when open */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            transition={{ duration:0.16 }}
            onClick={() => setIsOpen(false)}
            style={{ position:'fixed', inset:0, zIndex:9998, background:'rgba(13,13,26,0.36)', backdropFilter:'blur(8px)', WebkitBackdropFilter:'blur(8px)' }}
          />
        )}
      </AnimatePresence>

      {/* Slide-out History Drawer — renders at fixed viewport position, never hidden */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={drawerRef}
            initial={{ opacity:0, x:-280 }}
            animate={{ opacity:1, x:0 }}
            exit={{ opacity:0, x:-280 }}
            transition={{ duration: 0.22, ease:[.22,1,.36,1] }}
            style={{
              position:'fixed',
              left:'calc(16px + env(safe-area-inset-left, 0px))',
              top:'calc(80px + env(safe-area-inset-top, 0px))',
              bottom:'calc(16px + env(safe-area-inset-bottom, 0px))',
              width:320,
              maxWidth:'calc(100vw - 32px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))',
              background:'#ffffff',
              borderRadius:22,
              boxShadow:'0 24px 60px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.06)',
              border:'1px solid rgba(0,0,0,0.08)',
              display:'flex',
              flexDirection:'column',
              overflow:'hidden',
              zIndex:9999,
              fontFamily:'DM Sans, sans-serif',
            }}>
            {/* Header */}
            <div style={{
              background: 'linear-gradient(135deg, #0d0d1a, #1f1f3a)',
              padding: '16px',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,.22)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>🕒</span>
                <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 15, letterSpacing: '.4px' }}>Local History</span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                style={{
                  background: 'rgba(255,255,255,.15)',
                  border: 'none',
                  borderRadius: '50%',
                  width: 26, height: 26,
                  color: '#ffffff',
                  fontSize: 12,
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background .15s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.28)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,.15)'}
              >
                ✕
              </button>
            </div>

            {/* List */}
            <div style={{
              flex: 1,
              padding: '16px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              background: 'rgba(250, 251, 255, 0.72)'
            }}>
              {history.length > 0 ? (
                history.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      padding: '10px 12px',
                      background: '#ffffff',
                      borderRadius: 14,
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6
                    }}
                  >
                    {/* Tool details row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#4F8EF7', letterSpacing: '.4px' }}>
                        {item.tool}
                      </span>
                      <span style={{ fontSize: 10.5, color: '#bbb' }}>{item.timestamp}</span>
                    </div>

                    {/* Value content */}
                    <div style={{
                      fontSize: 13,
                      fontFamily: String(item?.value || '').length > 30 ? 'monospace' : 'DM Sans, sans-serif',
                      color: '#333333',
                      wordBreak: 'break-all',
                      lineHeight: 1.55,
                      background: '#f8f9fa',
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: '1px solid rgba(0,0,0,0.02)'
                    }}>
                      {String(item?.value || '')}
                    </div>

                    {/* Actions row */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                      <button
                        onClick={() => copyItem(item)}
                        style={{
                          border: 'none',
                          background: 'none',
                          color: copiedId === item.id ? '#22c55e' : '#888',
                          fontSize: 11.5,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 3,
                          transition: 'color .15s',
                        }}
                      >
                        {copiedId === item.id ? '✓ Copied' : '📋 Copy'}
                      </button>
                      <button
                        onClick={() => deleteItem(item.id)}
                        style={{
                          border: 'none',
                          background: 'none',
                          color: '#bbb',
                          fontSize: 11.5,
                          fontWeight: 700,
                          cursor: 'pointer',
                          transition: 'color .15s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                        onMouseLeave={e => e.currentTarget.style.color = '#bbb'}
                      >
                        ✕ Delete
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#bbb', gap: 10 }}>
                  <span style={{ fontSize: 40 }}>🕒</span>
                  <div style={{ fontSize: 13.5, fontWeight: 500, textAlign: 'center', lineHeight: 1.6 }}>
                    Your history is currently empty.<br />Generated items will appear here.
                  </div>
                </div>
              )}
            </div>

            {/* Footer Clear All */}
            {history.length > 0 && (
              <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(0,0,0,0.06)', background: 'rgba(255, 255, 255, 0.85)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9)', display: 'flex' }}>
                <motion.button
                  onClick={clearAll}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: 12,
                    border: '1.5px solid rgba(239, 68, 68, 0.2)',
                    background: 'rgba(239, 68, 68, 0.04)',
                    color: '#ef4444',
                    fontWeight: 700,
                    fontSize: 12.5,
                    cursor: 'pointer'
                  }}
                >
                  🗑️ Clear All History
                </motion.button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
