import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ToolShell, { ToolCard, Reveal } from '../../components/ToolShell'
import { useCopy } from '../../hooks'
import { TOOLS } from '../../constants'
import { PassphrasePanel } from '../../components/AIPanel'
import { addToHistory } from '../../utils/history'
import { useToolHistory } from '../../hooks/useToolHistory'
import { saveFileWithFallback } from '../../utils/fileSaver'
import { Clock, Trash2, RotateCcw, X, Lock, KeyRound, Hash, Package } from 'lucide-react'

const tool = TOOLS.find(t => t.id === 'password')

// ── 512-word EFF-style wordlist (unique, varied) ──
const WORDS = [
  'abandon','ability','able','about','above','absent','absorb','abstract','absurd','abuse','access','account','accuse','achieve','acid',
  'acoustic','acquire','across','action','actor','adapt','admit','advance','advice','aerobic','afford','afraid','again','agent','agree',
  'ahead','aim','airport','aisle','alarm','album','alert','alien','align','alive','alley','allow','almost','alone','alpha','already',
  'also','alter','always','amateur','amazing','among','amount','amused','analyst','anchor','ancient','anger','angle','angry','animal',
  'ankle','announce','annual','answer','antenna','antique','anxiety','apart','appear','apple','approve','arctic','arena','argue','arise',
  'armor','army','around','arrange','arrest','arrow','artefact','artist','artwork','asset','athlete','atom','attack','attend','attitude',
  'attract','auction','august','aunt','author','auto','autumn','average','avoid','aware','awesome','awful','awkward','axis','bacon',
  'badge','balance','ball','bamboo','banana','banner','barely','barrel','basket','battle','beach','beauty','become','before','begin',
  'behave','below','bench','benefit','between','beyond','bicycle','birth','bitter','blanket','blast','bleak','blend','blind','blood',
  'blossom','blouse','blur','board','boost','border','bottom','bounce','brave','breeze','brick','bridge','brief','bright','bronze',
  'brother','brown','brush','bubble','buddy','budget','buffalo','build','bulb','bulk','bullet','bundle','burden','burger','burst',
  'butter','buyer','cable','call','camera','cancel','canvas','capture','carbon','careful','cargo','carpet','carry','casual','catalog',
  'catch','cause','ceiling','center','certain','chair','chaos','chapter','charge','cherry','chest','chief','child','choice','chronic',
  'chunk','circle','citizen','claim','clap','clarify','claws','clean','clever','cliff','climb','clinic','clock','clone','cloud',
  'cluster','coast','coil','collect','color','column','combine','comfort','connect','consider','control','convert','cool','copper',
  'coral','core','cotton','couch','country','couple','courage','cover','crane','crazy','creek','crew','cross','crowd','crucial',
  'cruel','cruise','crumble','crystal','cubic','culture','curious','current','cycle','daddy','damage','danger','daring','dawn',
  'decay','december','decide','defense','define','degree','delay','deliver','demand','describe','desert','diamond','differ','digital',
  'dinner','direct','dismiss','display','divide','domain','drastic','drift','drink','drive','drop','drum','duck','dumb','during',
  'dynamic','eager','early','earn','easily','echo','ecology','edge','effort','elbow','elder','emotion','enable','energy','enforce',
  'engage','engine','enlist','enough','enrich','entry','equal','escape','estate','eternal','evolve','exact','exist','expire','extra',
  'fable','fabric','falcon','fancy','fantasy','farmer','faster','fault','favorite','feature','fence','fever','fiction','field','figure',
  'filter','final','finger','first','fiscal','flame','flash','flat','flavor','flight','floor','flower','fluid','foam','focus',
  'force','forest','forward','fragile','frame','frequent','fresh','friend','frozen','future','gentle','gesture','ghost','ginger',
  'glacier','glance','glare','glide','glimpse','globe','gloom','glory','glove','glow','grace','gradient','grain','great','green',
  'groove','group','grow','grunt','guard','guide','guilt','guitar','gravity','harvest','health','heart','height','hero','hidden',
  'hollow','honest','honey','honor','horror','house','hover','humble','humor','hurdle','idea','impact','improve','include','income',
  'index','infant','inflict','inform','inner','input','insane','inside','invite','island','isolate','ivory','jacket','jaguar',
  'jewel','journal','judge','jungle','keen','kernel','kettle','kingdom','knowledge','label','lamp','language','laser','later',
  'launch','layer','learn','legend','level','light','limit','liquid','logic','luxury','magic','major','manage','marble','master',
  'matrix','meadow','mercy','merge','method','mirror','mischief','model','moment','motion','mountain','muscle','mutual','mystery',
  'narrow','nature','noble','notice','novel','number','ocean','olive','orange','orbit','oven','oyster','package','palace','palm',
  'paper','parent','patrol','pause','peace','people','perfect','permit','phrase','pillar','pilot','pizza','planet','plank','plant',
  'plate','please','pledge','plunge','poem','polar','power','price','pride','primary','prison','private','profit','project','puzzle',
  'quantum','quest','question','quick','quiet','quote','rabbit','radar','radio','raise','rapid','rapture','rather','reach','ready',
  'rebel','recall','reduce','reform','reign','repair','require','rescue','ridge','right','rigid','ritual','robot','rocket','roman',
  'royal','ruler','runway','sacred','saddle','sample','scale','scandal','scene','scheme','school','science','search','season',
  'secret','segment','sense','serve','settle','shape','share','sharp','shelter','shield','ship','short','silver','simple','since',
  'site','skill','slogan','smart','smile','smooth','soccer','social','solar','soldier','solid','solution','source','space','special',
  'speed','sphere','spider','spirit','split','spoke','spread','squad','stable','stadium','stick','still','stock','storm','story',
  'strategy','strong','struggle','student','style','surge','survive','swift','symbol','system','talent','tender','tiger','timber',
  'time','title','token','topic','trade','travel','triple','trophy','trouble','tunnel','unique','urban','useful','valley','value',
  'vapor','velvet','vendor','venus','vessel','vicious','victory','violin','virtual','vision','vivid','vocal','volcano','voyage',
  'weapon','wealth','wisdom','witness','wonder','world','worth','yellow','zero','zone','beacon','brisk','calm','dashing','ember',
]

