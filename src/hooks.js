import { useState, useCallback, useRef, useEffect } from 'react'

export function useCopy(timeout = 2000) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const copy = useCallback((text) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    const markCopied = () => {
      if (!isMountedRef.current) return
      setCopied(true)
      timerRef.current = setTimeout(() => {
        if (isMountedRef.current) setCopied(false)
        timerRef.current = null
      }, timeout)
    }

    const fallbackCopy = (str) => {
      try {
        const el = document.createElement('textarea')
        el.value = str
        el.setAttribute('readonly', '')
        el.style.position = 'absolute'
        el.style.left = '-9999px'
        document.body.appendChild(el)
        el.select()
        document.execCommand('copy')
        document.body.removeChild(el)
        markCopied()
      } catch (err) {
        console.warn('Fallback copy failed:', err)
      }
    }

    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(text).then(() => {
        markCopied()
      }).catch(() => {
        fallbackCopy(text)
      })
    } else {
      fallbackCopy(text)
    }
  }, [timeout])

  return [copied, copy]
}

export function useSlider(initial, min, max) {
  const [value, setValue] = useState(initial)
  const pct = `${((value - min) / (max - min)) * 100}%`
  return [value, setValue, pct]
}
