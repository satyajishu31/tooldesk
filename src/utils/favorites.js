/**
 * ToolDesk Favorites Manager
 * Light-weight localStorage persistence for tool favoriting.
 */

const STORAGE_KEY = 'tooldesk_favorite_tools'

export function getFavoriteTools() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch (e) {
    console.warn('[Favorites] Read error:', e)
    return []
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
    if (index > -1) {
      updated = favs.filter(id => id !== toolId)
    } else {
      updated = [...favs, toolId]
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    window.dispatchEvent(new CustomEvent('tooldesk-favorites-changed', { detail: updated }))
    return updated.includes(toolId)
  } catch (e) {
    console.warn('[Favorites] Save error:', e)
    return false
  }
}
