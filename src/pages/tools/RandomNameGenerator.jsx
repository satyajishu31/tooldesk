import React, { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ToolShell, { ToolCard } from '../../components/ToolShell'
import { useCopy } from '../../hooks'
import { TOOLS } from '../../constants'
import { safeFetchJSON } from '../../utils/safeFetch'
import { saveFileWithFallback } from '../../utils/fileSaver'
import { addToHistory } from '../../utils/history'
/* ─── Import the full data pack ─── */
import { D, FLAGS } from './generatorData.js'

const tool = TOOLS.find(t => t.id === 'randname')

/* ─── Helpers ─── */
const ri = (arr) => arr[Math.floor(Math.random() * arr.length)]
const r  = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min

const COUNTRIES = Object.keys(D)
const GENDERS   = ['male', 'female', 'random']

/* ─── Generate one name ─── */
function generateName(countryCode, gender) {
  const cc  = countryCode === 'random' ? ri(COUNTRIES) : countryCode
  const data = D[cc]
  if (!data) return null
  const g    = gender === 'random' ? ri(['male', 'female']) : gender
  const first = ri(data[g] || data.male || ['Alex'])
  const last  = ri(data.last || ['Smith'])
  const phone = typeof data.phone === 'function' ? data.phone() : ''
  const flag  = FLAGS[cc] || '🌍'
  /* Pick a colour from the AVC palette built into data.js */
  const colors = [
    ['#4F8EF7','rgba(79,142,247,.12)'],
    ['#9C6FDE','rgba(156,111,222,.12)'],
    ['#F06292','rgba(240,98,146,.12)'],
    ['#22c55e','rgba(34,197,94,.12)'],
    ['#FF9800','rgba(255,152,0,.12)'],
    ['#26C6DA','rgba(38,198,218,.12)'],
    ['#FF5722','rgba(255,87,34,.12)'],
    ['#607D8B','rgba(96,125,139,.12)'],
  ]
  const [accent, accentBg] = colors[Math.floor(Math.random() * colors.length)]
  const cleanSlug = str => {
    const norm = (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
    return norm || 'user'
  }
  const cleanFirst = cleanSlug(first)
  const cleanLast = cleanSlug(last)

  return {
    id:      Date.now() + Math.random(),
    first, last,
    full:    `${first} ${last}`,
    gender:  g,
    country: data.name,
    cc,
    flag,
    phone,
    email:   `${cleanFirst}.${cleanLast}@${ri(['gmail','yahoo','outlook','hotmail','proton'])}.com`,
    username:`${cleanFirst}${r(10,9999)}`,
    accent,
    accentBg,
    dob:     `${r(1,28).toString().padStart(2,'0')}/${r(1,12).toString().padStart(2,'0')}/${r(1960,2005)}`,
  }
}


/* ── AI Backstory Panel ── */
function BackstoryBtn({ person }) {
  const [story,   setStory]  = useState(null)
  const [loading, setLoad]   = useState(false)
  const [open,    setOpen]   = useState(false)

  const generate = async () => {
    setLoad(true); setOpen(true); setStory(null)
    try {
      const data = await safeFetchJSON('/.netlify/functions/groq-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'generateBackstory',
          payload: {
            name: person.full,
            country: person.country,
            gender: person.gender,
          }
        })
      }, 30000)
      if (data?.backstory) setStory(data.backstory)
      else setStory({ bio: data?.error || 'Could not generate backstory. Try again.' })
    } catch {
      setStory({ bio: 'Could not generate backstory. Try again.' })
    } finally {
      setLoad(false)
    }
  }

  return (
    <div style={{ borderTop: '1px solid rgba(0,0,0,.06)', padding: '10px 18px' }}>
      <button onClick={open && story ? () => setOpen(false) : generate}
        style={{ width: '100%', padding: '7px', borderRadius: 9, border: 'none',
          background: `${person.accent}10`, color: person.accent,
          fontWeight: 700, fontSize: 12, cursor: 'pointer', transition: 'all .18s' }}
        onMouseEnter={e => e.currentTarget.style.background = `${person.accent}20`}
        onMouseLeave={e => e.currentTarget.style.background = `${person.accent}10`}>
        {loading ? '🤖 Generating…' : open && story ? '▲ Hide backstory' : '🤖 Generate AI Backstory'}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
            {loading && (
              <div style={{ textAlign: 'center', padding: '12px 0', color: '#aaa', fontSize: 12 }}>
                Writing backstory…
              </div>
            )}
            {story && !loading && (
              <div style={{ paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
                {story.occupation && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 13 }}>💼</span>
                    <div>
                      <div style={{ fontSize: 9.5, fontWeight: 700, color: '#ccc', textTransform: 'uppercase', letterSpacing: '.5px' }}>Occupation</div>
                      <div style={{ fontSize: 12.5, color: '#444', fontWeight: 600 }}>{story.occupation}</div>
                    </div>
                  </div>
                )}
                {story.bio && (
                  <div style={{ fontSize: 12.5, color: '#555', lineHeight: 1.7,
                    background: `${person.accent}08`, borderRadius: 9, padding: '9px 11px',
                    borderLeft: `3px solid ${person.accent}` }}>
                    {story.bio}
                  </div>
                )}
                {story.personality && (
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {(Array.isArray(story.personality)
                      ? story.personality
                      : typeof story.personality === 'string'
                        ? story.personality.split(',')
                        : Object.values(story.personality || {}))
                      .map((t, i) => (
                      <span key={i} style={{ fontSize: 10.5, padding: '3px 9px', borderRadius: 999,
                        background: `${person.accent}12`, color: person.accent,
                        fontWeight: 600, border: `1px solid ${person.accent}25` }}>{String(t).trim()}</span>
                    ))}
                  </div>
                )}
                {story.hobby && (
                  <div style={{ fontSize: 12, color: '#666' }}>🎯 <strong>Hobby:</strong> {story.hobby}</div>
                )}
                {story.funFact && (
                  <div style={{ fontSize: 11.5, color: '#888', fontStyle: 'italic',
                    padding: '6px 10px', background: 'rgba(0,0,0,.03)', borderRadius: 8 }}>
                    💡 {story.funFact}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ─── Name card ─── */
function NameCard({ person, onCopy, index }) {
  const [expanded, setExpanded] = useState(false)
  const [copiedField, setCopiedField] = useState(null)

  const copyField = (value, field) => {
    navigator.clipboard?.writeText(value).catch(() => {})
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 1800)
    onCopy?.(value)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: .28, delay: index * .04, ease: [.22,1,.36,1] }}
      layout
    >
      <motion.div
        whileHover={{ y: -4, boxShadow: `0 14px 36px ${person.accent}22` }}
        transition={{ type: 'spring', stiffness: 280, damping: 22 }}
        style={{
          background: '#fff',
          border: `1.5px solid ${person.accent}30`,
          borderRadius: 18,
          overflow: 'hidden',
          boxShadow: '0 3px 14px rgba(0,0,0,.06)',
        }}>

        {/* Card header */}
        <div style={{
          background: `linear-gradient(135deg, ${person.accentBg}, rgba(245,247,255,.8))`,
          padding: '18px 18px 14px',
          display: 'flex', alignItems: 'flex-start', gap: 14,
        }}>
          {/* Avatar */}
          <div style={{
            width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
            background: `linear-gradient(135deg, ${person.accent}, ${person.accent}99)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, fontWeight: 800, color: '#fff',
            boxShadow: `0 4px 14px ${person.accent}40`,
            fontFamily: 'Syne, sans-serif',
          }}>
            {(person.first?.[0] || 'A').toUpperCase()}{(person.last?.[0] || 'A').toUpperCase()}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: 'Syne, sans-serif', fontSize: 18,
              fontWeight: 800, color: '#0d0d1a', marginBottom: 4,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {person.full}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{
                fontSize: 12, fontWeight: 600, color: person.accent,
                background: `${person.accent}14`, padding: '2px 9px', borderRadius: 999,
                border: `1px solid ${person.accent}28`,
              }}>
                {person.flag} {person.country}
              </span>
              <span style={{
                fontSize: 11, fontWeight: 600, color: '#aaa',
                background: '#f5f5f8', padding: '2px 8px', borderRadius: 999,
              }}>
                {person.gender === 'male' ? '♂ Male' : '♀ Female'}
              </span>
            </div>
          </div>

          {/* Copy full name button */}
          <motion.button
            whileHover={{ scale: 1.1 }} whileTap={{ scale: .92 }}
            onClick={() => copyField(person.full, 'name')}
            style={{
              width: 34, height: 34, borderRadius: 9,
              border: `1.5px solid ${person.accent}30`,
              background: copiedField === 'name' ? person.accent : 'rgba(255,255,255,.8)',
              color: copiedField === 'name' ? '#fff' : person.accent,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, flexShrink: 0, transition: 'all .22s',
            }}>
            {copiedField === 'name' ? '✓' : '📋'}
          </motion.button>
        </div>

        {/* Fields */}
        <div style={{ padding: '14px 18px 4px' }}>
          {[
            { label: 'Phone',    value: person.phone,    icon: '📞', field: 'phone' },
            { label: 'Email',    value: person.email,    icon: '✉️',  field: 'email' },
            { label: 'Username', value: person.username, icon: '👤', field: 'user'  },
          ].map(row => (
            <div key={row.field} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,.05)',
            }}>
              <span style={{ fontSize: 14, flexShrink: 0 }}>{row.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, color: '#ccc', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 1 }}>{row.label}</div>
                <div style={{ fontSize: 12.5, color: '#444', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.value}</div>
              </div>
              <motion.button
                whileHover={{ scale: 1.12 }} whileTap={{ scale: .9 }}
                onClick={() => copyField(row.value, row.field)}
                style={{
                  width: 28, height: 28, borderRadius: 7, border: 'none',
                  background: copiedField === row.field ? person.accent : `${person.accent}12`,
                  color: copiedField === row.field ? '#fff' : person.accent,
                  cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all .18s', flexShrink: 0,
                }}>
                {copiedField === row.field ? '✓' : '⎘'}
              </motion.button>
            </div>
          ))}

          {/* Expanded fields */}
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{ overflow: 'hidden' }}>
                {[
                  { label: 'Date of Birth', value: person.dob,      icon: '🎂', field: 'dob'  },
                  { label: 'Country Code',  value: person.cc,       icon: '🌍', field: 'cc'   },
                  { label: 'Full Name',     value: person.full,     icon: '🪪', field: 'full' },
                ].map(row => (
                  <div key={row.field} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,.05)',
                  }}>
                    <span style={{ fontSize: 14, flexShrink: 0 }}>{row.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 9.5, fontWeight: 700, color: '#ccc', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 1 }}>{row.label}</div>
                      <div style={{ fontSize: 12.5, color: '#444', fontWeight: 500 }}>{row.value}</div>
                    </div>
                    <motion.button whileHover={{ scale: 1.12 }} whileTap={{ scale: .9 }}
                      onClick={() => copyField(row.value, row.field)}
                      style={{ width: 28, height: 28, borderRadius: 7, border: 'none', background: copiedField === row.field ? person.accent : `${person.accent}12`, color: copiedField === row.field ? '#fff' : person.accent, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .18s', flexShrink: 0 }}>
                      {copiedField === row.field ? '✓' : '⎘'}
                    </motion.button>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* AI Backstory */}
        <BackstoryBtn person={person}/>

        {/* Toggle expand */}
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            width: '100%', padding: '9px', background: 'none',
            border: 'none', borderTop: '1px solid rgba(0,0,0,.05)',
            cursor: 'pointer', fontSize: 11.5, fontWeight: 600,
            color: '#bbb', transition: 'color .18s, background .18s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = person.accent; e.currentTarget.style.background = `${person.accent}06` }}
          onMouseLeave={e => { e.currentTarget.style.color = '#bbb'; e.currentTarget.style.background = 'none' }}>
          {expanded ? '▲ Less details' : '▼ More details'}
        </button>
      </motion.div>
    </motion.div>
  )
}

/* ─── MAIN ─── */
export default function RandomNameGenerator() {
  const [country,  setCountry]  = useState('random')
  const [gender,   setGender]   = useState('random')
  const [count,    setCount]    = useState(4)
  const [names,    setNames]    = useState([])
  const [loading,  setLoading]  = useState(false)
  const [copied,   copy]        = useCopy()
  const timerRef = useRef(null)

  const generate = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setLoading(true)
    timerRef.current = setTimeout(() => {
      const result = Array.from({ length: count }, () => generateName(country, gender))
        .filter(Boolean)
      setNames(result)
      try {
        addToHistory({
          tool: 'Random Name Generator',
          label: `${count} Names (${country === 'random' ? 'International' : country})`,
          value: result[0]?.full ? `${result[0].full} + ${result.length - 1} more` : `${result.length} names`,
          action: 'Generated',
          category: 'generator',
          metadata: { count, country, gender }
        })
      } catch {}
      setLoading(false)
      timerRef.current = null
    }, 180)
  }, [country, gender, count])

  /* Generate on first load */
  useEffect(() => {
    generate()
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const copyAll = () => copy(names.map(n => `${n.full} | ${n.phone} | ${n.email}`).join('\n'))

  return (
    <ToolShell tool={tool}>

      {/* ── Controls ── */}
      <ToolCard>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 12, marginBottom: 18 }}>

          {/* Country */}
          <div>
            <div className="lbl">Country</div>
            <select className="inp sel" value={country} onChange={e => setCountry(e.target.value)}>
              <option value="random">🌍 Random Country</option>
              {COUNTRIES.map(cc => (
                <option key={cc} value={cc}>{FLAGS[cc]} {D[cc].name}</option>
              ))}
            </select>
          </div>

          {/* Gender */}
          <div>
            <div className="lbl">Gender</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {GENDERS.map(g => (
                <motion.button key={g} onClick={() => setGender(g)}
                  whileHover={{ y: -2 }} whileTap={{ scale: .94 }}
                  style={{
                    flex: 1, padding: '10px 6px', borderRadius: 10, cursor: 'pointer',
                    border: `1.5px solid ${gender === g ? '#4F8EF7' : 'rgba(0,0,0,.1)'}`,
                    background: gender === g ? 'rgba(79,142,247,.09)' : '#fafafa',
                    color: gender === g ? '#4F8EF7' : '#777',
                    fontWeight: 700, fontSize: 12, fontFamily: 'DM Sans, sans-serif',
                    transition: 'all .18s',
                  }}>
                  {g === 'male' ? '♂' : g === 'female' ? '♀' : '⚡'}<br/>
                  <span style={{ fontSize: 10, textTransform: 'capitalize' }}>{g}</span>
                </motion.button>
              ))}
            </div>
          </div>

          {/* Count */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div className="lbl" style={{ margin: 0 }}>How many</div>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#4F8EF7' }}>{count}</span>
            </div>
            <input type="range" min={1} max={24} value={count}
              onChange={e => setCount(+e.target.value)}
                style={{ width:'100%', marginTop: 14, background:`linear-gradient(to right,#4F8EF7 0%,#4F8EF7 ${Math.max(0,Math.min(100,((count)-(1))/((24)-(1))*100))}%,#e2e4ef ${Math.max(0,Math.min(100,((count)-(1))/((24)-(1))*100))}%,#e2e4ef 100%)`, WebkitAppearance:'none', appearance:'none', height:5, borderRadius:3, outline:'none', cursor:'pointer' }} className="rs-thumb"/>
          </div>
        </div>

        {/* Generate button */}
        <motion.button
          onClick={generate}
          whileHover={{ scale: 1.01, y: -2 }} whileTap={{ scale: .97 }}
          style={{
            width: '100%', padding: '14px', borderRadius: 12, border: 'none',
            cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: 16,
            background: 'linear-gradient(135deg, #4F8EF7, #9C6FDE)',
            color: '#fff', boxShadow: '0 6px 20px rgba(79,142,247,.32)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          }}>
          <motion.span
            animate={loading ? { rotate: 360 } : { rotate: 0 }}
            transition={loading ? { duration: .5, repeat: Infinity, ease: 'linear' } : {}}>
            {loading ? '⚙️' : '🎲'}
          </motion.span>
          {loading ? 'Generating…' : `Generate ${count} Random Name${count !== 1 ? 's' : ''}`}
        </motion.button>
      </ToolCard>

      {/* ── Results ── */}
      <AnimatePresence mode="wait">
        {names.length > 0 && (
          <motion.div key="results" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {/* Header row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, margin: '20px 0 14px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '.6px' }}>
                {names.length} synthetic profile{names.length !== 1 ? 's' : ''} generated
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: .96 }}
                  onClick={copyAll}
                  style={{ padding: '6px 14px', borderRadius: 999, border: '1.5px solid rgba(79,142,247,.25)', background: copied ? 'rgba(34,197,94,.1)' : 'rgba(79,142,247,.07)', color: copied ? '#22c55e' : '#4F8EF7', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', transition: 'all .2s' }}>
                  {copied ? '✅ Copied all!' : '📋 Copy all'}
                </motion.button>

                <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: .96 }}
                  onClick={() => {
                    const header = ['First Name', 'Last Name', 'Full Name', 'Gender', 'Country', 'Phone', 'Email', 'Username', 'DOB']
                    const rows = names.map(n => [
                      `"${(n.first||'').replace(/"/g, '""')}"`,
                      `"${(n.last||'').replace(/"/g, '""')}"`,
                      `"${(n.full||'').replace(/"/g, '""')}"`,
                      `"${n.gender}"`,
                      `"${n.country}"`,
                      `"${n.phone}"`,
                      `"${n.email}"`,
                      `"${n.username}"`,
                      `"${n.dob}"`
                    ].join(','))
                    const blob = new Blob([header.join(',') + '\n' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
                    saveFileWithFallback(blob, `synthetic_names_fixture_${Date.now()}.csv`)
                  }}
                  style={{ padding: '6px 14px', borderRadius: 999, border: '1.5px solid rgba(0,0,0,.1)', background: '#fff', color: '#334155', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                  📥 Export CSV
                </motion.button>

                <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: .96 }}
                  onClick={() => {
                    const clean = names.map(({ id, accent, accentBg, ...rest }) => rest)
                    const blob = new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json;charset=utf-8;' })
                    saveFileWithFallback(blob, `synthetic_names_fixture_${Date.now()}.json`)
                  }}
                  style={{ padding: '6px 14px', borderRadius: 999, border: '1.5px solid rgba(0,0,0,.1)', background: '#fff', color: '#334155', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                  📦 Export JSON
                </motion.button>
              </div>
            </div>

            {/* Test Fixture Disclaimer */}
            <div style={{
              padding: '9px 14px',
              borderRadius: 10,
              background: 'rgba(79, 142, 247, 0.06)',
              border: '1px solid rgba(79, 142, 247, 0.18)',
              marginBottom: 16,
              fontSize: 11.5,
              color: '#3b82f6',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              <span>🧪</span>
              <span><strong>QA Test Fixtures:</strong> Generated identities are synthesized mock data for development and testing. They do not represent real people.</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(260px, 100%), 1fr))', gap: 14 }}>
              <AnimatePresence>
                {names.map((person, i) => (
                  <NameCard key={person.id} person={person} index={i} onCopy={() => {}}/>
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </ToolShell>
  )
}
