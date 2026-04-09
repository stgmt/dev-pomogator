# Changelog

All notable changes to this feature will be documented in this file.

## [Unreleased] — 2026-04-09

### Added
- Initial spec for plan-pomogator prompt isolation bugfix (4 root cause bugs documented in RESEARCH.md)
- 7 Functional Requirements (FR-1..FR-7) covering session_id field rename, no-default fallback, task-notification filter, most-recent fallback removal, defense-in-depth read filter, spec validity, regression test coverage
- 7 Acceptance Criteria in EARS format with @feature1..@feature7 tags
- 5 BDD scenarios in `plan-pomogator-prompt-isolation.feature` for regression coverage
- BDD Test Infrastructure classification: TEST_DATA_NONE (stateless self-contained tests via tmpHome override)
- TASKS.md TDD workflow: Phase 0 (BDD foundation) → Phase 1 (prompt-capture fix) → Phase 2 (plan-gate fix) → Phase 3 (refactor)

### Fixed
- Bug 1: `prompt-capture.ts` reads `input.session_id` instead of non-existent `input.conversation_id` (line 31, 88)
- Bug 2: `prompt-capture.ts` filters `<task-notification>` pseudo-prompts from background tasks (line 86, new regex check)
- Bug 3: GC for `.plan-prompts-*.json` works per-session correctly (auto-fixed by Bug 1)
- Bug 4: `plan-gate.ts` `loadUserPrompts` removes most-recent fallback that violated `hook-global-state-cwd-scoping.md` (lines 74-97)
- Defense: `plan-gate.ts` `formatPromptsFromFile` filters task-notification entries on read (lines 104-117)

### Changed
- `extension.json` version bump 1.8.0 → 1.8.1 (semver patch for bugfix)
