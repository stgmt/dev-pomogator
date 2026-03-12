# Functional Requirements (FR)

## FR-1: Statusline Render Script @feature1

Bash-скрипт получает JSON от Claude Code на stdin, находит session-specific YAML status file, парсит его и выводит форматированную строку с прогрессом тестов (проценты, progress bar, иконки статусов) на stdout.

Если YAML содержит `state=running` и поле `pid`, скрипт должен проверить живость процесса через `kill -0`. Если PID мёртв, скрипт должен атомарно перевести файл в `state=failed` и отобразить failed state вместо скрытия строки статуса.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-statusline-render-output)
**Use Case:** [UC-1](USE_CASES.md#uc-1-отображение-прогресса-запущенных-тестов-feature1)

### Форматы вывода:

| State | Формат | Пример |
|-------|--------|--------|
| idle / нет файла | пустой вывод | (ничего) |
| running | `{percent}% [{bar}] {passed}✅ {failed}❌ {running}⏳ \| {time}` | `76% [▓▓▓▓▓▓▓░░░] 38✅ 2❌ 10⏳ \| 0:45` |
| completed (0 failed) | `✅ {passed}/{total} \| {time}` | `✅ 50/50 \| 2:15` |
| completed (>0 failed) | `❌ {passed}/{total} ({failed} failed) \| {time}` | `❌ 48/50 (2 failed) \| 2:15` |
| error | `❌ ERR {message}` | `❌ ERR vitest not found` |

## FR-1a: Statusline Render Graceful Degradation @feature1a

Скрипт не должен падать при отсутствии, повреждении или неполных данных в YAML файле. При любой ошибке — тихий exit без вывода (fail-silent).

**Связанные AC:** [AC-1a](ACCEPTANCE_CRITERIA.md#ac-1a-fr-1a-graceful-degradation)
**Use Case:** [UC-1](USE_CASES.md#uc-1-отображение-прогресса-запущенных-тестов-feature1)

## FR-2: YAML Status File Protocol @feature2

Определяет формат YAML status file как контракт между test runner wrapper и statusline скриптом.

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-yaml-status-file-format)
**Use Case:** [UC-4](USE_CASES.md#uc-4-обнаружение-тест-процессов-daemonом-feature2)

### Обязательные поля:

```yaml
version: 2
session_id: "abc12345"
pid: 12345
started_at: "2026-03-09T19:30:00Z"
updated_at: "2026-03-09T19:31:15Z"
state: running    # idle | running | passed | failed | error
framework: "vitest"
total: 50
passed: 38
failed: 2
skipped: 0
running: 10
percent: 76
duration_ms: 45000
error_message: ""
log_file: ".dev-pomogator/.test-status/test.abc12345.log"
```

### Опциональные поля:

```yaml
suites:
  - name: "SmartInventoryAPI"
    status: running
    passed: 15
    failed: 0
    total: 20
```

## FR-3: Atomic YAML Writes @feature2

Все записи в YAML status file должны быть атомарными (temp file + rename) для предотвращения partial reads statusline скриптом.

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3-atomic-yaml-writes)
**Use Case:** [UC-4](USE_CASES.md#uc-4-обнаружение-тест-процессов-daemonом-feature2)

> _Leverage:_ `.claude/rules/atomic-config-save.md` — паттерн temp + rename

## FR-4: Test Runner Wrapper @feature2

Bash-скрипт обёртка для тест-раннера, которая:
1. Принимает session_id через env var `TEST_STATUSLINE_SESSION`
2. Создаёт initial YAML (state=running, percent=0, pid текущего wrapper-процесса)
3. Запускает тест-команду и парсит output в real-time
4. Обновляет YAML при каждом изменении progress
5. Записывает финальный статус (passed/failed) по завершении

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4-test-runner-wrapper)
**Use Case:** [UC-4](USE_CASES.md#uc-4-обнаружение-тест-процессов-daemonом-feature2)

## FR-5: Session Isolation @feature3

Каждая сессия Claude Code использует отдельный YAML status file, идентифицированный по `session_id`. Statusline скрипт читает только файл своей сессии.

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5-session-isolation)
**Use Case:** [UC-3](USE_CASES.md#uc-3-параллельные-сессии-claude-code-feature3)

- Status file path: `.dev-pomogator/.test-status/status.{session_id_prefix}.yaml`
- `session_id_prefix` = первые 8 символов `session_id`
- Statusline скрипт извлекает `session_id` из JSON stdin → вычисляет prefix → читает свой файл

## FR-6: SessionStart Hook @feature4

TypeScript hook на событие SessionStart, который:
1. Создаёт директорию `.dev-pomogator/.test-status/` если не существует
2. Записывает `TEST_STATUSLINE_SESSION={session_id_prefix}` в `$CLAUDE_ENV_FILE`
3. Записывает `TEST_STATUSLINE_PROJECT` в `$CLAUDE_ENV_FILE`
4. Очищает stale status files (старше 24 часов)

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6-session-start-hook)
**Use Case:** [UC-2](USE_CASES.md#uc-2-запуск-и-остановка-daemon-feature2)

> _Leverage:_ `extensions/claude-mem-health/` — SessionStart hook pattern

## FR-7: Stale Session Cleanup @feature4

При SessionStart обрабатывать stale YAML status files следующим образом:
- Удалять любые файлы старше 24 часов по mtime
- Удалять файлы с `state=idle` без обновления более 1 часа
- Если файл содержит `state=running` и `pid`, а процесс больше не жив, атомарно переводить файл в `state=failed`

Если canonical v2 файл повреждён или без `pid`, statusline должен fail-silent при рендере и не пытаться deterministically repair stale `running`.

**Связанные AC:** [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7-stale-session-cleanup)
**Use Case:** [UC-2](USE_CASES.md#uc-2-запуск-и-остановка-daemon-feature2)

## FR-8: Extension Manifest @feature5

Extension manifest (`extension.json`) с:
- platforms: ["claude"]
- hooks: SessionStart
- toolFiles: все файлы расширения
- statusLine: Claude command для `statusline_render.sh`
- envRequirements: TEST_STATUSLINE_ENABLED (optional, default true)

**Связанные AC:** [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8-extension-manifest)
**Use Case:** [UC-5](USE_CASES.md#uc-5-установка-расширения-через-dev-pomogator-feature5)

> _Leverage:_ `extensions/auto-simplify/extension.json` — reference manifest

## FR-9: Docker Test Isolation @feature6

При запуске тестов через Docker Compose каждый запуск получает уникальный `COMPOSE_PROJECT_NAME` для предотвращения конфликтов контейнеров при параллельных сессиях.

**Связанные AC:** [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9-docker-test-isolation)
**Use Case:** [UC-3](USE_CASES.md#uc-3-параллельные-сессии-claude-code-feature3)

### Компоненты:

| Компонент | Описание |
|-----------|----------|
| `scripts/docker-test.sh` | Bash-wrapper для `npm test` с `COMPOSE_PROJECT_NAME=devpom-test-{session\|PID}` |
| `docker-compose.test.yml` | `image: dev-pomogator-test:local` для шаринга образа между project names |
| `dispatch.ts` | `generateProjectName()` инжектит `COMPOSE_PROJECT_NAME` в Docker-команды |

### Генерация project name:

- Если есть `TEST_STATUSLINE_SESSION` → `devpom-test-{session}`
- Иначе → `devpom-test-{PID}-{random}`

### Cleanup:

- `trap cleanup EXIT INT TERM` в wrapper
- `docker compose down --remove-orphans` при завершении

> _Leverage:_ `scripts/docker-test.sh` — wrapper с session isolation

## FR-10: Hooks Integrity Guard @feature7

SessionStart hook для валидации целостности hooks в `.claude/settings.json`. При старте сессии сканирует extension manifests, сравнивает ожидаемые hooks с текущими в settings.json, и автоматически восстанавливает недостающие.

**Связанные AC:** [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10-hooks-integrity-guard)
**Use Case:** [UC-6](USE_CASES.md#uc-6-защита-от-случайной-очистки-hooks-feature7)

### Алгоритм:

1. Прочитать все `extensions/*/extension.json` → собрать ожидаемые hooks
2. Прочитать текущие hooks из `.claude/settings.json`
3. Для каждого ожидаемого hook — проверить наличие по command substring (`.dev-pomogator/tools/`)
4. Если hook отсутствует → добавить через smart merge (сохраняя пользовательские hooks)
5. Записать результат атомарно (temp + rename)
6. Логировать все изменения

### Компоненты:

| Компонент | Описание |
|-----------|----------|
| `extensions/hooks-integrity/extension.json` | Extension manifest |
| `extensions/hooks-integrity/tools/hooks-integrity/hooks_integrity_check.ts` | SessionStart hook — валидация и восстановление |

> _Leverage:_ `src/installer/claude.ts:420-427` — smart merge паттерн фильтрации managed hooks
> _Leverage:_ `extensions/test-statusline/tools/test-statusline/statusline_session_start.ts` — readStdin + log паттерн
> _Leverage:_ `src/installer/shared.ts` — `replaceNpxTsxWithPortable()` формат hook commands

## FR-11: StatusLine Coexistence Wrapper @feature8

Installer/updater должен сохранять существующий пользовательский `statusLine` и встраивать managed `test-statusline` рядом через wrapper-команду.

### Алгоритм:

1. Проверить project-level `.claude/settings.json`
2. Если project-level `statusLine` отсутствует — проверить global `~/.claude/settings.json`
3. Если найден user-defined `statusLine` — записать wrapper в project `.claude/settings.json`
4. Wrapper должен запускать user command и managed command на одном stdin и объединять непустой вывод как `user | managed`
5. Если уже найден existing wrapper — сохранить `userCommand` и обновить только managed command
6. Если нет ни project-level, ни global user `statusLine` — установить direct managed command без wrapper

Project settings имеют приоритет над global settings. Global settings не должны изменяться ради coexistence, если достаточно записать wrapper в проектный settings-файл.

**Связанные AC:** [AC-11](ACCEPTANCE_CRITERIA.md#ac-11-fr-11-statusline-coexistence-wrapper-feature8)
**Use Case:** [UC-7](USE_CASES.md#uc-7-coexistence-с-существующим-statusline-feature8)
