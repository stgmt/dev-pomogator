# Functional Requirements

## FR-1: Skill structure with progressive disclosure @feature1

The system SHALL package the specs management workflow as a single Claude Code skill at `.claude/skills/create-spec/` with:
- One `SKILL.md` ≤200 lines containing overview, navigation table, trigger phrases, and entry points
- A `references/` subdirectory containing detailed phase/category documentation
- All references one level deep from `SKILL.md` (no nested links between references, except `phase3plus_audit-overview.md` → audit category siblings which is functionally one-level)

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
**Use Case:** [UC-1](USE_CASES.md#uc-1-trigger-via-natural-language-scaffolding-request)

---

## FR-2: Reference file naming convention `phaseN[.M]_descriptive` @feature2

The system SHALL name phase-bound reference files as `phaseN[.M]_descriptive-name.md` where `N` is phase number (1, 2, 3), `.M` is optional sub-phase (e.g. `1.5`), and `descriptive-name` is kebab-case identifying the topic. Non-phase references use kebab-case without phase prefix (e.g., `feature-creation-rules.md`, `jira-mode.md`).

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
**Use Case:** [UC-2](USE_CASES.md#uc-2-resume-existing-spec-at-correct-phase)

---

## FR-3: Phase 3+ Audit categories split into separate files @feature3

The system SHALL split the Phase 3+ Audit workflow across per-category reference files: `phase3plus_audit-overview.md` (entry point + workflow steps + category dispatch), plus one file per category: `phase3plus_audit-errors.md`, `phase3plus_audit-logic-gaps.md`, `phase3plus_audit-inconsistency.md`, `phase3plus_audit-rudiments.md`, `phase3plus_audit-fantasies.md`, `phase3plus_audit-undefined-behavior.md`, `phase3plus_audit-jira-drift.md`. The audit-overview file SHALL be the only entry point referenced from `SKILL.md`.

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
**Use Case:** [UC-3](USE_CASES.md#uc-3-phase-3-audit-with-category-specific-reference-files)

---

## FR-4: Hard cutover migration via installer @feature4

The system SHALL perform hard cutover migration in a single dev-pomogator release. After update:
- `.claude/rules/specs-workflow/` SHALL NOT contain any of `specs-management.md`, `no-mocks-fallbacks.md`, `research-workflow.md`, `specs-validation.md`
- `.claude/skills/create-spec/SKILL.md` and `.claude/skills/create-spec/references/*.md` SHALL be installed
- `.claude/skills/research-workflow/SKILL.md` SHALL be installed (extracted standalone skill)
- No fallback rules, no `.cursor/`, no compatibility shims SHALL be installed
- Existing user modifications to managed files SHALL be backed up under `.dev-pomogator/.user-overrides/` per `updater-managed-cleanup`

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
**Use Case:** [UC-4](USE_CASES.md#uc-4-hard-cutover-migration-via-installer-update)

---

## FR-5: research-workflow extracted as standalone skill AND invoked by create-spec @feature5

The system SHALL relocate `.claude/rules/specs-workflow/research-workflow.md` to a new standalone skill at `.claude/skills/research-workflow/SKILL.md`. The new skill SHALL preserve all current research workflow phases (Уточнение / Исследование / Верификация / Отчёт) and SHALL include all original trigger phrases ("исследуй / найди / погугли / ресерч") in its `description` field.

Additionally, `create-spec` SKILL.md and `references/phase1_discovery.md` SHALL explicitly invoke `research-workflow` skill during Phase 1 step 5 (RESEARCH.md filling) via the `Skill("research-workflow")` tool call. The two skills are decoupled by triggers but composed by workflow — research is a sub-step of spec creation when context investigation is needed.

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)
**Use Case:** [UC-5](USE_CASES.md#uc-5-research-workflow-split--separate-skill-separate-trigger)

---

## FR-6: Source rule files removed atomically @feature4

The system SHALL physically delete in the migration commit: `specs-management.md` (669 lines), `no-mocks-fallbacks.md` (25), `research-workflow.md` (157), `specs-validation.md` (68), `bdd-enforcement.md` (57), `undefined-behavior-taxonomy.md` (170) — all from `.claude/rules/specs-workflow/`. Content SHALL be preserved in the appropriate destination (`references/*.md` of `create-spec` skill or `research-workflow` skill SKILL.md).

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)
**Use Case:** [UC-4](USE_CASES.md#uc-4-hard-cutover-migration-via-installer-update)

---

## FR-7: extension.json manifest updated atomically @feature4

The system SHALL update `extensions/specs-workflow/extension.json` in a single atomic Write:
- `ruleFiles.claude` SHALL be `[]`
- `skills` SHALL include `"create-spec": ".claude/skills/create-spec"` and `"research-workflow": ".claude/skills/research-workflow"`
- `skillFiles["create-spec"]` SHALL list `SKILL.md` plus every file in `references/`
- `skillFiles["research-workflow"]` SHALL list `SKILL.md`
- `version` SHALL be bumped (semver minor)
- `extension-json-meta-guard` PreToolUse hook SHALL pass on the result

**Связанные AC:** [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)
**Use Case:** [UC-4](USE_CASES.md#uc-4-hard-cutover-migration-via-installer-update)

---

## FR-8: CLAUDE.md glossary synced with new skill layout @feature4

The system SHALL update `CLAUDE.md` (project root) in the same migration commit:
- Remove rows from "Triggered" rules table referencing `specs-management.md`, `no-mocks-fallbacks.md`, `research-workflow.md`, `specs-validation.md`
- The Commands table SHALL NOT reference removed rule paths
- No new rows added (skills are not listed in CLAUDE.md per existing `claude-md-glossary` convention)

**Связанные AC:** [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8)
**Use Case:** [UC-4](USE_CASES.md#uc-4-hard-cutover-migration-via-installer-update)

---

## FR-9: Skill `description` preserves all trigger phrases @feature5

The `description` field of `.claude/skills/create-spec/SKILL.md` frontmatter SHALL be ≤1024 characters AND include canonical English creation triggers (`create / make / draft / write / sketch / outline / spec out`), Russian creation triggers (`создай / сделай / набросай / напиши / опиши / нужна спека`), update/view triggers (`update / show / status` + `обнови / покажи / статус`), explicit negative scope (NOT for `plan-pomogator`, NOT for read-only existing spec ops), and SHALL be in third person.

**Связанные AC:** [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9)
**Use Case:** [UC-1](USE_CASES.md#uc-1-trigger-via-natural-language-scaffolding-request)

---

## FR-10: `allowed-tools` covers full workflow @feature5

The frontmatter `allowed-tools` field of `.claude/skills/create-spec/SKILL.md` SHALL list every tool the workflow invokes: `Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion, Skill, Agent, WebFetch, WebSearch`. The `research-workflow` skill `allowed-tools` SHALL include `Read, Glob, Grep, WebFetch, WebSearch`.

**Связанные AC:** [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10)
**Use Case:** [UC-1](USE_CASES.md#uc-1-trigger-via-natural-language-scaffolding-request)

---

## FR-11: specs-validation hook unaffected by migration @feature4

The `UserPromptSubmit` hook (`validate-specs.ts`) and all PreToolUse guard hooks (`phase-gate`, `user-story-form-guard`, `task-form-guard`, `design-decision-guard`, `requirements-chk-guard`, `risk-assessment-guard`, `extension-json-meta-guard`) SHALL produce identical findings (modulo timestamps) before vs after migration on identical `.specs/` content. Hook code SHALL NOT depend on `.claude/rules/specs-workflow/specs-validation.md` (verified pre-migration via source-code audit).

**Связанные AC:** [AC-11](ACCEPTANCE_CRITERIA.md#ac-11-fr-11)
**Use Case:** [UC-6](USE_CASES.md#uc-6-specs-validation-hook-validates-without-rule-file-dependency)

---

## FR-12: Cursor support — OUT OF SCOPE

> OUT OF SCOPE — Cursor support was previously removed from dev-pomogator (per user statement "курсора поддержки нету. была, выпиливали"). No `.mdc` artifacts SHALL be generated; no `.cursor/` paths appear in FILE_CHANGES.md. Stale `Scenario: Rules are installed for Cursor` block in `tests/features/plugins/specs-workflow/PLUGIN003_specs-workflow.feature:22-25` is acknowledged pre-existing technical debt and is NOT addressed by this refactor (separate cleanup).

**Связанные User Stories:** все марки за `Cursor` в USER_STORIES помечаются `> OUT OF SCOPE — см. FR-12` если возникнут

---

## FR-13: Token efficiency floor for non-spec sessions @feature1

When a Claude Code session does NOT reference specs work, the system prompt SHALL contain ≤500 tokens of specs-related content (skill metadata only — `name` + `description` + `allowed-tools` for `create-spec`, `research-workflow`, `discovery-forms`, `requirements-chk-matrix`, `task-board-forms`).

**Связанные AC:** [AC-13](ACCEPTANCE_CRITERIA.md#ac-13-fr-13)
**Use Case:** [UC-2](USE_CASES.md#uc-2-resume-existing-spec-at-correct-phase)
