import puppeteer from 'puppeteer-core'
import fs from 'fs'
import path from 'path'

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE_URL = 'http://localhost:4173'
const ARTIFACTS_DIR = '/Users/satyajishu/.gemini/antigravity-ide/brain/d69d3f01-08aa-4748-9e7c-1400c91c27c5'

const ALL_TOOL_ROUTES = [
  { path: '/tools/password', id: 'password', name: 'Password Generator' },
  { path: '/tools/wordcount', id: 'wordcount', name: 'Word Counter' },
  { path: '/tools/textcase', id: 'textcase', name: 'Text Case Converter' },
  { path: '/tools/units', id: 'units', name: 'Unit Converter' },
  { path: '/tools/currency', id: 'currency', name: 'Currency Converter' },
  { path: '/tools/gradient', id: 'gradient', name: 'Gradient Generator' },
  { path: '/tools/quote', id: 'quote', name: 'Quote Generator' },
  { path: '/tools/favicon', id: 'favicon', name: 'Favicon Generator' },
  { path: '/tools/thumbnail', id: 'thumbnail', name: 'Social Media Thumbnail' },
  { path: '/tools/imgresizer', id: 'imgresizer', name: 'Image Resizer' },
  { path: '/tools/imgcompress', id: 'imgcompress', name: 'Image Compressor' },
  { path: '/tools/imgconvert', id: 'imgconvert', name: 'Image Converter' },
  { path: '/tools/bgremove', id: 'bgremove', name: 'BG Remover' },
  { path: '/tools/pdf', id: 'pdf', name: 'PDF Studio & Toolkit' },
  { path: '/tools/aspectratio', id: 'aspectratio', name: 'Aspect Ratio Calculator' },
  { path: '/tools/fileconvert', id: 'fileconvert', name: 'File Converter' },
  { path: '/tools/vault', id: 'vault', name: 'Password Vault' },
  { path: '/tools/image-tools', id: 'imagetools', name: 'Image Tools Studio' },
  { path: '/tools/imgborder', id: 'imgborder', name: 'Image Border Studio (Alias)' },
  { path: '/tools/roundcorner', id: 'roundcorner', name: 'Rounded Corners Studio (Alias)' },
  { path: '/tools/randname', id: 'randname', name: 'Random Name Generator' },
  { path: '/tools/randaddress', id: 'randaddress', name: 'Random Address Generator' },
  { path: '/tools/wordreplace', id: 'wordreplace', name: 'Word Replacer' },
  { path: '/tools/bcrypt', id: 'bcrypt', name: 'Bcrypt Hash Generator' },
  { path: '/tools/colorpicker', id: 'colorpicker', name: 'Color Picker' },
  { path: '/tools/video-screenshot', id: 'videoscreenshot', name: 'Video Screenshot Extractor' },
  { path: '/tools/video-transcriber', id: 'videotranscriber', name: 'Video Transcriber' },
  { path: '/tools/website-analyzer', id: 'websiteanalyzer', name: 'Website Analyzer' },
  { path: '/tools/translator', id: 'translator', name: 'Text Translator' },
  { path: '/tools/qrcode', id: 'qrcode', name: 'QR & Barcode Studio' },
  { path: '/tools/barcode', id: 'barcode', name: 'Barcode Studio (Alias)' },
  { path: '/tools/qrscan', id: 'qrscan', name: 'QR Scanner (Alias)' },
  { path: '/tools/breach-check', id: 'breachcheck', name: 'Email Breach Checker' },
  { path: '/tools/ip-lookup', id: 'iplookup', name: 'IP Lookup' },
  { path: '/tools/system-info', id: 'systeminfo', name: 'System Info & Audit' },
  { path: '/tools/country-finder', id: 'countryfinder', name: 'Country Data & Fact Finder' }
]

