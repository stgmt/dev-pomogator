# Building a Pytest Adapter for Real-Time Test Statusline

## Overview

To get real-time test progress from pytest, you need an **adapter** that reads pytest's stdout line by line, recognizes the output patterns, and writes structured status updates (typically YAML) that your statusline render script can consume.

The core idea: pytest emits recognizable patterns as each test runs. By parsing these patterns incrementally, you can update a status file after every single test -- not just at the end.

---

## 1. Pytest Output Patterns You Need to Parse

Pytest produces several distinct output patterns depending on verbosity level. Here are the key ones:

### Default verbosity (`pytest`)

Tests produce single characters on a "progress line":

```
test_auth.py .F.s..x.                                                [25%]
test_orders.py ....F..                                                [50%]
```

| Character | Meaning |
|-----------|---------|
| `.`       | PASSED  |
| `F`       | FAILED  |
| `E`       | ERROR   |
| `s`       | SKIPPED |
| `x`       | XFAIL (expected failure) |
| `X`       | XPASS (unexpected pass) |

The `[NN%]` at the end of each line gives overall progress.

### Verbose mode (`pytest -v`)

Each test gets its own line:

```
tests/test_auth.py::test_login_success PASSED                        [ 10%]
tests/test_auth.py::test_login_invalid_password FAILED               [ 20%]
tests/test_auth.py::TestUserSession::test_expired_token SKIPPED      [ 30%]
```

**Verbose mode is strongly recommended** for adapter parsing because:
- Each line maps to exactly one test
- You get the full test node ID (file::class::method)
- The result word is explicit (PASSED/FAILED/SKIPPED/etc.)
- The percentage is per-line

### Collection phase

Before tests run, pytest collects them:

```
collected 47 items
```

or with errors:

```
collected 47 items / 2 errors
```

### Session header

```
========================= test session starts ==========================
platform linux -- Python 3.11.5, pytest-7.4.3, pluggy-1.3.0
```

### Final summary

```
========================= short test summary info ==========================
FAILED tests/test_auth.py::test_login_invalid - AssertionError: ...
=================== 5 passed, 1 failed, 1 skipped in 2.34s ===================
```

The final summary line regex:

```
=+ (\d+ passed)?,?\s*(\d+ failed)?,?\s*(\d+ skipped)?,?\s*(\d+ error)?\s+in ([\d.]+)s =+
```

---

## 2. Adapter Architecture

### Pipeline

```
pytest -v --tb=short 2>&1
    |
    v
[Line-by-line reader]  -- reads stdout pipe incrementally
    |
    v
[Pattern matcher]       -- classifies each line
    |
    v
[State accumulator]     -- tracks passed/failed/skipped/total counts
    |
    v
[YAML status writer]    -- writes status file atomically after each test
    |
    v
[statusline_render.sh]  -- reads YAML, renders one-line progress
```

### The wrapper script

Your wrapper script should invoke pytest with the right flags and pipe through the adapter:

```bash
#!/usr/bin/env bash
set -euo pipefail

STATUS_FILE="${TEST_STATUS_FILE:-/tmp/test-status.yaml}"
FRAMEWORK="pytest"

# Force verbose + unbuffered output for line-by-line parsing
pytest -v --tb=short -q "$@" 2>&1 | parse_pytest_output "$STATUS_FILE"
EXIT_CODE=${PIPESTATUS[0]}

# Write final status
write_final_status "$STATUS_FILE" "$EXIT_CODE"
exit "$EXIT_CODE"
```

Key flags:
- `-v` -- one test per line (essential for parsing)
- `--tb=short` -- keep tracebacks compact so they don't pollute line parsing
- `2>&1` -- merge stderr into stdout
- Use `PYTHONUNBUFFERED=1` or `pytest -p no:cacheprovider` if output is delayed

---

## 3. Line-by-Line Parser Implementation

### Shell (bash/awk) approach

```bash
parse_pytest_output() {
    local status_file="$1"
    local passed=0 failed=0 skipped=0 errors=0 total=0 current_test=""

    while IFS= read -r line; do
        # Echo through so the user still sees output
        printf '%s\n' "$line"

        # Phase 1: Collection line
        if [[ "$line" =~ ^collected[[:space:]]+([0-9]+)[[:space:]]+item ]]; then
            total="${BASH_REMATCH[1]}"
            write_status "$status_file" "collecting" "$passed" "$failed" "$skipped" "$errors" "$total" ""
            continue
        fi

        # Phase 2: Verbose test result line
        # Pattern: tests/file.py::TestClass::test_name STATUS  [ NN%]
        if [[ "$line" =~ ^([^[:space:]]+::[^[:space:]]+)[[:space:]]+(PASSED|FAILED|ERROR|SKIPPED|XFAIL|XPASS)[[:space:]]*\[?[[:space:]]*([0-9]+)%?\]? ]]; then
            current_test="${BASH_REMATCH[1]}"
            local result="${BASH_REMATCH[2]}"
            local pct="${BASH_REMATCH[3]}"

            case "$result" in
                PASSED|XPASS) ((passed++)) ;;
                FAILED)       ((failed++)) ;;
                SKIPPED|XFAIL) ((skipped++)) ;;
                ERROR)        ((errors++)) ;;
            esac

            write_status "$status_file" "running" "$passed" "$failed" "$skipped" "$errors" "$total" "$current_test"
            continue
        fi

        # Phase 3: Final summary line
        # "= 5 passed, 1 failed in 2.34s ="
        if [[ "$line" =~ ^=+.*in[[:space:]]+[0-9]+\.[0-9]+s.*=+$ ]]; then
            write_status "$status_file" "done" "$passed" "$failed" "$skipped" "$errors" "$total" ""
            continue
        fi
    done
}
```

