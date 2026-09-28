/**
 * ToolDesk Recent Tools Tracker
 * 
 * Tracks recently opened and used tools locally in IndexedDB ('recentTools' store).
 * Debounces rapid route changes and records tool usage timestamps.
 */

import { dbPut, dbGetAll, dbDelete } from './storage.js'

const RECENT_KEY = 'tooldesk_recent_tools'
const MAX_RECENT = 10
let _lastRecordedTool = null
let _lastRecordedTime = 0

/**
 * Synchronous read from localStorage cache for instant UI rendering
 */
export function getSyncRecentTools() {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/**
 * Records tool usage with debouncing to prevent tracking route repaints
 */
export async function recordRecentTool(toolId) {
  if (!toolId) return
  const now = Date.now()

  // Prevent recording the same tool multiple times within 10 seconds
  if (_lastRecordedTool === toolId && (now - _lastRecordedTime < 10000)) {
    return
  }

  _lastRecordedTool = toolId
  _lastRecordedTime = now

  const record = {
    toolId,
    lastUsed: now
  }

  try {
    await dbPut('recentTools', record)

    // Sync to localStorage
    const list = getSyncRecentTools()
    const updated = [
      toolId,
      ...list.filter(id => id !== toolId)
    ].slice(0, MAX_RECENT)

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(RECENT_KEY, JSON.stringify(updated))
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tooldesk-recent-tools-updated', { detail: updated }))
    }
  } catch (e) {
    console.warn('[RecentTools] Failed to record tool:', e)
  }
}

/**
 * Retrieves list of recent tool IDs ordered newest first
 */
export async function getRecentTools() {
  try {
    const records = await dbGetAll('recentTools')
    if (records && records.length) {
      records.sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0))
      return records.map(r => r.toolId).slice(0, MAX_RECENT)
    }
  } catch {}

  return getSyncRecentTools()
}

/**
 * Clears recent tools history
 */
export async function clearRecentTools() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(RECENT_KEY)
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tooldesk-recent-tools-updated', { detail: [] }))
    }
  } catch {}
}
