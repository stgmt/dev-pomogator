#!/usr/bin/env bash
# Session Pilot — Linux/macOS install (twin of install.ps1).
#
# Idempotent setup:
#   1. Verify python3 >= 3.10
#   2. Deps: none (stdlib only)
#   3. Start the dashboard server (start-server.sh)
#   4. Probe /api/health
#   5. Create a dock/taskbar launcher (create-launcher.sh)
#
# NOTE: On a machine that has the dev-pomogator plugin installed, the dashboard
# autostarts on every Claude Code SessionStart via the plugin hook
# (tools/session-pilot/autostart_hook.ts) — you do NOT need to run this. This
# script is for a bare checkout without the plugin, or to (re)create the launcher.
#
# Per FR-15 / AC-15 (.specs/session-pilot/FR.md) — v0.4 cross-platform de-pivot.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

step() { printf '\033[36m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[32m[OK] %s\033[0m\n' "$*"; }
warn() { printf '\033[33m[!!] %s\033[0m\n' "$*"; }

# -- Step 1: python3 >= 3.10 ---------------------------------------------------
step "Checking python3 >= 3.10"
PYTHON=""
for cand in python3 python; do
  if command -v "$cand" >/dev/null 2>&1; then PYTHON="$cand"; break; fi
done
[ -n "$PYTHON" ] || { echo "python3 not found on PATH. Install Python >= 3.10." >&2; exit 1; }
"$PYTHON" - <<'PY'
import sys
sys.exit(0 if sys.version_info >= (3, 10) else 1)
PY
if [ $? -ne 0 ]; then echo "python >= 3.10 required." >&2; exit 1; fi
ok "$($PYTHON --version 2>&1)"

# -- Step 2: deps (none) -------------------------------------------------------
step "Python deps (stdlib only)"; ok "skipped"

# -- Step 3: start server ------------------------------------------------------
step "Starting dashboard server"
bash "$HERE/start-server.sh"

# -- Step 4: probe /api/health -------------------------------------------------
step "Probing /api/health"
PORT="${WT_DASHBOARD_PORT:-8083}"
healthy=0
for _ in $(seq 1 15); do
  if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then healthy=1; break; fi
  sleep 0.3
done
STATE_DIR="${SP_STATE_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/session-pilot}"
if [ "$healthy" != "1" ]; then
  warn "Server did not become healthy. Check $STATE_DIR/server.log(.err) and $STATE_DIR/launcher.log"
  exit 1
fi
ok "Server alive: http://127.0.0.1:${PORT}"

# -- Step 5: launcher (best-effort) --------------------------------------------
step "Creating dock/taskbar launcher"
if [ -f "$HERE/create-launcher.sh" ]; then
  bash "$HERE/create-launcher.sh" || warn "create-launcher.sh failed — run it manually"
else
  warn "create-launcher.sh not found — skipping launcher"
fi

echo ""
ok "Session Pilot installed. Dashboard: http://127.0.0.1:${PORT}"
echo "Server log:   $STATE_DIR/server.log"
echo "Launcher log: $STATE_DIR/launcher.log"
