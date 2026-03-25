#!/usr/bin/env bash
# Stop hook: blocks Claude from stopping when background task is active.
# stdin: JSON with session info from Claude Code
# No `set -euo pipefail` — intentional. This script MUST fail-open (FR-4).

# Session prefix from session.env (single source of truth, same as wrapper)
SESSION_PREFIX=$(grep -m1 '^TEST_STATUSLINE_SESSION=' .dev-pomogator/.test-status/session.env 2>/dev/null | cut -d= -f2 || true)
if [ -n "$SESSION_PREFIX" ]; then
  MARKER=".dev-pomogator/.bg-task-active.${SESSION_PREFIX}"
else
  MARKER=".dev-pomogator/.bg-task-active"
fi
INPUT=$(cat 2>/dev/null || true)

# TTL thresholds (seconds)
HARD_TTL=900    # 15 min — always allow stop
SOFT_TTL=300    # 5 min — allow if no fresh running status
STUCK_TTL=180   # 3 min — allow if 0% progress (build hung)

# Cross-platform mtime helper (GNU vs BSD stat)
get_mtime() {
  if [ "$STAT_GNU" = "true" ]; then
    stat -c %Y "$1" 2>/dev/null || echo 0
  else
    stat -f %m "$1" 2>/dev/null || echo 0
  fi
}

# Check YAML test status files for completion/progress (FR-5/6/7)
# Returns via globals: TEST_STATE, TEST_PASSED, TEST_FAILED, TEST_SKIPPED, TEST_TOTAL, TEST_PERCENT
check_test_results() {
  TEST_STATE="" TEST_PASSED="" TEST_FAILED="" TEST_SKIPPED="" TEST_TOTAL="" TEST_PERCENT=""

  local marker_mtime
  marker_mtime=$(get_mtime "$MARKER")

  # Find freshest status file from both .test-status/ and .docker-status/ (volume mount)
  local best_file="" best_mtime=0
  for f in .dev-pomogator/.test-status/status.*.yaml .dev-pomogator/.docker-status/status.*.yaml; do
    [ -f "$f" ] || continue
    local fmtime
    fmtime=$(get_mtime "$f")
    if [ "$fmtime" -gt "$best_mtime" ]; then
      best_mtime="$fmtime"
      best_file="$f"
    fi
  done

  [ -n "$best_file" ] || return 1

  # Parse YAML field: yaml_val <key> <file> → value (no yq dependency)
  yaml_val() { grep -m1 "^$1:" "$2" 2>/dev/null | sed "s/^$1: *//" | tr -d ' "'; }

  TEST_STATE=$(yaml_val state "$best_file")
  TEST_PASSED=$(yaml_val passed "$best_file")
  TEST_FAILED=$(yaml_val failed "$best_file")
  TEST_SKIPPED=$(yaml_val skipped "$best_file")
  TEST_TOTAL=$(yaml_val total "$best_file")
  TEST_PERCENT=$(yaml_val percent "$best_file")

  [ -n "$TEST_STATE" ] || return 1

  # Consistency check: detect partial reads from atomic write race condition
  # Check 1: percent > 0 but all counts = 0 (except skipped for all-skipped case)
  if [ "${TEST_PERCENT:-0}" != "0" ] && [ "${TEST_PASSED:-0}" = "0" ] && [ "${TEST_FAILED:-0}" = "0" ] && [ "${TEST_SKIPPED:-0}" = "0" ]; then
    return 1  # skip inconsistent data
  fi
  # Check 2: percent doesn't match actual progress (passed+failed)/total
  # e.g. passed=33, total=769 → expected ~4%, but percent=56 → partial read
  if [ "${TEST_TOTAL:-0}" -gt 0 ] && [ "${TEST_PERCENT:-0}" -gt 0 ]; then
    local completed=$(( ${TEST_PASSED:-0} + ${TEST_FAILED:-0} + ${TEST_SKIPPED:-0} ))
    local expected_pct=$(( completed * 100 / ${TEST_TOTAL} ))
    local diff=$(( ${TEST_PERCENT} - expected_pct ))
    if [ "$diff" -lt 0 ]; then diff=$(( -diff )); fi
    if [ "$diff" -gt 10 ]; then
      return 1  # percent mismatch > 10% → partial read
    fi
  fi

  # Freshness check: YAML mtime > 30s ago → stale for running/building states
  # Completed states (passed/failed) are always valid regardless of freshness
  local now_fresh
  now_fresh=$(date +%s)
  if [ "$TEST_STATE" != "passed" ] && [ "$TEST_STATE" != "failed" ] && [ $(( now_fresh - best_mtime )) -gt 30 ]; then
    return 1  # stale running/building YAML, skip
  fi

  # Check if status file is newer than marker (tests started after bg task was launched)
  if [ "$best_mtime" -gt "$marker_mtime" ] || [ "$best_mtime" -eq "$marker_mtime" ]; then
    return 0
  fi
  return 1
}

