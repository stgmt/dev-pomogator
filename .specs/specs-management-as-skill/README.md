# Specs Management As Skill

Migrate the 670-line `specs-management.md` rule (currently auto-loaded into every Claude Code session, costing ~10k tokens) to a properly-structured `create-spec` skill with progressive disclosure via `references/` subdirectory. Target: 97% startup token reduction for non-spec sessions; 60% reduction during active spec work.

## Ключевые идеи

- One Claude Code skill `create-spec` (≤200-line `SKILL.md` + 19 reference files in `references/`) replaces the giant always-on rule. Skill metadata loads at startup; body loads only when user triggers spec work; per-phase reference files load only when that phase is active.
- Phase-bound reference files use naming `phaseN[.M]_descriptive-name.md` so file listing reads as workflow order. Phase 3+ Audit categories (Errors / Logic Gaps / Inconsistency / Rudiments / Fantasies / Undefined Behavior / Jira Drift) are split into 7 sibling files for category-isolated loading.
- `research-workflow` is extracted as a standalone skill with its own triggers (`исследуй / найди / погугли / ресерч`) AND is invoked by `create-spec` via `Skill("research-workflow")` during Phase 1 step 5 (RESEARCH.md filling). Skill composition pattern matches existing `discovery-forms`, `requirements-chk-matrix`, `task-board-forms` sub-skill ecosystem.
- Hard-cutover migration in single dev-pomogator release: 6 source rule files deleted from `.claude/rules/specs-workflow/`, skill installed atomically via existing `updater-managed-cleanup` + `updater-sync-tools-hooks` mechanisms. No backwards-compat shims, no Cursor support (Cursor was previously removed from dev-pomogator).
- `specs-validator` UserPromptSubmit hook unaffected — hook reads `.specs/` data files directly, never depended on the rule file. Pre-migration source-code audit confirms zero references to `.claude/rules/specs-workflow/specs-validation.md` in hook code.

## Где лежит реализация

- **Skill (new)**: `.claude/skills/create-spec/SKILL.md` (overview ≤200 lines) + `.claude/skills/create-spec/references/*.md` (19 detailed files)
- **Standalone research skill (new)**: `.claude/skills/research-workflow/SKILL.md`
- **Manifest**: `extensions/specs-workflow/extension.json` — `ruleFiles.claude=[]`, `skills`/`skillFiles` extended
- **Glossary**: `CLAUDE.md` — 4 rule rows removed from "Triggered" table
- **Source files (deleted)**: 6 files in `.claude/rules/specs-workflow/`
- **Tests**: `tests/features/plugins/specs-workflow/PLUGIN003_specs-workflow.feature` (extended with SPECMGT001_* scenarios) + new `tests/e2e/specs-management-skill-migration.test.ts`

## Где читать дальше

- [USER_STORIES.md](USER_STORIES.md) — 4 user stories с Priority + Why + Independent Test + Acceptance Scenarios
- [USE_CASES.md](USE_CASES.md) — 6 use cases (trigger, resume, audit, migration, research split, hook stability)
- [RESEARCH.md](RESEARCH.md) — Anthropic best practices, scope expansion finding, Risk Assessment table, Project Context
- [REQUIREMENTS.md](REQUIREMENTS.md) — traceability matrix
- [FR.md](FR.md) — 13 functional requirements (FR-12 = OUT OF SCOPE Cursor)
- [NFR.md](NFR.md) — Performance/Security/Reliability/Usability/Maintainability/Migration NFRs
- [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) — EARS-format AC
- [DESIGN.md](DESIGN.md) — architecture, file layout, BDD Test Infrastructure, 7 Key Decisions
- [FILE_CHANGES.md](FILE_CHANGES.md) — 41 file changes with Impact Analysis
- [FIXTURES.md](FIXTURES.md) — 5 test fixtures + dependency graph + gap analysis
- [TASKS.md](TASKS.md) — TDD-ordered task plan (Phase 0 Red → Phases 1-7 Green → Phase 8 Refactor)
- [specs-management-as-skill.feature](specs-management-as-skill.feature) — 14 BDD scenarios (SPECMGT001_01..14)
