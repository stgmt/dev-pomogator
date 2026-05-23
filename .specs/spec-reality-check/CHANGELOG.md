# Changelog

All notable changes to this feature will be documented in this file.

## [Unreleased]

### Added
- Spec scaffold via `Skill("create-spec")` workflow (2026-05-24): 13-файловый scaffold через 4 фазы Discovery → Context → Requirements → Finalization
- 15 FRs covering 6 verification checks + 2 интеграции (spec-review category 15, create-spec Phase 3) + PreToolUse hook + 3 output formats
- 14 BDD scenarios (SRC001_01..10, SRC001_05b, SRCHOOK001_01..03)
- 5 Key Decisions в DESIGN.md (two-mechanism trigger / AuditFinding reuse / three formats / graceful parser / fail-open)

### Changed
- N/A (новая фича)

### Fixed
- FR-15 (already shipped, commit `b8a2bca`): plan-gate.ts Phase 2.5 deny error — конвертация string array в ValidationError objects устраняет вывод "line undefined: undefined"

## [0.1.0] - TBD

### Added
- Initial implementation: skill `spec-reality-check` с 6 checks + hook + integrations + applied на canonical-plugin spec
