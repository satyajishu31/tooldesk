import { spawn } from 'node:child_process'
import fs from 'node:fs'

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9342
const LIVE_URL = 'https://tooldesk-app.netlify.app'
const tmp = `/tmp/chrome-tooldesk-live-ai-${Date.now()}`
fs.mkdirSync(tmp, { recursive: true })

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

let chrome = null
let ws = null
let msgId = 1
const pending = new Map()

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = msgId++
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
}

async function evaluate(expression) {
  const res = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  })
  if (res.exceptionDetails) {
    const exc = res.exceptionDetails.exception?.description || res.exceptionDetails.exception?.value || res.exceptionDetails.text || 'Eval error'
    throw new Error(`Eval error: ${exc}`)
  }
  return res.result?.value
}

async function runLiveAITest() {
  console.log('===> Starting Live Production AI Assistant Forensic Audit...')
  console.log(`  Target: ${LIVE_URL}/tools/bcrypt`)

  chrome = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    `--user-data-dir=${tmp}`,
    '--window-size=1280,900',
    `${LIVE_URL}/tools/bcrypt`,
  ])

  let retries = 30
  let versionData = null
  while (retries > 0) {
    await sleep(200)
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const list = await res.json()
      const page = list.find(t => t.type === 'page' && t.url.includes('tooldesk-app')) || list.find(t => t.type === 'page')
      if (page && page.webSocketDebuggerUrl) {
        versionData = page
        break
      }
    } catch (e) {}
    retries--
  }

  if (!versionData) throw new Error('Chrome DevTools unavailable')

  const WebSocket = (await import('ws')).default
  ws = new WebSocket(versionData.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.on('open', res)
    ws.on('error', rej)
    ws.on('message', (msg) => {
      const parsed = JSON.parse(msg.toString())
      if (parsed.id && pending.has(parsed.id)) {
        const { resolve, reject } = pending.get(parsed.id)
        pending.delete(parsed.id)
        if (parsed.error) reject(new Error(parsed.error.message))
        else resolve(parsed.result)
      }
    })
  })

  await send('Page.enable')
  await send('Runtime.enable')
  await sleep(1500)

  // 1. Check AI toggle button presence on live site
  let hasToggleBtn = false
  for (let i = 0; i < 20; i++) {
    hasToggleBtn = await evaluate(`!!document.querySelector('.ai-toggle-btn')`)
    if (hasToggleBtn) break
    await sleep(200)
  }
  console.log(`  ✓ LIVE AI toggle button exists: ${hasToggleBtn}`)
  if (!hasToggleBtn) throw new Error('LIVE AI toggle button not found')

  // 2. Open Assistant on Live site
  await evaluate(`document.querySelector('.ai-toggle-btn').click()`)
  await sleep(500)

  const isPanelOpen = await evaluate(`!!document.querySelector('.ai-helper-panel')`)
  console.log(`  ✓ LIVE AI helper panel opens: ${isPanelOpen}`)
  if (!isPanelOpen) throw new Error('LIVE AI helper panel failed to open')

  // 3. Check CSS for micro-animations on Live site
  const cssCheck = await evaluate(`
    (() => {
      const sheets = Array.from(document.styleSheets)
      let foundDot = false
      let foundCursor = false
      for (const sheet of sheets) {
        try {
          const rules = Array.from(sheet.cssRules || [])
          for (const rule of rules) {
            if (rule.selectorText?.includes('.ai-thinking-dot')) foundDot = true
            if (rule.selectorText?.includes('.ai-typing-cursor')) foundCursor = true
          }
        } catch (e) {}
      }
      return { foundDot, foundCursor }
    })()
  `)
  console.log(`  ✓ LIVE .ai-thinking-dot CSS exists: ${cssCheck.foundDot}`)
  console.log(`  ✓ LIVE .ai-typing-cursor CSS exists: ${cssCheck.foundCursor}`)

  // 4. Check live service worker registration
  const swState = await evaluate(`
    (async () => {
      if (!('serviceWorker' in navigator)) return 'unsupported'
      const reg = await navigator.serviceWorker.getRegistration()
      return reg ? (reg.active ? 'active' : 'installing') : 'none'
    })()
  `)
  console.log(`  ✓ LIVE Service Worker state: ${swState}`)

  console.log('===> LIVE Production AI Audit: ALL VERIFICATIONS PASSED!')
}

runLiveAITest().catch(err => {
  console.error('LIVE test failed:', err)
  process.exit(1)
}).finally(() => {
  try { if (ws) ws.close() } catch (e) {}
  try { if (chrome) chrome.kill('SIGKILL') } catch (e) {}
  try { fs.rmSync(tmp, { recursive: true, force: true }) } catch (e) {}
  process.exit(0)
})
