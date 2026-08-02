# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | @featureN | Status |
|----|------|-----------|-----------|--------|
| [FR-1](FR.md#fr-1-workflow-only-delegation-gate) | Workflow-only native-Agent gate with separate Workflow subject | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1) | @feature1 | Draft |
| [FR-2](FR.md#fr-2-origin-safe-workflow-child-policy) | Origin-safe finite Workflow packet admission | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2) | @feature2 | Draft |
| [FR-3](FR.md#fr-3-bundled-skill-and-deterministic-steering) | Bundled skill and plugin-root script resolution | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3) | @feature3 | Draft |
| [FR-4](FR.md#fr-4-bounded-workflow-admission) | Finite scopes, ownership, barriers, and stop contracts | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4) | @feature4 | Draft |
| [FR-5](FR.md#fr-5-deterministic-first-resource-budgets) | Deterministic collectors and adapter budgets | [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5) | @feature5 | Draft |
| [FR-6](FR.md#fr-6-structured-output-retry-circuit-breaker) | One changed-strategy retry and circuit-break | [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6) | @feature6 | Draft |
| [FR-7](FR.md#fr-7-progress-and-no-progress-monitoring) | Journal-backed evidence monitoring | [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7) | @feature7 | Draft |
| [FR-8](FR.md#fr-8-partial-result-preservation-and-barrier-policy) | Partial-result conservation and completeness | [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8) | @feature8 | Draft |
| [FR-9](FR.md#fr-9-adversarial-verification-without-rediscovery) | Bounded adversarial verifier | [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9) | @feature9 | Draft |
| [FR-10](FR.md#fr-10-journal-first-stop-resume-and-accounting) | Redacted journal, replay, and compatible resume | [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10) | @feature10 | Draft |
| [FR-11](FR.md#fr-11-sanitized-audit-and-fail-closed-protected-path) | Redacted audit and conditional protected fail-closed path | [AC-11](ACCEPTANCE_CRITERIA.md#ac-11-fr-11) | @feature11 | Draft |
| [FR-12](FR.md#fr-12-distribution-parity-and-guarantee-tiers) | Real-host capability matrix and guarantee tiers | [AC-12](ACCEPTANCE_CRITERIA.md#ac-12-fr-12) | @feature12 | Draft |
| [FR-13](FR.md#fr-13-dogfood-regression-contract) | Incident provenance and adapter regression contract | [AC-13](ACCEPTANCE_CRITERIA.md#ac-13-fr-13) | @feature13 | Draft |

## Functional Requirements

- [FR-1: Workflow-only delegation gate](FR.md#fr-1-workflow-only-delegation-gate)
- [FR-2: Origin-safe Workflow child policy](FR.md#fr-2-origin-safe-workflow-child-policy)
- [FR-3: Bundled skill and deterministic steering](FR.md#fr-3-bundled-skill-and-deterministic-steering)
- [FR-4: Bounded workflow admission](FR.md#fr-4-bounded-workflow-admission)
- [FR-5: Deterministic-first resource budgets](FR.md#fr-5-deterministic-first-resource-budgets)
- [FR-6: Structured-output retry circuit breaker](FR.md#fr-6-structured-output-retry-circuit-breaker)
- [FR-7: Progress and no-progress monitoring](FR.md#fr-7-progress-and-no-progress-monitoring)
- [FR-8: Partial-result preservation and barrier policy](FR.md#fr-8-partial-result-preservation-and-barrier-policy)
- [FR-9: Adversarial verification without rediscovery](FR.md#fr-9-adversarial-verification-without-rediscovery)
- [FR-10: Journal-first stop, resume, and accounting](FR.md#fr-10-journal-first-stop-resume-and-accounting)
- [FR-11: Sanitized audit and fail-closed protected path](FR.md#fr-11-sanitized-audit-and-fail-closed-protected-path)
- [FR-12: Distribution parity and guarantee tiers](FR.md#fr-12-distribution-parity-and-guarantee-tiers)
- [FR-13: Dogfood regression contract](FR.md#fr-13-dogfood-regression-contract)

## Non-Functional Requirements

- [Performance](NFR.md#performance)
- [Security](NFR.md#security)
- [Reliability](NFR.md#reliability)
- [Usability](NFR.md#usability)
- [Portability](NFR.md#portability)

## Acceptance Criteria

- [AC-1 (FR-1)](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
- [AC-2 (FR-2)](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
- [AC-3 (FR-3)](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
- [AC-4 (FR-4)](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
- [AC-5 (FR-5)](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)
- [AC-6 (FR-6)](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)
- [AC-7 (FR-7)](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)
- [AC-8 (FR-8)](ACCEPTANCE_CRITERIA.md#ac-8-fr-8)
- [AC-9 (FR-9)](ACCEPTANCE_CRITERIA.md#ac-9-fr-9)
- [AC-10 (FR-10)](ACCEPTANCE_CRITERIA.md#ac-10-fr-10)
- [AC-11 (FR-11)](ACCEPTANCE_CRITERIA.md#ac-11-fr-11)
- [AC-12 (FR-12)](ACCEPTANCE_CRITERIA.md#ac-12-fr-12)
- [AC-13 (FR-13)](ACCEPTANCE_CRITERIA.md#ac-13-fr-13)

## Verification Matrix (CHK)

| CHK-ID | Requirement | Traces To (FR+SC) | Verification Method | Status | Notes |
|--------|-------------|-------------------|---------------------|--------|-------|
| CHK-FR1-01 | Native Agent gate is conditional on proven host boundary and separate from Workflow-native agent() | FR-1, AC-1, @feature1 | Integration test | Draft | Real-host capability fixture |
| CHK-FR2-01 | Finite Workflow packet admits only trusted exact contracts | FR-2, AC-2, @feature2 | Integration test | Draft | Forged/expired/duplicate negatives |
| CHK-FR3-01 | Bundled skill and plugin-root scriptPath resolve after install | FR-3, AC-3, @feature3 | Integration test | Draft | No .claude/workflows distribution assumption |
| CHK-FR4-01 | Admission rejects unbounded or widened packet plans | FR-4, AC-4, @feature4 | BDD scenario | Draft | Blocked/dropped states required |
| CHK-FR5-01 | Deterministic collectors precede bounded model loops and adapters | FR-5, AC-5, @feature5 | BDD scenario | Draft | Time/token controls remain honest |
| CHK-FR6-01 | One changed-strategy retry and circuit-break semantics hold | FR-6, AC-6, @feature6 | BDD scenario | Draft | Logical versus physical accounting |
| CHK-FR7-01 | Monitor uses journal evidence and four truth categories | FR-7, AC-7, @feature7 | BDD scenario | Draft | Size alone is not runaway |
| CHK-FR8-01 | Completed outputs survive siblings and completeness requires all mandatory branches | FR-8, AC-8, @feature8 | BDD scenario | Draft | Conservation invariant |
| CHK-FR9-01 | Bounded verifier attempts refutation without rediscovery | FR-9, AC-9, @feature9 | BDD scenario | Draft | One allowed verdict |
| CHK-FR10-01 | Redacted journal enables offline replay and compatible resume | FR-10, AC-10, @feature10 | BDD scenario | Draft | REPLAY_UNAVAILABLE on missing producer proof |
| CHK-FR11-01 | Protected route conditionally fails closed with one redacted audit event | FR-11, AC-11, @feature11 | Integration test | Draft | Unrelated routes retain behavior |
| CHK-FR12-01 | Real-host matrix publishes one honest guarantee tier and control modes | FR-12, AC-12, @feature12 | Integration test | Draft | Clean/foreign-CWD/deps-absent |
| CHK-FR13-01 | Real incident exporter and serial adapters preserve evidence and explicit failures | FR-13, AC-13, @feature13 | BDD scenario | Draft | No implementation/executable evidence claimed |

## Verification Process

### How CHKs are verified
1. Each CHK is attached to at least one BDD scenario through its Traces To.
2. Status transitions only when the linked test passes; manual evidence is recorded in Notes.
3. Integration checks that depend on real Claude Code are never replaced by mock-only green results.

### Status lifecycle
`Draft → In Progress → Verified → Blocked` (regression takes Verified → Blocked with issue link in Notes).

### Review cadence
- Phase 2 STOP: all CHKs in `Draft`.
- Phase 3 STOP: at least half in `In Progress`.
- Implementation end: all `Verified` or explicit `Blocked` with issue link.

## Second incident CHK extensions

| CHK-ID | Requirement | Traces To (FR+SC) | Verification Method | Status | Notes |
|--------|-------------|-------------------|---------------------|--------|-------|
| CHK-FR2-02 | Root/worktree identity and atomic Agent→root→process-group→lease→run→proof binding precede work | FR-2, AC-2, @feature2 | Integration test | Draft | Normalized root mismatch blocks before first action |
| CHK-FR4-02 | CAS single-writer state, separate checkout/shared-runtime leases, and APPLY gates prevent concurrent mutation | FR-4, AC-4, @feature4 | BDD scenario | Draft | Nested fan-out requires ownership census |
| CHK-FR5-02 | Typed argv-array runner and canonical probe preserve terminal diagnostics and typed count invariants | FR-5, AC-5, @feature5 | Integration test | Draft | Harness/capability/product outcomes stay distinct |
| CHK-FR6-02 | Process-group stop, terminal zero scan, stop states, recovery capsule, and HARNESS_REPAIR circuit are bounded | FR-6, AC-6, @feature6 | Integration test | Draft | Covers detached descendants and context overflow |
| CHK-FR7-02 | Per-run journal and monitor correlate owner, runId, seq, descendants, leases, proof layers, and terminal marker | FR-7, AC-7, @feature7 | BDD scenario | Draft | Stale pulses and monitors do not prove progress |
| CHK-FR8-02 | Staged/quarantined mutation and all-layer evidence prevent unproven apply from becoming complete | FR-8, AC-8, @feature8 | BDD scenario | Draft | Typed collections and AND completeness |
| CHK-FR9-02 | Canonical-path probe and independent readback distinguish harness defect, capability gap, and product failure | FR-9, AC-9, @feature9 | Integration test | Draft | External producer provenance required |
| CHK-FR10-02 | Per-run journal, terminal marker, and bounded capsule govern replay/resume without stale context | FR-10, AC-10, @feature10 | BDD scenario | Draft | Missing producer proof is REPLAY_UNAVAILABLE |
| CHK-FR11-02 | Native exit/diagnostic evidence outranks warnings and one redacted event preserves audit integrity | FR-11, AC-11, @feature11 | Integration test | Draft | No raw prompt, secret, token, or payload |
| CHK-FR12-02 | Run/worktree-derived resources use ownership/mount validation and preserve foreign resources | FR-12, AC-12, @feature12 | Integration test | Draft | Fixed names are unsafe |
| CHK-FR13-02 | Second incident remains provenance-only and cannot close a task or implementation claim | FR-13, AC-13, @feature13 | BDD scenario | Draft | Replay waits for original evidence and independent readback |

## Summary Counts

- Base traceability CHKs: 13
- Second-incident extension CHKs: 11
- Total planned CHKs: 24
- Verified: 0
- In Progress: 0
- Draft: 24
- Blocked: 0
