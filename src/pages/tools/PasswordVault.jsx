import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ToolShell, { ToolCard } from '../../components/ToolShell'
import { TOOLS } from '../../constants'
import { generateQRDataURL } from '../../utils/qrCode'
import { saveFileWithFallback } from '../../utils/fileSaver'
import { resolveApiUrl, getApiHeaders } from '../../utils/apiConfig'

const tool = TOOLS.find(t => t.id === 'vault')
const VAULT_KEY = 'tbpro_vault_v1'

const isCloudSyncEnabled = true

const WEAK_PASSWORDS = new Set([
  '123456', '12345678', '123456789', '1234567890', 'password', 'passwords',
  'qwerty', 'qwertyuiop', 'admin123', 'admin1234', 'welcome', 'welcome123',
  'iloveyou', 'letmein', 'letmein123', 'passphrase', 'masterpassword', '111111'
])

function validateMasterPasswordPolicy(pwd) {
  if (!pwd || typeof pwd !== 'string') return 'Master password is required.'
  if (pwd.length < 10) return 'New Master Password must be at least 10 characters long. A memorable passphrase is recommended.'
  if (WEAK_PASSWORDS.has(pwd.toLowerCase().trim())) {
    return 'This password is too common and easily guessed. Please choose a stronger master passphrase.'
  }
  return null
}

const SYNC_TOKEN_KEY = 'tbpro_vault_sync_token'

let _memorySyncToken = null

function getOrCreateSyncToken() {
  try {
    const stored = localStorage.getItem(SYNC_TOKEN_KEY)
    if (stored) return stored
  } catch {}

  if (_memorySyncToken) return _memorySyncToken

  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    _memorySyncToken = window.crypto.randomUUID()
  } else {
    const buf = new Uint8Array(16)
    window.crypto.getRandomValues(buf)
    _memorySyncToken = Array.from(buf, b => b.toString(16).padStart(2, '0')).join('')
  }
  try { localStorage.setItem(SYNC_TOKEN_KEY, _memorySyncToken) } catch {}
  return _memorySyncToken
}

async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/* Key stretching for Vault ID to protect against GPU offline brute-force attacks */
async function deriveVaultId(password, syncToken, prefix = 'tooldesk-vault-sync-') {
  const encoder = new TextEncoder()
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const salt = encoder.encode(`${prefix}${syncToken}`)
  const bits = await window.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
    256
  )
  return Array.from(new Uint8Array(bits), b => b.toString(16).padStart(2, '0')).join('')
}

/* Secure encryption using Web Crypto API (AES-GCM & PBKDF2) */
async function deriveKey(password, salt) {
  const encoder = new TextEncoder()
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

async function aesEncrypt(plaintext, password) {
  const encoder = new TextEncoder()
  const salt = window.crypto.getRandomValues(new Uint8Array(16))
  const iv = window.crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt)
  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext)
  )
  const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength)
  combined.set(salt, 0)
  combined.set(iv, salt.length)
  combined.set(new Uint8Array(encrypted), salt.length + iv.length)
  
  // Convert binary to base64 safely in chunks
  let binary = ''
  const bytes = new Uint8Array(combined)
  const chunk = 8192 // Stack-safe chunk size for mobile WebKit & V8
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

async function aesDecrypt(ciphertextB64, password) {
  try {
    if (!ciphertextB64 || typeof ciphertextB64 !== 'string') return null
    const binaryStr = atob(ciphertextB64)
    if (binaryStr.length < 44) return null // Requires 16-byte salt + 12-byte IV + 16-byte GCM auth tag minimum
    const combined = new Uint8Array(binaryStr.length)
    for (let i = 0; i < binaryStr.length; i++) {
      combined[i] = binaryStr.charCodeAt(i)
    }
    const salt = combined.slice(0, 16)
    const iv = combined.slice(16, 28)
    const encrypted = combined.slice(28)
    const key = await deriveKey(password, salt)
    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encrypted
    )
    return new TextDecoder().decode(decrypted)
  } catch (e) {
    return null
  }
}

/* ── Client-side QR Code generator (zero third-party API calls) ── */
function generateQRDataUrl(text) {
  try {
    if (!text || text.length > 1200) return null
    return generateQRDataURL(text, { size: 200, ecc: 'M' }) || null
  } catch {
    return null
  }
}

/* ── Pure Web Crypto TOTP / 2FA Generator (RFC 4648 compliant) ── */
function base32ToBytes(base32) {
  if (!base32 || typeof base32 !== 'string') return new Uint8Array(0)
  const b32 = base32.toUpperCase().replace(/[^A-Z2-7]/g, '')
  if (!b32) return new Uint8Array(0)
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = 0
  let value = 0
  const output = []

  for (let i = 0; i < b32.length; i++) {
    const val = alphabet.indexOf(b32[i])
    if (val === -1) continue
    value = ((value << 5) | val) >>> 0
    bits += 5
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255)
      bits -= 8
      value = value & ((1 << bits) - 1)
    }
  }
  return new Uint8Array(output)
}

async function generateTOTP(secretB32) {
  try {
    const keyBytes = base32ToBytes(secretB32)
    if (keyBytes.length === 0) return null

    const epoch = Math.floor(Date.now() / 1000)
    const timeStep = 30
    const counter = Math.floor(epoch / timeStep)
    const remaining = timeStep - (epoch % timeStep)

    const buffer = new ArrayBuffer(8)
    const view = new DataView(buffer)
    if (typeof view.setBigUint64 === 'function') {
      view.setBigUint64(0, BigInt(counter), false)
    } else {
      view.setUint32(0, Math.floor(counter / 0x100000000), false)
      view.setUint32(4, counter >>> 0, false)
    }

    const cryptoKey = await window.crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign']
    )

    const signature = await window.crypto.subtle.sign('HMAC', cryptoKey, buffer)
    const sigBytes = new Uint8Array(signature)
    const offset = sigBytes[sigBytes.length - 1] & 0xf

    const binary =
      (((sigBytes[offset] & 0x7f) << 24) |
       ((sigBytes[offset + 1] & 0xff) << 16) |
       ((sigBytes[offset + 2] & 0xff) << 8) |
       (sigBytes[offset + 3] & 0xff)) >>> 0

    const otp = (binary % 1000000).toString().padStart(6, '0')
    return { code: otp, remaining }
  } catch (e) {
    return null
  }
}

