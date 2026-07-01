# Acceptance Criteria (EARS)

## AC-1 (FR-1)

**Требование:** [FR-1](FR.md#fr-1-audit-skills-directory)

WHEN user invokes `audit.ts --dir .claude/skills` THEN system SHALL emit JSON output containing keys `totalSkills`, `withErrors[]`, `withWarnings[]`, `overlaps[]`, `details[]`.

## AC-2 (FR-2)

**Требование:** [FR-2](FR.md#fr-2-frontmatter-validation-per-anthropic-spec)

IF SKILL.md frontmatter contains `name: "Claude Helper"` (matches forbidden token "claude") THEN audit-skills.ts SHALL emit error finding `{ code: "FRONTMATTER_NAME_FORBIDDEN_TOKEN", path, value: "Claude Helper" }`.

## AC-3 (FR-3)

**Требование:** [FR-3](FR.md#fr-3-allowed-tools-coverage-check)

WHEN SKILL.md body contains tool invocation `Skill("research-workflow")` AND frontmatter `allowed-tools` does not contain `Skill` THEN audit-skills.ts SHALL emit error finding `{ code: "ALLOWED_TOOLS_MISSING", path, missing: ["Skill"] }`.

## AC-4 (FR-4)

**Требование:** [FR-4](FR.md#fr-4-triple-axis-overlap-detection)

WHEN any pair of skills has Jaccard score ≥ 0.3 на trigger phrases axis THEN detect-overlap.ts SHALL emit pair в `overlaps[]` со записью `{ a, b, axis: "trigger", similarity, recommendation }`.

## AC-5 (FR-5)

**Требование:** [FR-5](FR.md#fr-5-llm-merge-synthesis-через-sub-agent)

WHEN user invokes `merge-skills.ts --execute <a> <b> --merged-name <m>` THEN script SHALL emit JSON envelope в stdout с keys `action: "invoke-agent"`, `subagent_type: "general-purpose"`, `prompt`, `continuation`, AND prompt SHALL contain bodies обоих SKILL.md files.

## AC-6 (FR-6)

**Требование:** [FR-6](FR.md#fr-6-ratchet-scorer-regression-prevention)

WHEN ratchet scorer returns `score_merged < score_originals` AND no `--force` flag is set THEN system SHALL output `{ regression: true, shouldRevert: true }` AND main turn SHALL delete `<merged-name>/SKILL.md` без apply.

## AC-7 (FR-7)

**Требование:** [FR-7](FR.md#fr-7-preserve-originals-no-auto-delete)

WHEN merge-skills.ts succeeds AND ratchet passes THEN original directories `.claude/skills/<a>/` AND `.claude/skills/<b>/` SHALL remain on disk untouched, AND output SHALL contain `cleanup_suggestions: ["rm -rf .claude/skills/<a> .claude/skills/<b>"]`.

## AC-8 (FR-9)

**Требование:** [FR-9](FR.md#fr-9-backward-compatibility-для-rules-side)

WHEN `/suggest-rules` Phase 6 invokes `audit.ts --dir .claude/rules --save audit_before.json` (старая команда c обновлённым skill path) THEN output JSON SHALL be byte-identical to current rules-optimizer behaviour (totalFiles, totalTokens, withPaths, withoutPaths, mergeCandidates, antipatternFiles).

## Out of Scope: FR-10 deferred to v0.2.0

**Требование:** [FR-10](FR.md#fr-10-embedding-based-semantic-merge-out-of-scope)

> OUT OF SCOPE — см. FR-10. Embedding-based semantic merge откладывается до v0.2.0; в v0.1.0 Jaccard + LLM judge sufficient.

## Out of Scope: FR-11 design choice never

**Требование:** [FR-11](FR.md#fr-11-auto-apply-без-human-review-out-of-scope)

> OUT OF SCOPE — см. FR-11. Auto-apply без `--execute` flag — намеренный design choice ради safety, never implementing.
