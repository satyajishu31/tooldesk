import React, { Suspense, lazy, useEffect, useState, Component } from 'react'
import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import Navbar from './components/Navbar'
import AIHelper from './components/AIHelper'
import LocalHistoryShelf from './components/LocalHistoryShelf'
import { isDownloadAppAvailable } from './utils/apiConfig'

/* ── Error Boundary ── */
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError:false, error:null } }
  static getDerivedStateFromError(err) { return { hasError:true, error:err } }
  componentDidCatch(err, info) {
    console.error('ToolDesk error:', err, info)
    const errStr = err?.toString() || ''
    if (errStr.includes('ChunkLoadError') || errStr.includes('Failed to fetch') || errStr.includes('dynamically imported module')) {
      const reloadKey = 'tooldesk_chunk_reload_' + (window.location?.pathname || '')
      const lastReload = sessionStorage.getItem(reloadKey) || sessionStorage.getItem('tooldesk_chunk_reload_' + (window.location?.pathname || ''))
      if (!lastReload || Date.now() - Number(lastReload) > 15000) {
        sessionStorage.setItem(reloadKey, String(Date.now()))
        console.warn('ToolDesk: Chunk load failed (likely new deployment). Auto-refreshing to load new assets...')
        window.location.reload()
      }
    }
  }
  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center',
        justifyContent:'center', flexDirection:'column', gap:16, padding:'80px 24px',
        textAlign:'center', background:'#fafbff', fontFamily:'DM Sans,sans-serif' }}>
        <div style={{ width:60, height:60, borderRadius:16, overflow:'hidden',
          boxShadow:'0 8px 24px rgba(79,142,247,.22)' }}>
          <img
            src="/logo-icon.png"
            alt="ToolDesk"
            onError={e => {
              if (!e.currentTarget.dataset.fallback) {
                e.currentTarget.dataset.fallback = '1'
                e.currentTarget.src = 'logo-icon.png'
              }
            }}
            style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}
          />
        </div>
        <h2 style={{ fontFamily:'Syne,sans-serif', fontSize:28, fontWeight:800, color:'#0d0d1a', margin:0 }}>
          Something went wrong
        </h2>
        <p style={{ fontSize:14, color:'#888', maxWidth:360, lineHeight:1.7, fontWeight:300 }}>
          This tool hit an unexpected error. Try refreshing or go back to all tools.
        </p>
        {this.state.error && (
          <details style={{ fontSize:11, color:'#bbb', maxWidth:480, textAlign:'left',
            background:'#f5f5f8', padding:'12px 16px', borderRadius:10, marginTop:8 }}>
            <summary style={{ cursor:'pointer', fontWeight:600, color:'#999' }}>Error details</summary>
            <pre style={{ marginTop:8, whiteSpace:'pre-wrap', wordBreak:'break-all' }}>
              {this.state.error.toString()}
            </pre>
          </details>
        )}
        <div style={{ display:'flex', gap:10, marginTop:8 }}>
          <button onClick={() => window.location.reload()}
            style={{ padding:'10px 24px', borderRadius:999, background:'#4F8EF7',
              color:'#fff', border:'none', fontFamily:'DM Sans,sans-serif',
              fontWeight:600, fontSize:14, cursor:'pointer' }}>
            🔄 Refresh
          </button>
          <button onClick={() => { window.location.href='/' }}
            style={{ padding:'10px 24px', borderRadius:999, background:'#fff',
              color:'#444', border:'1.5px solid rgba(0,0,0,.12)',
              fontFamily:'DM Sans,sans-serif', fontWeight:600, fontSize:14, cursor:'pointer' }}>
            ← All Tools
          </button>
        </div>
      </div>
    )
  }
}

