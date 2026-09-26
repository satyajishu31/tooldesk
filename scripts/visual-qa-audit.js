import puppeteer from 'puppeteer-core'
import fs from 'fs'
import path from 'path'

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE_URL = 'http://localhost:4173'
const OUTPUT_DIR = '/Users/satyajishu/.gemini/antigravity-ide/brain/e62dbe0b-3877-49df-91a1-d4dce753e822'

const VIEWPORTS = [
  { width: 320, height: 640, label: '320px_small' },
  { width: 340, height: 680, label: '340px' },
  { width: 360, height: 740, label: '360px_android' },
  { width: 375, height: 667, label: '375px_iphone' },
  { width: 390, height: 844, label: '390px_iphone14' },
  { width: 393, height: 852, label: '393px_pixel' },
  { width: 414, height: 896, label: '414px_plus' },
  { width: 430, height: 932, label: '430px_max' },
  { width: 480, height: 800, label: '480px' },
  { width: 540, height: 960, label: '540px_fold' },
  { width: 600, height: 960, label: '600px' },
  { width: 768, height: 1024, label: '768px_tablet' },
  { width: 834, height: 1194, label: '834px_ipad' },
  { width: 1024, height: 768, label: '1024px_desktop' },
  { width: 1280, height: 800, label: '1280px_laptop' },
  { width: 1440, height: 900, label: '1440px_macbook' },
  { width: 1600, height: 1000, label: '1600px_desktop' },
  { width: 1920, height: 1080, label: '1920px_fhd' },
  { width: 2560, height: 1440, label: '2560px_qhd' }
]

const KEY_PAGES = [
  { path: '/', label: 'home' },
  { path: '/tools/image-tools', label: 'image_tools_studio' },
  { path: '/tools/currency', label: 'currency_converter' },
  { path: '/tools/password', label: 'password_generator' },
  { path: '/tools/qrcode', label: 'qr_barcode_studio' },
  { path: '/tools/system-info', label: 'system_info' },
  { path: '/tools/pdf', label: 'pdf_toolkit' },
  { path: '/tools/ip-lookup', label: 'ip_lookup' },
  { path: '/tools/breach-check', label: 'breach_check' },
  { path: '/tools/wordcount', label: 'word_counter' }
]

