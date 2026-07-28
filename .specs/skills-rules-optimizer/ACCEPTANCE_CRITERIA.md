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

## AC-12 (FR-12)

**Требование:** [FR-12](FR.md#fr-12-shipped-dependency-free-checker-and-shared-gates)

WHEN source CI, the release gate, and an installed plugin tree with its `node_modules` directory absent verify skill health THEN each SHALL invoke `tools/skill-health/check.mjs` and the installed run SHALL complete without resolving a non-`node:` dependency.

## AC-13 (FR-13)

**Требование:** [FR-13](FR.md#fr-13-strict-frontmatter-parser-and-metadata-contract)

IF a SKILL.md contains unterminated or malformed YAML/frontmatter, or omits a required `name`, `description`, or `allowed-tools` value, THEN the checker SHALL emit the relevant structured frontmatter finding and SHALL NOT represent that document as valid empty metadata.

## AC-14 (FR-14)

**Требование:** [FR-14](FR.md#fr-14-active-tool-permission-coverage-with-false-positive-pins)

WHEN an executable instruction actively calls `Skill(...)`, `Agent(...)`, or `mcp__server__tool(...)` without the exact declared permission THEN the checker SHALL emit `ALLOWED_TOOLS_MISSING`; WHEN the same names occur only in negated prose, bare prose, or generic examples THEN it SHALL emit no such finding.

## AC-15 (FR-15)

**Требование:** [FR-15](FR.md#fr-15-local-reference-integrity-and-root-containment)

WHEN a statically resolvable local Markdown reference is inspected THEN an existing contained target SHALL pass, a missing target SHALL produce `LOCAL_REFERENCE_MISSING`, and a traversal outside the plugin root SHALL produce `REFERENCE_ESCAPES_ROOT`.

## AC-16 (FR-16)

**Требование:** [FR-16](FR.md#fr-16-deterministic-report-and-strict-modes)

WHEN unchanged input is checked twice in text and JSON modes THEN the output SHALL be byte-identical and deterministically ordered; `--report` SHALL exit zero after reporting findings, while `--strict` SHALL exit non-zero only when an unbaselined error remains.

## AC-17 (FR-17)

**Требование:** [FR-17](FR.md#fr-17-exact-fingerprint-baseline)

IF a baseline entry exactly matches a finding path, finding code, and content fingerprint THEN the finding SHALL be marked baselined; IF any member differs, or the entry uses a wildcard or broad match, THEN the finding SHALL remain blocking or the baseline SHALL be rejected.

## AC-18 (FR-18)

**Требование:** [FR-18](FR.md#fr-18-explicit-mirror-policy)

WHEN a mirror-contract entry is evaluated THEN `exact`, `adapted`, `canonical-only`, and `legacy` SHALL each have explicit deterministic behavior, unknown modes SHALL be rejected, and an `exact` or `adapted` drift SHALL identify the canonical and mirror paths.

## AC-19 (FR-19)

**Требование:** [FR-19](FR.md#fr-19-no-prompt-lifecycle-hook-rollout)

WHEN plugin hooks and settings are inspected for this feature THEN neither `SessionStart` nor `UserPromptSubmit` SHALL register or invoke the skill-health checker.
