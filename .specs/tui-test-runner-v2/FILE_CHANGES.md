# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи.

См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

## Python TUI — AI Analyst Module (FR-1)

| Path | Action | Reason |
|------|--------|--------|
| `extensions/tui-test-runner/tools/tui-test-runner/tui/analyst/__init__.py` | create | Package marker для analyst модуля |
| `extensions/tui-test-runner/tools/tui-test-runner/tui/analyst/patterns.py` | create | [FR-1a](FR.md#fr-1a-pattern-matching-feature1) Pattern matching engine |
| `extensions/tui-test-runner/tools/tui-test-runner/tui/analyst/patterns.yaml` | create | [FR-5](FR.md#fr-5-configurable-error-patterns-feature5) Built-in error patterns (30+) |
| `extensions/tui-test-runner/tools/tui-test-runner/tui/analyst/code_reader.py` | create | [FR-1b](FR.md#fr-1b-code-snippet-extraction-feature1) Code snippet extraction |
| `extensions/tui-test-runner/tools/tui-test-runner/tui/analyst/parsers.py` | create | [FR-1c](FR.md#fr-1c-structured-failure-reports-v3-feature1) Stack trace и log parsing |
| `extensions/tui-test-runner/tools/tui-test-runner/tui/analyst/output.py` | create | [FR-1c](FR.md#fr-1c-structured-failure-reports-v3-feature1) V3 report generation |
| `extensions/tui-test-runner/tools/tui-test-runner/tui/analyst/pattern_generator.py` | create | [FR-1d](FR.md#fr-1d-llm-pattern-generation-feature1) LLM pattern generation CLI |

## Python TUI — Widgets (FR-2, FR-3)

| Path | Action | Reason |
|------|--------|--------|
| `extensions/tui-test-runner/tools/tui-test-runner/tui/widgets/clickable_path.py` | create | [FR-2](FR.md#fr-2-clickable-file-paths-feature2) Clickable file path widget |
| `extensions/tui-test-runner/tools/tui-test-runner/tui/widgets/analysis_tab.py` | edit | [FR-1](FR.md#fr-1-ai-test-analyst-feature1) Заменить hardcoded patterns на PatternMatcher + v3 cards |
| `extensions/tui-test-runner/tools/tui-test-runner/tui/widgets/logs_tab.py` | edit | [FR-2](FR.md#fr-2-clickable-file-paths-feature2) Интегрировать ClickablePath в highlight |
| `extensions/tui-test-runner/tools/tui-test-runner/tui/widgets/tests_tab.py` | edit | [FR-3](FR.md#fr-3-test-discovery-feature3) Checkbox selection + discovery |

## Python TUI — State & Discovery (FR-3, FR-4)

| Path | Action | Reason |
|------|--------|--------|
| `extensions/tui-test-runner/tools/tui-test-runner/tui/state_service.py` | create | [FR-4](FR.md#fr-4-state-persistence-feature4) Singleton + debounced YAML persistence |
| `extensions/tui-test-runner/tools/tui-test-runner/tui/discovery.py` | create | [FR-3](FR.md#fr-3-test-discovery-feature3) Framework-specific test discovery |

## Python TUI — App Integration (FR-6, FR-7)

| Path | Action | Reason |
|------|--------|--------|
| `extensions/tui-test-runner/tools/tui-test-runner/tui/app.py` | edit | [FR-6](FR.md#fr-6-auto-run--keybinding-launch-feature6), [FR-7](FR.md#fr-7-screenshotsvg-export-feature7) Auto-run, screenshot, state restore |
| `extensions/tui-test-runner/tools/tui-test-runner/tui/__main__.py` | edit | [FR-6](FR.md#fr-6-auto-run--keybinding-launch-feature6) CLI args --run, --filter |

## Node.js — Launcher (FR-6)

| Path | Action | Reason |
|------|--------|--------|
| `extensions/tui-test-runner/tools/tui-test-runner/launcher.ts` | edit | [FR-6](FR.md#fr-6-auto-run--keybinding-launch-feature6) --run/--filter passthrough |

## Extension Manifest

| Path | Action | Reason |
|------|--------|--------|
| `extensions/tui-test-runner/extension.json` | edit | Добавить новые toolFiles (analyst/*, clickable_path, state_service, discovery) |

## BDD Tests

| Path | Action | Reason |
|------|--------|--------|
| `tests/features/plugins/tui-test-runner/PLUGIN013_tui-test-runner-v2.feature` | create | BDD сценарии для v2 фич |
| `tests/e2e/tui-test-runner-v2.test.ts` | create | E2E тесты для v2 фич |
| `tests/e2e/helpers/tui-v2-cleanup.ts` | create | AfterEach cleanup hook (DESIGN.md BDD Test Infrastructure) |
