/**
 * Netlify Function: ToolDesk Release Manifest Endpoint
 * 
 * Provides:
 * GET /.netlify/functions/releases
 * GET /api/releases
 * 
 * Returns centralized release metadata, platforms, versions, checksums, and download URLs.
 * High-performance edge caching (max-age=60, s-maxage=300).
 */

const fs = require('fs')
const path = require('path')

exports.handler = async function (event, context) {
  // Handle CORS OPTIONS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Accept',
        'Access-Control-Max-Age': '86400'
      }
    }
  }

  // Only accept GET and HEAD
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'HEAD') {
    return {
      statusCode: 405,
      headers: { 'Allow': 'GET, HEAD, OPTIONS' },
      body: JSON.stringify({ error: 'Method Not Allowed' })
    }
  }

  try {
    // Attempt to read from public/releases.json or dist/releases.json
    let manifestData = null
    const candidatePaths = [
      path.resolve(__dirname, '../../public/releases.json'),
      path.resolve(__dirname, '../../dist/releases.json'),
      path.resolve(process.cwd(), 'public/releases.json'),
      path.resolve(process.cwd(), 'dist/releases.json')
    ]

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        try {
          const raw = fs.readFileSync(p, 'utf8')
          manifestData = JSON.parse(raw)
          break
        } catch {}
      }
    }

    if (!manifestData) {
      manifestData = {
        version: '1.0.1',
        releaseDate: '2026-09-27',
        minimumSupportedVersion: '1.0.0',
        notes: 'ToolDesk official release with offline privacy tools.',
        platforms: {
          macos: { status: 'available', version: '1.0.1' },
          android: { status: 'available', version: '1.0.1' },
          windows: { status: 'available', version: '1.0.1' },
          linux: { status: 'available', version: '1.0.1' },
          ios: { status: 'pwa-ready', version: '1.0.1' },
          pwa: { status: 'available', version: '1.0.1' }
        }
      }
    }

    // Dynamic environment variable overrides
    if (process.env.VITE_WINDOWS_EXE_URL && manifestData.platforms?.windows) {
      manifestData.platforms.windows.status = 'available'
      const exeFmt = manifestData.platforms.windows.formats?.find(f => f.type === 'exe')
      if (exeFmt) {
        exeFmt.status = 'available'
        exeFmt.url = process.env.VITE_WINDOWS_EXE_URL
      }
    }
    if (process.env.VITE_WINDOWS_MSI_URL && manifestData.platforms?.windows) {
      const msiFmt = manifestData.platforms.windows.formats?.find(f => f.type === 'msi')
      if (msiFmt) {
        msiFmt.status = 'available'
        msiFmt.url = process.env.VITE_WINDOWS_MSI_URL
      }
    }
    if (process.env.VITE_MAC_DMG_URL && manifestData.platforms?.macos) {
      const dmgFmt = manifestData.platforms.macos.formats?.find(f => f.type === 'dmg')
      if (dmgFmt) dmgFmt.url = process.env.VITE_MAC_DMG_URL
    }
    if (process.env.VITE_ANDROID_APK_URL && manifestData.platforms?.android) {
      const apkFmt = manifestData.platforms.android.formats?.find(f => f.type === 'apk')
      if (apkFmt) apkFmt.url = process.env.VITE_ANDROID_APK_URL
    }
    if (process.env.VITE_LINUX_APPIMAGE_URL && manifestData.platforms?.linux) {
      manifestData.platforms.linux.status = 'available'
      const appImageFmt = manifestData.platforms.linux.formats?.find(f => f.type === 'appimage')
      if (appImageFmt) {
        appImageFmt.status = 'available'
        appImageFmt.url = process.env.VITE_LINUX_APPIMAGE_URL
      }
    }
    if (process.env.VITE_LINUX_DEB_URL && manifestData.platforms?.linux) {
      const debFmt = manifestData.platforms.linux.formats?.find(f => f.type === 'deb')
      if (debFmt) {
        debFmt.status = 'available'
        debFmt.url = process.env.VITE_LINUX_DEB_URL
      }
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=60, s-maxage=300',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify(manifestData, null, 2)
    }
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to retrieve release metadata', details: err.message })
    }
  }
}
