# Building a Pytest Adapter for Test Statusline

You already have the render script and wrapper working -- great. The adapter is the piece that sits between pytest's stdout and your YAML status writer, turning raw output lines into structured events so the statusline shows real-time progress instead of just "running... done."

## The Adapter Pattern

An adapter is a single function: `parseLine(line) -> TestEvent | null`. The wrapper calls it once per stdout line. When it returns a non-null event, the wrapper updates its counters (passed, failed, skipped, running, percent) and throttle-writes the YAML status file.

### TestEvent Interface

Every adapter produces events conforming to this shape:

```javascript
// TestEvent types used by the wrapper to update YAML counters
// {
//   type: 'suite_start' | 'suite_end' | 'test_start' | 'test_pass'
//       | 'test_fail' | 'test_skip' | 'summary' | 'error' | 'log',
//   suiteName:    string | undefined,  // e.g. "tests/test_auth.py"
//   suiteFile:    string | undefined,  // same as suiteName for pytest
//   testName:     string | undefined,  // e.g. "test_login_valid"
//   duration:     number | undefined,  // milliseconds
//   errorMessage: string | undefined,
//   stackTrace:   string | undefined,
//   summary:      { total, passed, failed } | undefined,
// }
```

**Event flow per test file:** `suite_start` -> (`test_pass` | `test_fail` | `test_skip`)* -> `suite_end` -> `summary`

### Design Principles

1. **One function, minimal state** -- you only need to track the current suite name and any pending error text.
2. **Check patterns in priority order:** suite -> pass -> fail -> skip -> summary -> error.
3. **Return `null` for unrecognized lines** -- most lines will not match (pytest prints a lot of noise).
4. **Track pending errors** -- pytest prints errors/tracebacks *after* the FAILED line, so you collect them and attach to the next fail event (or flush on the next test/suite).

## Step 1: Study pytest's Output Format

Before writing regexes, you need to know what pytest actually prints. Run pytest with verbose output to see the line-by-line format:

```bash
python -m pytest -v 2>&1 | tee pytest-output.txt
```

With `-v` (verbose), pytest prints one line per test result:

```
tests/test_auth.py::test_login_valid PASSED
tests/test_auth.py::test_login_invalid PASSED
tests/test_auth.py::test_expired_token FAILED
tests/test_api.py::test_get_users PASSED
tests/test_api.py::test_create_user SKIPPED
```

Without `-v`, pytest only shows dots/F/s characters and a summary -- that format is much harder to parse and gives less granularity. **Always invoke pytest with `-v`** from your wrapper.

The summary line looks like:

```
====== 3 passed, 1 failed, 1 skipped in 2.34s ======
```

And the "collecting" phase before tests start:

```
collecting ... collected 5 items
```

## Step 2: Write the Regex Patterns

Here are the patterns for pytest verbose output:

```javascript
// --- pytest verbose output patterns ---

// Test result lines: "tests/test_auth.py::test_login PASSED"
const RE_TEST_PASS  = /^(.+\.py)::(.+)\s+PASSED/;
const RE_TEST_FAIL  = /^(.+\.py)::(.+)\s+FAILED/;
const RE_TEST_SKIP  = /^(.+\.py)::(.+)\s+SKIPPED/;

// Collection phase: "collecting ... collected 12 items"
const RE_COLLECTING = /^collecting\s+\.\.\./;
const RE_COLLECTED  = /collected\s+(\d+)\s+items?/;

// Summary: "====== 3 passed, 1 failed in 2.34s ======"
// or:      "====== 5 passed in 1.23s ======"
const RE_SUMMARY    = /=+\s+(.*)\s+in\s+[\d.]+s\s+=+/;
const RE_PASSED_CT  = /(\d+)\s+passed/;
const RE_FAILED_CT  = /(\d+)\s+failed/;
const RE_SKIPPED_CT = /(\d+)\s+skipped/;

// Error/traceback lines (for attaching to fail events)
const RE_ERROR_HEADER = /^(E\s+|FAILED\s+|>\s+)/;
const RE_STACK_LINE   = /^\s+File\s+"/;
```

### Key Details

