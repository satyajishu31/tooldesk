import React from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { COMPATIBLE_TOOLS, setChainedPayload } from '../utils/toolChaining'

/**
 * ToolChainingBar
 * Renders underneath an output result card.
 * Allows instant 1-click continuation into a compatible tool.
 */
export default function ToolChainingBar({
  payload, // { file, dataUrl, text, filename, mimeType, type, sourceTool }
  style = {}
}) {
  const navigate = useNavigate()

  if (!payload || !payload.type) return null
  const compatible = COMPATIBLE_TOOLS[payload.type] || []
  if (!compatible.length) return null

  // Filter out the tool that generated it to avoid redundant self-chains
  const filtered = compatible.filter(t => t.id !== payload.sourceTool)
  if (!filtered.length) return null

  const handleChain = (tool) => {
    setChainedPayload({
      ...payload,
      timestamp: Date.now()
    })
    navigate(tool.path)
  }

  return (
    <div style={{
      marginTop: 20,
      padding: '14px 18px',
      background: 'rgba(255, 255, 255, 0.88)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid rgba(13, 71, 161, 0.12)',
      borderRadius: 16,
      boxShadow: '0 4px 18px rgba(0, 0, 0, 0.03)',
      ...style
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14 }}>🔗</span>
          <span style={{
            fontFamily: 'Syne, sans-serif',
            fontSize: 13,
            fontWeight: 700,
            color: '#1e293b'
          }}>
            Continue Workflow:
          </span>
          <span style={{
            fontFamily: 'DM Sans, sans-serif',
            fontSize: 12,
            color: '#64748b'
          }}>
            Pass this output directly to next tool without re-uploading
          </span>
        </div>
      </div>

      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8
      }}>
        {filtered.map(tool => (
          <motion.button
            key={tool.id}
            type="button"
            whileHover={{ scale: 1.02, y: -1 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleChain(tool)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              minHeight: 34,
              borderRadius: 999,
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              fontFamily: 'DM Sans, sans-serif',
              fontSize: 12.5,
              fontWeight: 600,
              color: '#334155',
              cursor: 'pointer',
              transition: 'all 0.18s ease'
            }}
          >
            <span>{tool.icon}</span>
            <span>{tool.title}</span>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>→</span>
          </motion.button>
        ))}
      </div>
    </div>
  )
}
