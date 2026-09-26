import React, { useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ToolShell, { ToolCard, Reveal } from '../../components/ToolShell'
import { useCopy } from '../../hooks'
import { TOOLS } from '../../constants'
import { safeFetchJSON } from '../../utils/safeFetch'
import { saveFileWithFallback } from '../../utils/fileSaver'

const tool = TOOLS.find(t => t.id === 'gradient')

const PRESETS = [
  { name:'Ocean',     stops:['#667eea','#764ba2'],         angle:135 },
  { name:'Sunset',    stops:['#f093fb','#f5576c'],         angle:135 },
  { name:'Forest',    stops:['#11998e','#38ef7d'],         angle:135 },
  { name:'Fire',      stops:['#f7971e','#ffd200'],         angle:135 },
  { name:'Night',     stops:['#0f0c29','#302b63','#24243e'],angle:180 },
  { name:'Candy',     stops:['#a18cd1','#fbc2eb'],         angle:135 },
  { name:'Aurora',    stops:['#00c6ff','#0072ff'],         angle:135 },
  { name:'Peach',     stops:['#ffecd2','#fcb69f'],         angle:135 },
  { name:'Mango',     stops:['#f79f79','#f7d08a'],         angle:90  },
  { name:'Neon',      stops:['#08f7fe','#09fbd3','#fe53bb'],angle:90  },
  { name:'Slate',     stops:['#434343','#000000'],         angle:145 },
  { name:'Lavender',  stops:['#e0c3fc','#8ec5fc'],         angle:135 },
  { name:'Rose Gold', stops:['#f9d29d','#ffd6e0','#c9b1ff'],angle:120 },
  { name:'Cyber',     stops:['#0ff','#b429f9'],            angle:45  },
  { name:'Matcha',    stops:['#d4fc79','#96e6a1'],         angle:135 },
  { name:'Galaxy',    stops:['#1a1a2e','#16213e','#0f3460'],angle:160 },
  { name:'Coral',     stops:['#ff9a9e','#fad0c4'],         angle:135 },
  { name:'Mint',      stops:['#84fab0','#8fd3f4'],         angle:135 },
  { name:'Lemon',     stops:['#f6d365','#fda085'],         angle:135 },
  { name:'Sakura',    stops:['#fda7df','#d8b4fe'],         angle:135 },
]

const TYPES = ['linear','radial','conic']

function buildCSS(type, angle, stops) {
  if (!stops || !stops.length) return ''
  const s = stops.length === 1
    ? `${stops[0]} 0%, ${stops[0]} 100%`
    : stops.map((c, i) => `${c} ${Math.round(i / (stops.length - 1) * 100)}%`).join(', ')
  if (type === 'linear') return `linear-gradient(${angle}deg, ${s})`
  if (type === 'radial')  return `radial-gradient(circle, ${s})`
  if (type === 'conic')   return `conic-gradient(from ${angle}deg, ${s})`
  return ''
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16)
  return isNaN(r) ? null : { r, g, b }
}

function normalizeColor(c) {
  if (typeof c !== 'string') return '#cccccc'
  c = c.trim()
  if (c.startsWith('#')) {
    if (c.length === 4) {
      return '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]
    }
    if (c.length === 7) return c
  }
  if (typeof document !== 'undefined') {
    try {
      const cv = document.createElement('canvas')
      cv.width = 1; cv.height = 1
      const ctx = cv.getContext('2d')
      if (ctx) {
        ctx.fillStyle = '#000000'
        ctx.fillStyle = c
        const val = ctx.fillStyle
        if (val.startsWith('#') && val.length === 7) return val
        const m = val.match(/\d+/g)
        if (m && m.length >= 3) {
          return '#' + m.slice(0, 3).map(x => parseInt(x, 10).toString(16).padStart(2, '0')).join('')
        }
      }
    } catch {}
  }
  return c.startsWith('#') && c.length > 7 ? c.slice(0, 7) : '#cccccc'
}

