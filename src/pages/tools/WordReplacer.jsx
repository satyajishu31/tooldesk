import React, { useState, useMemo, useCallback, useDeferredValue } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ToolShell, { ToolCard } from '../../components/ToolShell'
import { useCopy } from '../../hooks'
import { TOOLS } from '../../constants'
import { SmartReplacePanel } from '../../components/AIPanel'
import { useToolHistory } from '../../hooks/useToolHistory'
import { Clock, Trash2, Copy, Check, X, Search, RefreshCw, RotateCcw, CheckCircle2 } from 'lucide-react'

const tool = TOOLS.find(t => t.id === 'wordreplace')

/* ── Escape string for RegExp ── */
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/* ── Build highlighted preview segments (Zero XSS, no dangerouslySetInnerHTML) ── */
function buildPreviewSegments(text, find, caseSens, wholeWord, didReplace, replaceWith) {
  if (!text) return { segments: [], count: 0 }
  if (!find) return { segments: [{ text, isMatch: false }], count: 0 }
  const flags   = caseSens ? 'g' : 'gi'
  const pattern = wholeWord ? `\\b${esc(find)}\\b` : esc(find)
  let re
  try { re = new RegExp(pattern, flags) } catch { return { segments: [{ text, isMatch: false }], count: 0 } }
  
  const segments = []
  let lastIdx = 0
  let count = 0
  const MAX_SEGMENTS = 800

  for (const match of text.matchAll(re)) {
    count++
    if (segments.length < MAX_SEGMENTS) {
      if (match.index > lastIdx) {
        segments.push({ text: text.slice(lastIdx, match.index), isMatch: false })
      }
      segments.push({ text: didReplace ? replaceWith : match[0], isMatch: true })
      lastIdx = match.index + match[0].length
    }
  }

  if (lastIdx < text.length) {
    if (segments.length >= MAX_SEGMENTS) {
      segments.push({ text: text.slice(lastIdx, lastIdx + 500) + ' ... [preview truncated for performance]', isMatch: false })
    } else {
      segments.push({ text: text.slice(lastIdx), isMatch: false })
    }
  }

  return { segments, count }
}

