import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ToolShell, { ToolCard, Reveal } from '../../components/ToolShell'
import { useCopy } from '../../hooks'
import { TOOLS } from '../../constants'
import { safeFetchJSON } from '../../utils/safeFetch'
import { addToHistory } from '../../utils/history'
import { useToolHistory } from '../../hooks/useToolHistory'
import { Clock, Trash2 } from 'lucide-react'

const tool = TOOLS.find(t => t.id === 'colorpicker')

/* ── Color math ── */
function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string') return null
  let clean = hex.trim().replace(/^#/, '')
  if (/^[a-f\d]{3}$/i.test(clean)) {
    clean = clean.split('').map(c => c + c).join('')
  } else if (/^[a-f\d]{4}$/i.test(clean)) {
    clean = clean.slice(0, 3).split('').map(c => c + c).join('')
  } else if (/^[a-f\d]{8}$/i.test(clean)) {
    clean = clean.slice(0, 6)
  }
  const r = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(clean)
  return r ? { r:parseInt(r[1],16), g:parseInt(r[2],16), b:parseInt(r[3],16) } : null
}
function rgbToHex({r,g,b}) {
  const clamp = v => Math.max(0, Math.min(255, Math.round(Number(v) || 0)))
  return '#'+[r,g,b].map(v=>clamp(v).toString(16).padStart(2,'0')).join('')
}
function rgbToHsl({r,g,b}) {
  r = Math.max(0, Math.min(255, Number(r) || 0)) / 255
  g = Math.max(0, Math.min(255, Number(g) || 0)) / 255
  b = Math.max(0, Math.min(255, Number(b) || 0)) / 255
  const max=Math.max(r,g,b), min=Math.min(r,g,b)
  let h,s,l=(max+min)/2
  if(max===min){h=s=0}else{
    const d=max-min; s=l>0.5?d/(2-max-min):d/(max+min)
    switch(max){case r:h=((g-b)/d+(g<b?6:0))/6;break;case g:h=((b-r)/d+2)/6;break;default:h=((r-g)/d+4)/6}
  }
  return {h:Math.round(((h*360)%360+360)%360),s:Math.round(Math.max(0,Math.min(100,s*100))),l:Math.round(Math.max(0,Math.min(100,l*100)))}
}
function rgbToHsv({r,g,b}){
  r = Math.max(0, Math.min(255, Number(r) || 0)) / 255
  g = Math.max(0, Math.min(255, Number(g) || 0)) / 255
  b = Math.max(0, Math.min(255, Number(b) || 0)) / 255
  const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min
  let h=0,s=max===0?0:d/max,v=max
  if(d!==0){switch(max){case r:h=((g-b)/d+(g<b?6:0))/6;break;case g:h=((b-r)/d+2)/6;break;default:h=((r-g)/d+4)/6}}
  return {h:Math.round(((h*360)%360+360)%360),s:Math.round(Math.max(0,Math.min(100,s*100))),v:Math.round(Math.max(0,Math.min(100,v*100)))}
}
function rgbToCmyk({r,g,b}){
  r = Math.max(0, Math.min(255, Number(r) || 0)) / 255
  g = Math.max(0, Math.min(255, Number(g) || 0)) / 255
  b = Math.max(0, Math.min(255, Number(b) || 0)) / 255
  const k=1-Math.max(r,g,b)
  if(k >= 0.999999)return{c:0,m:0,y:0,k:100}
  const denom = 1 - k
  return{
    c:Math.max(0, Math.min(100, Math.round((1-r-k)/denom*100))),
    m:Math.max(0, Math.min(100, Math.round((1-g-k)/denom*100))),
    y:Math.max(0, Math.min(100, Math.round((1-b-k)/denom*100))),
    k:Math.max(0, Math.min(100, Math.round(k*100)))
  }
}
function hslToRgb(h,s,l){
  h = ((Number(h) % 360) + 360) % 360
  s = Math.max(0, Math.min(100, Number(s) || 0)) / 100
  l = Math.max(0, Math.min(100, Number(l) || 0)) / 100
  const a=s*Math.min(l,1-l)
  const f=(n,k=(n+h/30)%12)=>l-a*Math.max(-1,Math.min(k-3,9-k,1))
  return{r:Math.round(f(0)*255),g:Math.round(f(8)*255),b:Math.round(f(4)*255)}
}
function getLuminance({r,g,b}){
  const [R,G,B]=[r,g,b].map(c=>{
    const v = Math.max(0, Math.min(255, Number(c) || 0)) / 255
    return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)
  })
  return 0.2126*R+0.7152*G+0.0722*B
}
function contrastRatio(L1,L2){
  const l1 = Math.max(0, Number(L1) || 0), l2 = Math.max(0, Number(L2) || 0)
  return((Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05)).toFixed(2)
}
function wcagLevel(r){const n=parseFloat(r);return isNaN(n)?{l:'Fail',c:'#ef4444'}:n>=7?{l:'AAA',c:'#22c55e'}:n>=4.5?{l:'AA',c:'#4F8EF7'}:n>=3?{l:'AA Large',c:'#f97316'}:{l:'Fail',c:'#ef4444'}}

/* ── Auto-Fix Contrast Algorithm (Preserves Hue & Saturation while stepping Lightness) ── */
function calculateAutoFixedColor(fgHex, bgHex, targetRatio = 4.5) {
  const fgRgb = hexToRgb(fgHex)
  const bgRgb = hexToRgb(bgHex)
  if (!fgRgb || !bgRgb) return null

  const bgLum = getLuminance(bgRgb)
  const currentRatio = parseFloat(contrastRatio(getLuminance(fgRgb), bgLum))

  if (currentRatio >= targetRatio) {
    return {
      originalHex: fgHex,
      adjustedHex: fgHex,
      originalRatio: currentRatio,
      adjustedRatio: currentRatio,
      alreadyPassed: true,
      wcag: wcagLevel(currentRatio)
    }
  }

  // Convert fg to HSL
  const hsl = rgbToHsl(fgRgb)
  const isBgLight = bgLum > 0.45 // if bg is light, step towards dark; if dark, step towards light

  let bestHex = fgHex
  let bestRatio = currentRatio

  // 1. Step lightness towards compliant boundary
  const step = isBgLight ? -1 : 1
  let l = hsl.l

  while (l >= 0 && l <= 100) {
    l += step
    const candidateRgb = hslToRgb(hsl.h, hsl.s, l)
    const candidateLum = getLuminance(candidateRgb)
    const ratio = parseFloat(contrastRatio(candidateLum, bgLum))

    bestHex = rgbToHex(candidateRgb)
    bestRatio = ratio

    if (ratio >= targetRatio) {
      break
    }
  }

  // 2. If lightness alone at limits did not reach target, gently modulate saturation
  if (bestRatio < targetRatio) {
    let s = hsl.s
    while (s >= 0) {
      s -= 5
      const candidateRgb = hslToRgb(hsl.h, Math.max(0, s), isBgLight ? 0 : 100)
      const ratio = parseFloat(contrastRatio(getLuminance(candidateRgb), bgLum))
      bestHex = rgbToHex(candidateRgb)
      bestRatio = ratio
      if (ratio >= targetRatio) break
    }
  }

  return {
    originalHex: fgHex,
    adjustedHex: bestHex,
    originalRatio: currentRatio,
    adjustedRatio: bestRatio,
    alreadyPassed: false,
    wcag: wcagLevel(bestRatio)
  }
}

