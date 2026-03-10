# Tasks

## TDD Workflow

> Задачи организованы по TDD: Red -> Green -> Refactor.
> Каждый этап реализации начинается с .feature сценария (Red), затем реализация (Green), затем рефакторинг.
>
> **Порядок фаз (по приоритету и зависимостям):**
> Phase 0 → Phase 1 (Clickable Paths) → Phase 2 (State Persistence) → Phase 3 (Error Patterns) → Phase 4 (Test Discovery) → Phase 5 (Auto-Run) → Phase 6 (AI Test Analyst) → Phase 7 (Screenshot) → Phase 8 (Refactor)

## Phase 0: BDD Foundation (Red)

> Создать .feature файл, step definitions, и BDD hooks ПЕРЕД реализацией бизнес-логики.
> Все сценарии должны FAIL (Red) на этом этапе.
>
> **DESIGN.md содержит `TEST_DATA_ACTIVE`** — Phase 0 содержит задачи для hooks и fixtures.

- [ ] Создать BDD feature файл `tests/features/plugins/tui-test-runner/PLUGIN013_tui-test-runner-v2.feature` из `.specs/tui-test-runner-v2/tui-test-runner-v2.feature`
  _files: `tests/features/plugins/tui-test-runner/PLUGIN013_tui-test-runner-v2.feature` (create)_
  _Requirements: все FR (FR-1..FR-7)_
- [ ] Создать E2E test file `tests/e2e/tui-test-runner-v2.test.ts` с step definitions (заглушки с `throw new Error('Not implemented')`)
  _files: `tests/e2e/tui-test-runner-v2.test.ts` (create)_
  _Requirements: все FR_
- [ ] Создать hook: `tests/e2e/helpers/tui-v2-cleanup.ts` (AfterEach, per-scenario) — cleanup для temp YAML status files, .tui-state.*.yaml, lock files, screenshots
  _Source: DESIGN.md "BDD Test Infrastructure" > "Новые hooks"_
  _files: `tests/e2e/helpers/tui-v2-cleanup.ts` (create)_
- [ ] Verify: все 20 сценариев FAIL (Red)

## Phase 1: Clickable File Paths (Green) @feature2

> Quick win — самый простой компонент (224 LOC прямой порт из zoho).