/* ── AI Gradient Panel ── */
function AIGradientPanel({ onApply }) {
  const [desc,    setDesc]   = useState('')
  const [loading, setLoad]   = useState(false)
  const [results, setResults]= useState([])
  const [error,   setError]  = useState('')

  const generate = async () => {
    if (!desc.trim()) return
    setLoad(true); setError(''); setResults([])
    try {
      const data = await safeFetchJSON('/.netlify/functions/groq-ai', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ tool:'gradientFromDesc', payload:{ description:desc, style:'modern' }})
      }, 25000)
      if (data?.gradients && data.gradients.length > 0) setResults(data.gradients)
      else setError(data?.error || 'Failed to generate gradients')
    } catch (e) { setError(e?.message || 'Network error. Check your connection.') }
    setLoad(false)
  }

  return (
    <div>
      <div style={{display:'flex',gap:9,marginBottom:14,flexWrap:'wrap'}}>
        <input value={desc} onChange={e=>setDesc(e.target.value)}
          onKeyDown={e=>e.key==='Enter'&&generate()}
          placeholder='e.g. "tropical sunset", "cyberpunk neon"…'
          style={{flex:1,minWidth:160,padding:'11px 14px',borderRadius:11,border:'1.5px solid rgba(124,58,237,.25)',
            fontFamily:'DM Sans,sans-serif',fontSize:13,outline:'none',background:'#fafbff'}}/>
        <button onClick={generate} disabled={!desc.trim()||loading}
          style={{padding:'11px 20px',borderRadius:11,border:'none',cursor:desc.trim()&&!loading?'pointer':'not-allowed',
            background:desc.trim()&&!loading?'linear-gradient(135deg,#7c3aed,#4F8EF7)':'#e5e7ef',
            color:'#fff',fontWeight:700,fontSize:13,flexShrink:0,
            transition:'filter .18s, box-shadow .18s',
            boxShadow:desc.trim()&&!loading?'0 4px 14px rgba(124,58,237,.28)':'none'}}
          onMouseEnter={e=>{ if(desc.trim()&&!loading){ e.currentTarget.style.filter='brightness(1.08)' } }}
          onMouseLeave={e=>{ e.currentTarget.style.filter='none' }}>
          {loading?'…':'✨ Generate'}
        </button>
      </div>

      <div style={{display:'flex',gap:7,flexWrap:'wrap',marginBottom:12}}>
        {['Tropical Sunset','Cyberpunk Neon','Ocean Morning','Forest Mist','Rose Gold Luxury','Dark Galaxy'].map(m=>(
          <button key={m} onClick={()=>setDesc(m)}
            style={{padding:'5px 12px',borderRadius:999,fontSize:12.5,fontWeight:600,
              transition:'background .15s, border-color .15s, box-shadow .15s',
              border:'1.5px solid rgba(124,58,237,.18)',background:'rgba(124,58,237,.06)',
              color:'#7c3aed',cursor:'pointer'}}
            onMouseEnter={e=>{ e.currentTarget.style.background='rgba(124,58,237,.12)'; e.currentTarget.style.boxShadow='0 2px 8px rgba(124,58,237,.14)' }}
            onMouseLeave={e=>{ e.currentTarget.style.background='rgba(124,58,237,.06)'; e.currentTarget.style.boxShadow='none' }}>
            {m}
          </button>
        ))}
      </div>

      {error && <div style={{color:'#ef4444',fontSize:12,padding:'8px 12px',
        background:'rgba(239,68,68,.06)',borderRadius:9,marginBottom:12}}>{error}</div>}

      {results.length>0&&(
        <div style={{display:'flex',flexDirection:'column',gap:9}}>
          {results.map((g,i)=>{
            const normalizedStops = (g.stops || []).map(normalizeColor)
            const css = normalizedStops.length>=2
              ? (g.style==='radial'
                  ? `radial-gradient(circle, ${normalizedStops.join(', ')})`
                  : g.style==='conic'
                    ? `conic-gradient(from ${g.angle||135}deg, ${normalizedStops.join(', ')})`
                    : `linear-gradient(${g.angle||135}deg, ${normalizedStops.join(', ')})`)
              : '#ccc'
            return (
              <div key={i} style={{display:'flex',alignItems:'center',gap:12,
                padding:'11px 13px',background:'#fafbff',borderRadius:12,
                border:'1px solid rgba(0,0,0,.07)'}}>
                <div style={{width:60,height:44,borderRadius:9,background:css,
                  flexShrink:0,boxShadow:'0 3px 10px rgba(0,0,0,.14)'}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12.5,fontWeight:700,color:'#333',marginBottom:2}}>{g.name}</div>
                  <div style={{fontSize:11,color:'#aaa',lineHeight:1.4}}>{g.description}</div>
                  <div style={{display:'flex',gap:4,marginTop:5}}>
                    {normalizedStops.map((c,j)=>(
                      <div key={j} style={{width:16,height:16,borderRadius:4,background:c,
                        border:'1px solid rgba(0,0,0,.1)'}} title={c}/>
                    ))}
                  </div>
                </div>
                <button onClick={()=>onApply({ ...g, stops: normalizedStops })}
                  style={{padding:'7px 14px',borderRadius:9,border:'none',
                    background:'linear-gradient(135deg,#7c3aed,#4F8EF7)',
                    color:'#fff',fontWeight:700,fontSize:12,cursor:'pointer',flexShrink:0}}>
                  Apply
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function GlassmorphismStudio({ currentCss, stops }) {
  const [blur, setBlur] = useState(16)
  const [opacity, setOpacity] = useState(0.25)
  const [borderOp, setBorderOp] = useState(0.3)
  const [shadow, setShadow] = useState(24)
  const [copiedCss, copyCss] = useCopy()
  const [copiedTw, copyTw] = useCopy()

  const glassStyle = {
    background: `rgba(255, 255, 255, ${opacity})`,
    backdropFilter: `blur(${blur}px)`,
    WebkitBackdropFilter: `blur(${blur}px)`,
    border: `1px solid rgba(255, 255, 255, ${borderOp})`,
    boxShadow: `0 8px ${shadow}px 0 rgba(0, 0, 0, 0.2)`
  }

  const cssCode = `/* Glassmorphism CSS */
background: rgba(255, 255, 255, ${opacity});
backdrop-filter: blur(${blur}px);
-webkit-backdrop-filter: blur(${blur}px);
border: 1px solid rgba(255, 255, 255, ${borderOp});
box-shadow: 0 8px ${shadow}px 0 rgba(0, 0, 0, 0.2);`

  const twCode = `bg-white/${Math.round(opacity * 100)} backdrop-blur-[${blur}px] border border-white/${Math.round(borderOp * 100)} shadow-[0_8px_${shadow}px_rgba(0,0,0,0.2)]`

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{
        height: 160, borderRadius: 16, background: currentCss, position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        boxShadow: '0 6px 20px rgba(0,0,0,.15)', marginBottom: 16
      }}>
        <div style={{ position: 'absolute', width: 90, height: 90, borderRadius: '50%', background: stops[0] || '#7c3aed', top: 15, left: 40 }} />
        <div style={{ position: 'absolute', width: 100, height: 100, borderRadius: '50%', background: stops[stops.length - 1] || '#4F8EF7', bottom: 15, right: 40 }} />

        <div style={{ ...glassStyle, width: '80%', padding: '18px 24px', borderRadius: 16, zIndex: 2, textAlign: 'center' }}>
          <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 16, color: '#fff', textShadow: '0 2px 10px rgba(0,0,0,.3)' }}>
            Glassmorphism Card
          </div>
          <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.9)', marginTop: 4 }}>
            Blur: {blur}px · Opacity: {Math.round(opacity * 100)}%
          </div>
        </div>
      </div>

      <div className="tool-grid-2-compact" style={{ marginBottom: 14 }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: '#666', marginBottom: 4 }}>
            <span>BLUR RADIUS</span>
            <span>{blur}px</span>
          </div>
          <input type="range" min={0} max={40} value={blur} onChange={e => setBlur(+e.target.value)} className="rs-thumb" style={{ width:'100%', background:`linear-gradient(to right,#4F8EF7 0%,#4F8EF7 ${Math.round((blur/40)*100)}%,#e2e4ef ${Math.round((blur/40)*100)}%,#e2e4ef 100%)`, WebkitAppearance:'none', appearance:'none', height:5, borderRadius:3, outline:'none', cursor:'pointer' }} />
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: '#666', marginBottom: 4 }}>
            <span>OPACITY</span>
            <span>{Math.round(opacity * 100)}%</span>
          </div>
          <input type="range" min={0.05} max={0.9} step={0.05} value={opacity} onChange={e => setOpacity(+e.target.value)} className="rs-thumb" style={{ width:'100%', background:`linear-gradient(to right,#9C6FDE 0%,#9C6FDE ${Math.round(((opacity-0.05)/0.85)*100)}%,#e2e4ef ${Math.round(((opacity-0.05)/0.85)*100)}%,#e2e4ef 100%)`, WebkitAppearance:'none', appearance:'none', height:5, borderRadius:3, outline:'none', cursor:'pointer' }} />
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: '#666', marginBottom: 4 }}>
            <span>BORDER OPACITY</span>
            <span>{Math.round(borderOp * 100)}%</span>
          </div>
          <input type="range" min={0} max={0.8} step={0.05} value={borderOp} onChange={e => setBorderOp(+e.target.value)} className="rs-thumb" style={{ width:'100%', background:`linear-gradient(to right,#22c55e 0%,#22c55e ${Math.round((borderOp/0.8)*100)}%,#e2e4ef ${Math.round((borderOp/0.8)*100)}%,#e2e4ef 100%)`, WebkitAppearance:'none', appearance:'none', height:5, borderRadius:3, outline:'none', cursor:'pointer' }} />
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: '#666', marginBottom: 4 }}>
            <span>SHADOW DEPTH</span>
            <span>{shadow}px</span>
          </div>
          <input type="range" min={0} max={50} value={shadow} onChange={e => setShadow(+e.target.value)} className="rs-thumb" style={{ width:'100%', background:`linear-gradient(to right,#f97316 0%,#f97316 ${Math.round((shadow/50)*100)}%,#e2e4ef ${Math.round((shadow/50)*100)}%,#e2e4ef 100%)`, WebkitAppearance:'none', appearance:'none', height:5, borderRadius:3, outline:'none', cursor:'pointer' }} />
        </div>
      </div>

      <div style={{ background: '#1e1e2e', borderRadius: 12, padding: '12px 14px', fontFamily: 'monospace', fontSize: 12, color: '#a6e3a1', whiteSpace: 'pre-wrap', marginBottom: 10 }}>
        {cssCode}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary btn-sm" onClick={() => copyCss(cssCode)}>
          {copiedCss ? '✓ Copied CSS' : '📋 Copy Glass CSS'}
        </button>
        <button className="btn btn-outline btn-sm" onClick={() => copyTw(twCode)}>
          {copiedTw ? '✓ Copied Tailwind' : '📋 Copy Tailwind'}
        </button>
      </div>
    </div>
  )
}

