# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи.

> `edit`/`delete` — только для существующих на диске путей. Для планируемых файлов — `create`.

См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

| Path | Action | Reason |
|------|--------|--------|
| `.agents/plugins/marketplace.json` | edit | [FR-1](FR.md#fr-1-init), [FR-4](FR.md#fr-4-codex-native-packaging-contract) — Codex marketplace whitelist catalog |
| `.codex-plugin/plugin.json` | edit | [FR-4](FR.md#fr-4-codex-native-packaging-contract) — Codex-native plugin manifest |
| `.specs/codex-init/codex-init.feature` | edit | [FR-1](FR.md#fr-1-init), [FR-5](FR.md#fr-5-real-codex-cli-verification-gate) — finalized BDD scenarios for whitelist behavior |
| `tools/context-menu/postinstall.ts` | edit | [FR-2](FR.md#fr-2-parallel-claude-code-and-codex-channels), [FR-3](FR.md#fr-3-context-menu-as-first-whitelisted-codex-plugin-surface) — first whitelisted feature must keep Claude and Codex channels separate |
| `scripts/launch-Codex-tui.ps1` | edit | [FR-3](FR.md#fr-3-context-menu-as-first-whitelisted-codex-plugin-surface), [FR-6](FR.md#fr-6-stale-claim-rejection) — Codex launch path must use verified Codex flags; initial whitelist scope is non-TUI |
| `.claude/skills/context-menu/SKILL.md` | edit | [FR-6](FR.md#fr-6-stale-claim-rejection) — remove stale Codex flag/Claude trust claims from user-facing workflow |
| `.claude/skills/pomogator-doctor/scripts/engine/checks/context-menu.ts` | edit | [FR-5](FR.md#fr-5-real-codex-cli-verification-gate) — extend drift verification to Codex context-menu artifacts |
| `.codex-plugin/plugin.json` | edit | [FR-7](FR.md#fr-7-minimal-codex-package-scope) — point Codex installable skills at the minimal context-menu-only skill catalog |
| `.codex-plugin/skills/context-menu/SKILL.md` | add | [FR-7](FR.md#fr-7-minimal-codex-package-scope) — ship only Codex context-menu operator guidance |
| `scripts/install-codex-context-menu.ps1` | create | [FR-5](FR.md#fr-5-real-codex-cli-verification-gate), [FR-7](FR.md#fr-7-minimal-codex-package-scope) — first-class user-facing Codex context-menu install launcher |
| `tools/codex-plugin-support/verify-whitelist.ts` | edit | [FR-5](FR.md#fr-5-real-codex-cli-verification-gate), [FR-7](FR.md#fr-7-minimal-codex-package-scope) — verify manifest scope and no hooks/rules/commands exposure |
| `tests/step_definitions/feature_codex_init.ts` | edit | [FR-1](FR.md#fr-1-init), [FR-5](FR.md#fr-5-real-codex-cli-verification-gate) — BDD step definitions for whitelist scenarios |
| `tools/codex-plugin-support/verify-whitelist.ts` | edit | [FR-5](FR.md#fr-5-real-codex-cli-verification-gate), [FR-6](FR.md#fr-6-stale-claim-rejection) — integration harness for Codex plugin whitelist checks |
