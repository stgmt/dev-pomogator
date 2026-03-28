# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи.

См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

| Path | Action | Reason |
|------|--------|--------|
| `extensions/tui-test-runner/tools/tui-test-runner/build-staleness.ts` | create | FR-2, FR-3, FR-4, FR-5 — staleness module |
| `extensions/tui-test-runner/tools/tui-test-runner/build_guard.ts` | create | FR-1, FR-6, FR-7 — PreToolUse hook |
| `extensions/tui-test-runner/extension.json` | edit | FR-1 — register hook + toolFiles |
| `.claude/skills/run-tests/SKILL.md` | edit | Note про build-guard hook |
| `.claude/rules/tui-test-runner/centralized-test-runner.md` | edit | Секция Build Guard |
| `tests/e2e/build-guard.test.ts` | create | Интеграционные тесты для всех AC |
| `tests/features/plugins/tui-test-runner/build-guard.feature` | create | BDD сценарии (12 scenarios) |
