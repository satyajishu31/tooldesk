import React, { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ToolShell, { ToolCard, Reveal } from '../../components/ToolShell'
import { useCopy, useSlider } from '../../hooks'
import { TOOLS } from '../../constants'
import bcrypt from 'bcryptjs'
import { addToHistory } from '../../utils/history'
import { useToolHistory } from '../../hooks/useToolHistory'
import { hashSingleWorker, compareWorker, hashBatchWorker } from '../../utils/bcryptWorkerClient'
import { saveFileWithFallback } from '../../utils/fileSaver'
import { Eye, EyeOff, KeyRound, Search, Layers, ShieldCheck, Copy, Check, AlertTriangle, Info, Lock, Clock, Trash2 } from 'lucide-react'

const tool = TOOLS.find(t => t.id === 'bcrypt')

function Spinner() {
  return (
    <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }}
      style={{ width: 18, height: 18, borderRadius: '50%', border: '2.5px solid rgba(255,255,255,.35)', borderTopColor: '#fff', display: 'inline-block', flexShrink: 0 }}
    />
  )
}

function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{
      display: 'flex',
      gap: 4,
      background: '#F0F1F7',
      borderRadius: 14,
      padding: 4,
      marginBottom: 24,
      overflowX: 'auto',
      WebkitOverflowScrolling: 'touch',
      scrollbarWidth: 'none',
      msOverflowStyle: 'none'
    }}>
      {tabs.map(t => (
        <motion.button key={t.id} onClick={() => onChange(t.id)} whileTap={{ scale: 0.95 }}
          style={{
            flex: '1 0 auto',
            padding: '11px 12px',
            borderRadius: 11,
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'DM Sans, sans-serif',
            fontSize: 13.5,
            fontWeight: 700,
            whiteSpace: 'nowrap',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            background: active === t.id ? 'linear-gradient(135deg,#4F8EF7,#9C6FDE)' : 'transparent',
            color: active === t.id ? '#fff' : '#64748b',
            boxShadow: active === t.id ? '0 4px 14px rgba(79,142,247,.35)' : 'none',
            transition: 'color .2s, box-shadow .2s',
          }}
        >
          {t.icon}
          <span>{t.label}</span>
        </motion.button>
      ))}
    </div>
  )
}

function HashBox({ hash }) {
  const [copied, copy] = useCopy()
  if (!hash) return null
  const rounds = hash.split('$')[2] || '?'
  return (
    <motion.div initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 280, damping: 20 }}>
      <label className="lbl">BCrypt Hash</label>
      <div style={{ background: 'linear-gradient(135deg,rgba(34,197,94,.06),rgba(79,142,247,.05))', border: '1.5px solid rgba(34,197,94,.3)', borderRadius: 13, padding: '14px 16px', fontFamily: "'Courier New', monospace", fontSize: 12.5, color: '#1a7a42', letterSpacing: 0.4, wordBreak: 'break-all', lineHeight: 1.75, userSelect: 'all', cursor: 'text' }}>
        {hash}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
        {[{label:'bcrypt',color:'#4F8EF7'},{label:'salt embedded',color:'#9C6FDE'},{label:`rounds:${rounds}`,color:'#F06292'},{label:'60 chars',color:'#22c55e'},{label:'one-way',color:'#f59e0b'}].map(b => (
          <span key={b.label} style={{ background:`${b.color}12`, color:b.color, border:`1px solid ${b.color}28`, fontSize:10.5, fontWeight:700, padding:'3px 11px', borderRadius:999 }}>{b.label}</span>
        ))}
      </div>
      <button className={`btn ${copied ? 'btn-success' : 'btn-blue'}`} style={{ width: '100%', marginTop: 13 }} onClick={() => copy(hash)}>
        {copied ? '✓  Copied to clipboard!' : '📋  Copy Hash'}
      </button>
    </motion.div>
  )
}

