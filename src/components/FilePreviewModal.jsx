import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Download, Share2, Copy, Check, FileText } from 'lucide-react'
import { saveFileWithFallback, shareFile } from '../utils/fileSaver'

export default function FilePreviewModal() {
  const [isOpen, setIsOpen] = useState(false)
  const [fileItem, setFileItem] = useState(null)
  const [textContent, setTextContent] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const copyTimerRef = useRef(null)

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  useEffect(() => {
    const handlePreview = async (e) => {
      const item = e.detail
      if (!item) return

      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl)
      }

      setFileItem(item)
      setTextContent('')
      setCopied(false)

      const blob = item.blob || item.file
      const mime = item.mimeType || blob?.type || ''
      const isText = mime.includes('text') || mime.includes('json') || mime.includes('csv') ||
        /\.(txt|json|csv|srt|vtt|md|xml)$/i.test(item.filename || '')

      if (blob) {
        if (isText) {
          try {
            const text = await blob.text()
            setTextContent(text)
          } catch {}
        }
        try {
          const url = URL.createObjectURL(blob)
          setPreviewUrl(url)
        } catch {}
      }

      setIsOpen(true)
    }

    window.addEventListener('tooldesk-preview-file', handlePreview)
    return () => window.removeEventListener('tooldesk-preview-file', handlePreview)
  }, [previewUrl])

  const handleClose = () => {
    setIsOpen(false)
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl)
      setPreviewUrl('')
    }
  }

  const handleCopy = () => {
    if (textContent) {
      navigator.clipboard?.writeText(textContent)
      setCopied(true)
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleDownload = () => {
    if (fileItem && (fileItem.blob || fileItem.file)) {
      saveFileWithFallback(fileItem.blob || fileItem.file, fileItem.filename, fileItem.mimeType)
    }
  }

  const handleShare = () => {
    if (fileItem && (fileItem.blob || fileItem.file)) {
      shareFile({ blob: fileItem.blob || fileItem.file, filename: fileItem.filename, mimeType: fileItem.mimeType })
    }
  }

  if (!isOpen || !fileItem) return null

  const mime = fileItem.mimeType || ''
  const isImage = mime.startsWith('image/') || /\.(png|jpe?g|webp|svg|ico|gif)$/i.test(fileItem.filename || '')
  const isPdf = mime.includes('pdf') || /\.pdf$/i.test(fileItem.filename || '')

  return (
    <AnimatePresence>
      <div style={{ position: 'fixed', inset: 0, zIndex: 10005, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(13, 13, 26, 0.45)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)'
          }}
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 8 }}
          transition={{ duration: 0.2, ease: [.22, 1, .36, 1] }}
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: 640,
            maxHeight: '85vh',
            background: '#ffffff',
            borderRadius: 22,
            boxShadow: '0 24px 60px rgba(0,0,0,0.22)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            fontFamily: 'DM Sans, sans-serif',
            zIndex: 1
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid #e2e8f0',
            background: '#fafbff'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(79,142,247,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <FileText size={18} style={{ color: '#4F8EF7' }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 15, color: '#0d0d1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {fileItem.filename}
                </div>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  {fileItem.mimeType} {fileItem.size ? `· ${Math.round(fileItem.size / 1024)} KB` : ''}
                </div>
              </div>
            </div>

            <button
              onClick={handleClose}
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: '#f1f5f9',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#64748b',
                flexShrink: 0
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Content Preview */}
          <div style={{ flex: 1, overflow: 'auto', padding: '20px', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 260 }}>
            {isImage && previewUrl ? (
              <img
                src={previewUrl}
                alt={fileItem.filename}
                style={{ maxWidth: '100%', maxHeight: '55vh', objectFit: 'contain', borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}
              />
            ) : isPdf && previewUrl ? (
              <iframe
                src={previewUrl}
                title={fileItem.filename}
                style={{ width: '100%', height: '55vh', border: 'none', borderRadius: 12, background: '#ffffff' }}
              />
            ) : textContent ? (
              <pre style={{
                width: '100%',
                maxHeight: '55vh',
                overflow: 'auto',
                background: '#ffffff',
                padding: '16px',
                borderRadius: 12,
                border: '1px solid #e2e8f0',
                fontSize: 13,
                fontFamily: 'monospace',
                lineHeight: 1.6,
                color: '#1e293b',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                margin: 0
              }}>
                {textContent}
              </pre>
            ) : (
              <div style={{ textAlign: 'center', color: '#64748b' }}>
                <FileText size={48} style={{ opacity: 0.3, marginBottom: 12 }} />
                <div style={{ fontSize: 14, fontWeight: 600 }}>Preview not available for this binary format</div>
                <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>You can download the file to inspect its contents.</div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 10,
            padding: '14px 20px',
            borderTop: '1px solid #e2e8f0',
            background: '#ffffff'
          }}>
            {textContent && (
              <button
                onClick={handleCopy}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '9px 16px',
                  borderRadius: 10,
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: copied ? '#16a34a' : '#475569',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy Text'}
              </button>
            )}

            <button
              onClick={handleShare}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '9px 16px',
                borderRadius: 10,
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#475569',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <Share2 size={14} />
              Share
            </button>

            <button
              onClick={handleDownload}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '9px 20px',
                borderRadius: 10,
                border: 'none',
                background: 'linear-gradient(135deg, #4F8EF7, #3272d9)',
                color: '#ffffff',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(79,142,247,0.3)'
              }}
            >
              <Download size={14} />
              Download
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
