import React, { useState, useMemo, useCallback, useEffect } from 'react'
import ToolShell, { ToolCard } from '../../components/ToolShell'
import { useCopy } from '../../hooks'
import { TOOLS, UNIT_CATEGORIES } from '../../constants'
import { UnitExplainPanel } from '../../components/AIPanel'
import { addToHistory } from '../../utils/history'
import { useToolHistory } from '../../hooks/useToolHistory'
import { 
  Clock, Trash2, Ruler, Scale, Thermometer, FlaskConical, 
  Gauge, Maximize2, HardDrive, Zap, Compass, ArrowLeftRight, Check, Hash 
} from 'lucide-react'

const tool = TOOLS.find(t => t.id === 'units')

function convertTemp(value, from, to) {
  const v = parseFloat(value) || 0
  if (from === to) return v
  if (from==='°C'&&to==='°F') return v*9/5+32
  if (from==='°C'&&to==='K')  return v+273.15
  if (from==='°F'&&to==='°C') return (v-32)*5/9
  if (from==='°F'&&to==='K')  return (v-32)*5/9+273.15
  if (from==='K' &&to==='°C') return v-273.15
  if (from==='K' &&to==='°F') return (v-273.15)*9/5+32
  return v
}

function convert(value, cat, from, to) {
  if (cat==='Temperature') {
    const r = convertTemp(value, from, to)
    return r.toFixed(6).replace(/\.?0+$/,'') || '0'
  }
  const data = UNIT_CATEGORIES[cat]
  const fi = data.units.indexOf(from)
  const ti = data.units.indexOf(to)
  if (fi<0||ti<0) return '0'
  const result = (parseFloat(value)||0)*data.factors[fi]/data.factors[ti]
  if (!isFinite(result)) return '0'
  if (Math.abs(result)>1e10||Math.abs(result)<1e-6&&result!==0)
    return result.toExponential(4)
  return result.toFixed(8).replace(/\.?0+$/,'') || '0'
}

const CAT_ICONS = {
  Length: Ruler,
  Weight: Scale,
  Temperature: Thermometer,
  Volume: FlaskConical,
  Speed: Gauge,
  Area: Maximize2,
  Time: Clock,
  Data: HardDrive,
  Energy: Zap,
  Pressure: Compass,
}

