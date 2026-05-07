#!/bin/bash
# Запуск GUI стека: D-Bus → Xvfb → gsettings → Mutter → tint2 → x11vnc → noVNC
# Доступ: http://localhost:6080
set -e

# Игнорировать SIGHUP — devcontainer postStartCommand посылает HUP дочерним процессам при выходе
trap '' HUP

DISPLAY_NUM="${DISPLAY_NUM:-1}"
export DISPLAY=":${DISPLAY_NUM}"
WIDTH="${WIDTH:-1280}"
HEIGHT="${HEIGHT:-800}"

# Force X11: убрать Wayland чтобы браузеры не убегали на хост
unset WAYLAND_DISPLAY
unset XDG_SESSION_TYPE
export GDK_BACKEND=x11
export MOZ_ENABLE_WAYLAND=0

echo "Запуск GUI (Mutter + tint2 + x11vnc + noVNC)..."

# Убить предыдущие процессы
pkill -f "Xvfb :${DISPLAY_NUM}" 2>/dev/null || true
pkill -f "x11vnc" 2>/dev/null || true
pkill -f "novnc_proxy" 2>/dev/null || true
pkill -f "mutter" 2>/dev/null || true
pkill -f "tint2" 2>/dev/null || true
sleep 0.5

# Удалить stale lock файлы от предыдущего Xvfb (остаются после docker stop/start)
rm -f "/tmp/.X${DISPLAY_NUM}-lock" "/tmp/.X11-unix/X${DISPLAY_NUM}"

# 1. D-Bus session bus (ПЕРВЫМ — нужен для AT-SPI2 и gsettings)
eval $(dbus-launch --sh-syntax)
if [ -z "${DBUS_SESSION_BUS_ADDRESS:-}" ]; then
    echo "ERROR: D-Bus session bus failed to start" >&2
    exit 1
fi
export DBUS_SESSION_BUS_ADDRESS
echo "$DBUS_SESSION_BUS_ADDRESS" > /tmp/dbus-session-address

# 1.5. AT-SPI2 registryd (нужен для oculos MCP)
/usr/libexec/at-spi2-registryd 2>/dev/null &
sleep 0.3

# 2. Xvfb — виртуальный X11 дисплей
Xvfb "$DISPLAY" -ac -screen 0 "${WIDTH}x${HEIGHT}x24" -dpi 96 \
    -nolisten tcp -nolisten unix &
XVFB_PID=$!
sleep 1

if ! kill -0 "$XVFB_PID" 2>/dev/null; then
    echo "ERROR: Xvfb не запустился на дисплее $DISPLAY" >&2
    exit 1
fi

# 3. gsettings — включить accessibility ДО запуска приложений
gsettings set org.gnome.desktop.interface toolkit-accessibility true

# 4. Mutter — window manager (X11 mode)
XDG_SESSION_TYPE=x11 mutter --replace --sm-disable 2>/tmp/mutter.log &
sleep 1

# 5. tint2 — taskbar
tint2 2>/tmp/tint2.log &
sleep 0.5

# 6. x11vnc — трансляция дисплея по VNC
x11vnc -display "$DISPLAY" -forever -shared -wait 50 -rfbport 5900 -nopw -xkb \
    2>/tmp/x11vnc.log &
sleep 0.5

# 7. noVNC — браузерный VNC клиент (порт 6080)
/usr/share/novnc/utils/novnc_proxy \
    --vnc localhost:5900 \
    --listen 6080 \
    2>/tmp/novnc.log &

echo "GUI запущен!"
echo "   Браузер: http://localhost:6080"
echo "   VNC:     localhost:5900"
echo "   Разрешение: ${WIDTH}x${HEIGHT}"