function TOTPBadge({ secret }) {
  const [totp, setTotp] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!secret) return
    let active = true
    const update = async () => {
      const res = await generateTOTP(secret)
      if (active) setTotp(res)
    }
    update()
    const timer = setInterval(update, 1000)
    return () => { active = false; clearInterval(timer) }
  }, [secret])

  if (!secret || !totp) return null

  const copyCode = (e) => {
    e?.stopPropagation?.()
    navigator.clipboard?.writeText(totp.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '4px 10px', borderRadius: 8, background: 'rgba(79,142,247,.08)',
      border: '1px solid rgba(79,142,247,.2)', marginTop: 6, cursor: 'pointer'
    }} onClick={copyCode} title="Click to copy 2FA Passcode">
      <span style={{ fontSize: 12, fontWeight: 700, color: '#4F8EF7' }}>🔑 2FA:</span>
      <span style={{ fontFamily: 'monospace', fontSize: 13.5, fontWeight: 800, color: '#0d0d1a', letterSpacing: '1px' }}>
        {totp.code.slice(0, 3)} {totp.code.slice(3)}
      </span>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: totp.remaining <= 5 ? '#ef4444' : '#64748b' }}>
        ({totp.remaining}s)
      </span>
      <span style={{ fontSize: 11.5, color: copied ? '#22c55e' : '#64748b' }}>
        {copied ? '✓' : '📋'}
      </span>
    </div>
  )
}

function parseCSV(text) {
  if (typeof text !== 'string' || !text.trim()) return []
  if (text.length > 1024 * 1024) {
    throw new Error('CSV file exceeds 1MB safety limit.')
  }
  const lines = []
  let row = [""]
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    const next = text[i+1]

    if (c === '"') {
      if (inQuotes && next === '"') {
        row[row.length - 1] += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (c === ',' && !inQuotes) {
      row.push("")
    } else if ((c === '\r' || c === '\n') && !inQuotes) {
      if (c === '\r' && next === '\n') i++
      lines.push(row)
      row = [""]
    } else {
      row[row.length - 1] += c
    }
  }
  if (row.length > 1 || row[0] !== "") {
    lines.push(row)
  }

  if (lines.length < 2) return []

  const headers = lines[0].map(h => h.trim().toLowerCase())
  let labelIdx = headers.findIndex(h => h.includes('name') || h.includes('title') || h.includes('label'))
  let userIdx = headers.findIndex(h => h.includes('username') || h.includes('login_username') || h.includes('user') || h.includes('login'))
  let pwdIdx = headers.findIndex(h => h.includes('password') || h.includes('login_password') || h.includes('pass'))
  
  if (pwdIdx === -1) return []
  if (labelIdx === -1) labelIdx = 0
  if (userIdx === -1) userIdx = labelIdx

  const imported = []
  for (let i = 1; i < lines.length && imported.length < 500; i++) {
    const r = lines[i]
    if (r.length <= pwdIdx) continue
    const label = r[labelIdx]?.trim() || 'Imported Entry'
    const username = r[userIdx]?.trim() || ''
    const password = r[pwdIdx]?.trim()
    if (password) {
      imported.push({ id: genId(), label, username, password })
    }
  }

  return imported
}

function exportCSV(entries) {
  const escapeCSV = (val) => {
    if (val === null || val === undefined) return '""'
    let str = String(val)
    if (/^[=+\-@\t\r]/.test(str)) {
      str = "'" + str
    }
    if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return `"${str}"`
  }

  const header = ['name', 'url', 'username', 'password', 'note'].map(escapeCSV).join(',')
  const rows = entries.map(e => [
    e.label || '',
    '',
    e.username || '',
    e.password || '',
    e.totpSecret ? `TOTP:${e.totpSecret}` : ''
  ].map(escapeCSV).join(',')).join('\r\n')

  const blob = new Blob([header + '\r\n' + rows], { type: 'text/csv;charset=utf-8;' })
  saveFileWithFallback(blob, 'tooldesk-vault-export.csv', 'text/csv;charset=utf-8;')
}

// 🛡️ Zero-Knowledge k-Anonymity Pwned Password Breach Checker
async function checkPwnedPassword(password) {
  if (!password) return 0
  try {
    const encoder = new TextEncoder()
    const data = encoder.encode(password)
    const hashBuffer = await crypto.subtle.digest('SHA-1', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const sha1Hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
    
    const prefix = sha1Hex.slice(0, 5)
    const suffix = sha1Hex.slice(5)

    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true' }
    })
    if (!res.ok) return 0
    const text = await res.text()
    
    const lines = text.split('\n')
    for (const line of lines) {
      const [lineSuffix, count] = line.split(':')
      if (lineSuffix.trim() === suffix) {
        return parseInt(count.trim(), 10) || 0
      }
    }
  } catch (err) {
    console.warn('Pwned password check failed:', err)
  }
  return 0
}

function genId() {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    return window.crypto.randomUUID()
  }
  const buf = new Uint8Array(12)
  window.crypto.getRandomValues(buf)
  return Array.from(buf, b => b.toString(16).padStart(2, '0')).join('')
}

