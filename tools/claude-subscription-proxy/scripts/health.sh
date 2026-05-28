#!/usr/bin/env bash
set -euo pipefail
if curl -sf http://127.0.0.1:3456/health; then
  echo
  exit 0
fi
echo "Proxy unhealthy" >&2
exit 1
