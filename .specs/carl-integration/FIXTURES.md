# Fixtures

## Overview

CARL integration uses BDD fixtures for two different evidence classes:

1. **Runtime-consumer fixtures** prove the managed dev-pomogator hook path invokes the CARL runner through the same launcher/dispatcher used by plugin users.
2. **Producer-shape fixtures** prove any CARL output, recall artifact, or benchmark baseline matches real CARL evidence before related implementation tasks are marked done.

Synthetic fixtures are allowed only for red-phase scaffolding or induced failure behavior. They do not prove real CARL producer shape and must remain marked `[UNVERIFIED]` until replaced by captured real CARL output.

## Fixture Inventory

| ID | Name | Type | Path | Scope | Owner |
|----|------|------|------|-------|-------|
| F-1 | Managed CARL temp project | factory | scenario temp directory (`carlProjectDir`) | per-scenario | `tests/step_definitions/feature_carl_integration.ts` |
| F-2 | Broken CARL runtime fixture | static/factory | `tests/fixtures/carl/broken-runtime/README.md` plus generated temp command | per-scenario | CARL hook failure steps |
| F-3 | Real CARL output provenance ledger | snapshot/provenance | `tests/fixtures/carl/real-output/README.md`, `tests/fixtures/carl/manifest.json`, smoke/bench stdout, and hook context samples | shared captured artifact | `capture-real-carl-artifact` task |
| F-4 | User-owned config collision fixture | factory | scenario temp config under `carlProjectDir` | per-scenario | install/doctor repair steps |
| F-5 | Stale managed marker fixture | factory | scenario temp `.carl/carl.json` under `carlProjectDir` | per-scenario | doctor repair steps |

## Fixture Details

### F-1: Managed CARL temp project

- **Type:** factory
- **Format:** filesystem tree with managed config and hook files
- **Setup:** Given steps create an isolated temp project root and write only the minimum dev-pomogator plugin/config files needed by the scenario.
- **Teardown:** Existing Cucumber world cleanup removes the temp root after each scenario.
- **Dependencies:** none
- **Used by:** @feature1, @feature2, @feature3, @feature4, @feature5, @feature6, @feature7, @feature8, @feature9
- **Assumptions:** The temp project must not mutate the repository root, real user home config, or persistent `.codex` state.

### F-2: Broken CARL runtime fixture

- **Type:** static/factory
- **Format:** documentation plus generated command/path that deterministically fails as `missing-runtime`, `timeout`, `malformed-output`, `unsupported`, or `exception`
- **Setup:** Step definitions point the managed hook runner at a missing command, timeout shim, or malformed-output file inside the temp project.
- **Teardown:** Remove generated failure shims with the temp project.
- **Dependencies:** F-1
- **Used by:** @feature4, @feature5, @feature8
- **Assumptions:** This fixture proves fail-open behavior only. It is not proof of the real CARL producer output contract.

### F-3: Real CARL output provenance ledger

- **Type:** snapshot/provenance
- **Format:** captured real hook envelopes, stdout JSON, extracted `hookSpecificOutput.additionalContext`, smoke stdout, benchmark TSV, provenance manifest, and README ledger.
- **Setup:** Captured on 2026-07-07 from sibling repo `E:/repos/presentation-reels` by running the real CARL smoke and benchmark scripts plus the real Claude Code/Codex hook commands recorded in `tests/fixtures/carl/manifest.json`.
- **Teardown:** Shared captured artifact is preserved for regression evidence; private recall payloads or secrets must be redacted before committing.
- **Dependencies:** real CARL source/runtime captured from `E:/repos/presentation-reels`; dev-pomogator still needs a source/vendor decision before product implementation may treat those untracked sibling artifacts as accepted code.
- **Used by:** @feature3, @feature8, @feature9
- **Ground truth:** `smoke.stdout.txt` reports `CARL smoke OK`, `domains=116`, `neutral_chars=691`, Claude debug loading `CORE__DONT_BLAME_INFRA_BEFORE_TRACING` and `CORE__REPRODUCE_NOT_THEORIZE`, and Codex debug loading `CORE__REPRODUCE_NOT_THEORIZE`. `bench.stdout.tsv` records `old_bulk_autoload_chars=683575`, `iterations=5`, and five real benchmark rows with p50/p95, context chars, estimated tokens, thresholds, and loaded domains.
- **Assumptions:** This ledger proves a real CARL producer shape and benchmark baseline from the sibling implementation. It does not prove dev-pomogator has packaged or wired CARL; implementation still must exercise the plugin-distributed hook path.

