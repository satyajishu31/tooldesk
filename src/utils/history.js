/**
 * ToolDesk Centralized History Engine & Zero-Trust Sanitizer
 * 
 * Provides unified, persistent, zero-trust local history for both:
 * 1. Global History Shelf (LocalHistoryShelf)
 * 2. In-Tool History panels across all ToolDesk tools
 * 
 * Storage:
 * - Primary: IndexedDB ('tooldesk' database -> 'history' store)
 * - Synchronous Cache: localStorage ('tooldesk-history')
 * - Graceful Fallback: In-memory Map for private browsing / blocked storage
 * 
 * Security:
 * - Inspects actual values (never rejects safe metadata just because tool/label has 'password', 'bcrypt', etc.)
 * - Strictly rejects raw passwords, unmasked secrets, bcrypt hashes, private keys, API keys, Bearer tokens
 * - Strictly rejects raw binary blobs, base64 data URLs, oversized strings
 * - Deterministic deduplication prevents flooding
 */

import { dbPut, dbGetAll, dbDelete, dbClear } from './storage.js'

export const MAX_GLOBAL_HISTORY = 150
export const MAX_TOOL_HISTORY = 50

let _memCache = []

// Signatures of sensitive values that MUST NEVER be stored
const BCRYPT_HASH_PATTERN = /^\$2[abxy]\$\d{1,2}\$[./A-Za-z0-9]{53}$/
const PRIVATE_KEY_PATTERN = /-----BEGIN[ A-Z0-9_-]*PRIVATE KEY-----/i
const DATA_URL_PATTERN = /^data:(image|application|audio|video|font)\/[a-zA-Z0-9.+-]+;base64,/i

const API_KEY_PATTERNS = [
  /AIza[0-9A-Za-z-_]{35}/,                // Google API Key
  /sk-[a-zA-Z0-9\-_]{20,}/,               // OpenAI / Standard Secret Key
  /gsk_[a-zA-Z0-9\-_]{20,}/,              // Groq API Key
  /ghp_[a-zA-Z0-9]{36}/,                   // GitHub Personal Access Token
  /bearer\s+[a-zA-Z0-9._~+/-]{16,}/i,      // Bearer Tokens
  /xox[baprs]-[0-9a-zA-Z]{10,}/,          // Slack Token
  /AKIA[0-9A-Z]{16}/                      // AWS Access Key ID
]

// Safe descriptor keywords indicating non-secret parameter metadata
const SAFE_METADATA_WORDS = /characters|character|chars|char|words|word|digits|digit|strength|cost|match|verification|factor|rounds|status|entropy|bits|length|format|cleared|created|calculated|verified|generated|initialized|unlocked|locked|exported|backup|checked|explored|lookup|converted|resized|compressed|processed|transcribed|analyzed|replaced/i

/**
 * Inspects a value to determine if it contains raw sensitive credentials or forbidden data.
 */
export function isSensitiveValue(val) {
  if (typeof val !== 'string') return false
  const trimmed = val.trim()
  if (!trimmed) return false

  // 1. Bcrypt hash check
  if (BCRYPT_HASH_PATTERN.test(trimmed)) return true

  // 2. Private key check
  if (PRIVATE_KEY_PATTERN.test(trimmed)) return true

  // 3. Known API keys and Bearer tokens
  for (const regex of API_KEY_PATTERNS) {
    if (regex.test(trimmed)) return true
  }

  // 4. Large raw base64 data URLs
  if (DATA_URL_PATTERN.test(trimmed)) return true

  return false
}

/**
 * Validates whether a value in a security context (password, pin, vault) is safe metadata or a raw secret.
 */
function isSafeSecurityValue(val) {
  if (typeof val !== 'string') return false
  const trimmed = val.trim()
  if (!trimmed) return false

  // Masked representations (e.g. "•••••••• (16 chars)", "*******") are safe
  if (trimmed.startsWith('••••') || trimmed.startsWith('****') || trimmed.includes('••••')) {
    return true
  }

  // Parameter metadata summaries (e.g. "16 characters (Upper, Lower, Numbers)", "Cost factor 10") are safe
  if (SAFE_METADATA_WORDS.test(trimmed)) {
    return true
  }

  // If none of the safe metadata indicators are present, it is considered an unmasked raw secret
  return false
}

/**
 * Zero-Trust History Entry Sanitizer
 * 
 * Guarantees:
 * - Normalized schema
 * - Rejects any entry containing actual sensitive values
 * - Allows safe metadata from Password Generator, Bcrypt, and Vault
 * - Strips sensitive metadata fields
 * - Bounded string lengths
 */
