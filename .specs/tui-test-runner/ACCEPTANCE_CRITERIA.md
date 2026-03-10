# Acceptance Criteria (EARS)

## AC-1 (FR-1): 4-Tab TUI Interface @feature1

**Требование:** [FR-1](FR.md#fr-1-4-tab-tui-interface-feature1)

WHEN TUI запущен THEN system SHALL отобразить 4 вкладки (Tests, Logs, Monitoring, Analysis) с Monitoring tab активным по умолчанию.

WHEN пользователь нажимает клавишу 1/2/3/4 THEN system SHALL переключить активную вкладку на соответствующую.

## AC-2 (FR-2): Test Tree View @feature2

**Требование:** [FR-2](FR.md#fr-2-test-tree-view-feature2)

WHEN YAML v2 содержит suites[] с tests[] THEN Tests tab SHALL построить иерархическое дерево suite → test с иконками статуса.

WHEN хотя бы один тест имеет status=failed THEN Tests tab SHALL отсортировать failed тесты наверх списка.

WHEN пользователь нажимает `f` THEN Tests tab SHALL показать фильтр по имени/статусу.

## AC-3 (FR-3): Real-Time Log Viewer @feature3

**Требование:** [FR-3](FR.md#fr-3-real-time-log-viewer-feature3)

WHEN новые строки появляются в log файле THEN Logs tab SHALL отобразить их с syntax highlighting в течение 1 секунды.

WHEN строка содержит stack trace pattern THEN Logs tab SHALL подсветить её красным цветом.

WHEN строка содержит BDD keyword (Given/When/Then/And/But) THEN Logs tab SHALL подсветить keyword зелёным.

## AC-4 (FR-4): Monitoring Dashboard @feature4

**Требование:** [FR-4](FR.md#fr-4-monitoring-dashboard-feature4)

WHEN state=running в YAML THEN Monitoring tab SHALL отобразить progress bar с текущим percent и duration.

WHEN YAML содержит phases[] THEN Monitoring tab SHALL отобразить каждую фазу с её статусом и duration.

## AC-5 (FR-5): Failure Analysis @feature5

**Требование:** [FR-5](FR.md#fr-5-failure-analysis-feature5)

WHEN state=failed AND YAML содержит тесты со status=failed THEN Analysis tab SHALL сгруппировать ошибки по паттернам и показать рекомендации.

IF ни один тест не failed THEN Analysis tab SHALL отобразить сообщение "No failures to analyze".

## AC-6 (FR-6): YAML v2 Protocol @feature6

**Требование:** [FR-6](FR.md#fr-6-yaml-v2-protocol-feature6)

WHEN enhanced wrapper пишет YAML v2 THEN файл SHALL содержать все v1 поля (version, session_id, state, total, passed, failed, skipped, running, percent, duration_ms, error_message) плюс v2 поля (suites, phases, framework, log_file).

WHEN statusline_render.sh читает YAML v2 файл THEN render SHALL работать корректно, игнорируя неизвестные v2 поля.

## AC-7 (FR-7): Universal Framework Adapters @feature6

**Требование:** [FR-7](FR.md#fr-7-universal-framework-adapters-feature6)

WHEN тест-процесс пишет stdout в формате vitest THEN vitest_adapter SHALL парсить строки в TestEvent с корректными status/name/duration.

WHEN тест-процесс пишет stdout в формате jest THEN jest_adapter SHALL парсить строки в TestEvent.

WHEN тест-процесс пишет stdout в формате pytest THEN pytest_adapter SHALL парсить строки в TestEvent.

WHEN тест-процесс пишет stdout в формате dotnet test THEN dotnet_adapter SHALL парсить строки в TestEvent.

## AC-8 (FR-8): YAML Polling @feature1

**Требование:** [FR-8](FR.md#fr-8-yaml-polling-feature1)

WHEN YAML файл изменяется THEN TUI SHALL обнаружить изменение и обновить UI в течение 1 секунды (при polling 500ms).

IF YAML содержит только v1 поля (без suites[]) THEN TUI SHALL отобразить Monitoring tab с aggregate counters, Tests tab покажет "No suite details available (v1 protocol)".

## AC-9 (FR-9): TUI Launcher @feature6

**Требование:** [FR-9](FR.md#fr-9-tui-launcher-feature6)

IF Python 3.9+ доступен в PATH THEN launcher SHALL запустить TUI процесс.

IF Python НЕ доступен THEN launcher SHALL вывести сообщение "Python 3.9+ required for TUI test runner" в stderr и exit 0.

IF Textual не установлен THEN launcher SHALL попытаться установить через `pip install textual pyyaml` и затем запустить TUI.

## AC-10 (FR-10): SessionStart Hook @feature7

**Требование:** [FR-10](FR.md#fr-10-sessionstart-hook-feature7)

WHEN Claude Code session starts THEN hook SHALL создать директорию .dev-pomogator/.test-status/ и записать env vars.

IF hook получает пустой stdin THEN hook SHALL exit 0 без ошибки (fail-open).

## AC-11 (FR-11): Skill /run-tests @feature11

**Требование:** [FR-11](FR.md#fr-11-skill-run-tests-feature11)

WHEN пользователь вызывает `/run-tests` THEN skill SHALL автодетектить фреймворк и запустить тесты через test_runner_wrapper.sh.

WHEN пользователь вызывает `/run-tests auth` THEN skill SHALL передать "auth" как filter в команду тестов.

WHEN пользователь вызывает `/run-tests --framework vitest` THEN skill SHALL использовать vitest вместо автодетекта.

## AC-12 (FR-12): Test Guard Hook @feature12

**Требование:** [FR-12](FR.md#fr-12-test-guard-hook-feature12)

WHEN AI-агент пытается выполнить `npm test` через Bash THEN hook SHALL заблокировать команду и вывести инструкцию по /run-tests.

IF команда содержит `test_runner_wrapper` THEN hook SHALL пропустить (уже wrapped).

IF TEST_GUARD_BYPASS=1 THEN hook SHALL пропустить.

WHEN hook блокирует команду THEN сообщение SHALL содержать: usage /run-tests, список фреймворков, как bypass.
