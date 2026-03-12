# Functional Requirements (FR)

## FR-1: 4-Tab TUI Interface @feature1

TUI приложение отображает 4 вкладки: Tests, Logs, Monitoring, Analysis. Переключение по клавишам 1-4. Monitoring tab активен по умолчанию при запуске.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-4-tab-tui-interface)
**Use Case:** [UC-1](USE_CASES.md#uc-1-запуск-tui-и-мониторинг-тестов-feature1)

## FR-2: Test Tree View @feature2

Вкладка Tests показывает иерархическое дерево suite → test. Каждый элемент имеет иконку статуса (✅ passed, ❌ failed, ⏭️ skipped, 🔄 running, ⏳ pending). Failed тесты сортируются наверх. Поддерживается фильтрация по имени и статусу (клавиша `f`).

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-test-tree-view)
**Use Case:** [UC-2](USE_CASES.md#uc-2-просмотр-иерархии-тестов-feature2)

## FR-3: Real-Time Log Viewer @feature3

Вкладка Logs показывает stdout тестов в реальном времени с автоскроллом. Syntax highlighting через 20+ regex patterns: stack traces, timestamps, BDD keywords (Given/When/Then), HTTP codes, file paths, log levels (INF/WRN/ERR).

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3-real-time-log-viewer)
**Use Case:** [UC-3](USE_CASES.md#uc-3-просмотр-логов-в-реальном-времени-feature3)

## FR-4: Monitoring Dashboard @feature4

Вкладка Monitoring показывает: текущая фаза (setup/build/test/done), процент выполнения, duration, aggregate counters (total/passed/failed/skipped), имя текущего теста.

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4-monitoring-dashboard)
**Use Case:** [UC-4](USE_CASES.md#uc-4-мониторинг-прогресса-feature4)

## FR-5: Failure Analysis @feature5

Вкладка Analysis автоматически группирует failed тесты по паттернам ошибок (timeout, assertion, connection, runtime). Для каждой группы показывает: тип ошибки, количество, error message, stack trace, рекомендации по исправлению.

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5-failure-analysis)
**Use Case:** [UC-5](USE_CASES.md#uc-5-анализ-ошибок-feature5)

## FR-6: YAML v2 Protocol @feature6

YAML status file фиксируется как canonical v2 runtime contract: flat summary поля (version, session_id, pid, state, total, passed, failed, skipped, running, percent, duration_ms, error_message, log_file) и structured sections suites[]/phases[] обязаны присутствовать в одном payload для statusline и TUI.

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6-yaml-v2-protocol)
**Use Case:** [UC-7](USE_CASES.md#uc-7-сосуществование-с-test-statusline-feature7)

## FR-7: Universal Framework Adapters @feature6

Node.js adapters парсят stdout каждого тест-фреймворка (vitest, jest, pytest, dotnet, rust, go) в универсальный TestEvent interface. Framework передаётся в wrapper через явный аргумент `--framework`; autodetect используется только если wrapper запускается вне dispatch path.

**Связанные AC:** [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7-universal-framework-adapters)
**Use Case:** [UC-6](USE_CASES.md#uc-6-использование-с-разными-фреймворками-feature6)

## FR-8: YAML Polling @feature1

Python TUI читает canonical YAML v2 status file через polling с интервалом 500ms. При изменении данных TUI обновляет все вкладки и отклоняет payload, который не соответствует обязательной v2 schema.

**Связанные AC:** [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8-yaml-polling)
**Use Case:** [UC-1](USE_CASES.md#uc-1-запуск-tui-и-мониторинг-тестов-feature1)

## FR-9: TUI Launcher @feature6

Node.js launcher определяет наличие Python, проверяет установку Textual, запускает TUI процесс. При отсутствии Python выводит понятное сообщение об ошибке и exit 0 (fail-open).

**Связанные AC:** [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9-tui-launcher)
**Use Case:** [UC-1](USE_CASES.md#uc-1-запуск-tui-и-мониторинг-тестов-feature1)

## FR-10: SessionStart Hook @feature7

Hook инициализирует status directory (.dev-pomogator/.test-status/), пишет canonical env vars в $CLAUDE_ENV_FILE: TEST_STATUSLINE_SESSION и TEST_STATUSLINE_PROJECT. Fail-open: всегда exit 0.

**Связанные AC:** [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10-sessionstart-hook)
**Use Case:** [UC-7](USE_CASES.md#uc-7-сосуществование-с-test-statusline-feature7)

## FR-11: Skill /run-tests @feature11

Skill `/run-tests [filter]` — централизованная точка запуска тестов. Автодетект фреймворка (vitest/jest/pytest/dotnet/rust/go), dispatch команды через test_runner_wrapper.sh, поддержка фильтра, --framework override, --docker mode.

**Связанные AC:** [AC-11](ACCEPTANCE_CRITERIA.md#ac-11-fr-11-skill-run-tests-feature11)

## FR-12: Test Guard Hook @feature12

PreToolUse hook на Bash — блокирует прямые тест-команды (npm test, npx vitest, pytest, dotnet test, cargo test, go test). При блокировке выдаёт полную инструкцию по /run-tests с аргументами. Исключения: test_runner_wrapper (уже wrapped), TEST_GUARD_BYPASS=1.

**Связанные AC:** [AC-12](ACCEPTANCE_CRITERIA.md#ac-12-fr-12-test-guard-hook-feature12)

## FR-13: Rule centralized-test-runner @feature13

Rule документирует что тесты запускаются только через `/run-tests`, причину (wrapper для YAML status) и bypass через TEST_GUARD_BYPASS=1.

## FR-14: Dispatch Table @feature14

Framework → test command mapping. Поддержка 6 фреймворков: vitest, jest, pytest, dotnet, rust (cargo), go. Расширяемый: добавить новый фреймворк = 1 строка.
