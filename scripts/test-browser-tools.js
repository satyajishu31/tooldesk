import { spawn } from 'node:child_process'
import fs from 'node:fs'

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9222
const BASE_URL = 'http://localhost:4173'

const ROUTES = [
  '/tools/password',
  '/tools/wordcount',
  '/tools/textcase',
  '/tools/units',
  '/tools/currency',
  '/tools/gradient',
  '/tools/quote',
  '/tools/favicon',
  '/tools/thumbnail',
  '/tools/imgresizer',
  '/tools/imgcompress',
  '/tools/imgconvert',
  '/tools/bgremove',
  '/tools/pdf',
  '/tools/aspectratio',
  '/tools/fileconvert',
  '/tools/vault',
  '/tools/image-tools',
  '/tools/imgborder',
  '/tools/roundcorner',
  '/tools/randname',
  '/tools/randaddress',
  '/tools/wordreplace',
  '/tools/bcrypt',
  '/tools/colorpicker',
  '/tools/video-screenshot',
  '/tools/video-transcriber',
  '/tools/website-analyzer',
  '/tools/translator',
  '/tools/qrcode',
  '/tools/barcode',
  '/tools/qrscan',
  '/tools/breach-check',
  '/tools/ip-lookup',
  '/tools/system-info',
  '/tools/country-finder'
]

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function run() {
  const tmpDir = '/tmp/chrome-test-tooldesk-' + Date.now()
  fs.mkdirSync(tmpDir, { recursive: true })

  console.log('Launching headless Chrome...')
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${tmpDir}`,
    '--no-default-browser-check',
    '--no-first-run',
    `${BASE_URL}/`
  ], { stdio: 'ignore' })

  try {
    let pageWsUrl = null
    for (let i = 0; i < 30; i++) {
      await sleep(250)
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
        const targets = await res.json()
        const page = targets.find(t => t.type === 'page')
        if (page && page.webSocketDebuggerUrl) {
          pageWsUrl = page.webSocketDebuggerUrl
          break
        }
      } catch (e) {}
    }

    if (!pageWsUrl) {
      throw new Error('Failed to find page debugger WebSocket URL')
    }
    console.log('Connected to page WebSocket:', pageWsUrl)

    const ws = new WebSocket(pageWsUrl)
    await new Promise((res, rej) => {
      ws.onopen = res
      ws.onerror = rej
    })

    let id = 1
    const pending = new Map()
    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const msgId = id++
        pending.set(msgId, { resolve, reject })
        ws.send(JSON.stringify({ id: msgId, method, params }))
      })
    }

    const errors = []

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id)
        pending.delete(msg.id)
        if (msg.error) reject(msg.error)
        else resolve(msg.result)
        return
      }

      if (msg.method === 'Runtime.exceptionThrown') {
        const exc = msg.params.exceptionDetails
        const text = exc.exception?.description || exc.text || 'Unknown exception'
        errors.push({
          type: 'exception',
          text,
          url: exc.url,
          lineNumber: exc.lineNumber
        })
      } else if (msg.method === 'Console.messageAdded') {
        const m = msg.params.message
        if (m.level === 'error') {
          errors.push({
            type: 'console.error',
            text: m.text,
            url: m.url,
            line: m.line
          })
        }
      }
    }

    await send('Page.enable')
    await send('Runtime.enable')
    await send('Console.enable')

    console.log(`\nTesting ${ROUTES.length} tool routes...`)

    const failures = []

    for (const route of ROUTES) {
      errors.length = 0
      process.stdout.write(`Testing ${route}... `)
      await send('Page.navigate', { url: `${BASE_URL}${route}` })
      
      // Wait for page to navigate and render
      await sleep(1000)

      const evalRes = await send('Runtime.evaluate', {
        expression: `(() => {
          const hasCrash = document.body ? document.body.innerText.includes('Something went wrong') : false;
          const errPre = document.querySelector('pre') ? document.querySelector('pre').innerText : '';
          return { hasCrash, errPre };
        })()`,
        returnByValue: true
      })

      const status = evalRes?.result?.value || {}
      const curErrors = [...errors]

      if (status.hasCrash || curErrors.length > 0) {
        console.log('FAILED ✗')
        failures.push({
          route,
          status,
          errors: curErrors
        })
      } else {
        console.log('OK ✓')
      }
    }

    console.log('\n=======================================')
    console.log(`Results: ${ROUTES.length - failures.length}/${ROUTES.length} passed.`)
    if (failures.length > 0) {
      console.log(`\nFound ${failures.length} failing routes:`)
      for (const f of failures) {
        console.log(`\n--- ROUTE: ${f.route} ---`)
        if (f.status.hasCrash) {
          console.log(`Crash detected in DOM: ${f.status.errPre}`)
        }
        for (const e of f.errors) {
          console.log(`[${e.type}] ${e.text} (${e.url}:${e.lineNumber || e.line})`)
        }
      }
    } else {
      console.log('\n🎉 ALL ROUTES LOADED WITH 0 ERRORS!')
    }

    ws.close()
  } finally {
    chrome.kill()
    try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch (e) {}
  }
}

run().catch(console.error)
