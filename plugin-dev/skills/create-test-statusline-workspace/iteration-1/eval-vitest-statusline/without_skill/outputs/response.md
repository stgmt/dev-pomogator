# Real-Time Vitest Progress in Claude Code Statusline

A complete guide to building a live test progress indicator that appears in your Claude Code status bar while vitest runs.

## Overview

The system has three parts:

1. **Test wrapper** -- runs vitest and pipes its output through a parser
2. **Output parser** -- reads vitest stdout line-by-line, extracts pass/fail counts, writes a YAML status file
3. **Statusline renderer** -- a script Claude Code calls periodically; it reads the YAML file and prints a one-line progress string

```
vitest --reporter=verbose
        |
   [parser.sh / parser.cjs]
        |
   /tmp/test-status.yaml    <--  statusline_render.sh reads this
        |
   Claude Code statusline: "Tests: 12/47 passed | 2 failed | running..."
```

---

## Part 1: How Claude Code Statusline Works

### The statusline hook

Claude Code supports a `Statusline` hook type in its settings. You register a command that Claude Code executes periodically (roughly every 2-5 seconds). Whatever that command prints to stdout (a single line) is displayed in the status bar at the bottom of the terminal.

### Configuration

Statusline hooks are configured in `.claude/settings.json` under the `hooks` key:

```jsonc
// .claude/settings.json
{
  "hooks": {
    "Statusline": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "/bin/bash .claude/scripts/statusline_render.sh"
          }
        ]
      }
    ]
  }
}
```

### Rules for the renderer script

- **Print exactly one line** to stdout. Claude Code displays that line as-is.
- **Exit quickly.** The script runs on a polling interval. If it hangs, the statusline stalls.
- **Print nothing (or empty string)** if there is nothing to show -- Claude Code will hide the statusline segment.
- The script receives no special arguments. It must get its data from a file, environment variable, or other side channel.

---

## Part 2: Capturing Vitest Output

### Choose a vitest reporter

Vitest has several built-in reporters. For machine-parseable real-time output:

| Reporter | Pros | Cons |
|----------|------|------|
| `verbose` | Prints each test name + pass/fail as it finishes | Needs regex parsing |
| `default` | Grouped by suite, shows progress | Harder to parse mid-run |
| `json` | Structured output | Only prints at the END (useless for real-time) |
| `tap` | Line-oriented, `ok`/`not ok` per test | Clean to parse |
| `dot` | One char per test (`.` or `F`) | Minimal info |

**Recommended: `verbose` or `tap`.**

The `verbose` reporter outputs lines like:

```
 PASS  src/utils.test.ts > formatDate > formats ISO dates
 FAIL  src/utils.test.ts > formatDate > handles null input
 PASS  src/api.test.ts > fetchUser > returns user object
```

The `tap` reporter outputs:

```
TAP version 13
1..47
ok 1 - formatDate > formats ISO dates
not ok 2 - formatDate > handles null input
ok 3 - fetchUser > returns user object
```

### Getting the total test count

Vitest does not print total test count upfront in `verbose` mode. You have two options:

1. **Pre-count with a dry run**: `npx vitest --reporter=json --run 2>/dev/null | node -e "..."` to count tests, then store the total before the real run. This adds startup time.
2. **Estimate from file count**: count `.test.ts` files as a rough proxy.
3. **Progressive total**: show `12 passed | 2 failed` without a denominator, then add the total once the run finishes.

Option 3 is simplest and what we will build.

---

## Part 3: The YAML Status File Protocol

Use a simple YAML file as the communication channel between the parser and the renderer. Example:

```yaml
# /tmp/test-status.yaml
run_id: "2026-03-14T10:23:45"
state: running          # running | passed | failed | error
passed: 12
failed: 2
skipped: 1
total: 47               # 0 until known
current_suite: "src/api.test.ts"
current_test: "fetchUser > returns user object"
started_at: "2026-03-14T10:23:45"
elapsed_s: 14
framework: vitest
```

### Why YAML?

- Human-readable for debugging
- Trivially parseable with `grep` + `sed` in a shell script (no jq needed)
- Small enough to write atomically

### Atomic writes

To avoid the renderer reading a half-written file, write to a temp file then move:

```bash
cat > "$STATUS_FILE.tmp" <<EOF
state: running
passed: $PASSED
failed: $FAILED
...
EOF
mv "$STATUS_FILE.tmp" "$STATUS_FILE"
```

---

## Part 4: Building the Parser

### Option A: Shell parser (bash)

