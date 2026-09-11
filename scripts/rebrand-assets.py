"""
Rebrand script — generates all Android/iOS icon & splash sizes from master assets,
copies web assets, and updates Capacitor config colors.

Run:  python3 scripts/rebrand-assets.py
"""
import os, shutil, subprocess
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")

# ── Master sources ─────────────────────────────────────────────────────────────
ICON_MASTER = os.path.join(ASSETS, "kuula-icon-1024.png")       # 1024×1024
SPLASH_CORAL = os.path.join(ASSETS, "kuula-splash-coral.png")   # 1080×1920
SPLASH_INK = os.path.join(ASSETS, "kuula-splash-ink.png")       # 1080×1920
FAVICON = os.path.join(ASSETS, "favicon-256.png")               # 256×256
LOGO_LIGHT = os.path.join(ASSETS, "kuula-logo-light.png")       # 1600×457
LOGO_DARK = os.path.join(ASSETS, "kuula-logo-dark.png")         # 1600×457

# ── Android icon sizes (mipmap) ────────────────────────────────────────────────
ANDROID_ICON_SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}

# ── Android splash sizes (drawable-PORT-DENSITY) ───────────────────────────────
# Capacitor uses CENTER_CROP so we provide the full portrait image at each density
ANDROID_SPLASH_DENSITIES = ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]

def resize(img, size):
    return img.resize((size, size), Image.LANCZOS)

def resize_fit(img, w, h):
    """Resize to fit within w×h, keeping aspect ratio."""
    img.thumbnail((w, h), Image.LANCZOS)
    return img

def ensure_dir(path):
    os.makedirs(path, exist_ok=True)

