#!/usr/bin/env bash
# Stop hook: blocks Claude from stopping when background task is active.
# stdin: JSON with session info from Claude Code
# No `set -euo pipefail` — intentional. This script MUST fail-open (FR-4).
# set -e would cause early exit on intermediate errors, breaking the fail-open contract.

MARKER=".dev-pomogator/.bg-task-active"

# No marker → allow stop
if [ ! -f "$MARKER" ]; then
  exit 0
fi

# Check marker age (TTL 15 minutes = 900 seconds)
if command -v stat >/dev/null 2>&1; then
  # Cross-platform mtime: GNU stat vs BSD stat
  if stat --version >/dev/null 2>&1; then
    # GNU (Linux/Git Bash on Windows)
    MTIME=$(stat -c %Y "$MARKER" 2>/dev/null || echo 0)
  else
    # BSD (macOS)
    MTIME=$(stat -f %m "$MARKER" 2>/dev/null || echo 0)
  fi

  NOW=$(date +%s)
  AGE=$(( NOW - MTIME ))
  AGE_MIN=$(( AGE / 60 ))

  if [ "$AGE" -ge 900 ]; then
    # Stale marker — delete and allow stop
    rm -f "$MARKER"
    exit 0
  fi

  # Active marker — block stop
  printf '{"decision":"block","reason":"Background task running (%dmin ago). Continue working or wait for task-notification."}\n' "$AGE_MIN"
  exit 0
fi

# stat not available — fail-open
exit 0
