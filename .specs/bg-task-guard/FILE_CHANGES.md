# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи.

См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

| Path | Action | Reason |
|------|--------|--------|
| `extensions/test-statusline/tools/bg-task-guard/mark-bg-task.sh` | create | [FR-1](FR.md#fr-1-posttooluse-marker-creation-feature1) — PostToolUse hook |
| `extensions/test-statusline/tools/bg-task-guard/stop-guard.sh` | create | [FR-2](FR.md#fr-2-stop-hook-блокировка-при-активном-marker-feature1) — Stop hook |
| `extensions/test-statusline/extension.json` | edit | Добавить hooks (PostToolUse, Stop) и toolFiles для bg-task-guard |
| `tests/e2e/bg-task-guard.test.ts` | create | E2E тесты для hook поведения |
| `tests/features/plugins/bg-task-guard/GUARD002_bg-task-guard.feature` | create | BDD feature файл |
