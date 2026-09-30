// Reusable AI panel component used across all ToolDesk tools
// Connects to /.netlify/functions/groq-ai via useGroqAI hook

import React, { useState, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useCopy } from '../hooks'
import { useGroqAI, AI_GRADIENT } from '../hooks/useGroqAI'
import { AITypewriterText } from './AITypewriterText'

/* ── Shared styles ── */
const S = {
  panel: {
    marginTop: 18,
    borderRadius: 18,
    border: '1px solid rgba(124,58,237,.16)',
    background: '#ffffff',
    boxShadow: '0 8px 32px rgba(124,58,237,.06), 0 1px 2px rgba(0,0,0,.02)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '14px 18px',
    borderBottom: '1px solid rgba(124,58,237,.1)',
    background: '#faf5ff',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,.98)',
  },
  icon: {
    width: 36, height: 36, borderRadius: 10, background: AI_GRADIENT,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 18, flexShrink: 0,
    boxShadow: '0 4px 14px rgba(124,58,237,.28), inset 0 1px 0 rgba(255,255,255,.35)',
  },
  body: { padding: '16px 18px' },
  runBtn: (disabled) => ({
    width: '100%', padding: '12px', borderRadius: 12, border: 'none',
    background: disabled ? '#e5e7eb' : AI_GRADIENT,
    color: disabled ? '#aaa' : '#fff',
    fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 14.5,
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    boxShadow: disabled ? 'none' : '0 6px 20px rgba(124,58,237,.28), inset 0 1px 0 rgba(255,255,255,.25)',
    transition: 'all .18s', marginBottom: 0,
  }),
  result: {
    background: '#f8fafc',
    border: '1px solid rgba(124,58,237,.14)',
    borderRadius: 14, padding: '14px 16px', marginTop: 14,
    boxShadow: '0 4px 20px rgba(0,0,0,.03)',
  },
  errorBox: {
    padding: '10px 14px', background: 'rgba(239,68,68,.06)',
    border: '1px solid rgba(239,68,68,.18)', borderRadius: 10,
    fontSize: 13, color: '#b91c1c', marginTop: 10, lineHeight: 1.65,
    transition: 'opacity 0.2s ease',
  },
  pillBtn: (active) => ({
    padding: '6px 14px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
    border: `1px solid ${active ? '#7C3AED' : 'rgba(0,0,0,.08)'}`,
    background: active ? 'rgba(124,58,237,.12)' : '#ffffff',
    color: active ? '#7C3AED' : '#475569',
    boxShadow: active ? '0 2px 8px rgba(124,58,237,.15)' : '0 1px 2px rgba(0,0,0,.02)',
    transition: 'all .15s',
  }),
}

/* ── Spinner / Thinking dots ── */
const Spin = () => (
  <span className="ai-thinking-dots" style={{ marginRight: 6 }}>
    <span className="ai-thinking-dot" style={{ background: '#ffffff', width: 4, height: 4 }} />
    <span className="ai-thinking-dot" style={{ background: '#ffffff', width: 4, height: 4 }} />
    <span className="ai-thinking-dot" style={{ background: '#ffffff', width: 4, height: 4 }} />
  </span>
)

/* ── Copy button ── */
function CopyBtn({ text, style = {} }) {
  const [copied, copy] = useCopy(1400)
  return (
    <button onClick={() => copy(text)}
      style={{padding:'4px 12px',borderRadius:999,fontSize:12,fontWeight:700,cursor:'pointer',
        border:`1px solid ${copied?'rgba(34,197,94,.3)':'rgba(124,58,237,.25)'}`,
        background:copied?'rgba(34,197,94,.12)':'rgba(124,58,237,.08)',
        boxShadow:'inset 0 1px 0 rgba(255,255,255,0.7)',
        color:copied?'#22c55e':'#7C3AED',transition:'all .18s',...style}}>
      {copied ? '✓ Copied' : '📋 Copy'}
    </button>
  )
}

/* ── Result text block with typewriter progressive reveal ── */
function ResultText({ label, text, mono = false }) {
  if (!text) return null
  return (
    <motion.div initial={{opacity:0,y:5}} animate={{opacity:1,y:0}} style={S.result}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
        <span style={{fontSize:12,fontWeight:700,color:'#7C3AED',
          textTransform:'uppercase',letterSpacing:'.5px'}}>{label}</span>
        <CopyBtn text={text}/>
      </div>
      <div style={{fontSize:13.5,color:'#1a1a2e',lineHeight:1.85,
        fontFamily:mono?'monospace':'DM Sans,sans-serif',
        whiteSpace:'pre-line',wordBreak:'break-word'}}>
        <AITypewriterText text={text} speed={25} />
      </div>
    </motion.div>
  )
}

/* ── Chip list result ── */
function ResultChips({ label, items, color = '#4F8EF7' }) {
  if (!items?.length) return null
  return (
    <motion.div initial={{opacity:0,y:5}} animate={{opacity:1,y:0}} style={S.result}>
      <div style={{fontSize:12,fontWeight:700,color:'#7C3AED',
        textTransform:'uppercase',letterSpacing:'.5px',marginBottom:10}}>{label}</div>
      <div style={{display:'flex',flexWrap:'wrap',gap:7}}>
        {items.map((item,i) => (
          <motion.span key={i} initial={{opacity:0,y:4}} animate={{opacity:1,y:0}}
            transition={{delay:i*.035}}
            style={{padding:'5px 13px',borderRadius:999,fontSize:12.5,fontWeight:600,
              background:`${color}12`,color,border:`1px solid ${color}25`,cursor:'default'}}>
            {typeof item === 'string' ? item : item.text || JSON.stringify(item)}
          </motion.span>
        ))}
      </div>
    </motion.div>
  )
}