/* ── ADVANCED ENHANCEMENT: AI MESH GRADIENT STUDIO & COMPONENT PREVIEW ── */
const MESH_PRESET_PROMPTS = [
  { prompt: 'bioluminescent deep ocean', base: '#060d1f', colors: ['#00f5d4', '#00bbf9', '#7209b7', '#4361ee', '#03045e'] },
  { prompt: 'warm sunset glass', base: '#2b0918', colors: ['#f72585', '#ffb703', '#fb8500', '#ff4d6d', '#f39237'] },
  { prompt: 'midnight neon city', base: '#0a0a12', colors: ['#ff007f', '#7928ca', '#00dfd8', '#380036', '#ff4b91'] },
  { prompt: 'aurora borealis silk', base: '#051914', colors: ['#10b981', '#06b6d4', '#6366f1', '#047857', '#34d399'] },
  { prompt: 'cyberpunk vaporwave', base: '#12072b', colors: ['#f72585', '#b5179e', '#4cc9f0', '#7209b7', '#480ca8'] }
]

function generateDeterministicMesh(promptStr, baseFallback = '#0d0d1a') {
  // Deterministic FNV-1a hash of the prompt string to produce consistent HSL coordinates
  let hash = 2166136261
  for (let i = 0; i < promptStr.length; i++) {
    hash ^= promptStr.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  const h1 = Math.abs(hash % 360)
  const h2 = (h1 + 60) % 360
  const h3 = (h1 + 180) % 360
  const h4 = (h1 + 240) % 360
  const h5 = (h1 + 300) % 360

  return {
    base: `hsl(${h1}, 30%, 8%)`,
    colors: [
      `hsl(${h1}, 85%, 60%)`,
      `hsl(${h2}, 90%, 55%)`,
      `hsl(${h3}, 80%, 58%)`,
      `hsl(${h4}, 85%, 62%)`,
      `hsl(${h5}, 90%, 65%)`
    ]
  }
}

function MeshGradientStudio({ initialStops }) {
  const [prompt, setPrompt] = useState('bioluminescent deep ocean')
  const [meshData, setMeshData] = useState(MESH_PRESET_PROMPTS[0])
  const [loading, setLoading] = useState(false)
  const [previewSurface, setPreviewSurface] = useState('card') // 'card' | 'button' | 'hero'
  const [copiedMesh, copyMesh] = useCopy()

  // Compute CSS multi-radial layered background
  const meshCss = useMemo(() => {
    const c = meshData.colors
    const base = meshData.base || '#0d0d1a'
    return `background-color: ${base};\nbackground-image: \n  radial-gradient(at 18% 22%, ${c[0]}bb 0px, transparent 52%),\n  radial-gradient(at 82% 16%, ${c[1]}bb 0px, transparent 56%),\n  radial-gradient(at 74% 82%, ${c[2]}bb 0px, transparent 50%),\n  radial-gradient(at 16% 80%, ${c[3]}bb 0px, transparent 58%),\n  radial-gradient(at 52% 48%, ${c[4] || c[0]}88 0px, transparent 65%);`
  }, [meshData])

  const inlineMeshStyle = useMemo(() => {
    const c = meshData.colors
    const base = meshData.base || '#0d0d1a'
    return {
      backgroundColor: base,
      backgroundImage: `radial-gradient(at 18% 22%, ${c[0]}bb 0px, transparent 52%), radial-gradient(at 82% 16%, ${c[1]}bb 0px, transparent 56%), radial-gradient(at 74% 82%, ${c[2]}bb 0px, transparent 50%), radial-gradient(at 16% 80%, ${c[3]}bb 0px, transparent 58%), radial-gradient(at 52% 48%, ${c[4] || c[0]}88 0px, transparent 65%)`
    }
  }, [meshData])

  const handleApplyPreset = (p) => {
    setPrompt(p.prompt)
    setMeshData(p)
  }

  const handleGenerate = async () => {
    const clean = prompt.trim()
    if (!clean) return
    setLoading(true)

    // Check if matching preset exists
    const existing = MESH_PRESET_PROMPTS.find(p => p.prompt.toLowerCase() === clean.toLowerCase())
    if (existing) {
      setMeshData(existing)
      setLoading(false)
      return
    }

    try {
      // Attempt AI assisted gradient extraction
      const data = await safeFetchJSON('/.netlify/functions/groq-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'gradientFromDesc',
          payload: { description: clean, style: 'mesh' }
        })
      }, 15000)

      if (data?.gradients?.[0]?.stops && data.gradients[0].stops.length >= 3) {
        const rawStops = data.gradients[0].stops.slice(0, 5)
        const base = rawStops[rawStops.length - 1]
        setMeshData({
          prompt: clean,
          base: base.startsWith('#') ? base : '#0a0a16',
          colors: rawStops
        })
      } else {
        // Transparent deterministic fallback
        const fallback = generateDeterministicMesh(clean)
        setMeshData({ prompt: clean, ...fallback })
      }
    } catch {
      // Deterministic generative fallback on network or provider error
      const fallback = generateDeterministicMesh(clean)
      setMeshData({ prompt: clean, ...fallback })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ marginTop: 22, paddingTop: 20, borderTop: '1px solid rgba(0,0,0,0.08)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>🌀</span>
          <div>
            <h4 style={{ fontFamily: 'Syne, sans-serif', fontSize: 15, fontWeight: 800, margin: 0, color: '#111' }}>
              AI Mesh Gradient Studio & Live Surface Previews
            </h4>
            <span style={{ fontSize: 11.5, color: '#666' }}>
              Multi-radial layered organic mesh with real component previews
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => copyMesh(meshCss)}
          style={{
            padding: '6px 14px', borderRadius: 8, border: '1.5px solid rgba(79,142,247,0.3)',
            background: copiedMesh ? 'rgba(34,197,94,0.1)' : 'rgba(79,142,247,0.08)',
            color: copiedMesh ? '#16a34a' : '#4F8EF7', fontSize: 12, fontWeight: 700, cursor: 'pointer'
          }}
        >
          {copiedMesh ? '✓ Copied Mesh CSS!' : '📋 Copy Mesh CSS'}
        </button>
      </div>

      {/* Creative Prompt Input & Presets */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <input
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleGenerate()}
          placeholder="e.g. bioluminescent deep ocean, warm sunset glass..."
          style={{
            flex: 1, padding: '10px 14px', borderRadius: 10, border: '1.5px solid rgba(0,0,0,0.12)',
            fontSize: 13, fontFamily: 'DM Sans, sans-serif', outline: 'none'
          }}
        />
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading || !prompt.trim()}
          style={{
            padding: '10px 18px', borderRadius: 10, border: 'none',
            background: 'linear-gradient(135deg, #7c3aed, #4F8EF7)', color: '#fff',
            fontWeight: 700, fontSize: 13, cursor: loading ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap'
          }}
        >
          {loading ? 'Synthesizing...' : '✨ Generate Mesh'}
        </button>
      </div>

      {/* Preset Chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {MESH_PRESET_PROMPTS.map((p, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleApplyPreset(p)}
            style={{
              padding: '4px 10px', borderRadius: 20, fontSize: 11.5, fontWeight: 600,
              background: meshData.prompt === p.prompt ? 'rgba(124,58,237,0.15)' : 'rgba(0,0,0,0.04)',
              border: `1px solid ${meshData.prompt === p.prompt ? 'rgba(124,58,237,0.4)' : 'rgba(0,0,0,0.08)'}`,
              color: meshData.prompt === p.prompt ? '#7c3aed' : '#555', cursor: 'pointer'
            }}
          >
            {p.prompt}
          </button>
        ))}
      </div>

      {/* Component Surface Toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {[
          { id: 'card', label: '🎴 Card Surface' },
          { id: 'button', label: '🔘 Button Surface' },
          { id: 'hero', label: '🌟 Hero Banner Surface' }
        ].map(s => (
          <button
            key={s.id}
            type="button"
            onClick={() => setPreviewSurface(s.id)}
            style={{
              padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              border: 'none', cursor: 'pointer',
              background: previewSurface === s.id ? '#1e1040' : 'rgba(0,0,0,0.05)',
              color: previewSurface === s.id ? '#fff' : '#666'
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Live Component Preview */}
      <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.1)', position: 'relative' }}>
        
        {/* Surface 1: Card Surface */}
        {previewSurface === 'card' && (
          <div style={{ ...inlineMeshStyle, padding: '40px 24px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{
              maxWidth: 380, width: '100%', background: 'rgba(255, 255, 255, 0.15)', backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)', borderRadius: 18, padding: 24, border: '1px solid rgba(255, 255, 255, 0.3)',
              boxShadow: '0 20px 40px rgba(0,0,0,0.25)', color: '#fff'
            }}>
              <div style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 12, background: 'rgba(255,255,255,0.25)', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
                Mesh UI Card
              </div>
              <h3 style={{ fontFamily: 'Syne, sans-serif', fontSize: 20, fontWeight: 800, margin: '0 0 8px 0', textShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
                Elevate Digital Interfaces
              </h3>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, opacity: 0.9 }}>
                Multi-radial mesh gradients create dynamic visual depth for cards, dashboards, and modal overlays.
              </p>
            </div>
          </div>
        )}

        {/* Surface 2: Button Surface */}
        {previewSurface === 'button' && (
          <div style={{ background: '#0e0e1a', padding: '50px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Interactive Button Surface with Live Mesh Fill</div>
            <motion.button
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => copyMesh(meshCss)}
              title="Click to copy interactive button mesh styling"
              style={{
                ...inlineMeshStyle,
                border: '1px solid rgba(255,255,255,0.3)',
                padding: '14px 32px',
                borderRadius: 14,
                color: '#fff',
                fontFamily: 'Syne, sans-serif',
                fontSize: 15,
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 8px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.4)'
              }}
            >
              {copiedMesh ? '✓ Copied Button CSS!' : '🚀 Launch ToolDesk Studio →'}
            </motion.button>
          </div>
        )}

        {/* Surface 3: Hero Banner Surface */}
        {previewSurface === 'hero' && (
          <div style={{ ...inlineMeshStyle, padding: '44px 28px', color: '#fff', textAlign: 'center', position: 'relative' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px',
              borderRadius: 20, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(8px)',
              fontSize: 11, fontWeight: 700, marginBottom: 14, border: '1px solid rgba(255,255,255,0.2)'
            }}>
              <span>✨</span> Next-Gen Visual Architecture
            </div>
            <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: 'clamp(22px, 4vw, 32px)', fontWeight: 800, margin: '0 0 10px 0', textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
              Transform Static Screens into Fluid Art
            </h2>
            <p style={{ margin: '0 auto 18px auto', maxWidth: 440, fontSize: 13, opacity: 0.9, lineHeight: 1.5 }}>
              Seamlessly deploy organic multi-stop mesh gradients directly to your production Tailwind or CSS stylesheets.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
              <div style={{ padding: '8px 18px', borderRadius: 10, background: '#fff', color: '#111', fontWeight: 800, fontSize: 12.5 }}>
                Get Started
              </div>
              <div style={{ padding: '8px 18px', borderRadius: 10, background: 'rgba(255,255,255,0.2)', color: '#fff', fontWeight: 700, fontSize: 12.5, border: '1px solid rgba(255,255,255,0.3)' }}>
                Documentation
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Code Snippet Box */}
      <div style={{ marginTop: 12, background: '#1e1e2e', borderRadius: 12, padding: '12px 16px', fontFamily: 'monospace', fontSize: 11.5, color: '#a6e3a1', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
        {meshCss}
      </div>
    </div>
  )
}

export default function GradientGenerator() {
  const [type,      setType]   = useState('linear')
  const [angle,     setAngle]  = useState(135)
  const [stops,     setStops]  = useState(['#4F8EF7','#9C6FDE'])
  const [copied,    copy]      = useCopy()
  const [cssCopied, copyCss]   = useCopy()
  const [tailCopied,copyTail]  = useCopy()
  const [svgCopied, copySvg]   = useCopy()
  const [tab,       setTab]    = useState('css')
  const [previewH,  setPreviewH] = useState(160)
  const [showRgb,   setShowRgb] = useState(false)

  const css      = useMemo(() => buildCSS(type, angle, stops), [type, angle, stops])
  const fullCss  = `background: ${css};`
  const bgCss    = `background-image: ${css};`

  // Tailwind from-to-via or arbitrary value
  const tailwind = useMemo(() => {
    if (type === 'linear') {
      const dirMap = { 0:'to-t', 45:'to-tr', 90:'to-r', 135:'to-br', 180:'to-b', 225:'to-bl', 270:'to-l', 315:'to-tl' }
      const dir = dirMap[angle]
      if (dir) {
        if (stops.length === 2) return `bg-gradient-${dir} from-[${stops[0]}] to-[${stops[1]}]`
        if (stops.length === 3) return `bg-gradient-${dir} from-[${stops[0]}] via-[${stops[1]}] to-[${stops[2]}]`
      }
    }
    // For radial, conic, or custom angles, use valid Tailwind arbitrary value syntax (spaces replaced with underscores)
    const formatted = css.replace(/\s+/g, '_')
    return `bg-[${formatted}]`
  }, [type, angle, stops, css])

  // SVG gradient
  const svgCode = useMemo(() => {
    const id = 'grad1'
    if (type === 'radial') {
      const gradStops = stops.map((c,i) => `  <stop offset="${Math.round(i/(stops.length-1)*100)}%" stop-color="${c}"/>`).join('\n')
      return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">\n  <defs>\n    <radialGradient id="${id}" cx="50%" cy="50%" r="50%">\n${gradStops}\n    </radialGradient>\n  </defs>\n  <rect width="100%" height="100%" fill="url(#${id})"/>\n</svg>`
    }
    const rad = (angle * Math.PI) / 180
    const x2 = Math.round((0.5 + Math.cos(rad)*0.5)*100)+'%'
    const y2 = Math.round((0.5 + Math.sin(rad)*0.5)*100)+'%'
    const x1 = Math.round((0.5 - Math.cos(rad)*0.5)*100)+'%'
    const y1 = Math.round((0.5 - Math.sin(rad)*0.5)*100)+'%'
    const gradStops = stops.map((c,i) => `  <stop offset="${Math.round(i/(stops.length-1)*100)}%" stop-color="${c}"/>`).join('\n')
    return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">\n  <defs>\n    <linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">\n${gradStops}\n    </linearGradient>\n  </defs>\n  <rect width="100%" height="100%" fill="url(#${id})"/>\n</svg>`
  }, [type, angle, stops])

  const addStop  = () => { if (stops.length < 8) setStops(s => [...s, '#ff6b6b']) }
  const remStop  = i  => { if (stops.length > 2) setStops(s => s.filter((_,j) => j!==i)) }
  const setStop  = (i,v) => setStops(s => s.map((c,j) => j===i ? v : c))
  const applyPreset = p => { setStops(p.stops); setAngle(p.angle); setType('linear') }

  const randomise = () => {
    const rand = () => '#' + Math.floor(Math.random()*0xFFFFFF).toString(16).padStart(6,'0')
    const n = 2 + Math.floor(Math.random()*3)
    setStops(Array.from({length:n}, rand))
    setAngle(Math.floor(Math.random()*360))
    setType(TYPES[Math.floor(Math.random()*TYPES.length)])
  }

  const downloadPng = () => {
    const canvas = document.createElement('canvas')
    canvas.width = 1200; canvas.height = 630
    const ctx = canvas.getContext('2d')
    const applyStops = (gradient, stopList) => {
      if (!stopList || stopList.length === 0) {
        gradient.addColorStop(0, '#000000')
        gradient.addColorStop(1, '#ffffff')
        return
      }
      if (stopList.length === 1) {
        gradient.addColorStop(0, stopList[0])
        gradient.addColorStop(1, stopList[0])
        return
      }
      const denom = stopList.length - 1
      stopList.forEach((c, i) => gradient.addColorStop(i / denom, c))
    }

    try {
      let grd
      if (type === 'radial') {
        grd = ctx.createRadialGradient(600,315,0,600,315,630)
        applyStops(grd, stops)
        ctx.fillStyle = grd
        ctx.fillRect(0,0,1200,630)
      } else if (type === 'conic') {
        const rad = (angle * Math.PI) / 180
        if (typeof ctx.createConicGradient === 'function') {
          grd = ctx.createConicGradient(rad, 600, 315)
        } else {
          grd = ctx.createRadialGradient(600,315,0,600,315,630)
        }
        applyStops(grd, stops)
        ctx.fillStyle = grd
        ctx.fillRect(0,0,1200,630)
      } else {
        const rad = (angle-90) * Math.PI/180
        const x1 = 600 - Math.cos(rad)*630, y1 = 315 - Math.sin(rad)*630
        const x2 = 600 + Math.cos(rad)*630, y2 = 315 + Math.sin(rad)*630
        grd = ctx.createLinearGradient(x1,y1,x2,y2)
        applyStops(grd, stops)
        ctx.fillStyle = grd
        ctx.fillRect(0,0,1200,630)
      }
      saveFileWithFallback(canvas.toDataURL('image/png'), 'gradient.png', 'image/png')
    } catch (e) {
      console.error('Gradient PNG generation error:', e)
    }
  }

  const OUTPUT_TABS = [
    {id:'css',     label:'CSS'},
    {id:'tailwind',label:'Tailwind'},
    {id:'svg',     label:'SVG'},
    {id:'glass',   label:'🔮 Glassmorphism'},
  ]

  return (
    <ToolShell tool={tool}>
      <ToolCard style={{marginBottom:18}}>

        {/* Live preview */}
        <div style={{ height:previewH, borderRadius:16, background:css, marginBottom:20,
          boxShadow:'0 12px 40px rgba(0,0,0,.18)', transition:'background .25s, height .3s',
          position:'relative', overflow:'hidden', cursor:'pointer' }}
          onClick={() => setPreviewH(h => h === 160 ? 280 : 160)}>
          <div style={{ position:'absolute', inset:0, opacity:.05,
            backgroundImage:'linear-gradient(45deg,#000 25%,transparent 25%),linear-gradient(-45deg,#000 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#000 75%),linear-gradient(-45deg,transparent 75%,#000 75%)',
            backgroundSize:'12px 12px', backgroundPosition:'0 0,0 6px,6px -6px,-6px 0' }}/>
          <div style={{ position:'absolute', top:10, right:12, fontSize:10, fontWeight:700,
            color:'rgba(255,255,255,.75)', background:'rgba(0,0,0,.32)', padding:'3px 9px',
            borderRadius:999, backdropFilter:'blur(6px)' }}>
            {type} · {type!=='radial' ? `${angle}°` : 'circle'} · click to expand
          </div>
          <div style={{ position:'absolute', bottom:10, left:12, display:'flex', gap:6 }}>
            {stops.map((c,i) => (
              <div key={i} style={{ width:20, height:20, borderRadius:5, background:c, border:'1.5px solid rgba(255,255,255,.4)', boxShadow:'0 2px 6px rgba(0,0,0,.3)' }}/>
            ))}
          </div>
        </div>

        {/* Type */}
        <div className="fgrp">
          <label className="lbl">Gradient Type</label>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:7 }}>
            {TYPES.map(t => (
              <button key={t} onClick={() => setType(t)}
                style={{ padding:'10px', borderRadius:10, fontSize:12.5, fontWeight:700,
                  cursor:'pointer', transition:'all .18s cubic-bezier(.22,1,.36,1)',
                  border:`1.5px solid ${type===t?'#4F8EF7':'rgba(0,0,0,.1)'}`,
                  background: type===t?'rgba(79,142,247,.09)':'#fafafa',
                  color: type===t?'#4F8EF7':'#666', textTransform:'capitalize' }}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Angle */}
        {type !== 'radial' && (
          <div className="fgrp">
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
              <label className="lbl" style={{margin:0}}>Angle</label>
              <span style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:20, color:'#4F8EF7' }}>{angle}°</span>
            </div>
            <input type="range" min={0} max={360} value={angle}
              onChange={e => setAngle(+e.target.value)}
                style={{ width:'100%', background:`linear-gradient(to right,#4F8EF7 0%,#4F8EF7 ${Math.max(0,Math.min(100,((angle)-(0))/((360)-(0))*100))}%,#e2e4ef ${Math.max(0,Math.min(100,((angle)-(0))/((360)-(0))*100))}%,#e2e4ef 100%)`, WebkitAppearance:'none', appearance:'none', height:5, borderRadius:3, outline:'none', cursor:'pointer' }} className="rs-thumb"/>
            <div style={{ display:'flex', gap:6, marginTop:8, flexWrap:'wrap' }}>
              {[0,45,90,135,180,225,270,315].map(a => (
                <button key={a} onClick={() => setAngle(a)}
                  style={{ padding:'3px 10px', borderRadius:999, fontSize:10.5, fontWeight:700,
                    cursor:'pointer', border:`1.5px solid ${angle===a?'#4F8EF7':'rgba(0,0,0,.1)'}`,
                    background: angle===a?'rgba(79,142,247,.1)':'#fafafa',
                    color: angle===a?'#4F8EF7':'#888' }}>
                  {a}°
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Color stops */}
        <div className="fgrp">
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <label className="lbl" style={{margin:0}}>Color Stops ({stops.length}/8)</label>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              <button onClick={randomise} className="btn btn-outline btn-sm" style={{fontSize:11}}>🎲 Random</button>
              {stops.length < 8 && <button onClick={addStop} className="btn btn-outline btn-sm" style={{fontSize:11}}>+ Add Stop</button>}
              <button onClick={() => setShowRgb(x => !x)} className="btn btn-outline btn-sm" style={{fontSize:11}}>
                {showRgb ? 'HEX' : 'RGB'}
              </button>
            </div>
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {stops.map((c,i) => {
              const rgb = hexToRgb(c)
              return (
                <motion.div key={i} layout
                  initial={{ opacity:0, x:-8 }} animate={{ opacity:1, x:0 }}
                  style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <input type="color" value={c} onChange={e => setStop(i,e.target.value)}
                    style={{ width:44, height:44, borderRadius:10, border:'2px solid rgba(0,0,0,.08)', cursor:'pointer', padding:2 }}/>
                  <input type="text" value={showRgb && rgb ? `rgb(${rgb.r},${rgb.g},${rgb.b})` : c}
                    onChange={e => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && setStop(i,e.target.value)}
                    readOnly={showRgb}
                    className="inp" style={{ flex:1, fontFamily:'monospace', fontSize:13, fontWeight:600 }}/>
                  <div style={{ width:36, height:36, borderRadius:8, background:c, border:'1px solid rgba(0,0,0,.1)', flexShrink:0,
                    boxShadow:`0 3px 10px ${c}55` }}/>
                  {i > 0 && i < stops.length-1 && (
                    <button onClick={() => remStop(i)}
                      style={{ width:28, height:28, borderRadius:999, border:'1.5px solid rgba(239,68,68,.3)',
                        background:'rgba(239,68,68,.06)', color:'#ef4444', cursor:'pointer', fontSize:14, flexShrink:0,
                        display:'flex',alignItems:'center',justifyContent:'center' }}>×</button>
                  )}
                  {(i === 0 || i === stops.length-1) && stops.length > 2 && (
                    <button onClick={() => remStop(i)}
                      style={{ width:28, height:28, borderRadius:999, border:'1.5px solid rgba(239,68,68,.3)',
                        background:'rgba(239,68,68,.06)', color:'#ef4444', cursor:'pointer', fontSize:14, flexShrink:0,
                        display:'flex',alignItems:'center',justifyContent:'center' }}>×</button>
                  )}
                </motion.div>
              )
            })}
          </div>

          {/* Live mini bar */}
          <div style={{ height:10, borderRadius:5, background:buildCSS('linear',90,stops), marginTop:14,
            boxShadow:'inset 0 1px 3px rgba(0,0,0,.1)', border:'1px solid rgba(0,0,0,.06)' }}/>
        </div>

        {/* Presets */}
        <div className="fgrp">
          <label className="lbl">Presets ({PRESETS.length})</label>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(66px,1fr))', gap:7 }}>
            {PRESETS.map(p => (
              <motion.button key={p.name} onClick={() => applyPreset(p)}
                whileHover={{ scale:1.08, y:-2 }} whileTap={{ scale:.95 }}
                style={{ height:42, borderRadius:10, border:'2px solid transparent',
                  background: buildCSS('linear',p.angle,p.stops),
                  cursor:'pointer', transition:'border-color .2s', position:'relative', overflow:'hidden' }}
                onMouseEnter={e => e.currentTarget.style.borderColor='#4F8EF7'}
                onMouseLeave={e => e.currentTarget.style.borderColor='transparent'}>
                <span style={{ position:'absolute', bottom:3, left:0, right:0, textAlign:'center',
                  fontSize:8, fontWeight:700, color:'rgba(255,255,255,.9)',
                  textShadow:'0 1px 4px rgba(0,0,0,.6)' }}>{p.name}</span>
              </motion.button>
            ))}
          </div>
        </div>

        {/* Output tabs */}
        <div className="fgrp">
          <div style={{ display:'flex', gap:4, background:'#f5f5f8', borderRadius:10, padding:4, marginBottom:14 }}>
            {OUTPUT_TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{ flex:1, padding:'8px', borderRadius:7, border:'none', cursor:'pointer',
                  fontSize:12, fontWeight:700,
                  background: tab===t.id?'#fff':'transparent',
                  color: tab===t.id?'#4F8EF7':'#aaa',
                  boxShadow: tab===t.id?'0 2px 8px rgba(0,0,0,.08)':'none', transition:'all .18s cubic-bezier(.22,1,.36,1)' }}>
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'css' && (
            <div>
              <div style={{ background:'#1e1e2e', borderRadius:12, padding:'14px 16px',
                fontFamily:'monospace', fontSize:13, color:'#cdd6f4', lineHeight:1.75,
                border:'1px solid rgba(0,0,0,.12)', wordBreak:'break-all' }}>
                <div><span style={{color:'#cba6f7'}}>background</span><span style={{color:'#fff'}}>: </span><span style={{color:'#a6e3a1'}}>{css}</span><span style={{color:'#fff'}}>;</span></div>
                <div style={{marginTop:4,opacity:.5,fontSize:11}}>/* image only */</div>
                <div><span style={{color:'#cba6f7'}}>background-image</span><span style={{color:'#fff'}}>: </span><span style={{color:'#a6e3a1'}}>{css}</span><span style={{color:'#fff'}}>;</span></div>
              </div>
              <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap' }}>
                <button className={`btn ${cssCopied?'btn-success':'btn-primary'} btn-sm`} onClick={() => copyCss(fullCss)}>
                  {cssCopied ? '✓ Copied!' : '📋 Copy Full CSS'}
                </button>
                <button className={`btn btn-outline btn-sm`} onClick={() => copy(css)}>
                  {copied ? '✓' : 'Copy Value Only'}
                </button>
                <button className="btn btn-outline btn-sm" onClick={downloadPng}>
                  ⬇ Download PNG (1200×630)
                </button>
              </div>
            </div>
          )}

          {tab === 'tailwind' && (
            <div>
              <div style={{ background:'#1e1e2e', borderRadius:12, padding:'14px 16px',
                fontFamily:'monospace', fontSize:13, color:'#a6e3a1', lineHeight:1.75,
                border:'1px solid rgba(0,0,0,.12)', wordBreak:'break-all' }}>
                {tailwind}
              </div>
              <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap' }}>
                <button className={`btn ${tailCopied?'btn-success':'btn-primary'} btn-sm`}
                  onClick={() => copyTail(tailwind)}>
                  {tailCopied ? '✓ Copied!' : '📋 Copy Tailwind Class'}
                </button>
                {type !== 'linear' && (
                  <button className={`btn btn-outline btn-sm`}
                    onClick={() => copyCss(fullCss)}>
                    {cssCopied ? '✓ Copied CSS!' : '📋 Copy CSS Instead'}
                  </button>
                )}
              </div>
              {type !== 'linear' && (
                <div className="info-bar amber" style={{marginTop:10, display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8}}>
                  <span>⚠️ Tailwind uses arbitrary value syntax for radial/conic gradients — or use the standard CSS output.</span>
                  <button onClick={() => setTab('css')}
                    style={{ background:'rgba(245,158,11,.18)', border:'1px solid rgba(245,158,11,.35)', color:'#b85000', borderRadius:8, padding:'5px 12px', fontSize:11.5, fontWeight:700, cursor:'pointer' }}>
                    Switch to CSS Output →
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === 'svg' && (
            <div>
              <div style={{ background:'#1e1e2e', borderRadius:12, padding:'14px 16px',
                fontFamily:'monospace', fontSize:12, color:'#cdd6f4', lineHeight:1.75,
                border:'1px solid rgba(0,0,0,.12)', wordBreak:'break-all', whiteSpace:'pre-wrap' }}>
                {svgCode}
              </div>
              <button className={`btn ${svgCopied?'btn-success':'btn-primary'} btn-sm`} style={{marginTop:10}}
                onClick={() => copySvg(svgCode)}>
                {svgCopied ? '✓ Copied!' : '📋 Copy SVG'}
              </button>
            </div>
          )}

          {tab === 'glass' && (
            <GlassmorphismStudio currentCss={css} stops={stops}/>
          )}
        </div>


        {/* ── ADVANCED ENHANCEMENT: AI MESH GRADIENT STUDIO & COMPONENT PREVIEWS ── */}
        <MeshGradientStudio initialStops={stops} />


      </ToolCard>

      {/* ── AI GRADIENT GENERATOR ── */}
      <Reveal delay={.06}>
        <ToolCard style={{marginTop:0}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
            <div style={{fontSize:22}}>🤖</div>
            <div>
              <div style={{fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:15,color:'#0d0d1a'}}>
                AI Gradient Generator
              </div>
              <div style={{fontSize:12,color:'#aaa',marginTop:1}}>
                Describe a mood or theme — AI creates perfect gradients
              </div>
            </div>
          </div>

          <AIGradientPanel onApply={(g)=>{
            const normalized = (g.stops || []).map(normalizeColor)
            setStops(normalized)
            if(g.angle) setAngle(g.angle)
            if(g.style) setType(g.style)
          }}/>
        </ToolCard>
      </Reveal>

    </ToolShell>
  )
}
