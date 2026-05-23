# Changelog

All notable changes to this feature will be documented in this file.

## [Unreleased]

### Added
- Initial spec scaffolded для feature spec-variant-matrix (universal variant-coverage enforcement at spec creation time)
- 8 FRs (FR-1 — FR-8) + 7 EARS AC + Risk Assessment (H1/H2/H3/cross-extension drift)
- Architectural decision: extend existing specs-workflow extension (1.18.0 → 1.19.0)
- DESIGN с key decisions: mechanical regex без LLM, threshold-2 hits, closed list axis nouns

### Changed
- N/A — initial spec creation

### Fixed
- N/A — initial spec creation

## [0.1.0] — 2026-05-23

> Shipped via `extensions/specs-workflow/tools/specs-generator/variant-matrix/` (5 files: trigger-phrases.ts EN+RU mechanical regex + 14 axis nouns, parsers.ts, escape-log.ts JSONL audit, audit.ts VARIANT_COVERAGE category, variant-matrix-cli.ts) + skill `.claude/skills/variant-matrix-build/SKILL.md` invoked from create-spec Phase 2 step 4c (`.claude/skills/create-spec/references/phase2_requirements-and-design.md`). 19 tests in `tests/e2e/specs-generator-variant-matrix.test.ts`. Escape hatch `[skip-variant-matrix: <reason>]` audited at `.claude/logs/spec-variant-matrix-escapes.jsonl`. specs-workflow plugin bump 1.18.0 → 1.19.0 covered this work.
>
> 8 FRs shipped, FR-9 (PreToolUse form-guard) explicitly OUT OF SCOPE — deferred to v0.2.0 (audit-only catch sufficient for v0.1.0 per Risk Assessment).
>
> Audit-spec: 0 ERRORS / 5 WARNINGS (cosmetic — MISSING_AC stub for FR-9 (OUT OF SCOPE), DESIGN classification format, meta-recursive VARIANT_COVERAGE on FR-5).
