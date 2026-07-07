# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | @featureN | Status |
|----|------|-----------|-----------|--------|
| [FR-1](FR.md#fr-1-claude-code-managed-carl-install) | Claude Code managed CARL install, including explicit project language coverage | AC-1 | @feature1 | Draft |
| [FR-2](FR.md#fr-2-no-fake-green-when-carl-is-absent) | No fake green when CARL is absent | AC-2 | @feature2 | Draft |
| [FR-3](FR.md#fr-3-runtime-consumer-and-end-to-end-proof) | Runtime consumer and end-to-end proof | AC-3 | @feature3 | Draft |
| [FR-4](FR.md#fr-4-fail-open-warning-injection) | Fail-open warning injection | AC-4 | @feature4 | Draft |
| [FR-5](FR.md#fr-5-doctor-health-and-repair) | Doctor health and repair | AC-5 | @feature5 | Draft |
| [FR-6](FR.md#fr-6-managed-markers-preserve-user-configuration) | Managed markers preserve user configuration | AC-6 | @feature6 | Draft |
| [FR-7](FR.md#fr-7-codex-path-gated-by-launcher-and-dispatcher-prerequisites) | Codex path gated by launcher and dispatcher prerequisites | AC-7 | @feature7 | Draft |
| [FR-8](FR.md#fr-8-review-audit-and-reporting) | Review, audit, reporting, and Russian self-evaluation | AC-8 | @feature8 | Draft |
| [FR-9](FR.md#fr-9-recall-benchmark-threshold-and-regression-gate) | Recall benchmark threshold and regression gate | AC-9 | @feature9 | Draft |

## Functional Requirements

- [FR-1: Claude Code managed CARL install](FR.md#fr-1-claude-code-managed-carl-install)
- [FR-2: No fake green when CARL is absent](FR.md#fr-2-no-fake-green-when-carl-is-absent)
- [FR-3: Runtime consumer and end-to-end proof](FR.md#fr-3-runtime-consumer-and-end-to-end-proof)
- [FR-4: Fail-open warning injection](FR.md#fr-4-fail-open-warning-injection)
- [FR-5: Doctor health and repair](FR.md#fr-5-doctor-health-and-repair)
- [FR-6: Managed markers preserve user configuration](FR.md#fr-6-managed-markers-preserve-user-configuration)
- [FR-7: Codex path gated by launcher and dispatcher prerequisites](FR.md#fr-7-codex-path-gated-by-launcher-and-dispatcher-prerequisites)
- [FR-8: Review, audit, and reporting](FR.md#fr-8-review-audit-and-reporting)
- [FR-9: Recall benchmark threshold and regression gate](FR.md#fr-9-recall-benchmark-threshold-and-regression-gate)

## Non-Functional Requirements

- [Performance](NFR.md#performance) — hook latency, timeout, token budget, benchmark regression gate.
- [Security](NFR.md#security) — no secrets, user trust boundary, safe diagnostics, verified external runtime.
- [Reliability](NFR.md#reliability) — fail-open visibility, idempotent repair, honest unsupported state, real-artifact evidence.
- [Usability](NFR.md#usability) — clear warnings, actionable doctor output, reviewable evidence, platform-specific clarity.
- [Compatibility](NFR.md#compatibility) — Claude Code first, Codex gated, canonical plugin distribution, deps-absent behavior.

## Acceptance Criteria

- AC-1 (FR-1): supported Claude Code install creates managed CARL artifacts and keeps external CARL details [UNVERIFIED] until proven.
- AC-2 (FR-2): absent or non-runnable CARL cannot be reported as healthy.
- AC-3 (FR-3): the real hook launcher or dispatcher invokes the CARL runner and the BDD scenario fails if it is not wired.
- AC-4 (FR-4): CARL failures fail open and inject an agent-visible warning.
- AC-5 (FR-5): doctor classifies CARL states and repairs managed drift without overwriting user config.
- AC-6 (FR-6): managed writes preserve user-owned configuration and surface conflicts.
- AC-7 (FR-7): Codex CARL waits for launcher and dispatcher prerequisites and version-aware capability.
- AC-8 (FR-8): review reports install, runtime, warning, repair, preservation, sequencing, and benchmark evidence.
- AC-9 (FR-9): recall benchmarks use real CARL artifacts before thresholds become gates.

## Verification Matrix (CHK)

| CHK-ID | Requirement | Traces To (FR+SC) | Verification Method | Status | Notes |
|--------|-------------|-------------------|---------------------|--------|-------|
| CHK-FR1-01 | Managed Claude Code install creates versioned CARL artifacts | FR-1, AC-1, @feature1, UC-1 | BDD scenario | Draft | Install smoke must run against a temp supported Claude Code project. |
| CHK-FR1-02 | External CARL runtime details remain marked until verified | FR-1, AC-1, UC-5 | Manual review | Draft | Review [UNVERIFIED] markers before implementation close. |
| CHK-FR2-01 | Absent CARL cannot produce a healthy verdict | FR-2, AC-2, @feature2, UC-5 | BDD scenario | Draft | Fake-green regression guard. |
| CHK-FR2-02 | Degraded state names exact missing or unsupported condition | FR-2, AC-2, UC-1 | Integration test | Draft | Doctor and installer report surfaces should share state taxonomy. |
| CHK-FR3-01 | Normal hook launcher invokes the CARL runtime consumer | FR-3, AC-3, @feature3, UC-3 | BDD scenario | Draft | Dead-integration guard: installed files are not enough. |
| CHK-FR3-02 | CARL output fixtures come from real producer before done | FR-3, AC-3, UC-6 | Manual review | Draft | verify-against-real-artifact gate. |
| CHK-FR4-01 | Broken CARL hook fails open and injects agent-visible warning | FR-4, AC-4, @feature4, UC-3 | BDD scenario | Draft | Warning must tell the agent to notify the user. |
| CHK-FR4-02 | Successful CARL hook does not inject false warning | FR-4, AC-4, UC-3 | Integration test | Draft | Positive path avoids alert fatigue. |
| CHK-FR5-01 | Doctor classifies CARL health states | FR-5, AC-5, @feature5, UC-2 | BDD scenario | Draft | States: healthy, missing, stale, broken-runtime, unsupported, user-conflict, repairable. |
| CHK-FR5-02 | Doctor repair refreshes only managed artifacts | FR-5, AC-5, UC-2 | Integration test | Draft | Preserve unrelated user config. |
| CHK-FR6-01 | Managed markers bound every config write | FR-6, AC-6, @feature6, UC-1 | BDD scenario | Draft | Marker or deterministic object key required. |
| CHK-FR6-02 | User-owned conflicts block silent overwrite | FR-6, AC-6, UC-2 | Integration test | Draft | Expected state: user-conflict. |
| CHK-FR7-01 | Codex CARL stays gated until launcher and dispatcher prerequisites exist | FR-7, AC-7, @feature7, UC-4 | BDD scenario | Draft | Codex sequence must not fork a second launcher. |
| CHK-FR7-02 | Unsupported Codex version does not affect Claude Code CARL | FR-7, AC-7, UC-4 | Integration test | Draft | Platform statuses stay separate. |
| CHK-FR8-01 | Review report covers install, runtime, warning, repair, preservation, sequencing, benchmark | FR-8, AC-8, @feature8, UC-6 | Manual review | Draft | Phase 3+ audit/report requirement. |
| CHK-FR8-02 | External CARL claims are labeled VERIFIED, UNVERIFIED, or ASSUMED | FR-8, AC-8, UC-6 | Manual review | Draft | Prevents unproven CARL claims from hardening into facts. |
| CHK-FR9-01 | Recall benchmark uses a real CARL artifact before done | FR-9, AC-9, @feature9, UC-6 | BDD scenario | Draft | Benchmark fixture cannot be hand-fabricated. |
| CHK-FR9-02 | Numeric thresholds are not invented before evidence | FR-9, AC-9, UC-6 | Manual review | Draft | Threshold starts draft until real baseline exists. |

## Verification Process

### How CHKs are verified

1. Each CHK is attached to at least one BDD scenario, integration test, or manual review item by its Traces To field.
2. Status transitions only when the linked test passes or the manual review records an evidence path in Notes.
3. Rows that depend on external CARL behavior stay `Draft` until the real CARL source, runtime output, or benchmark artifact is verified.

### Status lifecycle

`Draft → In Progress → Verified → Blocked` (regression takes `Verified → Blocked` with an issue link in Notes).

### Review cadence

- Phase 2 STOP: all CHKs in `Draft`.
- Phase 3 STOP: implementation tasks map each CHK to a concrete task and expected BDD scenario.
- Implementation end: 100% `Verified` or explicit `Blocked` with issue link and remaining [UNVERIFIED] evidence gaps.

## Summary Counts

- Total CHKs: 18
- Verified: 0
- In Progress: 0
- Draft: 18
- Blocked: 0
