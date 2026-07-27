# File Changes

## Runtime and managed artifacts

| Path | Change | Requirements |
|---|---|---|
| `tools/carl/manifest.ts` | Define managed schema, root selection, platform/language states, diagnostic codes, and runtime-proof fields. | FR-1, FR-2, FR-5, FR-7 |
| `tools/carl/install.ts` | Install/refresh project-local CARL artifacts atomically; enforce owner/version markers and user-conflict refusal. | FR-1, FR-2, FR-6 |
| `tools/carl/adapt-rules.ts` | Refresh source hashes/domains and safe Russian aliases; record `ru:needs-alias` when unsafe; expose adaptation evidence for CARL001_13–CARL001_15. | FR-1, FR-8 |
| `tools/carl/runner.ts` | Resolve event root, consume project manifest, execute/diagnose CARL, emit fail-open agent context, and record runtime proof only after dispatcher execution; files-only or manifest-only state remains degraded. | FR-2, FR-3, FR-4 |
| `tools/carl/hook-wrapper.ts` | Provide the stable distributed launcher contract without hiding runtime failures. | FR-3, FR-4 |
| `.carl/carl.json` | Project-local managed state, language metadata, runtime verification, platform status, and benchmark provenance. | FR-1, FR-2, FR-5, FR-6, FR-9 |
| `.claude-plugin/hooks.json` | Canonical distributed hook declarations. | FR-3 |
| `tools/hook-service/registry.json` | Registry-backed SessionStart/UserPromptSubmit routing to the CARL runner. | FR-3 |
| `.claude/settings.json` | Dogfood/project hook integration within managed boundaries. | FR-1, FR-3, FR-6 |
| `.claude/skills/pomogator-doctor/scripts/engine/checks/carl.ts` | Doctor classification, evidence, actionable repair state, and ownership checks. | FR-2, FR-5, FR-6 |
| `.claude/skills/pomogator-doctor/scripts/engine/checks/index.ts` | Register the CARL doctor check. | FR-5 |
| `.claude/skills/pomogator-doctor/scripts/engine/types.ts` | Expose CARL doctor state/evidence types. | FR-5 |
| `.codex/hooks.json` | Codex dispatcher integration only after launcher/capability gates. | FR-7 |
| `tools/context-menu/postinstall.ts` | Context-menu launcher/trust prerequisite reporting. | FR-7 |
| `tools/carl/bench.ts` | Provenance-aware real-artifact benchmark; draft/blocked without evidence. | FR-8, FR-9 |
| `tools/carl/evaluate-russian.ts` | Expected/actual domain comparison, false-positive/negative report, and optimization recommendations. | FR-1, FR-8 |

## BDD and evidence fixtures

| Path | Change | Requirements |
|---|---|---|
| `tests/features/carl-integration.feature` | Cucumber scenarios for install, Russian adaptation/order/mutation gates CARL001_13–CARL001_15, no-fake-green, runtime consumer, fail-open modes, doctor, ownership, Codex gate, review, Russian evaluation, and benchmark states. | FR-1–FR-9 |
| `tests/step_definitions/feature_carl_integration.ts` | Integration steps that execute the registered launcher/dispatcher and assert payloads/manifest evidence. | FR-2–FR-9 |
| `tests/hooks/before-after.ts` | Isolate project-local CARL fixtures and restore shared state. | FR-1–FR-7 |
| `tests/hooks/ensure-docker-bdd.ts` | Enforce Docker-only BDD execution. | FR-1–FR-9 |
| `tests/fixtures/carl/broken-runtime/` | Controlled failure inputs for fail-open diagnostics. | FR-4 |
| `tests/fixtures/carl/real-output/README.md` | Provenance ledger; remains `[UNVERIFIED]` until captured from a real producer. | FR-3, FR-8, FR-9 |
| `tests/fixtures/carl/russian-eval/README.md` | Curated prompts and expected domains for report evaluation. | FR-8 |
| `cucumber.json` | Shared BDD profile updates only when required; preserve concurrent-session safety. | FR-3, FR-4 |

## Explicit non-changes and gates

- Do not add new non-BDD test files; BDD is the acceptance test format.
- Do not mark runtime verification from file existence or fixture loading.
- Do not claim dependency-absent plugin readiness without a real installed-plugin run.
- Do not add numeric benchmark thresholds until provenance-complete producer evidence exists.
