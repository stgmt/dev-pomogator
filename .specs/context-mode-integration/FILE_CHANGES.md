# File Changes

Список файлов, которые добавлены/изменены при реализации фичи.

| Path | Action | Reason |
|------|--------|--------|
| `tools/context-mode-setup/setup.ts` | edit | [FR-1](FR.md), [FR-2](FR.md), [FR-3](FR.md) |
| `tools/context-mode-setup/state.ts` | edit | [FR-1](FR.md), [FR-3](FR.md) |
| `tools/context-mode-health/check.ts` | edit | [FR-4](FR.md), [FR-5](FR.md) |
| `tools/context-mode-health/handshake.ts` | edit | [FR-4](FR.md), [FR-5](FR.md) |
| `tools/context-mode-health/hook-safety.ts` | edit | [FR-6](FR.md), [FR-7](FR.md) |
| `tools/context-mode-health/windows-guidance.ts` | edit | [FR-8](FR.md) |
| `tools/context-mode-health/value-boundary.ts` | edit | [FR-9](FR.md) |
| `.specs/context-mode-integration/context-mode-integration.feature` | edit | executable BDD scenarios for [FR-1](FR.md)..[FR-9](FR.md); `@wip` removed after step definitions passed filtered Docker BDD |
| `./cucumber.json` | edit | wire `.specs/context-mode-integration/context-mode-integration.feature` into the default BDD path set |
| `.Codex/hooks.json` | edit | dogfood SessionStart context-mode setup hook registration for [FR-1](FR.md), [FR-3](FR.md) |
| `.claude-plugin/hooks.legacy.json` | edit | canonical hook-service source manifest registers the context-mode setup hook for [FR-1](FR.md), [FR-3](FR.md) |
| `.claude-plugin/hooks.json` | edit | generated canonical HTTP hook manifest stays in sync with hook-service bootstrap |
| `.claude/settings.json` | edit | generated dogfood Claude settings stay in sync with canonical HTTP hook manifest |
| `tools/hook-service/registry.json` | edit | generated hook-service route table exposes `tools/context-mode-setup/setup.ts` |
| `.claude/skills/pomogator-doctor/scripts/engine/checks/context-mode.ts` | edit | runtime doctor check for [FR-4](FR.md), [FR-5](FR.md), [FR-8](FR.md) |
| `.claude/skills/pomogator-doctor/scripts/engine/checks/index.ts` | edit | includes `contextModeCheck` in phase4/allChecks |
| `.claude/skills/pomogator-doctor/scripts/engine/doctor.bundle.mjs` | edit | bundled canonical doctor runtime contains `C-CMODE` |
| `tests/step_definitions/feature_context_mode_integration.ts` | edit | executable BDD steps for all @feature scenarios plus runtime wiring assertions |
| `tests/fixtures/context-mode/installed_plugins.healthy.json` | edit | real-shaped fixture for [FR-1](FR.md), [FR-4](FR.md) |
| `tests/fixtures/context-mode/installed_plugins.poisoned.json` | edit | config poisoning fixture for [FR-4](FR.md) |
| `tests/fixtures/context-mode/installed_plugins.malformed.json` | edit | malformed registry fail-open fixture for [FR-3](FR.md) |
| `tests/fixtures/context-mode/plugin.manifest.json` | edit | plugin manifest fixture for [FR-4](FR.md), [FR-5](FR.md) |
| `tests/fixtures/context-mode/process.dead.json` | edit | live MCP death fixture for [FR-5](FR.md) |
| `tests/fixtures/context-mode/hook.ctx-unavailable.json` | edit | dead ctx-tool hook fixture for [FR-6](FR.md), [FR-7](FR.md) |
| `docs/context-mode-integration.md` | edit | user-facing install, recovery, Windows, and value-boundary docs |