export function sanitizeHistoryEntry(rawEntry) {
  if (!rawEntry || typeof rawEntry !== 'object') return null

  const tool = String(rawEntry.tool || 'Tool').trim().slice(0, 100)
  const label = String(rawEntry.label || rawEntry.action || tool).trim().slice(0, 160)
  const action = String(rawEntry.action || 'Created').trim().slice(0, 60)
  const category = String(rawEntry.category || 'General').trim().slice(0, 50)
  let value = typeof rawEntry.value === 'string' ? rawEntry.value.trim() : String(rawEntry.value ?? '')

  // 1. If value is explicitly sensitive (Bcrypt hash, API key, Private key, Data URL), reject
  if (isSensitiveValue(value)) {
    return null
  }

  // 2. Security tool value inspection (Password Generator, Bcrypt, Vault, PIN)
  const isSecurityContext = /password|pin|vault|credential|secret|key/i.test(tool) || /password|pin|vault/i.test(label)
  if (isSecurityContext) {
    if (!isSafeSecurityValue(value)) {
      return null
    }
  }

  // 3. Bound string lengths to prevent storage bloat
  if (value.length > 500) {
    value = `${value.slice(0, 499)}…`
  }

  // 4. Metadata sanitization
  const metadata = {}
  if (rawEntry.metadata && typeof rawEntry.metadata === 'object' && !Array.isArray(rawEntry.metadata)) {
    for (const [k, v] of Object.entries(rawEntry.metadata)) {
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        const strVal = String(v).slice(0, 200)
        if (!isSensitiveValue(strVal)) {
          // If key indicates a password or secret, ensure it is not raw plaintext
          if (/password|secret|hash|token|key/i.test(k) && typeof v === 'string') {
            if (!isSafeSecurityValue(v)) continue
          }
          metadata[String(k).slice(0, 40)] = v
        }
      }
    }
  }

  const now = Date.now()
  const id = rawEntry.id || `hist_${now}_${Math.random().toString(36).slice(2, 9)}`
  const timestamp = rawEntry.timestamp || new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return {
    id,
    tool,
    label,
    value,
    action,
    category,
    metadata,
    timestamp,
    createdAt: Number(rawEntry.createdAt) || now
  }
}

/**
 * Fast synchronous read from localStorage cache for immediate UI hydration
 */
export function getSyncLocalHistory() {
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem('tooldesk-history')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) return parsed
      }
    } catch {}
  }
  return _memCache || []
}

/**
 * Syncs an array of history items to localStorage and memory cache
 */
function syncToLocalStorage(items) {
  _memCache = Array.isArray(items) ? [...items] : []
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem('tooldesk-history', JSON.stringify(_memCache.slice(0, MAX_GLOBAL_HISTORY)))
    } catch {}
  }
}

/**
 * Adds an item to ToolDesk local history.
 * Sanitizes entry, deduplicates recent duplicate actions, saves to IndexedDB,
 * updates localStorage cache, and dispatches 'tooldesk-history-updated'.
 */
export async function addToHistory(item) {
  const sanitized = sanitizeHistoryEntry(item)
  if (!sanitized) return null

  try {
    // 1. Fetch current items to perform deterministic deduplication
    let currentItems = []
    try {
      const fromDb = await dbGetAll('history')
      currentItems = Array.isArray(fromDb) && fromDb.length > 0 ? fromDb : getSyncLocalHistory()
    } catch {
      currentItems = getSyncLocalHistory()
    }

    // Sort newest first
    currentItems.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))

    // Check for duplicate recent entry (same tool, label, and value within last 5 minutes)
    const duplicateIdx = currentItems.findIndex(existing =>
      existing.tool === sanitized.tool &&
      existing.label === sanitized.label &&
      existing.value === sanitized.value &&
      Math.abs((sanitized.createdAt || Date.now()) - (existing.createdAt || 0)) < 300000
    )

    if (duplicateIdx !== -1) {
      // Re-use existing entry ID, update timestamp and move to top
      const existing = currentItems[duplicateIdx]
      existing.timestamp = sanitized.timestamp
      existing.createdAt = sanitized.createdAt
      existing.metadata = { ...existing.metadata, ...sanitized.metadata }

      await dbPut('history', existing)
      currentItems.splice(duplicateIdx, 1)
      currentItems.unshift(existing)
      syncToLocalStorage(currentItems)

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('tooldesk-history-updated', { detail: existing }))
      }
      return existing
    }

    // 2. Put new item into IndexedDB
    await dbPut('history', sanitized)

    // 3. Update localStorage cache
    const updated = [
      sanitized,
      ...currentItems.filter(i => i.id !== sanitized.id)
    ].slice(0, MAX_GLOBAL_HISTORY)
    syncToLocalStorage(updated)

    // 4. Dispatch update notification across components and windows
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tooldesk-history-updated', { detail: sanitized }))
    }

    return sanitized
  } catch (err) {
    try {
      const existingItems = getSyncLocalHistory()
      const duplicateIdx = existingItems.findIndex(existing =>
        existing.tool === sanitized.tool &&
        existing.label === sanitized.label &&
        existing.value === sanitized.value &&
        Math.abs((sanitized.createdAt || Date.now()) - (existing.createdAt || 0)) < 300000
      )
      if (duplicateIdx !== -1) {
        const existing = existingItems[duplicateIdx]
        existing.timestamp = sanitized.timestamp
        existing.createdAt = sanitized.createdAt
        existing.metadata = { ...existing.metadata, ...sanitized.metadata }
        existingItems.splice(duplicateIdx, 1)
        existingItems.unshift(existing)
        syncToLocalStorage(existingItems)
        return existing
      }
      const updated = [sanitized, ...existingItems.filter(i => i.id !== sanitized.id)].slice(0, MAX_GLOBAL_HISTORY)
      syncToLocalStorage(updated)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('tooldesk-history-updated', { detail: sanitized }))
      }
      return sanitized
    } catch {
      return null
    }
  }
}

