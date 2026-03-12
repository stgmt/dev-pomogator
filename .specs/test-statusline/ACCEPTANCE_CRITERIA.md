# Acceptance Criteria (EARS)

## AC-1 (FR-1): Statusline Render Output @feature1

**Требование:** [FR-1](FR.md#fr-1-statusline-render-script-feature1)

WHEN statusline скрипт получает JSON с session_id на stdin AND существует YAML status file с state=running THEN скрипт SHALL вывести строку формата `{percent}% [{bar}] {passed}✅ {failed}❌ {running}⏳ | {time}` с unicode progress bar (▓░) и color threshold на stdout.

WHEN statusline скрипт читает YAML status file с state=running AND валидным `pid` THEN скрипт SHALL проверить живость процесса через `kill -0`.

IF `pid` мёртв THEN скрипт SHALL атомарно переписать YAML в `state=failed` AND SHALL вывести failed state вместо пустой строки.

WHEN YAML status file содержит state=passed AND failed=0 THEN скрипт SHALL вывести `✅ {passed}/{total} | {time}`.

WHEN YAML status file содержит state=failed OR (state=passed AND failed>0) THEN скрипт SHALL вывести `❌ {passed}/{total} ({failed} failed) | {time}`.

## AC-1a (FR-1a): Graceful Degradation @feature1a

**Требование:** [FR-1a](FR.md#fr-1a-statusline-render-graceful-degradation-feature1a)

IF YAML status file не существует THEN скрипт SHALL завершиться с exit 0 без вывода на stdout.

IF YAML status file повреждён или содержит невалидные данные THEN скрипт SHALL завершиться с exit 0 без вывода на stdout.

IF jq не установлен THEN скрипт SHALL использовать grep-based fallback для парсинга JSON stdin.

## AC-2 (FR-2): YAML Status File Format @feature2

**Требование:** [FR-2](FR.md#fr-2-yaml-status-file-protocol-feature2)

WHEN test runner wrapper записывает status file THEN файл SHALL содержать все обязательные поля: version, session_id, pid, started_at, updated_at, state, framework, total, passed, failed, skipped, running, percent, duration_ms, error_message, log_file.

WHEN state=running THEN percent SHALL быть в диапазоне 0-100 AND total SHALL быть > 0.

## AC-3 (FR-3): Atomic YAML Writes @feature2

**Требование:** [FR-3](FR.md#fr-3-atomic-yaml-writes-feature2)

WHEN test runner wrapper обновляет YAML status file THEN запись SHALL происходить через temp file + atomic rename (mv -f).

IF statusline скрипт читает файл во время записи THEN скрипт SHALL получить либо полную предыдущую версию, либо полную новую версию (не partial data).

## AC-4 (FR-4): Test Runner Wrapper @feature2

**Требование:** [FR-4](FR.md#fr-4-test-runner-wrapper-feature2)

WHEN wrapper запускается с env var TEST_STATUSLINE_SESSION THEN wrapper SHALL создать initial YAML с state=running AND percent=0.

WHEN wrapper создаёт initial YAML THEN wrapper SHALL записать `pid` текущего wrapper-процесса.

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

WHEN SessionStart hook получает session_id THEN hook SHALL записать `TEST_STATUSLINE_SESSION={prefix}`, `TEST_STATUSLINE_PROJECT` и `TEST_STATUSLINE_STATUS_DIR` в `$CLAUDE_ENV_FILE`.

WHEN SessionStart hook завершается THEN hook SHALL вывести `{}` на stdout (approve) AND exit 0.

## AC-7 (FR-7): Stale Session Cleanup @feature4

**Требование:** [FR-7](FR.md#fr-7-stale-session-cleanup-feature4)

WHEN SessionStart hook обнаруживает YAML files с mtime > 24 часов THEN hook SHALL удалить эти файлы.

WHEN SessionStart hook обнаруживает YAML files с state=idle AND mtime > 1 час THEN hook SHALL удалить эти файлы.

WHEN SessionStart hook обнаруживает YAML file с state=running AND валидным `pid` AND процесс мёртв THEN hook SHALL атомарно переписать файл в `state=failed` AND SHALL не удалять его.

## AC-8 (FR-8): Extension Manifest @feature5

**Требование:** [FR-8](FR.md#fr-8-extension-manifest-feature5)

WHEN инсталлер обрабатывает extension.json THEN инсталлер SHALL скопировать все toolFiles в `.dev-pomogator/tools/test-statusline/`.

WHEN инсталлер обрабатывает hooks THEN инсталлер SHALL зарегистрировать SessionStart hook в `.claude/settings.json`.

WHEN manifest `statusLine` section читается THEN он SHALL объявлять Claude command type и ссылаться на `statusline_render.sh`.

WHEN manifest `toolFiles` section читается THEN он SHALL включать `statusline_wrapper.js` как часть расширения.

## AC-9 (FR-9): Docker Test Isolation @feature6

**Требование:** [FR-9](FR.md#fr-9-docker-test-isolation-feature6)

WHEN тесты запускаются через Docker Compose THEN каждый запуск SHALL получить уникальный `COMPOSE_PROJECT_NAME` для предотвращения конфликтов контейнеров.

WHEN env var `TEST_STATUSLINE_SESSION` доступен THEN project name SHALL быть `devpom-test-{session}`.

WHEN env var `TEST_STATUSLINE_SESSION` недоступен THEN project name SHALL быть `devpom-test-{PID}-{random}`.

WHEN тест-процесс завершается (штатно или аварийно) THEN `docker compose down --remove-orphans` SHALL быть вызван через trap cleanup.

## AC-10 (FR-10): Hooks Integrity Guard @feature7

**Требование:** [FR-10](FR.md#fr-10-hooks-integrity-guard-feature7)

WHEN SessionStart hook запускается THEN hook SHALL прочитать все `extensions/*/extension.json` AND собрать ожидаемые hooks.

WHEN ожидаемый hook отсутствует в `.claude/settings.json` THEN hook SHALL добавить его через smart merge (сохраняя пользовательские hooks).

WHEN все hooks уже присутствуют THEN hook SHALL завершиться без изменений AND логировать "all hooks intact".

WHEN hook восстанавливает недостающие hooks THEN запись SHALL происходить атомарно (temp + rename).

## AC-11 (FR-11): StatusLine Coexistence Wrapper @feature8

**Требование:** [FR-11](FR.md#fr-11-statusline-coexistence-wrapper-feature8)

WHEN installer или updater находит существующий user `statusLine` в project `.claude/settings.json` THEN система SHALL записать wrapper-команду в project settings, сохранив user output рядом с managed output.

WHEN project `.claude/settings.json` не содержит `statusLine` AND global `~/.claude/settings.json` содержит user `statusLine` THEN система SHALL использовать global user command как вход для wrapper AND SHALL записать wrapper в project settings.

IF project settings и global settings оба содержат `statusLine` THEN project settings SHALL иметь приоритет.

IF existing `statusLine` уже является wrapper-командой THEN installer/updater SHALL сохранить прежний `userCommand` AND SHALL обновить только managed command path.

WHEN wrapper запускает обе команды AND одна из сторон возвращает пустой вывод или ошибку THEN wrapper SHALL вывести только непустую сторону AND SHALL не ломать весь statusline.

WHEN existing wrapper содержит невалидные encoded аргументы THEN система SHALL fallback на direct managed `statusLine`, а не на nested wrapper.

WHEN wrapper запускает обе команды AND обе стороны возвращают пустой вывод или ошибку THEN wrapper SHALL вывести пустую строку AND SHALL завершиться с exit code 0.

WHEN wrapper запускает команду AND команда не завершается в течение COMMAND_TIMEOUT_MS (2 секунды) THEN wrapper SHALL трактовать её как пустой вывод AND SHALL продолжить с выводом другой команды.

WHEN user command выводит многострочный текст с ANSI-кодами THEN wrapper SHALL нормализовать вывод в одну строку, соединяя непустые trimmed строки пробелами.

WHEN installer запускается на проекте который уже содержит wrapper THEN результирующий settings SHALL содержать ровно один `--user-b64` и один `--managed-b64` аргумент (без вложенных wrappers).

WHEN wrapper получает StatusJSON на stdin THEN wrapper SHALL передать идентичный JSON на stdin обоим командам (user и managed).