# Detect stat flavor once
if command -v stat >/dev/null 2>&1; then
  if stat --version >/dev/null 2>&1; then STAT_GNU=true; else STAT_GNU=false; fi
else
  STAT_GNU=""
fi

# No marker → try legacy fallback, then allow stop
if [ ! -f "$MARKER" ]; then
  if [ -n "$SESSION_PREFIX" ] && [ -f ".dev-pomogator/.bg-task-active" ]; then
    MARKER=".dev-pomogator/.bg-task-active"
  else
    exit 0
  fi
fi

# Empty/whitespace-only marker → clean up and allow stop
if [ ! -s "$MARKER" ] || ! grep -q '[^ 	]' "$MARKER" 2>/dev/null; then
  rm -f "$MARKER"
  exit 0
fi

# Read task ID from marker (format: "PID TIMESTAMP" or "TASK_ID TIMESTAMP")
TASK_ID=$(cut -d' ' -f1 "$MARKER" 2>/dev/null || echo "unknown")
# Sanitize: only keep alphanumeric + hyphen (reject binary garbage)
TASK_ID=$(echo "$TASK_ID" | tr -cd '[:alnum:]-')
if [ -z "$TASK_ID" ]; then
  rm -f "$MARKER"
  exit 0
fi

# Check if wrapper process is still alive (PID from marker)
# Only if TASK_ID is numeric (wrapper writes PID; old markers may have task IDs like "bs0olkeoz")
if [[ "$TASK_ID" =~ ^[0-9]+$ ]]; then
  if kill -0 "$TASK_ID" 2>/dev/null; then
    : # process alive — continue to blocking logic
  else
    # PID not found via kill -0. On MSYS/Windows, Node.js PIDs may not be visible.
    # Fall through to age-based blocking (hard TTL as safety net).
    :
  fi
fi
# Non-numeric TASK_ID or kill not available → fall through to age/YAML based blocking

# Check marker age (requires stat)
if [ -n "$STAT_GNU" ]; then
  MTIME=$(get_mtime "$MARKER")
  NOW=$(date +%s)
  AGE=$(( NOW - MTIME ))
  AGE_MIN=$(( AGE / 60 ))

  # Hard TTL: safety net for stale markers (crash without cleanup, Windows PID mismatch)
  if [ "$AGE" -ge "$HARD_TTL" ]; then
    rm -f "$MARKER"
    exit 0
  fi

  # FR-5/6/7: Check YAML test results before blocking
  if check_test_results 2>/dev/null; then
    case "$TEST_STATE" in
      passed|failed)
        # Tests completed — allow stop (exit 0 = allow per Stop hook protocol)
        rm -f "$MARKER"
        exit 0
        ;;
      building)
        # FR-13: Docker build in progress — block without progress numbers, no stuck detection
        printf '{"decision":"block","reason":"Building Docker image (%dmin). Tests will start after build completes."}\n' "$AGE_MIN"
        exit 0
        ;;
      running)
        # FR-8: Stuck detection — 0% progress for >STUCK_TTL means build/tests hung
        if [ "${TEST_PASSED:-0}" = "0" ] && [ "${TEST_FAILED:-0}" = "0" ] && [ "$AGE" -ge "$STUCK_TTL" ]; then
          printf '{"decision":"allow","reason":"Tests appear stuck (0%% for %dmin). Build may have failed silently. Allowing stop."}\n' "$AGE_MIN"
          rm -f "$MARKER"
          exit 0
        fi
        # FR-7: Show progress in block message
        PROGRESS=""
        if [ -n "$TEST_PASSED" ] && [ -n "$TEST_TOTAL" ]; then
          PROGRESS=" Progress: ${TEST_PASSED}/${TEST_TOTAL} passed, ${TEST_FAILED:-0} failed (${TEST_PERCENT:-0}%)."
        fi
        printf '{"decision":"block","reason":"Background task %s running (%dmin ago).%s Use TaskOutput task_id=%s to check status."}\n' "$TASK_ID" "$AGE_MIN" "$PROGRESS" "$TASK_ID"
        exit 0
        ;;
    esac
  fi

  # Fallback: Active marker, no YAML data — block stop
  printf '{"decision":"block","reason":"Background task %s running (%dmin ago). Use TaskOutput task_id=%s to check status."}\n' "$TASK_ID" "$AGE_MIN" "$TASK_ID"
  exit 0
fi

# stat not available — fail-open
exit 0
