import React, { useState, useCallback, useRef, useEffect, lazy, Suspense } from 'react'
import { useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import ToolShell, { ToolCard, Reveal } from '../../components/ToolShell'
import { useCopy } from '../../hooks'
import { TOOLS } from '../../constants'
import { generateQRDataURL, generateQRSVG } from '../../utils/qrCode'
import { saveFileWithFallback } from '../../utils/fileSaver'
import { safeFetchJSON } from '../../utils/safeFetch'

const QRScanner = lazy(() => import('./QRScanner'))
const BarcodeTool = lazy(() => import('./BarcodeTool'))

const tool = TOOLS.find(t => t.id === 'qrcode')

const STUDIO_TABS = [
  { id: 'generator', label: '🔲 QR Code Generator', desc: 'Create URLs, text, Wi-Fi, vCard & UPI codes' },
  { id: 'scanner',   label: '📷 QR Code Scanner',   desc: 'Scan QR via camera, upload, or paste' },
  { id: 'barcode',   label: '🏷️ Barcode Studio',    desc: 'Generate & scan multi-format barcodes' },
]

const QR_MODES = [
  { id:'url',    label:'URL / Link',  icon:'🔗', placeholder:'https://tooldesk.app' },
  { id:'text',   label:'Plain Text',  icon:'📝', placeholder:'Your message here…' },
  { id:'email',  label:'Email',       icon:'📧', placeholder:'hello@example.com' },
  { id:'phone',  label:'Phone',       icon:'📞', placeholder:'+1 555 123 4567' },
  { id:'sms',    label:'SMS',         icon:'💬', placeholder:'+1 555 123 4567' },
  { id:'wifi',   label:'WiFi',        icon:'📶', placeholder:'Network name (SSID)' },
  { id:'vcard',  label:'vCard',       icon:'👤', placeholder:'Full Name' },
  { id:'upi',    label:'UPI Pay',     icon:'💳', placeholder:'username@upi' },
  { id:'custom', label:'Custom/Raw',  icon:'⚙️', placeholder:'Raw payload data...' },
]

const SIZES  = [150, 250, 350, 500, 750, 1000]
const MARGINS = [0, 1, 2, 4]
const COLORS = ['#000000','#1a1a2e','#4F8EF7','#9C6FDE','#22c55e','#ef4444','#f97316']
const BG_COLORS = ['#ffffff','#f8f9ff','#0d0d1a','#fff3e0','#e8f5e9']
const ERROR_LEVELS = ['L','M','Q','H']

export default function QRGenerator() {
  const location = useLocation()
  const [studioTab, setStudioTab] = useState('generator')
  const [mode,    setMode]  = useState('url')
  const [value,   setValue] = useState('https://tooldesk.app')
  const [size,    setSize]  = useState(350)
  const [margin,  setMargin] = useState(2)
  const [color,   setColor] = useState('#000000')
  const [bgColor, setBg]    = useState('#ffffff')
  const [errLvl,  setErr]   = useState('M')
  const [qrUrl,   setQrUrl] = useState('')
  const [loading, setLoad]  = useState(false)
  const [error,   setError] = useState('')
  const [history, setHist]  = useState([])
  const [copied,  copy]     = useCopy()

  /* WiFi & vCard extra fields */
  const [wifiPass, setWifiPass] = useState('')
  const [wifiType, setWifiType] = useState('WPA')
  const [wifiHidden, setWifiHidden] = useState(false)
  const [vcName,   setVcName]   = useState('')
  const [vcPhone,  setVcPhone]  = useState('')
  const [vcEmail,  setVcEmail]  = useState('')
  const [vcOrg,    setVcOrg]    = useState('')

  /* SMS & UPI extra fields */
  const [smsPhone, setSmsPhone] = useState('')
  const [smsBody,  setSmsBody]  = useState('')
  const [upiId,    setUpiId]    = useState('')
  const [upiName,  setUpiName]  = useState('')
  const [upiAmount,setUpiAmount]= useState('')
  const [upiNote,  setUpiNote]  = useState('')

  /* AI Magic Paste / Smart Intent extraction */
  const [magicOpen, setMagicOpen] = useState(false)
  const [magicText, setMagicText] = useState('')
  const [magicLoading, setMagicLoading] = useState(false)
  const [magicError, setMagicError] = useState('')
  const [magicSuccess, setMagicSuccess] = useState('')

  // Client-side instant heuristic fallback when offline or API is unavailable
  const parseLocalIntent = (raw) => {
    const text = (raw || '').trim()
    if (!text) return null

    // Wi-Fi detection
    const wifiMatch = text.match(/WIFI:.*?S:([^;]+)/i) || text.match(/(?:SSID|Network)[:\s]+(["']?)([^"'\n\r,;]+)\1/i)
    if (wifiMatch) {
      const ssid = wifiMatch[2] || wifiMatch[1] || ''
      const passMatch = text.match(/P:([^;]+)/i) || text.match(/(?:Password|Key|Pass)[:\s]+(["']?)([^"'\n\r,;]+)\1/i)
      const typeMatch = text.match(/T:([^;]+)/i) || text.match(/(?:Security|Type)[:\s]+(["']?)(WPA2?|WEP|nopass)\1/i)
      return {
        mode: 'wifi',
        wifi: {
          ssid: ssid.trim(),
          password: passMatch ? (passMatch[2] || passMatch[1] || '').trim() : '',
          type: typeMatch ? (typeMatch[2] || typeMatch[1] || 'WPA').toUpperCase() : 'WPA'
        }
      }
    }

    // vCard / Contact Card
    if (/BEGIN:VCARD/i.test(text) || /(?:Phone|Email|Org|Mobile)[:\s]/i.test(text)) {
      const nameMatch = text.match(/FN:([^\n\r]+)/i) || text.match(/(?:Name|Contact)[:\s]+([^\n\r,]+)/i) || text.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/)
      const phoneMatch = text.match(/TEL.*?:([^\n\r]+)/i) || text.match(/(?:Phone|Mobile|Tel)[:\s]+([+0-9\s\-()]{7,})/i)
      const emailMatch = text.match(/EMAIL.*?:([^\n\r]+)/i) || text.match(/([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z]{2,6})/)
      const orgMatch = text.match(/ORG:([^\n\r]+)/i) || text.match(/(?:Org|Company|Organization)[:\s]+([^\n\r,]+)/i)
      if (nameMatch || phoneMatch || emailMatch) {
        return {
          mode: 'vcard',
          vcard: {
            name: nameMatch ? (nameMatch[1] || '').trim() : '',
            phone: phoneMatch ? (phoneMatch[1] || '').trim() : '',
            email: emailMatch ? (emailMatch[1] || '').trim() : '',
            org: orgMatch ? (orgMatch[1] || '').trim() : ''
          }
        }
      }
    }

    // UPI
    if (/upi:\/\/pay/i.test(text) || /VPA[:\s]+[a-zA-Z0-9.\-_]+@[a-zA-Z0-9]+/i.test(text) || /@(?:okaxis|okhdfcbank|hdfcbank|oksbi|sbi|icici|paytm|ybl|apl|upi|axl|ibl)\b/i.test(text)) {
      const vpaMatch = text.match(/pa=([^&]+)/i) || text.match(/(?:VPA|UPI ID|ID)[:\s]+([a-zA-Z0-9.\-_]+@[a-zA-Z0-9]+)/i) || text.match(/([a-zA-Z0-9.\-_]+@[a-zA-Z0-9]+)/)
      const amMatch = text.match(/am=([^&]+)/i) || text.match(/(?:Amount|INR|Rs\.?)[:\s]+([0-9.]+)/i)
      const pnMatch = text.match(/pn=([^&]+)/i) || text.match(/(?:Pay\s+([A-Z][a-z]+))/i) || text.match(/(?:Name|Payee)[:\s]+([^\n\r,;]+)/i)
      const tnMatch = text.match(/tn=([^&]+)/i) || text.match(/(?:Note|Remarks?)[:\s]+([^\n\r,;]+)/i)
      if (vpaMatch) {
        return {
          mode: 'upi',
          upi: {
            id: decodeURIComponent(vpaMatch[1] || '').trim(),
            amount: amMatch ? decodeURIComponent(amMatch[1] || '').trim() : '',
            name: pnMatch ? decodeURIComponent(pnMatch[1] || '').trim() : '',
            note: tnMatch ? decodeURIComponent(tnMatch[1] || '').trim() : ''
          }
        }
      }
    }

    // URL
    if (/^https?:\/\//i.test(text) || /^www\.[a-z0-9]/i.test(text)) {
      return { mode: 'url', url: text.startsWith('http') ? text : `https://${text}` }
    }

    // Email
    if (/^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/.test(text)) {
      return { mode: 'email', email: text }
    }

    // Phone
    if (/^\+?[0-9\s\-()]{7,20}$/.test(text)) {
      return { mode: 'phone', phone: text }
    }

    return { mode: 'text', text }
  }

  const applyParsedIntent = (res) => {
    const validModes = new Set(['url', 'text', 'email', 'phone', 'sms', 'wifi', 'vcard', 'upi'])
    const rawMode = String(res.mode || '').toLowerCase().trim()
    const detectedMode = validModes.has(rawMode) ? rawMode : (rawMode === 'contact' ? 'vcard' : rawMode === 'link' ? 'url' : 'text')
    setMode(detectedMode)

    if (detectedMode === 'vcard' && res.vcard) {
      setVcName(res.vcard.name || '')
      setVcPhone(res.vcard.phone || '')
      setVcEmail(res.vcard.email || '')
      setVcOrg(res.vcard.org || '')
      setValue('')
    } else if (detectedMode === 'wifi' && res.wifi) {
      setValue(res.wifi.ssid || '')
      setWifiPass(res.wifi.password || '')
      setWifiType(res.wifi.type || 'WPA')
    } else if (detectedMode === 'upi' && res.upi) {
      setUpiId(res.upi.id || '')
      setUpiName(res.upi.name || '')
      setUpiAmount(res.upi.amount || '')
      setUpiNote(res.upi.note || '')
      setValue('')
    } else if (detectedMode === 'sms' && res.sms) {
      setSmsPhone(res.sms.phone || '')
      setSmsBody(res.sms.body || '')
      setValue('')
    } else if (detectedMode === 'email') {
      setValue(res.email || res.text || '')
    } else if (detectedMode === 'phone') {
      setValue(res.phone || res.text || '')
    } else if (detectedMode === 'url') {
      setValue(res.url || res.text || '')
    } else {
      setValue(res.text || magicText.trim())
    }

    setMagicSuccess(`Identified ${detectedMode.toUpperCase()} format! Applied to QR fields.`)
    setTimeout(() => {
      setMagicOpen(false)
      setMagicSuccess('')
    }, 900)
  }

  const handleMagicIntent = async () => {
    if (!magicText.trim()) return
    setMagicLoading(true)
    setMagicError('')
    setMagicSuccess('')

    try {
      const data = await safeFetchJSON('/.netlify/functions/groq-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'magicQRIntent',
          payload: { text: magicText.trim() }
        })
      })

      if (data?.result) {
        applyParsedIntent(data.result)
        return
      }
      throw new Error(data?.error || 'AI parsing unavailable')
    } catch {
      // Fallback seamlessly to local intelligent heuristic parser
      const localResult = parseLocalIntent(magicText.trim())
      if (localResult) {
        applyParsedIntent(localResult)
      } else {
        setMagicError('Unable to extract intent. Please enter your data directly.')
      }
    } finally {
      setMagicLoading(false)
    }
  }

  const modeInfo = QR_MODES.find(m => m.id === mode)

  const buildQRValue = useCallback(() => {
    switch(mode) {
      case 'url':   return value.trim() ? (value.trim().startsWith('http') ? value.trim() : `https://${value.trim()}`) : ''
      case 'text':  return value
      case 'email': return value.trim() ? `mailto:${value.trim()}` : ''
      case 'phone': return value.trim() ? `tel:${value.replace(/\s/g,'')}` : ''
      case 'sms': {
        const p = smsPhone.trim().replace(/\s/g,'')
        return p ? `smsto:${p}:${smsBody}` : ''
      }
      case 'wifi': {
        const escWifi = s => (typeof s === 'string' ? s.replace(/([\\;,:"])/g, '\\$1') : '')
        return value.trim() ? `WIFI:T:${wifiType};S:${escWifi(value)};P:${escWifi(wifiPass)};H:${wifiHidden?'true':'false'};` : ''
      }
      case 'vcard': {
        const cleanVc = s => String(s || '').replace(/[\r\n]/g, ' ').trim()
        if (!vcName.trim()) return ''
        return `BEGIN:VCARD\nVERSION:3.0\nFN:${cleanVc(vcName)}\nTEL:${cleanVc(vcPhone)}\nEMAIL:${cleanVc(vcEmail)}\nORG:${cleanVc(vcOrg)}\nEND:VCARD`
      }
      case 'upi': {
        const cleanPa = upiId.trim()
        if (!cleanPa) return ''
        let uri = `upi://pay?pa=${encodeURIComponent(cleanPa)}`
        if (upiName.trim()) uri += `&pn=${encodeURIComponent(upiName.trim())}`
        if (upiAmount.trim()) uri += `&am=${encodeURIComponent(upiAmount.trim())}`
        uri += `&cu=INR`
        if (upiNote.trim()) uri += `&tn=${encodeURIComponent(upiNote.trim())}`
        return uri
      }
      case 'custom': return value
      default: return value
    }
  }, [mode, value, wifiPass, wifiType, wifiHidden, vcName, vcPhone, vcEmail, vcOrg, smsPhone, smsBody, upiId, upiName, upiAmount, upiNote])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const tabParam = params.get('tab') || location.hash.replace('#', '')
    if (tabParam) {
      const lower = tabParam.toLowerCase()
      if (['scanner', 'scan', 'qrscan'].includes(lower)) setStudioTab('scanner')
      else if (['barcode', 'barcodes'].includes(lower)) setStudioTab('barcode')
      else if (['generator', 'gen', 'qrcode'].includes(lower)) setStudioTab('generator')
    } else if (location.pathname.includes('barcode')) {
      setStudioTab('barcode')
    } else if (location.pathname.includes('qrscan') || location.pathname.includes('scanner')) {
      setStudioTab('scanner')
    }
  }, [location.search, location.hash, location.pathname])

  const generate = useCallback((addToHistory = true) => {
    const qrValue = buildQRValue()
    if (!qrValue || !qrValue.trim()) {
      setQrUrl('')
      setError('')
      return
    }

    try {
      const dataUrl = generateQRDataURL(qrValue.trim(), {
        size: Number(size) || 350,
        margin: Number(margin) || 2,
        color: color || '#000000',
        bgColor: bgColor || '#ffffff',
        ecc: errLvl || 'M',
      })
      if (!dataUrl) {
        setError('Failed to generate QR code. The input may exceed the capacity of this QR code version.')
        return
      }
      setError('')
      setQrUrl(dataUrl)
      if (addToHistory) {
        setHist(h => [{
          url: dataUrl, label: qrValue.slice(0, 40) + (qrValue.length > 40 ? '…' : ''),
          mode, size, ts: new Date().toLocaleTimeString()
        }, ...h.slice(0, 7)])
      }
    } catch (err) {
      setError(err?.message || 'Input exceeds QR Code capacity.')
    }
  }, [buildQRValue, color, bgColor, size, margin, errLvl, mode])

  /* Auto-generate on any input or parameter change with smooth debounce */
  useEffect(() => {
    const timer = setTimeout(() => {
      const val = buildQRValue()
      if (val && val.trim()) {
        generate(false)
      } else {
        setQrUrl('')
        setError('')
      }
    }, 120)
    return () => clearTimeout(timer)
  }, [buildQRValue, color, bgColor, size, margin, errLvl, generate])

  const downloadPng = async () => {
    if (!qrUrl) return
    const filename = `qrcode-${mode || 'code'}.png`
    saveFileWithFallback(qrUrl, filename, 'image/png')
  }

  const downloadSvg = async () => {
    const qrValue = buildQRValue()
    if (!qrValue.trim()) return
    const svgStr = generateQRSVG(qrValue.trim(), {
      size: Number(size) || 350,
      margin: Number(margin) || 2,
      color: color || '#000000',
      bgColor: bgColor || '#ffffff',
      ecc: errLvl || 'M',
    })
    if (!svgStr) return
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
    const filename = `qrcode-${mode || 'code'}.svg`
    saveFileWithFallback(blob, filename, 'image/svg+xml')
  }

  return (
    <ToolShell tool={tool}>
      {/* Studio Top Navigation Tabs */}
      <Reveal>
        <div className="qr-studio-tabs" style={{
          display: 'flex',
          background: 'rgba(0,0,0,.045)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          borderRadius: 14,
          padding: 4,
          gap: 4,
          marginBottom: 20,
          border: '1px solid rgba(0,0,0,.04)',
          flexWrap: 'wrap'
        }}>
          {STUDIO_TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              className="qr-studio-tab-item"
              onClick={() => setStudioTab(tab.id)}
              style={{
                flex: '1 1 100px',
                minWidth: 88,
                boxSizing: 'border-box',
                padding: '10px 8px',
                borderRadius: 10,
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'DM Sans,sans-serif',
                fontSize: 13,
                fontWeight: 700,
                background: studioTab === tab.id ? '#ffffff' : 'transparent',
                color: studioTab === tab.id ? '#0d0d1a' : '#64748b',
                boxShadow: studioTab === tab.id ? '0 2px 8px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.03)' : 'none',
                transition: 'all .18s cubic-bezier(.22,1,.36,1)',
                textAlign: 'center',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </Reveal>

      {studioTab === 'generator' && (
        <>
          {/* AI Magic Paste Callout */}
          <Reveal>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'linear-gradient(135deg, rgba(79,142,247,.08), rgba(156,111,222,.08))',
              border: '1px solid rgba(79,142,247,.2)',
              borderRadius: 12,
              padding: '10px 14px',
              marginBottom: 14,
              flexWrap: 'wrap',
              gap: 10
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20 }}>🪄</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0d0d1a' }}>AI Smart Intent & Magic Paste</div>
                  <div style={{ fontSize: 11.5, color: '#64748b' }}>Paste signatures, business cards, Wi-Fi stickers, or payment slips to auto-extract fields</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setMagicOpen(true); setMagicError(''); setMagicSuccess('') }}
                className="btn btn-sm btn-primary"
                style={{ fontSize: 12, padding: '7px 14px', borderRadius: 9, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                ✨ Magic Paste
              </button>
            </div>
          </Reveal>

          {/* Mode tabs */}
          <Reveal>
        <div style={{ display:'flex', background:'rgba(0,0,0,.045)', borderRadius:14, padding:4, gap:3, marginBottom:16, flexWrap:'wrap', border:'1px solid rgba(0,0,0,.04)' }}>
          {QR_MODES.map(m => (
            <button key={m.id} onClick={() => { setMode(m.id); setValue(''); setQrUrl('') }}
              style={{ flex:1, minWidth:80, padding:'9px 8px', borderRadius:10, border:'none',
                cursor:'pointer', fontSize:12, fontWeight:700,
                background: mode === m.id ? '#ffffff' : 'transparent',
                color: mode === m.id ? '#0d0d1a' : '#64748b',
                boxShadow: mode === m.id ? '0 2px 8px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.03), inset 0 1px 0 rgba(255,255,255,1)' : 'none',
                transition:'all .18s cubic-bezier(.22,1,.36,1)' }}>
              {m.icon} {m.label}
            </button>
          ))}
        </div>
      </Reveal>

      <div className="qr-grid-layout" style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:16, alignItems:'start' }}>
        {/* Left: inputs + customization */}
        <div>
          <Reveal delay={.04}>
            <ToolCard style={{ marginBottom:14 }}>
              {/* Main input */}
              {mode === 'vcard' ? (
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {[
                    { l:'Full Name *', v:vcName,  set:setVcName,  ph:'Jane Doe' },
                    { l:'Phone',       v:vcPhone, set:setVcPhone, ph:'+1 555 123 4567' },
                    { l:'Email',       v:vcEmail, set:setVcEmail, ph:'jane@example.com' },
                    { l:'Organization',v:vcOrg,   set:setVcOrg,   ph:'Company Inc.' },
                  ].map(f => (
                    <div key={f.l}>
                      <label className="lbl">{f.l}</label>
                      <input className="inp" value={f.v} onChange={e => f.set(e.target.value)} placeholder={f.ph}/>
                    </div>
                  ))}
                </div>
              ) : mode === 'wifi' ? (
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  <div>
                    <label className="lbl">Network Name (SSID) *</label>
                    <input className="inp" value={value} onChange={e=>setValue(e.target.value)} placeholder="My WiFi Network"/>
                  </div>
                  <div>
                    <label className="lbl">Password</label>
                    <input className="inp" type="password" value={wifiPass} onChange={e=>setWifiPass(e.target.value)} placeholder="WiFi password"/>
                  </div>
                  <div style={{ display:'flex', gap:10 }}>
                    <div style={{ flex:1 }}>
                      <label className="lbl">Security</label>
                      <select className="inp sel" value={wifiType} onChange={e=>setWifiType(e.target.value)}>
                        {['WPA','WEP','nopass'].map(t=><option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div style={{ flex:1, display:'flex', alignItems:'center', gap:8, paddingTop:22 }}>
                      <input type="checkbox" checked={wifiHidden} onChange={e=>setWifiHidden(e.target.checked)} id="wh"/>
                      <label htmlFor="wh" style={{ fontSize:13, color:'#555' }}>Hidden network</label>
                    </div>
                  </div>
                </div>
              ) : mode === 'sms' ? (
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  <div>
                    <label className="lbl">Recipient Phone Number *</label>
                    <input className="inp" value={smsPhone} onChange={e=>setSmsPhone(e.target.value)} placeholder="+1 555 123 4567"/>
                  </div>
                  <div>
                    <label className="lbl">Prefilled SMS Message</label>
                    <textarea className="inp tall" value={smsBody} onChange={e=>setSmsBody(e.target.value)} placeholder="Hello from ToolDesk..." style={{ minHeight:70 }}/>
                  </div>
                </div>
              ) : mode === 'upi' ? (
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  <div>
                    <label className="lbl">UPI ID (VPA) *</label>
                    <input className="inp" value={upiId} onChange={e=>setUpiId(e.target.value)} placeholder="e.g. merchant@okaxis, user@upi"/>
                  </div>
                  <div className="tool-grid-2-compact">
                    <div>
                      <label className="lbl">Payee Name</label>
                      <input className="inp" value={upiName} onChange={e=>setUpiName(e.target.value)} placeholder="Store or Person Name"/>
                    </div>
                    <div>
                      <label className="lbl">Amount (INR, Optional)</label>
                      <input className="inp" type="number" step="0.01" value={upiAmount} onChange={e=>setUpiAmount(e.target.value)} placeholder="500.00"/>
                    </div>
                  </div>
                  <div>
                    <label className="lbl">Transaction Note</label>
                    <input className="inp" value={upiNote} onChange={e=>setUpiNote(e.target.value)} placeholder="Payment for services"/>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="lbl">{modeInfo?.label}</label>
                  <textarea className="inp tall"
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    placeholder={modeInfo?.placeholder}
                    style={{ minHeight:90, resize:'vertical' }}/>
                </div>
              )}

              <motion.button
                whileHover={{ scale:1.02, y:-2 }} whileTap={{ scale:.97 }}
                transition={{ type:'spring', stiffness:500, damping:24 }}
                onClick={() => generate(true)}
                style={{ width:'100%', marginTop:14, padding:'13px', borderRadius:13, border:'none',
                  background:'linear-gradient(135deg,#0d0d1a,#1e1040)',
                  color:'#fff', fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:15,
                  cursor:'pointer', boxShadow:'0 6px 20px rgba(13,13,26,.25)' }}>
                ✨ Generate QR Code
              </motion.button>
            </ToolCard>
          </Reveal>

          {/* Customization */}
          <Reveal delay={.06}>
            <ToolCard style={{ marginBottom:14 }}>
              <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:13, color:'#0d0d1a', marginBottom:14 }}>
                🎨 Customize
              </div>

              {/* Size */}
              <div className="fgrp">
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:7 }}>
                  <label className="lbl" style={{ margin:0 }}>Size Preset</label>
                  <span style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:15, color:'#4F8EF7' }}>{size}px</span>
                </div>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:8 }}>
                  {SIZES.map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSize(s)}
                      className={`btn btn-sm ${size === s ? 'btn-primary' : 'btn-outline'}`}
                      style={{ padding:'4px 10px', fontSize:11 }}
                    >
                      {s}px
                    </button>
                  ))}
                </div>
              </div>

              {/* Margin */}
              <div className="fgrp">
                <label className="lbl">Quiet Zone (Margin)</label>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {MARGINS.map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMargin(m)}
                      className={`btn btn-sm ${margin === m ? 'btn-primary' : 'btn-outline'}`}
                      style={{ padding:'4px 12px', fontSize:11 }}
                    >
                      {m} module{m === 1 ? '' : 's'}
                    </button>
                  ))}
                </div>
              </div>

              {/* QR color */}
              <div className="fgrp">
                <label className="lbl">QR Color</label>
                <div style={{ display:'flex', gap:7, alignItems:'center', flexWrap:'wrap' }}>
                  <input type="color" value={color} onChange={e=>setColor(e.target.value)}
                    style={{ width:36, height:32, borderRadius:8, border:'1.5px solid rgba(0,0,0,.1)', cursor:'pointer', padding:2 }}/>
                  {COLORS.map(c => (
                    <div key={c} onClick={() => setColor(c)}
                      style={{ width:24, height:24, borderRadius:'50%', background:c, cursor:'pointer',
                        border: color===c ? '2.5px solid #4F8EF7' : '1.5px solid rgba(0,0,0,.15)',
                        transform: color===c ? 'scale(1.15)' : 'none', transition:'all .15s' }}/>
                  ))}
                </div>
              </div>

              {/* BG color */}
              <div className="fgrp">
                <label className="lbl">Background Color</label>
                <div style={{ display:'flex', gap:7, alignItems:'center', flexWrap:'wrap' }}>
                  <input type="color" value={bgColor} onChange={e=>setBg(e.target.value)}
                    style={{ width:36, height:32, borderRadius:8, border:'1.5px solid rgba(0,0,0,.1)', cursor:'pointer', padding:2 }}/>
                  {BG_COLORS.map(c => (
                    <div key={c} onClick={() => setBg(c)}
                      style={{ width:24, height:24, borderRadius:'50%', background:c, cursor:'pointer',
                        border: bgColor===c ? '2.5px solid #4F8EF7' : '1.5px solid rgba(0,0,0,.15)',
                        transform: bgColor===c ? 'scale(1.15)' : 'none', transition:'all .15s' }}/>
                  ))}
                </div>
              </div>

              {/* Error correction */}
              <div className="fgrp" style={{ marginBottom:0 }}>
                <label className="lbl">Error Correction Level</label>
                <div style={{ display:'flex', gap:6 }}>
                  {ERROR_LEVELS.map(l => (
                    <button key={l} onClick={() => setErr(l)}
                      style={{ flex:1, padding:'7px', borderRadius:9, cursor:'pointer',
                        border:`1.5px solid ${errLvl===l?'#4F8EF7':'rgba(0,0,0,.1)'}`,
                        background:errLvl===l?'rgba(79,142,247,.09)':'#fafafa',
                        color:errLvl===l?'#4F8EF7':'#666', fontSize:12, fontWeight:700 }}>
                      {l}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize:11.5, color:'#64748b', marginTop:5 }}>
                  L=7% · M=15% · Q=25% · H=30% recovery. Higher = more reliable but denser QR.
                </div>
              </div>
            </ToolCard>
          </Reveal>
        </div>

        {/* Right: preview */}
        <Reveal delay={.03}>
          <div className="qr-preview-col" style={{ position:'sticky', top:80, width:220 }}>
            <ToolCard>
              <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:13,
                color:'#0d0d1a', marginBottom:12, textAlign:'center' }}>
                Preview
              </div>
              {error && (
                <div style={{ padding:'8px 10px', background:'rgba(239,68,68,.1)', border:'1.5px solid rgba(239,68,68,.3)', borderRadius:10, color:'#ef4444', fontSize:11, marginBottom:10, textAlign:'center', lineHeight:1.4 }}>
                  ⚠️ {error}
                </div>
              )}
              <div style={{ borderRadius:14, overflow:'hidden', marginBottom:14, minHeight:200,
                background:'#f5f5f5', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <AnimatePresence mode="wait">
                  {qrUrl ? (
                    <motion.img key={qrUrl}
                      initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }}
                      exit={{ opacity:0 }}
                      src={qrUrl} alt="QR Code"
                      style={{ width:'100%', display:'block', imageRendering:'pixelated' }}/>
                  ) : (
                    <motion.div key="empty" initial={{ opacity:0 }} animate={{ opacity:1 }}
                      style={{ textAlign:'center', padding:20, color:'#888' }}>
                      <div style={{ fontSize:40, marginBottom:8 }}>⬛</div>
                      <div style={{ fontSize:12.5 }}>QR appears here</div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {qrUrl && (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  <motion.button whileHover={{ scale:1.02 }} whileTap={{ scale:.96 }}
                    onClick={downloadPng}
                    className="btn btn-primary"
                    style={{ width:'100%', padding:'10px', fontSize:13, fontWeight:700 }}>
                    ⬇ Download PNG
                  </motion.button>
                  <motion.button whileHover={{ scale:1.02 }} whileTap={{ scale:.96 }}
                    onClick={downloadSvg}
                    className="btn btn-outline"
                    style={{ width:'100%', padding:'9px', fontSize:12, fontWeight:700 }}>
                    📐 Download SVG (Vector)
                  </motion.button>
                  <motion.button whileHover={{ scale:1.02 }} whileTap={{ scale:.96 }}
                    onClick={() => copy(buildQRValue())}
                    className="btn btn-outline"
                    style={{ width:'100%', padding:'8px', fontSize:12 }}>
                    {copied ? '✓ Copied Payload' : '📋 Copy Payload'}
                  </motion.button>
                </div>
              )}
            </ToolCard>
          </div>
        </Reveal>
      </div>

      <style>{`
        @media (max-width: 640px) {
          .qr-grid-layout {
            grid-template-columns: 1fr !important;
          }
          .qr-preview-col {
            position: static !important;
            width: 100% !important;
            max-width: 260px !important;
            margin: 0 auto 16px !important;
          }
        }
      `}</style>

      {/* History */}
      <AnimatePresence>
        {history.length > 0 && (
          <Reveal delay={.08}>
            <ToolCard style={{ marginTop:14 }}>
              <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:13, color:'#0d0d1a', marginBottom:10 }}>
                🕐 Recent QR Codes
              </div>
              <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                {history.map((h, i) => (
                  <motion.div key={i} initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }}
                    transition={{ delay:i*.03 }}
                    onClick={() => setQrUrl(h.url)}
                    style={{ cursor:'pointer', textAlign:'center' }}>
                    <img src={h.url} alt="" style={{ width:60, height:60, borderRadius:8,
                      border:'1.5px solid rgba(0,0,0,.08)', display:'block' }}/>
                    <div style={{ fontSize:9, color:'#aaa', marginTop:3, maxWidth:60,
                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {h.label}
                    </div>
                  </motion.div>
                ))}
              </div>
            </ToolCard>
          </Reveal>
        )}
      </AnimatePresence>
        </>
      )}

      {studioTab === 'scanner' && (
        <Reveal>
          <Suspense fallback={<div style={{ padding: 48, textAlign: 'center', color: '#64748b', fontSize: 14, fontFamily: 'DM Sans,sans-serif' }}>Loading Scanner…</div>}>
            <QRScanner isEmbedded={true} />
          </Suspense>
        </Reveal>
      )}

      {studioTab === 'barcode' && (
        <Reveal>
          <Suspense fallback={<div style={{ padding: 48, textAlign: 'center', color: '#64748b', fontSize: 14, fontFamily: 'DM Sans,sans-serif' }}>Loading Barcode Studio…</div>}>
            <BarcodeTool isEmbedded={true} />
          </Suspense>
        </Reveal>
      )}

      {/* AI Magic Intent Modal */}
      <AnimatePresence>
        {magicOpen && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(13,13,26,0.65)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 16
          }} onClick={() => setMagicOpen(false)}>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: 540,
                background: '#ffffff',
                borderRadius: 18,
                padding: 24,
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)',
                border: '1px solid rgba(0,0,0,0.08)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <div>
                  <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 18, fontWeight: 700, color: '#0d0d1a', display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span>🪄</span> AI Magic QR Intent Parser
                  </div>
                  <div style={{ fontSize: 13, color: '#475569', marginTop: 4, lineHeight: 1.5 }}>
                    Paste unstructured text to automatically route and populate vCard, Wi-Fi, UPI, SMS, URL, or Text.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMagicOpen(false)}
                  style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#64748b', padding: '0 4px' }}
                >
                  ✕
                </button>
              </div>

              {/* Sample quick buttons */}
              <div style={{ display: 'flex', gap: 7, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: '#475569' }}>Try samples:</span>
                <button
                  type="button"
                  onClick={() => setMagicText("Alex Chen, Product Lead at Nexus Systems. Phone: +1 415 555 9812. Email: alex.chen@nexussys.io. Org: Nexus Systems")}
                  className="btn btn-sm btn-outline"
                  style={{ fontSize: 12.5, padding: '5px 12px', minHeight: 32, borderRadius: 8 }}
                >
                  👤 Contact Card
                </button>
                <button
                  type="button"
                  onClick={() => setMagicText("Office Guest Wi-Fi: SSID 'Nexus_Guest_5G' Password 'FastWiFi#2026' Security WPA2")}
                  className="btn btn-sm btn-outline"
                  style={{ fontSize: 12.5, padding: '5px 12px', minHeight: 32, borderRadius: 8 }}
                >
                  📶 Wi-Fi Slip
                </button>
                <button
                  type="button"
                  onClick={() => setMagicText("Pay Alex for Q3 Freelance Design sprint: VPA alex@hdfcbank, Amount INR 4500, Note: Design Milestone")}
                  className="btn btn-sm btn-outline"
                  style={{ fontSize: 12.5, padding: '5px 12px', minHeight: 32, borderRadius: 8 }}
                >
                  💳 UPI Invoice
                </button>
              </div>

              <textarea
                className="inp"
                value={magicText}
                onChange={e => setMagicText(e.target.value)}
                placeholder="Paste an email signature, business card, Wi-Fi slip, payment note, or link here..."
                style={{ width: '100%', minHeight: 120, resize: 'vertical', fontSize: 14, lineHeight: 1.6, marginBottom: 14 }}
              />

              {magicError && (
                <div style={{ padding: '9px 13px', background: 'rgba(239,68,68,0.1)', border: '1.5px solid rgba(239,68,68,0.3)', borderRadius: 10, color: '#dc2626', fontSize: 13, marginBottom: 12 }}>
                  ⚠️ {magicError}
                </div>
              )}
              {magicSuccess && (
                <div style={{ padding: '9px 13px', background: 'rgba(34,197,94,0.1)', border: '1.5px solid rgba(34,197,94,0.3)', borderRadius: 10, color: '#16a34a', fontSize: 13, marginBottom: 12 }}>
                  ✓ {magicSuccess}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setMagicOpen(false)}
                  className="btn btn-outline"
                  style={{ padding: '9px 18px', fontSize: 13.5 }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleMagicIntent}
                  disabled={magicLoading || !magicText.trim()}
                  className="btn btn-primary"
                  style={{ padding: '9px 20px', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  {magicLoading ? (
                    <>
                      <span className="spinner-border spinner-border-sm" />
                      <span>Extracting with AI...</span>
                    </>
                  ) : (
                    <>
                      <span>✨</span>
                      <span>Auto-Extract & Fill</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </ToolShell>
  )
}