function HasherTab() {
  const [text, setText] = useState('')
  const [rounds, setRounds, rpct] = useSlider(10, 4, 14)
  const [hash, setHash] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [fallbackNotice, setFallbackNotice] = useState('')

  const handleHash = async () => {
    if (!text.trim()) return
    setHash('')
    setFallbackNotice('')
    setLoading(true)
    try {
      let output
      let actualRounds = rounds
      try {
        output = await hashSingleWorker(text, rounds)
      } catch {}
      if (!output) {
        // Fallback execution on main thread
        // Preserve user's configured rounds. If >12 on main thread, inform user of defensive limit to prevent browser lock
        if (rounds > 12) {
          actualRounds = 12
          setFallbackNotice(`Worker unavailable. Safely computed with cost factor ${actualRounds} (requested ${rounds}) to prevent main-thread freeze.`)
        } else {
          actualRounds = rounds
          setFallbackNotice(`Worker unavailable. Computed on main thread with cost factor ${actualRounds}.`)
        }
        const salt = await bcrypt.genSalt(actualRounds)
        output = await bcrypt.hash(text, salt)
      }
      setHash(output)
      try {
        addToHistory({
          tool: 'Bcrypt Generator',
          label: `Bcrypt Hash (Cost: ${actualRounds})`,
          value: `Calculated with cost factor ${actualRounds}`,
          action: 'Generated',
          category: 'security',
          metadata: { rounds: actualRounds }
        })
      } catch {}
    } finally { setLoading(false) }
  }

  const pct = text.length >= 16 ? 100 : text.length >= 10 ? 65 : text.length >= 6 ? 35 : 0
  const scol = pct === 100 ? '#22c55e' : pct === 65 ? '#4F8EF7' : '#f59e0b'
  const slbl = pct === 100 ? 'Strong' : pct === 65 ? 'Good' : pct > 0 ? 'Weak' : ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="fgrp">
        <label className="lbl">Text / Password</label>
        <div style={{ position: 'relative' }}>
          <input type={showPw ? 'text' : 'password'} value={text} onChange={e => { setText(e.target.value); setHash(''); setFallbackNotice('') }} onKeyDown={e => e.key === 'Enter' && handleHash()} placeholder="Enter any text or password to hash…" className="inp" style={{ paddingRight: 48, width: '100%', boxSizing: 'border-box' }} />
          <button
            type="button"
            onClick={() => setShowPw(v => !v)}
            aria-label={showPw ? 'Hide password' : 'Show password'}
            title={showPw ? 'Hide password' : 'Show password'}
            style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', padding: 2 }}
          >
            {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        {text.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ height: 4, background: '#e5e7eb', borderRadius: 2, overflow: 'hidden' }}>
              <motion.div animate={{ width: `${pct}%`, backgroundColor: scol }} transition={{ duration: 0.4 }} style={{ height: '100%', borderRadius: 2 }} />
            </div>
            {slbl && <div style={{ fontSize: 11, fontWeight: 700, color: scol, marginTop: 4 }}>{slbl} password</div>}
          </div>
        )}
      </div>

      <div className="fgrp">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <label className="lbl" style={{ margin: 0 }}>BCrypt Cost Rounds</label>
          <span style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 22, color: '#9C6FDE' }}>{rounds}</span>
        </div>
        <input type="range" min={4} max={14} value={rounds} onChange={e => setRounds(+e.target.value)} style={{  '--pct': rpct, background:`linear-gradient(to right,#4F8EF7 0%,#4F8EF7 ${Math.max(0,Math.min(100,((rounds)-(4))/((14)-(4))*100))}%,#e2e4ef ${Math.max(0,Math.min(100,((rounds)-(4))/((14)-(4))*100))}%,#e2e4ef 100%)`, WebkitAppearance:'none', appearance:'none', height:5, borderRadius:3, outline:'none' }} className="rs-thumb"/>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#bbb', marginTop: 5 }}>
          <span>4 — fastest</span>
          {rounds >= 13 && <span style={{ color: '#f59e0b', fontWeight: 600 }}>⚠ Very slow on mobile</span>}
          <span>14 — strongest</span>
        </div>
      </div>

      {fallbackNotice && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.25)', borderRadius: 10, fontSize: 12, color: '#b45309' }}>
          <AlertTriangle size={15} style={{ flexShrink: 0 }} />
          <span>{fallbackNotice}</span>
        </div>
      )}

      <motion.button className="btn btn-primary" onClick={handleHash} disabled={loading || !text.trim()} whileHover={!loading && text.trim() ? { scale: 1.02 } : {}} whileTap={{ scale: 0.97 }} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontSize: 15, padding: '14px 20px' }}>
        {loading ? <><Spinner /> Computing BCrypt hash…</> : 'Generate Hash'}
      </motion.button>

      <AnimatePresence>
        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', background: 'rgba(79,142,247,.05)', borderRadius: 12, border: '1px solid rgba(79,142,247,.12)' }}>
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }} style={{ width: 20, height: 20, borderRadius: '50%', border: '2.5px solid rgba(79,142,247,.2)', borderTopColor: '#4F8EF7', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#4F8EF7' }}>Running {rounds} rounds of bcrypt…</div>
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>Each round doubles computation time</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!loading && hash && <HashBox hash={hash} />}

      <div style={{ background: 'rgba(156,111,222,.05)', border: '1px solid rgba(156,111,222,.14)', borderRadius: 13, padding: '14px 16px' }}>
        <div style={{ fontSize: 12, color: '#666', lineHeight: 1.8 }}>
          <strong style={{ color: '#9C6FDE' }}>ℹ️ How BCrypt works</strong><br />
          BCrypt is a one-way adaptive hash — the original text <strong>cannot be recovered</strong>. Each hash includes a built-in random salt. Use the <strong>Verify</strong> tab to check if a password matches a hash.
        </div>
      </div>
    </div>
  )
}

