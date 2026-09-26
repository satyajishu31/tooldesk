import puppeteer from 'puppeteer-core'
import fs from 'fs'

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE_URL = 'http://localhost:4173'

const ROUTES = [
  '/',
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

async function runConsoleAndErrorStressTest() {
  console.log('Starting Deep Console & PageError Stress Test across all routes...')
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  })

  const auditLog = {
    totalRoutesChecked: ROUTES.length,
    pageErrors: [],
    consoleErrors: [],
    routeResults: {}
  }

  const page = await browser.newPage()

  page.on('pageerror', err => {
    console.error(`[PAGE_ERROR] ${err.message}`)
    auditLog.pageErrors.push({
      message: err.message,
      stack: err.stack
    })
  })

  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text()
      // Filter out benign network errors like expected 400s or cancelled aborts
      if (!text.includes('favicon.ico') && !text.includes('Failed to load resource: the server responded with a status of 404')) {
        console.warn(`[CONSOLE_ERROR] ${text}`)
        auditLog.consoleErrors.push(text)
      }
    }
  })

  for (const route of ROUTES) {
    const url = `${BASE_URL}${route}`
    try {
      const res = await page.goto(url, { waitUntil: 'networkidle0', timeout: 15000 })
      const status = res ? res.status() : 0

      // Simulate aggressive user interaction
      await page.evaluate(() => {
        // Find inputs and set extreme values
        const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea'))
        for (const input of inputs) {
          if (input.type === 'range') {
            input.value = input.max || 100
            input.dispatchEvent(new Event('input', { bubbles: true }))
          } else if (input.type === 'text' || input.tagName === 'TEXTAREA') {
            input.value = '🚀 ToolDesk Universal Quality Gate Unicode & Stress Test 漢字'
            input.dispatchEvent(new Event('input', { bubbles: true }))
          }
        }
      })

      auditLog.routeResults[route] = {
        httpStatus: status,
        passed: status === 200
      }
    } catch (err) {
      console.error(`[STRESS_FAIL] ${route}:`, err.message)
      auditLog.routeResults[route] = {
        error: err.message,
        passed: false
      }
    }
  }

  await browser.close()

  const outPath = '/Users/satyajishu/.gemini/antigravity-ide/brain/d69d3f01-08aa-4748-9e7c-1400c91c27c5/stress_test_results.json'
  fs.writeFileSync(outPath, JSON.stringify(auditLog, null, 2))

  console.log('=== Deep Stress Test Completed ===')
  console.log(`Page Errors: ${auditLog.pageErrors.length}, Console Errors: ${auditLog.consoleErrors.length}`)
  console.log(`Report saved to: ${outPath}`)
}

runConsoleAndErrorStressTest().catch(err => {
  console.error('Stress test script fatal:', err)
  process.exit(1)
})
