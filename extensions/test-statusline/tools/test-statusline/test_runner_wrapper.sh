#!/bin/bash
# Test Runner Wrapper
# Wraps a test command, writes YAML status file with progress
# FR-2: YAML Protocol, FR-3: Atomic Writes, FR-4: Test Runner Wrapper, FR-5: Session Isolation

set -o pipefail

# Read session prefix from env
SESSION="${TEST_STATUSLINE_SESSION:-}"
PROJECT="${TEST_STATUSLINE_PROJECT:-$(pwd)}"

# If no session configured, run test command without tracking
if [ -z "$SESSION" ]; then
  exec "$@"
fi

# Status file path (FR-5: session isolation)
STATUS_DIR="$PROJECT/.dev-pomogator/.test-status"
STATUS_FILE="$STATUS_DIR/status.${SESSION}.yaml"

# Ensure status directory exists
mkdir -p "$STATUS_DIR" 2>/dev/null

# Atomic YAML write (FR-3: temp file + rename)
write_yaml() {
  local tmp_file="${STATUS_FILE}.tmp.$$"

  cat > "$tmp_file" << YAML
version: 1
session_id: "${SESSION}"
started_at: "${STARTED_AT}"
updated_at: "$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "unknown")"
state: ${1}
total: ${TOTAL}
passed: ${PASSED}
failed: ${FAILED}
skipped: ${SKIPPED}
running: ${RUNNING}
percent: ${PERCENT}
duration_ms: ${DURATION_MS}
error_message: "${ERROR_MSG}"
YAML

  mv -f "$tmp_file" "$STATUS_FILE" 2>/dev/null
}

# Initialize counters
TOTAL=0
PASSED=0
FAILED=0
SKIPPED=0
RUNNING=0
PERCENT=0
DURATION_MS=0
ERROR_MSG=""
STARTED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "unknown")
SECONDS=0

# Write initial state (FR-4: state=running, percent=0)
write_yaml "running"

# Run the test command via process substitution (avoids subshell variable loss)
# Exit code saved to temp file since $? from process substitution is unreliable
LAST_WRITE=0
PREV_TOTAL=0
EXIT_FILE="/tmp/.test-statusline-exit.$$"

while IFS= read -r line; do
  echo "$line"

  # Parse vitest-style output using bash regex (no fork)
  if [[ "$line" =~ ^[[:space:]]*(✓|√|PASS) ]]; then
    PASSED=$((PASSED + 1))
    TOTAL=$((TOTAL + 1))
  elif [[ "$line" =~ ^[[:space:]]*(✗|×|FAIL) ]]; then
    FAILED=$((FAILED + 1))
    TOTAL=$((TOTAL + 1))
  elif [[ "$line" =~ ^[[:space:]]*(○|↓|SKIP|skipped) ]]; then
    SKIPPED=$((SKIPPED + 1))
    TOTAL=$((TOTAL + 1))
  fi

  # Parse summary lines like "Tests  42 passed | 2 failed | 50 total"
  if [[ "$line" =~ [Tt]ests?[[:space:]]+[0-9]+[[:space:]]+(passed|failed) ]]; then
    if [[ "$line" =~ ([0-9]+)[[:space:]]+passed ]]; then
      PASSED="${BASH_REMATCH[1]}"
    fi
    if [[ "$line" =~ ([0-9]+)[[:space:]]+failed ]]; then
      FAILED="${BASH_REMATCH[1]}"
    fi
    if [[ "$line" =~ ([0-9]+)[[:space:]]+total ]]; then
      TOTAL="${BASH_REMATCH[1]}"
    fi
  fi

  # Update percent and duration
  if [ "$TOTAL" -gt 0 ]; then
    RUNNING=$((TOTAL - PASSED - FAILED - SKIPPED))
    [ "$RUNNING" -lt 0 ] && RUNNING=0
    PERCENT=$(( (PASSED + FAILED + SKIPPED) * 100 / TOTAL ))
    [ "$PERCENT" -gt 100 ] && PERCENT=100
  fi

  DURATION_MS=$((SECONDS * 1000))

  # Throttle YAML writes: only when counters changed and at most once per second
  if [ "$TOTAL" -ne "$PREV_TOTAL" ] && [ "$SECONDS" -ne "$LAST_WRITE" ]; then
    write_yaml "running"
    LAST_WRITE=$SECONDS
    PREV_TOTAL=$TOTAL
  fi
done < <("$@" 2>&1; echo $? > "$EXIT_FILE")

EXIT_CODE=$(cat "$EXIT_FILE" 2>/dev/null || echo 1)
rm -f "$EXIT_FILE" 2>/dev/null

# Final duration
DURATION_MS=$((SECONDS * 1000))
RUNNING=0
PERCENT=100

# Write final state based on exit code (FR-4)
if [ "$EXIT_CODE" -eq 0 ]; then
  write_yaml "passed"
else
  write_yaml "failed"
fi

exit "$EXIT_CODE"
