# Requirements and Verification Matrix

## Requirement index

| FR | Acceptance criteria | Use cases | Verification boundary |
|---|---|---|---|
| [FR-1](FR.md#fr-1-claude-code-managed-carl-install) | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1) | UC-1, UC-4 | Managed project artifact, idempotence, language metadata, Russian adaptation, SessionStart ordering |
| [FR-2](FR.md#fr-2-no-fake-green-when-carl-is-absent) | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2) | UC-2, UC-6 | Runtime consumer evidence versus file inventory |
| [FR-3](FR.md#fr-3-runtime-consumer-and-end-to-end-proof) | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3) | UC-1, UC-3, UC-6 | Dispatcher-to-runner execution; files-only/manifest-only rejection |
| [FR-4](FR.md#fr-4-fail-open-warning-injection) | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4) | UC-3 | Fail-open result and agent-visible warning |
| [FR-5](FR.md#fr-5-doctor-health-and-repair) | [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5) | UC-2, UC-4 | Doctor states, repair scope, before/after evidence |
| [FR-6](FR.md#fr-6-managed-markers-preserve-user-configuration) | [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6) | UC-1, UC-2, UC-4 | Managed markers, user-owned byte/value preservation, conflict refusal |
| [FR-7](FR.md#fr-7-codex-path-gated-by-launcher-and-dispatcher-prerequisites) | [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7) | UC-4, UC-5 | Independent launcher, dispatcher, capability gates |
| [FR-8](FR.md#fr-8-review-audit-and-reporting) | [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8) | UC-6 | Provenance labels and Russian evaluation |
| [FR-9](FR.md#fr-9-recall-benchmark-threshold-and-regression-gate) | [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9) | UC-6 | Real artifact baseline or honest draft/blocked state |

## Trade-offs and operational requirements

1. Claude Code is the supported first platform; Codex remains gated until its launcher, dispatcher, and version capability are verified.
2. Fail-open warning injection is preferred over silent recovery: CARL errors must not block the agent, but the agent must receive actionable degraded context.
3. Project-local `.carl/` metadata is the source of truth for managed ownership, language coverage, runtime verification, and platform states; file presence alone is not readiness.
4. External CARL producer behavior, runtime shape, source/license, and numeric benchmark thresholds remain `[UNVERIFIED]` until provenance-complete evidence exists.
5. Tests are Cucumber.js BDD in Docker. New non-BDD test files are out of scope. The runtime-consumer scenario must invoke the real launcher/dispatcher.

## CHK matrix

| CHK-ID | Requirement | Traces To | Verification Method | Status | Notes |
|---|---|---|---|---|---|
| CHK-FR1-01 | Managed CARL artifacts and metadata | FR-1, AC-1, UC-1, CARL001_01, CARL001_13, CARL001_14, CARL001_15 | BDD scenario | In Progress | Assert managed owner/version/schema/source hashes plus Russian adaptation evidence and SessionStart-before-prompt ordering. |
| CHK-FR1-02 | Idempotence and language degradation | FR-1, AC-1, UC-4 | BDD scenario | In Progress | Assert repeat stability and missing/stale Russian state. |
| CHK-FR2-01 | No fake green without consumer | FR-2, AC-2, UC-2 | BDD scenario | In Progress | Files-only evidence must be degraded. |
| CHK-FR2-02 | Honest review state | FR-2, AC-2, UC-6 | Manual review | Blocked | Requires fresh runtime-consumer evidence. |
| CHK-FR3-01 | Registered path invokes runner | FR-3, AC-3, UC-3, CARL001_03 | Integration test | In Progress | Execute the real dispatcher-to-`tools/carl/runner.ts` command in Docker; files-only and manifest-only setup must fail the proof assertion. |
| CHK-FR3-02 | Dependency-absent proof | FR-3, AC-3, UC-6 | Integration test | Blocked | Requires installed-plugin deps-absent run. |
| CHK-FR4-01 | Fail-open failure modes | FR-4, AC-4, UC-3 | BDD scenario | In Progress | Outline covers dependency, timeout, malformed, unsupported, exception. |
| CHK-FR4-02 | Success has no false warning | FR-4, AC-4, UC-3 | BDD scenario | In Progress | Assert successful hook payload. |
| CHK-FR5-01 | Doctor state classification | FR-5, AC-5, UC-2 | BDD scenario | In Progress | Cover stale, broken-runtime, unsupported, and conflict. |
| CHK-FR5-02 | Repair scope and evidence | FR-5, AC-5, UC-4 | BDD scenario | In Progress | Assert before/after and unmanaged preservation. |
| CHK-FR6-01 | Managed boundary | FR-6, AC-6, UC-1 | BDD scenario | In Progress | Assert markers, manifest entry, or deterministic key. |
| CHK-FR6-02 | User preservation and conflict | FR-6, AC-6, UC-4, CARL001_06 | BDD scenario | In Progress | Assert user-owned bytes and parsed values remain unchanged, plus refusal to overwrite conflicts. |
| CHK-FR7-01 | Codex prerequisite gate | FR-7, AC-7, UC-5 | BDD scenario | In Progress | Missing launcher/dispatcher/version is deferred or unsupported. |
| CHK-FR7-02 | Platform independence | FR-7, AC-7, UC-4 | BDD scenario | In Progress | Claude state unaffected; no copied Claude hooks. |
| CHK-FR8-01 | Review evidence and provenance | FR-8, AC-8, UC-6 | Manual review | In Progress | Report all evidence lanes with labels. |
| CHK-FR8-02 | Russian evaluation honesty | FR-8, AC-8, UC-6 | Integration test | Blocked | Requires producer-owned or explicitly fixture-backed output. |
| CHK-FR9-01 | No invented benchmark threshold | FR-9, AC-9, UC-6 | BDD scenario | In Progress | No artifact keeps status draft/blocked. |
| CHK-FR9-02 | Provenance baseline and regression | FR-9, AC-9, UC-6 | Integration test | Blocked | Requires real artifact, hashes, and producer ground truth. |

**Matrix total:** 18 checks. Current implementation/test evidence is not assumed green; the verdict gate must use fresh Docker BDD evidence and provenance-backed runtime proof.
