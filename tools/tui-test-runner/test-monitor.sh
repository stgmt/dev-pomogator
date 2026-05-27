#!/usr/bin/env bash
# test-monitor.sh — YAML status watcher for Claude Code Monitor tool.
# Polls the newest status YAML and emits filtered events to stdout.
# Each stdout line = one Monitor notification in Claude's chat.
#
# Usage: bash test-monitor.sh [status-dir]
# Default: .dev-pomogator/.docker-status (fallback: .dev-pomogator/.test-status)
#
# Events emitted (filtered — not every YAML update):
#   ❌ FAIL: <test name>           — instant, on each new failure
#   📊 N/T (P%) — X✅ Y❌ Z⏭     — every 30s when counts change
#   ⏳ Still running: X✅ — no new results for Ns  — no-progress heartbeat
#   ⚠️ STALL: YAML not updated for Ns              — heartbeat dead
#   🚀 Tests running / New test run detected        — state transitions
#   ✅/❌ DONE: summary                              — terminal, auto-exit

set -euo pipefail

STATUS_DIR="${1:-}"
if [[ -z "$STATUS_DIR" ]]; then
  if [[ -d ".dev-pomogator/.docker-status" ]]; then
    STATUS_DIR=".dev-pomogator/.docker-status"
  else
    STATUS_DIR=".dev-pomogator/.test-status"
  fi
fi

# State tracking
prev_passed=0
prev_failed=0
prev_skipped=0
prev_state=""
prev_mtime=0
stall_warned=0
last_progress_time=0
last_change_time=0       # when passed/failed last changed (for no-progress heartbeat)
no_progress_warned=0     # 0=not warned, 1=warned
run_start_time=0         # when monitor detected the active run (for elapsed calc)
startup_done=0           # 0=still in startup snapshot phase
startup_file=""
PROGRESS_INTERVAL=30     # emit progress every N seconds
STALL_THRESHOLD=60       # warn if YAML mtime unchanged for N seconds
NO_PROGRESS_THRESHOLD=90 # warn if counters unchanged for N seconds (but YAML alive)
POLL_INTERVAL=2

# Find newest status YAML in the directory
find_yaml() {
  ls -t "$STATUS_DIR"/status.*.yaml 2>/dev/null | head -1
}

# Extract a top-level scalar value from YAML (no parser needed)
yaml_val() {
  local file="$1" key="$2"
  grep -m1 "^${key}:" "$file" 2>/dev/null | sed "s/^${key}: *//" | tr -d '"' || echo ""
}

# Extract failed test names from nested YAML structure
yaml_failed_tests() {
  local file="$1"
  awk '
    /^      - name:/ { current_name = substr($0, index($0, "name:") + 6) }
    /^        status: failed/ { if (current_name != "") print current_name; current_name = "" }
  ' "$file" 2>/dev/null
}

# Compute elapsed time from started_at ISO timestamp
compute_elapsed() {
  local started_at="$1"
  # Strip quotes and fractional seconds: "2026-04-13T14:07:28.795Z" → 2026-04-13T14:07:28
  local clean
  clean=$(echo "$started_at" | tr -d '"' | sed 's/\.[0-9]*Z$/Z/' | sed 's/Z$//')
  # Parse with date (GNU coreutils)
  local start_epoch
  start_epoch=$(date -d "${clean}" +%s 2>/dev/null || echo 0)
  local now_epoch
  now_epoch=$(date +%s)
  echo $((now_epoch - start_epoch))
}

format_duration() {
  local secs="$1"
  local m=$((secs / 60))
  local s=$((secs % 60))
  echo "${m}m${s}s"
}

echo "👀 Monitoring test status in $STATUS_DIR (poll ${POLL_INTERVAL}s)"

# Startup snapshot: record what exists now to avoid reporting stale data
startup_file=$(find_yaml)
if [[ -n "$startup_file" && -f "$startup_file" ]]; then
  local_state=$(yaml_val "$startup_file" "state")
  prev_mtime=$(stat -c %Y "$startup_file" 2>/dev/null || stat -f %m "$startup_file" 2>/dev/null || echo 0)

  if [[ "$local_state" =~ ^(passed|failed|error)$ ]]; then
    echo "⏳ Existing YAML is stale (state=$local_state) — waiting for new test run..."
    startup_done=0
  else
    echo "🔄 Active run detected (state=$local_state) — tracking..."
    startup_done=1
    prev_state="$local_state"
    prev_passed=$(yaml_val "$startup_file" "passed"); prev_passed=${prev_passed:-0}
    prev_failed=$(yaml_val "$startup_file" "failed"); prev_failed=${prev_failed:-0}
    prev_skipped=$(yaml_val "$startup_file" "skipped"); prev_skipped=${prev_skipped:-0}
    run_start_time=$(date +%s)
    last_change_time=$(date +%s)
    last_progress_time=$(date +%s)
  fi
fi

