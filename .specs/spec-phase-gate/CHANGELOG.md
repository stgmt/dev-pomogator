# Changelog

All notable changes to this feature will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] — 2026-05-23

> Shipped via `extensions/specs-workflow` (`phase-gate.ts` + `phase-constants.ts` in `tools/specs-validator/`, PreToolUse hook registered in `extension.json`, audit checks PARTIAL_IMPL / TASK_ATOMICITY / FR_SPLIT_CONSISTENCY / AC_SCOPE_MATCH live in `tools/specs-validator/audit-checks.ts`). 35 it() blocks in `tests/e2e/phase-gate.test.ts` cover the 22 BDD scenarios. Audit-spec on this spec: 0 ERRORs.
>
> Deviations from original spec plan (documented inline in FILE_CHANGES.md):
> - `audit-spec.ps1` → `audit-spec.ts` (PowerShell → TypeScript)
> - `.claude/commands/create-spec.md` → `.claude/skills/create-spec/SKILL.md` (command → skill bundle)
> - `.claude/rules/specs-management.md` mirror pair → consolidated into `audit-checks.ts` programmatic checks + skill-bundle references

## [Unreleased]

### Added
- Spec structure: 13 files (12 MD + 1 .feature) for spec-phase-gate feature
- 14 Functional Requirements (FR-1..FR-14) across 4 feature groups
- 14 Acceptance Criteria in EARS format (AC-1..AC-14)
- 10 Non-Functional Requirements (Performance, Reliability, Usability)
- 8 Use Cases with happy path and edge cases
- 22 BDD scenarios in spec-phase-gate.feature covering all 4 feature groups
- 4 new audit checks: PARTIAL_IMPL, TASK_ATOMICITY, FR_SPLIT_CONSISTENCY, AC_SCOPE_MATCH
- 3 new rules for specs-management.md: FR Decomposition, Task Completion Integrity, AC Scope Match
- 3-layer architecture design: PreToolUse hook + UserPromptSubmit enhancement + Audit/Rules
- Research with 9 open-source references (SienkLogic, Hitenze, VibeFlow, agentlint, etc.)
- Project context analysis with 5 relevant rules and 5 existing patterns
- TDD task plan: Phase 0 (Red) + Phases 1-5 (Green + Refactor)
