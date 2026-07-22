# Changelog

## 2026-07-21

- Created spec `context-mode-integration`.
- Consolidated requirements from canonical GitHub issue #139.
- Analyzed claude-mem bootstrap/health as the reference safety pattern.
- Captured key divergence: context-mode full `/plugin` install cannot be automated from SessionStart shell hooks.
- Added BDD scenarios for setup, MCP-only mode, doctor classification, recovery, hook safety, Windows/worktree guidance, and honest value boundary.