/* Vault Door CSS component */
function VaultDoor({ isOpen, isShaking }) {
  return (
    <motion.div
      animate={isShaking ? { x:[-8,8,-8,8,-6,6,-4,4,0] } : {}}
      transition={{ duration:.5 }}
      style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
      <div style={{ position:'relative', width:100, height:100 }}>
        {/* Door */}
        <motion.div
          animate={{ rotateY: isOpen ? -130 : 0 }}
          transition={{ duration:.9, ease:[.22,1,.36,1] }}
          style={{ width:100, height:100, background:'linear-gradient(135deg,#607D8B,#37474F)', borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:isShaking?'0 0 20px rgba(255,82,82,.5)':'0 8px 24px rgba(0,0,0,.25)', transformOrigin:'left center', transformStyle:'preserve-3d', position:'relative', cursor:'default' }}>
          {/* Dial */}
          <motion.div
            animate={{ rotate: isOpen ? 360 : 0 }}
            transition={{ duration: .9 }}
            style={{ width:50, height:50, borderRadius:'50%', background:'linear-gradient(135deg,#90A4AE,#546E7A)', border:'3px solid rgba(255,255,255,.2)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'inset 0 2px 6px rgba(0,0,0,.3)' }}>
            <div style={{ width:4, height:20, background:'rgba(255,255,255,.7)', borderRadius:2, transformOrigin:'center bottom' }}/>
          </motion.div>
          {/* Handle */}
          <div style={{ position:'absolute', right:-8, top:'50%', transform:'translateY(-50%)', width:12, height:30, background:'#90A4AE', borderRadius:3, boxShadow:'0 2px 6px rgba(0,0,0,.2)' }}/>
          {/* Red glow on shake */}
          {isShaking && <div style={{ position:'absolute', inset:0, borderRadius:12, border:'3px solid rgba(255,82,82,.8)', boxShadow:'0 0 18px rgba(255,82,82,.6)' }}/>}
        </motion.div>
        {/* Vault interior (visible when open) */}
        {isOpen && (
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:.5 }}
            style={{ position:'absolute', inset:0, zIndex:-1, background:'linear-gradient(135deg,#1a1a2e,#0d0d1a)', borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', fontSize:32 }}>
            🏦
          </motion.div>
        )}
      </div>
      <motion.div
        animate={{ color: isShaking ? '#ef4444' : isOpen ? '#22c55e' : '#607D8B' }}
        style={{ fontSize:12, fontWeight:700, transition:'color .3s' }}>
        {isShaking ? '❌ Wrong Password' : isOpen ? '🔓 Vault Open' : '🔐 Vault Locked'}
      </motion.div>
    </motion.div>
  )
}

/* Password entry card */
function VaultCard({ entry, onDelete, onCopy }) {
  const [flipped, setFlipped]   = useState(false)
  const [keyFlying, setKeyFlying] = useState(false)
  const [pwnedCount, setPwnedCount] = useState(null)
  const [checkingPwned, setCheckingPwned] = useState(false)

  const handleCopy = () => {
    onCopy(entry.password)
    setKeyFlying(true)
    setTimeout(() => setKeyFlying(false), 800)
  }

  const handleCheckPwned = async (e) => {
    e.stopPropagation()
    setCheckingPwned(true)
    const count = await checkPwnedPassword(entry.password)
    setPwnedCount(count)
    setCheckingPwned(false)
  }

  const cardHeight = entry.totpSecret ? 134 : 108

  return (
    <motion.div layout initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-6 }}>
      <motion.div
        style={{ perspective:1000, height:cardHeight, cursor:'pointer' }}
        onClick={() => setFlipped(f => !f)}>
        <motion.div
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration:.4, ease:'easeInOut' }}
          style={{ width:'100%', height:'100%', position:'relative', transformStyle:'preserve-3d' }}>

          {/* Front */}
          <div style={{
            position:'absolute', inset:0, backfaceVisibility:'hidden',
            background:'#ffffff',
            borderRadius:14, padding:'14px 16px',
            border:'1px solid rgba(0,0,0,0.08)',
            boxShadow:'0 2px 8px rgba(0,0,0,.03), inset 0 1px 0 rgba(255,255,255,1)',
            display:'flex', alignItems:'center', justifyContent:'space-between', boxSizing:'border-box'
          }}>
            <div style={{ minWidth:0, flex:1, paddingRight:10 }}>
              <div style={{ fontSize:14.5, fontWeight:700, color:'#0d0d1a', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{entry.label}</div>
              <div style={{ fontSize:12, color:'#666', marginTop:2 }}>{entry.username || 'No username'} · {'•'.repeat(8)}</div>
              {entry.totpSecret && <TOTPBadge secret={entry.totpSecret}/>}
            </div>
            <div style={{ display:'flex', gap:8, flexShrink:0 }}>
              <button onClick={e => { e.stopPropagation(); handleCopy() }}
                aria-label="Copy password"
                style={{ width:36, height:36, borderRadius:10, border:'1px solid rgba(79,142,247,.22)', background:'rgba(79,142,247,.08)', boxShadow:'inset 0 1px 0 rgba(255,255,255,.8)', cursor:'pointer', fontSize:15, display:'flex', alignItems:'center', justifyContent:'center', position:'relative', overflow:'hidden', touchAction:'manipulation' }}>
                🔑
                {keyFlying && <motion.div initial={{ scale:0, y:0 }} animate={{ scale:1.5, y:-30, opacity:0 }} transition={{ duration:.7 }} style={{ position:'absolute', fontSize:16, pointerEvents:'none' }}>🔑</motion.div>}
              </button>
              <button onClick={e => { e.stopPropagation(); onDelete(entry.id) }}
                aria-label="Delete entry"
                style={{ width:36, height:36, borderRadius:10, border:'1px solid rgba(239,68,68,.2)', background:'rgba(239,68,68,.06)', cursor:'pointer', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', touchAction:'manipulation' }}>
                🗑
              </button>
            </div>
          </div>
          {/* Back (password revealed) */}
          <div style={{ position:'absolute', inset:0, backfaceVisibility:'hidden', transform:'rotateY(180deg)', background:'linear-gradient(135deg,rgba(79,142,247,.08),rgba(156,111,222,.06))', borderRadius:14, padding:'14px 16px', border:'1px solid rgba(79,142,247,.20)', boxShadow:'inset 0 1px 0 rgba(255,255,255,.85)', display:'flex', flexDirection:'column', justifyContent:'center', gap:5, boxSizing:'border-box' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontSize:11.5, color:'#4F8EF7', fontWeight:700, textTransform:'uppercase', letterSpacing:'.5px' }}>Password</div>
              <button onClick={handleCheckPwned} disabled={checkingPwned}
                style={{ background:'none', border:'none', fontSize:11.5, fontWeight:700, color: pwnedCount > 0 ? '#ef4444' : pwnedCount === 0 ? '#22c55e' : '#7C6FF7', cursor:'pointer' }}>
                {checkingPwned ? 'Checking…' : pwnedCount > 0 ? `⚠️ Leaked ${pwnedCount.toLocaleString()} times!` : pwnedCount === 0 ? '✓ Safe (0 breaches)' : '🛡️ Audit Breach'}
              </button>
            </div>
            <div style={{ fontFamily:'monospace', fontSize:15, fontWeight:700, color:'#0d0d1a', wordBreak:'break-all' }}>{entry.password}</div>
            <div style={{ fontSize:11.5, color:'#71717a' }}>Click to flip back</div>
          </div>
        </motion.div>
      </motion.div>
      <style>{`@keyframes pulse2{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.8)}}`}</style>
    </motion.div>
  )
}

export default function PasswordVault() {
  const [masterPwd, setMasterPwd]   = useState('')
  const [isOpen,    setIsOpen]      = useState(false)
  const [isShaking, setIsShaking]   = useState(false)
  const [entries,   setEntries]     = useState([])
  const [showAdd,   setShowAdd]     = useState(false)
  const [newLabel,  setNewLabel]    = useState('')
  const [newUser,   setNewUser]     = useState('')
  const [newPwd,    setNewPwd]      = useState('')
  const [newTotp,   setNewTotp]     = useState('')
  const [copyMsg,   setCopyMsg]     = useState('')
  const [tumblers,  setTumblers]    = useState(Array(8).fill(0))
  const [loading,   setLoading]     = useState(false)
  const [syncToken, setSyncToken]   = useState(() => getOrCreateSyncToken())
  const [showSyncCode, setShowSyncCode] = useState(false)
  const [importToken, setImportToken] = useState('')
  const [syncStatus, setSyncStatus] = useState(null) // null | 'syncing' | 'synced' | 'failed'
  const saveQueueRef = useRef(Promise.resolve())
  const [showQrSync, setShowQrSync] = useState(false)
  const [qrPayload, setQrPayload] = useState('')
  const [qrChunks, setQrChunks] = useState([])
  const [qrChunkIndex, setQrChunkIndex] = useState(0)
  const [importChunksMap, setImportChunksMap] = useState({})
  const [qrImportText, setQrImportText] = useState('')
  const [qrStatusMsg, setQrStatusMsg] = useState('')
  const [qrCopied, setQrCopied] = useState(false)
  const [hasLocalVault, setHasLocalVault] = useState(() => {
    try {
      return !!localStorage.getItem(VAULT_KEY)
    } catch {
      return false
    }
  })
  const [vaultMode, setVaultMode] = useState(() => {
    try {
      return localStorage.getItem(VAULT_KEY) ? 'unlock' : 'setup'
    } catch {
      return 'setup'
    }
  })
  const [confirmPwd, setConfirmPwd] = useState('')
  const [authError, setAuthError] = useState('')
  const [showOverwriteWarning, setShowOverwriteWarning] = useState(false)
  const broadcastRef = useRef(null)

  useEffect(() => {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      const channel = new BroadcastChannel('tooldesk_vault_channel')
      const legacyChannel = new BroadcastChannel('tooldesk_vault_channel')
      broadcastRef.current = channel
      const lockHandler = (event) => {
        if (event.data === 'LOCK_VAULT') {
          setIsOpen(false)
          setMasterPwd('')
          setEntries([])
        }
      }
      channel.onmessage = lockHandler
      legacyChannel.onmessage = lockHandler
      return () => {
        channel.close()
        legacyChannel.close()
        broadcastRef.current = null
      }
    }
  }, [])

  /* Lock body scroll and dismiss on Escape when QR sync modal is open */
  useEffect(() => {
    if (!showQrSync) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setShowQrSync(false)
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [showQrSync])

  const applyImportToken = (tokenVal) => {
    if (!tokenVal.trim()) return
    const cleanToken = tokenVal.trim()
    try {
      localStorage.setItem(SYNC_TOKEN_KEY, cleanToken)
    } catch {}
    _memorySyncToken = cleanToken
    setSyncToken(cleanToken)
    setImportToken('')
    alert('Sync Code updated successfully! Please re-open your vault to pull from the new cloud location.')
    lock()
  }

  const chunkString = (str, size = 750) => {
    const chunks = []
    for (let i = 0; i < str.length; i += size) {
      chunks.push(str.slice(i, i + size))
    }
    return chunks
  }

  const openQrSyncModal = async () => {
    try {
      const payload = JSON.stringify({ v: 2, entries })
      const enc = await aesEncrypt(payload, masterPwd)
      setQrPayload(enc)
      const hash = (await sha256(enc)).slice(0, 8)
      if (enc.length > 850) {
        const rawChunks = chunkString(enc, 750)
        const formatted = rawChunks.map((chunk, idx) => `TDV1:${idx + 1}:${rawChunks.length}:${hash}:${chunk}`)
        setQrChunks(formatted)
        setQrChunkIndex(0)
      } else {
        setQrChunks([enc])
        setQrChunkIndex(0)
      }
      setImportChunksMap({})
      setQrStatusMsg('')
      setQrImportText('')
      setQrCopied(false)
      setShowQrSync(true)
    } catch {
      alert('Could not encrypt vault for QR transfer.')
    }
  }

  const handleQrImport = async () => {
    const rawInput = qrImportText.trim()
    if (!rawInput) return
    try {
      let targetPayload = rawInput
      if (rawInput.startsWith('TDV1:')) {
        const parts = rawInput.split(':')
        if (parts.length >= 5) {
          const partIdx = parseInt(parts[1], 10)
          const totalParts = parseInt(parts[2], 10)
          const hash = parts[3]
          const chunkData = parts.slice(4).join(':')

          const updatedMap = { ...importChunksMap, [partIdx]: chunkData }
          setImportChunksMap(updatedMap)

          const collectedCount = Object.keys(updatedMap).length
          if (collectedCount < totalParts) {
            setQrStatusMsg(`📥 Received Part ${partIdx} of ${totalParts}. Please scan the remaining ${totalParts - collectedCount} QR part(s).`)
            setQrImportText('')
            return
          }

          let full = ''
          for (let p = 1; p <= totalParts; p++) {
            full += updatedMap[p] || ''
          }
          const fullHash = (await sha256(full)).slice(0, 8)
          if (fullHash !== hash) {
            setQrStatusMsg('⚠️ Integrity check failed. Reassembled data hash does not match.')
            return
          }
          targetPayload = full
        }
      }

      const decrypted = await aesDecrypt(targetPayload, masterPwd)
      if (!decrypted) {
        setQrStatusMsg('⚠️ Decryption failed. Please ensure the same Master Password is used.')
        return
      }
      const parsed = JSON.parse(decrypted)
      const newEntries = parsed.entries || (Array.isArray(parsed) ? parsed : null)
      if (Array.isArray(newEntries)) {
        const existingIds = new Set(entries.map(e => e.id || (e.label + e.username)))
        const merged = [...entries]
        let addedCount = 0
        for (const item of newEntries) {
          const key = item.id || (item.label + item.username)
          if (!existingIds.has(key)) {
            merged.push(item)
            addedCount++
          }
        }
        await save(merged)
        setQrStatusMsg(`✅ Successfully imported and merged ${addedCount} new password(s)!`)
        setImportChunksMap({})
        setTimeout(() => { setShowQrSync(false); setQrStatusMsg('') }, 1400)
      } else {
        setQrStatusMsg('⚠️ Unrecognized vault payload format.')
      }
    } catch {
      setQrStatusMsg('⚠️ Invalid encrypted vault payload.')
    }
  }

  // Animate tumblers as master password typed
  useEffect(() => {
    setTumblers(Array(8).fill(0).map((_, i) => masterPwd.charCodeAt(i) || 0))
  }, [masterPwd])

  // Inactivity auto-lock timer (locks vault after 5 minutes of no user interaction)
  useEffect(() => {
    if (!isOpen) return

    let timeoutId
    let lastReset = 0
    const resetTimer = (e) => {
      const now = Date.now()
      if (e && (e.type === 'mousemove' || e.type === 'scroll') && (now - lastReset < 4000)) {
        return
      }
      lastReset = now
      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        lock()
      }, 5 * 60 * 1000)
    }

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart']
    events.forEach(name => document.addEventListener(name, resetTimer, { passive: true }))

    resetTimer()

    return () => {
      clearTimeout(timeoutId)
      events.forEach(name => document.removeEventListener(name, resetTimer))
    }
  }, [isOpen])

  const tryOpen = async () => {
    if (!masterPwd || masterPwd.length < 4) {
      setIsShaking(true); setTimeout(() => setIsShaking(false), 600); return
    }
    setAuthError('')
    setLoading(true)
    try {
      let localEnc = null
      try {
        localEnc = localStorage.getItem(VAULT_KEY)
      } catch {}

      let remoteEnc = null
      try {
        const vaultId = await deriveVaultId(masterPwd, syncToken)
        const authToken = await deriveVaultId(masterPwd, syncToken, 'tooldesk-vault-auth-')
        const res = await fetch(resolveApiUrl('/.netlify/functions/vault-sync'), {
          method: 'POST',
          headers: getApiHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ action: 'get', vaultId, authToken })
        })
        if (res.ok) {
          const data = await res.json()
          if (data && data.encrypted_data) {
            remoteEnc = data.encrypted_data
          }
        }
      } catch (err) {
        console.warn('Cloud sync load failed, using local storage:', err)
      }

      // Try decrypting remote first if present, but NEVER overwrite local before verifying decryption!
      let decryptedData = null
      let successfulPayload = null

      if (remoteEnc) {
        const decRemote = await aesDecrypt(remoteEnc, masterPwd)
        if (decRemote) {
          try {
            decryptedData = JSON.parse(decRemote)
            successfulPayload = remoteEnc
            // Only update local storage after proven decryption success
            try { localStorage.setItem(VAULT_KEY, remoteEnc) } catch {}
            setHasLocalVault(true)
          } catch {
            console.warn('Remote vault payload was not valid JSON')
          }
        }
      }

      // If remote wasn't available or couldn't be decrypted, try local storage
      if (!decryptedData && localEnc) {
        const decLocal = await aesDecrypt(localEnc, masterPwd)
        if (decLocal) {
          try {
            decryptedData = JSON.parse(decLocal)
            successfulPayload = localEnc
          } catch {
            setIsShaking(true)
            setAuthError('Local vault data is corrupted or tampered.')
            setTimeout(() => setIsShaking(false), 600)
            return
          }
        }
      }

      if (decryptedData) {
        setEntries(Array.isArray(decryptedData) ? decryptedData : [])
        setIsOpen(true)
      } else {
        setIsShaking(true)
        setAuthError(localEnc || remoteEnc ? 'Wrong Master Password. Decryption failed.' : 'No existing vault found. If this is your first time, switch to "Create New Vault".')
        setTimeout(() => setIsShaking(false), 600)
      }
    } catch {
      setIsShaking(true)
      setAuthError('An error occurred while opening the vault.')
      setTimeout(() => setIsShaking(false), 600)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateVault = async (confirmedOverwrite = false) => {
    const policyErr = validateMasterPasswordPolicy(masterPwd)
    if (policyErr) {
      setAuthError(policyErr)
      return
    }
    if (masterPwd !== confirmPwd) {
      setAuthError('Passwords do not match. Please verify your password.')
      return
    }

    // Explicit Destructive Confirmation check if local vault already exists
    if (hasLocalVault && !confirmedOverwrite) {
      setShowOverwriteWarning(true)
      return
    }

    setAuthError('')
    setShowOverwriteWarning(false)
    setLoading(true)
    try {
      const enc = await aesEncrypt('[]', masterPwd)
      try { localStorage.setItem(VAULT_KEY, enc) } catch {}
      try {
        const vaultId = await deriveVaultId(masterPwd, syncToken)
        const authToken = await deriveVaultId(masterPwd, syncToken, 'tooldesk-vault-auth-')
        await fetch(resolveApiUrl('/.netlify/functions/vault-sync'), {
          method: 'POST',
          headers: getApiHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ action: 'put', vaultId, authToken, encryptedData: enc })
        })
      } catch (e) {
        console.warn('Initial cloud sync save failed:', e)
      }
      setEntries([])
      setHasLocalVault(true)
      setIsOpen(true)
    } catch {
      setAuthError('Failed to initialize encrypted vault. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const save = async (newEntries) => {
    // Chain saves sequentially to prevent race conditions and concurrent write collisions
    saveQueueRef.current = saveQueueRef.current.then(async () => {
      const enc = await aesEncrypt(JSON.stringify(newEntries), masterPwd)
      try { localStorage.setItem(VAULT_KEY, enc) } catch {}
      setEntries(newEntries)
      try {
        setSyncStatus('syncing')
        const vaultId = await deriveVaultId(masterPwd, syncToken)
        const authToken = await deriveVaultId(masterPwd, syncToken, 'tooldesk-vault-auth-')
        const res = await fetch(resolveApiUrl('/.netlify/functions/vault-sync'), {
          method: 'POST',
          headers: getApiHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ action: 'put', vaultId, authToken, encryptedData: enc })
        })
        if (!res.ok) {
          console.warn('Cloud sync save failed with status:', res.status)
          setSyncStatus('failed')
        } else {
          setSyncStatus('synced')
          setTimeout(() => setSyncStatus(null), 3500)
        }
      } catch (err) {
        console.warn('Cloud sync save network error:', err)
        setSyncStatus('failed')
      }
    })
    return saveQueueRef.current
  }

  const lock = () => {
    setIsOpen(false)
    setMasterPwd('')
    setConfirmPwd('')
    setAuthError('')
    setEntries([])
    try {
      broadcastRef.current?.postMessage('LOCK_VAULT')
    } catch {}
  }

  const addEntry = async () => {
    if (!newLabel.trim() || !newPwd.trim()) return
    const updated = [...entries, { id:genId(), label:newLabel, username:newUser, password:newPwd, totpSecret:newTotp.trim() }]
    await save(updated); setShowAdd(false); setNewLabel(''); setNewUser(''); setNewPwd(''); setNewTotp('')
  }

  const deleteEntry = async (id) => { await save(entries.filter(e => e.id !== id)) }

  const copyPwd = (pwd) => {
    navigator.clipboard?.writeText(pwd)
    setCopyMsg('Copied!'); setTimeout(() => setCopyMsg(''), 2000)
  }

  const genRandom = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'
    const len = chars.length
    // 2^32 = 4294967296; 4294967296 % 70 = 46; 4294967296 - 46 = 4294967250
    const limit = 4294967296 - (4294967296 % len)
    const buf = new Uint32Array(1)
    const pwdChars = []
    for (let i = 0; i < 16; i++) {
      let val
      do {
        window.crypto.getRandomValues(buf)
        val = buf[0]
      } while (val >= limit)
      pwdChars.push(chars[val % len])
    }
    setNewPwd(pwdChars.join(''))
  }

  return (
    <ToolShell tool={tool}>
      <ToolCard>
        {/* Vault door */}
        <div style={{ display:'flex', justifyContent:'center', marginBottom:24 }}>
          <VaultDoor isOpen={isOpen} isShaking={isShaking}/>
        </div>

        <AnimatePresence mode="wait">
          {/* ── LOCKED STATE ── */}
          {!isOpen && (
            <motion.div key="locked" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:.3}}>
              {/* Tumbler pins */}
              <div style={{ display:'flex', gap:4, justifyContent:'center', marginBottom:16, height:32 }}>
                {tumblers.slice(0,8).map((v,i) => (
                  <motion.div key={i} animate={{ y: masterPwd[i] ? -4 : 4 }} transition={{ duration:.15 }}
                    style={{ width:16, height:20, background:masterPwd[i]?'#4F8EF7':'rgba(0,0,0,.1)', borderRadius:3, transition:'background .2s', boxShadow:masterPwd[i]?'0 2px 8px rgba(79,142,247,.4)':'' }}/>
                ))}
              </div>

              <div style={{ display:'flex', gap:8, justifyContent:'center', marginBottom:18 }}>
                <button
                  type="button"
                  className={`btn btn-sm ${vaultMode === 'unlock' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize:12, padding:'6px 14px' }}
                  onClick={() => { setVaultMode('unlock'); setAuthError('') }}>
                  🔐 Unlock Existing Vault
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${vaultMode === 'setup' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize:12, padding:'6px 14px' }}
                  onClick={() => { setVaultMode('setup'); setAuthError('') }}>
                  ✨ Create New Vault
                </button>
              </div>

              {authError && (
                <div style={{ background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.3)', borderRadius:10, padding:'8px 12px', fontSize:12, fontWeight:600, color:'#ef4444', textAlign:'center', marginBottom:14 }}>
                  ⚠️ {authError}
                </div>
              )}

              <div className="fgrp">
                <label className="lbl">{vaultMode === 'setup' ? 'Create Master Password (min 10 chars)' : 'Master Password'}</label>
                <input className="inp" type="password" value={masterPwd}
                  onChange={e => { setMasterPwd(e.target.value); setAuthError('') }}
                  onKeyDown={e => e.key === 'Enter' && (vaultMode === 'setup' ? handleCreateVault() : tryOpen())}
                  placeholder={vaultMode === 'setup' ? 'Enter a strong master password' : 'Enter your master password'}
                  style={{ fontSize:16, letterSpacing:2 }}/>
              </div>

              {vaultMode === 'setup' && (
                <div className="fgrp" style={{ marginTop:12 }}>
                  <label className="lbl">Confirm Master Password</label>
                  <input className="inp" type="password" value={confirmPwd}
                    onChange={e => { setConfirmPwd(e.target.value); setAuthError('') }}
                    onKeyDown={e => e.key === 'Enter' && handleCreateVault()}
                    placeholder="Re-enter master password to confirm"
                    style={{ fontSize:16, letterSpacing:2 }}/>
                </div>
              )}

              <p style={{ fontSize:12.5, color:'#64748b', marginTop:7, marginBottom:16, lineHeight:1.6 }}>
                {isCloudSyncEnabled ? (
                  <span>☁️ <strong style={{ color:'#334155' }}>Cloud Sync Enabled.</strong> Data is Zero-Knowledge encrypted locally before backing up to Supabase.</span>
                ) : (
                  <span>⚠️ <strong style={{ color:'#334155' }}>Your data stays local.</strong> Passwords are AES-GCM-encrypted in localStorage. If you forget your master password, data cannot be recovered.</span>
                )}
              </p>

              {showOverwriteWarning && (
                <div style={{
                  marginBottom: 16, padding: '14px 16px', borderRadius: 12,
                  background: '#fff1f2', border: '1.5px solid #f43f5e',
                  color: '#9f1239', textAlign: 'left'
                }}>
                  <div style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <span>⚠️</span> Existing Vault Detected
                  </div>
                  <div style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
                    An encrypted vault already exists on this device. Initializing a new vault will permanently overwrite and delete your existing credentials.
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setShowOverwriteWarning(false)}
                      style={{ flex: 1, padding: '7px 12px' }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCreateVault(true)}
                      style={{
                        flex: 1, padding: '7px 12px', borderRadius: 8, background: '#e11d48',
                        color: '#fff', border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer'
                      }}
                    >
                      Yes, Erase & Overwrite
                    </button>
                  </div>
                </div>
              )}

              {vaultMode === 'setup' ? (
                <button className="btn btn-primary btn-w btn-lg" onClick={() => handleCreateVault(false)} disabled={loading}>
                  {loading ? '⏳ Initializing Secure Vault…' : '✨ Initialize & Encrypt Vault'}
                </button>
              ) : (
                <button className="btn btn-primary btn-w btn-lg" onClick={tryOpen} disabled={loading}>
                  {loading ? '⏳ Syncing & Decrypting…' : '🔐 Open Vault'}
                </button>
              )}

              {isCloudSyncEnabled && (
                <div style={{ marginTop: 24, padding: 14, background: '#fafbff', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>
                    ☁️ Cloud Sync Settings
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div>
                      <button className="btn btn-secondary btn-sm" onClick={() => setShowSyncCode(s => !s)} style={{ fontSize: 12, padding: '5px 12px', width: 'auto', display: 'inline-block' }}>
                        {showSyncCode ? 'Hide Sync Code' : 'Show Sync Code'}
                      </button>
                      <p style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                        To sync this vault with another device, you must match the Sync Code.
                      </p>
                    </div>

                    {showSyncCode && (
                      <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                        style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                        <input className="inp" readOnly value={syncToken} style={{ flex: 1, fontFamily: 'monospace', fontSize: 12.5, padding: '6px 10px', background: '#fff' }}/>
                        <button className="btn btn-secondary btn-sm" onClick={() => { navigator.clipboard?.writeText(syncToken); alert('Sync Code copied!') }} style={{ width: 'auto' }}>
                          📋 Copy
                        </button>
                      </motion.div>
                    )}

                    <div style={{ borderTop: '1px dashed rgba(0,0,0,0.08)', paddingTop: 10, marginTop: 4 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>Link Another Device</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input className="inp" placeholder="Paste Sync Code from other device" value={importToken}
                          onChange={e => setImportToken(e.target.value)}
                          style={{ flex: 1, fontFamily: 'monospace', fontSize: 12.5, padding: '6px 10px' }}/>
                        <button className="btn btn-primary btn-sm" onClick={() => applyImportToken(importToken)} style={{ padding: '6px 12px', width: 'auto' }}>
                          Link
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* ── OPEN STATE ── */}
          {isOpen && (
            <motion.div key="open" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:.3}}>
              {copyMsg && (
                <motion.div initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} exit={{opacity:0}}
                  style={{ background:'rgba(34,197,94,.1)', border:'1px solid rgba(34,197,94,.3)', borderRadius:10, padding:'8px 14px', fontSize:13, fontWeight:600, color:'#22c55e', textAlign:'center', marginBottom:14 }}>
                  ✅ {copyMsg}
                </motion.div>
              )}

              {/* Header */}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18, flexWrap:'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontFamily:'Syne,sans-serif', fontSize:16, fontWeight:700, color:'#0d0d1a' }}>
                    🔓 {entries.length} password{entries.length !== 1 ? 's' : ''}
                  </div>
                  {syncStatus === 'syncing' && <span style={{ fontSize: 12, color: '#4F8EF7', fontWeight: 600 }}>⏳ Syncing…</span>}
                  {syncStatus === 'synced' && <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>✓ Cloud synced</span>}
                  {syncStatus === 'failed' && <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 600 }}>⚠️ Cloud sync error (local copy saved)</span>}
                </div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  <button className="btn btn-blue btn-sm" onClick={() => setShowAdd(a => !a)}>
                    {showAdd ? '✕ Cancel' : '+ Add New'}
                  </button>
                  <button className="btn btn-outline btn-sm" onClick={lock}>🔐 Lock</button>
                  <button className="btn btn-outline btn-sm" onClick={openQrSyncModal}>
                    📱 QR Sync
                  </button>
                  <button className="btn btn-outline btn-sm"
                    onClick={async ()=>{
                      const payload = JSON.stringify({ v: 2, entries })
                      const encryptedData = await aesEncrypt(payload, masterPwd)
                      const exportObj = { encrypted: true, data: encryptedData }
                      const dataStr = JSON.stringify(exportObj, null, 2)
                      saveFileWithFallback(dataStr, 'vault-backup-encrypted.json', 'application/json')
                    }}>
                    ⬇ Export JSON
                  </button>
                  <label className="btn btn-outline btn-sm" style={{cursor:'pointer',margin:0}}>
                    📂 Import JSON
                    <input type="file" accept=".json" style={{display:'none'}}
                      onChange={e=>{
                        const f=e.target.files[0]; if(!f) return
                        const r=new FileReader()
                        r.onload=async ev=>{
                          try{
                            const d=JSON.parse(ev.target.result)
                            let importedEntries = null
                            if (d.encrypted && d.data) {
                              const decrypted = await aesDecrypt(d.data, masterPwd)
                              if (decrypted) {
                                const parsed = JSON.parse(decrypted)
                                importedEntries = parsed.entries
                              } else {
                                alert('Wrong password or corrupted backup file.')
                                return
                              }
                            } else if (d.entries && Array.isArray(d.entries)) {
                              importedEntries = d.entries
                            }
                            if (importedEntries && Array.isArray(importedEntries)) {
                              await save([...entries, ...importedEntries.filter(x => x.id && x.label)])
                              alert(`Successfully imported ${importedEntries.length} item(s)!`)
                            } else {
                              alert('Invalid vault backup format.')
                            }
                          } catch { alert('Invalid vault backup file.') }
                        }
                        r.readAsText(f); e.target.value=''
                      }}/>
                  </label>
                  <button className="btn btn-outline btn-sm"
                    onClick={() => exportCSV(entries)}>
                    📄 Export CSV
                  </button>
                  <label className="btn btn-outline btn-sm" style={{cursor:'pointer',margin:0}}>
                    📂 Import CSV
                    <input type="file" accept=".csv" style={{display:'none'}}
                      onChange={e=>{
                        const f=e.target.files[0]; if(!f) return
                        const r=new FileReader()
                        r.onload=async ev=>{
                          try{
                            const text = ev.target.result
                            const imported = parseCSV(text)
                            if (imported && imported.length > 0) {
                              await save([...entries, ...imported])
                              alert(`Successfully imported ${imported.length} password(s) from CSV!`)
                            } else {
                              alert('Could not find any passwords to import. Make sure your CSV contains name/username/password headers.')
                            }
                          } catch { alert('Invalid CSV file.') }
                        }
                        r.readAsText(f); e.target.value=''
                      }}/>
                  </label>
                </div>
              </div>

              {/* Add form */}
              <AnimatePresence>
                {showAdd && (
                  <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}}
                    style={{ overflow:'hidden', marginBottom:18 }}>
                    <div style={{
                      background: '#f8faff',
                      borderRadius: 14, padding: 16,
                      border: '1px solid rgba(79,142,247,.18)',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,.95)'
                    }}>
                      <div className="fgrp">
                        <label className="lbl">Label</label>
                        <input className="inp" value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Google, GitHub, Netflix…"/>
                      </div>
                      <div className="fgrp">
                        <label className="lbl">Username / Email (optional)</label>
                        <input className="inp" value={newUser} onChange={e => setNewUser(e.target.value)} placeholder="you@email.com"/>
                      </div>
                      <div className="fgrp">
                        <label className="lbl">Password</label>
                        <div style={{ display:'flex', gap:8 }}>
                          <input className="inp" type="text" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="Enter or generate" style={{ fontFamily:'monospace', fontSize:13 }}/>
                          <button className="btn btn-outline btn-sm" onClick={genRandom} style={{ flexShrink:0 }}>🎲 Gen</button>
                        </div>
                      </div>
                      <div className="fgrp">
                        <label className="lbl">🔑 2FA / TOTP Secret Key (optional)</label>
                        <input className="inp" type="text" value={newTotp} onChange={e => setNewTotp(e.target.value)} placeholder="e.g. JBSWY3DPEHPK3PXP" style={{ fontFamily:'monospace', fontSize:12 }}/>
                      </div>
                      <button className="btn btn-primary btn-w" onClick={addEntry}>💾 Save Entry</button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Entries */}
              {entries.length === 0 ? (
                <div style={{ textAlign:'center', padding:'32px 0', color:'#ccc', fontSize:13 }}>
                  <div style={{ fontSize:40, marginBottom:10 }}>🏦</div>
                  Vault is empty. Add your first password!
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  <AnimatePresence>
                    {entries.map((e, i) => (
                      <VaultCard key={e.id} entry={e} onCopy={copyPwd} onDelete={deleteEntry} index={i}/>
                    ))}
                  </AnimatePresence>
                </div>
              )}

              <p style={{ fontSize:11, color:'#bbb', textAlign:'center', marginTop:18 }}>
                Click any card to flip and reveal password. All data stored locally in your browser.
              </p>

              {/* Zero-Knowledge Peer QR Sync Modal */}
              <AnimatePresence>
                {showQrSync && (
                  <div
                    role="dialog"
                    aria-modal="true"
                    onClick={() => setShowQrSync(false)}
                    style={{
                      position:'fixed', inset:0, zIndex:9999, display:'flex',
                      alignItems:'center', justifyContent:'center', padding:16,
                      background:'rgba(13,13,26,0.45)', backdropFilter:'blur(16px)',
                      WebkitBackdropFilter:'blur(16px)'
                    }}>
                    <motion.div
                      initial={{ opacity:0, y:12 }}
                      animate={{ opacity:1, y:0 }}
                      exit={{ opacity:0, y:8 }}
                      transition={{ duration:0.18, ease:[0.22,1,0.36,1] }}
                      onClick={e => e.stopPropagation()}
                      style={{
                        background:'#ffffff',
                        borderRadius:24, maxWidth:520, width:'100%',
                        padding:24, boxShadow:'0 24px 64px rgba(13,13,26,0.22)',
                        border:'1px solid rgba(0,0,0,0.08)', position:'relative',
                        maxHeight:'90vh', overflowY:'auto'
                      }}>
                      {/* Close button */}
                      <button
                        onClick={() => setShowQrSync(false)}
                        style={{
                          position:'absolute', top:16, right:16,
                          border:'1px solid rgba(0,0,0,0.08)',
                          background:'rgba(0,0,0,0.04)',
                          borderRadius:'50%', width:28,
                          height:28, cursor:'pointer', display:'flex', alignItems:'center',
                          justifyContent:'center', fontSize:13, color:'#666',
                          transition:'background .18s, color .18s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background='rgba(0,0,0,0.08)'}
                        onMouseLeave={e => e.currentTarget.style.background='rgba(0,0,0,0.04)'}>
                        ✕
                      </button>

                      <div style={{ fontFamily:'Syne,sans-serif', fontSize:18, fontWeight:800, color:'#0d0d1a', marginBottom:4 }}>
                        📱 Zero-Knowledge Device Transfer
                      </div>
                      <p style={{ fontSize:12.5, color:'#666', lineHeight:1.6, marginBottom:16 }}>
                        Transfer your encrypted vault directly between devices without cloud servers. Protected by your master password with AES-GCM 256-bit encryption.
                      </p>

                      {/* Multi-chunk QR or Single QR Display */}
                      {qrChunks.length > 0 && (
                        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10, marginBottom:18 }}>
                          {(() => {
                            const currentChunk = qrChunks[qrChunkIndex] || qrPayload
                            const dataUrl = generateQRDataUrl(currentChunk)
                            return dataUrl ? (
                              <img
                                src={dataUrl}
                                alt="Encrypted Vault QR"
                                style={{ width:200, height:200, borderRadius:12, border:'1.5px solid rgba(79,142,247,.2)', background:'#fff' }}
                              />
                            ) : (
                              <div style={{ width:200, height:200, borderRadius:12, border:'1.5px solid rgba(79,142,247,.2)', background:'#f8f9fc', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, color:'#888' }}>
                                QR preview unavailable
                              </div>
                            )
                          })()}

                          {qrChunks.length > 1 && (
                            <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:4 }}>
                              <button
                                className="btn btn-outline btn-sm"
                                disabled={qrChunkIndex <= 0}
                                onClick={() => setQrChunkIndex(i => Math.max(0, i - 1))}
                                style={{ padding:'4px 10px', fontSize:12 }}>
                                ← Prev
                              </button>
                              <span style={{ fontSize:12, fontWeight:700, color:'#4F8EF7' }}>
                                Part {qrChunkIndex + 1} of {qrChunks.length}
                              </span>
                              <button
                                className="btn btn-outline btn-sm"
                                disabled={qrChunkIndex >= qrChunks.length - 1}
                                onClick={() => setQrChunkIndex(i => Math.min(qrChunks.length - 1, i + 1))}
                                style={{ padding:'4px 10px', fontSize:12 }}>
                                Next →
                              </button>
                            </div>
                          )}

                          <span style={{ fontSize:11, color:'#888' }}>
                            {qrChunks.length > 1 ? 'Scan each QR part sequentially on the receiving device' : 'Scan with another device camera or use the encrypted token below'}
                          </span>
                        </div>
                      )}

                      {/* Export Encrypted File button for large vaults */}
                      <div style={{ marginBottom: 14 }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            const exportObj = {
                              type: 'tooldesk-vault-backup',
                              version: 2,
                              created_at: new Date().toISOString(),
                              encrypted_data: qrPayload,
                            }
                            const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' })
                            saveFileWithFallback(blob, 'tooldesk-vault-backup.tooldesk-vault')
                          }}
                          style={{ width:'100%', fontSize:12, padding:'7px 12px' }}>
                          💾 Export Encrypted Backup File (.tooldesk-vault)
                        </button>
                      </div>

                      {/* Raw encrypted token copy */}
                      <div style={{ marginBottom:18 }}>
                        <label className="lbl">Encrypted Ciphertext Token</label>
                        <textarea
                          readOnly
                          value={qrPayload}
                          style={{
                            width:'100%', height:72, fontSize:11, fontFamily:'monospace',
                            padding:8, borderRadius:8, border:'1px solid #ddd', background:'#f8f9fc',
                            resize:'none', boxSizing:'border-box'
                          }}
                        />
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => {
                            navigator.clipboard?.writeText(qrPayload)
                            setQrCopied(true)
                            setTimeout(() => setQrCopied(false), 1500)
                          }}
                          style={{ marginTop:6, width:'100%' }}>
                          {qrCopied ? '✅ Copied to Clipboard!' : '📋 Copy Encrypted Token'}
                        </button>
                      </div>

                      {/* Import Section */}
                      <div style={{ borderTop:'1px solid rgba(0,0,0,.08)', paddingTop:16 }}>
                        <div style={{ fontFamily:'Syne,sans-serif', fontSize:14, fontWeight:700, color:'#0d0d1a', marginBottom:6 }}>
                          📥 Import / Restore from Another Device
                        </div>
                        <textarea
                          className="inp"
                          value={qrImportText}
                          onChange={e => setQrImportText(e.target.value)}
                          placeholder="Paste encrypted vault token here…"
                          style={{ width:'100%', height:64, fontSize:11, fontFamily:'monospace', resize:'none', boxSizing:'border-box', marginBottom:8 }}
                        />
                        <button
                          className="btn btn-blue btn-sm btn-w"
                          disabled={!qrImportText.trim()}
                          onClick={handleQrImport}>
                          🔓 Decrypt &amp; Merge Passwords
                        </button>
                      </div>

                      {qrStatusMsg && (
                        <div style={{ marginTop:12, padding:'8px 12px', borderRadius:8, fontSize:12, fontWeight:700, background:'rgba(79,142,247,.08)', color:'#4F8EF7' }}>
                          {qrStatusMsg}
                        </div>
                      )}
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </ToolCard>
    </ToolShell>
  )
}
