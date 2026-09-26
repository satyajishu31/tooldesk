import puppeteer from 'puppeteer-core'
import fs from 'fs'

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE_URL = 'http://localhost:4173'

async function runBenchmark() {
  console.log('Starting typing and button benchmark with Chrome at', CHROME_PATH)
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  })

  const results = {
    typing: {},
    buttonAcceptance: {},
    timestamp: new Date().toISOString()
  }

  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 800 })

  // 1. Word Counter Typing & Latency Test
  console.log('Testing Word Counter typing performance...')
  await page.goto(`${BASE_URL}/tools/wordcount`, { waitUntil: 'networkidle0' })
  const textarea = await page.waitForSelector('textarea')
  
  // Normal typing (50 chars)
  const t0 = performance.now()
  await textarea.type('The quick brown fox jumps over the lazy dog repeatedly.', { delay: 10 })
  const normalTypeTime = performance.now() - t0

  // Rapid typing (100 chars, delay 1ms)
  const t1 = performance.now()
  await textarea.type('Rapid typing performance verification test for ToolDesk pre-deployment quality gate validation.', { delay: 1 })
  const rapidTypeTime = performance.now() - t1

  // 10K+ text paste test
  const tenKText = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(200) // ~11,400 chars
  const t2 = performance.now()
  await page.evaluate((txt) => {
    const el = document.querySelector('textarea')
    el.value = txt
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }, tenKText)
  const pasteTime = performance.now() - t2

  const wordCountStats = await page.evaluate(() => {
    const textarea = document.querySelector('textarea')
    const text = textarea ? textarea.value : ''
    const stats = Array.from(document.querySelectorAll('.stat-card, [class*="stat"], .glass-card')).map(e => e.innerText.trim()).filter(Boolean)
    return {
      textLength: text.length,
      sampleStats: stats.slice(0, 5)
    }
  })

  results.typing.wordCounter = {
    normalTypeDurationMs: Math.round(normalTypeTime),
    rapidTypeDurationMs: Math.round(rapidTypeTime),
    paste10kDurationMs: Math.round(pasteTime),
    stats: wordCountStats
  }

  // 2. Text Case Tool & Transform Responsiveness
  console.log('Testing Text Case transform & buttons...')
  await page.goto(`${BASE_URL}/tools/textcase`, { waitUntil: 'networkidle0' })
  const textCaseInput = await page.waitForSelector('textarea')
  await textCaseInput.type('Hello World from ToolDesk Test Suite!', { delay: 2 })

  const buttonsFound = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(Boolean)
  })

  // Test button click
  const upperClickResult = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'))
    const upperBtn = btns.find(b => /uppercase/i.test(b.innerText))
    if (upperBtn) {
      upperBtn.click()
      return true
    }
    return false
  })

  const transformedText = await page.evaluate(() => document.querySelector('textarea')?.value)

  results.typing.textCase = {
    buttonsFound: buttonsFound.slice(0, 10),
    upperClickResult,
    transformedText
  }

  // 3. Word Replacer Responsiveness
  console.log('Testing Word Replacer...')
  await page.goto(`${BASE_URL}/tools/wordreplace`, { waitUntil: 'networkidle0' })
  const replacerInputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input, textarea')).map(i => ({
      tag: i.tagName,
      placeholder: i.placeholder || i.getAttribute('aria-label') || ''
    }))
  })
  results.typing.wordReplacer = {
    inputsCount: replacerInputs.length,
    inputs: replacerInputs
  }

  // 4. Button Acceptance & State Transitions across key tools
  console.log('Testing Button Acceptance on Password Generator...')
  await page.goto(`${BASE_URL}/tools/password`, { waitUntil: 'networkidle0' })
  const pwdBtn = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'))
    const gen = btns.find(b => /generate/i.test(b.innerText))
    if (gen) {
      gen.click()
      return { found: true, text: gen.innerText }
    }
    return { found: false }
  })
  const generatedPwd = await page.evaluate(() => {
    const input = document.querySelector('input[type="text"], .password-display, [readonly]')
    return input ? (input.value || input.innerText) : null
  })
  results.buttonAcceptance.passwordGenerator = {
    buttonClicked: pwdBtn,
    generatedValue: generatedPwd ? `${generatedPwd.substring(0, 6)}... (len ${generatedPwd.length})` : 'none'
  }

  // 5. Button Acceptance on QR Code Studio
  console.log('Testing QR Code Studio...')
  await page.goto(`${BASE_URL}/tools/qrcode`, { waitUntil: 'networkidle0' })
  const qrTabs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(Boolean)
  })
  results.buttonAcceptance.qrCodeStudio = {
    buttons: qrTabs.slice(0, 8),
    hasCanvasOrSvg: await page.evaluate(() => !!document.querySelector('canvas, svg'))
  }

  await browser.close()

  const outPath = '/Users/satyajishu/.gemini/antigravity-ide/brain/d69d3f01-08aa-4748-9e7c-1400c91c27c5/typing_button_benchmark_results.json'
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2))
  console.log('Benchmark completed successfully. Saved to', outPath)
  console.log(JSON.stringify(results, null, 2))
}

runBenchmark().catch(err => {
  console.error('Benchmark failed:', err)
  process.exit(1)
})
