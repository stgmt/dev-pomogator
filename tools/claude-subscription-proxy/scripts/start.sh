#!/usr/bin/env bash
# Bring up the proxy (build on first run, then cached).
set -euo pipefail
cd "$(dirname "$0")/.."

# Reuse the existing host Claude login: mount the host's .claude into the container.
export CLAUDE_CREDS_DIR="${CLAUDE_CREDS_DIR:-$HOME/.claude}"
if [ ! -f "$CLAUDE_CREDS_DIR/.credentials.json" ]; then
  echo "WARN: $CLAUDE_CREDS_DIR/.credentials.json not found — the proxy needs a Claude login."
  echo "      Run 'claude login' once on this host, then re-run this script."
fi

# Stop any host-running meridian (npm-installed) on the same port.
if command -v lsof >/dev/null 2>&1; then
  pid="$(lsof -ti :3456 || true)"
  if [ -n "${pid:-}" ]; then
    echo "Stopping host process on :3456 (pid $pid)"
    kill -9 "$pid" || true
    sleep 1
  fi
fi

# A pinned container_name means `up` errors with a name conflict if a stopped container
# already exists (created under a different compose project / CWD). Reuse it via `docker
# start` (fast, no rebuild/downtime — the container is stateless, creds are mounted); only
# build+create when none exists. Handles fresh / stopped / running uniformly, no conflict.
if docker start claude-proxy-meridian >/dev/null 2>&1; then
  echo "Reusing existing container (docker start)."
else
  docker compose up -d --build
fi
echo
echo "Waiting for /health..."
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:3456/health >/dev/null 2>&1; then
    echo "OK — proxy is up"
    curl -s http://127.0.0.1:3456/health
    exit 0
  fi
  sleep 1
done
echo "Proxy did not become healthy within 30s. Check: docker compose logs meridian" >&2
exit 1
