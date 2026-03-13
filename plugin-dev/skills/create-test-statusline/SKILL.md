---
name: Create Test Statusline
description: This skill should be used when the user asks to "create test statusline", "add test progress to statusline", "show test results in statusline", "build test runner statusline", "test progress bar in Claude Code", "statusline for test runs", "real-time test progress", "test runner wrapper with statusline", or mentions building a system to display test execution progress in the Claude Code statusline.
version: 0.1.0
---

# Create Test Statusline for Claude Code

Build a complete test progress statusline extension for Claude Code. The extension captures test runner output, tracks progress via YAML status files, and renders a real-time progress bar in the Claude Code statusline.

**Architecture (4 layers):**

1. **Capture** - Test runner wrapper spawns tests, pipes stdout through framework adapter
2. **Session Init** - SessionStart hook creates status directory, writes env vars
3. **YAML Writer** - Wrapper writes throttled, atomic YAML status updates
4. **Render** - Statusline command reads YAML, outputs ANSI progress bar

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

Cross-platform considerations: use `os.homedir()` and `path.join()` for portable paths; normalize `\r\n` to `\n`; see `references/cross-platform.md`.

## Step 4: Implement Test Runner Wrapper

Create a CJS wrapper script that spawns the test command as a child process, captures stdout, and writes YAML status updates.

**Requirements:**
- Spawn test command via `child_process.spawnSync` with `shell: true`
- **Throttled YAML writes** - maximum 1 write per 1000ms to avoid I/O pressure
- **Atomic writes** - write to temp file, then `fs.renameSync` to final path (NEVER write directly)
- Track state transitions: `idle` -> `running` -> `passed`/`failed`/`error`
- Write `pid` field for liveness checking by render script

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

**1. statusLine** - Register the render script:
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

**2. hooks** - Register SessionStart hook:
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
- Write `TEST_STATUSLINE_SESSION={prefix}` and `TEST_STATUSLINE_PROJECT={cwd}` to `$CLAUDE_ENV_FILE` (makes session ID available to render script as env var fallback)
- Clean stale status files (older than 24h, idle older than 1h, dead PIDs)

**3. toolFiles** - List all managed files for the updater:
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

See `examples/extension.json` and `examples/session-start-hook.cjs` for complete implementations.

## Step 7: Statusline Coexistence (Wrapper)

If the user already has a statusline (or other extensions provide one), use a wrapper script to combine multiple statusline outputs.

**Problem:** Claude Code supports only one `statusLine` command per configuration. Two extensions with `statusLine` would conflict.

**Solution:** A wrapper script that runs both commands in parallel and combines their output:

1. Encode both commands as base64 (avoids shell escaping issues)
2. Run both with `spawnSync` in parallel, each with a 5-second timeout
3. Combine output: `{userOutput} | {managedOutput}`
4. If either command fails or times out, show only the successful one

**Wrapper invocation in extension.json:**
```json
{
  "statusLine": {
    "claude": {
      "type": "command",
      "command": "node .dev-pomogator/tools/{name}/statusline_wrapper.cjs --user-b64 {base64_user_cmd} --managed-b64 {base64_managed_cmd}"
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
- Log diagnostics to `~/.dev-pomogator/logs/statusline.log` with rotation

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

For detailed testing strategies, fixture examples, and Docker integration patterns, see `references/testing-guide.md`.

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
- **`examples/extension.json`** - Extension manifest template
- **`examples/status-fixture.yaml`** - YAML v2 fixture for testing

### Scaffold Script

- **`scripts/scaffold-test-statusline.sh`** - Generate extension skeleton with one command
- **`scripts/README.md`** - Scaffold script documentation and usage
