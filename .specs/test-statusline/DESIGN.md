# Design

## Реализуемые требования

- [FR-1: Statusline Render Script](FR.md#fr-1-statusline-render-script-feature1)
- [FR-1a: Graceful Degradation](FR.md#fr-1a-statusline-render-graceful-degradation-feature1a)
- [FR-2: YAML Status File Protocol](FR.md#fr-2-yaml-status-file-protocol-feature2)
- [FR-3: Atomic YAML Writes](FR.md#fr-3-atomic-yaml-writes-feature2)
- [FR-4: Test Runner Wrapper](FR.md#fr-4-test-runner-wrapper-feature2)
- [FR-5: Session Isolation](FR.md#fr-5-session-isolation-feature3)
- [FR-6: SessionStart Hook](FR.md#fr-6-sessionstart-hook-feature4)
- [FR-7: Stale Session Cleanup](FR.md#fr-7-stale-session-cleanup-feature4)
- [FR-8: Extension Manifest](FR.md#fr-8-extension-manifest-feature5)

## Компоненты

### 1. Statusline Render Script (`statusline_render.sh`)

Bash-скрипт, вызываемый Claude Code для отображения statusline.

**Exports:** stdout — форматированная строка с прогрессом тестов

**Algorithm:**
1. Читает JSON из stdin (cat)
2. Извлекает `session_id` из JSON (jq или grep fallback)
3. Вычисляет `session_id_prefix` = первые 8 символов
4. Ищет `.dev-pomogator/.test-status/status.{prefix}.yaml`
5. Если файл не найден — exit 0 (пустой вывод)
6. Парсит YAML через grep/sed (flat fields)
7. Проверяет stale: если mtime > 10 мин и state=running → не показывать
8. Рендерит progress bar и форматированную строку
9. Выводит на stdout

### 2. Test Runner Wrapper (`test_runner_wrapper.sh`)

Bash-скрипт обёртка для тест-раннера.

**Exports:** exit code тест-процесса; side effect — YAML status file

**Algorithm:**
1. Читает env: `TEST_STATUSLINE_SESSION`, `TEST_STATUSLINE_PROJECT`
2. Определяет status file path
3. Записывает initial YAML (state=running, percent=0)
4. Запускает тест-команду, pipe stdout через парсер
5. На каждой строке output — парсит test results, обновляет YAML
6. При завершении — записывает финальный state (passed/failed)

### 3. SessionStart Hook (`statusline_session_start.ts`)

TypeScript hook для инициализации и cleanup.

**Exports:** JSON `{}` на stdout

**Algorithm:**
1. Читает stdin JSON (session_id, cwd)
2. Создаёт `.dev-pomogator/.test-status/` директорию
3. Пишет `TEST_STATUSLINE_SESSION={prefix}` в `$CLAUDE_ENV_FILE`
4. Удаляет stale files (>24h mtime)
5. Выводит `{}` на stdout, exit 0

### 4. Status Types (`status_types.ts`)

TypeScript интерфейсы для status file protocol.

**Exports:**
- `TestStatus` — интерфейс YAML status file
- `TestSuite` — интерфейс suite entry
- `HookInput` — интерфейс SessionStart hook input

## Где лежит реализация

- Extension source: `extensions/test-statusline/`
- Deployed tools: `.dev-pomogator/tools/test-statusline/`
- Status data: `.dev-pomogator/.test-status/status.{prefix}.yaml`
- Hook config: `.claude/settings.json` → `hooks.SessionStart`

## Директории и файлы

```
extensions/test-statusline/
├── extension.json
└── tools/test-statusline/
    ├── statusline_render.sh         # Component 1: statusline display
    ├── test_runner_wrapper.sh       # Component 2: test runner wrapper
    ├── statusline_session_start.ts  # Component 3: SessionStart hook
    └── status_types.ts              # Component 4: shared types
```

## Data Flow

```
User runs test via wrapper
        │
        ▼
test_runner_wrapper.sh ──parses output──▶ .dev-pomogator/.test-status/status.{sid}.yaml
        │                                        ▲
        │ exit code                              │ reads
        ▼                                        │
Claude Code ──assistant msg──▶ statusline_render.sh ──▶ stdout display
                     │
                     ▼
              JSON stdin (session_id, cwd, model...)
```

## Hook Input/Output Protocol

### SessionStart Hook Input (stdin JSON)

```json
{
  "session_id": "abc123def456...",
  "cwd": "/path/to/project",
  "hook_event_name": "SessionStart"
}
```

### SessionStart Hook Output (stdout JSON)

```json
{}
```

### Environment Variables

| Variable | Set By | Used By | Value |
|----------|--------|---------|-------|
| `TEST_STATUSLINE_SESSION` | SessionStart hook via CLAUDE_ENV_FILE | test_runner_wrapper.sh | session_id prefix (8 chars) |
| `TEST_STATUSLINE_ENABLED` | User (optional) | All components | "true"/"false" (default: "true") |
| `CLAUDE_ENV_FILE` | Claude Code | SessionStart hook | Path to env file |

## BDD Test Infrastructure

**Classification:** TEST_DATA_ACTIVE

**Evidence:**
1. Фича создаёт файлы (YAML status files, PID files) — ДА
2. Фича изменяет состояние системы (status directory, env file) — ДА
3. BDD сценарии требуют предустановленных данных (mock YAML files) — ДА
4. Фича не взаимодействует с внешними сервисами — НЕТ

**Verdict:** Hooks и fixtures требуются. Нужен cleanup для status files и status directory после каждого теста.

### Существующие hooks

| Hook файл | Тип | Тег/Scope | Что делает | Можно переиспользовать? |
|-----------|-----|-----------|------------|------------------------|
| `tests/e2e/hook.ts` | globalSetup/teardown | global | Docker Compose lifecycle | Нет — другой scope |
| `tests/e2e/helpers.ts` | utility | shared | runInstaller, path helpers | Да — утилиты для path и file assertions |

### Новые hooks

| Hook файл | Тип | Тег/Scope | Что делает | По аналогии с |
|-----------|-----|-----------|------------|---------------|
| `tests/e2e/fixtures/test-statusline/setup.ts` | BeforeEach | per-test | Создаёт temp .test-status/ dir | N/A |
| `tests/e2e/fixtures/test-statusline/cleanup.ts` | AfterEach | per-test | Удаляет temp .test-status/ dir и YAML files | `tests/fixtures/learnings-capture/` |

### Cleanup Strategy

1. AfterEach: удалить все файлы в temp `.test-status/` директории
2. AfterEach: удалить temp директорию
3. Порядок: файлы → директория (нет каскадных зависимостей)

### Test Data & Fixtures

| Fixture/Data | Путь | Назначение | Lifecycle |
|-------------|------|------------|-----------|
| mock-status-running.yaml | `tests/fixtures/test-statusline/mock-status-running.yaml` | Тест рендеринга running state | shared (read-only) |
| mock-status-passed.yaml | `tests/fixtures/test-statusline/mock-status-passed.yaml` | Тест рендеринга passed state | shared (read-only) |
| mock-status-failed.yaml | `tests/fixtures/test-statusline/mock-status-failed.yaml` | Тест рендеринга failed state | shared (read-only) |
| mock-status-corrupted.yaml | `tests/fixtures/test-statusline/mock-status-corrupted.yaml` | Тест graceful degradation | shared (read-only) |
| mock-stdin.json | `tests/fixtures/test-statusline/mock-stdin.json` | Mock Claude Code JSON input | shared (read-only) |

### Shared Context / State Management

| Ключ | Тип | Записывается в | Читается в | Назначение |
|------|-----|----------------|------------|------------|
| `testStatusDir` | string | setup hook | all tests | Путь к temp .test-status/ директории |
| `mockStdinJson` | string | setup hook | render tests | JSON string для pipe в statusline script |
| `sessionPrefix` | string | setup hook | isolation tests | 8-char prefix для session isolation тестов |