/* ══════════════════════════════════════
   1. SUMMARIZE PANEL (Word Counter)
══════════════════════════════════════ */
export const SummarizePanel = memo(function SummarizePanel({ text }) {
  const ai = useGroqAI()
  const [style, setStyle] = useState('concise')
  const canRun = text?.trim().length > 50

  return (
    <div style={S.panel}>
      <div style={S.header}>
        <div style={S.icon}>✨</div>
        <div>
          <div style={{fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:14.5,color:'#0d0d1a'}}>AI Analysis</div>
          <div style={{fontSize:12.5,color:'#64748b',marginTop:2}}>Powered by Groq Ultra-Fast AI</div>
        </div>
      </div>
      <div style={S.body}>
        <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}>
          {[{v:'concise',l:'Concise'},{v:'bullets',l:'Bullet Points'},{v:'headline',l:'Headline'},
            {v:'detailed',l:'Detailed'},{v:'eli5',l:'Simple'},{v:'professional',l:'Executive'}].map(o=>(
            <button key={o.v} onClick={()=>setStyle(o.v)}
              style={S.pillBtn(style===o.v)}>
              {o.l}
            </button>
          ))}
        </div>
        <motion.button whileHover={canRun&&!ai.loading?{scale:1.01,y:-1}:{}}
          whileTap={{scale:.97}} onClick={()=>ai.run('summarize',{text,style})}
          disabled={!canRun||ai.loading} style={S.runBtn(!canRun||ai.loading)}>
          {ai.loading ? <><Spin/> Analysing…</> : '✨ Summarize with AI'}
        </motion.button>
        {ai.error && <div style={S.errorBox}>⚠️ {ai.error}</div>}
        <AnimatePresence>
          {(ai.streamedResult?.summary || ai.result?.summary) && <ResultText label="✨ AI Summary" text={ai.streamedResult?.summary || ai.result?.summary}/>}
        </AnimatePresence>
      </div>
    </div>
  )
})

/* ══════════════════════════════════════
   2. REWRITE PANEL (Text Case Converter)
══════════════════════════════════════ */
export const RewritePanel = memo(function RewritePanel({ text }) {
  const ai = useGroqAI()
  const [mode, setMode] = useState('formal')
  const canRun = text?.trim().length > 20

  const MODES = [
    {v:'formal',l:'Formal'},    {v:'casual',l:'Casual'},
    {v:'persuasive',l:'Persuasive'}, {v:'concise',l:'Concise'},
    {v:'expand',l:'Expand'},    {v:'academic',l:'Academic'},
    {v:'creative',l:'Creative'},{v:'active',l:'Active Voice'},
    {v:'empathetic',l:'Empathetic'},
  ]

  return (
    <div style={S.panel}>
      <div style={S.header}>
        <div style={S.icon}>✍️</div>
        <div>
          <div style={{fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:14.5,color:'#0d0d1a'}}>AI Rewriter</div>
          <div style={{fontSize:12.5,color:'#64748b',marginTop:2}}>Restyle your text instantly</div>
        </div>
      </div>
      <div style={S.body}>
        <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}>
          {MODES.map(o=>(
            <button key={o.v} onClick={()=>setMode(o.v)}
              style={S.pillBtn(mode===o.v)}>
              {o.l}
            </button>
          ))}
        </div>
        <motion.button whileHover={canRun&&!ai.loading?{scale:1.01,y:-1}:{}} whileTap={{scale:.97}}
          onClick={()=>ai.run('rewrite',{text,mode})} disabled={!canRun||ai.loading}
          style={S.runBtn(!canRun||ai.loading)}>
          {ai.loading ? <><Spin/> Rewriting…</> : `✍️ Rewrite as ${MODES.find(m=>m.v===mode)?.l}`}
        </motion.button>
        {ai.error && <div style={S.errorBox}>⚠️ {ai.error}</div>}
        <AnimatePresence>
          {(ai.streamedResult?.rewritten || ai.result?.rewritten) && <ResultText label="✍️ Rewritten Text" text={ai.streamedResult?.rewritten || ai.result?.rewritten}/>}
        </AnimatePresence>
      </div>
    </div>
  )
})

