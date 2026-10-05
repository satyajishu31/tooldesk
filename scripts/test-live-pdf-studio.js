import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9342
const BASE_URL = 'https://tooldesk-app.netlify.app'
const tmp = `/tmp/chrome-tooldesk-pdf-live-${Date.now()}`
fs.mkdirSync(tmp, { recursive: true })

function sleep(ms) {
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
    const exc = res.exceptionDetails.exception?.description || res.exceptionDetails.text || 'Eval error'
    throw new Error(`Eval error: ${exc}`)
  }
  return res.result?.value
}

async function run() {
  console.log('===> Starting Live Production PDF Studio Verification on https://tooldesk-app.netlify.app/tools/pdf...')

  chrome = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${tmp}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    `${BASE_URL}/tools/pdf`
  ], { stdio: 'ignore' })

  let retries = 30
  let pageWsUrl = null
  while (retries > 0) {
    await sleep(200)
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const list = await res.json()
      const p = list.find(t => t.type === 'page' && t.url.includes(BASE_URL)) || list.find(t => t.type === 'page')
      if (p && p.webSocketDebuggerUrl) {
        pageWsUrl = p.webSocketDebuggerUrl
        break
      }
    } catch (e) {}
    retries--
  }

  if (!pageWsUrl) throw new Error('Could not connect to Headless Chrome remote debugging port.')

  const WebSocket = (await import('ws')).default
  ws = new WebSocket(pageWsUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) reject(msg.error)
      else resolve(msg.result)
    }
  }

  await send('Page.enable')
  await send('Runtime.enable')

  await send('Page.navigate', { url: `${BASE_URL}/tools/pdf` })
  await sleep(2000)

  // 1. Verify Page Title
  const title = await evaluate('document.title')
  console.log(`  ✓ LIVE Title: "${title}"`)

  // 2. Verify Studio Suite Tabs
  const tabs = await evaluate(`
    Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(t => 
      ['Convert to PDF', 'Convert from PDF', 'Organize', 'Security & Sign', 'Optimize & Edit'].includes(t)
    )
  `)
  console.log(`  ✓ LIVE Studio Suite Tabs: [${tabs.join(' | ')}]`)
  if (tabs.length !== 5) throw new Error(`Expected 5 studio suite categories, found ${tabs.length}`)

  // 3. Verify DOCX to PDF Action is available by default
  const activeAction = await evaluate(`
    document.body.innerText.includes('DOCX to PDF') && document.body.innerText.includes('Word document to vector PDF')
  `)
  console.log(`  ✓ LIVE Default Action (DOCX to PDF) rendered: ${activeAction}`)
  if (!activeAction) throw new Error('DOCX to PDF action card missing')

  // 4. Test Category Switching: Switch to "Security & Sign"
  await evaluate(`
    const secBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Security & Sign'));
    if (secBtn) secBtn.click();
  `)
  await sleep(600)

  const secActions = await evaluate(`
    document.body.innerText.includes('Permanent Redaction') && 
    document.body.innerText.includes('Lock / Encrypt PDF') &&
    document.body.innerText.includes('Sign PDF')
  `)
  console.log(`  ✓ LIVE "Security & Sign" category switch: ${secActions}`)
  if (!secActions) throw new Error('Security & Sign actions missing')

  // 5. Switch to "Organize"
  await evaluate(`
    const orgBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Organize'));
    if (orgBtn) orgBtn.click();
  `)
  await sleep(600)

  const orgActions = await evaluate(`
    document.body.innerText.includes('Merge PDFs') && 
    document.body.innerText.includes('Split All Pages') &&
    document.body.innerText.includes('Crop Pages')
  `)
  console.log(`  ✓ LIVE "Organize" category switch: ${orgActions}`)
  if (!orgActions) throw new Error('Organize actions missing')

  // 6. Switch back to "Convert to PDF"
  await evaluate(`
    const toPdfBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Convert to PDF'));
    if (toPdfBtn) toPdfBtn.click();
  `)
  await sleep(600)

  console.log('\n🎉 LIVE PRODUCTION PDF STUDIO VALIDATION COMPLETE: ALL CHECKS PASSED!\n')

  try { ws.close() } catch(e) {}
  try { chrome.kill() } catch(e) {}
  try { fs.rmSync(tmp, { recursive: true, force: true }) } catch(e) {}
}

run().catch(err => {
  console.error('Fatal live test error:', err)
  try { if (chrome) chrome.kill() } catch(e) {}
  process.exit(1)
})
