# context-mode Integration

## Summary

This feature specifies context-mode integration for dev-pomogator. It makes context-mode setup and repair behave like the existing claude-mem integration where that analogy is valid: SessionStart-safe, idempotent, fail-open, observable, and doctor-driven.

The key difference is installation. claude-mem can be launched through a non-interactive installer; context-mode full plugin install uses Claude Code `/plugin` UI. The spec therefore separates full-plugin guidance, optional MCP-only auto config, and repair of an already-installed plugin.

## Key Ideas

- Do not shell-run `/plugin`; emit exact instructions or configure explicit MCP-only mode.
- Doctor must classify root cause: missing install, config poisoning, live MCP death, handshake failure, hook unsafe.
- Recovery prefers heal plus `/mcp` reconnect before full session restart.
- Hooks must fail open when ctx tools are unavailable.
- Windows/worktree gotchas are first-class guidance.
- Value claims are bounded: useful for large artifacts/session survival, not universal cost reduction.

## Where Implementation Lives

- Setup: `tools/context-mode-setup/`
- Health/doctor helpers: `tools/context-mode-health/`
- Doctor guidance: `.agents/skills/pomogator-doctor/SKILL.md`
- BDD tests: `tests/step_definitions/feature_context_mode_integration.ts`
- User docs: `docs/context-mode-integration.md`

## Read Next

- [FR.md](FR.md)
- [DESIGN.md](DESIGN.md)
- [context-mode-integration.feature](context-mode-integration.feature)
- [TASKS.md](TASKS.md)