/* ══════════════════════════════════════
   3. SMART REPLACE PANEL (Word Replacer)
══════════════════════════════════════ */
export const SmartReplacePanel = memo(function SmartReplacePanel({ text, find, onSuggestionPick }) {
  const ai = useGroqAI()
  const [goal, setGoal] = useState('improve')
  const canRun = text?.trim().length > 10 && find?.trim().length > 0

  const GOALS = [
    {v:'improve',l:'Improve'}, {v:'simplify',l:'Simplify'},
    {v:'formal',l:'Formal'},   {v:'casual',l:'Casual'},
    {v:'synonym',l:'Synonym'}, {v:'creative',l:'Creative'},
  ]

  return (
    <div style={S.panel}>
      <div style={S.header}>
        <div style={S.icon}>🔮</div>
        <div>
          <div style={{fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:14.5,color:'#0d0d1a'}}>AI Suggestions</div>
          <div style={{fontSize:12.5,color:'#64748b',marginTop:2}}>
            {find ? `Alternatives for: "${find.slice(0,30)}"` : 'Enter a word to replace above'}
          </div>
        </div>
      </div>
      <div style={S.body}>
        <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}>
          {GOALS.map(g=>(
            <button key={g.v} onClick={()=>setGoal(g.v)}
              style={S.pillBtn(goal===g.v)}>
              {g.l}
            </button>
          ))}
        </div>
        <motion.button whileHover={canRun&&!ai.loading?{scale:1.01,y:-1}:{}} whileTap={{scale:.97}}
          onClick={()=>ai.run('smartReplace',{text,target:find,goal})}
          disabled={!canRun||ai.loading} style={S.runBtn(!canRun||ai.loading)}>
          {ai.loading ? <><Spin/> Finding alternatives…</> : '🔮 Get AI Suggestions'}
        </motion.button>
        {ai.error && <div style={S.errorBox}>⚠️ {ai.error}</div>}
        <AnimatePresence>
          {(ai.streamedResult?.suggestions || ai.result?.suggestions)?.length > 0 && (
            <motion.div initial={{opacity:0,y:5}} animate={{opacity:1,y:0}} style={S.result}>
              <div style={{fontSize:11.5,fontWeight:700,color:'#7C3AED',
                textTransform:'uppercase',letterSpacing:'.5px',marginBottom:10}}>
                🔮 Click to use
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:7}}>
                {(ai.streamedResult?.suggestions || ai.result?.suggestions).map((s,i)=>(
                  <motion.button key={i} initial={{opacity:0,x:-6}} animate={{opacity:1,x:0}}
                    transition={{delay:i*.06}}
                    onClick={()=>onSuggestionPick?.(s)}
                    style={{padding:'9px 14px',borderRadius:10,textAlign:'left',cursor:'pointer',
                      border:'1.5px solid rgba(124,58,237,.15)',
                      background:'rgba(255,255,255,.8)',
                      fontSize:13.5,fontWeight:600,color:'#333',
                      display:'flex',justifyContent:'space-between',alignItems:'center',
                      transition:'all .15s'}}
                    onMouseEnter={e=>{e.currentTarget.style.background='rgba(124,58,237,.08)';e.currentTarget.style.borderColor='rgba(124,58,237,.4)'}}
                    onMouseLeave={e=>{e.currentTarget.style.background='rgba(255,255,255,.8)';e.currentTarget.style.borderColor='rgba(124,58,237,.15)'}}>
                    {s}
                    <span style={{fontSize:12,color:'#64748b',fontWeight:500,fontFamily:'DM Sans,sans-serif'}}>click to apply →</span>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
})

/* ══════════════════════════════════════
   4. QUOTE GENERATOR PANEL
══════════════════════════════════════ */
export const AIQuotePanel = memo(function AIQuotePanel({ onQuotesAdd }) {
  const ai = useGroqAI()
  const [topic, setTopic] = useState('')
  const [style, setStyle] = useState('inspirational')
  const [count, setCount] = useState(3)

  const STYLES = [
    {v:'inspirational',l:'Inspirational'}, {v:'philosophical',l:'Philosophical'},
    {v:'humorous',l:'Humorous'},           {v:'stoic',l:'Stoic'},
    {v:'poetic',l:'Poetic'},               {v:'business',l:'Business'},
    {v:'scientific',l:'Scientific'},
  ]

  const handleGenerate = async () => {
    const res = await ai.run('generateQuote', { topic, style, count })
    if (res?.quotes?.length && onQuotesAdd) onQuotesAdd(res.quotes)
  }

  return (
    <div style={S.panel}>
      <div style={S.header}>
        <div style={S.icon}>💭</div>
        <div>
          <div style={{fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:14.5,color:'#0d0d1a'}}>AI Quote Generator</div>
          <div style={{fontSize:12.5,color:'#64748b',marginTop:2}}>Generate original quotes on any topic</div>
        </div>
      </div>
      <div style={S.body}>
        <div style={{marginBottom:12}}>
          <label style={{display:'block',fontSize:11.5,fontWeight:700,color:'#666',
            textTransform:'uppercase',letterSpacing:'.5px',marginBottom:6}}>Topic (optional)</label>
          <input className="inp" value={topic} onChange={e=>setTopic(e.target.value)}
            placeholder="e.g. courage, perseverance, technology…"
            onKeyDown={e=>e.key==='Enter'&&handleGenerate()}/>
        </div>
        <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}>
          {STYLES.map(s=>(
            <button key={s.v} onClick={()=>setStyle(s.v)}
              style={S.pillBtn(style===s.v)}>
              {s.l}
            </button>
          ))}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
          <span style={{fontSize:12.5,color:'#666',fontWeight:500,whiteSpace:'nowrap'}}>Generate</span>
          <select className="inp sel" value={count} onChange={e=>setCount(+e.target.value)}
            style={{flex:1,fontSize:13,marginBottom:0}}>
            {[1,3,5,7,10].map(n=><option key={n} value={n}>{n} quote{n>1?'s':''}</option>)}
          </select>
        </div>
        <motion.button whileHover={!ai.loading?{scale:1.01,y:-1}:{}} whileTap={{scale:.97}}
          onClick={handleGenerate} disabled={ai.loading} style={S.runBtn(ai.loading)}>
          {ai.loading ? <><Spin/> Generating…</> : '💭 Generate Quotes'}
        </motion.button>
        {ai.error && <div style={S.errorBox}>⚠️ {ai.error}</div>}
        <AnimatePresence>
          {ai.result?.quotes?.length > 0 && (
            <motion.div initial={{opacity:0,y:5}} animate={{opacity:1,y:0}} style={{...S.result,marginTop:14}}>
              <div style={{fontSize:11.5,fontWeight:700,color:'#7C3AED',
                textTransform:'uppercase',letterSpacing:'.5px',marginBottom:12}}>
                💭 Generated Quotes
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                {ai.result.quotes.map((q,i)=>(
                  <motion.div key={i} initial={{opacity:0,y:6}} animate={{opacity:1,y:0}}
                    transition={{delay:i*.07}}
                    style={{padding:'12px 14px',borderRadius:11,
                      background:'rgba(124,58,237,.04)',
                      border:'1px solid rgba(124,58,237,.12)'}}>
                    <div style={{fontSize:14,color:'#1a1a2e',lineHeight:1.78,
                      fontStyle:'italic',marginBottom:6}}>"{q.text}"</div>
                    <div style={{fontSize:12.5,color:'#888',fontWeight:600}}>{q.author}</div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
})

/* ══════════════════════════════════════
   5. PASSPHRASE PANEL (Password Generator)
══════════════════════════════════════ */
export const PassphrasePanel = memo(function PassphrasePanel({ onSelect }) {
  const ai = useGroqAI()
  const [topic, setTopic] = useState('')
  const [style, setStyle] = useState('memorable')
  const [wordCount, setWordCount] = useState(4)

  return (
    <div style={S.panel}>
      <div style={S.header}>
        <div style={S.icon}>🧠</div>
        <div>
          <div style={{fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:14.5,color:'#0d0d1a'}}>AI Passphrases</div>
          <div style={{fontSize:12.5,color:'#64748b',marginTop:2}}>Memorable, secure, AI-crafted</div>
        </div>
      </div>
      <div style={S.body}>
        <div style={{marginBottom:12}}>
          <label style={{display:'block',fontSize:11.5,fontWeight:700,color:'#666',
            textTransform:'uppercase',letterSpacing:'.5px',marginBottom:6}}>Theme (optional)</label>
          <input className="inp" value={topic} onChange={e=>setTopic(e.target.value)}
            placeholder="e.g. space, coffee, mountains…"/>
        </div>
        <div style={{display:'flex',gap:8,marginBottom:12}}>
          <div style={{flex:1}}>
            <label style={{display:'block',fontSize:11.5,fontWeight:700,color:'#666',
              textTransform:'uppercase',letterSpacing:'.5px',marginBottom:6}}>Style</label>
            <select className="inp sel" value={style} onChange={e=>setStyle(e.target.value)}>
              {[{v:'memorable',l:'Memorable'},{v:'story',l:'Story'},{v:'technical',l:'Technical'},
                {v:'nature',l:'Nature'},{v:'abstract',l:'Abstract'}].map(o=>(
                <option key={o.v} value={o.v}>{o.l}</option>
              ))}
            </select>
          </div>
          <div style={{flex:1}}>
            <label style={{display:'block',fontSize:11.5,fontWeight:700,color:'#666',
              textTransform:'uppercase',letterSpacing:'.5px',marginBottom:6}}>Word Count</label>
            <select className="inp sel" value={wordCount} onChange={e=>setWordCount(+e.target.value)}>
              {[3,4,5,6,7,8].map(n=><option key={n} value={n}>{n} words</option>)}
            </select>
          </div>
        </div>
        <motion.button whileHover={!ai.loading?{scale:1.01,y:-1}:{}} whileTap={{scale:.97}}
          onClick={()=>ai.run('passphrase',{topic,style,wordCount})} disabled={ai.loading}
          style={S.runBtn(ai.loading)}>
          {ai.loading ? <><Spin/> Generating…</> : '🧠 Generate Passphrases'}
        </motion.button>
        {ai.error && <div style={S.errorBox}>⚠️ {ai.error}</div>}
        <AnimatePresence>
          {ai.result?.passphrases?.length > 0 && (
            <motion.div initial={{opacity:0,y:5}} animate={{opacity:1,y:0}} style={{...S.result,marginTop:14}}>
              <div style={{fontSize:11.5,fontWeight:700,color:'#7C3AED',
                textTransform:'uppercase',letterSpacing:'.5px',marginBottom:10}}>
                🧠 Click to use
              </div>
              {ai.result.passphrases.map((p,i)=>(
                <motion.button key={i} initial={{opacity:0,x:-6}} animate={{opacity:1,x:0}}
                  transition={{delay:i*.06}}
                  onClick={()=>onSelect?.(p)}
                  style={{width:'100%',marginBottom:7,padding:'10px 14px',borderRadius:10,
                    textAlign:'left',cursor:'pointer',display:'flex',
                    justifyContent:'space-between',alignItems:'center',
                    border:'1.5px solid rgba(124,58,237,.15)',background:'rgba(255,255,255,.9)',
                    fontFamily:'monospace',fontSize:14,fontWeight:600,color:'#1a1a2e',
                    transition:'all .15s'}}
                  onMouseEnter={e=>{e.currentTarget.style.background='rgba(124,58,237,.07)';e.currentTarget.style.borderColor='rgba(124,58,237,.4)'}}
                  onMouseLeave={e=>{e.currentTarget.style.background='rgba(255,255,255,.9)';e.currentTarget.style.borderColor='rgba(124,58,237,.15)'}}>
                  {p}
                  <span style={{fontSize:12,color:'#64748b',fontWeight:500,fontFamily:'DM Sans,sans-serif'}}>use →</span>
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
})

/* ══════════════════════════════════════
   6. DOC SUMMARY PANEL (PDF Toolkit)
══════════════════════════════════════ */
export const DocSummaryPanel = memo(function DocSummaryPanel({ text }) {
  const ai = useGroqAI()
  const [format, setFormat] = useState('executive')
  const canRun = text?.trim().length > 100

  return (
    <div style={S.panel}>
      <div style={S.header}>
        <div style={S.icon}>📋</div>
        <div>
          <div style={{fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:14.5,color:'#0d0d1a'}}>AI Document Summary</div>
          <div style={{fontSize:12.5,color:'#64748b',marginTop:2}}>{canRun ? 'Text ready for analysis' : 'Paste or extract text above first'}</div>
        </div>
      </div>
      <div style={S.body}>
        <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}>
          {[{v:'executive',l:'Executive'},{v:'bullets',l:'Key Points'},{v:'detailed',l:'Detailed'},{v:'abstract',l:'Abstract'}].map(f=>(
            <button key={f.v} onClick={()=>setFormat(f.v)}
              style={S.pillBtn(format===f.v)}>
              {f.l}
            </button>
          ))}
        </div>
        <motion.button whileHover={canRun&&!ai.loading?{scale:1.01,y:-1}:{}} whileTap={{scale:.97}}
          onClick={()=>ai.run('docSummary',{text,format})} disabled={!canRun||ai.loading}
          style={S.runBtn(!canRun||ai.loading)}>
          {ai.loading ? <><Spin/> Summarising…</> : '📋 Summarise Document'}
        </motion.button>
        {ai.error && <div style={S.errorBox}>⚠️ {ai.error}</div>}
        <AnimatePresence>
          {(ai.streamedResult?.summary || ai.result?.summary) && <ResultText label="📋 AI Summary" text={ai.streamedResult?.summary || ai.result?.summary}/>}
        </AnimatePresence>
      </div>
    </div>
  )
})

/* ══════════════════════════════════════
   7. UNIT EXPLAIN PANEL (Unit Converter)
══════════════════════════════════════ */
export const UnitExplainPanel = memo(function UnitExplainPanel({ from, to, value, result, category }) {
  const ai = useGroqAI()
  const canRun = !!(from && to && value && result && result !== '—')

  return (
    <div style={S.panel}>
      <div style={S.header}>
        <div style={S.icon}>💡</div>
        <div>
          <div style={{fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:14.5,color:'#0d0d1a'}}>AI Explanation</div>
          <div style={{fontSize:12.5,color:'#64748b',marginTop:2}}>Understand the conversion in real-world terms</div>
        </div>
      </div>
      <div style={S.body}>
        <motion.button whileHover={canRun&&!ai.loading?{scale:1.01,y:-1}:{}} whileTap={{scale:.97}}
          onClick={()=>ai.run('explainUnit',{from,to,value,result,category})}
          disabled={!canRun||ai.loading} style={S.runBtn(!canRun||ai.loading)}>
          {ai.loading
            ? <><Spin/> Explaining…</>
            : canRun
              ? `💡 Explain: ${value} ${from} → ${result} ${to}`
              : '💡 Convert something above first'}
        </motion.button>
        {ai.error && <div style={S.errorBox}>⚠️ {ai.error}</div>}
        <AnimatePresence>
          {(ai.streamedResult?.explanation || ai.result?.explanation) && <ResultText label="💡 Real-world context" text={ai.streamedResult?.explanation || ai.result?.explanation}/>}
        </AnimatePresence>
      </div>
    </div>
  )
})

/* ══════════════════════════════════════
   8. SEO SUGGESTIONS PANEL (Website Analyzer)
══════════════════════════════════════ */
export const SEOSuggestPanel = memo(function SEOSuggestPanel({ data }) {
  const ai = useGroqAI()
  const canRun = !!(data?.title || data?.url)

  const PRIORITY_COLORS = { high:'#ef4444', medium:'#f59e0b', low:'#22c55e' }
  const PRIORITY_BG     = { high:'rgba(239,68,68,.06)', medium:'rgba(245,158,11,.06)', low:'rgba(34,197,94,.06)' }

  return (
    <div style={S.panel}>
      <div style={S.header}>
        <div style={S.icon}>🎯</div>
        <div>
          <div style={{fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:14.5,color:'#0d0d1a'}}>AI SEO Recommendations</div>
          <div style={{fontSize:12.5,color:'#64748b',marginTop:2}}>5 specific actions ranked by impact</div>
        </div>
      </div>
      <div style={S.body}>
        <motion.button whileHover={canRun&&!ai.loading?{scale:1.01,y:-1}:{}} whileTap={{scale:.97}}
          onClick={()=>ai.run('seoSuggest',{
            title: data?.title,
            description: data?.metaDesc || data?.description || '',
            h1: data?.h1 || (Array.isArray(data?.h1s) ? data.h1s[0] : '') || '',
            h2Count: data?.h2Count ?? (Array.isArray(data?.h2s) ? data.h2s.length : (data?.h2 || 0)),
            issues: data?.seoIssues || (Array.isArray(data?.seoChecks) ? data.seoChecks.filter(c=>!c.pass).map(c=>c.name) : []),
            url: data?.url,
            score: data?.seoScore
          })} disabled={!canRun||ai.loading} style={S.runBtn(!canRun||ai.loading)}>
          {ai.loading ? <><Spin/> Analysing SEO…</> : '🎯 Get AI SEO Recommendations'}
        </motion.button>
        {ai.error && <div style={S.errorBox}>⚠️ {ai.error}</div>}
        <AnimatePresence>
          {ai.result?.suggestions?.length > 0 && (
            <motion.div initial={{opacity:0,y:5}} animate={{opacity:1,y:0}} style={{marginTop:14}}>
              {ai.result.suggestions.map((s,i)=>(
                <motion.div key={i} initial={{opacity:0,y:6}} animate={{opacity:1,y:0}}
                  transition={{delay:i*.07}}
                  style={{marginBottom:10,padding:'12px 14px',borderRadius:12,
                    background:PRIORITY_BG[s.priority]||'rgba(79,142,247,.05)',
                    border:`1px solid ${PRIORITY_COLORS[s.priority]||'#4F8EF7'}22`}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                    <span style={{fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:999,
                      background:PRIORITY_COLORS[s.priority]||'#4F8EF7',color:'#fff',
                      textTransform:'uppercase',letterSpacing:'.5px'}}>
                      {s.priority}
                    </span>
                    <span style={{fontSize:11.5,fontWeight:700,color:'#888',
                      textTransform:'uppercase',letterSpacing:'.4px'}}>
                      {s.category}
                    </span>
                  </div>
                  <div style={{fontSize:13.5,fontWeight:600,color:'#1a1a2e',marginBottom:5,lineHeight:1.55}}>
                    {s.action}
                  </div>
                  <div style={{fontSize:12.5,color:'#666',lineHeight:1.6}}>{s.impact}</div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
})


/* ══════════════════════════════════════
   9. DEEP WEB ANALYSIS PANEL (Website Analyzer)
══════════════════════════════════════ */
export const DeepWebPanel = memo(function DeepWebPanel({ data }) {
  const ai = useGroqAI()
  const canRun = !!(data?.url)

  const PRIORITY_BG = { high:'rgba(239,68,68,.07)', medium:'rgba(245,158,11,.07)', low:'rgba(34,197,94,.07)' }
  const PRIORITY_COL = { high:'#dc2626', medium:'#b45309', low:'#16a34a' }
  const EFFORT_COL = { hours:'#22c55e', days:'#f59e0b', weeks:'#ef4444' }

  return (
    <div style={S.panel}>
      <div style={S.header}>
        <div style={{...S.icon, fontSize:20}}>🧠</div>
        <div>
          <div style={{fontFamily:"Syne,sans-serif",fontWeight:700,fontSize:14.5,color:"#0d0d1a"}}>Deep AI Analysis</div>
          <div style={{fontSize:12.5,color:"#64748b",marginTop:2}}>Full strategic website report powered by Groq AI</div>
        </div>
      </div>
      <div style={S.body}>
        <motion.button whileHover={canRun&&!ai.loading?{scale:1.01,y:-1}:{}} whileTap={{scale:.97}}
          onClick={()=>ai.run("deepWebAnalysis",{data})} disabled={!canRun||ai.loading}
          style={S.runBtn(!canRun||ai.loading)}>
          {ai.loading ? <><Spin/> Analysing website deeply…</> : "🧠 Run Deep AI Analysis"}
        </motion.button>
        {ai.error && <div style={S.errorBox}>⚠️ {ai.error}</div>}
        <AnimatePresence>
          {ai.result?.analysis && (() => {
            const a = ai.result.analysis
            return (
              <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} style={{marginTop:14}}>
                {/* Executive Summary */}
                {a.executiveSummary && (
                  <div style={{...S.result,marginBottom:12}}>
                    <div style={{fontSize:11.5,fontWeight:700,color:"#7C3AED",textTransform:"uppercase",
                      letterSpacing:".5px",marginBottom:8}}>📋 Executive Summary</div>
                    <div style={{fontSize:13.5,color:"#1a1a2e",lineHeight:1.85}}>{a.executiveSummary}</div>
                  </div>
                )}
                {/* Verdict */}
                {a.overallVerdict && (
                  <div style={{padding:"10px 14px",marginBottom:12,borderRadius:10,
                    background:"linear-gradient(135deg,rgba(124,58,237,.07),rgba(79,142,247,.05))",
                    border:"1px solid rgba(124,58,237,.18)",fontSize:13.5,fontWeight:600,
                    color:"#1a1a2e",lineHeight:1.6}}>
                    🎯 {a.overallVerdict}
                  </div>
                )}
                {/* Strengths + Issues grid */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                  {a.strengths?.length > 0 && (
                    <div style={{...S.result,margin:0}}>
                      <div style={{fontSize:11.5,fontWeight:700,color:"#16a34a",textTransform:"uppercase",
                        letterSpacing:".5px",marginBottom:8}}>✅ Strengths</div>
                      {a.strengths.map((s,i)=>(
                        <motion.div key={i} initial={{opacity:0,x:-5}} animate={{opacity:1,x:0}}
                          transition={{delay:i*.05}}
                          style={{fontSize:13,color:"#166534",padding:"5px 0",
                            borderBottom:i<a.strengths.length-1?"1px solid rgba(34,197,94,.12)":"none",
                            lineHeight:1.58}}>
                          ✓ {s}
                        </motion.div>
                      ))}
                    </div>
                  )}
                  {a.criticalIssues?.length > 0 && (
                    <div style={{...S.result,margin:0}}>
                      <div style={{fontSize:11.5,fontWeight:700,color:"#dc2626",textTransform:"uppercase",
                        letterSpacing:".5px",marginBottom:8}}>🚨 Critical Issues</div>
                      {a.criticalIssues.map((s,i)=>(
                        <motion.div key={i} initial={{opacity:0,x:-5}} animate={{opacity:1,x:0}}
                          transition={{delay:i*.05}}
                          style={{fontSize:13,color:"#b91c1c",padding:"5px 0",
                            borderBottom:i<a.criticalIssues.length-1?"1px solid rgba(239,68,68,.12)":"none",
                            lineHeight:1.58}}>
                          ✗ {s}
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
                {/* Quick Wins */}
                {a.quickWins?.length > 0 && (
                  <div style={{...S.result,marginBottom:12}}>
                    <div style={{fontSize:11,fontWeight:700,color:"#4F8EF7",textTransform:"uppercase",
                      letterSpacing:".5px",marginBottom:8}}>⚡ Quick Wins</div>
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      {a.quickWins.map((w,i)=>(
                        <div key={i} style={{fontSize:12.5,color:"#1565c0",
                          background:"rgba(79,142,247,.06)",borderRadius:8,
                          padding:"7px 12px",lineHeight:1.55}}>⚡ {w}</div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Content + Tech Insights */}
                {(a.contentInsights || a.technicalHealth) && (
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                    {a.contentInsights && (
                      <div style={{...S.result,margin:0}}>
                        <div style={{fontSize:11.5,fontWeight:700,color:"#7C3AED",textTransform:"uppercase",
                          letterSpacing:".5px",marginBottom:6}}>📝 Content</div>
                        <div style={{fontSize:13,color:"#555",lineHeight:1.68}}>{a.contentInsights}</div>
                      </div>
                    )}
                    {a.technicalHealth && (
                      <div style={{...S.result,margin:0}}>
                        <div style={{fontSize:11.5,fontWeight:700,color:"#0891b2",textTransform:"uppercase",
                          letterSpacing:".5px",marginBottom:6}}>⚙️ Technical</div>
                        <div style={{fontSize:13,color:"#555",lineHeight:1.68}}>{a.technicalHealth}</div>
                      </div>
                    )}
                  </div>
                )}
                {/* Priority Actions */}
                {a.priorityActions?.length > 0 && (
                  <div style={S.result}>
                    <div style={{fontSize:11.5,fontWeight:700,color:"#7C3AED",textTransform:"uppercase",
                      letterSpacing:".5px",marginBottom:10}}>🎯 Priority Action Plan</div>
                    {a.priorityActions.map((p,i)=>(
                      <motion.div key={i} initial={{opacity:0,y:5}} animate={{opacity:1,y:0}}
                        transition={{delay:i*.07}}
                        style={{marginBottom:8,padding:"10px 13px",borderRadius:10,
                          background:PRIORITY_BG[p.impact]||"rgba(79,142,247,.05)",
                          border:`1px solid ${PRIORITY_COL[p.impact]||"#4F8EF7"}20`}}>
                        <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:5}}>
                          <span style={{fontSize:10.5,fontWeight:700,padding:"2px 8px",borderRadius:999,
                            background:PRIORITY_COL[p.impact]||"#4F8EF7",color:"#fff",
                            textTransform:"uppercase",letterSpacing:".4px"}}>
                            {p.impact}
                          </span>
                          <span style={{fontSize:10.5,fontWeight:600,color:"#888",
                            textTransform:"uppercase",letterSpacing:".3px"}}>{p.category}</span>
                          {p.effort && (
                            <span style={{marginLeft:"auto",fontSize:10.5,fontWeight:700,
                              color:EFFORT_COL[p.effort]||"#888"}}>⏱ {p.effort}</span>
                          )}
                        </div>
                        <div style={{fontSize:13.5,fontWeight:600,color:"#1a1a2e",lineHeight:1.55}}>{p.action}</div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            )
          })()}
        </AnimatePresence>
      </div>
    </div>
  )
})

/* ══════════════════════════════════════
   10. CONTRACT AUDITOR PANEL (PDF Toolkit)
══════════════════════════════════════ */
export const ContractAuditorPanel = memo(function ContractAuditorPanel({ text }) {
  const ai = useGroqAI()
  const [query, setQuery] = useState('')
  const canRun = text && text.trim().length > 60

  const handleAudit = () => {
    if (!canRun || ai.loading) return
    ai.run('contractAuditor', { text, query })
  }

  const audit = ai.result?.audit

  return (
    <div style={S.panel}>
      <div style={S.header}>
        <div style={S.icon}>⚖️</div>
        <div>
          <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 14.5, color: '#0d0d1a' }}>
            AI Contract & Legal Risk Auditor
          </div>
          <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 2 }}>
            {canRun ? 'Document ready for legal risk audit' : 'Load or OCR a document above to begin audit'}
          </div>
        </div>
      </div>
      <div style={S.body}>
        <div style={{ marginBottom: 12 }}>
          <input
            className="inp"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Ask a specific question (e.g. Does this contract auto-renew? What is the governing law?)"
            style={{ width: '100%', fontSize: 12.5 }}
            onKeyDown={e => e.key === 'Enter' && handleAudit()}
          />
        </div>

        <motion.button
          whileHover={canRun && !ai.loading ? { scale: 1.01, y: -1 } : {}}
          whileTap={{ scale: .97 }}
          onClick={handleAudit}
          disabled={!canRun || ai.loading}
          style={S.runBtn(!canRun || ai.loading)}
        >
          {ai.loading ? <><Spin /> Auditing Contract Risks…</> : '⚖️ Audit Contract & Identify Risks'}
        </motion.button>

        {ai.error && <div style={S.errorBox}>⚠️ {ai.error}</div>}

        <AnimatePresence>
          {audit && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              {/* Risk Level & Score */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', borderRadius: 10,
                background: audit.riskLevel === 'High' || audit.riskLevel === 'Critical' ? 'rgba(239,68,68,0.08)' : audit.riskLevel === 'Moderate' ? 'rgba(245,158,11,0.08)' : 'rgba(34,197,94,0.08)',
                border: `1px solid ${audit.riskLevel === 'High' || audit.riskLevel === 'Critical' ? 'rgba(239,68,68,0.25)' : audit.riskLevel === 'Moderate' ? 'rgba(245,158,11,0.25)' : 'rgba(34,197,94,0.25)'}`
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18 }}>{audit.riskLevel === 'Low' ? '🛡️' : audit.riskLevel === 'Moderate' ? '⚠️' : '🚨'}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0d0d1a' }}>Risk Assessment: {audit.riskLevel || 'Normal'}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>Overall calculated legal liability index</div>
                  </div>
                </div>
                <div style={{
                  fontSize: 16, fontWeight: 800, fontFamily: 'monospace',
                  color: audit.riskLevel === 'High' || audit.riskLevel === 'Critical' ? '#ef4444' : audit.riskLevel === 'Moderate' ? '#d97706' : '#16a34a'
                }}>
                  {audit.riskScore || 50}/100
                </div>
              </div>

              {/* Summary */}
              {audit.summary && (
                <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.6, padding: '10px 12px', background: '#f8f9ff', borderRadius: 8, border: '1px solid rgba(0,0,0,0.06)' }}>
                  <strong>Overview:</strong> {audit.summary}
                </div>
              )}

              {/* Answer to query if any */}
              {audit.answer && (
                <div style={{ fontSize: 13, color: '#1e1040', background: 'rgba(156,111,222,0.08)', border: '1px solid rgba(156,111,222,0.2)', padding: '10px 12px', borderRadius: 8 }}>
                  <strong>Q&A Answer:</strong> {audit.answer}
                </div>
              )}

              {/* Critical Clauses */}
              {Array.isArray(audit.criticalClauses) && audit.criticalClauses.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#0d0d1a', marginBottom: 6 }}>Critical Clauses & Liabilities:</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {audit.criticalClauses.map((clause, idx) => (
                      <div key={idx} style={{ padding: '8px 12px', borderRadius: 8, background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', fontSize: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                          <span style={{ fontWeight: 700, color: '#1e293b' }}>{clause.title}</span>
                          <span style={{
                            fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 700,
                            background: clause.risk === 'High' ? 'rgba(239,68,68,0.1)' : clause.risk === 'Medium' ? 'rgba(245,158,11,0.1)' : 'rgba(79,142,247,0.1)',
                            color: clause.risk === 'High' ? '#ef4444' : clause.risk === 'Medium' ? '#d97706' : '#2563eb'
                          }}>
                            {clause.risk || 'Info'} Risk
                          </span>
                        </div>
                        <div style={{ color: '#64748b', lineHeight: 1.5 }}>{clause.detail}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {Array.isArray(audit.recommendations) && audit.recommendations.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#0d0d1a', marginBottom: 6 }}>Strategic Recommendations:</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {audit.recommendations.map((rec, idx) => (
                      <div key={idx} style={{ fontSize: 12, color: '#334155', padding: '4px 0' }}>
                        ✓ {rec}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
})

export default {
  SummarizePanel, RewritePanel, SmartReplacePanel, AIQuotePanel,
  PassphrasePanel, DocSummaryPanel, UnitExplainPanel, SEOSuggestPanel, DeepWebPanel,
  ContractAuditorPanel,
}
