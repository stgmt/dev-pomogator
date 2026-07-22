# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | @featureN | Status |
|----|------|-----------|-----------|--------|
| [FR-1](FR.md#fr-1-setup-decision-and-install-guidance) | Setup decision and install guidance | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1) | @feature1 | Draft |
| [FR-2](FR.md#fr-2-mcp-only-auto-config) | MCP-only auto config | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2) | @feature2 | Draft |
| [FR-3](FR.md#fr-3-idempotency-backoff-and-opt-out) | Idempotency, backoff, and opt-out | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3) | @feature3 | Draft |
| [FR-4](FR.md#fr-4-doctor-classification) | Doctor classification | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4) | @feature4 | Draft |
| [FR-5](FR.md#fr-5-live-recovery-runbook) | Live recovery runbook | [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5) | @feature5 | Draft |
| [FR-6](FR.md#fr-6-hook-safe-degradation) | Hook safe degradation | [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6) | @feature6 | Draft |
| [FR-7](FR.md#fr-7-optional-force-ctx-policy) | Optional force-ctx policy | [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7) | @feature7 | Draft |
| [FR-8](FR.md#fr-8-windows-and-worktree-guidance) | Windows and worktree guidance | [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8) | @feature8 | Draft |
| [FR-9](FR.md#fr-9-honest-value-boundary) | Honest value boundary | [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9) | @feature9 | Draft |

## Functional Requirements

- [FR-1: Setup decision and install guidance](FR.md#fr-1-setup-decision-and-install-guidance)
- [FR-2: MCP-only auto config](FR.md#fr-2-mcp-only-auto-config)
- [FR-3: Idempotency, backoff, and opt-out](FR.md#fr-3-idempotency-backoff-and-opt-out)
- [FR-4: Doctor classification](FR.md#fr-4-doctor-classification)
- [FR-5: Live recovery runbook](FR.md#fr-5-live-recovery-runbook)
- [FR-6: Hook safe degradation](FR.md#fr-6-hook-safe-degradation)
- [FR-7: Optional force-ctx policy](FR.md#fr-7-optional-force-ctx-policy)
- [FR-8: Windows and worktree guidance](FR.md#fr-8-windows-and-worktree-guidance)
- [FR-9: Honest value boundary](FR.md#fr-9-honest-value-boundary)

## Non-Functional Requirements

- [Performance](NFR.md)
- [Security](NFR.md)
- [Reliability](NFR.md)
- [Usability](NFR.md)

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

## Verification Matrix (CHK)

| CHK-ID | Requirement | Traces To (FR+SC) | Verification Method | Status | Notes |
|--------|-------------|-------------------|---------------------|--------|-------|
| CHK-FR1-01 | Setup decision statuses | [FR-1](FR.md#fr-1-setup-decision-and-install-guidance), [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1), @feature1 | BDD scenario | Draft | Uses real-shaped plugin registry fixtures |
| CHK-FR2-01 | MCP-only merge safety | [FR-2](FR.md#fr-2-mcp-only-auto-config), [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2), @feature2 | BDD scenario | Draft | Verifies backup and unrelated key preservation |
| CHK-FR3-01 | Fail-open/backoff contract | [FR-3](FR.md#fr-3-idempotency-backoff-and-opt-out), [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3), @feature3 | BDD scenario | Draft | Covers malformed JSON and opt-out |
| CHK-FR4-01 | Doctor root-cause status | [FR-4](FR.md#fr-4-doctor-classification), [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4), @feature4 | BDD scenario | Draft | Distinguishes config and live MCP states |
| CHK-FR5-01 | Recovery ordering | [FR-5](FR.md#fr-5-live-recovery-runbook), [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5), @feature5 | BDD scenario | Draft | `/mcp` before full restart |
| CHK-FR6-01 | Hook fail-open | [FR-6](FR.md#fr-6-hook-safe-degradation), [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6), @feature6 | BDD scenario | Draft | No dead-tool deny |
| CHK-FR7-01 | Force-ctx policy | [FR-7](FR.md#fr-7-optional-force-ctx-policy), [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7), @feature7 | BDD scenario | Draft | Path classes and kill switch |
| CHK-FR8-01 | Windows/worktree docs | [FR-8](FR.md#fr-8-windows-and-worktree-guidance), [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8), @feature8 | BDD scenario | Draft | pwsh and ctx_batch guidance |
| CHK-FR9-01 | Honest value docs | [FR-9](FR.md#fr-9-honest-value-boundary), [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9), @feature9 | Manual review | Draft | No universal savings claim |

## Verification Process

### How CHKs are verified

1. BDD scenarios run through the repo Docker/WSL `npm test` path.
2. Config fixtures are real-shaped copies or minimized captures of real artifact structures.
3. Manual review for CHK-FR9 checks docs and doctor copy for overclaim language.

### Status lifecycle

`Draft` -> `In Progress` -> `Verified` -> `Blocked`.

### Review cadence

- Phase 2 STOP: all CHKs in `Draft`.
- Phase 3 STOP: implementation tasks map every CHK to Red/Green work.
- Implementation end: every CHK is `Verified` or explicitly `Blocked` with issue evidence.

## Summary Counts

- Total CHKs: 9
- Verified: 0
- In Progress: 0
- Draft: 9
- Blocked: 0
