// scripts/test-routes.js
// Automated route and asset availability verification against preview server

import assert from 'node:assert/strict'
import { spawn, execSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'

const BASE_URL = 'http://localhost:4173'

const ROUTES_TO_TEST = [
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
  '/tools/country-finder',
]

const STATIC_ASSETS_TO_TEST = [
  '/manifest.json',
  '/sw.js',
  '/favicon.svg',
  '/favicon.png',
  '/favicon.ico',
  '/logo-tooldesk.png',
  '/logo-icon.png',
  '/pdf.worker.min.js',
]

async function ensureServer() {
  if (!fs.existsSync('dist/index.html')) {
    console.log('dist/index.html not found, building production bundle for route tests...')
    execSync('npm run build', { stdio: 'inherit' })
  }

  const isUp = await new Promise(resolve => {
    const req = http.get(BASE_URL, () => resolve(true))
    req.on('error', () => resolve(false))
  })
  if (isUp) return null

  const proc = spawn('npx', ['vite', 'preview', '--port', '4173'], { stdio: 'ignore' })
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 200))
    const ready = await new Promise(resolve => {
      const req = http.get(BASE_URL, () => resolve(true))
      req.on('error', () => resolve(false))
    })
    if (ready) return proc
  }
  return proc
}

console.log('===> Starting ToolDesk Route & Asset Availability Tests...\n')

const spawnedServer = await ensureServer()

let passed = 0
let failed = 0

async function testRoute(route) {
  const url = `${BASE_URL}${route}`
  try {
    const res = await fetch(url, { headers: { 'Accept': 'text/html' } })
    assert.equal(res.status, 200, `Expected HTTP 200 for ${route}, got ${res.status}`)
    const text = await res.text()
    assert(text.includes('<div id="root"></div>') || text.includes('id="root"'), `HTML for ${route} missing #root mount point`)
    assert(text.includes('ToolDesk'), `HTML for ${route} missing ToolDesk brand`)
    console.log(`  ✓ Route: ${route.padEnd(28)} [HTTP 200, Root OK]`)
    passed++
  } catch (err) {
    console.error(`  ✗ Route: ${route.padEnd(28)} FAIL: ${err.message}`)
    failed++
  }
}

async function testAsset(asset) {
  const url = `${BASE_URL}${asset}`
  try {
    const res = await fetch(url)
    assert.equal(res.status, 200, `Expected HTTP 200 for ${asset}, got ${res.status}`)
    const buf = await res.arrayBuffer()
    const len = buf.byteLength
    assert(len > 0, `Asset ${asset} is empty (0 bytes)`)
    console.log(`  ✓ Asset: ${asset.padEnd(28)} [HTTP 200, Size: ${len} bytes]`)
    passed++
  } catch (err) {
    console.error(`  ✗ Asset: ${asset.padEnd(28)} FAIL: ${err.message}`)
    failed++
  }
}

console.log('--- Testing 37 Routes ---')
for (const r of ROUTES_TO_TEST) {
  await testRoute(r)
}

console.log('\n--- Testing Critical Static Assets ---')
for (const a of STATIC_ASSETS_TO_TEST) {
  await testAsset(a)
}

if (spawnedServer) {
  spawnedServer.kill()
}

console.log(`\n===> Route & Asset Verification: ${passed} passed, ${failed} failed.\n`)
if (failed > 0) process.exit(1)
