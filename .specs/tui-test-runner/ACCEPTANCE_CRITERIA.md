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

WHEN enhanced wrapper пишет canonical YAML v2 THEN файл SHALL содержать flat summary поля (version, session_id, pid, state, total, passed, failed, skipped, running, percent, duration_ms, error_message, log_file) и structured поля suites, phases, framework в одном payload.

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

IF canonical YAML v2 содержит пустые suites[] и phases[] THEN TUI SHALL отобразить Monitoring tab с aggregate counters, Tests tab покажет "No suite details available yet".

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

WHEN hook блокирует команду THEN сообщение SHALL содержать: usage /run-tests, список фреймворков.

## AC-13 (FR-13): Rule centralized-test-runner @feature13

**Требование:** [FR-13](FR.md#fr-13-rule-centralized-test-runner-feature13)

WHEN разработчик читает правило centralized-test-runner THEN оно SHALL указывать, что тесты запускаются только через `/run-tests`, и SHALL объяснять причину (wrapper пишет YAML status для statusline и TUI).

WHEN dispatch строит тест-команду THEN он SHALL собрать каноническую обёртку test_runner_wrapper с явным `--framework` аргументом и инвокацией нужного раннера.

## AC-14 (FR-14): Dispatch Table @feature14

**Требование:** [FR-14](FR.md#fr-14-dispatch-table-feature14)

WHEN `/run-tests` резолвит фреймворк THEN dispatch table SHALL отдать каноническую команду для каждого из 6 поддерживаемых (vitest, jest, pytest, dotnet, cargo, go).

WHEN wrapper или passthrough запускает дочернюю npx-команду THEN он SHALL сделать это кроссплатформенно, вернуть exit 0 и напечатать semver-версию.

WHEN добавляется новый фреймворк THEN он SHALL требовать ровно одну новую строку в dispatch table.

## AC-15 (FR-16): Graceful test-process termination on interrupt @feature16

**Требование:** [FR-16](FR.md#fr-16-graceful-test-process-termination-on-interrupt-feature16)

WHEN обёртка получает SIGTERM/SIGINT/SIGHUP во время активного прогона THEN обёртка SHALL мягко завершить дерево дочернего процесса и удалить PID-маркер до выхода.

WHEN платформа Windows AND задан TEST_RUNNER_KILL_RECORD THEN сигнальщик дерева SHALL записать намерение `taskkill /PID <pid> /T` без флага `/F` в файл вместо реального сигнала.

IF платформа Linux/Mac THEN сигнальщик SHALL послать SIGTERM группе процессов дочернего дерева.

IF процесс не завершился за grace-окно после мягкого сигнала THEN обёртка SHALL добить дерево принудительно (Windows `taskkill /PID <pid> /T /F`; Linux/Mac SIGKILL группе процессов).

## AC-16 (FR-17): Wrapper self-imposed timeout @feature16

**Требование:** [FR-17](FR.md#fr-17-wrapper-self-imposed-timeout-feature16)

IF прогон длится дольше TEST_RUNNER_TIMEOUT_MS больше нуля THEN обёртка SHALL записать статус «run exceeded timeout», мягко завершить дерево и завершиться ненулевым кодом.

WHEN TEST_RUNNER_TIMEOUT_MS равен нулю THEN обёртка SHALL НЕ ставить собственный таймаут.

## AC-17 (FR-18): Passthrough shares graceful lifecycle @feature16

**Требование:** [FR-18](FR.md#fr-18-passthrough-shares-graceful-lifecycle-feature16)

WHEN passthrough путь прерывается THEN обёртка SHALL мягко завершить дерево тем же механизмом, что и framework-путь.

WHEN passthrough запускает кроссплатформенный npx-child THEN он SHALL вернуть тот же контракт (exit 0 и semver), что и до изменения.

## AC-18 (FR-19): Shim lifts tsx-runner ceiling @feature16

**Требование:** [FR-19](FR.md#fr-19-shim-lifts-tsx-runner-ceiling-feature16)

WHEN shim запускает обёртку AND TSX_RUNNER_TIMEOUT не задан в окружении THEN shim SHALL выставить его большим значением не меньше лимита обёртки плюс запас, чтобы 180-секундный потолок раннера не срабатывал раньше graceful-таймаута обёртки.

## AC-19 (FR-15): Build Guard Hook @feature15

**Требование:** [FR-15](FR.md#fr-15-build-guard-hook-feature15)

WHEN тест-команда vitest/jest запускается в cwd с `src/`, но без `dist/` THEN build guard SHALL отклонить с кодом 2 и причиной про `npm run build`.

WHEN Docker-тест-команда несёт `SKIP_BUILD=1` THEN build guard SHALL отклонить с кодом 2.

WHEN dotnet-тест-команда несёт `--no-build` THEN build guard SHALL отклонить с кодом 2.

IF фреймворк интерпретируемый (pytest/go/rust) OR задан `SKIP_BUILD_CHECK=1` OR команда не тестовая THEN build guard SHALL разрешить с кодом 0.

IF hook получает невалидный JSON или ошибку stat THEN build guard SHALL fail-open (код 0).
