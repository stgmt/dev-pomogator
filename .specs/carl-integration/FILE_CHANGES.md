# File Changes

Список файлов, которые будут добавлены/изменены при реализации CARL integration.

> `edit`/`delete` are used only for paths verified as existing during Discovery or Phase 2 inventory. New planned files use `create`.

| Path | Action | Reason |
|------|--------|--------|
| `INSTALL_SCOPE_REPORT.md` | create | Documents the global plugin layer, per-project `.carl/` layer, deferred Codex layer, and environment setup model that resolves the install-scope ambiguity for [FR-1](FR.md#fr-1-claude-code-managed-carl-install) and [FR-5](FR.md#fr-5-doctor-health-and-repair). |
| `tools/carl/manifest.ts` | create | Defines the managed CARL artifact manifest, scope-selection defaults, env knobs, and layer health model for [FR-1](FR.md#fr-1-claude-code-managed-carl-install), [FR-5](FR.md#fr-5-doctor-health-and-repair), [FR-6](FR.md#fr-6-managed-markers-preserve-user-configuration), and doctor verification. |
| `tools/carl/install.ts` | create | Implements idempotent install/repair of managed Claude Code CARL artifacts and per-project `.carl/` bootstrap for [FR-1](FR.md#fr-1-claude-code-managed-carl-install), [FR-2](FR.md#fr-2-no-fake-green-when-carl-is-absent), and [FR-6](FR.md#fr-6-managed-markers-preserve-user-configuration). |
| `tools/carl/adapt-rules.ts` | create | Scans `.claude/rules/**/*.md` and `.claude/skills/*/SKILL.md`, generates/refreshes Russian CARL domains and aliases, records source hashes, and reports partial `ru` coverage for [FR-1](FR.md#fr-1-claude-code-managed-carl-install), [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1), and doctor language checks. |
| `tools/carl/runner.ts` | create | Provides the runtime consumer that invokes CARL and returns fail-open warnings for [FR-3](FR.md#fr-3-runtime-consumer-and-end-to-end-proof) and [FR-4](FR.md#fr-4-fail-open-warning-injection). |
| `tools/carl/hook-wrapper.ts` | create | Planned distributed Claude Code hook wrapper; chosen instead of `.claude/hooks/carl-hook.py` until CARL runtime language requirements are verified for [FR-1](FR.md#fr-1-claude-code-managed-carl-install) and [FR-4](FR.md#fr-4-fail-open-warning-injection). |
| `tools/carl/bench.ts` | create | Adds the real-artifact recall benchmark harness for [FR-9](FR.md#fr-9-recall-benchmark-threshold-and-regression-gate) if CARL recall is enabled. |
| `tools/carl/evaluate-russian.ts` | create | Runs the Russian CARL prompt matrix, compares expected vs actual loaded domains, records false positives/negatives, and emits optimization recommendations for [FR-8](FR.md#fr-8-review-audit-and-reporting) and [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8). |
| `tests/fixtures/carl/russian-eval/README.md` | create | Stores the Russian CARL self-evaluation report ledger with prompt matrix results, fixture/runtime provenance, optimization recommendations, and explicit readiness boundary for [FR-8](FR.md#fr-8-review-audit-and-reporting). |
| `.carl/carl.json` | create | Stores managed CARL metadata, schema version, platform state, explicit language coverage (`ru`/`en`), source hashes, generated trigger aliases, and runtime verification status for [FR-1](FR.md#fr-1-claude-code-managed-carl-install), [FR-5](FR.md#fr-5-doctor-health-and-repair), and [FR-6](FR.md#fr-6-managed-markers-preserve-user-configuration). |
| `.claude-plugin/hooks.json` | edit | Registers the canonical plugin hook entry for Claude Code users, proving the hook has a real plugin-distributed consumer for [FR-3](FR.md#fr-3-runtime-consumer-and-end-to-end-proof). |
| `.claude/settings.json` | edit | Adds dogfood registration for the managed CARL hook only if implementation enables local repo execution for [FR-1](FR.md#fr-1-claude-code-managed-carl-install). |
| `.claude/skills/pomogator-doctor/scripts/engine/checks/carl.ts` | create | Implements CARL doctor health states and safe repair logic for [FR-5](FR.md#fr-5-doctor-health-and-repair). |
| `.claude/skills/pomogator-doctor/scripts/engine/checks/index.ts` | edit | Wires the new CARL doctor check into the existing check registry for [FR-5](FR.md#fr-5-doctor-health-and-repair). |
| `.claude/skills/pomogator-doctor/scripts/engine/types.ts` | edit | Extends doctor result typing with CARL states and repair metadata for [FR-5](FR.md#fr-5-doctor-health-and-repair). |
| `.codex/hooks.json` | edit | Adds CARL to the deterministic Codex dispatcher only after launcher/dispatcher prerequisites and version-aware capability checks pass for [FR-7](FR.md#fr-7-codex-path-gated-by-launcher-and-dispatcher-prerequisites). |
| `tools/context-menu/postinstall.ts` | edit | Update only if the Codex CARL sequence must surface through the existing context-menu launcher/trust validation path for [FR-7](FR.md#fr-7-codex-path-gated-by-launcher-and-dispatcher-prerequisites). |
| `tests/features/carl-integration.feature` | create | Adds executable BDD scenarios for [FR-1](FR.md#fr-1-claude-code-managed-carl-install) through [FR-9](FR.md#fr-9-recall-benchmark-threshold-and-regression-gate). |
| `tests/step_definitions/feature_carl_integration.ts` | create | Drives the real installer, doctor, hook runner, Codex gate, and benchmark surfaces for CARL BDD scenarios without new non-BDD tests. |
| `tests/fixtures/carl/broken-runtime/README.md` | create | Documents induced hook failure fixture for [FR-4](FR.md#fr-4-fail-open-warning-injection) while keeping producer-shape claims [UNVERIFIED]. |
| `tests/fixtures/carl/real-output/README.md` | create | Placeholder provenance ledger for real CARL output required by [FR-3](FR.md#fr-3-runtime-consumer-and-end-to-end-proof) and [FR-9](FR.md#fr-9-recall-benchmark-threshold-and-regression-gate) before done. |
| `cucumber.json` | edit | Wires the executable CARL BDD feature only after step definitions exist and shared-tree safety is verified. |
