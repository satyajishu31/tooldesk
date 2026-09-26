import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import ToolShell, { ToolCard, Reveal } from '../../components/ToolShell'
import { TOOLS } from '../../constants'
import { safeFetchJSON } from '../../utils/safeFetch'
import SafeImage from '../../components/SafeImage'

const tool = TOOLS.find(t => t.id === 'countryfinder') || {
  id:'countryfinder', em:'🌍', title:'Country Finder', cat:'Utility',
  desc:'Explore 250+ countries.', path:'/tools/country-finder'
}

const FB = [
  {name:{common:'India',official:'Republic of India'},cca2:'IN',cca3:'IND',flags:{svg:'https://flagcdn.com/in.svg'},capital:['New Delhi'],region:'Asia',subregion:'Southern Asia',population:1408044253,area:3287590,currencies:{INR:{name:'Indian rupee',symbol:'₹'}},languages:{hin:'Hindi',eng:'English'},timezones:['UTC+05:30'],latlng:[20,77],idd:{root:'+91',suffixes:['']},tld:['.in'],car:{side:'left'},unMember:true,landlocked:false,borders:['BGD','BTN','MMR','CHN','NPL','PAK'],maps:{googleMaps:'https://maps.google.com/?q=India'}},
  {name:{common:'United States',official:'United States of America'},cca2:'US',cca3:'USA',flags:{svg:'https://flagcdn.com/us.svg'},capital:['Washington, D.C.'],region:'Americas',subregion:'North America',population:331893745,area:9372610,currencies:{USD:{name:'United States dollar',symbol:'$'}},languages:{eng:'English'},timezones:['UTC-05:00'],latlng:[38,-97],idd:{root:'+1',suffixes:['']},tld:['.us'],car:{side:'right'},unMember:true,landlocked:false,borders:['CAN','MEX'],maps:{googleMaps:'https://maps.google.com/?q=USA'}},
  {name:{common:'China',official:"People's Republic of China"},cca2:'CN',cca3:'CHN',flags:{svg:'https://flagcdn.com/cn.svg'},capital:['Beijing'],region:'Asia',subregion:'Eastern Asia',population:1412360000,area:9706961,currencies:{CNY:{name:'Chinese yuan',symbol:'¥'}},languages:{zho:'Chinese'},timezones:['UTC+08:00'],latlng:[35,105],idd:{root:'+86',suffixes:['']},tld:['.cn'],car:{side:'right'},unMember:true,landlocked:false,borders:['AFG','BTN','MMR','CHN','KAZ','PRK','KGZ','LAO','MNG','NPL','PAK','RUS','TJK','VNM'],maps:{googleMaps:'https://maps.google.com/?q=China'}},
  {name:{common:'United Kingdom',official:'United Kingdom of Great Britain and Northern Ireland'},cca2:'GB',cca3:'GBR',flags:{svg:'https://flagcdn.com/gb.svg'},capital:['London'],region:'Europe',subregion:'Northern Europe',population:67215293,area:242900,currencies:{GBP:{name:'British pound',symbol:'£'}},languages:{eng:'English'},timezones:['UTC+00:00'],latlng:[54,-2],idd:{root:'+44',suffixes:['']},tld:['.uk'],car:{side:'left'},unMember:true,landlocked:false,borders:['IRL'],maps:{googleMaps:'https://maps.google.com/?q=UK'}},
  {name:{common:'Japan',official:'Japan'},cca2:'JP',cca3:'JPN',flags:{svg:'https://flagcdn.com/jp.svg'},capital:['Tokyo'],region:'Asia',subregion:'Eastern Asia',population:125836021,area:377930,currencies:{JPY:{name:'Japanese yen',symbol:'¥'}},languages:{jpn:'Japanese'},timezones:['UTC+09:00'],latlng:[36,138],idd:{root:'+81',suffixes:['']},tld:['.jp'],car:{side:'left'},unMember:true,landlocked:false,borders:[],maps:{googleMaps:'https://maps.google.com/?q=Japan'}},
  {name:{common:'Germany',official:'Federal Republic of Germany'},cca2:'DE',cca3:'DEU',flags:{svg:'https://flagcdn.com/de.svg'},capital:['Berlin'],region:'Europe',subregion:'Western Europe',population:83240525,area:357114,currencies:{EUR:{name:'Euro',symbol:'€'}},languages:{deu:'German'},timezones:['UTC+01:00'],latlng:[51,9],idd:{root:'+49',suffixes:['']},tld:['.de'],car:{side:'right'},unMember:true,landlocked:false,borders:['AUT','BEL','CZE','DNK','FRA','LUX','NLD','POL','CHE'],maps:{googleMaps:'https://maps.google.com/?q=Germany'}},
  {name:{common:'France',official:'French Republic'},cca2:'FR',cca3:'FRA',flags:{svg:'https://flagcdn.com/fr.svg'},capital:['Paris'],region:'Europe',subregion:'Western Europe',population:67391582,area:551695,currencies:{EUR:{name:'Euro',symbol:'€'}},languages:{fra:'French'},timezones:['UTC+01:00'],latlng:[46,2],idd:{root:'+33',suffixes:['']},tld:['.fr'],car:{side:'right'},unMember:true,landlocked:false,borders:['AND','BEL','DEU','ITA','LUX','MCO','ESP','CHE'],maps:{googleMaps:'https://maps.google.com/?q=France'}},
  {name:{common:'Brazil',official:'Federative Republic of Brazil'},cca2:'BR',cca3:'BRA',flags:{svg:'https://flagcdn.com/br.svg'},capital:['Brasília'],region:'Americas',subregion:'South America',population:212559409,area:8515767,currencies:{BRL:{name:'Brazilian real',symbol:'R$'}},languages:{por:'Portuguese'},timezones:['UTC-03:00'],latlng:[-10,-55],idd:{root:'+55',suffixes:['']},tld:['.br'],car:{side:'right'},unMember:true,landlocked:false,borders:['ARG','BOL','COL','GUF','GUY','PRY','PER','SUR','URY','VEN'],maps:{googleMaps:'https://maps.google.com/?q=Brazil'}},
  {name:{common:'Australia',official:'Commonwealth of Australia'},cca2:'AU',cca3:'AUS',flags:{svg:'https://flagcdn.com/au.svg'},capital:['Canberra'],region:'Oceania',subregion:'Australia and New Zealand',population:25687041,area:7692024,currencies:{AUD:{name:'Australian dollar',symbol:'$'}},languages:{eng:'English'},timezones:['UTC+10:00'],latlng:[-27,133],idd:{root:'+61',suffixes:['']},tld:['.au'],car:{side:'left'},unMember:true,landlocked:false,borders:[],maps:{googleMaps:'https://maps.google.com/?q=Australia'}},
  {name:{common:'Canada',official:'Canada'},cca2:'CA',cca3:'CAN',flags:{svg:'https://flagcdn.com/ca.svg'},capital:['Ottawa'],region:'Americas',subregion:'North America',population:38005238,area:9984670,currencies:{CAD:{name:'Canadian dollar',symbol:'$'}},languages:{eng:'English',fra:'French'},timezones:['UTC-05:00'],latlng:[60,-95],idd:{root:'+1',suffixes:['']},tld:['.ca'],car:{side:'right'},unMember:true,landlocked:false,borders:['USA'],maps:{googleMaps:'https://maps.google.com/?q=Canada'}},
  {name:{common:'South Korea',official:'Republic of Korea'},cca2:'KR',cca3:'KOR',flags:{svg:'https://flagcdn.com/kr.svg'},capital:['Seoul'],region:'Asia',subregion:'Eastern Asia',population:51780579,area:100210,currencies:{KRW:{name:'South Korean won',symbol:'₩'}},languages:{kor:'Korean'},timezones:['UTC+09:00'],latlng:[37,127.5],idd:{root:'+82',suffixes:['']},tld:['.kr'],car:{side:'right'},unMember:true,landlocked:false,borders:['PRK'],maps:{googleMaps:'https://maps.google.com/?q=South+Korea'}},
  {name:{common:'Spain',official:'Kingdom of Spain'},cca2:'ES',cca3:'ESP',flags:{svg:'https://flagcdn.com/es.svg'},capital:['Madrid'],region:'Europe',subregion:'Southern Europe',population:47351567,area:505992,currencies:{EUR:{name:'Euro',symbol:'€'}},languages:{spa:'Spanish'},timezones:['UTC+01:00'],latlng:[40,-4],idd:{root:'+34',suffixes:['']},tld:['.es'],car:{side:'right'},unMember:true,landlocked:false,borders:['AND','FRA','GIB','PRT','MAR'],maps:{googleMaps:'https://maps.google.com/?q=Spain'}},
  {name:{common:'Italy',official:'Italian Republic'},cca2:'IT',cca3:'ITA',flags:{svg:'https://flagcdn.com/it.svg'},capital:['Rome'],region:'Europe',subregion:'Southern Europe',population:59554023,area:301338,currencies:{EUR:{name:'Euro',symbol:'€'}},languages:{ita:'Italian'},timezones:['UTC+01:00'],latlng:[42.8,12.8],idd:{root:'+39',suffixes:['']},tld:['.it'],car:{side:'right'},unMember:true,landlocked:false,borders:['AUT','FRA','SMR','SVN','CHE','VAT'],maps:{googleMaps:'https://maps.google.com/?q=Italy'}},
  {name:{common:'United Arab Emirates',official:'United Arab Emirates'},cca2:'AE',cca3:'ARE',flags:{svg:'https://flagcdn.com/ae.svg'},capital:['Abu Dhabi'],region:'Asia',subregion:'Western Asia',population:9890402,area:83600,currencies:{AED:{name:'UAE dirham',symbol:'د.إ'}},languages:{ara:'Arabic'},timezones:['UTC+04:00'],latlng:[24,54],idd:{root:'+971',suffixes:['']},tld:['.ae'],car:{side:'right'},unMember:true,landlocked:false,borders:['OMN','SAU'],maps:{googleMaps:'https://maps.google.com/?q=UAE'}},
  {name:{common:'Singapore',official:'Republic of Singapore'},cca2:'SG',cca3:'SGP',flags:{svg:'https://flagcdn.com/sg.svg'},capital:['Singapore'],region:'Asia',subregion:'South-Eastern Asia',population:5685807,area:710,currencies:{SGD:{name:'Singapore dollar',symbol:'$'}},languages:{eng:'English',zho:'Chinese',msa:'Malay',tam:'Tamil'},timezones:['UTC+08:00'],latlng:[1.35,103.8],idd:{root:'+65',suffixes:['']},tld:['.sg'],car:{side:'left'},unMember:true,landlocked:false,borders:[],maps:{googleMaps:'https://maps.google.com/?q=Singapore'}},
]


