import React, { useState, useEffect, useRef, memo } from 'react'

/**
 * AITypewriterText
 * High-performance, chunk-based progressive text reveal for AI responses.
 * 
 * Features:
 * - Chunk-based progressive text reveal (2-3 words per tick) for 60fps smoothness
 * - Apple-inspired subtle pulsing cursor that disappears cleanly upon completion
 * - Instant skip on click/tap
 * - Respects prefers-reduced-motion (renders instantly with zero animation)
 * - Safe cancellation and cleanup on unmount or text change
 * - Transparent: Does not claim network streaming when rendering a completed response
 */
export const AITypewriterText = memo(function AITypewriterText({
  text = '',
  speed = 28, // ms per chunk
  isNew = true,
  onComplete,
  className = '',
  style = {}
}) {
  const isReducedMotion = typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches

  const [displayedLength, setDisplayedLength] = useState(() => {
    // If not a newly generated response or reduced-motion is requested, show full text immediately
    return (!isNew || isReducedMotion) ? text.length : 0
  })
  const [isTyping, setIsTyping] = useState(() => isNew && !isReducedMotion && text.length > 0)
  const timerRef = useRef(null)
  const wordsRef = useRef([])

  useEffect(() => {
    if (!isNew || isReducedMotion || !text) {
      setDisplayedLength(text.length)
      setIsTyping(false)
      onComplete?.()
      return
    }

    // Split text into words while preserving spaces
    const words = text.split(/(\s+)/)
    wordsRef.current = words
    
    // Start with the first 2-3 words for immediate responsiveness
    let currentWordIndex = Math.min(3, words.length)
    let currentLen = words.slice(0, currentWordIndex).join('').length
    setDisplayedLength(currentLen)
    setIsTyping(true)

    timerRef.current = setInterval(() => {
      currentWordIndex += 3
      if (currentWordIndex >= words.length) {
        clearInterval(timerRef.current)
        timerRef.current = null
        setDisplayedLength(text.length)
        setIsTyping(false)
        onComplete?.()
      } else {
        const nextLen = words.slice(0, currentWordIndex).join('').length
        setDisplayedLength(nextLen)
      }
    }, speed)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [text, isNew, speed, isReducedMotion, onComplete])

  // Allow clicking to immediately reveal full text
  const handleClick = () => {
    if (isTyping) {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      setDisplayedLength(text.length)
      setIsTyping(false)
      onComplete?.()
    }
  }

  const visibleText = text.slice(0, displayedLength)

  return (
    <span
      className={`ai-typewriter-container ${className}`}
      onClick={handleClick}
      title={isTyping ? "Click to reveal immediately" : undefined}
      style={{
        display: 'inline',
        cursor: isTyping ? 'pointer' : 'inherit',
        ...style
      }}
    >
      {visibleText}
      {isTyping && (
        <span
          className="ai-typing-cursor"
          aria-hidden="true"
        />
      )}
    </span>
  )
})

export default AITypewriterText
