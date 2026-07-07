# Claude Mem Midsession Reaper

Mid-session safety net for the dev-pomogator claude-mem integration. The existing SessionStart reaper can clean a wedged claude-mem worker only when a new Claude Code session opens; this spec adds the same protection before tool calls inside an already-active session.

## Ключевые идеи

- Reuse the existing surgical claude-mem reaper instead of inventing a second process-kill path.
- Keep normal tool calls cheap with a persisted debounce marker, so the guard does not probe the worker on every single call.
- If memory stays down, show a visible non-blocking warning instead of silently losing observations or blocking every tool call.

## Где лежит реализация

- **Hook logic**: `tools/claude-mem-health/health-check.ts`
- **Canonical plugin wiring**: `.claude-plugin/hooks.json`
- **Dogfood wiring**: `.claude/settings.json`
- **BDD step definitions**: `tests/step_definitions/feature_claude_mem_reaper.ts`
- **BDD feature registration**: `cucumber.json`

## Где читать дальше

- [USER_STORIES.md](USER_STORIES.md)
- [USE_CASES.md](USE_CASES.md)
- [RESEARCH.md](RESEARCH.md)
- [REQUIREMENTS.md](REQUIREMENTS.md)
- [FR.md](FR.md)
- [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md)
- [DESIGN.md](DESIGN.md)
- [TASKS.md](TASKS.md)
- [FILE_CHANGES.md](FILE_CHANGES.md)
