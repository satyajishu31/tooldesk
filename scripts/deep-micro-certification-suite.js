import puppeteer from 'puppeteer-core'
import fs from 'fs'

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE_URL = 'http://localhost:4173'

const ROUTES = [
  { path: '/', name: 'Home' },
  { path: '/tools/password', name: 'Password Generator' },
  { path: '/tools/wordcount', name: 'Word Counter' },
  { path: '/tools/textcase', name: 'Text Case Converter' },
  { path: '/tools/units', name: 'Unit Converter' },
  { path: '/tools/currency', name: 'Currency Converter' },
  { path: '/tools/gradient', name: 'Gradient Generator' },
  { path: '/tools/quote', name: 'Quote Generator' },
  { path: '/tools/favicon', name: 'Favicon Generator' },
  { path: '/tools/thumbnail', name: 'YouTube Thumbnail' },
  { path: '/tools/imgresizer', name: 'Image Resizer' },
  { path: '/tools/imgcompress', name: 'Image Compressor' },
  { path: '/tools/imgconvert', name: 'Image Converter' },
  { path: '/tools/bgremove', name: 'Background Remover' },
  { path: '/tools/pdf', name: 'PDF Toolkit' },
  { path: '/tools/aspectratio', name: 'Aspect Ratio Calculator' },
  { path: '/tools/fileconvert', name: 'File Converter' },
  { path: '/tools/vault', name: 'Password Vault' },
  { path: '/tools/image-tools', name: 'Image Tools Studio' },
  { path: '/tools/imgborder', name: 'Image Border' },
  { path: '/tools/roundcorner', name: 'Round Corner' },
  { path: '/tools/randname', name: 'Random Name Generator' },
  { path: '/tools/randaddress', name: 'Random Address Generator' },
  { path: '/tools/wordreplace', name: 'Word Replacer' },
  { path: '/tools/bcrypt', name: 'Bcrypt Tool' },
  { path: '/tools/colorpicker', name: 'Color Picker' },
  { path: '/tools/video-screenshot', name: 'Video Screenshot' },
  { path: '/tools/video-transcriber', name: 'Video Transcriber' },
  { path: '/tools/website-analyzer', name: 'Website Analyzer' },
  { path: '/tools/translator', name: 'Text Translator' },
  { path: '/tools/qrcode', name: 'QR Generator' },
  { path: '/tools/barcode', name: 'Barcode Studio' },
  { path: '/tools/qrscan', name: 'QR & Barcode Scanner' },
  { path: '/tools/breach-check', name: 'Email Breach Checker' },
  { path: '/tools/ip-lookup', name: 'IP Lookup' },
  { path: '/tools/system-info', name: 'System Info' },
  { path: '/tools/country-finder', name: 'Country Finder' }
]

async function runDeepAudit() {
  console.log('Launching Chrome for deep micro-certification audit...')
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  })

  const results = {
    totalRoutesAudited: ROUTES.length,
    tools: {},
    summary: {
      totalButtons: 0,
      totalInputs: 0,
      totalSelects: 0,
      totalSliders: 0,
      totalTabs: 0,
      allPassed: true
    }
  }

  const page = await browser.newPage()

  for (const route of ROUTES) {
    const url = `${BASE_URL}${route.path}`
    try {
      // Test at standard desktop 1280px
      await page.setViewport({ width: 1280, height: 800 })
      const res = await page.goto(url, { waitUntil: 'networkidle0', timeout: 15000 })
      const status = res ? res.status() : 0

      // Collect control metrics and exercise UI
      const toolDetails = await page.evaluate((rName) => {
        const titleEl = document.querySelector('h1, .hero-h1, .tool-title')
        const title = titleEl ? titleEl.innerText.trim() : document.title

        const buttons = Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(Boolean)
        const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea'))
        const selects = Array.from(document.querySelectorAll('select'))
        const sliders = Array.from(document.querySelectorAll('input[type="range"]'))
        const tabs = Array.from(document.querySelectorAll('[role="tab"], .tab-btn, [class*="tab"]')).map(t => t.innerText.trim()).filter(Boolean)

        const scrollW = document.documentElement.scrollWidth
        const clientW = document.documentElement.clientWidth
        const hasHorizontalOverflow = scrollW > clientW

        // Check interactive response
        let interacted = false
        // Try clicking a primary action button if available
        const actionBtn = Array.from(document.querySelectorAll('button')).find(b => 
          /generate|convert|calculate|lookup|check|analyze|copy|transform|run|process/i.test(b.innerText)
        )
        if (actionBtn && !actionBtn.disabled) {
          try {
            actionBtn.click()
            interacted = true
          } catch(e) {}
        }

        return {
          title,
          buttonCount: buttons.length,
          buttonsSample: buttons.slice(0, 6),
          inputCount: inputs.length,
          selectCount: selects.length,
          sliderCount: sliders.length,
          tabCount: tabs.length,
          tabsSample: tabs.slice(0, 6),
          hasHorizontalOverflow,
          scrollW,
          clientW,
          interacted
        }
      }, route.name)

      // Mobile check at 375px
      await page.setViewport({ width: 375, height: 667 })
      await new Promise(r => setTimeout(r, 100))
      const mobileGeometry = await page.evaluate(() => {
        return {
          scrollW: document.documentElement.scrollWidth,
          clientW: document.documentElement.clientWidth,
          hasMobileOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
        }
      })

      results.tools[route.path] = {
        name: route.name,
        httpStatus: status,
        desktop: toolDetails,
        mobile: mobileGeometry,
        status: (status === 200 && !toolDetails.hasHorizontalOverflow && !mobileGeometry.hasMobileOverflow) ? 'VERIFIED' : 'FAILED'
      }

      results.summary.totalButtons += toolDetails.buttonCount
      results.summary.totalInputs += toolDetails.inputCount
      results.summary.totalSelects += toolDetails.selectCount
      results.summary.totalSliders += toolDetails.sliderCount
      results.summary.totalTabs += toolDetails.tabCount

      if (results.tools[route.path].status !== 'VERIFIED') {
        results.summary.allPassed = false
      }

      console.log(`[AUDIT] ${route.name.padEnd(26)} | Status: ${status} | Buttons: ${toolDetails.buttonCount} | Inputs: ${toolDetails.inputCount} | Selects: ${toolDetails.selectCount} | Sliders: ${toolDetails.sliderCount} | Mobile Overflow: ${mobileGeometry.hasMobileOverflow ? 'YES' : 'NO'}`)

    } catch (err) {
      console.error(`[ERR] Failed auditing ${route.name} (${route.path}):`, err.message)
      results.tools[route.path] = {
        name: route.name,
        error: err.message,
        status: 'FAILED'
      }
      results.summary.allPassed = false
    }
  }

  await browser.close()

  const outPath = '/Users/satyajishu/.gemini/antigravity-ide/brain/d69d3f01-08aa-4748-9e7c-1400c91c27c5/deep_micro_certification_results.json'
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2))
  console.log('=== Deep Micro-Certification Audit Completed ===')
  console.log(`Summary: Total Buttons: ${results.summary.totalButtons}, Total Inputs: ${results.summary.totalInputs}, Total Selects: ${results.summary.totalSelects}, Total Sliders: ${results.summary.totalSliders}, All Passed: ${results.summary.allPassed}`)
}

runDeepAudit().catch(err => {
  console.error('Audit run error:', err)
  process.exit(1)
})