const fmt = n => n ? Number(n).toLocaleString() : '—'
const fmtArea = a => a ? `${Number(a).toLocaleString()} km²` : '—'
const REGIONS = ['All','Africa','Americas','Asia','Europe','Oceania']

function getLocalTime(tz) {
  try {
    if (!tz || typeof tz !== 'string') return '—'
    const trimmed = tz.trim()
    if (trimmed === 'UTC' || trimmed === 'UTC+00:00' || trimmed === 'UTC-00:00') {
      const now = new Date(), utc = now.getTime() + (now.getTimezoneOffset() * 60000)
      return new Date(utc).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})
    }
    const m = trimmed.match(/UTC([+-]\d{2}):?(\d{2})?/)
    if (!m) return '—'
    const h = parseInt(m[1]), mins = parseInt(m[2]||'0') * (h >= 0 ? 1 : -1)
    const now = new Date(), utc = now.getTime() + (now.getTimezoneOffset() * 60000)
    return new Date(utc + (3600000*h) + (60000*mins)).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})
  } catch { return '—' }
}

function fmtPop(n) {
  if (!n) return '—'
  if (n >= 1e9) return `${(n/1e9).toFixed(1)}B`
  if (n >= 1e6) return `${(n/1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n/1e3).toFixed(0)}K`
  return String(n)
}

// ── Country Card ──────────────────────────────────────────────────────
function CountryCard({ country, onClick }) {
  return (
    <motion.div
      whileHover={{ y:-5, boxShadow:'0 18px 44px rgba(79,142,247,.16)' }}
      whileTap={{ scale:0.97 }}
      transition={{ type:'spring', stiffness:360, damping:24 }}
      onClick={onClick}
      style={{
        borderRadius:18, overflow:'hidden', cursor:'pointer',
        border:'1.5px solid rgba(0,0,0,.07)', background:'#fff',
        boxShadow:'0 2px 10px rgba(0,0,0,.06)',
      }}>
      <div style={{ height:108, overflow:'hidden', position:'relative', flexShrink:0 }}>
        <SafeImage
          src={country.flags?.svg || country.flags?.png}
          alt={country.name?.common}
          style={{ width:'100%', height:'100%', objectFit:'cover' }}
        />
        <div style={{ position:'absolute', inset:0, background:'linear-gradient(to top, rgba(0,0,0,.42) 0%, transparent 55%)' }}/>
        <div style={{ position:'absolute', top:8, right:8, padding:'3px 8px', borderRadius:99, background:'rgba(0,0,0,.48)', color:'#fff', fontSize:9.5, fontWeight:700 }}>
          {country.region||'—'}
        </div>
      </div>
      <div style={{ padding:'12px 13px 13px' }}>
        <div style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:13.5, color:'#0d0d1a', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:3 }}>
          {country.name?.common}
        </div>
        <div style={{ fontSize:11, color:'#999', marginBottom:8 }}>
          🏛 {(country.capital||[]).join(', ')||'—'}
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, fontWeight:700 }}>
          <span style={{ color:'#4F8EF7' }}>👥 {fmtPop(country.population)}</span>
          <span style={{ color:'#9C6FDE', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:80, textAlign:'right' }}>
            {country.languages ? Object.values(country.languages).slice(0,1)[0] : '—'}
          </span>
        </div>
      </div>
    </motion.div>
  )
}

