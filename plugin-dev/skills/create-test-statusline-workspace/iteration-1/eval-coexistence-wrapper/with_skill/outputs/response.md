# Making ccstatusline and Test Progress Statusline Coexist on Windows

## The Problem

Claude Code supports only **one** `statusLine` command in `~/.claude/settings.json`. You already have `ccstatusline` (git branch + time) registered there. Adding a second statusline for test progress would overwrite it.

## The Solution: A Wrapper Script

Create a **coexistence wrapper** -- a small CJS script that runs both statusline commands sequentially, combines their output, and presents them as a single statusline to Claude Code. The result looks like:

```
main | 12:45 | 76% [========--] 38ok 2err 10... 0:45
^^^^^^^^^^^^^^^   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  ccstatusline         test progress (your new addition)
```

When no tests are running, it degrades gracefully:

```
main | 12:45 | 0% [----------] no test runs
```

If either command fails or times out, the wrapper shows only the one that succeeded -- so your ccstatusline keeps working no matter what.

---

## Step-by-Step Setup

### Step 1: Create the project files

Create this directory structure in your project:

```
.dev-pomogator/tools/test-statusline/
  package.json
  statusline_render.cjs
  statusline_wrapper.cjs
  test_runner_wrapper.cjs
  session_start_hook.cjs
```

#### 1a. `package.json`

```json
{
  "type": "commonjs"
}
```

#### 1b. `statusline_render.cjs` -- the test progress renderer

This script reads a YAML status file written by the test runner wrapper and outputs an ANSI progress bar. Claude Code passes JSON on stdin with `session_id` and `cwd`.

```javascript
#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Read stdin (Claude Code passes JSON with session_id and cwd)
let input = '';
try { input = fs.readFileSync(0, 'utf-8'); } catch (_) {}

let sessionId = '', cwd = '.';
try { const j = JSON.parse(input); sessionId = j.session_id || ''; cwd = j.cwd || '.'; } catch (_) {}
if (!sessionId) sessionId = process.env.TEST_STATUSLINE_SESSION || '';
if (cwd === '.') cwd = process.env.TEST_STATUSLINE_PROJECT || '.';
const prefix = sessionId ? sessionId.substring(0, 8) : '';

function renderIdle() {
  process.stdout.write('\x1b[2m0% [\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591] no test runs\x1b[0m');
  process.exit(0);
}
if (!prefix) renderIdle();

const statusFile = path.join(cwd, '.dev-pomogator', '.test-status', `status.${prefix}.yaml`);
let yaml;
try { yaml = fs.readFileSync(statusFile, 'utf-8'); } catch (_) { renderIdle(); }

// Parse flat YAML (no library needed)
const f = {};
for (const raw of yaml.split('\n')) {
  const line = raw.replace(/\r$/, '');  // normalize Windows \r\n
  if (!line || line.startsWith(' ') || line.startsWith('- ')) continue;
  if (line === 'suites:' || line === 'phases:') break;
  const ci = line.indexOf(':');
  if (ci === -1) continue;
  let v = line.substring(ci + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
    v = v.slice(1, -1);
  f[line.substring(0, ci).trim()] = v;
}
if (f.version !== '2' || !f.state || !f.total) renderIdle();

const state = f.state, total = +f.total || 0, passed = +f.passed || 0;
const failed = +f.failed || 0, running = +f.running || 0, percent = +f.percent || 0;
const ds = Math.floor((+f.duration_ms || 0) / 1000);
const dur = `${Math.floor(ds / 60)}:${String(ds % 60).padStart(2, '0')}`;
const filled = Math.floor(percent * 10 / 100), empty = 10 - filled;
const bar = '\u2593'.repeat(filled) + '\u2591'.repeat(empty);

const G = '\x1b[32m', R = '\x1b[31m', Y = '\x1b[33m', D = '\x1b[2m', X = '\x1b[0m';
let color = G;
if (total > 0 && failed > 0) color = Math.floor(failed * 100 / total) >= 10 ? R : Y;

let out = '';
switch (state) {
  case 'running':
    out = `${color}${percent}%${X} [${color}${bar}${X}]`;
    if (passed > 0) out += ` ${passed}\u2705`;
    if (failed > 0) out += ` ${failed}\u274C`;
    if (running > 0) out += ` ${running}\u23F3`;
    out += ` ${D}${dur}${X}`;
    break;
  case 'passed': out = `\u2705 ${passed}/${total} ${D}${dur}${X}`; break;
  case 'failed':
    out = failed > 0
      ? `\u274C ${passed}/${total} ${D}(${failed} failed)${X} ${D}${dur}${X}`
      : `\u274C ${passed}/${total} ${D}${dur}${X}`;
    break;
  case 'error': out = `\u274C ${R}ERR${X} ${f.error_message || 'unknown error'}`; break;
  default: renderIdle();
}
process.stdout.write(out);
```

