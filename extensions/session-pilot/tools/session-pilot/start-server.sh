#!/bin/bash
# session-pilot dashboard — idempotent autostart.
#
# Behavior (FR-13, AC-13):
#   - If server already running (PID file + kill -0 alive) → exit 0 silently
#   - Otherwise spawn detached via setsid + nohup, write PID file
#
# Used by extension.json hooks.claude.SessionStart so every Claude Code
# session start ensures dashboard is up without duplicate spawns.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_PY="$SCRIPT_DIR/server.py"
PIDFILE="${SP_PIDFILE:-/tmp/worktree-dashboard.pid}"
LOGFILE="${SP_LOGFILE:-/tmp/worktree-dashboard.log}"
PORT="${WT_DASHBOARD_PORT:-8083}"

# Idempotent: alive → exit 0 (do NOT kill — preserves in-flight requests + state)
if [ -f "$PIDFILE" ]; then
  PID=$(cat "$PIDFILE" 2>/dev/null || true)
  if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
    echo "session-pilot already running (PID $PID, port $PORT)"
    exit 0
  fi
  # Stale PID file — clean up
  rm -f "$PIDFILE"
fi

# Verify server.py exists (regression guard for filename rename)
if [ ! -f "$SERVER_PY" ]; then
  echo "ERROR: $SERVER_PY not found — extension layout broken" >&2
  exit 1
fi

# Install zclaude helper to ~/.local/bin (idempotent: skip if identical content already there)
mkdir -p "$HOME/.local/bin"
if ! cmp -s "$SCRIPT_DIR/zclaude" "$HOME/.local/bin/zclaude" 2>/dev/null; then
  cp "$SCRIPT_DIR/zclaude" "$HOME/.local/bin/zclaude"
  chmod +x "$HOME/.local/bin/zclaude"
fi

# Spawn detached so this script returns immediately (SessionStart hook latency budget)
setsid nohup python3 "$SERVER_PY" >"$LOGFILE" 2>&1 </dev/null &
NEW_PID=$!
echo "$NEW_PID" > "$PIDFILE"
disown 2>/dev/null || true

# Brief health check — server should bind within 2s
for i in 1 2 3 4 5 6 7 8; do
  if kill -0 "$NEW_PID" 2>/dev/null; then
    if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
      echo "session-pilot started (PID $NEW_PID, port $PORT, log $LOGFILE)"
      exit 0
    fi
  else
    echo "ERROR: server PID $NEW_PID died during startup; log:" >&2
    tail -20 "$LOGFILE" >&2 || true
    exit 1
  fi
  sleep 0.25
done

# Process alive but /api/health not responding yet — not necessarily fatal
echo "session-pilot spawned (PID $NEW_PID, port $PORT) — health probe not yet responding; check $LOGFILE"
