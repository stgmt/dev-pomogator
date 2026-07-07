# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи.

См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

| Path | Action | Reason |
|------|--------|--------|
| `tools/claude-mem-health/health-check.ts` | edit | [FR-1](FR.md), [FR-2](FR.md), [FR-3](FR.md), [FR-6](FR.md) — add PreToolUse mode + debounce + down-since visibility, reusing reapWedgedWorker |
| `.claude-plugin/hooks.json` | edit | [FR-4](FR.md) — register the guard on PreToolUse (canonical distribution to all users) |
| `.claude/settings.json` | edit | [FR-4](FR.md) — register on PreToolUse (repo dogfood) |
| `tests/step_definitions/feature_claude_mem_reaper.ts` | edit | [FR-5](FR.md) — extend with mid-session / debounce / down-since step-defs reusing existing env seams |
| `cucumber.json` | edit | wire the new `.feature` into the explicit paths list |
