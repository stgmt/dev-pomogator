---
name: Create Test Statusline
description: Build a test progress statusline extension for Claude Code that shows real-time test execution in the status bar. Use this skill whenever the user wants to display test progress, build a test runner wrapper, create a statusline extension, add a progress bar for tests, integrate vitest/jest/pytest output into Claude Code's statusline, or mentions YAML status files for test tracking — even if they don't use the exact term "statusline". Do NOT use for building TUI test dashboards or terminal-based test runners with interactive UI.
version: 0.1.0
---

# Create Test Statusline for Claude Code

Build a complete test progress statusline extension for Claude Code. The extension captures test runner output, tracks progress via YAML status files, and renders a real-time progress bar in the Claude Code statusline.

**Architecture (4 layers):**

1. **Capture** - Test runner wrapper spawns tests, pipes stdout through framework adapter
2. **Session Init** - SessionStart hook creates status directory, writes env vars
3. **YAML Writer** - Wrapper writes throttled, atomic YAML status updates
4. **Render** - Statusline command reads YAML, outputs ANSI progress bar

## Prerequisites

- **Claude Code** installed and working
- **Node.js** >= 18 (for CJS scripts and `spawnSync`)
- Project uses the `.dev-pomogator/` directory structure (created by the dev-pomogator installer)
- Understanding that the render script is **stateless and polled** — Claude Code calls it repeatedly on a timer; there is no file watcher or event stream

## Step 1: Determine Test Framework

Detect the project's test framework automatically. Check config files in project root:

| Config File | Framework | Run Command |
|-------------|-----------|-------------|
| `vitest.config.ts` / `.js` / `.mts` | vitest | `npx vitest run` |
| `jest.config.ts` / `.js` / `.cjs` | jest | `npx jest` |
| `pytest.ini` / `conftest.py` / `pyproject.toml` (with `[tool.pytest]`) | pytest | `python -m pytest` |
| `*.csproj` / `*.sln` | dotnet | `dotnet test` |
| `Cargo.toml` | rust | `cargo test` |
| `go.mod` | go | `go test ./...` |

**Priority order:** Check top-to-bottom; first match wins.

**Fallbacks:**
- Environment variable override: `TEST_STATUSLINE_FRAMEWORK=jest`
- If no config detected, ask the user which framework they use

For the complete dispatch table (commands + filter arguments per framework) and auto-detect algorithm, see `references/adapter-patterns.md`.

## Step 2: Create Extension Structure

Generate the extension skeleton using the scaffold script:

```bash
bash plugin-dev/skills/create-test-statusline/scripts/scaffold-test-statusline.sh --name my-test-statusline
```

This creates:

```
extensions/my-test-statusline/
  extension.json          # manifest with statusLine + hooks
  tools/my-test-statusline/
    statusline_render.cjs   # render script (Step 3)
    test_runner_wrapper.cjs # wrapper script (Step 4)
    session_start_hook.cjs  # SessionStart hook (Step 6)
    package.json            # {"type": "commonjs"}
```

Alternatively, create the structure manually following `examples/extension.json` as template.

> **Note:** Throughout this guide, `{name}` refers to your extension name (e.g. `my-test-statusline`). Replace it with the actual name you chose in this step.

## Step 3: Implement Render Script

Create the statusline render script in CommonJS format. Claude Code invokes this via `node <script>` and passes JSON on stdin.

**Requirements:**
- **CJS format** (`.cjs`) - Claude Code runs via `node`, no transpilation available
- Read JSON from stdin: `{ "session_id": "...", "cwd": "..." }`
- Extract session prefix (first 8 chars of session_id)
- Locate YAML status file: `{cwd}/.dev-pomogator/.test-status/status.{prefix}.yaml`
- Parse flat YAML fields (no library needed - line-by-line key:value parsing)
- Render ANSI progress bar with color coding (green/yellow/red based on failure rate)
- Handle idle state gracefully (dim progress bar with "no test runs")

