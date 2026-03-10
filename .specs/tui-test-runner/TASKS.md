# Tasks

## TDD Workflow

> Задачи организованы по TDD: Red -> Green -> Refactor.
> Каждый этап реализации начинается с .feature сценария (Red), затем реализация (Green), затем рефакторинг.

## Phase 0: BDD Foundation (Red)

> Создать .feature файл, step definitions, и BDD hooks ПЕРЕД реализацией бизнес-логики.
> Все сценарии должны FAIL (Red) на этом этапе.
>
> DESIGN.md содержит `TEST_DATA_ACTIVE` — fixtures для YAML samples и vitest output.

- [ ] Создать .feature файл с 18 BDD сценариями (PLUGIN012 domain) @feature1 @feature2 @feature3 @feature4 @feature5 @feature6 @feature7
  _files: `.specs/tui-test-runner/tui-test-runner.feature` (create — уже создан)_
  _Requirements: все FR_
- [ ] Создать E2E тест `tests/e2e/tui-test-runner.test.ts` с заглушками step definitions
  _files: `tests/e2e/tui-test-runner.test.ts` (create)_
  _Requirements: все FR_
- [ ] Создать fixture: `tests/fixtures/tui-test-runner/yaml-v1-running.yaml` — YAML v1 sample (state=running), lifecycle: per-test (read-only)
  _Source: DESIGN.md "BDD Test Infrastructure" > "Test Data & Fixtures"_
- [ ] Создать fixture: `tests/fixtures/tui-test-runner/yaml-v2-full.yaml` — YAML v2 full sample (suites+tests+phases), lifecycle: per-test (read-only)
  _Source: DESIGN.md "BDD Test Infrastructure" > "Test Data & Fixtures"_
- [ ] Создать fixture: `tests/fixtures/tui-test-runner/yaml-v2-failed.yaml` — YAML v2 failed sample (state=failed, errors), lifecycle: per-test (read-only)
  _Source: DESIGN.md "BDD Test Infrastructure" > "Test Data & Fixtures"_
- [ ] Создать fixture: `tests/fixtures/tui-test-runner/vitest-output.txt` — Sample vitest stdout для adapter testing, lifecycle: per-test (read-only)
  _Source: DESIGN.md "BDD Test Infrastructure" > "Test Data & Fixtures"_
- [ ] Создать BDD feature docs: `tests/features/plugins/tui-test-runner/tui-test-runner.feature` (copy from specs)
  _files: `tests/features/plugins/tui-test-runner/tui-test-runner.feature` (create)_
- [ ] Verify: все 18 сценариев FAIL (Red)

## Phase 1: Extension Scaffold & YAML v2 Protocol (Green) @feature6 @feature7

> Создать extension manifest, YAML v2 types, SessionStart hook.

