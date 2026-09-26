import Cocoa
import CoreGraphics
import Foundation

// Load source images
let workspace = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : FileManager.default.currentDirectoryPath
let logoIconPath = "\(workspace)/public/logo-icon.png"
let logoFullPath = "\(workspace)/public/logo.png"

guard let logoIconImage = NSImage(contentsOfFile: logoIconPath) else {
    print("Error: Could not load \(logoIconPath)")
    exit(1)
}

guard let logoFullImage = NSImage(contentsOfFile: logoFullPath) else {
    print("Error: Could not load \(logoFullPath)")
    exit(1)
}

func savePNG(image: NSImage, to path: String) {
    guard let tiff = image.tiffRepresentation,
          let rep = NSBitmapImageRep(data: tiff),
          let pngData = rep.representation(using: .png, properties: [:]) else {
        print("Error converting to PNG: \(path)")
        return
    }
    do {
        try pngData.write(to: URL(fileURLWithPath: path))
        print("✓ Wrote: \(path)")
    } catch {
        print("Error writing \(path): \(error)")
    }
}

// 1. Generate Adaptive Icon Foreground (Centered with safe zone margin, transparent bg)
// Android safe zone is 72dp circle in 108dp canvas = 66.67%. We use 62% to be 100% safe.
func createForeground(size: Int) -> NSImage {
    let img = NSImage(size: NSSize(width: size, height: size))
    img.lockFocus()
    
    let targetSize = CGFloat(size) * 0.62
    let origin = (CGFloat(size) - targetSize) / 2.0
    let destRect = NSRect(x: origin, y: origin, width: targetSize, height: targetSize)
    
    logoIconImage.draw(in: destRect, from: NSRect(origin: .zero, size: logoIconImage.size), operation: .sourceOver, fraction: 1.0)
    
    img.unlockFocus()
    return img
}

// 2. Generate Legacy Square App Icon (White rounded card with TD logo)
func createLegacySquare(size: Int) -> NSImage {
    let img = NSImage(size: NSSize(width: size, height: size))
    img.lockFocus()
    
    let s = CGFloat(size)
    let cardRect = NSRect(x: 1, y: 1, width: s - 2, height: s - 2)
    let cornerRadius = s * 0.22
    let path = NSBezierPath(roundedRect: cardRect, xRadius: cornerRadius, yRadius: cornerRadius)
    
    // Background fill
    NSColor.white.setFill()
    path.fill()
    
    // Subtle border
    NSColor(white: 0.9, alpha: 1.0).setStroke()
    path.lineWidth = max(1.0, s * 0.02)
    path.stroke()
    
    // Centered Logo
    let targetSize = s * 0.72
    let origin = (s - targetSize) / 2.0
    let destRect = NSRect(x: origin, y: origin, width: targetSize, height: targetSize)
    logoIconImage.draw(in: destRect, from: NSRect(origin: .zero, size: logoIconImage.size), operation: .sourceOver, fraction: 1.0)
    
    img.unlockFocus()
    return img
}

// 3. Generate Legacy Round App Icon (White circle with TD logo)
func createLegacyRound(size: Int) -> NSImage {
    let img = NSImage(size: NSSize(width: size, height: size))
    img.lockFocus()
    
    let s = CGFloat(size)
    let circleRect = NSRect(x: 1, y: 1, width: s - 2, height: s - 2)
    let path = NSBezierPath(ovalIn: circleRect)
    
    // Background fill
    NSColor.white.setFill()
    path.fill()
    
    // Subtle border
    NSColor(white: 0.9, alpha: 1.0).setStroke()
    path.lineWidth = max(1.0, s * 0.02)
    path.stroke()
    
    // Centered Logo
    let targetSize = s * 0.68
    let origin = (s - targetSize) / 2.0
    let destRect = NSRect(x: origin, y: origin, width: targetSize, height: targetSize)
    logoIconImage.draw(in: destRect, from: NSRect(origin: .zero, size: logoIconImage.size), operation: .sourceOver, fraction: 1.0)
    
    img.unlockFocus()
    return img
}

// 4. Generate Branded Splash Screen (Clean white background with centered 3D ToolDesk branding)
func createSplash(width: Int, height: Int) -> NSImage {
    let img = NSImage(size: NSSize(width: width, height: height))
    img.lockFocus()
    
    // Background fill (pure crisp white)
    NSColor.white.setFill()
    NSRect(x: 0, y: 0, width: width, height: height).fill()
    
    let w = CGFloat(width)
    let h = CGFloat(height)
    let isPortrait = h >= w
    
    // Draw centered ToolDesk logo
    let logoW = isPortrait ? min(w * 0.65, 360) : min(h * 0.55, 340)
    let logoH = logoW * (logoFullImage.size.height / logoFullImage.size.width)
    let destRect = NSRect(x: (w - logoW) / 2.0, y: (h - logoH) / 2.0, width: logoW, height: logoH)
    
    logoFullImage.draw(in: destRect, from: NSRect(origin: .zero, size: logoFullImage.size), operation: .sourceOver, fraction: 1.0)
    
    img.unlockFocus()
    return img
}