**Session ID flow:** Claude Code passes `session_id` in the stdin JSON object. As fallback, read `TEST_STATUSLINE_SESSION` environment variable (written by SessionStart hook to `CLAUDE_ENV_FILE`).

**Output format examples:**
- Running: `76% [========--] 38ok 2err 10... 0:45`
- Passed: `ok 50/50 1:23`
- Failed: `err 48/50 (2 failed) 1:23`
- Idle: `0% [----------] no test runs`

See `examples/minimal-render.cjs` for a complete working implementation.

**Execution model:** The render script is stateless — Claude Code invokes it repeatedly (every few seconds). Each invocation reads the current YAML file from disk, parses it, renders output, and exits. There is no file watcher, no caching, no persistent state. Throttling happens on the writer side (wrapper writes YAML at most once per 1000ms), not the reader side.

**Diagnostic logging:** Log errors to `~/.dev-pomogator/logs/statusline.log` for troubleshooting. Never fail on logging — wrap in try/catch.

Cross-platform considerations: use `os.homedir()` and `path.join()` for portable paths; normalize `\r\n` to `\n`; see `references/cross-platform.md`.

## Step 4: Implement Test Runner Wrapper

Create a CJS wrapper script that spawns the test command as a child process, captures stdout, and writes YAML status updates.

**Requirements:**
- Spawn test command via `child_process.spawnSync` with `shell: true`
- **Throttled YAML writes** - maximum 1 write per 1000ms to avoid I/O pressure
- **Atomic writes** - write to temp file, then `fs.renameSync` to final path (NEVER write directly)
- Track state transitions: `idle` -> `running` -> `passed`/`failed`/`error`
- Distinguish `failed` (tests ran but some failed, exit code non-zero) from `error` (command could not start, crashed before producing output, or timed out)
- Write `pid` field for liveness checking by render script
- **Diagnostic logging:** Log wrapper events to `~/.dev-pomogator/logs/statusline.log` (same log as render script). Wrap in try/catch — never fail on logging.

**Fallback mode (no adapter):** Without a framework adapter, the wrapper operates in basic mode:
1. Set state to `running` with `total: 0`
2. Spawn test command, pipe all output to stdout
3. On exit: set state to `passed` (exit code 0) or `failed` (non-zero)

This provides start/end tracking without real-time progress. Add a framework adapter (Step 5) for granular test-by-test progress.

**With adapter:** Pipe each stdout line through `adapter.parseLine(line)`. Each `TestEvent` updates counters (passed, failed, running, percent). Throttled YAML writes reflect progress in real-time.

See `examples/minimal-wrapper.cjs` for a complete implementation with both modes.

For YAML status file format specification, see `references/yaml-protocol.md`.

## Step 5: Create Framework Adapter (Optional)

Add a framework adapter to enable real-time test progress (not just start/end).

**Adapter interface:**
```javascript
// parseLine(line: string) → TestEvent | null
// TestEvent = { type, suiteName, testName, duration, errorMessage }
// Types: suite_start, test_pass, test_fail, test_skip, summary, error
```

Each adapter uses regex patterns to parse framework-specific stdout format. For example, vitest outputs `checkmark testName 5ms` for passed tests.

**Integration:** The wrapper calls `adapter.parseLine(line)` for each stdout line. Non-null events update YAML counters. The adapter is a plain CJS function - no class hierarchy needed for a single framework.

For multiple framework support, see the dispatch table and adapter development guide in `references/adapter-patterns.md`. A TypeScript reference implementation is available in `examples/vitest-adapter.ts`.

## Step 6: Configure Extension Manifest

Set up `extension.json` with three key sections:

**1. statusLine** — Register the render script.

The snippet below shows the project-local relative form (works for development/testing). For the global `~/.claude/settings.json` installation, use the portable command pattern shown after the snippet:

```json
{
  "statusLine": {
    "claude": {
      "type": "command",
      "command": "node .dev-pomogator/tools/{name}/statusline_render.cjs"
    }
  }
}
```

**Important — global installation:** The `statusLine` command is installed **globally** to `~/.claude/settings.json`, NOT to the project's `.claude/settings.json`. This is because statusline must work across all projects. Hooks and toolFiles remain project-local.

