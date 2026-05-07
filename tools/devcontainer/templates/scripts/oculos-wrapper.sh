#!/bin/bash
# Wrapper for oculos: resolves AT-SPI2 a11y bus address, then starts oculos
# OculOS uses Connection::session() which reads DBUS_SESSION_BUS_ADDRESS,
# but AT-SPI2 registry lives on a separate accessibility bus.
# Fix: resolve a11y bus address and pass it as DBUS_SESSION_BUS_ADDRESS.
# Logs to stderr only (stdout is MCP stdio protocol)

DBUS_FILE="/tmp/dbus-session-address"
TIMEOUT=30
INTERVAL=1

# Step 1: Get session bus address
if [ -f "$DBUS_FILE" ]; then
    SESSION_BUS=$(cat "$DBUS_FILE")
fi

# Wait for D-Bus if not ready yet
if [ -z "${SESSION_BUS:-}" ]; then
    echo "[oculos-wrapper] Waiting for D-Bus (${TIMEOUT}s timeout)..." >&2
    elapsed=0
    while [ $elapsed -lt $TIMEOUT ]; do
        if [ -f "$DBUS_FILE" ]; then
            SESSION_BUS=$(cat "$DBUS_FILE")
            echo "[oculos-wrapper] D-Bus found after ${elapsed}s" >&2
            break
        fi
        sleep $INTERVAL
        elapsed=$((elapsed + INTERVAL))
    done
fi

if [ -z "${SESSION_BUS:-}" ]; then
    echo "[oculos-wrapper] ERROR: D-Bus not available after ${TIMEOUT}s. Is start-gui.sh running?" >&2
    exit 1
fi

export DISPLAY="${DISPLAY:-:1}"

# Step 2: Resolve AT-SPI2 accessibility bus address via org.a11y.Bus
A11Y_BUS=$(DBUS_SESSION_BUS_ADDRESS="$SESSION_BUS" gdbus call --session \
    --dest=org.a11y.Bus \
    --object-path=/org/a11y/bus \
    --method=org.a11y.Bus.GetAddress 2>/dev/null \
    | grep -oP "unix:path=[^',)]+")

if [ -n "$A11Y_BUS" ]; then
    echo "[oculos-wrapper] Resolved AT-SPI2 a11y bus: $A11Y_BUS" >&2
    export DBUS_SESSION_BUS_ADDRESS="$A11Y_BUS"
else
    echo "[oculos-wrapper] WARNING: Could not resolve a11y bus, falling back to session bus" >&2
    export DBUS_SESSION_BUS_ADDRESS="$SESSION_BUS"
fi

# Patched oculos binary (built from fork with AT-SPI2 fixes in Dockerfile)
exec /home/vscode/.cargo/bin/oculos "$@"
