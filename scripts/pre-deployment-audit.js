import puppeteer from 'puppeteer-core'
import fs from 'fs'
import path from 'path'

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE_URL = 'http://localhost:4173'
const ARTIFACTS_DIR = '/Users/satyajishu/.gemini/antigravity-ide/brain/d69d3f01-08aa-4748-9e7c-1400c91c27c5'

const VIEWPORTS = [
  { width: 320, height: 640, label: '320px_small_mobile' },
  { width: 340, height: 680, label: '340px_galaxy_fold_outer' },
  { width: 360, height: 740, label: '360px_android_compact' },
  { width: 375, height: 667, label: '375px_iphone_se' },
  { width: 390, height: 844, label: '390px_iphone14' },
  { width: 393, height: 852, label: '393px_pixel7' },
  { width: 414, height: 896, label: '414px_iphone_plus' },
  { width: 430, height: 932, label: '430px_iphone14_pro_max' },
  { width: 480, height: 800, label: '480px_android_large' },
  { width: 540, height: 960, label: '540px_surface_duo' },
  { width: 600, height: 960, label: '600px_small_tablet' },
  { width: 768, height: 1024, label: '768px_ipad_portrait' },
  { width: 1024, height: 768, label: '1024px_desktop_small' },
  { width: 1280, height: 800, label: '1280px_macbook_standard' },
  { width: 1440, height: 900, label: '1440px_macbook_pro' },
  { width: 1600, height: 1000, label: '1600px_desktop_wide' },
  { width: 1920, height: 1080, label: '1920px_fhd_desktop' },
  { width: 2560, height: 1440, label: '2560px_qhd_retina' }
]

