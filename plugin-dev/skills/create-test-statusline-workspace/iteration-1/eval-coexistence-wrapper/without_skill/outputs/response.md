# Making ccstatusline and Test Progress Statusline Coexist in Claude Code (Windows)

## Background

Claude Code supports a single `statusline` configuration in `.claude/settings.json` (or `.claude/settings.local.json`). The `statusline` field has one `command` property, meaning only one shell command runs at a time. To show output from **both** ccstatusline and a test-progress reporter, you need a **wrapper script** that calls both and merges their output into one line.

## How Claude Code Statusline Works

In your `.claude/settings.json` you likely have something like:

```json
{
  "statusline": {
    "command": "ccstatusline",
    "refreshInterval": 5000
  }
}
```

Claude Code runs this command periodically, captures its stdout, and displays the first line as the statusline. Only one command is supported — there is no built-in way to chain multiple statusline providers.

## Strategy: A Wrapper Script

Create a small wrapper script that:

1. Runs ccstatusline and captures its output.
2. Runs your test-progress reporter and captures its output.
3. Concatenates both outputs into a single line, separated by a delimiter.

### Step 1: Create the Test Progress Reporter

You need something that outputs the current test status as a single line. A common approach is to have your test runner write status to a file, and a small script reads that file.

**Option A: YAML status file approach**

Have your test runner (vitest, jest, pytest, etc.) write progress to a known file, e.g. `.test-status.yaml`:

```yaml
status: running
passed: 12
failed: 1
total: 25
suite: e2e
```

Then create a reader script, e.g. `test-status-reader.sh`:

```bash
#!/usr/bin/env bash
STATUS_FILE=".test-status.yaml"

if [ ! -f "$STATUS_FILE" ]; then
  echo ""
  exit 0
fi

# Check if the file is stale (older than 5 minutes = tests probably finished)
if [ "$(uname -s)" = "MINGW"* ] || [ "$(uname -s)" = "MSYS"* ]; then
  # Windows Git Bash: use stat with different format
  file_age=$(( $(date +%s) - $(stat -c %Y "$STATUS_FILE" 2>/dev/null || echo 0) ))
else
  file_age=$(( $(date +%s) - $(stat -f %m "$STATUS_FILE" 2>/dev/null || stat -c %Y "$STATUS_FILE" 2>/dev/null || echo 0) ))
fi

if [ "$file_age" -gt 300 ]; then
  echo ""
  exit 0
fi

# Parse the YAML (simple grep approach)
status=$(grep '^status:' "$STATUS_FILE" | cut -d' ' -f2)
passed=$(grep '^passed:' "$STATUS_FILE" | cut -d' ' -f2)
failed=$(grep '^failed:' "$STATUS_FILE" | cut -d' ' -f2)
total=$(grep '^total:' "$STATUS_FILE" | cut -d' ' -f2)

if [ -z "$status" ]; then
  echo ""
  exit 0
fi

if [ "$failed" -gt 0 ] 2>/dev/null; then
  echo "Tests: ${passed}/${total} passed, ${failed} FAILED"
else
  echo "Tests: ${passed}/${total} passed"
fi
```

**Option B: Simple file-based approach**

Even simpler -- have your test runner write a single line to `.test-status.txt`:

```
Tests: 12/25 passed, 1 FAILED
```

And the reader is just `cat .test-status.txt 2>/dev/null`.

### Step 2: Create the Wrapper Script

Create a file called `statusline-wrapper.sh` (or `.cmd` / `.ps1` if you prefer) in your project root or a tools directory:

**For Git Bash / MSYS2 (recommended on Windows):**

```bash
#!/usr/bin/env bash
# statusline-wrapper.sh
# Merges ccstatusline output with test progress into one line.

# 1. Get ccstatusline output
cc_output=$(ccstatusline 2>/dev/null)

# 2. Get test progress output
test_output=""
TEST_STATUS_FILE=".test-status.yaml"

if [ -f "$TEST_STATUS_FILE" ]; then
  # Only show if file was modified in the last 5 minutes
  file_mod=$(stat -c %Y "$TEST_STATUS_FILE" 2>/dev/null || echo 0)
  now=$(date +%s)
  age=$(( now - file_mod ))

  if [ "$age" -lt 300 ]; then
    status=$(grep '^status:' "$TEST_STATUS_FILE" | cut -d' ' -f2)
    passed=$(grep '^passed:' "$TEST_STATUS_FILE" | cut -d' ' -f2)
    failed=$(grep '^failed:' "$TEST_STATUS_FILE" | cut -d' ' -f2)
    total=$(grep '^total:' "$TEST_STATUS_FILE" | cut -d' ' -f2)

    if [ -n "$status" ] && [ -n "$total" ]; then
      if [ "${failed:-0}" -gt 0 ] 2>/dev/null; then
        test_output="Tests: ${passed}/${total} ${failed}F"
      elif [ "$status" = "running" ]; then
        test_output="Tests: ${passed}/${total}..."
      else
        test_output="Tests: ${passed}/${total} OK"
      fi
    fi
  fi
fi

# 3. Combine outputs
if [ -n "$test_output" ] && [ -n "$cc_output" ]; then
  echo "${cc_output} | ${test_output}"
elif [ -n "$cc_output" ]; then
  echo "${cc_output}"
elif [ -n "$test_output" ]; then
  echo "${test_output}"
fi
```

Make it executable:

```bash
chmod +x statusline-wrapper.sh
```

**For Node.js (cross-platform alternative):**

If you prefer a Node.js wrapper (works identically on Windows without Git Bash):

