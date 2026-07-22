# context-mode Integration

## Summary

This feature specifies context-mode integration for dev-pomogator. It makes context-mode setup and repair behave like the existing claude-mem integration where that analogy is valid: SessionStart-safe, idempotent, fail-open, observable, auto-installing through a non-interactive CLI path, and doctor-driven.

The setup hook does not try to execute interactive slash commands. When context-mode is missing, it starts the scriptable Claude plugin CLI flow in the background (`claude plugin marketplace add mksglu/context-mode` then `claude plugin install context-mode@context-mode -s user`) and still prints the slash-command fallback for the user.

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
- Doctor guidance: `.claude/skills/pomogator-doctor/`
- BDD tests: `tests/step_definitions/feature_context_mode_integration.ts`
- User docs: `docs/context-mode-integration.md`

## Read Next

- [FR.md](FR.md)
- [DESIGN.md](DESIGN.md)
- [context-mode-integration.feature](context-mode-integration.feature)
- [TASKS.md](TASKS.md)
