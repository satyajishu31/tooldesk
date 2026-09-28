/**
 * ToolDesk Centralized History Engine & Zero-Trust Sanitizer
 * 
 * Provides unified history for both:
 * 1. Global History Shelf
 * 2. In-Tool History panels
 * 
 * Stores data safely in IndexedDB ('tooldesk' db -> 'history' store)
 * with graceful memory / localStorage fallback.
 */

import { dbPut, dbGetAll, dbDelete, dbClear } from './storage.js'

export const MAX_GLOBAL_HISTORY = 150
export const MAX_TOOL_HISTORY = 50

// Signatures of sensitive values that MUST NEVER be stored
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/
const PRIVATE_KEY_PATTERN = /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/i
const API_KEY_PATTERNS = [
  /AIza[0-9A-Za-z-_]{35}/,              // Google API Key
  /sk-[a-zA-Z0-9\-_]{20,}/,             // OpenAI/Standard Secret Key
  /gsk_[a-zA-Z0-9\-_]{20,}/,            // Groq API Key
  /ghp_[a-zA-Z0-9]{36}/,                 // GitHub Personal Access Token
  /bearer\s+[a-zA-Z0-9._~+/-]{20,}/i     // Bearer Tokens
]

/**
 * Inspects content to determine if it is cleartext sensitive data (password, token, raw key).
 * NOTE: The tool name itself is NOT sensitive content.
 */
function isSensitiveValue(val) {
  if (typeof val !== 'string') return false
  const trimmed = val.trim()
  if (!trimmed) return false

  // Check for bcrypt hash
  if (BCRYPT_HASH_PATTERN.test(trimmed)) return true

  // Check for private keys
  if (PRIVATE_KEY_PATTERN.test(trimmed)) return true

  // Check for known API key signatures
  for (const regex of API_KEY_PATTERNS) {
    if (regex.test(trimmed)) return true
  }

  return false
}

/**
 * Zero-Trust History Entry Sanitizer
 * 
 * Ensures:
 * - Valid normalized schema
 * - Redacts or rejects cleartext credentials, private keys, API keys, or raw password hashes
 * - Allows safe metadata from Password Generator, Bcrypt, and Vault (e.g. masked passwords, hash verification status)
 * - Restricts value length to prevent memory attacks
 */
export function sanitizeHistoryEntry(rawEntry) {
  if (!rawEntry || typeof rawEntry !== 'object') return null

  const tool = String(rawEntry.tool || 'Tool').trim().slice(0, 100)
  const label = String(rawEntry.label || rawEntry.action || tool).trim().slice(0, 120)
  const action = String(rawEntry.action || 'Created').trim().slice(0, 60)
  const category = String(rawEntry.category || 'General').trim().slice(0, 50)
  let value = typeof rawEntry.value === 'string' ? rawEntry.value.trim() : String(rawEntry.value || '')

  // 1. If value is explicitly sensitive, reject
  if (isSensitiveValue(value)) {
    return null
  }

  // 2. Unmasked passwords or PINs are strictly rejected
  if (/password|pin/i.test(tool) || /password|pin/i.test(label)) {
    if (!value.startsWith('••••') && !/generated|calculated|verified/i.test(value)) {
      return null
    }
  }

  // 3. Bound string lengths
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
    createdAt: rawEntry.createdAt || now
  }
}

/**
 * Adds an item to ToolDesk local history.
 * Sanitizes entry, saves to IndexedDB, maintains bounds, and dispatches update event.
 */
export async function addToHistory(item) {
  const sanitized = sanitizeHistoryEntry(item)
  if (!sanitized) return null

  try {
    await dbPut('history', sanitized)

    // Sync to legacy localStorage cache for instant synchronous reading and compatibility
    try {
      const existing = getSyncLocalHistory()
      const updated = [
        sanitized,
        ...existing.filter(i => i.id !== sanitized.id)
      ].slice(0, MAX_GLOBAL_HISTORY)
      localStorage.setItem('tooldesk-history', JSON.stringify(updated))
    } catch {}

    // Dispatch update notification across components and windows
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tooldesk-history-updated', { detail: sanitized }))
    }

    return sanitized
  } catch (err) {
    console.warn('[History] Save failed:', err)
    return null
  }
}

/**
 * Fast synchronous read from localStorage cache
 */
export function getSyncLocalHistory() {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem('tooldesk-history')
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Retrieves history asynchronously from IndexedDB with optional filtering
 */
export async function getHistory({ tool = null, limit = MAX_GLOBAL_HISTORY, search = '' } = {}) {
  try {
    let items = await dbGetAll('history')
    if (!items || items.length === 0) {
      items = getSyncLocalHistory()
    }

    // Sort newest first
    items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))

    // Filter by tool if specified
    if (tool) {
      const lowerTool = tool.toLowerCase()
      items = items.filter(i => i.tool && i.tool.toLowerCase().includes(lowerTool))
    }

    // Filter by search query if provided
    if (search && search.trim()) {
      const q = search.trim().toLowerCase()
      items = items.filter(i =>
        (i.tool && i.tool.toLowerCase().includes(q)) ||
        (i.label && i.label.toLowerCase().includes(q)) ||
        (i.value && i.value.toLowerCase().includes(q)) ||
        (i.action && i.action.toLowerCase().includes(q)) ||
        (i.category && i.category.toLowerCase().includes(q))
      )
    }

    return items.slice(0, limit)
  } catch (e) {
    console.warn('[History] Fetch failed, returning sync cache:', e)
    return getSyncLocalHistory().slice(0, limit)
  }
}

/**
 * Deletes a single history entry by ID
 */
export async function deleteHistoryItem(id) {
  if (!id) return false
  try {
    await dbDelete('history', id)
    try {
      const existing = getSyncLocalHistory()
      const updated = existing.filter(i => i.id !== id)
      localStorage.setItem('tooldesk-history', JSON.stringify(updated))
    } catch {}

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tooldesk-history-updated'))
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
      await dbClear('history')
      try {
        localStorage.removeItem('tooldesk-history')
      } catch {}
    } else {
      const all = await dbGetAll('history')
      const lowerTool = tool.toLowerCase()
      for (const item of all) {
        if (item.tool && item.tool.toLowerCase().includes(lowerTool)) {
          await dbDelete('history', item.id)
        }
      }
      try {
        const existing = getSyncLocalHistory()
        const updated = existing.filter(i => !i.tool || !i.tool.toLowerCase().includes(lowerTool))
        localStorage.setItem('tooldesk-history', JSON.stringify(updated))
      } catch {}
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tooldesk-history-updated'))
    }
    return true
  } catch (e) {
    console.warn('[History] Clear failed:', e)
    return false
  }
}

/**
 * Retrieves history specifically for one tool
 */
export async function getToolHistory(toolName, limit = 20) {
  return getHistory({ tool: toolName, limit })
}

/**
 * Idempotent migration from legacy localStorage keys
 */
export async function migrateLegacyHistory() {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return
  try {
    const raw = localStorage.getItem('tooldesk-history')
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || !parsed.length) return

    for (const entry of parsed) {
      const sanitized = sanitizeHistoryEntry(entry)
      if (sanitized) {
        await dbPut('history', sanitized)
      }
    }
  } catch (e) {
    console.warn('[History] Migration skipped:', e)
  }
}

// Automatically trigger migration on idle
if (typeof window !== 'undefined') {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(() => migrateLegacyHistory())
  } else {
    setTimeout(migrateLegacyHistory, 1000)
  }
}
