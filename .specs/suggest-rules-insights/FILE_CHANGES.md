# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи.

См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

| Path | Action | Reason |
|------|--------|--------|
| `.claude/commands/suggest-rules.md` | edit | Phase -0.5 Insights Context (lines 180-313) — реализовано через `Skill("deep-insights")` invocation как primary path + direct `Read(~/.claude/usage-data/report.html)` как Legacy Mode fallback (lines 298-313). Phase 3 source markers `📊 insights` / `📊 insights ⚠️` (stale) на месте. Originally planned path `extensions/suggest-rules/claude/commands/suggest-rules.md` — переехало в standard `.claude/commands/` layout (suggest-rules стал slash-command-only, без installer-driven extension layer). |
| `extensions/suggest-rules/cursor/commands/suggest-rules.md` | no change | Cursor version -- Phase -0.5 is Claude-only, no modifications needed |
| `extensions/suggest-rules/extension.json` | edit | Bump version 1.3.0 -> 1.4.0 |
| `extensions/suggest-rules/adaptation-report.md` | edit | Add Claude-only section note documenting Phase -0.5 platform divergence |