function generateHarmonies(h,s,l){
  return {
    complementary: [0,180].map(o=>rgbToHex(hslToRgb((h+o)%360,s,l))),
    triadic:       [0,120,240].map(o=>rgbToHex(hslToRgb((h+o)%360,s,l))),
    analogous:     [-30,0,30].map(o=>rgbToHex(hslToRgb((h+o+360)%360,s,l))),
    split:         [h,(h+150)%360,(h+210)%360].map(hh=>rgbToHex(hslToRgb(hh,s,l))),
    tetradic:      [0,90,180,270].map(o=>rgbToHex(hslToRgb((h+o)%360,s,l))),
    monochromatic: [20,35,50,65,80].map(ll=>rgbToHex(hslToRgb(h,s,ll))),
  }
}

const PRESETS = [
  '#FF5722','#E91E63','#9C27B0','#673AB7','#3F51B5','#2196F3',
  '#00BCD4','#009688','#4CAF50','#8BC34A','#FFC107','#FF9800',
  '#795548','#9E9E9E','#607D8B','#F44336','#0d0d1a','#ffffff',
]

const TABS = ['Picker','Harmonies','Palettes','Accessibility','AI Insight','Export','History']

function Swatch({hex,size=32,onClick,active,label}){
  return(
    <motion.button whileHover={{scale:1.15,y:-3}} whileTap={{scale:.92}}
      onClick={()=>onClick?.(hex)} title={label||hex}
      style={{width:size,height:size,borderRadius:size/3,background:hex,
        border:active?'3px solid #4F8EF7':'2px solid rgba(0,0,0,.1)',cursor:'pointer',
        boxShadow:active?`0 0 0 2px #fff,0 0 0 4px #4F8EF7`:'0 2px 6px rgba(0,0,0,.15)',
        flexShrink:0}}/>
  )
}

/* Eye-dropper: native API or canvas fallback */
async function pickFromScreen(){
  if(window.EyeDropper){
    try{
      const d=new window.EyeDropper()
      const r=await d.open()
      return r.sRGBHex
    }catch{ return null }
  }
  return null
}

