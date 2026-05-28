#!/usr/bin/env bash
# Bring up the proxy (build on first run, then cached).
set -euo pipefail
cd "$(dirname "$0")/.."

# Stop any host-running meridian (npm-installed) on the same port.
if command -v lsof >/dev/null 2>&1; then
  pid="$(lsof -ti :3456 || true)"
  if [ -n "${pid:-}" ]; then
    echo "Stopping host process on :3456 (pid $pid)"
    kill -9 "$pid" || true
    sleep 1
  fi
fi

docker compose up -d --build
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