#### 1c. `statusline_wrapper.cjs` -- the coexistence wrapper

This is the key piece. It runs both your ccstatusline command and the test progress renderer, then combines their output with a ` | ` separator.

```javascript
#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const COMMAND_TIMEOUT_MS = 5000;
const LOG_DIR = path.join(os.homedir(), '.dev-pomogator', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'statusline.log');
const MAX_LOG_SIZE = 512 * 1024; // 512KB

// Diagnostic logging (never fails, never blocks)
function logDiag(message) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    try {
      const stat = fs.statSync(LOG_FILE);
      if (stat.size > MAX_LOG_SIZE) {
        try { fs.unlinkSync(LOG_FILE + '.old'); } catch (_) {}
        fs.renameSync(LOG_FILE, LOG_FILE + '.old');
      }
    } catch (_) {}
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${message}\n`);
  } catch (_) {}
}

// Read CLI flag value
function readFlag(flag) {
  const idx = process.argv.indexOf(flag);
  return (idx !== -1 && idx + 1 < process.argv.length) ? process.argv[idx + 1] : '';
}

// Base64 decode with round-trip validation
function decodeBase64(value) {
  if (!value) return '';
  if (!/^[A-Za-z0-9+/=]+$/.test(value) || value.length % 4 !== 0) return '';
  const decoded = Buffer.from(value, 'base64').toString('utf-8');
  const normalizedInput = value.replace(/=+$/, '');
  const normalizedRoundTrip = Buffer.from(decoded, 'utf-8').toString('base64').replace(/=+$/, '');
  return normalizedInput === normalizedRoundTrip ? decoded : '';
}

// Normalize output: strip \r, preserve internal \n, strip trailing \n
function normalizeOutput(value) {
  return String(value || '').replace(/\r\n/g, '\n').replace(/\n+$/, '');
}

// Run a statusline command with timeout
function runCommand(label, command, input) {
  if (!command) return '';
  const start = Date.now();
  const result = spawnSync(command, {
    input,
    encoding: 'utf-8',
    shell: true,
    windowsHide: true,   // prevents cmd.exe window flash on Windows
    timeout: COMMAND_TIMEOUT_MS,
  });
  const elapsed = Date.now() - start;
  if (result.error) {
    const reason = result.error.code === 'ETIMEDOUT'
      ? `TIMEOUT(${COMMAND_TIMEOUT_MS}ms)` : result.error.message;
    logDiag(`${label}: ${reason} after ${elapsed}ms cmd=${command.substring(0, 40)}`);
    return '';
  }
  const output = normalizeOutput(result.stdout);
  logDiag(`${label}: ${elapsed}ms exit=${result.status} out=${output.length}b`);
  return output;
}

// --- Main ---
const input = fs.readFileSync(0, 'utf-8');
const userCommand = decodeBase64(readFlag('--user-b64'));
const managedCommand = decodeBase64(readFlag('--managed-b64'));

const userOutput = runCommand('user', userCommand, input);
const managedOutput = runCommand('managed', managedCommand, input);

// Combine: append managed output to the last line of user output
if (userOutput && managedOutput) {
  const lastNewline = userOutput.lastIndexOf('\n');
  if (lastNewline >= 0) {
    // Multi-line user output: keep all lines, append managed to last
    process.stdout.write(
      `${userOutput.substring(0, lastNewline)}\n${userOutput.substring(lastNewline + 1)} | ${managedOutput}`
    );
  } else {
    process.stdout.write(`${userOutput} | ${managedOutput}`);
  }
} else if (userOutput) {
  process.stdout.write(userOutput);
} else if (managedOutput) {
  process.stdout.write(managedOutput);
}
```

#### 1d. `test_runner_wrapper.cjs` -- wraps your test command

This spawns your test command, writes YAML status updates that the render script reads.

```javascript
#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

