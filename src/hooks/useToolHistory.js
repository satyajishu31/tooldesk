import { useState, useEffect, useCallback } from 'react'
import { getToolHistory, addToHistory, deleteHistoryItem, clearHistory } from '../utils/history'

/**
 * Universal React Hook for In-Tool History Persistence
 * 
 * Provides:
 * - Immediate synchronous/IndexedDB hydration on mount
 * - Persistent across route changes and page reloads
 * - Realtime synchronization across all tabs and components
 * - Safe add, delete, and clear operations
 */
export function useToolHistory(toolName, limit = 15) {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    try {
      const items = await getToolHistory(toolName, limit)
      setHistory(items || [])
    } catch {
      setHistory([])
    } finally {
      setLoading(false)
    }
  }, [toolName, limit])

  useEffect(() => {
    reload()
    const handleUpdate = () => reload()
    window.addEventListener('tooldesk-history-updated', handleUpdate)
    return () => {
      window.removeEventListener('tooldesk-history-updated', handleUpdate)
    }
  }, [reload])

  const add = useCallback(async (entry) => {
    return await addToHistory({ tool: toolName, ...entry })
  }, [toolName])

  const remove = useCallback(async (id) => {
    await deleteHistoryItem(id)
    setHistory(prev => prev.filter(item => item.id !== id))
  }, [])

  const clear = useCallback(async () => {
    await clearHistory({ tool: toolName })
    setHistory([])
  }, [toolName])

  return { history, loading, add, remove, clear, reload }
}

export default useToolHistory
