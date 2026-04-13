# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | @featureN | Status |
|----|------|-----------|-----------|--------|
| [FR-1](FR.md#fr-1-linux-npx-install-regression-coverage-feature1) | Linux npx install regression coverage | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-feature1) | @feature1 | Active |
| [FR-2](FR.md#fr-2-windows-npx-install-regression-coverage-feature2) | Windows npx install regression coverage | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-feature2), [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-2-post-fix-feature2) | @feature2 | Active (TDD red on Windows) |
| [FR-3](FR.md#fr-3-runinstallerviapnpx-helper-api-feature3) | runInstallerViaNpx helper API | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-3-feature3) | @feature3 | Active |
| [FR-4](FR.md#fr-4-install-diagnostics-spec-structure-feature4) | install-diagnostics spec structure | [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-4-feature4) | @feature4 | Active |
| [FR-5](FR.md#fr-5-cross-references-via-featuren-tags-feature5) | Cross-references via @featureN tags | [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-5-feature5) | @feature5 | Active |

## Functional Requirements

- [FR-1: Linux npx install regression coverage](FR.md#fr-1-linux-npx-install-regression-coverage-feature1)
- [FR-2: Windows npx install regression coverage](FR.md#fr-2-windows-npx-install-regression-coverage-feature2)
- [FR-3: runInstallerViaNpx helper API](FR.md#fr-3-runinstallerviapnpx-helper-api-feature3)
- [FR-4: install-diagnostics spec structure](FR.md#fr-4-install-diagnostics-spec-structure-feature4)
- [FR-5: Cross-references via @featureN tags](FR.md#fr-5-cross-references-via-featuren-tags-feature5)

## Non-Functional Requirements

- [Performance](NFR.md#performance)
- [Security](NFR.md#security)
- [Reliability](NFR.md#reliability)
- [Usability](NFR.md#usability)

## Acceptance Criteria

- [AC-1 (FR-1): Linux happy path assertions](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-feature1)
- [AC-2 (FR-2): Windows TDD red expected failure mode](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-feature2)
- [AC-3 (FR-2 post-fix): Windows assertions identical to Linux after bug fix](ACCEPTANCE_CRITERIA.md#ac-3-fr-2-post-fix-feature2)
- [AC-4 (FR-3): runInstallerViaNpx behaviour contract](ACCEPTANCE_CRITERIA.md#ac-4-fr-3-feature3)
- [AC-5 (FR-4): validate-spec returns 0 errors](ACCEPTANCE_CRITERIA.md#ac-5-fr-4-feature4)
- [AC-6 (FR-5): audit-spec finds @feature cross-refs](ACCEPTANCE_CRITERIA.md#ac-6-fr-5-feature5)

## Cross-Test Coverage

- BDD scenarios: `tests/features/core/CORE003_claude-installer.feature` → CORE003_18 (@feature18, парный с @feature1), CORE003_19 (@feature19, парный с @feature2)
- Integration tests: `tests/e2e/claude-installer.test.ts` → 2 новых `describe.skipIf` блока
- Skill: `.claude/skills/install-diagnostics/SKILL.md` → diagnostic guide для interactive use