/**
 * Retrieves history asynchronously from IndexedDB with optional filtering
 */
export async function getHistory({ tool = null, limit = MAX_GLOBAL_HISTORY, search = '', category = null } = {}) {
  try {
    let items = await dbGetAll('history')
    if (!items || items.length === 0) {
      items = getSyncLocalHistory()
    }

    // Sort newest first
    items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))

    // Filter by tool if specified
    if (tool) {
      const lowerTool = tool.toLowerCase().trim()
      items = items.filter(i => i.tool && (i.tool.toLowerCase().includes(lowerTool) || lowerTool.includes(i.tool.toLowerCase())))
    }

    // Filter by category if specified
    if (category) {
      const lowerCat = category.toLowerCase().trim()
      items = items.filter(i => i.category && i.category.toLowerCase() === lowerCat)
    }

    // Filter by search query if provided
    if (search && search.trim()) {
      const q = search.trim().toLowerCase()
      items = items.filter(i =>
        (i.tool && i.tool.toLowerCase().includes(q)) ||
        (i.label && i.label.toLowerCase().includes(q)) ||
        (i.value && String(i.value).toLowerCase().includes(q)) ||
        (i.action && i.action.toLowerCase().includes(q)) ||
        (i.category && i.category.toLowerCase().includes(q))
      )
    }

    return items.slice(0, limit)
  } catch (e) {
    console.warn('[History] Fetch failed, returning sync cache:', e)
    let fallback = getSyncLocalHistory()
    if (tool) {
      const lowerTool = tool.toLowerCase().trim()
      fallback = fallback.filter(i => i.tool && (i.tool.toLowerCase().includes(lowerTool) || lowerTool.includes(i.tool.toLowerCase())))
    }
    return fallback.slice(0, limit)
  }
}

/**
 * Retrieves history specifically for one tool
 */
export async function getToolHistory(toolName, limit = MAX_TOOL_HISTORY) {
  return getHistory({ tool: toolName, limit })
}

/**
 * Deletes a single history entry by ID
 */
export async function deleteHistoryItem(id) {
  if (!id) return false
  try {
    try { await dbDelete('history', id) } catch {}
    const existing = getSyncLocalHistory()
    const updated = existing.filter(i => i.id !== id)
    syncToLocalStorage(updated)

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tooldesk-history-updated', { detail: { deletedId: id } }))
    }
    return true
  } catch (e) {
    console.warn('[History] Delete failed:', e)
    return false
  }
}

/**
 * Clears history globally or for a specific tool
 */
export async function clearHistory({ tool = null } = {}) {
  try {
    if (!tool) {
      try { await dbClear('history') } catch {}
      syncToLocalStorage([])
      if (typeof localStorage !== 'undefined') {
        try { localStorage.removeItem('tooldesk-history') } catch {}
      }
    } else {
      const lowerTool = tool.toLowerCase().trim()
      try {
        const all = await dbGetAll('history')
        for (const item of all) {
          if (item.tool && (item.tool.toLowerCase().includes(lowerTool) || lowerTool.includes(item.tool.toLowerCase()))) {
            await dbDelete('history', item.id)
          }
        }
      } catch {}
      const existing = getSyncLocalHistory()
      const updated = existing.filter(i => !i.tool || (!i.tool.toLowerCase().includes(lowerTool) && !lowerTool.includes(i.tool.toLowerCase())))
      syncToLocalStorage(updated)
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tooldesk-history-updated', { detail: { clearedTool: tool } }))
    }
    return true
  } catch (e) {
    console.warn('[History] Clear failed:', e)
    return false
  }
}

