#!/bin/bash
# Test Statusline Render Script
# Reads Claude Code JSON from stdin, finds session-specific canonical v2 YAML, renders status line.
# Reads only flat top-level session summary fields from the v2 payload.

set -o pipefail

input=$(cat)

if command -v jq &>/dev/null; then
  read -r SESSION_ID CWD <<< "$(jq -r '[.session_id // "", .cwd // "."] | @tsv' <<< "$input" 2>/dev/null)"
else
  SESSION_ID=$(grep -o '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' <<< "$input" | head -1 | sed 's/.*"session_id"[[:space:]]*:[[:space:]]*"//;s/"//')
  CWD=$(grep -o '"cwd"[[:space:]]*:[[:space:]]*"[^"]*"' <<< "$input" | head -1 | sed 's/.*"cwd"[[:space:]]*:[[:space:]]*"//;s/"//')
fi

[ -z "$SESSION_ID" ] && SESSION_ID="${TEST_STATUSLINE_SESSION:-}"
[ -z "$CWD" ] && CWD="${TEST_STATUSLINE_PROJECT:-.}"

SESSION_PREFIX=""
if [ -n "$SESSION_ID" ]; then
  if [ "${#SESSION_ID}" -gt 8 ]; then
    SESSION_PREFIX="${SESSION_ID:0:8}"
  else
    SESSION_PREFIX="$SESSION_ID"
  fi
fi

STATUS_FILE=""
if [ -n "$SESSION_PREFIX" ]; then
  STATUS_FILE="$CWD/.dev-pomogator/.test-status/status.${SESSION_PREFIX}.yaml"
fi

if [ -z "$STATUS_FILE" ] || [ ! -f "$STATUS_FILE" ]; then
  exit 0
fi

rewrite_dead_running_state() {
  local pid="$1"
  local message="Process died unexpectedly (PID: $pid)"
  local updated_at
  local tmp_file

  updated_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "unknown")
  tmp_file="${STATUS_FILE}.tmp.$$"

  if sed \
    -e 's/^state: .*/state: failed/' \
    -e 's/^running: .*/running: 0/' \
    -e 's/^percent: .*/percent: 100/' \
    -e "s|^error_message: .*|error_message: \"${message}\"|" \
    -e "s|^updated_at: .*|updated_at: \"${updated_at}\"|" \
    "$STATUS_FILE" > "$tmp_file" 2>/dev/null; then
    mv -f "$tmp_file" "$STATUS_FILE" 2>/dev/null || rm -f "$tmp_file" 2>/dev/null
  else
    rm -f "$tmp_file" 2>/dev/null
  fi

  STATE="failed"
  RUNNING=0
  PERCENT=100
  ERROR_MSG="$message"
}

trim_scalar() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

strip_yaml_quotes() {
  local value
  value="$(trim_scalar "$1")"

  if [[ "$value" == \"*\" && "$value" == *\" ]]; then
    value="${value:1:${#value}-2}"
    value="${value//\\\"/\"}"
  elif [[ "$value" == "'"* && "$value" == *"'" ]]; then
    value="${value:1:${#value}-2}"
    value="${value//\'\'/\'}"
  fi

  printf '%s' "$value"
}

VERSION="" STATE="" PID="" TOTAL="" PASSED="" FAILED="" RUNNING="" PERCENT="" DURATION_MS="" ERROR_MSG=""
while IFS= read -r line || [ -n "$line" ]; do
  line="${line%$'\r'}"
  case "$line" in
    ''|' '*|'- '*)
      continue
      ;;
    suites:|phases:)
      break
      ;;
    *:*)
      key="${line%%:*}"
      val="$(strip_yaml_quotes "${line#*:}")"
      case "$key" in
        version) VERSION="$val" ;;
        state) STATE="$val" ;;
        pid) PID="$val" ;;
        total) TOTAL="$val" ;;
        passed) PASSED="$val" ;;
        failed) FAILED="$val" ;;
        running) RUNNING="$val" ;;
        percent) PERCENT="$val" ;;
        duration_ms) DURATION_MS="$val" ;;
        error_message) ERROR_MSG="$val" ;;
      esac
      ;;
  esac
done < "$STATUS_FILE"

if [ "$VERSION" != "2" ] || [ -z "$STATE" ] || [ -z "$TOTAL" ]; then
  exit 0
fi

PASSED=${PASSED:-0}
FAILED=${FAILED:-0}
RUNNING=${RUNNING:-0}
PERCENT=${PERCENT:-0}
DURATION_MS=${DURATION_MS:-0}

if [ "$STATE" = "running" ]; then
  case "$PID" in
    ''|*[!0-9]*)
      ;;
    *)
      if [ "$PID" -gt 0 ] && ! kill -0 "$PID" 2>/dev/null; then
        rewrite_dead_running_state "$PID"
      fi
      ;;
  esac
fi

if [ "$DURATION_MS" != "0" ]; then
  DURATION_S=$((DURATION_MS / 1000))
  DURATION_STR="$((DURATION_S / 60)):$(printf '%02d' "$((DURATION_S % 60))")"
else
  DURATION_STR="0:00"
fi

FILLED=$((PERCENT * 10 / 100))
EMPTY=$((10 - FILLED))
BAR=""
for ((i=0; i<FILLED; i++)); do BAR+="▓"; done
for ((i=0; i<EMPTY; i++)); do BAR+="░"; done

GREEN='\033[32m'
RED='\033[31m'
YELLOW='\033[33m'
DIM='\033[2m'
RESET='\033[0m'

BAR_COLOR="$GREEN"
if [ "$TOTAL" -gt 0 ] && [ "$FAILED" -gt 0 ]; then
  FAIL_PCT=$((FAILED * 100 / TOTAL))
  if [ "$FAIL_PCT" -ge 10 ]; then
    BAR_COLOR="$RED"
  else
    BAR_COLOR="$YELLOW"
  fi
fi

case "$STATE" in
  running)
    LINE="${BAR_COLOR}${PERCENT}%${RESET} [${BAR_COLOR}${BAR}${RESET}]"
    [ "$PASSED" -gt 0 ] && LINE="${LINE} ${PASSED}✅"
    [ "$FAILED" -gt 0 ] && LINE="${LINE} ${FAILED}❌"
    [ "$RUNNING" -gt 0 ] && LINE="${LINE} ${RUNNING}⏳"
    LINE="${LINE} ${DIM}${DURATION_STR}${RESET}"
    ;;
  passed)
    LINE="✅ ${PASSED}/${TOTAL} ${DIM}${DURATION_STR}${RESET}"
    ;;
  failed)
    if [ "$FAILED" -gt 0 ]; then
      LINE="❌ ${PASSED}/${TOTAL} ${DIM}(${FAILED} failed)${RESET} ${DIM}${DURATION_STR}${RESET}"
    else
      LINE="❌ ${PASSED}/${TOTAL} ${DIM}${DURATION_STR}${RESET}"
    fi
    ;;
  error)
    LINE="❌ ${RED}ERR${RESET} ${ERROR_MSG:-unknown error}"
    ;;
  idle|*)
    exit 0
    ;;
esac

echo -e "$LINE"