- [ ] Создать `extensions/tui-test-runner/extension.json` — manifest с tools, toolFiles, hooks, postInstall, envRequirements @feature7
  _files: `extensions/tui-test-runner/extension.json` (create)_
  _Requirements: [FR-9](FR.md#fr-9-tui-launcher-feature6), [FR-10](FR.md#fr-10-sessionstart-hook-feature7)_
  _Leverage: `extensions/test-statusline/extension.json`_
- [ ] Создать `adapters/types.ts` — TestEvent interface + TestStatusV2 (extends TestStatus v1) @feature6
  _files: `extensions/tui-test-runner/tools/tui-test-runner/adapters/types.ts` (create)_
  _Requirements: [FR-6](FR.md#fr-6-yaml-v2-protocol-feature6)_
  _Leverage: `extensions/test-statusline/tools/test-statusline/status_types.ts`_
- [ ] Создать `yaml_writer.ts` — TestEvent stream → YAML v2 atomic write @feature6
  _files: `extensions/tui-test-runner/tools/tui-test-runner/yaml_writer.ts` (create)_
  _Requirements: [FR-6](FR.md#fr-6-yaml-v2-protocol-feature6)_
- [ ] Создать `tui_session_start.ts` — SessionStart hook (init status dir, env vars, fail-open) @feature7
  _files: `extensions/tui-test-runner/tools/tui-test-runner/tui_session_start.ts` (create)_
  _Requirements: [FR-10](FR.md#fr-10-sessionstart-hook-feature7)_
  _Leverage: `extensions/test-statusline/tools/test-statusline/statusline_session_start.ts`_
- [ ] Verify: сценарии @feature6 (YAML v2 backward compat, v2 writer) и @feature7 (SessionStart hook) переходят из Red в Green

## Phase 2: Framework Adapters (Green) @feature6

> Реализовать stdout parsers для vitest, jest, pytest, dotnet.

- [ ] Создать `adapters/adapter_base.ts` — Abstract base class: line → TestEvent @feature6
  _files: `extensions/tui-test-runner/tools/tui-test-runner/adapters/adapter_base.ts` (create)_
  _Requirements: [FR-7](FR.md#fr-7-universal-framework-adapters-feature6)_
- [ ] Создать `adapters/vitest_adapter.ts` — Vitest stdout parser @feature6
  _files: `extensions/tui-test-runner/tools/tui-test-runner/adapters/vitest_adapter.ts` (create)_
  _Requirements: [FR-7](FR.md#fr-7-universal-framework-adapters-feature6)_
  _Leverage: `extensions/test-statusline/tools/test-statusline/test_runner_wrapper.sh` (regex patterns)_
- [ ] Создать `adapters/jest_adapter.ts` — Jest stdout parser @feature6
  _files: `extensions/tui-test-runner/tools/tui-test-runner/adapters/jest_adapter.ts` (create)_
  _Requirements: [FR-7](FR.md#fr-7-universal-framework-adapters-feature6)_
- [ ] Создать `adapters/pytest_adapter.ts` — pytest stdout parser @feature6
  _files: `extensions/tui-test-runner/tools/tui-test-runner/adapters/pytest_adapter.ts` (create)_
  _Requirements: [FR-7](FR.md#fr-7-universal-framework-adapters-feature6)_
- [ ] Создать `adapters/dotnet_adapter.ts` — dotnet test stdout parser @feature6
  _files: `extensions/tui-test-runner/tools/tui-test-runner/adapters/dotnet_adapter.ts` (create)_
  _Requirements: [FR-7](FR.md#fr-7-universal-framework-adapters-feature6)_
  _Leverage: `D:\repos\zoho\tools\tui-test-explorer\tui_test_explorer\adapter\result_parser.py`_
- [ ] Создать `config.ts` — Framework auto-detection (vitest.config.ts, jest.config.js, pytest.ini, *.csproj) @feature6
  _files: `extensions/tui-test-runner/tools/tui-test-runner/config.ts` (create)_
  _Requirements: [FR-7](FR.md#fr-7-universal-framework-adapters-feature6)_
- [ ] Verify: сценарий "Vitest adapter parses stdout into TestEvents" @feature6 переходит из Red в Green

## Phase 3: Node.js Launcher (Green) @feature6

> Python process management и launcher.

- [ ] Создать `launcher.ts` — Python detection, Textual check, process spawn, PID management @feature6
  _files: `extensions/tui-test-runner/tools/tui-test-runner/launcher.ts` (create)_
  _Requirements: [FR-9](FR.md#fr-9-tui-launcher-feature6)_
- [ ] Verify: сценарии "Launcher detects Python" и "Launcher fails gracefully" @feature6 переходят из Red в Green

## Phase 4: Python TUI Core (Green) @feature1

> Портировать Python TUI из zoho, сделать framework-agnostic.

- [ ] Создать `tui/pyproject.toml` — Python package (textual>=0.40.0, pyyaml>=6.0) @feature1
  _files: `extensions/tui-test-runner/tools/tui-test-runner/tui/pyproject.toml` (create)_
- [ ] Создать `tui/models.py` — Python dataclasses mirroring YAML v2 schema @feature1
  _files: `extensions/tui-test-runner/tools/tui-test-runner/tui/models.py` (create)_
  _Requirements: [FR-8](FR.md#fr-8-yaml-polling-feature1)_
- [ ] Создать `tui/yaml_reader.py` — YAML polling (500ms), emit Textual messages on change @feature1
  _files: `extensions/tui-test-runner/tools/tui-test-runner/tui/yaml_reader.py` (create)_
  _Requirements: [FR-8](FR.md#fr-8-yaml-polling-feature1)_
  _Leverage: `D:\repos\zoho\tools\tui-test-explorer\tui_test_explorer\adapter\state_service.py`_
- [ ] Создать `tui/log_reader.py` — Log file tailer (streaming) @feature3
  _files: `extensions/tui-test-runner/tools/tui-test-runner/tui/log_reader.py` (create)_
  _Requirements: [FR-3](FR.md#fr-3-real-time-log-viewer-feature3)_
- [ ] Создать `tui/__main__.py` — Entry point, singleton (lock file), CLI args @feature1
  _files: `extensions/tui-test-runner/tools/tui-test-runner/tui/__main__.py` (create)_
  _Requirements: [FR-1](FR.md#fr-1-4-tab-tui-interface-feature1)_
  _Leverage: `D:\repos\zoho\tools\tui-test-explorer\tui_test_explorer\__main__.py`_
- [ ] Создать `tui/app.py` — Textual App (4 TabbedContent tabs, reactive status, polling loop) @feature1
  _files: `extensions/tui-test-runner/tools/tui-test-runner/tui/app.py` (create)_
  _Requirements: [FR-1](FR.md#fr-1-4-tab-tui-interface-feature1)_
  _Leverage: `D:\repos\zoho\tools\tui-test-explorer\tui_test_explorer\ui\app.py`_
- [ ] Verify: сценарии @feature1 (4 tabs, tab switching, YAML polling) переходят из Red в Green

## Phase 5: Python TUI Widgets (Green) @feature2 @feature3 @feature4 @feature5

> Портировать виджеты из zoho, сделать framework-agnostic.

- [ ] Создать `tui/widgets/monitoring_tab.py` — Dashboard: phase, percent, duration, counters @feature4
  _files: `extensions/tui-test-runner/tools/tui-test-runner/tui/widgets/monitoring_tab.py` (create)_
  _Requirements: [FR-4](FR.md#fr-4-monitoring-dashboard-feature4)_
  _Leverage: `D:\repos\zoho\tools\tui-test-explorer\tui_test_explorer\ui\widgets\monitoring_tab.py`_
- [ ] Создать `tui/widgets/tests_tab.py` — Tree widget: suite→test, status icons, sort, filter @feature2
  _files: `extensions/tui-test-runner/tools/tui-test-runner/tui/widgets/tests_tab.py` (create)_
  _Requirements: [FR-2](FR.md#fr-2-test-tree-view-feature2)_
  _Leverage: `D:\repos\zoho\tools\tui-test-explorer\tui_test_explorer\ui\widgets\tests_tab.py` (rewritten for YAML v2)_
- [ ] Создать `tui/widgets/logs_tab.py` — Log viewer with 20+ regex highlight patterns @feature3
  _files: `extensions/tui-test-runner/tools/tui-test-runner/tui/widgets/logs_tab.py` (create)_
  _Requirements: [FR-3](FR.md#fr-3-real-time-log-viewer-feature3)_
  _Leverage: `D:\repos\zoho\tools\tui-test-explorer\tui_test_explorer\ui\widgets\logs_tab.py` (copy as-is, patterns generic)_
- [ ] Создать `tui/widgets/analysis_tab.py` — Error grouping, patterns, recommendations @feature5
  _files: `extensions/tui-test-runner/tools/tui-test-runner/tui/widgets/analysis_tab.py` (create)_
  _Requirements: [FR-5](FR.md#fr-5-failure-analysis-feature5)_
  _Leverage: `D:\repos\zoho\tools\tui-test-explorer\analyst\` (generalized, remove dotnet-specific)_
- [ ] Verify: сценарии @feature2 (tree, sort), @feature3 (logs, highlighting), @feature4 (monitoring, phases), @feature5 (analysis) переходят из Red в Green

## Phase 6: Centralized Test Runner (Green) @feature11 @feature12 @feature13 @feature14

> Skill /run-tests, test guard hook, dispatch table, rule.

- [x] Создать `dispatch.ts` — framework→command mapping (6 фреймворков) @feature14
  _files: `extensions/tui-test-runner/tools/tui-test-runner/dispatch.ts` (create)_
  _Requirements: [FR-14](FR.md#fr-14-dispatch-table-feature14)_
- [x] Создать `test_guard.ts` — PreToolUse Bash blocker с инструкцией @feature12
  _files: `extensions/tui-test-runner/tools/tui-test-runner/test_guard.ts` (create)_
  _Requirements: [FR-12](FR.md#fr-12-test-guard-hook-feature12)_
  _Leverage: `extensions/specs-workflow/tools/specs-validator/phase-gate.ts` (deny pattern)_
- [x] Создать `skills/run-tests/SKILL.md` — skill definition @feature11
  _files: `extensions/tui-test-runner/skills/run-tests/SKILL.md` (create)_
  _Requirements: [FR-11](FR.md#fr-11-skill-run-tests-feature11)_
- [x] Создать `.claude/rules/centralized-test-runner.md` — rule @feature13
  _files: `.claude/rules/centralized-test-runner.md` (create)_
  _Requirements: [FR-13](FR.md#fr-13-rule-centralized-test-runner-feature13)_
- [x] Добавить Rust/Go в config.ts и types.ts @feature14
  _files: `config.ts` (edit), `adapters/types.ts` (edit)_
- [x] Обновить extension.json — skills, PreToolUse hook, rules, toolFiles @feature11
  _files: `extensions/tui-test-runner/extension.json` (edit)_
- [x] Verify: 9 тестов test guard (block/allow/bypass) + 3 dispatch + 2 skill/rule GREEN

## Phase 7: Refactor & Polish

- [ ] Рефакторинг: DRY между adapters (общие regex patterns)
- [ ] Все 31 E2E тестов GREEN
- [ ] Обновить CLAUDE.md — добавить tui-test-runner и centralized-test-runner в glossary
  _files: `CLAUDE.md` (edit)_
  _Requirements: NFR-U4_
