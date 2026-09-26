# ToolDesk Application Releases

This directory is the staging area for published binary installers and application bundles:

- `windows/` — `ToolDesk-Setup.exe` (NSIS Installer) / `.msi` (WiX)
- `macos/` — `ToolDesk.dmg` / `ToolDesk.app` (Apple Silicon & Intel Universal)
- `linux/` — `ToolDesk.AppImage` / `.deb`
- `android/` — `ToolDesk.apk` / `app-release.aab`

## Direct Hosting vs Cloud Releases

You can either:
1. Copy your built installer files directly into `public/releases/<platform>/` so the website serves them directly via static download links, or
2. Upload the installer files to GitHub Releases or AWS S3 / Cloudflare R2 and configure:
   ```env
   VITE_WINDOWS_DOWNLOAD_URL=https://github.com/your-org/tooldesk/releases/download/v1.0.0/ToolDesk-Setup.exe
   VITE_MAC_DOWNLOAD_URL=https://github.com/your-org/tooldesk/releases/download/v1.0.0/ToolDesk.dmg
   VITE_LINUX_DOWNLOAD_URL=https://github.com/your-org/tooldesk/releases/download/v1.0.0/ToolDesk.AppImage
   VITE_ANDROID_DOWNLOAD_URL=https://github.com/your-org/tooldesk/releases/download/v1.0.0/ToolDesk.apk
   VITE_IOS_DOWNLOAD_URL=https://testflight.apple.com/join/...
   ```
The website "Download App" button automatically uses these URLs.
