# Changelog

All notable changes to this feature will be documented in this file.

## [0.1.0] - 2026-05-23

### Added
- Initial spec scaffold (13 files: USER_STORIES, USE_CASES, RESEARCH, REQUIREMENTS, FR, NFR, ACCEPTANCE_CRITERIA, DESIGN, FILE_CHANGES, TASKS, CHANGELOG, README, .feature)
- FR-1..FR-9: Core functional requirements (auto-activation, .specs/ discovery, completeness check, parser pipeline, @featureN matching, report generation, hook orchestration, error handling, opt-out config)
- AC-1..AC-9: Acceptance criteria in EARS format
- NFR-1..NFR-9: Non-functional requirements
- DESIGN.md with architecture: parser → matcher → reporter pipeline
- 11 BDD scenarios in `tests/features/plugins/specs-workflow/PLUGIN005_specs-validator.feature` (extended from 9 originally planned)

### Implementation
- `extensions/specs-workflow/tools/specs-validator/completeness.ts` — REQUIRED_MD_FILES constant + `checkCompleteness()` + `findCompleteSpecs()` + `findSpecsFolder()` (multi-workspace-root resolution)
- `extensions/specs-workflow/tools/specs-validator/parsers/md-parser.ts` — parses `## FR-N: {Title} @featureN` / `## AC-N (FR-N): {Title} @featureN` / `## UC-N: {Title} @featureN`, extracts all `@feature\d+` via regex
- `extensions/specs-workflow/tools/specs-validator/parsers/feature-parser.ts` — parses `# @featureN` preceding Scenario, extracts scenario name
- `extensions/specs-workflow/tools/specs-validator/matcher.ts` — COVERED / NOT_COVERED / ORPHAN status logic (`MatchStatus` type exported)
- `extensions/specs-workflow/tools/specs-validator/reporter.ts` — generates `validation-report.md` in spec dir + stdout warnings on uncovered requirements
- `extensions/specs-workflow/tools/specs-validator/validate-specs.ts` (379 lines) — main hook entry: stdin JSON read, `.specs/` discovery, `.specs-validator.yaml` config check, orchestration, error handling

### Integration
- Claude hook: `UserPromptSubmit → npx tsx .dev-pomogator/tools/specs-validator/validate-specs.ts` (wired in `extensions/specs-workflow/extension.json`)
- Cursor `beforeSubmitPrompt`: not wired in this iteration (Cursor not the primary UX surface)
- Installer: standard `toolFiles` pipeline copies all 20 validator artifacts to target project on install — no dedicated `copyValidateSpecsScript()` helper needed

### Testing
- `tests/e2e/specs-validator.test.ts` — 10 describe/it blocks covering all 11 BDD scenarios (some scenarios share a test block) + helper `createCompleteSpec()`
- BDD tags `@feature1..@feature9` mapped 1:1 between requirement docs and scenarios per `extension-test-quality` rule

### Deviations from original plan
- Cursor `.mdc` rule file replaced by `.claude/skills/create-spec/references/specs-validation.md` (single source of truth inside the `create-spec` skill bundle, no Cursor-specific duplication)
- ~~`src/installer/memory.ts` copyValidateSpecsScript()~~ (removed in v2 — no canonical replacement) not added — generic `toolFiles` flow handles installation

### Notes
- Spec docs framework lagged behind code throughout implementation (TASKS not checked, CHANGELOG stuck in "[Unreleased]") — finalized at this version after a `git checkout`-driven `.specs/` recovery on 2026-05-23 (see incident in tests/setup/ensure-docker.ts header)
- `audit-spec.ts` on this spec: **0 ERRORS**. 9 remaining warnings are non-blocking and explained:
  - 2× `@feature20` / `@feature99` flagged as orphans — these are *test data literals* inside scenario step text (e.g. `And FR.md contains "## FR-1: Test @feature10"`), not actual feature tags. Audit regex can't distinguish — false positives.
  - 3× propagation warnings on the same tags — same root cause.
  - 3× `SCENARIO_COUNT_SYNC` mismatch — audit reports 9 scenarios but `.feature` actually has 11 (`grep -c "Scenario:" PLUGIN005_specs-validator.feature` = 11). Audit parser undercount, not a doc inconsistency.
  - 1× `@feature11 in FR/AC has no matching BDD scenario` — false: `# @feature11` is present in `.feature` immediately before `Scenario: PLUGIN005_11`; same audit quirk.
