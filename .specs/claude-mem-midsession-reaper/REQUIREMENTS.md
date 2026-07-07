# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | @featureN | Status |
|----|------|-----------|-----------|--------|
| [FR-1](FR.md) | Heal a wedged worker mid-session | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1) | @FR-1 | Draft |
| [FR-2](FR.md) | Fast path when healthy | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2) | @FR-2 | Draft |
| [FR-3](FR.md) | Debounce the check | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3) | @FR-3 | Draft |
| [FR-4](FR.md) | Ship to all via PreToolUse | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4) | @FR-4 | Draft |
| [FR-5](FR.md) | Safe by construction | [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5) | @FR-5 | Draft |
| [FR-6](FR.md) | Visible signal when memory down | [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6) | @FR-6 | Draft |

## Functional Requirements

- [FR-1: Heal a wedged worker mid-session](FR.md)
- [FR-2: Fast path when healthy](FR.md)
- [FR-3: Debounce the check](FR.md)
- [FR-4: Ship to all via PreToolUse](FR.md)
- [FR-5: Safe by construction](FR.md)
- [FR-6: Visible signal when memory down](FR.md)

## Non-Functional Requirements

- [Performance](NFR.md#performance)
- [Security](NFR.md#security)
- [Reliability](NFR.md#reliability)
- [Usability](NFR.md#usability)

## Acceptance Criteria

- [AC-1 (FR-1)](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
- [AC-2 (FR-2)](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
- [AC-3 (FR-3)](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
- [AC-4 (FR-4)](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
- [AC-5 (FR-5)](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)
- [AC-6 (FR-6)](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)

## Verification Matrix (CHK)

| CHK-ID | Requirement | Traces To (FR+SC) | Verification Method | Status | Notes |
|--------|-------------|-------------------|---------------------|--------|-------|
| CHK-FR1-01 | Mid-session reap heals a wedged worker | FR-1, AC-1, @FR-1 | BDD scenario | Draft | reuses reaperDecision |
| CHK-FR2-01 | Healthy worker skips the OS snapshot | FR-2, AC-2, @FR-2 | BDD scenario | Draft | seam asserts snapshot not taken |
| CHK-FR3-01 | Debounce skips the check within window | FR-3, AC-3, @FR-3 | BDD scenario | Draft | env-seamable timestamp |
| CHK-FR4-01 | Guard registered on PreToolUse for all users | FR-4, AC-4, @FR-4 | Integration test | Draft | hooks.json presence |
| CHK-FR5-01 | Fail-open, non-Windows skip, never deny | FR-5, AC-5, @FR-5 | BDD scenario | Draft | builtins-only |
| CHK-FR6-01 | Visible non-blocking down signal | FR-6, AC-6, @FR-6 | BDD scenario | Draft | de-duped, clears when healthy |

## Verification Process

### How CHKs are verified

1. Each CHK is linked to at least one BDD scenario or unit test via Traces To.
2. Verification Method values: `BDD scenario` | `Unit test` | `Manual review` | `Integration test` | `N/A`.
3. Status advances only when the linked test passes; manual reviews record outcome in Notes.

### Status lifecycle

`Draft` → `In Progress` → `Verified` → `Blocked` (set `Blocked` + link issue on regression).

### Review cadence

- Phase 2 STOP: all CHKs in `Draft`.
- Phase 3 STOP: ≥50% of CHKs in `In Progress`.
- Implementation end: 100% `Verified` or explicit `Blocked` with issue link.

## Summary Counts

- Total CHKs: 6
- Verified: 0
- In Progress: 0
- Draft: 6
- Blocked: 0
