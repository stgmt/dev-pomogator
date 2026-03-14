---
description: "Centralized test runner. Auto-detects framework (vitest/jest/pytest/dotnet/rust/go), runs tests through wrapper for statusline & TUI monitoring. Use instead of direct test commands."
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

### Step 2: Check docker-only-tests rule

If `.claude/rules/docker-only-tests.md` exists in the project, tests MUST run through Docker. Automatically add `--docker` flag unless already specified.

### Step 3: Build and run test command

Build the command using the dispatch table:

| Framework | Command | Filter |
|-----------|---------|--------|
| vitest | `npx vitest run` | `--grep "filter"` |
| jest | `npx jest` | `--testNamePattern "filter"` |
| pytest | `python -m pytest` | `-k "filter"` |
| dotnet | `dotnet test` | `--filter "filter"` |
| rust | `cargo test` | `-- filter` |
| go | `go test ./...` | `-run "filter"` |

Wrap with `test_runner_wrapper.sh` for YAML status tracking:

```bash
bash .dev-pomogator/tools/test-statusline/test_runner_wrapper.sh <test-command>
```

If `--docker` flag: set `COMPOSE_PROJECT_NAME` as env var prefix and pass Docker command to wrapper:

```bash
COMPOSE_PROJECT_NAME=devpom-test-${TEST_STATUSLINE_SESSION:-manual} bash .dev-pomogator/tools/test-statusline/test_runner_wrapper.sh docker compose -f docker-compose.test.yml run --rm test <test-command>
```

**Docker Isolation:** Each test run gets a unique `COMPOSE_PROJECT_NAME` based on the session prefix (`TEST_STATUSLINE_SESSION`). This prevents container name conflicts when multiple Claude Code sessions run tests simultaneously. The Docker image is shared across sessions via `image: dev-pomogator-test:local` in `docker-compose.test.yml`.

**Important:** `COMPOSE_PROJECT_NAME=...` MUST be an env var prefix (before `bash`), NOT an argument to the wrapper script.

Run the built command in the terminal.

### Step 4: Report results

After execution completes, report:
- Exit code (0 = passed, non-zero = failed)
- Framework detected
- If YAML status file exists, read final status for summary (passed/failed/skipped counts)
