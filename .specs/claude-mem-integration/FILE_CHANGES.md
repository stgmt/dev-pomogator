# File Changes

| Path | Action | Reason |
|------|--------|--------|
| `tools/claude-mem-bootstrap/install-claude-mem.ts` | create | Non-interactive claude-mem bootstrap hook (FR-1..FR-4). |
| `.claude-plugin/hooks.json` | edit | Register SessionStart bootstrap hook for plugin users (FR-3). |
| `.claude/settings.json` | edit | Dogfood registration of the bootstrap hook (registry-parity). |
| `.claude/skills/pomogator-doctor/scripts/engine/checks/claude-mem-plugin.ts` | create | Doctor C-CMEM detection check (FR-5). |
| `.claude/skills/pomogator-doctor/scripts/engine/checks/mcp-parse.ts` | edit | Read canonical `~/.claude.json` (FR-6). |
| `.claude/skills/pomogator-doctor/scripts/engine/checks/index.ts` | edit | Register C-CMEM in phase4. |
| `.claude/skills/pomogator-doctor/SKILL.md` | edit | Check count 18 to 19 plus C-CMEM doc. |
| `tests/step_definitions/feature_claude_mem_bootstrap.ts` | create | Step-defs driving real code. |
| `tests/fixtures/claude-mem-bootstrap/record-launcher.cjs` | create | Recorded-launcher test seam. |
| `cucumber.json` | edit | Wire the feature into the suite. |
