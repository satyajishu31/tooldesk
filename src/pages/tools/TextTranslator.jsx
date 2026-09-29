import React, { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ToolShell, { ToolCard, Reveal } from '../../components/ToolShell'
import { useCopy } from '../../hooks'
import { safeFetchJSON } from '../../utils/safeFetch'
import { TOOLS } from '../../constants'
import { useToolHistory } from '../../hooks/useToolHistory'
import { Clock, Trash2 } from 'lucide-react'

const tool = TOOLS.find(t => t.id === 'translator')

const LANGUAGES = [
  { code:'auto',  name:'Auto Detect',     flag:'🌐' },
  { code:'AR',    name:'Arabic',           flag:'🇸🇦' },
  { code:'BG',    name:'Bulgarian',        flag:'🇧🇬' },
  { code:'CS',    name:'Czech',            flag:'🇨🇿' },
  { code:'DA',    name:'Danish',           flag:'🇩🇰' },
  { code:'DE',    name:'German',           flag:'🇩🇪' },
  { code:'EL',    name:'Greek',            flag:'🇬🇷' },
  { code:'EN',    name:'English',          flag:'🇬🇧' },
  { code:'ES',    name:'Spanish',          flag:'🇪🇸' },
  { code:'ET',    name:'Estonian',         flag:'🇪🇪' },
  { code:'FI',    name:'Finnish',          flag:'🇫🇮' },
  { code:'FR',    name:'French',           flag:'🇫🇷' },
  { code:'HU',    name:'Hungarian',        flag:'🇭🇺' },
  { code:'ID',    name:'Indonesian',       flag:'🇮🇩' },
  { code:'IT',    name:'Italian',          flag:'🇮🇹' },
  { code:'JA',    name:'Japanese',         flag:'🇯🇵' },
  { code:'KO',    name:'Korean',           flag:'🇰🇷' },
  { code:'LT',    name:'Lithuanian',       flag:'🇱🇹' },
  { code:'LV',    name:'Latvian',          flag:'🇱🇻' },
  { code:'NB',    name:'Norwegian',        flag:'🇳🇴' },
  { code:'NL',    name:'Dutch',            flag:'🇳🇱' },
  { code:'PL',    name:'Polish',           flag:'🇵🇱' },
  { code:'PT',    name:'Portuguese (BR)',  flag:'🇧🇷' },
  { code:'PT-PT', name:'Portuguese (EU)',  flag:'🇵🇹' },
  { code:'RO',    name:'Romanian',         flag:'🇷🇴' },
  { code:'RU',    name:'Russian',          flag:'🇷🇺' },
  { code:'SK',    name:'Slovak',           flag:'🇸🇰' },
  { code:'SL',    name:'Slovenian',        flag:'🇸🇮' },
  { code:'SV',    name:'Swedish',          flag:'🇸🇪' },
  { code:'TR',    name:'Turkish',          flag:'🇹🇷' },
  { code:'UK',    name:'Ukrainian',        flag:'🇺🇦' },
  { code:'ZH',    name:'Chinese',          flag:'🇨🇳' },
]

const TARGET_LANGS = LANGUAGES.filter(l => l.code !== 'auto')

const QUICK_TARGETS = [
  { code:'ES', name:'Spanish',  flag:'🇪🇸' },
  { code:'FR', name:'French',   flag:'🇫🇷' },
  { code:'DE', name:'German',   flag:'🇩🇪' },
  { code:'JA', name:'Japanese', flag:'🇯🇵' },
  { code:'ZH', name:'Chinese',  flag:'🇨🇳' },
  { code:'AR', name:'Arabic',   flag:'🇸🇦' },
  { code:'RU', name:'Russian',  flag:'🇷🇺' },
  { code:'PT', name:'Portuguese',flag:'🇧🇷'},
  { code:'IT', name:'Italian',  flag:'🇮🇹' },
  { code:'KO', name:'Korean',   flag:'🇰🇷' },
]

const CHAR_LIMIT = 5000

export default function TextTranslator() {
  const [srcText,   setSrc]      = useState('')
  const [result,    setResult]   = useState('')
  const [srcLang,   setSrcLang]  = useState('auto')
  const [tgtLang,   setTgtLang]  = useState('ES')
  const [loading,   setLoading]  = useState(false)
  const [error,     setError]    = useState('')
  const [detected,  setDetected] = useState('')
  const { history: persistedHistory, add: addPersistedTranslation, remove: removeHistoryEntry, clear: clearToolHistory } = useToolHistory('Text Translator', 10)
  const [copied,    copy]        = useCopy()
  const [liveMode,  setLiveMode] = useState(true)
  const [isFallback, setIsFallback] = useState(false)
  
  // Advanced Cultural Localization & Native Tone Calibrator State
  const [toneMode, setToneMode] = useState('everyday') // 'everyday' | 'casual' | 'business' | 'formal'
  const [calibrating, setCalibrating] = useState(false)
  const [calibrationData, setCalibrationData] = useState(null)
  const [calibrationError, setCalibrationError] = useState('')
  const [copiedCalibrated, copyCalibrated] = useCopy()

  const debRef = useRef(null)
  const lastSentRef = useRef('')
  const reqIdRef = useRef(0)

  useEffect(() => {
    return () => {
      reqIdRef.current++
      clearTimeout(debRef.current)
    }
  }, [])

  const srcLangInfo = LANGUAGES.find(l => l.code === srcLang) || LANGUAGES[0]
  const tgtLangInfo = TARGET_LANGS.find(l => l.code === tgtLang) || TARGET_LANGS[6]

  const translate = useCallback(async (text = srcText, target = tgtLang, source = srcLang) => {
    if (!text.trim()) return
    const currentReqId = ++reqIdRef.current
    setLoading(true); setError(''); setResult(''); setIsFallback(false)
    try {
      const data = await safeFetchJSON('/.netlify/functions/deepl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(),
          target_lang: target,
          source_lang: source === 'auto' ? undefined : source,
        }),
      })
      // Discard response if a newer translation request was dispatched
      if (currentReqId !== reqIdRef.current) return

      if (data.error) throw new Error(data.error)
      const trans = typeof data.translation === 'string' ? data.translation : ''
      setResult(trans)
      setIsFallback(!!data.fallback)
      if (data.detected_source) setDetected(data.detected_source)
      if (trans) {
        addPersistedTranslation({
          tool: 'Text Translator',
          label: `${source} → ${target}: ${text.trim().slice(0, 40)}`,
          value: `${source} → ${target}`,
          action: 'Translated',
          category: 'Text',
          metadata: {
            src: text.trim().slice(0, 60),
            result: trans.slice(0, 60),
            srcLang: data.detected_source || source,
            tgtLang: target
          }
        })
      }
    } catch(e) {
      if (currentReqId === reqIdRef.current) {
        setError(e.message)
        setIsFallback(false)
      }
    } finally {
      if (currentReqId === reqIdRef.current) {
        setLoading(false)
      }
    }
  }, [srcText, tgtLang, srcLang, addPersistedTranslation])

  const swap = () => {
    if (!result) return
    const fallbackTarget = detected ? detected.toUpperCase() : 'EN'
    const newTarget = srcLang === 'auto' ? fallbackTarget : srcLang
    if (newTarget === 'AUTO') return
    setSrc(result)
    setResult(srcText)
    setSrcLang(tgtLang)
    setTgtLang(newTarget)
  }

  /* ── Cultural Localization & Native Tone Calibrator ── */
  const calibrateTone = useCallback(async () => {
    if (!result.trim()) return
    setCalibrating(true)
    setCalibrationError('')
    try {
      const data = await safeFetchJSON('/.netlify/functions/groq-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'calibrateTranslationTone',
          payload: {
            text: result.trim(),
            sourceText: srcText.trim(),
            tone: toneMode,
            targetLang: tgtLangInfo.name,
            sourceLang: srcLangInfo.name
          }
        })
      }, 18000)

      if (data?.error) throw new Error(data.error)
      if (data?.calibratedText) {
        setCalibrationData(data)
      } else {
        throw new Error('No calibration data returned.')
      }
    } catch (err) {
      setCalibrationError(err.message || 'Linguistic tone service currently unavailable.')
    } finally {
      setCalibrating(false)
    }
  }, [result, srcText, toneMode, tgtLangInfo, srcLangInfo])

  /* ── Live translation — debounced, fires automatically as user types ── */
  useEffect(() => {
    if (!liveMode) return
    clearTimeout(debRef.current)
    const trimmed = srcText.trim()

    if (!trimmed) { setResult(''); setError(''); return }
    if (trimmed === lastSentRef.current) return

    debRef.current = setTimeout(() => {
      lastSentRef.current = trimmed
      translate(trimmed, tgtLang, srcLang)
    }, 600)

    return () => clearTimeout(debRef.current)
  }, [srcText, tgtLang, srcLang, liveMode, translate])

  const charPct = Math.min(100, Math.round(srcText.length / CHAR_LIMIT * 100))
  const charColor = charPct > 90 ? '#ef4444' : charPct > 70 ? '#f97316' : '#22c55e'

  return (
    <ToolShell tool={tool}>
      {/* ── Language selector ── */}
      <Reveal>
        <ToolCard style={{ marginBottom:16 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
            {/* Source */}
            <div style={{ flex:1, minWidth:130 }}>
              <label className="lbl">From</label>
              <select className="inp sel" value={srcLang} onChange={e => setSrcLang(e.target.value)}>
                {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.flag} {l.name}</option>)}
              </select>
            </div>

            {/* Swap */}
            <motion.button
              whileHover={{ scale:1.15, rotate:180 }}
              whileTap={{ scale:.9 }}
              transition={{ type:'spring', stiffness:500, damping:24 }}
              onClick={swap}
              disabled={srcLang === 'auto' || !result}
              style={{ marginTop:22, width:42, height:42, borderRadius:'50%', border:'1.5px solid rgba(0,0,0,.1)',
                background:'#fff', fontSize:18, cursor: srcLang === 'auto' ? 'not-allowed' : 'pointer',
                display:'flex', alignItems:'center', justifyContent:'center',
                opacity: srcLang === 'auto' ? .4 : 1, flexShrink:0 }}>
              ⇄
            </motion.button>

            {/* Target */}
            <div style={{ flex:1, minWidth:130 }}>
              <label className="lbl">To</label>
              <select className="inp sel" value={tgtLang} onChange={e => setTgtLang(e.target.value)}>
                {TARGET_LANGS.map(l => <option key={l.code} value={l.code}>{l.flag} {l.name}</option>)}
              </select>
            </div>
          </div>

          {/* Live mode toggle */}
          <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:10 }}>
            <div onClick={() => setLiveMode(l => !l)}
              style={{ width:38, height:20, borderRadius:10, position:'relative', cursor:'pointer',
                background: liveMode ? '#4F8EF7' : '#ddd', transition:'background .2s', flexShrink:0 }}>
              <div style={{ position:'absolute', top:2, width:16, height:16, borderRadius:'50%',
                background:'#fff', boxShadow:'0 1px 3px rgba(0,0,0,.2)',
                left: liveMode ? 18 : 2, transition:'left .2s' }}/>
            </div>
            <span style={{ fontSize:12.5, color: liveMode ? '#4F8EF7' : '#aaa', fontWeight:600 }}>
              ⚡ Live translation {liveMode ? '— ON (translates as you type)' : '— OFF (manual only)'}
            </span>
          </div>

          {/* Quick target pills */}
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:14 }}>
            {QUICK_TARGETS.map(l => (
              <motion.button key={l.code}
                whileHover={{ y:-2 }} whileTap={{ scale:.95 }}
                transition={{ type:'spring', stiffness:500, damping:24 }}
                onClick={() => setTgtLang(l.code)}
                style={{ padding:'5px 12px', borderRadius:999, fontSize:11.5, fontWeight:700,
                  border: `1.5px solid ${tgtLang === l.code ? '#4F8EF7' : 'rgba(0,0,0,.1)'}`,
                  background: tgtLang === l.code ? 'rgba(79,142,247,.09)' : '#fafafa',
                  color: tgtLang === l.code ? '#4F8EF7' : '#666', cursor:'pointer' }}>
                {l.flag} {l.name}
              </motion.button>
            ))}
          </div>
        </ToolCard>
      </Reveal>

      {/* ── Input + Output ── */}
      <Reveal delay={.04}>
        <ToolCard style={{ marginBottom:16 }}>
          <div className="tool-grid-2">
            {/* Input */}
            <div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                <label className="lbl" style={{ margin:0 }}>
                  {srcLangInfo.flag} {srcLangInfo.name}
                </label>
                <span style={{ fontSize:11, fontWeight:700, color:charColor }}>
                  {srcText.length}/{CHAR_LIMIT}
                </span>
              </div>
              <textarea
                className="inp tall"
                placeholder="Type or paste text to translate…"
                value={srcText}
                onChange={e => {
                  const v = e.target.value.slice(0, CHAR_LIMIT)
                  setSrc(v)
                  setResult('')
                  setDetected('')
                  if (!v.trim()) lastSentRef.current = ''
                }}
                style={{ minHeight:180, resize:'vertical', fontSize:14, lineHeight:1.75 }}/>

              {/* Char bar */}
              <div style={{ height:3, background:'#f0f0f5', borderRadius:2, marginTop:6, overflow:'hidden' }}>
                <motion.div animate={{ width:`${charPct}%`, background:charColor }}
                  transition={{ duration:.2 }}
                  style={{ height:'100%', borderRadius:2 }}/>
              </div>

              {detected && (
                <div style={{ fontSize:11, color:'#4F8EF7', marginTop:6, fontWeight:600 }}>
                  🌐 Detected: {LANGUAGES.find(l=>l.code.toUpperCase()===String(detected).toUpperCase())?.name || detected}
                </div>
              )}
            </div>

            {/* Output */}
            <div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                <label className="lbl" style={{ margin:0 }}>
                  {tgtLangInfo.flag} {tgtLangInfo.name}
                </label>
                {result && (
                  <motion.button whileHover={{ scale:1.05 }} whileTap={{ scale:.95 }}
                    onClick={() => copy(result)}
                    style={{ fontSize:11, padding:'3px 10px', borderRadius:8,
                      border:`1.5px solid ${copied?'#22c55e':'rgba(0,0,0,.1)'}`,
                      background:copied?'#22c55e':'#fff', color:copied?'#fff':'#666',
                      cursor:'pointer', fontWeight:700 }}>
                    {copied ? '✓' : '📋'}
                  </motion.button>
                )}
              </div>
              <div style={{ position:'relative', minHeight:180 }}>
                <AnimatePresence mode="wait">
                  {loading ? (
                    <motion.div key="load" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
                      style={{ minHeight:180, background:'#f8f9ff', borderRadius:14,
                        border:'1.5px solid rgba(79,142,247,.15)',
                        display:'flex', alignItems:'center', justifyContent:'center',
                        flexDirection:'column', gap:10 }}>
                      <motion.div animate={{ rotate:360 }} transition={{ duration:.9, repeat:Infinity, ease:'linear' }}
                        style={{ width:28, height:28, borderRadius:'50%',
                          border:'3px solid rgba(79,142,247,.15)',
                          borderTop:'3px solid #4F8EF7' }}/>
                      <span style={{ fontSize:12.5, color:'#aaa', fontWeight:600 }}>Translating…</span>
                    </motion.div>
                  ) : result ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <motion.div key="result" initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }}
                        style={{ minHeight:180, background:'rgba(79,142,247,.03)',
                          border:'1.5px solid rgba(79,142,247,.15)', borderRadius:14,
                          padding:'13px 15px', fontSize:14, lineHeight:1.75,
                          color:'#1a1a2e', whiteSpace:'pre-wrap', wordBreak:'break-word' }}>
                        {result}
                      </motion.div>
                      {isFallback && (
                        <div style={{ fontSize:11, color:'#f59e0b', fontWeight:600, display:'flex', gap:5, alignItems:'center' }}>
                          ⚠️ MyMemory fallback active (no DEEPL_API_KEY set)
                        </div>
                      )}
                    </div>
                  ) : (
                    <motion.div key="empty" initial={{ opacity:0 }} animate={{ opacity:1 }}
                      style={{ minHeight:180, background:'#f8f9ff', borderRadius:14,
                        border:'1.5px dashed rgba(0,0,0,.09)',
                        display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <span style={{ fontSize:13, color:'#ccc' }}>Translation appears here</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div initial={{ opacity:0, y:-4 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
                style={{ marginTop:12, padding:'10px 14px', background:'rgba(239,68,68,.06)',
                  border:'1px solid rgba(239,68,68,.2)', borderRadius:10,
                  fontSize:13, color:'#b91c1c' }}>
                ⚠️ {error}
                {error.includes('DEEPL_API_KEY') && (
                  <a href="https://www.deepl.com/pro-api" target="_blank" rel="noopener noreferrer"
                    style={{ color:'#4F8EF7', marginLeft:8, fontWeight:700 }}>
                    Get free API key →
                  </a>
                )}
              </motion.div>
            )}
          </AnimatePresence>

                    {/* Translate button — only shown when live mode is OFF */}
          {!liveMode && (
            <div style={{ display:'flex', gap:9, marginTop:14 }}>
              <motion.button
                whileHover={{ scale:1.02, y:-2 }} whileTap={{ scale:.97 }}
                transition={{ type:'spring', stiffness:500, damping:24 }}
                onClick={() => translate()}
                disabled={!srcText.trim() || loading}
                style={{ flex:1, padding:'13px', borderRadius:13, border:'none',
                  background: srcText.trim() && !loading
                    ? 'linear-gradient(135deg,#0d0d1a,#1e1040)' : '#e5e7ef',
                  color:'#fff', fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:15,
                  cursor: srcText.trim()&&!loading ? 'pointer' : 'not-allowed',
                  boxShadow: srcText.trim() ? '0 6px 20px rgba(13,13,26,.25)' : 'none' }}>
                🌐 Translate
              </motion.button>
              <motion.button whileHover={{ scale:1.04 }} whileTap={{ scale:.96 }}
                onClick={() => { setSrc(''); setResult(''); setDetected(''); setError(''); lastSentRef.current = '' }}
                style={{ padding:'13px 18px', borderRadius:13, border:'1.5px solid rgba(0,0,0,.1)',
                  background:'#fff', color:'#555', fontWeight:700, fontSize:13, cursor:'pointer' }}>
                ✕ Clear
              </motion.button>
            </div>
          )}
          {/* ── ADVANCED ENHANCEMENT: CULTURAL LOCALIZATION & NATIVE TONE CALIBRATOR ── */}
          {result && (
            <div style={{
              marginTop: 20,
              paddingTop: 18,
              borderTop: '1px solid rgba(0,0,0,0.08)'
            }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 20 }}>🎭</span>
                  <div>
                    <h4 style={{ fontFamily: 'Syne, sans-serif', fontSize: 15, fontWeight: 800, margin: 0, color: '#111' }}>
                      Cultural Localization & Native Tone Calibrator
                    </h4>
                    <span style={{ fontSize: 11.5, color: '#666' }}>
                      Calibrate translated phrasing for native register, idiomatic style, and false-friend awareness
                    </span>
                  </div>
                </div>

                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 6, background: 'rgba(156,111,222,0.12)', color: '#9C6FDE' }}>
                  NATIVE CALIBRATOR
                </span>
              </div>

              {/* Tone Selection Tags */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                {[
                  { id: 'everyday', label: '🍃 Everyday / Natural', desc: 'Standard natural conversational speech' },
                  { id: 'casual', label: '💬 Casual & Social', desc: 'Informal texting, peers, and friendly dialogue' },
                  { id: 'business', label: '💼 Business Professional', desc: 'Emails, client proposals, and corporate clarity' },
                  { id: 'formal', label: '🎩 Formal & Academic', desc: 'Official correspondence, legal and ceremonial register' }
                ].map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => { setToneMode(t.id); setCalibrationData(null) }}
                    style={{
                      padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                      border: `1.5px solid ${toneMode === t.id ? '#9C6FDE' : 'rgba(0,0,0,0.08)'}`,
                      background: toneMode === t.id ? 'rgba(156,111,222,0.1)' : '#fafafa',
                      color: toneMode === t.id ? '#7c3aed' : '#555',
                      cursor: 'pointer'
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Calibrate Trigger */}
              <button
                type="button"
                onClick={calibrateTone}
                disabled={calibrating || !result.trim()}
                style={{
                  width: '100%', padding: '11px', borderRadius: 12, border: 'none',
                  background: 'linear-gradient(135deg, #7c3aed, #4F8EF7)', color: '#fff',
                  fontWeight: 700, fontSize: 13, cursor: calibrating ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  marginBottom: 12
                }}
              >
                {calibrating ? (
                  <>
                    <span className="spinner-border spinner-border-sm" />
                    <span>Calibrating Native Register & Idioms...</span>
                  </>
                ) : (
                  <>
                    <span>✨</span>
                    <span>Calibrate {tgtLangInfo.name} into {toneMode.toUpperCase()} Tone</span>
                  </>
                )}
              </button>

              {/* Calibration Error */}
              {calibrationError && (
                <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: 8, color: '#ef4444', fontSize: 12, marginBottom: 12 }}>
                  ⚠️ {calibrationError}
                </div>
              )}

              {/* Calibration Results Panel */}
              {calibrationData && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ background: '#fff', borderRadius: 12, padding: 14, border: '1px solid rgba(156,111,222,0.25)', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase' }}>
                        Native Calibrated Wording ({toneMode.toUpperCase()})
                      </span>
                      <button
                        type="button"
                        onClick={() => copyCalibrated(calibrationData.calibratedText)}
                        style={{
                          fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 6,
                          border: '1px solid rgba(0,0,0,0.1)', background: copiedCalibrated ? '#22c55e' : '#fafafa',
                          color: copiedCalibrated ? '#fff' : '#444', cursor: 'pointer'
                        }}
                      >
                        {copiedCalibrated ? '✓ Copied' : '📋 Copy'}
                      </button>
                    </div>
                    <div style={{ fontSize: 14, color: '#111', lineHeight: 1.6, fontWeight: 500 }}>
                      {calibrationData.calibratedText}
                    </div>
                    {calibrationData.toneNuance && (
                      <div style={{ marginTop: 8, fontSize: 11.5, color: '#666', borderTop: '1px dashed rgba(0,0,0,0.08)', paddingTop: 6 }}>
                        💡 <strong>Register Nuance:</strong> {calibrationData.toneNuance}
                      </div>
                    )}
                  </div>

                  {calibrationData.idiomaticAlternative && (
                    <div style={{ background: '#fafbff', borderRadius: 10, padding: '10px 14px', border: '1px solid rgba(79,142,247,0.2)', fontSize: 12 }}>
                      <span style={{ fontWeight: 700, color: '#2563eb' }}>🗣️ Idiomatic Native Alternative: </span>
                      <span style={{ color: '#222' }}>{calibrationData.idiomaticAlternative}</span>
                    </div>
                  )}

                  {calibrationData.falseFriendWarning && (
                    <div style={{ background: 'rgba(245,158,11,0.06)', borderRadius: 10, padding: '10px 14px', border: '1px solid rgba(245,158,11,0.25)', fontSize: 12 }}>
                      <span style={{ fontWeight: 700, color: '#d97706' }}>⚠️ False-Friend / Nuance Caution: </span>
                      <span style={{ color: '#444' }}>{calibrationData.falseFriendWarning}</span>
                    </div>
                  )}
                </motion.div>
              )}

              <div style={{ marginTop: 10, fontSize: 11, color: '#888', lineHeight: 1.4 }}>
                <strong>Defensive Language Notice:</strong> Cultural calibrations provide stylistic guidance and contextual phrasing heuristics. They represent customary communicative practices, not absolute rules for every speaker of the target language.
              </div>
            </div>
          )}
        </ToolCard>
      </Reveal>

      {/* ── History ── */}
      <AnimatePresence>
        {persistedHistory.length > 0 && (
          <Reveal delay={.06}>
            <ToolCard style={{ marginBottom:16 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:14, color:'#0d0d1a', display:'flex', alignItems:'center', gap:6 }}>
                  <Clock size={16} color="#4F8EF7" /> Translation History ({persistedHistory.length})
                </div>
                <button onClick={clearToolHistory}
                  style={{ fontSize:11.5, padding:'4px 12px', borderRadius:8,
                    border:'1.5px solid rgba(239,68,68,.2)', background:'rgba(239,68,68,.05)',
                    color:'#ef4444', cursor:'pointer', fontWeight:700, display:'flex', alignItems:'center', gap:4 }}>
                  <Trash2 size={12} /> Clear
                </button>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {persistedHistory.map((h, i) => {
                  const meta = h.metadata || {}
                  return (
                    <motion.div key={h.id || i} initial={{ opacity:0, x:-8 }} animate={{ opacity:1, x:0 }}
                      transition={{ delay:i*.03 }}
                      onClick={() => {
                        if (meta.src) setSrc(meta.src.replace('…',''))
                        if (meta.tgtLang) setTgtLang(meta.tgtLang)
                      }}
                      style={{ display:'grid', gridTemplateColumns:'1fr 1fr auto auto', gap:10, alignItems:'center',
                        padding:'9px 13px', background:'#fafbff', borderRadius:11,
                        border:'1px solid rgba(0,0,0,.06)', cursor:'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background='#f0f4ff'}
                      onMouseLeave={e => e.currentTarget.style.background='#fafbff'}>
                      <div style={{ fontSize:12, color:'#444', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {meta.src || h.label}
                      </div>
                      <div style={{ fontSize:12, color:'#4F8EF7', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {meta.result || h.value}
                      </div>
                      <div style={{ fontSize:10, color:'#888', whiteSpace:'nowrap' }}>{h.time}</div>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeHistoryEntry(h.id) }}
                        style={{ background:'none', border:'none', color:'#999', cursor:'pointer', padding:2 }}
                        title="Remove"
                      >
                        <Trash2 size={12} />
                      </button>
                    </motion.div>
                  )
                })}
              </div>
            </ToolCard>
          </Reveal>
        )}
      </AnimatePresence>

      {/* ── Info ── */}
      <Reveal delay={.08}>
        <ToolCard>
          <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:13, color:'#0d0d1a', marginBottom:12 }}>
            ℹ️ About This Tool
          </div>
          <div className="tool-grid-2-compact">
            {[
              { icon:'🌍', title:'33 Languages', desc:'All DeepL-supported language pairs with auto-detection' },
              { icon:'✨', title:'Best Quality', desc:'DeepL consistently beats Google Translate in accuracy benchmarks' },
              { icon:'🔒', title:'Private', desc:'Text is sent to DeepL API only — never stored anywhere' },
              { icon:'⚡', title:'500K free chars', desc:'DeepL free tier: 500,000 characters per month at no cost' },
            ].map(s => (
              <div key={s.title} style={{ padding:'11px 13px', background:'#f8f9ff',
                borderRadius:11, border:'1px solid rgba(0,0,0,.06)' }}>
                <div style={{ fontSize:16, marginBottom:5 }}>{s.icon}</div>
                <div style={{ fontSize:12, fontWeight:700, color:'#333', marginBottom:3 }}>{s.title}</div>
                <div style={{ fontSize:11, color:'#888', lineHeight:1.5 }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </ToolCard>
      </Reveal>
    </ToolShell>
  )
}
