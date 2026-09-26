// src/hooks/useGroqAI.js
// Shared hook for calling /.netlify/functions/groq-ai from any tool
// Single GROQ_API_KEY powers everything — key stays on the server

import { useState, useCallback, useRef, useEffect } from 'react'
import { resolveApiUrl, getApiHeaders } from '../utils/apiConfig'

export const AI_CONFIGURED_MSG =
  '🔑 GROQ_API_KEY not set in Netlify. Go to: Site settings → Environment variables → Add GROQ_API_KEY → Redeploy.'

/**
 * useGroqAI — call any registered AI tool from the frontend.
 *
 * const { run, result, loading, error, clear } = useGroqAI()
 * await run('summarize', { text, style: 'concise' })
 */
export function useGroqAI() {
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [result,  setResult]  = useState(null)
  const [streamedResult, setStreamedResult] = useState(null)
  const intervalRef = useRef(null)
  const abortControllerRef = useRef(null)
  const isMountedRef = useRef(true)

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      clearTimer()
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [clearTimer])

  const streamResponse = useCallback((data) => {
    clearTimer()
    if (!data || !isMountedRef.current) return
    setStreamedResult(data)
  }, [clearTimer])

  const run = useCallback(async (tool, payload) => {
    clearTimer()
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    const controller = new AbortController()
    abortControllerRef.current = controller

    setLoading(true); setError(''); setResult(null); setStreamedResult(null)
    try {
      const res = await fetch(resolveApiUrl('/.netlify/functions/groq-ai'), {
        method: 'POST',
        headers: getApiHeaders({ 'Content-Type': 'application/json' }),
        signal: controller.signal,
        body: JSON.stringify({ tool, payload }),
      })
      const data = await res.json().catch(() => ({}))
      if (!isMountedRef.current) return null
      if (!res.ok || data.error || !data || Object.keys(data).length === 0) {
        let msg = data?.error
        if (!msg) {
          if (!res.ok) {
            if (res.status === 503) {
              msg = AI_CONFIGURED_MSG
            } else if (res.status === 429) {
              msg = 'AI rate limit reached. Please wait a moment before trying again.'
            } else if (res.status === 504 || res.status === 502) {
              msg = 'AI service timed out or was temporarily unreachable. Please try again.'
            } else if (res.status === 500) {
              msg = 'AI service encountered a temporary error. Please try again in a moment.'
            } else {
              msg = `AI request failed (HTTP ${res.status}). Please try again.`
            }
          } else {
            msg = 'The AI service returned an empty or unrecognized response. Please try again.'
          }
        } else if (msg.includes('GROQ_API_KEY')) {
          msg = AI_CONFIGURED_MSG
        }
        setError(msg)
        return null
      }
      setResult(data)
      streamResponse(data)
      return data
    } catch (e) {
      if (e.name === 'AbortError') return null
      if (!isMountedRef.current) return null
      const msg = e.message?.includes('fetch') || e.message?.includes('network')
        ? 'Network error — could not reach the AI server. Check your internet connection.'
        : (e.message || 'AI request failed')
      setError(msg)
      return null
    } finally {
      if (isMountedRef.current) {
        setLoading(false)
      }
    }
  }, [streamResponse, clearTimer])

  const clear = useCallback(() => {
    clearTimer()
    setResult(null)
    setStreamedResult(null)
    setError('')
  }, [clearTimer])

  return { run, result, streamedResult, loading, error, clear }
}

/* ── Reusable AI Panel UI component data ─────────────────────
   Import this in any tool to render a consistent AI button + result
   panel without repeating layout code.
─────────────────────────────────────────────────────────────── */
export const AI_COLOR = '#7C3AED'
export const AI_GRADIENT = 'linear-gradient(135deg,#7C3AED,#4F8EF7)'