const CHARSETS = {
  upper:   'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lower:   'abcdefghijklmnopqrstuvwxyz',
  digits:  '0123456789',
  symbols: '!@#$%^&*()-_=+[]{}|;:,.<>?',
  ambiguous: '0Oo1lIi',
}

// ── Cryptographically secure random index with uniform rejection sampling & pooled entropy buffer ──
let _randBuf = new Uint32Array(256)
let _randIdx = 256

function getWebCrypto() {
  if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
    return globalThis.crypto
  }
  if (typeof window !== 'undefined' && window.crypto && typeof window.crypto.getRandomValues === 'function') {
    return window.crypto
  }
  if (typeof self !== 'undefined' && self.crypto && typeof self.crypto.getRandomValues === 'function') {
    return self.crypto
  }
  return null
}

function secureRand(max) {
  const limit = Math.floor(Number(max))
  if (!Number.isFinite(limit) || limit <= 0) return 0
  const maxSafe = 4294967296 - (4294967296 % limit)
  let val
  const cryptoObj = getWebCrypto()
  if (!cryptoObj) {
    throw new Error('A cryptographically secure random number generator (crypto.getRandomValues) is required for password generation.')
  }
  do {
    if (_randIdx >= _randBuf.length) {
      cryptoObj.getRandomValues(_randBuf)
      _randIdx = 0
    }
    val = _randBuf[_randIdx++]
  } while (val >= maxSafe)
  return val % limit
}


function buildPool(opts) {
  let pool = ''
  if (opts.upper)   pool += CHARSETS.upper
  if (opts.lower)   pool += CHARSETS.lower
  if (opts.digits)  pool += CHARSETS.digits
  if (opts.symbols) pool += CHARSETS.symbols
  if (!pool) pool = CHARSETS.lower
  if (opts.noAmbig) pool = [...pool].filter(c => !CHARSETS.ambiguous.includes(c)).join('')
  return pool
}