// ── Scoped Country Modal Styles ─────────────────────────────────────────
const COUNTRY_MODAL_STYLES = `
.country-modal-overlay {
  position: fixed !important;
  inset: 0 !important;
  z-index: 99999 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 16px 12px !important;
  background: rgba(15, 23, 42, 0.48) !important;
  backdrop-filter: blur(4px) !important;
  -webkit-backdrop-filter: blur(4px) !important;
  overflow: hidden !important;
}

.country-modal-card {
  width: 100% !important;
  max-width: 530px !important;
  max-height: min(calc(100dvh - 32px), 780px) !important;
  background: #ffffff !important;
  border-radius: 20px !important;
  box-shadow: 0 24px 60px -12px rgba(15, 23, 42, 0.28), 0 0 0 1px rgba(0, 0, 0, 0.08) !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
  border: 1px solid rgba(255, 255, 255, 0.6) !important;
}

.country-modal-header {
  background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 60%, #1e293b 100%) !important;
  padding: 16px 18px 18px !important;
  position: relative !important;
  flex-shrink: 0 !important;
}

.country-modal-body {
  flex: 1 !important;
  overflow-y: auto !important;
  overscroll-behavior: contain !important;
  -webkit-overflow-scrolling: touch !important;
  padding: 16px 18px 20px !important;
}

.country-modal-body::-webkit-scrollbar {
  width: 5px !important;
}
.country-modal-body::-webkit-scrollbar-track {
  background: transparent !important;
}
.country-modal-body::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15) !important;
  border-radius: 999px !important;
}

.country-stats-grid {
  display: grid !important;
  grid-template-columns: repeat(3, 1fr) !important;
  gap: 8px !important;
  margin-bottom: 12px !important;
}

.country-info-grid {
  display: grid !important;
  grid-template-columns: repeat(2, 1fr) !important;
  gap: 8px !important;
  margin-bottom: 12px !important;
}

.country-actions-row {
  display: flex !important;
  gap: 8px !important;
  flex-wrap: wrap !important;
  margin-top: 14px !important;
}

.country-action-btn {
  flex: 1 1 140px !important;
  padding: 11px 14px !important;
  min-height: 42px !important;
  border-radius: 12px !important;
  font-family: 'DM Sans', sans-serif !important;
  font-weight: 700 !important;
  font-size: 12.5px !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 6px !important;
  text-decoration: none !important;
  cursor: pointer !important;
  transition: all .15s ease !important;
  box-sizing: border-box !important;
}

@media (max-width: 440px) {
  .country-modal-overlay {
    padding: 12px 10px !important;
  }
  .country-modal-card {
    border-radius: 18px !important;
    max-height: calc(100dvh - 24px) !important;
  }
  .country-modal-header {
    padding: 14px 14px 16px !important;
  }
  .country-modal-body {
    padding: 14px 14px 18px !important;
  }
  .country-stats-grid {
    grid-template-columns: repeat(2, 1fr) !important;
  }
  .country-stat-card-3 {
    grid-column: span 2 !important;
  }
}

@media (max-width: 360px) {
  .country-modal-overlay {
    padding: 8px 6px !important;
  }
  .country-stats-grid {
    grid-template-columns: 1fr !important;
  }
  .country-stat-card-3 {
    grid-column: auto !important;
  }
  .country-info-grid {
    grid-template-columns: 1fr !important;
  }
  .country-action-btn {
    flex: 1 1 100% !important;
  }
}
`

