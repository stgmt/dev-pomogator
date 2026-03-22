# Design

## Реализуемые требования

- [FR-1: PostToolUse marker creation](FR.md#fr-1-posttooluse-marker-creation-feature1)
- [FR-2: Stop hook блокировка](FR.md#fr-2-stop-hook-блокировка-при-активном-marker-feature1)
- [FR-3: TTL expire маркера](FR.md#fr-3-ttl-expire-маркера-feature2)
- [FR-4: Fail-open](FR.md#fr-4-fail-open-при-ошибках-hook-feature1)

## Компоненты

- `mark-bg-task.sh` — PostToolUse hook: парсит stdin JSON, ищет "Command running in background" в stdout, создаёт marker
- `stop-guard.sh` — Stop hook: проверяет marker, если < 15 мин → block, иначе → approve

## Где лежит реализация

- Hook scripts: `extensions/test-statusline/tools/bg-task-guard/`
- Hook config: `extensions/test-statusline/extension.json` → hooks.claude
- Installed: `.dev-pomogator/tools/bg-task-guard/`
- Marker file: `.dev-pomogator/.bg-task-active`

## Директории и файлы

- `extensions/test-statusline/tools/bg-task-guard/mark-bg-task.sh`
- `extensions/test-statusline/tools/bg-task-guard/stop-guard.sh`
- `extensions/test-statusline/extension.json`

## Алгоритм

### mark-bg-task.sh (PostToolUse on Bash)

1. Read stdin JSON
2. Extract `tool_output.stdout` via jq
3. If stdout contains "Command running in background" → write ISO timestamp to `.dev-pomogator/.bg-task-active`
4. Exit 0 (always — fail-open)

### stop-guard.sh (Stop hook)

1. Check if `.dev-pomogator/.bg-task-active` exists
2. If not exists → exit 0 (approve stop)
3. Read file mtime, calculate age in minutes
4. If age >= 15 → delete stale marker → exit 0 (approve stop)
5. If age < 15 → output `{"decision": "block", "reason": "Background task running (Nmin ago). Continue working or wait for results."}` → exit 0

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
