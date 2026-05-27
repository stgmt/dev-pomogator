# Changelog

All notable changes to this feature will be documented in this file.

## [0.1.0] — 2026-05-23

> Shipped via `extensions/specs-workflow/tools/specs-generator/bdd-framework-detector.ts` (6 recipes: Reqnroll, SpecFlow, Cucumber.js, Playwright BDD, Behave, pytest-bdd). 6 integration tests `SBDE001_01..06` in `tests/e2e/create-specs-bdd-enforcement.test.ts` cover detector, ConfirmStop Requirements blocking, analyze-features, `-TestFormat` flag, Phase 0 bootstrap.
>
> Architecture deviation from spec plan: rules originally planned as 4 mirror `.md` files under `.claude/rules/specs-workflow/` + `extensions/specs-workflow/rules/claude/` (specs-management + bdd-enforcement, each duplicated). Real shape — one consolidated `.claude/skills/create-spec/references/bdd-enforcement.md` inside the create-spec skill bundle, plus `specs-validation.md` sibling. The single-source layout means the rule lives next to the workflow that enforces it. Documented inline in FILE_CHANGES.md.
>
> Audit-spec: 0 ERRORS, 2 WARNINGS (case variance TestFormat/testFormat in terminology + DESIGN.md lacks formal `**Classification:**` field for TEST_DATA_ACTIVE block — both cosmetic, non-blocking).

## [Unreleased]

### Added

- Initial spec creation for BDD Enforcement + Non-Skippable Test-Format Detection feature
- 9 FR / 9 AC (EARS format) / 6 BDD scenarios SBDE001_01..06
- Cross-reference to `.specs/spec-phase-gate/` (phase-gate hook architecture)
- DESIGN.md demonstrates new `## BDD Test Infrastructure` format with TEST_DATA + TEST_FORMAT + Framework + Install Command + Evidence fields

## [0.1.0] - 2026-04-20

### Added

- Spec scaffolded via `scaffold-spec.ts -Name "create-specs-bdd-enforcement"`
- 15 files created (13 mandatory + SCHEMA.md + FIXTURES.md optional)
- Phases Discovery / Context / Requirements confirmed through state machine (`spec-status.ts -ConfirmStop`)
- Phase Finalization pending