async function runVisualAudit() {
  console.log('🚀 Launching Chrome for Visual QA Audit...')
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  })

  const results = {
    viewports: {},
    toolPages: {},
    timestamp: new Date().toISOString()
  }

  const page = await browser.newPage()

  // 1. Audit Home across key mobile and desktop viewports
  console.log('\n--- AUDITING HOMEPAGE VIEWPORTS ---')
  for (const vp of VIEWPORTS) {
    await page.setViewport({ width: vp.width, height: vp.height })
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle0', timeout: 15000 })
    await new Promise(r => setTimeout(r, 600))

    const metrics = await page.evaluate((vpWidth) => {
      const doc = document.documentElement
      const body = document.body
      const scrollWidth = Math.max(doc.scrollWidth, body.scrollWidth)
      const clientWidth = doc.clientWidth

      // Find overflowing elements
      const allElements = document.querySelectorAll('*')
      let overflowingCount = 0
      const culprits = []
      for (const el of allElements) {
        const rect = el.getBoundingClientRect()
        // If element extends beyond viewport width + 2px tolerance
        if (rect.right > vpWidth + 2 && !el.closest('.category-pills-bar') && !el.closest('.orbit-shell') && !el.closest('.developer-utilities-tabs')) {
          overflowingCount++
          if (culprits.length < 5) {
            culprits.push({
              tag: el.tagName,
              id: el.id,
              className: el.className ? String(el.className).slice(0, 50) : '',
              right: Math.round(rect.right),
              width: Math.round(rect.width),
              diff: Math.round(rect.right - vpWidth)
            })
          }
        }
      }

      // Check hero headline text visibility
      const heroH1 = document.querySelector('.hero-h1')
      let h1Overflow = false
      if (heroH1) {
        const h1Rect = heroH1.getBoundingClientRect()
        if (h1Rect.right > vpWidth + 1 || h1Rect.left < 0) {
          h1Overflow = true
        }
      }

      return {
        scrollWidth,
        clientWidth,
        hasHorizontalScroll: scrollWidth > clientWidth + 1,
        overflowingCount,
        culprits,
        h1Overflow
      }
    }, vp.width)

    results.viewports[vp.label] = {
      width: vp.width,
      ...metrics
    }

    console.log(`[VP ${vp.width}px] scroll: ${metrics.scrollWidth}/${metrics.clientWidth}, H1 overflow: ${metrics.h1Overflow}, culprits: ${metrics.overflowingCount}`)

    // Capture representative screenshots
    if ([320, 360, 375, 414, 768, 1280].includes(vp.width)) {
      const ssPath = path.join(OUTPUT_DIR, `qa_home_${vp.width}px.png`)
      await page.screenshot({ path: ssPath, fullPage: false })
    }
  }

  // 2. Audit Tool Pages on 375px (iPhone) and 1280px (Desktop)
  console.log('\n--- AUDITING KEY TOOL PAGES ---')
  for (const tool of KEY_PAGES) {
    // Mobile 375px check
    await page.setViewport({ width: 375, height: 667 })
    await page.goto(`${BASE_URL}${tool.path}`, { waitUntil: 'networkidle0', timeout: 15000 })
    await new Promise(r => setTimeout(r, 600))

    const toolMetrics = await page.evaluate((vpWidth) => {
      const doc = document.documentElement
      const body = document.body
      const scrollWidth = Math.max(doc.scrollWidth, body.scrollWidth)

      // Check header collision
      const backBtn = document.querySelector('.tool-shell-back-btn')
      const backRect = backBtn ? backBtn.getBoundingClientRect() : null
      const favBtn = document.querySelector('button[title*="favorite"]')
      const favRect = favBtn ? favBtn.getBoundingClientRect() : null

      // Check title
      const h1 = document.querySelector('h1')
      const h1Rect = h1 ? h1.getBoundingClientRect() : null

      return {
        scrollWidth,
        hasHorizontalScroll: scrollWidth > vpWidth + 1,
        backBtnFits: backRect ? backRect.left >= 0 && backRect.right <= vpWidth : true,
        backBtnText: backBtn ? backBtn.innerText.trim() : '',
        titleFits: h1Rect ? h1Rect.right <= vpWidth + 2 && h1Rect.left >= 0 : true,
        titleText: h1 ? h1.innerText.trim().slice(0, 40) : ''
      }
    }, 375)

    // Capture mobile screenshot of tool
    const toolSsMobile = path.join(OUTPUT_DIR, `qa_tool_${tool.label}_375px.png`)
    await page.screenshot({ path: toolSsMobile, fullPage: false })

    // Desktop 1280px check
    await page.setViewport({ width: 1280, height: 800 })
    await page.goto(`${BASE_URL}${tool.path}`, { waitUntil: 'networkidle0', timeout: 15000 })
    await new Promise(r => setTimeout(r, 600))

    const toolSsDesktop = path.join(OUTPUT_DIR, `qa_tool_${tool.label}_1280px.png`)
    await page.screenshot({ path: toolSsDesktop, fullPage: false })

    results.toolPages[tool.label] = toolMetrics
    console.log(`[TOOL: ${tool.label}] Title: "${toolMetrics.titleText}", fits: ${toolMetrics.titleFits}, Back btn fits: ${toolMetrics.backBtnFits} ("${toolMetrics.backBtnText}")`)
  }

  await browser.close()

  fs.writeFileSync(path.join(OUTPUT_DIR, 'visual_audit_report.json'), JSON.stringify(results, null, 2))
  console.log('✅ Visual QA Audit Finished! Report saved to visual_audit_report.json')
}

runVisualAudit().catch(err => {
  console.error('Audit failed:', err)
  process.exit(1)
})
