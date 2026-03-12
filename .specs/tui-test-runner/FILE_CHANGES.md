# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи.

См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

| Path | Action | Reason |
|------|--------|--------|
| `extensions/tui-test-runner/extension.json` | create | [FR-9](FR.md#fr-9-tui-launcher-feature6), [FR-10](FR.md#fr-10-sessionstart-hook-feature7) — Extension manifest |
| `extensions/tui-test-runner/tools/tui-test-runner/launcher.ts` | create | [FR-9](FR.md#fr-9-tui-launcher-feature6) — Python TUI process manager |
| `extensions/tui-test-runner/tools/tui-test-runner/config.ts` | create | [FR-7](FR.md#fr-7-universal-framework-adapters-feature6) — Framework detection |
| `extensions/tui-test-runner/tools/tui-test-runner/tui_session_start.ts` | create | [FR-10](FR.md#fr-10-sessionstart-hook-feature7) — SessionStart hook |
| `extensions/tui-test-runner/tools/tui-test-runner/yaml_writer.ts` | create | [FR-6](FR.md#fr-6-yaml-v2-protocol-feature6) — YAML v2 status writer |
| `extensions/tui-test-runner/tools/tui-test-runner/adapters/types.ts` | create | [FR-6](FR.md#fr-6-yaml-v2-protocol-feature6) — TestEvent + TestStatusV2 interfaces |
| `extensions/tui-test-runner/tools/tui-test-runner/adapters/adapter_base.ts` | create | [FR-7](FR.md#fr-7-universal-framework-adapters-feature6) — Abstract adapter |
| `extensions/tui-test-runner/tools/tui-test-runner/adapters/vitest_adapter.ts` | create | [FR-7](FR.md#fr-7-universal-framework-adapters-feature6) — Vitest stdout parser |
| `extensions/tui-test-runner/tools/tui-test-runner/adapters/jest_adapter.ts` | create | [FR-7](FR.md#fr-7-universal-framework-adapters-feature6) — Jest stdout parser |
| `extensions/tui-test-runner/tools/tui-test-runner/adapters/pytest_adapter.ts` | create | [FR-7](FR.md#fr-7-universal-framework-adapters-feature6) — pytest stdout parser |
| `extensions/tui-test-runner/tools/tui-test-runner/adapters/dotnet_adapter.ts` | create | [FR-7](FR.md#fr-7-universal-framework-adapters-feature6) — dotnet test stdout parser |
| `extensions/tui-test-runner/tools/tui-test-runner/tui/pyproject.toml` | create | Python dependencies (textual, pyyaml) |
| `extensions/tui-test-runner/tools/tui-test-runner/tui/__main__.py` | create | [FR-1](FR.md#fr-1-4-tab-tui-interface-feature1) — TUI entry point |
| `extensions/tui-test-runner/tools/tui-test-runner/tui/app.py` | create | [FR-1](FR.md#fr-1-4-tab-tui-interface-feature1) — Textual App (4 tabs) |
| `extensions/tui-test-runner/tools/tui-test-runner/tui/models.py` | create | [FR-8](FR.md#fr-8-yaml-polling-feature1) — Python dataclasses |
| `extensions/tui-test-runner/tools/tui-test-runner/tui/yaml_reader.py` | create | [FR-8](FR.md#fr-8-yaml-polling-feature1) — YAML polling |
| `extensions/tui-test-runner/tools/tui-test-runner/tui/log_reader.py` | create | [FR-3](FR.md#fr-3-real-time-log-viewer-feature3) — Log file tailer |
| `extensions/tui-test-runner/tools/tui-test-runner/tui/widgets/tests_tab.py` | create | [FR-2](FR.md#fr-2-test-tree-view-feature2) — Test tree widget |
| `extensions/tui-test-runner/tools/tui-test-runner/tui/widgets/logs_tab.py` | create | [FR-3](FR.md#fr-3-real-time-log-viewer-feature3) — Log viewer widget |
| `extensions/tui-test-runner/tools/tui-test-runner/tui/widgets/monitoring_tab.py` | create | [FR-4](FR.md#fr-4-monitoring-dashboard-feature4) — Monitoring widget |
| `extensions/tui-test-runner/tools/tui-test-runner/tui/widgets/analysis_tab.py` | create | [FR-5](FR.md#fr-5-failure-analysis-feature5) — Analysis widget |
| `tests/e2e/tui-test-runner.test.ts` | create | E2E тесты для адаптеров и YAML v2 |
| `tests/features/plugins/tui-test-runner/tui-test-runner.feature` | create | BDD scenarios |
| `tests/fixtures/tui-test-runner/yaml-v2-running.yaml` | create | Test fixture: canonical YAML v2 sample |
| `tests/fixtures/tui-test-runner/yaml-v2-full.yaml` | create | Test fixture: YAML v2 sample |
| `tests/fixtures/tui-test-runner/yaml-v2-failed.yaml` | create | Test fixture: YAML v2 failed |
| `tests/fixtures/tui-test-runner/vitest-output.txt` | create | Test fixture: vitest stdout |
| `extensions/tui-test-runner/tools/tui-test-runner/dispatch.ts` | create | [FR-14](FR.md#fr-14-dispatch-table-feature14) — Framework→command dispatch |
| `extensions/tui-test-runner/tools/tui-test-runner/test_guard.ts` | create | [FR-12](FR.md#fr-12-test-guard-hook-feature12) — PreToolUse Bash blocker |
| `extensions/tui-test-runner/skills/run-tests/SKILL.md` | create | [FR-11](FR.md#fr-11-skill-run-tests-feature11) — /run-tests skill |
| `.claude/rules/centralized-test-runner.md` | create | [FR-13](FR.md#fr-13-rule-centralized-test-runner-feature13) — Rule |
| `CLAUDE.md` | edit | Добавить tui-test-runner и centralized-test-runner rule в glossary |