function VerifierTab() {
  const [text, setText] = useState('')
  const [hashInput, setHashInput] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showText, setShowText] = useState(false)

  const handleVerify = async () => {
    const plainToVerify = text
    const trimmedHash = hashInput.trim()
    if (!plainToVerify || !trimmedHash) return
    setResult(null); setLoading(true)
    try {
      if (!/^\$2[aby]\$(\d{2})\$[./A-Za-z0-9]{50,}/.test(trimmedHash)) { setResult('invalid'); return }
      const costMatch = trimmedHash.match(/^\$2[aby]\$(\d{2})\$/)
      if (costMatch) {
        const cost = parseInt(costMatch[1], 10)
        if (cost < 4 || cost > 14) {
          setResult('invalid_cost')
          return
        }
      }
      let match
      try {
        match = await compareWorker(plainToVerify, trimmedHash)
      } catch {}
      if (match === null || match === undefined) {
        // Yield to the event loop to ensure UI spinner displays before CPU-heavy computation
        await new Promise(r => setTimeout(r, 25))
        match = await bcrypt.compare(plainToVerify, trimmedHash)
      }
      setResult(match ? 'match' : 'nomatch')
      try {
        addToHistory({
          tool: 'Bcrypt Generator',
          label: 'Bcrypt Verification',
          value: match ? 'Hash verification matched' : 'Hash verification mismatched',
          action: 'Verified',
          category: 'security',
          metadata: { match: Boolean(match) }
        })
      } catch {}
    } catch { setResult('invalid') } finally { setLoading(false) }
  }

  const RESULTS = {
    match:   { icon:'✅', title:'Password Matches!',      sub:'The plain text matches this BCrypt hash.',        color:'#22c55e', bg:'rgba(34,197,94,.06)',  border:'rgba(34,197,94,.28)'  },
    nomatch: { icon:'❌', title:'No Match',               sub:'The plain text does NOT match this hash.',       color:'#ef4444', bg:'rgba(239,68,68,.06)',  border:'rgba(239,68,68,.28)'  },
    invalid: { icon:'⚠️', title:'Invalid BCrypt Hash',    sub:'Hash must start with $2a$, $2b$, or $2y$.',      color:'#f59e0b', bg:'rgba(245,158,11,.06)', border:'rgba(245,158,11,.28)' },
    invalid_cost: { icon:'⚠️', title:'Unsafe Cost Factor', sub:'Hash cost factor must be between 4 and 14 to maintain responsive browser performance.', color:'#f59e0b', bg:'rgba(245,158,11,.06)', border:'rgba(245,158,11,.28)' },
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="fgrp">
        <label className="lbl">Plain Text / Password</label>
        <div style={{ position: 'relative' }}>
          <input type={showText ? 'text' : 'password'} value={text} onChange={e => { setText(e.target.value); setResult(null) }} placeholder="Enter the original password to check…" className="inp" style={{ paddingRight: 48, width: '100%', boxSizing: 'border-box' }} />
          <button
            type="button"
            onClick={() => setShowText(v => !v)}
            aria-label={showText ? 'Hide password' : 'Show password'}
            title={showText ? 'Hide password' : 'Show password'}
            style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', padding: 2 }}
          >
            {showText ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>

      <div className="fgrp">
        <label className="lbl">BCrypt Hash</label>
        <input type="text" value={hashInput} onChange={e => { setHashInput(e.target.value); setResult(null) }} placeholder="$2a$10$…  (paste the full hash here)" className="inp" style={{ fontFamily: "'Courier New', monospace", fontSize: 12.5, letterSpacing: 0.3 }} />
        {hashInput && !hashInput.startsWith('$2') && (
          <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 5 }}>⚠️ Valid hashes start with $2a$, $2b$ or $2y$</div>
        )}
      </div>

      <motion.button className="btn btn-primary" onClick={handleVerify} disabled={loading || !text || !hashInput.trim()} whileHover={!loading ? { scale: 1.02 } : {}} whileTap={{ scale: 0.97 }} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontSize: 15, padding: '14px 20px' }}>
        {loading ? <><Spinner /> Verifying…</> : '🔍  Verify Password'}
      </motion.button>

      <AnimatePresence>
        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', background: 'rgba(79,142,247,.05)', borderRadius: 12, border: '1px solid rgba(79,142,247,.12)' }}>
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }} style={{ width: 20, height: 20, borderRadius: '50%', border: '2.5px solid rgba(79,142,247,.2)', borderTopColor: '#4F8EF7', flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: '#888' }}>Comparing against hash…</span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!loading && result && (() => {
          const r = RESULTS[result]
          return (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22, ease: [.22, 1, .36, 1] }}
              style={{ background: r.bg, border: `1.5px solid ${r.border}`, borderRadius: 16, padding: '26px 22px', textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 10 }}>{r.icon}</div>
              <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 20, fontWeight: 800, color: r.color, marginBottom: 6 }}>{r.title}</div>
              <div style={{ fontSize: 13, color: '#777', lineHeight: 1.6 }}>{r.sub}</div>
            </motion.div>
          )
        })()}
      </AnimatePresence>

      <div style={{ background: 'rgba(79,142,247,.04)', border: '1px solid rgba(79,142,247,.12)', borderRadius: 12, padding: '13px 16px' }}>
        <div style={{ fontSize: 12, color: '#666', lineHeight: 1.75 }}>
          <strong style={{ color: '#4F8EF7' }}>💡 Tip</strong> — BCrypt hashes are salted, so the same password hashed twice gives two <em>different</em> hashes — yet both will verify correctly.
        </div>
      </div>
    </div>
  )
}