```bash
#!/usr/bin/env bash
# parse_vitest.sh -- pipe vitest verbose output through this

STATUS_FILE="${TEST_STATUS_FILE:-/tmp/test-status.yaml}"
PASSED=0
FAILED=0
SKIPPED=0
TOTAL=0
CURRENT_SUITE=""
CURRENT_TEST=""
STATE="running"

write_status() {
  cat > "${STATUS_FILE}.tmp" <<EOF
state: $STATE
passed: $PASSED
failed: $FAILED
skipped: $SKIPPED
total: $TOTAL
current_suite: "$CURRENT_SUITE"
current_test: "$CURRENT_TEST"
started_at: "$STARTED_AT"
framework: vitest
EOF
  mv "${STATUS_FILE}.tmp" "$STATUS_FILE"
}

STARTED_AT=$(date -u +"%Y-%m-%dT%H:%M:%S")
write_status

while IFS= read -r line; do
  # Echo the line through so the user still sees normal output
  printf '%s\n' "$line"

  # Match vitest verbose output patterns
  case "$line" in
    *" PASS "*)
      PASSED=$((PASSED + 1))
      TOTAL=$((TOTAL + 1))
      # Extract suite and test name
      CURRENT_SUITE=$(echo "$line" | sed -n 's/.*PASS  \([^ ]*\).*/\1/p')
      CURRENT_TEST=$(echo "$line" | sed -n 's/.*PASS  [^ ]* > \(.*\)/\1/p')
      ;;
    *" FAIL "*)
      FAILED=$((FAILED + 1))
      TOTAL=$((TOTAL + 1))
      CURRENT_SUITE=$(echo "$line" | sed -n 's/.*FAIL  \([^ ]*\).*/\1/p')
      CURRENT_TEST=$(echo "$line" | sed -n 's/.*FAIL  [^ ]* > \(.*\)/\1/p')
      ;;
    *" SKIP "* | *" TODO "*)
      SKIPPED=$((SKIPPED + 1))
      TOTAL=$((TOTAL + 1))
      ;;
    *"Tests  "*)
      # Final summary line: "Tests  42 passed | 2 failed | 47 total"
      # Could parse exact totals here for correction
      ;;
  esac

  write_status
done

# Determine final state
if [ "$FAILED" -gt 0 ]; then
  STATE="failed"
else
  STATE="passed"
fi
write_status
```

### Option B: Node.js parser (CJS)

A Node.js parser is more robust for handling vitest's ANSI color codes and edge cases:

```js
#!/usr/bin/env node
// parse_vitest.cjs -- pipe vitest output through this
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const STATUS_FILE = process.env.TEST_STATUS_FILE || '/tmp/test-status.yaml';

const state = {
  state: 'running',
  passed: 0,
  failed: 0,
  skipped: 0,
  total: 0,
  current_suite: '',
  current_test: '',
  started_at: new Date().toISOString(),
  framework: 'vitest',
};

function stripAnsi(str) {
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

function writeStatus() {
  const yaml = Object.entries(state)
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? `"${v}"` : v}`)
    .join('\n');
  const tmp = STATUS_FILE + '.tmp';
  fs.writeFileSync(tmp, yaml + '\n', 'utf-8');
  fs.renameSync(tmp, STATUS_FILE);
}

writeStatus();

const rl = readline.createInterface({ input: process.stdin });

rl.on('line', (rawLine) => {
  // Pass through to stdout
  process.stdout.write(rawLine + '\n');

  const line = stripAnsi(rawLine);

  if (/\bPASS\b/.test(line) && /\.test\./.test(line)) {
    state.passed++;
    state.total++;
    const match = line.match(/PASS\s+(\S+)\s*>\s*(.*)/);
    if (match) {
      state.current_suite = match[1];
      state.current_test = match[2].trim();
    }
  } else if (/\bFAIL\b/.test(line) && /\.test\./.test(line)) {
    state.failed++;
    state.total++;
    const match = line.match(/FAIL\s+(\S+)\s*>\s*(.*)/);
    if (match) {
      state.current_suite = match[1];
      state.current_test = match[2].trim();
    }
  } else if (/\bSKIP\b/.test(line) || /\bTODO\b/.test(line)) {
    state.skipped++;
    state.total++;
  }

  writeStatus();
});

rl.on('close', () => {
  state.state = state.failed > 0 ? 'failed' : 'passed';
  writeStatus();
});
```

### Usage

```bash
# Run vitest with output piped through the parser
npx vitest run --reporter=verbose 2>&1 | node parse_vitest.cjs

# Or with the shell version
npx vitest run --reporter=verbose 2>&1 | bash parse_vitest.sh
```

---

## Part 5: Building the Statusline Renderer

The renderer reads the YAML file and prints a formatted one-liner.

```bash
#!/usr/bin/env bash
# statusline_render.sh -- called by Claude Code Statusline hook