- **`RE_TEST_PASS/FAIL/SKIP`**: The `(.+\.py)` captures the file path, `(.+)` captures the test name (which may include class names like `TestAuth::test_login`). The status keyword is always at the end, separated by whitespace.
- **`RE_COLLECTED`**: Gives you the `total` count before tests start running. This is critical for calculating percent.
- **`RE_SUMMARY`**: Appears once at the very end. Use the sub-patterns to extract final counts.
- pytest may also print `XFAIL`, `XPASS`, and `ERROR` -- handle these as edge cases if your project uses them.

## Step 3: Implement the parseLine Function

Here is the complete pytest adapter in CJS format, ready to drop into your extension:

```javascript
// pytest_adapter.cjs -- parse pytest -v stdout into TestEvent objects
'use strict';

// --- Regex patterns for pytest verbose output ---
const RE_TEST_PASS  = /^(.+\.py)::(.+)\s+PASSED/;
const RE_TEST_FAIL  = /^(.+\.py)::(.+)\s+FAILED/;
const RE_TEST_SKIP  = /^(.+\.py)::(.+)\s+SKIPPED/;
const RE_COLLECTED  = /collected\s+(\d+)\s+items?/;
const RE_SUMMARY    = /=+\s+(.*)\s+in\s+[\d.]+s\s+=+/;
const RE_PASSED_CT  = /(\d+)\s+passed/;
const RE_FAILED_CT  = /(\d+)\s+failed/;
const RE_SKIPPED_CT = /(\d+)\s+skipped/;
const RE_ERROR_LINE = /^(E\s+|>{1,2}\s+)/;
const RE_STACK_LINE = /^\s+File\s+"/;

// --- Minimal state ---
let currentSuite = '';
let pendingError = undefined;
let pendingStack = [];

/**
 * Parse one line of pytest -v stdout.
 * Returns a TestEvent if the line matches a known pattern, or null.
 *
 * @param {string} line - A single line from pytest stdout (already \r-stripped)
 * @returns {object|null} TestEvent or null
 */
function parseLine(line) {
  // --- Collection count (gives us total before tests start) ---
  const collectedMatch = line.match(RE_COLLECTED);
  if (collectedMatch) {
    return {
      type: 'summary',
      summary: {
        total: parseInt(collectedMatch[1], 10),
        passed: 0,
        failed: 0,
      },
    };
  }

  // --- Test passed ---
  const passMatch = line.match(RE_TEST_PASS);
  if (passMatch) {
    const suiteFile = passMatch[1].trim();
    if (suiteFile !== currentSuite) {
      currentSuite = suiteFile;
      // Emit implicit suite_start (pytest does not print explicit suite headers)
    }
    flushPendingError();
    return {
      type: 'test_pass',
      suiteName: suiteFile,
      suiteFile: suiteFile,
      testName: passMatch[2].trim(),
    };
  }

  // --- Test failed ---
  const failMatch = line.match(RE_TEST_FAIL);
  if (failMatch) {
    const suiteFile = failMatch[1].trim();
    if (suiteFile !== currentSuite) currentSuite = suiteFile;
    const event = {
      type: 'test_fail',
      suiteName: suiteFile,
      suiteFile: suiteFile,
      testName: failMatch[2].trim(),
      errorMessage: pendingError,
      stackTrace: pendingStack.length > 0 ? pendingStack.join('\n') : undefined,
    };
    flushPendingError();
    return event;
  }

  // --- Test skipped ---
  const skipMatch = line.match(RE_TEST_SKIP);
  if (skipMatch) {
    const suiteFile = skipMatch[1].trim();
    if (suiteFile !== currentSuite) currentSuite = suiteFile;
    flushPendingError();
    return {
      type: 'test_skip',
      suiteName: suiteFile,
      suiteFile: suiteFile,
      testName: skipMatch[2].trim(),
    };
  }

  // --- Error line (collect for next test_fail) ---
  if (RE_ERROR_LINE.test(line)) {
    if (!pendingError) {
      pendingError = line.trim();
      pendingStack = [];
    } else {
      pendingStack.push(line.trim());
    }
    return null;
  }

  // --- Stack trace line (collect) ---
  if (RE_STACK_LINE.test(line) && pendingError) {
    pendingStack.push(line.trim());
    return null;
  }

  // --- Final summary line ---
  const summaryMatch = line.match(RE_SUMMARY);
  if (summaryMatch) {
    const summaryText = summaryMatch[1];
    const passed  = summaryText.match(RE_PASSED_CT);
    const failed  = summaryText.match(RE_FAILED_CT);
    const skipped = summaryText.match(RE_SKIPPED_CT);
    const p = passed  ? parseInt(passed[1], 10)  : 0;
    const f = failed  ? parseInt(failed[1], 10)  : 0;
    const s = skipped ? parseInt(skipped[1], 10) : 0;
    return {
      type: 'summary',
      summary: {
        total: p + f + s,
        passed: p,
        failed: f,
      },
    };
  }

  // --- Unrecognized line ---
  return null;
}

function flushPendingError() {
  pendingError = undefined;
  pendingStack = [];
}

module.exports = { parseLine };
```

