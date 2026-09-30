import React, { useState, useMemo, useRef, useCallback, useDeferredValue, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Type, Hash, Scissors, MessageSquare, Pilcrow, ArrowLeftRight, Lightbulb, BookOpen, FileText, Brain, Sparkles, RefreshCw, AlertCircle, CheckCircle2, ChevronRight, BarChart3, Feather, Search, Zap, Target, Volume2, Eye, Upload, Download, Copy, Check, Trash2 } from 'lucide-react'
import ToolShell, { ToolCard, Reveal } from '../../components/ToolShell'
import { useCopy } from '../../hooks'
import { TOOLS } from '../../constants'
import { SummarizePanel } from '../../components/AIPanel'
import { saveFileWithFallback } from '../../utils/fileSaver'
import { safeFetchJSON } from '../../utils/safeFetch'
import { addToHistory } from '../../utils/history'

const tool = TOOLS.find(t => t.id === 'wordcount')

const TIERS = [
  { label:'Tweet',      max:30,       color:'#26C6DA' },
  { label:'Caption',    max:150,      color:'#4F8EF7' },
  { label:'Short Post', max:500,      color:'#9C6FDE' },
  { label:'Blog Post',  max:1500,     color:'#F06292' },
  { label:'Long-Form',  max:5000,     color:'#FF9800' },
  { label:'Article+',   max:Infinity, color:'#22c55e' },
]

const STOP = new Set(['the','and','for','that','this','with','are','was','but','not','you','all',
  'have','from','they','will','one','had','her','him','his','she','been','who','its','how',
  'than','then','into','our','your','what','which','when','there','their','has','can','more',
  'also','out','about','were','would','could','should','these','those','just','very','even',
  'said','each','such','over','here','some','after','only','both','much','many','most','well',
  'any','may','like','back','time','know','take','good','make','want','look','use','way','get',
  'put','come','its','him','now','new','old','see','two','too','did','yes','let','got'])

const STAT_GREEN = '#22C55E'

function StatCard({ label, value, Icon }) {
  return (
    <motion.div
      initial={{ opacity:0, y:6 }}
      animate={{ opacity:1, y:0 }}
      whileHover={{ y:-4, boxShadow:'0 14px 30px rgba(34,197,94,.18), 0 2px 8px rgba(0,0,0,.25)' }}
      transition={{ type:'spring', stiffness:300, damping:26 }}
      style={{ background:'linear-gradient(160deg,#16161f 0%,#0c0c13 100%)',
        borderRadius:16, padding:'18px 12px', textAlign:'center',
        border:'1px solid rgba(255,255,255,.09)', cursor:'default',
        position:'relative', overflow:'hidden',
        boxShadow:'0 2px 10px rgba(0,0,0,.18), inset 0 1px 0 rgba(255,255,255,.12)', transition:'box-shadow .25s ease' }}>
      <div style={{ position:'absolute', inset:0, background:'radial-gradient(circle at 50% -10%, rgba(34,197,94,.10), transparent 60%)' }}/>
      <div style={{ position:'relative', width:32, height:32, margin:'0 auto 10px', borderRadius:10,
        background:'rgba(34,197,94,.12)', border:'1px solid rgba(34,197,94,.22)',
        display:'flex', alignItems:'center', justifyContent:'center' }}>
        <Icon size={15} strokeWidth={2.25} color={STAT_GREEN}/>
      </div>
      <div style={{ position:'relative', fontFamily:'Syne,sans-serif', fontSize:21, fontWeight:800, color:'#fff', lineHeight:1, letterSpacing:'-.2px' }}>{value}</div>
      <div style={{ position:'relative', fontSize:11, color:'rgba(255,255,255,.72)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.7px', marginTop:7 }}>{label}</div>
    </motion.div>
  )
}

function dlText(content, filename) {
  saveFileWithFallback(content, filename || 'document.txt', 'text/plain;charset=utf-8')
}