export default function ColorPicker(){
  const [hex,setHex]          = useState('#4F8EF7')
  const [tab,setTab]          = useState('Picker')
  const [hslH,setH]           = useState(217)
  const [hslS,setS]           = useState(91)
  const [hslL,setL]           = useState(64)
  const [palette,setPalette]  = useState([])
  const { history: persistedHistory, add: addPersistedColor, remove: removeHistoryEntry, clear: clearToolHistory } = useToolHistory('Color Picker', 30)
  const [aiLoading,setAiLoad] = useState(false)
  const [aiPalettes,setAiPal] = useState([])
  const [aiError,setAiErr]    = useState('')
  const [picked,setPicked]    = useState(false)
  const [copied,copy]         = useCopy()
  const [lastCopy,setLC]      = useState('')
  const [colorCtx, setColorCtx] = useState(null)
  const [ctxLoading, setCtxLoad] = useState(false)
  const [ctxError, setCtxError] = useState('')
  const [a11yTarget, setA11yTarget] = useState('AA') // 'AA' (4.5:1) | 'AAA' (7.0:1)
  const [a11yBg, setA11yBg] = useState('#ffffff')
  const [copiedAutoFix, copyAutoFix] = useCopy()
  const canvasRef             = useRef(null)

  const rgb  = useMemo(()=>hexToRgb(hex)||{r:79,g:142,b:247},[hex])
  const hsl  = useMemo(()=>rgbToHsl(rgb),[rgb])
  const hsv  = useMemo(()=>rgbToHsv(rgb),[rgb])
  const cmyk = useMemo(()=>rgbToCmyk(rgb),[rgb])
  const lum  = useMemo(()=>getLuminance(rgb),[rgb])
  const harmonies = useMemo(()=>generateHarmonies(hsl.h,hsl.s,hsl.l),[hsl.h,hsl.s,hsl.l])

  const mountedRef = useRef(true)
  useEffect(() => {
    return () => { mountedRef.current = false }
  }, [])

  const shades = useMemo(()=>
    [10,20,30,40,50,60,70,80,90].map(l2=>({l:l2,hex:rgbToHex(hslToRgb(hsl.h,hsl.s,l2))}))
  ,[hsl.h,hsl.s])

  const targetThreshold = a11yTarget === 'AAA' ? 7.0 : 4.5
  const autoFix = useMemo(() => {
    return calculateAutoFixedColor(hex, a11yBg, targetThreshold)
  }, [hex, a11yBg, targetThreshold])

  const applyHex = useCallback((h)=>{
    const clean=h.startsWith('#')?h:'#'+h
    const short=clean.slice(0,7)
    if(!/^#[0-9a-fA-F]{6}$/.test(short)) return
    setHex(short)
    const r=hexToRgb(short)
    if(r){const hs=rgbToHsl(r);setH(hs.h);setS(hs.s);setL(hs.l)}
    addPersistedColor({
      tool: 'Color Picker',
      label: `Hex: ${short.toUpperCase()}`,
      value: short,
      action: 'Picked',
      category: 'Design',
      metadata: { hex: short }
    })
  },[addPersistedColor])

  const applyHsl = useCallback((h,s,l)=>{
    setH(h);setS(s);setL(l)
    const newHex=rgbToHex(hslToRgb(h,s,l))
    setHex(newHex)
    addPersistedColor({
      tool: 'Color Picker',
      label: `Hex: ${newHex.toUpperCase()}`,
      value: newHex,
      action: 'Picked',
      category: 'Design',
      metadata: { hex: newHex }
    })
  },[addPersistedColor])

  const cp=(text,key)=>{
    setLC(key)
    copy(text)
    addToHistory({
      tool: 'Color Picker',
      label: `Copied ${key || 'Color'}: ${text}`,
      value: text,
      category: 'Design'
    })
  }
  const addToPalette=()=>{
    if(!palette.includes(hex)&&palette.length<16){
      setPalette(p=>[...p,hex])
      addToHistory({
        tool: 'Color Picker',
        label: `Saved Palette Color: ${hex}`,
        value: hex,
        category: 'Design'
      })
    }
  }

  /* Eye-dropper */
  const eyeDrop=async()=>{
    const picked=await pickFromScreen()
    if(picked) applyHex(picked)
  }

  /* AI palette generation via Groq */
  const generateAIPalette=async(mood)=>{
    setAiLoad(true); setAiErr(''); setAiPal([])
    try{
      const data = await safeFetchJSON('/.netlify/functions/groq-ai',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          tool: 'colorPalette',
          payload: { hex, mood, rgb: `${rgb.r},${rgb.g},${rgb.b}` }
        })
      }, 25000)
      if (!mountedRef.current) return
      if (data && data.palettes && data.palettes.length > 0) {
        setAiPal(data.palettes)
      } else {
        setAiErr(data?.error || 'AI palette generation failed. Try again.')
      }
    }catch(e){
      if (mountedRef.current) setAiErr('AI palette generation failed. Try again.')
    } finally {
      if (mountedRef.current) setAiLoad(false)
    }
  }

  const formats=[
    {label:'HEX',   val:hex.toUpperCase(),                                     key:'hex'},
    {label:'RGB',   val:`rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,                   key:'rgb'},
    {label:'RGBA',  val:`rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`,               key:'rgba'},
    {label:'HSL',   val:`hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`,                key:'hsl'},
    {label:'HSLA',  val:`hsla(${hsl.h}, ${hsl.s}%, ${hsl.l}%, 1)`,            key:'hsla'},
    {label:'HSV',   val:`hsv(${hsv.h}, ${hsv.s}%, ${hsv.v}%)`,                key:'hsv'},
    {label:'CMYK',  val:`cmyk(${cmyk.c}%, ${cmyk.m}%, ${cmyk.y}%, ${cmyk.k}%)`,key:'cmyk'},
    {label:'CSS',   val:`--color: ${hex.toUpperCase()};`,                      key:'var'},
    {label:'Tailwind',val:`bg-[${hex.toUpperCase()}]`,                         key:'tw'},
    {label:'RGBA255',val:`${rgb.r}, ${rgb.g}, ${rgb.b}`,                       key:'raw'},
  ]

  const contW=contrastRatio(lum,1)
  const contB=contrastRatio(lum,0)

  const SLIDERS=[
    {label:'H',val:hslH,max:360,unit:'°',set:v=>applyHsl(v,hslS,hslL),
      grad:`linear-gradient(to right,hsl(0,100%,50%),hsl(60,100%,50%),hsl(120,100%,50%),hsl(180,100%,50%),hsl(240,100%,50%),hsl(300,100%,50%),hsl(360,100%,50%))`},
    {label:'S',val:hslS,max:100,unit:'%',set:v=>applyHsl(hslH,v,hslL),
      grad:`linear-gradient(to right,hsl(${hslH},0%,${hslL}%),hsl(${hslH},100%,${hslL}%))`},
    {label:'L',val:hslL,max:100,unit:'%',set:v=>applyHsl(hslH,hslS,v),
      grad:`linear-gradient(to right,#000,hsl(${hslH},${hslS}%,50%),#fff)`},
  ]

  return(
    <ToolShell tool={tool}>
      <ToolCard>
        {/* Tabs */}
        <div style={{
          display: 'flex',
          background: 'rgba(0,0,0,.045)',
          borderRadius: 14,
          padding: 4,
          gap: 3,
          marginBottom: 22,
          overflowX: 'auto',
          flexWrap: 'nowrap',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          border: '1px solid rgba(0,0,0,.04)'
        }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{
                flex: '0 0 auto',
                padding: '8px 13px',
                borderRadius: 10,
                border: 'none',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                fontSize: 12,
                fontWeight: 700,
                background: tab === t ? '#ffffff' : 'transparent',
                color: tab === t ? '#0d0d1a' : '#64748b',
                boxShadow: tab === t ? '0 2px 8px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.03), inset 0 1px 0 rgba(255,255,255,1)' : 'none',
                transition: 'all .18s cubic-bezier(.22,1,.36,1)'
              }}>
              {t}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">

        {/* ── PICKER ── */}
        {tab==='Picker'&&(
          <motion.div key="picker" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <div className="color-picker-grid" style={{gap:20,marginBottom:22,alignItems:'start'}}>
              <div>
                {/* Big color swatch */}
                <motion.div animate={{background:hex}} transition={{duration:.2}}
                  style={{width:110,height:110,borderRadius:20,
                    boxShadow:'0 8px 28px rgba(0,0,0,.15), inset 0 1px 0 rgba(255,255,255,.35)',
                    border:'1px solid rgba(0,0,0,.08)',marginBottom:10,
                    position:'relative',overflow:'hidden',cursor:'crosshair'}}
                  title="Click to pick from screen">
                  <div style={{position:'absolute',bottom:6,left:0,right:0,textAlign:'center',
                    fontSize:11,fontWeight:700,
                    color:hslL>55?'rgba(0,0,0,.55)':'rgba(255,255,255,.85)'}}>
                    {hex.toUpperCase()}
                  </div>
                </motion.div>
                <input type="color" value={hex} onChange={e=>applyHex(e.target.value)}
                  style={{width:110,height:36,borderRadius:10,border:'1.5px solid rgba(0,0,0,.1)',
                    cursor:'pointer',padding:2}}/>
                <div style={{display:'flex',gap:6,marginTop:8}}>
                  <button onClick={addToPalette}
                    style={{flex:1,padding:'7px 0',borderRadius:10,
                      border:'1.5px solid rgba(79,142,247,.3)',background:'#f0f4ff',
                      color:'#4F8EF7',fontSize:11,fontWeight:700,cursor:'pointer'}}>
                    + Save
                  </button>
                  {window.EyeDropper&&(
                    <button onClick={eyeDrop}
                      style={{flex:1,padding:'7px 0',borderRadius:10,
                        border:'1.5px solid rgba(168,85,247,.3)',background:'rgba(168,85,247,.07)',
                        color:'#a855f7',fontSize:11,fontWeight:700,cursor:'pointer'}}>
                      🔍 Pick
                    </button>
                  )}
                </div>
              </div>

              {/* Hex input + HSL sliders */}
              <div>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16}}>
                  <span style={{fontSize:13,fontWeight:700,color:'#888',minWidth:14}}>#</span>
                  <input value={hex.replace('#','')} onChange={e=>applyHex(e.target.value)}
                    maxLength={6} spellCheck={false}
                    style={{flex:1,border:'1.5px solid rgba(0,0,0,.1)',borderRadius:10,
                      padding:'9px 12px',fontFamily:'monospace',fontSize:15,fontWeight:700,
                      color:'#0d0d1a',outline:'none',background:'#fafbff'}}
                    onFocus={e=>e.target.style.borderColor='rgba(79,142,247,.5)'}
                    onBlur={e=>e.target.style.borderColor='rgba(0,0,0,.1)'}/>
                </div>
                {SLIDERS.map(sl=>(
                  <div key={sl.label} style={{marginBottom:14}}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}>
                      <span style={{fontSize:11,fontWeight:700,color:'#aaa',textTransform:'uppercase'}}>{sl.label}</span>
                      <span style={{fontSize:12,fontWeight:700,color:'#555'}}>{sl.val}{sl.unit}</span>
                    </div>
                    <div style={{position:'relative',height:16}}>
                      <div style={{position:'absolute',inset:'4px 0',borderRadius:999,background:sl.grad,boxShadow:'inset 0 1px 3px rgba(0,0,0,.15)'}}/>
                      <input type="range" min={0} max={sl.max} value={sl.val}
                        onChange={e=>sl.set(+e.target.value)}
                        style={{ position:'absolute',inset:0,width:'100%',opacity:0,cursor:'pointer',height:'100%', background:`linear-gradient(to right,#4F8EF7 0%,#4F8EF7 ${Math.max(0,Math.min(100,((sl.val)-(0))/((sl.max)-(0))*100))}%,#e2e4ef ${Math.max(0,Math.min(100,((sl.val)-(0))/((sl.max)-(0))*100))}%,#e2e4ef 100%)`, WebkitAppearance:'none', appearance:'none', borderRadius:3, outline:'none' }} className="rs-thumb"/>
                      <div style={{position:'absolute',top:'50%',
                        transform:`translateX(-50%) translateY(-50%)`,
                        left:`${(sl.val/sl.max)*100}%`,
                        width:20,height:20,borderRadius:'50%',background:'#fff',
                        boxShadow:'0 2px 8px rgba(0,0,0,.25)',border:'2px solid rgba(0,0,0,.12)',
                        pointerEvents:'none'}}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick stats */}
            <div className="tool-grid-4" style={{gap:8,marginBottom:18}}>
              {[
                {l:'Hue',v:`${hsl.h}°`,c:'#ef4444'},
                {l:'Sat',v:`${hsl.s}%`,c:'#f97316'},
                {l:'Light',v:`${hsl.l}%`,c:'#eab308'},
                {l:'Alpha',v:'100%',c:'#22c55e'},
              ].map(s=>(
                <div key={s.l} style={{textAlign:'center',padding:'10px 6px',background:'#fafbff',
                  borderRadius:11,border:'1px solid rgba(0,0,0,.06)'}}>
                  <div style={{fontFamily:'Syne,sans-serif',fontSize:18,fontWeight:800,color:s.c}}>{s.v}</div>
                  <div style={{fontSize:9.5,color:'#bbb',fontWeight:700,textTransform:'uppercase',
                    letterSpacing:'.4px',marginTop:3}}>{s.l}</div>
                </div>
              ))}
            </div>

            {/* Presets */}
            <div style={{marginBottom:18}}>
              <div style={{fontSize:11,fontWeight:700,color:'#bbb',textTransform:'uppercase',
                letterSpacing:'.5px',marginBottom:10}}>Quick Presets</div>
              <div style={{display:'flex',flexWrap:'wrap',gap:7}}>
                {PRESETS.map(h=><Swatch key={h} hex={h} size={32} active={hex.toLowerCase()===h.toLowerCase()} onClick={applyHex}/>)}
              </div>
            </div>

            {/* Lightness ramp */}
            <div>
              <div style={{fontSize:11,fontWeight:700,color:'#bbb',textTransform:'uppercase',
                letterSpacing:'.5px',marginBottom:8}}>Lightness Scale</div>
              <div style={{display:'flex',gap:3,borderRadius:12,overflow:'hidden'}}>
                {shades.map(s=>(
                  <motion.div key={s.l} whileHover={{scaleY:1.15}} onClick={()=>applyHex(s.hex)}
                    title={s.hex}
                    style={{flex:1,height:44,background:s.hex,cursor:'pointer',
                      display:'flex',alignItems:'flex-end',justifyContent:'center',paddingBottom:4}}>
                    <span style={{fontSize:8.5,fontWeight:700,color:s.l>50?'rgba(0,0,0,.5)':'rgba(255,255,255,.8)'}}>{s.l}</span>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Saved palette */}
            {palette.length>0&&(
              <div style={{marginTop:18}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                  <div style={{fontSize:11,fontWeight:700,color:'#bbb',textTransform:'uppercase',letterSpacing:'.5px'}}>
                    Saved Palette ({palette.length}/16)
                  </div>
                  <button onClick={()=>cp(palette.join(', '),'pal')}
                    style={{padding:'4px 12px',borderRadius:8,border:'1.5px solid rgba(0,0,0,.1)',
                      background:'#fafafa',fontSize:11,fontWeight:700,cursor:'pointer',color:'#555'}}>
                    {copied&&lastCopy==='pal'?'✓':'📋'} Export
                  </button>
                </div>
                <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                  {palette.map((h,i)=>(
                    <div key={i} style={{position:'relative'}}>
                      <Swatch hex={h} size={36} onClick={applyHex}/>
                      <button onClick={()=>setPalette(p=>p.filter((_,j)=>j!==i))}
                        style={{position:'absolute',top:-6,right:-6,width:16,height:16,
                          borderRadius:'50%',background:'#ef4444',color:'#fff',border:'none',
                          fontSize:10,cursor:'pointer',display:'flex',alignItems:'center',
                          justifyContent:'center',fontWeight:700,padding:0}}>×</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* ── HARMONIES ── */}
        {tab==='Harmonies'&&(
          <motion.div key="harm" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <div className="tool-grid-2">
              {Object.entries(harmonies).map(([name,cols])=>(
                <div key={name} style={{background:'#fafbff',borderRadius:14,padding:14,
                  border:'1px solid rgba(0,0,0,.07)'}}>
                  <div style={{fontSize:11.5,fontWeight:700,color:'#555',
                    textTransform:'capitalize',marginBottom:10}}>
                    {name.replace(/([A-Z])/g,' $1').trim()}
                  </div>
                  <div style={{display:'flex',gap:5,marginBottom:10}}>
                    {cols.map((c,i)=>(
                      <motion.div key={i} whileHover={{scale:1.12,y:-3}}
                        onClick={()=>applyHex(c)} title={c}
                        style={{flex:1,height:40,borderRadius:9,background:c,cursor:'pointer',
                          border:'1.5px solid rgba(0,0,0,.1)',
                          boxShadow:'0 2px 6px rgba(0,0,0,.12)'}}/>
                    ))}
                  </div>
                  <div style={{display:'flex',gap:4,flexWrap:'wrap',marginBottom:8}}>
                    {cols.map((c,i)=>(
                      <span key={i} style={{fontSize:9.5,fontFamily:'monospace',color:'#888',
                        background:'rgba(0,0,0,.04)',padding:'1px 6px',borderRadius:4,cursor:'pointer'}}
                        onClick={()=>applyHex(c)}>{c.toUpperCase()}</span>
                    ))}
                  </div>
                  <button onClick={()=>setPalette(p=>[...new Set([...p,...cols])].slice(0,16))}
                    style={{fontSize:10.5,padding:'4px 10px',borderRadius:7,border:'1.5px solid rgba(79,142,247,.2)',
                      background:'rgba(79,142,247,.06)',color:'#4F8EF7',cursor:'pointer',fontWeight:700}}>
                    + Add all to palette
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── PALETTES (AI) ── */}
        {tab==='Palettes'&&(
          <motion.div key="pal" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            {/* CSS scale */}
            <div style={{marginBottom:22}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                <div style={{fontSize:12,fontWeight:700,color:'#888',textTransform:'uppercase',letterSpacing:'.5px'}}>
                  Lightness Scale — CSS Variables
                </div>
                <button onClick={()=>cp(shades.map((s,i)=>`--color-${(i+1)*100}: ${s.hex.toUpperCase()};`).join('\n'),'css')}
                  style={{padding:'4px 12px',borderRadius:8,border:'1.5px solid rgba(0,0,0,.1)',
                    background:'#fafafa',fontSize:11,fontWeight:700,cursor:'pointer',color:'#555'}}>
                  {copied&&lastCopy==='css'?'✓ Copied':'📋 Copy CSS'}
                </button>
              </div>
              <div style={{display:'flex',borderRadius:12,overflow:'hidden',boxShadow:'0 2px 10px rgba(0,0,0,.08)'}}>
                {shades.map((s,i)=>(
                  <motion.div key={i} whileHover={{flex:2}} onClick={()=>applyHex(s.hex)} title={s.hex}
                    style={{flex:1,height:60,background:s.hex,cursor:'pointer',
                      display:'flex',flexDirection:'column',alignItems:'center',
                      justifyContent:'flex-end',paddingBottom:5,transition:'flex .2s'}}>
                    <span style={{fontSize:8,fontWeight:700,color:s.l>50?'rgba(0,0,0,.5)':'rgba(255,255,255,.8)'}}>
                      {s.hex.toUpperCase()}
                    </span>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* AI palette generator */}
            <div style={{background:'linear-gradient(135deg,rgba(124,58,237,.06),rgba(79,142,247,.04))',
              border:'1px solid rgba(124,58,237,.2)',borderRadius:16,padding:'18px 18px 16px'}}>
              <div style={{fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:14,
                color:'#7c3aed',marginBottom:12}}>
                🤖 AI Palette Generator
              </div>
              <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}}>
                {['Calm & Professional','Vibrant & Energetic','Dark & Moody','Warm & Friendly','Tech & Modern'].map(mood=>(
                  <motion.button key={mood} whileHover={{scale:1.04}} whileTap={{scale:.96}}
                    onClick={()=>generateAIPalette(mood)} disabled={aiLoading}
                    style={{padding:'7px 14px',borderRadius:999,fontSize:11.5,fontWeight:700,
                      border:'1.5px solid rgba(124,58,237,.25)',
                      background:aiLoading?'#f5f5f8':'rgba(124,58,237,.07)',
                      color:aiLoading?'#ccc':'#7c3aed',cursor:aiLoading?'not-allowed':'pointer'}}>
                    {mood}
                  </motion.button>
                ))}
              </div>
              {aiLoading&&(
                <div style={{textAlign:'center',padding:'16px 0',color:'#7c3aed',fontSize:13,fontWeight:600}}>
                  🤖 Generating palettes…
                </div>
              )}
              {aiError&&(
                <div style={{color:'#ef4444',fontSize:12,padding:'8px 12px',background:'rgba(239,68,68,.06)',
                  borderRadius:9,border:'1px solid rgba(239,68,68,.2)'}}>
                  {aiError}
                </div>
              )}
              {aiPalettes.length>0&&(
                <div style={{display:'flex',flexDirection:'column',gap:12}}>
                  {aiPalettes.map((p,i)=>(
                    <motion.div key={i} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}}
                      transition={{delay:i*.08}}
                      style={{background:'#fff',borderRadius:12,padding:'12px 14px',
                        border:'1px solid rgba(0,0,0,.07)'}}>
                      <div style={{fontSize:12,fontWeight:700,color:'#333',marginBottom:9}}>{p.name}</div>
                      <div style={{display:'flex',gap:5,marginBottom:8}}>
                        {(p.colors||[]).map((c,j)=>(
                          <motion.div key={j} whileHover={{scale:1.12,y:-3}}
                            onClick={()=>applyHex(c)} title={c}
                            style={{flex:1,height:36,borderRadius:8,background:c,cursor:'pointer',
                              border:'1px solid rgba(0,0,0,.08)'}}/>
                        ))}
                      </div>
                      <button onClick={()=>setPalette(prev=>[...new Set([...prev,...(p.colors||[])])].slice(0,16))}
                        style={{fontSize:10.5,padding:'4px 10px',borderRadius:7,
                          border:'1.5px solid rgba(124,58,237,.2)',
                          background:'rgba(124,58,237,.06)',color:'#7c3aed',
                          cursor:'pointer',fontWeight:700}}>
                        + Add to palette
                      </button>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ── ACCESSIBILITY ── */}
        {tab==='Accessibility'&&(
          <motion.div key="a11y" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <div className="tool-grid-2" style={{marginBottom:20}}>
              {[
                {bg:'#ffffff',textC:hex,   label:'Your color on white',  ratio:contW, lum2:1},
                {bg:hex,      textC:'#fff',label:'White on your color',  ratio:contW, lum2:1},
                {bg:'#0d0d1a',textC:hex,   label:'Your color on black',  ratio:contB, lum2:0},
                {bg:hex,      textC:'#0d0d1a',label:'Black on your color',ratio:contB, lum2:0},
              ].map((c,i)=>{
                const wcag=wcagLevel(c.ratio)
                return(
                  <div key={i} style={{borderRadius:14,overflow:'hidden',border:'1px solid rgba(0,0,0,.08)'}}>
                    <div style={{background:c.bg,padding:'18px',textAlign:'center',minHeight:80,
                      display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
                      <div style={{color:c.textC,fontSize:24,fontWeight:900,fontFamily:'Syne,sans-serif'}}>Aa</div>
                      <div style={{color:c.textC,fontSize:12,opacity:.8,marginTop:3}}>Sample Text 16px</div>
                    </div>
                    <div style={{background:'#fafafa',padding:'10px 14px'}}>
                      <div style={{fontSize:10.5,color:'#999',marginBottom:3}}>{c.label}</div>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                        <span style={{fontSize:15,fontWeight:800,color:'#0d0d1a'}}>{c.ratio}:1</span>
                        <span style={{background:wcag.c+'18',color:wcag.c,
                          fontSize:11,fontWeight:800,padding:'3px 10px',
                          borderRadius:999,border:`1px solid ${wcag.c}30`}}>{wcag.l}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Simulation cards */}
            <div style={{background:'rgba(79,142,247,.05)',border:'1px solid rgba(79,142,247,.15)',
              borderRadius:13,padding:'14px 16px',marginBottom:18}}>
              <div style={{fontWeight:700,fontSize:13,color:'#4F8EF7',marginBottom:8}}>📖 WCAG 2.1 Requirements</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,fontSize:12,color:'#555',lineHeight:1.7}}>
                <div><strong>Normal text:</strong> AA=4.5:1 · AAA=7:1</div>
                <div><strong>Large text:</strong> AA=3:1 · AAA=4.5:1</div>
                <div><strong>UI components:</strong> AA=3:1</div>
                <div><strong>Your contrast (white):</strong> <span style={{color:wcagLevel(contW).c,fontWeight:700}}>{contW}:1</span></div>
              </div>
            </div>

            {/* ── ADVANCED ENHANCEMENT: AUTO-FIX CONTRAST & REBALANCER ── */}
            <div style={{
              background: '#fff', borderRadius: 16, border: '1px solid rgba(79,142,247,0.25)',
              padding: 18, marginBottom: 16, boxShadow: '0 4px 16px rgba(0,0,0,0.03)'
            }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 20 }}>⚡</span>
                  <div>
                    <h4 style={{ fontFamily: 'Syne, sans-serif', fontSize: 15, fontWeight: 800, margin: 0, color: '#111' }}>
                      Intelligent Contrast Auto-Fix & Rebalancer
                    </h4>
                    <span style={{ fontSize: 11.5, color: '#666' }}>
                      Minimally shifts luminance to satisfy WCAG while strictly preserving chromatic hue
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: '#888', fontWeight: 600 }}>Target:</span>
                  {['AA', 'AAA'].map(lvl => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setA11yTarget(lvl)}
                      style={{
                        padding: '4px 10px', borderRadius: 6, fontSize: 11.5, fontWeight: 700,
                        border: 'none', cursor: 'pointer',
                        background: a11yTarget === lvl ? 'var(--blue, #2563eb)' : 'rgba(0,0,0,0.05)',
                        color: a11yTarget === lvl ? '#fff' : '#666'
                      }}
                    >
                      {lvl} ({lvl === 'AA' ? '4.5:1' : '7.0:1'})
                    </button>
                  ))}
                </div>
              </div>

              {/* Background Surface Selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: '#555' }}>Background Context:</span>
                {[
                  { id: 'white', label: 'White (#ffffff)', hex: '#ffffff' },
                  { id: 'dark', label: 'Dark (#0d0d1a)', hex: '#0d0d1a' },
                  { id: 'cream', label: 'Soft Cream (#f8f9fa)', hex: '#f8f9fa' }
                ].map(bg => (
                  <button
                    key={bg.id}
                    type="button"
                    onClick={() => setA11yBg(bg.hex)}
                    style={{
                      padding: '4px 10px', borderRadius: 8, fontSize: 11.5, fontWeight: 600,
                      background: a11yBg === bg.hex ? 'rgba(79,142,247,0.12)' : '#f5f5f8',
                      border: `1.5px solid ${a11yBg === bg.hex ? '#4F8EF7' : 'rgba(0,0,0,0.06)'}`,
                      color: a11yBg === bg.hex ? '#4F8EF7' : '#555', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 6
                    }}
                  >
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: bg.hex, border: '1px solid rgba(0,0,0,0.2)' }} />
                    {bg.label}
                  </button>
                ))}
              </div>

              {/* Before vs After Comparison Matrix */}
              {autoFix && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))', gap: 14, marginBottom: 14 }}>
                  
                  {/* Original Card */}
                  <div style={{ padding: 14, borderRadius: 12, border: '1px solid rgba(0,0,0,0.08)', background: '#fafbff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase' }}>Current Color</span>
                      <span style={{
                        padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 800,
                        background: autoFix.alreadyPassed ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                        color: autoFix.alreadyPassed ? '#16a34a' : '#dc2626'
                      }}>
                        {autoFix.originalRatio}:1 · {autoFix.alreadyPassed ? 'Pass' : 'Fails Target'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: hex, border: '1px solid rgba(0,0,0,0.1)', flexShrink: 0 }} />
                      <div>
                        <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14, color: '#111' }}>{hex.toUpperCase()}</div>
                        <div style={{ fontSize: 11, color: '#777' }}>Original Foreground</div>
                      </div>
                    </div>

                    {/* Visual Preview on Selected Background */}
                    <div style={{ background: a11yBg, borderRadius: 8, padding: '10px 12px', border: '1px solid rgba(0,0,0,0.1)', textAlign: 'center' }}>
                      <div style={{ color: hex, fontWeight: 800, fontSize: 14, fontFamily: 'Syne, sans-serif' }}>
                        Sample Text Preview
                      </div>
                      <div style={{ color: hex, fontSize: 11, opacity: 0.9, marginTop: 2 }}>
                        Standard body typography 14px
                      </div>
                    </div>
                  </div>

                  {/* Auto-Adjusted Card */}
                  <div style={{ padding: 14, borderRadius: 12, border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.03)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', textTransform: 'uppercase' }}>Auto-Adjusted (WCAG Compliant)</span>
                      <span style={{
                        padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 800,
                        background: 'rgba(34,197,94,0.15)', color: '#16a34a'
                      }}>
                        {autoFix.adjustedRatio}:1 · {autoFix.wcag.l} Pass
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: autoFix.adjustedHex, border: '1px solid rgba(0,0,0,0.1)', flexShrink: 0 }} />
                      <div>
                        <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14, color: '#111' }}>{autoFix.adjustedHex.toUpperCase()}</div>
                        <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>Minimal Luminance Delta</div>
                      </div>
                    </div>

                    {/* Visual Preview on Selected Background */}
                    <div style={{ background: a11yBg, borderRadius: 8, padding: '10px 12px', border: '1px solid rgba(0,0,0,0.1)', textAlign: 'center' }}>
                      <div style={{ color: autoFix.adjustedHex, fontWeight: 800, fontSize: 14, fontFamily: 'Syne, sans-serif' }}>
                        Sample Text Preview
                      </div>
                      <div style={{ color: autoFix.adjustedHex, fontSize: 11, opacity: 0.9, marginTop: 2 }}>
                        Standard body typography 14px
                      </div>
                    </div>
                  </div>

                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => applyHex(autoFix.adjustedHex)}
                  disabled={autoFix.alreadyPassed}
                  className="btn btn-primary btn-sm"
                  style={{ fontWeight: 700, fontSize: 12, padding: '8px 16px', opacity: autoFix.alreadyPassed ? 0.6 : 1, cursor: autoFix.alreadyPassed ? 'default' : 'pointer' }}
                >
                  {autoFix.alreadyPassed ? '✓ Already Meets Target' : '⚡ Apply Adjusted Color to Picker'}
                </button>

                <button
                  type="button"
                  onClick={() => copyAutoFix(autoFix.adjustedHex)}
                  className="btn btn-outline btn-sm"
                  style={{ fontWeight: 700, fontSize: 12, padding: '8px 16px' }}
                >
                  {copiedAutoFix ? '✓ Copied Hex!' : '📋 Copy Adjusted Hex'}
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── EXPORT ── */}
        {tab==='Export'&&(
          <motion.div key="exp" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <div style={{display:'flex',gap:10,marginBottom:18,alignItems:'center'}}>
              <motion.div animate={{background:hex}}
                style={{width:48,height:48,borderRadius:13,flexShrink:0,boxShadow:'0 4px 14px rgba(0,0,0,.18)'}}/>
              <div>
                <div style={{fontFamily:'Syne,sans-serif',fontSize:18,fontWeight:800,color:'#0d0d1a'}}>
                  {hex.toUpperCase()}
                </div>
                <div style={{fontSize:11,color:'#aaa'}}>Click any row to copy format</div>
              </div>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {formats.map(f=>(
                <motion.div key={f.key} whileHover={{x:3}}
                  onClick={()=>cp(f.val,f.key)}
                  style={{display:'flex',alignItems:'center',gap:12,background:'#fafbff',
                    border:'1px solid rgba(0,0,0,.07)',borderRadius:12,padding:'11px 14px',
                    cursor:'pointer',transition:'all .15s'}}
                  onMouseEnter={e=>{e.currentTarget.style.background='#f0f4ff';e.currentTarget.style.borderColor='rgba(79,142,247,.2)'}}
                  onMouseLeave={e=>{e.currentTarget.style.background='#fafbff';e.currentTarget.style.borderColor='rgba(0,0,0,.07)'}}>
                  <div style={{width:24,height:24,borderRadius:7,background:hex,
                    border:'1px solid rgba(0,0,0,.1)',flexShrink:0}}/>
                  <span style={{minWidth:68,fontSize:10,fontWeight:800,color:'#bbb',
                    textTransform:'uppercase',letterSpacing:'.5px'}}>{f.label}</span>
                  <code style={{flex:1,fontFamily:'monospace',fontSize:12,color:'#2d2d3d',
                    overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.val}</code>
                  <span style={{fontSize:10.5,fontWeight:700,flexShrink:0,
                    color:copied&&lastCopy===f.key?'#22c55e':'#bbb'}}>
                    {copied&&lastCopy===f.key?'✓ Copied':'Copy'}
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}


        {/* ── AI INSIGHT ── */}
        {tab==='AI Insight'&&(
          <motion.div key="ai" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:18,
              padding:'14px 16px',borderRadius:14,
              background:'linear-gradient(135deg,rgba(124,58,237,.07),rgba(79,142,247,.05))',
              border:'1px solid rgba(124,58,237,.2)'}}>
              <div style={{width:48,height:48,borderRadius:12,background:hex,
                flexShrink:0,boxShadow:`0 4px 14px ${hex}55`}}/>
              <div>
                <div style={{fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:14,color:'#0d0d1a'}}>
                  {hex.toUpperCase()}
                </div>
                <div style={{fontSize:11.5,color:'#aaa',marginTop:2}}>
                  RGB({rgb.r},{rgb.g},{rgb.b}) · HSL({hsl.h}°,{hsl.s}%,{hsl.l}%)
                </div>
              </div>
              <button onClick={async()=>{
                setCtxLoad(true); setColorCtx(null); setCtxError('')
                try {
                  const data = await safeFetchJSON('/.netlify/functions/groq-ai',{
                    method:'POST',headers:{'Content-Type':'application/json'},
                    body:JSON.stringify({tool:'colorContext',payload:{hex,r:rgb.r,g:rgb.g,b:rgb.b,hsl:`${hsl.h},${hsl.s}%,${hsl.l}%`}})
                  }, 25000)
                  if (!mountedRef.current) return
                  if(data && data.context) setColorCtx(data.context)
                  else setCtxError(data?.error || 'Failed to analyze color. Try again.')
                } catch {
                  if (mountedRef.current) setCtxError('Network error. Check your connection.')
                } finally {
                  if (mountedRef.current) setCtxLoad(false)
                }
              }} disabled={ctxLoading}
                style={{marginLeft:'auto',padding:'9px 16px',borderRadius:10,border:'none',
                  background:ctxLoading?'#e5e7ef':'linear-gradient(135deg,#7c3aed,#4F8EF7)',
                  color:'#fff',fontWeight:700,fontSize:12.5,cursor:ctxLoading?'not-allowed':'pointer',
                  flexShrink:0}}>
                {ctxLoading?'Analyzing…':'🤖 Analyze Color'}
              </button>
            </div>

            {ctxError && (
              <div style={{color:'#ef4444',fontSize:12,padding:'8px 12px',
                background:'rgba(239,68,68,.06)',borderRadius:9,border:'1px solid rgba(239,68,68,.2)',marginBottom:12}}>{ctxError}</div>
            )}

            {colorCtx&&(
              <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}}
                style={{display:'flex',flexDirection:'column',gap:10}}>
                {colorCtx.name&&(
                  <div style={{textAlign:'center',padding:'16px',background:`${hex}15`,
                    borderRadius:13,border:`1px solid ${hex}30`}}>
                    <div style={{fontFamily:'Syne,sans-serif',fontSize:22,fontWeight:800,color:hex}}>
                      {colorCtx.name}
                    </div>
                    <div style={{fontSize:12,color:'#888',marginTop:4}}>{colorCtx.mood}</div>
                  </div>
                )}
                {[
                  {label:'🧠 Design Guidance & Common Associations',val:colorCtx.psychology},
                  {label:'🌿 Season',val:colorCtx.season},
                  {label:'🎨 Pairs Well With',val:colorCtx.complementPair},
                ].filter(x=>x.val).map(item=>(
                  <div key={item.label} style={{background:'#fafbff',borderRadius:11,
                    padding:'11px 14px',border:'1px solid rgba(0,0,0,.07)'}}>
                    <div style={{fontSize:10.5,fontWeight:700,color:'#aaa',
                      textTransform:'uppercase',letterSpacing:'.5px',marginBottom:5}}>{item.label}</div>
                    <div style={{fontSize:13,color:'#333',lineHeight:1.6}}>{item.val}</div>
                    {item.label.includes('Design Guidance') && (
                      <div style={{ marginTop: 8, padding: '6px 10px', background: 'rgba(0,0,0,0.02)', borderRadius: 6, fontSize: 10.5, color: '#888' }}>
                        💡 <em>Design Guidance Notice: Color associations reflect traditional graphic design conventions and branding heuristics, not objective psychological certainties.</em>
                      </div>
                    )}
                  </div>
                ))}
                {colorCtx.uses?.length>0&&(
                  <div style={{background:'#fafbff',borderRadius:11,padding:'11px 14px',
                    border:'1px solid rgba(0,0,0,.07)'}}>
                    <div style={{fontSize:10.5,fontWeight:700,color:'#aaa',
                      textTransform:'uppercase',letterSpacing:'.5px',marginBottom:8}}>Best Uses</div>
                    <div style={{display:'flex',flexDirection:'column',gap:5}}>
                      {colorCtx.uses.map((u,i)=>(
                        <div key={i} style={{display:'flex',alignItems:'center',gap:8,fontSize:12.5,color:'#444'}}>
                          <div style={{width:8,height:8,borderRadius:'50%',background:hex,flexShrink:0}}/>
                          {u}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {colorCtx.brands?.length>0&&(
                  <div style={{background:'#fafbff',borderRadius:11,padding:'11px 14px',
                    border:'1px solid rgba(0,0,0,.07)'}}>
                    <div style={{fontSize:10.5,fontWeight:700,color:'#aaa',
                      textTransform:'uppercase',letterSpacing:'.5px',marginBottom:6}}>Brands Using Similar Colors</div>
                    <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                      {colorCtx.brands.map((b,i)=>(
                        <span key={i} style={{fontSize:11.5,padding:'4px 11px',borderRadius:999,
                          background:`${hex}15`,color:hex,border:`1px solid ${hex}30`,fontWeight:600}}>
                          {b}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
            {!colorCtx&&!ctxLoading&&(
              <div style={{textAlign:'center',padding:'40px 20px',color:'#bbb',fontSize:13}}>
                Click "Analyze Color" to get AI insights about this color
              </div>
            )}
          </motion.div>
        )}

        {/* ── HISTORY ── */}
        {tab==='History'&&(
          <motion.div key="hist" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
              <div style={{fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:14,color:'#0d0d1a',display:'flex',alignItems:'center',gap:6}}>
                <Clock size={16} color="#4F8EF7" /> Color History ({persistedHistory.length})
              </div>
              {persistedHistory.length>0&&(
                <button onClick={clearToolHistory}
                  style={{padding:'4px 12px',borderRadius:8,border:'1.5px solid rgba(239,68,68,.2)',
                    background:'rgba(239,68,68,.05)',color:'#ef4444',fontSize:11,
                    fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',gap:4}}>
                  <Trash2 size={12} /> Clear
                </button>
              )}
            </div>
            {persistedHistory.length===0?(
              <div style={{textAlign:'center',padding:'40px 0',color:'#ccc',fontSize:13}}>
                Pick colors to build your history
              </div>
            ):(
              <div style={{display:'flex',flexWrap:'wrap',gap:12}}>
                {persistedHistory.map((h,i)=>{
                  const colorHex = h.metadata?.hex || (typeof h.value === 'string' && h.value.startsWith('#') ? h.value : hex)
                  return (
                    <motion.div key={h.id || i} initial={{opacity:0,y:6}} animate={{opacity:1,y:0}}
                      transition={{delay:i*.02}}
                      style={{display:'flex',flexDirection:'column',alignItems:'center',gap:5,position:'relative'}}>
                      <Swatch hex={colorHex} size={42} onClick={applyHex} active={hex===colorHex}/>
                      <span style={{fontSize:9,fontFamily:'monospace',color:'#888',fontWeight:600}}>{colorHex.toUpperCase()}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeHistoryEntry(h.id) }}
                        style={{position:'absolute',top:-4,right:-4,background:'#fff',border:'1px solid rgba(0,0,0,.15)',borderRadius:'50%',width:16,height:16,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',padding:0,color:'#888'}}
                        title="Remove"
                      >
                        <Trash2 size={9} />
                      </button>
                    </motion.div>
                  )
                })}
              </div>
            )}
          </motion.div>
        )}

        </AnimatePresence>
      </ToolCard>
    </ToolShell>
  )
}