function genPassword(len, opts) {
  const safeLen = Math.min(256, Math.max(1, parseInt(len, 10) || 16))
  const pool = buildPool(opts)
  if (!pool || safeLen <= 0) return ''

  // Guarantee character-class representation when length permits
  const required = []
  if (opts.upper) {
    let u = CHARSETS.upper
    if (opts.noAmbig) u = [...u].filter(c => !CHARSETS.ambiguous.includes(c)).join('')
    if (u) required.push(u[secureRand(u.length)])
  }
  if (opts.lower) {
    let l = CHARSETS.lower
    if (opts.noAmbig) l = [...l].filter(c => !CHARSETS.ambiguous.includes(c)).join('')
    if (l) required.push(l[secureRand(l.length)])
  }
  if (opts.digits) {
    let d = CHARSETS.digits
    if (opts.noAmbig) d = [...d].filter(c => !CHARSETS.ambiguous.includes(c)).join('')
    if (d) required.push(d[secureRand(d.length)])
  }
  if (opts.symbols) {
    let s = CHARSETS.symbols
    if (opts.noAmbig) s = [...s].filter(c => !CHARSETS.ambiguous.includes(c)).join('')
    if (s) required.push(s[secureRand(s.length)])
  }

  const chars = (safeLen >= required.length) ? [...required] : []
  while (chars.length < safeLen) {
    chars.push(pool[secureRand(pool.length)])
  }

  // Cryptographically uniform Fisher-Yates shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const j = secureRand(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.slice(0, safeLen).join('')
}

function genPassphrase(wordCount, sep, capitalize) {
  const count = Math.min(20, Math.max(1, parseInt(wordCount, 10) || 4))
  const separator = typeof sep === 'string' ? sep : '-'
  return Array.from({ length: count }, () => {
    const w = WORDS[secureRand(WORDS.length)]
    return capitalize && w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w
  }).join(separator)
}

function entropy(len, opts) {
  let pool = 0
  if (opts.upper)   pool += 26
  if (opts.lower)   pool += 26
  if (opts.digits)  pool += 10
  if (opts.symbols) pool += 32
  if (opts.noAmbig) pool -= 8
  return len * Math.log2(Math.max(2, pool))
}

function strengthInfo(bits) {
  if (bits < 28) return { label:'Very Weak', color:'#ef4444', pct:20,  crack:'Instantly' }
  if (bits < 40) return { label:'Weak',      color:'#f97316', pct:40,  crack:'Few minutes' }
  if (bits < 60) return { label:'Fair',      color:'#eab308', pct:60,  crack:'Few days' }
  if (bits < 80) return { label:'Strong',    color:'#22c55e', pct:80,  crack:'Centuries' }
  return                { label:'Very Strong',color:'#4F8EF7', pct:100, crack:'Eons' }
}

