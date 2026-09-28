import React, { useState, useEffect, useRef, memo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLocation } from 'react-router-dom'
import { Copy, Check, RotateCcw, Square } from 'lucide-react'
import { safeFetchJSON } from '../utils/safeFetch'
import { TOOLS } from '../constants'

const TOOL_COUNT = TOOLS.length

function getWelcomeMessage(tool) {
  if (!tool) {
    return `👋 Hi! I'm your ToolDesk helper. Ask me anything about our ${TOOL_COUNT}+ browser-based tools, or tell me what you're trying to build!`
  }
  const toolSpecifics = {
    bcrypt: `🔐 I see you are using the **Bcrypt Tool**. Would you like me to explain how salt rounds prevent brute-force attacks, or help you generate a secure password hash?`,
    'website-analyzer': `🔍 I see you are on the **Website Analyzer**. Do you need help diagnosing SEO meta tags, checking script load times, or identifying missing security headers?`,
    vault: `🏦 I see you are inside your **Password Vault**. Would you like to know how local zero-knowledge AES-GCM encryption secures your logins, or how to link other devices using sync tokens?`,
    gradient: `🎨 I see you are in the **Gradient Generator**. Need help describing a mood (like *"cyberpunk neon"* or *"calm lake sunrise"*) to generate beautiful matching color palettes?`,
    'video-transcriber': `🎙️ I see you are on the **Video Transcriber**. You can upload audio/video files to transcribe them via Groq's high-speed Whisper AI. Need help splitting large files?`,
    qrcode: `📱 I see you are generating **QR Codes**. You can encode URLs, text, Wi-Fi keys, or business cards. Would you like me to help you format a vCard or customize design stops?`,
    'ip-lookup': `🌐 I see you are doing an **IP Geolocation Lookup**. Paste any domain or IP to fetch country, city, coordinates, and ISP details securely. Ask me what these parameters mean!`,
    'breach-check': `⚠️ I see you are checking for **Email Breaches**. You can check if your email has been compromised in any public data dumps. Ask me how to secure your accounts if you are listed!`,
  }
  
  return toolSpecifics[tool.id] || `👋 I see you are using the **${tool.title}**. Ask me any questions about how this tool works or how to get the most out of it!`
}

function getSuggestions(tool) {
  if (!tool) {
    return [
      'What security tools are available?',
      'Which tools can compress images?',
      'How does the PDF toolkit work?'
    ]
  }
  const suggestions = {
    bcrypt: [
      'Explain salt rounds',
      'How secure is Bcrypt?',
      'Generate a sample hash'
    ],
    'website-analyzer': [
      'What are SEO best practices?',
      'Why check script load times?',
      'Explain security headers'
    ],
    vault: [
      'How does AES-GCM work?',
      'How do I sync other devices?',
      'Is my master password safe?'
    ],
    gradient: [
      'Describe: cyberpunk neon',
      'Describe: tropical sunset',
      'Explain CSS mesh gradients'
    ],
    'video-transcriber': [
      'How to split large video files?',
      'What formats are supported?',
      'Explain Whisper accuracy'
    ],
    qrcode: [
      'Format a vCard QR code',
      'Can I encode Wi-Fi settings?',
      'Explain QR code design'
    ],
    'ip-lookup': [
      'What does ISP mean?',
      'How accurate is coordinates data?',
      'Security risks of exposed IP'
    ],
    'breach-check': [
      'What is HaveIBeenPwned?',
      'What if my email is breached?',
      'How to create breach-proof logins'
    ]
  }
  return suggestions[tool.id] || [
    `How does ${tool.title} work?`,
    'Is my data stored on servers?',
    'What features are inside this tool?'
  ]
}