```javascript
// statusline-wrapper.cjs
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 1. Get ccstatusline output
let ccOutput = '';
try {
  ccOutput = execSync('ccstatusline', {
    timeout: 3000,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe']
  }).trim();
} catch {
  // ccstatusline not available or errored
}

// 2. Get test progress
let testOutput = '';
const statusFile = path.join(process.cwd(), '.test-status.yaml');
try {
  const stat = fs.statSync(statusFile);
  const ageMs = Date.now() - stat.mtimeMs;

  // Only show if less than 5 minutes old
  if (ageMs < 300000) {
    const content = fs.readFileSync(statusFile, 'utf-8');
    const get = (key) => {
      const m = content.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
      return m ? m[1].trim() : '';
    };

    const status = get('status');
    const passed = get('passed');
    const failed = get('failed');
    const total = get('total');

    if (status && total) {
      if (parseInt(failed) > 0) {
        testOutput = `Tests: ${passed}/${total} ${failed}F`;
      } else if (status === 'running') {
        testOutput = `Tests: ${passed}/${total}...`;
      } else {
        testOutput = `Tests: ${passed}/${total} OK`;
      }
    }
  }
} catch {
  // No status file or unreadable
}

// 3. Combine
const parts = [ccOutput, testOutput].filter(Boolean);
if (parts.length > 0) {
  process.stdout.write(parts.join(' | '));
}
```

### Step 3: Update Claude Code Settings

Change your `.claude/settings.json` (or `.claude/settings.local.json`) to point to the wrapper instead of ccstatusline directly.

**If using the bash wrapper:**

```json
{
  "statusline": {
    "command": "bash statusline-wrapper.sh",
    "refreshInterval": 5000
  }
}
```

**If using the Node.js wrapper:**

```json
{
  "statusline": {
    "command": "node statusline-wrapper.cjs",
    "refreshInterval": 5000
  }
}
```

Use `.claude/settings.local.json` if you want this to be local to your machine and not committed to git.

### Step 4: Feed Test Status from Your Test Runner

You need your test runner to write to `.test-status.yaml` (or `.test-status.txt`). Here are approaches for common frameworks:

**Vitest (custom reporter):**

```javascript
// vitest-status-reporter.cjs
const fs = require('fs');

module.exports = {
  onInit() {
    fs.writeFileSync('.test-status.yaml', 'status: running\npassed: 0\nfailed: 0\ntotal: 0\n');
  },
  onTestRunComplete(results) {
    const passed = results.numPassedTests || 0;
    const failed = results.numFailedTests || 0;
    const total = results.numTotalTests || 0;
    const status = failed > 0 ? 'failed' : 'passed';
    fs.writeFileSync('.test-status.yaml',
      `status: ${status}\npassed: ${passed}\nfailed: ${failed}\ntotal: ${total}\n`
    );
  }
};
```

**Simple approach (any framework):**

Wrap your test command with a script that updates the status file:

```bash
# run-tests-with-status.sh
echo "status: running" > .test-status.yaml
npm test 2>&1 | tee test-output.log
EXIT_CODE=${PIPESTATUS[0]}

# Parse results from output (adjust regex for your framework)
passed=$(grep -oP '\d+(?= passed)' test-output.log | tail -1)
failed=$(grep -oP '\d+(?= failed)' test-output.log | tail -1)
total=$(( ${passed:-0} + ${failed:-0} ))

cat > .test-status.yaml <<EOF
status: $([ "${EXIT_CODE}" -eq 0 ] && echo "passed" || echo "failed")
passed: ${passed:-0}
failed: ${failed:-0}
total: ${total}
EOF
```

## Summary of How It All Fits Together

```
Claude Code statusline timer (every 5s)
        |
        v
  statusline-wrapper.sh (or .cjs)
        |
   +---------+-----------+
   |                     |
   v                     v
ccstatusline        read .test-status.yaml
 (git branch,       (written by your test
  time, etc.)        runner)
   |                     |
   +-----+------+-------+
         |
         v
  "main 14:32 | Tests: 12/25..."
  (displayed in Claude Code statusline)
```

## Windows-Specific Notes

1. **Git Bash**: If you have Git for Windows installed, `bash` is available in your PATH. The bash wrapper approach works directly.

2. **PowerShell alternative**: If you prefer PowerShell, create `statusline-wrapper.ps1` and use `"command": "powershell -NoProfile -File statusline-wrapper.ps1"` in settings. Be aware that PowerShell startup time (~200ms) may be noticeable.

3. **Node.js approach**: The `.cjs` wrapper is the most reliable cross-platform option and avoids shell compatibility issues entirely. If you have Node.js installed (which you likely do if you are using Claude Code), this is the recommended approach on Windows.

4. **Path separators**: Use forward slashes in the `command` field or escape backslashes. Claude Code passes the command to the shell which handles path resolution.

5. **File encoding**: Ensure your wrapper scripts use UTF-8 without BOM if you include any non-ASCII characters.

6. **Stale status**: The wrapper includes a 5-minute staleness check so that old test results disappear from the statusline automatically. Adjust the `300` (seconds) threshold as needed.

## Troubleshooting

- **ccstatusline output disappears**: Make sure the wrapper correctly captures ccstatusline output. Test by running `bash statusline-wrapper.sh` (or `node statusline-wrapper.cjs`) manually in your terminal.
- **No test output showing**: Check that `.test-status.yaml` exists and was modified recently. Run `cat .test-status.yaml` to verify its contents.
- **Wrapper not executing**: On Windows, ensure the command in settings uses the right shell. Try `"command": "node statusline-wrapper.cjs"` as the most portable option.
- **Slow refresh**: The `refreshInterval` controls how often Claude Code calls your wrapper. 5000ms (5 seconds) is a reasonable default. Lower values give faster updates but use more CPU.
