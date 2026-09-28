/**
 * ToolDesk Favorites Manager
 * Synchronous cache + IndexedDB persistence for tool favoriting.
 */

import { dbPut, dbDelete, dbGetAll } from './storage.js'

const STORAGE_KEY = 'tooldesk_favorite_tools'

let _memFavs = []

export function getFavoriteTools() {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return [..._memFavs]
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch (e) {
    console.warn('[Favorites] Read error:', e)
    return [..._memFavs]
  }
}

export function isToolFavorite(toolId) {
  if (!toolId) return false
  const favs = getFavoriteTools()
  return favs.includes(toolId)
}

export function toggleToolFavorite(toolId) {
  if (!toolId) return false
  try {
    const favs = getFavoriteTools()
    const index = favs.indexOf(toolId)
    let updated
    let isFav = false
    if (index > -1) {
      updated = favs.filter(id => id !== toolId)
      dbDelete('favorites', toolId).catch(() => {})
    } else {
      updated = [...favs, toolId]
      isFav = true
      dbPut('favorites', { toolId, createdAt: Date.now() }).catch(() => {})
    }
    _memFavs = updated
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tooldesk-favorites-changed', { detail: updated }))
    }
    return isFav
  } catch (e) {
    console.warn('[Favorites] Save error:', e)
    return false
  }
}

/**
 * Hydrate favorites from IndexedDB if localStorage was cleared
 */
export async function syncFavoritesFromDB() {
  try {
    const records = await dbGetAll('favorites')
    if (records && records.length) {
      const ids = records.map(r => r.toolId)
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('tooldesk-favorites-changed', { detail: ids }))
      }
    }
  } catch {}
}

export const getFavorites = getFavoriteTools
export const isFavorite = isToolFavorite
export const toggleFavorite = toggleToolFavorite

