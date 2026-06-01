# Changelog

All notable changes to this feature will be documented in this file.

## [Unreleased]

### Added

- New `create-spec` skill at `.claude/skills/create-spec/` with `SKILL.md` ≤200 lines + `references/` subdirectory containing 19 phase/category/topic reference files
- New standalone `research-workflow` skill at `.claude/skills/research-workflow/SKILL.md` with independent triggers (`исследуй / найди / погугли / ресерч`)
- Phase 3+ Audit category-specific reference files: `phase3plus_audit-{errors,logic-gaps,inconsistency,rudiments,fantasies,undefined-behavior,jira-drift}.md` (7 files plus overview)
- Reference file naming convention: `phaseN[.M]_descriptive-name.md` for phase-bound files
- Skill composition: `create-spec` invokes `research-workflow` via `Skill("research-workflow")` during Phase 1 step 5 (RESEARCH.md filling)
- Integration test ~~`tests/e2e/specs-management-skill-migration.test.ts`~~ → skill `.claude/skills/create-spec/` + `tests/e2e/create-specs-bdd-enforcement.test.ts` driving FR-4 / FR-6 / FR-7 / FR-11 verification
- 14 new BDD scenarios SPECMGT001_01..14 added to `tests/features/plugins/specs-workflow/PLUGIN003_specs-workflow.feature`
- Static fixture `tests/fixtures/specs-management-as-skill/sample-spec/` for hook validation tests

### Changed

- `extensions/specs-workflow/extension.json`: `ruleFiles.claude` set to `[]`; `skills` extended with `research-workflow` entry; `skillFiles["create-spec"]` populated with all 20 paths (SKILL.md + 19 references); `skillFiles["research-workflow"]` populated with SKILL.md path; version bumped from 1.17.0 to 1.18.0
- `CLAUDE.md`: removed 4 rows from "Triggered" rules table referencing `specs-management.md`, `no-mocks-fallbacks.md`, `research-workflow.md`, `specs-validation.md`
- `.claude/skills/create-spec/SKILL.md`: replaced 66-line scaffold-only skill with full workflow overview + navigation table + comprehensive `description` (≤1024 chars including all RU+EN trigger phrases) + complete `allowed-tools` list

### Removed

- `.claude/rules/specs-workflow/specs-management.md` (669 lines) — content split across new SKILL.md + references/
- `.claude/rules/specs-workflow/no-mocks-fallbacks.md` (25 lines) — moved to `references/no-mocks-fallbacks.md`
- `.claude/rules/specs-workflow/research-workflow.md` (157 lines) — promoted to standalone skill
- `.claude/rules/specs-workflow/specs-validation.md` (68 lines) — moved to `references/specs-validation.md`; hook code unaffected
- `.claude/rules/specs-workflow/bdd-enforcement.md` (57 lines, was unmanaged) — moved to `references/bdd-enforcement.md`; net gain for end users (was not previously installed)
- `.claude/rules/specs-workflow/undefined-behavior-taxonomy.md` (170 lines, was unmanaged) — inlined into `references/phase3plus_audit-undefined-behavior.md`; net gain for end users

### Performance

- Startup token cost for non-spec sessions: reduced from ~10,200 tokens to ~250 tokens (97% reduction)
- Active Phase 2 spec work: reduced from ~10,200 to ~4,000 tokens (60% reduction)
- Active Phase 3+ Audit: reduced from ~10,200 to ~5,500 tokens (46% reduction)

### Migration notes

- Hard cutover in single dev-pomogator release; no deprecation period, no backwards-compat shims
- Existing user modifications to managed rule files automatically backed up to `.dev-pomogator/.user-overrides/` per existing `updater-managed-cleanup` behavior
- Cursor support — out of scope; Cursor was previously removed from dev-pomogator

## [0.1.0] - 2026-04-26

### Added

- Initial spec scaffolding (Phase 1 Discovery completed via specs-workflow + manual fill since spec is v2 not v3)
