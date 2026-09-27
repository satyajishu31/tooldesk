import React, { useState, useCallback, useRef, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ToolShell, { ToolCard, Reveal } from '../../components/ToolShell'
import { useCopy } from '../../hooks'
import { safeFetchJSON, safeTimeoutSignal } from '../../utils/safeFetch'
import { resolveApiUrl, getApiHeaders } from '../../utils/apiConfig'
import { TOOLS } from '../../constants'
import SafeImage from '../../components/SafeImage'
import { saveFileWithFallback } from '../../utils/fileSaver'
import { SEOSuggestPanel, DeepWebPanel } from '../../components/AIPanel'

const tool = TOOLS.find(t => t.id === 'websiteanalyzer')

function fmtBytes(b) {
  if (!b) return '—'
  if (b > 1048576) return (b/1048576).toFixed(1)+' MB'
  if (b > 1024)    return (b/1024).toFixed(0)+' KB'
  return b+' B'
}

function safeHostname(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '—'
  try {
    const target = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`
    return new URL(target).hostname || rawUrl
  } catch {
    return rawUrl
  }
}

const ScoreRing = memo(function ScoreRing({ score, label }) {
  const r    = 34
  const circ = 2 * Math.PI * r
  const off  = circ - (Math.min(100, Math.max(0, score)) / 100) * circ
  const col  = score >= 80 ? '#22c55e' : score >= 50 ? '#f97316' : '#ef4444'
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
      <div style={{ position:'relative', width:80, height:80 }}>
        <svg width={80} height={80} viewBox="0 0 80 80">
          <circle cx={40} cy={40} r={r} fill="none" stroke="#f0f0f5" strokeWidth={6}/>
          <motion.circle cx={40} cy={40} r={r} fill="none" stroke={col} strokeWidth={6}
            strokeDasharray={circ} strokeLinecap="round"
            initial={{ strokeDashoffset: circ }}
            animate={{ strokeDashoffset: off }}
            transition={{ duration:1.2, ease:[.22,1,.36,1] }}
            style={{ transform:'rotate(-90deg)', transformOrigin:'center' }}/>
        </svg>
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center',
          justifyContent:'center', fontFamily:'Syne,sans-serif', fontWeight:800,
          fontSize:18, color:col }}>{score}</div>
      </div>
      <div style={{ fontSize:12, fontWeight:700, color:'#555', textTransform:'uppercase',
        letterSpacing:'.4px', textAlign:'center' }}>{label}</div>
    </div>
  )
})

function CheckRow({ name, pass, weight }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0',
      borderBottom:'1px solid rgba(0,0,0,.05)' }}>
      <span style={{ fontSize:14, flexShrink:0 }}>{pass ? '✅' : '❌'}</span>
      <span style={{ flex:1, fontSize:13.5, color: pass?'#1e293b':'#64748b' }}>{name}</span>
      <span style={{ fontSize:11.5, fontWeight:700, color:'#64748b', background:'#f1f5f9',
        padding:'2px 8px', borderRadius:999 }}>{weight}pt</span>
    </div>
  )
}

const TABS = ['Overview','SEO','Compare','Social Cards','Performance','Security','Tech','Images','Export']

export default function WebsiteAnalyzer() {
  const [url,          setUrl]         = useState('')
  const [loading,      setLoad]        = useState(false)
  const [data,         setData]        = useState(null)
  const [error,        setError]       = useState('')
  const [tab,          setTab]         = useState('Overview')
  const [history,      setHistory]     = useState([])
  const [zipping,      setZip]         = useState(false)
  const [copied,       copy]           = useCopy()
  const [compareUrl,   setCompareUrl]  = useState('')
  const [compareData,  setCompareData] = useState(null)
  const [loadingComp,  setLoadComp]    = useState(false)
  const [compareError, setCompError]   = useState('')
  const [aiPrompt,     setAiPrompt]    = useState('')
  const [promptLoading,setPromptLoad]  = useState(false)
  const [promptError,  setPromptError] = useState('')

  const generateRecreationPrompt = useCallback(async () => {
    if (!data) return
    setPromptLoad(true); setPromptError('')
    try {
      const res = await safeFetchJSON('/.netlify/functions/groq-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'recreationPrompt',
          payload: { data, framework: 'React + Tailwind CSS' }
        })
      }, 45000)
      if (res?.prompt) {
        setAiPrompt(res.prompt)
      } else {
        setPromptError(res?.error || 'Could not generate recreation prompt.')
      }
    } catch {
      setPromptError('Network error or timeout. Please try again.')
    } finally {
      setPromptLoad(false)
    }
  }, [data])

  const analyze = useCallback(async (u) => {
    const target = (u || url).trim()
    if (!target) return
    setLoad(true); setError(''); setData(null); setTab('Overview')
    const res = await safeFetchJSON('/.netlify/functions/analyze-website', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ url: target }),
    }, 35000)
    if (res.error) {
      setError(res.error)
    } else {
      setData(res)
      setHistory(h => [{ url:res.url, score:res.seoScore, ts:new Date().toLocaleTimeString() },
        ...h.filter(x=>x.url!==res.url).slice(0,6)])
    }
    setLoad(false)
  }, [url])

  const analyzeCompare = useCallback(async (cUrl) => {
    const target = (cUrl || compareUrl).trim()
    if (!target) return
    setLoadComp(true); setCompError(''); setCompareData(null)
    const res = await safeFetchJSON('/.netlify/functions/analyze-website', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ url: target }),
    }, 35000)
    if (res.error) {
      setCompError(res.error)
    } else {
      setCompareData(res)
    }
    setLoadComp(false)
  }, [compareUrl])

  const exportZip = useCallback(async () => {
    if (!data) return
    setZip(true)
    try {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      const f   = zip.folder('website-analysis')
      const d   = data
      const sc  = s => s>=80?'#22c55e':s>=50?'#f97316':'#ef4444'

      const esc = (str) => {
        if (!str || typeof str !== 'string') return ''
        return str
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;')
      }

      // 1. Summary text
      f.file('summary.txt', [
        `WEBSITE ANALYSIS — ${d.url}`,
        `Generated: ${new Date().toLocaleString()}`,
        '',
        'SCORES',
        `  SEO:           ${d.seoScore}/100`,
        `  Security:      ${d.secScore}/100`,
        d.pageSpeed ? `  Performance:   ${d.pageSpeed.performance}/100` : '',
        d.pageSpeed ? `  Accessibility: ${d.pageSpeed.accessibility}/100` : '',
        '',
        'META',
        `  Title:       ${d.title||'Missing'}`,
        `  Description: ${d.description||'Missing'}`,
        `  Keywords:    ${d.keywords||'—'}`,
        `  Canonical:   ${d.canonical||'Not set'}`,
        `  Word Count:  ${d.wordCount}`,
        `  HTML Size:   ${fmtBytes(d.htmlSize)}`,
        `  Load Time:   ${d.loadTime}ms`,
        '',
        'TECH STACK',
        `  ${d.techStack?.join(', ')||'Unknown'}`,
        '',
        'LINKS',
        `  Internal: ${d.links?.internal}   External: ${d.links?.external}   Total: ${d.links?.total}`,
        '',
        'IMAGES',
        `  Total: ${d.images?.total}   Missing alt: ${d.images?.missingAlt}`,
        '',
        d.dnsInfo ? `SERVER\n  IP: ${d.dnsInfo.ip}   Org: ${d.dnsInfo.org}   Location: ${d.dnsInfo.city}, ${d.dnsInfo.country}` : '',
      ].filter(Boolean).join('\n'))

      // 2. Full JSON
      f.file('report.json', JSON.stringify(d, null, 2))

      // 3. SEO + security CSV
      const csvRows = ['Section,Check,Pass,Weight']
      const escapeCell = (str) => {
        const s = String(str || '')
        const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s
        return `"${safe.replace(/"/g, '""')}"`
      }
      ;(d.seoChecks||[]).forEach(c => csvRows.push(`SEO,${escapeCell(c.name)},${c.pass?'YES':'NO'},${c.weight}`))
      ;(d.secChecks||[]).forEach(c => csvRows.push(`Security,${escapeCell(c.name)},${c.pass?'YES':'NO'},${c.weight}`))
      f.file('checks.csv', csvRows.join('\n'))

      // 4. Tech stack
      if (d.techStack?.length) f.file('tech-stack.txt', d.techStack.join('\n'))

      // 5. Image URLs
      if (d.images?.urls?.length) f.file('image-urls.txt', d.images.urls.join('\n'))

      // 6. Robots.txt
      if (d.sitemapRobots?.robotsContent) f.file('robots.txt', d.sitemapRobots.robotsContent)

      // 7. HTML report (XSS-safe escaped)
      const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>Analysis — ${esc(d.url)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',sans-serif;background:#fafbff;color:#1a1a2e;padding:32px}
.wrap{max-width:900px;margin:0 auto}
h1{font-size:26px;font-weight:800;margin-bottom:4px}
.url{color:#4F8EF7;font-size:14px;margin-bottom:24px}
.scores{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}
.score-card{background:#fff;border-radius:12px;padding:16px;text-align:center;border:1px solid rgba(0,0,0,.08)}
.score-num{font-size:32px;font-weight:900}
.score-lbl{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#888;margin-top:4px}
.section{background:#fff;border-radius:12px;padding:20px;margin-bottom:16px;border:1px solid rgba(0,0,0,.07)}
.section h2{font-size:14px;font-weight:700;margin-bottom:12px}
.check{display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #f5f5f8;font-size:12px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.meta{background:#f8f9ff;border-radius:8px;padding:9px 12px}
.meta-label{font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:#bbb;margin-bottom:2px}
.meta-val{font-size:12px;font-weight:600;color:#333;word-break:break-word}
.tag{display:inline-block;background:rgba(79,142,247,.1);color:#4F8EF7;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;margin:3px}
.footer{text-align:center;padding:20px 0;color:#bbb;font-size:11px;margin-top:16px}
</style></head><body>
<div class="wrap">
<h1>📊 Website Analysis</h1>
<div class="url">${esc(d.url)}</div>
<div class="scores">
  <div class="score-card"><div class="score-num" style="color:${sc(d.seoScore)}">${d.seoScore}</div><div class="score-lbl">SEO</div></div>
  <div class="score-card"><div class="score-num" style="color:${sc(d.secScore)}">${d.secScore}</div><div class="score-lbl">Security</div></div>
  ${d.pageSpeed?`<div class="score-card"><div class="score-num" style="color:${sc(d.pageSpeed.performance)}">${d.pageSpeed.performance}</div><div class="score-lbl">Performance</div></div>`:''}
  ${d.pageSpeed?`<div class="score-card"><div class="score-num" style="color:${sc(d.pageSpeed.accessibility)}">${d.pageSpeed.accessibility}</div><div class="score-lbl">Accessibility</div></div>`:''}
</div>
<div class="section"><h2>📋 Meta</h2><div class="grid">
  <div class="meta"><div class="meta-label">Title</div><div class="meta-val">${esc(d.title)||'—'}</div></div>
  <div class="meta"><div class="meta-label">Description</div><div class="meta-val">${esc(d.description)||'—'}</div></div>
  <div class="meta"><div class="meta-label">Word Count</div><div class="meta-val">${d.wordCount}</div></div>
  <div class="meta"><div class="meta-label">HTML Size</div><div class="meta-val">${fmtBytes(d.htmlSize)}</div></div>
  <div class="meta"><div class="meta-label">Canonical</div><div class="meta-val">${esc(d.canonical)||'Not set'}</div></div>
  <div class="meta"><div class="meta-label">Viewport</div><div class="meta-val">${esc(d.viewport)||'—'}</div></div>
</div></div>
${d.techStack?.length?`<div class="section"><h2>⚙️ Tech Stack</h2>${d.techStack.map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div>`:''}
<div class="section"><h2>🔍 SEO Checks</h2>
  ${(d.seoChecks||[]).map(c=>`<div class="check"><span>${c.pass?'✅':'❌'}</span>${esc(c.name)}<span style="margin-left:auto;font-size:10px;color:#bbb">${c.weight}pt</span></div>`).join('')}
</div>
<div class="section"><h2>🔒 Security Checks</h2>
  ${(d.secChecks||[]).map(c=>`<div class="check"><span>${c.pass?'✅':'❌'}</span>${esc(c.name)}<span style="margin-left:auto;font-size:10px;color:#bbb">${c.weight}pt</span></div>`).join('')}
</div>
${d.pageSpeed?`<div class="section"><h2>⚡ Core Web Vitals</h2>
  ${[['FCP',d.pageSpeed.fcp],['LCP',d.pageSpeed.lcp],['TBT',d.pageSpeed.tbt],['CLS',d.pageSpeed.cls],['Speed Index',d.pageSpeed.si],['TTFB',d.pageSpeed.ttfb]].map(([k,v])=>`<div class="check"><b>${k}</b><span style="margin-left:auto">${esc(String(v))}</span></div>`).join('')}
</div>`:''}
${d.dnsInfo?`<div class="section"><h2>🌐 Server</h2><div class="grid">
  <div class="meta"><div class="meta-label">IP</div><div class="meta-val">${esc(d.dnsInfo.ip)}</div></div>
  <div class="meta"><div class="meta-label">Org</div><div class="meta-val">${esc(d.dnsInfo.org)}</div></div>
  <div class="meta"><div class="meta-label">Location</div><div class="meta-val">${esc(d.dnsInfo.city)}, ${esc(d.dnsInfo.country)}</div></div>
  <div class="meta"><div class="meta-label">ASN</div><div class="meta-val">${esc(d.dnsInfo.asn)}</div></div>
</div></div>`:''}
<div class="section"><h2>🖼️ Images (${d.images?.total||0})</h2>
  <p style="font-size:12px;color:#888;margin-bottom:8px">${d.images?.missingAlt||0} missing alt text</p>
  ${(d.images?.urls||[]).slice(0,6).map(u=>`<div style="font-size:10px;color:#aaa;word-break:break-all;margin-bottom:2px">${esc(u)}</div>`).join('')}
</div>
<div class="footer">Generated by ToolDesk Website Analyzer · ${new Date().toLocaleString()}</div>
</div></body></html>`
      f.file('report.html', html)

      // 8. Download images
      if (d.images?.urls?.length) {
        const imgF = f.folder('images')
        await Promise.allSettled(d.images.urls.slice(0,10).map(async (imgUrl, i) => {
          try {
            const proxyUrl = resolveApiUrl(`/.netlify/functions/image-proxy?url=${encodeURIComponent(imgUrl)}`)
            const res = await fetch(proxyUrl, { headers: getApiHeaders(), signal: safeTimeoutSignal(7000) })
            if (!res.ok) return
            const ab  = await res.arrayBuffer()
            const ext = (imgUrl.split('.').pop()?.split('?')[0]||'jpg').slice(0,4)
            imgF.file(`image-${i+1}.${ext}`, ab, { binary:true })
          } catch {}
        }))
      }

      const blob = await zip.generateAsync({ type:'blob', compression:'DEFLATE', compressionOptions:{level:6} })
      let downloadName = 'website-analysis.zip'
      try { downloadName = `${new URL(d.url).hostname}-analysis.zip` } catch {}
      await saveFileWithFallback(blob, downloadName, 'application/zip')
    } catch(e) {
      alert('Export failed: ' + e.message)
    }
    setZip(false)
  }, [data])

  const d = data

  return (
    <ToolShell tool={tool}>

      {/* ── Input ── */}
      <Reveal>
        <ToolCard style={{ marginBottom:16 }}>
          <div style={{ display:'flex', gap:9, flexWrap:'wrap' }}>
            <input className="inp"
              placeholder="https://example.com"
              value={url} onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key==='Enter' && analyze()}
              style={{ flex:1, minWidth:200, fontSize:15, fontFamily:'monospace' }}/>
            <motion.button
              whileHover={{ scale:1.02, y:-2 }} whileTap={{ scale:.97 }}
              transition={{ type:'spring', stiffness:500, damping:24 }}
              onClick={() => analyze()} disabled={!url.trim()||loading}
              style={{ padding:'13px 26px', borderRadius:13, border:'none',
                background: url.trim()&&!loading ? 'linear-gradient(135deg,#0d0d1a,#1e1040)' : '#e5e7ef',
                color:'#fff', fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:14,
                cursor: url.trim()&&!loading ? 'pointer' : 'not-allowed', whiteSpace:'nowrap' }}>
              {loading ? '🔍 Analyzing…' : '🔍 Analyze'}
            </motion.button>
          </div>
          <div style={{ display:'flex', gap:6, marginTop:11, flexWrap:'wrap' }}>
            {['https://github.com','https://vercel.com','https://stripe.com','https://shopify.com'].map(u => (
              <button key={u} onClick={() => { setUrl(u); setTimeout(()=>analyze(u),50) }}
                style={{ fontSize:11, padding:'4px 11px', borderRadius:999,
                  border:'1.5px solid rgba(79,142,247,.18)', background:'rgba(79,142,247,.05)',
                  color:'#4F8EF7', cursor:'pointer', fontWeight:600 }}>
                {safeHostname(u)}
              </button>
            ))}
          </div>
          <AnimatePresence>
            {error && (
              <motion.div initial={{ opacity:0, y:-4 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
                style={{ marginTop:12, padding:'10px 14px', background:'rgba(239,68,68,.06)',
                  border:'1px solid rgba(239,68,68,.2)', borderRadius:10, fontSize:13, color:'#b91c1c' }}>
                ⚠️ {error}
              </motion.div>
            )}
          </AnimatePresence>
        </ToolCard>
      </Reveal>

      {/* ── Loading ── */}
      {loading && (
        <ToolCard style={{ marginBottom:16, padding:'36px 20px', textAlign:'center' }}>
          <motion.div animate={{ rotate:360 }} transition={{ duration:1.4, repeat:Infinity, ease:'linear' }}
            style={{ fontSize:36, display:'inline-block', marginBottom:12 }}>🔍</motion.div>
          <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:15, color:'#0d0d1a', marginBottom:6 }}>
            Analyzing website…
          </div>
          <div style={{ fontSize:13, color:'#64748b' }}>
            Fetching page · Checking SEO · PageSpeed · Security headers · Server info
          </div>
          <div style={{ marginTop:14, height:3, background:'#f0f0f5', borderRadius:3, overflow:'hidden' }}>
            <motion.div animate={{ x:['-100%','100%'] }}
              transition={{ duration:1.4, repeat:Infinity, ease:'easeInOut' }}
              style={{ height:'100%', width:'60%',
                background:'linear-gradient(90deg,#4F8EF7,#7c3aed)', borderRadius:3 }}/>
          </div>
        </ToolCard>
      )}

      {/* ── Results ── */}
      <AnimatePresence>
        {d && !loading && (
          <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }}>

            {/* Scores + header */}
            <Reveal>
              <ToolCard style={{ marginBottom:14 }}>
                <div style={{ display:'flex', justifyContent:'space-between',
                  alignItems:'flex-start', marginBottom:18, flexWrap:'wrap', gap:10 }}>
                  <div>
                    <div style={{ fontFamily:'Syne,sans-serif', fontWeight:800,
                      fontSize:16.5, color:'#0d0d1a', marginBottom:4 }}>
                      {d.title || '(No title)'}
                    </div>
                    <a href={typeof d.url === 'string' && /^https?:\/\//i.test(d.url) ? d.url : '#'} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize:13, color:'#4F8EF7', textDecoration:'none' }}>{d.url}</a>
                    <div style={{ display:'flex', gap:12, marginTop:6, fontSize:12.5, color:'#64748b', flexWrap:'wrap' }}>
                      <span>⏱ {d.loadTime}ms</span>
                      <span>📦 {fmtBytes(d.htmlSize)}</span>
                      <span>📝 {d.wordCount} words</span>
                      {d.hasHTTPS && <span style={{ color:'#22c55e', fontWeight:700 }}>🔒 HTTPS</span>}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:7 }}>
                    <motion.button whileHover={{ scale:1.04 }} whileTap={{ scale:.96 }}
                      onClick={() => window.print()}
                      style={{ padding:'9px 14px', borderRadius:11,
                        border:'1.5px solid rgba(79,142,247,.3)', background:'rgba(79,142,247,.08)',
                        color:'#4F8EF7', fontWeight:700, fontSize:12, cursor:'pointer' }}>
                      📄 PDF Report
                    </motion.button>
                    <motion.button whileHover={{ scale:1.04 }} whileTap={{ scale:.96 }}
                      onClick={exportZip} disabled={zipping}
                      style={{ padding:'9px 16px', borderRadius:11, border:'none',
                        background: zipping ? '#e5e7ef' : 'linear-gradient(135deg,#4F8EF7,#7c3aed)',
                        color:'#fff', fontWeight:700, fontSize:12.5,
                        cursor:zipping?'not-allowed':'pointer' }}>
                      {zipping ? '⏳…' : '📦 Export ZIP'}
                    </motion.button>
                    <motion.button whileHover={{ scale:1.04 }} whileTap={{ scale:.96 }}
                      onClick={() => { setData(null); setUrl('') }}
                      style={{ padding:'9px 14px', borderRadius:11,
                        border:'1.5px solid rgba(0,0,0,.1)', background:'#fff',
                        color:'#555', fontWeight:700, fontSize:12, cursor:'pointer' }}>
                      ✕
                    </motion.button>
                  </div>
                </div>
                <div className="tool-grid-4" style={{ gap:12 }}>
                  <ScoreRing score={d.seoScore}  label="SEO"/>
                  <ScoreRing score={d.secScore}  label="Security"/>
                  {d.pageSpeed && <ScoreRing score={d.pageSpeed.performance}   label="Performance"/>}
                  {d.pageSpeed && <ScoreRing score={d.pageSpeed.accessibility} label="Accessibility"/>}
                </div>
              </ToolCard>
            </Reveal>

            {/* Tabs — horizontally scrollable on mobile */}
            <Reveal delay={.04}>
              <div className="wa-tabs" style={{
                display:'flex', gap:6, marginBottom:14,
                overflowX:'auto', WebkitOverflowScrolling:'touch',
                paddingBottom:4,
                scrollbarWidth:'none', msOverflowStyle:'none',
              }}>
                <style>{`.wa-tabs::-webkit-scrollbar{display:none}`}</style>
                {TABS.map(t => (
                  <button key={t} onClick={() => setTab(t)}
                    style={{
                      flexShrink:0,
                      padding:'8px 16px', borderRadius:999,
                      border: tab===t ? '1px solid #0d0d1a' : '1px solid rgba(0,0,0,.07)',
                      cursor:'pointer',
                      fontSize:12.5, fontWeight:700,
                      background: tab===t ? '#0d0d1a' : '#ffffff',
                      color: tab===t ? '#fff' : '#555',
                      boxShadow: tab===t ? '0 4px 14px rgba(13,13,26,.2)' : 'inset 0 1px 0 rgba(255,255,255,.9)',
                      transition:'all .18s', whiteSpace:'nowrap',
                    }}>
                    {t}
                  </button>
                ))}
              </div>
            </Reveal>

            <AnimatePresence mode="wait">

            {/* OVERVIEW */}
            {tab==='Overview' && (
              <motion.div key="ov" initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}>
                <ToolCard style={{ marginBottom:14 }}>
                  <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:14,
                    color:'#0d0d1a', marginBottom:14 }}>📋 Meta Information</div>
                  <div className="tool-grid-2-compact" style={{ gap:8 }}>
                    {[
                      {l:'Title',       v:d.title},
                      {l:'Description', v:d.description},
                      {l:'Keywords',    v:d.keywords},
                      {l:'Canonical',   v:d.canonical},
                      {l:'Robots',      v:d.robots},
                      {l:'Charset',     v:d.charset},
                      {l:'Viewport',    v:d.viewport},
                      {l:'OG Title',    v:d.ogTitle},
                    ].map(m => (
                      <div key={m.l} style={{ padding:'10px 12px', background:'#fafbff',
                        borderRadius:10, border:'1px solid rgba(0,0,0,.06)' }}>
                        <div style={{ fontSize:11.5, color:'#64748b', fontWeight:700,
                          textTransform:'uppercase', letterSpacing:'.6px', marginBottom:4 }}>{m.l}</div>
                        <div style={{ fontSize:13, color:m.v?'#1e293b':'#94a3b8',
                          fontWeight:m.v?600:400, wordBreak:'break-word', lineHeight:1.45 }}>
                          {m.v || 'Not set'}
                        </div>
                      </div>
                    ))}
                  </div>
                </ToolCard>

                {/* H tags */}
                {(d.h1s?.length > 0 || d.h2s?.length > 0) && (
                  <ToolCard style={{ marginBottom:14 }}>
                    <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700,
                      fontSize:14, color:'#0d0d1a', marginBottom:12 }}>🏷️ Headings</div>
                    {d.h1s?.length > 0 && (
                      <div style={{ marginBottom:10 }}>
                        <div style={{ fontSize:10.5, fontWeight:700, color:'#4F8EF7',
                          textTransform:'uppercase', letterSpacing:'.5px', marginBottom:7 }}>
                          H1 ({d.h1s.length})
                        </div>
                        {d.h1s.map((h,i) => (
                          <div key={i} style={{ padding:'7px 12px', background:'rgba(79,142,247,.06)',
                            borderRadius:8, fontSize:13, color:'#333', marginBottom:5, fontWeight:600 }}>{h}</div>
                        ))}
                      </div>
                    )}
                    {d.h2s?.slice(0,5)?.map((h,i) => (
                      <div key={i} style={{ padding:'6px 12px', background:'#f8f9ff',
                        borderRadius:8, fontSize:12.5, color:'#555', marginBottom:4 }}>{h}</div>
                    ))}
                  </ToolCard>
                )}

                {/* Server */}
                {d.dnsInfo && (
                  <ToolCard style={{ marginBottom:14 }}>
                    <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700,
                      fontSize:14, color:'#0d0d1a', marginBottom:12 }}>🌐 Server Information</div>
                    <div className="tool-grid-2-compact" style={{ gap:8, marginBottom:10 }}>
                      {[
                        {l:'IP Address',  v:d.dnsInfo.ip},
                        {l:'Organization',v:d.dnsInfo.org},
                        {l:'Location',    v:`${d.dnsInfo.city||''}, ${d.dnsInfo.country||''}`},
                        {l:'ASN',         v:d.dnsInfo.asn},
                      ].map(m => (
                        <div key={m.l} style={{ padding:'10px 12px', background:'#fafbff',
                          borderRadius:10, border:'1px solid rgba(0,0,0,.06)' }}>
                          <div style={{ fontSize:11.5, color:'#64748b', fontWeight:700,
                            textTransform:'uppercase', letterSpacing:'.6px', marginBottom:4 }}>{m.l}</div>
                          <div style={{ fontSize:13.5, color:'#1e293b', fontWeight:600 }}>{m.v||'—'}</div>
                        </div>
                      ))}
                    </div>
                    {d.dnsInfo.lat && d.dnsInfo.lon && (
                      <a href={`https://maps.google.com/?q=${d.dnsInfo.lat},${d.dnsInfo.lon}`}
                        target="_blank" rel="noopener noreferrer"
                        style={{ display:'block', padding:'9px', borderRadius:10, textAlign:'center',
                          background:'rgba(79,142,247,.06)', color:'#4F8EF7', fontWeight:700,
                          fontSize:12.5, textDecoration:'none', border:'1px solid rgba(79,142,247,.18)' }}>
                        🗺 View server location on Google Maps
                      </a>
                    )}
                  </ToolCard>
                )}

                {/* Sitemap & Robots */}
                <ToolCard style={{ marginBottom:14 }}>
                  <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700,
                    fontSize:14, color:'#0d0d1a', marginBottom:12 }}>🗺️ Sitemap & Robots</div>
                  <div className="tool-grid-3" style={{ gap:8, marginBottom:10 }}>
                    {[
                      {l:'robots.txt',      v:d.sitemapRobots?.robotsOk},
                      {l:'sitemap.xml',     v:d.sitemapRobots?.sitemapExists},
                      {l:'Sitemap in robots',v:d.sitemapRobots?.sitemapInRobots},
                    ].map(m => (
                      <div key={m.l} style={{ padding:'10px 12px', textAlign:'center',
                        background:m.v?'rgba(34,197,94,.06)':'rgba(239,68,68,.05)',
                        borderRadius:10, border:`1px solid ${m.v?'rgba(34,197,94,.2)':'rgba(239,68,68,.15)'}` }}>
                        <div style={{ fontSize:20, marginBottom:5 }}>{m.v?'✅':'❌'}</div>
                        <div style={{ fontSize:12, fontWeight:700, color:m.v?'#15803d':'#b91c1c' }}>{m.l}</div>
                      </div>
                    ))}
                  </div>
                  {d.sitemapRobots?.robotsContent && (
                    <div style={{ background:'#f5f6fa', borderRadius:10, padding:'10px 12px',
                      fontFamily:'monospace', fontSize:11, color:'#555',
                      whiteSpace:'pre-wrap', maxHeight:120, overflowY:'auto' }}>
                      {d.sitemapRobots.robotsContent}
                    </div>
                  )}
                </ToolCard>

                {/* OG Preview */}
                {(d.ogTitle || d.ogImage) && (
                  <ToolCard>
                    <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700,
                      fontSize:14, color:'#0d0d1a', marginBottom:12 }}>📤 Social Preview</div>
                    <div style={{ border:'1px solid rgba(0,0,0,.1)', borderRadius:12, overflow:'hidden' }}>
                      {d.ogImage && (
                        <img src={d.ogImage} alt="OG" loading="lazy"
                          style={{ width:'100%', maxHeight:180, objectFit:'cover', display:'block' }}/>
                      )}
                      <div style={{ padding:'12px 14px', background:'#f8f9ff' }}>
                        {d.ogTitle && <div style={{ fontWeight:700, fontSize:14, color:'#0d0d1a', marginBottom:4 }}>{d.ogTitle}</div>}
                        {d.ogDesc  && <div style={{ fontSize:13, color:'#475569', lineHeight:1.55 }}>{d.ogDesc}</div>}
                        <div style={{ fontSize:12, color:'#64748b', marginTop:5 }}>{d.url}</div>
                      </div>
                    </div>
                  </ToolCard>
                )}

                {/* Deep Strategic AI Website Audit */}
                <DeepWebPanel data={d} />
              </motion.div>
            )}

            {/* SEO */}
            {tab==='SEO' && (
              <motion.div key="seo" initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}>
                <ToolCard style={{ marginBottom:14 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:14 }}>
                    <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:14, color:'#0d0d1a' }}>🔍 SEO Audit</div>
                    <div style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:20,
                      color:d.seoScore>=80?'#22c55e':d.seoScore>=50?'#f97316':'#ef4444' }}>{d.seoScore}/100</div>
                  </div>
                  {(d.seoChecks||[]).map((c,i) => (
                    <motion.div key={i} initial={{ opacity:0, x:-8 }} animate={{ opacity:1, x:0 }}
                      transition={{ delay:i*.04 }}>
                      <CheckRow {...c}/>
                    </motion.div>
                  ))}
                </ToolCard>
                <ToolCard style={{ marginBottom:14 }}>
                  <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:14, color:'#0d0d1a', marginBottom:12 }}>🔗 Links</div>
                  <div className="tool-grid-3" style={{ gap:10 }}>
                    {[{l:'Internal',v:d.links?.internal,c:'#4F8EF7'},{l:'External',v:d.links?.external,c:'#9C6FDE'},{l:'Total',v:d.links?.total,c:'#64748b'}].map(s=>(
                      <div key={s.l} style={{ textAlign:'center', padding:'14px 8px',
                        background:'#fafbff', borderRadius:12, border:'1px solid rgba(0,0,0,.06)' }}>
                        <div style={{ fontFamily:'Syne,sans-serif', fontSize:26, fontWeight:800, color:s.c }}>{s.v??'—'}</div>
                        <div style={{ fontSize:12, color:'#64748b', fontWeight:700, textTransform:'uppercase', marginTop:4 }}>{s.l}</div>
                      </div>
                    ))}
                  </div>
                </ToolCard>

                {/* AI Actionable SEO Recommendations */}
                <SEOSuggestPanel data={d} />
              </motion.div>
            )}

            {/* COMPETITOR COMPARISON */}
            {tab==='Compare' && (
              <motion.div key="comp" initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}>
                <ToolCard style={{ marginBottom:14 }}>
                  <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:15, color:'#0d0d1a', marginBottom:4 }}>
                    ⚔️ Side-by-Side Competitor Audit
                  </div>
                  <div style={{ fontSize:12, color:'#666', marginBottom:14 }}>
                    Compare <strong>{d.title || d.url}</strong> directly against a competitor domain to see who wins in SEO, Security, Performance, and Load Speed.
                  </div>

                  <div style={{ display:'flex', gap:9, marginBottom:16 }}>
                    <input className="inp" placeholder="https://competitor.com" value={compareUrl}
                      onChange={e => setCompareUrl(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && analyzeCompare()}
                      style={{ flex:1, fontSize:14, fontFamily:'monospace' }}/>
                    <button onClick={() => analyzeCompare()} disabled={!compareUrl.trim() || loadingComp}
                      style={{ padding:'10px 20px', borderRadius:11, border:'none',
                        background: compareUrl.trim() && !loadingComp ? '#4F8EF7' : '#e5e7ef',
                        color:'#fff', fontWeight:700, cursor: compareUrl.trim() && !loadingComp ? 'pointer' : 'not-allowed' }}>
                      {loadingComp ? '🔍 Analyzing...' : '⚔️ Compare'}
                    </button>
                  </div>

                  {compareError && (
                    <div style={{ padding:'9px 12px', background:'rgba(239,68,68,.06)', border:'1px solid rgba(239,68,68,.2)', borderRadius:10, fontSize:12.5, color:'#ef4444', marginBottom:14 }}>
                      ⚠️ {compareError}
                    </div>
                  )}

                  {compareData && (
                    <div className="tool-grid-2" style={{ gap:16, marginTop:16 }}>
                      {/* Left: Target site */}
                      <div style={{ padding:16, background:'#fafbff', borderRadius:14, border:'1.5px solid rgba(79,142,247,.3)' }}>
                        <div style={{ fontSize:11, fontWeight:700, color:'#4F8EF7', textTransform:'uppercase', letterSpacing:'.5px' }}>YOUR SITE</div>
                        <div style={{ fontWeight:800, fontSize:15, color:'#0d0d1a', margin:'4px 0' }}>{d.title || safeHostname(d.url)}</div>
                        <div style={{ fontSize:11, color:'#aaa', marginBottom:12 }}>{d.url}</div>
                        
                        <div style={{ display:'flex', justifyContent:'space-around', margin:'12px 0' }}>
                          <ScoreRing score={d.seoScore} label="SEO"/>
                          <ScoreRing score={d.secScore} label="Security"/>
                        </div>

                        <div style={{ fontSize:12, color:'#444', display:'flex', flexDirection:'column', gap:6, marginTop:12 }}>
                          <div>⚡ <strong>Load Time:</strong> {d.loadTime} ms</div>
                          <div>📦 <strong>HTML Size:</strong> {fmtBytes(d.htmlSize)}</div>
                          <div>📝 <strong>Word Count:</strong> {d.wordCount}</div>
                          <div>⚙️ <strong>Tech Stack:</strong> {d.techStack?.slice(0, 4).join(', ') || '—'}</div>
                        </div>
                      </div>

                      {/* Right: Competitor site */}
                      <div style={{ padding:16, background:'#fafbff', borderRadius:14, border:'1.5px solid rgba(156,111,222,.3)' }}>
                        <div style={{ fontSize:11, fontWeight:700, color:'#9C6FDE', textTransform:'uppercase', letterSpacing:'.5px' }}>COMPETITOR</div>
                        <div style={{ fontWeight:800, fontSize:15, color:'#0d0d1a', margin:'4px 0' }}>{compareData.title || safeHostname(compareData.url)}</div>
                        <div style={{ fontSize:11, color:'#aaa', marginBottom:12 }}>{compareData.url}</div>

                        <div style={{ display:'flex', justifyContent:'space-around', margin:'12px 0' }}>
                          <ScoreRing score={compareData.seoScore} label="SEO"/>
                          <ScoreRing score={compareData.secScore} label="Security"/>
                        </div>

                        <div style={{ fontSize:12, color:'#444', display:'flex', flexDirection:'column', gap:6, marginTop:12 }}>
                          <div>⚡ <strong>Load Time:</strong> {compareData.loadTime} ms</div>
                          <div>📦 <strong>HTML Size:</strong> {fmtBytes(compareData.htmlSize)}</div>
                          <div>📝 <strong>Word Count:</strong> {compareData.wordCount}</div>
                          <div>⚙️ <strong>Tech Stack:</strong> {compareData.techStack?.slice(0, 4).join(', ') || '—'}</div>
                        </div>
                      </div>
                    </div>
                  )}
                </ToolCard>
              </motion.div>
            )}

            {/* SOCIAL CARDS PREVIEW */}
            {tab==='Social Cards' && (
              <motion.div key="sc" initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}>
                <ToolCard style={{ marginBottom:14 }}>
                  <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:15, color:'#0d0d1a', marginBottom:4 }}>
                    📱 Social OpenGraph Link Previews
                  </div>
                  <div style={{ fontSize:12, color:'#666', marginBottom:16 }}>
                    This is how your website link appears when shared across social media and messaging apps.
                  </div>

                  <div className="tool-grid-2" style={{ gap:16 }}>
                    {/* Twitter / X Card */}
                    <div style={{ border:'1px solid #e1e8ed', borderRadius:16, overflow:'hidden', background:'#fff' }}>
                      <div style={{ padding:'8px 12px', background:'#f7f9fa', borderBottom:'1px solid #e1e8ed', fontSize:11, fontWeight:700, color:'#536471' }}>
                        𝕏 / Twitter Card
                      </div>
                      {d.ogImage ? (
                        <SafeImage src={d.ogImage} alt="OG Preview" style={{ width:'100%', height:160, objectFit:'cover' }} />
                      ) : (
                        <div style={{ height:120, background:'#eee', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, color:'#aaa' }}>
                          No og:image set
                        </div>
                      )}
                      <div style={{ padding:12 }}>
                        <div style={{ fontSize:10.5, color:'#536471', textTransform:'lowercase' }}>{d.url}</div>
                        <div style={{ fontSize:13, fontWeight:700, color:'#0f1419', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{d.ogTitle || d.title}</div>
                        <div style={{ fontSize:11.5, color:'#536471', marginTop:4, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{d.ogDescription || d.description}</div>
                      </div>
                    </div>

                    {/* Facebook / LinkedIn Card */}
                    <div style={{ border:'1px solid #dadde1', borderRadius:8, overflow:'hidden', background:'#f0f2f5' }}>
                      <div style={{ padding:'8px 12px', background:'#e4e6eb', borderBottom:'1px solid #dadde1', fontSize:11, fontWeight:700, color:'#4b4f56' }}>
                        📘 Facebook & LinkedIn Preview
                      </div>
                      {d.ogImage ? (
                        <SafeImage src={d.ogImage} alt="OG Preview" style={{ width:'100%', height:160, objectFit:'cover' }} />
                      ) : (
                        <div style={{ height:120, background:'#e4e6eb', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, color:'#8d949e' }}>
                          No og:image set
                        </div>
                      )}
                      <div style={{ padding:10, background:'#f2f3f5' }}>
                        <div style={{ fontSize:10, color:'#606770', textTransform:'uppercase' }}>{safeHostname(d.url)}</div>
                        <div style={{ fontSize:13, fontWeight:700, color:'#1d2129', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{d.ogTitle || d.title}</div>
                        <div style={{ fontSize:11, color:'#606770', marginTop:2, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{d.ogDescription || d.description}</div>
                      </div>
                    </div>
                  </div>
                </ToolCard>
              </motion.div>
            )}

            {/* PERFORMANCE */}
            {tab==='Performance' && (
              <motion.div key="perf" initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}>
                {d.pageSpeed ? (
                  <>
                    <ToolCard style={{ marginBottom:14 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:14 }}>
                        <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:14, color:'#0d0d1a' }}>⚡ Core Web Vitals (Mobile)</div>
                        <div style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:20,
                          color:d.pageSpeed.performance>=80?'#22c55e':d.pageSpeed.performance>=50?'#f97316':'#ef4444' }}>
                          {d.pageSpeed.performance}/100
                        </div>
                      </div>
                      <div className="tool-grid-2-compact" style={{ gap:9 }}>
                        {[
                          {l:'First Contentful Paint',v:d.pageSpeed.fcp,icon:'🎨'},
                          {l:'Largest Contentful Paint',v:d.pageSpeed.lcp,icon:'📐'},
                          {l:'Total Blocking Time',v:d.pageSpeed.tbt,icon:'⏱'},
                          {l:'Cumulative Layout Shift',v:d.pageSpeed.cls,icon:'📏'},
                          {l:'Speed Index',v:d.pageSpeed.si,icon:'📊'},
                          {l:'Time to First Byte',v:d.pageSpeed.ttfb,icon:'🚀'},
                        ].map(m=>(
                          <div key={m.l} style={{ padding:'12px 14px', background:'#fafbff',
                            borderRadius:12, border:'1px solid rgba(0,0,0,.07)' }}>
                            <div style={{ fontSize:11.5, color:'#aaa', marginBottom:5 }}>{m.icon} {m.l}</div>
                            <div style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:20, color:'#0d0d1a' }}>{m.v}</div>
                          </div>
                        ))}
                      </div>
                    </ToolCard>
                    {d.pageSpeed.opportunities?.length > 0 && (
                      <ToolCard>
                        <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:14, color:'#0d0d1a', marginBottom:12 }}>💡 Opportunities</div>
                        {d.pageSpeed.opportunities.map((o,i)=>(
                          <div key={i} style={{ display:'flex', justifyContent:'space-between',
                            padding:'9px 12px', background:'rgba(249,115,22,.05)', borderRadius:9,
                            border:'1px solid rgba(249,115,22,.18)', marginBottom:7 }}>
                            <span style={{ fontSize:12.5, color:'#555' }}>{o.title}</span>
                            <span style={{ fontSize:12, fontWeight:700, color:'#f97316' }}>{o.savings}</span>
                          </div>
                        ))}
                      </ToolCard>
                    )}
                  </>
                ) : (
                  <ToolCard>
                    <div style={{ textAlign:'center', padding:'32px 20px', color:'#bbb', fontSize:13 }}>
                      PageSpeed data unavailable — Google API may be rate-limited. Try again in a moment.
                    </div>
                  </ToolCard>
                )}
              </motion.div>
            )}

            {/* SECURITY */}
            {tab==='Security' && (
              <motion.div key="sec" initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}>
                <ToolCard style={{ marginBottom:14 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:14 }}>
                    <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:14, color:'#0d0d1a' }}>🔒 Security Audit</div>
                    <div style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:20,
                      color:d.secScore>=80?'#22c55e':d.secScore>=50?'#f97316':'#ef4444' }}>{d.secScore}/100</div>
                  </div>
                  {(d.secChecks||[]).map((c,i)=>(
                    <motion.div key={i} initial={{ opacity:0, x:-8 }} animate={{ opacity:1, x:0 }}
                      transition={{ delay:i*.05 }}>
                      <CheckRow {...c}/>
                    </motion.div>
                  ))}
                </ToolCard>
                <ToolCard>
                  <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:14, color:'#0d0d1a', marginBottom:12 }}>📋 Response Headers</div>
                  {Object.entries(d.secHeaders||{}).filter(([,v])=>v&&v!==false).map(([k,v])=>(
                    <div key={k} style={{ display:'flex', gap:10, padding:'8px 0',
                      borderBottom:'1px solid rgba(0,0,0,.05)', fontSize:12 }}>
                      <span style={{ minWidth:170, fontWeight:600, color:'#444',
                        fontFamily:'monospace', fontSize:11 }}>{k}</span>
                      <span style={{ color:'#777', wordBreak:'break-all' }}>
                        {typeof v==='boolean'?(v?'✅ Present':'❌ Missing'):String(v).slice(0,80)}
                      </span>
                    </div>
                  ))}
                </ToolCard>
              </motion.div>
            )}

            {/* TECH */}
            {tab==='Tech' && (
              <motion.div key="tech" initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}>
                <ToolCard style={{ marginBottom:14 }}>
                  <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:14, color:'#0d0d1a', marginBottom:14 }}>⚙️ Technology Stack</div>
                  {d.techStack?.length > 0 ? (
                    <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                      {d.techStack.map((t,i)=>(
                        <motion.div key={t} initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }}
                          transition={{ delay:i*.03 }}
                          style={{ padding:'7px 16px', borderRadius:999, fontSize:13, fontWeight:700,
                            background:'rgba(79,142,247,.09)', color:'#4F8EF7',
                            border:'1.5px solid rgba(79,142,247,.2)' }}>
                          {t}
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ color:'#bbb', fontSize:13 }}>No known technologies detected</div>
                  )}
                </ToolCard>
                <ToolCard>
                  <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:14, color:'#0d0d1a', marginBottom:12 }}>📊 Page Resources</div>
                  <div className="tool-grid-3" style={{ gap:10 }}>
                    {[{l:'Scripts',v:d.scripts,c:'#f97316',icon:'📜'},{l:'Stylesheets',v:d.stylesheets,c:'#4F8EF7',icon:'🎨'},{l:'Images',v:d.images?.total,c:'#22c55e',icon:'🖼️'}].map(s=>(
                      <div key={s.l} style={{ textAlign:'center', padding:'14px 8px',
                        background:'#fafbff', borderRadius:12, border:'1px solid rgba(0,0,0,.06)' }}>
                        <div style={{ fontSize:24, marginBottom:6 }}>{s.icon}</div>
                        <div style={{ fontFamily:'Syne,sans-serif', fontSize:24, fontWeight:800, color:s.c }}>{s.v??'—'}</div>
                        <div style={{ fontSize:11, color:'#bbb', fontWeight:700, textTransform:'uppercase', marginTop:4 }}>{s.l}</div>
                      </div>
                    ))}
                  </div>
                </ToolCard>
              </motion.div>
            )}

            {/* IMAGES */}
            {tab==='Images' && (
              <motion.div key="imgs" initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}>
                <ToolCard>
                  <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:14, color:'#0d0d1a', marginBottom:14 }}>🖼️ Images ({d.images?.total||0})</div>
                  <div style={{ display:'flex', gap:10, marginBottom:16 }}>
                    <div style={{ flex:1, textAlign:'center', padding:'12px', background:'#fafbff',
                      borderRadius:12, border:'1px solid rgba(0,0,0,.06)' }}>
                      <div style={{ fontFamily:'Syne,sans-serif', fontSize:22, fontWeight:800, color:'#4F8EF7' }}>{d.images?.total}</div>
                      <div style={{ fontSize:11, color:'#bbb', fontWeight:700, textTransform:'uppercase', marginTop:4 }}>Total</div>
                    </div>
                    <div style={{ flex:1, textAlign:'center', padding:'12px',
                      background:d.images?.missingAlt>0?'rgba(239,68,68,.05)':'rgba(34,197,94,.05)',
                      borderRadius:12, border:`1px solid ${d.images?.missingAlt>0?'rgba(239,68,68,.2)':'rgba(34,197,94,.2)'}` }}>
                      <div style={{ fontFamily:'Syne,sans-serif', fontSize:22, fontWeight:800,
                        color:d.images?.missingAlt>0?'#ef4444':'#22c55e' }}>{d.images?.missingAlt}</div>
                      <div style={{ fontSize:11, color:'#bbb', fontWeight:700, textTransform:'uppercase', marginTop:4 }}>Missing Alt</div>
                    </div>
                  </div>
                  {d.images?.urls?.length > 0 && (
                    <div className="tool-grid-3" style={{ gap:8 }}>
                      {d.images.urls.map((img,i)=>(
                        <motion.div key={i} initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }}
                          transition={{ delay:i*.03 }}
                          style={{ borderRadius:10, overflow:'hidden', background:'#f0f0f5',
                            aspectRatio:'16/9', position:'relative' }}>
                          <SafeImage src={img} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer"
                            style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
                        </motion.div>
                      ))}
                    </div>
                  )}
                </ToolCard>
              </motion.div>
            )}

            {/* EXPORT */}
            {tab==='Export' && (
              <motion.div key="exp" initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}>
                <ToolCard>
                  <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:14, color:'#0d0d1a', marginBottom:16 }}>📦 Export Report</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                    {[
                      { icon:'📦', title:'Full ZIP Archive', desc:'HTML report · JSON data · CSV checks · images (up to 10) · robots.txt · summary', action:exportZip, label:zipping?'⏳ Zipping…':'Download ZIP', primary:true },
                      { icon:'📄', title:'Copy JSON', desc:'Full raw analysis data as JSON string', action:()=>copy(JSON.stringify(d,null,2)), label:copied?'✓ Copied':'Copy JSON', primary:false },
                    ].map((item,i)=>(
                      <div key={i} style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 16px',
                        background:'#fafbff', borderRadius:14, border:'1px solid rgba(0,0,0,.07)' }}>
                        <div style={{ fontSize:28, flexShrink:0 }}>{item.icon}</div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:700, fontSize:14, color:'#0d0d1a', marginBottom:3 }}>{item.title}</div>
                          <div style={{ fontSize:12, color:'#888' }}>{item.desc}</div>
                        </div>
                        <motion.button whileHover={{ scale:1.04 }} whileTap={{ scale:.96 }}
                          onClick={item.action} disabled={zipping}
                          style={{ padding:'9px 16px', borderRadius:10, border:'none', flexShrink:0,
                            background:item.primary?'linear-gradient(135deg,#4F8EF7,#7c3aed)':'#f0f4ff',
                            color:item.primary?'#fff':'#4F8EF7',
                            fontWeight:700, fontSize:12.5, cursor:'pointer', whiteSpace:'nowrap' }}>
                          {item.label}
                        </motion.button>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop:14, padding:'12px 14px', background:'rgba(79,142,247,.05)',
                    border:'1px solid rgba(79,142,247,.15)', borderRadius:11, fontSize:12, color:'#666', lineHeight:1.7 }}>
                    📦 ZIP contains: <strong>HTML report</strong>, <strong>JSON data</strong>,
                    <strong> SEO+Security CSV</strong>, <strong>tech stack</strong>,
                    <strong> image files</strong>, <strong>robots.txt</strong>, and a <strong>text summary</strong>.
                  </div>
                </ToolCard>

                {/* AI Recreation Prompt Card */}
                <ToolCard style={{ marginTop: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 14, color: '#0d0d1a' }}>
                        🤖 AI Website Clone & Build Prompt
                      </div>
                      <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                        Generate a complete specification prompt for Cursor, Claude, Bolt.new, or Lovable to rebuild this website.
                      </div>
                    </div>
                    <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: .97 }}
                      onClick={generateRecreationPrompt} disabled={promptLoading}
                      style={{
                        padding: '8px 16px', borderRadius: 10, border: 'none',
                        background: 'linear-gradient(135deg,#7c3aed,#4F8EF7)',
                        color: '#fff', fontWeight: 700, fontSize: 12.5,
                        cursor: promptLoading ? 'not-allowed' : 'pointer',
                        boxShadow: '0 4px 14px rgba(124,58,237,.25)'
                      }}>
                      {promptLoading ? '🧠 Engineering Prompt…' : '⚡ Generate Prompt'}
                    </motion.button>
                  </div>

                  {promptError && (
                    <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,.06)',
                      border: '1px solid rgba(239,68,68,.18)', borderRadius: 9,
                      color: '#b91c1c', fontSize: 12, marginBottom: 12 }}>
                      ⚠️ {promptError}
                    </div>
                  )}

                  {aiPrompt && (
                    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                      style={{ marginTop: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                          📋 Ready-to-Paste Build Prompt
                        </span>
                        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: .95 }}
                          onClick={() => copy(aiPrompt)}
                          style={{
                            padding: '4px 12px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                            cursor: 'pointer', border: '1px solid rgba(124,58,237,.25)',
                            background: copied ? 'rgba(34,197,94,.1)' : 'rgba(124,58,237,.08)',
                            color: copied ? '#22c55e' : '#7c3aed'
                          }}>
                          {copied ? '✓ Copied' : '📋 Copy Prompt'}
                        </motion.button>
                      </div>
                      <div style={{
                        background: '#1a1a2e', color: '#e2e8f0', borderRadius: 12, padding: '14px 16px',
                        fontSize: 12.5, lineHeight: 1.7, maxHeight: 280, overflowY: 'auto',
                        whiteSpace: 'pre-wrap', fontFamily: 'monospace', border: '1px solid rgba(255,255,255,.08)'
                      }}>
                        {aiPrompt}
                      </div>
                    </motion.div>
                  )}
                </ToolCard>
              </motion.div>
            )}

            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* History */}
      <AnimatePresence>
        {history.length > 0 && !loading && !d && (
          <Reveal>
            <ToolCard>
              <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:13, color:'#0d0d1a', marginBottom:10 }}>🕐 Recent Analyses</div>
              {history.map((h,i)=>(
                <div key={i} onClick={()=>{ setUrl(h.url); analyze(h.url) }}
                  style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                    padding:'9px 13px', background:'#fafbff', borderRadius:10,
                    border:'1px solid rgba(0,0,0,.06)', marginBottom:6, cursor:'pointer' }}
                  onMouseEnter={e=>e.currentTarget.style.background='#f0f4ff'}
                  onMouseLeave={e=>e.currentTarget.style.background='#fafbff'}>
                  <span style={{ fontSize:12.5, color:'#4F8EF7', fontWeight:600 }}>{h.url}</span>
                  <span style={{ fontSize:11, color:'#888' }}>SEO {h.score} · {h.ts}</span>
                </div>
              ))}
            </ToolCard>
          </Reveal>
        )}
      </AnimatePresence>

    </ToolShell>
  )
}