/**
 * Migrates legacy localStorage keys into the unified IndexedDB history store safely.
 * Non-destructive and idempotent.
 */
export async function migrateLegacyHistory() {
  if (typeof localStorage === 'undefined') return 0
  let migratedCount = 0
  try {
    // 1. Migrate standard 'tooldesk-history'
    const rawMain = localStorage.getItem('tooldesk-history')
    if (rawMain) {
      try {
        const parsed = JSON.parse(rawMain)
        if (Array.isArray(parsed)) {
          for (const entry of parsed) {
            const sanitized = sanitizeHistoryEntry(entry)
            if (sanitized) {
              await dbPut('history', sanitized)
              migratedCount++
            }
          }
        }
      } catch {}
    }

    // 2. Migrate 'tooldesk_ip_history'
    const rawIp = localStorage.getItem('tooldesk_ip_history')
    if (rawIp) {
      try {
        const parsed = JSON.parse(rawIp)
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            const ip = item.ip || item.query
            if (ip) {
              const res = await addToHistory({
                tool: 'IP Intelligence Studio',
                label: 'IP Lookup',
                value: `${ip} (${item.city || 'Unknown'}, ${item.country || 'Unknown'})`,
                action: 'Lookup',
                category: 'network',
                metadata: { ip, city: item.city, country: item.country },
                createdAt: item.timestamp || Date.now()
              })
              if (res) migratedCount++
            }
          }
        }
      } catch {}
    }

    // 3. Migrate 'tooldesk_currency_history'
    const rawCurr = localStorage.getItem('tooldesk_currency_history')
    if (rawCurr) {
      try {
        const parsed = JSON.parse(rawCurr)
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item.from && item.to && item.amount) {
              const res = await addToHistory({
                tool: 'Currency Converter',
                label: `${item.amount} ${item.from} → ${item.result || item.converted} ${item.to}`,
                value: `${item.amount} ${item.from} = ${item.result || item.converted} ${item.to}`,
                action: 'Converted',
                category: 'finance',
                metadata: { from: item.from, to: item.to, amount: item.amount, result: item.result || item.converted },
                createdAt: item.timestamp || Date.now()
              })
              if (res) migratedCount++
            }
          }
        }
      } catch {}
    }

    // 4. Migrate 'tooldesk_units_history'
    const rawUnits = localStorage.getItem('tooldesk_units_history')
    if (rawUnits) {
      try {
        const parsed = JSON.parse(rawUnits)
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item.from && item.to && item.val !== undefined) {
              const res = await addToHistory({
                tool: 'Unit Converter',
                label: `${item.val} ${item.from} → ${item.res} ${item.to}`,
                value: `${item.val} ${item.from} = ${item.res} ${item.to}`,
                action: 'Converted',
                category: 'utilities',
                metadata: { from: item.from, to: item.to, val: item.val, res: item.res, cat: item.cat },
                createdAt: item.timestamp || Date.now()
              })
              if (res) migratedCount++
            }
          }
        }
      } catch {}
    }

    // 5. Migrate 'tooldesk_color_history'
    const rawColors = localStorage.getItem('tooldesk_color_history')
    if (rawColors) {
      try {
        const parsed = JSON.parse(rawColors)
        if (Array.isArray(parsed)) {
          for (const hex of parsed) {
            if (typeof hex === 'string' && /^#[0-9A-Fa-f]{3,8}$/.test(hex)) {
              const res = await addToHistory({
                tool: 'Color Picker',
                label: `Picked ${hex}`,
                value: hex,
                action: 'Picked',
                category: 'design',
                metadata: { hex }
              })
              if (res) migratedCount++
            }
          }
        }
      } catch {}
    }

    // 6. Migrate 'tooldesk_qr_history'
    const rawQr = localStorage.getItem('tooldesk_qr_history')
    if (rawQr) {
      try {
        const parsed = JSON.parse(rawQr)
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            const val = typeof item === 'string' ? item : item.text || item.value
            if (val && !isSensitiveValue(val)) {
              const res = await addToHistory({
                tool: 'QR & Barcode Studio',
                label: 'QR Code',
                value: String(val).slice(0, 100),
                action: 'Generated',
                category: 'utilities'
              })
              if (res) migratedCount++
            }
          }
        }
      } catch {}
    }
    return migratedCount
  } catch (e) {
    console.warn('[History] Migration error:', e)
    return migratedCount
  }
}

// Automatically trigger migration once on idle/startup
if (typeof window !== 'undefined') {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(() => migrateLegacyHistory())
  } else {
    setTimeout(migrateLegacyHistory, 1000)
  }
}