**Portable command:** For global statusLine, use a portable command that resolves paths at runtime:
```javascript
// Generate portable command that works regardless of home directory location
const cmd = `node -e "require(require('path').join(require('os').homedir(), '.dev-pomogator', 'tools', '{name}', 'statusline_render.cjs'))"`;
```

This ensures the command works on any machine after installation, not just the machine where it was configured.

**2. hooks** — Register SessionStart hook:
```json
{
  "hooks": {
    "claude": {
      "SessionStart": "node .dev-pomogator/tools/{name}/session_start_hook.cjs"
    }
  }
}
```

The SessionStart hook performs three tasks:
- Create status directory: `{cwd}/.dev-pomogator/.test-status/`
- Write `TEST_STATUSLINE_SESSION={prefix}` and `TEST_STATUSLINE_PROJECT={cwd}` to `$CLAUDE_ENV_FILE` (makes session ID available to render script and wrapper as env var fallback)
- Clean stale status files — three cleanup rules:
  - Files older than 24h → delete
  - Files with `state: running` but dead PID → **rewrite to `failed`** (not delete — preserves diagnostics)
  - Files with `state: idle` older than 1h → delete

**Why dual PID repair:** Both the render script (Step 3) and the SessionStart hook repair dead-running files. The render script catches dead PIDs in real-time during statusline refresh. The hook catches them at session start as a batch cleanup. Both are needed — render handles immediate cases, hook handles files from old sessions.

**3. toolFiles** — List all managed files for the updater:
```json
{
  "toolFiles": {
    "{name}": [
      ".dev-pomogator/tools/{name}/statusline_render.cjs",
      ".dev-pomogator/tools/{name}/test_runner_wrapper.cjs",
      ".dev-pomogator/tools/{name}/session_start_hook.cjs",
      ".dev-pomogator/tools/{name}/package.json"
    ]
  }
}
```

**4. envRequirements** — Declare environment variables:
```json
{
  "envRequirements": [
    { "name": "TEST_STATUSLINE_ENABLED", "required": false, "default": "true",
      "description": "Set to 'false' to disable the statusline extension" },
    { "name": "TEST_STATUSLINE_FRAMEWORK", "required": false,
      "description": "Override framework auto-detection (vitest/jest/pytest/dotnet/rust/go)" }
  ]
}
```

**Complete env var reference:**

| Variable | Set by | Read by | Purpose |
|----------|--------|---------|---------|
| `TEST_STATUSLINE_SESSION` | SessionStart hook → CLAUDE_ENV_FILE | Render, Wrapper | Session prefix (8 chars) |
| `TEST_STATUSLINE_PROJECT` | SessionStart hook → CLAUDE_ENV_FILE | Render, Wrapper | Project cwd path |
| `TEST_STATUSLINE_ENABLED` | User env | SessionStart hook | Disable extension (`false`) |
| `TEST_STATUSLINE_FRAMEWORK` | User env | Wrapper (Step 1) | Override auto-detect |
| `CLAUDE_ENV_FILE` | Claude Code | SessionStart hook | Path to env file for persisting vars |

See `examples/extension.json` and `examples/session-start-hook.cjs` for complete implementations.

## Step 7: Statusline Coexistence (Wrapper)

If the user already has a statusline (or other extensions provide one), use a wrapper script to combine multiple statusline outputs.

**Problem:** Claude Code supports only one `statusLine` command per configuration. Two extensions with `statusLine` would conflict.

**Default user statusline:** Many users install `ccstatusline` (via `npx -y ccstatusline@latest`) which provides git branch, time, and system info. The installer should detect an existing statusline command in `~/.claude/settings.json` and automatically configure the wrapper if one is found.

**Detection logic:**
```javascript
const os = require('node:os');
const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
let existingCmd = '';
try {
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  existingCmd = settings?.statusLine?.command || '';
} catch (_) {}
// If existingCmd is non-empty, configure wrapper; otherwise use direct render
```

**Solution:** A wrapper script that runs both commands in parallel and combines their output:

1. Encode both commands as base64 (avoids shell escaping issues)
2. Run both with `spawnSync` sequentially, each with a 5-second timeout
3. Combine output: `{userOutput} | {managedOutput}`
4. If either command fails or times out, show only the successful one

**Generating base64 commands:**
```javascript
const userB64 = Buffer.from(existingCmd).toString('base64');
const managedB64 = Buffer.from(
  `node -e "require(require('path').join(require('os').homedir(), '.dev-pomogator', 'tools', '{name}', 'statusline_render.cjs'))"`
).toString('base64');
```

**Wrapper invocation in extension.json:**
```json
{
  "statusLine": {
    "claude": {
      "type": "command",
      "command": "node -e \"require(require('path').join(require('os').homedir(), '.dev-pomogator', 'tools', '{name}', 'statusline_wrapper.cjs'))\" --user-b64 {base64_user_cmd} --managed-b64 {base64_managed_cmd}"
    }
  }
}
```

**Key patterns:**
- `Buffer.from(cmd).toString('base64')` to encode commands
- `Buffer.from(b64, 'base64').toString('utf-8')` to decode
- Round-trip validation: re-encode decoded value and compare with input
- `spawnSync` with `{ shell: true, windowsHide: true, timeout: 5000 }`
- Preserve newlines in output (Claude Code renders `\n` as separate statusline rows)
- Log diagnostics to `~/.dev-pomogator/logs/statusline.log` (add rotation for production use)

See `examples/statusline-wrapper.cjs` for the complete implementation and `references/cross-platform.md` for portable path patterns.

## Step 8: Write Tests

Test each component independently using fixture-based approach:

**Render script tests:**
- Create YAML fixture files with known state (running, passed, failed, idle)
- Spawn render script with `spawnSync`, inject JSON stdin with `session_id`
- Assert stdout contains expected ANSI sequences and values

**Wrapper tests:**
- Run wrapper with a trivial test command (`echo "test"`)
- Verify YAML status file was created with correct state transitions
- Verify atomic write (no partial files)

**Adapter tests:**
- Feed known stdout lines through `parseLine()`
- Assert correct `TestEvent` types and extracted values

**BDD pattern:** Tag test scenarios with `@featureN` for traceability back to requirements.

Read `references/testing-guide.md` for the complete fixture library, per-component test patterns (render, wrapper, adapter, hook, statusline-wrapper), BDD integration with `@featureN` tags, and Docker testing setup.

## Additional Resources

### Reference Documentation

- **`references/yaml-protocol.md`** - YAML v2 status file specification (fields, state machine, atomic writes, throttling, PID liveness)
- **`references/adapter-patterns.md`** - Framework adapter development guide (TestEvent types, dispatch table, auto-detect algorithm, adding new adapters)
- **`references/testing-guide.md`** - Testing patterns for statusline extensions (fixture-based, render/wrapper/adapter testing, BDD, Docker)
- **`references/cross-platform.md`** - Cross-platform patterns (CJS requirement, portable paths, base64 encoding, Windows compatibility)

### Working Examples

- **`examples/minimal-render.cjs`** - Complete render script (~60 lines)
- **`examples/minimal-wrapper.cjs`** - Test runner wrapper with adapter support (~80 lines)
- **`examples/statusline-wrapper.cjs`** - Coexistence wrapper with base64 commands (~70 lines)
- **`examples/vitest-adapter.ts`** - TypeScript reference adapter for vitest
- **`examples/session-start-hook.cjs`** - SessionStart hook with cleanup (~50 lines)
- **`examples/extension.json`** - Extension manifest template (direct statusline)
- **`examples/extension.wrapped.json`** - Extension manifest with statusline wrapper
- **`examples/status-fixture.yaml`** - YAML v2 fixture for testing
- **`examples/vitest-output-fixture.txt`** - Sample vitest stdout for adapter testing

### Scaffold Script

- **`scripts/scaffold-test-statusline.sh`** - Generate extension skeleton with one command
- **`scripts/README.md`** - Scaffold script documentation and usage
