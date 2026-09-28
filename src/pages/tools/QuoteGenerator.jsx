import React, { useState, useEffect, useCallback, useMemo } from 'react'
import ToolShell, { ToolCard } from '../../components/ToolShell'
import { useCopy } from '../../hooks'
import { TOOLS, QUOTES } from '../../constants'
import { AIQuotePanel } from '../../components/AIPanel'
import { saveFileWithFallback } from '../../utils/fileSaver'

const tool = TOOLS.find(t => t.id === 'quote')

const CATEGORIES = ['All', ...Array.from(new Set(QUOTES.map(q => q.cat||'Wisdom'))).sort()]

export default function QuoteGenerator() {
  const [idx,    setIdx]   = useState(0)
  const [copied, copy]     = useCopy()
  const [faves,  setFaves] = useState(() => {
    try { return JSON.parse(localStorage.getItem('tooldesk_quote_faves') || localStorage.getItem('nxtool_quote_faves') || '[]') } catch { return [] }
  })
  const [tab,    setTab]   = useState('all')
  const [search, setSearch]= useState('')
  const [catFilter, setCat]= useState('All')
  const [autoPlay, setAuto]= useState(false)

  // Persist faves
  useEffect(() => {
    try { localStorage.setItem('tooldesk_quote_faves', JSON.stringify(faves)) } catch {}
  }, [faves])

  // Auto-play every 5s
  useEffect(() => {
    if (!autoPlay) return
    const id = setInterval(() => {
      setIdx(i => {
        if (QUOTES.length <= 1) return i
        let n
        let attempts = 0
        do {
          n = Math.floor(Math.random() * QUOTES.length)
          attempts++
        } while (n === i && attempts < 10)
        return n
      })
    }, 5000)
    return () => clearInterval(id)
  }, [autoPlay])

  const rand = useCallback(() => {
    if (QUOTES.length <= 1) return
    let n
    let attempts = 0
    do {
      n = Math.floor(Math.random() * QUOTES.length)
      attempts++
    } while (n === idx && attempts < 10)
    setIdx(n)
  }, [idx])

  const toggleFave = useCallback(i => {
    setFaves(f => f.includes(i) ? f.filter(x=>x!==i) : [...f, i])
  }, [])

  const filtered = useMemo(() => QUOTES
    .map((q,i) => ({...q, i, cat:q.cat||'Wisdom'}))
    .filter(q => {
      if (tab==='faves' && !faves.includes(q.i)) return false
      if (catFilter!=='All' && q.cat!==catFilter) return false
      if (search) {
        const s = search.toLowerCase()
        return q.text.toLowerCase().includes(s) || q.author.toLowerCase().includes(s)
      }
      return true
    }), [tab, faves, search, catFilter])

  const quote = QUOTES[idx] || QUOTES[0] || { text: 'Simplicity is the soul of efficiency.', author: 'Austin Freeman', cat: 'Wisdom' }
  const safeAuthor = quote?.author || 'Unknown'
  const safeAuthorInitial = (safeAuthor.trim()[0] || '?').toUpperCase()
  const isFave = faves.includes(idx)

  const PALETTE = ['#4F8EF7','#9C6FDE','#26C6DA','#F06292','#4CAF50','#FF9800']
  const accent = PALETTE[idx % PALETTE.length]

  // Keyboard: Space=random, Left/Right=prev/next
  useEffect(() => {
    const h = e => {
      if (e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA') return
      if (e.code==='Space') { e.preventDefault(); rand() }
      if (e.code==='ArrowRight') { setIdx(i=>(i+1)%QUOTES.length) }
      if (e.code==='ArrowLeft')  { setIdx(i=>(i-1+QUOTES.length)%QUOTES.length) }
      if (e.code==='KeyF') toggleFave(idx)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [idx, rand, toggleFave])

  const shareText = quote ? `"${quote.text}" — ${quote.author}` : ''

  // Web Share API
  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ text: shareText + '\n\nvia ToolDesk' }) }
      catch {}
    } else {
      copy(shareText + '\n\nvia ToolDesk')
    }
  }

  return (
    <ToolShell tool={tool}>
      <ToolCard>

        {/* Main quote card */}
        <div style={{ textAlign:'center', padding:'32px 24px 28px',
          background:`linear-gradient(135deg,${accent}0D,${accent}05)`,
          borderRadius:18, border:`1.5px solid ${accent}25`,
          marginBottom:20, position:'relative', minHeight:200,
          display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>

          {/* Big quote mark */}
          <div style={{ fontSize:80, lineHeight:.8, color:`${accent}18`,
            fontFamily:'Georgia,serif', position:'absolute', top:8, left:16,
            userSelect:'none', pointerEvents:'none' }}>"</div>

          {/* Fave + counter */}
          <div style={{ position:'absolute', top:12, right:14, display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:10, color:'#ccc', fontWeight:600 }}>{idx+1}/{QUOTES.length}</span>
            <button
              type="button"
              onClick={()=>toggleFave(idx)}
              aria-label={isFave ? 'Remove quote from favorites' : 'Save quote to favorites'}
              title={isFave ? 'Remove from favorites' : 'Save to favorites'}
              style={{ background:'none', border:'none', cursor:'pointer', fontSize:22,
                transition:'transform .2s', lineHeight:1 }}
              onMouseEnter={e=>e.currentTarget.style.transform='scale(1.3)'}
              onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}>
              {isFave ? '❤️' : '🤍'}
            </button>
          </div>

          <p style={{ fontFamily:'Syne,sans-serif', fontSize:'clamp(15px,3vw,20px)',
            fontWeight:600, color:'#0d0d1a', lineHeight:1.65, fontStyle:'italic',
            marginBottom:20, position:'relative', zIndex:1, maxWidth:480 }}>
            {quote?.text || ''}
          </p>

          <div style={{ display:'flex', alignItems:'center', gap:10, position:'relative', zIndex:1 }}>
            <div style={{ width:34, height:34, borderRadius:'50%',
              background:`linear-gradient(135deg,${accent},${accent}99)`,
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:14, fontWeight:800, color:'#fff', flexShrink:0 }}>
              {safeAuthorInitial}
            </div>
            <span style={{ fontSize:14, color:'#777', fontWeight:600 }}>— {safeAuthor}</span>
          </div>
        </div>

        <div className="tool-actions-row" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap:8, marginBottom:14, width:'100%', boxSizing:'border-box' }}>
          <button className="btn btn-primary" onClick={rand}>✨ Random</button>
          <button className={`btn ${copied?'btn-success':'btn-outline'}`} onClick={()=>copy(shareText)}>
            {copied?'✓':'📋 Copy'}
          </button>
          <button className="btn btn-outline" onClick={share}>📤 Share</button>
          <button className="btn btn-outline" onClick={()=>{
            const canvas=document.createElement('canvas')
            canvas.width=800; canvas.height=420
            const ctx=canvas.getContext('2d')
            // Background
            ctx.fillStyle='#0d0d1a'
            ctx.fillRect(0,0,800,420)
            // Gradient overlay
            const g=ctx.createLinearGradient(0,0,800,420)
            g.addColorStop(0,'rgba(79,142,247,.15)')
            g.addColorStop(1,'rgba(156,111,222,.1)')
            ctx.fillStyle=g; ctx.fillRect(0,0,800,420)
            // Quote mark
            ctx.fillStyle='rgba(255,255,255,.06)'
            ctx.font='bold 160px serif'
            ctx.fillText('“',30,160)
            // Quote text (word wrap)
            ctx.fillStyle='#fff'
            ctx.font='600 22px system-ui,sans-serif'
            const words=quote.text.split(' '), lines=[], maxW=660
            let line=''
            for(const w of words){const t=line?line+' '+w:w;if(ctx.measureText(t).width>maxW&&line){lines.push(line);line=w}else line=t}
            if(line)lines.push(line)
            const startY=lines.length<=3?170:150
            lines.slice(0,6).forEach((l,i)=>ctx.fillText(l,100,startY+i*36))
            // Author
            ctx.fillStyle='rgba(255,255,255,.55)'
            ctx.font='400 16px system-ui,sans-serif'
            ctx.fillText('— '+safeAuthor, 100, startY+lines.length*36+20)
            // Branding
            ctx.fillStyle='rgba(255,255,255,.2)'
            ctx.font='700 13px system-ui,sans-serif'
            ctx.fillText('ToolDesk.app', 680, 400)
            saveFileWithFallback(canvas.toDataURL('image/png'), 'quote.png', 'image/png')
            canvas.width = 1
            canvas.height = 1
          }}>🖼️ Save as Image</button>
        </div>

        {/* Controls row */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
          marginBottom:18, padding:'10px 14px', background:'#f7f8ff',
          borderRadius:10, border:'1px solid rgba(0,0,0,.06)', flexWrap:'wrap', gap:10 }}>
          <div style={{ display:'flex', gap:6 }}>
            <button
              type="button"
              aria-label="Previous quote"
              title="Previous quote"
              onClick={() => setIdx(i=>(i-1+QUOTES.length)%QUOTES.length)}
              style={{ padding:'6px 13px', borderRadius:9, border:'1.5px solid rgba(0,0,0,.1)',
                background:'#fff', cursor:'pointer', fontWeight:700, fontSize:14 }}>‹</button>
            <button
              type="button"
              aria-label="Next quote"
              title="Next quote"
              onClick={() => setIdx(i=>(i+1)%QUOTES.length)}
              style={{ padding:'6px 13px', borderRadius:9, border:'1.5px solid rgba(0,0,0,.1)',
                background:'#fff', cursor:'pointer', fontWeight:700, fontSize:14 }}>›</button>
          </div>

          <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', userSelect:'none' }}>
            <div style={{ width:36, height:20, borderRadius:10, position:'relative', cursor:'pointer',
              background:autoPlay?'#4F8EF7':'#ddd', transition:'background .2s' }}
              onClick={()=>setAuto(a=>!a)}>
              <div style={{ position:'absolute', top:2, width:16, height:16, borderRadius:'50%',
                background:'#fff', transition:'left .2s', boxShadow:'0 1px 4px rgba(0,0,0,.2)',
                left:autoPlay?18:2 }}/>
            </div>
            <span style={{ fontSize:12, fontWeight:600, color:'#888' }}>Auto-play (5s)</span>
          </label>

          <div style={{ fontSize:10.5, color:'#bbb', fontWeight:600 }}>
            ← → Space · F = fave
          </div>
        </div>

        {/* Filter + search */}
        <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap' }}>
          <input className="inp" placeholder="Search quotes or authors…"
            value={search} onChange={e=>setSearch(e.target.value)}
            style={{ flex:1, minWidth:160, fontSize:13 }}/>
          <div style={{ display:'flex', gap:6 }}>
            {['all','faves'].map(t=>(
              <button key={t} onClick={()=>setTab(t)}
                className={`btn btn-sm ${tab===t?'btn-blue':'btn-outline'}`}>
                {t==='faves'?`❤️ ${faves.length}`:`All`}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div style={{ display:'flex', flexDirection:'column', gap:7, maxHeight:300, overflowY:'auto', paddingRight:2 }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign:'center', padding:'32px 0', color:'#bbb', fontSize:13 }}>
              {tab==='faves'?'No saved quotes yet — click 🤍 to save one!':'No quotes match your search.'}
            </div>
          ) : filtered.map(q => (
            <div key={q.i} onClick={() => setIdx(q.i)}
              style={{ padding:'11px 13px', borderRadius:11, cursor:'pointer',
                border:`1.5px solid ${idx===q.i?accent+'55':'rgba(0,0,0,.07)'}`,
                background:idx===q.i?`${accent}08`:'#fff', transition:'all .18s cubic-bezier(.22,1,.36,1)',
                display:'flex', gap:10, alignItems:'flex-start' }}
              onMouseEnter={e=>{ if(idx!==q.i){e.currentTarget.style.background='#f5f7ff';e.currentTarget.style.borderColor='rgba(79,142,247,.2)'}}}
              onMouseLeave={e=>{ if(idx!==q.i){e.currentTarget.style.background='#fff';e.currentTarget.style.borderColor='rgba(0,0,0,.07)'}}}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:12, color:'#444', lineHeight:1.55, marginBottom:3 }}>
                  {q.text.length>80?q.text.slice(0,80)+'…':q.text}
                </div>
                <div style={{ fontSize:10.5, color:'#aaa', fontWeight:600 }}>— {q.author}</div>
              </div>
              <button onClick={e=>{e.stopPropagation();toggleFave(q.i)}}
                style={{ background:'none', border:'none', cursor:'pointer', fontSize:14, flexShrink:0 }}>
                {faves.includes(q.i)?'❤️':'🤍'}
              </button>
            </div>
          ))}
        </div>

      </ToolCard>

      {/* AI Quote Generator */}
      <AIQuotePanel onQuotesAdd={quotes => {
        // AI quotes don't have all fields, shown in panel itself
      }}/>

    </ToolShell>
  )
}
