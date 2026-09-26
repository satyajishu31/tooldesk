const SENSITIVE_PATTERN = /password|vault|pin|passphrase|secret|private|credential|bcrypt|hash/i
const BCRYPT_SIG = /^\$2[aby]\$\d{2}\$/

export function addToHistory(item) {
  if (!item) return
  const itemDesc = `${item.tool || ''} ${item.label || ''}`
  const valSample = typeof item.value === 'string' ? item.value.slice(0, 100) : ''
  if (SENSITIVE_PATTERN.test(itemDesc) || SENSITIVE_PATTERN.test(valSample) || BCRYPT_SIG.test(valSample)) {
    // Zero-Trust Security: Block cleartext credentials and password hashes from localStorage
    return
  }
  try {
    const raw = localStorage.getItem('tooldesk-history')
    let parsed
    try { parsed = JSON.parse(raw) } catch {}
    const list = Array.isArray(parsed) ? parsed : []
    const updated = [
      {
        id: Math.random().toString(36).slice(2, 9),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        ...item
      },
      ...list
    ].slice(0, 20)
    
    localStorage.setItem('tooldesk-history', JSON.stringify(updated))
    window.dispatchEvent(new Event('tooldesk-history-updated'))
  } catch (e) {
    console.error('History save failed:', e)
  }
}
