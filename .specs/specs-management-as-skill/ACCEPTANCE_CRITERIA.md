# Acceptance Criteria (EARS)

## AC-1 (FR-1) @feature1

**Требование:** [FR-1](FR.md#fr-1-skill-structure-with-progressive-disclosure-feature1)

WHEN the migration is complete THEN the system SHALL contain `.claude/skills/create-spec/SKILL.md` ≤200 lines AND `.claude/skills/create-spec/references/` directory with phase reference files.

WHEN any reference file is read THEN the system SHALL contain no nested `references/` links to siblings (one-level-deep enforced) EXCEPT `phase3plus_audit-overview.md` which links to its category siblings.

---

## AC-2 (FR-2) @feature2

**Требование:** [FR-2](FR.md#fr-2-reference-file-naming-convention-phasen-m_descriptive-feature2)

IF a reference file is bound to a workflow phase THEN its filename SHALL match `phase[0-9]+(\.[0-9]+)?_[a-z][a-z0-9-]+\.md`.

IF a reference file is not phase-bound (e.g., `feature-creation-rules.md`, `jira-mode.md`, `validation-rules.md`) THEN it SHALL match `[a-z][a-z0-9-]+\.md` without phase prefix.

---

## AC-3 (FR-3) @feature3

**Требование:** [FR-3](FR.md#fr-3-phase-3-audit-categories-split-into-separate-files-feature3)

WHEN agent enters Phase 3+ Audit THEN the system SHALL provide an entry-point file `references/phase3plus_audit-overview.md` containing a category dispatch table.

WHEN agent works on category "Errors" THEN it SHALL read only `references/phase3plus_audit-errors.md` (and not the other 6 category files).

WHEN audit completes THEN at minimum 7 category files SHALL exist: `phase3plus_audit-errors.md`, `phase3plus_audit-logic-gaps.md`, `phase3plus_audit-inconsistency.md`, `phase3plus_audit-rudiments.md`, `phase3plus_audit-fantasies.md`, `phase3plus_audit-undefined-behavior.md`, `phase3plus_audit-jira-drift.md`.

---

## AC-4 (FR-4) @feature4

**Требование:** [FR-4](FR.md#fr-4-hard-cutover-migration-via-installer-feature4)

WHEN user runs `dev-pomogator update` against a project with old layout (rules present) THEN the system SHALL remove all 4 paths `.claude/rules/specs-workflow/specs-management.md`, `no-mocks-fallbacks.md`, `research-workflow.md`, `specs-validation.md` AND install `.claude/skills/create-spec/` AND `.claude/skills/research-workflow/`.

WHEN update completes THEN no `.cursor/rules/*.mdc` files SHALL be created or modified by this extension AND no compatibility shims SHALL exist.

IF user has modified a managed rule file before update THEN the system SHALL back up the modified copy to `.dev-pomogator/.user-overrides/` per `updater-managed-cleanup` rule before deletion.

---

## AC-5 (FR-5) @feature5

**Требование:** [FR-5](FR.md#fr-5-research-workflow-extracted-as-standalone-skill-feature5)

WHEN user issues a research prompt ("исследуй X", "find Y", "погугли Z") OUTSIDE a spec context THEN the system SHALL trigger `research-workflow` skill independently.

WHEN `research-workflow` skill body is read THEN it SHALL contain all 4 phases (Уточнение / Исследование / Верификация / Отчёт) of the original research workflow.

IF user is mid-spec and asks for research THEN both skills MAY be active simultaneously (no exclusivity required).

WHEN `create-spec` SKILL.md is read THEN it SHALL contain at least one explicit reference to invoking `Skill("research-workflow")` during Phase 1 step 5 (RESEARCH.md filling).

WHEN `references/phase1_discovery.md` is read THEN it SHALL document calling `Skill("research-workflow")` as a sub-step before filling RESEARCH.md technical findings.

---

## AC-6 (FR-6) @feature4

**Требование:** [FR-6](FR.md#fr-6-source-rule-files-removed-atomically-feature4)

WHEN migration commit is applied THEN `git show <commit> --stat -- .claude/rules/specs-workflow/` SHALL show 6 deletions: `specs-management.md`, `no-mocks-fallbacks.md`, `research-workflow.md`, `specs-validation.md`, `bdd-enforcement.md`, `undefined-behavior-taxonomy.md`.

WHEN content audit is performed THEN every section/rule from the 6 source files SHALL be located in either a `references/*.md` (`create-spec` skill) or in `research-workflow/SKILL.md` (no content lost).

---

## AC-7 (FR-7) @feature4

**Требование:** [FR-7](FR.md#fr-7-extensionjson-manifest-updated-atomically-feature4)

WHEN `extension.json` is read after migration THEN `ruleFiles.claude.length === 0` AND `skills["create-spec"] === ".claude/skills/create-spec"` AND `skills["research-workflow"] === ".claude/skills/research-workflow"`.

WHEN `skillFiles["create-spec"]` is read THEN it SHALL list `.claude/skills/create-spec/SKILL.md` plus every file in `.claude/skills/create-spec/references/`.

WHEN `extension-json-meta-guard.ts` is run on the migrated `extension.json` THEN it SHALL exit with code 0 (no manifest integrity errors).

WHEN `version` is checked in migration commit diff THEN the value SHALL be incremented (semver minor or patch).

---

## AC-8 (FR-8) @feature4

**Требование:** [FR-8](FR.md#fr-8-claudemd-glossary-synced-with-new-skill-layout-feature4)

WHEN `CLAUDE.md` is grepped for the 4 manifest-managed rule paths AFTER migration THEN no matches SHALL be found within the Triggered/Always-apply rule tables.

WHEN `CLAUDE.md` Commands table is read THEN no rows SHALL reference paths under `.claude/rules/specs-workflow/`.

---

## AC-9 (FR-9) @feature5

**Требование:** [FR-9](FR.md#fr-9-skill-description-preserves-all-trigger-phrases-feature5)

WHEN frontmatter `description` of `create-spec/SKILL.md` is parsed THEN `description.length ≤ 1024`.

WHEN description text is searched THEN it SHALL contain ≥6 English creation triggers (`create / make / draft / write / sketch / outline / spec out`) AND ≥5 Russian creation triggers (`создай / сделай / набросай / напиши / опиши`) AND ≥1 negative scope statement (`Do NOT use for plan-pomogator`).

---

## AC-10 (FR-10) @feature5

**Требование:** [FR-10](FR.md#fr-10-allowed-tools-covers-full-workflow-feature5)

WHEN `allowed-tools` of `create-spec/SKILL.md` is parsed THEN it SHALL include all of: `Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion, Skill, Agent, WebFetch, WebSearch`.

WHEN `allowed-tools` of `research-workflow/SKILL.md` is parsed THEN it SHALL include all of: `Read, Glob, Grep, WebFetch, WebSearch`.

---

## AC-11 (FR-11) @feature4

**Требование:** [FR-11](FR.md#fr-11-specs-validation-hook-unaffected-by-migration-feature4)

WHEN `specs-validator/validate-specs.ts` is grepped for path `.claude/rules/specs-workflow/specs-validation.md` THEN no matches SHALL be found.

WHEN UserPromptSubmit hook runs against an unchanged `.specs/some-feature/` folder before migration AND after migration THEN `validation-report.md` content SHALL be byte-identical (modulo timestamps).

WHEN any of the 7 PreToolUse guard hooks runs against valid input before migration AND after migration THEN exit codes and stderr SHALL match.

---

## AC-12 (FR-12) — OUT OF SCOPE

> OUT OF SCOPE — см. [FR-12](FR.md#fr-12-cursor-support--out-of-scope). Cursor support was previously removed from dev-pomogator. No acceptance criteria required.

---

## AC-13 (FR-13) @feature1

**Требование:** [FR-13](FR.md#fr-13-token-efficiency-floor-for-non-spec-sessions-feature1)

WHEN a Claude Code session is started in a project with the migrated state AND no spec-creation prompts are issued THEN system prompt token count attributable to specs skills (sum of `name` + `description` + `allowed-tools` for 5 skills) SHALL be ≤500 tokens (measured via tiktoken or equivalent tokenizer).

WHEN agent is in active Phase 2 (Requirements + Design) of a spec THEN total tokens loaded from skills+references SHALL be ≤4000 tokens.

WHEN agent is in active Phase 3+ Audit working on one category THEN total tokens loaded SHALL be ≤5500 tokens (SKILL.md + audit-overview + one category file).