STATUS_FILE="${TEST_STATUS_FILE:-/tmp/test-status.yaml}"

# If no status file exists, print nothing (hides the statusline segment)
if [ ! -f "$STATUS_FILE" ]; then
  exit 0
fi

# Simple YAML field reader (no external deps)
get_field() {
  grep "^${1}:" "$STATUS_FILE" 2>/dev/null | head -1 | sed "s/^${1}: *//; s/\"//g"
}

STATE=$(get_field "state")
PASSED=$(get_field "passed")
FAILED=$(get_field "failed")
SKIPPED=$(get_field "skipped")
TOTAL=$(get_field "total")
SUITE=$(get_field "current_suite")
STARTED=$(get_field "started_at")

# If state is empty or file is stale (older than 10 minutes), hide
if [ -z "$STATE" ]; then
  exit 0
fi

# Check staleness -- if the file hasn't been updated in 10+ minutes, ignore it
if command -v stat &>/dev/null; then
  FILE_AGE=$(( $(date +%s) - $(stat -c %Y "$STATUS_FILE" 2>/dev/null || echo 0) ))
  if [ "$FILE_AGE" -gt 600 ]; then
    exit 0
  fi
fi

# Build the progress string
ICON=""
case "$STATE" in
  running)  ICON="[RUN]" ;;
  passed)   ICON="[OK]"  ;;
  failed)   ICON="[FAIL]" ;;
  error)    ICON="[ERR]" ;;
esac

# Format: [RUN] Tests: 12 passed | 2 failed | 1 skipped (src/api.test.ts)
PARTS="$ICON Tests:"

if [ "${PASSED:-0}" -gt 0 ]; then
  PARTS="$PARTS ${PASSED} passed"
fi

if [ "${FAILED:-0}" -gt 0 ]; then
  [ "${PASSED:-0}" -gt 0 ] && PARTS="$PARTS |"
  PARTS="$PARTS ${FAILED} failed"
fi

if [ "${SKIPPED:-0}" -gt 0 ]; then
  PARTS="$PARTS | ${SKIPPED} skipped"
fi

if [ "$STATE" = "running" ] && [ -n "$SUITE" ]; then
  # Show abbreviated suite name
  SHORT_SUITE=$(basename "$SUITE" 2>/dev/null || echo "$SUITE")
  PARTS="$PARTS ($SHORT_SUITE)"
fi

echo "$PARTS"
```

### What it looks like

While tests are running:
```
[RUN] Tests: 12 passed | 2 failed (api.test.ts)
```

After all tests finish (pass):
```
[OK] Tests: 45 passed | 2 skipped
```

After tests finish (failures):
```
[FAIL] Tests: 40 passed | 5 failed | 2 skipped
```

When no tests are running (file absent or stale): nothing is displayed.

---

## Part 6: Putting It All Together

### Step 1: Create the scripts directory

```
your-project/
  .claude/
    scripts/
      statusline_render.sh
      parse_vitest.sh        # or parse_vitest.cjs
    settings.json
```

### Step 2: Register the statusline hook

Add to `.claude/settings.json`:

```jsonc
{
  "hooks": {
    "Statusline": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bash .claude/scripts/statusline_render.sh"
          }
        ]
      }
    ]
  }
}
```

### Step 3: Create a wrapper script for running tests

```bash
#!/usr/bin/env bash
# run-tests.sh -- wrapper that activates statusline integration

export TEST_STATUS_FILE="/tmp/test-status-$$yaml"

# Clean up on exit
cleanup() {
  rm -f "$TEST_STATUS_FILE" "${TEST_STATUS_FILE}.tmp"
}
trap cleanup EXIT

# Run vitest through the parser
npx vitest run --reporter=verbose 2>&1 | bash .claude/scripts/parse_vitest.sh

# Capture exit code from vitest (via PIPESTATUS)
EXIT_CODE=${PIPESTATUS[0]}

# Leave status file around for 30s so statusline can show final result
sleep 2

exit "$EXIT_CODE"
```

### Step 4: Add npm script

In `package.json`:

```json
{
  "scripts": {
    "test": "bash .claude/scripts/run-tests.sh",
    "test:watch": "bash .claude/scripts/run-tests.sh --watch"
  }
}
```

---

## Part 7: Handling Watch Mode

Vitest watch mode re-runs tests on file changes. The parser must handle multiple runs:

```bash
# In parse_vitest.sh, add reset detection:
case "$line" in
  *"RERUN"* | *"re-running"* | *"Waiting for file changes"*)
    # Reset counters for new run
    PASSED=0
    FAILED=0
    SKIPPED=0
    TOTAL=0
    STATE="running"
    ;;
