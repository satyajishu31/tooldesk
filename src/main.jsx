import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { isNativeShell } from './utils/apiConfig'


// Polyfill Promise.withResolvers for broader compatibility (Safari < 17.4, older Android WebViews)
if (typeof Promise.withResolvers === 'undefined') {
  Promise.withResolvers = function () {
    let resolve, reject
    const promise = new Promise((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }
}

// Enable immediate :active tap feedback on touch devices (WebKit, Blink, Android WebView, iOS)
if (typeof window !== 'undefined') {
  document.addEventListener('touchstart', () => {}, { passive: true })

  if (isNativeShell()) {
    import('@capacitor/status-bar').then(({ StatusBar }) => {
      if (StatusBar && typeof StatusBar.getInfo === 'function') {
        StatusBar.getInfo().then(info => {
          if (info && typeof info.height === 'number' && info.height > 0) {
            document.documentElement.style.setProperty('--safe-area-inset-top', `${info.height}px`)
          }
        }).catch(() => {})
      }
    }).catch(() => {})
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// Reload on dynamic chunk preload failure (e.g. after a new release is deployed)
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', () => {
    window.location.reload()
  })
}

// In native shells (Android APK & iOS), actively purge any stale service workers and CacheStorage
if (typeof window !== 'undefined' && isNativeShell()) {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      for (const reg of registrations) {
        reg.unregister().catch(() => {})
      }
    }).catch(() => {})
  }
  if ('caches' in window) {
    caches.keys().then(keys => {
      for (const key of keys) {
        caches.delete(key).catch(() => {})
      }
    }).catch(() => {})
  }
}

if ('serviceWorker' in navigator && !isNativeShell() && window.location?.protocol?.startsWith('http')) {
  let refreshing = false
  const hadController = Boolean(navigator.serviceWorker.controller)

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !refreshing) {
      refreshing = true
      window.location.reload()
    }
  })

  const registerSW = () => {
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      // Check for updates on startup
      registration.update().catch(() => {})

      // Check for updates whenever window regains focus
      window.addEventListener('focus', () => {
        registration.update().catch(() => {})
      })

      // Periodic background update check every 30 minutes
      setInterval(() => {
        registration.update().catch(() => {})
      }, 30 * 60 * 1000)
    }).catch(err => {
      console.warn('Service worker registration failed:', err)
    })
  }

  if (document.readyState === 'complete') {
    registerSW()
  } else {
    window.addEventListener('load', registerSW)
  }
}