/* ── Lazy imports — 26 tools ── */
const Home              = lazy(() => import('./pages/Home'))
const PasswordGenerator = lazy(() => import('./pages/tools/PasswordGenerator'))
const WordCounter       = lazy(() => import('./pages/tools/WordCounter'))
const TextCaseConverter = lazy(() => import('./pages/tools/TextCaseConverter'))
const UnitConverter     = lazy(() => import('./pages/tools/UnitConverter'))
const CurrencyConverter = lazy(() => import('./pages/tools/CurrencyConverter'))
const GradientGenerator = lazy(() => import('./pages/tools/GradientGenerator'))
const QuoteGenerator    = lazy(() => import('./pages/tools/QuoteGenerator'))
const FaviconGenerator  = lazy(() => import('./pages/tools/FaviconGenerator'))
const YouTubeThumbnail  = lazy(() => import('./pages/tools/YouTubeThumbnail'))
const ImageResizer      = lazy(() => import('./pages/tools/ImageResizer'))
const ImageCompressor   = lazy(() => import('./pages/tools/ImageCompressor'))
const ImageConverter    = lazy(() => import('./pages/tools/ImageConverter'))
const BGRemover         = lazy(() => import('./pages/tools/BGRemover'))
const PDFToolkit        = lazy(() => import('./pages/tools/PDFToolkit'))
const AspectRatio       = lazy(() => import('./pages/tools/AspectRatioCalculator'))
const FileConverter     = lazy(() => import('./pages/tools/FileConverter'))
const PasswordVault     = lazy(() => import('./pages/tools/PasswordVault'))
const ImageToolsStudio  = lazy(() => import('./pages/tools/ImageToolsStudio'))
const RandomName        = lazy(() => import('./pages/tools/RandomNameGenerator'))
const RandomAddress     = lazy(() => import('./pages/tools/RandomAddressGenerator'))
const WordReplacer      = lazy(() => import('./pages/tools/WordReplacer'))
const BcryptTool        = lazy(() => import('./pages/tools/BcryptTool'))
const ColorPicker       = lazy(() => import('./pages/tools/ColorPicker'))
const VideoScreenshot   = lazy(() => import('./pages/tools/VideoScreenshotExtractor'))
const VideoTranscriber  = lazy(() => import('./pages/tools/VideoTranscriber'))
const WebsiteAnalyzer   = lazy(() => import('./pages/tools/WebsiteAnalyzer'))
const TextTranslator    = lazy(() => import('./pages/tools/TextTranslator'))
const QRGenerator       = lazy(() => import('./pages/tools/QRGenerator'))
const EmailBreachChecker= lazy(() => import('./pages/tools/EmailBreachChecker'))
const IPLookup          = lazy(() => import('./pages/tools/IPLookup'))
const SystemInfo        = lazy(() => import('./pages/tools/SystemInfo'))
const CountryFinder     = lazy(() => import('./pages/tools/CountryFinder'))
const DownloadAppModal  = lazy(() => import('./components/DownloadAppModal'))

/* ── Scroll to top on route change (or smooth scroll to target hash) ── */
function ScrollTop() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (hash) {
      const targetId = hash.replace('#', '')
      const el = document.getElementById(targetId)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }
      const timer = setTimeout(() => {
        const retryEl = document.getElementById(targetId)
        if (retryEl) {
          retryEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }, 150)
      return () => clearTimeout(timer)
    }
    window.scrollTo(0, 0)
  }, [pathname, hash])
  return null
}

