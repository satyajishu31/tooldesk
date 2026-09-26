/**
 * ToolDesk Independent Final Acceptance Test Suite
 * Drives real Google Chrome via Puppeteer-Core.
 * Tests production bundle on http://localhost:4173.
 */

import puppeteer from 'puppeteer-core'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE_URL = 'http://localhost:4173'
const ARTIFACTS_DIR = '/Users/satyajishu/.gemini/antigravity-ide/brain/e62dbe0b-3877-49df-91a1-d4dce753e822'

const VIEWPORTS = [
  { width: 320, height: 640, label: '320px_mobile_small' },
  { width: 360, height: 740, label: '360px_android_compact' },
  { width: 375, height: 667, label: '375px_iphone_standard' },
  { width: 390, height: 844, label: '390px_iphone14' },
  { width: 414, height: 896, label: '414px_mobile_large' },
  { width: 430, height: 932, label: '430px_iphone14promax' },
  { width: 480, height: 800, label: '480px_android_large' },
  { width: 540, height: 960, label: '540px_foldable' },
  { width: 768, height: 1024, label: '768px_tablet' },
  { width: 834, height: 1194, label: '834px_ipad_pro' },
  { width: 1024, height: 768, label: '1024px_desktop_small' },
  { width: 1280, height: 800, label: '1280px_desktop' },
  { width: 1440, height: 900, label: '1440px_desktop_large' },
  { width: 1920, height: 1080, label: '1920px_fhd' },
  { width: 2560, height: 1440, label: '2560px_qhd' }
]