def main():
    icon = Image.open(ICON_MASTER)
    splash_coral = Image.open(SPLASH_CORAL)
    splash_ink = Image.open(SPLASH_INK)
    android_base = os.path.join(ROOT, "android", "app", "src", "main", "res")
    ios_base = os.path.join(ROOT, "ios", "App", "App", "Assets.xcassets")

    # ── 1. Android launcher icons ───────────────────────────────────────────
    print("📦 Android launcher icons...")
    for folder, size in ANDROID_ICON_SIZES.items():
        dest = os.path.join(android_base, folder)
        ensure_dir(dest)
        resized = resize(icon, size)
        # ic_launcher.png (rounded will be handled by adaptive icon XML)
        resized.save(os.path.join(dest, "ic_launcher.png"))
        # ic_launcher_round.png
        resized.save(os.path.join(dest, "ic_launcher_round.png"))
        # ic_launcher_foreground.png (for adaptive icons on API 26+)
        fg = resize(icon, size)
        fg.save(os.path.join(dest, "ic_launcher_foreground.png"))
        print(f"  ✅ {folder} ({size}×{size})")

    # ── 2. Android splash screens ───────────────────────────────────────────
    print("\n📱 Android splash screens...")
    for density in ANDROID_SPLASH_DENSITIES:
        # Portrait light — coral
        dest_dir = os.path.join(android_base, f"drawable-port-{density}")
        ensure_dir(dest_dir)
        splash_coral.save(os.path.join(dest_dir, "splash.png"))

        # Portrait dark/night — ink
        dest_dir_dark = os.path.join(android_base, f"drawable-port-night-{density}")
        ensure_dir(dest_dir_dark)
        splash_ink.save(os.path.join(dest_dir_dark, "splash.png"))

        # Landscape light — coral rotated
        dest_dir_land = os.path.join(android_base, f"drawable-land-{density}")
        ensure_dir(dest_dir_land)
        land_coral = splash_coral.transpose(Image.ROTATE_270)
        land_coral.save(os.path.join(dest_dir_land, "splash.png"))

        # Landscape dark/night — ink rotated
        dest_dir_land_dark = os.path.join(android_base, f"drawable-land-night-{density}")
        ensure_dir(dest_dir_land_dark)
        land_ink = splash_ink.transpose(Image.ROTATE_270)
        land_ink.save(os.path.join(dest_dir_land_dark, "splash.png"))

        print(f"  ✅ {density} (port + land, light + dark)")

    # Also update the base drawable (used as fallback)
    splash_coral.save(os.path.join(android_base, "drawable", "splash.png"))
    splash_ink.save(os.path.join(android_base, "drawable-night", "splash.png"))
    print("  ✅ drawable/ and drawable-night/ base")

    # ── 3. iOS App Icon ─────────────────────────────────────────────────────
    print("\n🍎 iOS App Icon...")
    ios_icon_dir = os.path.join(ios_base, "AppIcon.appiconset")
    ensure_dir(ios_icon_dir)
    # iOS needs specific sizes
    ios_icon_sizes = [20, 29, 40, 60, 76, 83.5]
    for s in ios_icon_sizes:
        resized = resize(icon, int(s * 2))  # @2x
        resized.save(os.path.join(ios_icon_dir, f"AppIcon-{int(s*2)}x{int(s*2)}@2x.png"))
    # Main icon sizes
    for s in [120, 152, 167, 1024]:
        resized = resize(icon, s)
        resized.save(os.path.join(ios_icon_dir, f"AppIcon-{s}x{s}.png"))
    # The existing 512@2x
    resize(icon, 1024).save(os.path.join(ios_icon_dir, "AppIcon-512@2x.png"))
    print(f"  ✅ {ios_icon_dir} (all sizes)")

    # ── 4. iOS Splash ──────────────────────────────────────────────────────
    print("\n🍎 iOS Splash screens...")
    ios_splash_dir = os.path.join(ios_base, "Splash.imageset")
    ensure_dir(ios_splash_dir)
    # iOS splash needs square images at 2732×2732 that Capacitor crops
    # We create these by centering the portrait splash on a square canvas
    for variant_name, splash_img in [("coral", splash_coral), ("ink", splash_ink)]:
        square = Image.new("RGBA", (2732, 2732), (0, 0, 0, 0))
        # Center the portrait image on the square
        w, h = splash_img.size
        x = (2732 - w) // 2
        y = (2732 - h) // 2
        square.paste(splash_img, (x, y))
        suffix = "" if variant_name == "coral" else "-1"
        suffix2 = "-2" if variant_name == "coral" else ""
        # Save at multiple scale factors
        for scale_name, scale in [("Default@1x", 1), ("Default@2x", 2), ("Default@3x", 3)]:
            target = int(2732 / scale)
            resized = resize(square, target)
            if variant_name == "coral":
                resized.save(os.path.join(ios_splash_dir, f"{scale_name}~universal~anyany.png"))
                # Dark variant - use ink splash
            else:
                resized.save(os.path.join(ios_splash_dir, f"{scale_name}~universal~anyany-dark.png"))

    # Also overwrite the existing splash-2732x2732 files
    for f in os.listdir(ios_splash_dir):
        if f.startswith("splash-2732"):
            os.remove(os.path.join(ios_splash_dir, f))
    square_coral = Image.new("RGBA", (2732, 2732), (0, 0, 0, 0))
    w, h = splash_coral.size
    square_coral.paste(splash_coral, ((2732 - w) // 2, (2732 - h) // 2))
    square_coral.save(os.path.join(ios_splash_dir, "splash-2732x2732.png"))
    square_ink = Image.new("RGBA", (2732, 2732), (0, 0, 0, 0))
    w, h = splash_ink.size
    square_ink.paste(splash_ink, ((2732 - w) // 2, (2732 - h) // 2))
    square_ink.save(os.path.join(ios_splash_dir, "splash-2732x2732-1.png"))
    print(f"  ✅ {ios_splash_dir} (coral light + ink dark)")

    # ── 5. Web assets ──────────────────────────────────────────────────────
    print("\n🌐 Web assets...")
    public = os.path.join(ROOT, "public")
    # PWA tile / icon
    shutil.copy2(ICON_MASTER, os.path.join(public, "kuula-tile-green-1024.png"))
    shutil.copy2(ICON_MASTER, os.path.join(public, "kuula-icon-1024.png"))
    resize(icon, 512).save(os.path.join(public, "kuula-icon-512.png"))
    resize(icon, 192).save(os.path.join(public, "kuula-icon-192.png"))
    resize(icon, 180).save(os.path.join(public, "apple-touch-icon.png"))
    # Favicon
    shutil.copy2(FAVICON, os.path.join(public, "favicon-256.png"))
    shutil.copy2(LOGO_LIGHT, os.path.join(public, "kuula-logo-light.png"))
    shutil.copy2(LOGO_DARK, os.path.join(public, "kuula-logo-dark.png"))
    # Copy to src/imports for in-app use via figma:asset/
    imports = os.path.join(ROOT, "src", "imports")
    ensure_dir(imports)
    shutil.copy2(ICON_MASTER, os.path.join(imports, "kuula-icon-1024.png"))
    print("  ✅ public/ + src/imports/ updated")

    # ── 6. Remove old placeholder assets ───────────────────────────────────
    print("\n🗑️  Removing old placeholders...")
    for old in ["icon-only.png", "splash.png", "splash-dark.png"]:
        old_path = os.path.join(ASSETS, old)
        if os.path.exists(old_path) and os.path.getsize(old_path) == 52366:  # old "K" files
            os.remove(old_path)
            print(f"  ✅ Removed old {old}")

    print("\n✅ All assets generated! Now update colors in code.")

if __name__ == "__main__":
    main()
