/**
 * ToolDesk Privacy Transparency Tier System
 * Maps every tool to its verified processing architecture.
 *
 * Tiers:
 * - 'local': 100% client-side in your browser (Canvas, Web Workers, WASM, WebCrypto, Tesseract.js, pdf-lib)
 * - 'server': Processed via secure ToolDesk serverless functions (e.g. Website Analyzer, Vault sync)
 * - 'third-party': Relies on verified third-party APIs (e.g. DeepL, Groq Whisper, Have I Been Pwned, IP Geolocation)
 */

export const PRIVACY_TIERS = {
  // Local In-Browser Tools
  password: {
    tier: 'local',
    label: 'Local In-Browser',
    icon: '🔒',
    detail: 'Cryptographically generated via Web Crypto API. Zero data leaves your device.'
  },
  wordcount: {
    tier: 'local',
    label: 'Local In-Browser',
    icon: '🔒',
    detail: 'Real-time text analytics executed entirely in your browser memory.'
  },
  textcase: {
    tier: 'local',
    label: 'Local In-Browser',
    icon: '🔒',
    detail: 'Client-side string transforms. Zero network requests.'
  },
  units: {
    tier: 'local',
    label: 'Local In-Browser',
    icon: '🔒',
    detail: 'Deterministic conversion factors calculated locally.'
  },
  currency: {
    tier: 'local',
    label: 'Local Reference Rates',
    icon: '🔒',
    detail: 'Conversion math is performed locally using bundled and cached reference exchange rates.'
  },
  gradient: {
    tier: 'local',
    label: 'Local In-Browser',
    icon: '🔒',
    detail: 'Visual CSS gradient generation and mesh rendering runs on local canvas.'
  },
  quote: {
    tier: 'local',
    label: 'Local In-Browser',
    icon: '🔒',
    detail: 'Curated offline quote library stored locally.'
  },
  favicon: {
    tier: 'local',
    label: 'Local In-Browser',
    icon: '🔒',
    detail: 'Canvas rendering and ICO/PNG generation executed on-device.'
  },
  thumbnail: {
    tier: 'local',
    label: 'Direct Embed',
    icon: '🔒',
    detail: 'Fetches public YouTube video thumbnails directly in your browser.'
  },
  imgresizer: {
    tier: 'local',
    label: 'Local In-Browser',
    icon: '🔒',
    detail: 'High-performance Canvas and Web Worker scaling. Files never leave your browser.'
  },
  imgcompress: {
    tier: 'local',
    label: 'Local In-Browser',
    icon: '🔒',
    detail: 'Client-side iterative compression and canvas quantizer. Zero upload.'
  },
  imgconvert: {
    tier: 'local',
    label: 'Local In-Browser',
    icon: '🔒',
    detail: 'WASM & native canvas image transcoding. 100% private.'
  },
  bgremove: {
    tier: 'local',
    label: 'Local + Optional AI',
    icon: '🔒',
    detail: 'Default mode uses flood-fill matting on local canvas (100% private). Optional AI mode sends images to Remove.bg API for higher quality results.'
  },
  pdf: {
    tier: 'local',
    label: 'Local In-Browser',
    icon: '🔒',
    detail: 'Compiled pdf-lib and PDF.js WASM engine. PDFs never uploaded to any server.'
  },
  aspectratio: {
    tier: 'local',
    label: 'Local In-Browser',
    icon: '🔒',
    detail: 'Pure client-side geometric mathematics and canvas rendering.'
  },
  fileconvert: {
    tier: 'local',
    label: 'Local In-Browser',
    icon: '🔒',
    detail: 'Client-side file parsers (Native OOXML Engine, Canvas, AudioContext). 100% on-device.'
  },
  vault: {
    tier: 'local',
    label: 'End-to-End Encrypted',
    icon: '🛡️',
    detail: 'AES-256-GCM + PBKDF2 local encryption. Plaintext is never transmitted; cloud sync is optional & E2EE.'
  },
  imagetools: {
    tier: 'local',
    label: 'Local In-Browser',
    icon: '🔒',
    detail: 'WASM Tesseract OCR, canvas crop, permanent pixel redaction & EXIF cleanup executed on-device.'
  },
  randname: {
    tier: 'local',
    label: 'Local In-Browser',
    icon: '🔒',
    detail: 'Deterministic pseudo-random generation using offline country name databases.'
  },
  randaddress: {
    tier: 'local',
    label: 'Simulated Test Fixture',
    icon: '🔒',
    detail: 'Algorithmic synthetic address generation for developer testing. No real user data.'
  },
  wordreplace: {
    tier: 'local',
    label: 'Local In-Browser',
    icon: '🔒',
    detail: 'Client-side RegEx and string replacement engine.'
  },
  bcrypt: {
    tier: 'local',
    label: 'Local In-Browser',
    icon: '🔒',
    detail: 'Compiled bcryptjs execution and entropy auditor. Passwords never transmitted.'
  },
  colorpicker: {
    tier: 'local',
    label: 'Local In-Browser',
    icon: '🔒',
    detail: 'WCAG contrast formulas and color-space conversions computed locally.'
  },
  videoscreenshot: {
    tier: 'local',
    label: 'Local In-Browser',
    icon: '🔒',
    detail: 'HTML5 Video decoding and frame capture to canvas/JSZip. Zero server upload.'
  },
  qrcode: {
    tier: 'local',
    label: 'Local In-Browser',
    icon: '🔒',
    detail: 'Client-side JSQR, ZXing scanner and SVG/Canvas generator. Camera stream never leaves device.'
  },
  systeminfo: {
    tier: 'local',
    label: 'Local Audit Only',
    icon: '🔒',
    detail: 'Browser API inspection and developer utilities run strictly on this machine.'
  },
  countryfinder: {
    tier: 'local',
    label: 'Cached Reference Data',
    icon: '🔒',
    detail: 'Bundled offline country dataset with fast local client-side search.'
  },

  // Serverless Tools
  websiteanalyzer: {
    tier: 'server',
    label: 'Serverless Audit',
    icon: '⚡',
    detail: 'Target URL is fetched and analyzed through Netlify serverless function with strict SSRF protections.'
  },

  // Third-Party API Tools
  videotranscriber: {
    tier: 'third-party',
    label: 'Third-Party AI',
    icon: '🌐',
    detail: 'Audio extracted locally and securely dispatched to Groq Whisper API for transcription.'
  },
  translator: {
    tier: 'third-party',
    label: 'Third-Party API',
    icon: '🌐',
    detail: 'Text is translated via DeepL API. Free-tier usage respects provider terms.'
  },
  breachcheck: {
    tier: 'third-party',
    label: 'Third-Party API',
    icon: '🌐',
    detail: 'Email queried against Have I Been Pwned API. Passwords are never requested or sent.'
  },
  iplookup: {
    tier: 'third-party',
    label: 'Third-Party API',
    icon: '🌐',
    detail: 'Public IP queried via ipapi/ipinfo service for ISP, ASN and geolocation.'
  }
}

export function getToolPrivacyTier(toolId) {
  return PRIVACY_TIERS[toolId] || {
    tier: 'local',
    label: 'Local In-Browser',
    icon: '🔒',
    detail: 'Processed locally in your browser.'
  }
}
