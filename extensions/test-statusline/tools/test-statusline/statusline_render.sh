#!/bin/bash
# Test Statusline Render Script
# Reads Claude Code JSON from stdin, finds session-specific YAML, renders status line
# Works on Windows (Git Bash) and Linux/macOS

# Read JSON from stdin
input=$(cat)

# Extract session_id and cwd from Claude Code JSON
SESSION_ID=$(echo "$input" | jq -r '.session_id // ""')
CWD=$(echo "$input" | jq -r '.cwd // "."')

# Fallback: if no session_id, try to find any status file
STATUS_FILE=""
if [ -n "$SESSION_ID" ] && [ -f "$CWD/logs/.test-status.$SESSION_ID.yaml" ]; then
  STATUS_FILE="$CWD/logs/.test-status.$SESSION_ID.yaml"
elif [ -n "$SESSION_ID" ] && [ -f "logs/.test-status.$SESSION_ID.yaml" ]; then
  STATUS_FILE="logs/.test-status.$SESSION_ID.yaml"
else
  # Find most recent status file
  LATEST=$(ls -t logs/.test-status.*.yaml 2>/dev/null | head -1)
  if [ -z "$LATEST" ]; then
    LATEST=$(ls -t "$CWD/logs/.test-status.*.yaml" 2>/dev/null | head -1)
  fi
  STATUS_FILE="$LATEST"
fi

# No status file found — idle
if [ -z "$STATUS_FILE" ] || [ ! -f "$STATUS_FILE" ]; then
  exit 0
fi

# Simple YAML parser (no dependencies beyond grep/sed)
get_yaml() {
  grep "^$1:" "$STATUS_FILE" 2>/dev/null | sed "s/^$1: *//" | sed 's/"//g' | tr -d '\r'
}

STATUS=$(get_yaml "status")
TOTAL=$(get_yaml "total")
PASSED=$(get_yaml "passed")
FAILED=$(get_yaml "failed")
RUNNING=$(get_yaml "running")
PERCENT=$(get_yaml "percent")
DURATION_MS=$(get_yaml "duration_ms")

# If no data, exit silently
if [ -z "$TOTAL" ] || [ "$TOTAL" = "0" ]; then
  exit 0
fi

# Calculate duration in M:SS
if [ -n "$DURATION_MS" ] && [ "$DURATION_MS" != "0" ]; then
  DURATION_S=$((DURATION_MS / 1000))
  MINS=$((DURATION_S / 60))
  SECS=$((DURATION_S % 60))
  DURATION_STR="${MINS}:$(printf '%02d' $SECS)"
else
  DURATION_STR="0:00"
fi

# Build progress bar (10 chars)
BAR_WIDTH=10
FILLED=$((PERCENT * BAR_WIDTH / 100))
EMPTY=$((BAR_WIDTH - FILLED))
BAR=""
[ "$FILLED" -gt 0 ] && BAR=$(printf "%${FILLED}s" | tr ' ' '#')
[ "$EMPTY" -gt 0 ] && BAR="${BAR}$(printf "%${EMPTY}s" | tr ' ' '-')"

# ANSI colors
GREEN='\033[32m'
RED='\033[31m'
YELLOW='\033[33m'
RESET='\033[0m'

# Render based on status
case "$STATUS" in
  running)
    LINE="${YELLOW}T${RESET} ${PERCENT}% [${BAR}]"
    [ "$PASSED" -gt 0 ] && LINE="${LINE} ${GREEN}${PASSED}ok${RESET}"
    [ "$FAILED" -gt 0 ] && LINE="${LINE} ${RED}${FAILED}fail${RESET}"
    [ "$RUNNING" -gt 0 ] && LINE="${LINE} ${YELLOW}${RUNNING}run${RESET}"
    LINE="${LINE} | ${DURATION_STR}"
    ;;
  completed)
    if [ "$FAILED" -gt 0 ]; then
      LINE="${RED}T fail${RESET} ${PASSED}/${TOTAL} (${FAILED} failed) | ${DURATION_STR}"
    else
      LINE="${GREEN}T pass${RESET} ${PASSED}/${TOTAL} | ${DURATION_STR}"
    fi
    ;;
  failed)
    LINE="${RED}T ERR${RESET} ${PASSED}/${TOTAL} (${FAILED} failed) | ${DURATION_STR}"
    ;;
  *)
    LINE="T ${STATUS}"
    ;;
esac

echo -e "$LINE"