## Step 4: Integrate the Adapter into Your Wrapper

Your existing wrapper uses `spawnSync`, which collects all stdout at once. For real-time line-by-line parsing, you need to switch to `spawn` (async) or process the collected output line by line after completion. Here is both approaches:

### Approach A: Post-Process After spawnSync (Simpler, No Code Restructure)

If you want to keep `spawnSync`, process the output after the child exits. This gives you correct final counts but not real-time mid-run updates:

```javascript
// In your wrapper, after spawnSync completes:
const adapter = require('./pytest_adapter.cjs');

if (result.stdout) {
  const lines = result.stdout.replace(/\r\n/g, '\n').split('\n');
  for (const line of lines) {
    const event = adapter.parseLine(line);
    if (!event) continue;

    switch (event.type) {
      case 'test_pass':  status.passed++;  break;
      case 'test_fail':  status.failed++;  break;
      case 'test_skip':  status.skipped++; break;
      case 'summary':
        if (event.summary.total > 0) status.total = event.summary.total;
        break;
    }
  }
  status.running = 0;
  status.percent = status.total > 0
    ? Math.round(((status.passed + status.failed + status.skipped) / status.total) * 100)
    : 100;
}
```

This is the minimal change. The statusline will show "running..." with 0% until the tests finish, then jump to 100% with correct counts.

### Approach B: Use spawn for True Real-Time Updates (Recommended)

For the progress bar to update as each test completes, switch from `spawnSync` to `spawn` and process stdout line-by-line:

```javascript
const { spawn } = require('node:child_process');
const adapter = require('./pytest_adapter.cjs');

// ... (status object initialization, writeStatus, writeIfNeeded as before) ...

// Write initial status
writeStatus();

const child = spawn(testCommand, {
  shell: true,
  windowsHide: true,
  stdio: ['inherit', 'pipe', 'inherit'],
});

let logBuffer = '';

child.stdout.on('data', (chunk) => {
  const text = chunk.toString('utf-8');
  process.stdout.write(text);  // pass-through to terminal
  logBuffer += text;

  // Split into lines, keeping partial last line for next chunk
  const lines = text.replace(/\r\n/g, '\n').split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;
    const event = adapter.parseLine(line);
    if (!event) continue;

    switch (event.type) {
      case 'test_pass':
        status.passed++;
        updateRunning();
        break;
      case 'test_fail':
        status.failed++;
        if (event.errorMessage) status.error_message = event.errorMessage;
        updateRunning();
        break;
      case 'test_skip':
        status.skipped++;
        updateRunning();
        break;
      case 'summary':
        if (event.summary && event.summary.total > 0) {
          status.total = event.summary.total;
        }
        break;
    }

    // Throttled YAML write (max 1 per 1000ms)
    writeIfNeeded();
  }
});

function updateRunning() {
  const completed = status.passed + status.failed + status.skipped;
  status.running = Math.max(0, status.total - completed);
  status.percent = status.total > 0
    ? Math.round((completed / status.total) * 100)
    : 0;
}

child.on('close', (exitCode) => {
  // Write log file
  try { fs.writeFileSync(logFile, logBuffer, 'utf-8'); } catch (_) {}

  // Final state
  status.state = exitCode === 0 ? 'passed' : 'failed';
  if (exitCode !== 0 && !status.error_message) {
    status.error_message = `pytest exited with code ${exitCode}`;
  }
  status.percent = 100;
  status.running = 0;

  writeStatus();  // Final write always executes (bypass throttle)
  process.exit(exitCode ?? 1);
});

child.on('error', (err) => {
  status.state = 'error';
  status.error_message = `Spawn error: ${err.message}`;
  status.percent = 100;
  status.running = 0;
  writeStatus();
  process.exit(1);
});
```

