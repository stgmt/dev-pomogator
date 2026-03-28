# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | @featureN | Status |
|----|------|-----------|-----------|--------|
| FR-1 | Hook intercept | AC-9 | @feature1 | Draft |
| FR-2 | TypeScript staleness check | AC-1, AC-2, AC-3 | @feature1 | Draft |
| FR-3 | Docker SKIP_BUILD block | AC-4 | @feature3 | Draft |
| FR-4 | dotnet no-build block | AC-5 | @feature3 | Draft |
| FR-5 | Framework detection | AC-6 | @feature1 | Draft |
| FR-6 | Deny message with fix command | AC-1, AC-4, AC-5 | @feature1 | Draft |
| FR-7 | SKIP_BUILD_CHECK bypass | AC-7 | @feature5 | Draft |

## Functional Requirements

- FR-1: Hook intercept — see [FR.md](FR.md)
- FR-2: TypeScript staleness check — see [FR.md](FR.md)
- FR-3: Docker SKIP_BUILD block — see [FR.md](FR.md)
- FR-4: dotnet no-build block — see [FR.md](FR.md)
- FR-5: Framework detection — see [FR.md](FR.md)
- FR-6: Deny message with fix command — see [FR.md](FR.md)
- FR-7: SKIP_BUILD_CHECK bypass — see [FR.md](FR.md)

## Non-Functional Requirements

- [Performance](NFR.md#performance) — hook < 500ms
- [Security](NFR.md#security) — N/A
- [Reliability](NFR.md#reliability) — fail-open
- [Usability](NFR.md#usability) — fix-command в deny message

## Acceptance Criteria

- AC-1: TypeScript stale build deny — see [AC.md](ACCEPTANCE_CRITERIA.md)
- AC-2: TypeScript missing dist deny — see [AC.md](ACCEPTANCE_CRITERIA.md)
- AC-3: TypeScript fresh build allow — see [AC.md](ACCEPTANCE_CRITERIA.md)
- AC-4: Docker SKIP_BUILD deny — see [AC.md](ACCEPTANCE_CRITERIA.md)
- AC-5: dotnet --no-build deny — see [AC.md](ACCEPTANCE_CRITERIA.md)
- AC-6: pytest/go/rust passthrough — see [AC.md](ACCEPTANCE_CRITERIA.md)
- AC-7: SKIP_BUILD_CHECK bypass — see [AC.md](ACCEPTANCE_CRITERIA.md)
- AC-8: Fail-open — see [AC.md](ACCEPTANCE_CRITERIA.md)
- AC-9: Non-test command passthrough — see [AC.md](ACCEPTANCE_CRITERIA.md)