// Diagnostic logging
const LOG_DIR = path.join(os.homedir(), '.dev-pomogator', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'statusline.log');
function log(msg) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] [wrapper] ${msg}\n`);
  } catch (_) {}
}

// Parse arguments: --framework <name> -- <command...>
const args = process.argv.slice(2);
const fwIdx = args.indexOf('--framework');
const sepIdx = args.indexOf('--');
const framework = fwIdx !== -1 && fwIdx + 1 < args.length ? args[fwIdx + 1] : 'unknown';
const testCmd = sepIdx !== -1 ? args.slice(sepIdx + 1).join(' ') : '';
if (!testCmd) { process.stderr.write('Usage: node wrapper.cjs --framework <name> -- <cmd>\n'); process.exit(1); }

const prefix = (process.env.TEST_STATUSLINE_SESSION || '').substring(0, 8);
const projDir = process.env.TEST_STATUSLINE_PROJECT || process.cwd();
const statusDir = path.join(projDir, '.dev-pomogator', '.test-status');
fs.mkdirSync(statusDir, { recursive: true });
const sf = path.join(statusDir, `status.${prefix || process.pid}.yaml`);
const lf = path.join(statusDir, `test.${prefix || process.pid}.log`);

const st = {
  version: 2, session_id: process.env.TEST_STATUSLINE_SESSION || '', pid: process.pid,
  started_at: new Date().toISOString(), updated_at: '', state: 'running', framework,
  total: 0, passed: 0, failed: 0, skipped: 0, running: 0, percent: 0, duration_ms: 0,
  error_message: '', log_file: lf
};

function toYaml(o) {
  return Object.entries(o).filter(([,v]) => typeof v !== 'object' || v === null)
    .map(([k,v]) => typeof v === 'string' ? `${k}: "${v.replace(/"/g, '\\"')}"` : `${k}: ${v}`)
    .join('\n') + '\n';
}

function write() {
  st.updated_at = new Date().toISOString();
  st.duration_ms = Date.now() - new Date(st.started_at).getTime();
  const tmp = `${sf}.tmp.${process.pid}`;
  try { fs.writeFileSync(tmp, toYaml(st), 'utf-8'); fs.renameSync(tmp, sf); }
  catch (_) { try { fs.unlinkSync(tmp); } catch (_) {} }
}

write();
log(`Started: framework=${framework} cmd="${testCmd}"`);

const r = spawnSync(testCmd, {
  encoding: 'utf-8', shell: true, windowsHide: true,
  stdio: ['inherit', 'pipe', 'inherit'], timeout: 600000
});

if (r.stdout) {
  process.stdout.write(r.stdout);
  try { fs.writeFileSync(lf, r.stdout, 'utf-8'); } catch (_) {}
}

if (r.error) {
  st.state = 'error';
  st.error_message = r.error.code === 'ETIMEDOUT'
    ? 'Test command timed out after 600s'
    : `Spawn error: ${r.error.message}`;
} else {
  st.state = (r.status ?? 1) === 0 ? 'passed' : 'failed';
  if ((r.status ?? 1) !== 0) st.error_message = `Exit code ${r.status}`;
}
st.percent = 100; st.running = 0;
write();
log(`Finished: ${st.state}`);
process.exit(r.status ?? 1);
```

#### 1e. `session_start_hook.cjs` -- initializes the session

This runs automatically when Claude Code starts a session. It creates the status directory, writes environment variables, and cleans up stale files from previous sessions.

```javascript
#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');

function getYamlField(content, field) {
  const match = content.match(new RegExp(`^${field}:\\s*(.*)$`, 'm'));
  return match ? match[1].replace(/"/g, '').replace(/\r/g, '').trim() : '';
}

function isProcessAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (_) { return false; }
}

function writeFileAtomic(filePath, content) {
  const tmpFile = `${filePath}.tmp.${process.pid}`;
  try {
    fs.writeFileSync(tmpFile, content, 'utf-8');
    fs.renameSync(tmpFile, filePath);
  } finally {
    try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch (_) {}
  }
}

function cleanStaleFiles(statusDir) {
  try {
    const files = fs.readdirSync(statusDir);
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const HOUR = 60 * 60 * 1000;
    for (const file of files) {
      if (!file.startsWith('status.') || !file.endsWith('.yaml')) continue;
      const filePath = path.join(statusDir, file);
      try {
        const stat = fs.statSync(filePath);
        const age = now - stat.mtimeMs;
        if (age > DAY) { fs.unlinkSync(filePath); continue; }
        const content = fs.readFileSync(filePath, 'utf-8');
        const state = getYamlField(content, 'state');
        const pid = parseInt(getYamlField(content, 'pid'), 10);
        if (state === 'running' && pid > 0 && !isProcessAlive(pid)) {
          const msg = `Process died unexpectedly (PID: ${pid})`;
          const updated = content
            .replace(/^state: .*/m, 'state: failed')
            .replace(/^running: .*/m, 'running: 0')
            .replace(/^percent: .*/m, 'percent: 100')
            .replace(/^error_message: .*/m, `error_message: "${msg}"`)
            .replace(/^updated_at: .*/m, `updated_at: "${new Date().toISOString()}"`);
          writeFileAtomic(filePath, updated);
          continue;
        }
        if (age > HOUR && state === 'idle') { fs.unlinkSync(filePath); }
      } catch (_) {}
    }
  } catch (_) {}
}