/* ── Isolated Chat Input: isolates input state from whole panel re-renders ── */
const ChatInputForm = memo(function ChatInputForm({ onSend, onStop, loading, placeholder }) {
  const [localInput, setLocalInput] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    const text = localInput.trim()
    if (!text || loading) return
    setLocalInput('')
    onSend(text)
  }

  return (
    <form onSubmit={handleSubmit} style={{
      padding: '12px 14px',
      borderTop: '1px solid rgba(0,0,0,0.06)',
      display: 'flex',
      gap: 8,
      background: '#ffffff',
    }}>
      <input
        type="text"
        value={localInput}
        onChange={e => setLocalInput(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="sentences"
        spellCheck={false}
        style={{
          flex: 1,
          padding: '10px 14px',
          borderRadius: 999,
          border: '1px solid rgba(0,0,0,0.09)',
          fontSize: 14,
          outline: 'none',
          background: '#f8f9fc',
          boxSizing: 'border-box',
        }}
      />
      {loading ? (
        <button
          type="button"
          onClick={onStop}
          title="Stop response"
          aria-label="Stop response"
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: '#ef4444',
            color: '#ffffff',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxSizing: 'border-box',
            transition: 'background .15s',
          }}>
          <Square size={13} fill="#ffffff" />
        </button>
      ) : (
        <button
          type="submit"
          disabled={!localInput.trim()}
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: localInput.trim() ? 'var(--blue, #4F8EF7)' : '#e2e5ec',
            color: '#ffffff',
            border: 'none',
            cursor: localInput.trim() ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            flexShrink: 0,
            boxSizing: 'border-box',
            transition: 'background .15s',
          }}>
          ➔
        </button>
      )}
    </form>
  )
})

/* ── Isolated Quick Suggestions ── */
const ChatSuggestions = memo(function ChatSuggestions({ suggestions, onSelect }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.5px' }}>
        💡 Quick Suggestions:
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {suggestions.map((s, i) => (
          <button key={i} type="button" onClick={() => onSelect(s)}
            style={{
              textAlign: 'left',
              padding: '8px 12px',
              borderRadius: 10,
              border: '1px solid rgba(79, 142, 247, 0.15)',
              background: 'rgba(79, 142, 247, 0.04)',
              color: '#4F8EF7',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all .15s'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(79, 142, 247, 0.08)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(79, 142, 247, 0.04)' }}>
            {s}
          </button>
        ))}
      </div>
    </div>
  )
})

