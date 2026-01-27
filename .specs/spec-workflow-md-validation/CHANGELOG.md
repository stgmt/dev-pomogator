# Changelog

All notable changes to this feature will be documented in this file.

## [Unreleased]

### Added
- Initial specification structure (13 files)
- FR-1 to FR-9: Core functional requirements
- AC-1 to AC-9: Acceptance criteria in EARS format
- NFR-1 to NFR-9: Non-functional requirements
- Design document with architecture
- BDD scenarios (9 total)

### Components
- completeness.ts: Spec completeness checker
- md-parser.ts: MD file parser for @featureN
- feature-parser.ts: .feature file parser
- matcher.ts: Tag matching logic
- reporter.ts: Report generation
- validate-specs.ts: Main hook entry point

### Integration
- Cursor hook: beforeSubmitPrompt
- Claude hook: UserPromptSubmit
- Extension: specs-workflow

## [0.1.0] - TBD

### Added
- Initial implementation