### The status writer function

```bash
write_status() {
    local file="$1" phase="$2" passed="$3" failed="$4" skipped="$5" errors="$6" total="$7" current="$8"
    local ran=$((passed + failed + skipped + errors))
    local tmpfile="${file}.tmp"

    cat > "$tmpfile" <<EOF
framework: pytest
phase: ${phase}
passed: ${passed}
failed: ${failed}
skipped: ${skipped}
errors: ${errors}
total: ${total}
ran: ${ran}
current_test: "${current}"
timestamp: $(date +%s)
EOF

    mv "$tmpfile" "$file"  # atomic replace
}
```

**Important**: Always write to a temp file and `mv` atomically. The render script may read at any moment -- a partial write would produce invalid YAML.

---

## 4. Handling Edge Cases

### Non-verbose fallback (dot-style output)

If someone runs without `-v`, you can still count dots:

```bash
# Count result characters in a progress line like: test_file.py .F.s.. [25%]
if [[ "$line" =~ ^[^[:space:]]+\.py[[:space:]]+([\.\sFfEesSxX]+)[[:space:]]*\[ ]]; then
    local chars="${BASH_REMATCH[1]}"
    # Count each character type
    local p=$(echo "$chars" | tr -cd '.' | wc -c)
    local f=$(echo "$chars" | tr -cd 'F' | wc -c)
    local s=$(echo "$chars" | tr -cd 's' | wc -c)
    local e=$(echo "$chars" | tr -cd 'E' | wc -c)
    passed=$((passed + p))
    failed=$((failed + f))
    skipped=$((skipped + s))
    errors=$((errors + e))
fi
```

This is less precise (no test name, no exact mapping), but still gives real-time counts.

### Multi-line tracebacks

When a test fails, pytest prints a traceback block:

```
tests/test_auth.py::test_login FAILED                               [ 20%]
_____________________________ test_login ______________________________

    def test_login():
>       assert response.status == 200
E       AssertionError: assert 401 == 200

...
```

Your parser should only act on lines matching the test-result pattern. Traceback lines (starting with `>`, `E`, spaces, or `_`) should be passed through but ignored for status updates.

### Parametrized tests

```
tests/test_math.py::test_add[1-2-3] PASSED                          [ 10%]
tests/test_math.py::test_add[0-0-0] PASSED                          [ 20%]
```

The `[params]` part is included in the node ID. Your regex already handles this because `[^[:space:]]+` captures brackets.

### Collection errors

```
ERROR collecting tests/test_broken.py
...
collected 10 items / 1 error
```

Parse the error count from the collection line:

```bash
if [[ "$line" =~ ^collected[[:space:]]+([0-9]+)[[:space:]]+item.*\/[[:space:]]*([0-9]+)[[:space:]]+error ]]; then
    total="${BASH_REMATCH[1]}"
    errors="${BASH_REMATCH[2]}"
fi
```

### Pytest-xdist (parallel execution)

With `pytest -n auto` (xdist), output format changes:

```
[gw0] PASSED tests/test_auth.py::test_login
[gw1] FAILED tests/test_orders.py::test_create
```

Add a pattern for this:

```bash
if [[ "$line" =~ ^\[gw[0-9]+\][[:space:]]+(PASSED|FAILED|ERROR|SKIPPED)[[:space:]]+(.+)$ ]]; then
    local result="${BASH_REMATCH[1]}"
    current_test="${BASH_REMATCH[2]}"
    # ... same counting logic
fi
```

---

## 5. YAML Status File Schema

Use a consistent schema that your render script expects:

```yaml
framework: pytest
phase: running        # collecting | running | done | error
passed: 12
failed: 1
skipped: 2
errors: 0
total: 47
ran: 15
current_test: "tests/test_auth.py::TestSession::test_refresh_token"
timestamp: 1710300000
```

The render script reads this file and produces a single-line statusline, for example:

```
pytest: 15/47 [12P 1F 2S] tests/...::test_refresh_token
```

---

## 6. Making It Framework-Agnostic

If you want the same adapter pattern for vitest, jest, cargo test, etc., structure it as:

