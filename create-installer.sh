#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_NAME="Vega"
VERSION="1.7.0"
VEGA_BIN="$SCRIPT_DIR/dist/executables/vega"
BUILD_DIR="$SCRIPT_DIR/dist/installer"
APP_PATH="$BUILD_DIR/$APP_NAME.app"
DMG_OUT="$SCRIPT_DIR/dist/${APP_NAME}-${VERSION}-macOS.dmg"

# ── Checks ────────────────────────────────────────────────────────────────────
if [ ! -f "$VEGA_BIN" ]; then
  echo "ERROR: Executable not found at $VEGA_BIN"
  echo "       Run 'npm run build:host' first."
  exit 1
fi

echo "Building $APP_NAME $VERSION installer..."

# ── Clean ─────────────────────────────────────────────────────────────────────
rm -rf "$BUILD_DIR"
mkdir -p "$APP_PATH/Contents/MacOS"
mkdir -p "$APP_PATH/Contents/Resources"

# ── Launcher script ───────────────────────────────────────────────────────────
cat > "$APP_PATH/Contents/MacOS/$APP_NAME" << 'LAUNCHER'
#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"

# If server already running, just open browser
if curl -s -o /dev/null -m 1 http://localhost:3000/ 2>/dev/null; then
  open http://localhost:3000
  exit 0
fi

# Kill anything else on 3000 and start fresh
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
"$DIR/vega-server" &

# Wait until the server responds (up to 10s)
for i in $(seq 1 20); do
  sleep 0.5
  if curl -s -o /dev/null -m 1 http://localhost:3000/ 2>/dev/null; then
    break
  fi
done

open http://localhost:3000
LAUNCHER
chmod +x "$APP_PATH/Contents/MacOS/$APP_NAME"

# ── Copy binary ───────────────────────────────────────────────────────────────
echo "Copying executable..."
cp "$VEGA_BIN" "$APP_PATH/Contents/MacOS/vega-server"
chmod +x "$APP_PATH/Contents/MacOS/vega-server"
xattr -d com.apple.quarantine "$APP_PATH/Contents/MacOS/vega-server" 2>/dev/null || true

# ── Generate .icns icon ───────────────────────────────────────────────────────
echo "Generating icon..."
ICONSET_DIR="$BUILD_DIR/AppIcon.iconset"
mkdir -p "$ICONSET_DIR"
TMP_PNG="/tmp/vega_icon_src.png"
ICON_OK=false

# Convert SVG → PNG via qlmanage (built-in macOS)
qlmanage -t -s 1024 -o /tmp/ "$SCRIPT_DIR/icon.svg" 2>/dev/null \
  && mv "/tmp/icon.svg.png" "$TMP_PNG" 2>/dev/null \
  && ICON_OK=true || true

if $ICON_OK; then
  for size in 16 32 128 256 512; do
    sips -z $size $size              "$TMP_PNG" --out "$ICONSET_DIR/icon_${size}x${size}.png"    >/dev/null
    sips -z $((size*2)) $((size*2))  "$TMP_PNG" --out "$ICONSET_DIR/icon_${size}x${size}@2x.png" >/dev/null
  done
  iconutil -c icns "$ICONSET_DIR" -o "$APP_PATH/Contents/Resources/AppIcon.icns"
  echo "  Icon created."
else
  echo "  Icon skipped (qlmanage could not convert SVG — app will use default icon)."
fi
rm -rf "$ICONSET_DIR" "$TMP_PNG" 2>/dev/null || true

# ── Info.plist ────────────────────────────────────────────────────────────────
cat > "$APP_PATH/Contents/Info.plist" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>${APP_NAME}</string>
    <key>CFBundleIdentifier</key>
    <string>com.vega.productivity</string>
    <key>CFBundleName</key>
    <string>${APP_NAME}</string>
    <key>CFBundleDisplayName</key>
    <string>${APP_NAME}</string>
    <key>CFBundleVersion</key>
    <string>${VERSION}</string>
    <key>CFBundleShortVersionString</key>
    <string>${VERSION}</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>LSApplicationCategoryType</key>
    <string>public.app-category.productivity</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.13</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>NSSupportsAutomaticGraphicsSwitching</key>
    <true/>
    <key>NSAppTransportSecurity</key>
    <dict>
        <key>NSAllowsLocalNetworking</key>
        <true/>
    </dict>
</dict>
</plist>
PLIST

# ── Create DMG ────────────────────────────────────────────────────────────────
echo "Creating DMG..."
STAGING="$BUILD_DIR/dmg-staging"
mkdir -p "$STAGING"
cp -r "$APP_PATH" "$STAGING/"
ln -sf /Applications "$STAGING/Applications"

rm -f "$DMG_OUT"
hdiutil create \
  -volname "$APP_NAME $VERSION" \
  -srcfolder "$STAGING" \
  -ov -format UDZO \
  "$DMG_OUT" >/dev/null

rm -rf "$STAGING"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "✓ Done!"
echo ""
echo "  App bundle : $APP_PATH"
echo "  DMG        : $DMG_OUT"
echo ""
echo "To install: open the DMG and drag Vega → Applications."
echo "To run    : open -a Vega   (or double-click from Applications)"
echo ""
