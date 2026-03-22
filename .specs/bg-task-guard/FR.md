# Functional Requirements (FR)

## FR-1: PostToolUse marker creation @feature1

PostToolUse hook на Bash SHALL создавать marker файл `.dev-pomogator/.bg-task-active` когда stdout содержит строку "Command running in background". Marker SHALL содержать timestamp создания в ISO 8601 формате.

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

## FR-4: Fail-open при ошибках hook @feature1

Hook scripts SHALL exit 0 (approve) при любой ошибке (отсутствующие файлы, parse errors, runtime exceptions). Ни один hook failure НЕ SHALL блокировать Claude.

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
**Use Case:** [UC-4](USE_CASES.md#uc-4-нет-фоновых-задач--stop-разрешён-feature1)
