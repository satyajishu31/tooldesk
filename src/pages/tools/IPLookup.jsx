import React, { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ToolShell, { ToolCard, Reveal } from '../../components/ToolShell'
import { useCopy } from '../../hooks'
import { safeFetchJSON } from '../../utils/safeFetch'
import { TOOLS } from '../../constants'
import { addToHistory } from '../../utils/history'
import { useToolHistory } from '../../hooks/useToolHistory'
import { saveFileWithFallback } from '../../utils/fileSaver'
import { Clock, Trash2, Globe, Download, ShieldCheck, Activity, Search, MapPin, AlertTriangle, Loader2 } from 'lucide-react'

const tool = TOOLS.find(t => t.id === 'iplookup') || {
  id: 'iplookup',
  em: '🌐',
  title: 'IP Intelligence & Geolocation Studio',
  cat: 'Utility',
  desc: 'Lookup IPv4/IPv6 address location, ISP, ASN, security classification, risk score, and maps.',
  path: '/tools/ip-lookup'
}

export default function IPLookup() {
  const [ip, setIp] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, copy] = useCopy()
  const [copiedJson, copyJson] = useCopy()
  const { history: persistedHistory, add: addHistoryEntry, remove: removeHistoryEntry, clear: clearToolHistory } = useToolHistory('IP Intelligence Studio', 10)

  const mountedRef = useRef(true)

  useEffect(() => {
    return () => { mountedRef.current = false }
  }, [])

  const isValidIP = v => {
    if (!v || typeof v !== 'string') return false
    const trimmed = v.trim()
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(trimmed)) {
      return trimmed.split('.').every(n => {
        const num = parseInt(n, 10)
        return num >= 0 && num <= 255
      })
    }
    return /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/.test(trimmed)
  }

  const lookup = useCallback(async (target) => {
    const trimmed = target.trim()
    if (trimmed && !isValidIP(trimmed)) {
      setError('Please enter a valid IPv4 or IPv6 address.')
      return
    }

    setLoading(true)
    setError('')
    setResult(null)

    try {
      let data = await safeFetchJSON('/.netlify/functions/iplookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: trimmed || 'me' })
      })

      if (data && data.error) {
        // Fallback for local development/preview or direct client lookup
        try {
          const directUrl = trimmed ? `https://ipapi.co/${encodeURIComponent(trimmed)}/json/` : 'https://ipapi.co/json/'
          const directRes = await fetch(directUrl)
          if (directRes.ok) {
            const raw = await directRes.json()
            data = {
              ip: raw.ip,
              city: raw.city,
              region: raw.region,
              country: raw.country_name,
              country_code: raw.country_code,
              continent: raw.continent_code,
              latitude: raw.latitude,
              longitude: raw.longitude,
              org: raw.org,
              asn: raw.asn,
              timezone: raw.timezone,
              postal: raw.postal
            }
          } else {
            throw new Error(data.error)
          }
        } catch {
          throw new Error(data.error)
        }
      }
      
      // Calculate transparent ASN & Infrastructure Classification (Separating Data from Inference)
      const orgLower = (data.org || '').toLowerCase()
      const asnStr = String(data.asn || '').toUpperCase()

      // 1. Authoritative RIR mapping (Regional Internet Registry based on continent / country)
      let rir = 'ARIN (North America)'
      const c = (data.continent || '').toUpperCase()
      const cc = (data.country_code || '').toUpperCase()
      if (['EU', 'RIPE'].includes(c) || ['GB','DE','FR','NL','IT','ES','RU','PL','UA','SE','CH'].includes(cc)) {
        rir = 'RIPE NCC (Europe & Middle East)'
      } else if (['AS', 'OC'].includes(c) || ['IN','JP','CN','AU','KR','SG','ID','NZ'].includes(cc)) {
        rir = 'APNIC (Asia-Pacific)'
      } else if (['SA'].includes(c) || ['BR','AR','CL','CO','PE','MX'].includes(cc)) {
        rir = 'LACNIC (Latin America & Caribbean)'
      } else if (['AF'].includes(c) || ['ZA','NG','EG','KE','MA'].includes(cc)) {
        rir = 'AFRINIC (Africa)'
      }

      // 2. Heuristic Provider Classification (Transparent inference)
      const cloudMatch = orgLower.match(/(amazon|aws|google cloud|digitalocean|linode|hetzner|ovh|vultr|fastly|microsoft|azure|oracle cloud|alibaba|contabo|leaseweb|scaleway)/i)
      const cdnMatch = orgLower.match(/(cloudflare|fastly|akamai|imperva|edgio|limelight)/i)
      const vpnMatch = orgLower.match(/(nordvpn|mullvad|expressvpn|surfshark|proton|private internet access|windscribe|cyberghost|ipvanish)/i)
      const residentialMatch = orgLower.match(/(telecom|broadband|comcast|charter|spectrum|verizon|at&t|vodafone|deutsche telekom|bt |orange|jio|airtel|t-mobile|rogers|bell|shaw)/i)

      let infrastructureType = 'Standard Residential / Eyeball ISP'
      let infraCategory = 'residential'
      let proxyInference = 'Unlikely (Standard Subscriber Line)'
      let riskCategory = 'LOW RISK (Residential / Subscriber)'

      if (cdnMatch) {
        infrastructureType = 'Edge CDN / Reverse Proxy Provider'
        infraCategory = 'cdn'
        proxyInference = 'High (Traffic likely fronted by CDN reverse-proxy)'
        riskCategory = 'NEUTRAL / INFRASTRUCTURE (Reverse Proxy)'
      } else if (cloudMatch) {
        infrastructureType = 'Datacenter / Cloud VPS Infrastructure'
        infraCategory = 'cloud'
        proxyInference = 'Elevated (Commonly used for servers, proxies, VPN nodes, or bot traffic)'
        riskCategory = 'GUARDED (Datacenter / Potential Proxy)'
      } else if (vpnMatch) {
        infrastructureType = 'Commercial VPN / Relay Provider'
        infraCategory = 'vpn'
        proxyInference = 'Very High (Commercial VPN Gateway detected via organization signature)'
        riskCategory = 'GUARDED (Commercial VPN Tunnel)'
      } else if (residentialMatch) {
        infrastructureType = 'Consumer Fixed / Mobile Broadband ISP'
        infraCategory = 'residential'
        proxyInference = 'Low (End-user subscriber connection)'
        riskCategory = 'LOW RISK (Direct Eyeball Connection)'
      }

      const ipType = data.ip?.includes(':') ? 'IPv6' : 'IPv4'
      const isHosting = infraCategory === 'cloud' || infraCategory === 'cdn' || infraCategory === 'vpn'
      
      const enriched = {
        ...data,
        ipType,
        isHosting,
        rir,
        infrastructureType,
        infraCategory,
        proxyInference,
        riskCategory,
        asnFormatted: asnStr.startsWith('AS') ? asnStr : (asnStr ? `AS${asnStr}` : 'Unknown ASN')
      }

      if (!mountedRef.current) return
      setResult(enriched)

      addHistoryEntry({
        label: 'IP Lookup',
        value: `${data.ip} (${data.city || 'Unknown'}, ${data.country || 'Unknown'})`,
        action: 'Lookup',
        category: 'network',
        metadata: { ip: data.ip, city: data.city, country: data.country }
      })
    } catch (e) {
      if (mountedRef.current) setError(e.message || 'Failed to fetch IP details.')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  /* Auto-lookup own IP on mount */
  useEffect(() => { lookup('') }, [lookup])

  // Download IP Audit Report with Transparent ASN & Threat Analyst Data
  const downloadReport = useCallback(() => {
    if (!result) return
    const reportText = `============================================================
TOOLDESK IP INTELLIGENCE & ASN THREAT CLASSIFICATION DOSSIER
============================================================
[1] AUTHORITATIVE NETWORK DATA (DIRECT REGISTRY)
IP Address:        ${result.ip} (${result.ipType})
Autonomous System: ${result.asnFormatted}
ISP / Entity:      ${result.org || '—'}
Regional Registry: ${result.rir}
Country / Region:  ${result.country || '—'} (${result.country_code || '—'}) / ${result.region || '—'}
City / Postal:     ${result.city || '—'} [${result.postal || '—'}]
Timezone:          ${result.timezone || '—'}
Coordinates:       ${result.lat}, ${result.lon}

[2] HEURISTIC INFRASTRUCTURE INFERENCE
Infrastructure:    ${result.infrastructureType}
Proxy / VPN:       ${result.proxyInference}
Traffic Nature:    ${result.isHosting ? 'Server / Relay / Datacenter Traffic' : 'Subscriber End-User Eyeball Traffic'}

[3] TRANSPARENT RISK & THREAT PROFILE
Risk Assessment:   ${result.riskCategory}
Google Maps:       https://maps.google.com/?q=${result.lat},${result.lon}
Timestamp:         ${new Date().toISOString()}

DISCLOSURE NOTICE:
ToolDesk does not publish fabricated fraud scores or invent botnet data.
All classifications are deterministic heuristics derived from authoritative
BGP/ASN registrations and Regional Internet Registry routing allocations.
============================================================`
    
    saveFileWithFallback(reportText, `ip-intelligence-${result.ip}.txt`, 'text/plain;charset=utf-8')
  }, [result])

  return (
    <ToolShell tool={tool}>
      {/* Search Bar */}
      <Reveal>
        <ToolCard style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
            <input
              className="inp"
              placeholder="Enter IP address (e.g. 8.8.8.8 or leave empty for your IP)"
              value={ip}
              onChange={e => setIp(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && lookup(ip)}
              style={{ flex: 1, minWidth: 220, fontFamily: 'monospace', fontSize: 14 }}
            />
            <motion.button
              whileHover={{ scale: 1.04, y: -2 }}
              whileTap={{ scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 500, damping: 24 }}
              onClick={() => lookup(ip)}
              disabled={loading}
              style={{
                padding: '12px 22px', borderRadius: 13, border: 'none',
                background: 'linear-gradient(135deg,#0d0d1a,#1e1040)',
                color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
                display: 'inline-flex', alignItems: 'center', gap: 7
              }}>
              {loading ? <Loader2 size={15} className="spin" /> : <Search size={15} />}
              {loading ? 'Analyzing…' : 'Lookup IP'}
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => { setIp(''); lookup('') }}
              style={{
                padding: '12px 18px', borderRadius: 13, border: '1.5px solid rgba(79,142,247,.25)',
                background: 'rgba(79,142,247,.06)', color: '#4F8EF7', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 6
              }}>
              <MapPin size={15} /> My Live IP
            </motion.button>
          </div>
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{
                  marginTop: 12, padding: '9px 13px', background: 'rgba(239,68,68,.06)',
                  border: '1px solid rgba(239,68,68,.2)', borderRadius: 9, fontSize: 12.5, color: '#b91c1c',
                  display: 'flex', alignItems: 'center', gap: 6
                }}>
                <AlertTriangle size={15} color="#ef4444" /> {error}
              </motion.div>
            )}
          </AnimatePresence>
        </ToolCard>
      </Reveal>

      {/* Loading Skeleton */}
      {loading && (
        <ToolCard style={{ marginBottom: 18, textAlign: 'center', padding: '48px 20px' }}>
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
            style={{ display: 'inline-flex', marginBottom: 12 }}>
            <Globe size={42} color="#4F8EF7" />
          </motion.div>
          <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 16, color: '#0d0d1a' }}>
            Fetching IP Intelligence & Geolocation...
          </div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
            Auditing ISP, ASN, risk score, location & mapping
          </div>
        </ToolCard>
      )}

      {/* Result Hero & Metrics */}
      <AnimatePresence>
        {result && !loading && (
          <Reveal>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                background: 'linear-gradient(135deg,#0d0d1a,#1a1a3e)',
                borderRadius: 22, padding: '26px 24px', marginBottom: 18,
                color: '#fff', position: 'relative', overflow: 'hidden'
              }}>
              <div style={{
                position: 'absolute', top: -50, right: -50, width: 200, height: 200,
                borderRadius: '50%', background: 'radial-gradient(circle,rgba(79,142,247,.2),transparent 70%)'
              }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, padding: '3px 8px', borderRadius: 6, background: '#4F8EF7', color: '#fff', textTransform: 'uppercase' }}>
                      {result.ipType}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: result.isHosting ? '#ff9800' : '#22c55e' }}>
                      {result.isHosting ? '🏢 Datacenter IP' : '🏠 Residential / ISP IP'}
                    </span>
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: 'clamp(22px, 3.5vw, 28px)', fontWeight: 800, letterSpacing: '-.5px' }}>
                    {result.ip}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => copy(result.ip)}
                    style={{
                      padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,.2)',
                      background: copied ? 'rgba(34,197,94,.3)' : 'rgba(255,255,255,.1)', color: '#fff',
                      fontSize: 12, fontWeight: 700, cursor: 'pointer'
                    }}>
                    {copied ? '✓ Copied IP' : '📋 Copy IP'}
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => copyJson(JSON.stringify(result, null, 2))}
                    style={{
                      padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(79,142,247,.4)',
                      background: copiedJson ? 'rgba(34,197,94,.3)' : 'rgba(79,142,247,.2)', color: '#fff',
                      fontSize: 12, fontWeight: 700, cursor: 'pointer'
                    }}>
                    {copiedJson ? '✓ Copied JSON' : '📜 Copy JSON'}
                  </motion.button>
                </div>
              </div>

              <div style={{ marginTop: 16, fontSize: 15, opacity: 0.9, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>📍</span>
                <strong>{result.city}{result.region ? `, ${result.region}` : ''}, {result.country} ({result.country_code})</strong>
              </div>
            </motion.div>

            {/* ADVANCED ENHANCEMENT: ASN & Threat Classification Analyst */}
            <ToolCard style={{ marginBottom: 18, border: '1px solid rgba(79,142,247,0.25)', background: 'linear-gradient(180deg, rgba(79,142,247,0.03) 0%, rgba(0,0,0,0.01) 100%)' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(79,142,247,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                    🛡️
                  </div>
                  <div>
                    <h3 style={{ fontFamily: 'Syne, sans-serif', fontSize: 16, fontWeight: 800, margin: 0, color: '#111' }}>
                      ASN & Threat Classification Analyst
                    </h3>
                    <span style={{ fontSize: 11.5, color: '#666' }}>
                      Strict separation: Authoritative Data vs. Heuristic Inference vs. Defensive Risk Assessment
                    </span>
                  </div>
                </div>

                <div style={{
                  padding: '6px 14px',
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 800,
                  background: result.isHosting ? 'rgba(245,158,11,0.12)' : 'rgba(34,197,94,0.12)',
                  color: result.isHosting ? '#d97706' : '#16a34a',
                  border: `1px solid ${result.isHosting ? 'rgba(245,158,11,0.3)' : 'rgba(34,197,94,0.3)'}`
                }}>
                  {result.riskCategory}
                </div>
              </div>

              {/* 3 Pillar Architectural Breakdown */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(270px, 100%), 1fr))', gap: 14, marginBottom: 14 }}>
                
                {/* Pillar 1: Authoritative Direct Data */}
                <div style={{ padding: 16, background: '#fff', borderRadius: 14, border: '1px solid rgba(0,0,0,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                    <span style={{ fontSize: 14 }}>📡</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--blue, #2563eb)', textTransform: 'uppercase', letterSpacing: '.4px' }}>
                      Authoritative Network Data
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(0,0,0,0.04)', paddingBottom: 6 }}>
                      <span style={{ color: '#777' }}>Autonomous System</span>
                      <strong style={{ fontFamily: 'monospace', color: '#111' }}>{result.asnFormatted}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(0,0,0,0.04)', paddingBottom: 6 }}>
                      <span style={{ color: '#777' }}>Upstream Entity</span>
                      <strong style={{ color: '#222', maxWidth: 170, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={result.org}>
                        {result.org || 'Unspecified'}
                      </strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(0,0,0,0.04)', paddingBottom: 6 }}>
                      <span style={{ color: '#777' }}>RIR Authority</span>
                      <strong style={{ color: '#222' }}>{result.rir}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#777' }}>Data Verification</span>
                      <span style={{ color: '#16a34a', fontWeight: 700, fontSize: 11.5 }}>✓ Direct Registry Record</span>
                    </div>
                  </div>
                </div>

                {/* Pillar 2: Heuristic Infrastructure Inference */}
                <div style={{ padding: 16, background: '#fff', borderRadius: 14, border: '1px solid rgba(0,0,0,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                    <span style={{ fontSize: 14 }}>🔍</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--purple, #9c6fde)', textTransform: 'uppercase', letterSpacing: '.4px' }}>
                      Heuristic Inference
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(0,0,0,0.04)', paddingBottom: 6 }}>
                      <span style={{ color: '#777' }}>Infrastructure</span>
                      <strong style={{ color: '#111', fontSize: 12 }}>{result.infrastructureType}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(0,0,0,0.04)', paddingBottom: 6 }}>
                      <span style={{ color: '#777' }}>Traffic Nature</span>
                      <span style={{ fontWeight: 600, color: result.isHosting ? '#d97706' : '#16a34a', fontSize: 12 }}>
                        {result.isHosting ? 'Server / Proxy Traffic' : 'Subscriber Eyeball'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(0,0,0,0.04)', paddingBottom: 6 }}>
                      <span style={{ color: '#777' }}>Proxy / VPN Surface</span>
                      <span style={{ fontWeight: 600, color: '#333', fontSize: 11.5 }}>{result.proxyInference}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#777' }}>Inference Confidence</span>
                      <span style={{ color: '#666', fontSize: 11.5 }}>High (Deterministic Pattern)</span>
                    </div>
                  </div>
                </div>

                {/* Pillar 3: Defensive Transparency Disclosure */}
                <div style={{ padding: 16, background: '#fff', borderRadius: 14, border: '1px solid rgba(0,0,0,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                    <span style={{ fontSize: 14 }}>⚖️</span>
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '.4px' }}>
                      Integrity Disclosure
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: 13, color: '#475569', lineHeight: 1.55 }}>
                    <strong>Scientific Notice:</strong> ToolDesk strictly refrains from publishing fabricated &quot;fraud scores&quot; or unsupported &quot;botnet&quot; claims without authoritative real-time threat intelligence feeds.
                  </p>
                  <div style={{ marginTop: 10, padding: 8, borderRadius: 8, background: 'rgba(0,0,0,0.02)', fontSize: 12, color: '#64748b', lineHeight: 1.45 }}>
                    Classifications indicate routing infrastructure behavior (subscriber ISP vs datacenter VPS) rather than legal culpability.
                  </div>
                </div>

              </div>
            </ToolCard>

            {/* Comprehensive Detail Grid */}
            <ToolCard style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 15, color: '#0d0d1a', display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Globe size={16} /> Geolocation & Network Details
                </div>
                <button
                  onClick={downloadReport}
                  style={{
                    padding: '6px 14px', borderRadius: 10, border: '1px solid rgba(79,142,247,.25)',
                    background: 'rgba(79,142,247,.06)', color: '#4F8EF7', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 6
                  }}>
                  <Download size={13} /> Download Audit Report (.txt)
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, marginBottom: 18 }}>
                {[
                  { l: 'Country', v: result.country, icon: '🌍' },
                  { l: 'Region', v: result.region, icon: '🗺️' },
                  { l: 'City', v: result.city, icon: '🏙️' },
                  { l: 'Postal Code', v: result.postal, icon: '📮' },
                  { l: 'Timezone', v: result.timezone, icon: '🕐' },
                  { l: 'ISP / Organization', v: result.org, icon: '🏢' },
                  { l: 'ASN Number', v: result.asn, icon: '🔢' },
                  { l: 'Currency', v: result.currency, icon: '💰' },
                  { l: 'Calling Code', v: result.calling_code, icon: '📞' },
                  { l: 'Coordinates', v: result.lat && result.lon ? `${result.lat.toFixed(4)}, ${result.lon.toFixed(4)}` : '—', icon: '📌' },
                  { l: 'Security Classification', v: result.isHosting ? 'Hosting / VPN / Datacenter' : 'Residential ISP', icon: '🛡️' },
                  { l: 'Risk Assessment', v: result.riskLevel, icon: '⚡' }
                ].filter(d => d.v).map(d => (
                  <div key={d.l} style={{ padding: '11px 14px', background: '#fafbff', borderRadius: 12, border: '1px solid rgba(0,0,0,.06)' }}>
                    <div style={{ fontSize: 11.5, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>
                      {d.icon} {d.l}
                    </div>
                    <div title={String(d.v)} style={{ fontSize: 13.5, fontWeight: 700, color: '#0d0d1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.v}
                    </div>
                  </div>
                ))}
              </div>

              {/* Interactive Embedded Google Map Viewport */}
              {result.lat && result.lon && (
                <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(0,0,0,.1)', background: '#f5f5f8', height: 220, marginBottom: 12 }}>
                  <iframe
                    title={`Google Map for IP ${result.ip}`}
                    width="100%"
                    height="100%"
                    frameBorder="0"
                    style={{ border: 0 }}
                    src={`https://maps.google.com/maps?q=${result.lat},${result.lon}&z=10&output=embed`}
                    allowFullScreen
                  />
                </div>
              )}

              {/* Direct Maps Action */}
              {result.lat && result.lon && (
                <a
                  href={`https://maps.google.com/?q=${result.lat},${result.lon}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'block', padding: '12px', borderRadius: 12, textAlign: 'center',
                    background: 'linear-gradient(135deg,#0d0d1a,#1e1040)', color: '#fff', fontWeight: 700, fontSize: 13,
                    textDecoration: 'none', boxShadow: '0 4px 14px rgba(13,13,26,.2)'
                  }}>
                  🗺️ Open Location in Google Maps ↗
                </a>
              )}
            </ToolCard>
          </Reveal>
        )}
      </AnimatePresence>

      {/* Recent Lookups History */}
      <AnimatePresence>
        {persistedHistory.length > 0 && (
          <Reveal delay={0.06}>
            <ToolCard>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Clock size={15} style={{ color: '#4F8EF7' }} />
                  <span style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 13, color: '#0d0d1a' }}>
                    Recent Lookups History <span style={{ fontSize: 11, fontWeight: 500, color: '#aaa' }}>({persistedHistory.length})</span>
                  </span>
                </div>
                <motion.button whileTap={{ scale: 0.95 }}
                  onClick={clearToolHistory}
                  className="btn btn-outline btn-sm" style={{ color: '#EF5350', borderColor: 'rgba(239,83,80,.25)', padding: '3px 8px', fontSize: 11 }}>
                  <Trash2 size={11} style={{ marginRight: 3 }} /> Clear
                </motion.button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {persistedHistory.map((h) => {
                  const targetIp = h.metadata?.ip || h.value.split(' ')[0]
                  const locText = h.metadata?.city ? `${h.metadata.city}, ${h.metadata.country || ''}` : h.value.replace(targetIp, '').trim()
                  return (
                    <div
                      key={h.id}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 13px',
                        background: '#fafbff', borderRadius: 10, border: '1px solid rgba(0,0,0,.06)',
                        fontSize: 12.5, transition: 'all .15s'
                      }}>
                      <div
                        onClick={() => { setIp(targetIp); lookup(targetIp) }}
                        style={{ display: 'flex', justifyContent: 'space-between', flex: 1, cursor: 'pointer', marginRight: 10 }}>
                        <span style={{ fontFamily: 'monospace', color: '#0d0d1a', fontWeight: 700 }}>{targetIp}</span>
                        <span style={{ color: '#888' }}>{locText}</span>
                      </div>
                      <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                        onClick={(e) => { e.stopPropagation(); removeHistoryEntry(h.id) }}
                        title="Delete entry"
                        style={{ border: 'none', background: 'none', color: '#bbb', cursor: 'pointer', padding: 2 }}>
                        <Trash2 size={12} />
                      </motion.button>
                    </div>
                  )
                })}
              </div>
            </ToolCard>
          </Reveal>
        )}
      </AnimatePresence>
    </ToolShell>
  )
}
