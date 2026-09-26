import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ToolShell, { ToolCard, Reveal } from '../../components/ToolShell'
import { useCopy } from '../../hooks'
import { TOOLS } from '../../constants'
import { safeFetchJSON, safeTimeoutSignal } from '../../utils/safeFetch'

const tool = TOOLS.find(t => t.id === 'currency')

/* ── Currency metadata ── */
const CURRENCY_INFO = {
  USD:{flag:'🇺🇸',name:'US Dollar'},        EUR:{flag:'🇪🇺',name:'Euro'},
  GBP:{flag:'🇬🇧',name:'British Pound'},    JPY:{flag:'🇯🇵',name:'Japanese Yen'},
  INR:{flag:'🇮🇳',name:'Indian Rupee'},      AUD:{flag:'🇦🇺',name:'Australian Dollar'},
  CAD:{flag:'🇨🇦',name:'Canadian Dollar'},  CHF:{flag:'🇨🇭',name:'Swiss Franc'},
  CNY:{flag:'🇨🇳',name:'Chinese Yuan'},      KRW:{flag:'🇰🇷',name:'South Korean Won'},
  SGD:{flag:'🇸🇬',name:'Singapore Dollar'}, MXN:{flag:'🇲🇽',name:'Mexican Peso'},
  BRL:{flag:'🇧🇷',name:'Brazilian Real'},    ZAR:{flag:'🇿🇦',name:'South African Rand'},
  SEK:{flag:'🇸🇪',name:'Swedish Krona'},     NOK:{flag:'🇳🇴',name:'Norwegian Krone'},
  DKK:{flag:'🇩🇰',name:'Danish Krone'},      NZD:{flag:'🇳🇿',name:'New Zealand Dollar'},
  HKD:{flag:'🇭🇰',name:'Hong Kong Dollar'}, AED:{flag:'🇦🇪',name:'UAE Dirham'},
  SAR:{flag:'🇸🇦',name:'Saudi Riyal'},       THB:{flag:'🇹🇭',name:'Thai Baht'},
  MYR:{flag:'🇲🇾',name:'Malaysian Ringgit'},IDR:{flag:'🇮🇩',name:'Indonesian Rupiah'},
  PKR:{flag:'🇵🇰',name:'Pakistani Rupee'},  PHP:{flag:'🇵🇭',name:'Philippine Peso'},
  TRY:{flag:'🇹🇷',name:'Turkish Lira'},      RUB:{flag:'🇷🇺',name:'Russian Ruble'},
  PLN:{flag:'🇵🇱',name:'Polish Złoty'},      CZK:{flag:'🇨🇿',name:'Czech Koruna'},
  HUF:{flag:'🇭🇺',name:'Hungarian Forint'},  RON:{flag:'🇷🇴',name:'Romanian Leu'},
  BGN:{flag:'🇧🇬',name:'Bulgarian Lev'},     ISK:{flag:'🇮🇸',name:'Icelandic Króna'},
}

const QUICK = ['USD','EUR','GBP','JPY','INR','AUD','CAD','CHF','SGD','AED']

/* Fallback static rates (USD base) — used when offline */
const FALLBACK_RATES = {
  USD:1,EUR:.92,GBP:.79,JPY:149.5,INR:83.2,AUD:1.54,CAD:1.36,CHF:.90,
  CNY:7.24,KRW:1330,SGD:1.34,MXN:17.2,BRL:4.97,ZAR:18.7,SEK:10.5,
  NOK:10.6,DKK:6.89,NZD:1.63,HKD:7.82,AED:3.67,SAR:3.75,THB:35.1,
  MYR:4.72,IDR:15800,PKR:278,PHP:56.5,TRY:30.8,RUB:91.5,PLN:4.02,
  CZK:22.7,HUF:357,RON:4.57,BGN:1.80,ISK:136,
}

function fmt(n, code) {
  if (!isFinite(n)||isNaN(n)) return '—'
  if (['JPY','KRW','IDR','HUF','ISK'].includes(code)) return Math.round(n).toLocaleString()
  return n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:4})
}

