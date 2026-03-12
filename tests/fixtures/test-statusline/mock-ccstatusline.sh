#!/usr/bin/env bash
# Mock ccstatusline fixture — simulates realistic multi-line ANSI output
# Usage: bash mock-ccstatusline.sh [--mode normal|multiline|slow|fail|empty]
# Reads JSON from stdin (same format as Claude Code StatusJSON)

set -euo pipefail

MODE="${1:-normal}"
# Strip leading -- if present (e.g., --mode → mode)
MODE="${MODE#--mode }"
MODE="${MODE#--}"

# Read stdin (discard — we only care about modes for testing)
cat > /dev/null 2>&1 || true

case "$MODE" in
  normal)
    # Single-line output like ccstatusline with minimal config
    printf '\033[0m\033[36mOpus\033[0m \033[33mmain\033[0m $0.05 3m'
    ;;
  multiline)
    # Multi-line output like ccstatusline with full config (2 status lines)
    printf '\033[0m\033[36mOpus\033[0m \033[33mmain\033[0m +42 -10 150k/200k 75%%\n'
    printf '\033[0mSession: 3m Cost: $0.12 Block: 3h45m'
    ;;
  slow)
    # Simulate npm registry delay (exceeds wrapper's 2s timeout)
    sleep 10
    printf 'should never appear'
    ;;
  fail)
    # Simulate crash / non-zero exit
    exit 1
    ;;
  empty)
    # Simulate no output (e.g., ccstatusline with empty config)
    ;;
  *)
    echo "Unknown mode: $MODE" >&2
    exit 2
    ;;
esac
