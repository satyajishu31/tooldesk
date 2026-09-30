import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, X } from 'lucide-react'
import { hasChainedPayload, consumeChainedPayload, clearChainedPayload } from '../utils/toolChaining'

/**
 * ChainedInputBanner
 * Displays a non-intrusive alert when a previous tool handed off a compatible file/payload.
 */
export default function ChainedInputBanner({
  acceptedTypes = ['image'], // 'image' | 'pdf' | 'video' | 'text'
  onAccept,                 // (payload) => void
  style = {}
}) {
  const [payload, setPayload] = useState(null)

  useEffect(() => {
    // Check if there is an active chained payload matching accepted types
    if (hasChainedPayload(acceptedTypes)) {
      // Peek without clearing yet
      // Custom event allows updating
      const check = () => {
        // We peek at chaining
        if (hasChainedPayload(acceptedTypes)) {
          // fetch current
          const p = consumeChainedPayload(acceptedTypes)
          if (p) {
            setPayload(p)
          }
        }
      }
      check()
    }

    const handler = (e) => {
      const p = e.detail
      if (p && acceptedTypes.includes(p.type)) {
        setPayload(p)
      } else if (!p) {
        setPayload(null)
      }
    }

    window.addEventListener('tooldesk-chain-updated', handler)
    return () => window.removeEventListener('tooldesk-chain-updated', handler)
  }, [acceptedTypes])

  if (!payload) return null

  const handleUse = () => {
    if (onAccept) {
      onAccept(payload)
    }
    setPayload(null)
    clearChainedPayload()
  }

  const handleDismiss = () => {
    setPayload(null)
    clearChainedPayload()
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        style={{
          marginBottom: 16,
          padding: '12px 16px',
          background: 'linear-gradient(135deg, rgba(238, 242, 255, 0.95), rgba(245, 243, 255, 0.95))',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          border: '1px solid rgba(99, 102, 241, 0.25)',
          borderRadius: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
          boxShadow: '0 4px 14px rgba(99, 102, 241, 0.08)',
          ...style
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(99, 102, 241, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sparkles size={16} color="#4f46e5" />
          </div>
          <div>
            <div style={{
              fontFamily: 'Syne, sans-serif',
              fontSize: 13,
              fontWeight: 700,
              color: '#312e81'
            }}>
              File ready from previous tool
            </div>
            <div style={{
              fontFamily: 'DM Sans, sans-serif',
              fontSize: 12,
              color: '#475569'
            }}>
              <span style={{ fontWeight: 600 }}>{payload.filename || 'Output file'}</span>
              {payload.sourceTool ? ` · from ${payload.sourceTool}` : ''}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <motion.button
            type="button"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleUse}
            style={{
              padding: '7px 16px',
              minHeight: 32,
              borderRadius: 10,
              background: '#4f46e5',
              border: 'none',
              color: '#ffffff',
              fontFamily: 'DM Sans, sans-serif',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(79, 70, 229, 0.3)'
            }}
          >
            Load File
          </motion.button>
          <button
            type="button"
            onClick={handleDismiss}
            style={{
              padding: '7px 12px',
              minHeight: 32,
              borderRadius: 10,
              background: 'transparent',
              border: '1px solid rgba(0, 0, 0, 0.1)',
              color: '#64748b',
              fontFamily: 'DM Sans, sans-serif',
              fontSize: 12,
              cursor: 'pointer'
            }}
          >
            Dismiss
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