// ── Country Detail Modal ──────────────────────────────────────────────
function CountryModal({ country, onClose, countries, totalWorldPop, regionPops }) {
  const density = (country.population && country.area) ? Math.round(country.population / country.area) : 0
  const worldShare = totalWorldPop ? ((country.population / totalWorldPop) * 100).toFixed(2) : '0.00'
  const regionShare = regionPops[country.region] ? ((country.population / regionPops[country.region]) * 100).toFixed(2) : '0.00'
  const currency = country.currencies ? Object.entries(country.currencies)[0] : null
  const capital = (country.capital||[]).join(', ') || '—'
  const langs = country.languages ? Object.values(country.languages).join(', ') : '—'
  const localTime = getLocalTime(country.timezones?.[0])
  const [copied, setCopied] = useState(false)

  const cca3Map = useMemo(() => {
    const m = {}
    countries.forEach(c => { if (c.cca3) m[c.cca3] = c.name?.common || c.cca3 })
    return m
  }, [countries])

  // Lock body scroll and listen for Escape key
  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', handleKeyDown)
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try { window.speechSynthesis.cancel() } catch {}
      }
    }
  }, [onClose])

  const modalContent = (
    <>
      <style>{COUNTRY_MODAL_STYLES}</style>
      <motion.div
        className="country-modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label={country.name?.common || "Country Details"}
      >
        <motion.div
          className="country-modal-card"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.18, ease: [.22, 1, .36, 1] }}
          onClick={e => e.stopPropagation()}
        >
          {/* ── Fixed Header ── */}
          <div className="country-modal-header">
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              {/* Flag */}
              <div
                style={{
                  width: 58,
                  height: 38,
                  borderRadius: 8,
                  overflow: 'hidden',
                  border: '1.5px solid rgba(255,255,255,0.22)',
                  flexShrink: 0,
                  boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
                  background: 'rgba(255,255,255,0.06)',
                  marginTop: 2
                }}
              >
                <SafeImage
                  src={country.flags?.svg || country.flags?.png}
                  alt={country.name?.common}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              </div>

              {/* Country Name & Subtitle */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2
                  style={{
                    fontFamily: 'Syne, sans-serif',
                    fontWeight: 800,
                    fontSize: 'clamp(16px, 4.4vw, 20px)',
                    color: '#ffffff',
                    margin: 0,
                    lineHeight: 1.18,
                    wordBreak: 'break-word'
                  }}
                >
                  {country.name?.common}
                </h2>
                <div
                  style={{
                    fontSize: 11,
                    color: 'rgba(255,255,255,0.6)',
                    marginTop: 3,
                    lineHeight: 1.3,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden'
                  }}
                >
                  {country.name?.official || country.name?.common}
                </div>
              </div>

              {/* Header Action Buttons (Pronounce & Close) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <button
                  type="button"
                  title="Pronounce country name"
                  aria-label="Pronounce country name"
                  onClick={() => {
                    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                      try {
                        window.speechSynthesis.cancel()
                        const u = new SpeechSynthesisUtterance(`${country.name?.common}. Capital: ${capital}`)
                        u.rate = 0.9
                        window.speechSynthesis.speak(u)
                      } catch {}
                    }
                  }}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    border: '1px solid rgba(255,255,255,0.18)',
                    background: 'rgba(255,255,255,0.08)',
                    color: '#fff',
                    fontSize: 13,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    touchAction: 'manipulation'
                  }}
                >
                  🔊
                </button>
                <button
                  type="button"
                  title="Close dialog"
                  aria-label="Close dialog"
                  onClick={onClose}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    border: '1px solid rgba(255,255,255,0.22)',
                    background: 'rgba(255,255,255,0.12)',
                    color: '#ffffff',
                    fontSize: 14,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    touchAction: 'manipulation'
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Badges */}
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              {[
                country.region && { label: country.region, color: '#A78BFA' },
                country.subregion && { label: country.subregion, color: '#60A5FA' },
                country.unMember && { label: 'UN Member', color: '#4ADE80' },
              ].filter(Boolean).map((b, i) => (
                <span
                  key={i}
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: b.color,
                    background: 'rgba(255,255,255,0.10)',
                    padding: '2px 8px',
                    borderRadius: 999,
                    border: '1px solid rgba(255,255,255,0.15)',
                    lineHeight: 1.4
                  }}
                >
                  {b.label}
                </span>
              ))}
            </div>
          </div>

          {/* ── Scrollable Body ── */}
          <div className="country-modal-body">
            {/* Statistics Cards */}
            <div className="country-stats-grid">
              <div
                style={{
                  padding: '9px 10px',
                  background: 'rgba(79,142,247,.06)',
                  borderRadius: 12,
                  border: '1.5px solid rgba(79,142,247,.16)',
                  textAlign: 'center',
                  minWidth: 0
                }}
              >
                <div style={{ fontSize: 9, color: '#3B82F6', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 3 }}>
                  POPULATION
                </div>
                <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 13.5, color: '#0d0d1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {fmt(country.population)}
                </div>
                <div style={{ fontSize: 10, color: '#64748B', fontWeight: 600, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {worldShare}% of World
                </div>
              </div>

              <div
                style={{
                  padding: '9px 10px',
                  background: 'rgba(156,111,222,.06)',
                  borderRadius: 12,
                  border: '1.5px solid rgba(156,111,222,.16)',
                  textAlign: 'center',
                  minWidth: 0
                }}
              >
                <div style={{ fontSize: 9, color: '#8B5CF6', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 3 }}>
                  AREA
                </div>
                <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 13.5, color: '#0d0d1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {fmtArea(country.area)}
                </div>
                <div style={{ fontSize: 10, color: '#64748B', fontWeight: 600, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {density} per km²
                </div>
              </div>

              <div
                className="country-stat-card-3"
                style={{
                  padding: '9px 10px',
                  background: 'rgba(34,197,94,.06)',
                  borderRadius: 12,
                  border: '1.5px solid rgba(34,197,94,.16)',
                  textAlign: 'center',
                  minWidth: 0
                }}
              >
                <div style={{ fontSize: 9, color: '#10B981', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 3 }}>
                  CAPITAL
                </div>
                <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 13.5, color: '#0d0d1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {capital}
                </div>
                <div style={{ fontSize: 10, color: '#64748B', fontWeight: 600, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  🕒 {localTime}
                </div>
              </div>
            </div>

            {/* Population Share Meter Card */}
            <div
              style={{
                background: '#f8fafc',
                padding: '11px 13px',
                borderRadius: 14,
                border: '1px solid rgba(0,0,0,0.06)',
                marginBottom: 12
              }}
            >
              {[
                { label: 'World Population Share', pct: Math.min(100, Math.max(0.5, parseFloat(worldShare) * 5)), c: '#3B82F6', c2: '#8B5CF6', val: `${worldShare}%` },
                { label: `${country.region} Region Share`, pct: Math.min(100, Math.max(0.5, parseFloat(regionShare))), c: '#8B5CF6', c2: '#10B981', val: `${regionShare}%` },
              ].map((b, i) => (
                <div key={b.label} style={{ marginBottom: i === 0 ? 10 : 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                    <span>{b.label}</span>
                    <span style={{ color: b.c, fontWeight: 800 }}>{b.val}</span>
                  </div>
                  <div style={{ height: 6, background: 'rgba(0,0,0,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${b.pct}%`,
                        background: `linear-gradient(90deg, ${b.c}, ${b.c2})`,
                        borderRadius: 3,
                        transition: 'width 0.4s ease'
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Information Grid */}
            <div className="country-info-grid">
              {[
                { label: 'Currency', val: currency ? `${currency[1].name} (${currency[1].symbol || currency[0]})` : '—', icon: '💰' },
                { label: 'Languages', val: langs, icon: '🗣' },
                { label: 'Calling Code', val: `${country.idd?.root || ''}${country.idd?.suffixes?.[0] || ''}` || '—', icon: '📞' },
                { label: 'Drive & UN', val: `${country.car?.side?.toUpperCase() || '—'} · UN ${country.unMember ? '✅' : '❌'}`, icon: '🚗' },
                { label: 'Timezone', val: (country.timezones || []).slice(0, 1).join('') || '—', icon: '⏰' },
                { label: 'Domain', val: (country.tld || []).slice(0, 1).join('') || '—', icon: '🌐' },
              ].map((d) => (
                <div
                  key={d.label}
                  style={{
                    padding: '9px 11px',
                    background: '#ffffff',
                    borderRadius: 12,
                    border: '1px solid rgba(0,0,0,0.06)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                    minWidth: 0
                  }}
                >
                  <div style={{ fontSize: 9.5, color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3, letterSpacing: '.3px' }}>
                    {d.icon} {d.label}
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1E293B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={typeof d.val === 'string' ? d.val : undefined}>
                    {d.val}
                  </div>
                </div>
              ))}
            </div>

            {/* Bordering Countries */}
            {country.borders?.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>
                  🗺 Borders ({country.borders.length})
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {country.borders.map(code => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => {
                        const n = countries.find(c => c.cca3 === code)
                        if (n) onClose(n)
                      }}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 8,
                        border: '1px solid rgba(79,142,247,.22)',
                        background: 'rgba(79,142,247,.08)',
                        color: '#2563EB',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                        touchAction: 'manipulation',
                        transition: 'background .15s, transform .15s'
                      }}
                    >
                      {cca3Map[code] || code}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="country-actions-row">
              <a
                href={country.maps?.googleMaps || `https://maps.google.com/?q=${encodeURIComponent(country.name?.common || '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="country-action-btn"
                style={{
                  background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
                  color: '#ffffff',
                  boxShadow: '0 2px 8px rgba(15, 23, 42, 0.2)'
                }}
              >
                🗺 Open Maps
              </a>
              <button
                type="button"
                onClick={() => {
                  const t = `${country.name?.common}\nCapital: ${capital}\nPopulation: ${fmt(country.population)}\nArea: ${fmtArea(country.area)}\nCurrency: ${currency ? `${currency[1].name} (${currency[1].symbol})` : '—'}\nLanguages: ${langs}\nTimezone: ${(country.timezones || []).slice(0, 1).join('')}`
                  if (navigator.clipboard?.writeText) {
                    navigator.clipboard.writeText(t)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  }
                }}
                className="country-action-btn"
                style={{
                  background: copied ? 'rgba(34, 197, 94, 0.10)' : '#f8fafc',
                  color: copied ? '#16A34A' : '#2563EB',
                  border: `1.5px solid ${copied ? 'rgba(34, 197, 94, 0.3)' : 'rgba(79,142,247,.20)'}`,
                }}
              >
                {copied ? 'Copied! ✅' : '📋 Copy Info'}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </>
  )

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body)
  }
  return modalContent
}

// ── AI Chat Panel ─────────────────────────────────────────────────────
function AIChatPanel({ countries }) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [searchStatus, setSearchStatus] = useState('') // 'searching' | 'done' | ''
  const [aiCountry, setAiCountry] = useState('')
  const [msgs, setMsgs] = useState([
    { role:'assistant', text:'👋 Ask me anything about any country — I search the web for current data (past 30 days) so my answers are always fresh and accurate!', sources:[] }
  ])
  const [expandedSources, setExpandedSources] = useState({})
  const endRef = useRef(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior:'smooth' }) }, [msgs, loading])

  const send = useCallback(async (custom) => {
    const text = (custom || input).trim()
    if (!text || loading) return
    setMsgs(p => [...p, { role:'user', text, sources:[] }])
    if (!custom) setInput('')
    setLoading(true)
    setSearchStatus('searching')

    // Build a focused search query
    const searchQuery = aiCountry
      ? `${text} ${aiCountry} ${new Date().getFullYear()}`
      : `${text} ${new Date().getFullYear()}`

    const sys = aiCountry
      ? `You are a world geography and current events expert. The user is asking about "${aiCountry}". Use any provided web search results to give accurate, current answers. Cite sources as [1], [2] where relevant. Use emojis and bullet points. Max 250 words.`
      : `You are a world geography and current events expert. Answer about ANY country or geography topic asked — do NOT default to any specific country. Use any provided web search results for accuracy. Cite sources as [1], [2] where relevant. Use emojis and bullet points. Max 250 words.`

    try {
      setSearchStatus('searching')
      const res = await safeFetchJSON('/.netlify/functions/groq-ai', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          tool:'countryAssistant',
          payload:{ prompt:text, systemPrompt:sys, searchQuery, useSearch:true }
        })
      }, 35000)
      setSearchStatus('done')
      const ans = res?.result || res?.response || '⚠️ Could not get a response. Please try again.'
      const sources = res?.sources || []
      setMsgs(p => [...p, { role:'assistant', text:ans, sources }])
    } catch {
      setSearchStatus('')
      setMsgs(p => [...p, { role:'assistant', text:'⚠️ Connection failed. Please try again.', sources:[] }])
    }
    setLoading(false)
    setTimeout(() => setSearchStatus(''), 2000)
  }, [input, aiCountry, loading])

  const QUICK = ['Latest news?','Economic outlook?','Tourism highlights?','Population growth?','Currency & exchange?']

  return (
    <ToolCard>
      {/* header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4, flexWrap:'wrap', gap:8 }}>
        <div style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:16, color:'#0d0d1a' }}>🤖 AI Country Assistant</div>
        <div style={{ display:'flex', alignItems:'center', gap:6, padding:'4px 10px', borderRadius:20, background:'rgba(34,197,94,.08)', border:'1px solid rgba(34,197,94,.2)' }}>
          <div style={{ width:6, height:6, borderRadius:'50%', background:'#22c55e', animation:'aiPulse 2s ease-in-out infinite' }}/>
          <span style={{ fontSize:10.5, fontWeight:700, color:'#16a34a' }}>
            {searchStatus==='searching' ? '🔍 Searching web…' : searchStatus==='done' ? '✅ Web data fetched' : 'Live web search ON'}
          </span>
        </div>
      </div>
      <p style={{ fontSize:11.5, color:'#888', margin:'0 0 14px', lineHeight:1.5 }}>
        Powered by real-time web search — answers reflect data from the past 30 days
      </p>
      <style>{`@keyframes aiPulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>

      {/* country context */}
      <div style={{ marginBottom:12 }}>
        <label style={{ fontSize:10.5, fontWeight:700, color:'#888', textTransform:'uppercase', letterSpacing:'.4px', display:'block', marginBottom:5 }}>
          Focus country (optional)
        </label>
        <select value={aiCountry} onChange={e => setAiCountry(e.target.value)}
          style={{ width:'100%', padding:'9px 12px', borderRadius:12, border:'1.5px solid rgba(79,142,247,.25)', fontFamily:'DM Sans,sans-serif', fontSize:13, color:'#333', background:'#fafbff', outline:'none', cursor:'pointer' }}>
          <option value="">🌍 Any country (free question)</option>
          {countries.map(c => <option key={c.cca3} value={c.name?.common}>{c.name?.common}</option>)}
        </select>
      </div>

      {/* chat messages */}
      <div style={{ height:320, overflowY:'auto', display:'flex', flexDirection:'column', gap:10, marginBottom:10, padding:'2px 0', WebkitOverflowScrolling:'touch' }}>
        {msgs.map((m,i) => (
          <div key={i}>
            <motion.div
              initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }}
              transition={{ duration:0.22 }}
              style={{
                alignSelf: m.role==='user' ? 'flex-end' : 'flex-start',
                maxWidth:'88%',
                marginLeft: m.role==='user' ? 'auto' : 0,
                padding:'10px 13px',
                borderRadius: m.role==='user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                background: m.role==='user' ? 'linear-gradient(135deg,#4F8EF7,#9C6FDE)' : '#f5f7ff',
                color: m.role==='user' ? '#fff' : '#1a1a2e',
                fontSize:13, lineHeight:1.65, fontFamily:'DM Sans,sans-serif',
                border: m.role==='assistant' ? '1px solid rgba(79,142,247,.12)' : 'none',
                whiteSpace:'pre-wrap', wordBreak:'break-word',
              }}>
              {m.text}
            </motion.div>
            {/* sources */}
            {m.role==='assistant' && m.sources?.length > 0 && (
              <div style={{ marginTop:5, marginLeft:4 }}>
                <button
                  onClick={() => setExpandedSources(p => ({ ...p, [i]:!p[i] }))}
                  style={{ fontSize:10.5, fontWeight:700, color:'#4F8EF7', background:'none', border:'none', cursor:'pointer', padding:'2px 0', display:'flex', alignItems:'center', gap:4 }}>
                  {expandedSources[i] ? '▾' : '▸'} {m.sources.length} web source{m.sources.length>1?'s':''}
                </button>
                <AnimatePresence>
                  {expandedSources[i] && (
                    <motion.div
                      initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:'auto' }} exit={{ opacity:0, height:0 }}
                      transition={{ duration:0.2 }}
                      style={{ overflow:'hidden' }}>
                      <div style={{ display:'flex', flexDirection:'column', gap:5, marginTop:5 }}>
                        {m.sources.map((s,si) => {
                          const safeUrl = typeof s?.url === 'string' && /^https?:\/\//i.test(s.url.trim()) ? s.url.trim() : '#'
                          return (
                            <a key={si} href={safeUrl} target="_blank" rel="noopener noreferrer"
                              style={{ display:'block', padding:'7px 10px', borderRadius:10, background:'rgba(79,142,247,.06)', border:'1px solid rgba(79,142,247,.14)', textDecoration:'none' }}>
                              <div style={{ fontSize:11, fontWeight:700, color:'#4F8EF7', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>[{si+1}] {s.title}</div>
                              {s.snippet && <div style={{ fontSize:10.5, color:'#777', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>{s.snippet}</div>}
                              {s.date && <div style={{ fontSize:9.5, color:'#aaa', marginTop:2 }}>📅 {s.date}</div>}
                            </a>
                          )
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        ))}
        {loading && (
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }}
            style={{ padding:'10px 14px', borderRadius:'16px 16px 16px 4px', background:'#f5f7ff', border:'1px solid rgba(79,142,247,.12)', display:'flex', gap:5, alignItems:'center', alignSelf:'flex-start' }}>
            <div style={{ fontSize:10.5, color:'#4F8EF7', fontWeight:600, marginRight:4 }}>
              {searchStatus==='searching' ? '🔍 Searching web…' : '🤖 Thinking…'}
            </div>
            {[0,1,2].map(i => (
              <motion.div key={i} style={{ width:5, height:5, borderRadius:'50%', background:'#4F8EF7' }}
                animate={{ y:[0,-5,0] }} transition={{ duration:0.6, repeat:Infinity, delay:i*0.15 }}/>
            ))}
          </motion.div>
        )}
        <div ref={endRef}/>
      </div>

      {/* quick prompts */}
      {aiCountry && (
        <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:10 }}>
          {QUICK.map(q => (
            <button key={q} onClick={() => send(q)} disabled={loading}
              style={{ padding:'4px 10px', borderRadius:20, border:'1px solid rgba(79,142,247,.22)', background:'rgba(79,142,247,.07)', color:'#4F8EF7', fontSize:11, fontWeight:600, cursor:loading?'not-allowed':'pointer', opacity:loading?0.5:1 }}>
              {q}
            </button>
          ))}
        </div>
      )}

      {/* input row */}
      <div style={{ display:'flex', gap:8 }}>
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key==='Enter' && !e.shiftKey && send()}
          placeholder={aiCountry ? `Ask about ${aiCountry}…` : 'Ask anything about any country…'}
          disabled={loading}
          style={{ flex:1, minWidth:0, padding:'10px 14px', borderRadius:12, border:'1.5px solid rgba(79,142,247,.25)', fontFamily:'DM Sans,sans-serif', fontSize:13, outline:'none', background:'#fafbff', opacity:loading?0.7:1 }}/>
        <motion.button onClick={() => send()}
          whileHover={{ scale:1.04 }} whileTap={{ scale:0.94 }}
          disabled={!input.trim() || loading}
          style={{ padding:'10px 16px', borderRadius:12, border:'none', background:input.trim()&&!loading?'linear-gradient(135deg,#4F8EF7,#9C6FDE)':'#e5e7ef', color:input.trim()&&!loading?'#fff':'#aaa', fontWeight:700, fontSize:13, cursor:input.trim()&&!loading?'pointer':'not-allowed', flexShrink:0, minWidth:60, textAlign:'center' }}>
          {loading ? '…' : '↑ Send'}
        </motion.button>
      </div>
    </ToolCard>
  )
}

// ── Compare Panel ─────────────────────────────────────────────────────
function ComparePanel({ countries }) {
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const ca = countries.find(c => c.cca3 === a)
  const cb = countries.find(c => c.cca3 === b)

  const metrics = ca && cb ? [
    { label:'Population', va:ca.population||0, vb:cb.population||0, fmt:v=>fmtPop(v) },
    { label:'Area (km²)', va:ca.area||0, vb:cb.area||0, fmt:v=>fmt(v) },
    { label:'Density', va:ca.population&&ca.area?Math.round(ca.population/ca.area):0, vb:cb.population&&cb.area?Math.round(cb.population/cb.area):0, fmt:v=>`${fmt(v)}/km²` },
  ] : []

  return (
    <ToolCard>
      <div style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:16, color:'#0d0d1a', marginBottom:14 }}>⚔️ Side-by-Side Compare</div>
      <div className="tool-grid-2-compact" style={{ marginBottom:16 }}>
        {[{val:a,set:setA,label:'Country A'},{val:b,set:setB,label:'Country B'}].map((s,i) => (
          <div key={i}>
            <label style={{ fontSize:11, fontWeight:700, color:'#888', textTransform:'uppercase', display:'block', marginBottom:6 }}>{s.label}</label>
            <select value={s.val} onChange={e => s.set(e.target.value)}
              style={{ width:'100%', padding:'9px 12px', borderRadius:12, border:'1.5px solid rgba(0,0,0,.1)', fontFamily:'DM Sans,sans-serif', fontSize:13, outline:'none', background:'#fafbff', cursor:'pointer' }}>
              <option value="">Select…</option>
              {countries.map(c => <option key={c.cca3} value={c.cca3}>{c.name?.common}</option>)}
            </select>
          </div>
        ))}
      </div>

      {ca && cb ? (
        <>
          <div className="tool-grid-2-compact" style={{ marginBottom:14 }}>
            {[ca,cb].map((c,i) => (
              <motion.div key={i} initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ delay:i*0.1 }}
                style={{ borderRadius:16, overflow:'hidden', border:'1.5px solid rgba(0,0,0,.08)', boxShadow:'0 4px 14px rgba(0,0,0,.07)' }}>
                <div style={{ height:72, overflow:'hidden' }}>
                  <SafeImage src={c.flags?.svg} alt={c.name?.common} style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                </div>
                <div style={{ padding:'10px 12px' }}>
                  <div style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:14, color:'#0d0d1a' }}>{c.name?.common}</div>
                  <div style={{ fontSize:11, color:'#888', marginTop:2 }}>{(c.capital||[]).join(', ')||'—'}</div>
                </div>
              </motion.div>
            ))}
          </div>

          {metrics.map((m,i) => {
            const total = (m.va||0) + (m.vb||0)
            const pctA = total ? Math.round((m.va/total)*100) : 50
            const winner = m.va >= m.vb ? 0 : 1
            return (
              <motion.div key={m.label} initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.12+i*0.08 }}
                style={{ marginBottom:10, padding:'12px 14px', background:'#fafbff', borderRadius:14, border:'1px solid rgba(0,0,0,.06)' }}>
                <div style={{ fontSize:10, fontWeight:700, color:'#888', textTransform:'uppercase', marginBottom:8, letterSpacing:'.3px' }}>{m.label}</div>
                <div style={{ display:'flex', gap:6, alignItems:'center', marginBottom:6 }}>
                  <span style={{ fontSize:12, fontWeight:700, color:winner===0?'#22c55e':'#aaa', flex:1, textAlign:'right' }}>{m.fmt(m.va)}{winner===0?' 🏆':''}</span>
                  <span style={{ fontSize:9, color:'#ddd', flexShrink:0 }}>VS</span>
                  <span style={{ fontSize:12, fontWeight:700, color:winner===1?'#22c55e':'#aaa', flex:1 }}>{winner===1?'🏆 ':''}{m.fmt(m.vb)}</span>
                </div>
                <div style={{ display:'flex', height:7, borderRadius:4, overflow:'hidden' }}>
                  <motion.div initial={{ width:0 }} animate={{ width:`${pctA}%` }} transition={{ delay:0.28+i*0.1, duration:0.6, ease:'easeOut' }}
                    style={{ background:'linear-gradient(90deg,#4F8EF7,#9C6FDE)', borderRadius:'4px 0 0 4px' }}/>
                  <motion.div initial={{ width:0 }} animate={{ width:`${100-pctA}%` }} transition={{ delay:0.28+i*0.1, duration:0.6, ease:'easeOut' }}
                    style={{ background:'linear-gradient(90deg,#f97316,#ef4444)', borderRadius:'0 4px 4px 0' }}/>
                </div>
              </motion.div>
            )
          })}
        </>
      ) : (
        <div style={{ textAlign:'center', padding:'32px 0', color:'#ccc', fontSize:13 }}>Select two countries to compare</div>
      )}
    </ToolCard>
  )
}

// ── Leaderboards Panel ────────────────────────────────────────────────
function LeaderboardsPanel({ countries }) {
  const [tab, setTab] = useState('pop')

  const sorted = useMemo(() => {
    const arr = [...countries].filter(c => c.name?.common)
    if (tab === 'pop') return arr.sort((a,b) => (b.population||0)-(a.population||0)).slice(0,10)
    if (tab === 'area') return arr.sort((a,b) => (b.area||0)-(a.area||0)).slice(0,10)
    return arr.filter(c=>c.population&&c.area).sort((a,b) => (b.population/b.area)-(a.population/a.area)).slice(0,10)
  }, [countries, tab])

  const getVal = c => tab==='pop' ? (c.population||0) : tab==='area' ? (c.area||0) : ((c.population && c.area > 0) ? Math.round(c.population / c.area) : 0)
  const fmtVal = v => tab==='pop' ? fmtPop(v) : tab==='area' ? `${fmt(v)} km²` : `${fmt(v)}/km²`
  const maxVal = sorted.length ? getVal(sorted[0]) : 1

  return (
    <ToolCard>
      <div style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:16, color:'#0d0d1a', marginBottom:14 }}>🏆 World Rankings</div>
      <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap' }}>
        {[{id:'pop',label:'👥 Population'},{id:'area',label:'🗺 Area'},{id:'density',label:'🏙 Density'}].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding:'7px 14px', borderRadius:20, border:'none', cursor:'pointer', fontWeight:700, fontSize:12, fontFamily:'DM Sans,sans-serif',
              background:tab===t.id?'linear-gradient(135deg,#4F8EF7,#9C6FDE)':'rgba(79,142,247,.08)',
              color:tab===t.id?'#fff':'#4F8EF7', transition:'all .15s' }}>
            {t.label}
          </button>
        ))}
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {sorted.map((c,i) => {
          const val = getVal(c)
          const pct = maxVal ? Math.round((val/maxVal)*100) : 0
          const medals = ['🥇','🥈','🥉']
          return (
            <motion.div key={c.cca3||i}
              initial={{ opacity:0, x:-14 }} animate={{ opacity:1, x:0 }}
              transition={{ delay:i*0.04, type:'spring', stiffness:300, damping:24 }}
              style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:14, background:'#fafbff', border:'1px solid rgba(0,0,0,.06)' }}>
              <span style={{ fontSize:15, flexShrink:0, width:22, textAlign:'center' }}>{i<3?medals[i]:i+1}</span>
              <div style={{ width:28, height:20, borderRadius:5, overflow:'hidden', flexShrink:0 }}>
                <SafeImage src={c.flags?.svg} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#0d0d1a', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.name?.common}</div>
                <div style={{ height:4, background:'rgba(0,0,0,.06)', borderRadius:2, marginTop:4, overflow:'hidden' }}>
                  <motion.div initial={{ width:0 }} animate={{ width:`${pct}%` }}
                    transition={{ delay:0.18+i*0.04, duration:0.5, ease:'easeOut' }}
                    style={{ height:'100%', background:'linear-gradient(90deg,#4F8EF7,#9C6FDE)', borderRadius:2 }}/>
                </div>
              </div>
              <span style={{ fontSize:11, fontWeight:700, color:'#9C6FDE', flexShrink:0 }}>{fmtVal(val)}</span>
            </motion.div>
          )
        })}
      </div>
    </ToolCard>
  )
}