// Main: reads JSON from stdin, writes {} to stdout
let raw = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  try {
    if (!raw.trim()) { process.stdout.write('{}'); return; }
    const input = JSON.parse(raw);
    const sid = input.session_id || '';
    const cwd = input.cwd || process.cwd();
    if (!sid) { process.stdout.write('{}'); return; }
    const prefix = sid.substring(0, 8);
    const statusDir = path.join(cwd, '.dev-pomogator', '.test-status');
    fs.mkdirSync(statusDir, { recursive: true });
    const envFile = process.env.CLAUDE_ENV_FILE;
    if (envFile) {
      fs.appendFileSync(envFile,
        `TEST_STATUSLINE_SESSION=${prefix}\nTEST_STATUSLINE_PROJECT=${cwd}\n`, 'utf-8');
    }
    cleanStaleFiles(statusDir);
  } catch (e) {
    process.stderr.write(`[TEST-STATUSLINE] Hook error: ${e}\n`);
  }
  process.stdout.write('{}');
});
```

---

### Step 2: Compute the base64-encoded commands

Open a Node.js REPL (or run as a script) to generate the base64 values you need:

```javascript
// Run this in Node.js to get your base64 strings
const Buffer = require('node:buffer').Buffer;

// 1. Your existing ccstatusline command (copy it from ~/.claude/settings.json)
const userCmd = 'npx -y ccstatusline@latest';
const userB64 = Buffer.from(userCmd).toString('base64');
console.log('User base64:', userB64);

// 2. The managed (test progress) command
const managedCmd = `node -e "require(require('path').join(require('os').homedir(), '.dev-pomogator', 'tools', 'test-statusline', 'statusline_render.cjs'))"`;
const managedB64 = Buffer.from(managedCmd).toString('base64');
console.log('Managed base64:', managedB64);
```

This will output something like:

```
User base64:    bnB4IC15IGNjc3RhdHVzbGluZUBsYXRlc3Q=
Managed base64: bm9kZSAtZSAicmVxdWlyZShyZXF1aXJlKCdwYXRoJykuam9pbihyZXF1aXJlKCdvcycpLmhvbWVkaXIoKSwgJy5kZXYtcG9tb2dhdG9yJywgJ3Rvb2xzJywgJ3Rlc3Qtc3RhdHVzbGluZScsICdzdGF0dXNsaW5lX3JlbmRlci5janMnKSki
```

**Important:** If your actual ccstatusline command is different from `npx -y ccstatusline@latest`, use whatever is currently in your `~/.claude/settings.json` under `statusLine.command`.

---

### Step 3: Update `~/.claude/settings.json`

Open `~/.claude/settings.json` and replace the existing `statusLine` entry. The current one probably looks like:

```json
{
  "statusLine": {
    "command": "npx -y ccstatusline@latest"
  }
}
```

Replace it with the wrapper command, using the base64 values from Step 2:

```json
{
  "statusLine": {
    "command": "node -e \"require(require('path').join(require('os').homedir(), '.dev-pomogator', 'tools', 'test-statusline', 'statusline_wrapper.cjs'))\" --user-b64 bnB4IC15IGNjc3RhdHVzbGluZUBsYXRlc3Q= --managed-b64 bm9kZSAtZSAicmVxdWlyZShyZXF1aXJlKCdwYXRoJykuam9pbihyZXF1aXJlKCdvcycpLmhvbWVkaXIoKSwgJy5kZXYtcG9tb2dhdG9yJywgJ3Rvb2xzJywgJ3Rlc3Qtc3RhdHVzbGluZScsICdzdGF0dXNsaW5lX3JlbmRlci5janMnKSki"
  }
}
```

**Why base64?** The wrapper receives both commands as base64-encoded strings to avoid shell escaping nightmares -- especially on Windows where `cmd.exe` handles quotes differently from bash.

---

### Step 4: Configure the SessionStart hook

Add the hook to your project's `.claude/settings.json` (this is the **project-level** file, not the global one from Step 3):

```json
{
  "hooks": {
    "SessionStart": [
      {
        "type": "command",
        "command": "node .dev-pomogator/tools/test-statusline/session_start_hook.cjs"
      }
    ]
  }
}
```

If you already have other hooks in `SessionStart`, just add this entry to the array.

---

### Step 5: Add `.test-status` to `.gitignore`

Add this line to your project's `.gitignore`:

```
.dev-pomogator/.test-status/
```

The YAML status files are ephemeral per-session data and should not be committed.

---

### Step 6: Restart Claude Code and verify

1. Close and reopen Claude Code (or start a new session)
2. You should see your ccstatusline output as usual (git branch + time)
3. The test progress portion will show a dim idle indicator: `0% [----------] no test runs`

To see it in action, run tests through the wrapper:

```bash
node .dev-pomogator/tools/test-statusline/test_runner_wrapper.cjs --framework vitest -- npx vitest run
```

Replace `vitest` and the command with your actual test framework. While tests run, the statusline will update to show real-time progress.

---

## How It Works (Architecture)

```
Claude Code polls statusline every ~3-5 seconds
        |
        v
