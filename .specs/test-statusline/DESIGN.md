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
- [FR-11: StatusLine Coexistence Wrapper](FR.md#fr-11-statusline-coexistence-wrapper-feature8)

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
6. Парсит только top-level summary поля canonical v2 YAML, игнорируя nested suites/tests
7. Если `state=running` и есть `pid` — проверяет живость процесса через `kill -0`
8. Если PID мёртв — атомарно переводит YAML в `state=failed`
9. Рендерит progress bar и форматированную строку без таймерного скрытия
10. Выводит на stdout

### 2. Test Runner Wrapper (`test_runner_wrapper.sh`)

Bash-скрипт обёртка для тест-раннера.

**Exports:** exit code тест-процесса; side effect — YAML status file

**Algorithm:**
1. Читает env: `TEST_STATUSLINE_SESSION`, `TEST_STATUSLINE_PROJECT`
2. Определяет status file path
3. Записывает initial YAML (state=running, percent=0, pid текущего wrapper-процесса)
4. Запускает тест-команду, pipe stdout через парсер
5. На каждой строке output — парсит test results, обновляет YAML
6. При завершении — записывает финальный state (passed/failed)

### 3. SessionStart Hook (`statusline_session_start.ts`)

TypeScript hook для инициализации и cleanup.

**Exports:** JSON `{}` на stdout

**Algorithm:**
1. Читает stdin JSON (session_id, cwd)
2. Создаёт `.dev-pomogator/.test-status/` директорию
3. Пишет `TEST_STATUSLINE_SESSION={prefix}`, `TEST_STATUSLINE_PROJECT` и `TEST_STATUSLINE_STATUS_DIR` в `$CLAUDE_ENV_FILE`
4. Удаляет файлы старше 24 часов
5. Если файл содержит `state=running` и dead `pid` — атомарно переводит его в `state=failed`
6. Удаляет `idle` файлы старше 1 часа
7. Выводит `{}` на stdout, exit 0

### 4. Status Types (`status_types.ts`)

TypeScript интерфейсы для status file protocol.

**Exports:**
- `TestStatus` — интерфейс YAML status file
- `TestSuite` — интерфейс suite entry
- `HookInput` — интерфейс SessionStart hook input

### 5. StatusLine Coexistence Wrapper (`statusline_wrapper.js`)

Node.js wrapper для объединения user-defined и managed `statusLine` в один Claude Code command.

**Exports:** stdout — single-line combined statusline output

**Algorithm:**
1. Читает JSON stdin один раз
2. Декодирует `userCommand` и `managedCommand` из base64 аргументов
3. Запускает обе команды на одном stdin
4. Нормализует multi-line output в single-line
5. Если обе стороны вернули текст — выводит `user | managed`
6. Если одна сторона пустая или упала — выводит только непустую сторону
7. При невалидных encoded аргументах wrapper fail-open и не выбрасывает ошибку наружу

## Где лежит реализация

- Extension source: `extensions/test-statusline/`
- Deployed tools: `.dev-pomogator/tools/test-statusline/`
- Status data: `.dev-pomogator/.test-status/status.{prefix}.yaml`
- Hook config: project `.claude/settings.json` → `hooks.SessionStart`
- StatusLine resolution: project `.claude/settings.json` → fallback global `~/.claude/settings.json`

## Директории и файлы

```
extensions/test-statusline/
├── extension.json
└── tools/test-statusline/
    ├── statusline_render.sh         # Component 1: statusline display
    ├── test_runner_wrapper.sh       # Component 2: test runner wrapper
    ├── statusline_session_start.ts  # Component 3: SessionStart hook
    ├── status_types.ts              # Component 4: shared types
    └── statusline_wrapper.js        # Component 5: coexistence wrapper
```

## StatusLine Resolution Flow

1. Installer/updater читает project `.claude/settings.json`
2. Если project `statusLine` отсутствует — читает global `~/.claude/settings.json`
3. Если existing `statusLine` user-defined — строит wrapper command
4. Если existing `statusLine` уже wrapper — сохраняет `userCommand`, обновляет managed command
5. Если existing `statusLine` managed-only или отсутствует — пишет direct managed command

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
| `TEST_STATUSLINE_PROJECT` | SessionStart hook via CLAUDE_ENV_FILE | test_runner_wrapper.sh | absolute project root |
| `TEST_STATUSLINE_STATUS_DIR` | SessionStart hook via CLAUDE_ENV_FILE | test_runner_wrapper.sh | absolute `.dev-pomogator/.test-status` path |
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
| mock-status-running-live-pid.yaml | `tests/fixtures/test-statusline/mock-status-running-live-pid.yaml` | Тест рендеринга running state с живым PID | shared (read-only) |
| mock-status-running-dead-pid.yaml | `tests/fixtures/test-statusline/mock-status-running-dead-pid.yaml` | Тест repair stale running с мёртвым PID | shared (read-only) |
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
