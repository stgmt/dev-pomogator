#!/usr/bin/env bash
# Session Pilot launcher installer — Linux + macOS.
#
# Per FR-23 / AC-23 (.specs/session-pilot/FR.md). Creates a "pin-able" launcher
# entry pointing at the dashboard URL in standalone-app mode.
#
# Linux: creates ~/.local/share/applications/session-pilot.desktop (XDG Desktop
# Entry). User can pin to dock/taskbar via desktop environment (GNOME: drag to
# Favourites; KDE: right-click → "Pin to Task Manager"; XFCE: drag to panel).
#
# macOS: creates ~/Applications/Session Pilot.app (minimal .app bundle) which
# Dock pins natively via drag-to-Dock.
#
# Browser: Chrome/Edge --app=URL flag (standalone window, no chrome). Falls back
# to default browser if neither found.

set -euo pipefail

PORT="${WT_DASHBOARD_PORT:-8083}"
URL="http://127.0.0.1:${PORT}/"

# OS detection — same convention as terminal_launcher.py
case "$(uname -s)" in
  Linux*)   OS=linux ;;
  Darwin*)  OS=darwin ;;
  *)        echo "Unsupported OS: $(uname -s). Use create-launcher.ps1 on Windows."; exit 1 ;;
esac

# Locate Chromium-family browser
find_browser() {
  for cand in google-chrome chromium chromium-browser microsoft-edge brave-browser; do
    if command -v "$cand" >/dev/null 2>&1; then echo "$cand"; return 0; fi
  done
  # macOS app bundles
  if [ "$OS" = darwin ]; then
    for app in "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
               "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
               "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"; do
      if [ -x "$app" ]; then echo "$app"; return 0; fi
    done
  fi
  return 1
}

BROWSER="$(find_browser)" || {
  echo "ERROR: Chrome/Edge/Brave not found. Install one of them for --app standalone mode."
  echo "Fallback: just bookmark $URL in your default browser."
  exit 1
}

PROFILE_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/session-pilot/browser-profile"
mkdir -p "$PROFILE_DIR"

if [ "$OS" = linux ]; then
  # XDG Desktop Entry
  APPS_DIR="$HOME/.local/share/applications"
  mkdir -p "$APPS_DIR"
  DESKTOP_FILE="$APPS_DIR/session-pilot.desktop"

  cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=Session Pilot
GenericName=Worktree Dashboard
Comment=Multi-worktree Claude Code session dashboard at $URL
Exec="$BROWSER" --app=$URL --user-data-dir="$PROFILE_DIR" %U
Icon=internet-services-symbolic
Terminal=false
Categories=Development;Utility;
StartupWMClass=session-pilot
EOF

  chmod +x "$DESKTOP_FILE"
  # Update desktop database so DE picks up immediately
  if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$APPS_DIR" 2>/dev/null || true
  fi

  echo "✅ Created: $DESKTOP_FILE"
  echo "   Browser: $BROWSER --app=$URL"
  echo ""
  echo "Pin to dock/taskbar (per desktop environment):"
  echo "  GNOME:  Activities → search 'Session Pilot' → right-click → 'Add to Favourites'"
  echo "  KDE:    Application menu → 'Session Pilot' → right-click → 'Pin to Task Manager'"
  echo "  XFCE:   Drag .desktop file from $APPS_DIR to panel"

elif [ "$OS" = darwin ]; then
  # macOS minimal .app bundle
  APP_DIR="$HOME/Applications/Session Pilot.app"
  CONTENTS="$APP_DIR/Contents"
  MACOS_DIR="$CONTENTS/MacOS"
  RES_DIR="$CONTENTS/Resources"

  mkdir -p "$MACOS_DIR" "$RES_DIR"

  cat > "$CONTENTS/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key><string>launcher</string>
  <key>CFBundleIdentifier</key><string>com.session-pilot.launcher</string>
  <key>CFBundleName</key><string>Session Pilot</string>
  <key>CFBundleDisplayName</key><string>Session Pilot</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleVersion</key><string>0.4.0</string>
  <key>CFBundleShortVersionString</key><string>0.4</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
EOF

  cat > "$MACOS_DIR/launcher" <<EOF
#!/usr/bin/env bash
exec "$BROWSER" --app=$URL --user-data-dir="$PROFILE_DIR"
EOF
  chmod +x "$MACOS_DIR/launcher"

  echo "✅ Created: $APP_DIR"
  echo "   Browser: $BROWSER --app=$URL"
  echo ""
  echo "Pin to Dock:"
  echo "  1. Open Finder → ~/Applications"
  echo "  2. Drag 'Session Pilot.app' to Dock"
  echo "  3. (Optional) Right-click on Dock icon → Options → Keep in Dock"
fi

exit 0