esac
```

For the Node.js parser, add similar logic:

```js
if (/RERUN|re-running|Waiting for file changes/i.test(line)) {
  state.passed = 0;
  state.failed = 0;
  state.skipped = 0;
  state.total = 0;
  state.state = 'running';
}
```

---

## Part 8: Adding a Progress Bar

To show a visual progress bar, you need the total test count. One approach: do a quick pre-count.

```bash
# In run-tests.sh, before the main run:
TOTAL_TESTS=$(npx vitest run --reporter=json 2>/dev/null \
  | node -e "
    let d=''; process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{
      try { console.log(JSON.parse(d).numTotalTests); }
      catch { console.log(0); }
    });" 2>/dev/null || echo 0)

export EXPECTED_TOTAL="$TOTAL_TESTS"
```

Then in the renderer:

```bash
EXPECTED=$(get_field "expected_total")
if [ "${EXPECTED:-0}" -gt 0 ]; then
  DONE=$((PASSED + FAILED + SKIPPED))
  PCT=$((DONE * 100 / EXPECTED))
  # Build a 20-char bar
  FILLED=$((PCT / 5))
  EMPTY=$((20 - FILLED))
  BAR=$(printf '%0.s#' $(seq 1 $FILLED 2>/dev/null))$(printf '%0.s-' $(seq 1 $EMPTY 2>/dev/null))
  PARTS="$ICON [$BAR] ${PCT}% (${DONE}/${EXPECTED})"
  if [ "$FAILED" -gt 0 ]; then
    PARTS="$PARTS | ${FAILED} failed"
  fi
fi
```

Output:
```
[RUN] [########------------] 40% (19/47) | 2 failed
```

---

## Part 9: Idle Detection

When tests are not running, the statusline should be blank. The renderer already handles this via staleness checks. To be more precise, have the wrapper clean up:

```bash
# At the end of run-tests.sh, after showing final status briefly:
sleep 5
rm -f "$TEST_STATUS_FILE"
```

Or add an `idle` state:

```bash
# parse_vitest.sh -- after the while loop ends:
sleep 5
STATE="idle"
write_status
```

The renderer treats `idle` as "nothing to show":

```bash
if [ "$STATE" = "idle" ]; then
  exit 0
fi
```

---

## Part 10: Troubleshooting

### Statusline not appearing

1. Check that `.claude/settings.json` has the hook registered
2. Run the renderer manually: `bash .claude/scripts/statusline_render.sh` -- it should print a line if the status file exists
3. Verify the status file is being written: `cat /tmp/test-status.yaml`

### Parser not capturing output

1. vitest may buffer output. Try: `npx vitest run --reporter=verbose --no-color 2>&1 | ...`
2. ANSI escape codes can break regex. The Node.js parser strips them; the shell parser may need: `npx vitest run --reporter=verbose --no-color`

### Status file permission issues

Use a path in `/tmp/` or your project's `.claude/` directory. Ensure both the test runner and the statusline renderer can read/write it.

### Watch mode resets not detected

vitest's watch mode output varies by version. Check the actual output of `npx vitest --reporter=verbose` in watch mode and adjust the reset detection regex.

---

## Quick Start Checklist

1. [ ] Copy `parse_vitest.sh` (or `.cjs`) to `.claude/scripts/`
2. [ ] Copy `statusline_render.sh` to `.claude/scripts/`
3. [ ] Add `Statusline` hook to `.claude/settings.json`
4. [ ] Create `run-tests.sh` wrapper
5. [ ] Add `"test": "bash .claude/scripts/run-tests.sh"` to `package.json`
6. [ ] Run `npm test` and verify the statusline updates
7. [ ] (Optional) Add progress bar with pre-counted total
8. [ ] (Optional) Add watch mode reset detection

---

## Summary

| Component | File | Role |
|-----------|------|------|
| Parser | `.claude/scripts/parse_vitest.sh` | Reads vitest stdout, writes YAML |
| Renderer | `.claude/scripts/statusline_render.sh` | Reads YAML, prints one-line status |
| Wrapper | `.claude/scripts/run-tests.sh` | Orchestrates vitest + parser |
| Hook config | `.claude/settings.json` | Tells Claude Code to call renderer |
| Status file | `/tmp/test-status.yaml` | Communication channel |

The key insight: Claude Code's statusline is a **pull** model (it polls your script), while test execution is **push** (streaming output). The YAML file bridges these two models, letting the renderer always return instantly with the latest snapshot of test progress.