```
adapters/
  pytest_adapter.sh      # pytest-specific line parsing
  vitest_adapter.sh      # vitest-specific line parsing
  ...
test_runner_wrapper.sh   # generic: picks adapter, runs framework, writes YAML
statusline_render.sh     # reads YAML, renders statusline (framework-agnostic)
```

Each adapter implements one function: `parse_line(line) -> (test_name, result, total)`. The wrapper handles:
- Detecting which framework to use
- Setting up the pipe
- Calling the adapter's parse function
- Writing YAML atomically

---

## 7. Integration Checklist

1. **Force unbuffered output**: Set `PYTHONUNBUFFERED=1` in the environment, or use `stdbuf -oL pytest ...` on Linux. Python buffers stdout when piped, which kills real-time parsing.

2. **Always use `-v`**: Without it you only get dots, losing test names and making the statusline less useful.

3. **Atomic YAML writes**: Write to `*.tmp` then `mv`. Never write directly to the status file.

4. **Pass through all output**: The adapter should `echo` every line it reads so the user still sees normal pytest output in their terminal.

5. **Handle early exit**: If pytest crashes or the user hits Ctrl+C, write a final `phase: error` status so the render script shows something meaningful.

6. **Timestamp every update**: Include a Unix timestamp in the YAML. The render script can use this to detect stale status (e.g., show "idle" if no update for 30+ seconds).

7. **Test the regex**: Pytest output format can vary by version and plugin. Test your patterns against real output from your project. Save a fixture file of actual pytest output and validate your parser against it.

---

## 8. Quick-Start: Minimal Working Adapter

Here is a minimal complete adapter you can drop in and iterate on:

```bash
#!/usr/bin/env bash
# pytest_adapter.sh -- parse pytest -v output, write YAML status
set -uo pipefail

STATUS_FILE="${1:?Usage: pytest_adapter.sh <status-file>}"
PASSED=0 FAILED=0 SKIPPED=0 ERRORS=0 TOTAL=0

write_yaml() {
    local phase="$1" test="$2"
    local ran=$((PASSED + FAILED + SKIPPED + ERRORS))
    local tmp="${STATUS_FILE}.tmp"
    cat > "$tmp" <<EOF
framework: pytest
phase: ${phase}
passed: ${PASSED}
failed: ${FAILED}
skipped: ${SKIPPED}
errors: ${ERRORS}
total: ${TOTAL}
ran: ${ran}
current_test: "${test}"
timestamp: $(date +%s)
EOF
    mv "$tmp" "$STATUS_FILE"
}

# Initialize
write_yaml "waiting" ""

while IFS= read -r line; do
    printf '%s\n' "$line"

    # Collection
    if [[ "$line" =~ ^collected[[:space:]]+([0-9]+)[[:space:]]+item ]]; then
        TOTAL="${BASH_REMATCH[1]}"
        write_yaml "collecting" ""
    # Verbose result (standard pytest)
    elif [[ "$line" =~ ^(.+::.+)[[:space:]]+(PASSED|FAILED|ERROR|SKIPPED|XFAIL|XPASS) ]]; then
        test_id="${BASH_REMATCH[1]}"
        result="${BASH_REMATCH[2]}"
        case "$result" in
            PASSED|XPASS)  ((PASSED++))  ;;
            FAILED)        ((FAILED++))  ;;
            ERROR)         ((ERRORS++))  ;;
            SKIPPED|XFAIL) ((SKIPPED++)) ;;
        esac
        write_yaml "running" "$test_id"
    # xdist result
    elif [[ "$line" =~ ^\[gw[0-9]+\][[:space:]]+(PASSED|FAILED|ERROR|SKIPPED)[[:space:]]+(.+)$ ]]; then
        result="${BASH_REMATCH[1]}"
        test_id="${BASH_REMATCH[2]}"
        case "$result" in
            PASSED)  ((PASSED++))  ;;
            FAILED)  ((FAILED++))  ;;
            ERROR)   ((ERRORS++))  ;;
            SKIPPED) ((SKIPPED++)) ;;
        esac
        write_yaml "running" "$test_id"
    # Final summary
    elif [[ "$line" =~ ^=.*[[:space:]]in[[:space:]]+[0-9] ]]; then
        write_yaml "done" ""
    fi
done

# If we exit the loop without hitting the summary line
if [[ "$(PASSED + FAILED + ERRORS)" -gt 0 ]]; then
    write_yaml "done" ""
fi
```

Usage:

```bash
PYTHONUNBUFFERED=1 pytest -v --tb=short 2>&1 | bash pytest_adapter.sh /tmp/test-status.yaml
```

---

## Summary

The adapter pattern for real-time pytest parsing is:

1. **Pipe** pytest output through a line reader
2. **Classify** each line using regex (collected, test result, summary)
3. **Accumulate** counts in shell variables
4. **Write** YAML atomically after every test result line
5. **Pass through** all output so the terminal still works normally

Start with verbose mode (`-v`) and the minimal adapter above, then extend for edge cases (xdist, collection errors, non-verbose fallback) as needed.