async function run() {
  console.log('🚀 Starting Pre-Deployment Forensic UI Audit...')
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  })

  const results = {
    viewports: {},
    consoleErrors: []
  }

  const page = await browser.newPage()
  page.on('console', msg => {
    if (msg.type() === 'error') {
      results.consoleErrors.push({ url: page.url(), text: msg.text() })
    }
  })

  for (const vp of VIEWPORTS) {
    await page.setViewport({ width: vp.width, height: vp.height })
    await page.goto(BASE_URL, { waitUntil: 'networkidle0' })
    await new Promise(r => setTimeout(r, 400))

    const metrics = await page.evaluate((vpWidth, vpHeight) => {
      const doc = document.documentElement
      const body = document.body
      const scrollWidth = Math.max(doc.scrollWidth, body.scrollWidth)
      const clientWidth = doc.clientWidth
      const hasHorizontalScroll = scrollWidth > clientWidth + 1

      // Scan all elements for horizontal overflow
      const overflowingElements = []
      document.querySelectorAll('*').forEach(el => {
        const rect = el.getBoundingClientRect()
        // Ignore known horizontal scrollers
        if (el.closest('.category-pills-bar') || el.closest('.orbit-shell') || el.closest('.developer-utilities-tabs')) {
          return
        }
        if (rect.right > vpWidth + 1.5 && rect.width > 0 && rect.height > 0) {
          overflowingElements.push({
            tag: el.tagName,
            className: String(el.className || '').slice(0, 60),
            id: el.id,
            right: Math.round(rect.right),
            width: Math.round(rect.width),
            diff: Math.round(rect.right - vpWidth)
          })
        }
      })

      // Hero H1 metrics
      const h1 = document.querySelector('.hero-h1')
      const h1Rect = h1 ? h1.getBoundingClientRect() : null
      const h1Computed = h1 ? window.getComputedStyle(h1) : null

      // Logo metrics
      const logo = document.querySelector('.tooldesk-navbar-logo')
      const logoRect = logo ? logo.getBoundingClientRect() : null

      // Download button check in navbar vs hero
      const navDownloadBtn = document.querySelector('.nav-desktop button[aria-label="Download ToolDesk App"]')
      const mobileNav = document.querySelector('.nav-mobile')
      const mobileNavButtons = mobileNav ? Array.from(mobileNav.querySelectorAll('button')).map(b => b.innerText || b.getAttribute('aria-label')) : []
      const heroDownloadBtn = document.querySelector('.hero-download-btn')

      // Safe area and top bar collision check
      const navbar = document.querySelector('.tooldesk-nav-bar')
      const navRect = navbar ? navbar.getBoundingClientRect() : null
      const hero = document.querySelector('.hero-content-wrap') || document.querySelector('.hero-h1')
      const heroRect = hero ? hero.getBoundingClientRect() : null
      const heroClearance = (heroRect && navRect) ? (heroRect.top - navRect.bottom) : null

      // Font verification
      const bodyFont = window.getComputedStyle(document.body).fontFamily
      const h1Font = h1Computed ? h1Computed.fontFamily : null

      return {
        scrollWidth,
        clientWidth,
        hasHorizontalScroll,
        overflowDiff: scrollWidth - clientWidth,
        overflowingElementsCount: overflowingElements.length,
        overflowingElements: overflowingElements.slice(0, 4),
        h1Metrics: {
          exists: Boolean(h1),
          text: h1 ? h1.innerText.slice(0, 40) : '',
          width: h1Rect ? Math.round(h1Rect.width) : 0,
          right: h1Rect ? Math.round(h1Rect.right) : 0,
          fitsViewport: h1Rect ? (h1Rect.right <= vpWidth + 1 && h1Rect.left >= -1) : false,
          fontSize: h1Computed ? h1Computed.fontSize : '',
          lineHeight: h1Computed ? h1Computed.lineHeight : '',
          fontFamily: h1Font
        },
        logoMetrics: {
          exists: Boolean(logo),
          width: logoRect ? Math.round(logoRect.width) : 0,
          right: logoRect ? Math.round(logoRect.right) : 0,
          fitsViewport: logoRect ? logoRect.right <= vpWidth : false
        },
        navDownloadBtnVisible: navDownloadBtn ? window.getComputedStyle(navDownloadBtn).display !== 'none' : false,
        mobileNavButtons,
        heroDownloadBtnVisible: heroDownloadBtn ? window.getComputedStyle(heroDownloadBtn).display !== 'none' : false,
        navHeight: navRect ? Math.round(navRect.height) : 0,
        heroClearance,
        bodyFont
      }
    }, vp.width, vp.height)

    results.viewports[vp.label] = { ...vp, ...metrics }

    const statusIcon = !metrics.hasHorizontalScroll && metrics.h1Metrics.fitsViewport && metrics.logoMetrics.fitsViewport ? '✅' : '❌'
    console.log(`${statusIcon} [${vp.label} ${vp.width}x${vp.height}]: scroll=${metrics.scrollWidth}/${metrics.clientWidth}, H1 fits=${metrics.h1Metrics.fitsViewport} (font: ${metrics.h1Metrics.fontSize}), Logo fits=${metrics.logoMetrics.fitsViewport}, clearance=${metrics.heroClearance}px, overflowEls=${metrics.overflowingElementsCount}`)

    // Capture screenshot at critical mobile, tablet, and desktop viewports
    if ([320, 360, 375, 390, 414, 768, 1280, 1920].includes(vp.width)) {
      const ssPath = path.join(ARTIFACTS_DIR, `ui_audit_home_${vp.width}px.png`)
      await page.screenshot({ path: ssPath, fullPage: false })
      console.log(`   📸 Captured: ${ssPath}`)
    }
  }

  await browser.close()

  const outputPath = path.join(ARTIFACTS_DIR, 'forensic_ui_audit_results.json')
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2))
  console.log(`\n🎉 UI Forensic Audit complete! Results saved to ${outputPath}`)
  return results
}

run().catch(err => {
  console.error('Fatal error in UI audit:', err)
  process.exit(1)
})
