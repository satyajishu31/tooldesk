import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { isNativeShell } from './utils/apiConfig'

import { StatusBar } from '@capacitor/status-bar'

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
    try {
      StatusBar.getInfo().then(info => {
        if (info && typeof info.height === 'number' && info.height > 0) {
          document.documentElement.style.setProperty('--safe-area-inset-top', `${info.height}px`)
        }
      }).catch(() => {})
    } catch {}
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
      // Periodic update check
      setInterval(() => {
        registration.update().catch(() => {})
      }, 60 * 60 * 1000)
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