function BatchTab() {
  const [input,   setInput]  = useState('')
  const [rounds,  setRounds] = useState(10)
  const [results, setResults]= useState([])
  const [loading, setLoading]= useState(false)
  const [progress,setProgress]=useState(0)
  const [bCopied, bCopy]     = useCopy()

  const lines = input.split('\n').map(l=>l.trim()).filter(Boolean)

  const handleBatch = async () => {
    if (!lines.length) return
    
    // Explicitly enforce the max 50 line cap to prevent browser hanging via extreme OOM/DoS loops
    const safeLines = lines.slice(0, 50)

    setResults([]); setLoading(true); setProgress(0)

    try {
      const workerResults = await hashBatchWorker(safeLines, rounds, (prog, partial) => {
        setProgress(prog)
        setResults([...partial])
      })
      if (workerResults) {
        setResults(workerResults)
        setProgress(100)
        setLoading(false)
        return
      }
    } catch {}

    const out = []
    const fallbackRounds = Math.min(rounds, 10)
    for (let i = 0; i < safeLines.length; i++) {
      const salt = await bcrypt.genSalt(fallbackRounds)
      const hash = await bcrypt.hash(safeLines[i], salt)
      out.push({ plain: safeLines[i], hash })
      setResults([...out])
      setProgress(Math.round(((i+1)/safeLines.length)*100))
      await new Promise(r => setTimeout(r, 0)) // yield UI
    }
    try {
      addToHistory({
        tool: 'Bcrypt Generator',
        label: `Batch Bcrypt (${safeLines.length} items)`,
        value: `Batch processed ${safeLines.length} items (Cost: ${rounds})`,
        action: 'Batch Generated',
        category: 'security',
        metadata: { count: safeLines.length, rounds }
      })
    } catch {}
    setLoading(false)
  }

  const allText = results.map(r => `${r.plain} → ${r.hash}`).join('\n')

  const downloadCSV = () => {
    const csvContent = "Password,Bcrypt Hash\n" + results.map(r => {
      const cleanPlain = /^[=+\-@\t\r]/.test(r.plain) ? "'" + r.plain : r.plain
      return `"${cleanPlain.replace(/"/g, '""')}","${r.hash}"`
    }).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    saveFileWithFallback(blob, 'bcrypt_batch_hashes.csv', 'text/csv;charset=utf-8;')
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      <div className="fgrp">
        <label className="lbl">Passwords to Hash (one per line, max 50)</label>
        <textarea className="inp" value={input} onChange={e=>setInput(e.target.value)}
          placeholder={'password123\nmysecretpass\nAdmin@2024\n…'}
          style={{ minHeight:130, fontFamily:'monospace', fontSize:13, lineHeight:1.7, resize:'vertical' }}/>
        <div style={{ fontSize:11, color:'#aaa', marginTop:5 }}>{lines.length} password{lines.length!==1?'s':''} detected</div>
      </div>

      <div className="fgrp">
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
          <label className="lbl" style={{margin:0}}>Cost Rounds</label>
          <span style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:20, color:'#9C6FDE' }}>{rounds}</span>
        </div>
        <input type="range" min={4} max={12} value={rounds} onChange={e=>setRounds(+e.target.value)}
                style={{ width:'100%', background:`linear-gradient(to right,#4F8EF7 0%,#4F8EF7 ${Math.max(0,Math.min(100,((rounds)-(4))/((12)-(4))*100))}%,#e2e4ef ${Math.max(0,Math.min(100,((rounds)-(4))/((12)-(4))*100))}%,#e2e4ef 100%)`, WebkitAppearance:'none', appearance:'none', height:5, borderRadius:3, outline:'none', cursor:'pointer' }} className="rs-thumb"/>
        <div style={{ fontSize:11, color:'#bbb', marginTop:4 }}>
          Lower rounds = faster batch processing. Recommended: 8–10 for batch.
        </div>
      </div>

      <motion.button className="btn btn-primary" onClick={handleBatch}
        disabled={loading || !lines.length || lines.length > 50}
        whileHover={!loading && lines.length ? {scale:1.02} : {}}
        whileTap={{scale:.97}}
        style={{ width:'100%', fontSize:15, padding:'14px', display:'flex', alignItems:'center', justifyContent:'center', gap:10 }}>
        {loading ? <><Spinner/> Hashing {progress}%…</> : `🔐 Hash ${lines.length} Password${lines.length!==1?'s':''}`}
      </motion.button>

      {loading && (
        <div style={{ height:6, background:'#e5e7ef', borderRadius:3, overflow:'hidden' }}>
          <motion.div animate={{width:`${progress}%`}} transition={{duration:.3}}
            style={{ height:'100%', background:'linear-gradient(90deg,#4F8EF7,#9C6FDE)', borderRadius:3 }}/>
        </div>
      )}

      {results.length > 0 && !loading && (
        <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <label className="lbl" style={{margin:0}}>Results ({results.length})</label>
            <div style={{ display:'flex', gap:6 }}>
              <button className={`btn ${bCopied?'btn-success':'btn-outline'} btn-sm`}
                onClick={() => bCopy(allText)}>
                {bCopied ? '✓ Copied' : '📋 Copy All'}
              </button>
              <button className="btn btn-outline btn-sm" onClick={downloadCSV}>
                ⬇ Download CSV
              </button>
            </div>
          </div>
          <div style={{ maxHeight:320, overflowY:'auto', display:'flex', flexDirection:'column', gap:6 }}>
            {results.map((r,i) => (
              <div key={i} style={{ background:'#fafbff', borderRadius:10, padding:'10px 13px',
                border:'1px solid rgba(0,0,0,.06)' }}>
                <div style={{ fontSize:11, color:'#aaa', marginBottom:4 }}>#{i+1} · {r.plain}</div>
                <div style={{ fontFamily:'monospace', fontSize:11.5, color:'#22c55e', wordBreak:'break-all', lineHeight:1.6 }}>{r.hash}</div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {lines.length > 50 && (
        <div className="info-bar amber">⚠️ Maximum 50 passwords per batch to prevent browser freezing.</div>
      )}
    </div>
  )
}

const MNEMONIC_WORDS = [
  'beacon','velvet','glacier','matrix','harbor','falcon','ember','crystal',
  'orbit','prairie','summit','timber','zenith','aurora','meadow','cipher',
  'plasma','silver','vortex','canyon','blazer','copper','dynamo','echo',
  'flux','granite','helix','indigo','javelin','kestrel','lagoon','meteor',
  'nexus','oasis','pulsar','quartz','radiant','safari','titan','umbra'
]

function AuditorTab() {
  const [text, setText] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [rounds, setRounds] = useState(10)
  const [attackerRig, setAttackerRig] = useState('gpu') // 'cpu', 'gpu', 'cluster'
  const [copied, copy] = useCopy()
  const [mnemonic, setMnemonic] = useState('')

  const generateMnemonic = () => {
    const picks = []
    for (let i = 0; i < 4; i++) {
      picks.push(MNEMONIC_WORDS[Math.floor(Math.random() * MNEMONIC_WORDS.length)])
    }
    const num = Math.floor(Math.random() * 90) + 10
    const phrase = `${picks.join('-')}-${num}`
    setMnemonic(phrase)
  }

  const analysis = useMemo(() => {
    const len = text.length
    if (!len) {
      return {
        entropy: 0,
        pool: 0,
        hasLower: false,
        hasUpper: false,
        hasDigits: false,
        hasSymbols: false,
        dictFeasibility: 'No password entered',
        maskFeasibility: 'No password entered',
        dictColor: '#94a3b8',
        maskColor: '#94a3b8',
        timeEstimate: '—',
        diffFactor: Math.pow(2, rounds - 10)
      }
    }

    const hasLower = /[a-z]/.test(text)
    const hasUpper = /[A-Z]/.test(text)
    const hasDigits = /[0-9]/.test(text)
    const hasSymbols = /[^a-zA-Z0-9]/.test(text)

    let pool = 0
    if (hasLower) pool += 26
    if (hasUpper) pool += 26
    if (hasDigits) pool += 10
    if (hasSymbols) pool += 33

    const entropy = Math.round(len * (Math.log2(pool || 1)))
    const diffFactor = Math.pow(2, rounds - 10)

    // Base hashing speed at round 10 for different defensive attacker models
    // Based on defensive cryptographic benchmarks for bcrypt cost factor scaling
    const baseRates = {
      cpu: 50,       // Single CPU thread (~50 H/s)
      gpu: 8000,     // Specialized 8x GPU rig (~8,000 H/s at cost 10)
      cluster: 100000 // Large distributed cluster (~100,000 H/s at cost 10)
    }

    const currentRate = Math.max(0.1, (baseRates[attackerRig] || 8000) / (diffFactor || 1))

    // Average combinations to test (50% of search space)
    const searchSpace = pool > 0 && len > 0 ? (len > 32 ? Infinity : Math.pow(pool, len) / 2) : 0
    const totalSeconds = !isFinite(searchSpace) ? Infinity : (currentRate > 0 ? searchSpace / currentRate : Infinity)

    let timeEstimate = 'Instantly'
    if (!isFinite(totalSeconds) || totalSeconds > 3.15e9) timeEstimate = '> 100 Centuries'
    else if (isNaN(totalSeconds) || totalSeconds <= 0) timeEstimate = 'Instantly'
    else if (totalSeconds > 3.15e7) timeEstimate = `${Math.round(totalSeconds / 3.15e7)} Years`
    else if (totalSeconds > 86400 * 30) timeEstimate = `${Math.round(totalSeconds / (86400 * 30))} Months`
    else if (totalSeconds > 86400) timeEstimate = `${Math.round(totalSeconds / 86400)} Days`
    else if (totalSeconds > 3600) timeEstimate = `${Math.round(totalSeconds / 3600)} Hours`
    else if (totalSeconds > 60) timeEstimate = `${Math.round(totalSeconds / 60)} Minutes`
    else if (totalSeconds > 1) timeEstimate = `${Math.round(totalSeconds)} Seconds`

    let dictFeasibility = 'Resilient'
    let dictColor = '#22c55e'
    if (len < 8) {
      dictFeasibility = 'High Vulnerability (Search space trivial for standard wordlists)'
      dictColor = '#ef4444'
    } else if (len < 12) {
      dictFeasibility = 'Guarded (Requires wordlist mutation + combinatorial rules)'
      dictColor = '#f59e0b'
    } else {
      dictFeasibility = 'Highly Resilient (Impractical for dictionary and rule-based attacks)'
      dictColor = '#22c55e'
    }

    let maskFeasibility = 'Impractical'
    let maskColor = '#22c55e'
    if (entropy < 40) {
      maskFeasibility = 'Exhaustible (Brute-force mask easily feasible offline)'
      maskColor = '#ef4444'
    } else if (entropy < 65) {
      maskFeasibility = 'Challenging (Requires extensive sustained GPU computing power)'
      maskColor = '#f59e0b'
    } else {
      maskFeasibility = 'Cryptographically Infeasible (Far exceeds offline search limits)'
      maskColor = '#22c55e'
    }

    return {
      entropy,
      pool,
      hasLower,
      hasUpper,
      hasDigits,
      hasSymbols,
      dictFeasibility,
      maskFeasibility,
      dictColor,
      maskColor,
      timeEstimate,
      diffFactor
    }
  }, [text, rounds, attackerRig])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Input */}
      <div className="fgrp">
        <label className="lbl">Password or Passphrase to Audit</label>
        <div style={{ position: 'relative' }}>
          <input
            type={showPw ? 'text' : 'password'}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Type any password to evaluate offline attack resistance…"
            className="inp"
            style={{ paddingRight: 48, width: '100%', boxSizing: 'border-box' }}
          />
          <button
            type="button"
            onClick={() => setShowPw(v => !v)}
            aria-label={showPw ? 'Hide password' : 'Show password'}
            title={showPw ? 'Hide password' : 'Show password'}
            style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', padding: 2 }}
          >
            {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        <div style={{ fontSize: 11, color: '#888', marginTop: 5 }}>
          🔒 Evaluated 100% locally in browser memory. Text is never sent over any network.
        </div>
      </div>

      {/* Cost factor & Attacker profile */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <div className="fgrp">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label className="lbl" style={{ margin: 0 }}>Target Cost Rounds</label>
            <span style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 18, color: '#9C6FDE' }}>
              {rounds} <span style={{ fontSize: 12, fontWeight: 600, color: '#888' }}>({Math.pow(2, rounds).toLocaleString()} iter)</span>
            </span>
          </div>
          <input
            type="range"
            min={4}
            max={14}
            value={rounds}
            onChange={e => setRounds(+e.target.value)}
            style={{ width: '100%', accentColor: '#9C6FDE' }}
            className="rs-thumb"
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: '#aaa', marginTop: 3 }}>
            <span>4 (Trivial)</span>
            <span>10 (Standard)</span>
            <span>14 (Maximum)</span>
          </div>
        </div>

        <div className="fgrp">
          <label className="lbl">Attacker Hardware Model (Heuristic)</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { id: 'cpu', label: 'Single CPU', sub: '~50 H/s' },
              { id: 'gpu', label: '8x GPU Rig', sub: '~8k H/s' },
              { id: 'cluster', label: 'Cluster', sub: '~100k H/s' },
            ].map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => setAttackerRig(m.id)}
                style={{
                  flex: 1,
                  padding: '8px 4px',
                  borderRadius: 10,
                  border: `1.5px solid ${attackerRig === m.id ? '#4F8EF7' : 'rgba(0,0,0,0.08)'}`,
                  background: attackerRig === m.id ? 'rgba(79,142,247,0.08)' : '#fafafa',
                  cursor: 'pointer',
                  textAlign: 'center'
                }}
              >
                <div style={{ fontSize: 11.5, fontWeight: 700, color: attackerRig === m.id ? '#4F8EF7' : '#334155' }}>
                  {m.label}
                </div>
                <div style={{ fontSize: 10, color: '#888' }}>{m.sub}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Primary Metrics Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
        <div style={{ background: '#fff', padding: '12px 14px', borderRadius: 12, border: '1px solid rgba(0,0,0,.08)' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: '#888', textTransform: 'uppercase' }}>Entropy</div>
          <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 20, fontWeight: 800, color: '#4F8EF7', marginTop: 2 }}>
            {analysis.entropy} <span style={{ fontSize: 12, fontWeight: 600 }}>bits</span>
          </div>
          <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 2 }}>
            Pool: {analysis.pool} chars
          </div>
        </div>

        <div style={{ background: '#fff', padding: '12px 14px', borderRadius: 12, border: '1px solid rgba(0,0,0,.08)' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: '#888', textTransform: 'uppercase' }}>Bcrypt Cost Multiplier</div>
          <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 20, fontWeight: 800, color: '#9C6FDE', marginTop: 2 }}>
            {analysis.diffFactor >= 1 ? `${analysis.diffFactor}×` : `1/${Math.round(1/analysis.diffFactor)}×`}
          </div>
          <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 2 }}>
            vs Standard (Round 10)
          </div>
        </div>

        <div style={{ background: '#fff', padding: '12px 14px', borderRadius: 12, border: '1px solid rgba(0,0,0,.08)' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: '#888', textTransform: 'uppercase' }}>Offline Mask Resistance</div>
          <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 18, fontWeight: 800, color: '#22c55e', marginTop: 2 }}>
            {analysis.timeEstimate}
          </div>
          <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 2 }}>
            Theoretical average
          </div>
        </div>
      </div>

      {/* Feasibility Breakdown */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ padding: '12px 14px', borderRadius: 10, background: '#f8fafc', border: `1px solid ${analysis.dictColor}30` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>📖 Dictionary Attack Feasibility</span>
            <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: `${analysis.dictColor}18`, color: analysis.dictColor }}>
              {text.length < 8 ? 'High Risk' : text.length < 12 ? 'Guarded' : 'Resilient'}
            </span>
          </div>
          <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.5 }}>
            {analysis.dictFeasibility}
          </div>
        </div>

        <div style={{ padding: '12px 14px', borderRadius: 10, background: '#f8fafc', border: `1px solid ${analysis.maskColor}30` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>🎭 Exhaustive Mask / Brute-Force Feasibility</span>
            <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: `${analysis.maskColor}18`, color: analysis.maskColor }}>
              {analysis.entropy < 40 ? 'Exhaustible' : analysis.entropy < 65 ? 'Challenging' : 'Infeasible'}
            </span>
          </div>
          <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.5 }}>
            {analysis.maskFeasibility}
          </div>
        </div>
      </div>

      {/* Mnemonic Passphrase Generator */}
      <div style={{ padding: '14px 16px', borderRadius: 12, background: 'linear-gradient(135deg, rgba(79,142,247,0.06), rgba(156,111,222,0.07))', border: '1px solid rgba(156,111,222,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 14, color: '#0d0d1a' }}>
              💡 Stronger Alternative: Mnemonic Passphrase
            </div>
            <div style={{ fontSize: 11.5, color: '#64748b' }}>
              High-entropy multi-word phrases offer superior offline resistance and easy recall.
            </div>
          </div>
          <button
            type="button"
            onClick={generateMnemonic}
            className="btn btn-sm btn-primary"
            style={{ fontSize: 12, padding: '6px 14px', borderRadius: 999 }}
          >
            🎲 Generate Passphrase
          </button>
        </div>

        {mnemonic && (
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, padding: '8px 12px', background: '#fff', borderRadius: 8, border: '1px solid rgba(0,0,0,.1)', fontFamily: 'monospace', fontSize: 13, color: '#4F8EF7', fontWeight: 700 }}>
              {mnemonic}
            </div>
            <button
              type="button"
              onClick={() => copy(mnemonic)}
              className="btn btn-outline btn-sm"
              style={{ fontSize: 12 }}
            >
              {copied ? '✓ Copied' : '📋 Copy'}
            </button>
            <button
              type="button"
              onClick={() => setText(mnemonic)}
              className="btn btn-outline btn-sm"
              style={{ fontSize: 12, color: '#9C6FDE', borderColor: 'rgba(156,111,222,.3)' }}
            >
              Test This Phrase →
            </button>
          </div>
        )}
      </div>

      {/* Educational Notice */}
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px', fontSize: 11, color: '#64748b', lineHeight: 1.6 }}>
        <strong>Defensive Security Heuristic:</strong> Offline crack-time estimates are theoretical models based on password entropy and attacker hash rates. Bcrypt's high memory footprint and CPU-intensive design provide significant resilience against brute-force attacks compared to fast hashes like MD5 or SHA256.
      </div>
    </div>
  )
}

