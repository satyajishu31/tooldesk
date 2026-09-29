# ToolDesk v1.3.0 Code Cleanup & Hardening Manifest

This manifest documents all file-level and component-level audits, dead code cleanups, dependency localizations, and hardening operations executed for the v1.3.0 release.

---

## 1. Audited & Modified Files

| File Path | Changes & Hardening Executed |
|:---|:---|
| `package.json` | Bumped version to `1.3.0`. Added `@pdfsmaller/pdf-encrypt` (v1.2.0) and `@pdfsmaller/pdf-decrypt` (v1.0.1) for zero-dependency client-side PDF encryption/decryption. |
| `src/index.css` | Hardened baseline range slider tracks (`input[type="range"]`) with explicit background fills to eliminate WebKit slider track disappearance; added `.rs-thumb`, `.rs-thumb-purple`, `.progress-rail`, and `.progress-fill`. |
| `src/utils/pdfEngine.js` | Added `lockPdf()`, `unlockPdf()`, and `changePdfPassword()` with Web Crypto API AES-256 and RC4-128 algorithms; added radio button grouping in `createPdfFormFields()`; enhanced `compressPdf()` with custom DPI (72, 96, 144, 300) and JPEG quality options; added universal binary input handling via `toSafeArrayBuffer()`. |
| `src/pages/tools/PDFToolkit.jsx` | Replaced legacy `protect` advisory with genuine `lock` and `change-password` operations; upgraded action catalog with themed Lucide icons; wired UI controls for password protection, algorithms, owner passwords, and permission toggles; added `useToolHistory('PDF Toolkit', 15)` Recent PDF Operations shelf; upgraded all sliders to continuous rails. |
| `src/pages/tools/BcryptTool.jsx` | Modernized `TabBar` into an equal-width CSS grid (`grid-auto-flow: column`, `grid-auto-columns: 1fr`, `min-height: 42px`); replaced all unstyled raw emojis with Lucide icons; fixed cost slider tracks with continuous gradients; equalized attacker model cards to `minHeight: 48px` and metric cards to `minHeight: 96px`. |
| `src/pages/tools/FileConverter.jsx` | Integrated `useToolHistory('File Converter', 15)` to render Recent File Conversions card with zero-trust local storage guarantees and individual/bulk deletion. |
| `src/pages/tools/VideoScreenshotExtractor.jsx` | Removed dynamic remote script tag injection pointing to `cdnjs.cloudflare.com`; localized script loading from `/gifshot.min.js`. |
| `public/gifshot.min.js` | Bundled asset locally to guarantee 100% offline functionality. |
| `public/releases.json` | Updated root release metadata and all 6 platform blocks to version `1.3.0` and download URLs pointing to `v1.3.0`. |
| `src/utils/releaseConfig.js` | Synchronized release version `1.3.0`, release date `2026-09-30`, release notes, and all binary download URLs. |
| `public/sw.js` | Bumped `SW_VERSION` to `v1.3.0` to trigger automatic client service worker update and cache rotation. |
| `netlify.toml` | Updated direct release redirect URLs from `v1.0.2` to canonical `v1.3.0`. |
| `src-tauri/Cargo.toml` | Bumped version to `1.3.0`. |
| `src-tauri/tauri.conf.json` | Bumped version to `1.3.0`. |
| `android/app/build.gradle` | Bumped `versionCode 13000` and `versionName "1.3.0"`. |
| `ios/App/App.xcodeproj/project.pbxproj` | Bumped `MARKETING_VERSION = 1.3.0;` for Debug and Release targets. |
| `scripts/test-all-tools.js` | Added automated test assertions for client-side AES-256 PDF encryption/decryption/password change; updated release consistency checks to v1.3.0. |
| `scripts/test-download-outputs.js` | Updated release manifest verification to v1.3.0. |

---

## 2. Dead / Redundant Code Purge Verification

1. **Obsolete Advisory Placeholders:**
   - Purged the dummy `protect` advisory block that previously warned users that client-side PDF encryption was impossible. Replaced with real AES-256 / RC4-128 cryptographic pipelines.
2. **Third-Party CDN Injections:**
   - Purged remote CDN script injection from `VideoScreenshotExtractor.jsx`.
3. **Stale Netlify Redirects:**
   - Purged hardcoded legacy 302 redirects pointing to `v1.0.2` in `netlify.toml` and pointed them to `v1.3.0`.
4. **Emoji Controls in Security Tools:**
   - Purged raw unstyled emoji characters across `BcryptTool.jsx` and `PDFToolkit.jsx` action catalog, substituting semantic, accessible Lucide icon components.
