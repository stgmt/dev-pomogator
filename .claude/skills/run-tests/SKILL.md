---
name: run-tests
description: >
  Centralized wrapper for ANY long-running command — test frameworks
  (vitest/jest/pytest/dotnet/rust/go) AND non-test long bg via `--framework generic`
  (npm run build, dotnet ef migrations, sleep). Provides persistent log on disk
  + YAML status tracking — survives Claude Code Bash tool bg capture drops on Windows.
  INVOKE PROACTIVELY whenever you plan to run `npm test`, `pytest`, `dotnet test`,
  `cargo test`, `go test`, `vitest`, `jest` — especially in background. Also use
  for any non-test long bg command (build, migrations, smoke runs) via generic mode.
  Detects framework from project config files. Wraps with statusline/TUI monitoring.
allowed-tools: Read, Bash, Glob, Skill, Monitor
---

# /run-tests — Centralized Test Runner

## Mission

Run tests through the centralized wrapper that provides YAML status tracking for statusline and TUI monitoring. Detects the test framework from project config files. Also supports `--framework generic` for non-test long bg commands (npm build, migrations, sleep) — uses the same wrapper infrastructure for unified persistent log + YAML status.

## When triggered

- **Manually**: User runs `/run-tests [args]`
- **Proactive auto-invocation** (PREFERRED): AI calls `Skill("run-tests")` whenever planning to run `npm test`, `pytest`, `dotnet test`, `cargo test`, `go test`, `vitest`, `jest` via Bash tool — **especially with `run_in_background: true`**. Avoids Anthropic Claude Code Bash tool bugs (#16305, #21915, #36915, #50616) that drop bg stdout capture on Windows + Git Bash.
- **Smart converter fallback**: if raw `dotnet test`/`pytest`/etc invocation reaches Bash tool, `test_guard.ts` PreToolUse hook denies + returns ready-to-paste wrapper command in `permissionDecisionReason`. AI copies the converted command.
- **Generic mode for non-test long bg**: AI invokes `/run-tests --framework generic -- <command>` for builds, migrations, or any command expected to run > 60 seconds. Examples:
  - `/run-tests --framework generic -- npm run build`
  - `/run-tests --framework generic -- dotnet ef migrations add InitialMigration`
  - `/run-tests --framework generic -- sleep 60`

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
node .dev-pomogator/tools/test-statusline/test_runner_wrapper.cjs --framework <detected-framework> -- <test-command>
```

**ВАЖНО — `node`, не `bash`:** файл имеет расширение `.cjs` и shebang `#!/usr/bin/env node`. Запуск через `bash file.cjs` пытается распарсить файл как shell-скрипт и валится с `syntax error near unexpected token '('`. Используй `node file.cjs` (либо `./file.cjs` если executable bit стоит — на Windows не работает, поэтому `node` — кросс-платформенный default).

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
node .dev-pomogator/tools/test-statusline/test_runner_wrapper.cjs --framework <detected-framework> -- docker compose -f docker-compose.test.yml run --rm test <test-command>
```

**Cross-platform note:** The wrapper uses `cross-spawn` for transparent cross-platform command resolution on all OSes.

Run the built command using the Bash tool.

### Step 3.5: Start Monitor for real-time notifications

After launching tests with `run_in_background: true`, start a Monitor to get real-time failure notifications and progress updates in the chat. This lets Claude react to failures immediately instead of waiting for the entire test suite to finish.

```
Monitor(
  command: "bash .dev-pomogator/tools/tui-test-runner/test-monitor.sh",
  description: "Test progress: failures and completion",
  persistent: true,
  timeout_ms: 1800000
)
```

The monitor script polls the YAML status file and emits filtered events:
- `❌ FAIL: <test name>` — instant, on each new failure
- `📊 N/T (P%) — X✅ Y❌` — every 30s when counts change
- `⏳ Still running: X✅ — no new results for Ns` — alive but no progress
- `⚠️ STALL: YAML not updated for Ns` — heartbeat dead, tests may be hung
- `✅/❌ DONE: summary` — terminal state, monitor auto-exits

**When to use Monitor:** Always use Monitor when running tests in background. It adds zero overhead (read-only YAML polling) and enables Claude to start investigating failures while remaining tests are still running.

**When NOT to use Monitor:** Skip if running a quick single-test filter that completes in <30 seconds — the Bash completion notification is sufficient.

**Docker tests:** The monitor auto-detects `.dev-pomogator/.docker-status/` (Docker volume-mounted YAML). Pass the directory explicitly if needed:
```
command: "bash .dev-pomogator/tools/tui-test-runner/test-monitor.sh .dev-pomogator/.docker-status"
```

**On Monitor timeout:** If the Monitor times out before tests finish, re-arm it — the startup snapshot logic seamlessly picks up the active run from current state.

### Step 3.6: Host-bypass для non-destructive тестов (dev-pomogator-specific)

> **Применимо только к dev-pomogator repo** (его собственный test suite). В target проектах не нужно — там нет ensure-docker.ts setup.

В dev-pomogator существует `tests/setup/ensure-docker.ts` который throw-ит при запуске вне Docker. Причина — большинство e2e тестов dеструктивны: удаляют `~/.claude/`, `~/.dev-pomogator/`, `.claude/settings.json` через `setupCleanState()`. На host это убьёт активную сессию пользователя.

**Но некоторые тесты — pure unit / pure logic** (не вызывают `setupCleanState()`, не трогают HOME): например `tests/e2e/specs-generator-variant-matrix.test.ts` импортирует модули и проверяет regex/audit логику. Такие тесты безопасно запустить host без Docker overhead (351ms vs 7-12 минут Docker run).

**Когда применять host-bypass:**

- Тест-файл импортирует модули напрямую и НЕ вызывает `setupCleanState()` / `runInstaller()` / `spawnSync`
- Pure logic / regex / parser тесты в одном файле
- Iterative debug-loop где хочется fast feedback на единственный тест

**Когда НЕ применять (использовать Docker через `--docker`):**

- Любой `*-installer*.test.ts`, `claude-installer.test.ts` — destructive
- Тесты с `setupCleanState()` / `initGitRepo()` / writes в `~/.claude/`
- Любой тест который spawnSync-ит installer / hooks
- Если не уверен — Docker

**Команда host-bypass:**

```bash
DEVPOM_ALLOW_HOST_TESTS=1 SKIP_BUILD_CHECK=1 \
  node .dev-pomogator/tools/test-statusline/test_runner_wrapper.cjs \
  --framework vitest -- npx vitest run tests/e2e/<file>.test.ts
```

**Что делает каждый env / флаг:**

| Часть команды | Зачем |
|---------------|-------|
| `DEVPOM_ALLOW_HOST_TESTS=1` | Bypass `tests/setup/ensure-docker.ts` throw — explicit opt-in для host run |
| `SKIP_BUILD_CHECK=1` | Bypass PreToolUse `build_guard.ts` (если src/ новее dist/, иначе блок) |
| `node` (НЕ `bash`) | Wrapper это `.cjs` с `#!/usr/bin/env node` shebang — bash не парсит |
| `--framework vitest` | Wrapper auto-detection ненадёжен; явный флаг надёжнее |
| `--` separator | Всё после идёт как-есть в test runner |
| `npx vitest run tests/e2e/<file>.test.ts` | Файловый filter — runs только конкретный тест |

**Пример (variant-matrix unit тесты):**

```bash
DEVPOM_ALLOW_HOST_TESTS=1 SKIP_BUILD_CHECK=1 \
  node .dev-pomogator/tools/test-statusline/test_runner_wrapper.cjs \
  --framework vitest -- npx vitest run tests/e2e/specs-generator-variant-matrix.test.ts
```

Результат: 17/17 passed за 351ms vs ~10 минут Docker run.

**Гарантии test-guard hook:** прямой `npx vitest` блокируется (centralized-test-runner rule). Через wrapper — разрешено, потому что wrapper и есть централизованный entry point.

### Step 4: Report results

After execution completes (or when Monitor emits DONE), report:
- Exit code (0 = passed, non-zero = failed)
- Framework detected
- If YAML status file exists, read final status for summary (passed/failed/skipped counts)