export default function BcryptTool() {
  const [tab, setTab] = useState('hasher')
  const { history: bcryptHistory, remove: removeHistoryItem, clear: clearToolHistory } = useToolHistory('Bcrypt Generator', 10)
  const TABS = [
    { id:'hasher',   icon: <KeyRound size={16} />, label:'Hash'    },
    { id:'verifier', icon: <Search size={16} />,   label:'Verify'  },
    { id:'batch',    icon: <Layers size={16} />,   label:'Batch'   },
    { id:'auditor',  icon: <ShieldCheck size={16} />, label:'Security Audit' },
  ]
  return (
    <ToolShell tool={tool}>
      <ToolCard>
        <TabBar tabs={TABS} active={tab} onChange={setTab}/>
        <AnimatePresence mode="wait">
          <motion.div key={tab}
            initial={{ opacity:0, x: tab==='hasher'?-20:20 }}
            animate={{ opacity:1, x:0 }}
            exit={{ opacity:0, x: tab==='hasher'?20:-20 }}
            transition={{ duration:.22, ease:[.22,1,.36,1] }}>
            {tab==='hasher'   && <HasherTab/>}
            {tab==='verifier' && <VerifierTab/>}
            {tab==='batch'    && <BatchTab/>}
            {tab==='auditor'  && <AuditorTab/>}
          </motion.div>
        </AnimatePresence>
      </ToolCard>

      {bcryptHistory.length > 0 && (
        <Reveal delay={0.06}>
          <ToolCard style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Clock size={16} style={{ color: '#4F8EF7' }} />
                <span style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 14, color: '#0d0d1a' }}>
                  Recent Bcrypt Operations <span style={{ fontSize: 12, fontWeight: 500, color: '#aaa' }}>({bcryptHistory.length})</span>
                </span>
              </div>
              <motion.button whileTap={{ scale: 0.95 }}
                onClick={clearToolHistory}
                className="btn btn-outline btn-sm" style={{ color: '#EF5350', borderColor: 'rgba(239,83,80,.25)' }}>
                <Trash2 size={13} style={{ marginRight: 4 }} /> Clear
              </motion.button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto' }}>
              {bcryptHistory.map((h) => (
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
            <div className="info-bar blue" style={{ marginTop: 10, marginBottom: 0 }}>
              🔒 Safe Bcrypt parameters and verification results are saved. Cleartext passwords and raw hashes are never persisted to history.
            </div>
          </ToolCard>
        </Reveal>
      )}
    </ToolShell>
  )
}
