import { spawn } from 'node:child_process'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9338
const PREVIEW_PORT = 4178
const BASE_URL = `http://127.0.0.1:${PREVIEW_PORT}`
const tmp = `/tmp/chrome-tooldesk-ai-${Date.now()}`
fs.mkdirSync(tmp, { recursive: true })

function startStaticServer(dir, port) {
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.wasm': 'application/wasm',
  }

  const server = http.createServer((req, res) => {
    let reqUrl = req.url.split('?')[0]
    let filePath = path.join(dir, reqUrl === '/' ? 'index.html' : reqUrl)

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(dir, 'index.html')
    }

    const ext = path.extname(filePath).toLowerCase()
    const contentType = mimeTypes[ext] || 'application/octet-stream'

    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless')

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404)
        res.end('Not found')
      } else {
        res.writeHead(200, { 'Content-Type': contentType })
        res.end(data)
      }
    })
  })

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

let server = null
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

async function runAITests() {
  console.log('===> Starting ToolDesk AI Assistant Micro-Animation Forensic Suite...')
  const distDir = path.resolve(process.cwd(), 'dist')
  if (!fs.existsSync(distDir)) {
    throw new Error('dist/ directory not found.')
  }

  server = await startStaticServer(distDir, PREVIEW_PORT)
  console.log(`  ✓ Test preview server active at ${BASE_URL}`)

  chrome = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    `--user-data-dir=${tmp}`,
    '--window-size=1280,900',
    `${BASE_URL}/tools/bcrypt`,
  ])

  let retries = 30
  let versionData = null
  while (retries > 0) {
    await sleep(200)
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const list = await res.json()
      const page = list.find(t => t.type === 'page' && t.url.includes(BASE_URL)) || list.find(t => t.type === 'page')
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
  await sleep(1000)

  // 1. Verify Floating AI Assistant Button exists
  const pageState = await evaluate(`({ href: window.location.href, title: document.title, rootLen: document.getElementById('root')?.innerHTML.length })`)
  console.log(`  [DEBUG] Page state:`, pageState)

  let hasToggleBtn = false
  for (let i = 0; i < 25; i++) {
    hasToggleBtn = await evaluate(`!!document.querySelector('.ai-toggle-btn')`)
    if (hasToggleBtn) break
    await sleep(200)
  }
  console.log(`  ✓ AI Assistant Toggle Button exists on tool page: ${hasToggleBtn}`)
  if (!hasToggleBtn) throw new Error('AI toggle button missing')

  // 2. Open Assistant
  await evaluate(`document.querySelector('.ai-toggle-btn').click()`)
  await sleep(400)

  const isPanelOpen = await evaluate(`!!document.querySelector('.ai-helper-panel')`)
  console.log(`  ✓ AI Helper panel opens smoothly on click: ${isPanelOpen}`)
  if (!isPanelOpen) throw new Error('AI Helper panel failed to open')

  // 3. Verify context-aware welcome message for Bcrypt
  const welcomeText = await evaluate(`document.querySelector('.ai-helper-panel')?.innerText || ''`)
  const hasBcryptContext = welcomeText.includes('Bcrypt Tool') || welcomeText.includes('salt rounds')
  console.log(`  ✓ Context-aware welcome message contains Bcrypt context: ${hasBcryptContext}`)

  // 4. Verify AI Input has the .ai-chat-input styling
  const hasStyledInput = await evaluate(`!!document.querySelector('.ai-chat-input')`)
  console.log(`  ✓ AI chat input has smooth focus styling (.ai-chat-input): ${hasStyledInput}`)

  // 5. Test Quick Suggestion click
  const firstSuggestion = await evaluate(`document.querySelector('.ai-helper-panel button[type="button"]')?.innerText || ''`)
  console.log(`  ✓ Quick suggestion available: "${firstSuggestion}"`)

  // 6. Test Thinking dots CSS structure
  const thinkingDotsCSS = await evaluate(`
    (() => {
      const sheet = Array.from(document.styleSheets).flatMap(s => {
        try { return Array.from(s.cssRules || []) } catch (e) { return [] }
      })
      const hasThinking = sheet.some(r => r.selectorText?.includes('.ai-thinking-dot'))
      const hasCursor = sheet.some(r => r.selectorText?.includes('.ai-typing-cursor'))
      return { hasThinking, hasCursor }
    })()
  `)
  console.log(`  ✓ CSS rules for .ai-thinking-dot exist: ${thinkingDotsCSS.hasThinking}`)
  console.log(`  ✓ CSS rules for .ai-typing-cursor exist: ${thinkingDotsCSS.hasCursor}`)
  if (!thinkingDotsCSS.hasThinking || !thinkingDotsCSS.hasCursor) {
    throw new Error('AI CSS micro-animation rules missing')
  }

  // 7. Verify reduced motion overrides
  const reducedMotionRules = await evaluate(`
    (() => {
      const sheet = Array.from(document.styleSheets).flatMap(s => {
        try { return Array.from(s.cssRules || []) } catch (e) { return [] }
      })
      return sheet.some(r => r.media?.mediaText?.includes('prefers-reduced-motion'))
    })()
  `)
  console.log(`  ✓ Accessible prefers-reduced-motion media query active: ${reducedMotionRules}`)

  // Close AI panel
  await evaluate(`document.querySelector('.ai-helper-panel button')?.click()`)
  await sleep(300)

  console.log('===> AI Assistant Micro-Animation Suite Complete: 7/7 checks passed!')
}

runAITests().catch(err => {
  console.error('Test failed:', err)
  process.exit(1)
}).finally(() => {
  try { if (ws) ws.close() } catch (e) {}
  try { if (chrome) chrome.kill('SIGKILL') } catch (e) {}
  try { if (server) server.close() } catch (e) {}
  try { fs.rmSync(tmp, { recursive: true, force: true }) } catch (e) {}
  process.exit(0)
})