export default function AIHelper() {
  const location = useLocation()
  const currentTool = TOOLS.find(t => t.path === location.pathname)
  const currentPageLabel = currentTool ? currentTool.title : 'Home'

  const [isOpen, setIsOpen]     = useState(false)
  const [messages, setMessages] = useState([
    { role: 'assistant', content: getWelcomeMessage(currentTool) }
  ])
  const [loading, setLoading]   = useState(false)
  const [copiedIndex, setCopiedIndex] = useState(null)
  const chatEndRef = useRef(null)
  const panelRef = useRef(null)
  const prevPathRef = useRef(location.pathname)
  const abortControllerRef = useRef(null)
  const requestIdRef = useRef(0)
  const copyTimerRef = useRef(null)

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Handle Escape key and outside click to dismiss
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    const handleClickOutside = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target) && !e.target.closest('.ai-toggle-btn')) {
        setIsOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside, { passive: true })
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [isOpen])

  // Context-aware context shifting
  useEffect(() => {
    if (prevPathRef.current !== location.pathname) {
      prevPathRef.current = location.pathname
      const newWelcome = getWelcomeMessage(currentTool)
      if (messages.length <= 1 || !isOpen) {
        setMessages([{ role: 'assistant', content: newWelcome }])
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `📍 **New Context**: ${newWelcome}`
        }])
      }
    }
  }, [location.pathname, isOpen, currentTool, messages.length])

  const stopRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setLoading(false)
  }, [])

  const copyMessage = useCallback((text, idx) => {
    navigator.clipboard?.writeText(text)
    setCopiedIndex(idx)
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    copyTimerRef.current = setTimeout(() => setCopiedIndex(null), 2000)
  }, [])

  const sendText = useCallback(async (text) => {
    const cleanText = typeof text === 'string' ? text.trim() : ''
    if (!cleanText) return

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    const controller = new AbortController()
    abortControllerRef.current = controller
    const reqId = ++requestIdRef.current

    const userMsg = { role: 'user', content: cleanText }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))
      const data = await safeFetchJSON('/.netlify/functions/groq-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          tool: 'aiHelper',
          payload: {
            messages: history,
            currentPage: currentPageLabel,
            toolContext: currentTool ? { id: currentTool.id, title: currentTool.title, category: currentTool.cat } : null
          }
        })
      }, 25000)

      if (controller.signal.aborted || reqId !== requestIdRef.current) return

      const finalResponse = data?.response || data?.result
      if (finalResponse) {
        // Progressive token streaming simulation for buttery-smooth reading
        const words = finalResponse.split(' ')
        if (words.length > 8) {
          setMessages(prev => [...prev, { role: 'assistant', content: words.slice(0, 3).join(' ') }])
          let currentWordIdx = 3
          const streamInterval = setInterval(() => {
            if (reqId !== requestIdRef.current) {
              clearInterval(streamInterval)
              return
            }
            currentWordIdx += 3
            if (currentWordIdx >= words.length) {
              clearInterval(streamInterval)
              setMessages(prev => {
                const next = [...prev]
                next[next.length - 1] = { role: 'assistant', content: finalResponse }
                return next
              })
              setLoading(false)
            } else {
              setMessages(prev => {
                const next = [...prev]
                next[next.length - 1] = { role: 'assistant', content: words.slice(0, currentWordIdx).join(' ') }
                return next
              })
            }
          }, 35)
          return
        } else {
          setMessages(prev => [...prev, { role: 'assistant', content: finalResponse }])
        }
      } else if (data?.error) {
        setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ ${data.error}` }])
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: "⚠️ Sorry, I encountered an issue. Please try again." }])
      }
    } catch (e) {
      if (e?.name === 'AbortError' || controller.signal.aborted) return
      if (reqId === requestIdRef.current) {
        setMessages(prev => [...prev, { role: 'assistant', content: "⚠️ Connection error. Please check your network." }])
      }
    } finally {
      if (reqId === requestIdRef.current) {
        setLoading(false)
      }
    }
  }, [messages, currentPageLabel, currentTool])

  const regenerateLast = useCallback(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        const text = messages[i].content
        setMessages(prev => prev.slice(0, i))
        sendText(text)
        break
      }
    }
  }, [messages, sendText])

  const suggestions = getSuggestions(currentTool)

  return (
    <div style={{
      position: 'fixed',
      bottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
      right: 'calc(20px + env(safe-area-inset-right, 0px))',
      zIndex: 10000,
      fontFamily: 'DM Sans, sans-serif',
      width: 54,
      height: 54,
    }}>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2, ease: [.22, 1, .36, 1] }}
            className="ai-helper-panel"
            style={{
              position: 'fixed',
              bottom: 'calc(90px + env(safe-area-inset-bottom, 0px))',
              right: 'calc(20px + env(safe-area-inset-right, 0px))',
              width: 340,
              maxWidth: 'calc(100vw - 32px)',
              height: 440,
              maxHeight: '70vh',
              background: '#ffffff',
              borderRadius: 22,
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.16), 0 4px 16px rgba(0,0,0,0.04)',
              border: '1px solid rgba(0, 0, 0, 0.08)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}>
            {/* Header */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(79,142,247,1), rgba(156,111,222,1))',
              padding: '14px 16px',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,.35)'
            }}>
              <img
                src="/robot-assistant-64.webp"
                alt="ToolDesk AI Assistant"
                style={{ width: 28, height: 28, objectFit: 'contain', flexShrink: 0 }}
                onError={e => { e.currentTarget.src = '/robot-assistant-64.png' }}
              />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14.5, fontFamily: 'Syne, sans-serif' }}>ToolDesk Assistant</div>
                <div style={{ fontSize: 11.5, opacity: 0.85, display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#7CFF9E', flexShrink: 0 }}/>
                  {currentTool ? `Helping with ${currentPageLabel}` : 'Online · Powered by AI'}
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                style={{
                  marginLeft: 'auto',
                  flexShrink: 0,
                  background: 'rgba(255,255,255,.15)',
                  border: 'none',
                  borderRadius: '50%',
                  width: 26, height: 26,
                  color: '#ffffff',
                  fontSize: 14,
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background .15s',
                }}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,.28)'}
                onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,.15)'}>
                ✕
              </button>
            </div>

            {/* Messages */}
            <div style={{
              flex: 1,
              padding: '16px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              background: 'rgba(250, 251, 255, 0.65)'
            }}>
              {messages.map((m, idx) => (
                <div key={idx} style={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '88%',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4
                }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    {m.role !== 'user' && (
                      <img
                        src="/robot-assistant-64.webp"
                        alt="Assistant"
                        style={{ width: 22, height: 22, objectFit: 'contain', flexShrink: 0, marginTop: 4 }}
                        onError={e => { e.currentTarget.src = '/robot-assistant-64.png' }}
                      />
                    )}
                    <div style={{
                      padding: '10px 14px',
                      borderRadius: m.role === 'user' ? '16px 16px 2px 16px' : '16px 16px 16px 2px',
                      background: m.role === 'user' ? 'var(--blue, #4F8EF7)' : '#ffffff',
                      color: m.role === 'user' ? '#ffffff' : '#1e293b',
                      fontSize: 13.5,
                      lineHeight: 1.62,
                      boxShadow: m.role === 'user' ? '0 2px 8px rgba(79,142,247,0.2)' : '0 2px 6px rgba(0,0,0,0.04)',
                      border: m.role === 'user' ? 'none' : '1px solid rgba(0,0,0,0.05)'
                    }}>
                      {m.content}
                    </div>
                  </div>

                  {m.role === 'assistant' && idx > 0 && (
                    <div style={{ display: 'flex', gap: 8, paddingLeft: 30 }}>
                      <button
                        onClick={() => copyMessage(m.content, idx)}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: copiedIndex === idx ? '#16a34a' : '#94a3b8',
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 3,
                          padding: 0
                        }}
                      >
                        {copiedIndex === idx ? <Check size={11} /> : <Copy size={11} />}
                        {copiedIndex === idx ? 'Copied' : 'Copy'}
                      </button>

                      {idx === messages.length - 1 && !loading && (
                        <button
                          onClick={regenerateLast}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: '#94a3b8',
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 3,
                            padding: 0
                          }}
                        >
                          <RotateCcw size={11} />
                          Regenerate
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div style={{
                  alignSelf: 'flex-start',
                  padding: '10px 14px',
                  background: '#ffffff',
                  borderRadius: '16px 16px 16px 2px',
                  border: '1px solid rgba(0,0,0,0.05)',
                  display: 'flex',
                  gap: 4,
                  alignItems: 'center'
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#94a3b8', animation: 'pulse2 1s infinite' }}/>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#94a3b8', animation: 'pulse2 1s infinite 0.2s' }}/>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#94a3b8', animation: 'pulse2 1s infinite 0.4s' }}/>
                </div>
              )}

              {messages.length === 1 && !loading && (
                <ChatSuggestions
                  suggestions={suggestions}
                  onSelect={sendText}
                />
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Input Form — isolated component prevents re-rendering chat messages while typing */}
            <ChatInputForm
              onSend={sendText}
              onStop={stopRequest}
              loading={loading}
              placeholder={currentTool ? `Ask about ${currentTool.title}…` : 'Ask anything…'}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Toggle Button — always fully visible while scrolling, on every page */}
      <motion.button
        className="ai-toggle-btn"
        aria-label="Open ToolDesk Assistant"
        onClick={() => setIsOpen(o => !o)}
        whileHover={{ scale: 1.06, y: -3 }}
        whileTap={{ scale: 0.94 }}
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.5, type: 'spring', stiffness: 300, damping: 20 }}
        style={{
          width: 54,
          height: 54,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #4F8EF7, #9C6FDE)',
          border: '2px solid rgba(255,255,255,0.85)',
          boxShadow: '0 8px 24px rgba(79,142,247,0.38), 0 2px 8px rgba(0,0,0,0.08)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ffffff',
          fontSize: 22,
          padding: 0,
        }}
      >
        <img
          src="/robot-assistant-64.webp"
          alt="AI"
          style={{ width: 34, height: 34, objectFit: 'contain' }}
          onError={e => { e.currentTarget.src = '/robot-assistant-64.png' }}
        />
      </motion.button>
    </div>
  )
}
