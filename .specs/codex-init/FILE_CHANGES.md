# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи.

> `edit`/`delete` — только для существующих на диске путей. Для планируемых файлов — `create`.

См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

| Path | Action | Reason |
|------|--------|--------|
| `.agents/plugins/marketplace.json` | edit | [FR-1](FR.md#fr-1-init), [FR-4](FR.md#fr-4-codex-native-packaging-contract), [FR-8](FR.md#fr-8-second-full-spec-generator-v4-codex-entry) — ordered catalog with `context-menu` first and the distinct full `spec-generator-v4` record second |
| `.codex-plugin/plugin.json` | edit | [FR-4](FR.md#fr-4-codex-native-packaging-contract) — Codex-native plugin manifest |
| `.specs/codex-init/codex-init.feature` | edit | [FR-1](FR.md#fr-1-init), [FR-5](FR.md#fr-5-real-codex-cli-verification-gate), [FR-8](FR.md#fr-8-second-full-spec-generator-v4-codex-entry) — finalized BDD scenarios for whitelist behavior and the second-entry boundary |
| `tools/context-menu/postinstall.ts` | edit | [FR-2](FR.md#fr-2-parallel-claude-code-and-codex-channels), [FR-3](FR.md#fr-3-context-menu-as-first-whitelisted-codex-plugin-surface) — first whitelisted feature must keep Claude and Codex channels separate |
| `scripts/launch-Codex-tui.ps1` | edit | [FR-3](FR.md#fr-3-context-menu-as-first-whitelisted-codex-plugin-surface), [FR-6](FR.md#fr-6-stale-claim-rejection) — Codex launch path must use verified Codex flags; initial whitelist scope is non-TUI |
| `.claude/skills/context-menu/SKILL.md` | edit | [FR-6](FR.md#fr-6-stale-claim-rejection) — remove stale Codex flag/Claude trust claims from user-facing workflow |
| `.claude/skills/pomogator-doctor/scripts/engine/checks/context-menu.ts` | edit | [FR-5](FR.md#fr-5-real-codex-cli-verification-gate) — extend drift verification to Codex context-menu artifacts |
| `.codex-plugin/plugin.json` | edit | [FR-7](FR.md#fr-7-minimal-codex-package-scope) — point Codex installable skills at the minimal context-menu-only skill catalog |
| `.codex-plugin/skills/context-menu/SKILL.md` | add | [FR-7](FR.md#fr-7-minimal-codex-package-scope) — ship only Codex context-menu operator guidance |
| `scripts/install-codex-context-menu.ps1` | create | [FR-5](FR.md#fr-5-real-codex-cli-verification-gate), [FR-7](FR.md#fr-7-minimal-codex-package-scope) — first-class user-facing Codex context-menu install launcher |
| `tools/codex-plugin-support/verify-whitelist.ts` | edit | [FR-5](FR.md#fr-5-real-codex-cli-verification-gate), [FR-7](FR.md#fr-7-minimal-codex-package-scope), [FR-8](FR.md#fr-8-second-full-spec-generator-v4-codex-entry) — verify context-menu scope plus second-entry order, identity, distinct source/manifest, and evidence status |
| `tests/step_definitions/feature_codex_init.ts` | edit | [FR-1](FR.md#fr-1-init), [FR-5](FR.md#fr-5-real-codex-cli-verification-gate), [FR-8](FR.md#fr-8-second-full-spec-generator-v4-codex-entry) — BDD step definitions for whitelist scenarios including `CODEXINIT001_10` |
| `tools/codex-plugin-support/verify-whitelist.ts` | edit | [FR-5](FR.md#fr-5-real-codex-cli-verification-gate), [FR-6](FR.md#fr-6-stale-claim-rejection) — integration harness for Codex plugin whitelist checks |

- ACCEPTANCE_CRITERIA.md: add AC-5.1 (FR-5)

| `tools/codex-plugin-support/path-containment.ts` | create | [FR-5](FR.md#fr-5-real-codex-cli-verification-gate) — realpath-relative isolated CODEX_HOME containment. |
| `tools/codex-plugin-support/verify-whitelist.ts` | edit | [FR-5](FR.md#fr-5-real-codex-cli-verification-gate) — missing real probes fail and installed paths use ancestry containment. |
| `tests/step_definitions/feature_codex_init.ts` | edit | [FR-5](FR.md#fr-5-real-codex-cli-verification-gate) — unavailable-probe and sibling-prefix regressions for AC-5.1. |
| `tests/fixtures/codex-plugin-support/codex-probe.cjs` | create | [FR-5](FR.md#fr-5-real-codex-cli-verification-gate) — deterministic local executable implements the real Codex plugin command sequence without network access. |

| `tools/codex-plugin-support/verify-whitelist.ts` | EDIT | FR-5 — remove production test-only probe override; PATH-only resolution. |
| `tests/step_definitions/feature_codex_init.ts` | EDIT | FR-5 — PATH-shim positive proof and env-override self-challenge. |
| `.specs/codex-init/codex-init.feature` | EDIT | FR-5 — CODEXINIT001_09 production override-ignored scenario. |

> **FR-8 ownership boundary:** the full `spec-generator-v4` plugin's own source, manifest, generated adapters, hooks, MCP/runtime files, and their exact paths are intentionally absent from this file plan. Requirement 83 of the main `spec-generator-v4` spec owns them. This spec changes only the marketplace/whitelist record and its distribution-level verifier; it must not widen the context-menu-only `.codex-plugin/plugin.json`.