export default function WordReplacer() {
  const [text,      setText]      = useState('')
  const [find,      setFind]      = useState('')
  const [withText,  setWithText]  = useState('')
  const deferredText = useDeferredValue(text)
  const deferredFind = useDeferredValue(find)
  const deferredWith = useDeferredValue(withText)
  const [caseSens,  setCaseSens]  = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [replaced,  setReplaced]  = useState(false)
  const [result,    setResult]    = useState('')
  const { history: persistedHistory, add: addPersistedReplace, remove: removeHistoryEntry, clear: clearToolHistory } = useToolHistory('Word Replace', 10)
  const [undoStack, setUndoStack] = useState([])
  const [flash,     setFlash]     = useState(false)
  const [copied,    copy]         = useCopy()
  const [copiedRes, copyRes]      = useCopy()

  const activeText = replaced ? result : deferredText
  const { segments, count } = useMemo(
    () => buildPreviewSegments(activeText, deferredFind, caseSens, wholeWord, replaced, deferredWith),
    [activeText, deferredFind, caseSens, wholeWord, replaced, deferredWith]
  )

  const doReplace = useCallback(() => {
    if (!find || !text || count === 0) return
    const flags   = caseSens ? 'g' : 'gi'
    const pattern = wholeWord ? `\\b${esc(find)}\\b` : esc(find)
    let re
    try { re = new RegExp(pattern, flags) } catch { return }
    // Use function replacement to prevent $ pattern substitution ($1, $&, $`, $')
    const newText = text.replace(re, () => withText)
    setUndoStack(prev => [{ find, with: withText, count, text }, ...prev.slice(0, 8)])
    addPersistedReplace({
      tool: 'Word Replace',
      label: `Replaced "${find}" → "${withText || '(deleted)'}" (${count}×)`,
      value: `Replaced "${find}" with "${withText || '(deleted)'}" (${count} occurrences)`,
      action: 'Replaced',
      category: 'Text',
      metadata: { find, with: withText, count }
    })
    setResult(newText)
    setReplaced(true)
    setFlash(true)
    setTimeout(() => setFlash(false), 600)
  }, [find, withText, text, caseSens, wholeWord, count, addPersistedReplace])

  const reset = () => { setReplaced(false); setResult(''); setFind(''); setWithText('') }
  const applyResult = () => { setText(result); setReplaced(false); setResult('') }

  return (
    <ToolShell tool={tool}>
      <ToolCard>

        {/* Input text */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.6px' }}>Your Text</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {text && <span style={{ fontSize: 11, color: '#bbb' }}>{text.trim().split(/\s+/).filter(Boolean).length} words</span>}
              {text && (
                <motion.button whileHover={{ scale: 1.06 }} whileTap={{ scale: .93 }} onClick={() => { setText(''); reset() }}
                  style={{ padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: '1.5px solid rgba(239,68,68,.25)', background: 'rgba(239,68,68,.05)', color: '#ef4444', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <X size={12} /> Clear
                </motion.button>
              )}
            </div>
          </div>
          <textarea value={text} onChange={e => { setText(e.target.value); setReplaced(false) }}
            placeholder="Paste your text here. Then use Find & Replace below to change any word or phrase instantly…"
            style={{ width: '100%', minHeight: 160, resize: 'vertical', padding: '14px 16px', border: '1.5px solid rgba(0,0,0,.1)', borderRadius: 12, fontFamily: 'DM Sans, sans-serif', fontSize: 14.5, lineHeight: 1.75, color: '#2d2d3d', background: '#fafafa', outline: 'none', transition: 'border-color .2s, box-shadow .2s' }}
            onFocus={e => { e.target.style.borderColor = '#4F8EF7'; e.target.style.boxShadow = '0 0 0 3px rgba(79,142,247,.12)' }}
            onBlur={e  => { e.target.style.borderColor = 'rgba(0,0,0,.1)'; e.target.style.boxShadow = 'none' }}/>
        </div>

        {/* Find + Replace inputs */}
        <div className="tool-grid-2-compact" style={{ marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.6px', display: 'block', marginBottom: 6 }}>Find</label>
            <input value={find} onChange={e => { setFind(e.target.value); setReplaced(false) }}
              placeholder="Word or phrase…"
              style={{ width: '100%', padding: '11px 14px', borderRadius: 10, fontFamily: 'DM Sans, sans-serif', fontSize: 14, color: '#2d2d3d', background: '#fafafa', outline: 'none', transition: 'border-color .2s, box-shadow .2s',
                border: `1.5px solid ${find && count === 0 && text && !replaced ? '#ef444455' : find && count > 0 ? '#FF980088' : 'rgba(0,0,0,.1)'}` }}
              onFocus={e => { e.target.style.boxShadow = '0 0 0 3px rgba(255,152,0,.12)' }}
              onBlur={e  => { e.target.style.boxShadow = 'none' }}/>
            <AnimatePresence>
              {find && !replaced && text && (
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  style={{ marginTop: 5, fontSize: 11.5, fontWeight: 600, color: count > 0 ? '#f97316' : '#ccc', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Search size={12} />
                  <span>{count > 0 ? `${count} match${count !== 1 ? 'es' : ''}` : 'No matches'}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.6px', display: 'block', marginBottom: 6 }}>Replace With</label>
            <input value={withText} onChange={e => { setWithText(e.target.value); setReplaced(false) }}
              placeholder="Replacement (empty = delete)…"
              style={{ width: '100%', padding: '11px 14px', border: '1.5px solid rgba(0,0,0,.1)', borderRadius: 10, fontFamily: 'DM Sans, sans-serif', fontSize: 14, color: '#2d2d3d', background: '#fafafa', outline: 'none', transition: 'border-color .2s, box-shadow .2s' }}
              onFocus={e => { e.target.style.borderColor = '#22c55e'; e.target.style.boxShadow = '0 0 0 3px rgba(34,197,94,.1)' }}
              onBlur={e  => { e.target.style.borderColor = 'rgba(0,0,0,.1)'; e.target.style.boxShadow = 'none' }}/>
          </div>
        </div>

        {/* Options */}
        <div style={{ display: 'flex', gap: 18, marginBottom: 14, flexWrap: 'wrap' }}>
          {[['Case sensitive', caseSens, setCaseSens], ['Whole word only', wholeWord, setWholeWord]].map(([label, val, set]) => (
            <label key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#666', userSelect: 'none' }}>
              <input type="checkbox" checked={val} onChange={e => { set(e.target.checked); setReplaced(false) }}
                style={{ accentColor: '#4F8EF7', width: 15, height: 15, cursor: 'pointer' }}/>
              {label}
            </label>
          ))}
        </div>

        {/* Replace button */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 9, marginBottom: 20 }}>
          <motion.button onClick={doReplace} disabled={!find || !text || count === 0}
            whileHover={count > 0 ? { scale: 1.01, y: -2 } : {}} whileTap={count > 0 ? { scale: .97 } : {}}
            style={{ padding: '13px', borderRadius: 12, border: 'none', cursor: count > 0 ? 'pointer' : 'not-allowed', fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: 15, color: '#fff', transition: 'all .25s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              background: replaced ? 'linear-gradient(135deg,#22c55e,#16a34a)' : count > 0 ? 'linear-gradient(135deg,#4F8EF7,#9C6FDE)' : '#e5e7ef',
              boxShadow: count > 0 ? '0 6px 20px rgba(79,142,247,.3)' : 'none' }}>
            {replaced ? <Check size={16} /> : <RefreshCw size={15} />}
            <span>{replaced ? `Replaced ${count} occurrence${count !== 1 ? 's' : ''}` : `Replace ${count > 0 ? count : 'all'}`}</span>
          </motion.button>
          {(find || replaced) && (
            <motion.button onClick={reset} whileHover={{ scale: 1.05 }} whileTap={{ scale: .93 }}
              style={{ padding: '13px 16px', borderRadius: 12, border: '1.5px solid rgba(0,0,0,.1)', background: '#fff', color: '#777', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontWeight: 600, fontSize: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <RotateCcw size={15} />
            </motion.button>
          )}
        </div>

        {/* Preview */}
        {text && find && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: replaced ? '#22c55e' : '#f97316', display: 'flex', alignItems: 'center', gap: 6 }}>
                {replaced ? <CheckCircle2 size={13} /> : <Search size={13} />}
                <span>{replaced ? 'Result Preview' : `Live Preview — ${count} match${count !== 1 ? 'es' : ''}`}</span>
              </div>
              {replaced && (
                <motion.button whileHover={{ scale: 1.04 }} onClick={applyResult}
                  style={{ padding: '4px 12px', borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: '1.5px solid rgba(34,197,94,.3)', background: 'rgba(34,197,94,.08)', color: '#22c55e' }}>
                  Apply & Edit More
                </motion.button>
              )}
            </div>
            <motion.div
              animate={flash ? { backgroundColor: ['rgba(34,197,94,.1)', 'transparent'] } : {}}
              transition={{ duration: .55 }}
              style={{ background: '#fafbff', border: `1.5px solid ${replaced ? 'rgba(34,197,94,.2)' : 'rgba(255,152,0,.2)'}`, borderRadius: 12, padding: '14px 16px', maxHeight: 240, overflowY: 'auto', lineHeight: 1.82, fontSize: 14.5, color: '#333', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {segments.map((seg, idx) => seg.isMatch ? (
                <mark key={idx} style={{
                  background: replaced ? 'rgba(34,197,94,.18)' : 'rgba(255,152,0,.22)',
                  color: replaced ? '#166534' : '#92400e',
                  borderRadius: 3,
                  padding: '0 2px',
                  fontWeight: 700,
                }}>{seg.text}</mark>
              ) : (
                <span key={idx}>{seg.text}</span>
              ))}
            </motion.div>
          </div>
        )}

        {/* Copy result */}
        {replaced && (
          <motion.button initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            onClick={() => copyRes(result)} whileHover={{ scale: 1.01, y: -2 }} whileTap={{ scale: .97 }}
            style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: 15, color: '#fff', marginBottom: 12, transition: 'background .3s, box-shadow .3s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              background: copiedRes ? 'linear-gradient(135deg,#22c55e,#16a34a)' : 'linear-gradient(135deg,#4CAF50,#22c55e)',
              boxShadow: '0 6px 20px rgba(34,197,94,.28)' }}>
            {copiedRes ? <><Check size={18} /> Copied!</> : <><Copy size={18} /> Copy Replaced Text</>}
          </motion.button>
        )}

        {/* History */}
        {persistedHistory.length > 0 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.6px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Clock size={14} color="#4F8EF7" /> Replace History ({persistedHistory.length})
              </label>
              <button
                onClick={clearToolHistory}
                style={{ background: 'none', border: 'none', color: '#71717a', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <Trash2 size={12} /> Clear
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {persistedHistory.map((entry, i) => {
                const meta = entry.metadata || {}
                const matchingUndo = undoStack.find(u => u.find === meta.find)
                return (
                  <motion.div key={entry.id || i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#F5F7FF', borderRadius: 10, border: '1px solid rgba(79,142,247,.1)' }}>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: '#555' }}>
                      <span style={{ color: '#ef4444', fontFamily: 'monospace', background: 'rgba(239,68,68,.08)', padding: '1px 5px', borderRadius: 3 }}>{meta.find || 'find'}</span>
                      {' → '}
                      <span style={{ color: '#22c55e', fontFamily: 'monospace', background: 'rgba(34,197,94,.08)', padding: '1px 5px', borderRadius: 3 }}>{meta.with || '(deleted)'}</span>
                      {meta.count ? <span style={{ color: '#888', fontSize: 10.5, marginLeft: 8 }}>{meta.count}×</span> : null}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {matchingUndo && (
                        <motion.button whileHover={{ scale: 1.06 }} whileTap={{ scale: .93 }}
                          onClick={() => { setText(matchingUndo.text); setReplaced(false); setResult('') }}
                          style={{ padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: '1.5px solid rgba(79,142,247,.2)', background: 'rgba(79,142,247,.07)', color: '#4F8EF7', flexShrink: 0 }}>
                          ↩ Undo
                        </motion.button>
                      )}
                      <button
                        onClick={() => removeHistoryEntry(entry.id)}
                        style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', padding: 2 }}
                        title="Remove"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>
        )}
      </ToolCard>

      {/* AI Smart Replace */}
      <SmartReplacePanel
        text={activeText || text}
        find={find}
        onSuggestionPick={s => setWithText(s)}
      />

    </ToolShell>
  )
}
