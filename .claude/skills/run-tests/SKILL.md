---
name: run-tests
description: >
  Centralized test runner. Auto-detects framework (vitest/jest/pytest/dotnet/rust/go),
  runs tests through wrapper for statusline & TUI monitoring. Use instead of direct test commands.
allowed-tools: Read, Bash, Glob
---

# /run-tests — Centralized Test Runner

## Mission

Run tests through the centralized wrapper that provides YAML status tracking for statusline and TUI monitoring. Auto-detects the test framework from project config files.

## When triggered

- **Manually**: User runs `/run-tests [args]`
- **Instead of**: Direct `npm test`, `pytest`, `dotnet test`, `cargo test`, `go test` (blocked by test-guard hook)

## Arguments

- `/run-tests` — auto-detect framework, run all tests
- `/run-tests auth` — run tests matching "auth" filter
- `/run-tests --framework vitest` — explicit framework override
- `/run-tests --framework vitest -- --watch` — extra args passed to test runner
- `/run-tests --docker` — run through Docker Compose (for projects with docker-only-tests rule)

## Execution Steps

### Step 0: Sanitize arguments

Before parsing arguments, clean up the input — users often accidentally paste terminal output alongside their real arguments.

1. Strip ANSI escape sequences (e.g. `\u001b[32m`, `\x1b[0m`) from the entire input
2. If args contain `[Pasted text` or `[Pasted content` — warn user about pasted text detected
3. Remove lines that look like terminal output noise: lines containing checkmarks (✓/✗), "passed"/"failed" status messages, ANSI artifacts, or bracket markers like `[Pasted`
4. From the remaining cleaned lines, extract tokens that look like real arguments:
   - Known flags: `--framework`, `--docker`, `--`
   - Everything else: treat as potential test name filter
5. If multiple candidate filter tokens remain, prefer the one that matches an existing test file name (use Glob to check `tests/**/*{token}*`)
6. Trim whitespace from all args

The goal is semantic extraction of the user's intent, not mechanical "take the first line". Terminal output artifacts (status messages, checkmarks, ANSI remnants) should be discarded even after stripping escape codes.

### Step 1: Detect framework

Check project root for config files to determine the test framework:

| File | Framework |
|------|-----------|
| `vitest.config.ts/js/mts` | vitest |
| `jest.config.ts/js/cjs` | jest |
| `pytest.ini`, `conftest.py`, `pyproject.toml` (with [tool.pytest]) | pytest |
| `*.csproj`, `*.sln` | dotnet |
| `Cargo.toml` | rust |
| `go.mod` | go |

If `--framework` argument provided, use that instead.

Use Glob tool to check which config files exist in the project root.

### Step 2: Check docker-only-tests rule

If `.claude/rules/docker-only-tests.md` exists in the project, tests MUST run through Docker. Automatically add `--docker` flag unless already specified.

Use Read tool to check if the rule file exists.

**Note: Build Guard** — PreToolUse hook `build_guard.ts` automatically blocks test execution if build is stale (TypeScript src/ newer than dist/, Docker SKIP_BUILD=1, dotnet --no-build). Bypass: `SKIP_BUILD_CHECK=1`.

### Step 3: Build and run test command

Build the command using the dispatch table:

| Framework | Command | Filter |
|-----------|---------|--------|
| vitest | `npx vitest run` | `-t "filter"` |
| jest | `npx jest` | `--testNamePattern "filter"` |
| pytest | `python -m pytest` | `-k "filter"` |
| dotnet | `dotnet test` | `--filter "filter"` |
| rust | `cargo test` | `-- filter` |
| go | `go test ./...` | `-run "filter"` |

Wrap with `test_runner_wrapper.cjs` for YAML status tracking. **Always pass `--framework`** so the wrapper uses the correct adapter (auto-detection can fail in Docker or nested projects):

```bash
bash .dev-pomogator/tools/test-statusline/test_runner_wrapper.cjs --framework <detected-framework> -- <test-command>
```

If `--docker` flag, check if `scripts/docker-test.sh` exists in the project root:

**Docker mode: wrapper runs INSIDE the container** via Dockerfile CMD. Do NOT wrap in host wrapper — the container already has `test_runner_wrapper.cjs` as its CMD. YAML status files are shared via volume mount.

**If `scripts/docker-test.sh` exists** (preferred — handles build, cleanup, session isolation automatically):

```bash
bash scripts/docker-test.sh
```

With test filter:
```bash
bash scripts/docker-test.sh npx vitest run -t "auth"
```

**IMPORTANT: Each argument MUST be a separate word — do NOT wrap the entire test command in quotes.**

```bash
# CORRECT — each token is a separate shell word:
bash scripts/docker-test.sh npx vitest run -t "auth"

# WRONG — entire command in quotes becomes a single $1 argument:
bash scripts/docker-test.sh "npx vitest run -t auth"
#                            ^^^^^^^^^^^^^^^^^^^^^^^^ docker-test.sh passes this as one arg → node tries to load it as a file path → MODULE_NOT_FOUND
```

`docker-test.sh` uses `"$@"` to forward arguments individually to the container. If you wrap them in one string, Docker receives a single argument and `node` interprets it as a file path.

**If `scripts/docker-test.sh` does NOT exist** (fallback for other projects):

```bash
bash .dev-pomogator/tools/test-statusline/test_runner_wrapper.cjs --framework <detected-framework> -- docker compose -f docker-compose.test.yml run --rm test <test-command>
```

**Cross-platform note:** The wrapper uses `cross-spawn` for transparent cross-platform command resolution on all OSes.

Run the built command using the Bash tool.

### Step 4: Report results

After execution completes, report:
- Exit code (0 = passed, non-zero = failed)
- Framework detected
- If YAML status file exists, read final status for summary (passed/failed/skipped counts)