/* ── Loading spinner ── */
function Loader() {
  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center',
      justifyContent:'center', flexDirection:'column', gap:20,
      background:'linear-gradient(160deg,#edf1ff 0%,#e8e3ff 50%,#fce4f0 100%)',
      paddingTop:64, position:'relative', overflow:'hidden' }}>
      
      {/* Ambient background aura */}
      <div style={{
        position:'absolute', width:320, height:320, borderRadius:'50%',
        background:'radial-gradient(circle, rgba(156,111,222,0.18) 0%, rgba(79,142,247,0.12) 50%, transparent 75%)',
        filter:'blur(30px)', pointerEvents:'none'
      }}/>

      {/* Advanced HD Logo Card with Rotating Gradient Glow */}
      <div style={{ position:'relative', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{
          position:'absolute', width:88, height:88, borderRadius:24,
          background:'conic-gradient(from 0deg, #4F8EF7, #9C6FDE, #F06292, #4F8EF7)',
          animation:'loaderSpin 3s linear infinite', opacity:0.65, filter:'blur(6px)'
        }}/>
        <div style={{
          position:'relative', width:74, height:74, borderRadius:20, overflow:'hidden',
          background:'#ffffff', display:'flex', alignItems:'center', justifyContent:'center',
          boxShadow:'0 16px 36px rgba(79,142,247,.28), 0 2px 8px rgba(0,0,0,.04), inset 0 1px 0 rgba(255,255,255,1)',
          animation:'loaderPulse 2.2s ease-in-out infinite',
          zIndex:1
        }}>
          <img
            src="/logo-icon.png"
            alt="ToolDesk"
            onError={e => {
              if (!e.currentTarget.dataset.fallback) {
                e.currentTarget.dataset.fallback = '1'
                e.currentTarget.src = 'logo-icon.png'
              }
            }}
            style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}
          />
        </div>
      </div>

      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, zIndex:1 }}>
        <div style={{
          fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:15,
          background:'linear-gradient(135deg, #0d0d1a 0%, #4a4a68 100%)',
          WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text',
          letterSpacing:'-0.2px'
        }}>
          Loading tool…
        </div>
        <div style={{ width:120, height:3.5, background:'rgba(79,142,247,0.14)', borderRadius:999, overflow:'hidden', position:'relative' }}>
          <div style={{
            position:'absolute', top:0, left:0, bottom:0, width:'45%',
            background:'linear-gradient(90deg, #4F8EF7, #9C6FDE)',
            borderRadius:999,
            willChange:'transform',
            animation:'loaderBar 1.4s ease-in-out infinite'
          }}/>
        </div>
      </div>

      <style>{`
        @keyframes loaderSpin { from { transform: rotate3d(0, 0, 1, 0deg); } to { transform: rotate3d(0, 0, 1, 360deg); } }
        @keyframes loaderPulse { 0%, 100% { transform: scale3d(1, 1, 1); } 50% { transform: scale3d(1.05, 1.05, 1); } }
        @keyframes loaderBar { 0% { transform: translate3d(-100%, 0, 0); } 100% { transform: translate3d(250%, 0, 0); } }
      `}</style>
    </div>
  )
}

/* ── 404 page ── */
function NotFound() {
  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center',
      justifyContent:'center', flexDirection:'column', gap:16,
      padding:'120px 24px 80px', textAlign:'center',
      background:'#fafbff', fontFamily:'DM Sans,sans-serif' }}>
      <div style={{ width:72, height:72, borderRadius:20, overflow:'hidden',
        boxShadow:'0 12px 28px rgba(79,142,247,.22)' }}>
        <img
          src="/logo-icon.png"
          alt="ToolDesk"
          onError={e => {
            if (!e.currentTarget.dataset.fallback) {
              e.currentTarget.dataset.fallback = '1'
              e.currentTarget.src = 'logo-icon.png'
            }
          }}
          style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}
        />
      </div>
      <h1 style={{ fontFamily:'Syne,sans-serif', fontSize:34, fontWeight:800,
        color:'#0d0d1a', margin:0 }}>Page Not Found</h1>
      <p style={{ fontSize:15, color:'#888', fontWeight:300,
        maxWidth:360, lineHeight:1.7, margin:0 }}>
        This page doesn't exist. Head back to explore all tools.
      </p>
      <a href="/" style={{ textDecoration:'none', marginTop:8 }}>
        <button style={{ background:'#0d0d1a', color:'#fff', border:'none',
          padding:'13px 30px', borderRadius:999,
          fontFamily:'DM Sans,sans-serif', fontWeight:600, fontSize:15, cursor:'pointer' }}>
          ← Back to ToolDesk
        </button>
      </a>
    </div>
  )
}