statusline_wrapper.cjs (the single registered command)
   |                    |
   v                    v
ccstatusline         statusline_render.cjs
(git branch+time)    (reads YAML status file)
   |                    |
   v                    v
"main | 12:45"       "76% [========--] 38ok 2err"
   \                  /
    `--- combined ---'
    "main | 12:45 | 76% [========--] 38ok 2err"
```

**Data flow for test progress:**

1. **You run tests** through `test_runner_wrapper.cjs`
2. The wrapper spawns the test command, captures output, writes YAML status updates to `.dev-pomogator/.test-status/status.{session}.yaml`
3. Writes are **atomic** (write to temp file, then `fs.renameSync`) and **throttled** (max 1 per second)
4. Every few seconds, Claude Code invokes the wrapper command
5. The wrapper runs ccstatusline and statusline_render.cjs
6. statusline_render.cjs reads the YAML file and outputs a progress bar
7. The wrapper combines both outputs with ` | `

---

## Windows-Specific Notes

- All scripts use `.cjs` (CommonJS) format -- no ESM, no TypeScript transpilation needed. Claude Code runs them via `node script.cjs` directly.
- `windowsHide: true` is set on all `spawnSync` calls to prevent the brief `cmd.exe` window flash that happens on Windows.
- Paths use `path.join()` and `os.homedir()` everywhere -- no hardcoded forward slashes or Unix paths.
- Windows `\r\n` line endings are normalized to `\n` when parsing YAML (the `raw.replace(/\r$/, '')` in the render script).
- PID liveness checking (`process.kill(pid, 0)`) works on Windows -- Node.js internally uses `OpenProcess` + `GetExitCodeProcess`.

---

## Troubleshooting

### Check the diagnostic log

```bash
type %USERPROFILE%\.dev-pomogator\logs\statusline.log
```

Or in bash/Git Bash:

```bash
cat ~/.dev-pomogator/logs/statusline.log
```

The wrapper logs every invocation with timing, exit codes, and output sizes. Look for `TIMEOUT` or error messages.

### Verify base64 values are correct

```javascript
// Quick validation in Node.js
const decoded = Buffer.from('YOUR_BASE64_HERE', 'base64').toString('utf-8');
console.log(decoded);
// Should show the original command
```

### ccstatusline works but test progress is always idle

- Check that the SessionStart hook ran: look for `TEST_STATUSLINE_SESSION` in the Claude Code environment
- Check that the status directory exists: `ls .dev-pomogator/.test-status/`
- Run tests through the wrapper (not directly via `npm test`) -- the wrapper is what writes the YAML file

### Neither statusline shows anything

- Verify `~/.claude/settings.json` has the correct `statusLine.command`
- Check that `statusline_wrapper.cjs` exists at `~/.dev-pomogator/tools/test-statusline/statusline_wrapper.cjs`
- Try running the wrapper command directly in your terminal to see error output

### Reverting to ccstatusline only

If something goes wrong and you want to go back to just ccstatusline, edit `~/.claude/settings.json` and replace the wrapper command with your original:

```json
{
  "statusLine": {
    "command": "npx -y ccstatusline@latest"
  }
}
```

---

## Summary

| Component | File | Purpose |
|-----------|------|---------|
| Render script | `statusline_render.cjs` | Reads YAML, outputs ANSI progress bar |
| Wrapper | `statusline_wrapper.cjs` | Runs ccstatusline + render, combines output |
| Test wrapper | `test_runner_wrapper.cjs` | Spawns tests, writes YAML status file |
| Session hook | `session_start_hook.cjs` | Creates status dir, sets env vars, cleans stale files |
| Global config | `~/.claude/settings.json` | Points `statusLine` to the wrapper (with base64 args) |
| Project config | `.claude/settings.json` | Registers the SessionStart hook |
