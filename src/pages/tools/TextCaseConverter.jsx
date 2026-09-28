import React, { useState, useMemo, useRef, useDeferredValue } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ToolShell, { ToolCard } from '../../components/ToolShell'
import { useCopy } from '../../hooks'
import { TOOLS } from '../../constants'
import { RewritePanel } from '../../components/AIPanel'
import { saveFileWithFallback } from '../../utils/fileSaver'
import { safeFetchJSON } from '../../utils/safeFetch'
import { addToHistory } from '../../utils/history'

const tool = TOOLS.find(t => t.id === 'textcase')

// Helper: split into words intelligently (handles camelCase, snake_case, etc.)
function toWords(t) {
  return t
    .replace(/([a-z])([A-Z])/g, '$1 $2')   // camelCase split
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2') // ABCDef → ABC Def
    .replace(/[-_./]+/g, ' ')               // separators to space
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

// Accurate title case — skips articles/prepositions unless first/last word
const MINORS = new Set(['a','an','the','and','but','or','nor','for','so','yet','at','by','in','of','on','to','up','as','if'])
function titleCase(t) {
  if (!t) return ''
  const words = t.split(/(\s+)/)
  let firstWordSeen = false
  return words.map((chunk) => {
    if (!chunk) return ''
    if (/\s/.test(chunk)) return chunk
    const low = chunk.toLowerCase()
    const cap = (low[0] ? low[0].toUpperCase() : '') + low.slice(1)
    if (!firstWordSeen) {
      firstWordSeen = true
      return cap
    }
    if (MINORS.has(low)) return low
    return cap
  }).join('')
}

const CASES = [
  { id:'upper',    label:'UPPERCASE',      fn: t => t.toUpperCase() },
  { id:'lower',    label:'lowercase',      fn: t => t.toLowerCase() },
  { id:'title',    label:'Title Case',     fn: titleCase },
  { id:'sentence', label:'Sentence case',  fn: t => {
    return t.replace(/(^\s*|[.!?]\s+)([a-z])/g, (m, pre, c) => pre + c.toUpperCase())
           .replace(/^[a-z]/, c => c.toUpperCase())
  }},
  { id:'camel',    label:'camelCase',      fn: t => {
    const w = toWords(t)
    return w.map((w2, i) => {
      if (!w2) return ''
      return i === 0 ? w2.toLowerCase() : (w2[0] ? w2[0].toUpperCase() : '') + w2.slice(1).toLowerCase()
    }).join('')
  }},
  { id:'pascal',   label:'PascalCase',     fn: t => toWords(t).map(w2 => w2 ? (w2[0] ? w2[0].toUpperCase() : '') + w2.slice(1).toLowerCase() : '').join('') },
  { id:'snake',    label:'snake_case',     fn: t => toWords(t).map(w2 => w2.toLowerCase()).join('_') },
  { id:'kebab',    label:'kebab-case',     fn: t => toWords(t).map(w2 => w2.toLowerCase()).join('-') },
  { id:'constant', label:'CONSTANT_CASE',  fn: t => toWords(t).map(w2 => w2.toUpperCase()).join('_') },
  { id:'dot',      label:'dot.case',       fn: t => toWords(t).map(w2 => w2.toLowerCase()).join('.') },
  { id:'path',     label:'path/case',      fn: t => toWords(t).map(w2 => w2.toLowerCase()).join('/') },
  { id:'toggle',   label:'tOGGLE cASE',    fn: t => t.split('').map(c => c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()).join('') },
]

export default function TextCaseConverter() {
  const [input,      setInput]     = useState('')
  const [copied,     copy]         = useCopy()
  const [lastCopied, setLastCopied]= useState('')
  const [allCopied,  copyAll]      = useCopy()
  const [filter,     setFilter]    = useState('')
  const [compareId,  setCompare]   = useState(null)
  const fileRef = useRef(null)

  /* AI Code Identifier & TypeScript Interface Studio */
  const [aiCodeOpen, setAiCodeOpen] = useState(false)
  const [aiCodeText, setAiCodeText] = useState('')
  const [aiCodeLoading, setAiCodeLoading] = useState(false)
  const [aiCodeError, setAiCodeError] = useState('')
  const [aiIdentifiers, setAiIdentifiers] = useState(null)
  const [copiedKey, setCopiedKey] = useState('')

  const handleGenerateIdentifiers = async () => {
    const textToUse = aiCodeText.trim() || input.trim()
    if (!textToUse) return
    setAiCodeLoading(true)
    setAiCodeError('')
    try {
      const data = await safeFetchJSON('/.netlify/functions/groq-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'codeIdentifier',
          payload: { text: textToUse }
        })
      })
      if (data?.error) throw new Error(data.error)
      if (!data?.identifiers) throw new Error('No identifiers returned from AI')
      setAiIdentifiers(data.identifiers)
    } catch (err) {
      setAiCodeError(err?.message || 'Failed to generate code identifiers')
    } finally {
      setAiCodeLoading(false)
    }
  }

  const copyCodeValue = (key, val) => {
    copy(val)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(''), 1500)
  }

  const deferredInput = useDeferredValue(input)
  const results = useMemo(() => CASES.map(c => ({ ...c, out: c.fn(deferredInput) })), [deferredInput])
  const filtered = filter ? results.filter(r => r.label.toLowerCase().includes(filter.toLowerCase())) : results

  const handleCopy = (text, id) => {
    setLastCopied(id)
    copy(text)
    try {
      const caseItem = CASES.find(c => c.id === id)
      addToHistory({
        tool: 'Text Case',
        label: `${caseItem?.label || id} Conversion`,
        value: text.length > 40 ? `${text.slice(0, 40)}…` : text,
        action: 'Copied',
        category: 'text',
        metadata: { caseId: id, length: text.length }
      })
    } catch {}
  }

  const wordCount = input.trim() ? input.trim().split(/\s+/).length : 0
  const charCount = input.length
  const lineCount = input ? input.split('\n').length : 0

  const loadFile = (f) => {
    if (!f) return
    if (f.size > 5 * 1024 * 1024) {
      alert('File is too large for client-side text processing (max 5MB).')
      return
    }
    const r = new FileReader()
    r.onload = e => setInput(e.target.result)
    r.readAsText(f)
  }

  const copyAllOutputs = () => {
    const all = results.map(r => `[${r.label}]\n${r.out}`).join('\n\n')
    copyAll(all)
  }

  const dlText = (content, filename) => {
    saveFileWithFallback(content, filename || 'converted-text.txt', 'text/plain;charset=utf-8')
  }

  return (
    <ToolShell tool={tool}>
      <ToolCard>
        {/* Input area */}
        <div className="fgrp">
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8, flexWrap:'wrap', gap:8 }}>
            <label className="lbl" style={{ margin:0 }}>Input Text</label>
            <div style={{ display:'flex', gap:7, alignItems:'center', flexWrap:'wrap' }}>
              {input && <span style={{ fontSize:11, color:'#aaa', fontWeight:600 }}>{wordCount}w · {charCount}c · {lineCount}L</span>}
              <button onClick={() => fileRef.current?.click()}
                style={{ fontSize:11, fontWeight:700, color:'#9C6FDE', background:'rgba(156,111,222,.08)',
                  border:'1px solid rgba(156,111,222,.2)', borderRadius:999, padding:'3px 10px', cursor:'pointer',
                  transition:'background .15s' }}
                onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-1px)';e.currentTarget.style.background='rgba(156,111,222,.14)'}}
                onMouseLeave={e=>{e.currentTarget.style.transform='translateY(0)';e.currentTarget.style.background='rgba(156,111,222,.08)'}}
                onMouseDown={e=>{e.currentTarget.style.transform='scale(.95)'}}
                onMouseUp={e=>{e.currentTarget.style.transform='translateY(-1px)'}}>
                📂 Load File
              </button>
              <input ref={fileRef} type="file" accept=".txt,.md,.csv" style={{display:'none'}}
                onChange={e=>{loadFile(e.target.files?.[0]);e.target.value=''}}/>
              {input && (
                <button onClick={() => {setInput(''); setLastCopied(''); setCompare(null)}}
                  style={{ padding:'3px 10px', borderRadius:999, fontSize:11, fontWeight:600, cursor:'pointer',
                    border:'1.5px solid rgba(239,68,68,.25)', background:'rgba(239,68,68,.05)', color:'#ef4444',
                    transition:'background .15s' }}
                  onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-1px)';e.currentTarget.style.background='rgba(239,68,68,.1)'}}
                  onMouseLeave={e=>{e.currentTarget.style.transform='translateY(0)';e.currentTarget.style.background='rgba(239,68,68,.05)'}}
                  onMouseDown={e=>{e.currentTarget.style.transform='scale(.95)'}}
                  onMouseUp={e=>{e.currentTarget.style.transform='translateY(-1px)'}}>
                  ✕ Clear
                </button>
              )}
            </div>
          </div>
          <textarea
            className="inp tall"
            placeholder="Type or paste your text here… or load a .txt / .md file"
            value={input}
            onChange={e => setInput(e.target.value)}
            style={{ minHeight:110, fontSize:15, resize:'vertical' }}
            autoFocus/>
        </div>

        {/* Filter */}
        {input && (
          <div className="fgrp">
            <input className="inp" placeholder="🔍 Filter case types…"
              value={filter} onChange={e => setFilter(e.target.value)}
              style={{ fontSize:13 }}/>
          </div>
        )}

        <AnimatePresence mode="wait">
          {input ? (
            <motion.div key="results" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
              {/* Action bar */}
              <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
                <button className={`btn btn-sm ${allCopied?'btn-success':'btn-blue'}`} style={{ fontSize:11 }}
                  onClick={copyAllOutputs}>
                  {allCopied ? '✓ Copied all!' : '📋 Copy All Cases'}
                </button>
                <button className="btn btn-outline btn-sm" style={{ fontSize:11 }}
                  onClick={() => dlText(results.map(r=>`[${r.label}]\n${r.out}`).join('\n\n'), 'cases.txt')}>
                  ⬇ Export TXT
                </button>
                {compareId && (
                  <button className="btn btn-outline btn-sm" style={{ fontSize:11, color:'#F06292', borderColor:'rgba(240,98,146,.3)' }}
                    onClick={() => setCompare(null)}>
                    ✕ Close Compare
                  </button>
                )}
              </div>

              {/* Compare panel */}
              {compareId && (() => {
                const base = results.find(r => r.id === compareId)
                return base ? (
                  <motion.div initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}}
                    style={{ background:'rgba(79,142,247,.05)', border:'1px solid rgba(79,142,247,.18)', borderRadius:12, padding:'12px 16px', marginBottom:14 }}>
                    <div style={{ fontSize:10, fontWeight:800, color:'#4F8EF7', textTransform:'uppercase', letterSpacing:'.6px', marginBottom:6 }}>
                      Compare: {base.label}
                    </div>
                    <div style={{ fontFamily:'monospace', fontSize:13, color:'#2d2d3d', wordBreak:'break-all' }}>{base.out}</div>
                  </motion.div>
                ) : null
              })()}

              <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
                {filtered.map(c => {
                  const isCopied   = copied && lastCopied === c.id
                  const isCompared = compareId === c.id
                  return (
                    <motion.div key={c.id}
                      layout
                      whileHover={{ x:2 }}
                      style={{
                        background: isCompared ? 'rgba(79,142,247,.06)' : '#FAFBFF',
                        border: `1px solid ${isCompared?'rgba(79,142,247,.22)':'rgba(0,0,0,0.07)'}`,
                        borderRadius:13, padding:'12px 15px',
                        display:'flex', alignItems:'center', gap:12,
                        cursor:'pointer', transition:'background 0.15s, border-color 0.15s, box-shadow 0.15s',
                      }}
                      onClick={() => handleCopy(c.out, c.id)}
                      onMouseEnter={e => { e.currentTarget.style.background='#F0F4FF'; e.currentTarget.style.borderColor='rgba(79,142,247,0.22)'; e.currentTarget.style.boxShadow='0 2px 12px rgba(79,142,247,.08)' }}
                      onMouseLeave={e => { e.currentTarget.style.background=isCompared?'rgba(79,142,247,.06)':'#FAFBFF'; e.currentTarget.style.borderColor=isCompared?'rgba(79,142,247,.22)':'rgba(0,0,0,0.07)'; e.currentTarget.style.boxShadow='none' }}>
                      <span style={{ minWidth:116, fontSize:9.5, fontWeight:800, color:'#bbb', textTransform:'uppercase', letterSpacing:'0.7px', flexShrink:0 }}>
                        {c.label}
                      </span>
                      <span style={{ flex:1, fontSize:13.5, fontFamily:"'Courier New',monospace", color:'#2d2d3d', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {c.out || <span style={{color:'#ddd',fontStyle:'italic'}}>empty</span>}
                      </span>
                      <div style={{ display:'flex', gap:6, alignItems:'center', flexShrink:0 }}>
                        <button
                          type="button"
                          aria-label={isCompared ? 'Close compare' : `Compare ${c.label}`}
                          title={isCompared ? 'Close compare' : `Compare ${c.label}`}
                          onClick={e => { e.stopPropagation(); setCompare(isCompared ? null : c.id) }}
                          style={{ fontSize:10, padding:'2px 7px', borderRadius:6, border:`1px solid ${isCompared?'#4F8EF7':'rgba(0,0,0,.1)'}`,
                            background: isCompared?'rgba(79,142,247,.1)':'transparent',
                            color: isCompared?'#4F8EF7':'#ccc', cursor:'pointer', fontWeight:700 }}>
                          ⊞
                        </button>
                        <motion.span
                          animate={{ scale: isCopied ? [1.2,1] : 1 }}
                          style={{ fontSize:10, fontWeight:700, color: isCopied ? '#22c55e' : '#bbb', minWidth:40, textAlign:'right' }}>
                          {isCopied ? '✓ Copied' : 'Copy'}
                        </motion.span>
                      </div>
                    </motion.div>
                  )
                })}
                {filtered.length === 0 && (
                  <div style={{ textAlign:'center', padding:20, color:'#bbb', fontSize:13 }}>
                    No cases match "{filter}"
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div key="empty" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
              style={{ textAlign:'center', padding:'40px 24px', color:'#ccc', fontSize:14, fontWeight:300 }}>
              <motion.div animate={{y:[0,-6,0]}} transition={{duration:3,repeat:Infinity,ease:'easeInOut'}}
                style={{ fontSize:44, marginBottom:12 }}>✏️</motion.div>
              <p style={{margin:0}}>Enter text above to see all {CASES.length} case conversions</p>
              <p style={{margin:'6px 0 0',fontSize:12,color:'#ddd'}}>Click any result to copy · ⊞ to compare side-by-side</p>
            </motion.div>
          )}
        </AnimatePresence>
      </ToolCard>

      {/* ── AI CODE IDENTIFIER & TS INTERFACE STUDIO ── */}
      <ToolCard style={{ marginTop: 18 }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 14, flexWrap: 'wrap', gap: 10
        }}>
          <div>
            <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 16, color: '#0d0d1a', display: 'flex', alignItems: 'center', gap: 7 }}>
              <span>🤖</span> AI Code Identifier & TypeScript Studio
            </div>
            <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
              Translate plain-English concepts into production-grade variable names, function signatures, and TypeScript interfaces.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setAiCodeOpen(o => !o)}
            className="btn btn-sm btn-outline"
            style={{ fontSize: 12, padding: '6px 14px', borderRadius: 8, fontWeight: 600 }}
          >
            {aiCodeOpen ? 'Hide Studio ▲' : '✨ Open AI Studio ▼'}
          </button>
        </div>

        {aiCodeOpen && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <input
                className="inp"
                value={aiCodeText}
                onChange={e => setAiCodeText(e.target.value)}
                placeholder={input.trim() ? `Concept: "${input.slice(0, 50)}"` : 'e.g. calculate discounted total with tax rates'}
                style={{ flex: 1, minWidth: 260, fontSize: 13 }}
                onKeyDown={e => e.key === 'Enter' && handleGenerateIdentifiers()}
              />
              <button
                type="button"
                onClick={handleGenerateIdentifiers}
                disabled={aiCodeLoading || (!aiCodeText.trim() && !input.trim())}
                className="btn btn-primary"
                style={{ padding: '8px 18px', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {aiCodeLoading ? (
                  <>
                    <span className="spinner-border spinner-border-sm" />
                    <span>Analyzing...</span>
                  </>
                ) : (
                  <>
                    <span>✨</span>
                    <span>Generate Code Names</span>
                  </>
                )}
              </button>
            </div>

            {/* Quick Ideas */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Try concepts:</span>
              {[
                'calculate monthly billing with tax',
                'user auth session payload with expiry',
                'download processed video thumbnail'
              ].map(concept => (
                <button
                  key={concept}
                  type="button"
                  onClick={() => { setAiCodeText(concept); }}
                  className="btn btn-sm btn-outline"
                  style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6 }}
                >
                  {concept}
                </button>
              ))}
            </div>

            {aiCodeError && (
              <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#ef4444', fontSize: 12, marginBottom: 14 }}>
                ⚠️ {aiCodeError}
              </div>
            )}

            {aiIdentifiers && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
              >
                {/* Identifier naming grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
                  {[
                    { label: 'camelCase', val: aiIdentifiers.camelCase },
                    { label: 'snake_case', val: aiIdentifiers.snake_case },
                    { label: 'PascalCase', val: aiIdentifiers.pascalCase },
                    { label: 'kebab-case', val: aiIdentifiers.kebabCase },
                    { label: 'CONSTANT_CASE', val: aiIdentifiers.constantCase }
                  ].map(idItem => (
                    <div
                      key={idItem.label}
                      onClick={() => copyCodeValue(idItem.label, idItem.val)}
                      style={{
                        padding: '10px 12px',
                        background: '#f8f9ff',
                        border: '1px solid rgba(79,142,247,0.18)',
                        borderRadius: 10,
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>{idItem.label}</span>
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: copiedKey === idItem.label ? '#22c55e' : '#4F8EF7' }}>
                          {copiedKey === idItem.label ? '✓ Copied' : 'Copy'}
                        </span>
                      </div>
                      <code style={{ fontSize: 13, color: '#0d0d1a', fontFamily: 'monospace', fontWeight: 600 }}>
                        {idItem.val || '—'}
                      </code>
                    </div>
                  ))}
                </div>

                {/* Function Signature */}
                {aiIdentifiers.functionSignature && (
                  <div style={{ padding: '12px 14px', background: '#0d0d1a', borderRadius: 10, color: '#e2e8f0', position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>⚡ Idiomatic Function Signature</span>
                      <button
                        type="button"
                        onClick={() => copyCodeValue('sig', aiIdentifiers.functionSignature)}
                        style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', fontSize: 11, padding: '2px 8px', borderRadius: 4, cursor: 'pointer' }}
                      >
                        {copiedKey === 'sig' ? '✓ Copied' : '📋 Copy'}
                      </button>
                    </div>
                    <code style={{ fontFamily: 'monospace', fontSize: 12.5, color: '#38bdf8' }}>
                      {aiIdentifiers.functionSignature}
                    </code>
                  </div>
                )}

                {/* TypeScript Interface */}
                {aiIdentifiers.tsInterface && (
                  <div style={{ padding: '12px 14px', background: '#0d0d1a', borderRadius: 10, color: '#e2e8f0', position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>🔷 TypeScript Interface Definition</span>
                      <button
                        type="button"
                        onClick={() => copyCodeValue('ts', aiIdentifiers.tsInterface)}
                        style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', fontSize: 11, padding: '2px 8px', borderRadius: 4, cursor: 'pointer' }}
                      >
                        {copiedKey === 'ts' ? '✓ Copied' : '📋 Copy'}
                      </button>
                    </div>
                    <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: 12, color: '#a7f3d0', whiteSpace: 'pre-wrap' }}>
                      {aiIdentifiers.tsInterface}
                    </pre>
                  </div>
                )}

                {/* Explanation */}
                {aiIdentifiers.explanation && (
                  <div style={{ fontSize: 11.5, color: '#64748b', fontStyle: 'italic' }}>
                    💡 {aiIdentifiers.explanation}
                  </div>
                )}
              </motion.div>
            )}
          </div>
        )}
      </ToolCard>

      {/* AI Rewriter */}
      {input.trim().length > 20 && <RewritePanel text={input}/>}

    </ToolShell>
  )
}