/* ── All routes ── */
function AnimatedRoutes() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait" initial={false}>
      <Routes location={location} key={location.pathname}>
        <Route path="/"                        element={<Home/>}/>
        <Route path="/tools"                   element={<Navigate to="/#tools" replace/>}/>
        <Route path="/tools/password"          element={<PasswordGenerator/>}/>
        <Route path="/tools/wordcount"         element={<WordCounter/>}/>
        <Route path="/tools/textcase"          element={<TextCaseConverter/>}/>
        <Route path="/tools/units"             element={<UnitConverter/>}/>
        <Route path="/tools/currency"          element={<CurrencyConverter/>}/>
        <Route path="/tools/gradient"          element={<GradientGenerator/>}/>
        <Route path="/tools/quote"             element={<QuoteGenerator/>}/>
        <Route path="/tools/favicon"           element={<FaviconGenerator/>}/>
        <Route path="/tools/thumbnail"         element={<YouTubeThumbnail/>}/>
        <Route path="/tools/imgresizer"        element={<ImageResizer/>}/>
        <Route path="/tools/imgcompress"       element={<ImageCompressor/>}/>
        <Route path="/tools/imgconvert"        element={<ImageConverter/>}/>
        <Route path="/tools/bgremove"          element={<BGRemover/>}/>
        <Route path="/tools/pdf"               element={<PDFToolkit/>}/>
        <Route path="/tools/aspectratio"       element={<AspectRatio/>}/>
        <Route path="/tools/fileconvert"       element={<FileConverter/>}/>
        <Route path="/tools/vault"             element={<PasswordVault/>}/>
        <Route path="/tools/image-tools"       element={<ImageToolsStudio/>}/>
        <Route path="/tools/imgborder"         element={<ImageToolsStudio/>}/>
        <Route path="/tools/roundcorner"       element={<ImageToolsStudio/>}/>
        <Route path="/tools/randname"          element={<RandomName/>}/>
        <Route path="/tools/randaddress"       element={<RandomAddress/>}/>
        <Route path="/tools/wordreplace"       element={<WordReplacer/>}/>
        <Route path="/tools/bcrypt"            element={<BcryptTool/>}/>
        <Route path="/tools/colorpicker"       element={<ColorPicker/>}/>
        <Route path="/tools/video-screenshot"  element={<VideoScreenshot/>}/>
        <Route path="/tools/video-transcriber" element={<VideoTranscriber/>}/>
        <Route path="/tools/website-analyzer"  element={<WebsiteAnalyzer/>}/>
        <Route path="/tools/translator"        element={<TextTranslator/>}/>
        <Route path="/tools/qrcode"            element={<QRGenerator/>}/>
        <Route path="/tools/barcode"           element={<QRGenerator/>}/>
        <Route path="/tools/qrscan"            element={<QRGenerator/>}/>
        <Route path="/tools/breach-check"      element={<EmailBreachChecker/>}/>
        <Route path="/tools/ip-lookup"         element={<IPLookup/>}/>
        <Route path="/tools/system-info"       element={<SystemInfo/>}/>
        <Route path="/tools/country-finder"    element={<CountryFinder/>}/>
        <Route path="*"                        element={<NotFound/>}/>
      </Routes>
    </AnimatePresence>
  )
}

export default function App() {
  const [downloadModalOpen, setDownloadModalOpen] = useState(false)

  useEffect(() => {
    const handleOpen = () => {
      if (isDownloadAppAvailable()) {
        setDownloadModalOpen(true)
      }
    }
    window.addEventListener('tooldesk-open-download', handleOpen)
    return () => window.removeEventListener('tooldesk-open-download', handleOpen)
  }, [])

  useEffect(() => {
    const THEMES = [
      { name: 'Classic Blue', primary: '#4F8EF7', dark: '#3272d9' },
      { name: 'Neon Purple', primary: '#9C6FDE', dark: '#7c3aed' },
      { name: 'Forest Green', primary: '#22c55e', dark: '#16a34a' },
      { name: 'Sunset Orange', primary: '#ff6b6b', dark: '#e04d4d' },
      { name: 'Teal Ocean', primary: '#06b6d4', dark: '#0891b2' },
    ]
    try {
      const saved = localStorage.getItem('tooldesk-theme')
      if (saved) {
        const match = THEMES.find(t => t.name === saved)
        if (match) {
          document.documentElement.style.setProperty('--blue', match.primary)
          document.documentElement.style.setProperty('--blue-dk', match.dark)
        }
      }
    } catch {}
  }, [])

  return (
    <BrowserRouter>
      <Navbar/>
      <ScrollTop/>
      <ErrorBoundary>
        <Suspense fallback={<Loader/>}>
          <AnimatedRoutes/>
        </Suspense>
      </ErrorBoundary>
      <LocalHistoryShelf/>
      <AIHelper/>
      {isDownloadAppAvailable() && (
        <Suspense fallback={null}>
          <DownloadAppModal
            isOpen={downloadModalOpen}
            onClose={() => setDownloadModalOpen(false)}
          />
        </Suspense>
      )}
    </BrowserRouter>
  )
}
