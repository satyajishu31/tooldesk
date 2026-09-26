import React, { useState, useMemo, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useCopy } from '../hooks'

/**
 * ToolDesk Developer Utilities Studio
 * Integrated directly inside the Dev category (System Info & Audit).
 * 100% Client-Side, Zero Network Transmission, Web Crypto verified.
 */

export default function DeveloperUtilities() {
  const [activeUtil, setActiveUtil] = useState('json')
  const activeTabRef = useRef(null)

  const UTILITIES = [
    { id: 'json', label: 'JSON Studio', icon: '💾' },
    { id: 'jwt', label: 'JWT Inspector', icon: '🎫' },
    { id: 'regex', label: 'Regex Studio', icon: '🔣' },
    { id: 'sql', label: 'SQL Formatter', icon: '🗄️' },
    { id: 'uuid', label: 'UUID & Token Gen', icon: '🎲' },
    { id: 'time', label: 'Timestamp Studio', icon: '⏱️' },
    { id: 'url', label: 'URL Toolkit', icon: '🔗' },
  ]

  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [activeUtil])

  return (
    <div style={{ marginTop: 24 }}>
      {/* Sub-Tabs */}
      <div
        className="developer-utilities-tabs"
        style={{
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          padding: '6px',
          background: 'rgba(0, 0, 0, 0.04)',
          borderRadius: 14,
          marginBottom: 20,
          scrollSnapType: 'x mandatory',
          scrollbarWidth: 'none',
        }}
      >
        {UTILITIES.map(u => (
          <button
            key={u.id}
            ref={activeUtil === u.id ? activeTabRef : null}
            type="button"
            onClick={() => setActiveUtil(u.id)}
            style={{
              flex: '0 0 auto',
              scrollSnapAlign: 'start',
              padding: '9px 14px',
              borderRadius: 10,
              border: 'none',
              background: activeUtil === u.id ? '#ffffff' : 'transparent',
              color: activeUtil === u.id ? '#0f172a' : '#64748b',
              boxShadow: activeUtil === u.id ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
              fontFamily: 'DM Sans, sans-serif',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.18s ease'
            }}
          >
            <span style={{ marginRight: 6 }}>{u.icon}</span>
            {u.label}
          </button>
        ))}
      </div>

      {/* Utility Panel Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeUtil}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
        >
          {activeUtil === 'json' && <JsonStudio />}
          {activeUtil === 'jwt' && <JwtInspector />}
          {activeUtil === 'regex' && <RegexStudio />}
          {activeUtil === 'sql' && <SqlFormatter />}
          {activeUtil === 'uuid' && <UuidTokenGen />}
          {activeUtil === 'time' && <TimestampStudio />}
          {activeUtil === 'url' && <UrlToolkit />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   1. JSON STUDIO
   ───────────────────────────────────────────────────────────── */
function JsonStudio() {
  const [input, setInput] = useState('{\n  "status": "success",\n  "code": 200,\n  "data": {\n    "user": "developer",\n    "tools": 32\n  }\n}')
  const [error, setError] = useState('')
  const [copied, copy] = useCopy()

  const formatJson = () => {
    try {
      const parsed = JSON.parse(input)
      setInput(JSON.stringify(parsed, null, 2))
      setError('')
    } catch (e) {
      setError(`Invalid JSON: ${e.message}`)
    }
  }

  const minifyJson = () => {
    try {
      const parsed = JSON.parse(input)
      setInput(JSON.stringify(parsed))
      setError('')
    } catch (e) {
      setError(`Invalid JSON: ${e.message}`)
    }
  }

  const jsonToCsv = () => {
    try {
      const parsed = JSON.parse(input)
      const arr = Array.isArray(parsed) ? parsed : [parsed]
      if (!arr.length || typeof arr[0] !== 'object') throw new Error('Array of objects expected for CSV conversion')
      const keys = Object.keys(arr[0])
      const csv = [
        keys.join(','),
        ...arr.map(row => keys.map(k => JSON.stringify(row[k] ?? '')).join(','))
      ].join('\n')
      setInput(csv)
      setError('')
    } catch (e) {
      setError(`Cannot convert to CSV: ${e.message}`)
    }
  }

  const jsonToYaml = () => {
    try {
      const parsed = JSON.parse(input)
      const toYaml = (obj, indent = 0) => {
        let lines = []
        const sp = ' '.repeat(indent)
        for (const [k, v] of Object.entries(obj)) {
          if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
            lines.push(`${sp}${k}:`)
            lines.push(toYaml(v, indent + 2))
          } else if (Array.isArray(v)) {
            lines.push(`${sp}${k}:`)
            v.forEach(item => lines.push(`${sp}  - ${JSON.stringify(item)}`))
          } else {
            lines.push(`${sp}${k}: ${typeof v === 'string' ? `"${v}"` : v}`)
          }
        }
        return lines.join('\n')
      }
      setInput(toYaml(parsed))
      setError('')
    } catch (e) {
      setError(`Cannot convert to YAML: ${e.message}`)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" onClick={formatJson} className="btn btn-sm btn-primary">✨ Format / Beautify</button>
        <button type="button" onClick={minifyJson} className="btn btn-sm btn-outline">🗜️ Minify</button>
        <button type="button" onClick={jsonToCsv} className="btn btn-sm btn-outline">📊 JSON → CSV</button>
        <button type="button" onClick={jsonToYaml} className="btn btn-sm btn-outline">📑 JSON → YAML</button>
        <button type="button" onClick={() => copy(input)} className="btn btn-sm btn-outline">{copied ? '✓ Copied' : '📋 Copy'}</button>
      </div>

      {error && (
        <div style={{ padding: '8px 12px', background: '#fee2e2', color: '#b91c1c', borderRadius: 8, fontSize: 12 }}>
          ⚠️ {error}
        </div>
      )}

      <textarea
        value={input}
        onChange={e => { setInput(e.target.value); setError('') }}
        rows={12}
        className="inp mono"
        style={{ width: '100%', fontSize: 13, background: '#ffffff', boxSizing: 'border-box' }}
        placeholder="Paste JSON, CSV or YAML here..."
      />
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   2. JWT INSPECTOR
   ───────────────────────────────────────────────────────────── */
function JwtInspector() {
  const [token, setToken] = useState('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFsZXggRGV2IiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE5MTYyMzkwMjJ9.4z7k')
  
  const parsed = useMemo(() => {
    if (!token.trim()) return null
    const parts = token.trim().split('.')
    if (parts.length < 2) return { error: 'Invalid JWT structure. A JWT must consist of 3 period-separated parts.' }
    try {
      const b64UrlDecode = (str) => {
        let b64 = str.replace(/-/g, '+').replace(/_/g, '/')
        while (b64.length % 4) b64 += '='
        return decodeURIComponent(atob(b64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''))
      }
      const header = JSON.parse(b64UrlDecode(parts[0]))
      const payload = JSON.parse(b64UrlDecode(parts[1]))
      const isExpired = payload.exp ? Date.now() >= payload.exp * 1000 : null
      return { header, payload, isExpired, partsCount: parts.length }
    } catch (e) {
      return { error: `Failed to decode JWT: ${e.message}` }
    }
  }, [token])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="fgrp">
        <label className="lbl">Encoded JWT Token</label>
        <textarea
          value={token}
          onChange={e => setToken(e.target.value)}
          rows={3}
          className="inp mono"
          style={{ width: '100%', fontSize: 12, boxSizing: 'border-box' }}
          placeholder="Paste JWT string (header.payload.signature)..."
        />
      </div>

      <div style={{ fontSize: 11, color: '#64748b', background: '#f8fafc', padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
        🔒 <strong>Client-Side Inspection:</strong> Decoded entirely in browser memory. Cryptographic signature verification is not claimed without a server public key.
      </div>

      {parsed?.error ? (
        <div style={{ padding: '8px 12px', background: '#fee2e2', color: '#b91c1c', borderRadius: 8, fontSize: 12 }}>
          ⚠️ {parsed.error}
        </div>
      ) : parsed ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
          {/* Header */}
          <div style={{ background: '#f8fafc', padding: 14, borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', marginBottom: 8 }}>
              🔴 Header (Algorithm & Token Type)
            </div>
            <pre style={{ margin: 0, fontSize: 12, fontFamily: 'monospace', color: '#0f172a', whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(parsed.header, null, 2)}
            </pre>
          </div>

          {/* Payload */}
          <div style={{ background: '#f8fafc', padding: 14, borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#8b5cf6', textTransform: 'uppercase' }}>
                🟣 Payload (Claims & Data)
              </span>
              {parsed.isExpired !== null && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                  background: parsed.isExpired ? '#fee2e2' : '#dcfce7',
                  color: parsed.isExpired ? '#b91c1c' : '#15803d'
                }}>
                  {parsed.isExpired ? 'EXPIRED' : 'ACTIVE'}
                </span>
              )}
            </div>
            <pre style={{ margin: 0, fontSize: 12, fontFamily: 'monospace', color: '#0f172a', whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(parsed.payload, null, 2)}
            </pre>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   3. REGEX STUDIO
   ───────────────────────────────────────────────────────────── */
function RegexStudio() {
  const [pattern, setPattern] = useState('[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}')
  const [flags, setFlags] = useState('g')
  const [testText, setTestText] = useState('Contact support@tooldesk.com or admin@example.org for developer inquiries.')
  const [replaceWith, setReplaceWith] = useState('[REDACTED EMAIL]')

  const evaluation = useMemo(() => {
    if (!pattern) return { matches: [], error: null, replaced: testText }
    // ReDoS protection: cap text length
    const boundedText = testText.slice(0, 50000)
    try {
      const regex = new RegExp(pattern, flags)
      const matches = []
      let match
      if (flags.includes('g')) {
        let count = 0
        while ((match = regex.exec(boundedText)) !== null && count < 500) {
          matches.push({ val: match[0], index: match.index, groups: match.slice(1) })
          if (match.index === regex.lastIndex) regex.lastIndex++
          count++
        }
      } else {
        match = regex.exec(boundedText)
        if (match) matches.push({ val: match[0], index: match.index, groups: match.slice(1) })
      }
      const replaced = boundedText.replace(regex, replaceWith)
      return { matches, error: null, replaced }
    } catch (e) {
      return { matches: [], error: e.message, replaced: '' }
    }
  }, [pattern, flags, testText, replaceWith])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 10 }}>
        <div>
          <label className="lbl">Regular Expression Pattern</label>
          <input
            className="inp mono"
            value={pattern}
            onChange={e => setPattern(e.target.value)}
            placeholder="e.g. \b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b"
          />
        </div>
        <div>
          <label className="lbl">Flags</label>
          <input
            className="inp mono"
            value={flags}
            onChange={e => setFlags(e.target.value)}
            placeholder="g, i, m"
          />
        </div>
      </div>

      {evaluation.error && (
        <div style={{ padding: '8px 12px', background: '#fee2e2', color: '#b91c1c', borderRadius: 8, fontSize: 12 }}>
          ⚠️ Regex Error: {evaluation.error}
        </div>
      )}

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <label className="lbl" style={{ margin: 0 }}>Test String</label>
          <span style={{ fontSize: 11, color: '#64748b' }}>
            {evaluation.matches.length} match{evaluation.matches.length !== 1 ? 'es' : ''} found
          </span>
        </div>
        <textarea
          value={testText}
          onChange={e => setTestText(e.target.value)}
          rows={4}
          className="inp"
          style={{ width: '100%', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
        <div style={{ background: '#f8fafc', padding: 12, borderRadius: 10, border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', textTransform: 'uppercase', marginBottom: 6 }}>
            Matched Tokens ({evaluation.matches.length})
          </div>
          <div style={{ maxHeight: 120, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {evaluation.matches.length === 0 ? (
              <span style={{ fontSize: 12, color: '#94a3b8' }}>No matches found</span>
            ) : (
              evaluation.matches.map((m, idx) => (
                <div key={idx} style={{ fontSize: 12, background: '#ffffff', padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1' }}>
                  <span style={{ color: '#4F8EF7', fontWeight: 700 }}>#{idx + 1}:</span> <code style={{ color: '#0f172a' }}>{m.val}</code> <span style={{ color: '#94a3b8', fontSize: 10 }}>(at index {m.index})</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={{ background: '#f8fafc', padding: 12, borderRadius: 10, border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', textTransform: 'uppercase', marginBottom: 6 }}>
            Live Replacement Output
          </div>
          <input
            className="inp"
            style={{ fontSize: 12, padding: '4px 8px', marginBottom: 8 }}
            value={replaceWith}
            onChange={e => setReplaceWith(e.target.value)}
            placeholder="Replacement string..."
          />
          <div style={{ fontSize: 12, color: '#334155', maxHeight: 80, overflowY: 'auto', background: '#fff', padding: 8, borderRadius: 6, border: '1px solid #e2e8f0' }}>
            {evaluation.replaced}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   4. SQL FORMATTER
   ───────────────────────────────────────────────────────────── */
function SqlFormatter() {
  const [sql, setSql] = useState('select u.id, u.username, count(o.id) as total_orders from users u left join orders o on u.id = o.user_id where u.active = 1 and u.created_at >= "2026-01-01" group by u.id, u.username order by total_orders desc limit 50;')
  const [copied, copy] = useCopy()

  const formatSql = () => {
    const keywords = [
      'SELECT', 'FROM', 'WHERE', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'FULL JOIN', 'JOIN',
      'ON', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET', 'INSERT INTO', 'VALUES',
      'UPDATE', 'SET', 'DELETE FROM', 'UNION ALL', 'UNION', 'AND', 'OR', 'AS', 'DESC', 'ASC'
    ]
    let res = sql
    keywords.forEach(kw => {
      const reg = new RegExp(`\\b${kw}\\b`, 'gi')
      res = res.replace(reg, kw)
    })
    // Insert newlines for major clauses
    const major = ['SELECT', 'FROM', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'JOIN', 'WHERE', 'GROUP BY', 'ORDER BY', 'LIMIT', 'VALUES', 'SET']
    major.forEach(kw => {
      const reg = new RegExp(`\\s+(${kw})\\s+`, 'g')
      res = res.replace(reg, `\n$1 `)
    })
    setSql(res.trim())
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={formatSql} className="btn btn-sm btn-primary">⚡ Format SQL</button>
        <button type="button" onClick={() => copy(sql)} className="btn btn-sm btn-outline">{copied ? '✓ Copied' : '📋 Copy'}</button>
      </div>

      <textarea
        value={sql}
        onChange={e => setSql(e.target.value)}
        rows={10}
        className="inp mono"
        style={{ width: '100%', fontSize: 13, background: '#ffffff', boxSizing: 'border-box' }}
        placeholder="Enter SQL query to format..."
      />
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   5. UUID / TOKEN GENERATOR
   ───────────────────────────────────────────────────────────── */
function UuidTokenGen() {
  const safeRandomUUID = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      try { return crypto.randomUUID() } catch {}
    }
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c =>
        (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)
      )
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0
      return (c === 'x' ? r : ((r & 0x3) | 0x8)).toString(16)
    })
  }

  const [uuids, setUuids] = useState(() => [safeRandomUUID()])
  const [bulkCount, setBulkCount] = useState(5)
  const [tokenType, setTokenType] = useState('uuid') // 'uuid' | 'hex' | 'base64'
  const [copied, copy] = useCopy()

  const generate = () => {
    const list = []
    for (let i = 0; i < bulkCount; i++) {
      if (tokenType === 'uuid') {
        list.push(safeRandomUUID())
      } else if (tokenType === 'hex') {
        const arr = new Uint8Array(24)
        if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
          crypto.getRandomValues(arr)
        } else {
          for (let k = 0; k < 24; k++) arr[k] = Math.floor(Math.random() * 256)
        }
        list.push(Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join(''))
      } else {
        const arr = new Uint8Array(24)
        if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
          crypto.getRandomValues(arr)
        } else {
          for (let k = 0; k < 24; k++) arr[k] = Math.floor(Math.random() * 256)
        }
        list.push(btoa(String.fromCharCode(...arr)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''))
      }
    }
    setUuids(list)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          value={tokenType}
          onChange={e => setTokenType(e.target.value)}
          className="inp sel"
          style={{ width: 'auto' }}
        >
          <option value="uuid">RFC 4122 v4 UUID</option>
          <option value="hex">Cryptographic 48-char Hex Token</option>
          <option value="base64">URL-Safe Base64 Token</option>
        </select>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: '#64748b' }}>Count:</span>
          {[1, 5, 10, 20].map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setBulkCount(c)}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                border: bulkCount === c ? '1px solid #4F8EF7' : '1px solid #cbd5e1',
                background: bulkCount === c ? '#eff6ff' : '#ffffff',
                color: bulkCount === c ? '#1d4ed8' : '#334155',
                fontSize: 12,
                cursor: 'pointer'
              }}
            >
              {c}
            </button>
          ))}
        </div>

        <button type="button" onClick={generate} className="btn btn-sm btn-primary">🎲 Generate Fresh</button>
        <button type="button" onClick={() => copy(uuids.join('\n'))} className="btn btn-sm btn-outline">
          {copied ? '✓ Copied All' : '📋 Copy All'}
        </button>
      </div>

      <div style={{ background: '#f8fafc', padding: 14, borderRadius: 12, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto' }}>
        {uuids.map((id, idx) => (
          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ffffff', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }}>
            <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#0f172a' }}>{id}</span>
            <button
              type="button"
              onClick={() => copy(id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#4F8EF7' }}
            >
              Copy
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   6. TIMESTAMP STUDIO
   ───────────────────────────────────────────────────────────── */
function TimestampStudio() {
  const [unixInput, setUnixInput] = useState(() => Math.floor(Date.now() / 1000).toString())

  const parsed = useMemo(() => {
    const trimmed = (unixInput || '').trim()
    const n = Number(trimmed)
    if (isNaN(n) || !trimmed) return null
    // Detect whether seconds or milliseconds
    const date = Math.abs(n) > 1e11 ? new Date(n) : new Date(n * 1000)
    const time = date.getTime()
    if (isNaN(time) || time > 8640000000000000 || time < -8640000000000000) {
      return { isValid: false }
    }
    try {
      return {
        isValid: true,
        iso: date.toISOString(),
        utc: date.toUTCString(),
        local: date.toLocaleString(),
        sec: Math.floor(time / 1000),
        ms: time,
      }
    } catch {
      return { isValid: false }
    }
  }, [unixInput])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          className="inp mono"
          value={unixInput}
          onChange={e => setUnixInput(e.target.value)}
          placeholder="Enter Unix seconds or milliseconds..."
          style={{ flex: 1 }}
        />
        <button
          type="button"
          onClick={() => setUnixInput(Math.floor(Date.now() / 1000).toString())}
          className="btn btn-sm btn-outline"
        >
          ⏱️ Set Now
        </button>
      </div>

      {parsed && parsed.isValid && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          <div style={{ background: '#f8fafc', padding: 12, borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 10.5, color: '#64748b', fontWeight: 700 }}>ISO 8601 (UTC)</div>
            <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#0f172a', marginTop: 4 }}>{parsed.iso}</div>
          </div>
          <div style={{ background: '#f8fafc', padding: 12, borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 10.5, color: '#64748b', fontWeight: 700 }}>Local Timezone</div>
            <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#0f172a', marginTop: 4 }}>{parsed.local}</div>
          </div>
          <div style={{ background: '#f8fafc', padding: 12, borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 10.5, color: '#64748b', fontWeight: 700 }}>Unix Seconds</div>
            <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#059669', fontWeight: 700, marginTop: 4 }}>{parsed.sec}</div>
          </div>
          <div style={{ background: '#f8fafc', padding: 12, borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 10.5, color: '#64748b', fontWeight: 700 }}>Unix Milliseconds</div>
            <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#059669', fontWeight: 700, marginTop: 4 }}>{parsed.ms}</div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   7. URL TOOLKIT
   ───────────────────────────────────────────────────────────── */
function UrlToolkit() {
  const [urlInput, setUrlInput] = useState('https://tooldesk.com/tools/system-info?view=developer&theme=dark#overview')
  
  const parsed = useMemo(() => {
    try {
      const u = new URL(urlInput.trim())
      const params = []
      u.searchParams.forEach((v, k) => params.push({ key: k, val: v }))
      return {
        protocol: u.protocol,
        host: u.hostname,
        port: u.port || '(Default)',
        pathname: u.pathname,
        search: u.search || '(None)',
        hash: u.hash || '(None)',
        params,
        error: null
      }
    } catch {
      return { error: 'Please enter a valid complete URL (including https:// or http://).' }
    }
  }, [urlInput])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="fgrp">
        <label className="lbl">Target URL</label>
        <input
          className="inp mono"
          value={urlInput}
          onChange={e => setUrlInput(e.target.value)}
          placeholder="https://example.com/path?key=value#hash"
        />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => setUrlInput(encodeURI(urlInput))}
          className="btn btn-sm btn-outline"
        >
          🔏 Encode URI
        </button>
        <button
          type="button"
          onClick={() => {
            try { setUrlInput(decodeURIComponent(urlInput)) } catch {}
          }}
          className="btn btn-sm btn-outline"
        >
          🔓 Decode URI
        </button>
      </div>

      {parsed.error ? (
        <div style={{ padding: '8px 12px', background: '#fee2e2', color: '#b91c1c', borderRadius: 8, fontSize: 12 }}>
          ⚠️ {parsed.error}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
            <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}>
              <span style={{ color: '#64748b' }}>Protocol: </span>
              <strong>{parsed.protocol}</strong>
            </div>
            <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}>
              <span style={{ color: '#64748b' }}>Host: </span>
              <strong>{parsed.host}</strong>
            </div>
            <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}>
              <span style={{ color: '#64748b' }}>Path: </span>
              <strong>{parsed.pathname}</strong>
            </div>
            <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}>
              <span style={{ color: '#64748b' }}>Hash: </span>
              <strong>{parsed.hash}</strong>
            </div>
          </div>

          {parsed.params.length > 0 && (
            <div style={{ background: '#f8fafc', padding: 12, borderRadius: 10, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', textTransform: 'uppercase', marginBottom: 6 }}>
                Query Parameters ({parsed.params.length})
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 6 }}>
                {parsed.params.map((p, idx) => (
                  <div key={idx} style={{ background: '#ffffff', padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }}>
                    <code style={{ color: '#4F8EF7', fontWeight: 700 }}>{p.key}:</code> <span style={{ color: '#0f172a' }}>{p.val}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
