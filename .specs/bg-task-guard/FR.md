# Functional Requirements (FR)

## FR-1: PostToolUse marker creation @feature1

PostToolUse hook на Bash SHALL создавать marker файл `.dev-pomogator/.bg-task-active` когда `tool_input.run_in_background` равен `true`. Stdout fallback ("Command running in background") УДАЛЁН — он вызывал ложное пересоздание marker при task notification. Marker SHALL содержать task ID и timestamp создания в ISO 8601 формате.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
**Use Case:** [UC-1](USE_CASES.md#uc-1-claude-запускает-тесты-в-фоне-и-продолжает-работу-feature1)

## FR-2: Stop hook блокировка при активном marker @feature1

Stop hook SHALL блокировать остановку Claude (`decision: "block"`) когда marker файл `.dev-pomogator/.bg-task-active` существует и его возраст менее 15 минут. Hook SHALL возвращать systemMessage с инструкцией продолжить работу.

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
**Use Case:** [UC-1](USE_CASES.md#uc-1-claude-запускает-тесты-в-фоне-и-продолжает-работу-feature1)

## FR-3: TTL expire маркера @feature2

Stop hook SHALL НЕ блокировать остановку если marker файл старше 15 минут (TTL expired). Это предотвращает permanent block от stale markers.

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
**Use Case:** [UC-3](USE_CASES.md#uc-3-stale-marker--автоматический-expire-feature2)

## FR-5: Auto-cleanup marker при завершении background task @feature3

PostToolUse hook на Bash SHALL удалять marker файл `.dev-pomogator/.bg-task-active` когда marker существует И `tool_response.status` равен `completed`, `failed` или `error` (task notification). Дополнительно: если `tool_input.command` содержит task ID из marker — marker удаляется (ручная проверка через TaskOutput).

Stop hook SHALL также удалять marker если `.dev-pomogator/.test-status/` не содержит файлов с `state: running` (zombie marker от завершённого Docker теста).

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)
**Use Case:** [UC-2](USE_CASES.md#uc-2-фоновая-задача-завершается--marker-удаляется-feature3)

## FR-4: Fail-open при ошибках hook @feature1

Hook scripts SHALL exit 0 (approve) при любой ошибке (отсутствующие файлы, parse errors, runtime exceptions). Ни один hook failure НЕ SHALL блокировать Claude.

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
**Use Case:** [UC-4](USE_CASES.md#uc-4-нет-фоновых-задач--stop-разрешён-feature1)

## FR-6: Stop-hook result check при блокировке @feature5

Stop hook SHALL проверять YAML status файлы (`.dev-pomogator/.test-status/status.*.yaml`) при блокировке. Если найден файл с `state: passed` или `state: failed` свежее marker timestamp — показать summary (passed/failed/skipped counts) и удалить маркер (allow stop).

## FR-7: Stop-hook warning при all-skipped @feature5

Stop hook SHALL выводить предупреждение если YAML status содержит `passed: 0` и `skipped > 0`: "Tests did not run — filter matched nothing".

## FR-8: Stop-hook progress в block message @feature5

Stop hook block message SHALL содержать текущий прогресс из YAML: "N/M passed, F failed (P%)" если YAML status содержит `state: running`.

## FR-9: Per-session marker isolation @feature7

mark-bg-task.sh SHALL создавать per-session маркер `.bg-task-active.{session_prefix}` (8-char prefix от session_id). stop-guard.sh SHALL проверять ТОЛЬКО маркер своей сессии, игнорируя маркеры других сессий. При отсутствии session_id — fallback на legacy `.bg-task-active`.

**Связанные AC:** [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9)

## FR-10: SESSION_PREFIX_LEN shared через session.env @feature7

SESSION_PREFIX_LEN SHALL определяться один раз в statusline_session_start.ts и записываться в `session.env`. Shell scripts SHALL читать значение через `source session.env` с fallback `:-8`.

**Связанные AC:** [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10)

## FR-11: Orphan marker cleanup @feature7

stop-guard.sh SHALL удалять ВСЕ маркеры `.bg-task-active.*` старше 15 минут (orphan protection для crashed сессий). SessionStart hook SHALL удалять все маркеры при старте новой сессии.

**Связанные AC:** [AC-11](ACCEPTANCE_CRITERIA.md#ac-11-fr-11)

## FR-12: YAML consistency check @feature8

stop-guard.sh SHALL пропускать YAML данные если `percent > 0` но `passed = 0` и `failed = 0` (partial read race condition при concurrent write/read).

**Связанные AC:** [AC-12](ACCEPTANCE_CRITERIA.md#ac-12-fr-12)

## FR-13: Building state в YAML @feature9

TestState type SHALL включать `'building'` state. Wrapper SHALL инициализировать YAML с `state: building` и переключать на `running` при первом parsed test event. stop-guard SHALL показывать "Building Docker image" для building state без progress numbers и без stuck detection.

**Связанные AC:** [AC-13](ACCEPTANCE_CRITERIA.md#ac-13-fr-13)

## FR-14: Centralized marker lifecycle (wrapper = orchestrator) @feature10

test_runner_wrapper.ts SHALL создавать `.bg-task-active.{session_prefix}` при старте и удалять при exit (trap). mark-bg-task.sh SHALL быть no-op (exit 0). Маркер управляется единственным процессом — wrapper.

**Связанные AC:** [AC-14](ACCEPTANCE_CRITERIA.md#ac-14-fr-14)

## FR-15: YAML freshness check @feature10

stop-guard.sh SHALL пропускать YAML status данные если file mtime > 30 секунд назад (stale от предыдущего run, не текущего).

**Связанные AC:** [AC-15](ACCEPTANCE_CRITERIA.md#ac-15-fr-15)
