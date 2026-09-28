import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, ArrowRight, Check, X } from 'lucide-react'

export default function AICopilotBanner({ toolId, suggestions = [], onApply }) {
  const [dismissed, setDismissed] = useState(false)
  const [appliedId, setAppliedId] = useState(null)

  if (dismissed || !suggestions || !suggestions.length) return null

  const handleApply = (sug) => {
    setAppliedId(sug.id)
    if (typeof onApply === 'function') {
      onApply(sug.action)
    }
    setTimeout(() => {
      setAppliedId(null)
    }, 1500)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2 }}
      style={{
        margin: '12px 0 18px',
        padding: '10px 14px',
        borderRadius: 14,
        background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.05), rgba(79, 142, 247, 0.08))',
        border: '1px solid rgba(124, 58, 237, 0.18)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 10,
        boxShadow: '0 2px 8px rgba(124, 58, 237, 0.04)',
        fontFamily: 'DM Sans, sans-serif'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <div style={{
          width: 26,
          height: 26,
          borderRadius: 8,
          background: 'linear-gradient(135deg, #7C3AED, #4F8EF7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
          <Sparkles size={13} style={{ color: '#ffffff' }} />
        </div>
        <div style={{ fontSize: 13, color: '#334155', fontWeight: 600 }}>
          <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, color: '#7C3AED', marginRight: 5 }}>AI Copilot:</span>
          {suggestions[0]?.label || 'Recommended configuration available'}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {suggestions.map((sug) => (
          <button
            key={sug.id}
            onClick={() => handleApply(sug)}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              border: 'none',
              background: appliedId === sug.id ? '#22c55e' : 'linear-gradient(135deg, #7C3AED, #4F8EF7)',
              color: '#ffffff',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              boxShadow: '0 2px 6px rgba(124, 58, 237, 0.25)',
              transition: 'all 0.15s'
            }}
          >
            {appliedId === sug.id ? <Check size={12} /> : <ArrowRight size={12} />}
            {appliedId === sug.id ? 'Applied' : (sug.btnLabel || 'Apply')}
          </button>
        ))}

        <button
          onClick={() => setDismissed(true)}
          title="Dismiss"
          aria-label="Dismiss AI Copilot"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            padding: 4,
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <X size={14} />
        </button>
      </div>
    </motion.div>
  )
}