// Frankfurter.dev — free, no API key, ECB data updated daily
// Note: api.frankfurter.app (old domain) has been migrated to api.frankfurter.dev
async function fetchRates(base='USD') {
  const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=${base}`, {
    signal: safeTimeoutSignal(8000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await res.text()
  if (!text?.trim()) throw new Error('Empty response from rates API')
  const data = JSON.parse(text)
  // Add base itself at 1.0
  const rates = (data && typeof data.rates === 'object' && data.rates) ? data.rates : {}
  return { ...rates, [base]: 1, date: data?.date || new Date().toISOString().slice(0,10) }
}

export default function CurrencyConverter() {
  const [amount,    setAmount]    = useState('1')
  const [from,      setFrom]      = useState('USD')
  const [to,        setTo]        = useState('INR')
  const [rates,     setRates]     = useState(FALLBACK_RATES)
  const [rateDate,  setRateDate]  = useState('offline')
  const [loading,   setLoading]   = useState(false)
  const [apiStatus, setApiStatus] = useState('idle') // idle|loading|live|error
  const [history,   setHistory]   = useState([])
  const [multiShow, setMultiShow] = useState(false)
  const [copied,    copy]         = useCopy()
  const fetchedBase = useRef(null)
  const mountedRef = useRef(true)

  /* AI Global Macro & Purchasing Power Analyst */
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [aiMacro, setAiMacro] = useState(null)

  const handleAnalyzeMacro = async () => {
    setAiLoading(true)
    setAiError('')
    try {
      const currentRate = rates[to] && rates[from] ? (rates[to] / rates[from]).toFixed(4) : 1
      const data = await safeFetchJSON('/.netlify/functions/groq-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'currencyMacro',
          payload: { from, to, rate: currentRate }
        })
      })
      if (data?.error) throw new Error(data.error)
      if (!data?.macro) throw new Error('No macro analysis returned')
      setAiMacro(data.macro)
    } catch (err) {
      setAiError(err?.message || 'Failed to analyze currency pair')
    } finally {
      setAiLoading(false)
    }
  }

  useEffect(() => {
    return () => { mountedRef.current = false }
  }, [])

  /* Load live rates from Frankfurter — always base USD */
  const loadRates = useCallback(async (newBase='USD') => {
    if (fetchedBase.current === newBase && apiStatus === 'live') return
    setLoading(true); setApiStatus('loading')
    try {
      const data = await fetchRates(newBase)
      if (!mountedRef.current) return
      const { date, ...rateMap } = data
      setRates(rateMap)
      setRateDate(date)
      setApiStatus('live')
      fetchedBase.current = newBase
    } catch(e) {
      if (!mountedRef.current) return
      // Fall back gracefully — keep existing rates and mark base as attempted
      setApiStatus('error')
      fetchedBase.current = newBase
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  },[apiStatus])

  /* Fetch on mount */
  useEffect(()=>{ loadRates('USD') },[])

  /* When 'from' changes and we don't have its rates, re-fetch with that as base */
  useEffect(()=>{
    if (from !== fetchedBase.current) loadRates(from)
  },[from])

  const getRate = useCallback((f,t)=>{
    if (!rates[f]||!rates[t]||rates[f]<=0||rates[t]<=0) return null
    // If both rates are relative to same base, just divide
    return rates[t]/rates[f]
  },[rates])

  const result = useMemo(()=>{
    const parsed = parseFloat(amount)
    if (isNaN(parsed)) return '0'
    const n = Math.max(0, parsed)
    if (n === 0) return '0'
    const r = getRate(from,to)
    if (!r) return '—'
    return fmt(n*r, to)
  },[amount,from,to,getRate])

  const rate1 = useMemo(()=>{ const r=getRate(from,to); return r ? fmt(r,to) : '—' },[from,to,getRate])
  const rate2 = useMemo(()=>{ const r=getRate(to,from); return r ? fmt(r,from) : '—' },[from,to,getRate])

  const swap = useCallback(()=>{
    const cur = result.replace(/,/g,'')
    setFrom(to); setTo(from)
    if (!isNaN(parseFloat(cur))) setAmount(cur)
  },[from,to,result])

  const handleAmount = useCallback(e=>{
    const v=e.target.value
    if(v===''||/^\d*\.?\d*$/.test(v)) setAmount(v)
  },[])

  /* Debounced History — prevents flooding history on every individual keystroke */
  useEffect(() => {
    if (!parseFloat(amount) || result === '—' || result === '0') return
    const timer = setTimeout(() => {
      setHistory(h => {
        if (h[0] && h[0].from === from && h[0].to === to) {
          return [{ from, to, amount, result, ts: Date.now() }, ...h.slice(1)]
        }
        return [{ from, to, amount, result, ts: Date.now() }, ...h.slice(0, 9)]
      })
    }, 800)
    return () => clearTimeout(timer)
  }, [result, from, to, amount])

  const ALL_CURRENCIES = useMemo(()=>Object.keys({...CURRENCY_INFO,...rates}).filter(c=>rates[c]||CURRENCY_INFO[c]),[rates])

  const multiRates = useMemo(()=>{
    const parsed = parseFloat(amount)
    const n = isNaN(parsed) ? 1 : Math.max(0, parsed)
    const baseRate = rates[from]
    if (!baseRate || baseRate <= 0) return []
    return ALL_CURRENCIES.filter(c=>c!==from&&rates[c]&&rates[c]>0).map(c=>({
      code:c,
      info:CURRENCY_INFO[c]||{flag:'🌐',name:c},
      value:fmt(n*(rates[c]/baseRate),c),
    }))
  },[amount,from,rates,ALL_CURRENCIES])

  const StatusBadge = ()=>(
    <motion.div initial={{opacity:0}} animate={{opacity:1}}
      style={{display:'flex',alignItems:'center',gap:6,fontSize:11.5,fontWeight:600,
        padding:'5px 12px',borderRadius:999,
        background: apiStatus==='live'?'rgba(34,197,94,.09)':apiStatus==='error'?'rgba(245,158,11,.09)':'rgba(79,142,247,.09)',
        border:`1px solid ${apiStatus==='live'?'rgba(34,197,94,.22)':apiStatus==='error'?'rgba(245,158,11,.22)':'rgba(79,142,247,.22)'}`,
        color: apiStatus==='live'?'#166534':apiStatus==='error'?'#92400e':'#1565c0'}}>
      <motion.span
        animate={apiStatus==='live'?{scale:[1,1.4,1],opacity:[1,.5,1]}:{}}
        transition={{duration:2,repeat:Infinity}}
        style={{width:6,height:6,borderRadius:'50%',
          background:apiStatus==='live'?'#22c55e':apiStatus==='error'?'#f59e0b':'#4F8EF7',
          display:'inline-block'}}/>
      {apiStatus==='loading'?'Fetching live rates…'
        :apiStatus==='live'?`Live rates · ${rateDate}`
        :apiStatus==='error'?'Offline — using reference rates'
        :'Loading…'}
      {apiStatus==='error'&&(
        <button onClick={()=>loadRates(from)}
          style={{marginLeft:6,background:'none',border:'none',cursor:'pointer',
            fontSize:11,fontWeight:700,color:'#92400e',textDecoration:'underline'}}>
          Retry
        </button>
      )}
    </motion.div>
  )

  return (
    <ToolShell tool={tool}>
      <Reveal>
        <ToolCard>
          {/* Status */}
          <div style={{display:'flex',justifyContent:'flex-end',marginBottom:16}}>
            <StatusBadge/>
          </div>

          {/* Amount */}
          <div className="fgrp">
            <label className="lbl">Amount</label>
            <input className="inp" type="text" inputMode="decimal" value={amount}
              onChange={handleAmount} placeholder="Enter amount"
              style={{fontSize:28,fontWeight:800,fontFamily:'Syne,sans-serif',
                color:'#4F8EF7',textAlign:'center',letterSpacing:'-0.5px'}}/>
          </div>

          {/* From / Swap / To */}
          <div style={{display:'grid',gridTemplateColumns:'1fr auto 1fr',gap:8,alignItems:'end',marginBottom:18}}>
            <div>
              <label className="lbl">From</label>
              <div style={{position:'relative'}}>
                <span style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',fontSize:18,zIndex:1}}>
                  {CURRENCY_INFO[from]?.flag||'🌐'}
                </span>
                <select className="inp sel" value={from} onChange={e=>setFrom(e.target.value)}
                  style={{paddingLeft:40,fontWeight:700}}>
                  {ALL_CURRENCIES.map(c=>(
                    <option key={c} value={c}>{c} — {CURRENCY_INFO[c]?.name||c}</option>
                  ))}
                </select>
              </div>
            </div>

            <motion.button onClick={swap}
              whileHover={{rotate:180,scale:1.1}} whileTap={{scale:.9}}
              style={{padding:'11px 14px',borderRadius:12,
                border:'1.5px solid rgba(79,142,247,.25)',
                background:'rgba(79,142,247,.06)',cursor:'pointer',fontSize:20,
                alignSelf:'flex-end',transition:'background .2s'}}>
              ⇌
            </motion.button>

            <div>
              <label className="lbl">To</label>
              <div style={{position:'relative'}}>
                <span style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',fontSize:18,zIndex:1}}>
                  {CURRENCY_INFO[to]?.flag||'🌐'}
                </span>
                <select className="inp sel" value={to} onChange={e=>setTo(e.target.value)}
                  style={{paddingLeft:40,fontWeight:700}}>
                  {ALL_CURRENCIES.map(c=>(
                    <option key={c} value={c}>{c} — {CURRENCY_INFO[c]?.name||c}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Result */}
          <motion.div
            key={result}
            initial={{ opacity:0.88, y:4 }} animate={{ opacity:1, y:0 }}
            transition={{ duration:0.15, ease:'easeOut' }}
            style={{textAlign:'center',padding:'24px 16px',marginBottom:20,
              background:'linear-gradient(135deg,rgba(79,142,247,.07),rgba(156,111,222,.07))',
              borderRadius:16,border:'1.5px solid rgba(79,142,247,.15)',position:'relative'}}>
            {loading && (
              <motion.div animate={{opacity:[1,.3,1]}} transition={{duration:1.2,repeat:Infinity}}
                style={{position:'absolute',top:10,left:'50%',transform:'translateX(-50%)',
                  fontSize:10,fontWeight:700,color:'#4F8EF7',letterSpacing:'1px',
                  textTransform:'uppercase'}}>
                Updating…
              </motion.div>
            )}
            <div style={{fontSize:11,fontWeight:700,color:'#aaa',textTransform:'uppercase',
              letterSpacing:'.6px',marginBottom:8,marginTop:loading?14:0}}>
              {CURRENCY_INFO[from]?.flag} {amount} {from} =
            </div>
            <div style={{fontFamily:'Syne,sans-serif',fontSize:42,fontWeight:900,
              background:'linear-gradient(135deg,#4F8EF7,#9C6FDE)',
              WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',
              backgroundClip:'text',lineHeight:1,marginBottom:8}}>
              {result}
            </div>
            <div style={{fontSize:16,fontWeight:700,color:'#555'}}>
              {CURRENCY_INFO[to]?.flag} {to}
            </div>
            <button onClick={()=>copy(`${amount} ${from} = ${result} ${to}`)}
              style={{position:'absolute',top:12,right:12,padding:'5px 12px',
                borderRadius:999,fontSize:11,fontWeight:700,cursor:'pointer',
                border:'1px solid rgba(79,142,247,.25)',background:'rgba(79,142,247,.08)',
                color:copied?'#22c55e':'#4F8EF7',transition:'all .18s'}}>
              {copied?'✓ Copied':'📋 Copy'}
            </button>
          </motion.div>

          {/* Exchange rates */}
          <div className="tool-grid-2-compact" style={{marginBottom:18}}>
            {[{l:`1 ${from}`,v:`${rate1} ${to}`},{l:`1 ${to}`,v:`${rate2} ${from}`}].map(r=>(
              <div key={r.l} style={{padding:'10px 12px',background:'#F7F8FF',
                borderRadius:10,border:'1px solid rgba(0,0,0,.06)',textAlign:'center'}}>
                <div style={{fontSize:10.5,color:'#bbb',marginBottom:4,fontWeight:600}}>{r.l}</div>
                <div style={{fontSize:13,fontWeight:800,color:'#333'}}>{r.v}</div>
              </div>
            ))}
          </div>

          {/* Quick select */}
          <div className="fgrp">
            <label className="lbl">Quick Select</label>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {QUICK.map(c=>(
                <motion.button key={c} onClick={()=>setTo(c)}
                  whileHover={{scale:1.05}} whileTap={{scale:.95}}
                  style={{padding:'6px 13px',borderRadius:999,fontSize:12,fontWeight:700,
                    cursor:'pointer',transition:'all .15s',
                    border:`1.5px solid ${to===c?'#4F8EF7':'rgba(0,0,0,.1)'}`,
                    background:to===c?'rgba(79,142,247,.1)':'#fafafa',
                    color:to===c?'#4F8EF7':'#666'}}>
                  {CURRENCY_INFO[c]?.flag} {c}
                </motion.button>
              ))}
            </div>
          </div>

          {/* All currencies toggle */}
          <div style={{paddingTop:16,borderTop:'1px solid rgba(0,0,0,.06)'}}>
            <motion.button onClick={()=>setMultiShow(s=>!s)}
              whileHover={{borderColor:'#4F8EF7',color:'#4F8EF7'}}
              style={{width:'100%',padding:'11px',borderRadius:12,
                border:'1.5px solid rgba(0,0,0,.1)',background:'#fafafa',cursor:'pointer',
                fontSize:13,fontWeight:700,color:'#666',
                display:'flex',alignItems:'center',justifyContent:'center',gap:8,
                transition:'all .18s'}}>
              🌍 {multiShow?'Hide':'Show'} All Currency Rates ({multiRates.length})
            </motion.button>

            <AnimatePresence>
              {multiShow && (
                <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}}
                  style={{overflow:'hidden'}}>
                  <div style={{marginTop:12,maxHeight:320,overflowY:'auto',
                    border:'1px solid rgba(0,0,0,.08)',borderRadius:12,overflow:'hidden'}}>
                    {multiRates.map((r,i)=>(
                      <motion.div key={r.code} initial={{opacity:0,x:-8}} animate={{opacity:1,x:0}}
                        transition={{delay:i*.008}}
                        onClick={()=>{setTo(r.code);setMultiShow(false)}}
                        style={{display:'flex',alignItems:'center',gap:12,padding:'10px 14px',
                          background:i%2===0?'#fff':'#fafafa',
                          borderBottom:'1px solid rgba(0,0,0,.04)',cursor:'pointer',transition:'background .14s'}}
                        onMouseEnter={e=>e.currentTarget.style.background='#f0f4ff'}
                        onMouseLeave={e=>e.currentTarget.style.background=i%2===0?'#fff':'#fafafa'}>
                        <span style={{fontSize:20,flexShrink:0}}>{r.info.flag}</span>
                        <div style={{flex:1}}>
                          <div style={{fontSize:12,fontWeight:700,color:'#333'}}>{r.code}</div>
                          <div style={{fontSize:10.5,color:'#bbb'}}>{r.info.name}</div>
                        </div>
                        <div style={{fontSize:14,fontWeight:800,color:'#4F8EF7',textAlign:'right'}}>{r.value}</div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Source */}
          <div style={{marginTop:14,fontSize:11,color:'#ccc',textAlign:'center',lineHeight:1.6}}>
            {apiStatus==='live'
              ? `📡 Live rates from Frankfurter API (European Central Bank) · Updated ${rateDate}`
              : '📌 Using reference rates. Connect to internet for live rates.'}
          </div>
        </ToolCard>
      </Reveal>

      {/* Conversion history */}
      {history.length>0&&(
        <Reveal delay={.06}>
          <ToolCard style={{marginTop:18}}>
            <div style={{fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:15,
              color:'#0d0d1a',marginBottom:14}}>🕐 Recent Conversions</div>
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {history.slice(0,5).map((h,i)=>(
                <motion.div key={h.ts} initial={{opacity:0,x:-8}} animate={{opacity:1,x:0}}
                  transition={{delay:i*.04}}
                  onClick={()=>{setFrom(h.from);setTo(h.to);setAmount(h.amount)}}
                  style={{display:'flex',justifyContent:'space-between',alignItems:'center',
                    padding:'9px 13px',borderRadius:10,background:'#f8f9ff',
                    border:'1px solid rgba(0,0,0,.06)',cursor:'pointer',transition:'background .15s'}}
                  onMouseEnter={e=>e.currentTarget.style.background='#eef2ff'}
                  onMouseLeave={e=>e.currentTarget.style.background='#f8f9ff'}>
                  <span style={{fontSize:12.5,color:'#555'}}>
                    {CURRENCY_INFO[h.from]?.flag} {h.amount} {h.from}
                  </span>
                  <span style={{fontSize:11,color:'#bbb'}}>→</span>
                  <span style={{fontSize:13,fontWeight:700,color:'#4F8EF7'}}>
                    {CURRENCY_INFO[h.to]?.flag} {h.result} {h.to}
                  </span>
                </motion.div>
              ))}
            </div>
          </ToolCard>
        </Reveal>
      )}

      {/* ── AI GLOBAL MACRO & PURCHASING POWER ANALYST ── */}
      <Reveal delay={.08}>
        <ToolCard style={{ marginTop: 18 }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 14, flexWrap: 'wrap', gap: 10
          }}>
            <div>
              <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 16, color: '#0d0d1a', display: 'flex', alignItems: 'center', gap: 7 }}>
                <span>🤖</span> AI Global Macro & Purchasing Power Analyst
              </div>
              <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
                Real-world cost of living comparison, key inflation drivers, and foreign transaction guidance for {from} ⇄ {to}.
              </div>
            </div>
            <button
              type="button"
              onClick={handleAnalyzeMacro}
              disabled={aiLoading}
              className="btn btn-sm btn-primary"
              style={{ fontSize: 12, padding: '7px 16px', borderRadius: 999, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {aiLoading ? (
                <>
                  <span className="spinner-border spinner-border-sm" />
                  <span>Analyzing FX Drivers...</span>
                </>
              ) : (
                <>
                  <span>✨</span>
                  <span>{aiMacro ? 'Re-analyze Pair' : `Analyze ${from} ⇄ ${to}`}</span>
                </>
              )}
            </button>
          </div>

          {aiError && (
            <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, color: '#ef4444', fontSize: 12, marginBottom: 12 }}>
              ⚠️ {aiError}
            </div>
          )}

          {aiMacro ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              {/* Macro Summary */}
              {aiMacro.macroSummary && (
                <div style={{ padding: '12px 14px', borderRadius: 12, background: 'linear-gradient(135deg, rgba(79,142,247,0.06), rgba(156,111,222,0.06))', border: '1px solid rgba(79,142,247,0.18)', fontSize: 13, color: '#1e293b', lineHeight: 1.6 }}>
                  <strong>📊 Macro Overview:</strong> {aiMacro.macroSummary}
                </div>
              )}

              {/* Purchasing Power Parity */}
              {aiMacro.purchasingPower && (
                <div style={{ padding: '12px 14px', borderRadius: 10, background: '#f8faff', border: '1px solid rgba(0,0,0,0.07)', fontSize: 12.5, color: '#334155', lineHeight: 1.6 }}>
                  <strong>🛍️ Purchasing Power Parity (PPP):</strong> {aiMacro.purchasingPower}
                </div>
              )}

              {/* Drivers & Practical Advice */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
                {Array.isArray(aiMacro.keyDrivers) && aiMacro.keyDrivers.length > 0 && (
                  <div style={{ padding: '12px 14px', borderRadius: 10, background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#0d0d1a', marginBottom: 6 }}>🏛️ Key Economic Drivers</div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#475569', lineHeight: 1.6 }}>
                      {aiMacro.keyDrivers.map((driver, idx) => (
                        <li key={idx}>{driver}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {aiMacro.practicalAdvice && (
                  <div style={{ padding: '12px 14px', borderRadius: 10, background: '#fffbeb', border: '1px solid rgba(245,158,11,0.25)', fontSize: 12, color: '#78350f' }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>💡 Practical Travel & Spending Tip</div>
                    {aiMacro.practicalAdvice}
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <div style={{
              textAlign: 'center',
              padding: '18px 14px',
              borderRadius: 12,
              background: '#fafbff',
              border: '1.5px dashed rgba(79,142,247,0.2)'
            }}>
              <div style={{ fontSize: 24, marginBottom: 4 }}>🌍</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0d0d1a' }}>Deep Macro & Purchasing Power Intelligence</div>
              <div style={{ fontSize: 11.5, color: '#64748b', maxWidth: 400, margin: '3px auto 10px' }}>
                Analyze the underlying economic drivers between {from} and {to}, relative cost of living differences, and travel advice.
              </div>
              <button
                type="button"
                onClick={handleAnalyzeMacro}
                disabled={aiLoading}
                className="btn btn-sm btn-primary"
                style={{ fontSize: 12, padding: '6px 16px', borderRadius: 999 }}
              >
                ✨ Analyze {from} ⇄ {to} Economics
              </button>
            </div>
          )}
        </ToolCard>
      </Reveal>
    </ToolShell>
  )
}
