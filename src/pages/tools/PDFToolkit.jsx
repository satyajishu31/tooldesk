import React, { useState, useRef, useCallback, useEffect, useMemo, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ToolShell, { ToolCard, Reveal } from '../../components/ToolShell'
import { TOOLS } from '../../constants'
import { DocSummaryPanel, ContractAuditorPanel } from '../../components/AIPanel'
import { saveFileWithFallback } from '../../utils/fileSaver'
import { addToHistory } from '../../utils/history'
import { useToolHistory } from '../../hooks/useToolHistory'
import {
  formatBytes,
  PAGE_SIZES,
  convertDocxToPdf,
  convertImagesToPdf,
  convertTextToPdf,
  convertMarkdownToPdf,
  convertHtmlToPdf,
  convertCsvToPdf,
  convertJsonToPdf,
  convertXmlToPdf,
  renderPdfPagesToImages,
  generatePdfThumbnails,
  mergePdfs,
  splitPdfPages,
  extractPagesToSinglePdf,
  reorderPdfPages,
  deletePdfPages,
  rotatePdfPages,
  compressPdf,
  readPdfMetadata,
  updatePdfMetadata,
  watermarkPdf,
  createZipFromFiles,
  getPdfJs,
  parsePageRangeString,
  formatPageRangeString,
  cropPdfPages,
  flattenPdf,
  cleanPdfMetadata,
  lockPdf,
  unlockPdf,
  changePdfPassword,
  redactPdfPages,
  signPdf,
  getPdfFormFields,
  fillPdfForm,
  comparePdfs,
  addPageNumbers,
  addHeaderFooter,
  createPdfFormFields,
} from '../../utils/pdfEngine'
import { createOutput } from '../../utils/fileEngine'
import { createJob, JOB_STATES } from '../../utils/jobEngine'
import { createBatchSession, BATCH_ITEM_STATUS } from '../../utils/batchEngine'
import { consumePendingInboundFiles } from '../../utils/inboundShare'
import ToolChainingBar from '../../components/ToolChainingBar'
import ChainedInputBanner from '../../components/ChainedInputBanner'
import {
  FileUp, FileDown, Layers, ShieldCheck, SlidersHorizontal,
  FileText, Image, FileCode, Globe, FileSpreadsheet, Code, Code2,
  Palette, ScanText, Files, Scissors, FileCheck, ArrowUpDown, Trash2,
  RotateCw, Crop, Archive, Diff, Binary, EyeOff, PenTool, FormInput,
  LayoutTemplate, FileCheck2, Lock, Unlock, KeyRound, Minimize2, Sparkles,
  Tag, Droplets, Info, Check, Copy, Clock, AlertTriangle, Eye,
  CheckCircle2, Loader2, X, ArrowUp, ArrowDown
} from 'lucide-react'

const tool = TOOLS.find(t => t.id === 'pdf')

/* ══════════════════════════════════════════════════════════
   STUDIO CATEGORIES & ACTIONS CONFIGURATION
   ══════════════════════════════════════════════════════════ */
const CATEGORIES = [
  { id: 'to-pdf',    label: 'Convert to PDF',   icon: <FileUp size={16} />, desc: 'Create PDFs from documents, images & data' },
  { id: 'from-pdf',  label: 'Convert from PDF', icon: <FileDown size={16} />, desc: 'Export PDF to high-res images & text' },
  { id: 'organize',  label: 'Organize',         icon: <Layers size={16} />, desc: 'Merge, split, reorder, delete, rotate, crop & ZIP' },
  { id: 'security',  label: 'Security & Sign',  icon: <ShieldCheck size={16} />, desc: 'Redact, sign, fill forms, lock, unlock & flatten' },
  { id: 'optimize',  label: 'Optimize & Edit',  icon: <SlidersHorizontal size={16} />, desc: 'Compress, clean metadata & watermark' },
]

const ALL_ACTIONS = [
  // ── Convert to PDF ──
  {
    id: 'docx-pdf', cat: 'to-pdf',
    label: 'DOCX to PDF', icon: <FileText size={20} color="#4F8EF7" />,
    desc: 'Word document to vector PDF',
    accept: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    multiple: false,
    color: '#4F8EF7',
  },
  {
    id: 'img-pdf', cat: 'to-pdf',
    label: 'Images to PDF', icon: <Image size={20} color="#22c55e" />,
    desc: 'Combine PNG, JPG, WebP into PDF',
    accept: 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/bmp',
    multiple: true,
    color: '#22c55e',
  },
  {
    id: 'md-pdf', cat: 'to-pdf',
    label: 'Markdown to PDF', icon: <FileCode size={20} color="#9C6FDE" />,
    desc: 'Render Markdown with headings & code',
    accept: '.md,.txt,text/markdown,text/plain',
    multiple: false,
    color: '#9C6FDE',
  },
  {
    id: 'html-pdf', cat: 'to-pdf',
    label: 'HTML to PDF', icon: <Globe size={20} color="#f59e0b" />,
    desc: 'Convert HTML page to PDF document',
    accept: '.html,.htm,text/html',
    multiple: false,
    color: '#f59e0b',
  },
  {
    id: 'txt-pdf', cat: 'to-pdf',
    label: 'TXT to PDF', icon: <FileText size={20} color="#06b6d4" />,
    desc: 'Plain text to paginated PDF',
    accept: '.txt,text/plain',
    multiple: false,
    color: '#06b6d4',
  },
  {
    id: 'csv-pdf', cat: 'to-pdf',
    label: 'CSV to PDF', icon: <FileSpreadsheet size={20} color="#10b981" />,
    desc: 'Tabular CSV data to formatted PDF table',
    accept: '.csv,text/csv',
    multiple: false,
    color: '#10b981',
  },
  {
    id: 'json-pdf', cat: 'to-pdf',
    label: 'JSON to PDF', icon: <Code size={20} color="#ec4899" />,
    desc: 'Structured JSON data to PDF document',
    accept: '.json,application/json',
    multiple: false,
    color: '#ec4899',
  },
  {
    id: 'xml-pdf', cat: 'to-pdf',
    label: 'XML to PDF', icon: <Code2 size={20} color="#6366f1" />,
    desc: 'Hierarchical XML formatted into PDF',
    accept: '.xml,text/xml,application/xml',
    multiple: false,
    color: '#6366f1',
  },

  // ── Convert from PDF ──
  {
    id: 'pdf-png', cat: 'from-pdf',
    label: 'PDF to PNG', icon: <Image size={20} color="#4F8EF7" />,
    desc: 'High-res lossless PNG images',
    accept: '.pdf,application/pdf',
    multiple: false,
    color: '#4F8EF7',
  },
  {
    id: 'pdf-jpg', cat: 'from-pdf',
    label: 'PDF to JPG', icon: <Palette size={20} color="#f59e0b" />,
    desc: 'Compressed JPEG images with quality slider',
    accept: '.pdf,application/pdf',
    multiple: false,
    color: '#f59e0b',
  },
  {
    id: 'ocr', cat: 'from-pdf',
    label: 'PDF / Scanned OCR', icon: <ScanText size={20} color="#9C6FDE" />,
    desc: 'Extract text layer & optical OCR recognition',
    accept: '.pdf,application/pdf,image/*',
    multiple: false,
    color: '#9C6FDE',
  },

  // ── Organize ──
  {
    id: 'merge', cat: 'organize',
    label: 'Merge PDFs', icon: <Files size={20} color="#4F8EF7" />,
    desc: 'Combine multiple PDFs into one in custom order',
    accept: '.pdf,application/pdf',
    multiple: true,
    color: '#4F8EF7',
  },
  {
    id: 'split', cat: 'organize',
    label: 'Split All Pages', icon: <Scissors size={20} color="#ef4444" />,
    desc: 'Separate each page into its own PDF file',
    accept: '.pdf,application/pdf',
    multiple: false,
    color: '#ef4444',
  },
  {
    id: 'extract', cat: 'organize',
    label: 'Extract Pages', icon: <FileCheck size={20} color="#10b981" />,
    desc: 'Visually select specific pages to extract',
    accept: '.pdf,application/pdf',
    multiple: false,
    color: '#10b981',
  },
  {
    id: 'reorder', cat: 'organize',
    label: 'Reorder Pages', icon: <ArrowUpDown size={20} color="#8b5cf6" />,
    desc: 'Rearrange page sequence with live preview',
    accept: '.pdf,application/pdf',
    multiple: false,
    color: '#8b5cf6',
  },
  {
    id: 'delete', cat: 'organize',
    label: 'Delete Pages', icon: <Trash2 size={20} color="#f43f5e" />,
    desc: 'Remove unwanted pages with visual selector',
    accept: '.pdf,application/pdf',
    multiple: false,
    color: '#f43f5e',
  },
  {
    id: 'rotate', cat: 'organize',
    label: 'Rotate Pages', icon: <RotateCw size={20} color="#06b6d4" />,
    desc: 'Rotate all or specific pages by 90°, 180°, 270°',
    accept: '.pdf,application/pdf',
    multiple: false,
    color: '#06b6d4',
  },
  {
    id: 'crop', cat: 'organize',
    label: 'Crop Pages', icon: <Crop size={20} color="#3b82f6" />,
    desc: 'Visually trim page margins and boundaries',
    accept: '.pdf,application/pdf',
    multiple: false,
    color: '#3b82f6',
  },
  {
    id: 'pdf-zip', cat: 'organize',
    label: 'PDFs to ZIP', icon: <Archive size={20} color="#f59e0b" />,
    desc: 'Package multiple PDFs into a single ZIP archive',
    accept: '.pdf,application/pdf',
    multiple: true,
    color: '#f59e0b',
  },
  {
    id: 'compare', cat: 'organize',
    label: 'Compare PDFs', icon: <Diff size={20} color="#0284c7" />,
    desc: 'Compare 2 documents: page counts, metadata & text differences',
    accept: '.pdf,application/pdf',
    multiple: true,
    color: '#0284c7',
  },
  {
    id: 'page-numbers', cat: 'organize',
    label: 'Page Numbers', icon: <Binary size={20} color="#6366f1" />,
    desc: 'Add customizable headers, footers & page numbering',
    accept: '.pdf,application/pdf',
    multiple: false,
    color: '#6366f1',
  },
  {
    id: 'header-footer', cat: 'organize',
    label: 'Header & Footer', icon: <FileText size={20} color="#06b6d4" />,
    desc: 'Add custom headers and footers with page numbers & dates',
    accept: '.pdf,application/pdf',
    multiple: false,
    color: '#06b6d4',
  },

  // ── Security & Sign ──
  {
    id: 'redact', cat: 'security',
    label: 'Permanent Redaction', icon: <EyeOff size={20} color="#ef4444" />,
    desc: 'Permanently destroy sensitive text & pixel content',
    accept: '.pdf,application/pdf',
    multiple: false,
    color: '#ef4444',
  },
  {
    id: 'sign', cat: 'security',
    label: 'Sign PDF', icon: <PenTool size={20} color="#4F8EF7" />,
    desc: 'Draw or upload visual signature on document',
    accept: '.pdf,application/pdf',
    multiple: false,
    color: '#4F8EF7',
  },
  {
    id: 'forms', cat: 'security',
    label: 'Fill Forms', icon: <FormInput size={20} color="#10b981" />,
    desc: 'Fill interactive PDF fields & checkboxes',
    accept: '.pdf,application/pdf',
    multiple: false,
    color: '#10b981',
  },
  {
    id: 'form-builder', cat: 'security',
    label: 'Form Builder', icon: <LayoutTemplate size={20} color="#3b82f6" />,
    desc: 'Add interactive text fields, checkboxes & dropdowns',
    accept: '.pdf,application/pdf',
    multiple: false,
    color: '#3b82f6',
  },
  {
    id: 'flatten', cat: 'security',
    label: 'Flatten PDF', icon: <FileCheck2 size={20} color="#8b5cf6" />,
    desc: 'Burn form fields and annotations into static PDF',
    accept: '.pdf,application/pdf',
    multiple: false,
    color: '#8b5cf6',
  },
  {
    id: 'lock', cat: 'security',
    label: 'Lock / Encrypt PDF', icon: <Lock size={20} color="#6366f1" />,
    desc: 'True AES-256 / RC4 password protection & permissions',
    accept: '.pdf,application/pdf',
    multiple: false,
    color: '#6366f1',
  },
  {
    id: 'unlock', cat: 'security',
    label: 'Unlock Encrypted PDF', icon: <Unlock size={20} color="#22c55e" />,
    desc: 'Lossless vector decryption with known password',
    accept: '.pdf,application/pdf',
    multiple: false,
    color: '#22c55e',
  },
  {
    id: 'change-password', cat: 'security',
    label: 'Change Password', icon: <KeyRound size={20} color="#ec4899" />,
    desc: 'Update credentials or re-encrypt with new password',
    accept: '.pdf,application/pdf',
    multiple: false,
    color: '#ec4899',
  },

  // ── Optimize ──
  {
    id: 'compress', cat: 'optimize',
    label: 'Compress PDF', icon: <Minimize2 size={20} color="#22c55e" />,
    desc: 'Reduce file size with object streams optimization',
    accept: '.pdf,application/pdf',
    multiple: false,
    color: '#22c55e',
  },
  {
    id: 'clean-meta', cat: 'optimize',
    label: 'Clean Metadata', icon: <Sparkles size={20} color="#10b981" />,
    desc: 'Scrub all tracking data, title, author & XMP streams',
    accept: '.pdf,application/pdf',
    multiple: false,
    color: '#10b981',
  },
  {
    id: 'metadata', cat: 'optimize',
    label: 'Edit Metadata', icon: <Tag size={20} color="#8b5cf6" />,
    desc: 'View and modify Title, Author, Keywords & Creator',
    accept: '.pdf,application/pdf',
    multiple: false,
    color: '#8b5cf6',
  },
  {
    id: 'watermark', cat: 'optimize',
    label: 'Watermark PDF', icon: <Droplets size={20} color="#4F8EF7" />,
    desc: 'Add custom text or image watermark with opacity & angle',
    accept: '.pdf,application/pdf',
    multiple: false,
    color: '#4F8EF7',
  },
  {
    id: 'info', cat: 'optimize',
    label: 'PDF Inspector', icon: <Info size={20} color="#64748b" />,
    desc: 'Inspect dimensions, page count, dates & security',
    accept: '.pdf,application/pdf',
    multiple: false,
    color: '#64748b',
  },
]

/* ── Interactive File Thumbnail Item with Preview and Reordering ── */
const FileThumbnailItem = memo(function FileThumbnailItem({
  file,
  index,
  total,
  isMultiple,
  onRemove,
  onMoveUp,
  onMoveDown,
}) {
  const [thumbUrl, setThumbUrl] = useState(null)

  useEffect(() => {
    if (file && file.type?.startsWith('image/')) {
      const url = URL.createObjectURL(file)
      setThumbUrl(url)
      return () => URL.revokeObjectURL(url)
    }
  }, [file])

  const isPdf = file?.name?.toLowerCase().endsWith('.pdf')
  const isImage = file?.type?.startsWith('image/') || /\.(jpe?g|png|webp|gif|svg|bmp)$/i.test(file?.name || '')

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 12px',
        background: '#f8f9ff',
        border: '1px solid rgba(79,142,247,.16)',
        borderRadius: 12,
      }}
    >
      {/* Visual Preview thumbnail */}
      {thumbUrl ? (
        <img
          src={thumbUrl}
          alt={file.name}
          style={{
            width: 42,
            height: 42,
            objectFit: 'cover',
            borderRadius: 8,
            border: '1px solid rgba(0,0,0,.08)',
            flexShrink: 0,
          }}
        />
      ) : (
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 8,
            background: isPdf ? 'rgba(239,68,68,.1)' : 'rgba(79,142,247,.1)',
            color: isPdf ? '#ef4444' : '#4F8EF7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            flexShrink: 0,
          }}
        >
          {isPdf ? <FileText size={20} /> : isImage ? <Image size={20} /> : <FileCode size={20} />}
        </div>
      )}

      {/* File Details */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: '#1a1a2e',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={file.name}
        >
          {file.name}
        </div>
        <div style={{ fontSize: 11, color: '#888', marginTop: 2, display: 'flex', gap: 8 }}>
          <span>{formatBytes(file.size)}</span>
          {isMultiple && <span style={{ color: '#4F8EF7', fontWeight: 600 }}>Page #{index + 1}</span>}
        </div>
      </div>

      {/* Reorder and Action Buttons */}
      {isMultiple && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {index > 0 && (
            <button
              type="button"
              onClick={() => onMoveUp(index)}
              title="Move earlier in sequence"
              style={{
                background: 'rgba(0,0,0,.04)',
                border: '1px solid rgba(0,0,0,.08)',
                borderRadius: 6,
                cursor: 'pointer',
                color: '#555',
                fontSize: 11,
                padding: '4px 6px',
                display: 'inline-flex',
                alignItems: 'center',
                lineHeight: 1,
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(79,142,247,.15)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,.04)'}
            >
              <ArrowUp size={11} />
            </button>
          )}
          {index < total - 1 && (
            <button
              type="button"
              onClick={() => onMoveDown(index)}
              title="Move later in sequence"
              style={{
                background: 'rgba(0,0,0,.04)',
                border: '1px solid rgba(0,0,0,.08)',
                borderRadius: 6,
                cursor: 'pointer',
                color: '#555',
                fontSize: 11,
                padding: '4px 6px',
                display: 'inline-flex',
                alignItems: 'center',
                lineHeight: 1,
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(79,142,247,.15)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,.04)'}
            >
              <ArrowDown size={11} />
            </button>
          )}
          <button
            type="button"
            onClick={() => onRemove(index)}
            title="Remove document"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#999',
              fontSize: 14,
              padding: '2px 6px',
              marginLeft: 4,
              display: 'inline-flex',
              alignItems: 'center',
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
            onMouseLeave={e => e.currentTarget.style.color = '#999'}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </motion.div>
  )
})

/* ══════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════ */
export default function PDFToolkit() {
  const [activeCategory, setActiveCategory] = useState('to-pdf')
  const [actionId, setActionId] = useState('docx-pdf')
  const [files, setFiles] = useState([])
  const [statusMsg, setStatusMsg] = useState({ type: '', text: '' })
  const [progressMsg, setProgressMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [isDrag, setIsDrag] = useState(false)

  // Document Thumbnails for visual organizer
  const [thumbnails, setThumbnails] = useState([])
  const [loadingThumbnails, setLoadingThumbnails] = useState(false)

  // Visual selection states
  const [selectedPages, setSelectedPages] = useState([]) // for 'extract'
  const [pageOrder, setPageOrder] = useState([]) // for 'reorder'
  const [deletedPages, setDeletedPages] = useState(new Set()) // for 'delete'
  const [rotateAngle, setRotateAngle] = useState('90')
  const [pageRangeInput, setPageRangeInput] = useState('')

  // Tool Specific Configuration
  const [imgPageSize, setImgPageSize] = useState('A4')
  const [imgOrientation, setImgOrientation] = useState('AUTO')
  const [imgMargin, setImgMargin] = useState(20)

  const [dpiSetting, setDpiSetting] = useState(150)
  const [jpgQuality, setJpgQuality] = useState(90)

  const [watermarkText, setWatermarkText] = useState('CONFIDENTIAL')
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.25)
  const [watermarkAngle, setWatermarkAngle] = useState(45)

  // Metadata form
  const [metaForm, setMetaForm] = useState({
    title: '',
    author: '',
    subject: '',
    keywords: '',
    creator: '',
  })

  // Crop state
  const [cropMargins, setCropMargins] = useState({ top: 5, bottom: 5, left: 5, right: 5 })
  const [cropTargetPage, setCropTargetPage] = useState('ALL')

  // Redact state
  const [redactPage, setRedactPage] = useState(1)
  const [redactionBoxes, setRedactionBoxes] = useState({}) // { [pageNumber]: [{ id, xPercent, yPercent, widthPercent, heightPercent, color }] }
  const [redactColor, setRedactColor] = useState('#000000')

  // Signature state
  const [sigType, setSigType] = useState('draw')
  const [sigPage, setSigPage] = useState(1)
  const [sigDataUrl, setSigDataUrl] = useState(null)
  const [sigPosition, setSigPosition] = useState('bottom-right')
  const [sigScale, setSigScale] = useState(0.25)
  const sigCanvasRef = useRef(null)
  const [isDrawingSig, setIsDrawingSig] = useState(false)

  // Forms state
  const [formFields, setFormFields] = useState([])
  const [formValues, setFormValues] = useState({})
  const [loadingFields, setLoadingFields] = useState(false)

  // Security & Encryption state
  const { history: pdfHistory, remove: removeHistoryItem, clear: clearToolHistory } = useToolHistory('PDF Toolkit', 15)
  const [pdfPassword, setPdfPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [lockPassword, setLockPassword] = useState('')
  const [lockConfirmPassword, setLockConfirmPassword] = useState('')
  const [lockOwnerPassword, setLockOwnerPassword] = useState('')
  const [lockAlgorithm, setLockAlgorithm] = useState('AES-256')
  const [lockPermissions, setLockPermissions] = useState({
    printing: 'highResolution',
    copying: false,
    annotating: false,
    fillingForms: true,
    modifying: false
  })
  const [showLockPassword, setShowLockPassword] = useState(false)
  const [changeOldPassword, setChangeOldPassword] = useState('')
  const [changeNewPassword, setChangeNewPassword] = useState('')
  const [changeConfirmPassword, setChangeConfirmPassword] = useState('')
  const [showChangePassword, setShowChangePassword] = useState(false)

  // Watermark image enhancement
  const [watermarkType, setWatermarkType] = useState('text')
  const [watermarkImage, setWatermarkImage] = useState(null)

  // Zip packaging state
  const [zipFilename, setZipFilename] = useState('documents.zip')

  // Compress state
  const [compressPreset, setCompressPreset] = useState('balanced')

  // Page numbering state
  const [pageNumberFormat, setPageNumberFormat] = useState('page_x_of_y')
  const [pageNumberPosition, setPageNumberPosition] = useState('bottom-center')
  const [pageNumberStart, setPageNumberStart] = useState(1)
  const [pageNumberFontSize, setPageNumberFontSize] = useState(10)

  // Header & Footer state
  const [headerText, setHeaderText] = useState('')
  const [headerAlign, setHeaderAlign] = useState('center')
  const [footerText, setFooterText] = useState('Page {page} of {total}')
  const [footerAlign, setFooterAlign] = useState('center')
  const [headerFooterFontSize, setHeaderFooterFontSize] = useState(9)

  // Interactive Form Builder state
  const [builderFields, setBuilderFields] = useState([
    { id: 1, name: 'full_name', type: 'text', pageNumber: 1, defaultValue: '', xPercent: 0.1, yPercent: 0.2, widthPercent: 0.4, heightPercent: 0.04 }
  ])

  // AI OCR text
  const [extractedOcrText, setExtractedOcrText] = useState('')
  const [extractingAI, setExtractingAI] = useState(false)

  const fileInputRef = useRef(null)
  const objectUrlsRef = useRef([])
  const activeJobRef = useRef(null)
  const activeBatchRef = useRef(null)

  const cancelActiveOperation = useCallback(() => {
    let cancelled = false
    if (activeJobRef.current) {
      activeJobRef.current.cancel('Operation cancelled by user')
      activeJobRef.current = null
      cancelled = true
    }
    if (activeBatchRef.current) {
      activeBatchRef.current.cancelAll()
      activeBatchRef.current = null
      cancelled = true
    }
    if (cancelled) {
      setLoading(false)
      setProgressMsg('')
      setStatusMsg({ type: 'warning', text: '⚠️ Operation was cancelled by user.' })
    }
  }, [])

  const trackUrl = useCallback(url => {
    objectUrlsRef.current.push(url)
    return url
  }, [])

  const cleanupUrls = useCallback(() => {
    objectUrlsRef.current.forEach(u => URL.revokeObjectURL(u))
    objectUrlsRef.current = []
  }, [])

  useEffect(() => {
    return () => cleanupUrls()
  }, [cleanupUrls])

  const activeAction = useMemo(() => {
    return ALL_ACTIONS.find(a => a.id === actionId) || ALL_ACTIONS[0]
  }, [actionId])

  const categoryActions = useMemo(() => {
    return ALL_ACTIONS.filter(a => a.cat === activeCategory)
  }, [activeCategory])

  // Select first action when category changes if current action not in category
  const handleCategoryChange = catId => {
    setActiveCategory(catId)
    const firstInCat = ALL_ACTIONS.find(a => a.cat === catId)
    if (firstInCat && firstInCat.cat !== activeAction.cat) {
      setActionId(firstInCat.id)
      setFiles([])
      setResult(null)
      setStatusMsg({ type: '', text: '' })
      setThumbnails([])
      setPageRangeInput('')
    }
  }

  // Handle action selection
  const handleActionChange = aId => {
    setActionId(aId)
    setResult(null)
    setStatusMsg({ type: '', text: '' })
    if (aId === 'extract') {
      setPageRangeInput(formatPageRangeString(selectedPages))
    } else if (aId === 'delete') {
      setPageRangeInput(formatPageRangeString(Array.from(deletedPages)))
    } else {
      setPageRangeInput('')
    }
    // If switching between incompatible file types, clear files
    const newAct = ALL_ACTIONS.find(a => a.id === aId)
    if (newAct && files.length > 0) {
      const isPdfNew = newAct.accept.includes('.pdf')
      const hadPdf = files[0].name.toLowerCase().endsWith('.pdf')
      if (isPdfNew !== hadPdf) {
        setFiles([])
        setThumbnails([])
      } else if (isPdfNew && hadPdf) {
        // If switching to an action needing visual thumbnails and not yet loaded, load them now
        if (['extract', 'reorder', 'delete', 'rotate', 'split', 'crop', 'redact', 'sign'].includes(aId) && thumbnails.length === 0) {
          loadThumbnailsForFile(files[0], aId)
        }
        if (aId === 'forms' && formFields.length === 0) {
          setLoadingFields(true)
          getPdfFormFields(files[0])
            .then(fields => {
              setFormFields(fields)
              const init = {}
              fields.forEach(f => { init[f.name] = f.value })
              setFormValues(init)
            })
            .catch(() => setFormFields([]))
            .finally(() => setLoadingFields(false))
        }
      }
    }
  }

  // Load thumbnails whenever a PDF file is uploaded for visual tools
  const loadThumbnailsForFile = useCallback(async (file, actId) => {
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) return
    setLoadingThumbnails(true)
    try {
      const { totalPages, thumbnails: thumbs } = await generatePdfThumbnails(file, 60, msg => setProgressMsg(msg))
      setThumbnails(thumbs)
      // Initialize reorder and selection state
      const initialOrder = Array.from({ length: totalPages }, (_, i) => i + 1)
      setPageOrder(initialOrder)
      setSelectedPages(initialOrder)
      setDeletedPages(new Set())
      if (actId === 'extract') {
        // Only set default if user has not already entered a custom page range
        setPageRangeInput(prev => (prev && prev.trim() ? prev : formatPageRangeString(initialOrder)))
      } else {
        setPageRangeInput(prev => prev || '')
      }
    } catch (err) {
      console.warn('Could not generate PDF thumbnails:', err)
    } finally {
      setLoadingThumbnails(false)
      setProgressMsg('')
    }
  }, [])

  // File addition & validation
  const addFiles = useCallback(
    newFilesList => {
      const newFiles = Array.from(newFilesList)
      if (!newFiles.length) return

      // Max size check: 60MB limit
      const oversized = newFiles.find(f => f.size > 60 * 1024 * 1024)
      if (oversized) {
        setStatusMsg({
          type: 'error',
          text: `⚠️ "${oversized.name}" exceeds the 60MB limit. Please select a smaller document for in-browser processing.`,
        })
        return
      }

      setStatusMsg({ type: '', text: '' })
      setResult(null)

      if (activeAction.multiple) {
        setFiles(prev => {
          const existingKeys = new Set(prev.map(f => `${f.name}-${f.size}`))
          const added = newFiles.filter(f => !existingKeys.has(`${f.name}-${f.size}`))
          return [...prev, ...added]
        })
      } else {
        const file = newFiles[0]
        setFiles([file])

        // If action is metadata or info, pre-load metadata
        if (activeAction.id === 'metadata' || activeAction.id === 'info') {
          readPdfMetadata(file)
            .then(meta => {
              setMetaForm({
                title: meta.title || '',
                author: meta.author || '',
                subject: meta.subject || '',
                keywords: meta.keywords || '',
                creator: meta.creator || '',
              })
            })
            .catch(() => {})
        }

        // If action uses visual thumbnails, load them
        if (['extract', 'reorder', 'delete', 'rotate', 'split', 'crop', 'redact', 'sign'].includes(activeAction.id)) {
          loadThumbnailsForFile(file, activeAction.id)
        }

        // If action is forms, scan interactive form fields
        if (activeAction.id === 'forms') {
          setLoadingFields(true)
          getPdfFormFields(file)
            .then(fields => {
              setFormFields(fields)
              const init = {}
              fields.forEach(f => { init[f.name] = f.value })
              setFormValues(init)
            })
            .catch(e => {
              console.warn('Form scan notice:', e)
              setFormFields([])
            })
            .finally(() => setLoadingFields(false))
        }
      }
    },
    [activeAction, loadThumbnailsForFile]
  )

  useEffect(() => {
    const pending = consumePendingInboundFiles()
    if (pending && pending.length > 0) {
      addFiles(pending)
    }
    const handleShared = (e) => {
      if (e.detail && e.detail.length > 0) {
        addFiles(e.detail)
      }
    }
    window.addEventListener('tooldesk-shared-files-ready', handleShared)
    return () => window.removeEventListener('tooldesk-shared-files-ready', handleShared)
  }, [addFiles])

  const removeFile = idx => {
    setFiles(prev => prev.filter((_, i) => i !== idx))
    if (files.length <= 1) {
      setThumbnails([])
      setResult(null)
      setPageRangeInput('')
    }
  }

  const clearAllFiles = () => {
    setFiles([])
    setThumbnails([])
    setResult(null)
    setPageRangeInput('')
    setStatusMsg({ type: '', text: '' })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const moveFileUp = idx => {
    if (idx <= 0) return
    setFiles(prev => {
      const arr = [...prev]
      const temp = arr[idx - 1]
      arr[idx - 1] = arr[idx]
      arr[idx] = temp
      return arr
    })
  }

  const moveFileDown = idx => {
    setFiles(prev => {
      if (idx >= prev.length - 1) return prev
      const arr = [...prev]
      const temp = arr[idx + 1]
      arr[idx + 1] = arr[idx]
      arr[idx] = temp
      return arr
    })
  }

  const handlePageRangeChange = val => {
    setPageRangeInput(val)
    const maxP = thumbnails.length || 1000
    const parsed = parsePageRangeString(val, maxP)
    if (activeAction.id === 'extract') {
      setSelectedPages(parsed)
    } else if (activeAction.id === 'delete') {
      setDeletedPages(new Set(parsed))
    }
  }

  const toggleExtractPage = pageNum => {
    setSelectedPages(prev => {
      const next = prev.includes(pageNum) ? prev.filter(p => p !== pageNum) : [...prev, pageNum]
      setPageRangeInput(formatPageRangeString(next))
      return next
    })
  }

  const toggleDeletePage = pageNum => {
    setDeletedPages(prev => {
      const next = new Set(prev)
      if (next.has(pageNum)) next.delete(pageNum)
      else next.add(pageNum)
      setPageRangeInput(formatPageRangeString(Array.from(next)))
      return next
    })
  }

  // Drag and drop handlers
  const onDragOver = e => {
    e.preventDefault()
    setIsDrag(true)
  }
  const onDragLeave = e => {
    e.preventDefault()
    setIsDrag(false)
  }
  const onDrop = e => {
    e.preventDefault()
    setIsDrag(false)
    addFiles(e.dataTransfer.files)
  }

  // ── Download Helpers ──
  const downloadBlob = async (blob, name) => {
    try {
      const out = createOutput({
        blob,
        filename: name || 'document.pdf',
        mimeType: blob?.type || 'application/pdf',
        sourceTool: 'pdf',
        metadata: { action: activeAction?.id, filesCount: files.length }
      })
      await out.download()
    } catch (err) {
      console.warn('fileEngine createOutput fallback:', err)
      await saveFileWithFallback(blob, name, blob?.type || 'application/pdf')
    }
    try {
      addToHistory({
        tool: 'PDF Toolkit',
        label: name || 'document.pdf',
        value: `${activeAction?.label || 'Processed PDF'} (${formatBytes(blob.size)})`,
        action: 'Exported',
        category: 'pdf',
        metadata: { filename: name, size: blob.size, action: activeAction?.id }
      })
    } catch {}
  }

  const downloadAllZip = async () => {
    if (!result || !result.items || !result.items.length) return
    setLoading(true)
    setProgressMsg('Creating ZIP package...')
    try {
      const zipRes = await createZipFromFiles(
        result.items.map(it => ({ name: it.name, blob: it.blob })),
        result.zipName || 'exported-files.zip',
        msg => setProgressMsg(msg)
      )
      await downloadBlob(zipRes.blob, zipRes.name)
      setStatusMsg({ type: 'success', text: `✅ Downloaded ${result.items.length} files as ZIP archive!` })
    } catch (err) {
      setStatusMsg({ type: 'error', text: `Failed to create ZIP: ${err.message}` })
    } finally {
      setLoading(false)
      setProgressMsg('')
    }
  }

  // ── MAIN EXECUTION DISPATCHER ──
  const runConversion = async () => {
    if (!files.length) {
      setStatusMsg({ type: 'error', text: '⚠️ Please select a file to begin.' })
      return
    }

    setLoading(true)
    setStatusMsg({ type: '', text: '' })
    setResult(null)
    setProgressMsg('Initializing operation...')
    cleanupUrls()

    // ── BATCH ENGINE PATH (Multi-file document conversion or batch optimization) ──
    const isMultiBatchAction = files.length > 1 && [
      'docx-pdf', 'md-pdf', 'html-pdf', 'txt-pdf', 'csv-pdf', 'json-pdf', 'xml-pdf',
      'clean-meta', 'compress', 'flatten'
    ].includes(activeAction.id)

    if (isMultiBatchAction) {
      setProgressMsg(`Starting batch processing for ${files.length} files...`)
      try {
        const batchSession = createBatchSession({
          tool: 'PDF Studio',
          concurrency: typeof navigator !== 'undefined' && /Mobile|Android|iPhone/i.test(navigator.userAgent) ? 1 : 2,
          zipFilename: `tooldesk-pdf-batch-${Date.now()}.zip`,
          onUpdate: (state) => {
            setProgressMsg(`Batch processing: ${state.done + state.failed}/${state.total} items (${state.progress}%)`)
          },
          processItem: async (file, { signal, onProgress }) => {
            if (signal?.aborted) throw new Error('Operation was cancelled')
            let blob = null
            let outName = `${file.name.replace(/\.[^.]+$/, '')}.pdf`

            if (activeAction.id === 'docx-pdf') {
              const res = await convertDocxToPdf(file, msg => onProgress(50))
              blob = res.blob
            } else if (activeAction.id === 'md-pdf') {
              const text = await file.text()
              const res = await convertMarkdownToPdf(text, { title: file.name.replace(/\.[^.]+$/, '') })
              blob = res.blob
            } else if (activeAction.id === 'html-pdf') {
              const html = await file.text()
              const res = await convertHtmlToPdf(html, { title: file.name.replace(/\.[^.]+$/, '') })
              blob = res.blob
            } else if (activeAction.id === 'txt-pdf') {
              const text = await file.text()
              const res = await convertTextToPdf(text, { title: file.name.replace(/\.[^.]+$/, '') })
              blob = res.blob
            } else if (activeAction.id === 'csv-pdf') {
              const csv = await file.text()
              const res = await convertCsvToPdf(csv, { title: file.name.replace(/\.[^.]+$/, '') })
              blob = res.blob
            } else if (activeAction.id === 'json-pdf') {
              const json = await file.text()
              const res = await convertJsonToPdf(json, { title: file.name.replace(/\.[^.]+$/, '') })
              blob = res.blob
            } else if (activeAction.id === 'xml-pdf') {
              const xml = await file.text()
              const res = await convertXmlToPdf(xml, { title: file.name.replace(/\.[^.]+$/, '') })
              blob = res.blob
            } else if (activeAction.id === 'clean-meta') {
              const res = await cleanPdfMetadata(file, msg => onProgress(50))
              blob = res.blob
              outName = res.name
            } else if (activeAction.id === 'compress') {
              const res = await compressPdf(file, { level: compressLevel, grayscale: compressGrayscale }, msg => onProgress(50))
              blob = res.blob
              outName = res.name
            } else if (activeAction.id === 'flatten') {
              const res = await flattenPdf(file, msg => onProgress(50))
              blob = res.blob
              outName = res.name
            }

            if (!blob) throw new Error(`Batch conversion failed for ${file.name}`)
            return { blob, filename: outName, mimeType: 'application/pdf' }
          }
        })
        activeBatchRef.current = batchSession

        await new Promise((resolve) => {
          let hasResolved = false
          const checkCompletion = () => {
            const items = batchSession.getItems()
            const total = items.length
            const done = items.filter(i => i.status === BATCH_ITEM_STATUS.DONE).length
            const failed = items.filter(i => i.status === BATCH_ITEM_STATUS.FAILED).length
            const cancelled = items.filter(i => i.status === BATCH_ITEM_STATUS.CANCELLED).length
            if (total > 0 && done + failed + cancelled >= total && !hasResolved) {
              hasResolved = true
              resolve(items)
            }
          }
          batchSession.addFiles(files)
          const interval = setInterval(() => {
            checkCompletion()
            if (hasResolved) clearInterval(interval)
          }, 150)
        })

        const doneCount = batchSession.getItems().filter(i => i.status === BATCH_ITEM_STATUS.DONE).length
        if (doneCount > 0) {
          await batchSession.exportZip(`tooldesk-pdf-batch-${Date.now()}.zip`)
          setStatusMsg({ type: 'success', text: `✅ Batch converted ${doneCount}/${files.length} documents into ZIP archive!` })
        } else {
          setStatusMsg({ type: 'error', text: 'Batch conversion completed with zero successful outputs.' })
        }
      } catch (bErr) {
        setStatusMsg({ type: 'error', text: `Batch error: ${bErr.message || 'Operation failed'}` })
      } finally {
        activeBatchRef.current = null
        setLoading(false)
        setProgressMsg('')
      }
      return
    }

    // ── UNIVERSAL JOB ENGINE PATH (Single or combined operations) ──
    const job = createJob({
      tool: 'PDF Studio',
      operation: activeAction.id,
      input: { action: activeAction.id, count: files.length },
      execute: async (signal, onProgress) => {
        if (signal?.aborted) throw new Error('Operation was cancelled')
        const targetFile = files[0]

      // ── CONVERT TO PDF ──
      if (activeAction.id === 'docx-pdf') {
        const res = await convertDocxToPdf(targetFile, msg => setProgressMsg(msg))
        setResult({
          blob: res.blob,
          name: res.name,
          size: res.size,
          type: 'single-pdf',
        })
        setStatusMsg({ type: 'success', text: `✅ Converted "${targetFile.name}" to vector PDF (${formatBytes(res.size)})` })

      } else if (activeAction.id === 'img-pdf') {
        const res = await convertImagesToPdf(files, {
          pageSize: imgPageSize,
          orientation: imgOrientation,
          margin: imgMargin,
        }, msg => setProgressMsg(msg))
        setResult({
          blob: res.blob,
          name: res.name,
          size: res.size,
          type: 'single-pdf',
        })
        setStatusMsg({ type: 'success', text: `✅ Generated PDF from ${files.length} image(s) (${formatBytes(res.size)})` })

      } else if (activeAction.id === 'md-pdf') {
        const text = await targetFile.text()
        const res = await convertMarkdownToPdf(text, { title: targetFile.name.replace(/\.[^.]+$/, '') })
        setResult({
          blob: res.blob,
          name: `${targetFile.name.replace(/\.[^.]+$/, '')}.pdf`,
          size: res.size,
          type: 'single-pdf',
        })
        setStatusMsg({ type: 'success', text: `✅ Formatted Markdown into PDF (${formatBytes(res.size)})` })

      } else if (activeAction.id === 'html-pdf') {
        const html = await targetFile.text()
        const res = await convertHtmlToPdf(html, { title: targetFile.name.replace(/\.[^.]+$/, '') })
        setResult({
          blob: res.blob,
          name: `${targetFile.name.replace(/\.[^.]+$/, '')}.pdf`,
          size: res.size,
          type: 'single-pdf',
        })
        setStatusMsg({ type: 'success', text: `✅ Rendered HTML document to PDF (${formatBytes(res.size)})` })

      } else if (activeAction.id === 'txt-pdf') {
        const text = await targetFile.text()
        const res = await convertTextToPdf(text, { title: targetFile.name.replace(/\.[^.]+$/, '') })
        setResult({
          blob: res.blob,
          name: `${targetFile.name.replace(/\.[^.]+$/, '')}.pdf`,
          size: res.size,
          type: 'single-pdf',
        })
        setStatusMsg({ type: 'success', text: `✅ Converted text to paginated PDF (${formatBytes(res.size)})` })

      } else if (activeAction.id === 'csv-pdf') {
        const csv = await targetFile.text()
        const res = await convertCsvToPdf(csv, { title: targetFile.name.replace(/\.[^.]+$/, '') })
        setResult({
          blob: res.blob,
          name: `${targetFile.name.replace(/\.[^.]+$/, '')}.pdf`,
          size: res.size,
          type: 'single-pdf',
        })
        setStatusMsg({ type: 'success', text: `✅ Formatted CSV data into PDF tables (${formatBytes(res.size)})` })

      } else if (activeAction.id === 'json-pdf') {
        const json = await targetFile.text()
        const res = await convertJsonToPdf(json, { title: targetFile.name.replace(/\.[^.]+$/, '') })
        setResult({
          blob: res.blob,
          name: `${targetFile.name.replace(/\.[^.]+$/, '')}.pdf`,
          size: res.size,
          type: 'single-pdf',
        })
        setStatusMsg({ type: 'success', text: `✅ Exported JSON structure to PDF (${formatBytes(res.size)})` })

      } else if (activeAction.id === 'xml-pdf') {
        const xml = await targetFile.text()
        const res = await convertXmlToPdf(xml, { title: targetFile.name.replace(/\.[^.]+$/, '') })
        setResult({
          blob: res.blob,
          name: `${targetFile.name.replace(/\.[^.]+$/, '')}.pdf`,
          size: res.size,
          type: 'single-pdf',
        })
        setStatusMsg({ type: 'success', text: `✅ Converted XML to PDF (${formatBytes(res.size)})` })

      // ── CONVERT FROM PDF ──
      } else if (activeAction.id === 'pdf-png' || activeAction.id === 'pdf-jpg') {
        const format = activeAction.id === 'pdf-png' ? 'image/png' : 'image/jpeg'
        const pages = await renderPdfPagesToImages(
          targetFile,
          format,
          dpiSetting,
          msg => setProgressMsg(msg)
        )
        const ext = format === 'image/jpeg' ? 'jpg' : 'png'
        setResult({
          type: 'multi-images',
          items: pages,
          zipName: `${targetFile.name.replace(/\.pdf$/i, '')}-${ext}-pages.zip`,
        })
        setStatusMsg({ type: 'success', text: `✅ Rendered ${pages.length} page(s) at ${dpiSetting} DPI!` })

      } else if (activeAction.id === 'ocr') {
        setProgressMsg('Loading OCR recognition engine...')
        const { default: Tesseract } = await import('tesseract.js')
        let recognizedText = ''

        const tesseractOptions = {
          workerPath: '/tesseract/worker.min.js',
          corePath: '/tesseract/core',
          langPath: '/tesseract/lang-data',
          gzip: true,
        }

        if (targetFile.type.startsWith('image/')) {
          const worker = await Tesseract.createWorker('eng', 1, tesseractOptions)
          try {
            const { data: { text } } = await worker.recognize(targetFile)
            recognizedText = text?.trim() || ''
          } finally {
            await worker.terminate()
          }
        } else {
          // Render first 5 pages and run OCR
          const pages = await renderPdfPagesToImages(targetFile, 'image/jpeg', 150, msg => setProgressMsg(msg))
          const worker = await Tesseract.createWorker('eng', 1, tesseractOptions)
          const ocrParts = []
          try {
            for (let p = 0; p < Math.min(pages.length, 5); p++) {
              setProgressMsg(`OCR analyzing page ${p + 1} of ${Math.min(pages.length, 5)}...`)
              const { data: { text } } = await worker.recognize(pages[p].blob)
              if (text?.trim()) ocrParts.push(text.trim())
            }
            recognizedText = ocrParts.join('\n\n')
          } finally {
            await worker.terminate()
          }
        }

        setExtractedOcrText(recognizedText)
        setResult({
          type: 'text',
          text: recognizedText,
          name: `${targetFile.name.replace(/\.[^.]+$/, '')}-ocr.txt`,
        })
        setStatusMsg({ type: 'success', text: '✅ OCR Text recognition completed!' })

      // ── ORGANIZE PDF ──
      } else if (activeAction.id === 'merge') {
        if (files.length < 2) {
          throw new Error('At least 2 PDF files are needed to merge. Please add more files.')
        }
        const res = await mergePdfs(files, msg => setProgressMsg(msg))
        setResult({
          blob: res.blob,
          name: 'merged-documents.pdf',
          size: res.size,
          type: 'single-pdf',
        })
        setStatusMsg({ type: 'success', text: `✅ Merged ${files.length} PDFs into one (${res.pageCount} pages, ${formatBytes(res.size)})` })

      } else if (activeAction.id === 'split') {
        const pages = await splitPdfPages(targetFile, null, msg => setProgressMsg(msg))
        setResult({
          type: 'multi-pdfs',
          items: pages,
          zipName: `${targetFile.name.replace(/\.pdf$/i, '')}-split-pages.zip`,
        })
        setStatusMsg({ type: 'success', text: `✅ Split PDF into ${pages.length} individual page files!` })

      } else if (activeAction.id === 'extract') {
        if (!selectedPages.length) {
          throw new Error('Please select at least one page thumbnail to extract.')
        }
        const res = await extractPagesToSinglePdf(targetFile, selectedPages, msg => setProgressMsg(msg))
        setResult({
          blob: res.blob,
          name: res.name,
          size: res.size,
          type: 'single-pdf',
        })
        setStatusMsg({ type: 'success', text: `✅ Extracted ${selectedPages.length} pages into new PDF (${formatBytes(res.size)})` })

      } else if (activeAction.id === 'reorder') {
        const res = await reorderPdfPages(targetFile, pageOrder, msg => setProgressMsg(msg))
        setResult({
          blob: res.blob,
          name: res.name,
          size: res.size,
          type: 'single-pdf',
        })
        setStatusMsg({ type: 'success', text: `✅ Saved new PDF with updated page sequence (${formatBytes(res.size)})` })

      } else if (activeAction.id === 'delete') {
        const toDeleteArray = Array.from(deletedPages)
        if (!toDeleteArray.length) {
          throw new Error('Please click on at least one page to mark it for deletion.')
        }
        const res = await deletePdfPages(targetFile, toDeleteArray, msg => setProgressMsg(msg))
        setResult({
          blob: res.blob,
          name: res.name,
          size: res.size,
          type: 'single-pdf',
        })
        setStatusMsg({ type: 'success', text: `✅ Removed ${toDeleteArray.length} pages from PDF (${res.pageCount} pages remaining)` })

      } else if (activeAction.id === 'rotate') {
        const angle = parseInt(rotateAngle, 10) || 90
        const res = await rotatePdfPages(targetFile, angle, null, msg => setProgressMsg(msg))
        setResult({
          blob: res.blob,
          name: res.name,
          size: res.size,
          type: 'single-pdf',
        })
        setStatusMsg({ type: 'success', text: `✅ All pages rotated by ${angle}° (${formatBytes(res.size)})` })

      } else if (activeAction.id === 'crop') {
        const res = await cropPdfPages(targetFile, {
          xPercent: (cropMargins.left || 0) / 100,
          yPercent: (cropMargins.top || 0) / 100,
          widthPercent: Math.max(0.1, (100 - (cropMargins.left || 0) - (cropMargins.right || 0)) / 100),
          heightPercent: Math.max(0.1, (100 - (cropMargins.top || 0) - (cropMargins.bottom || 0)) / 100),
        }, cropTargetPage === 'ALL' ? null : [1], msg => setProgressMsg(msg))
        setResult({
          blob: res.blob,
          name: res.name,
          size: res.size,
          type: 'single-pdf',
        })
        setStatusMsg({ type: 'success', text: `✅ Page margins and crop box applied successfully (${formatBytes(res.size)})` })

      } else if (activeAction.id === 'pdf-zip') {
        const res = await createZipFromFiles(
          files.map(f => ({ name: f.name, blob: f })),
          zipFilename.endsWith('.zip') ? zipFilename : `${zipFilename}.zip`,
          msg => setProgressMsg(msg)
        )
        setResult({
          blob: res.blob,
          name: res.name,
          size: res.size,
          type: 'single-pdf', // downloads blob directly
          isZip: true,
        })
        setStatusMsg({ type: 'success', text: `✅ Packaged ${files.length} PDFs into ${res.name} (${formatBytes(res.size)})` })

      } else if (activeAction.id === 'compare') {
        if (files.length < 2) {
          throw new Error('Please select or drop 2 PDF files to compare.')
        }
        const res = await comparePdfs(files[0], files[1], msg => setProgressMsg(msg))
        setResult({
          type: 'compare',
          compare: res,
          name: `comparison_${files[0].name.replace(/\.pdf$/i, '')}_vs_${files[1].name.replace(/\.pdf$/i, '')}.txt`
        })
        setStatusMsg({
          type: 'success',
          text: `✅ Compared documents! ${res.identicalPagesCount} matching pages, ${res.modifiedPagesCount} modified, ${res.addedPagesCount} added, ${res.removedPagesCount} removed.`
        })

      } else if (activeAction.id === 'page-numbers') {
        const res = await addPageNumbers(targetFile, {
          format: pageNumberFormat,
          position: pageNumberPosition,
          startPage: parseInt(pageNumberStart, 10) || 1,
          fontSize: parseInt(pageNumberFontSize, 10) || 10,
        }, msg => setProgressMsg(msg))
        setResult({
          blob: res.blob,
          name: res.name,
          size: res.size,
          type: 'single-pdf',
        })
        setStatusMsg({ type: 'success', text: `✅ Numbered ${res.pageCount} pages (${formatBytes(res.size)})` })

      } else if (activeAction.id === 'header-footer') {
        const res = await addHeaderFooter(targetFile, {
          headerText,
          headerAlign,
          footerText,
          footerAlign,
          fontSize: parseInt(headerFooterFontSize, 10) || 9,
        }, msg => setProgressMsg(msg))
        setResult({
          blob: res.blob,
          name: res.name,
          size: res.size,
          type: 'single-pdf',
        })
        setStatusMsg({ type: 'success', text: `✅ Embedded header & footer across ${res.pageCount} pages (${formatBytes(res.size)})` })

      // ── SECURITY & SIGN ──
      } else if (activeAction.id === 'redact') {
        const hasBoxes = Object.values(redactionBoxes).some(arr => arr && arr.length > 0)
        if (!hasBoxes) {
          throw new Error('Please add at least one redaction box on the page before applying.')
        }
        const res = await redactPdfPages(targetFile, redactionBoxes, msg => setProgressMsg(msg))
        setResult({
          blob: res.blob,
          name: res.name,
          size: res.size,
          type: 'single-pdf',
        })
        setStatusMsg({ type: 'success', text: `✅ Sensitive content permanently obliterated and flattened (${formatBytes(res.size)})` })

      } else if (activeAction.id === 'sign') {
        if (!sigDataUrl) {
          throw new Error('Please draw or upload a visual signature first.')
        }
        let rect = { xPercent: 0.65, yPercent: 0.82, widthPercent: 0.28, heightPercent: 0.12 }
        if (sigPosition === 'bottom-left') rect = { xPercent: 0.08, yPercent: 0.82, widthPercent: 0.28, heightPercent: 0.12 }
        else if (sigPosition === 'bottom-center') rect = { xPercent: 0.36, yPercent: 0.82, widthPercent: 0.28, heightPercent: 0.12 }
        else if (sigPosition === 'center') rect = { xPercent: 0.36, yPercent: 0.44, widthPercent: 0.28, heightPercent: 0.12 }
        rect.widthPercent *= (sigScale / 0.25)
        rect.heightPercent *= (sigScale / 0.25)
        const res = await signPdf(targetFile, sigDataUrl, sigPage, rect, msg => setProgressMsg(msg))
        setResult({
          blob: res.blob,
          name: res.name,
          size: res.size,
          type: 'single-pdf',
        })
        setStatusMsg({ type: 'success', text: `✅ Visual signature embedded on page ${sigPage} (${formatBytes(res.size)})` })

      } else if (activeAction.id === 'forms') {
        const res = await fillPdfForm(targetFile, formValues, msg => setProgressMsg(msg))
        setResult({
          blob: res.blob,
          name: res.name,
          size: res.size,
          type: 'single-pdf',
        })
        setStatusMsg({ type: 'success', text: `✅ Interactive PDF form fields filled and saved (${formatBytes(res.size)})` })

      } else if (activeAction.id === 'form-builder') {
        if (!builderFields.length) {
          throw new Error('Please add at least one form field to embed.')
        }
        const res = await createPdfFormFields(targetFile, builderFields, msg => setProgressMsg(msg))
        setResult({
          blob: res.blob,
          name: res.name,
          size: res.size,
          type: 'single-pdf',
        })
        setStatusMsg({ type: 'success', text: `✅ Embedded interactive AcroForm fields (${formatBytes(res.size)})` })

      } else if (activeAction.id === 'flatten') {
        const res = await flattenPdf(targetFile, msg => setProgressMsg(msg))
        setResult({
          blob: res.blob,
          name: res.name,
          size: res.size,
          type: 'single-pdf',
        })
        setStatusMsg({ type: 'success', text: `✅ Flattened ${res.fieldCount} form field(s) & annotations into static pages (${formatBytes(res.size)})` })

      } else if (activeAction.id === 'lock') {
        if (!lockPassword) {
          throw new Error('Please enter a password to lock and encrypt the document.')
        }
        if (lockPassword !== lockConfirmPassword) {
          throw new Error('The confirmation password does not match.')
        }
        const res = await lockPdf(targetFile, lockPassword, {
          algorithm: lockAlgorithm,
          ownerPassword: lockOwnerPassword || undefined,
          permissions: lockPermissions,
        }, msg => setProgressMsg(msg))
        setResult({
          blob: res.blob,
          name: res.name,
          size: res.size,
          type: 'single-pdf',
        })
        setStatusMsg({ type: 'success', text: `✅ Encrypted & password protected with ${lockAlgorithm}! (${formatBytes(res.size)})` })

      } else if (activeAction.id === 'unlock') {
        if (!pdfPassword) {
          throw new Error('Please enter the open password to unlock this document.')
        }
        const res = await unlockPdf(targetFile, pdfPassword, msg => setProgressMsg(msg))
        setResult({
          blob: res.blob,
          name: res.name,
          size: res.size,
          type: 'single-pdf',
        })
        setStatusMsg({ type: 'success', text: `✅ Unlocked and decrypted! Resulting PDF opens with no password (${formatBytes(res.size)})` })

      } else if (activeAction.id === 'change-password') {
        if (!changeOldPassword) {
          throw new Error('Please enter the current document password.')
        }
        if (!changeNewPassword) {
          throw new Error('Please enter the new document password.')
        }
        if (changeNewPassword !== changeConfirmPassword) {
          throw new Error('The new confirmation password does not match.')
        }
        const res = await changePdfPassword(targetFile, changeOldPassword, changeNewPassword, {
          algorithm: lockAlgorithm,
          permissions: lockPermissions,
        }, msg => setProgressMsg(msg))
        setResult({
          blob: res.blob,
          name: res.name,
          size: res.size,
          type: 'single-pdf',
        })
        setStatusMsg({ type: 'success', text: `✅ Password updated & document re-encrypted successfully! (${formatBytes(res.size)})` })

      // ── OPTIMIZE & METADATA ──
      } else if (activeAction.id === 'compress') {
        const res = await compressPdf(targetFile, { preset: compressPreset }, msg => setProgressMsg(msg))
        setResult({
          blob: res.blob,
          name: res.name,
          size: res.size,
          origSize: res.origSize,
          savedBytes: res.savedBytes,
          savedPct: res.savedPct,
          reductionNotice: res.reductionNotice,
          type: 'single-pdf',
        })
        const notice = res.reductionNotice ? ` (${res.reductionNotice})` : ''
        setStatusMsg({
          type: 'success',
          text: `✅ Optimized! Size: ${formatBytes(res.size)} ${res.savedPct > 0 ? `(Saved ${res.savedPct}%)` : '(Already optimal)'}${notice}`,
        })

      } else if (activeAction.id === 'clean-meta') {
        const res = await cleanPdfMetadata(targetFile, msg => setProgressMsg(msg))
        setResult({
          blob: res.blob,
          name: res.name,
          size: res.size,
          type: 'single-pdf',
        })
        setStatusMsg({ type: 'success', text: `✅ Document metadata, author, timestamps & XMP streams scrubbed (${formatBytes(res.size)})` })

      } else if (activeAction.id === 'metadata') {
        const res = await updatePdfMetadata(targetFile, metaForm, msg => setProgressMsg(msg))
        setResult({
          blob: res.blob,
          name: res.name,
          size: res.size,
          type: 'single-pdf',
        })
        setStatusMsg({ type: 'success', text: `✅ Updated PDF metadata successfully (${formatBytes(res.size)})` })

      } else if (activeAction.id === 'watermark') {
        const res = await watermarkPdf(targetFile, {
          text: watermarkText,
          opacity: watermarkOpacity,
          angle: watermarkAngle,
          image: watermarkType === 'image' ? watermarkImage : null,
        }, msg => setProgressMsg(msg))
        setResult({
          blob: res.blob,
          name: res.name,
          size: res.size,
          type: 'single-pdf',
        })
        setStatusMsg({ type: 'success', text: `✅ Added watermark to ${res.pageCount} page(s)` })

      } else if (activeAction.id === 'info') {
        const meta = await readPdfMetadata(targetFile)
        setResult({
          type: 'info',
          meta,
        })
        setStatusMsg({ type: 'success', text: `✅ PDF inspected: ${meta.pageCount} pages, ${formatBytes(meta.fileSize)}` })
      }
      }
    })

    activeJobRef.current = job

    job.on('progress', (pct, txt) => {
      if (txt) setProgressMsg(txt)
    })

    try {
      await job.start()
    } catch (err) {
      if (err.category === 'CANCELLED' || err.message?.includes('cancelled') || err.message?.includes('aborted')) {
        setStatusMsg({ type: 'warning', text: '⚠️ Operation was cancelled by user.' })
      } else {
        console.error('PDF Operation Error:', err)
        setStatusMsg({ type: 'error', text: `❌ Error: ${err.message || 'Operation failed'}` })
      }
    } finally {
      setLoading(false)
      setProgressMsg('')
      activeJobRef.current = null
    }
  }

  return (
    <ToolShell tool={tool}>
      <ToolCard>
        {/* Privacy badge */}
        <div className="info-bar blue" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <ShieldCheck size={20} style={{ color: '#4F8EF7', flexShrink: 0 }} />
          <div>
            <strong>100% Client-Side Processing</strong>. Documents never leave your browser. Zero cloud uploads, zero data retention.
          </div>
        </div>

        {/* ── 1. HIGH-LEVEL CATEGORY SELECTOR (Apple-Style Glass Segmented Tabs) ── */}
        <div style={{ marginBottom: 22 }}>
          <label className="lbl" style={{ marginBottom: 10 }}>STUDIO SUITE</label>
          <div className="apple-segmented tool-tabs pdf-studio-categories" style={{ padding: 4, borderRadius: 14, display: 'flex', alignItems: 'center', overflowX: 'auto', overflowY: 'hidden', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none', gap: 4, background: 'rgba(0,0,0,.042)', border: '1px solid rgba(0,0,0,.035)', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleCategoryChange(cat.id)}
                className={`apple-segmented-item tool-tab pdf-studio-category-item ${activeCategory === cat.id ? 'active' : ''}`}
                style={{
                  padding: '9px 14px',
                  borderRadius: 12,
                  fontSize: 13,
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  minHeight: 44,
                  flex: '1 0 auto',
                  minWidth: 'max-content',
                  whiteSpace: 'nowrap',
                  boxSizing: 'border-box',
                  transition: 'all .18s var(--ease)',
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>{cat.icon}</span>
                <span className="cat-tab-label" style={{ whiteSpace: 'nowrap', minWidth: 'max-content', display: 'inline-block' }}>{cat.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── 2. SUB-ACTION SELECTOR CARDS ── */}
        <div style={{ marginBottom: 24 }}>
          <label className="lbl" style={{ marginBottom: 10 }}>CHOOSE OPERATION</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 140px), 1fr))', gap: 10 }}>
            {categoryActions.map(act => {
              const isSelected = actionId === act.id
              return (
                <div
                  key={act.id}
                  onClick={() => handleActionChange(act.id)}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 14,
                    cursor: 'pointer',
                    border: `1.5px solid ${isSelected ? act.color : 'rgba(0, 0, 0, 0.08)'}`,
                    background: isSelected ? `${act.color}14` : '#f8f9ff',
                    boxShadow: isSelected
                      ? `0 4px 16px ${act.color}20, inset 0 1px 0 rgba(255,255,255,0.95)`
                      : '0 2px 8px rgba(0,0,0,.02), inset 0 1px 0 rgba(255,255,255,0.9)',
                    transition: 'all .18s cubic-bezier(.22,1,.36,1)',
                  }}
                  onMouseEnter={e => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.96)'
                      e.currentTarget.style.borderColor = 'rgba(79,142,247,.30)'
                      e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,.04), inset 0 1px 0 rgba(255,255,255,0.95)'
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'rgba(248, 249, 255, 0.9)'
                      e.currentTarget.style.borderColor = 'rgba(0, 0, 0, 0.08)'
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,.02), inset 0 1px 0 rgba(255,255,255,0.9)'
                    }
                  }}
                >
                  <div style={{ fontSize: 22, marginBottom: 6 }}>{act.icon}</div>
                  <div style={{
                    fontFamily: 'Syne,sans-serif',
                    fontSize: 13,
                    fontWeight: 700,
                    color: isSelected ? act.color : '#1a1a2e',
                    marginBottom: 3,
                  }}>
                    {act.label}
                  </div>
                  <div style={{ fontSize: 11, color: '#888', lineHeight: 1.4 }}>{act.desc}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── 3. UPLOAD DROPZONE ── */}
        <div style={{ marginBottom: 22 }}>
          <ChainedInputBanner
            acceptedTypes={['pdf', 'image', 'text']}
            onAccept={async (p) => {
              if (p.type === 'image') {
                setActiveCategory('to-pdf')
                const imgAction = ALL_ACTIONS.find(a => a.id === 'img-pdf')
                if (imgAction) setActiveAction(imgAction)
              } else if (p.type === 'pdf' && activeAction.cat === 'to-pdf') {
                setActiveCategory('optimize')
                const compAction = ALL_ACTIONS.find(a => a.id === 'compress')
                if (compAction) setActiveAction(compAction)
              }
              if (p.file) {
                handleAddFiles([p.file])
              } else if (p.dataUrl) {
                try {
                  const res = await fetch(p.dataUrl)
                  const blob = await res.blob()
                  const f = new File([blob], p.filename || 'chained-file.png', { type: p.mimeType || blob.type })
                  handleAddFiles([f])
                } catch (e) {
                  console.error('Failed to parse chained dataUrl in PDFToolkit', e)
                }
              }
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <label className="lbl" style={{ margin: 0 }}>
              UPLOAD FILE{activeAction.multiple ? 'S' : ''}
            </label>
            {files.length > 0 && (
              <button
                type="button"
                onClick={clearAllFiles}
                className="btn btn-sm btn-outline"
                style={{ padding: '4px 12px', fontSize: 11 }}
              >
                Clear All
              </button>
            )}
          </div>

          <label>
            <motion.div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              animate={{
                borderColor: isDrag ? activeAction.color : 'rgba(79,142,247,.3)',
                background: isDrag ? 'rgba(79,142,247,.08)' : 'rgba(79,142,247,.02)',
                scale: isDrag ? 1.01 : 1,
              }}
              className="upzone"
              style={{ padding: '34px 20px', borderRadius: 16 }}
            >
              <div className="upzone-icon">{activeAction.icon}</div>
              <div className="upzone-t" style={{ fontWeight: 600, color: '#1a1a2e', fontSize: 14.5 }}>
                {isDrag
                  ? 'Drop file here to process'
                  : activeAction.multiple
                  ? `Drop ${activeAction.label} files or click to browse`
                  : `Drop ${activeAction.label} file or click to browse`}
              </div>
              <div className="upzone-s" style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                Accepted formats: {activeAction.accept.replace(/\.[a-z0-9]+/gi, ext => ext.toUpperCase())} (Max 60MB)
              </div>
            </motion.div>

            <input
              ref={fileInputRef}
              type="file"
              accept={activeAction.accept}
              multiple={activeAction.multiple}
              style={{ display: 'none' }}
              onChange={e => addFiles(e.target.files)}
            />
          </label>

          {/* Uploaded File List Badge */}
          {files.length > 0 && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <AnimatePresence>
                {files.map((f, i) => (
                  <FileThumbnailItem
                    key={`${f.name}-${i}`}
                    file={f}
                    index={i}
                    total={files.length}
                    isMultiple={activeAction.multiple}
                    onRemove={removeFile}
                    onMoveUp={moveFileUp}
                    onMoveDown={moveFileDown}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* ── 4. DYNAMIC TOOL CONFIGURATION OPTIONS ── */}
        {/* Images to PDF Options */}
        {activeAction.id === 'img-pdf' && files.length > 0 && (
          <div style={{ background: 'rgba(79,142,247,.04)', border: '1px solid rgba(79,142,247,.14)', borderRadius: 14, padding: '16px 18px', marginBottom: 20 }}>
            <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 13.5, color: '#1a1a2e', marginBottom: 12 }}>
              ⚙️ Layout Options
            </div>
            <div className="pdf-options-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 12 }}>
              <div>
                <label className="lbl">Page Size</label>
                <select className="inp sel" value={imgPageSize} onChange={e => setImgPageSize(e.target.value)}>
                  <option value="A4">Standard A4</option>
                  <option value="LETTER">US Letter</option>
                  <option value="FIT">Fit to Image Size</option>
                </select>
              </div>
              <div>
                <label className="lbl">Orientation</label>
                <select className="inp sel" value={imgOrientation} onChange={e => setImgOrientation(e.target.value)}>
                  <option value="AUTO">Auto (Match Image)</option>
                  <option value="PORTRAIT">Portrait</option>
                  <option value="LANDSCAPE">Landscape</option>
                </select>
              </div>
              <div>
                <label className="lbl">Margins</label>
                <select className="inp sel" value={imgMargin} onChange={e => setImgMargin(+e.target.value)}>
                  <option value={0}>None (0px)</option>
                  <option value={20}>Small (20px)</option>
                  <option value={36}>Normal (36px)</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* PDF to Images Quality Options */}
        {(activeAction.id === 'pdf-png' || activeAction.id === 'pdf-jpg') && (
          <div style={{ background: 'rgba(79,142,247,.04)', border: '1px solid rgba(79,142,247,.14)', borderRadius: 14, padding: '16px 18px', marginBottom: 20 }}>
            <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 13.5, color: '#1a1a2e', marginBottom: 12 }}>
              ⚙️ Export Quality Options
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label className="lbl">Rendering Resolution</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[
                    { dpi: 150, label: 'Standard (150 DPI)' },
                    { dpi: 300, label: 'Ultra-HD (300 DPI)' },
                  ].map(item => (
                    <button
                      key={item.dpi}
                      type="button"
                      onClick={() => setDpiSetting(item.dpi)}
                      className={`btn ${dpiSetting === item.dpi ? 'btn-blue' : 'btn-outline'}`}
                      style={{ flex: 1, padding: '8px 10px', fontSize: 12 }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              {activeAction.id === 'pdf-jpg' && (
                <div style={{ flex: 1, minWidth: 160 }}>
                  <label className="lbl">JPEG Quality: {jpgQuality}%</label>
                  <input
                    type="range"
                    min={50}
                    max={100}
                    value={jpgQuality}
                    onChange={e => setJpgQuality(+e.target.value)}
                    style={{
                      width: '100%',
                      marginTop: 8,
                      background: `linear-gradient(to right, #4F8EF7 0%, #4F8EF7 ${Math.max(0, Math.min(100, ((jpgQuality - 50) / (100 - 50)) * 100))}%, #e2e4ef ${Math.max(0, Math.min(100, ((jpgQuality - 50) / (100 - 50)) * 100))}%, #e2e4ef 100%)`,
                      WebkitAppearance: 'none',
                      appearance: 'none',
                      height: 5,
                      borderRadius: 3,
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                    className="rs-thumb"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Rotate Angle Options */}
        {activeAction.id === 'rotate' && (
          <div className="fgrp" style={{ marginBottom: 20 }}>
            <label className="lbl">Rotation Angle</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {['90', '180', '270'].map(deg => (
                <button
                  key={deg}
                  type="button"
                  onClick={() => setRotateAngle(deg)}
                  className={`btn ${rotateAngle === deg ? 'btn-blue' : 'btn-outline'}`}
                  style={{ flex: 1, padding: '10px 8px' }}
                >
                  {deg === '90' ? '↻ 90° Clockwise' : deg === '180' ? '↕ 180° Flip' : '↺ 270° Counter'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Watermark Options */}
        {activeAction.id === 'watermark' && (
          <div style={{ background: 'rgba(79,142,247,.04)', border: '1px solid rgba(79,142,247,.14)', borderRadius: 14, padding: '16px 18px', marginBottom: 20 }}>
            <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 13.5, color: '#1a1a2e', marginBottom: 12 }}>
              💧 Watermark Settings
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button
                type="button"
                className={`btn btn-sm ${watermarkType === 'text' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setWatermarkType('text')}
                style={{ padding: '6px 12px', fontSize: 12 }}
              >
                Text Watermark
              </button>
              <button
                type="button"
                className={`btn btn-sm ${watermarkType === 'image' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setWatermarkType('image')}
                style={{ padding: '6px 12px', fontSize: 12 }}
              >
                Image / Logo Watermark
              </button>
            </div>
            {watermarkType === 'text' ? (
              <div className="tool-grid-3">
                <div>
                  <label className="lbl">Watermark Text</label>
                  <input
                    className="inp"
                    value={watermarkText}
                    onChange={e => setWatermarkText(e.target.value)}
                    placeholder="CONFIDENTIAL, DRAFT, SAMPLE..."
                  />
                </div>
                <div>
                  <label className="lbl">Opacity ({Math.round(watermarkOpacity * 100)}%)</label>
                  <input
                    type="range"
                    min={0.05}
                    max={0.8}
                    step={0.05}
                    value={watermarkOpacity}
                    onChange={e => setWatermarkOpacity(parseFloat(e.target.value))}
                    style={{
                      width: '100%',
                      marginTop: 8,
                      background: `linear-gradient(to right, #4F8EF7 0%, #4F8EF7 ${Math.max(0, Math.min(100, ((watermarkOpacity - 0.05) / (0.8 - 0.05)) * 100))}%, #e2e4ef ${Math.max(0, Math.min(100, ((watermarkOpacity - 0.05) / (0.8 - 0.05)) * 100))}%, #e2e4ef 100%)`,
                      WebkitAppearance: 'none',
                      appearance: 'none',
                      height: 5,
                      borderRadius: 3,
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                    className="rs-thumb"
                  />
                </div>
                <div>
                  <label className="lbl">Orientation</label>
                  <select className="inp sel" value={watermarkAngle} onChange={e => setWatermarkAngle(+e.target.value)}>
                    <option value={45}>45° Diagonal</option>
                    <option value={0}>Horizontal</option>
                  </select>
                </div>
              </div>
            ) : (
              <div className="tool-grid-3" style={{ alignItems: 'center' }}>
                <div>
                  <label className="lbl">Upload Logo / Stamp (PNG, JPG)</label>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="inp"
                    onChange={e => {
                      if (e.target.files && e.target.files[0]) {
                        setWatermarkImage(e.target.files[0])
                      }
                    }}
                  />
                </div>
                <div>
                  <label className="lbl">Opacity ({Math.round(watermarkOpacity * 100)}%)</label>
                  <input
                    type="range"
                    min={0.05}
                    max={1}
                    step={0.05}
                    value={watermarkOpacity}
                    onChange={e => setWatermarkOpacity(parseFloat(e.target.value))}
                    style={{
                      width: '100%',
                      marginTop: 8,
                      background: `linear-gradient(to right, #4F8EF7 0%, #4F8EF7 ${Math.max(0, Math.min(100, ((watermarkOpacity - 0.05) / (1 - 0.05)) * 100))}%, #e2e4ef ${Math.max(0, Math.min(100, ((watermarkOpacity - 0.05) / (1 - 0.05)) * 100))}%, #e2e4ef 100%)`,
                      WebkitAppearance: 'none',
                      appearance: 'none',
                      height: 5,
                      borderRadius: 3,
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                    className="rs-thumb"
                  />
                </div>
                <div>
                  <label className="lbl">Angle</label>
                  <select className="inp sel" value={watermarkAngle} onChange={e => setWatermarkAngle(+e.target.value)}>
                    <option value={0}>Upright (0°)</option>
                    <option value={45}>45° Diagonal</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Crop Pages Options */}
        {activeAction.id === 'crop' && files.length > 0 && (
          <div style={{ background: 'rgba(79,142,247,.04)', border: '1px solid rgba(79,142,247,.14)', borderRadius: 14, padding: '16px 18px', marginBottom: 20 }}>
            <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 13.5, color: '#1a1a2e', marginBottom: 12 }}>
              📐 Page Crop & Boundary Adjustments
            </div>
            <div className="tool-grid-4" style={{ marginBottom: 12 }}>
              <div>
                <label className="lbl">Top Trim ({cropMargins.top}%)</label>
                <input
                  type="range" min={0} max={40} value={cropMargins.top}
                  onChange={e => setCropMargins(m => ({ ...m, top: +e.target.value }))}
                  style={{
                    width: '100%',
                    background: `linear-gradient(to right, #4F8EF7 0%, #4F8EF7 ${(cropMargins.top / 40) * 100}%, #e2e4ef ${(cropMargins.top / 40) * 100}%, #e2e4ef 100%)`,
                    WebkitAppearance: 'none',
                    appearance: 'none',
                    height: 5,
                    borderRadius: 3,
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                  className="rs-thumb"
                />
              </div>
              <div>
                <label className="lbl">Bottom Trim ({cropMargins.bottom}%)</label>
                <input
                  type="range" min={0} max={40} value={cropMargins.bottom}
                  onChange={e => setCropMargins(m => ({ ...m, bottom: +e.target.value }))}
                  style={{
                    width: '100%',
                    background: `linear-gradient(to right, #4F8EF7 0%, #4F8EF7 ${(cropMargins.bottom / 40) * 100}%, #e2e4ef ${(cropMargins.bottom / 40) * 100}%, #e2e4ef 100%)`,
                    WebkitAppearance: 'none',
                    appearance: 'none',
                    height: 5,
                    borderRadius: 3,
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                  className="rs-thumb"
                />
              </div>
              <div>
                <label className="lbl">Left Trim ({cropMargins.left}%)</label>
                <input
                  type="range" min={0} max={40} value={cropMargins.left}
                  onChange={e => setCropMargins(m => ({ ...m, left: +e.target.value }))}
                  style={{
                    width: '100%',
                    background: `linear-gradient(to right, #4F8EF7 0%, #4F8EF7 ${(cropMargins.left / 40) * 100}%, #e2e4ef ${(cropMargins.left / 40) * 100}%, #e2e4ef 100%)`,
                    WebkitAppearance: 'none',
                    appearance: 'none',
                    height: 5,
                    borderRadius: 3,
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                  className="rs-thumb"
                />
              </div>
              <div>
                <label className="lbl">Right Trim ({cropMargins.right}%)</label>
                <input
                  type="range" min={0} max={40} value={cropMargins.right}
                  onChange={e => setCropMargins(m => ({ ...m, right: +e.target.value }))}
                  style={{
                    width: '100%',
                    background: `linear-gradient(to right, #4F8EF7 0%, #4F8EF7 ${(cropMargins.right / 40) * 100}%, #e2e4ef ${(cropMargins.right / 40) * 100}%, #e2e4ef 100%)`,
                    WebkitAppearance: 'none',
                    appearance: 'none',
                    height: 5,
                    borderRadius: 3,
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                  className="rs-thumb"
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button type="button" className="btn btn-sm btn-outline" onClick={() => setCropMargins({ top: 5, bottom: 5, left: 5, right: 5 })}>Standard 5%</button>
              <button type="button" className="btn btn-sm btn-outline" onClick={() => setCropMargins({ top: 10, bottom: 10, left: 10, right: 10 })}>Wide 10%</button>
              <button type="button" className="btn btn-sm btn-outline" onClick={() => setCropMargins({ top: 15, bottom: 15, left: 15, right: 15 })}>Deep 15%</button>
              <button type="button" className="btn btn-sm btn-outline" onClick={() => setCropMargins({ top: 0, bottom: 0, left: 0, right: 0 })}>Reset (0%)</button>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                <label className="lbl" style={{ margin: 0 }}>Apply to:</label>
                <select className="inp sel" style={{ padding: '4px 8px', fontSize: 12 }} value={cropTargetPage} onChange={e => setCropTargetPage(e.target.value)}>
                  <option value="ALL">All Pages</option>
                  <option value="1">First Page Only</option>
                </select>
              </div>
            </div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 8 }}>
              💡 Lossless vector crop: adjustments modify PDF CropBox and MediaBox parameters directly without rasterization.
            </div>
          </div>
        )}

        {/* PDFs to ZIP Options */}
        {activeAction.id === 'pdf-zip' && files.length > 0 && (
          <div style={{ background: 'rgba(245,158,11,.06)', border: '1px solid rgba(245,158,11,.2)', borderRadius: 14, padding: '16px 18px', marginBottom: 20 }}>
            <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 13.5, color: '#1a1a2e', marginBottom: 8 }}>
              📦 ZIP Archive Packaging
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <label className="lbl">ZIP Archive Filename</label>
                <input
                  className="inp"
                  value={zipFilename}
                  onChange={e => setZipFilename(e.target.value)}
                  placeholder="documents.zip"
                />
              </div>
              <div style={{ padding: '10px 14px', background: '#fff', borderRadius: 10, border: '1px solid rgba(0,0,0,.08)', fontSize: 12 }}>
                <strong>{files.length}</strong> file(s) queued ({formatBytes(files.reduce((acc, f) => acc + (f.size || 0), 0))})
              </div>
            </div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>
              🔒 Zip Slip & Directory traversal protection enabled. Filenames are safely normalized and deduplicated.
            </div>
          </div>
        )}

        {/* Page Numbers Options */}
        {activeAction.id === 'page-numbers' && files.length > 0 && (
          <div style={{ background: 'rgba(99,102,241,.06)', border: '1px solid rgba(99,102,241,.2)', borderRadius: 14, padding: '16px 18px', marginBottom: 20 }}>
            <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 13.5, color: '#1a1a2e', marginBottom: 12 }}>
              🔢 Page Numbering Configuration
            </div>
            <div className="tool-grid-2-compact" style={{ gap: 12 }}>
              <div>
                <label className="lbl">Number Format</label>
                <select className="inp sel" value={pageNumberFormat} onChange={e => setPageNumberFormat(e.target.value)}>
                  <option value="page_x_of_y">Page X of Y (e.g. Page 1 of 12)</option>
                  <option value="page_x">Page X (e.g. Page 1)</option>
                  <option value="x_of_y">X / Y (e.g. 1 / 12)</option>
                  <option value="x">Plain Number (e.g. 1)</option>
                </select>
              </div>
              <div>
                <label className="lbl">Position</label>
                <select className="inp sel" value={pageNumberPosition} onChange={e => setPageNumberPosition(e.target.value)}>
                  <option value="bottom-center">Bottom Center</option>
                  <option value="bottom-right">Bottom Right</option>
                  <option value="bottom-left">Bottom Left</option>
                  <option value="top-center">Top Center</option>
                  <option value="top-right">Top Right</option>
                  <option value="top-left">Top Left</option>
                </select>
              </div>
              <div>
                <label className="lbl">Start Numbering On Page</label>
                <input
                  type="number"
                  min={1}
                  className="inp"
                  value={pageNumberStart}
                  onChange={e => setPageNumberStart(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  placeholder="1 (Set 2 to skip cover)"
                />
              </div>
              <div>
                <label className="lbl">Font Size (pt)</label>
                <input
                  type="number"
                  min={6}
                  max={24}
                  className="inp"
                  value={pageNumberFontSize}
                  onChange={e => setPageNumberFontSize(+e.target.value || 10)}
                />
              </div>
            </div>
          </div>
        )}

        {/* Header & Footer Options */}
        {activeAction.id === 'header-footer' && files.length > 0 && (
          <div style={{ background: 'rgba(6,182,212,.06)', border: '1px solid rgba(6,182,212,.2)', borderRadius: 14, padding: '16px 18px', marginBottom: 20 }}>
            <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 13.5, color: '#1a1a2e', marginBottom: 12 }}>
              📑 Header & Footer Configuration
            </div>
            <div className="tool-grid-2-compact" style={{ gap: 12, marginBottom: 12 }}>
              <div>
                <label className="lbl">Header Text</label>
                <input
                  className="inp"
                  value={headerText}
                  onChange={e => setHeaderText(e.target.value)}
                  placeholder="e.g. Confidential Report — {date}"
                />
              </div>
              <div>
                <label className="lbl">Header Alignment</label>
                <select className="inp sel" value={headerAlign} onChange={e => setHeaderAlign(e.target.value)}>
                  <option value="center">Center</option>
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                </select>
              </div>
              <div>
                <label className="lbl">Footer Text</label>
                <input
                  className="inp"
                  value={footerText}
                  onChange={e => setFooterText(e.target.value)}
                  placeholder="Page {page} of {total}"
                />
              </div>
              <div>
                <label className="lbl">Footer Alignment</label>
                <select className="inp sel" value={footerAlign} onChange={e => setFooterAlign(e.target.value)}>
                  <option value="center">Center</option>
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                </select>
              </div>
            </div>
            <div style={{ fontSize: 11, color: '#64748b' }}>
              💡 Template variables supported: <code>{'{page}'}</code>, <code>{'{total}'}</code>, <code>{'{title}'}</code>, <code>{'{date}'}</code>.
            </div>
          </div>
        )}

        {/* Compress PDF Options */}
        {activeAction.id === 'compress' && files.length > 0 && (
          <div style={{ background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.2)', borderRadius: 14, padding: '16px 18px', marginBottom: 20 }}>
            <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 13.5, color: '#1a1a2e', marginBottom: 10 }}>
              🗜️ Multi-Tier Compression Presets
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 10 }}>
              {[
                { id: 'balanced', title: 'Balanced (Recommended)', desc: '144 DPI smart image downsampling & object stream compaction', badge: 'Best Balance' },
                { id: 'high', title: 'Extreme Compression', desc: '96 DPI raster reduction for compact web & email transfers', badge: 'Smallest Size' },
                { id: 'lossless', title: 'Lossless Cleanup', desc: 'Deduplicates streams & fonts without altering image pixels', badge: '100% Quality' },
              ].map(opt => {
                const isSel = compressPreset === opt.id
                return (
                  <div
                    key={opt.id}
                    onClick={() => setCompressPreset(opt.id)}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 12,
                      cursor: 'pointer',
                      border: `1.5px solid ${isSel ? '#22c55e' : 'rgba(0,0,0,.08)'}`,
                      background: isSel ? 'rgba(34,197,94,.12)' : '#ffffff',
                      transition: 'all .18s var(--ease)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: 12.5, color: '#1a1a2e' }}>{opt.title}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 6, background: isSel ? '#22c55e' : '#f1f5f9', color: isSel ? '#fff' : '#64748b' }}>
                        {opt.badge}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.4 }}>{opt.desc}</div>
                  </div>
                )
              })}
            </div>
            <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>
              🛡️ Honest Size Policy: ToolDesk checks real byte reduction and never misleads you.
            </div>
          </div>
        )}

        {/* Clean Metadata Options */}
        {activeAction.id === 'clean-meta' && files.length > 0 && (
          <div style={{ background: 'rgba(16,185,129,.06)', border: '1px solid rgba(16,185,129,.2)', borderRadius: 14, padding: '16px 18px', marginBottom: 20 }}>
            <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 13.5, color: '#1a1a2e', marginBottom: 6 }}>
              🧹 Privacy Metadata Scrubber
            </div>
            <p style={{ fontSize: 12.5, color: '#444', lineHeight: 1.5, margin: 0 }}>
              Removes embedded Author, Title, Subject, Keywords, Creator, Producer, Creation timestamp, Modification timestamp, and embedded XMP tracking streams.
            </p>
            <div style={{ marginTop: 10, fontSize: 11, color: '#059669', fontWeight: 600 }}>
              🛡️ 100% Client-side: Your clean document will be generated locally with all tracking metadata permanently wiped.
            </div>
          </div>
        )}

        {/* Lock / Encrypt PDF Options */}
        {activeAction.id === 'lock' && files.length > 0 && (
          <div style={{ background: 'rgba(99,102,241,.06)', border: '1px solid rgba(99,102,241,.2)', borderRadius: 14, padding: '16px 18px', marginBottom: 20 }}>
            <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 14, color: '#1a1a2e', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 7 }}>
              <Lock size={16} color="#6366f1" /> Encrypt & Password Protect PDF
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 14 }}>
              <div className="fgrp">
                <label className="lbl">Open Password (Required)</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showLockPassword ? 'text' : 'password'}
                    className="inp"
                    value={lockPassword}
                    onChange={e => setLockPassword(e.target.value)}
                    placeholder="Enter strong document password..."
                    style={{ paddingRight: 40 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowLockPassword(p => !p)}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
                  >
                    {showLockPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="fgrp">
                <label className="lbl">Confirm Password</label>
                <input
                  type={showLockPassword ? 'text' : 'password'}
                  className="inp"
                  value={lockConfirmPassword}
                  onChange={e => setLockConfirmPassword(e.target.value)}
                  placeholder="Re-enter password to confirm..."
                />
                {lockConfirmPassword && lockPassword !== lockConfirmPassword && (
                  <span style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>Passwords do not match</span>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 14 }}>
              <div className="fgrp">
                <label className="lbl">Encryption Standard</label>
                <select className="inp sel" value={lockAlgorithm} onChange={e => setLockAlgorithm(e.target.value)}>
                  <option value="AES-256">AES-256 (High Security, Modern Standard)</option>
                  <option value="RC4-128">RC4-128 (Legacy Compatibility, PDF 1.4+)</option>
                </select>
              </div>

              <div className="fgrp">
                <label className="lbl">Permissions / Owner Password (Optional)</label>
                <input
                  type="password"
                  className="inp"
                  value={lockOwnerPassword}
                  onChange={e => setLockOwnerPassword(e.target.value)}
                  placeholder="Master password to alter permissions..."
                />
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label className="lbl" style={{ marginBottom: 8 }}>Granular Document Permissions</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#334155', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={lockPermissions.printing !== 'none'}
                    onChange={e => setLockPermissions(p => ({ ...p, printing: e.target.checked ? 'highResolution' : 'none' }))}
                  />
                  Allow Printing
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#334155', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={lockPermissions.copying}
                    onChange={e => setLockPermissions(p => ({ ...p, copying: e.target.checked }))}
                  />
                  Allow Content Copying
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#334155', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={lockPermissions.annotating}
                    onChange={e => setLockPermissions(p => ({ ...p, annotating: e.target.checked }))}
                  />
                  Allow Annotations
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#334155', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={lockPermissions.fillingForms}
                    onChange={e => setLockPermissions(p => ({ ...p, fillingForms: e.target.checked }))}
                  />
                  Allow Form Filling
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#334155', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={lockPermissions.modifying}
                    onChange={e => setLockPermissions(p => ({ ...p, modifying: e.target.checked }))}
                  />
                  Allow Modification
                </label>
              </div>
            </div>

            <div style={{ fontSize: 11, color: '#6366f1', display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(99,102,241,.08)', padding: '8px 12px', borderRadius: 8 }}>
              <ShieldCheck size={14} style={{ flexShrink: 0 }} /> Pure client-side Web Crypto encryption. Keys and documents never leave your device.
            </div>
          </div>
        )}

        {/* Unlock PDF Options */}
        {activeAction.id === 'unlock' && files.length > 0 && (
          <div style={{ background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.2)', borderRadius: 14, padding: '16px 18px', marginBottom: 20 }}>
            <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 13.5, color: '#1a1a2e', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 7 }}>
              <Unlock size={16} color="#22c55e" /> Authorized PDF Decryption & Unlock
            </div>
            <div style={{ maxWidth: 420 }}>
              <label className="lbl">Document Password</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="inp"
                  value={pdfPassword}
                  onChange={e => setPdfPassword(e.target.value)}
                  placeholder="Enter PDF open password..."
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowPassword(p => !p)}
                  style={{ padding: '6px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  {showPassword ? <><EyeOff size={13} /> Hide</> : <><Eye size={13} /> Show</>}
                </button>
              </div>
            </div>
            <div style={{ fontSize: 11, color: '#15803d', marginTop: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Info size={13} style={{ flexShrink: 0 }} /> Provide the valid user password to losslessly remove document encryption. The exported PDF will open cleanly without passwords.
            </div>
          </div>
        )}

        {/* Change PDF Password Options */}
        {activeAction.id === 'change-password' && files.length > 0 && (
          <div style={{ background: 'rgba(236,72,153,.06)', border: '1px solid rgba(236,72,153,.2)', borderRadius: 14, padding: '16px 18px', marginBottom: 20 }}>
            <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 13.5, color: '#1a1a2e', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 7 }}>
              <KeyRound size={16} color="#ec4899" /> Change PDF Security Password
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 12 }}>
              <div className="fgrp">
                <label className="lbl">Current Password</label>
                <input
                  type={showChangePassword ? 'text' : 'password'}
                  className="inp"
                  value={changeOldPassword}
                  onChange={e => setChangeOldPassword(e.target.value)}
                  placeholder="Existing document password..."
                />
              </div>

              <div className="fgrp">
                <label className="lbl">New Password</label>
                <input
                  type={showChangePassword ? 'text' : 'password'}
                  className="inp"
                  value={changeNewPassword}
                  onChange={e => setChangeNewPassword(e.target.value)}
                  placeholder="New strong password..."
                />
              </div>

              <div className="fgrp">
                <label className="lbl">Confirm New Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showChangePassword ? 'text' : 'password'}
                    className="inp"
                    value={changeConfirmPassword}
                    onChange={e => setChangeConfirmPassword(e.target.value)}
                    placeholder="Confirm new password..."
                    style={{ paddingRight: 40 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowChangePassword(p => !p)}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
                  >
                    {showChangePassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>

            <div style={{ fontSize: 11, color: '#be185d', display: 'flex', alignItems: 'center', gap: 5 }}>
              <ShieldCheck size={13} style={{ flexShrink: 0 }} /> Decrypts losslessly and re-encrypts client-side under your new credentials with modern AES-256.
            </div>
          </div>
        )}

        {/* Flatten PDF Options */}
        {activeAction.id === 'flatten' && files.length > 0 && (
          <div style={{ background: 'rgba(139,92,246,.06)', border: '1px solid rgba(139,92,246,.2)', borderRadius: 14, padding: '16px 18px', marginBottom: 20 }}>
            <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 13.5, color: '#1a1a2e', marginBottom: 6 }}>
              📄 Flatten Interactive Form Fields & Annotations
            </div>
            <p style={{ fontSize: 12.5, color: '#444', lineHeight: 1.5, margin: 0 }}>
              Burns all fillable form widgets (text fields, checkboxes, radio buttons, dropdowns) directly into the static document stream so values become permanent and cannot be modified.
            </p>
          </div>
        )}

        {/* Form Builder Options */}
        {activeAction.id === 'form-builder' && files.length > 0 && (
          <div style={{ background: 'rgba(59,130,246,.06)', border: '1px solid rgba(59,130,246,.2)', borderRadius: 14, padding: '16px 18px', marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 13.5, color: '#1a1a2e' }}>
                📋 AcroForm Interactive Field Builder
              </div>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => {
                  setBuilderFields(prev => [
                    ...prev,
                    {
                      id: Date.now(),
                      name: `field_${prev.length + 1}`,
                      type: 'text',
                      pageNumber: 1,
                      defaultValue: '',
                      xPercent: 0.1,
                      yPercent: Math.min(0.85, 0.2 + (prev.length * 0.08)),
                      widthPercent: 0.4,
                      heightPercent: 0.04
                    }
                  ])
                }}
              >
                + Add Field
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {builderFields.map((f, idx) => (
                <div key={f.id || idx} style={{ padding: '12px 14px', background: '#fff', borderRadius: 10, border: '1px solid rgba(0,0,0,.08)' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#3b82f6', width: 22 }}>#{idx + 1}</span>
                    <input
                      className="inp"
                      style={{ flex: 2, padding: '5px 8px', fontSize: 12 }}
                      value={f.name}
                      onChange={e => {
                        const val = e.target.value
                        setBuilderFields(fields => fields.map((item, i) => i === idx ? { ...item, name: val } : item))
                      }}
                      placeholder="Field Name (e.g. signature_name)"
                    />
                    <select
                      className="inp sel"
                      style={{ flex: 1.2, padding: '5px 8px', fontSize: 12 }}
                      value={f.type}
                      onChange={e => {
                        const val = e.target.value
                        setBuilderFields(fields => fields.map((item, i) => i === idx ? { ...item, type: val } : item))
                      }}
                    >
                      <option value="text">Text Field</option>
                      <option value="checkbox">Checkbox</option>
                      <option value="dropdown">Dropdown</option>
                    </select>
                    <select
                      className="inp sel"
                      style={{ width: 90, padding: '5px 8px', fontSize: 12 }}
                      value={f.pageNumber}
                      onChange={e => {
                        const val = +e.target.value
                        setBuilderFields(fields => fields.map((item, i) => i === idx ? { ...item, pageNumber: val } : item))
                      }}
                    >
                      {(thumbnails.length ? thumbnails : [{ pageNumber: 1 }]).map(t => (
                        <option key={t.pageNumber} value={t.pageNumber}>Page {t.pageNumber}</option>
                      ))}
                    </select>
                    {builderFields.length > 1 && (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline"
                        style={{ color: '#ef4444', borderColor: '#ef4444' }}
                        onClick={() => setBuilderFields(fields => fields.filter((_, i) => i !== idx))}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      className="inp"
                      style={{ flex: 1, padding: '5px 8px', fontSize: 11 }}
                      value={f.defaultValue}
                      onChange={e => {
                        const val = e.target.value
                        setBuilderFields(fields => fields.map((item, i) => i === idx ? { ...item, defaultValue: val } : item))
                      }}
                      placeholder={f.type === 'dropdown' ? 'Default Option (comma-separate options)' : 'Default Value (optional)'}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>
              💡 Form fields are created as native PDF AcroForms compatible with Adobe Reader, Preview, Chrome, and iOS.
            </div>
          </div>
        )}

        {/* Permanent Redaction Options */}
        {activeAction.id === 'redact' && files.length > 0 && (
          <div style={{ background: 'rgba(239,68,68,.05)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 14, padding: '16px 18px', marginBottom: 20 }}>
            <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 13.5, color: '#1a1a2e', marginBottom: 10 }}>
              ⬛ Permanent Visual Redaction
            </div>
            <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 12, fontWeight: 600 }}>
              ⚠️ Permanent Obliteration: Redacted pages are fully rasterized with solid blackout blocks burned into the pixel data. Underlying vector text and objects are permanently destroyed and cannot be retrieved.
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
              <div>
                <label className="lbl" style={{ margin: 0, marginBottom: 4 }}>Target Page</label>
                <select
                  className="inp sel"
                  value={redactPage}
                  onChange={e => setRedactPage(+e.target.value)}
                  style={{ padding: '6px 12px', fontSize: 13 }}
                >
                  {(thumbnails.length ? thumbnails : [{ pageNumber: 1 }]).map(t => (
                    <option key={t.pageNumber} value={t.pageNumber}>Page {t.pageNumber}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="lbl" style={{ margin: 0, marginBottom: 4 }}>Color</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[
                    { color: '#000000', label: 'Blackout' },
                    { color: '#1e1e1e', label: 'Dark Gray' },
                    { color: '#ffffff', label: 'Whiteout' },
                  ].map(c => (
                    <button
                      key={c.color}
                      type="button"
                      className={`btn btn-sm ${redactColor === c.color ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => setRedactColor(c.color)}
                      style={{ padding: '4px 10px', fontSize: 11 }}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                style={{ marginTop: 18 }}
                onClick={() => {
                  const currentList = redactionBoxes[redactPage] || []
                  const newBox = {
                    id: Date.now(),
                    xPercent: 0.15,
                    yPercent: 0.2 + (currentList.length * 0.08),
                    widthPercent: 0.7,
                    heightPercent: 0.06,
                    color: redactColor,
                  }
                  setRedactionBoxes(prev => ({
                    ...prev,
                    [redactPage]: [...(prev[redactPage] || []), newBox],
                  }))
                }}
              >
                + Add Redaction Area on Page {redactPage}
              </button>
            </div>

            {/* Display active redactions on this page */}
            {(redactionBoxes[redactPage] || []).length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                <label className="lbl">Active Redaction Boxes on Page {redactPage}:</label>
                {(redactionBoxes[redactPage] || []).map((box, bIdx) => (
                  <div
                    key={box.id || bIdx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: '#fff',
                      borderRadius: 8,
                      border: '1px solid rgba(0,0,0,.1)',
                      fontSize: 12,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 14, height: 14, background: box.color, borderRadius: 3, border: '1px solid #999' }} />
                      <span>Redaction Box #{bIdx + 1} (Width: {Math.round(box.widthPercent * 100)}%, Height: {Math.round(box.heightPercent * 100)}%)</span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      style={{ color: '#ef4444', padding: '2px 8px', fontSize: 11 }}
                      onClick={() => {
                        setRedactionBoxes(prev => ({
                          ...prev,
                          [redactPage]: (prev[redactPage] || []).filter((_, i) => i !== bIdx),
                        }))
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Visual Signature Options */}
        {activeAction.id === 'sign' && files.length > 0 && (
          <div style={{ background: 'rgba(79,142,247,.04)', border: '1px solid rgba(79,142,247,.14)', borderRadius: 14, padding: '16px 18px', marginBottom: 20 }}>
            <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 13.5, color: '#1a1a2e', marginBottom: 12 }}>
              ✍️ Visual Signature Embedding
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <button
                type="button"
                className={`btn btn-sm ${sigType === 'draw' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setSigType('draw')}
                style={{ padding: '6px 12px', fontSize: 12 }}
              >
                Draw Signature
              </button>
              <button
                type="button"
                className={`btn btn-sm ${sigType === 'upload' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setSigType('upload')}
                style={{ padding: '6px 12px', fontSize: 12 }}
              >
                Upload Signature PNG
              </button>
            </div>

            {sigType === 'draw' ? (
              <div style={{ marginBottom: 14 }}>
                <label className="lbl">Draw with Mouse or Touchpad:</label>
                <div style={{ border: '1.5px dashed rgba(79,142,247,.4)', borderRadius: 10, background: '#fff', display: 'block', maxWidth: '100%', overflow: 'hidden' }}>
                  <canvas
                    ref={sigCanvasRef}
                    width={320}
                    height={130}
                    style={{ display: 'block', touchAction: 'none', cursor: 'crosshair', maxWidth: '100%', width: '100%', height: 'auto', maxHeight: 130 }}
                    onMouseDown={e => {
                      setIsDrawingSig(true)
                      const ctx = sigCanvasRef.current.getContext('2d')
                      const rect = sigCanvasRef.current.getBoundingClientRect()
                      const scaleX = sigCanvasRef.current.width / rect.width
                      const scaleY = sigCanvasRef.current.height / rect.height
                      ctx.beginPath()
                      ctx.moveTo((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY)
                    }}
                    onMouseMove={e => {
                      if (!isDrawingSig) return
                      const ctx = sigCanvasRef.current.getContext('2d')
                      const rect = sigCanvasRef.current.getBoundingClientRect()
                      const scaleX = sigCanvasRef.current.width / rect.width
                      const scaleY = sigCanvasRef.current.height / rect.height
                      ctx.lineWidth = 2.5
                      ctx.lineCap = 'round'
                      ctx.strokeStyle = '#000000'
                      ctx.lineTo((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY)
                      ctx.stroke()
                    }}
                    onMouseUp={() => {
                      setIsDrawingSig(false)
                      if (sigCanvasRef.current) {
                        setSigDataUrl(sigCanvasRef.current.toDataURL('image/png'))
                      }
                    }}
                    onMouseLeave={() => setIsDrawingSig(false)}
                    onTouchStart={e => {
                      setIsDrawingSig(true)
                      const touch = e.touches[0]
                      const rect = sigCanvasRef.current.getBoundingClientRect()
                      const scaleX = sigCanvasRef.current.width / rect.width
                      const scaleY = sigCanvasRef.current.height / rect.height
                      const ctx = sigCanvasRef.current.getContext('2d')
                      ctx.beginPath()
                      ctx.moveTo((touch.clientX - rect.left) * scaleX, (touch.clientY - rect.top) * scaleY)
                    }}
                    onTouchMove={e => {
                      if (!isDrawingSig) return
                      const touch = e.touches[0]
                      const rect = sigCanvasRef.current.getBoundingClientRect()
                      const scaleX = sigCanvasRef.current.width / rect.width
                      const scaleY = sigCanvasRef.current.height / rect.height
                      const ctx = sigCanvasRef.current.getContext('2d')
                      ctx.lineWidth = 2.5
                      ctx.lineCap = 'round'
                      ctx.strokeStyle = '#000000'
                      ctx.lineTo((touch.clientX - rect.left) * scaleX, (touch.clientY - rect.top) * scaleY)
                      ctx.stroke()
                    }}
                    onTouchEnd={() => {
                      setIsDrawingSig(false)
                      if (sigCanvasRef.current) {
                        setSigDataUrl(sigCanvasRef.current.toDataURL('image/png'))
                      }
                    }}
                  />
                </div>
                <div style={{ marginTop: 6 }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    style={{ fontSize: 11 }}
                    onClick={() => {
                      if (sigCanvasRef.current) {
                        const ctx = sigCanvasRef.current.getContext('2d')
                        ctx.clearRect(0, 0, 320, 130)
                        setSigDataUrl(null)
                      }
                    }}
                  >
                    Clear Drawing Pad
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: 14 }}>
                <label className="lbl">Upload Transparent PNG Signature:</label>
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  className="inp"
                  onChange={e => {
                    const file = e.target.files && e.target.files[0]
                    if (file) {
                      const reader = new FileReader()
                      reader.onload = ev => setSigDataUrl(ev.target.result)
                      reader.readAsDataURL(file)
                    }
                  }}
                />
              </div>
            )}

            {/* Signature placement controls */}
            <div className="pdf-options-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 12 }}>
              <div>
                <label className="lbl">Target Page</label>
                <select className="inp sel" value={sigPage} onChange={e => setSigPage(+e.target.value)}>
                  {(thumbnails.length ? thumbnails : [{ pageNumber: 1 }]).map(t => (
                    <option key={t.pageNumber} value={t.pageNumber}>Page {t.pageNumber}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="lbl">Placement Position</label>
                <select className="inp sel" value={sigPosition} onChange={e => setSigPosition(e.target.value)}>
                  <option value="bottom-right">Bottom Right (Standard)</option>
                  <option value="bottom-left">Bottom Left</option>
                  <option value="bottom-center">Bottom Center</option>
                  <option value="center">Center</option>
                </select>
              </div>
              <div>
                <label className="lbl">Signature Scale: {Math.round(sigScale * 100)}%</label>
                <input
                  type="range"
                  min={0.1}
                  max={0.5}
                  step={0.05}
                  value={sigScale}
                  onChange={e => setSigScale(+e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 8,
                    background: `linear-gradient(to right, #4F8EF7 0%, #4F8EF7 ${((sigScale - 0.1) / (0.5 - 0.1)) * 100}%, #e2e4ef ${((sigScale - 0.1) / (0.5 - 0.1)) * 100}%, #e2e4ef 100%)`,
                    WebkitAppearance: 'none',
                    appearance: 'none',
                    height: 5,
                    borderRadius: 3,
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                  className="rs-thumb"
                />
              </div>
            </div>
          </div>
        )}

        {/* Fill PDF Forms Options */}
        {activeAction.id === 'forms' && files.length > 0 && (
          <div style={{ background: 'rgba(16,185,129,.04)', border: '1px solid rgba(16,185,129,.14)', borderRadius: 14, padding: '16px 18px', marginBottom: 20 }}>
            <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 13.5, color: '#1a1a2e', marginBottom: 12 }}>
              📝 Interactive PDF Form Fields
            </div>
            {loadingFields ? (
              <div style={{ padding: 14, textAlign: 'center', color: '#888' }}>
                ⏳ Scanning document for interactive AcroForm fields...
              </div>
            ) : formFields.length === 0 ? (
              <div style={{ padding: 14, background: '#fff', borderRadius: 10, border: '1px solid rgba(0,0,0,.08)', fontSize: 12.5, color: '#666' }}>
                ℹ️ No interactive form fields detected in this document. Please upload a fillable PDF form.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                {formFields.map(f => (
                  <div key={f.name} style={{ background: '#fff', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(0,0,0,.08)' }}>
                    <label className="lbl" style={{ marginBottom: 4 }}>{f.name} ({f.type})</label>
                    {f.type === 'checkbox' ? (
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                        <input
                          type="checkbox"
                          checked={!!formValues[f.name]}
                          onChange={e => setFormValues(prev => ({ ...prev, [f.name]: e.target.checked }))}
                        />
                        <span>{f.name}</span>
                      </label>
                    ) : f.type === 'dropdown' || f.type === 'radio' ? (
                      <select
                        className="inp sel"
                        value={formValues[f.name] || ''}
                        onChange={e => setFormValues(prev => ({ ...prev, [f.name]: e.target.value }))}
                      >
                        {f.options.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        className="inp"
                        value={formValues[f.name] || ''}
                        onChange={e => setFormValues(prev => ({ ...prev, [f.name]: e.target.value }))}
                        placeholder={`Enter ${f.name}...`}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Metadata Editor Form */}
        {activeAction.id === 'metadata' && (
          <div style={{ background: 'rgba(79,142,247,.04)', border: '1px solid rgba(79,142,247,.14)', borderRadius: 14, padding: '16px 18px', marginBottom: 20 }}>
            <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 13.5, color: '#1a1a2e', marginBottom: 12 }}>
              🏷️ PDF Metadata Tags
            </div>
            <div className="tool-grid-2-compact">
              <div>
                <label className="lbl">Title</label>
                <input
                  className="inp"
                  value={metaForm.title}
                  onChange={e => setMetaForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Document Title"
                />
              </div>
              <div>
                <label className="lbl">Author</label>
                <input
                  className="inp"
                  value={metaForm.author}
                  onChange={e => setMetaForm(f => ({ ...f, author: e.target.value }))}
                  placeholder="Author Name"
                />
              </div>
              <div>
                <label className="lbl">Subject</label>
                <input
                  className="inp"
                  value={metaForm.subject}
                  onChange={e => setMetaForm(f => ({ ...f, subject: e.target.value }))}
                  placeholder="Document Subject"
                />
              </div>
              <div>
                <label className="lbl">Keywords (comma separated)</label>
                <input
                  className="inp"
                  value={metaForm.keywords}
                  onChange={e => setMetaForm(f => ({ ...f, keywords: e.target.value }))}
                  placeholder="report, invoice, draft"
                />
              </div>
            </div>
          </div>
        )}

        {/* ── 5. VISUAL PAGE THUMBNAIL PICKER (For Extract, Reorder, Delete) ── */}
        {['extract', 'reorder', 'delete'].includes(activeAction.id) && files.length > 0 && (
          <div style={{ marginBottom: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
              <label className="lbl" style={{ margin: 0 }}>
                {activeAction.id === 'extract' && `SELECT PAGES TO EXTRACT (${selectedPages.length} of ${thumbnails.length} selected)`}
                {activeAction.id === 'reorder' && 'DRAG OR REARRANGE PAGE SEQUENCE'}
                {activeAction.id === 'delete' && `CLICK PAGES TO MARK FOR DELETION (${deletedPages.size} of ${thumbnails.length} marked)`}
              </label>
              {activeAction.id === 'extract' && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={() => {
                      const all = thumbnails.map(t => t.pageNumber)
                      setSelectedPages(all)
                      setPageRangeInput(formatPageRangeString(all))
                    }}
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={() => {
                      setSelectedPages([])
                      setPageRangeInput('')
                    }}
                  >
                    Clear
                  </button>
                </div>
              )}
              {activeAction.id === 'delete' && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={() => {
                      const all = thumbnails.map(t => t.pageNumber)
                      setDeletedPages(new Set(all))
                      setPageRangeInput(formatPageRangeString(all))
                    }}
                  >
                    Mark All
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={() => {
                      setDeletedPages(new Set())
                      setPageRangeInput('')
                    }}
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>

            {/* Bidirectional Page Range Input Bar */}
            {['extract', 'delete'].includes(activeAction.id) && (
              <div style={{ background: '#f8f9ff', border: '1px solid rgba(79,142,247,.16)', borderRadius: 12, padding: '10px 14px', marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#1a1a2e' }}>
                    {activeAction.id === 'extract' ? '📑 Custom Page Range to Extract:' : '🗑️ Custom Page Range to Delete:'}
                  </span>
                </div>
                <input
                  type="text"
                  className="inp"
                  placeholder={activeAction.id === 'extract' ? "e.g. 1-3, 5, 8-10" : "e.g. 2, 4, 7-9"}
                  value={pageRangeInput}
                  onChange={e => handlePageRangeChange(e.target.value)}
                  style={{ width: '100%', padding: '7px 12px', fontSize: 13, background: '#fff' }}
                />
                <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                  💡 Enter page numbers or click thumbnails below. Changes sync automatically in real time.
                </div>
              </div>
            )}

            {loadingThumbnails ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#888', background: '#fafafa', borderRadius: 12 }}>
                ⏳ Rendering page thumbnails preview...
              </div>
            ) : thumbnails.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10 }}>
                {/* Thumbnails based on current order or default order */}
                {(activeAction.id === 'reorder' ? pageOrder : thumbnails.map(t => t.pageNumber)).map((pageNum, idx) => {
                  const thumb = thumbnails.find(t => t.pageNumber === pageNum)
                  const isExtractSelected = selectedPages.includes(pageNum)
                  const isMarkedDelete = deletedPages.has(pageNum)

                  return (
                    <motion.div
                      key={pageNum}
                      whileHover={{ scale: 1.02 }}
                      onClick={() => {
                        if (activeAction.id === 'extract') {
                          toggleExtractPage(pageNum)
                        } else if (activeAction.id === 'delete') {
                          toggleDeletePage(pageNum)
                        }
                      }}
                      style={{
                        position: 'relative',
                        borderRadius: 10,
                        overflow: 'hidden',
                        cursor: 'pointer',
                        border: isExtractSelected
                          ? '2px solid #4F8EF7'
                          : isMarkedDelete
                          ? '2px solid #ef4444'
                          : '1px solid rgba(0,0,0,.12)',
                        boxShadow: '0 2px 8px rgba(0,0,0,.04)',
                        background: '#ffffff',
                        opacity: isMarkedDelete ? 0.45 : 1,
                      }}
                    >
                      {thumb?.thumbnailUrl ? (
                        <img
                          src={thumb.thumbnailUrl}
                          alt={`Page ${pageNum}`}
                          style={{ width: '100%', height: 'auto', display: 'block' }}
                        />
                      ) : (
                        <div style={{ height: 130, background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>
                          Page {pageNum}
                        </div>
                      )}

                      {/* Page number badge */}
                      <div
                        style={{
                          position: 'absolute',
                          bottom: 4,
                          left: 4,
                          padding: '2px 6px',
                          borderRadius: 6,
                          background: 'rgba(0,0,0,.7)',
                          color: '#fff',
                          fontSize: 10,
                          fontWeight: 700,
                        }}
                      >
                        P. {pageNum}
                      </div>

                      {/* Extract Selection Indicator */}
                      {activeAction.id === 'extract' && (
                        <div
                          style={{
                            position: 'absolute',
                            top: 6,
                            right: 6,
                            width: 20,
                            height: 20,
                            borderRadius: '50%',
                            background: isExtractSelected ? '#4F8EF7' : 'rgba(255,255,255,.9)',
                            border: `1.5px solid ${isExtractSelected ? '#4F8EF7' : 'rgba(0,0,0,.2)'}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          {isExtractSelected ? '✓' : ''}
                        </div>
                      )}

                      {/* Delete Strikethrough Indicator */}
                      {activeAction.id === 'delete' && isMarkedDelete && (
                        <div
                          style={{
                            position: 'absolute',
                            inset: 0,
                            background: 'rgba(239,68,68,.25)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 28,
                            color: '#ef4444',
                            fontWeight: 900,
                          }}
                        >
                          ✕
                        </div>
                      )}

                      {/* Reorder Arrows */}
                      {activeAction.id === 'reorder' && (
                        <div
                          style={{
                            position: 'absolute',
                            top: 4,
                            right: 4,
                            display: 'flex',
                            gap: 2,
                          }}
                        >
                          {idx > 0 && (
                            <>
                              <button
                                type="button"
                                title="Move to Beginning"
                                onClick={e => {
                                  e.stopPropagation()
                                  setPageOrder(prev => {
                                    const arr = [...prev]
                                    const [moved] = arr.splice(idx, 1)
                                    arr.unshift(moved)
                                    return arr
                                  })
                                }}
                                style={{
                                  width: 18,
                                  height: 20,
                                  borderRadius: 4,
                                  border: 'none',
                                  background: 'rgba(0,0,0,.75)',
                                  color: '#fff',
                                  cursor: 'pointer',
                                  fontSize: 8,
                                  padding: 0,
                                }}
                              >
                                |◀
                              </button>
                              <button
                                type="button"
                                title="Move earlier"
                                onClick={e => {
                                  e.stopPropagation()
                                  setPageOrder(prev => {
                                    const arr = [...prev]
                                    const temp = arr[idx - 1]
                                    arr[idx - 1] = arr[idx]
                                    arr[idx] = temp
                                    return arr
                                  })
                                }}
                                style={{
                                  width: 18,
                                  height: 20,
                                  borderRadius: 4,
                                  border: 'none',
                                  background: 'rgba(0,0,0,.65)',
                                  color: '#fff',
                                  cursor: 'pointer',
                                  fontSize: 9,
                                  padding: 0,
                                }}
                              >
                                ◀
                              </button>
                            </>
                          )}
                          {idx < pageOrder.length - 1 && (
                            <>
                              <button
                                type="button"
                                title="Move later"
                                onClick={e => {
                                  e.stopPropagation()
                                  setPageOrder(prev => {
                                    const arr = [...prev]
                                    const temp = arr[idx + 1]
                                    arr[idx + 1] = arr[idx]
                                    arr[idx] = temp
                                    return arr
                                  })
                                }}
                                style={{
                                  width: 18,
                                  height: 20,
                                  borderRadius: 4,
                                  border: 'none',
                                  background: 'rgba(0,0,0,.65)',
                                  color: '#fff',
                                  cursor: 'pointer',
                                  fontSize: 9,
                                  padding: 0,
                                }}
                              >
                                ▶
                              </button>
                              <button
                                type="button"
                                title="Move to End"
                                onClick={e => {
                                  e.stopPropagation()
                                  setPageOrder(prev => {
                                    const arr = [...prev]
                                    const [moved] = arr.splice(idx, 1)
                                    arr.push(moved)
                                    return arr
                                  })
                                }}
                                style={{
                                  width: 18,
                                  height: 20,
                                  borderRadius: 4,
                                  border: 'none',
                                  background: 'rgba(0,0,0,.75)',
                                  color: '#fff',
                                  cursor: 'pointer',
                                  fontSize: 8,
                                  padding: 0,
                                }}
                              >
                                ▶|
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </motion.div>
                  )
                })}
              </div>
            ) : null}
          </div>
        )}

        {/* ── 6. RUN ACTION BUTTON ── */}
        <button
          type="button"
          className="btn btn-primary"
          style={{ width: '100%', padding: '15px', fontSize: 15, fontWeight: 700 }}
          onClick={runConversion}
          disabled={loading || files.length === 0}
        >
          {loading ? 'Processing Document…' : (
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {activeAction.icon}
              <span>{activeAction.label}</span>
            </span>
          )}
        </button>

        {/* Progress feedback & Cancel */}
        {loading && (
          <div
            style={{
              padding: '12px 16px',
              background: 'rgba(79,142,247,.06)',
              borderRadius: 12,
              border: '1px solid rgba(79,142,247,.18)',
              fontSize: 13,
              color: '#4F8EF7',
              marginTop: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontWeight: 500,
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Loader2 size={16} className="spin" style={{ color: '#4F8EF7' }} />
              <span>{progressMsg || 'Processing document…'}</span>
            </div>
            <button
              type="button"
              onClick={cancelActiveOperation}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 10px',
                borderRadius: 8,
                background: 'rgba(239,68,68,.1)',
                border: '1px solid rgba(239,68,68,.25)',
                color: '#ef4444',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <X size={12} /> Cancel
            </button>
          </div>
        )}

        {/* Status / Error feedback */}
        <AnimatePresence>
          {statusMsg.text && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              style={{
                marginTop: 14,
                padding: '12px 16px',
                borderRadius: 12,
                background:
                  statusMsg.type === 'error'
                    ? 'rgba(239,68,68,.06)'
                    : statusMsg.type === 'success'
                    ? 'rgba(34,197,94,.06)'
                    : 'rgba(79,142,247,.06)',
                border: `1px solid ${
                  statusMsg.type === 'error'
                    ? 'rgba(239,68,68,.2)'
                    : statusMsg.type === 'success'
                    ? 'rgba(34,197,94,.2)'
                    : 'rgba(79,142,247,.2)'
                }`,
                fontSize: 13,
                color: statusMsg.type === 'error' ? '#b91c1c' : '#15803d',
                lineHeight: 1.6,
                fontWeight: 500,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {statusMsg.type === 'error' ? (
                  <AlertTriangle size={15} style={{ color: '#ef4444', flexShrink: 0 }} />
                ) : statusMsg.type === 'success' ? (
                  <CheckCircle2 size={15} style={{ color: '#22c55e', flexShrink: 0 }} />
                ) : (
                  <Info size={15} style={{ color: '#4F8EF7', flexShrink: 0 }} />
                )}
                <span>{statusMsg.text.replace(/^[✅❌⚠️ℹ️\s]+/, '')}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── 7. RICH RESULTS PANEL ── */}
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              marginTop: 20,
              padding: '20px',
              borderRadius: 16,
              background: 'rgba(79,142,247,.04)',
              border: '1.5px solid rgba(79,142,247,.18)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 16, color: '#0d0d1a' }}>
                🎉 Generated Output
              </div>
              {result.size && (
                <div style={{ fontSize: 12, fontWeight: 700, color: '#4F8EF7' }}>
                  {formatBytes(result.size)}
                </div>
              )}
            </div>

            {/* Compression size reduction meter */}
            {result.savedPct !== undefined && result.origSize && (
              <div style={{ marginBottom: 16, padding: '12px 14px', background: '#ffffff', borderRadius: 12, border: '1px solid rgba(0,0,0,.08)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                  <span style={{ color: '#666' }}>File Size Optimization</span>
                  <span style={{ color: result.savedPct > 0 ? '#16a34a' : '#4F8EF7' }}>
                    {result.savedPct > 0 ? `↓ ${result.savedPct}% Smaller (${formatBytes(result.savedBytes)} saved)` : 'Optimized'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8, fontSize: 11, color: '#888' }}>
                  <span>Original: {formatBytes(result.origSize)}</span>
                  <span>→</span>
                  <span style={{ fontWeight: 700, color: '#1a1a2e' }}>New: {formatBytes(result.size)}</span>
                </div>
                {result.reductionNotice && (
                  <div style={{ marginTop: 6, fontSize: 11, color: '#d97706', fontWeight: 500 }}>
                    ℹ️ {result.reductionNotice}
                  </div>
                )}
              </div>
            )}

            {/* Single PDF output */}
            {result.type === 'single-pdf' && (
              <div>
                <button
                  type="button"
                  className="btn btn-blue"
                  style={{ width: '100%', padding: '14px', fontSize: 14.5, fontWeight: 700 }}
                  onClick={() => downloadBlob(result.blob, result.name)}
                >
                  ⬇ Download {result.name}
                </button>
              </div>
            )}

            {/* Multi-image export (PDF to PNG / PDF to JPG) */}
            {result.type === 'multi-images' && result.items && (
              <div>
                <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-blue"
                    style={{ flex: 1, minWidth: 200, padding: '13px', fontSize: 14, fontWeight: 700 }}
                    onClick={downloadAllZip}
                  >
                    📦 Download All as ZIP ({result.items.length} Images)
                  </button>
                </div>

                {/* Individual page thumbnail downloads */}
                <div style={{ fontSize: 12, color: '#888', fontWeight: 600, marginBottom: 8 }}>
                  Individual Page Downloads:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
                  {result.items.map(item => (
                    <div
                      key={item.name}
                      style={{
                        background: '#ffffff',
                        border: '1px solid rgba(0,0,0,.08)',
                        borderRadius: 10,
                        overflow: 'hidden',
                        padding: 8,
                        textAlign: 'center',
                      }}
                    >
                      <img
                        src={item.dataUrl}
                        alt={item.name}
                        style={{ width: '100%', height: 'auto', borderRadius: 6, marginBottom: 6 }}
                      />
                      <button
                        type="button"
                        className="btn btn-sm btn-outline"
                        style={{ width: '100%', fontSize: 11, padding: '5px 8px' }}
                        onClick={() => downloadBlob(item.blob, item.name)}
                      >
                        ⬇ Page {item.pageNumber}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Multi-PDF split export */}
            {result.type === 'multi-pdfs' && result.items && (
              <div>
                <div style={{ marginBottom: 14 }}>
                  <button
                    type="button"
                    className="btn btn-blue"
                    style={{ width: '100%', padding: '13px', fontSize: 14, fontWeight: 700 }}
                    onClick={downloadAllZip}
                  >
                    📦 Download All as ZIP ({result.items.length} PDF Pages)
                  </button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {result.items.map(item => (
                    <button
                      key={item.name}
                      type="button"
                      className="btn btn-sm btn-outline"
                      style={{ fontSize: 12, padding: '7px 14px' }}
                      onClick={() => downloadBlob(item.blob, item.name)}
                    >
                      ⬇ {item.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Extracted text display */}
            {result.type === 'text' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: '#888', fontWeight: 700 }}>RECOGNIZED TEXT CONTENT</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      onClick={() => {
                        navigator.clipboard?.writeText(result.text)
                        alert('Copied recognized text to clipboard!')
                      }}
                    >
                      📋 Copy Text
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-blue"
                      onClick={() => downloadBlob(new Blob([result.text], { type: 'text/plain' }), result.name)}
                    >
                      ⬇ Download TXT
                    </button>
                  </div>
                </div>
                <textarea
                  className="inp mono"
                  readOnly
                  value={result.text}
                  style={{ minHeight: 180, fontSize: 12.5, lineHeight: 1.6, background: '#fafbff' }}
                />
              </div>
            )}

            {/* Info display */}
            {result.type === 'info' && result.meta && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                {[
                  { label: 'File Name', val: result.meta.filename },
                  { label: 'Total Pages', val: result.meta.pageCount },
                  { label: 'File Size', val: formatBytes(result.meta.fileSize) },
                  { label: 'Page 1 Dimensions', val: `${result.meta.page1Width} × ${result.meta.page1Height} pts` },
                  { label: 'Document Title', val: result.meta.title || '—' },
                  { label: 'Author', val: result.meta.author || '—' },
                  { label: 'Created On', val: result.meta.creationDate },
                  { label: 'Modified On', val: result.meta.modificationDate },
                  { label: 'Keywords', val: result.meta.keywords || '—' },
                  { label: 'Producer', val: result.meta.producer || '—' },
                ].map(item => (
                  <div key={item.label} style={{ background: '#ffffff', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(0,0,0,.06)' }}>
                    <div style={{ fontSize: 10.5, color: '#888', fontWeight: 600, textTransform: 'uppercase' }}>{item.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.val}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Compare display */}
            {result.type === 'compare' && result.compare && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                  <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#4F8EF7', textTransform: 'uppercase' }}>File A (Original)</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {result.compare.fileA.name}
                    </div>
                    <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
                      {result.compare.fileA.pageCount} pages · {formatBytes(result.compare.fileA.size)}
                    </div>
                  </div>

                  <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#059669', textTransform: 'uppercase' }}>File B (Newer)</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {result.compare.fileB.name}
                    </div>
                    <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
                      {result.compare.fileB.pageCount} pages · {formatBytes(result.compare.fileB.size)}
                    </div>
                  </div>

                  <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Diff Metrics</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>
                      Pages: {result.compare.pageCountDiff > 0 ? `+${result.compare.pageCountDiff}` : result.compare.pageCountDiff} · Size: {formatBytes(Math.abs(result.compare.sizeDiff))} {result.compare.sizeDiff > 0 ? 'larger' : 'smaller'}
                    </div>
                    <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
                      {result.compare.identicalPagesCount} matching · {result.compare.modifiedPagesCount} modified
                    </div>
                  </div>
                </div>

                {/* Metadata differences */}
                {result.compare.metaDiffs.length > 0 && (
                  <div style={{ background: '#ffffff', padding: '12px 14px', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 6 }}>
                      🏷️ Metadata Differences
                    </div>
                    {result.compare.metaDiffs.map(m => (
                      <div key={m.field} style={{ fontSize: 12, marginBottom: 4 }}>
                        <strong>{m.field}:</strong> <span style={{ color: '#ef4444' }}>{m.before}</span> → <span style={{ color: '#059669' }}>{m.after}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Page breakdown */}
                <div style={{ maxHeight: 220, overflowY: 'auto', background: '#ffffff', padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 6 }}>
                    📑 Page-by-Page Comparison
                  </div>
                  {result.compare.pageDiffs.map(p => (
                    <div key={p.page} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}>
                      <span>Page {p.page}: {p.desc}</span>
                      <span style={{
                        fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                        background: p.status === 'identical' ? '#dcfce7' : p.status === 'modified' ? '#fef3c7' : '#fee2e2',
                        color: p.status === 'identical' ? '#15803d' : p.status === 'modified' ? '#b45309' : '#b91c1c'
                      }}>
                        {p.status.toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>

                <div style={{ textAlign: 'right' }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={() => {
                      const textReport = [
                        `PDF COMPARISON REPORT`,
                        `=====================`,
                        `Document A: ${result.compare.fileA.name} (${result.compare.fileA.pageCount} pages, ${formatBytes(result.compare.fileA.size)})`,
                        `Document B: ${result.compare.fileB.name} (${result.compare.fileB.pageCount} pages, ${formatBytes(result.compare.fileB.size)})`,
                        `Page Count Diff: ${result.compare.pageCountDiff}`,
                        `Size Diff: ${formatBytes(result.compare.sizeDiff)}`,
                        ``,
                        `Metadata Differences:`,
                        ...result.compare.metaDiffs.map(m => ` - ${m.field}: "${m.before}" -> "${m.after}"`),
                        ``,
                        `Page-by-Page Results:`,
                        ...result.compare.pageDiffs.map(p => ` - [${p.status.toUpperCase()}] ${p.desc}`)
                      ].join('\n')
                      downloadBlob(new Blob([textReport], { type: 'text/plain' }), result.name)
                    }}
                  >
                    ⬇ Download Diff Summary (TXT)
                  </button>
                </div>
              </div>
            )}

            {/* Tool Chaining for PDF Output */}
            {result.blob && result.type === 'single-pdf' && (
              <ToolChainingBar
                payload={{
                  file: result.blob,
                  filename: result.name,
                  mimeType: 'application/pdf',
                  type: 'pdf',
                  sourceTool: 'pdf'
                }}
              />
            )}

            {/* Process another file action */}
            <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid rgba(79,142,247,.12)', textAlign: 'center' }}>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                style={{ fontSize: 12.5, padding: '8px 20px', borderRadius: 999 }}
                onClick={clearAllFiles}
              >
                🔄 Process Another Document
              </button>
            </div>
          </motion.div>
        )}
      </ToolCard>

      {/* ── 8. AI DOCUMENT SUMMARY & LEGAL CONTRACT AUDITOR ── */}
      {files.length > 0 && files[0].name.toLowerCase().endsWith('.pdf') && (
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <DocSummaryPanel text={extractedOcrText} />
          <ContractAuditorPanel text={extractedOcrText} />
        </div>
      )}

      {pdfHistory.length > 0 && (
        <Reveal delay={0.06}>
          <ToolCard style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Clock size={16} style={{ color: '#4F8EF7' }} />
                <span style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 14, color: '#0d0d1a' }}>
                  Recent PDF Operations <span style={{ fontSize: 12, fontWeight: 500, color: '#aaa' }}>({pdfHistory.length})</span>
                </span>
              </div>
              <motion.button whileTap={{ scale: 0.95 }}
                onClick={clearToolHistory}
                className="btn btn-outline btn-sm" style={{ color: '#EF5350', borderColor: 'rgba(239,83,80,.25)' }}>
                <Trash2 size={13} style={{ marginRight: 4 }} /> Clear
              </motion.button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto' }}>
              {pdfHistory.map((h) => (
                <div key={h.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: '#fafbff', borderRadius: 10, padding: '8px 12px', border: '1px solid rgba(0,0,0,.06)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, overflow: 'hidden', marginRight: 8 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1e293b' }}>
                      {h.label}
                    </span>
                    <span style={{ fontSize: 11, color: '#64748b' }}>
                      {h.value} • <span style={{ color: '#94a3b8' }}>{h.timestamp}</span>
                    </span>
                  </div>
                  <motion.button whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.9 }}
                    onClick={() => removeHistoryItem(h.id)}
                    title="Delete entry"
                    style={{ padding: '4px 8px', borderRadius: 7, border: '1px solid rgba(0,0,0,.08)',
                      background: '#fff', color: '#94a3b8', fontSize: 11, cursor: 'pointer' }}>
                    <Trash2 size={11} />
                  </motion.button>
                </div>
              ))}
            </div>
            <div className="info-bar blue" style={{ marginTop: 10, marginBottom: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
              <ShieldCheck size={14} style={{ flexShrink: 0 }} /> Safe PDF operation metadata is stored locally. Document contents and encryption passwords are never stored in history.
            </div>
          </ToolCard>
        </Reveal>
      )}
    </ToolShell>
  )
}
