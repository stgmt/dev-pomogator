# Changelog

All notable changes to this feature will be documented in this file.

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