### Partial Line Handling

The `data` event on stdout gives you chunks, not lines. A chunk may end in the middle of a line. For a robust implementation, buffer partial lines:

```javascript
let partialLine = '';

child.stdout.on('data', (chunk) => {
  const text = chunk.toString('utf-8');
  process.stdout.write(text);
  logBuffer += text;

  partialLine += text;
  const lines = partialLine.replace(/\r\n/g, '\n').split('\n');
  // Last element may be incomplete -- save it for next chunk
  partialLine = lines.pop() || '';

  for (const line of lines) {
    if (!line.trim()) continue;
    const event = adapter.parseLine(line);
    // ... handle event as above ...
  }
});

// On close, flush the last partial line
child.on('close', (exitCode) => {
  if (partialLine.trim()) {
    const event = adapter.parseLine(partialLine);
    // ... handle event ...
  }
  // ... finalize as above ...
});
```

## Step 5: Configure the Dispatch Table

Register pytest in your wrapper's dispatch table so auto-detection and filter arguments work:

```javascript
const DISPATCH = {
  // ... other frameworks ...
  pytest: {
    cmd: 'python -m pytest -v',  // -v is critical for line-by-line parsing
    filter: (f) => `-k "${f}"`,
  },
};
```

**Important:** Always include `-v` in the base command. Without verbose mode, pytest prints dots instead of individual test results, and the adapter cannot parse progress.

### Auto-Detection

Add pytest detection to your indicator list:

```javascript
const INDICATORS = [
  // ... higher-priority frameworks ...
  { framework: 'pytest', files: ['pytest.ini', 'pyproject.toml', 'conftest.py'] },
  // ... lower-priority frameworks ...
];
```

**Special case for `pyproject.toml`:** Many Python projects have this file without pytest. Only match if the file contains `[tool.pytest` or `[pytest]`:

```javascript
if (filename === 'pyproject.toml') {
  try {
    const content = fs.readFileSync(path.join(projectDir, filename), 'utf-8');
    if (!content.includes('[tool.pytest') && !content.includes('[pytest]')) {
      continue;  // skip, not a pytest project
    }
  } catch (_) { continue; }
}
```

## Step 6: Handle pytest-Specific Edge Cases

### Parametrized Tests

pytest parametrize produces test names like:

```
tests/test_math.py::test_add[1-2-3] PASSED
tests/test_math.py::test_add[0-0-0] PASSED
```

The bracket suffix is part of the test name. The regex `(.+)\s+PASSED` already captures this correctly because the `(.+)` is greedy and stops at the last whitespace before PASSED.

### Class-Based Tests

```
tests/test_auth.py::TestLogin::test_valid_credentials PASSED
```

The `::` separators stack. Your regex captures `TestLogin::test_valid_credentials` as the test name, which is correct and readable in the statusline.

### XFAIL and XPASS

```
tests/test_known.py::test_known_bug XFAIL
tests/test_known.py::test_was_buggy XPASS
```

Add additional patterns if your project uses expected failures:

```javascript
const RE_TEST_XFAIL = /^(.+\.py)::(.+)\s+XFAIL/;
const RE_TEST_XPASS = /^(.+\.py)::(.+)\s+XPASS/;
```

Treat XFAIL as a skip (expected) and XPASS as a pass (or a fail, depending on your policy).

### Collection Errors

If pytest fails to collect tests (syntax errors, import failures), it prints:

```
ERROR collecting tests/test_broken.py
```

Add a pattern:

```javascript
const RE_COLLECT_ERROR = /^ERROR\s+collecting\s+(.+)/;
```

Return `{ type: 'error', errorMessage: line.trim() }` and let the wrapper set the overall state.

### Multiline Error Output

pytest prints detailed failure info in a block after the short summary:

