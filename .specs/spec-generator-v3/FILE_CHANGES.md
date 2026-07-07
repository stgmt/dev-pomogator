# File Changes

Список файлов, которые будут добавлены/изменены при реализации spec-generator-v3.

См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

| Path | Action | Reason |
|------|--------|--------|
| `extensions/specs-workflow/extension.json` | edit | v1.17.0 bump + 3 skills + 8 toolFiles + hooks array-of-groups с 7 entries (phase-gate + 6 form-guards) |
| `extensions/specs-workflow/CHANGELOG.md` | edit | New 1.17.0 entry описывающий spec-generator-v3 feature |
| `extensions/specs-workflow/.claude/skills/discovery-forms/SKILL.md` | create | Phase 1 child skill — USER_STORIES v3 form + RESEARCH Risk Assessment |
| `extensions/specs-workflow/.claude/skills/requirements-chk-matrix/SKILL.md` | create | Phase 2 child skill — CHK matrix + Verification Process + Key Decisions |
| `extensions/specs-workflow/.claude/skills/task-board-forms/SKILL.md` | create | Phase 3 child skill — Done When + Status/Est + Summary Table |
| `extensions/specs-workflow/tools/specs-validator/spec-form-parsers.ts` | create | 5 shared regex parsers (module-cached) + extractSpecInfo + extractWriteContent helpers |
| `extensions/specs-workflow/tools/specs-validator/audit-logger.ts` | create | Append-only writer + readRecentEvents + summarizeRecent + rotateLog |
| `extensions/specs-workflow/tools/specs-validator/user-story-form-guard.ts` | create | PreToolUse hook USER_STORIES.md form enforcement |
| `extensions/specs-workflow/tools/specs-validator/task-form-guard.ts` | create | PreToolUse hook TASKS.md Done When/Status/Est enforcement |
| `extensions/specs-workflow/tools/specs-validator/design-decision-guard.ts` | create | PreToolUse hook DESIGN.md Key Decisions Alternatives enforcement |
| `extensions/specs-workflow/tools/specs-validator/requirements-chk-guard.ts` | create | PreToolUse hook REQUIREMENTS.md CHK matrix format enforcement |
| `extensions/specs-workflow/tools/specs-validator/risk-assessment-guard.ts` | create | PreToolUse hook RESEARCH.md Risk Assessment ≥2 rows enforcement |
| `extensions/specs-workflow/tools/specs-validator/extension-json-meta-guard.ts` | create | Meta-guard blocks form-guard removal from extension.json / settings.local.json |
| `extensions/specs-workflow/tools/specs-validator/phase-constants.ts` | edit | Add getProgressVersion + isV3Spec + PROGRESS_SCHEMA_VERSION constant |
| `extensions/specs-workflow/tools/specs-validator/validate-specs.ts` | edit | Import audit-logger + renderFormGuardsSummary function + integration in main() |
| `extensions/specs-workflow/tools/specs-generator/specs-generator-core.mjs` | edit | Add 'task-table' to SUPPORTED_FORMATS + parseTasksForTable + renderTaskTable + task-table branch in commandSpecStatus + stamp version:3 в createDefaultProgressState |
| `extensions/specs-workflow/tools/specs-generator/templates/USER_STORIES.md.template` | edit | v3 form: ### User Story N (Priority: Pn) + Why + IT + Acceptance Scenarios examples |
| `extensions/specs-workflow/tools/specs-generator/templates/TASKS.md.template` | edit | ## Task Summary Table auto-gen markers + Done When/Status/Est on example tasks |
| `extensions/specs-workflow/tools/specs-generator/templates/REQUIREMENTS.md.template` | edit | ## Verification Matrix CHK table + Verification Process + Summary Counts sections |
| `extensions/specs-workflow/tools/specs-generator/templates/DESIGN.md.template` | edit | ## Key Decisions section перед BDD Test Infrastructure с example Decision block |
| `extensions/specs-workflow/tools/specs-generator/templates/RESEARCH.md.template` | edit | ## Risk Assessment table с 2 placeholder rows |
| `.claude/rules/specs-workflow/specs-management.md` | edit | Phase 1 step 3 → Skill("discovery-forms"); Phase 2 step 4b → Skill("requirements-chk-matrix"); Phase 3 step 1b → Skill("task-board-forms") |
| `.specs/spec-generator-v3/README.md` | create | Dogfood — overview |
| `.specs/spec-generator-v3/USER_STORIES.md` | create | Dogfood v3 format US-1..US-6 |
| `.specs/spec-generator-v3/USE_CASES.md` | create | UC-1..UC-6 + Edge Cases |
| `.specs/spec-generator-v3/RESEARCH.md` | create | Context + Risk Assessment table |
| `.specs/spec-generator-v3/REQUIREMENTS.md` | create | CHK matrix + Verification Process + Summary |
| `.specs/spec-generator-v3/FR.md` | create | FR-1..FR-16 |
| `.specs/spec-generator-v3/NFR.md` | create | Performance/Security/Reliability/Usability |
| `.specs/spec-generator-v3/ACCEPTANCE_CRITERIA.md` | create | AC-1..AC-10 EARS format |
| `.specs/spec-generator-v3/DESIGN.md` | create | Components + Algorithm + Key Decisions + BDD Test Infrastructure |
| `.specs/spec-generator-v3/TASKS.md` | create | Task Summary Table + TDD phases enriched |
| `.specs/spec-generator-v3/FILE_CHANGES.md` | create | Этот файл |
| `.specs/spec-generator-v3/CHANGELOG.md` | create | Initial v0.1.0 |
| `.specs/spec-generator-v3/spec-generator-v3.feature` | create | 28 BDD scenarios (SPECGEN003_01..28) |
| `.specs/spec-generator-v3/.progress.json` | create | `version: 3` stamped by scaffold-spec.ts |
| `tests/e2e/spec-generator-v3.test.ts` | create | vitest translator для 28 scenarios |
