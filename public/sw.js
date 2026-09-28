const SW_VERSION = 'v1.0.4'
const CACHE_NAME = `tooldesk-pwa-${SW_VERSION}`
const RUNTIME_CACHE = `tooldesk-runtime-${SW_VERSION}`
const FONT_CACHE = 'tooldesk-fonts-v1'

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/logo.png',
  '/logo-tooldesk.png',
  '/logo-white.png',
  '/robot-assistant-64.webp',
  '/favicon.svg',
  '/favicon.ico',
  '/manifest.json'
]

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Resilient precaching with cache: 'reload' to ensure fresh assets from server
      for (const url of PRECACHE_URLS) {
        try {
          const req = new Request(url, { cache: 'reload' })
          const res = await fetch(req)
          if (res && res.status === 200) {
            await cache.put(url, res)
          }
        } catch (err) {
          console.warn(`[SW] Precache skipped for ${url}:`, err)
        }
      }
    }).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME && k !== RUNTIME_CACHE && k !== FONT_CACHE) {
            console.log('[SW] Purging obsolete cache:', k)
            return caches.delete(k)
          }
        })
      )
    }).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return

  const url = new URL(e.request.url)

  // 1. Never intercept or cache serverless function requests, release metadata, or standalone installers
  if (
    url.pathname.startsWith('/.netlify/functions/') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/releases/') ||
    url.pathname === '/releases.json'
  ) {
    return
  }

  // 2. Google Fonts: Cache-First with background revalidation
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.match(e.request).then((cachedRes) => {
        const fetchPromise = fetch(e.request).then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const resClone = networkRes.clone()
            caches.open(FONT_CACHE).then((cache) => cache.put(e.request, resClone)).catch(() => {})
          }
          return networkRes
        }).catch(() => cachedRes)
        return cachedRes || fetchPromise
      })
    )
    return
  }

  // 3. Foreign origins (not same-origin): do not intercept with custom service worker logic
  // Let the browser handle third-party CDNs, external APIs, and WebSockets natively
  if (url.origin !== self.location.origin) {
    return
  }

  // 4. Navigation requests: Network-First with strict captive portal validation and resilient offline fallback
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(async (networkRes) => {
          if (
            networkRes &&
            networkRes.status === 200 &&
            (networkRes.type === 'basic' || networkRes.type === 'default')
          ) {
            const contentType = networkRes.headers.get('content-type') || ''
            if (contentType.includes('text/html')) {
              try {
                const textClone = await networkRes.clone().text()
                const isAuthenticApp = textClone.includes('id="root"') || textClone.includes('<div id="root">')
                const isCaptivePortal = /captive|hotspot|wispr|radius|guest\s*login/i.test(textClone)

                if (isAuthenticApp && !isCaptivePortal) {
                  const resToCache = networkRes.clone()
                  caches.open(CACHE_NAME).then((cache) => {
                    cache.put('/index.html', resToCache.clone())
                    cache.put('/', resToCache)
                  }).catch(() => {})
                }
              } catch (e) {
                // Ignore clone read errors, return live response
              }
            }
          }
          return networkRes
        })
        .catch(async () => {
          const cached = await caches.match('/index.html') || await caches.match('/')
          if (cached) return cached
          return new Response(
            '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>ToolDesk Offline</title><style>body{font-family:sans-serif;padding:40px;text-align:center;color:#333}</style></head><body><h2>You are currently offline</h2><p>Please check your connection and reload.</p><button onclick="location.reload()">Reload</button></body></html>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          )
        })
    )
    return
  }

  // 5. Static assets (JS chunks, CSS, icons, wasm, tesseract data): Stale-While-Revalidate
  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/tesseract/')
  ) {
    e.respondWith(
      caches.match(e.request).then((cachedRes) => {
        const fetchPromise = fetch(e.request).then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const resClone = networkRes.clone()
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(e.request, resClone)).catch(() => {})
          }
          return networkRes
        }).catch(() => cachedRes)
        return cachedRes || fetchPromise
      })
    )
    return
  }

  // 6. Default same-origin assets: Cache with network fallback
  e.respondWith(
    caches.match(e.request).then((cachedRes) => {
      return cachedRes || fetch(e.request).then((networkRes) => {
        if (networkRes && networkRes.status === 200) {
          const resClone = networkRes.clone()
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(e.request, resClone)).catch(() => {})
        }
        return networkRes
      }).catch(() => cachedRes || new Response('', { status: 503, statusText: 'Offline' }))
    })
  )
})
