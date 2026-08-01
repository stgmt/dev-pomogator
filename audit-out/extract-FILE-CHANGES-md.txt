# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи.

См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

## Skill files — create-spec

| Path | Action | Reason |
|------|--------|--------|
| `.claude/skills/create-spec/SKILL.md` | edit | Replace 66-line scaffold-only skill with full workflow overview ≤200 lines per [FR-1](FR.md#fr-1-skill-structure-with-progressive-disclosure-feature1), [FR-9](FR.md#fr-9-skill-description-preserves-all-trigger-phrases-feature5), [FR-10](FR.md#fr-10-allowed-tools-covers-full-workflow-feature5) |
| `.claude/skills/create-spec/references/phase1_discovery.md` | create | Phase 1 algorithm extracted from old specs-management.md per [FR-1](FR.md#fr-1-skill-structure-with-progressive-disclosure-feature1) |
| `.claude/skills/create-spec/references/phase1.5_project-context.md` | create | Phase 1.5 algorithm per [FR-2](FR.md#fr-2-reference-file-naming-convention-phasenmdescriptive-feature2) |
| `.claude/skills/create-spec/references/phase2_requirements-and-design.md` | create | Phase 2 algorithm without BDD subsection per [FR-1](FR.md#fr-1-skill-structure-with-progressive-disclosure-feature1) |
| `.claude/skills/create-spec/references/phase2_bdd-test-infrastructure.md` | create | Step 6.1-6.5 BDD infra assessment extracted as separate file per [FR-1](FR.md#fr-1-skill-structure-with-progressive-disclosure-feature1) |
| `.claude/skills/create-spec/references/phase3_finalization.md` | create | Phase 3 algorithm per [FR-1](FR.md#fr-1-skill-structure-with-progressive-disclosure-feature1) |
| `.claude/skills/create-spec/references/phase3plus_audit-overview.md` | create | Audit workflow overview + category dispatch per [FR-3](FR.md#fr-3-phase-3-audit-categories-split-into-separate-files-feature3) |
| `.claude/skills/create-spec/references/phase3plus_audit-errors.md` | create | Audit category 1 per [FR-3](FR.md#fr-3-phase-3-audit-categories-split-into-separate-files-feature3) |
| `.claude/skills/create-spec/references/phase3plus_audit-logic-gaps.md` | create | Audit category 2 per [FR-3](FR.md#fr-3-phase-3-audit-categories-split-into-separate-files-feature3) |
| `.claude/skills/create-spec/references/phase3plus_audit-inconsistency.md` | create | Audit category 3 per [FR-3](FR.md#fr-3-phase-3-audit-categories-split-into-separate-files-feature3) |
| `.claude/skills/create-spec/references/phase3plus_audit-rudiments.md` | create | Audit category 4 per [FR-3](FR.md#fr-3-phase-3-audit-categories-split-into-separate-files-feature3) |
| `.claude/skills/create-spec/references/phase3plus_audit-fantasies.md` | create | Audit category 5 per [FR-3](FR.md#fr-3-phase-3-audit-categories-split-into-separate-files-feature3) |
| `.claude/skills/create-spec/references/phase3plus_audit-undefined-behavior.md` | create | Audit category 6 with inlined taxonomy per [FR-3](FR.md#fr-3-phase-3-audit-categories-split-into-separate-files-feature3) (Decision 5) |
| `.claude/skills/create-spec/references/phase3plus_audit-jira-drift.md` | create | Audit category 7 (Jira-only) per [FR-3](FR.md#fr-3-phase-3-audit-categories-split-into-separate-files-feature3) |
| `.claude/skills/create-spec/references/feature-creation-rules.md` | create | `.feature` creation guidelines extracted from specs-management.md per [FR-1](FR.md#fr-1-skill-structure-with-progressive-disclosure-feature1) |
| `.claude/skills/create-spec/references/jira-mode.md` | create | Consolidated Jira-first workflow Step 0 + Jira trace format per [FR-1](FR.md#fr-1-skill-structure-with-progressive-disclosure-feature1) |
| `.claude/skills/create-spec/references/validation-rules.md` | create | Validation rules table reference per [FR-1](FR.md#fr-1-skill-structure-with-progressive-disclosure-feature1) |
| `.claude/skills/create-spec/references/bdd-enforcement.md` | create | Move from `.claude/rules/specs-workflow/bdd-enforcement.md` per [FR-6](FR.md#fr-6-source-rule-files-removed-atomically-feature4) |
| `.claude/skills/create-spec/references/no-mocks-fallbacks.md` | create | Move from `.claude/rules/specs-workflow/no-mocks-fallbacks.md` per [FR-6](FR.md#fr-6-source-rule-files-removed-atomically-feature4) |
| `.claude/skills/create-spec/references/specs-validation.md` | create | Move from `.claude/rules/specs-workflow/specs-validation.md` per [FR-6](FR.md#fr-6-source-rule-files-removed-atomically-feature4) |

## Skill files — research-workflow

| Path | Action | Reason |
|------|--------|--------|
| `.claude/skills/research-workflow/SKILL.md` | create | New standalone skill per [FR-5](FR.md#fr-5-research-workflow-extracted-as-standalone-skill-and-invoked-by-create-spec-feature5); content ported from `.claude/rules/specs-workflow/research-workflow.md` (157 lines) |

## Source rule deletions

| Path | Action | Reason |
|------|--------|--------|
| `.claude/rules/specs-workflow/specs-management.md` | delete | Replaced by `create-spec` skill per [FR-6](FR.md#fr-6-source-rule-files-removed-atomically-feature4); content split across SKILL.md + references/ |
| `.claude/rules/specs-workflow/no-mocks-fallbacks.md` | delete | Moved to `create-spec/references/no-mocks-fallbacks.md` per [FR-6](FR.md#fr-6-source-rule-files-removed-atomically-feature4) |
| `.claude/rules/specs-workflow/research-workflow.md` | delete | Promoted to standalone `research-workflow` skill per [FR-5](FR.md#fr-5-research-workflow-extracted-as-standalone-skill-and-invoked-by-create-spec-feature5), [FR-6](FR.md#fr-6-source-rule-files-removed-atomically-feature4) |
| `.claude/rules/specs-workflow/specs-validation.md` | delete | Moved to `create-spec/references/specs-validation.md` per [FR-6](FR.md#fr-6-source-rule-files-removed-atomically-feature4); hook code unaffected per [FR-11](FR.md#fr-11-specs-validation-hook-unaffected-by-migration-feature4) |
| `.claude/rules/specs-workflow/bdd-enforcement.md` | delete | Moved to `create-spec/references/bdd-enforcement.md` per [FR-6](FR.md#fr-6-source-rule-files-removed-atomically-feature4) (was unmanaged — net gain for end users) |
| `.claude/rules/specs-workflow/undefined-behavior-taxonomy.md` | delete | Inlined into `create-spec/references/phase3plus_audit-undefined-behavior.md` per [FR-6](FR.md#fr-6-source-rule-files-removed-atomically-feature4), Decision 5 (was unmanaged — net gain) |

## Manifest + glossary

| Path | Action | Reason |
|------|--------|--------|
| `extensions/specs-workflow/extension.json` | edit | Set `ruleFiles.claude=[]`; add `skills["research-workflow"]`; populate `skillFiles` with all 21 paths (SKILL.md + 19 references + research-workflow SKILL.md); bump `version` per [FR-7](FR.md#fr-7-extensionjson-manifest-updated-atomically-feature4) |
| `CLAUDE.md` | edit | Remove 4 rows from "Triggered" rules table referencing deleted manifest-managed rules per [FR-8](FR.md#fr-8-claudemd-glossary-synced-with-new-skill-layout-feature4) |

## Tests + features

| Path | Action | Reason |
|------|--------|--------|
| `tests/features/plugins/specs-workflow/PLUGIN003_specs-workflow.feature` | edit | Add scenarios for hard-cutover migration FR-4, FR-6, FR-7; research-workflow skill registration FR-5; token efficiency FR-13. Existing scenario "Skill file is installed for Claude Code" stays (still relevant). Stale Cursor scenarios at lines 22-25 NOT touched (FR-12 OUT OF SCOPE) |
| ~~`tests/e2e/specs-management-skill-migration.test.ts`~~ → skill `.claude/skills/create-spec/` + `tests/e2e/create-specs-bdd-enforcement.test.ts` | create | Integration test driving FR-4 / FR-6 / FR-7 / FR-11 verification via `runInstaller(updateMode=true)` + assertions on file state. Uses existing `tests/e2e/helpers.ts` |
| `tests/fixtures/specs-management-as-skill/sample-spec/USER_STORIES.md` | create | F-2 fixture for SPECMGT001_09 hook validation test per [FR-11](FR.md#fr-11-specs-validation-hook-unaffected-by-migration-feature4) |
| `tests/fixtures/specs-management-as-skill/sample-spec/FR.md` | create | F-2 fixture per [FR-11](FR.md#fr-11-specs-validation-hook-unaffected-by-migration-feature4) |
| `tests/fixtures/specs-management-as-skill/sample-spec/ACCEPTANCE_CRITERIA.md` | create | F-2 fixture per [FR-11](FR.md#fr-11-specs-validation-hook-unaffected-by-migration-feature4) |
| `tests/fixtures/specs-management-as-skill/sample-spec/sample-feature.feature` | create | F-2 fixture (BDD scenario with @feature1 tag) per [FR-11](FR.md#fr-11-specs-validation-hook-unaffected-by-migration-feature4) |

## Spec self-deliverables (THIS spec)

| Path | Action | Reason |
|------|--------|--------|
| `.specs/specs-management-as-skill/USER_STORIES.md` | create | Phase 1 Discovery — user stories in v3 format |
| `.specs/specs-management-as-skill/USE_CASES.md` | create | Phase 1 Discovery — 6 use cases |
| `.specs/specs-management-as-skill/RESEARCH.md` | create | Phase 1 Discovery + Phase 1.5 Project Context |
| `.specs/specs-management-as-skill/FR.md` | create | Phase 2 — 13 functional requirements |
| `.specs/specs-management-as-skill/NFR.md` | create | Phase 2 — Performance/Security/Reliability/Usability/Maintainability/Migration NFRs |
| `.specs/specs-management-as-skill/ACCEPTANCE_CRITERIA.md` | create | Phase 2 — EARS-format AC for each in-scope FR |
| `.specs/specs-management-as-skill/REQUIREMENTS.md` | create | Phase 2 — traceability matrix + index |
| `.specs/specs-management-as-skill/DESIGN.md` | create | Phase 2 — architecture, components, BDD Test Infrastructure, 7 Key Decisions |
| `.specs/specs-management-as-skill/FILE_CHANGES.md` | create | Phase 2 — this file |
| `.specs/specs-management-as-skill/specs-management-as-skill.feature` | create | Phase 2 — BDD scenarios with @feature1..@feature5 tags |
| `.specs/specs-management-as-skill/TASKS.md` | create | Phase 3 Finalization — TDD-ordered task plan |
| `.specs/specs-management-as-skill/README.md` | create | Phase 3 Finalization — overview + navigation |
| `.specs/specs-management-as-skill/CHANGELOG.md` | create | Phase 3 Finalization — Keep-a-Changelog |

## Impact Analysis (delete + edit operations)

Performed via grep for each deleted/renamed path:

| Keyword | Files Found | Action in Plan |
|---------|-------------|----------------|
| `specs-management.md` | `CLAUDE.md` (table row), `extension.json` (ruleFiles), `.claude/rules/specs-workflow/specs-management.md` (the file itself), `.claude/skills/create-spec/SKILL.md` (line 60-64 reference) | edit CLAUDE.md, edit extension.json, delete file, edit SKILL.md |
| `no-mocks-fallbacks.md` | `extension.json`, `.claude/rules/specs-workflow/no-mocks-fallbacks.md` | edit extension.json, delete file |
| `research-workflow.md` | `extension.json`, `CLAUDE.md`, `.claude/rules/specs-workflow/research-workflow.md`, `.claude/rules/specs-workflow/specs-management.md:665` (related rules section) | edit extension.json, edit CLAUDE.md, delete file (specs-management.md will be deleted anyway) |
| `specs-validation.md` | `extension.json`, `CLAUDE.md`, `.claude/rules/specs-workflow/specs-validation.md` | edit extension.json, edit CLAUDE.md, delete file |
| `bdd-enforcement.md` | `.claude/rules/specs-workflow/bdd-enforcement.md` (only — unmanaged) | delete file (no manifest entry to update) |
| `undefined-behavior-taxonomy.md` | `.claude/rules/specs-workflow/undefined-behavior-taxonomy.md`, `.claude/rules/specs-workflow/specs-management.md:561` (referenced by audit category) | delete file, content inlined into `phase3plus_audit-undefined-behavior.md` |

[excluded: `tests/features/plugins/specs-workflow/PLUGIN003_specs-workflow.feature:22-25` — stale Cursor scenarios are pre-existing tech debt, FR-12 OUT OF SCOPE]

[excluded: `.specs/*/RESEARCH.md` historical research mentions of these rules — historical research, not code]