### F-4: User-owned config collision fixture

- **Type:** factory
- **Format:** temp config file containing both dev-pomogator managed regions and user-owned CARL entries
- **Setup:** Step definitions create a user-authored hook/config entry outside the managed region and, for conflict cases, a user-owned entry occupying the reserved managed key.
- **Teardown:** Remove with the temp project.
- **Dependencies:** F-1
- **Used by:** @feature1, @feature5, @feature6
- **Assumptions:** Repair must preserve user-owned entries and report `user-conflict` instead of overwriting reserved-key collisions silently.

### F-5: Stale managed marker fixture

- **Type:** factory
- **Format:** temp `.carl/carl.json` or managed block with old owner/schema/version marker
- **Setup:** Step definitions create an older dev-pomogator-managed CARL marker under the temp project.
- **Teardown:** Remove with the temp project.
- **Dependencies:** F-1
- **Used by:** @feature5, @feature8
- **Assumptions:** Doctor repair may refresh only managed artifacts and must report before/after state.

## Dependencies Graph

```text
F-1 Managed temp project
├─ F-2 Broken runtime fixture
├─ F-4 User-owned config collision fixture
└─ F-5 Stale managed marker fixture

F-3 Real CARL output provenance ledger → @feature3/@feature8/@feature9 final evidence
```

## Gap Analysis

| @featureN | Scenario | Fixture Coverage | Gap |
|-----------|----------|-----------------|-----|
| @feature1 | CARL001_01 Claude Code install creates managed CARL artifacts | F-1, F-4 | none for managed install; F-3 proves a sibling CARL producer shape but not dev-pomogator packaging |
| @feature2 | CARL001_02 Missing CARL runtime is not reported as healthy | F-1, F-2 | none for missing-runtime degraded state |
| @feature3 | CARL001_03 Hook registration invokes the real CARL runner | F-1, F-3 | F-3 captured real sibling hook output; implementation still must prove the dev-pomogator plugin-distributed hook path invokes the accepted runner |
| @feature4 | CARL001_04 Broken CARL hook fails open with agent-visible warning | F-1, F-2 | exact Claude Code warning injection transport remains [UNVERIFIED] until implementation verifies it |
| @feature5 | CARL001_05 Doctor repairs stale managed CARL artifacts | F-1, F-5 | none for stale managed repair |
| @feature6 | CARL001_06 User-owned CARL configuration is preserved | F-1, F-4 | none for managed-marker preservation |
| @feature7 | CARL001_07 Codex CARL path waits for launcher and dispatcher prerequisites | F-1 | Codex positive-path fixture deferred until context-menu launcher and dispatcher prerequisites exist |
| @feature8 | CARL001_08 Review report separates verified and unverified CARL claims | F-2, F-3, F-5 | report may cite F-3 as captured sibling evidence but must still distinguish it from accepted dev-pomogator implementation evidence |
| @feature9 | CARL001_09/CARL001_10 recall benchmark threshold behavior | F-3 | sibling benchmark baseline is captured; final dev-pomogator regression gate still needs source/vendor acceptance and plugin-path execution proof |

## Notes

- Docker BDD is the required execution path for these fixtures.
- Fixtures must never write persistent user CARL config or mutate the repository's real `.codex` artifacts.
- Captured real CARL output must be minimized/redacted and reconciled with a ground-truth summary before it becomes final benchmark evidence.