while true; do
  yaml_file=$(find_yaml)

  if [[ -z "$yaml_file" || ! -f "$yaml_file" ]]; then
    sleep "$POLL_INTERVAL"
    continue
  fi

  mtime=$(stat -c %Y "$yaml_file" 2>/dev/null || stat -f %m "$yaml_file" 2>/dev/null || echo 0)
  now=$(date +%s)

  # --- Startup phase: skip stale terminal YAML ---
  if [[ "$startup_done" -eq 0 ]]; then
    current_state=$(yaml_val "$yaml_file" "state")
    if [[ "$yaml_file" != "$startup_file" ]] || [[ ! "$current_state" =~ ^(passed|failed|error)$ && "$mtime" != "$prev_mtime" ]]; then
      startup_done=1
      prev_mtime="$mtime"
      prev_state="$current_state"
      prev_passed=$(yaml_val "$yaml_file" "passed"); prev_passed=${prev_passed:-0}
      prev_failed=$(yaml_val "$yaml_file" "failed"); prev_failed=${prev_failed:-0}
      prev_skipped=$(yaml_val "$yaml_file" "skipped"); prev_skipped=${prev_skipped:-0}
      run_start_time=$now
      last_change_time=$now
      last_progress_time=$now
      framework=$(yaml_val "$yaml_file" "framework")
      echo "🚀 New test run detected: ${framework} (session: $(basename "$yaml_file" .yaml | sed 's/status\.//'))"
    fi
    sleep "$POLL_INTERVAL"
    continue
  fi

  # --- Skip if file hasn't changed (mtime-based) ---
  if [[ "$mtime" == "$prev_mtime" ]]; then
    # Stall detection: YAML heartbeat dead
    if [[ "$prev_state" == "running" && "$stall_warned" -eq 0 ]]; then
      age=$((now - mtime))
      if [[ "$age" -gt "$STALL_THRESHOLD" ]]; then
        echo "⚠️ STALL: YAML not updated for ${age}s — tests may be hung"
        stall_warned=1
      fi
    fi
    sleep "$POLL_INTERVAL"
    continue
  fi

  prev_mtime="$mtime"
  stall_warned=0

  # --- Read current values ---
  state=$(yaml_val "$yaml_file" "state")
  passed=$(yaml_val "$yaml_file" "passed")
  failed=$(yaml_val "$yaml_file" "failed")
  skipped=$(yaml_val "$yaml_file" "skipped")
  total=$(yaml_val "$yaml_file" "total")
  percent=$(yaml_val "$yaml_file" "percent")
  started_at=$(yaml_val "$yaml_file" "started_at")
  framework=$(yaml_val "$yaml_file" "framework")
  error_msg=$(yaml_val "$yaml_file" "error_message")

  passed=${passed:-0}; failed=${failed:-0}; skipped=${skipped:-0}
  total=${total:-0}; percent=${percent:-0}

  # Compute elapsed from monitor's own run_start_time (YAML started_at can be stale on session reuse)
  if [[ "$run_start_time" -gt 0 ]]; then
    elapsed_s=$((now - run_start_time))
  else
    elapsed_s=$(compute_elapsed "$started_at")
  fi
  elapsed_fmt=$(format_duration "$elapsed_s")

  # --- Event: new failure detected (instant) ---
  if [[ "$failed" -gt "$prev_failed" ]]; then
    new_failures=$((failed - prev_failed))
    failed_names=$(yaml_failed_tests "$yaml_file" | tail -"$new_failures")
    if [[ -n "$failed_names" ]]; then
      while IFS= read -r tname; do
        if [[ ${#tname} -gt 120 ]]; then
          tname="${tname:0:117}..."
        fi
        echo "❌ FAIL: $tname"
      done <<< "$failed_names"
    else
      echo "❌ FAIL: ${new_failures} new failure(s) — total ${failed} failed"
    fi
    last_change_time=$now
    no_progress_warned=0
  fi

  # Track if passed changed
  if [[ "$passed" -gt "$prev_passed" ]]; then
    last_change_time=$now
    no_progress_warned=0
  fi

  # --- Event: state transition to terminal ---
  if [[ "$state" != "$prev_state" ]]; then
    case "$state" in
      passed)
        echo "✅ DONE: ${passed} passed, ${skipped} skipped — ${elapsed_fmt} (${framework})"
        exit 0
        ;;
      failed)
        echo "❌ DONE: ${passed} passed, ${failed} failed, ${skipped} skipped — ${elapsed_fmt} (${framework})"
        if [[ -n "$error_msg" && "$error_msg" != "null" ]]; then
          echo "   Error: $error_msg"
        fi
        exit 0
        ;;
      error)
        echo "💥 ERROR: ${error_msg:-unknown error} — ${elapsed_fmt}"
        exit 1
        ;;
      running)
        if [[ "$prev_state" == "building" ]]; then
          echo "🚀 Tests running: ${total} tests discovered (${framework})"
        fi
        ;;
    esac
  fi

  # --- Event: periodic progress (every PROGRESS_INTERVAL when counts change) ---
  if [[ "$state" == "running" && $((now - last_progress_time)) -ge "$PROGRESS_INTERVAL" ]]; then
    if [[ "$passed" -gt "$prev_passed" || "$failed" -gt "$prev_failed" ]]; then
      completed=$((passed + failed + skipped))
      echo "📊 ${completed}/${total} (${percent}%) — ${passed}✅ ${failed}❌ ${skipped}⏭ — ${elapsed_fmt}"
      last_progress_time=$now
    fi
  fi

  # --- Event: no-progress heartbeat (alive but counters stuck) ---
  if [[ "$state" == "running" && "$no_progress_warned" -eq 0 ]]; then
    if [[ "$last_change_time" -gt 0 && $((now - last_change_time)) -ge "$NO_PROGRESS_THRESHOLD" ]]; then
      stall_age=$((now - last_change_time))
      echo "⏳ Still running: ${passed}✅ ${failed}❌ — no new results for ${stall_age}s — ${elapsed_fmt}"
      no_progress_warned=1
    fi
  fi

  # --- Update prev values ---
  prev_passed=$passed
  prev_failed=$failed
  prev_skipped=$skipped
  prev_state=$state

  sleep "$POLL_INTERVAL"
done
