import { spawn } from 'node:child_process'
import fs from 'node:fs'

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9337
const BASE_URL = 'https://tooldesk-app.netlify.app'
const tmp = `/tmp/chrome-tooldesk-live-${Date.now()}`
fs.mkdirSync(tmp, { recursive: true })

const VIEWPORTS = [
  { name: 'Mobile 320x667',  width: 320,  height: 667,  mobile: true },
  { name: 'Mobile 375x812',  width: 375,  height: 812,  mobile: true },
  { name: 'Mobile 390x844',  width: 390,  height: 844,  mobile: true },
  { name: 'Mobile 430x932',  width: 430,  height: 932,  mobile: true },
  { name: 'Tablet 768x1024', width: 768,  height: 1024, mobile: false },
  { name: 'Desktop 1280x800',width: 1280, height: 800,  mobile: false },
]

const KEY_TOOLS = [
  { id: 'bcrypt',      title: 'Bcrypt Generator',   path: '/tools/bcrypt' },
  { id: 'pdf',         title: 'PDF Studio Suite',   path: '/tools/pdf' },
  { id: 'qrcode',      title: 'QR & Barcode Studio',path: '/tools/qrcode' },
  { id: 'colorpicker', title: 'Color Picker',       path: '/tools/colorpicker' },
  { id: 'fileconvert', title: 'File Converter',     path: '/tools/fileconvert' }
]

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

async function setViewport(width, height, isMobile) {
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: isMobile,
    screenOrientation: { angle: 0, type: 'portraitPrimary' }
  })
}

async function runLiveAudit() {
  console.log('=================================================================')
  console.log(`LIVE PRODUCTION TEST AUDIT ON ${BASE_URL}`)
  console.log('=================================================================\n')

  chrome = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${tmp}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    `${BASE_URL}/`
  ], { stdio: 'ignore' })

  let pageWsUrl = null
  for (let i = 0; i < 30; i++) {
    await sleep(200)
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const targets = await res.json()
      const page = targets.find(t => t.type === 'page')
      if (page && page.webSocketDebuggerUrl) {
        pageWsUrl = page.webSocketDebuggerUrl
        break
      }
    } catch {}
  }

  if (!pageWsUrl) throw new Error('Could not connect to Chrome.')
  console.log('Connected to Headless Chrome remote debugging port.')

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

  let totalLiveChecks = 0

  for (const tool of KEY_TOOLS) {
    console.log(`\n▶ Verifying LIVE ${tool.title} (${tool.path})`)
    await send('Page.navigate', { url: `${BASE_URL}${tool.path}` })
    await sleep(1500)

    for (const vp of VIEWPORTS) {
      await setViewport(vp.width, vp.height, vp.mobile)
      await sleep(250)

      const result = await evaluate(`(() => {
        const docW = document.documentElement.scrollWidth
        const clientW = document.documentElement.clientWidth
        const overflow = docW > clientW + 1.5

        const tabRails = Array.from(document.querySelectorAll(
          '.tool-tabs, .apple-segmented, .tool-mode-tabs, .pdf-studio-categories, .wa-tabs, .qr-studio-tabs'
        ))

        const overlaps = []
        tabRails.forEach(rail => {
          const children = Array.from(rail.querySelectorAll(
            '.tool-tab, .apple-segmented-item, button, .pdf-studio-category-item'
          )).filter(el => {
            const rect = el.getBoundingClientRect()
            return rect.width > 0 && rect.height > 0
          })

          for (let i = 0; i < children.length - 1; i++) {
            const rectA = children[i].getBoundingClientRect()
            const rectB = children[i + 1].getBoundingClientRect()
            const sameRow = Math.abs(rectA.top - rectB.top) < 15
            const diff = rectA.right - rectB.left
            if (sameRow && diff > 1.0) {
              overlaps.push({
                a: children[i].innerText.trim(),
                b: children[i + 1].innerText.trim(),
                px: Math.round(diff)
              })
            }
          }
        })

        return {
          overflow,
          docW,
          clientW,
          overlapsCount: overlaps.length,
          overlaps
        }
      })()`)

      totalLiveChecks++

      if (result.overflow) {
        throw new Error(`LIVE Overflow failure on ${tool.title} at ${vp.name}: ${result.docW} > ${result.clientW}`)
      }
      if (result.overlapsCount > 0) {
        throw new Error(`LIVE Overlap failure on ${tool.title} at ${vp.name}: ${JSON.stringify(result.overlaps)}`)
      }
      console.log(`  ✓ ${vp.name}: 0px overlap, 0px doc overflow (docWidth=${result.docW}px, clientWidth=${result.clientW}px)`)
    }
  }

  // Functional check on live Bcrypt
  console.log('\n▶ LIVE Functional Interaction: Bcrypt Tab Switching on Mobile (375x812)')
  await setViewport(375, 812, true)
  await send('Page.navigate', { url: `${BASE_URL}/tools/bcrypt` })
  await sleep(1500)

  const clickCheck = await evaluate(`(() => {
    const tabs = Array.from(document.querySelectorAll('.tool-tabs button, .apple-segmented button'))
    const audit = tabs.find(t => t.innerText.includes('Security Audit'))
    if (!audit) return { ok: false, error: 'Security Audit tab not found' }
    audit.click()
    const rectAudit = audit.getBoundingClientRect()
    return {
      ok: true,
      labels: tabs.map(t => t.innerText.trim()),
      auditRect: { left: Math.round(rectAudit.left), width: Math.round(rectAudit.width) }
    }
  })()`)

  if (!clickCheck.ok) throw new Error(clickCheck.error)
  console.log(`  ✓ LIVE Bcrypt tabs: [${clickCheck.labels.join(' | ')}]`)
  console.log(`  ✓ Security Audit tab bounding rect: left=${clickCheck.auditRect.left}px, width=${clickCheck.auditRect.width}px`)
  console.log(`\n🎉 ALL ${totalLiveChecks} LIVE PRODUCTION CHECKS PASSED WITH ZERO OVERLAP!\n`)
}

runLiveAudit()
  .catch(err => {
    console.error('❌ LIVE PRODUCTION TEST ERROR:', err)
    process.exitCode = 1
  })
  .finally(() => {
    if (ws) try { ws.close() } catch {}
    if (chrome) try { chrome.kill('SIGKILL') } catch {}
    try { fs.rmSync(tmp, { recursive: true, force: true }) } catch {}
  })
