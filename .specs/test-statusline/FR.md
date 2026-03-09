# Functional Requirements (FR)

## FR-1: Statusline Render Script @feature1

Bash-скрипт получает JSON от Claude Code на stdin, находит session-specific YAML status file, парсит его и выводит форматированную строку с прогрессом тестов (проценты, progress bar, иконки статусов) на stdout.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-statusline-render-output)
**Use Case:** [UC-1](USE_CASES.md#uc-1-отображение-прогресса-запущенных-тестов-feature1)

### Форматы вывода:

| State | Формат | Пример |
|-------|--------|--------|
| idle / нет файла | пустой вывод | (ничего) |
| running | `T {percent}% [{bar}] {passed}ok {failed}fail {running}run \| {time}` | `T 76% [#######---] 38ok 2fail 10run \| 0:45` |
| completed (0 failed) | `T pass {passed}/{total} \| {time}` | `T pass 50/50 \| 2:15` |
| completed (>0 failed) | `T fail {passed}/{total} ({failed} failed) \| {time}` | `T fail 48/50 (2 failed) \| 2:15` |
| error | `T ERR {message}` | `T ERR vitest not found` |

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
version: 1
session_id: "abc12345"
started_at: "2026-03-09T19:30:00Z"
updated_at: "2026-03-09T19:31:15Z"
state: running    # idle | running | passed | failed | error
total: 50
passed: 38
failed: 2
skipped: 0
running: 10
percent: 76
duration_ms: 45000
error_message: ""
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
2. Создаёт initial YAML (state=running, percent=0)
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
3. Очищает stale status files (старше 24 часов)

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6-session-start-hook)
**Use Case:** [UC-2](USE_CASES.md#uc-2-запуск-и-остановка-daemon-feature2)

> _Leverage:_ `extensions/claude-mem-health/` — SessionStart hook pattern

## FR-7: Stale Session Cleanup @feature4

При SessionStart удалять YAML status files, которые:
- Старше 24 часов по mtime
- Или содержат state=idle без обновления более 1 часа

**Связанные AC:** [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7-stale-session-cleanup)
**Use Case:** [UC-2](USE_CASES.md#uc-2-запуск-и-остановка-daemon-feature2)

## FR-8: Extension Manifest @feature5

Extension manifest (`extension.json`) с:
- platforms: ["claude"]
- hooks: SessionStart
- toolFiles: все файлы расширения
- envRequirements: TEST_STATUSLINE_ENABLED (optional, default true)

**Связанные AC:** [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8-extension-manifest)
**Use Case:** [UC-5](USE_CASES.md#uc-5-установка-расширения-через-dev-pomogator-feature5)

> _Leverage:_ `extensions/auto-simplify/extension.json` — reference manifest