// --- GENERATE ANDROID MIPMAPS ---
let mipmaps: [(density: String, fgSize: Int, legacySize: Int)] = [
    ("mdpi", 108, 48),
    ("hdpi", 162, 72),
    ("xhdpi", 216, 96),
    ("xxhdpi", 324, 144),
    ("xxxhdpi", 432, 192)
]

for m in mipmaps {
    let dir = "\(workspace)/android/app/src/main/res/mipmap-\(m.density)"
    let fg = createForeground(size: m.fgSize)
    savePNG(image: fg, to: "\(dir)/ic_launcher_foreground.png")
    
    let square = createLegacySquare(size: m.legacySize)
    savePNG(image: square, to: "\(dir)/ic_launcher.png")
    
    let round = createLegacyRound(size: m.legacySize)
    savePNG(image: round, to: "\(dir)/ic_launcher_round.png")
}

// --- GENERATE ANDROID SPLASH SCREENS ---
let splashConfigs: [(folder: String, w: Int, h: Int)] = [
    ("drawable", 480, 320),
    ("drawable-land-mdpi", 480, 320),
    ("drawable-land-hdpi", 800, 480),
    ("drawable-land-xhdpi", 1280, 720),
    ("drawable-land-xxhdpi", 1600, 960),
    ("drawable-land-xxxhdpi", 1920, 1280),
    ("drawable-port-mdpi", 320, 480),
    ("drawable-port-hdpi", 480, 800),
    ("drawable-port-xhdpi", 720, 1280),
    ("drawable-port-xxhdpi", 960, 1600),
    ("drawable-port-xxxhdpi", 1280, 1920)
]

for s in splashConfigs {
    let dir = "\(workspace)/android/app/src/main/res/\(s.folder)"
    let splash = createSplash(width: s.w, height: s.h)
    savePNG(image: splash, to: "\(dir)/splash.png")
}

// --- GENERATE IOS SPLASH SCREENS ---
let iosSplashDir = "\(workspace)/ios/App/App/Assets.xcassets/Splash.imageset"
if FileManager.default.fileExists(atPath: iosSplashDir) {
    let iosSplash = createSplash(width: 2732, height: 2732)
    savePNG(image: iosSplash, to: "\(iosSplashDir)/splash-2732x2732.png")
    savePNG(image: iosSplash, to: "\(iosSplashDir)/splash-2732x2732-1.png")
    savePNG(image: iosSplash, to: "\(iosSplashDir)/splash-2732x2732-2.png")
}

// --- GENERATE IOS APP ICONS (Opaque white card, no transparency per Apple Guidelines) ---
let iosIconDir = "\(workspace)/ios/App/App/Assets.xcassets/AppIcon.appiconset"
if FileManager.default.fileExists(atPath: iosIconDir) {
    let sizes = [20, 29, 40, 58, 60, 76, 80, 87, 120, 152, 167, 180, 1024]
    for sz in sizes {
        let img = NSImage(size: NSSize(width: sz, height: sz))
        img.lockFocus()
        NSColor.white.setFill()
        NSRect(x: 0, y: 0, width: sz, height: sz).fill()
        let target = CGFloat(sz) * 0.78
        let orig = (CGFloat(sz) - target) / 2.0
        logoIconImage.draw(in: NSRect(x: orig, y: orig, width: target, height: target),
                           from: NSRect(origin: .zero, size: logoIconImage.size),
                           operation: .sourceOver, fraction: 1.0)
        img.unlockFocus()
        savePNG(image: img, to: "\(iosIconDir)/AppIcon-\(sz)x\(sz).png")
    }
    // Also save 1024x1024 as AppIcon-512@2x.png
    let app1024 = createLegacySquare(size: 1024)
    savePNG(image: app1024, to: "\(iosIconDir)/AppIcon-512@2x.png")
}

// --- GENERATE PWA MASKABLE ICONS (Safe zone margin on white card) ---
let pwa192 = createLegacySquare(size: 192)
savePNG(image: pwa192, to: "\(workspace)/public/pwa-192x192.png")

let pwa512 = createLegacySquare(size: 512)
savePNG(image: pwa512, to: "\(workspace)/public/pwa-512x512.png")

let appleTouchIcon = createLegacySquare(size: 180)
savePNG(image: appleTouchIcon, to: "\(workspace)/public/apple-touch-icon.png")

print("✨ All native Android, iOS, and PWA assets generated successfully!")
