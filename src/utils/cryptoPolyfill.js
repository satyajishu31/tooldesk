// src/utils/cryptoPolyfill.js
// Safe browser WebCrypto shim for browser/worker environments

function getCryptoObject() {
  if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
    return globalThis.crypto
  }
  if (typeof window !== 'undefined' && window.crypto && typeof window.crypto.getRandomValues === 'function') {
    return window.crypto
  }
  if (typeof self !== 'undefined' && self.crypto && typeof self.crypto.getRandomValues === 'function') {
    return self.crypto
  }
  return null
}

export function getRandomValues(arr) {
  const cryptoObj = getCryptoObject()
  if (cryptoObj) {
    return cryptoObj.getRandomValues(arr)
  }
  throw new Error('A cryptographically secure random number generator (crypto.getRandomValues) is required but unavailable in this environment.')
}

export function randomBytes(size) {
  const buf = new Uint8Array(size)
  return getRandomValues(buf)
}

export default {
  getRandomValues,
  randomBytes
}

