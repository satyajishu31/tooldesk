import React, { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ToolShell, { ToolCard } from '../../components/ToolShell'
import { TOOLS } from '../../constants'
import { saveFileWithFallback } from '../../utils/fileSaver'
import { safeFetchJSON, safeTimeoutSignal } from '../../utils/safeFetch'
import { resolveApiUrl, getApiHeaders } from '../../utils/apiConfig'
import { useCopy } from '../../hooks'

const tool = TOOLS.find(t => t.id === 'thumbnail')

/* ── Platform definitions ── */
const PLATFORMS = [
  {
    id: 'youtube',
    name: 'YouTube',
    color: '#FF0000',
    bg: '#FFF0F0',
    icon: '▶️',
    placeholder: 'https://youtube.com/watch?v=... or youtu.be/...',
    hint: 'Paste any YouTube video URL or video ID',
    patterns: [
      /(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/,
      /^([a-zA-Z0-9_-]{11})$/,
    ],
    extract(url) {
      for (const p of this.patterns) {
        const m = url.trim().match(p)
        if (m) return m[1]
      }
      return null
    },
    sizes: [
      { label:'Max Resolution', key:'maxresdefault', w:1280, h:720, badge:'4K' },
      { label:'HD Quality',     key:'hqdefault',     w:480,  h:360, badge:'HD' },
      { label:'Medium Quality', key:'mqdefault',     w:320,  h:180, badge:'MQ' },
      { label:'Standard',       key:'sddefault',     w:120,  h:90,  badge:'SD' },
    ],
    getThumbs(id) {
      return this.sizes.map(s => ({
        ...s,
        url: `https://img.youtube.com/vi/${id}/${s.key}.jpg`,
      }))
    },
  },
  {
    id: 'twitter',
    name: 'Twitter / X',
    color: '#000000',
    bg: '#F0F0F0',
    icon: '𝕏',
    placeholder: 'https://twitter.com/user/status/... or x.com/...',
    hint: 'Paste a tweet URL containing an image or video',
    patterns: [
      /(?:twitter\.com|x\.com)\/[^/]+\/status\/(\d+)/,
    ],
    extract(url) {
      for (const p of this.patterns) {
        const m = url.trim().match(p)
        if (m) return m[1]
      }
      return null
    },
    sizes: [{ label:'Tweet Card', key:'card', w:1200, h:628, badge:'OG' }],
    getThumbs(id) {
      return [{
        label: 'Tweet Card (via fxtwitter)',
        url: `https://fxtwitter.com/i/status/${id}`,
        w: 1200, h: 628, badge: 'OG',
        note: 'Right-click → Save image on the fxtwitter preview page',
        openOnly: true,
      }]
    },
  },
  {
    id: 'vimeo',
    name: 'Vimeo',
    color: '#1AB7EA',
    bg: '#E8F8FD',
    icon: '🎞️',
    placeholder: 'https://vimeo.com/123456789',
    hint: 'Paste a Vimeo video URL',
    patterns: [
      /vimeo\.com\/(?:video\/)?(\d+)/,
    ],
    extract(url) {
      for (const p of this.patterns) {
        const m = url.trim().match(p)
        if (m) return m[1]
      }
      return null
    },
    sizes: [{ label:'Thumbnail', key:'thumb', w:1280, h:720, badge:'HD' }],
    async getThumbs(id) {
      try {
        const res = await fetch(`https://vimeo.com/api/v2/video/${id}.json`, { signal: safeTimeoutSignal(8000) })
        const text = await res.text()
        if (!text?.trim()) throw new Error('Empty response')
        const data = JSON.parse(text)
        const v = Array.isArray(data) ? data[0] : null
        if (!v || typeof v !== 'object') return []
        return [
          { label:'Large Thumbnail', url: v.thumbnail_large,  w:640, h:360, badge:'LG' },
          { label:'Medium Thumbnail',url: v.thumbnail_medium, w:200, h:150, badge:'MD' },
          { label:'Small Thumbnail', url: v.thumbnail_small,  w:100, h:75,  badge:'SM' },
        ]
      } catch {
        return []
      }
    },
  },
  {
    id: 'dailymotion',
    name: 'Dailymotion',
    color: '#0066DC',
    bg: '#E8F0FF',
    icon: '📺',
    placeholder: 'https://www.dailymotion.com/video/x7...',
    hint: 'Paste a Dailymotion video URL',
    patterns: [
      /dailymotion\.com\/video\/([a-zA-Z0-9]+)/,
    ],
    extract(url) {
      for (const p of this.patterns) {
        const m = url.trim().match(p)
        if (m) return m[1]
      }
      return null
    },
    getThumbs(id) {
      return [
        { label:'Large Thumbnail',  url:`https://www.dailymotion.com/thumbnail/video/${id}`, w:480, h:270, badge:'LG' },
        { label:'Medium Thumbnail', url:`https://s1.dmcdn.net/v/${id}`, w:240, h:134, badge:'MD' },
      ]
    },
  },
  {
    id: 'instagram',
    name: 'Instagram',
    color: '#E1306C',
    bg: '#FFF0F5',
    icon: '📸',
    placeholder: 'https://www.instagram.com/p/...',
    hint: 'Instagram requires login to access media directly',
    patterns: [/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/],
    extract(url) {
      for (const p of this.patterns) {
        const m = url.trim().match(p)
        if (m) return m[1]
      }
      return null
    },
    getThumbs(id) {
      return [{
        label: 'Instagram Post',
        url: `https://www.instagram.com/p/${id}/media/?size=l`,
        w: 1080, h: 1080, badge: 'HD',
        note: 'Instagram blocks direct media access. Use browser dev tools or a dedicated downloader.',
        openOnly: true,
      }]
    },
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    color: '#010101',
    bg: '#F5F5F5',
    icon: '🎵',
    placeholder: 'https://www.tiktok.com/@user/video/...',
    hint: 'TikTok thumbnails require their API — use the open page button',
    patterns: [/tiktok\.com\/@[^/]+\/video\/(\d+)/],
    extract(url) {
      for (const p of this.patterns) {
        const m = url.trim().match(p)
        if (m) return m[1]
      }
      return null
    },
    getThumbs(id) {
      return [{
        label: 'TikTok Video Thumbnail',
        url: `https://www.tiktok.com/oembed?url=https://www.tiktok.com/video/${id}`,
        w: 720, h: 1280, badge: 'HD',
        note: 'TikTok restricts direct thumbnail access. Open page and save manually.',
        openOnly: true,
      }]
    },
  },
]

/* ── Download helper ── */
async function downloadImage(url, filename) {
  try {
    const proxyUrl = resolveApiUrl(`/.netlify/functions/image-proxy?url=${encodeURIComponent(url)}`)
    const res = await fetch(proxyUrl, { headers: getApiHeaders(), signal: safeTimeoutSignal(10000) })
    if (!res.ok) throw new Error()
    const blob = await res.blob()
    await saveFileWithFallback(blob, filename, 'image/jpeg')
    return true
  } catch {
    // fallback: open in new tab securely
    window.open(url, '_blank', 'noopener,noreferrer')
    return false
  }
}

function ThumbCard({ thumb, platform, id }) {
  const [status, setStatus] = useState('idle') // idle | loading | loaded | error
  const [dlState, setDl]    = useState('idle')
  const timerRef            = useRef(null)

  useEffect(() => {
    return () => clearTimeout(timerRef.current)
  }, [])

  const dl = async () => {
    setDl('loading')
    await downloadImage(thumb.url, `${platform.id}_${id}_${thumb.badge||'thumb'}.jpg`)
    setDl('done')
    timerRef.current = setTimeout(() => setDl('idle'), 2200)
  }

  return (
    <motion.div
      initial={{ opacity:0, y:12 }}
      animate={{ opacity:1, y:0 }}
      transition={{ duration:.32, ease:[.22,1,.36,1] }}
      style={{ background:'#fafbff', border:'1px solid rgba(0,0,0,.07)',
        borderRadius:18, overflow:'hidden', position:'relative' }}>

      {/* Badge */}
      <div style={{ position:'absolute', top:10, left:10, zIndex:2,
        background:platform.color, color:'#fff', fontSize:10, fontWeight:800,
        padding:'3px 9px', borderRadius:999, letterSpacing:'.5px' }}>
        {thumb.badge}
      </div>

      {/* Image area */}
      <div style={{ background:'#f0f1f8', aspectRatio:'16/9',
        display:'flex', alignItems:'center', justifyContent:'center',
        position:'relative', overflow:'hidden' }}>
        {thumb.openOnly ? (
          <div style={{ padding:24, textAlign:'center' }}>
            <div style={{ fontSize:32, marginBottom:8 }}>{platform.icon}</div>
            <div style={{ fontSize:12, color:'#999', lineHeight:1.6 }}>{thumb.note}</div>
          </div>
        ) : (
          <>
            {status !== 'loaded' && (
              <div style={{ position:'absolute', inset:0, display:'flex',
                alignItems:'center', justifyContent:'center',
                background:'#f0f1f8', zIndex:1 }}>
                {status === 'error'
                  ? <div style={{ textAlign:'center', color:'#bbb' }}>
                      <div style={{ fontSize:28 }}>🚫</div>
                      <div style={{ fontSize:11, marginTop:6 }}>Not available</div>
                    </div>
                  : <div style={{ width:28, height:28, borderRadius:'50%',
                      border:'3px solid rgba(79,142,247,.2)',
                      borderTopColor:'#4F8EF7',
                      animation:'spin .8s linear infinite' }}/>
                }
              </div>
            )}
            <img
              src={thumb.url} alt={thumb.label}
              onLoad={()=>setStatus('loaded')}
              onError={()=>setStatus('error')}
              style={{ width:'100%', height:'100%', objectFit:'cover',
                display: status==='loaded' ? 'block' : 'none',
                transition:'opacity .3s' }}
            />
          </>
        )}
      </div>

      {/* Info + actions */}
      <div style={{ padding:'12px 14px' }}>
        <div style={{ fontFamily:'Syne,sans-serif', fontSize:13.5, fontWeight:700,
          color:'#0d0d1a', marginBottom:4 }}>{thumb.label}</div>
        {thumb.w && (
          <div style={{ fontSize:11.5, color:'#bbb', marginBottom:10 }}>
            {thumb.w} × {thumb.h}
          </div>
        )}
        <div style={{ display:'flex', gap:7 }}>
          {thumb.openOnly ? (
            <button onClick={() => window.open(thumb.url, '_blank', 'noopener,noreferrer')}
              style={{ flex:1, padding:'8px 14px', borderRadius:10,
                border:`1.5px solid ${platform.color}40`,
                background:`${platform.color}10`, color:platform.color,
                fontSize:12, fontWeight:700, cursor:'pointer' }}>
              🔗 Open Page
            </button>
          ) : (
            <>
              <button onClick={dl} disabled={dlState==='loading' || status==='error'}
                style={{ flex:1, padding:'8px 14px', borderRadius:10,
                  border:'none',
                  background: dlState==='done' ? '#22c55e'
                    : status==='error'    ? '#f5f5f5'
                    : platform.color,
                  color: status==='error' ? '#bbb' : '#fff',
                  fontSize:12, fontWeight:700, cursor: status==='error' ? 'default':'pointer',
                  transition:'all .22s cubic-bezier(.22,1,.36,1)' }}>
                {dlState==='loading' ? '⏳ Saving…'
                  : dlState==='done'  ? '✓ Saved!'
                  : status==='error'  ? 'Unavailable'
                  : '⬇ Download'}
              </button>
              <button
                type="button"
                onClick={() => window.open(thumb.url, '_blank', 'noopener,noreferrer')}
                title="Open in new tab"
                aria-label="Open full resolution thumbnail in new tab"
                style={{ padding:'8px 12px', borderRadius:10,
                  border:'1.5px solid rgba(0,0,0,.1)',
                  background:'#fafafa', fontSize:14, cursor:'pointer' }}>
                🔗
              </button>
            </>
          )}
        </div>
      </div>
    </motion.div>
  )
}

/* ── Main tool ── */
export default function SocialMediaThumbnail() {
  const [activePlatform, setActivePlatform] = useState('youtube')
  const [inputUrl, setInputUrl]   = useState('')
  const [thumbs,   setThumbs]     = useState([])
  const [mediaId,  setMediaId]    = useState(null)
  const [error,    setError]      = useState('')
  const [loading,  setLoading]    = useState(false)
  const [history,  setHistory]    = useState([])
  const inputRef = useRef()
  const [copied, copy] = useCopy()

  /* AI Viral Titles & Thumbnail Concept Studio */
  const [aiTopic, setAiTopic] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [aiIdeas, setAiIdeas] = useState(null)
  const [copiedKey, setCopiedKey] = useState('')

  const handleGenerateThumbnailIdeas = async () => {
    const query = aiTopic.trim() || inputUrl.trim()
    if (!query) return
    setAiLoading(true)
    setAiError('')
    try {
      const data = await safeFetchJSON('/.netlify/functions/groq-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'thumbnailIdeas',
          payload: { topic: query }
        })
      })
      if (data?.error) throw new Error(data.error)
      if (!data?.ideas) throw new Error('No ideas returned from AI')
      setAiIdeas(data.ideas)
    } catch (err) {
      setAiError(err?.message || 'Failed to generate viral thumbnail concepts')
    } finally {
      setAiLoading(false)
    }
  }

  const copyVal = (key, text) => {
    copy(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(''), 1500)
  }

  const platform = PLATFORMS.find(p => p.id === activePlatform)

  const fetch_ = useCallback(async (val) => {
    const url = val || inputUrl
    if (!url.trim()) return
    setError(''); setThumbs([]); setMediaId(null)

    const id = platform.extract(url)
    if (!id) {
      setError(`Couldn't extract a ${platform.name} ID from that URL. ${platform.hint}`)
      return
    }
    setLoading(true)
    try {
      const results = await Promise.resolve(platform.getThumbs(id))
      if (!results || results.length === 0) {
        setError('No thumbnails found for this URL.')
      } else {
        setThumbs(results)
        setMediaId(id)
        setHistory(h => [{ platform: platform.id, id, url }, ...h.filter(x => x.id !== id)].slice(0, 6))
      }
    } catch(e) {
      setError('Failed to fetch thumbnails. Check the URL and try again.')
    }
    setLoading(false)
  }, [inputUrl, platform])

  const switchPlatform = (pid) => {
    setActivePlatform(pid)
    setInputUrl(''); setThumbs([]); setMediaId(null); setError('')
  }

  const downloadAll = async () => {
    for (const t of thumbs.filter(t => !t.openOnly)) {
      await downloadImage(t.url, `${platform.id}_${mediaId}_${t.badge}.jpg`)
      await new Promise(r => setTimeout(r, 400))
    }
  }

  return (
    <ToolShell tool={tool}>
      <ToolCard>

        {/* Platform selector */}
        <div style={{ marginBottom:22 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#bbb',
            textTransform:'uppercase', letterSpacing:'.5px', marginBottom:10 }}>
            Select Platform
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
            {PLATFORMS.map(p => (
              <motion.button key={p.id}
                onClick={() => switchPlatform(p.id)}
                whileHover={{ scale:1.05 }} whileTap={{ scale:.96 }}
                style={{ display:'flex', alignItems:'center', gap:7,
                  padding:'8px 16px', borderRadius:12,
                  border:`1.5px solid ${activePlatform===p.id ? p.color : 'rgba(0,0,0,.1)'}`,
                  background: activePlatform===p.id ? `${p.color}12` : '#fafafa',
                  color: activePlatform===p.id ? p.color : '#777',
                  fontSize:12.5, fontWeight:700, cursor:'pointer',
                  transition:'all .18s cubic-bezier(.22,1,.36,1)' }}>
                <span style={{ fontSize:16 }}>{p.icon}</span>
                <span>{p.name}</span>
              </motion.button>
            ))}
          </div>
        </div>

        {/* URL input */}
        <div className="fgrp">
          <label className="lbl">{platform.name} URL</label>
          <div style={{ display:'flex', gap:8 }}>
            <input ref={inputRef}
              value={inputUrl}
              onChange={e => { setInputUrl(e.target.value); setError('') }}
              onKeyDown={e => e.key==='Enter' && fetch_()}
              placeholder={platform.placeholder}
              className="inp"
              style={{ flex:1, fontSize:13.5 }}
              autoFocus
            />
            <motion.button
              onClick={() => fetch_()}
              disabled={loading || !inputUrl.trim()}
              whileHover={{ scale:1.03 }} whileTap={{ scale:.97 }}
              style={{ padding:'12px 24px', borderRadius:13,
                border:'none', cursor: !inputUrl.trim() ? 'default' : 'pointer',
                background: !inputUrl.trim() ? '#f0f0f0'
                  : loading ? '#ddd' : platform.color,
                color: !inputUrl.trim() ? '#bbb' : '#fff',
                fontFamily:'DM Sans,sans-serif', fontWeight:700,
                fontSize:13.5, whiteSpace:'nowrap',
                transition:'all .22s cubic-bezier(.22,1,.36,1)', flexShrink:0 }}>
              {loading ? '⏳' : '🔍 Fetch'}
            </motion.button>
          </div>
          {platform.hint && (
            <div style={{ marginTop:7, fontSize:12, color:'#bbb' }}>
              💡 {platform.hint}
            </div>
          )}
        </div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div initial={{opacity:0,y:4}} animate={{opacity:1,y:0}} exit={{opacity:0}}
              style={{ background:'#FFF0F0', border:'1.5px solid #FFCDD2',
                borderRadius:12, padding:'12px 16px', marginBottom:16,
                fontSize:12.5, color:'#C62828', fontWeight:500, lineHeight:1.6 }}>
              ❌ {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results */}
        <AnimatePresence>
          {thumbs.length > 0 && (
            <motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0}}>

              {/* Result header */}
              <div style={{ display:'flex', justifyContent:'space-between',
                alignItems:'center', marginBottom:16 }}>
                <div>
                  <div style={{ fontFamily:'Syne,sans-serif', fontSize:15,
                    fontWeight:700, color:'#0d0d1a' }}>
                    {thumbs.length} Thumbnail{thumbs.length!==1?'s':''} Found
                  </div>
                  <div style={{ fontSize:11.5, color:'#bbb', marginTop:2 }}>
                    ID: <code style={{ fontSize:11, color:'#4F8EF7',
                      fontFamily:'monospace' }}>{mediaId}</code>
                  </div>
                </div>
                {thumbs.filter(t=>!t.openOnly).length > 1 && (
                  <button onClick={downloadAll}
                    style={{ padding:'9px 18px', borderRadius:11,
                      border:'none', background:platform.color, color:'#fff',
                      fontSize:12, fontWeight:700, cursor:'pointer',
                      display:'flex', alignItems:'center', gap:6 }}>
                    ⬇ Download All
                  </button>
                )}
              </div>

              {/* Thumbnail grid */}
              <div style={{ display:'grid',
                gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:14 }}>
                {thumbs.map((t, i) => (
                  <ThumbCard key={i} thumb={t} platform={platform} id={mediaId}/>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* History */}
        {history.length > 0 && thumbs.length === 0 && (
          <div style={{ marginTop:8 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#bbb',
              textTransform:'uppercase', letterSpacing:'.5px', marginBottom:10 }}>
              Recent
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {history.map((h,i) => {
                const p = PLATFORMS.find(x => x.id === h.platform)
                return (
                  <motion.div key={i} whileHover={{x:4}}
                    onClick={() => {
                      switchPlatform(h.platform)
                      setTimeout(() => { setInputUrl(h.url); fetch_(h.url) }, 50)
                    }}
                    style={{ display:'flex', alignItems:'center', gap:10,
                      background:'#fafbff', borderRadius:12,
                      padding:'10px 14px', cursor:'pointer',
                      border:'1px solid rgba(0,0,0,.06)',
                      transition:'all .15s cubic-bezier(.22,1,.36,1)' }}
                    onMouseEnter={e=>{e.currentTarget.style.background='#f0f4ff'}}
                    onMouseLeave={e=>{e.currentTarget.style.background='#fafbff'}}>
                    <span style={{ fontSize:18 }}>{p?.icon}</span>
                    <div>
                      <div style={{ fontSize:12.5, fontWeight:600, color:'#0d0d1a' }}>{p?.name} — {h.id}</div>
                      <div style={{ fontSize:11, color:'#bbb',
                        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:300 }}>
                        {h.url}
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>
        )}

        {/* Empty state */}
        {thumbs.length === 0 && !error && !loading && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} transition={{delay:.3}}
            style={{ textAlign:'center', padding:'32px 20px', color:'#ccc' }}>
            <div style={{ fontSize:52, marginBottom:12 }}>{platform.icon}</div>
            <div style={{ fontSize:14, fontWeight:600, color:'#bbb', marginBottom:6 }}>
              Paste a {platform.name} URL above
            </div>
            <div style={{ fontSize:12, color:'#ddd', lineHeight:1.6 }}>
              {platform.hint}
            </div>
          </motion.div>
        )}

      </ToolCard>

      {/* ── AI VIRAL TITLE & THUMBNAIL CTR STUDIO ── */}
      <ToolCard style={{ marginTop: 18 }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 16, flexWrap: 'wrap', gap: 10
        }}>
          <div>
            <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 16, color: '#0d0d1a', display: 'flex', alignItems: 'center', gap: 7 }}>
              <span>🤖</span> AI Viral Title, Hook & Thumbnail CTR Studio
            </div>
            <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 3 }}>
              Generate high-CTR viral titles, 5-second curiosity hooks, and visual thumbnail compositions.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <input
            className="inp"
            value={aiTopic}
            onChange={e => setAiTopic(e.target.value)}
            placeholder={inputUrl.trim() ? `Topic from URL or custom video idea: e.g. "I coded a SaaS in 24 hours"` : 'Enter video topic or title: e.g. "How quantum computing breaks encryption"'}
            style={{ flex: 1, minWidth: 260, fontSize: 13 }}
            onKeyDown={e => e.key === 'Enter' && handleGenerateThumbnailIdeas()}
          />
          <button
            type="button"
            onClick={handleGenerateThumbnailIdeas}
            disabled={aiLoading || (!aiTopic.trim() && !inputUrl.trim())}
            className="btn btn-primary"
            style={{ padding: '8px 20px', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {aiLoading ? (
              <>
                <span className="spinner-border spinner-border-sm" />
                <span>Strategizing...</span>
              </>
            ) : (
              <>
                <span>✨</span>
                <span>Generate Viral Concepts</span>
              </>
            )}
          </button>
        </div>

        {aiError && (
          <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.1)', border: '1.5px solid rgba(239,68,68,0.3)', borderRadius: 10, color: '#ef4444', fontSize: 12, marginBottom: 14 }}>
            ⚠️ {aiError}
          </div>
        )}

        {aiIdeas ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            {/* Viral Titles */}
            {Array.isArray(aiIdeas.viralTitles) && aiIdeas.viralTitles.length > 0 && (
              <div>
                <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 13, color: '#0d0d1a', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>🔥</span> High-CTR Titles (Click to copy)
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {aiIdeas.viralTitles.map((t, idx) => (
                    <div
                      key={idx}
                      onClick={() => copyVal(`title-${idx}`, t.title)}
                      style={{
                        padding: '10px 14px',
                        borderRadius: 10,
                        background: '#f8f9ff',
                        border: '1px solid rgba(79,142,247,0.18)',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 12
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{t.title}</div>
                        {t.ctrReason && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>💡 {t.ctrReason}</div>}
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: copiedKey === `title-${idx}` ? '#22c55e' : '#4F8EF7' }}>
                        {copiedKey === `title-${idx}` ? '✓ Copied' : 'Copy'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Thumbnail Visual Concepts */}
            {Array.isArray(aiIdeas.thumbnailConcepts) && aiIdeas.thumbnailConcepts.length > 0 && (
              <div>
                <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 13, color: '#0d0d1a', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>🎨</span> Visual Thumbnail Compositions & Contrast
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
                  {aiIdeas.thumbnailConcepts.map((tc, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '12px 14px',
                        borderRadius: 12,
                        background: '#ffffff',
                        border: '1px solid rgba(0,0,0,0.08)',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6
                      }}
                    >
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: '#0f172a' }}>{tc.concept}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 11, marginTop: 4 }}>
                        {tc.overlayText && (
                          <span style={{ padding: '2px 8px', borderRadius: 6, background: '#fef08a', color: '#854d0e', fontWeight: 800 }}>
                            TEXT: &quot;{tc.overlayText}&quot;
                          </span>
                        )}
                        {tc.contrast && (
                          <span style={{ padding: '2px 8px', borderRadius: 6, background: '#ede9fe', color: '#6b21a8', fontWeight: 600 }}>
                            🎨 {tc.contrast}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Curiosity Hooks */}
            {Array.isArray(aiIdeas.curiosityHooks) && aiIdeas.curiosityHooks.length > 0 && (
              <div>
                <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 13, color: '#0d0d1a', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>🪝</span> Opening 5-Second Curiosity Hooks
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {aiIdeas.curiosityHooks.map((h, idx) => (
                    <div
                      key={idx}
                      onClick={() => copyVal(`hook-${idx}`, h)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: 'linear-gradient(135deg, rgba(79,142,247,0.04), rgba(156,111,222,0.04))',
                        border: '1px solid rgba(79,142,247,0.14)',
                        fontSize: 12.5,
                        color: '#334155',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        cursor: 'pointer'
                      }}
                    >
                      <span>&quot;{h}&quot;</span>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: copiedKey === `hook-${idx}` ? '#22c55e' : '#4F8EF7', marginLeft: 8, flexShrink: 0 }}>
                        {copiedKey === `hook-${idx}` ? '✓ Copied' : 'Copy'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        ) : (
          <div style={{
            textAlign: 'center',
            padding: '24px 16px',
            borderRadius: 12,
            background: '#fafbff',
            border: '1.5px dashed rgba(79,142,247,0.2)'
          }}>
            <div style={{ fontSize: 26, marginBottom: 6 }}>🚀</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0d0d1a' }}>Instant Viral Title & Thumbnail Strategy</div>
            <div style={{ fontSize: 11.5, color: '#64748b', maxWidth: 440, margin: '4px auto 12px' }}>
              Paste any topic or video link above to generate psychology-backed titles, curiosity-driven opening hooks, and high-CTR thumbnail layouts.
            </div>
            <button
              type="button"
              onClick={handleGenerateThumbnailIdeas}
              disabled={aiLoading}
              className="btn btn-sm btn-primary"
              style={{ fontSize: 12, padding: '7px 16px', borderRadius: 999 }}
            >
              ✨ Generate Concepts Now
            </button>
          </div>
        )}
      </ToolCard>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </ToolShell>
  )
}