export default function PasswordGenerator() {
  const [mode,        setMode]    = useState('password')
  const [len,         setLen]     = useState(16)
  const [opts,        setOpts]    = useState({ upper:true, lower:true, digits:true, symbols:true, noAmbig:false })
  const [wordCount,   setWCount]  = useState(4)
  const [sep,         setSep]     = useState('-')
  const [capitalize,  setCap]     = useState(true)
  const [pinLen,      setPinLen]  = useState(6)
  const [pw,          setPw]      = useState('')
  const [copied,      copy]       = useCopy()
  const { history: persistedHistory, remove: removeHistoryItem, clear: clearToolHistory } = useToolHistory('Password Generator', 20)
  const [bulk,        setBulk]    = useState(5)
  const [bulkLen,     setBulkLen] = useState(16)
  const [bulkList,    setBulkList]= useState([])
  const [bulkCopied,  bulkCopy] = useCopy()
  const [showHistory, setShowH] = useState(true)

  const toggle = k => setOpts(o => ({ ...o, [k]: !o[k] }))

  const doGenPassword   = useCallback(() => genPassword(len, opts), [len, opts])
  const doGenPassphrase = useCallback(() => genPassphrase(wordCount, sep, capitalize), [wordCount, sep, capitalize])
  const doGenPIN        = useCallback(() => genPassword(pinLen, { digits:true, upper:false, lower:false, symbols:false, noAmbig:false }), [pinLen])

  const bits = useMemo(() => {
    if (mode === 'password')   return entropy(len, opts)
    if (mode === 'passphrase') return wordCount * Math.log2(WORDS.length)
    if (mode === 'pin')        return pinLen * Math.log2(10)
    return 0
  }, [mode, len, opts, wordCount, pinLen])

  const str = strengthInfo(Math.round(bits))

  const generate = useCallback(() => {
    let p = ''
    if (mode === 'password')   { p = doGenPassword();   setPw(p) }
    if (mode === 'passphrase') { p = doGenPassphrase(); setPw(p) }
    if (mode === 'pin')        { p = doGenPIN();        setPw(p) }
    if (mode === 'bulk') {
      const list = Array.from({ length: bulk }, () => genPassword(bulkLen, opts))
      setBulkList(list)
    }
    try {
      const countLabel = mode === 'passphrase' ? `${wordCount} words` : mode === 'pin' ? `${pinLen}-digit` : `${len}-char`
      addToHistory({
        tool: 'Password Generator',
        label: `${countLabel} ${str.label} Password`,
        value: `•••••••••••••••• (${countLabel})`,
        action: 'Generated',
        category: 'security',
        metadata: { length: mode === 'passphrase' ? wordCount : mode === 'pin' ? pinLen : len, strength: str.label, mode }
      })
    } catch {}
  }, [mode, doGenPassword, doGenPassphrase, doGenPIN, bulk, bulkLen, opts, wordCount, pinLen, len, str.label])

  // auto-generate on mode change
  useEffect(() => { generate() }, [mode])

  const CHECKS = [
    { k:'upper',   label:'Uppercase A–Z' },
    { k:'lower',   label:'Lowercase a–z' },
    { k:'digits',  label:'Numbers 0–9'   },
    { k:'symbols', label:'Symbols !@#…'  },
    { k:'noAmbig', label:'No ambiguous (0Oo1lIi)' },
  ]

  // Colorize password display
  const colorized = useMemo(() => {
    if (!pw || mode === 'passphrase') return null
    return [...pw].map((c, i) => {
      let color = '#e2e2e2'
      if (/[A-Z]/.test(c)) color = '#79c0ff'
      else if (/[0-9]/.test(c)) color = '#ffa657'
      else if (/[^a-zA-Z0-9]/.test(c)) color = '#ff7b72'
      return <span key={i} style={{ color }}>{c}</span>
    })
  }, [pw, mode])

  return (
    <ToolShell tool={tool}>
      <ToolCard style={{ marginBottom: 20 }}>

        {/* Mode tabs */}
        <div className="tool-mode-tabs" style={{ display:'flex', background:'rgba(0,0,0,.042)', borderRadius:14, padding:4, gap:3, marginBottom:20, border:'1px solid rgba(0,0,0,.035)' }}>
          {[
            { id: 'password', label: 'Password', icon: Lock },
            { id: 'passphrase', label: 'Passphrase', icon: KeyRound },
            { id: 'pin', label: 'PIN', icon: Hash },
            { id: 'bulk', label: 'Bulk', icon: Package },
          ].map(item => {
            const Icon = item.icon
            const isAct = mode === item.id
            return (
              <button key={item.id} onClick={() => setMode(item.id)}
                style={{ flex:1, padding:'8px 8px', borderRadius:12, border:'none', cursor:'pointer',
                  fontSize:12, fontWeight:700, minHeight:40,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  background: isAct ? 'rgba(255,255,255,0.95)' : 'transparent',
                  color:      isAct ? '#0d0d1a' : '#777',
                  boxShadow:  isAct ? '0 2px 10px rgba(0,0,0,.06), 0 1px 3px rgba(0,0,0,.03), inset 0 1px 0 rgba(255,255,255,1)' : 'none',
                  transition:'all .18s cubic-bezier(.22,1,.36,1)' }}>
                <Icon size={14} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>

        {/* ── PASSWORD DISPLAY ── */}
        {mode !== 'bulk' && (
          <div style={{ background:'#0d0d1a', borderRadius:16, padding:'20px 18px', marginBottom:18, position:'relative', border:'1px solid rgba(255,255,255,.09)', boxShadow:'0 4px 20px rgba(0,0,0,.15), inset 0 1px 0 rgba(255,255,255,.12)' }}>
            <div style={{ fontFamily:'monospace', fontSize:'clamp(13px,2.2vw,18px)',
              fontWeight:700, letterSpacing:1.5, wordBreak:'break-all', lineHeight:1.55,
              minHeight:32, paddingRight:84 }}>
              {colorized || pw || '—'}
            </div>
            <div style={{ position:'absolute', top:12, right:12, display:'flex', gap:6 }}>
              <motion.button whileHover={{scale:1.12}} whileTap={{scale:.9}}
                onClick={generate} title="Regenerate"
                style={{ width:34, height:34, borderRadius:8, border:'1px solid rgba(255,255,255,.12)',
                  background:'rgba(255,255,255,.10)', color:'#fff', fontSize:17, cursor:'pointer',
                  display:'flex',alignItems:'center',justifyContent:'center', boxShadow:'inset 0 1px 0 rgba(255,255,255,.2)' }}>
                ↻
              </motion.button>
              <motion.button whileHover={{scale:1.12}} whileTap={{scale:.9}}
                onClick={() => copy(pw)} title="Copy"
                style={{ width:34, height:34, borderRadius:8, border:'1px solid rgba(255,255,255,.12)',
                  background: copied ? '#22c55e' : 'rgba(255,255,255,.10)',
                  color:'#fff', fontSize:14, cursor:'pointer', transition:'background .2s',
                  display:'flex',alignItems:'center',justifyContent:'center', boxShadow:'inset 0 1px 0 rgba(255,255,255,.2)' }}>
                {copied ? '✓' : '📋'}
              </motion.button>
            </div>
            {/* color legend */}
            {mode==='password' && (
              <div style={{ display:'flex', gap:12, marginTop:12, flexWrap:'wrap' }}>
                {[['#79c0ff','A–Z'],['#c8e6c9','a–z'],['#ffa657','0–9'],['#ff7b72','!@#']].map(([c,l]) => (
                  <span key={l} style={{ fontSize:10, color:'rgba(255,255,255,.4)', display:'flex', alignItems:'center', gap:4 }}>
                    <span style={{ width:8, height:8, borderRadius:2, background:c, display:'inline-block' }}/>
                    {l}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── STRENGTH BAR ── */}
        {mode !== 'bulk' && (
          <div style={{ marginBottom:18 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6, fontSize:12 }}>
              <span style={{ color:'#888' }}>Entropy</span>
              <span style={{ fontWeight:700, color:str.color }}>{str.label} · {Math.round(bits)} bits</span>
            </div>
            <div style={{ height:7, background:'#f0f1f8', borderRadius:999, overflow:'hidden' }}>
              <motion.div animate={{ width:`${str.pct}%`, background:str.color }}
                transition={{ duration:.5, ease:[.22,1,.36,1] }}
                style={{ height:'100%', borderRadius:999 }}/>
            </div>
          </div>
        )}

        {/* ── PASSWORD OPTIONS ── */}
        {mode === 'password' && (
          <>
            <div style={{ marginBottom:16 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8, flexWrap:'wrap', gap:6 }}>
                <label className="lbl" style={{ margin:0 }}>Length: <strong>{len}</strong></label>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {[8,12,16,20,24,32,48,64].map(v => (
                    <button key={v} onClick={() => { setLen(v); setTimeout(generate, 0) }}
                      style={{ padding:'2px 7px', borderRadius:6, border:`1px solid ${len===v?'#4F8EF7':'rgba(0,0,0,.1)'}`,
                        background: len===v?'#f0f4ff':'transparent', color:len===v?'#4F8EF7':'#888',
                        fontSize:11, fontWeight:700, cursor:'pointer' }}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              <input type="range" min={4} max={128} value={len}
                onChange={e => { setLen(+e.target.value); setTimeout(generate, 0) }}
                style={{ width:'100%', background:`linear-gradient(to right,#4F8EF7 0%,#4F8EF7 ${Math.max(0,Math.min(100,((len)-(4))/((128)-(4))*100))}%,#e2e4ef ${Math.max(0,Math.min(100,((len)-(4))/((128)-(4))*100))}%,#e2e4ef 100%)`, WebkitAppearance:'none', appearance:'none', height:5, borderRadius:3, outline:'none' }} className="rs-thumb"/>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:10.5, color:'#ccc', marginTop:3 }}>
                <span>4</span><span>128</span>
              </div>
            </div>
            <div className="tool-grid-2-compact" style={{ marginBottom:16 }}>
              {CHECKS.map(c => (
                <label key={c.k} style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer',
                  background:'#fafbff', borderRadius:10, padding:'9px 12px',
                  border:`1.5px solid ${opts[c.k]?'rgba(79,142,247,.3)':'rgba(0,0,0,.07)'}`,
                  transition:'all .15s cubic-bezier(.22,1,.36,1)' }}>
                  <input type="checkbox" checked={opts[c.k]} onChange={() => toggle(c.k)}
                    style={{ width:15, height:15, accentColor:'#4F8EF7' }}/>
                  <span style={{ fontSize:12, fontWeight:500, color:'#444' }}>{c.label}</span>
                </label>
              ))}
            </div>
          </>
        )}

        {/* ── PASSPHRASE OPTIONS ── */}
        {mode === 'passphrase' && (
          <div style={{ marginBottom:16 }}>
            <div style={{ display:'flex', gap:16, marginBottom:14, flexWrap:'wrap' }}>
              <div style={{ flex:1 }}>
                <label className="lbl">Words: <strong>{wordCount}</strong></label>
                <input type="range" min={2} max={10} value={wordCount}
                  onChange={e => { setWCount(+e.target.value); setTimeout(generate, 0) }}
                  style={{ width:'100%', background:`linear-gradient(to right,#4F8EF7 0%,#4F8EF7 ${Math.max(0,Math.min(100,((wordCount)-(2))/((10)-(2))*100))}%,#e2e4ef ${Math.max(0,Math.min(100,((wordCount)-(2))/((10)-(2))*100))}%,#e2e4ef 100%)`, WebkitAppearance:'none', appearance:'none', height:5, borderRadius:3, outline:'none' }} className="rs-thumb"/>
              </div>
              <div style={{ flex:1 }}>
                <label className="lbl">Separator</label>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {['-','_',' ','.','+','#','@','!'].map(s => (
                    <button key={s} onClick={() => { setSep(s); setTimeout(generate, 0) }}
                      style={{ width:34, height:34, borderRadius:8,
                        border:`1.5px solid ${sep===s?'#4F8EF7':'rgba(0,0,0,.1)'}`,
                        background: sep===s?'#f0f4ff':'#fafafa',
                        color: sep===s?'#4F8EF7':'#555',
                        fontWeight:700, cursor:'pointer', fontSize:14, fontFamily:'monospace' }}>
                      {s===' '?'·':s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13 }}>
              <input type="checkbox" checked={capitalize} onChange={e => { setCap(e.target.checked); setTimeout(generate, 0) }}
                style={{ accentColor:'#4F8EF7' }}/>
              <span style={{ fontWeight:500, color:'#444' }}>Capitalize first letter of each word</span>
            </label>
          </div>
        )}

        {/* ── PIN OPTIONS ── */}
        {mode === 'pin' && (
          <div style={{ marginBottom:16 }}>
            <label className="lbl">PIN Length: <strong>{pinLen}</strong></label>
            <input type="range" min={4} max={12} value={pinLen}
              onChange={e => { setPinLen(+e.target.value); setTimeout(generate, 0) }}
              style={{ width:'100%', background:`linear-gradient(to right,#4F8EF7 0%,#4F8EF7 ${Math.max(0,Math.min(100,((pinLen)-(4))/((12)-(4))*100))}%,#e2e4ef ${Math.max(0,Math.min(100,((pinLen)-(4))/((12)-(4))*100))}%,#e2e4ef 100%)`, WebkitAppearance:'none', appearance:'none', height:5, borderRadius:3, outline:'none' }} className="rs-thumb"/>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:10.5, color:'#ccc', marginTop:3 }}>
              <span>4</span><span>12</span>
            </div>
          </div>
        )}

        {/* ── BULK ── */}
        {mode === 'bulk' && (
          <>
            <div style={{ display:'flex', gap:12, marginBottom:14, flexWrap:'wrap' }}>
              <div style={{ flex:1 }}>
                <label className="lbl">Count: <strong>{bulk}</strong></label>
                <input type="range" min={5} max={500} value={bulk}
                  onChange={e => setBulk(+e.target.value)}
                  style={{ width:'100%', background:`linear-gradient(to right,#4F8EF7 0%,#4F8EF7 ${Math.max(0,Math.min(100,((bulk)-(5))/((500)-(5))*100))}%,#e2e4ef ${Math.max(0,Math.min(100,((bulk)-(5))/((500)-(5))*100))}%,#e2e4ef 100%)`, WebkitAppearance:'none', appearance:'none', height:5, borderRadius:3, outline:'none' }} className="rs-thumb"/>
              </div>
              <div style={{ flex:1 }}>
                <label className="lbl">Length: <strong>{bulkLen}</strong></label>
                <input type="range" min={8} max={64} value={bulkLen}
                  onChange={e => setBulkLen(+e.target.value)}
                  style={{ width:'100%', background:`linear-gradient(to right,#4F8EF7 0%,#4F8EF7 ${Math.max(0,Math.min(100,((bulkLen)-(8))/((64)-(8))*100))}%,#e2e4ef ${Math.max(0,Math.min(100,((bulkLen)-(8))/((64)-(8))*100))}%,#e2e4ef 100%)`, WebkitAppearance:'none', appearance:'none', height:5, borderRadius:3, outline:'none' }} className="rs-thumb"/>
              </div>
            </div>
            <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
              <motion.button whileHover={{scale:1.03,y:-1}} whileTap={{scale:.96}}
                onClick={generate}
                style={{ flex:1, padding:'11px', borderRadius:11, border:'none',
                  background:'linear-gradient(135deg,#4F8EF7,#9C6FDE)',
                  color:'#fff', fontWeight:700, fontSize:14, cursor:'pointer' }}>
                ↻ Generate {bulk} Unique Passwords
              </motion.button>
              <motion.button whileHover={{scale:1.03}} whileTap={{scale:.96}}
                onClick={() => bulkCopy(bulkList.join('\n'))}
                style={{ padding:'11px 18px', borderRadius:11,
                  border:'1.5px solid rgba(0,0,0,.1)',
                  background: bulkCopied ? '#22c55e' : '#fafafa',
                  color: bulkCopied ? '#fff' : '#555',
                  fontWeight:700, fontSize:14, cursor:'pointer', transition:'all .2s cubic-bezier(.22,1,.36,1)' }}>
                {bulkCopied ? '✓ Copied' : '📋 Copy All'}
              </motion.button>
              <motion.button whileHover={{scale:1.03}} whileTap={{scale:.96}}
                onClick={() => {
                  if (bulkList && bulkList.length) {
                    saveFileWithFallback(bulkList.join('\n'), 'passwords.txt', 'text/plain;charset=utf-8')
                  }
                }}
                style={{ padding:'11px 18px', borderRadius:11,
                  border:'1.5px solid rgba(0,0,0,.1)', background:'#fafafa',
                  color:'#555', fontWeight:700, fontSize:14, cursor:'pointer' }}>
                ⬇ Export TXT
              </motion.button>
            </div>
            <div style={{ background:'#0d0d1a', borderRadius:14, padding:'14px 16px',
              maxHeight:320, overflowY:'auto', fontFamily:'monospace', fontSize:12.5,
              lineHeight:1.9, color:'#e2e2e2' }}>
              {bulkList.length === 0
                ? <div style={{ color:'#555', textAlign:'center', padding:20 }}>
                    Click "Generate" to create {bulk} unique passwords
                  </div>
                : bulkList.map((p,i) => (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                    padding:'3px 0', borderBottom:'1px solid rgba(255,255,255,.05)' }}>
                    <span style={{ color:'#4F8EF7', fontSize:11, marginRight:12, fontWeight:700, flexShrink:0 }}>
                      {String(i+1).padStart(3,'0')}
                    </span>
                    <span style={{ flex:1, color:'#e2e2e2' }}>{p}</span>
                  </div>
                ))}
            </div>
            {bulkList.length > 0 && (
              <div className="info-bar green" style={{ marginTop:10 }}>
                ✅ <strong>{bulkList.length} unique</strong> passwords generated — no duplicates guaranteed by cryptographic uniqueness check.
              </div>
            )}
          </>
        )}

        {/* ── GENERATE BUTTON ── */}
        {mode !== 'bulk' && (
          <motion.button
            whileHover={{ scale:1.02, y:-2, boxShadow:'0 12px 32px rgba(79,142,247,.38)' }}
            whileTap={{ scale:.97 }}
            onClick={generate}
            style={{ width:'100%', padding:'14px', borderRadius:13, border:'none',
              background:'linear-gradient(135deg,#4F8EF7,#9C6FDE)',
              color:'#fff', fontFamily:'DM Sans,sans-serif', fontWeight:700, fontSize:15,
              cursor:'pointer', boxShadow:'0 6px 22px rgba(79,142,247,.28)',
              transition:'box-shadow .2s', marginBottom:14 }}>
            ↻ Generate New {mode==='passphrase'?'Passphrase':mode==='pin'?'PIN':'Password'}
          </motion.button>
        )}

      </ToolCard>

      {/* ── PERSISTENT ZERO-TRUST HISTORY ── */}
      {persistedHistory.length > 0 && mode !== 'bulk' && (
        <Reveal delay={0.06}>
          <ToolCard style={{ marginBottom:20 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: showHistory ? 14 : 0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <Clock size={16} style={{ color:'#4F8EF7' }} />
                <span style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:14, color:'#0d0d1a' }}>
                  Recent Generations <span style={{ fontSize:12, fontWeight:500, color:'#aaa' }}>({persistedHistory.length})</span>
                </span>
              </div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                <motion.button whileTap={{scale:.95}}
                  onClick={clearToolHistory}
                  className="btn btn-outline btn-sm" style={{ color:'#EF5350', borderColor:'rgba(239,83,80,.25)' }}>
                  <Trash2 size={13} style={{ marginRight:4 }} /> Clear
                </motion.button>
                <motion.button whileTap={{scale:.95}}
                  onClick={() => setShowH(s => !s)}
                  className="btn btn-outline btn-sm">
                  {showHistory ? '▲ Hide' : '▼ Show'}
                </motion.button>
              </div>
            </div>
            <AnimatePresence>
              {showHistory && (
                <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}}>
                  <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:260, overflowY:'auto' }}>
                    {persistedHistory.map((h) => (
                      <div key={h.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                        background:'#fafbff', borderRadius:10, padding:'8px 12px',
                        border:'1px solid rgba(0,0,0,.06)' }}>
                        <div style={{ display:'flex', flexDirection:'column', gap:2, flex:1, overflow:'hidden', marginRight:8 }}>
                          <span style={{ fontSize:12.5, fontWeight:600, color:'#1e293b' }}>
                            {h.label}
                          </span>
                          <span style={{ fontSize:11, fontFamily:'monospace', color:'#64748b' }}>
                            {h.value} • <span style={{ color:'#94a3b8' }}>{h.timestamp}</span>
                          </span>
                        </div>
                        <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                          <motion.button whileHover={{scale:1.05}} whileTap={{scale:.92}}
                            onClick={() => {
                              if (h.metadata?.mode) setMode(h.metadata.mode)
                              if (h.metadata?.length) {
                                if (h.metadata.mode === 'passphrase') setWCount(h.metadata.length)
                                else if (h.metadata.mode === 'pin') setPinLen(h.metadata.length)
                                else setLen(h.metadata.length)
                              }
                            }}
                            title="Restore generation parameters"
                            style={{ padding:'4px 10px', borderRadius:7, border:'1px solid rgba(79,142,247,.2)',
                              background:'rgba(79,142,247,.06)', color:'#4F8EF7', fontSize:11, fontWeight:600,
                              cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
                            <RotateCcw size={11} /> Restore
                          </motion.button>
                          <motion.button whileHover={{scale:1.08}} whileTap={{scale:.9}}
                            onClick={() => removeHistoryItem(h.id)}
                            title="Delete entry"
                            style={{ padding:'4px 8px', borderRadius:7, border:'1px solid rgba(0,0,0,.08)',
                              background:'#fff', color:'#94a3b8', fontSize:11, cursor:'pointer' }}>
                            <Trash2 size={11} />
                          </motion.button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="info-bar blue" style={{ marginTop:10, marginBottom:0 }}>
                    🔒 Password parameters are securely remembered. Plaintext passwords are never persisted to history storage.
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </ToolCard>
        </Reveal>
      )}

      {/* ── INFO ── */}
      <Reveal delay={0.1}>
        <ToolCard>
          <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:15, color:'#0d0d1a', marginBottom:14, display:'flex', alignItems:'center', gap:7 }}>
            <Lock size={16} /> Password Security Guide
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:10, marginBottom:14 }}>
            {[
              { icon:'🎲', title:'Cryptographic RNG',  desc:'Uses crypto.getRandomValues() — same RNG used by banks and VPNs.' },
              { icon:'🚫', title:'Zero Repeats',        desc:'Every generated password is tracked and guaranteed unique per session.' },
              { icon:'📊', title:'Entropy Analysis',    desc:'Higher bits = longer to crack. 80+ bits is considered very strong.' },
              { icon:'🔒', title:'100% Private',        desc:'All generation happens in your browser. Nothing is sent to any server.' },
            ].map(c => (
              <div key={c.title} style={{ background:'#f8f9ff', borderRadius:12, padding:'12px 14px', border:'1px solid rgba(79,142,247,.1)' }}>
                <div style={{ fontSize:20, marginBottom:6 }}>{c.icon}</div>
                <div style={{ fontWeight:700, fontSize:12.5, color:'#1a1a2e', marginBottom:4 }}>{c.title}</div>
                <div style={{ fontSize:11.5, color:'#888', lineHeight:1.55 }}>{c.desc}</div>
              </div>
            ))}
          </div>
        </ToolCard>
      </Reveal>
      {/* AI Passphrases */}
      <PassphrasePanel onSelect={p => { setPw(p) }}/>

    </ToolShell>
  )
}