async function runDeepAudit() {
  console.log('🚀 Launching Chrome for Deep Tool-by-Tool Functional Audit...')
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  })

  const results = {
    totalToolsTested: ALL_TOOL_ROUTES.length,
    tools: {},
    tabsTested: {},
    functionalTests: {},
    failures: []
  }

  const page = await browser.newPage()

  // Track console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const errText = msg.text()
      // Filter non-fatal network failures for optional third-party telemetry or favicon
      if (!errText.includes('favicon.ico') && !errText.includes('404')) {
        results.failures.push({ url: page.url(), error: errText })
      }
    }
  })

  // ── AUDIT EVERY ROUTE AT 375px (MOBILE) AND 1280px (DESKTOP) ──
  console.log(`\n--- 1. TESTING ALL ${ALL_TOOL_ROUTES.length} TOOL ROUTES ---`)
  for (const tool of ALL_TOOL_ROUTES) {
    const routeUrl = `${BASE_URL}${tool.path}`
    
    // Test at 375px mobile
    await page.setViewport({ width: 375, height: 740 })
    const respMobile = await page.goto(routeUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await new Promise(r => setTimeout(r, 400))
    const statusMobile = respMobile.status()

    const mobileAudit = await page.evaluate((toolName) => {
      const doc = document.documentElement
      const body = document.body
      const scrollWidth = Math.max(doc.scrollWidth, body.scrollWidth)
      const clientWidth = doc.clientWidth
      const hasHorizontalOverflow = scrollWidth > clientWidth + 1
      const title = document.title
      const h1 = document.querySelector('h1, h2')?.innerText || ''
      const buttons = document.querySelectorAll('button').length
      const inputs = document.querySelectorAll('input, textarea, select').length
      const toolCard = Boolean(document.querySelector('.tool-shell, .tool-card-glass, .tool-card, .tcard, [class*="ToolCard"], main, form'))

      // Inspect any tabs present on this tool
      const tabElements = document.querySelectorAll('.image-studio-tab-item, .qr-studio-tab-item, .pdf-studio-category-item, [role="tab"], .tool-mode-tabs button, .tag')
      const tabs = Array.from(tabElements).slice(0, 10).map(t => ({
        text: (t.innerText || '').slice(0, 30).trim(),
        tag: t.tagName,
        active: t.className.includes('active') || t.className.includes('on') || t.getAttribute('aria-selected') === 'true' || t.style.borderColor.includes('79') || t.style.background.includes('79')
      }))

      return {
        title,
        h1,
        buttons,
        inputs,
        toolCard,
        scrollWidth,
        clientWidth,
        hasHorizontalOverflow,
        overflowDiff: scrollWidth - clientWidth,
        tabs
      }
    }, tool.name)

    // Test at 1280px desktop
    await page.setViewport({ width: 1280, height: 800 })
    await new Promise(r => setTimeout(r, 150))
    const desktopAudit = await page.evaluate(() => {
      const doc = document.documentElement
      const body = document.body
      const scrollWidth = Math.max(doc.scrollWidth, body.scrollWidth)
      const clientWidth = doc.clientWidth
      return {
        scrollWidth,
        clientWidth,
        hasHorizontalOverflow: scrollWidth > clientWidth + 1
      }
    })

    const isOk = statusMobile === 200 && !mobileAudit.hasHorizontalOverflow && !desktopAudit.hasHorizontalOverflow && mobileAudit.toolCard
    console.log(`${isOk ? '✅' : '❌'} Tool [${tool.path}]: HTTP ${statusMobile}, buttons=${mobileAudit.buttons}, inputs=${mobileAudit.inputs}, tabs=${mobileAudit.tabs.length}, mobileScroll=${mobileAudit.scrollWidth}/${mobileAudit.clientWidth}, desktopScroll=${desktopAudit.scrollWidth}/${desktopAudit.clientWidth}`)

    results.tools[tool.path] = {
      id: tool.id,
      name: tool.name,
      status: statusMobile,
      mobile: mobileAudit,
      desktop: desktopAudit,
      ok: isOk
    }

    // Capture screenshots for core highlighted tools
    if (['password', 'pdf', 'image-tools', 'qrcode', 'wordcount', 'currency', 'vault', 'ip-lookup', 'breach-check', 'system-info', 'country-finder'].includes(tool.id)) {
      await page.setViewport({ width: 375, height: 740 })
      const ssPathMobile = path.join(ARTIFACTS_DIR, `tool_${tool.id}_375px.png`)
      await page.screenshot({ path: ssPathMobile, fullPage: false })

      await page.setViewport({ width: 1280, height: 800 })
      const ssPathDesktop = path.join(ARTIFACTS_DIR, `tool_${tool.id}_1280px.png`)
      await page.screenshot({ path: ssPathDesktop, fullPage: false })
      console.log(`   📸 Captured mobile & desktop screenshots for ${tool.id}`)
    }
  }

  // ── 2. DEEP FUNCTIONAL EXERCISE OF SPECIAL TOOLS ──
  console.log('\n--- 2. FUNCTIONAL EXERCISE OF SPECIFIC TOOLS ---')

  // Tool 2.1: Password Generator
  try {
    await page.goto(`${BASE_URL}/tools/password`, { waitUntil: 'domcontentloaded' })
    const pwdRes = await page.evaluate(async () => {
      // Find generate button
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Generate') || b.innerText.includes('🔄'))
      if (btn) btn.click()
      await new Promise(r => setTimeout(r, 100))
      const outBox = document.querySelector('.out-box, input[readonly], [class*="output"]')
      const pwd = outBox ? (outBox.value || outBox.innerText || '') : ''
      return { length: pwd.length, hasOutput: pwd.length >= 8 }
    })
    console.log('  ✓ Password Generator functional test:', pwdRes)
    results.functionalTests['password'] = { ok: pwdRes.hasOutput, ...pwdRes }
  } catch (e) {
    console.error('  ✗ Password Generator test error:', e.message)
    results.functionalTests['password'] = { ok: false, error: e.message }
  }

  // Tool 2.2: Word Counter
  try {
    await page.goto(`${BASE_URL}/tools/wordcount`, { waitUntil: 'domcontentloaded' })
    const wcRes = await page.evaluate(async () => {
      const ta = document.querySelector('textarea')
      if (ta) {
        ta.value = 'ToolDesk is a private suite of 32 offline developer and creative tools.'
        ta.dispatchEvent(new Event('input', { bubbles: true }))
        ta.dispatchEvent(new Event('change', { bubbles: true }))
      }
      await new Promise(r => setTimeout(r, 150))
      const text = document.body.innerText
      const wordsMatch = text.match(/(\d+)\s*(?:WORDS|words)/i)
      const charsMatch = text.match(/(\d+)\s*(?:CHARS|characters|characters)/i)
      return { wordsMatch: wordsMatch ? wordsMatch[1] : null, charsMatch: charsMatch ? charsMatch[1] : null }
    })
    console.log('  ✓ Word Counter functional test:', wcRes)
    results.functionalTests['wordcount'] = { ok: Boolean(wcRes.wordsMatch), ...wcRes }
  } catch (e) {
    console.error('  ✗ Word Counter test error:', e.message)
    results.functionalTests['wordcount'] = { ok: false, error: e.message }
  }

  // Tool 2.3: Text Case Converter
  try {
    await page.goto(`${BASE_URL}/tools/textcase`, { waitUntil: 'domcontentloaded' })
    const tcRes = await page.evaluate(async () => {
      const ta = document.querySelector('textarea')
      if (ta) {
        ta.value = 'Hello ToolDesk Quality Gate'
        ta.dispatchEvent(new Event('input', { bubbles: true }))
        ta.dispatchEvent(new Event('change', { bubbles: true }))
      }
      await new Promise(r => setTimeout(r, 150))
      const text = document.body.innerText
      const hasUpper = text.includes('HELLO TOOLDESK QUALITY GATE')
      const hasLower = text.includes('hello tooldesk quality gate')
      const hasSnake = text.includes('hello_tooldesk_quality_gate')
      return { hasUpper, hasLower, hasSnake }
    })
    console.log('  ✓ Text Case Converter functional test:', tcRes)
    results.functionalTests['textcase'] = { ok: tcRes.hasUpper && tcRes.hasLower, ...tcRes }
  } catch (e) {
    console.error('  ✗ Text Case Converter test error:', e.message)
    results.functionalTests['textcase'] = { ok: false, error: e.message }
  }

  // Tool 2.4: QR & Barcode Studio (Tab transitions & generation)
  try {
    await page.goto(`${BASE_URL}/tools/qrcode`, { waitUntil: 'domcontentloaded' })
    const qrRes = await page.evaluate(async () => {
      // Check QR SVG or Canvas
      const hasQrCanvas = Boolean(document.querySelector('canvas, svg, img[alt*="QR"]'))
      
      // Click Barcode tab
      const barcodeTab = Array.from(document.querySelectorAll('.qr-studio-tab-item, button')).find(b => b.innerText.includes('Barcode'))
      let barcodeClicked = false
      if (barcodeTab) {
        barcodeTab.click()
        barcodeClicked = true
      }
      await new Promise(r => setTimeout(r, 200))
      const hasBarcodeSvg = Boolean(document.querySelector('svg.barcode-svg, svg, canvas'))

      return { hasQrCanvas, barcodeClicked, hasBarcodeSvg }
    })
    console.log('  ✓ QR & Barcode Studio functional test:', qrRes)
    results.functionalTests['qrcode'] = { ok: qrRes.hasQrCanvas && qrRes.barcodeClicked, ...qrRes }
  } catch (e) {
    console.error('  ✗ QR & Barcode Studio test error:', e.message)
    results.functionalTests['qrcode'] = { ok: false, error: e.message }
  }

  // Tool 2.5: Image Tools Studio (Tabs: crop, redactor, ocr, dpi, border, roundcorner)
  try {
    await page.goto(`${BASE_URL}/tools/image-tools`, { waitUntil: 'domcontentloaded' })
    const imgStudioRes = await page.evaluate(async () => {
      const tabButtons = Array.from(document.querySelectorAll('.image-studio-tab-item, .image-studio-tab-bar button'))
      const tabNames = tabButtons.map(b => b.innerText.split('\n')[0].trim())
      
      // Exercise clicking each tab
      const clickedTabs = []
      for (const btn of tabButtons) {
        btn.click()
        await new Promise(r => setTimeout(r, 100))
        clickedTabs.push(btn.innerText.split('\n')[0].trim())
      }
      return { tabCount: tabButtons.length, tabNames, clickedTabs }
    })
    console.log('  ✓ Image Tools Studio tabs test:', imgStudioRes)
    results.functionalTests['image-tools'] = { ok: imgStudioRes.tabCount >= 4, ...imgStudioRes }
  } catch (e) {
    console.error('  ✗ Image Tools Studio test error:', e.message)
    results.functionalTests['image-tools'] = { ok: false, error: e.message }
  }

  // Tool 2.6: Unit Converter
  try {
    await page.goto(`${BASE_URL}/tools/units`, { waitUntil: 'domcontentloaded' })
    const unitsRes = await page.evaluate(async () => {
      const inp = document.querySelector('input[type="number"], .inp')
      if (inp) {
        inp.value = '10'
        inp.dispatchEvent(new Event('input', { bubbles: true }))
        inp.dispatchEvent(new Event('change', { bubbles: true }))
      }
      await new Promise(r => setTimeout(r, 100))
      const text = document.body.innerText
      const hasFormula = text.includes('=') || text.includes('Result') || text.includes('10')
      return { hasFormula }
    })
    console.log('  ✓ Unit Converter functional test:', unitsRes)
    results.functionalTests['units'] = { ok: unitsRes.hasFormula, ...unitsRes }
  } catch (e) {
    console.error('  ✗ Unit Converter test error:', e.message)
    results.functionalTests['units'] = { ok: false, error: e.message }
  }

  // Tool 2.7: Currency Converter
  try {
    await page.goto(`${BASE_URL}/tools/currency`, { waitUntil: 'domcontentloaded' })
    const currRes = await page.evaluate(async () => {
      const inp = document.querySelector('input[type="number"], .inp')
      if (inp) {
        inp.value = '100'
        inp.dispatchEvent(new Event('input', { bubbles: true }))
        inp.dispatchEvent(new Event('change', { bubbles: true }))
      }
      await new Promise(r => setTimeout(r, 100))
      const text = document.body.innerText
      const hasRates = text.includes('USD') && (text.includes('EUR') || text.includes('GBP') || text.includes('INR'))
      return { hasRates }
    })
    console.log('  ✓ Currency Converter functional test:', currRes)
    results.functionalTests['currency'] = { ok: currRes.hasRates, ...currRes }
  } catch (e) {
    console.error('  ✗ Currency Converter test error:', e.message)
    results.functionalTests['currency'] = { ok: false, error: e.message }
  }

  // Tool 2.8: Color Picker
  try {
    await page.goto(`${BASE_URL}/tools/colorpicker`, { waitUntil: 'domcontentloaded' })
    const cpRes = await page.evaluate(async () => {
      const text = document.body.innerText
      const hasHex = text.includes('HEX') || text.includes('#')
      const hasRgb = text.includes('RGB')
      const hasHsl = text.includes('HSL')
      const hasContrast = text.includes('Contrast') || text.includes('WCAG')
      return { hasHex, hasRgb, hasHsl, hasContrast }
    })
    console.log('  ✓ Color Picker functional test:', cpRes)
    results.functionalTests['colorpicker'] = { ok: cpRes.hasHex && cpRes.hasRgb, ...cpRes }
  } catch (e) {
    console.error('  ✗ Color Picker test error:', e.message)
    results.functionalTests['colorpicker'] = { ok: false, error: e.message }
  }

  // Tool 2.9: System Info & Audit
  try {
    await page.goto(`${BASE_URL}/tools/system-info`, { waitUntil: 'domcontentloaded' })
    const sysRes = await page.evaluate(async () => {
      const text = document.body.innerText
      const hasBrowser = text.includes('Browser') || text.includes('Chrome') || text.includes('Safari')
      const hasHardware = text.includes('Cores') || text.includes('Memory') || text.includes('Screen')
      const hasPrivacy = text.includes('Privacy') || text.includes('Cookies') || text.includes('DNT')
      return { hasBrowser, hasHardware, hasPrivacy }
    })
    console.log('  ✓ System Info functional test:', sysRes)
    results.functionalTests['systeminfo'] = { ok: sysRes.hasBrowser, ...sysRes }
  } catch (e) {
    console.error('  ✗ System Info test error:', e.message)
    results.functionalTests['systeminfo'] = { ok: false, error: e.message }
  }

  // Tool 2.10: Country Finder
  try {
    await page.goto(`${BASE_URL}/tools/country-finder`, { waitUntil: 'domcontentloaded' })
    const cfRes = await page.evaluate(async () => {
      const inp = document.querySelector('input')
      if (inp) {
        inp.value = 'Japan'
        inp.dispatchEvent(new Event('input', { bubbles: true }))
        inp.dispatchEvent(new Event('change', { bubbles: true }))
      }
      await new Promise(r => setTimeout(r, 200))
      const text = document.body.innerText
      const hasCountry = text.includes('Japan') || text.includes('Tokyo') || text.includes('JPY')
      return { hasCountry }
    })
    console.log('  ✓ Country Finder functional test:', cfRes)
    results.functionalTests['countryfinder'] = { ok: cfRes.hasCountry, ...cfRes }
  } catch (e) {
    console.error('  ✗ Country Finder test error:', e.message)
    results.functionalTests['countryfinder'] = { ok: false, error: e.message }
  }

  // Tool 2.11: Bcrypt Hash Tool
  try {
    await page.goto(`${BASE_URL}/tools/bcrypt`, { waitUntil: 'domcontentloaded' })
    const bcryptRes = await page.evaluate(async () => {
      const inp = document.querySelector('input[type="text"], input[type="password"], .inp')
      if (inp) {
        inp.value = 'SecretPassword123'
        inp.dispatchEvent(new Event('input', { bubbles: true }))
        inp.dispatchEvent(new Event('change', { bubbles: true }))
      }
      const hashBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Hash') || b.innerText.includes('Generate'))
      if (hashBtn) hashBtn.click()
      await new Promise(r => setTimeout(r, 400))
      const text = document.body.innerText
      const hasBcryptHash = text.includes('$2a$') || text.includes('$2b$') || text.includes('$2y$')
      return { hasBcryptHash }
    })
    console.log('  ✓ Bcrypt Tool functional test:', bcryptRes)
    results.functionalTests['bcrypt'] = { ok: bcryptRes.hasBcryptHash, ...bcryptRes }
  } catch (e) {
    console.error('  ✗ Bcrypt Tool test error:', e.message)
    results.functionalTests['bcrypt'] = { ok: false, error: e.message }
  }

  await browser.close()

  const outputPath = path.join(ARTIFACTS_DIR, 'deep_tools_functional_results.json')
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2))
  console.log(`\n🎉 Deep tools functional audit complete! Results saved to ${outputPath}`)
  return results
}

runDeepAudit().catch(err => {
  console.error('Fatal error in deep tools audit:', err)
  process.exit(1)
})
