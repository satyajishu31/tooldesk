# ⚡ ToolDesk — Web, Desktop & Mobile

**ToolDesk** — 33+ high-performance, privacy-first utility tools. 
Runs seamlessly from **one codebase** as:
1. **Web & Installable PWA** (hosted on Netlify)
2. **Desktop App** for Windows, macOS, and Linux (powered by Tauri)
3. **Mobile App** for Android and iOS (powered by Capacitor)

---

## 🛠️ Tool Suite (33+ Tools)

### 📄 Document & PDF Engine
- **PDF Toolkit**: Merge, Split, Reorder, Delete Pages, Rotate, Stamp/Sign, Encrypt/Decrypt, Flatten, Extract Text, OCR, Compress, Convert PDF to Images / Images to PDF.
- **Word Replacer**: Bulk regex, case-preserving text replacement, character frequency, word analytics.
- **Word Counter**: Live word, character, sentence, paragraph, reading time, and readability metrics.
- **Text Case Converter**: Sentence case, title case, camelCase, kebab-case, snake_case, CONSTANT_CASE.
- **File Converter**: Client-side document conversions (HTML, Markdown, Plain Text, DOCX parsing via Mammoth).

### 🎨 Image & Media Studio
- **Image Tools Studio**: Unified workspace hosting Image Resizer, Compressor, Format Converter, Manual Crop Studio, DPI Checker, and Image Redactor.
- **Image Resizer**: Canvas-accelerated dimensions resizing, aspect ratio locks, bulk processing.
- **Image Compressor**: Quantization, JPEG/WebP quality control, side-by-side visual diff.
- **Image Converter**: PNG, JPEG, WebP, SVG, ICO conversions.
- **Background Remover**: WebAssembly ONNX/RMBG machine learning background segmentation with cloud fallback.
- **Image Redactor**: Canvas-based PII auto-detection and custom redacting boxes.
- **Manual Crop Studio**: Multi-aspect ratio preset cropping.
- **Image DPI Checker**: EXIF and JFIF metadata density inspection.
- **Favicon Generator**: Multi-tier multi-resolution icon bundle generation.
- **Border & Corner Generators**: Visual frame styling and border radius tuning.
- **YouTube Thumbnail Grabber**: HD/4K preview extractor with direct download.
- **Video Transcriber**: In-browser audio extraction via FFmpeg WASM and SpeechRecognition.
- **Screenshot Extractor**: Webpage rendering and snapshot analysis.

### 🔐 Security & Developer Utilities
- **Password Generator**: Cryptographically secure WebCrypto random entropy generator.
- **Password Vault**: Zero-knowledge client-encrypted vault using PBKDF2 (100k rounds) + AES-GCM 256-bit with optional encrypted cloud backup sync.
- **Bcrypt Tool**: Web Worker accelerated Bcrypt salt generation, hashing, and timing-safe verification.
- **HIBP Breach Checker**: K-anonymity SHA-1 prefix checking against HaveIBeenPwned.
- **QR Generator & Scanner**: Canvas dynamic QR generation with customizable logos and live camera/file scanner.
- **Barcode Studio**: EAN-13, UPC-A, Code 128 barcode generation and verification.
- **Website Analyzer**: SSRF-protected serverless network headers, security scores, performance, and SEO audits.
- **IP Lookup**: Geolocation and network provider intelligence via GeoJS/ipapi.
- **DeepL Translator**: Real-time translation integration.

### 📐 Calculators & Converters
- **Unit Converter**: Mass, length, area, speed, volume, and digital units.
- **Currency Converter**: Live and cached forex currency exchange conversions.
- **Aspect Ratio Calculator**: Standard screen ratios, scaling factors, responsive dimensions.
- **File Size Converter**: Exact byte conversions (B, KB, MB, GB, TB, PB) in binary and decimal.
- **Gradient Generator**: CSS multi-stop linear and radial gradient builder.
- **Quote Generator**: Curated inspirational and technical quotes.
- **Random Name & Address Generators**: Locale-specific mock data generator for testing and forms.

---

## 💻 Tech Stack
- **Frontend**: React 18, Vite 5, React Router v6, Framer Motion, Lucide Icons.
- **Typography**: Syne (Headings 700/800) & DM Sans (Body).
- **Desktop Shell**: Tauri 2.x (Rust, WebKit / WebView2).
- **Mobile Shell**: Capacitor 8.x (Android & iOS).
- **Client Processing**: Web Workers (Bcrypt, Background Remover), WebAssembly (FFmpeg, Tesseract OCR), WebCrypto (AES-GCM, PBKDF2, SHA-256).
- **Backend / Serverless**: Netlify Functions (Node.js 18+) with SSRF protection, strict CORS, and in-memory rate limiting.

---

## 🚀 How to Run and Build

### 1. Website (Netlify / Browser)
```bash
# Run local development with Netlify functions
npm run dev

# Build production website (creates dist/)
npm run build

# Preview production build locally
npm run preview
```