// ── Main ──────────────────────────────────────────────────────────────
export default function CountryFinder() {
  const [countries, setCountries] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [region, setRegion] = useState('All')
  const [sort, setSort] = useState('name')
  const [mode, setMode] = useState('grid')
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      const url = 'https://restcountries.com/v3.1/all?fields=name,cca2,cca3,flags,capital,region,subregion,population,area,currencies,languages,timezones,latlng,idd,tld,car,unMember,landlocked,maps,borders'
      try {
        const r = await safeFetchJSON(url, {}, 18000)
        if (alive && Array.isArray(r) && r.length > 0) { setCountries(r); setLoading(false); return }
      } catch {}
      if (alive) { setCountries(FB); setLoading(false) }
    })()
    return () => { alive = false }
  }, [])

  const { totalWorldPop, regionPops } = useMemo(() => {
    let pop = 0; const rp = {}
    countries.forEach(c => {
      pop += (c.population||0)
      if (c.region) rp[c.region] = (rp[c.region]||0) + (c.population||0)
    })
    return { totalWorldPop:pop, regionPops:rp }
  }, [countries])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    let r = countries.filter(c => {
      const name = (c.name?.common||'').toLowerCase()
      const cap = (c.capital||[]).join(' ').toLowerCase()
      return (!q || name.includes(q) || cap.includes(q)) && (region==='All' || c.region===region)
    })
    r.sort((a,b) => {
      if (sort==='pop-desc') return (b.population||0)-(a.population||0)
      if (sort==='pop-asc') return (a.population||0)-(b.population||0)
      if (sort==='area-desc') return (b.area||0)-(a.area||0)
      return (a.name?.common||'').localeCompare(b.name?.common||'')
    })
    return r
  }, [countries, search, region, sort])

  const TABS = [
    { id:'grid', label:'🔍 Directory' },
    { id:'ai', label:'🤖 AI Assistant' },
    { id:'compare', label:'⚔️ Compare' },
    { id:'leaderboards', label:'🏆 Rankings' },
  ]

  return (
    <ToolShell tool={tool}>
      <Reveal>
        <ToolCard style={{ marginBottom:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap' }}>
            <div>
              <h2 style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:18, color:'#0d0d1a', margin:0 }}>🌍 Country Finder</h2>
              <p style={{ fontSize:12, color:'#888', margin:'3px 0 0' }}>
                {loading ? 'Loading countries…' : `${countries.length} countries loaded`}
              </p>
            </div>
            <motion.button
              whileHover={{ scale:1.04, y:-1 }} whileTap={{ scale:0.95 }}
              onClick={() => { if (countries.length) setSelected(countries[Math.floor(Math.random()*countries.length)]) }}
              disabled={loading}
              style={{ padding:'9px 18px', borderRadius:12, border:'none', background:'linear-gradient(135deg,#4F8EF7,#9C6FDE)', color:'#fff', fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:13, cursor:loading?'not-allowed':'pointer', boxShadow:'0 4px 14px rgba(79,142,247,.28)', display:'flex', alignItems:'center', gap:6 }}>
              🎲 Random
            </motion.button>
          </div>

          <div style={{ display:'flex', gap:3, marginTop:14, flexWrap:'wrap', background:'rgba(0,0,0,.045)', borderRadius:14, padding:4, border:'1px solid rgba(0,0,0,.04)' }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setMode(t.id)}
                style={{ flex:1, minWidth:90, padding:'7px 12px', borderRadius:10, border:'none', cursor:'pointer', fontWeight:700, fontSize:12, fontFamily:'DM Sans,sans-serif',
                  background:mode===t.id?'#ffffff':'transparent',
                  color:mode===t.id?'#0d0d1a':'#64748b',
                  boxShadow:mode===t.id?'0 2px 8px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.03), inset 0 1px 0 rgba(255,255,255,1)':'none',
                  transition:'all .18s cubic-bezier(.22,1,.36,1)' }}>
                {t.label}
              </button>
            ))}
          </div>
        </ToolCard>
      </Reveal>

      <AnimatePresence mode="wait">

        {mode==='grid' && (
          <motion.div key="grid" initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-8 }} transition={{ duration:0.22 }}>
            <ToolCard style={{ marginBottom:14 }}>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search country, capital…"
                  style={{ flex:'1 1 140px', minWidth:0, padding:'10px 14px', borderRadius:12, border:'1.5px solid rgba(79,142,247,.25)', fontFamily:'DM Sans,sans-serif', fontSize:13, outline:'none', background:'#fafbff' }}/>
                <select value={region} onChange={e => setRegion(e.target.value)}
                  style={{ flex:'1 1 110px', minWidth:0, padding:'10px 10px', borderRadius:12, border:'1.5px solid rgba(0,0,0,.1)', fontFamily:'DM Sans,sans-serif', fontSize:13, outline:'none', background:'#fafbff', cursor:'pointer' }}>
                  {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <select value={sort} onChange={e => setSort(e.target.value)}
                  style={{ flex:'1 1 110px', minWidth:0, padding:'10px 10px', borderRadius:12, border:'1.5px solid rgba(0,0,0,.1)', fontFamily:'DM Sans,sans-serif', fontSize:13, outline:'none', background:'#fafbff', cursor:'pointer' }}>
                  <option value="name">A–Z</option>
                  <option value="pop-desc">Pop ↓</option>
                  <option value="pop-asc">Pop ↑</option>
                  <option value="area-desc">Area ↓</option>
                </select>
              </div>
              {!loading && <div style={{ fontSize:11, color:'#bbb', marginTop:8, fontWeight:600 }}>{filtered.length} countries</div>}
            </ToolCard>

            {loading ? (
              <ToolCard>
                <div style={{ textAlign:'center', padding:'44px 0' }}>
                  <motion.div animate={{ rotate:360 }} transition={{ duration:1.1, repeat:Infinity, ease:'linear' }}
                    style={{ width:36, height:36, borderRadius:'50%', border:'3px solid rgba(79,142,247,.2)', borderTopColor:'#4F8EF7', margin:'0 auto 12px' }}/>
                  <div style={{ color:'#bbb', fontSize:13 }}>Loading 250+ countries…</div>
                </div>
              </ToolCard>
            ) : (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(155px,1fr))', gap:12 }}>
                {filtered.map((c,i) => (
                  <motion.div key={c.cca3||c.name?.common||i}
                    initial={{ opacity:0, y:18 }} animate={{ opacity:1, y:0 }}
                    transition={{ delay:Math.min(i*0.018,0.38), type:'spring', stiffness:280, damping:22 }}>
                    <CountryCard country={c} onClick={() => setSelected(c)}/>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {mode==='ai' && (
          <motion.div key="ai" initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-8 }} transition={{ duration:0.22 }}>
            <AIChatPanel countries={countries}/>
          </motion.div>
        )}

        {mode==='compare' && (
          <motion.div key="compare" initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-8 }} transition={{ duration:0.22 }}>
            <ComparePanel countries={countries}/>
          </motion.div>
        )}

        {mode==='leaderboards' && (
          <motion.div key="lb" initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-8 }} transition={{ duration:0.22 }}>
            <LeaderboardsPanel countries={countries}/>
          </motion.div>
        )}

      </AnimatePresence>

      {/* ── Modal ── */}
      <AnimatePresence>
        {selected && (
          <CountryModal
            key="modal"
            country={selected}
            countries={countries}
            totalWorldPop={totalWorldPop}
            regionPops={regionPops}
            onClose={(neighbor) => {
              if (neighbor && typeof neighbor === 'object' && neighbor.name) setSelected(neighbor)
              else setSelected(null)
            }}
          />
        )}
      </AnimatePresence>
    </ToolShell>
  )
}
