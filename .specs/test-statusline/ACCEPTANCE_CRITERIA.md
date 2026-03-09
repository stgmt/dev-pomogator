# Acceptance Criteria (EARS)

## AC-1 (FR-1): Statusline Render Output @feature1

**Требование:** [FR-1](FR.md#fr-1-statusline-render-script-feature1)

WHEN statusline скрипт получает JSON с session_id на stdin AND существует YAML status file с state=running THEN скрипт SHALL вывести строку формата `T {percent}% [{bar}] {passed}ok {failed}fail {running}run | {time}` на stdout.

WHEN YAML status file содержит state=passed AND failed=0 THEN скрипт SHALL вывести `T pass {passed}/{total} | {time}`.

WHEN YAML status file содержит state=failed OR (state=passed AND failed>0) THEN скрипт SHALL вывести `T fail {passed}/{total} ({failed} failed) | {time}`.

## AC-1a (FR-1a): Graceful Degradation @feature1a

**Требование:** [FR-1a](FR.md#fr-1a-statusline-render-graceful-degradation-feature1a)

IF YAML status file не существует THEN скрипт SHALL завершиться с exit 0 без вывода на stdout.

IF YAML status file повреждён или содержит невалидные данные THEN скрипт SHALL завершиться с exit 0 без вывода на stdout.

IF jq не установлен THEN скрипт SHALL использовать grep-based fallback для парсинга JSON stdin.

## AC-2 (FR-2): YAML Status File Format @feature2

**Требование:** [FR-2](FR.md#fr-2-yaml-status-file-protocol-feature2)

WHEN test runner wrapper записывает status file THEN файл SHALL содержать все обязательные поля: version, session_id, started_at, updated_at, state, total, passed, failed, skipped, running, percent, duration_ms, error_message.

WHEN state=running THEN percent SHALL быть в диапазоне 0-100 AND total SHALL быть > 0.

## AC-3 (FR-3): Atomic YAML Writes @feature2

**Требование:** [FR-3](FR.md#fr-3-atomic-yaml-writes-feature2)

WHEN test runner wrapper обновляет YAML status file THEN запись SHALL происходить через temp file + atomic rename (mv -f).

IF statusline скрипт читает файл во время записи THEN скрипт SHALL получить либо полную предыдущую версию, либо полную новую версию (не partial data).

## AC-4 (FR-4): Test Runner Wrapper @feature2

**Требование:** [FR-4](FR.md#fr-4-test-runner-wrapper-feature2)

WHEN wrapper запускается с env var TEST_STATUSLINE_SESSION THEN wrapper SHALL создать initial YAML с state=running AND percent=0.

WHEN тест-процесс завершается с exit code 0 THEN wrapper SHALL обновить YAML с state=passed.

WHEN тест-процесс завершается с exit code != 0 THEN wrapper SHALL обновить YAML с state=failed.

WHEN wrapper парсит vitest output и обнаруживает test result THEN wrapper SHALL обновить YAML с актуальными passed/failed/running counts.

## AC-5 (FR-5): Session Isolation @feature3

**Требование:** [FR-5](FR.md#fr-5-session-isolation-feature3)

WHEN две сессии Claude Code работают параллельно THEN каждая сессия SHALL иметь отдельный YAML status file с уникальным session_id prefix.

WHEN statusline скрипт получает JSON с session_id=X THEN скрипт SHALL читать только файл `status.{X_prefix}.yaml` AND SHALL игнорировать файлы других сессий.

## AC-6 (FR-6): Session Start Hook @feature4

**Требование:** [FR-6](FR.md#fr-6-sessionstart-hook-feature4)

WHEN Claude Code запускает SessionStart hook THEN hook SHALL создать директорию `.dev-pomogator/.test-status/` IF она не существует.

WHEN SessionStart hook получает session_id THEN hook SHALL записать `TEST_STATUSLINE_SESSION={prefix}` в `$CLAUDE_ENV_FILE`.

WHEN SessionStart hook завершается THEN hook SHALL вывести `{}` на stdout (approve) AND exit 0.

## AC-7 (FR-7): Stale Session Cleanup @feature4

**Требование:** [FR-7](FR.md#fr-7-stale-session-cleanup-feature4)

WHEN SessionStart hook обнаруживает YAML files с mtime > 24 часов THEN hook SHALL удалить эти файлы.

WHEN SessionStart hook обнаруживает YAML files с state=idle AND mtime > 1 час THEN hook SHALL удалить эти файлы.

## AC-8 (FR-8): Extension Manifest @feature5

**Требование:** [FR-8](FR.md#fr-8-extension-manifest-feature5)

WHEN инсталлер обрабатывает extension.json THEN инсталлер SHALL скопировать все toolFiles в `.dev-pomogator/tools/test-statusline/`.

WHEN инсталлер обрабатывает hooks THEN инсталлер SHALL зарегистрировать SessionStart hook в `.claude/settings.json`.