export default function UnitConverter() {
  const [cat,   setCat]   = useState('Length')
  const [from,  setFrom]  = useState('m')
  const [to,    setTo]    = useState('ft')
  const [value, setValue] = useState('1')
  const [copied, copy]    = useCopy()
  const { history: persistedHistory, remove: removeHistoryEntry, clear: clearToolHistory } = useToolHistory('Unit Converter', 10)

  const result = useMemo(() => convert(value, cat, from, to), [value, cat, from, to])

  // All conversions from current value to every unit in category
  const allResults = useMemo(() => {
    const data = UNIT_CATEGORIES[cat]
    if (!data) return []
    if (cat==='Temperature') {
      return data.units.map(u => ({
        unit: u,
        value: u===from ? (parseFloat(value)||0)+'': convert(value, cat, from, u),
        active: u===from,
      }))
    }
    return data.units.map(u => ({
      unit: u,
      value: convert(value, cat, from, u),
      active: u===from,
    }))
  }, [value, cat, from])

  const handleCatChange = useCallback(c => {
    setCat(c)
    const first = UNIT_CATEGORIES[c].units[0]
    const second = UNIT_CATEGORIES[c].units[1]
    setFrom(first); setTo(second); setValue('1')
  }, [])

  const swap = useCallback(() => {
    setFrom(to); setTo(from); setValue(result)
  }, [from, to, result])

  /* Debounced History — prevents stale closure lag and keystroke spam */
  useEffect(() => {
    if (!value || isNaN(parseFloat(value)) || result === '—') return
    const timer = setTimeout(() => {
      addToHistory({
        tool: 'Unit Converter',
        label: `${cat}: ${value} ${from} → ${result} ${to}`,
        value: `${value} ${from} = ${result} ${to}`,
        action: 'Converted',
        category: 'Math',
        metadata: { cat, from, to, value, result }
      })
    }, 800)
    return () => clearTimeout(timer)
  }, [value, result, from, to, cat])

  const units = UNIT_CATEGORIES[cat].units

  return (
    <ToolShell tool={tool}>
      <ToolCard>

        {/* Category selector */}
        <div className="fgrp">
          <label className="lbl">Category</label>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6, padding:4, borderRadius:16, background:'rgba(0,0,0,.035)', border:'1px solid rgba(0,0,0,.03)' }}>
            {Object.keys(UNIT_CATEGORIES).map(c => {
              const Icon = CAT_ICONS[c] || Hash
              const isAct = cat === c
              return (
                <button key={c} onClick={() => handleCatChange(c)}
                  style={{ padding:'7px 14px', borderRadius:999, fontSize:12.5, fontWeight:700,
                    cursor:'pointer', transition:'all .18s cubic-bezier(.22,1,.36,1)', display:'inline-flex', alignItems:'center', gap:6,
                    border: isAct ? '1.5px solid #4F8EF7' : '1px solid transparent',
                    background: isAct ? '#ffffff' : 'transparent',
                    boxShadow: isAct ? '0 2px 8px rgba(15,23,42,0.08)' : 'none',
                    color: isAct ? '#4F8EF7' : '#666' }}>
                  <Icon size={14} style={{ color: isAct ? '#4F8EF7' : '#666', flexShrink: 0 }} />
                  {c}
                </button>
              )
            })}
          </div>
        </div>

        {/* From / value */}
        <div className="fgrp">
          <div style={{ display:'grid', gridTemplateColumns:'1fr auto 1fr', gap:8, alignItems:'end' }}>
            <div>
              <label className="lbl">From</label>
              <select className="inp sel" value={from} onChange={e=>setFrom(e.target.value)} style={{fontWeight:700}}>
                {units.map(u=><option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <button onClick={swap}
              title="Swap units"
              style={{ padding:'11px 14px', marginBottom:0, borderRadius:12, border:'1.5px solid rgba(79,142,247,.25)',
                background:'rgba(79,142,247,.06)', cursor:'pointer',
                display:'inline-flex', alignItems:'center', justifyContent:'center',
                alignSelf:'flex-end', transition:'all .2s cubic-bezier(.22,1,.36,1)' }}
              onMouseEnter={e=>{e.currentTarget.style.background='rgba(79,142,247,.15)';e.currentTarget.style.transform='rotate(180deg)'}}
              onMouseLeave={e=>{e.currentTarget.style.background='rgba(79,142,247,.06)';e.currentTarget.style.transform='none'}}>
              <ArrowLeftRight size={17} style={{ color: '#4F8EF7' }} />
            </button>
            <div>
              <label className="lbl">To</label>
              <select className="inp sel" value={to} onChange={e=>setTo(e.target.value)} style={{fontWeight:700}}>
                {units.map(u=><option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Input + Result */}
        <div className="tool-grid-2-compact" style={{ marginBottom:20 }}>
          <div>
            <label className="lbl">Value</label>
            <input className="inp" type="number" value={value}
              onChange={e => setValue(e.target.value)}
              placeholder="Enter value" inputMode="decimal"
              style={{ fontSize:20, fontWeight:800, color:'#4F8EF7', textAlign:'center' }}/>
            <div style={{ textAlign:'center', fontSize:11.5, color:'#71717a', marginTop:4 }}>{from}</div>
          </div>
          <div>
            <label className="lbl">Result</label>
            <div style={{ padding:'10px 14px', background:'linear-gradient(135deg,rgba(79,142,247,.07),rgba(156,111,222,.07))',
              borderRadius:12, border:'1.5px solid rgba(79,142,247,.2)', minHeight:44,
              display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer',
              transition:'box-shadow .2s' }}
              onClick={() => copy(result)}
              title="Click to copy"
              onMouseEnter={e=>e.currentTarget.style.boxShadow='0 4px 16px rgba(79,142,247,.2)'}
              onMouseLeave={e=>e.currentTarget.style.boxShadow='none'}>
              <span style={{ fontFamily:'Syne,sans-serif', fontSize:20, fontWeight:800,
                color:'#4F8EF7', wordBreak:'break-all', textAlign:'center' }}>{result}</span>
            </div>
            <div style={{ textAlign:'center', fontSize:11.5, color: copied?'#22c55e':'#71717a', marginTop:4, fontWeight:600, display:'flex', alignItems:'center', justifyContent:'center', gap:4 }}>
              {copied ? <Check size={12} /> : null}
              {copied ? 'Copied!' : `${to} — click to copy`}
            </div>
          </div>
        </div>

        {/* All conversions table */}
        <div className="fgrp">
          <label className="lbl">All Conversions from {value||'0'} {from}</label>
          <div style={{ border:'1px solid rgba(0,0,0,.08)', borderRadius:12, overflow:'hidden' }}>
            {allResults.map((r,i) => (
              <div key={r.unit}
                onClick={() => { setTo(r.unit); copy(r.value) }}
                style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                  padding:'10px 14px', cursor:'pointer', transition:'background .14s',
                  background:r.active?'rgba(79,142,247,.06)':i%2===0?'#fff':'#fafbff',
                  borderBottom: i<allResults.length-1?'1px solid rgba(0,0,0,.05)':'none',
                  borderLeft: r.active?'3px solid #4F8EF7':'3px solid transparent' }}>
                <span style={{ fontSize:13, fontWeight:700, color:r.active?'#4F8EF7':'#555' }}>{r.unit}</span>
                <span style={{ fontFamily:'monospace', fontSize:13, color:r.active?'#4F8EF7':'#333',
                  fontWeight:r.active?800:500 }}>{r.active?value:r.value}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize:12, color:'#71717a', marginTop:6, textAlign:'center' }}>
            Click any row to set it as target · Click result box to copy
          </div>
        </div>

        {/* History */}
        {persistedHistory.length > 0 && (
          <div style={{ paddingTop:16, borderTop:'1px solid rgba(0,0,0,.06)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <label className="lbl" style={{ margin:0, display:'flex', alignItems:'center', gap:6 }}>
                <Clock size={14} color="#4F8EF7" /> Recent Conversions
              </label>
              <button
                onClick={clearToolHistory}
                style={{ background:'none', border:'none', color:'#71717a', fontSize:11, cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}
              >
                <Trash2 size={12} /> Clear
              </button>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              {persistedHistory.slice(0,5).map((h,i) => {
                const meta = h.metadata || {}
                return (
                  <div key={h.id || i}
                    onClick={() => {
                      if (meta.cat && UNIT_CATEGORIES[meta.cat]) {
                        setCat(meta.cat)
                        setFrom(meta.from)
                        setTo(meta.to)
                        setValue(meta.value)
                      }
                    }}
                    style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px',
                      borderRadius:9, background:'#fafafa', border:'1px solid rgba(0,0,0,.07)',
                      cursor:'pointer', fontSize:12.5, color:'#555', transition:'background .14s' }}
                    onMouseEnter={e=>e.currentTarget.style.background='#f0f4ff'}
                    onMouseLeave={e=>e.currentTarget.style.background='#fafafa'}>
                    <span>{h.label || h.value}</span>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ color:'#71717a', fontSize:11 }}>{meta.cat || 'Math'}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeHistoryEntry(h.id) }}
                        style={{ background:'none', border:'none', color:'#999', cursor:'pointer', padding:2 }}
                        title="Remove"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </ToolCard>

      {/* AI Unit Explanation */}
      <UnitExplainPanel
        from={from} to={to} value={value}
        result={result} category={cat}
      />

    </ToolShell>
  )
}
