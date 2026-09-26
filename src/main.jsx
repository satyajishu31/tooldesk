import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { isNativeShell } from './utils/apiConfig'

import { StatusBar } from '@capacitor/status-bar'

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

if ('serviceWorker' in navigator && !isNativeShell() && window.location?.protocol?.startsWith('http')) {
  const registerSW = () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.warn('Service worker registration failed:', err)
    })
  }

  if (document.readyState === 'complete') {
    registerSW()
  } else {
    window.addEventListener('load', registerSW)
  }
}