export default function WordCounter() {
  const [text,    setText]  = useState('')
  const deferredText = useDeferredValue(text)
  const [copied,  copy]     = useCopy()
  const [mode,    setMode]  = useState('stats')
  const [goal,    setGoal]  = useState('')
  const [showFind,setFind]  = useState(false)
  const [findQ,   setFindQ] = useState('')
  const [replaceQ,setReplQ] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [toneResult, setToneResult] = useState(null)
  const fileRef = useRef(null)

  const handleAuditTone = async () => {
    if (!text || text.trim().length < 10) {
      setAiError('Please enter at least 10 characters of text to audit tone and reading grade.')
      return
    }
    setAiLoading(true)
    setAiError('')
    try {
      const data = await safeFetchJSON('/.netlify/functions/groq-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'toneAuditor',
          payload: { text: text.trim().slice(0, 10000) }
        })
      })
      if (data?.error) throw new Error(data.error)
      if (!data?.toneAnalysis) throw new Error('No tone analysis returned')
      setToneResult(data.toneAnalysis)
    } catch (err) {
      setAiError(err?.message || 'Failed to audit tone. Please try again.')
    } finally {
      setAiLoading(false)
    }
  }

  const stats = useMemo(() => {
    if (!deferredText || deferredText.trim() === '') {
      return {
        words: 0, chars: 0, charsNoSpace: 0, sentences: 0, paragraphs: 0, lines: 0,
        readTime: '0s', speakTime: '0s', unique: 0, avgLen: '0.0', longest: '—',
        topWords: [], fre: 0, freLabel: 'Standard', freColor: '#22c55e',
        shortS: 0, midS: 0, longS: 0, pages: '0', lexDens: 0
      }
    }

    const trimmed = deferredText.trim()
    const wordArr = trimmed.split(/\s+/)
    const words = wordArr.length
    const chars = deferredText.length
    const charsNoSpace = deferredText.replace(/\s/g, '').length

    // Unified sentence tokenizer with consistent delimiter support (. ! ? …)
    const rawSentences = (deferredText.match(/[^.!?…\n]+[.!?…]*(?:\s+|$)/g) || []).map(s => s.trim()).filter(s => s.length > 0)
    const sentences = rawSentences.length || (trimmed.length > 0 ? 1 : 0)
    const paragraphs = deferredText.split(/\n\s*\n/).filter(p => p.trim().length > 0).length || 1
    const lines = deferredText.split('\n').length

    const readSec  = Math.round(words / (238/60))
    const speakSec = Math.round(words / (125/60))
    const fmt      = s => s < 60 ? `${s}s` : `${Math.floor(s/60)}m ${s%60>0?(s%60)+'s':''}`.trim()

    // Bounded sample analysis for high-volume text to protect browser event loop
    const sampleWords = words > 15000 ? wordArr.slice(0, 15000) : wordArr
    const cleaned = sampleWords.map(w => w.toLowerCase().replace(/[^a-z]/g,'')).filter(Boolean)
    const unique = new Set(cleaned).size
    const avgLen = words > 0 ? (charsNoSpace / words).toFixed(1) : '0.0'
    const longest = sampleWords.reduce((mx, w) => {
      const c = w.replace(/[^a-zA-Z]/g, '')
      return c.length > mx.length ? c : mx
    }, '')

    const freq = Object.create(null)
    cleaned.forEach(w => {
      if (w.length >= 3 && !STOP.has(w)) freq[w] = (freq[w] || 0) + 1
    })
    const topWords = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 15)

    // Syllables and Flesch Reading Ease
    const sampleCleaned = cleaned.slice(0, 5000)
    const sampleSyllables = sampleCleaned.reduce((acc, w) => {
      const vowelCount = (w.match(/[aeiouy]/gi) || []).length
      return acc + Math.max(1, vowelCount)
    }, 0)
    const syllablesPerWord = sampleCleaned.length > 0 ? sampleSyllables / sampleCleaned.length : 1.3
    const totalSyllables = Math.round(words * syllablesPerWord)

    const fre = words > 0 && sentences > 0
      ? Math.round(206.835 - 1.015 * (words / sentences) - 84.6 * (totalSyllables / words))
      : 0
    const freClamped = Math.max(0, Math.min(100, fre))
    const freLabel = freClamped >= 90 ? 'Very Easy' : freClamped >= 80 ? 'Easy' : freClamped >= 70 ? 'Fairly Easy' : freClamped >= 60 ? 'Standard' : freClamped >= 50 ? 'Fairly Hard' : freClamped >= 30 ? 'Hard' : 'Very Hard'
    const freColor = freClamped >= 70 ? '#22c55e' : freClamped >= 50 ? '#FF9800' : '#ef4444'

    // Single-pass sentence length categorization matching the sentence tokenizer
    let shortS = 0, midS = 0, longS = 0
    const sampleSentences = rawSentences.slice(0, 5000)
    for (const s of sampleSentences) {
      const wCount = s.split(/\s+/).length
      if (wCount <= 10) shortS++
      else if (wCount <= 20) midS++
      else longS++
    }
    if (rawSentences.length > 5000) {
      const ratio = rawSentences.length / 5000
      shortS = Math.round(shortS * ratio)
      midS = Math.round(midS * ratio)
      longS = Math.round(longS * ratio)
    }

    const pages = words > 0 ? (words / 250).toFixed(1) : '0'
    const lexDens = sampleWords.length > 0 ? Math.round((unique / sampleWords.length) * 100) : 0

    return {
      words, chars, charsNoSpace, sentences, paragraphs, lines,
      readTime: fmt(readSec), speakTime: fmt(speakSec),
      unique: words > 15000 ? `${unique}+` : unique,
      avgLen, longest, topWords,
      fre: freClamped, freLabel, freColor,
      shortS, midS, longS, pages, lexDens
    }
  }, [deferredText])

  const tier    = TIERS.find(t => stats.words <= t.max) ?? TIERS[TIERS.length-1]
  const tierIdx = TIERS.indexOf(tier)
  const prevMax = tierIdx > 0 ? TIERS[tierIdx-1].max : 0
  const thisMax = tier.max === Infinity ? prevMax+5000 : tier.max
  const tierPct = stats.words===0?0:Math.min(100,((stats.words-prevMax)/(thisMax-prevMax))*100)
  const goalNum = parseInt(goal)||0
  const goalPct = goalNum>0?Math.min(100,(stats.words/goalNum)*100):0

  const loadFile = useCallback(f => {
    if(!f) return
    if (f.size > 5 * 1024 * 1024) {
      alert('File is too large for client-side text analysis (max 5MB).')
      return
    }
    const r = new FileReader()
    r.onload = e => setText(e.target.result)
    r.readAsText(f)
  },[])

  const doReplace = useCallback(() => {
    if (!findQ || !findQ.trim()) return
    setText(t => t.split(findQ).join(replaceQ))
  }, [findQ, replaceQ])

  useEffect(() => {
    if (!stats.words || stats.words < 5) return
    const timer = setTimeout(() => {
      try {
        addToHistory({
          tool: 'Word Counter',
          label: `${stats.words.toLocaleString()} words`,
          value: `${stats.chars.toLocaleString()} chars · ${stats.sentences} sentences`,
          action: 'Counted',
          category: 'text',
          metadata: { words: stats.words, chars: stats.chars, sentences: stats.sentences, paragraphs: stats.paragraphs }
        })
      } catch {}
    }, 1500)
    return () => clearTimeout(timer)
  }, [stats.words, stats.chars, stats.sentences, stats.paragraphs])

  const BOXES = [
    { label:'Words',       value:stats.words,          Icon:Type },
    { label:'Characters',  value:stats.chars,          Icon:Hash },
    { label:'No Spaces',   value:stats.charsNoSpace,   Icon:Scissors },
    { label:'Sentences',   value:stats.sentences,      Icon:MessageSquare },
    { label:'Paragraphs',  value:stats.paragraphs,     Icon:Pilcrow },
    { label:'Lines',       value:stats.lines,          Icon:ArrowLeftRight },
    { label:'Unique',      value:stats.unique,         Icon:Lightbulb },
    { label:'Read Time',   value:stats.readTime||'0s', Icon:BookOpen },
    { label:'Pages ~',     value:stats.pages,          Icon:FileText },
    { label:'Lex Density', value:stats.lexDens+'%',    Icon:Brain },
  ]

  const MODES = [
    {id:'stats', label:'Stats', icon: BarChart3},
    {id:'density', label:'Words', icon: Hash},
    {id:'readability', label:'Clarity', icon: BookOpen},
    {id:'tone', label:'AI Voice & Tone', icon: Sparkles},
    {id:'tools', label:'Tools', icon: Feather},
  ]

  return (
    <ToolShell tool={tool}>
      <ToolCard>
        {/* Mode tabs */}
        <div className="tool-tabs apple-segmented" style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(0,0,0,.042)', borderRadius: 14, padding: 4, marginBottom: 18, border: '1px solid rgba(0,0,0,.035)', overflowX: 'auto', overflowY: 'hidden', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
          {MODES.map(m => {
            const ModeIcon = m.icon
            const isActive = mode === m.id
            return (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`tool-tab apple-segmented-item ${isActive ? 'active' : ''}`}
                style={{
                  flex: '1 0 auto',
                  minWidth: 'max-content',
                  padding: '9px 14px',
                  borderRadius: 12,
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'DM Sans,sans-serif',
                  fontSize: 12.5,
                  fontWeight: 700,
                  minHeight: 40,
                  background: isActive ? '#ffffff' : 'transparent',
                  color: isActive ? '#0d0d1a' : '#64748b',
                  boxShadow: isActive ? '0 2px 10px rgba(0,0,0,.06), 0 1px 3px rgba(0,0,0,.03), inset 0 1px 0 rgba(255,255,255,1)' : 'none',
                  transition: 'all .18s cubic-bezier(.22,1,.36,1)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  whiteSpace: 'nowrap',
                  boxSizing: 'border-box'
                }}
              >
                <ModeIcon size={14} color={isActive ? '#4F8EF7' : '#64748b'} style={{ flexShrink: 0 }} />
                <span style={{ display: 'inline-block', whiteSpace: 'nowrap', minWidth: 'max-content' }}>{m.label}</span>
              </button>
            )
          })}
        </div>

        {/* Textarea */}
        <div style={{marginBottom:14}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8,flexWrap:'wrap',gap:8}}>
            <label style={{fontSize:12.5,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'.6px'}}>Your Text</label>
            <div style={{display:'flex',gap:7,alignItems:'center',flexWrap:'wrap'}}>
              <button onClick={()=>fileRef.current?.click()}
                style={{fontSize:12,fontWeight:700,color:'#9C6FDE',background:'rgba(156,111,222,.08)',
                  border:'1px solid rgba(156,111,222,.2)',borderRadius:999,padding:'4px 11px',cursor:'pointer',display:'inline-flex',alignItems:'center',gap:5}}>
                <Upload size={12} /> Load File
              </button>
              <input ref={fileRef} type="file" accept=".txt,.md,.csv,.html,.json" style={{display:'none'}}
                onChange={e=>{loadFile(e.target.files?.[0]);e.target.value=''}}/>
              {text&&<button onClick={()=>copy(text)}
                style={{fontSize:12,fontWeight:700,color:copied?'#22c55e':'#4F8EF7',background:copied?'rgba(34,197,94,.08)':'rgba(79,142,247,.08)',
                  border:`1px solid ${copied?'rgba(34,197,94,.2)':'rgba(79,142,247,.2)'}`,borderRadius:999,padding:'4px 11px',cursor:'pointer',display:'inline-flex',alignItems:'center',gap:4}}>
                {copied ? <Check size={12} color="#22c55e" /> : <Copy size={12} />}
                <span>{copied?'Copied':'Copy'}</span>
              </button>}
              {text&&<button onClick={()=>dlText(text,'text.txt')}
                style={{fontSize:12,fontWeight:700,color:'#FF9800',background:'rgba(255,152,0,.08)',
                  border:'1px solid rgba(255,152,0,.2)',borderRadius:999,padding:'4px 11px',cursor:'pointer',display:'inline-flex',alignItems:'center',gap:4}}>
                <Download size={12} /> Export
              </button>}
              {text&&<button onClick={()=>setText('')}
                style={{padding:'4px 11px',borderRadius:999,fontSize:12,fontWeight:600,cursor:'pointer',
                  border:'1.5px solid rgba(239,68,68,.25)',background:'rgba(239,68,68,.05)',color:'#ef4444',display:'inline-flex',alignItems:'center',gap:4}}>
                <Trash2 size={12} /> Clear
              </button>}
            </div>
          </div>
          <textarea value={text} onChange={e=>setText(e.target.value)}
            placeholder={'Paste or type text here…\n\nOr load a .txt / .md / .csv / .html file.'}
            autoFocus
            style={{width:'100%',minHeight:200,resize:'vertical',padding:'14px 16px',
              border:'1.5px solid rgba(0,0,0,.1)',borderRadius:12,
              fontFamily:'DM Sans,sans-serif',fontSize:15,lineHeight:1.8,
              color:'#2d2d3d',background:'#fafafa',outline:'none',boxSizing:'border-box'}}
            onFocus={e=>{e.target.style.borderColor='#4F8EF7';e.target.style.boxShadow='0 0 0 3px rgba(79,142,247,.1)'}}
            onBlur={e=>{e.target.style.borderColor='rgba(0,0,0,.1)';e.target.style.boxShadow='none'}}/>
        </div>

        {/* Goal + tier */}
        <div style={{display:'flex',gap:9,alignItems:'center',marginBottom:14,flexWrap:'wrap'}}>
          <span style={{fontSize:12,fontWeight:600,color:'#64748b',whiteSpace:'nowrap',display:'inline-flex',alignItems:'center',gap:5}}>
            <Target size={13} color="#4F8EF7" /> Word goal:
          </span>
          <input type="number" value={goal} onChange={e=>setGoal(e.target.value)}
            placeholder="e.g. 500" min={1}
            className="inp" style={{flex:1,minWidth:100,fontSize:13,padding:'7px 12px'}}/>
          {goalNum>0&&(
            <div style={{flex:2,minWidth:120}}>
              <div style={{height:7,background:'#eee',borderRadius:3,overflow:'hidden'}}>
                <motion.div animate={{width:`${goalPct}%`}} transition={{duration:.4}}
                  style={{height:'100%',background:goalPct>=100?'#22c55e':'#4F8EF7',borderRadius:3}}/>
              </div>
              <div style={{fontSize:10,color:goalPct>=100?'#22c55e':'#aaa',fontWeight:700,marginTop:3,textAlign:'right'}}>
                {goalPct>=100?'✓ Goal reached!':`${stats.words}/${goalNum} (${Math.round(goalPct)}%)`}
              </div>
            </div>
          )}
        </div>

        {/* Content tier */}
        {text&&(
          <div style={{marginBottom:18}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
              <span style={{fontSize:11,fontWeight:700,color:'#888',textTransform:'uppercase',letterSpacing:'.6px'}}>Content Type</span>
              <span style={{fontSize:11,fontWeight:700,color:tier.color,background:`${tier.color}12`,
                padding:'3px 10px',borderRadius:999,border:`1px solid ${tier.color}28`}}>{tier.label}</span>
            </div>
            <div style={{height:6,background:'#e5e7ef',borderRadius:4,overflow:'hidden'}}>
              <motion.div animate={{width:`${Math.max(stats.words>0?2:0,tierPct)}%`}} transition={{duration:.4}}
                style={{height:'100%',background:tier.color,borderRadius:4}}/>
            </div>
          </div>
        )}

        {/* ── STATS ── */}
        {mode==='stats'&&(
          <>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(96px,1fr))',gap:12,marginBottom:20}}>
              {BOXES.map(s=><StatCard key={s.label} {...s}/>)}
            </div>
            {stats.words>0&&(
              <div style={{background:'rgba(34,197,94,.05)',border:'1px solid rgba(34,197,94,.16)',
                backdropFilter:'blur(8px)',WebkitBackdropFilter:'blur(8px)',boxShadow:'inset 0 1px 0 rgba(255,255,255,0.7)',
                borderRadius:12,padding:'12px 16px',display:'flex',gap:20,flexWrap:'wrap'}}>
                {[{icon:Eye,label:'Silent reading',value:stats.readTime,note:'238 wpm'},
                  {icon:Volume2,label:'Speaking aloud',value:stats.speakTime,note:'125 wpm'},
                  {icon:FileText,label:'~Pages',value:stats.pages,note:'250 wpm/page'},
                  {icon:Brain,label:'Lex density',value:stats.lexDens+'%',note:'unique/total'},
                ].map(item=>{
                  const ItemIcon = item.icon
                  return (
                    <div key={item.label} style={{display:'flex',alignItems:'center',gap:10}}>
                      <div style={{ width:30, height:30, borderRadius:8, background:'rgba(34,197,94,.12)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <ItemIcon size={15} color="#22c55e" />
                      </div>
                      <div>
                        <div style={{fontSize:13.5,fontWeight:700,color:'#1e293b'}}>{item.value}</div>
                        <div style={{fontSize:12,color:'#64748b'}}>{item.label} · {item.note}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* ── WORD DENSITY ── */}
        {mode==='density'&&(
          <div>
            {stats.topWords.length===0?(
              <div style={{textAlign:'center',padding:'40px 0',color:'#bbb',fontSize:14}}>
                Enter text to see word frequency
              </div>
            ):(
              <>
                <div style={{marginBottom:10,fontSize:12,color:'#64748b'}}>
                  Top keywords · {stats.unique} unique words · stop words excluded
                </div>
                {stats.topWords.map(([word,freq],i)=>{
                  const pct=(freq/stats.topWords[0][1])*100
                  return(
                    <div key={word} style={{display:'flex',alignItems:'center',gap:10,marginBottom:9}}>
                      <span style={{width:22,fontSize:11.5,color:'#94a3b8',fontWeight:700,textAlign:'right',flexShrink:0}}>#{i+1}</span>
                      <span style={{width:110,fontSize:13.5,fontWeight:700,color:'#1e293b',flexShrink:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{word}</span>
                      <div style={{flex:1,height:8,background:'#f0f0f5',borderRadius:4,overflow:'hidden'}}>
                        <motion.div initial={{width:0}} animate={{width:`${pct}%`}} transition={{duration:.5,delay:i*.04}}
                          style={{height:'100%',borderRadius:4,background:`hsl(${210+i*16},70%,56%)`}}/>
                      </div>
                      <span style={{fontSize:12,fontWeight:700,color:'#64748b',width:32,textAlign:'right',flexShrink:0}}>×{freq}</span>
                    </div>
                  )
                })}
              </>
            )}
          </div>
        )}

        {/* ── READABILITY ── */}
        {mode==='readability'&&(
          <div>
            {stats.words<5?(
              <div style={{textAlign:'center',padding:'40px 0',color:'#bbb',fontSize:14}}>Enter at least 5 words</div>
            ):(
              <>
                <div style={{textAlign:'center',padding:'24px 0 16px',marginBottom:18,
                  background:'#F7F8FF',borderRadius:16,border:'1px solid rgba(0,0,0,.06)'}}>
                  <div style={{fontFamily:'Syne,sans-serif',fontSize:56,fontWeight:800,color:stats.freColor,lineHeight:1}}>
                    {Math.max(0,Math.min(100,stats.fre))}
                  </div>
                  <div style={{fontSize:14,fontWeight:700,color:stats.freColor,marginTop:6}}>{stats.freLabel}</div>
                  <div style={{fontSize:12.5,color:'#64748b',marginTop:4}}>Flesch Reading Ease Score</div>
                  <div style={{height:8,background:'#e5e7ef',borderRadius:4,overflow:'hidden',margin:'12px 20px 0'}}>
                    <motion.div animate={{width:`${Math.max(0,Math.min(100,stats.fre))}%`}} transition={{duration:.7}}
                      style={{height:'100%',background:stats.freColor,borderRadius:4}}/>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'#64748b',padding:'4px 20px 0'}}>
                    <span>Hard (0)</span><span>Standard (60)</span><span>Easy (100)</span>
                  </div>
                </div>
                <div style={{marginBottom:16}}>
                  <div style={{fontSize:12,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'.6px',marginBottom:10}}>
                    Sentence Length Distribution
                  </div>
                  <div className="tool-grid-3" style={{gap:8,marginBottom:12}}>
                    {[{label:'Short ≤10w',val:stats.shortS,c:'#22c55e'},{label:'Medium 11–20w',val:stats.midS,c:'#FF9800'},{label:'Long >20w',val:stats.longS,c:'#ef4444'}].map(d=>(
                      <div key={d.label} style={{textAlign:'center',padding:'12px 8px',borderRadius:12,
                        background:`${d.c}0D`,border:`1px solid ${d.c}22`}}>
                        <div style={{fontFamily:'Syne,sans-serif',fontSize:24,fontWeight:800,color:d.c}}>{d.val}</div>
                        <div style={{fontSize:12,color:'#64748b',marginTop:3}}>{d.label}</div>
                      </div>
                    ))}
                  </div>
                  <div className="tool-grid-2-compact">
                    {[
                      {label:'Avg Sentence Length',value:`${stats.sentences>0?Math.round(stats.words/stats.sentences):0} words`,color:'#4F8EF7'},
                      {label:'Avg Word Length',value:`${stats.avgLen} chars`,color:'#9C6FDE'},
                      {label:'Lexical Density',value:`${stats.lexDens}%`,color:'#26C6DA'},
                      {label:'Longest Word',value:stats.longest||'—',color:'#FF9800',mono:true},
                    ].map(s=>(
                      <div key={s.label} style={{background:'#F7F8FF',borderRadius:12,padding:'13px',border:'1px solid rgba(0,0,0,.06)',textAlign:'center'}}>
                        <div style={{fontFamily:s.mono?'monospace':'Syne,sans-serif',fontSize:s.mono?13:18,fontWeight:800,color:s.color,wordBreak:'break-all'}}>{s.value}</div>
                        <div style={{fontSize:11.5,color:'#64748b',marginTop:4,fontWeight:600}}>{s.label}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{marginTop:16,padding:'14px 16px',borderRadius:12,background:'linear-gradient(135deg, rgba(79,142,247,.06), rgba(156,111,222,.08))',border:'1px solid rgba(156,111,222,.2)',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:10}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,fontSize:12.5,fontWeight:600,color:'#334155'}}>
                      <Sparkles size={16} color="#9C6FDE"/>
                      <span>Want deep linguistic analysis, formality calibration, and sentiment insights?</span>
                    </div>
                    <button onClick={()=>{ setMode('tone'); if(!toneResult) handleAuditTone(); }}
                      style={{fontSize:12,fontWeight:700,color:'#fff',background:'linear-gradient(135deg, #4F8EF7, #9C6FDE)',border:'none',borderRadius:8,padding:'6px 14px',cursor:'pointer',boxShadow:'0 2px 8px rgba(156,111,222,.25)'}}>
                      Audit Voice with AI →
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── AI VOICE & TONE AUDITOR ── */}
        {mode==='tone'&&(
          <div style={{animation:'fadeIn .25s ease'}}>
            <div style={{
              background:'linear-gradient(135deg, rgba(79,142,247,.05) 0%, rgba(156,111,222,.07) 100%)',
              border:'1px solid rgba(156,111,222,.22)',
              borderRadius:16,
              padding:'20px',
              marginBottom:16
            }}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:12,marginBottom:16}}>
                <div>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                    <Brain size={20} color="#9C6FDE" />
                    <h3 style={{fontFamily:'Syne,sans-serif',fontWeight:800,fontSize:17,color:'#0f172a',margin:0}}>
                      AI Tone, Formality & Grade Auditor
                    </h3>
                  </div>
                  <p style={{fontSize:12.5,color:'#64748b',margin:0}}>
                    Deep computational linguistics via Llama 3.3 70B · Reading grade level, sentiment, and voice calibration.
                  </p>
                </div>
                <div style={{display:'flex',gap:8}}>
                  <motion.button
                    whileHover={{scale:1.02}}
                    whileTap={{scale:0.97}}
                    onClick={handleAuditTone}
                    disabled={aiLoading || !text.trim()}
                    style={{
                      background:'linear-gradient(135deg, #4F8EF7, #9C6FDE)',
                      color:'#fff',
                      border:'none',
                      borderRadius:10,
                      padding:'9px 18px',
                      fontSize:12.5,
                      fontWeight:700,
                      cursor:aiLoading || !text.trim() ? 'not-allowed' : 'pointer',
                      opacity:aiLoading || !text.trim() ? 0.6 : 1,
                      display:'flex',
                      alignItems:'center',
                      gap:7,
                      boxShadow:'0 4px 12px rgba(156,111,222,.25)'
                    }}>
                    {aiLoading ? (
                      <>
                        <RefreshCw size={14} className="spin-icon" style={{animation:'spin 1s linear infinite'}}/>
                        Analyzing Syntax & Tone…
                      </>
                    ) : (
                      <>
                        <Sparkles size={14}/>
                        {toneResult ? 'Re-Audit Voice' : 'Audit Voice & Tone'}
                      </>
                    )}
                  </motion.button>
                </div>
              </div>

              {aiError && (
                <div style={{background:'rgba(239,68,68,.08)',border:'1px solid rgba(239,68,68,.25)',borderRadius:10,padding:'10px 14px',display:'flex',alignItems:'center',gap:8,color:'#ef4444',fontSize:12.5,marginBottom:14}}>
                  <AlertCircle size={15} style={{flexShrink:0}}/>
                  <span>{aiError}</span>
                </div>
              )}

              {!toneResult && !aiLoading && (
                <div style={{
                  background:'rgba(255,255,255,0.75)',
                  borderRadius:12,
                  padding:'32px 20px',
                  textAlign:'center',
                  border:'1px dashed rgba(156,111,222,.35)'
                }}>
                  <Feather size={32} color="#9C6FDE" style={{margin:'0 auto 12px',opacity:0.8}}/>
                  <div style={{fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:14.5,color:'#1e293b',marginBottom:4}}>
                    Ready to Audit Your Content
                  </div>
                  <p style={{fontSize:12.5,color:'#64748b',maxWidth:440,margin:'0 auto 16px',lineHeight:1.6}}>
                    Click <strong>Audit Voice & Tone</strong> to detect primary & secondary registers, formality percentage, target audience comprehension grade, and actionable sentence-level feedback.
                  </p>
                  <button
                    onClick={handleAuditTone}
                    disabled={!text.trim()}
                    style={{
                      background:'rgba(156,111,222,.12)',
                      border:'1px solid rgba(156,111,222,.3)',
                      color:'#7c3aed',
                      borderRadius:8,
                      padding:'8px 18px',
                      fontSize:12.5,
                      fontWeight:700,
                      cursor:text.trim() ? 'pointer' : 'not-allowed',
                      display:'inline-flex',
                      alignItems:'center',
                      gap:6
                    }}>
                    <Sparkles size={13} />
                    <span>{text.trim() ? 'Run Instant Audit' : 'Type or paste text above first'}</span>
                  </button>
                </div>
              )}

              {toneResult && (
                <div style={{display:'flex',flexDirection:'column',gap:16}}>
                  {/* Top 4 Metrics Grid */}
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:10}}>
                    <div style={{background:'#fff',padding:'14px',borderRadius:12,border:'1px solid rgba(0,0,0,.06)',boxShadow:'0 1px 3px rgba(0,0,0,.04)'}}>
                      <div style={{fontSize:10.5,fontWeight:700,color:'#888',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:4}}>
                        Primary Tone
                      </div>
                      <div style={{fontFamily:'Syne,sans-serif',fontSize:16,fontWeight:800,color:'#4F8EF7',display:'flex',alignItems:'center',gap:5}}>
                        <Sparkles size={14}/>
                        {toneResult.primaryTone || 'Balanced'}
                      </div>
                      {toneResult.secondaryTone && (
                        <div style={{fontSize:11,color:'#9C6FDE',fontWeight:600,marginTop:3}}>
                          + {toneResult.secondaryTone}
                        </div>
                      )}
                    </div>

                    <div style={{background:'#fff',padding:'14px',borderRadius:12,border:'1px solid rgba(0,0,0,.06)',boxShadow:'0 1px 3px rgba(0,0,0,.04)'}}>
                      <div style={{fontSize:10.5,fontWeight:700,color:'#888',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:4}}>
                        Grade Level
                      </div>
                      <div style={{fontFamily:'Syne,sans-serif',fontSize:16,fontWeight:800,color:'#22c55e',display:'flex',alignItems:'center',gap:5}}>
                        <BookOpen size={14}/>
                        {toneResult.readingGradeLevel || 'General'}
                      </div>
                      <div style={{fontSize:11,color:'#64748b',marginTop:3}}>
                        Target Comprehension
                      </div>
                    </div>

                    <div style={{background:'#fff',padding:'14px',borderRadius:12,border:'1px solid rgba(0,0,0,.06)',boxShadow:'0 1px 3px rgba(0,0,0,.04)'}}>
                      <div style={{fontSize:10.5,fontWeight:700,color:'#888',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:4}}>
                        Formality Index
                      </div>
                      <div style={{fontFamily:'Syne,sans-serif',fontSize:16,fontWeight:800,color:'#FF9800',display:'flex',alignItems:'center',gap:5}}>
                        <BarChart3 size={14}/>
                        {toneResult.formalityScore ?? 50}/100
                      </div>
                      <div style={{fontSize:11,color:'#64748b',marginTop:3}}>
                        {(toneResult.formalityScore || 50) > 70 ? 'Formal & Polished' : (toneResult.formalityScore || 50) > 40 ? 'Conversational' : 'Casual & Direct'}
                      </div>
                    </div>

                    <div style={{background:'#fff',padding:'14px',borderRadius:12,border:'1px solid rgba(0,0,0,.06)',boxShadow:'0 1px 3px rgba(0,0,0,.04)'}}>
                      <div style={{fontSize:10.5,fontWeight:700,color:'#888',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:4}}>
                        Sentiment
                      </div>
                      <div style={{fontFamily:'Syne,sans-serif',fontSize:16,fontWeight:800,color:toneResult.sentiment === 'Positive' ? '#22c55e' : toneResult.sentiment === 'Negative' ? '#ef4444' : '#4F8EF7',display:'flex',alignItems:'center',gap:5}}>
                        <MessageSquare size={14}/>
                        {toneResult.sentiment || 'Neutral'}
                      </div>
                      <div style={{fontSize:11,color:'#64748b',marginTop:3}}>
                        Emotional Cadence
                      </div>
                    </div>
                  </div>

                  {/* Formality Bar */}
                  <div style={{background:'#fff',padding:'14px 16px',borderRadius:12,border:'1px solid rgba(0,0,0,.06)'}}>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:11.5,fontWeight:700,marginBottom:6,color:'#475569'}}>
                      <span>Formality Spectrum</span>
                      <span>{toneResult.formalityScore ?? 50}%</span>
                    </div>
                    <div style={{height:8,background:'#f1f5f9',borderRadius:999,overflow:'hidden',position:'relative'}}>
                      <div style={{
                        height:'100%',
                        width:`${Math.min(100, Math.max(0, toneResult.formalityScore ?? 50))}%`,
                        background:'linear-gradient(90deg, #4F8EF7, #9C6FDE, #FF9800)',
                        borderRadius:999,
                        transition:'width .6s cubic-bezier(.22,1,.36,1)'
                      }}/>
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:10.5,color:'#94a3b8',marginTop:4}}>
                      <span>Casual / Colloquial</span>
                      <span>Neutral / Balanced</span>
                      <span>Formal / Academic</span>
                    </div>
                  </div>

                  {/* Strengths & Improvements */}
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:12}}>
                    {/* Strengths */}
                    <div style={{background:'#fff',borderRadius:12,padding:'16px',border:'1px solid rgba(34,197,94,.2)'}}>
                      <div style={{display:'flex',alignItems:'center',gap:6,color:'#16a34a',fontWeight:700,fontSize:13,marginBottom:10}}>
                        <CheckCircle2 size={16}/>
                        <span>Linguistic Strengths</span>
                      </div>
                      <div style={{display:'flex',flexDirection:'column',gap:8}}>
                        {(toneResult.strengths || ['Clear communication style']).map((str, idx) => (
                          <div key={idx} style={{display:'flex',alignItems:'flex-start',gap:8,fontSize:12,color:'#334155',lineHeight:1.5}}>
                            <span style={{color:'#22c55e',fontWeight:800}}>•</span>
                            <span>{str}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Improvements */}
                    <div style={{background:'#fff',borderRadius:12,padding:'16px',border:'1px solid rgba(156,111,222,.2)'}}>
                      <div style={{display:'flex',alignItems:'center',gap:6,color:'#9333ea',fontWeight:700,fontSize:13,marginBottom:10}}>
                        <Lightbulb size={16}/>
                        <span>Actionable Refinements</span>
                      </div>
                      <div style={{display:'flex',flexDirection:'column',gap:8}}>
                        {(toneResult.improvements || ['Maintain consistent tone']).map((imp, idx) => (
                          <div key={idx} style={{display:'flex',alignItems:'flex-start',gap:8,fontSize:12,color:'#334155',lineHeight:1.5}}>
                            <span style={{color:'#9C6FDE',fontWeight:800}}>→</span>
                            <span>{imp}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Copy Audit Report */}
                  <div style={{display:'flex',justifyContent:'flex-end'}}>
                    <button
                      onClick={() => {
                        const report = `### 🤖 AI Voice & Tone Audit Report\n` +
                          `- **Primary Tone**: ${toneResult.primaryTone} ${toneResult.secondaryTone ? `(+ ${toneResult.secondaryTone})` : ''}\n` +
                          `- **Reading Grade Level**: ${toneResult.readingGradeLevel}\n` +
                          `- **Formality Score**: ${toneResult.formalityScore}/100\n` +
                          `- **Sentiment**: ${toneResult.sentiment}\n\n` +
                          `#### Strengths:\n${(toneResult.strengths || []).map(s => `- ${s}`).join('\n')}\n\n` +
                          `#### Actionable Refinements:\n${(toneResult.improvements || []).map(i => `- ${i}`).join('\n')}`
                        copy(report)
                      }}
                      style={{
                        fontSize: 11.5,
                        fontWeight: 700,
                        color: copied ? '#22c55e' : '#4F8EF7',
                        background: copied ? 'rgba(34,197,94,.08)' : 'rgba(79,142,247,.08)',
                        border: `1px solid ${copied ? 'rgba(34,197,94,.2)' : 'rgba(79,142,247,.2)'}`,
                        borderRadius: 8,
                        padding: '6px 14px',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5
                      }}>
                      {copied ? <Check size={12} color="#22c55e" /> : <Copy size={12} />}
                      <span>{copied ? 'Copied Audit Report' : 'Copy Audit Report (Markdown)'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TEXT TOOLS ── */}
        {mode==='tools'&&(
          <div>
            {/* Find & Replace */}
            <div style={{marginBottom:16,background:'#f8f9ff',borderRadius:12,padding:'14px',border:'1px solid rgba(79,142,247,.1)'}}>
              <div style={{fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:13.5,color:'#0d0d1a',marginBottom:12,display:'inline-flex',alignItems:'center',gap:6}}>
                <Search size={14} color="#4F8EF7" /> Find & Replace
              </div>
              <div className="frow" style={{gap:10,marginBottom:10}}>
                <div style={{flex:1}}>
                  <label className="lbl">Find</label>
                  <input className="inp" value={findQ} onChange={e=>setFindQ(e.target.value)} placeholder="Text to find…"/>
                </div>
                <div style={{flex:1}}>
                  <label className="lbl">Replace with</label>
                  <input className="inp" value={replaceQ} onChange={e=>setReplQ(e.target.value)} placeholder="Replace with…"/>
                </div>
              </div>
              {findQ.trim() && <div style={{fontSize:12,color:'#aaa',marginBottom:8}}>
                Found: <strong style={{color:'#4F8EF7'}}>{(text.split(findQ).length-1)}</strong> occurrence{text.split(findQ).length-1!==1?'s':''}
              </div>}
              <motion.button whileHover={{scale:1.03}} whileTap={{scale:.96}}
                onClick={doReplace} className="btn btn-blue btn-sm" style={{ marginRight:8 }}>
                Replace All
              </motion.button>
              <motion.button whileHover={{scale:1.03}} whileTap={{scale:.96}}
                onClick={()=>{setFindQ('');setReplQ('')}} className="btn btn-outline btn-sm">
                Clear
              </motion.button>
            </div>

            {/* Transform tools */}
            <div style={{fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:13.5,color:'#0d0d1a',marginBottom:12,display:'inline-flex',alignItems:'center',gap:6}}>
              <Zap size={14} color="#4F8EF7" /> Text Transforms
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:8,marginBottom:16}}>
              {[
                {label:'UPPERCASE',fn:t=>t.toUpperCase()},
                {label:'lowercase',fn:t=>t.toLowerCase()},
                {
                  label:'Title Case',
                  fn:t=>t.replace(/\b[a-zA-Z]/g, (match, offset, str) => {
                    if (offset > 0 && (str[offset - 1] === "'" || str[offset - 1] === "’") && offset > 1 && /[a-zA-Z]/.test(str[offset - 2])) {
                      return match.toLowerCase()
                    }
                    return match.toUpperCase()
                  })
                },
                {
                  label:'Sentence case',
                  fn:t=>t.toLowerCase().replace(/(^\s*|[.!?…]\s+)([a-z])/g, (_, prefix, char) => prefix + char.toUpperCase())
                },
                {label:'Remove extra spaces',fn:t=>t.replace(/\s+/g,' ').trim()},
                {label:'Remove blank lines',fn:t=>t.split('\n').filter(l=>l.trim()).join('\n')},
                {label:'Reverse text',fn:t=>t.split('').reverse().join('')},
                {label:'Sort lines A→Z',fn:t=>t.split('\n').sort((a,b)=>a.localeCompare(b, undefined, { sensitivity: 'base' })).join('\n')},
                {label:'Remove duplicates',fn:t=>[...new Set(t.split('\n'))].join('\n')},
                {label:'Add line numbers',fn:t=>t.split('\n').map((l,i)=>`${String(i+1).padStart(3,' ')}. ${l}`).join('\n')},
              ].map(({label,fn})=>(
                <motion.button key={label} whileHover={{scale:1.03,y:-1}} whileTap={{scale:.95}}
                  onClick={()=>text&&setText(fn(text))}
                  disabled={!text}
                  style={{padding:'9px 12px',borderRadius:10,border:'1.5px solid rgba(79,142,247,.18)',
                    background:'rgba(79,142,247,.04)',color:text?'#4F8EF7':'#ccc',
                    fontWeight:600,fontSize:12,cursor:text?'pointer':'not-allowed',
                    textAlign:'left',transition:'all .15s cubic-bezier(.22,1,.36,1)'}}>
                  {label}
                </motion.button>
              ))}
            </div>

            {/* Export options */}
            <div style={{fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:13.5,color:'#0d0d1a',marginBottom:10,display:'inline-flex',alignItems:'center',gap:6}}>
              <Download size={14} color="#4F8EF7" /> Export
            </div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              {[
                {label:'Download TXT',fn:()=>dlText(text,'text.txt')},
                {label:'Download MD',fn:()=>dlText(text,'text.md')},
                {
                  label:'Copy as HTML',
                  fn:() => {
                    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
                    const paras = text.split(/\n\s*\n/).filter(p => p.trim())
                    const html = paras.length ? paras.map(p => `<p>${esc(p.trim())}</p>`).join('\n') : '<p></p>'
                    copy(html)
                  }
                },
              ].map(({label,fn})=>(
                <motion.button key={label} whileHover={{scale:1.03}} whileTap={{scale:.96}}
                  onClick={fn} disabled={!text}
                  className="btn btn-outline btn-sm" style={{ opacity:text?1:.5 }}>
                  {label}
                </motion.button>
              ))}
            </div>
          </div>
        )}
      </ToolCard>
      
      {/* AI Summary */}
      {text.trim().length > 50 && <SummarizePanel text={text}/>}

    </ToolShell>
  )
}
