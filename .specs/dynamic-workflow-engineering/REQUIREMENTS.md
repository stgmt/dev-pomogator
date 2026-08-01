# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | @featureN | Status |
|----|------|-----------|-----------|--------|
| [FR-1](FR.md#fr-1-workflow-only-delegation-gate) | Workflow-only delegation gate | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1) | @feature1 | Draft |
| [FR-2](FR.md#fr-2-origin-safe-workflow-child-policy) | Origin-safe Workflow child policy | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2) | @feature2 | Draft |
| [FR-3](FR.md#fr-3-bundled-skill-and-deterministic-steering) | Bundled skill and steering | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3) | @feature3 | Draft |
| [FR-4](FR.md#fr-4-bounded-workflow-admission) | Bounded workflow admission | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4) | @feature4 | Draft |
| [FR-5](FR.md#fr-5-deterministic-first-resource-budgets) | Deterministic-first budgets | [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5) | @feature5 | Draft |
| [FR-6](FR.md#fr-6-structured-output-retry-circuit-breaker) | Retry circuit breaker | [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6) | @feature6 | Draft |
| [FR-7](FR.md#fr-7-progress-and-no-progress-monitoring) | Progress monitoring | [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7) | @feature7 | Draft |
| [FR-8](FR.md#fr-8-partial-result-preservation-and-barrier-policy) | Partial results and barriers | [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8) | @feature8 | Draft |
| [FR-9](FR.md#fr-9-adversarial-verification-without-rediscovery) | Bounded adversarial verification | [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9) | @feature9 | Draft |
| [FR-10](FR.md#fr-10-journal-first-stop-resume-and-accounting) | Journal-first lifecycle | [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10) | @feature10 | Draft |
| [FR-11](FR.md#fr-11-sanitized-audit-and-fail-closed-protected-path) | Sanitized fail-closed audit | [AC-11](ACCEPTANCE_CRITERIA.md#ac-11-fr-11) | @feature11 | Draft |
| [FR-12](FR.md#fr-12-distribution-parity-and-guarantee-tiers) | Distribution parity and tiers | [AC-12](ACCEPTANCE_CRITERIA.md#ac-12-fr-12) | @feature12 | Draft |
| [FR-13](FR.md#fr-13-dogfood-regression-contract) | Dogfood regression contract | [AC-13](ACCEPTANCE_CRITERIA.md#ac-13-fr-13) | @feature13 | Draft |

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
| CHK-FR1-01 | Direct Agent is denied before spawn | FR-1, AC-1, @feature1 | Integration test | Draft | Real-host proof required |
| CHK-FR2-01 | Trusted Workflow child is admitted within contract | FR-2, AC-2, @feature2 | Integration test | Draft | Forged-origin negatives included |
| CHK-FR3-01 | Skill ships and denial steers to it | FR-3, AC-3, @feature3 | Integration test | Draft | Clean-home install |
| CHK-FR4-01 | Unbounded plans fail admission | FR-4, AC-4, @feature4 | BDD scenario | Draft | No child spawn |
| CHK-FR5-01 | Deterministic collector and budgets bound work | FR-5, AC-5, @feature5 | BDD scenario | Draft | Time/token tier remains honest |
| CHK-FR6-01 | Repeated unchanged failure trips breaker | FR-6, AC-6, @feature6 | BDD scenario | Draft | Logical call differs from attempt |
| CHK-FR7-01 | Monitor reports evidence without metric-only verdict | FR-7, AC-7, @feature7 | BDD scenario | Draft | FACT/INFERENCE/UNKNOWN/ACTION |
| CHK-FR8-01 | Failed sibling does not hide completed output | FR-8, AC-8, @feature8 | BDD scenario | Draft | Conservation invariant |
| CHK-FR9-01 | Verifier refutes with bounded evidence | FR-9, AC-9, @feature9 | BDD scenario | Draft | No rediscovery |
| CHK-FR10-01 | Stop/resume reads journal and reuses results | FR-10, AC-10, @feature10 | BDD scenario | Draft | Resume cache proof |
| CHK-FR11-01 | Protected path fails closed with redacted audit | FR-11, AC-11, @feature11 | Integration test | Draft | One event per decision |
| CHK-FR12-01 | Installed runtime publishes evidence-backed tier | FR-12, AC-12, @feature12 | Integration test | Draft | node_modules absent |
| CHK-FR13-01 | Both dogfood incidents replay deterministically | FR-13, AC-13, @feature13 | BDD scenario | Draft | Real journal-shaped fixtures |

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

## Summary Counts

- Total CHKs: 13
- Verified: 0
- In Progress: 0
- Draft: 13
- Blocked: 0
