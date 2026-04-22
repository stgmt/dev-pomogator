# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | @featureN | Status |
|----|------|-----------|-----------|--------|
| [FR-1](FR.md#fr-1-linux-npx-install-regression-coverage-feature1) | Linux npx install regression coverage | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-feature1) | @feature1 | Active |
| [FR-2](FR.md#fr-2-windows-npx-install-regression-coverage-feature2) | Windows npx install regression coverage | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-feature2), [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-2-post-fix-feature2) | @feature2 | Active (TDD red on Windows) |
| [FR-3](FR.md#fr-3-runinstallerviapnpx-helper-api-feature3) | runInstallerViaNpx helper API | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-3-feature3) | @feature3 | Active |
| [FR-4](FR.md#fr-4-install-diagnostics-spec-structure-feature4) | install-diagnostics spec structure | [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-4-feature4) | @feature4 | Active |
| [FR-5](FR.md#fr-5-cross-references-via-featuren-tags-feature5) | Cross-references via @featureN tags | [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-5-feature5) | @feature5 | Active |
| [FR-6](FR.md#fr-6-promptrace-failure-mode-detection-feature6) | Prompt-race failure mode detection | [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-6-feature6) | @feature6 | Active (Phase 4) |
| [FR-7](FR.md#fr-7-docs-hardening--yes-flag-in-all-userfacing-install-commands-feature6) | Docs hardening — `--yes` flag in all user-facing install commands | [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-7-feature6) | @feature6 | Active (Phase 4) |
| [FR-8](FR.md#fr-8-installcommand-lint-check-regression-prevention-feature6) | Install-command lint check (regression prevention) | [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-8-feature6) | @feature6 | Active (Phase 4) |
| [FR-9](FR.md#fr-9-bdd-regression-scenario-for-promptrace-core00320-feature6) | BDD regression scenario for prompt-race (CORE003_20) | [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-9-feature6) | @feature6 | Active (Phase 4) |
| [FR-10](FR.md#fr-10-defensive-bin-wrapper-optionaldeferred-feature6) | Defensive bin wrapper (optional/deferred) | [AC-11](ACCEPTANCE_CRITERIA.md#ac-11-fr-10-feature6) | @feature6 | Deferred |

## Functional Requirements

- [FR-1: Linux npx install regression coverage](FR.md#fr-1-linux-npx-install-regression-coverage-feature1)
- [FR-2: Windows npx install regression coverage](FR.md#fr-2-windows-npx-install-regression-coverage-feature2)
- [FR-3: runInstallerViaNpx helper API](FR.md#fr-3-runinstallerviapnpx-helper-api-feature3)
- [FR-4: install-diagnostics spec structure](FR.md#fr-4-install-diagnostics-spec-structure-feature4)
- [FR-5: Cross-references via @featureN tags](FR.md#fr-5-cross-references-via-featuren-tags-feature5)
- [FR-6: Prompt-race failure mode detection](FR.md#fr-6-promptrace-failure-mode-detection-feature6)
- [FR-7: Docs hardening `--yes` flag](FR.md#fr-7-docs-hardening--yes-flag-in-all-userfacing-install-commands-feature6)
- [FR-8: Install-command lint check](FR.md#fr-8-installcommand-lint-check-regression-prevention-feature6)
- [FR-9: BDD regression scenario CORE003_20](FR.md#fr-9-bdd-regression-scenario-for-promptrace-core00320-feature6)
- [FR-10: Defensive bin wrapper (deferred)](FR.md#fr-10-defensive-bin-wrapper-optionaldeferred-feature6)

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
- [AC-7 (FR-6): Mode B classification evidence-driven](ACCEPTANCE_CRITERIA.md#ac-7-fr-6-feature6)
- [AC-8 (FR-7): `--yes` flag present in all user-facing install commands](ACCEPTANCE_CRITERIA.md#ac-8-fr-7-feature6)
- [AC-9 (FR-8): CI lint fails on unsafe npx pattern](ACCEPTANCE_CRITERIA.md#ac-9-fr-8-feature6)
- [AC-10 (FR-9): CORE003_20 reproduces prompt-race](ACCEPTANCE_CRITERIA.md#ac-10-fr-9-feature6)
- [AC-11 (FR-10): Defensive wrapper contract (deferred)](ACCEPTANCE_CRITERIA.md#ac-11-fr-10-feature6)

## Cross-Test Coverage

- BDD scenarios: `tests/features/core/CORE003_claude-installer.feature` → CORE003_18 (@feature18, парный с @feature1), CORE003_19 (@feature19, парный с @feature2), CORE003_20 (парный с @feature6 FR-9)
- Integration tests: `tests/e2e/claude-installer.test.ts` → 3 `describe.skipIf` блока
- Skill: `.claude/skills/install-diagnostics/SKILL.md` → diagnostic guide для interactive use, Mode A/B/A+B branching per FR-6
- BDD в own .feature: `install-diagnostics.feature` → INSTALL_DIAG_01..09 (4 initial + 5 новых для Mode B + lint + CORE003_20 reproduction)
