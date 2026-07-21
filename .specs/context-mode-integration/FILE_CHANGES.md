# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи.

| Path | Action | Reason |
|------|--------|--------|
| `tools/context-mode-setup/setup.ts` | create | [FR-1](FR.md), [FR-2](FR.md), [FR-3](FR.md) |
| `tools/context-mode-setup/state.ts` | create | [FR-1](FR.md), [FR-3](FR.md) |
| `tools/context-mode-health/check.ts` | create | [FR-4](FR.md), [FR-5](FR.md) |
| `tools/context-mode-health/handshake.ts` | create | [FR-4](FR.md), [FR-5](FR.md) |
| `tools/context-mode-health/hook-safety.ts` | create | [FR-6](FR.md), [FR-7](FR.md) |
| `tools/context-mode-health/windows-guidance.ts` | create | [FR-8](FR.md) |
| `tools/context-mode-health/value-boundary.ts` | create | [FR-9](FR.md) |
| `.specs/context-mode-integration/context-mode-integration.feature` | edit | source scenarios carry intentional `@wip` markers until Phase 0 wires executable BDD |
| `.Codex/hooks.json` | edit | optional SessionStart setup/health hook registration, gated by policy |
| `.claude-plugin/hooks.json` | edit | distribute optional canonical hook registration if chosen |
| `.agents/skills/pomogator-doctor/SKILL.md` | edit | expose context-mode doctor/remediation guidance |
| `tests/step_definitions/feature_context_mode_integration.ts` | create | BDD steps for all @feature scenarios |
| `tests/fixtures/context-mode/installed_plugins.healthy.json` | create | real-shaped fixture for [FR-1](FR.md), [FR-4](FR.md) |
| `tests/fixtures/context-mode/installed_plugins.poisoned.json` | create | config poisoning fixture for [FR-4](FR.md) |
| `tests/fixtures/context-mode/installed_plugins.malformed.json` | create | malformed registry fail-open fixture for [FR-3](FR.md) |
| `tests/fixtures/context-mode/plugin.manifest.json` | create | plugin manifest fixture for [FR-4](FR.md), [FR-5](FR.md) |
| `tests/fixtures/context-mode/process.dead.json` | create | live MCP death fixture for [FR-5](FR.md) |
| `tests/fixtures/context-mode/hook.ctx-unavailable.json` | create | dead ctx-tool hook fixture for [FR-6](FR.md), [FR-7](FR.md) |
| `docs/context-mode-integration.md` | create | user-facing install, recovery, Windows, and value-boundary docs |