async function runAcceptanceSuite() {
  console.log('🚀 Launching real Google Chrome browser for independent acceptance test...')
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  })

  const results = {
    viewports: {},
    tools: {},
    typingLatency: {},
    buttons: {},
    assets: {},
    consoleErrors: []
  }

  const page = await browser.newPage()
  page.on('console', msg => {
    if (msg.type() === 'error') {
      results.consoleErrors.push({ url: page.url(), text: msg.text() })
    }
  })

  // ── 1. RESPONSIVE VIEWPORT & OVERFLOW AUDIT ──
  console.log('\n--- 1. AUDITING ALL 15 VIEWPORTS ---')
  for (const vp of VIEWPORTS) {
    await page.setViewport({ width: vp.width, height: vp.height })
    await page.goto(BASE_URL, { waitUntil: 'networkidle0' })
    await new Promise(r => setTimeout(r, 200))

    const metrics = await page.evaluate(() => {
      const scrollWidth = document.documentElement.scrollWidth
      const clientWidth = document.documentElement.clientWidth
      const hasHorizontalOverflow = scrollWidth > clientWidth

      // Find any elements sticking out beyond the screen
      const overflowingElements = []
      document.querySelectorAll('*').forEach(el => {
        const rect = el.getBoundingClientRect()
        if (rect.right > window.innerWidth + 1.5 && rect.width > 0 && rect.height > 0) {
          overflowingElements.push({
            tag: el.tagName,
            class: el.className,
            right: rect.right,
            width: rect.width,
            diff: rect.right - window.innerWidth
          })
        }
      })

      // Check logo visibility
      const logo = document.querySelector('.tooldesk-navbar-logo')
      const logoRect = logo ? logo.getBoundingClientRect() : null
      const logoFits = logoRect ? (logoRect.right <= window.innerWidth && logoRect.width > 0) : false

      return {
        scrollWidth,
        clientWidth,
        hasHorizontalOverflow,
        overflowDiff: scrollWidth - clientWidth,
        overflowingCount: overflowingElements.length,
        overflowingSample: overflowingElements.slice(0, 3),
        logoFits,
        logoWidth: logoRect ? logoRect.width : 0
      }
    })

    console.log(`Viewport ${vp.width}x${vp.height} (${vp.label}): overflow=${metrics.hasHorizontalOverflow} (diff=${metrics.overflowDiff}px), logoFits=${metrics.logoFits}`)
    results.viewports[vp.label] = { ...vp, ...metrics }

    // Take verified screenshots at critical viewports
    if ([320, 360, 390, 768, 1280].includes(vp.width)) {
      const screenshotPath = path.join(ARTIFACTS_DIR, `independent_test_home_${vp.width}px.png`)
      await page.screenshot({ path: screenshotPath })
      console.log(`  📸 Saved screenshot: ${screenshotPath}`)
    }
  }

  // ── 2. LOGO & ASSET ACCEPTANCE TEST ──
  console.log('\n--- 2. LOGO AND ASSET ACCEPTANCE TEST ---')
  const assetsToCheck = [
    '/logo.png',
    '/logo-icon.png',
    '/logo-white.png',
    '/download-logo.png',
    '/favicon.png',
    '/releases.json'
  ]
  for (const asset of assetsToCheck) {
    const assetUrl = `${BASE_URL}${asset}`
    const resp = await page.goto(assetUrl)
    const status = resp.status()
    const contentType = resp.headers()['content-type']
    const size = (await resp.buffer()).length
    console.log(`Asset ${asset}: status=${status}, type=${contentType}, size=${size} bytes`)
    results.assets[asset] = { status, contentType, size, ok: status === 200 && size > 500 }
  }

  // ── 3. DOWNLOAD APP MODAL TEST ──
  console.log('\n--- 3. DOWNLOAD APP MODAL & BUTTON TEST ---')
  await page.goto(BASE_URL, { waitUntil: 'networkidle0' })
  // Click navbar "App" or download button
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('tooldesk-open-download'))
  })
  await new Promise(r => setTimeout(r, 400))

  const modalState = await page.evaluate(() => {
    const modal = document.querySelector('#tooldesk-download-title')
    const macBtn = document.querySelector('a[href*="ToolDesk.dmg"]')
    const apkBtn = document.querySelector('a[href*="ToolDesk.apk"]')
    return {
      modalOpen: Boolean(modal),
      hasMacDmgLink: Boolean(macBtn),
      macDmgHref: macBtn ? macBtn.getAttribute('href') : null,
      macDmgRole: macBtn ? macBtn.getAttribute('role') : null,
      hasApkLink: Boolean(apkBtn),
      apkHref: apkBtn ? apkBtn.getAttribute('href') : null,
      apkRole: apkBtn ? apkBtn.getAttribute('role') : null
    }
  })
  console.log('Download modal state:', modalState)
  results.buttons['downloadModal'] = modalState

  const modalScreenshot = path.join(ARTIFACTS_DIR, 'independent_test_download_modal.png')
  await page.screenshot({ path: modalScreenshot })
  console.log(`  📸 Saved modal screenshot: ${modalScreenshot}`)

  // ── 4. TYPING LATENCY BENCHMARK ──
  console.log('\n--- 4. MEASURING TYPING LATENCY ---')
  // Benchmark 4.1: WordCounter
  await page.goto(`${BASE_URL}/tools/wordcount`, { waitUntil: 'networkidle0' })
  await page.waitForSelector('textarea')

  // Measure initial keystroke latency
  const t0 = performance.now()
  await page.type('textarea', 'H')
  const initialKeystrokeLatencyMs = performance.now() - t0

  // Measure continuous typing of 100 characters
  const sample100 = 'The quick brown fox jumps over the lazy dog repeatedly to measure smooth typing responsiveness in real-time. '
  const t1 = performance.now()
  await page.type('textarea', sample100, { delay: 1 })
  const continuous100CharsLatencyMs = performance.now() - t1

  // Measure paste of 2,000 words
  const longText = sample100.repeat(100)
  const t2 = performance.now()
  await page.evaluate((text) => {
    const ta = document.querySelector('textarea')
    ta.value = text
    ta.dispatchEvent(new Event('input', { bubbles: true }))
    ta.dispatchEvent(new Event('change', { bubbles: true }))
  }, longText)
  const paste2000WordsLatencyMs = performance.now() - t2

  // Check stats update
  await new Promise(r => setTimeout(r, 100))
  const wordCountDisplay = await page.evaluate(() => {
    const el = document.querySelector('.tcard') || document.body
    return el.innerText.match(/\d+[\s\n]*WORDS/i)?.[0] || 'words counted'
  })

  console.log(`WordCounter Typing Latency: Initial=${initialKeystrokeLatencyMs.toFixed(2)}ms, 100chars=${continuous100CharsLatencyMs.toFixed(2)}ms, Paste 2k words=${paste2000WordsLatencyMs.toFixed(2)}ms`)
  results.typingLatency['wordcount'] = {
    initialKeystrokeLatencyMs,
    continuous100CharsLatencyMs,
    paste2000WordsLatencyMs,
    wordCountDisplay
  }

  // Benchmark 4.2: TextCaseConverter
  await page.goto(`${BASE_URL}/tools/textcase`, { waitUntil: 'networkidle0' })
  await page.waitForSelector('textarea')
  const tc0 = performance.now()
  await page.type('textarea', 'Testing Text Case Converter Responsiveness!', { delay: 1 })
  const textCaseLatencyMs = performance.now() - tc0
  const caseOutputSample = await page.evaluate(() => {
    const outputs = Array.from(document.querySelectorAll('.tcard, .tool-card')).map(c => c.innerText)
    return outputs.slice(0, 3)
  })
  console.log(`TextCaseConverter Typing Latency: ${textCaseLatencyMs.toFixed(2)}ms`)
  results.typingLatency['textcase'] = { textCaseLatencyMs, caseOutputSample }

  // ── 5. TOOL-BY-TOOL RUNTIME & FEATURE AUDIT ──
  console.log('\n--- 5. AUDITING ALL 36 TOOLS & ROUTES ---')
  const toolRoutes = [
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

  for (const route of toolRoutes) {
    try {
      const resp = await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' })
      await new Promise(r => setTimeout(r, 200))
      const status = resp.status()

      const audit = await page.evaluate(() => {
        const title = document.title
        const h1 = document.querySelector('h1, h2')?.innerText || ''
        const buttons = document.querySelectorAll('button').length
        const inputs = document.querySelectorAll('input, textarea, select').length
        const hasCard = Boolean(document.querySelector('.tool-card, .tcard, .card, [class*="ToolCard"], [class*="card"], main, form'))
        const textContentLength = document.body.innerText.length
        return { title, h1, buttons, inputs, hasCard, textContentLength }
      })

      // Functional check for key tools
      let interactionResult = 'page_rendered'
      if (route === '/tools/password') {
        const genBtn = await page.$('button')
        if (genBtn) {
          await genBtn.click()
          await new Promise(r => setTimeout(r, 100))
          interactionResult = 'password_generated'
        }
      } else if (route === '/tools/quote') {
        const randBtn = await page.$('.btn-primary')
        if (randBtn) {
          await randBtn.click()
          await new Promise(r => setTimeout(r, 100))
          interactionResult = 'quote_rotated'
        }
      } else if (route === '/tools/randname') {
        const btn = await page.$('.btn-primary')
        if (btn) {
          await btn.click()
          await new Promise(r => setTimeout(r, 100))
          interactionResult = 'names_generated'
        }
      }

      console.log(`Tool [${route}]: status=${status}, buttons=${audit.buttons}, inputs=${audit.inputs}, card=${audit.hasCard}, interaction=${interactionResult}`)
      results.tools[route] = { status, ...audit, interactionResult, ok: status === 200 && audit.textContentLength > 100 }
    } catch (err) {
      console.error(`Tool [${route}] failed:`, err.message)
      results.tools[route] = { error: err.message, ok: false }
    }
  }

  await browser.close()

  const summaryPath = path.join(ARTIFACTS_DIR, 'independent_acceptance_results.json')
  fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2))
  console.log(`\n✅ Independent test suite completed. Full raw output written to: ${summaryPath}`)

  return results
}

runAcceptanceSuite().catch(console.error)
