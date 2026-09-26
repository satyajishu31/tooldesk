import React, { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Reveal } from '../../components/ToolShell'
import { useCopy } from '../../hooks'
import { saveFileWithFallback } from '../../utils/fileSaver'
import { createWorker } from 'tesseract.js'

export default function OCRImageText({ isEmbedded = false }) {
  const [file, setFile] = useState(null)
  const [imgUrl, setImgUrl] = useState('')
  const [imageMeta, setImageMeta] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [progressStage, setProgressStage] = useState('')
  const [progressPct, setProgressPct] = useState(0)
  const [extractedText, setExtractedText] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [copied, copy] = useCopy()
  const textareaRef = useRef(null)
  const workerRef = useRef(null)

  useEffect(() => {
    return () => {
      if (imgUrl) URL.revokeObjectURL(imgUrl)
      if (workerRef.current) {
        try { workerRef.current.terminate() } catch {}
        workerRef.current = null
      }
    }
  }, [imgUrl])

  const handleImageFile = (f) => {
    if (!f) return
    setErrorMsg('')
    setExtractedText('')
    setProgressPct(0)
    setProgressStage('')

    if (!f.type.startsWith('image/')) {
      setErrorMsg('Please select a valid image file (PNG, JPG, WebP, etc.).')
      return
    }
    if (f.size > 25 * 1024 * 1024) {
      setErrorMsg('Image size exceeds 25MB limit. Please upload a smaller file.')
      return
    }

    if (imgUrl) URL.revokeObjectURL(imgUrl)
    const url = URL.createObjectURL(f)
    setFile(f)
    setImgUrl(url)

    const img = new Image()
    img.onload = () => {
      setImageMeta({ width: img.naturalWidth, height: img.naturalHeight, size: f.size })
      // Auto-trigger OCR processing
      runOCR(f)
    }
    img.onerror = () => {
      setErrorMsg('Failed to decode image file.')
    }
    img.src = url
  }

  const runOCR = async (fileToProcess) => {
    const target = fileToProcess || file
    if (!target) return

    setIsProcessing(true)
    setErrorMsg('')
    setExtractedText('')
    setProgressStage('Initializing OCR engine...')
    setProgressPct(5)

    let worker = null
    try {
      worker = await createWorker('eng', 1, {
        workerPath: '/tesseract/worker.min.js',
        corePath: '/tesseract/core',
        langPath: '/tesseract/lang-data',
        gzip: true,
        logger: (m) => {
          if (m.status === 'loading tesseract core') {
            setProgressStage('Loading OCR core engine...')
            setProgressPct(Math.round((m.progress || 0) * 20))
          } else if (m.status === 'initializing tesseract' || m.status === 'loading language traineddata') {
            setProgressStage('Initializing language models...')
            setProgressPct(20 + Math.round((m.progress || 0) * 20))
          } else if (m.status === 'recognizing text') {
            setProgressStage('Recognizing document text...')
            setProgressPct(40 + Math.round((m.progress || 0) * 55))
          }
        }
      })

      workerRef.current = worker
      setProgressStage('Extracting text and structure...')
      setProgressPct(95)
      const ret = await worker.recognize(target)
      const rawText = ret?.data?.text || ''
      const clean = rawText.trim()

      if (!clean) {
        setErrorMsg('No readable text could be detected in this image. Try an image with higher resolution or sharper contrast.')
      } else {
        setExtractedText(clean)
        setProgressStage('Completed')
        setProgressPct(100)
      }
    } catch (err) {
      console.error('OCR Processing error:', err)
      setErrorMsg(`OCR recognition failed: ${err?.message || 'Unable to process image.'}`)
    } finally {
      if (worker) {
        try { await worker.terminate() } catch {}
      }
      workerRef.current = null
      setIsProcessing(false)
    }
  }

  const handleCopy = () => {
    if (!extractedText) return
    copy(extractedText)
  }

  const handleSelectAll = () => {
    if (textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.select()
    }
  }

  const handleDownloadTxt = () => {
    if (!extractedText) return
    const blob = new Blob([extractedText], { type: 'text/plain;charset=utf-8' })
    const baseName = file?.name ? file.name.replace(/\.[^.]+$/, '') : 'extracted_text'
    saveFileWithFallback(blob, `${baseName}_ocr.txt`)
  }

  const handleClear = () => {
    if (imgUrl) URL.revokeObjectURL(imgUrl)
    setFile(null)
    setImgUrl('')
    setImageMeta(null)
    setExtractedText('')
    setErrorMsg('')
    setProgressPct(0)
    setProgressStage('')
  }

  const wordCount = extractedText ? extractedText.trim().split(/\s+/).filter(Boolean).length : 0
  const charCount = extractedText ? extractedText.length : 0

  const content = (
    <div>
      {!imgUrl ? (
          <div style={{ textAlign: 'center', padding: '48px 20px' }}>
            <div style={{
              width: 76, height: 76, borderRadius: 20, margin: '0 auto 18px',
              background: 'rgba(156,111,222,.08)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 36, color: '#9C6FDE',
              border: '1.5px dashed rgba(156,111,222,.3)'
            }}>
              👁️
            </div>
            <h3 style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 'clamp(18px,3vw,21px)', color: '#0d0d1a', marginBottom: 6 }}>
              Optical Character Recognition (OCR)
            </h3>
            <p style={{ fontSize: 13.5, color: '#777', maxWidth: 460, margin: '0 auto 20px', lineHeight: 1.68 }}>
              Extract text from photos, screenshots, and scans 100% locally in your browser. Preserves line breaks, indentation, and paragraphs.
            </p>
            <label className="btn btn-primary btn-lg" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <span>📁 Select Image to Read</span>
              <input type="file" accept="image/*" onChange={(e) => handleImageFile(e.target.files?.[0])} style={{ display: 'none' }} />
            </label>
            {errorMsg && (
              <p style={{ color: '#ef4444', fontSize: 13.5, marginTop: 14 }}>{errorMsg}</p>
            )}
          </div>
        ) : (
          <Reveal>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h3 style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 19, color: '#0d0d1a', margin: 0 }}>
                  👁️ Extracted Text Result
                </h3>
                <p style={{ fontSize: 12.5, color: '#888', margin: '4px 0 0' }}>
                  {imageMeta ? `${imageMeta.width} × ${imageMeta.height} px · ` : ''}
                  {wordCount} words · {charCount} characters
                </p>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={isProcessing}
                  onClick={() => runOCR(file)}>
                  🔄 Re-scan
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleClear}>
                  ✕ Clear
                </button>
                <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer', margin: 0 }}>
                  <span>Upload Another</span>
                  <input type="file" accept="image/*" onChange={(e) => handleImageFile(e.target.files?.[0])} style={{ display: 'none' }} />
                </label>
              </div>
            </div>

            {/* Layout: Image Preview & Text Output */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 18, marginBottom: 18 }} className="ocr-split-grid">
              {/* Image Preview Panel */}
              <div style={{
                background: '#fafafa', borderRadius: 14, padding: 14,
                border: '1px solid rgba(0,0,0,.08)', display: 'flex',
                flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
              }}>
                <img
                  src={imgUrl}
                  alt="Scanned source"
                  style={{
                    maxWidth: '100%', maxHeight: 380, objectFit: 'contain',
                    borderRadius: 8, boxShadow: '0 2px 10px rgba(0,0,0,.06)'
                  }}
                />
              </div>

              {/* Text Output Panel */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {isProcessing ? (
                  <div style={{
                    flex: 1, minHeight: 280, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', background: '#fafbff',
                    borderRadius: 14, border: '1px solid rgba(79,142,247,.16)', padding: 24, textAlign: 'center'
                  }}>
                    <div style={{
                      width: 48, height: 48, borderRadius: 12, background: '#4F8EF7',
                      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 22, marginBottom: 16, animation: 'sjSpin 1.4s infinite linear'
                    }}>
                      ⚙️
                    </div>
                    <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 16, color: '#0d0d1a', marginBottom: 6 }}>
                      {progressStage || 'Reading text...'}
                    </div>
                    <div style={{ width: '80%', maxWidth: 280, height: 8, background: '#e0e7ff', borderRadius: 999, overflow: 'hidden', margin: '10px 0' }}>
                      <div style={{
                        width: `${progressPct}%`, height: '100%', background: '#4F8EF7',
                        borderRadius: 999, transition: 'width .2s ease'
                      }} />
                    </div>
                    <span style={{ fontSize: 12.5, color: '#777' }}>{progressPct}%</span>
                  </div>
                ) : errorMsg ? (
                  <div style={{
                    flex: 1, minHeight: 280, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', background: '#fff5f5',
                    borderRadius: 14, border: '1px solid rgba(239,68,68,.2)', padding: 24, textAlign: 'center'
                  }}>
                    <span style={{ fontSize: 32, marginBottom: 12 }}>⚠️</span>
                    <h4 style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, color: '#b91c1c', marginBottom: 6 }}>
                      Text Recognition Notice
                    </h4>
                    <p style={{ fontSize: 13, color: '#7f1d1d', maxWidth: 360, lineHeight: 1.6 }}>
                      {errorMsg}
                    </p>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => runOCR(file)}
                      style={{ marginTop: 14 }}>
                      Try Again
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <textarea
                      ref={textareaRef}
                        className="txt"
                        value={extractedText}
                        onChange={(e) => setExtractedText(e.target.value)}
                        placeholder="Extracted text will appear here..."
                        style={{
                          flex: 1, minHeight: 280, fontFamily: 'monospace', fontSize: 13.5,
                          lineHeight: 1.68, padding: 14, borderRadius: 12, resize: 'vertical'
                        }}
                    />

                    {/* Action Bar */}
                    <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={handleCopy}>
                        {copied ? '✓ Copied!' : '📋 Copy Text'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={handleSelectAll}>
                        Select All
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={handleDownloadTxt}>
                        💾 Download .txt
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Reveal>
        )}
    </div>
  )

  return content
}
