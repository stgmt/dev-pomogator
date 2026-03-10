#!/bin/bash
# Test Statusline Render Script
# Reads Claude Code JSON from stdin, finds session-specific YAML, renders status line
# FR-1: Statusline Render Script, FR-1a: Graceful Degradation, FR-5: Session Isolation

set -o pipefail

# Read JSON from stdin
input=$(cat)

# Extract session_id and cwd from JSON (jq with grep fallback)
if command -v jq &>/dev/null; then
  read -r SESSION_ID CWD <<< "$(jq -r '[.session_id // "", .cwd // "."] | @tsv' <<< "$input" 2>/dev/null)"
else
  # grep-based fallback for JSON parsing
  SESSION_ID=$(grep -o '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' <<< "$input" | head -1 | sed 's/.*"session_id"[[:space:]]*:[[:space:]]*"//;s/"//')
  CWD=$(grep -o '"cwd"[[:space:]]*:[[:space:]]*"[^"]*"' <<< "$input" | head -1 | sed 's/.*"cwd"[[:space:]]*:[[:space:]]*"//;s/"//')
fi

# Fallback CWD
[ -z "$CWD" ] && CWD="."

# Session prefix = first 8 characters
SESSION_PREFIX=""
if [ -n "$SESSION_ID" ]; then
  SESSION_PREFIX="${SESSION_ID:0:8}"
fi

# Find status file by session prefix
STATUS_FILE=""
if [ -n "$SESSION_PREFIX" ]; then
  STATUS_FILE="$CWD/.dev-pomogator/.test-status/status.${SESSION_PREFIX}.yaml"
fi

# No status file found — silent exit (FR-1a)
if [ -z "$STATUS_FILE" ] || [ ! -f "$STATUS_FILE" ]; then
  exit 0
fi

# Single-pass YAML parser (zero forks — reads file once, parses with bash builtins)
STATE="" TOTAL="" PASSED="" FAILED="" RUNNING="" PERCENT="" DURATION_MS="" ERROR_MSG=""
while IFS=': ' read -r key val; do
  val="${val//\"/}"
  val="${val//$'\r'/}"
  case "$key" in
    state) STATE="$val";;
    total) TOTAL="$val";;
    passed) PASSED="$val";;
    failed) FAILED="$val";;
    running) RUNNING="$val";;
    percent) PERCENT="$val";;
    duration_ms) DURATION_MS="$val";;
    error_message) ERROR_MSG="$val";;
  esac
done < "$STATUS_FILE"

# If no valid data, exit silently (FR-1a: corrupted YAML)
if [ -z "$STATE" ] || [ -z "$TOTAL" ]; then
  exit 0
fi

# Ensure numeric values default to 0
PASSED=${PASSED:-0}
FAILED=${FAILED:-0}
RUNNING=${RUNNING:-0}
PERCENT=${PERCENT:-0}
DURATION_MS=${DURATION_MS:-0}

# Stale check: if state=running and file older than 10 minutes, don't show (NFR-R3)
if [ "$STATE" = "running" ]; then
  # Try GNU stat, then BSD stat
  FILE_MTIME=$(stat -c %Y "$STATUS_FILE" 2>/dev/null || stat -f %m "$STATUS_FILE" 2>/dev/null)
  NOW=$(date +%s 2>/dev/null)
  if [ -n "$FILE_MTIME" ] && [ -n "$NOW" ]; then
    if [ $(( NOW - FILE_MTIME )) -gt 600 ]; then
      exit 0
    fi
  fi
fi

# Calculate duration in M:SS
if [ "$DURATION_MS" != "0" ]; then
  DURATION_S=$((DURATION_MS / 1000))
  DURATION_STR="$((DURATION_S / 60)):$(printf '%02d' "$((DURATION_S % 60))")"
else
  DURATION_STR="0:00"
fi

# Build unicode progress bar (10 chars)
# ▓ and ░ are 3 bytes each in UTF-8; bash substring works on bytes
FILLED=$((PERCENT * 10 / 100))
EMPTY=$((10 - FILLED))
BAR=""
for ((i=0; i<FILLED; i++)); do BAR+="▓"; done
for ((i=0; i<EMPTY; i++)); do BAR+="░"; done

# ANSI colors
GREEN='\033[32m'
RED='\033[31m'
YELLOW='\033[33m'
DIM='\033[2m'
RESET='\033[0m'

# Color threshold based on failed ratio
BAR_COLOR="$GREEN"
if [ "$TOTAL" -gt 0 ] && [ "$FAILED" -gt 0 ]; then
  FAIL_PCT=$((FAILED * 100 / TOTAL))
  if [ "$FAIL_PCT" -ge 10 ]; then
    BAR_COLOR="$RED"
  else
    BAR_COLOR="$YELLOW"
  fi
fi

# Render based on state (FR-1)
case "$STATE" in
  running)
    LINE="${BAR_COLOR}${PERCENT}%${RESET} [${BAR_COLOR}${BAR}${RESET}]"
    [ "$PASSED" -gt 0 ] && LINE="${LINE} ${PASSED}✅"
    [ "$FAILED" -gt 0 ] && LINE="${LINE} ${FAILED}❌"
    [ "$RUNNING" -gt 0 ] && LINE="${LINE} ${RUNNING}⏳"
    LINE="${LINE} ${DIM}${DURATION_STR}${RESET}"
    ;;
  passed|failed)
    if [ "$FAILED" -gt 0 ]; then
      LINE="❌ ${PASSED}/${TOTAL} ${DIM}(${FAILED} failed)${RESET} ${DIM}${DURATION_STR}${RESET}"
    else
      LINE="✅ ${PASSED}/${TOTAL} ${DIM}${DURATION_STR}${RESET}"
    fi
    ;;
  error)
    LINE="❌ ${RED}ERR${RESET} ${ERROR_MSG:-unknown error}"
    ;;
  idle|*)
    # idle or unknown state — silent exit
    exit 0
    ;;
esac

echo -e "$LINE"
