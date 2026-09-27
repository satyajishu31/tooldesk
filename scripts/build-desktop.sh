#!/bin/bash
set -e

echo "==> Building ToolDesk Desktop Application..."
export PATH="$HOME/.cargo/bin:$PATH"

# Run Tauri bundle build for desktop
npx tauri build -b app

# On macOS, package .app into .dmg with fixed volume size
if [[ "$OSTYPE" == "darwin"* ]]; then
  echo "==> Codesigning ToolDesk.app bundle with ad-hoc signature..."
  APP_PATH="src-tauri/target/release/bundle/macos/ToolDesk.app"
  if [ -d "$APP_PATH" ]; then
    xattr -cr "$APP_PATH" || true
    codesign --force --deep --sign - "$APP_PATH"

    echo "==> Creating macOS DMG installer with ditto..."
    mkdir -p releases/macos public/releases/macos dist/releases/macos
    TMP_DMG="/tmp/ToolDesk_rw_$$.dmg"
    rm -f "$TMP_DMG"
    
    # 1. Create a blank 950MB HFS+ volume (large enough for app bundle + overhead)
    hdiutil create -size 950m -volname "ToolDesk" -fs HFS+ -ov "$TMP_DMG"
    
    # 2. Mount it silently
    MOUNT_DIR=$(hdiutil attach "$TMP_DMG" -nobrowse | grep -o '/Volumes/.*' | head -n 1)
    
    # Set trap to ensure cleanup on error
    cleanup_mount() {
      if [ -n "$MOUNT_DIR" ] && [ -d "$MOUNT_DIR" ]; then
        hdiutil detach "$MOUNT_DIR" 2>/dev/null || true
      fi
      rm -f "$TMP_DMG"
    }
    trap cleanup_mount EXIT INT TERM

    # 3. Use ditto (preserves all code signatures, xattrs, and symlinks)
    ditto "$APP_PATH" "$MOUNT_DIR/ToolDesk.app"
    ln -s /Applications "$MOUNT_DIR/Applications"
    
    # 4. Detach cleanly
    hdiutil detach "$MOUNT_DIR"
    MOUNT_DIR=""
    
    # 5. Convert to compressed read-only DMG (UDZO)
    hdiutil convert "$TMP_DMG" -format UDZO -o "releases/macos/ToolDesk.dmg" -ov
    cp "releases/macos/ToolDesk.dmg" "public/releases/macos/ToolDesk.dmg"
    cp "releases/macos/ToolDesk.dmg" "dist/releases/macos/ToolDesk.dmg"
    rm -f "$TMP_DMG"
    trap - EXIT INT TERM
    
    echo "==> macOS DMG created at: releases/macos/ToolDesk.dmg"

    echo "==> Creating macOS Application ZIP archive..."
    ditto -c -k --keepParent "$APP_PATH" "releases/macos/ToolDesk-macOS.zip"
    cp "releases/macos/ToolDesk-macOS.zip" "public/releases/macos/ToolDesk-macOS.zip"
    cp "releases/macos/ToolDesk-macOS.zip" "dist/releases/macos/ToolDesk-macOS.zip"

    echo "==> Verifying DMG integrity..."
    hdiutil verify "releases/macos/ToolDesk.dmg"

    echo "==> Calculating SHA-256 Checksums for macOS artifacts..."
    shasum -a 256 releases/macos/*
  fi
fi

echo "==> Desktop packaging complete!"
