# YAML v2 Status File Protocol

The YAML status file is the communication channel between the test runner wrapper (writer) and the statusline render script (reader). Each session writes to its own file for isolation.

## File Location

```
{project}/.dev-pomogator/.test-status/status.{prefix}.yaml
```

Where `{prefix}` = first 8 characters of the Claude Code session ID.

## Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | integer | yes | Always `2` |
| `session_id` | string | yes | Full Claude Code session ID |
| `pid` | integer | yes | PID of the test runner process (for liveness checks) |
| `started_at` | string | yes | ISO 8601 timestamp of test start |
| `updated_at` | string | yes | ISO 8601 timestamp of last write |
| `state` | string | yes | Current state (see State Machine) |
| `framework` | string | yes | Test framework name (`vitest`, `jest`, `pytest`, `dotnet`, `rust`, `go`) |
| `total` | integer | yes | Total discovered test count |
| `passed` | integer | yes | Passed test count |
| `failed` | integer | yes | Failed test count |
| `skipped` | integer | yes | Skipped test count |
| `running` | integer | yes | Currently running test count |
| `percent` | integer | yes | Completion percentage (0–100) |
| `duration_ms` | integer | yes | Elapsed time since start in milliseconds |
| `error_message` | string | yes | Error description (empty string if none) |
| `log_file` | string | yes | Path to the test log file |
| `suites` | array | no | Optional suite objects for detailed display |

### Suite Object (Optional)

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Suite/file name |
| `status` | string | `running`, `passed`, or `failed` |
| `passed` | integer | Passed count in suite |
| `failed` | integer | Failed count in suite |
| `total` | integer | Total tests in suite |

## State Machine

```
idle → running → passed
                → failed
                → error
```

| State | Meaning |
|-------|---------|
| `idle` | No test run in progress (or stale file) |
| `running` | Tests executing; counters update in real-time |
| `passed` | All tests completed successfully (exit code 0) |
| `failed` | Tests completed with failures, or process died |
| `error` | Test command could not start or crashed |

**Transitions:**
- `idle → running` — Wrapper writes initial status
- `running → passed` — Exit code 0
- `running → failed` — Non-zero exit code, OR render detects dead PID
- `running → error` — Spawn failure

## Atomic Writes

**NEVER write directly to the status file.** Always temp-file-then-rename:

```javascript
const tmpFile = `${statusFile}.tmp.${process.pid}`;
fs.writeFileSync(tmpFile, yamlContent, 'utf-8');
fs.renameSync(tmpFile, statusFile);
```

On failure, clean up:
```javascript
try { fs.unlinkSync(tmpFile); } catch (_) {}
```

This prevents the render script from reading a half-written file. `rename` is atomic on all major OS.

## Session Isolation

Each Claude Code session uses its own status file via the 8-character session prefix:

```javascript
const prefix = sessionId.substring(0, 8);
const statusFile = path.join(cwd, '.dev-pomogator', '.test-status', `status.${prefix}.yaml`);
```

Multiple concurrent sessions in the same project do not conflict.

## Write Throttling

Throttle writes to max 1 per 1000ms to prevent I/O pressure:

```javascript
const THROTTLE_MS = 1000;
let lastWriteTime = 0;

function writeIfNeeded() {
  const now = Date.now();
  if (now - lastWriteTime < THROTTLE_MS) return false;
  write();
  lastWriteTime = now;
  return true;
}
```

**Exception:** Final write (test completion) always executes regardless of throttle.

## PID Liveness Check

The render script verifies the test runner is still alive when `state === 'running'`:

```javascript
if (state === 'running' && pid > 0) {
  try {
    process.kill(pid, 0); // signal 0 checks existence only
  } catch (_) {
    rewriteDeadRunning(pid); // atomically rewrite to failed
  }
}
```

**Rewrite dead running:** When a running process dies (crash/kill), atomically rewrite:
- `state` → `failed`
- `running` → `0`
- `percent` → `100`
- `error_message` → `"Process died unexpectedly (PID: {pid})"`

## Stale File Cleanup

The SessionStart hook cleans stale files on each new session:

| Rule | Condition | Action |
|------|-----------|--------|
| Age limit | File older than 24 hours | Delete |
| Dead process | `state: running` but PID not alive | Rewrite to `failed` |
| Idle limit | `state: idle` and older than 1 hour | Delete |

## YAML Formatting

- Quote strings with `:` or spaces: `error_message: "Process died (PID: 1234)"`
- ISO 8601 timestamps: `started_at: "2026-03-13T12:00:00Z"`
- Empty strings are valid: `error_message: ""`
- Integer fields default to `0`

## Example

```yaml
version: 2
session_id: "abc12345def67890"
pid: 54321
started_at: "2026-03-13T12:00:00Z"
updated_at: "2026-03-13T12:01:15Z"
state: running
framework: "vitest"
total: 50
passed: 38
failed: 2
skipped: 0
running: 10
percent: 76
duration_ms: 75000
error_message: ""
log_file: ".dev-pomogator/.test-status/test.abc12345.log"
suites:
  - name: "auth.test.ts"
    status: "passed"
    passed: 12
    failed: 0
    total: 12
  - name: "api.test.ts"
    status: "running"
    passed: 26
    failed: 2
    total: 38
```