```
=== FAILURES ===
___ test_login_invalid ___
tests/test_auth.py:42: in test_login_invalid
    assert response.status_code == 401
E   AssertionError: assert 403 == 401
```

The `RE_ERROR_LINE` and `RE_STACK_LINE` patterns in the adapter collect these lines. Since this block appears *after* the FAILED result line (not before), the error info will be attached to the *next* fail event or flushed when the next test/suite starts. For pytest, this is fine because the statusline only needs pass/fail counts -- the error details are logged to the log file for later inspection.

## Step 7: Test the Adapter

Create a fixture file with representative pytest output and feed it through `parseLine`:

```javascript
// test_pytest_adapter.cjs
const { parseLine } = require('./pytest_adapter.cjs');

const FIXTURE = `
collecting ... collected 5 items

tests/test_auth.py::test_login_valid PASSED
tests/test_auth.py::test_login_invalid PASSED
tests/test_auth.py::test_expired_token FAILED
tests/test_api.py::test_get_users PASSED
tests/test_api.py::test_create_user SKIPPED

====== 3 passed, 1 failed, 1 skipped in 2.34s ======
`.trim();

const events = [];
for (const line of FIXTURE.split('\n')) {
  const event = parseLine(line);
  if (event) events.push(event);
}

// Verify: should have 1 summary (from "collected 5 items"),
// 3 test_pass, 1 test_fail, 1 test_skip, 1 final summary
console.log('Events:', events.length);
for (const e of events) {
  console.log(`  ${e.type}: ${e.testName || ''} ${e.summary ? JSON.stringify(e.summary) : ''}`);
}

// Assert counts
const passes  = events.filter(e => e.type === 'test_pass').length;
const fails   = events.filter(e => e.type === 'test_fail').length;
const skips   = events.filter(e => e.type === 'test_skip').length;
const summaries = events.filter(e => e.type === 'summary');
console.log(`\nPass: ${passes}, Fail: ${fails}, Skip: ${skips}, Summaries: ${summaries.length}`);
console.assert(passes === 3, 'Expected 3 passes');
console.assert(fails === 1, 'Expected 1 fail');
console.assert(skips === 1, 'Expected 1 skip');
console.assert(summaries.length === 2, 'Expected 2 summaries (collected + final)');
console.log('All assertions passed.');
```

## YAML Status File Updates

For reference, here is what the YAML status file looks like mid-run with the adapter producing events. The wrapper writes this atomically (temp file + rename) at most once per second:

```yaml
version: 2
session_id: "abc12345def67890"
pid: 54321
started_at: "2026-03-13T12:00:00Z"
updated_at: "2026-03-13T12:00:03Z"
state: running
framework: "pytest"
total: 5
passed: 2
failed: 0
skipped: 0
running: 3
percent: 40
duration_ms: 3000
error_message: ""
log_file: ".dev-pomogator/.test-status/test.abc12345.log"
```

The render script reads this file on each poll and renders:

```
40% [====------] 2ok 0err 3... 0:03
```

When all tests complete:

```
err 4/5 (1 failed) 2:34
```

## Summary of Files

| File | Purpose |
|------|---------|
| `pytest_adapter.cjs` | The adapter -- `parseLine(line)` function with pytest regex patterns |
| `test_runner_wrapper.cjs` | Your existing wrapper, modified to import the adapter and process lines |
| `statusline_render.cjs` | Your existing render script (no changes needed -- it reads YAML) |

The adapter is the only new file. The wrapper needs the `spawn` change (Approach B) for real-time updates, plus importing and calling `adapter.parseLine()` on each stdout line. The render script is unchanged -- it already reads whatever the YAML file contains.

## Key Patterns to Remember

1. **Always use `pytest -v`** -- without verbose mode, pytest output is not parseable per-test.
2. **`collected N items`** gives you the total count upfront -- critical for percent calculation.
3. **Throttle writes to 1/sec** -- pytest can run hundreds of tests per second; do not write YAML on every event.
4. **Atomic writes** -- always write to a `.tmp.{pid}` file and `renameSync` to the final path.
5. **Flush partial lines** -- `stdout.on('data')` gives chunks, not lines. Buffer the last incomplete line.
6. **Return `null` for noise** -- most pytest output lines (blank lines, headers, separators) should be ignored.
