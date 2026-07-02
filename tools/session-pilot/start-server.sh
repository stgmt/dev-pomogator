#!/usr/bin/env bash
# Session Pilot — Linux/macOS twin of start-server.ps1.
#
# Idempotent autostart for the Python dashboard. Each invocation:
#   1. Read PID file at $STATE_DIR/server.pid
#   2. If that PID is alive AND is our python server → exit 0 silently
#   3. Otherwise spawn detached `python3 server.py`, write the new PID, exit 0
#
# This is the file the session-pilot skill (Scenario 1) and the SessionStart
# autostart hook invoke on non-Windows machines. Its absence is why the skill's
# "проверь dashboard работает" flow used to fail on every OS
# (see audit-reports/session-pilot-durability-2026-07-02.md, delivery path #3/#4).
#
# Per FR-13 / FR-15 (.specs/session-pilot/FR.md) — v0.4 cross-platform de-pivot.
# Health probe is intentionally NOT done here (keeps SessionStart latency low —
# install.sh does the probe); this only guarantees the process is spawned.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_PY="$HERE/server.py"

# State dir: XDG state on Linux, ~/Library on macOS-ish fallback. Holds pid + logs.
STATE_DIR="${SP_STATE_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/session-pilot}"
mkdir -p "$STATE_DIR"
PID_FILE="$STATE_DIR/server.pid"
LOG_FILE="$STATE_DIR/server.log"
ERR_FILE="$STATE_DIR/server.log.err"
LAUNCHER_LOG="$STATE_DIR/launcher.log"

# Launcher-level breadcrumb — records WHAT the launcher did, so a silent failure
# leaves a trace (server.log only ever holds the server's own stdout). See Fix C
# in the durability audit.
log() { printf '[%s] start-server.sh: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >> "$LAUNCHER_LOG" 2>/dev/null || true; }

# Opt-out (mirrors the autostart hook). Set SP_NO_AUTOSTART=1 to disable.
case "${SP_NO_AUTOSTART:-}" in
  1|true|yes|on) log "SP_NO_AUTOSTART set — skipping"; exit 0 ;;
esac

if [ ! -f "$SERVER_PY" ]; then
  log "server.py not found at $SERVER_PY — abort"
  echo "server.py not found at $SERVER_PY" >&2
  exit 1
fi

# Idempotency: alive PID that is our server → quiet exit.
if [ -f "$PID_FILE" ]; then
  existing_pid="$(head -n1 "$PID_FILE" 2>/dev/null || true)"
  if [[ "$existing_pid" =~ ^[0-9]+$ ]] && kill -0 "$existing_pid" 2>/dev/null; then
    # Confirm it's a python process (avoid PID reuse false-positives).
    if ps -p "$existing_pid" -o comm= 2>/dev/null | grep -qi python; then
      log "already running (pid $existing_pid) — quiet exit"
      exit 0
    fi
  fi
  rm -f "$PID_FILE" 2>/dev/null || true
fi

# Locate python3.
PYTHON=""
for cand in python3 python; do
  if command -v "$cand" >/dev/null 2>&1; then PYTHON="$cand"; break; fi
done
if [ -z "$PYTHON" ]; then
  log "python3 not found on PATH — abort"
  echo "python3 not found on PATH" >&2
  exit 1
fi
log "spawning: $PYTHON $SERVER_PY (bind ${WT_DASHBOARD_BIND:-127.0.0.1}:${WT_DASHBOARD_PORT:-8083})"

# Spawn detached. setsid (Linux) detaches from the controlling terminal;
# fall back to plain background + disown on systems without setsid (macOS).
if command -v setsid >/dev/null 2>&1; then
  setsid "$PYTHON" "$SERVER_PY" >"$LOG_FILE" 2>"$ERR_FILE" < /dev/null &
else
  "$PYTHON" "$SERVER_PY" >"$LOG_FILE" 2>"$ERR_FILE" < /dev/null &
  disown 2>/dev/null || true
fi
new_pid=$!
echo "$new_pid" > "$PID_FILE"
log "spawned pid $new_pid"
exit 0
