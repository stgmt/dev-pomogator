# Design

## Реализуемые требования

- [FR-1: PostToolUse marker creation](FR.md#fr-1-posttooluse-marker-creation-feature1)
- [FR-2: Stop hook блокировка](FR.md#fr-2-stop-hook-блокировка-при-активном-marker-feature1)
- [FR-3: TTL expire маркера](FR.md#fr-3-ttl-expire-маркера-feature2)
- [FR-5: Auto-cleanup marker](FR.md#fr-5-auto-cleanup-marker-при-завершении-background-task-feature3)
- [FR-5: Auto-cleanup marker](FR.md#fr-5-auto-cleanup-marker-при-завершении-background-task-feature3)
- [FR-4: Fail-open](FR.md#fr-4-fail-open-при-ошибках-hook-feature1)

## Компоненты

- `test_runner_wrapper.ts` — **Orchestrator (Task Pattern)**: создаёт marker при старте, пишет YAML (building → running → passed/failed), удаляет marker при exit. Единая точка контроля lifecycle.
- `mark-bg-task.sh` — PostToolUse hook: **NO-OP** (exit 0). Marker creation moved to wrapper.
- `stop-guard.sh` — Stop hook: **reader only**. Проверяет marker + YAML. Freshness check: YAML mtime > 30s → stale, skip. Building state → block с "Building Docker". Per-session marker isolation.

## Где лежит реализация

- Hook scripts: `extensions/test-statusline/tools/bg-task-guard/`
- Hook config: `extensions/test-statusline/extension.json` → hooks.claude
- Installed: `.dev-pomogator/tools/bg-task-guard/`
- Marker files: `.dev-pomogator/.bg-task-active.{session_prefix}` (per-session), `.dev-pomogator/.bg-task-active` (legacy fallback)
- Session config: `.dev-pomogator/.test-status/session.env` (SESSION_PREFIX_LEN source of truth)

## Директории и файлы

- `extensions/test-statusline/tools/bg-task-guard/mark-bg-task.sh`
- `extensions/test-statusline/tools/bg-task-guard/stop-guard.sh`
- `extensions/test-statusline/extension.json`

## Алгоритм

### mark-bg-task.sh (PostToolUse on Bash)

1. Read stdin JSON (Claude Code PostToolUse format: `tool_response`, NOT `tool_output`)
2. Extract `tool_response.backgroundTaskId` via jq (primary detection)
3. Extract `tool_response.stdout` via jq (fallback detection)
4. If `backgroundTaskId` is non-empty OR stdout contains "Command running in background" → write ISO timestamp to `.dev-pomogator/.bg-task-active`
5. If marker exists AND `run_in_background` is NOT true AND `backgroundTaskId` matches marker task ID → task completed → delete marker
6. Exit 0 (always — fail-open)

### stop-guard.sh (Stop hook)

1. Check if `.dev-pomogator/.bg-task-active` exists
2. If not exists → exit 0 (approve stop)
3. Read file mtime, calculate age in minutes
4. If age >= 15 → delete stale marker → exit 0 (approve stop)
5. If age < 15 → read task ID from marker → check if task still running (optional validation)
6. If task no longer running → delete marker → exit 0 (approve stop)
7. If task still running or unknown → output `{"decision": "block", "reason": "Background task running (Nmin ago). Continue working or wait for results."}` → exit 0

## API

N/A — hook scripts, не API endpoints.

## BDD Test Infrastructure

**Classification:** TEST_DATA_ACTIVE
**Evidence:** Фича создаёт marker файл (.bg-task-active) который нужно удалять после теста. Given-шаги предустанавливают marker с определённым возрастом.
**Verdict:** AfterEach cleanup нужен для удаления marker файлов.

### Существующие hooks

Не найдены в проекте (для этого типа тестов).

### Новые hooks

| Hook файл | Тип | Тег/Scope | Что делает | По аналогии с |
|-----------|-----|-----------|------------|---------------|
| afterEach в тест-файле | AfterEach | per-test | Удаляет `.bg-task-active` marker | N/A |

### Cleanup Strategy

afterEach: удалить `.dev-pomogator/.bg-task-active` если существует.

### Test Data & Fixtures

| Fixture/Data | Путь | Назначение | Lifecycle |
|-------------|------|------------|-----------|
| marker file | `.dev-pomogator/.bg-task-active` | Simulated bg task marker | per-test (create in Given, delete in afterEach) |
| stale marker | `.dev-pomogator/.bg-task-active` (mtime 20 min ago) | TTL test | per-test |

### Shared Context / State Management

N/A — marker file is the only shared state, cleaned per-test.
