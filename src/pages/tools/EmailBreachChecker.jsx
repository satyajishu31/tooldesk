import React, { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ToolShell, { ToolCard, Reveal } from '../../components/ToolShell'
import { TOOLS } from '../../constants'
import { safeFetchJSON } from '../../utils/safeFetch'
import { useCopy } from '../../hooks'

const tool = TOOLS.find(t => t.id === 'breachcheck')

function isValidEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) }

function BreachRemediationPlaybook({ email, breachCount = 0 }) {
  const [completedSteps, setCompletedSteps] = useState({})
  const [copied, copy] = useCopy()

  const STEPS = [
    {
      id: 'primary_email',
      phase: 'Phase 1: Immediate Triage',
      title: 'Secure Primary Identity Anchors (Google / Apple / Microsoft)',
      desc: 'All account recoveries and password reset tokens route through your primary inbox. If your primary email or recovery accounts share passwords with the breached service, reset them immediately with a unique 16+ character passphrase.',
      priority: 'CRITICAL',
      color: '#ef4444',
      scope: 'Identity Anchor'
    },
    {
      id: 'banking_finance',
      phase: 'Phase 1: Immediate Triage',
      title: 'Audit High-Value Financial & Cloud Portals',
      desc: 'Check banking, brokerage, cryptocurrency, and developer accounts (AWS, GitHub). Ensure no shared credentials exist between consumer sites and financial services.',
      priority: 'HIGH',
      color: '#f59e0b',
      scope: 'Financial & Assets'
    },
    {
      id: 'credential_stuffing',
      phase: 'Phase 2: Credential Stuffing Defense',
      title: 'Invalidate Reused Passwords Across Other Services',
      desc: 'Automated adversary bots take leaked combinations from breaches and spray them across thousands of consumer platforms. Assume any service using this password is vulnerable.',
      priority: 'HIGH',
      color: '#f59e0b',
      scope: 'Credential Isolation'
    },
    {
      id: 'session_revocation',
      phase: 'Phase 2: Credential Stuffing Defense',
      title: 'Revoke Active Sessions & Authentication Tokens',
      desc: 'In your core accounts (Google, Apple, Microsoft, banking), navigate to Security settings and click "Sign out of all other sessions" to invalidate any stolen session cookies.',
      priority: 'MEDIUM',
      color: '#4F8EF7',
      scope: 'Session Security'
    },
    {
      id: 'mfa_upgrade',
      phase: 'Phase 3: Multi-Factor Authentication',
      title: 'Upgrade from SMS OTP to App TOTP or Hardware FIDO2',
      desc: 'SMS codes are vulnerable to SIM-swapping. Transition critical accounts to authenticator apps (Aegis, Ente, Bitwarden) or hardware security keys (YubiKey / WebAuthn).',
      priority: 'HIGH',
      color: '#f59e0b',
      scope: 'Authentication'
    },
    {
      id: 'alias_strategy',
      phase: 'Phase 4: Forward-Looking Prevention',
      title: 'Deploy Decoy Email Aliases for New Signups',
      desc: 'Use decoy forwarding services (SimpleLogin, Cloudflare Email Routing, Apple Hide My Email) for online shopping and forums. If a third-party service gets breached, your real email address remains hidden.',
      priority: 'PREVENTION',
      color: '#22c55e',
      scope: 'Privacy Cloaking'
    },
  ]

  const toggleStep = id => {
    setCompletedSteps(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const completedCount = Object.values(completedSteps).filter(Boolean).length
  const progressPct = Math.round((completedCount / STEPS.length) * 100)

  const copyPlaybook = () => {
    const text = `### 🛡️ ToolDesk Incident Response Playbook\n` +
      `Target Identity: ${email || 'Audited Identifier'}\n` +
      `Breach Exposure Count: ${breachCount}\n` +
      `Report Date: ${new Date().toLocaleDateString()}\n\n` +
      `IMPORTANT: A breach record confirms an external service exposure, NOT that your personal device/inbox is compromised.\n\n` +
      STEPS.map((s, i) => `${i + 1}. [${completedSteps[s.id] ? 'X' : ' '}] ${s.title} (${s.priority})\n   - Scope: ${s.scope}\n   - Action: ${s.desc}`).join('\n\n')
    copy(text)
  }

  return (
    <div style={{ marginTop: 18, background: '#ffffff', borderRadius: 16, border: '1.5px solid rgba(79,142,247,.22)', padding: '20px', boxShadow: '0 4px 16px rgba(0,0,0,.04)' }}>
      {/* Playbook Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>🛡️</span>
            <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 17, color: '#0d0d1a' }}>
              Incident Response & Remediation Playbook
            </div>
          </div>
          <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 3 }}>
            Structured 4-phase containment workflow to secure compromised accounts.
          </div>
        </div>

        <button
          type="button"
          onClick={copyPlaybook}
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: copied ? '#22c55e' : '#4F8EF7',
            background: copied ? 'rgba(34,197,94,.08)' : 'rgba(79,142,247,.08)',
            border: `1px solid ${copied ? 'rgba(34,197,94,.25)' : 'rgba(79,142,247,.25)'}`,
            borderRadius: 8,
            padding: '6px 14px',
            cursor: 'pointer'
          }}>
          {copied ? '✓ Copied Playbook' : '📋 Copy Full Playbook'}
        </button>
      </div>

      {/* Critical Zero-Trust Distinction Notice */}
      <div style={{
        background: 'rgba(79,142,247,.06)',
        border: '1px solid rgba(79,142,247,.2)',
        borderRadius: 12,
        padding: '12px 14px',
        marginBottom: 16,
        fontSize: 12,
        lineHeight: 1.6,
        color: '#334155'
      }}>
        <strong style={{ color: '#1e3a8a' }}>ℹ️ Key Security Distinction:</strong> An email appearing in a public breach database confirms that a third-party website experienced an unauthorized database dump. It does <strong>not</strong> mean your private mailbox or device is compromised unless you reused the same password on other platforms.
      </div>

      {/* Triage Progress Tracker */}
      <div style={{ marginBottom: 16, background: '#f8fafc', padding: '12px 14px', borderRadius: 10, border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
          <span>Remediation Progress</span>
          <span>{completedCount} of {STEPS.length} Completed ({progressPct}%)</span>
        </div>
        <div style={{ height: 8, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${progressPct}%`,
            background: progressPct === 100 ? '#22c55e' : 'linear-gradient(90deg, #4F8EF7, #9C6FDE)',
            borderRadius: 999,
            transition: 'width .35s ease'
          }} />
        </div>
      </div>

      {/* Steps List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {STEPS.map((s, idx) => {
          const isDone = !!completedSteps[s.id]
          return (
            <div
              key={s.id}
              onClick={() => toggleStep(s.id)}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                padding: '12px 14px',
                borderRadius: 12,
                background: isDone ? 'rgba(34,197,94,.05)' : '#ffffff',
                border: `1px solid ${isDone ? 'rgba(34,197,94,.3)' : 'rgba(0,0,0,.08)'}`,
                cursor: 'pointer',
                transition: 'all .15s'
              }}
            >
              <input
                type="checkbox"
                checked={isDone}
                onChange={() => toggleStep(s.id)}
                style={{ marginTop: 3, width: 16, height: 16, accentColor: '#22c55e', cursor: 'pointer' }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3, flexWrap: 'wrap', gap: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: isDone ? '#166534' : '#0f172a', textDecoration: isDone ? 'line-through' : 'none' }}>
                    {idx + 1}. {s.title}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: '#f1f5f9', color: '#64748b' }}>
                      {s.scope}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: `${s.color}15`, color: s.color }}>
                      {s.priority}
                    </span>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
                  {s.desc}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function EmailBreachChecker() {
  /* email tab */
  const [email,    setEmail]   = useState('')
  const [loading,  setLoading] = useState(false)
  const [result,   setResult]  = useState(null)
  const [error,    setError]   = useState('')
  const [history,  setHistory] = useState([])
  const [showManualPlaybook, setShowManualPlaybook] = useState(false)
  const mountedRef = useRef(true)

  /* Clean legacy cleartext email storage if present */
  useEffect(() => {
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    try {
      localStorage.removeItem('tooldesk_email_breach_history')
      localStorage.removeItem('tooldesk_email_breach_history')
    } catch {}
  }, [])
  /* password tab */
  const [pwTab,    setPwTab]   = useState(false)
  const [password, setPassword]= useState('')
  const [pwResult, setPwResult]= useState(null)
  const [pwLoad,   setPwLoad]  = useState(false)

  const check = useCallback(async () => {
    const trimmed = email.trim()
    if (!isValidEmail(trimmed)) { setError('Please enter a valid email address'); return }
    setLoading(true); setError(''); setResult(null)
    const data = await safeFetchJSON('/.netlify/functions/hibp', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ type:'email', value: trimmed }),
    })
    if (!mountedRef.current) return
    if (data.error) setError(data.error)
    else {
      setResult(data)
      setHistory(h => [
        { email:trimmed, pwned:data.pwned, count:data.count, ts:new Date().toLocaleTimeString() },
        ...h.filter(x => x.email !== trimmed).slice(0,6),
      ])
    }
    setLoading(false)
  }, [email])

  const checkPassword = useCallback(async () => {
    if (!password) return
    setPwLoad(true); setPwResult(null)
    try {
      // Perform client-side SHA-1 hashing for k-anonymity
      const encoder = new TextEncoder()
      const dataBuffer = encoder.encode(password)
      const hashBuffer = await window.crypto.subtle.digest('SHA-1', dataBuffer)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const sha1Hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
      
      const prefix = sha1Hex.substring(0, 5)
      const suffix = sha1Hex.substring(5)

      const data = await safeFetchJSON('/.netlify/functions/hibp', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ type:'password', prefix }),
      })
      if (data.error) {
        setPwResult({ error: data.error })
      } else if (data.range) {
        const lines = data.range.split(/\r?\n/)
        let count = 0
        for (const line of lines) {
          const parts = line.trim().split(':')
          if (parts.length >= 2) {
            const s = parts[0].trim().toUpperCase()
            if (s === suffix) {
              count = parseInt(parts[1].trim(), 10) || 0
              break
            }
          }
        }
        setPwResult({ pwned: count > 0, count, hash_prefix: prefix })
      } else {
        setPwResult({ error: 'Unexpected response from check server.' })
      }
    } catch (e) {
      if (mountedRef.current) setPwResult({ error: 'Failed to compute password hash or contact API.' })
    } finally {
      if (mountedRef.current) setPwLoad(false)
    }
  }, [password])

  return (
    <ToolShell tool={tool}>

      {/* ── Tabs ── */}
      <Reveal>
        <div style={{ display:'flex', background:'#f5f6fa', borderRadius:12,
          padding:4, gap:4, marginBottom:16 }}>
          {[
            { id:false, label:'📧 Email Checker' },
            { id:true,  label:'🔑 Password Checker' },
          ].map(t => (
            <button key={String(t.id)} onClick={() => setPwTab(t.id)}
              style={{ flex:1, padding:'9px', borderRadius:9, border:'none', cursor:'pointer',
                fontSize:13, fontWeight:700,
                background: pwTab === t.id ? '#fff' : 'transparent',
                color:      pwTab === t.id ? '#0d0d1a' : '#aaa',
                boxShadow:  pwTab === t.id ? '0 2px 10px rgba(0,0,0,.1)' : 'none',
                transition:'all .18s' }}>
              {t.label}
            </button>
          ))}
        </div>
      </Reveal>

      {/* ══════════ EMAIL TAB ══════════ */}
      {!pwTab && (
        <>
          <Reveal>
            <ToolCard style={{ marginBottom:18 }}>
              <div style={{ textAlign:'center', marginBottom:20 }}>
                <motion.div
                  animate={{ scale:[1,1.06,1] }}
                  transition={{ duration:2.4, repeat:Infinity, ease:'easeInOut' }}
                  style={{ fontSize:48, marginBottom:10 }}>🔓</motion.div>
                <div style={{ fontFamily:'Syne,sans-serif', fontSize:20, fontWeight:800,
                  color:'#0d0d1a', marginBottom:8 }}>
                  Has Your Email Been Breached?
                </div>
                <div style={{ fontSize:13, color:'#aaa', maxWidth:420, margin:'0 auto', lineHeight:1.7 }}>
                  Check against <strong style={{ color:'#666' }}>800+ known data breaches</strong> using
                  the Have I Been Pwned database
                </div>
              </div>

              <div style={{ display:'flex', gap:9 }}>
                <input type="email" className="inp"
                  placeholder="yourname@example.com"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError(''); setResult(null) }}
                  onKeyDown={e => e.key === 'Enter' && check()}
                  style={{ flex:1, fontSize:15 }}/>
                <motion.button
                  whileHover={{ scale:1.03, y:-2 }} whileTap={{ scale:.96 }}
                  transition={{ type:'spring', stiffness:500, damping:24 }}
                  onClick={check}
                  disabled={loading || !email.trim()}
                  style={{ padding:'13px 26px', borderRadius:13, border:'none',
                    background: email.trim() && !loading
                      ? 'linear-gradient(135deg,#0d0d1a,#1e1040)' : '#e5e7ef',
                    color:'#fff', fontFamily:'Syne,sans-serif', fontWeight:700,
                    fontSize:14, cursor: email.trim() && !loading ? 'pointer' : 'not-allowed',
                    whiteSpace:'nowrap' }}>
                  {loading ? '🔍 Checking…' : '🔍 Check'}
                </motion.button>
              </div>

              <AnimatePresence>
                {error && (
                  <motion.div initial={{ opacity:0, y:-4 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
                    style={{ marginTop:12, padding:'10px 14px', background:'rgba(239,68,68,.06)',
                      border:'1px solid rgba(239,68,68,.2)', borderRadius:10, fontSize:13, color:'#b91c1c' }}>
                    ⚠️ {error}
                    {error.includes('HIBP_API_KEY') && (
                      <a href="https://haveibeenpwned.com/API/Key" target="_blank" rel="noopener noreferrer"
                        style={{ color:'#4F8EF7', marginLeft:8, fontWeight:700 }}>Get API key →</a>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              <div style={{ marginTop:14, fontSize:11, color:'#bbb', textAlign:'center' }}>
                🔒 Your email is sent securely. Never stored. Powered by Have I Been Pwned.
              </div>

              <div style={{ marginTop: 14, textAlign: 'center' }}>
                <button
                  type="button"
                  onClick={() => setShowManualPlaybook(v => !v)}
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#4F8EF7',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    textDecoration: 'underline'
                  }}
                >
                  {showManualPlaybook ? 'Hide Incident Response Playbook ▲' : '🛡️ View 4-Phase Incident Response & Remediation Playbook ▼'}
                </button>
              </div>

              <AnimatePresence>
                {showManualPlaybook && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                    <BreachRemediationPlaybook email={email || 'Audited Account'} breachCount={result?.count || 0} />
                  </motion.div>
                )}
              </AnimatePresence>
            </ToolCard>
          </Reveal>

          {/* ── Result ── */}
          <AnimatePresence>
            {result && (
              <Reveal>
                {result.pwned ? (
                  <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }}
                    style={{ background:'linear-gradient(135deg,rgba(239,68,68,.07),rgba(239,68,68,.03))',
                      border:'1.5px solid rgba(239,68,68,.25)', borderRadius:20,
                      padding:'24px', marginBottom:18 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:18 }}>
                      <motion.div animate={{ rotate:[0,-8,8,0] }} transition={{ duration:.6, repeat:2 }}
                        style={{ fontSize:42 }}>⚠️</motion.div>
                      <div>
                        <div style={{ fontFamily:'Syne,sans-serif', fontWeight:800,
                          fontSize:20, color:'#b91c1c' }}>Oh no — pwned!</div>
                        <div style={{ fontSize:13, color:'#888', marginTop:2 }}>
                          Found in <strong style={{ color:'#b91c1c' }}>{result.count}</strong> data
                          breach{result.count !== 1 ? 'es' : ''}
                        </div>
                      </div>
                    </div>

                    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                      {(result.breaches || []).map((b, i) => (
                        <motion.div key={i} initial={{ opacity:0, x:-8 }} animate={{ opacity:1, x:0 }}
                          transition={{ delay:i*.06 }}
                          style={{ background:'#fff', borderRadius:13, padding:'14px 16px',
                            border:'1px solid rgba(239,68,68,.15)' }}>
                          <div style={{ display:'flex', justifyContent:'space-between',
                            alignItems:'flex-start', marginBottom:6 }}>
                            <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700,
                              fontSize:14, color:'#0d0d1a' }}>{b.name}</div>
                            <span style={{ fontSize:10.5, color:'#aaa', fontWeight:600 }}>{b.date}</span>
                          </div>
                          {b.description && (
                            <div style={{ fontSize:12, color:'#777', lineHeight:1.6, marginBottom:8 }}>
                              {b.description}
                            </div>
                          )}
                          <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
                            {(b.dataClasses || []).map((dc, j) => (
                              <span key={j} style={{ fontSize:10, padding:'2px 9px', borderRadius:999,
                                background:'rgba(239,68,68,.08)', color:'#b91c1c',
                                border:'1px solid rgba(239,68,68,.18)', fontWeight:600 }}>{dc}</span>
                            ))}
                          </div>
                        </motion.div>
                      ))}
                    </div>

                    <BreachRemediationPlaybook email={email} breachCount={result.count} />
                  </motion.div>
                ) : (
                  <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }}
                    style={{ background:'linear-gradient(135deg,rgba(34,197,94,.07),rgba(34,197,94,.03))',
                      border:'1.5px solid rgba(34,197,94,.25)', borderRadius:20,
                      padding:'32px', marginBottom:18, textAlign:'center' }}>
                    <motion.div animate={{ scale:[1,1.15,1] }} transition={{ duration:.5 }}
                      style={{ fontSize:54, marginBottom:14 }}>✅</motion.div>
                    <div style={{ fontFamily:'Syne,sans-serif', fontWeight:800,
                      fontSize:22, color:'#15803d', marginBottom:8 }}>
                      Good news — no breaches found!
                    </div>
                    <div style={{ fontSize:13.5, color:'#666', maxWidth:380,
                      margin:'0 auto', lineHeight:1.7 }}>
                      This email wasn't found in any known data breaches.
                      Stay safe by using strong, unique passwords.
                    </div>
                  </motion.div>
                )}
              </Reveal>
            )}
          </AnimatePresence>

          {/* ── History ── */}
          <AnimatePresence>
            {history.length > 0 && (
              <Reveal delay={.06}>
                <ToolCard style={{ marginBottom:18 }}>
                  <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700,
                    fontSize:13, color:'#0d0d1a', marginBottom:10 }}>🕐 Recent Checks</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    {history.map((h, i) => (
                      <div key={i} onClick={() => setEmail(h.email)}
                        style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                          padding:'8px 13px', background:'#fafbff', borderRadius:10,
                          border:'1px solid rgba(0,0,0,.06)', cursor:'pointer', fontSize:12.5 }}
                        onMouseEnter={e => e.currentTarget.style.background='#f0f4ff'}
                        onMouseLeave={e => e.currentTarget.style.background='#fafbff'}>
                        <span style={{ color:'#444' }}>{h.email}</span>
                        <span style={{ color: h.pwned ? '#ef4444' : '#22c55e', fontWeight:700 }}>
                          {h.pwned ? `⚠️ ${h.count} breach${h.count!==1?'es':''}` : '✅ Clean'}
                        </span>
                      </div>
                    ))}
                  </div>
                </ToolCard>
              </Reveal>
            )}
          </AnimatePresence>
        </>
      )}

      {/* ══════════ PASSWORD TAB ══════════ */}
      {pwTab && (
        <Reveal>
          <ToolCard style={{ marginBottom:18 }}>
            <div style={{ textAlign:'center', marginBottom:18 }}>
              <div style={{ fontSize:40, marginBottom:8 }}>🔑</div>
              <div style={{ fontFamily:'Syne,sans-serif', fontSize:17, fontWeight:800,
                color:'#0d0d1a', marginBottom:6 }}>
                Has This Password Been Exposed?
              </div>
              <div style={{ fontSize:12.5, color:'#aaa', lineHeight:1.7 }}>
                Uses k-anonymity — only the first 5 characters of the SHA-1 hash are sent.
                Your actual password never leaves your device.
              </div>
            </div>

            <div style={{ display:'flex', gap:9 }}>
              <input type="password" className="inp"
                placeholder="Enter password to check…"
                value={password}
                onChange={e => { setPassword(e.target.value); setPwResult(null) }}
                onKeyDown={e => e.key === 'Enter' && checkPassword()}
                style={{ flex:1, fontFamily:'monospace', fontSize:14 }}/>
              <motion.button
                whileHover={{ scale:1.03 }} whileTap={{ scale:.97 }}
                transition={{ type:'spring', stiffness:500, damping:24 }}
                onClick={checkPassword} disabled={!password || pwLoad}
                style={{ padding:'12px 22px', borderRadius:13, border:'none',
                  background: password && !pwLoad
                    ? 'linear-gradient(135deg,#0d0d1a,#1e1040)' : '#e5e7ef',
                  color:'#fff', fontWeight:700, fontSize:13,
                  cursor: password && !pwLoad ? 'pointer' : 'not-allowed', whiteSpace:'nowrap' }}>
                {pwLoad ? '🔍…' : '🔍 Check'}
              </motion.button>
            </div>

            <AnimatePresence>
              {pwResult && (
                <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
                  style={{ marginTop:16, padding:'16px', borderRadius:14,
                    background: pwResult.error
                      ? 'rgba(239,68,68,.06)'
                      : pwResult.pwned ? 'rgba(239,68,68,.06)' : 'rgba(34,197,94,.06)',
                    border: `1.5px solid ${pwResult.error || pwResult.pwned ? 'rgba(239,68,68,.25)' : 'rgba(34,197,94,.25)'}` }}>
                  {pwResult.error ? (
                    <div style={{ color:'#b91c1c', fontSize:13 }}>⚠️ {pwResult.error}</div>
                  ) : pwResult.pwned ? (
                    <>
                      <div style={{ fontFamily:'Syne,sans-serif', fontWeight:800,
                        fontSize:18, color:'#b91c1c', marginBottom:6 }}>⚠️ Password Exposed!</div>
                      <div style={{ fontSize:13, color:'#666', lineHeight:1.7 }}>
                        This password has appeared{' '}
                        <strong style={{ color:'#b91c1c' }}>{pwResult.count?.toLocaleString()}</strong>{' '}
                        times in data breaches. Never use it for any account.
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontFamily:'Syne,sans-serif', fontWeight:800,
                        fontSize:18, color:'#15803d', marginBottom:6 }}>✅ Password Not Found</div>
                      <div style={{ fontSize:13, color:'#666' }}>
                        This password hasn't appeared in known breaches.
                        Still, always use unique passwords for each account.
                      </div>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <div style={{ marginTop:12, fontSize:11, color:'#bbb', textAlign:'center' }}>
              🔒 k-anonymity model — only first 5 hex chars of SHA-1 hash are sent to HIBP API.
            </div>
          </ToolCard>
        </Reveal>
      )}

      {/* ── Info ── */}
      <Reveal delay={.08}>
        <ToolCard>
          <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:13,
            color:'#0d0d1a', marginBottom:12 }}>ℹ️ How It Works</div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {[
              { q:'What is "pwned"?',    a:'Your email appeared in a database leaked or stolen during a security breach of a website or service.' },
              { q:'Is my email stored?', a:'No. Your email is sent securely to the HIBP API for a one-time check and is never logged or stored by ToolDesk.' },
              { q:'What if I am pwned?', a:'Change your password immediately on the affected site, enable 2FA, and never reuse that password elsewhere.' },
              { q:'Password k-anonymity?',a:'Your password is hashed with SHA-1 in your browser. Only the first 5 characters of that hash are sent. HIBP returns all matching hashes so we can check locally — your real password never leaves your device.' },
            ].map(({ q, a }) => (
              <div key={q} style={{ padding:'10px 13px', background:'#f8f9ff',
                borderRadius:11, border:'1px solid rgba(0,0,0,.06)' }}>
                <div style={{ fontWeight:700, fontSize:12.5, color:'#0d0d1a', marginBottom:3 }}>❓ {q}</div>
                <div style={{ fontSize:11.5, color:'#777', lineHeight:1.6 }}>{a}</div>
              </div>
            ))}
          </div>
        </ToolCard>
      </Reveal>

    </ToolShell>
  )
}