- [ ] Создать ClickablePath widget `tui/widgets/clickable_path.py` — regex detection путей (Windows + Unix), on-click open, amber flash, truncation @feature2
  _files: `extensions/tui-test-runner/tools/tui-test-runner/tui/widgets/clickable_path.py` (create)_
  _Requirements: [FR-2](FR.md#fr-2-clickable-file-paths-feature2)_
  _Leverage: `D:\repos\zoho\tools\tui-test-explorer\tui_test_explorer\ui\widgets\clickable_path.py` (224 LOC — прямой порт)_
- [ ] Интегрировать ClickablePath в logs_tab.py — заменить plain text пути на clickable widgets @feature2
  _files: `extensions/tui-test-runner/tools/tui-test-runner/tui/widgets/logs_tab.py` (edit)_
  _Requirements: [FR-2](FR.md#fr-2-clickable-file-paths-feature2)_
- [ ] Verify: сценарии @feature2 (PLUGIN013_05, 06, 07) переходят из Red в Green

## Phase 2: State Persistence (Green) @feature4

> Low effort — прямой порт StateService + session isolation.

- [ ] Создать StateService `tui/state_service.py` — Singleton, debounced YAML save (0.5s), session prefix, thread-safe Lock @feature4
  _files: `extensions/tui-test-runner/tools/tui-test-runner/tui/state_service.py` (create)_
  _Requirements: [FR-4](FR.md#fr-4-state-persistence-feature4)_
  _Leverage: `D:\repos\zoho\tools\tui-test-explorer\tui_test_explorer\adapter\state_service.py` (181 LOC — прямой порт + session prefix)_
- [ ] Интегрировать StateService в app.py — restore state on startup, save on tab switch/filter change @feature4
  _files: `extensions/tui-test-runner/tools/tui-test-runner/tui/app.py` (edit)_
  _Requirements: [FR-4](FR.md#fr-4-state-persistence-feature4)_
- [ ] Verify: сценарии @feature4 (PLUGIN013_11, 12, 13) переходят из Red в Green

## Phase 3: Configurable Error Patterns (Green) @feature5

> Foundation для AI Analyst (Phase 6 зависит от PatternMatcher).

- [ ] Создать patterns.yaml `tui/analyst/patterns.yaml` — 30+ built-in паттернов (timeout, connection, DB, auth, HTTP, assertion, browser, file I/O) @feature5
  _files: `extensions/tui-test-runner/tools/tui-test-runner/tui/analyst/patterns.yaml` (create)_
  _Requirements: [FR-5](FR.md#fr-5-configurable-error-patterns-feature5)_
  _Leverage: `D:\repos\zoho\tools\tui-test-explorer\analyst\patterns.yaml` (адаптация — убрать .NET-specific, добавить vitest/jest)_
- [ ] Создать PatternMatcher `tui/analyst/patterns.py` — загрузка YAML, merge user override, regex first → keyword ALL → first wins @feature5
  _files: `extensions/tui-test-runner/tools/tui-test-runner/tui/analyst/patterns.py` (create), `extensions/tui-test-runner/tools/tui-test-runner/tui/analyst/__init__.py` (create)_
  _Requirements: [FR-5](FR.md#fr-5-configurable-error-patterns-feature5), [FR-1a](FR.md#fr-1a-pattern-matching-feature1)_
  _Leverage: `D:\repos\zoho\tools\tui-test-explorer\analyst\patterns.py` (283 LOC — адаптация)_
- [ ] Verify: сценарии @feature5 (PLUGIN013_14, 15, 16) переходят из Red в Green

## Phase 4: Test Discovery (Green) @feature3

> Framework-specific discovery commands + checkbox selection UI.

- [ ] Создать Discovery module `tui/discovery.py` — 6 framework discovery commands (vitest, jest, pytest, dotnet, rust, go), parse output → tree nodes, 30s timeout @feature3
  _files: `extensions/tui-test-runner/tools/tui-test-runner/tui/discovery.py` (create)_
  _Requirements: [FR-3](FR.md#fr-3-test-discovery-feature3)_
  _Leverage: `D:\repos\zoho\tools\tui-test-explorer\tui_test_explorer\adapter\discovery.py` (77 LOC — расширить на 6 фреймворков)_
- [ ] Интегрировать Discovery в tests_tab.py — tree view с checkbox, filtered run @feature3
  _files: `extensions/tui-test-runner/tools/tui-test-runner/tui/widgets/tests_tab.py` (edit)_
  _Requirements: [FR-3](FR.md#fr-3-test-discovery-feature3)_
- [ ] Verify: сценарии @feature3 (PLUGIN013_08, 09, 10) переходят из Red в Green

## Phase 5: Auto-Run & Keybinding Launch (Green) @feature6

> Keybinding launch + --run/--filter flags + single instance.

- [ ] Обновить __main__.py — добавить CLI args --run, --filter, auto-start tests при запуске @feature6
  _files: `extensions/tui-test-runner/tools/tui-test-runner/tui/__main__.py` (edit)_
  _Requirements: [FR-6](FR.md#fr-6-auto-run--keybinding-launch-feature6)_
  _Leverage: `D:\repos\zoho\tools\tui-test-explorer\__main__.py` (197 LOC — адаптация)_
- [ ] Обновить launcher.ts — --run/--filter passthrough, single instance PID lock @feature6
  _files: `extensions/tui-test-runner/tools/tui-test-runner/launcher.ts` (edit)_
  _Requirements: [FR-6](FR.md#fr-6-auto-run--keybinding-launch-feature6)_
- [ ] Verify: сценарии @feature6 (PLUGIN013_17, 18) переходят из Red в Green

## Phase 6: AI Test Analyst (Green) @feature1

> Самый сложный компонент. Зависит от Phase 3 (PatternMatcher).

- [ ] Создать CodeReader `tui/analyst/code_reader.py` — поиск файла в проекте, извлечение ±3 строк, кеширование, arrow indicator @feature1
  _files: `extensions/tui-test-runner/tools/tui-test-runner/tui/analyst/code_reader.py` (create)_
  _Requirements: [FR-1b](FR.md#fr-1b-code-snippet-extraction-feature1)_
  _Leverage: `D:\repos\zoho\tools\tui-test-explorer\analyst\code_reader.py` (прямой порт)_
- [ ] Создать Parsers `tui/analyst/parsers.py` — stack trace parsing для vitest/jest/pytest/dotnet/rust/go, извлечение crash_point и call_tree @feature1
  _files: `extensions/tui-test-runner/tools/tui-test-runner/tui/analyst/parsers.py` (create)_
  _Requirements: [FR-1c](FR.md#fr-1c-structured-failure-reports-v3-feature1)_
  _Leverage: `D:\repos\zoho\tools\tui-test-explorer\analyst\parsers.py` (адаптация — убрать Serilog, добавить vitest/jest stack traces)_
- [ ] Создать Output `tui/analyst/output.py` — V3 report generation (location, bdd_steps, log_context, matched_pattern, structured_context) @feature1
  _files: `extensions/tui-test-runner/tools/tui-test-runner/tui/analyst/output.py` (create)_
  _Requirements: [FR-1c](FR.md#fr-1c-structured-failure-reports-v3-feature1)_
  _Leverage: `D:\repos\zoho\tools\tui-test-explorer\analyst\output.py` (адаптация v3 формата)_
- [ ] Создать PatternGenerator `tui/analyst/pattern_generator.py` — LLM pattern generation CLI (aipomogator.ru API, DeepSeek, JSON Schema output) @feature1
  _files: `extensions/tui-test-runner/tools/tui-test-runner/tui/analyst/pattern_generator.py` (create)_
  _Requirements: [FR-1d](FR.md#fr-1d-llm-pattern-generation-feature1)_
- [ ] Интегрировать AI Analyst в analysis_tab.py — заменить hardcoded patterns на PatternMatcher + v3 failure cards @feature1
  _files: `extensions/tui-test-runner/tools/tui-test-runner/tui/widgets/analysis_tab.py` (edit)_
  _Requirements: [FR-1](FR.md#fr-1-ai-test-analyst-feature1)_
- [ ] Verify: сценарии @feature1 (PLUGIN013_01, 02, 03, 04) переходят из Red в Green

## Phase 7: Screenshot/SVG Export (Green) @feature7

> Самый низкий приоритет. Использует built-in Textual `export_screenshot()`.

- [ ] Добавить screenshot export в app.py — keybinding trigger, export_screenshot() → SVG, auto-create dir, clipboard copy, notification @feature7
  _files: `extensions/tui-test-runner/tools/tui-test-runner/tui/app.py` (edit)_
  _Requirements: [FR-7](FR.md#fr-7-screenshotsvg-export-feature7)_
  _Leverage: `D:\repos\zoho\tools\tui-test-explorer\tui_test_explorer\ui\app.py` (lines 464-487 — прямой порт)_
- [ ] Verify: сценарии @feature7 (PLUGIN013_19, 20) переходят из Red в Green

## Phase 8: Integration & Refactor

> Финальная интеграция, обновление манифеста, рефакторинг.

- [ ] Обновить extension.json — добавить новые toolFiles (analyst/*, clickable_path, state_service, discovery)
  _files: `extensions/tui-test-runner/extension.json` (edit)_
  _Requirements: NFR-R5 (обратная совместимость)_
- [ ] Рефакторинг: убрать дублирование кода между компонентами, выделить общие утилиты
- [ ] Все 20 BDD сценариев GREEN
- [ ] E2E тест-план выполнен через `/run-tests`