### 2. Desktop Application (Tauri)
```bash
# Run desktop app in development mode
npm run desktop:dev

# Build production desktop installer
npm run desktop:build
```
- **macOS output**: `releases/macos/ToolDesk.dmg` and `src-tauri/target/release/bundle/macos/ToolDesk.app`
- **Windows output**: When run on Windows (or GitHub Actions), outputs `src-tauri/target/release/bundle/nsis/ToolDesk_Setup.exe` and `.msi`.
- **Linux output**: When run on Linux, outputs `src-tauri/target/release/bundle/appimage/ToolDesk.AppImage` and `.deb`.

### 3. Mobile Application (Capacitor)
```bash
# Sync web code with native Android & iOS projects
npm run mobile:sync

# Open Android project in Android Studio (to build APK / AAB)
npm run mobile:android

# Open iOS project in Xcode (to build / run on iPhone or iPad)
npm run mobile:ios
```

---

## 📂 Where Generated Installers Are Located

- **macOS DMG**: `releases/macos/ToolDesk.dmg` (also in `public/releases/macos/ToolDesk.dmg`)
- **Windows EXE/MSI**: `src-tauri/target/release/bundle/nsis/` or placed into `releases/windows/`
- **Linux AppImage/deb**: `src-tauri/target/release/bundle/appimage/` or placed into `releases/linux/`
- **Android APK**: `android/app/build/outputs/apk/debug/app-debug.apk` or placed into `releases/android/`

---

## 🌐 How the Website "Download App" Button Works

In the navbar and mobile navigation drawer, there is a **"Download App"** button:
1. It automatically detects the visitor's operating system (Windows, macOS, Linux, Android, iOS, or Browser).
2. It displays the matching download option (e.g. "Download for macOS (.dmg)", "Download for Windows (.exe)", "Download Android APK", or "Install ToolDesk PWA").
3. Users can also click **"View all app downloads"** to download for any other operating system.
4. Download links are configurable via environment variables in `.env`:
   - `VITE_WINDOWS_DOWNLOAD_URL`
   - `VITE_MAC_DOWNLOAD_URL`
   - `VITE_LINUX_DOWNLOAD_URL`
   - `VITE_ANDROID_DOWNLOAD_URL`
   - `VITE_IOS_DOWNLOAD_URL`
   If not set, it defaults to the local files in `/releases/`.

---

## 🔒 Offline vs Internet-Dependent Features

- **100% Offline / Local Tools**:
  - Password Generator (WebCrypto)
  - Word Counter & Word Replacer
  - Text Case Converter
  - Unit Converter & File Size Converter
  - Gradient Generator & Quote Generator
  - QR Code Generator & Scanner
  - Barcode Generator
  - Image Resizer, Compressor, Converter, DPI Checker, Manual Crop Studio
  - PDF Toolkit (Merge, Split, Rotate, Encrypt, Extract, Convert)
  - Bcrypt Generator & Verifier (Local Web Worker)
  - Color Picker & Aspect Ratio Calculator
  - Password Vault (Client-side AES-GCM 256-bit encryption)

- **Internet-Dependent Features (via secure Netlify Functions)**:
  - Groq AI Assistant & Chat Helper
  - DeepL Text Translator
  - HaveIBeenPwned Email Breach Checker
  - Server-side Remove.bg AI Background Removal fallback
  - Audio Transcription via Groq Whisper
  - Website Network Analyzer & Security Scanner
  - IP Geolocation Lookup
  - Cloud Encrypted Password Vault Backup Sync

*Private API keys for internet services remain 100% server-side in Netlify Functions and are never exposed to desktop or mobile bundles.*

---

## 🔑 Distribution & Signing Credentials Guide

For local testing and direct distribution:
- **macOS**: `ToolDesk.dmg` is immediately installable. (To remove the macOS Gatekeeper warning for unsigned apps, run: `xattr -cr /Applications/ToolDesk.app`). For official Mac App Store distribution, an Apple Developer account ($99/yr) is required to notarize with Xcode.
- **Android**: To produce a release APK or Play Store AAB, open `android/` in Android Studio (`npm run mobile:android`) and choose **Build → Generate Signed Bundle / APK**, then select or create your Keystore.
- **Windows**: `ToolDesk-Setup.exe` generated by Tauri is immediately installable. For SmartScreen trust, a standard EV/OV Code Signing certificate can be added to Tauri configuration.
- **iOS**: To install on a physical iPhone/iPad or publish to TestFlight / App Store, open `ios/` in Xcode (`npm run mobile:ios`), log in with your Apple ID under **Signing & Capabilities**, and select your Team.

---

## 🤖 Automated Cloud Builds (GitHub Actions)

A GitHub Actions workflow is included at `.github/workflows/build-apps.yml`. Whenever you push code to GitHub:
- Automatically compiles the Windows `.exe` and `.msi`
- Automatically compiles the macOS `.dmg`
- Automatically compiles the Linux `.AppImage`
- Automatically builds the Android `.apk`
You can download the generated files directly from the **Actions** tab on GitHub without needing to configure Windows or Android SDK on your Mac!
