#!/bin/bash
# Обёртка Firefox: stealth profile + X11 + D-Bus по умолчанию
# Подменяет /usr/bin/firefox-esr через /usr/local/bin/firefox-esr

REAL_FIREFOX="/usr/bin/firefox-esr.real"

# GUI environment
export DISPLAY="${DISPLAY:-:1}"
export GDK_BACKEND=x11
export MOZ_ENABLE_WAYLAND=0
unset WAYLAND_DISPLAY
unset XDG_SESSION_TYPE

# D-Bus
if [ -z "${DBUS_SESSION_BUS_ADDRESS:-}" ] && [ -f /tmp/dbus-session-address ]; then
    export DBUS_SESSION_BUS_ADDRESS="$(cat /tmp/dbus-session-address)"
fi

# Stealth profile
PROFILE="/tmp/firefox-stealth"
if [ ! -f "$PROFILE/user.js" ]; then
    bash "/workspaces/dev-pomogator/.devcontainer/scripts/create-stealth-profile.sh" 2>/dev/null
fi

# Если уже передан --profile — не подменяем
if echo "$@" | grep -q -- "--profile"; then
    exec "$REAL_FIREFOX" "$@"
else
    exec "$REAL_FIREFOX" --profile "$PROFILE" --no-remote "$@"
fi
