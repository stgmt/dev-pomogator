Feature: SRO001_Skills_Rules_Optimizer

  Background:
    Given dev-pomogator установлен
    And `.claude/skills/skills-rules-optimizer/scripts/` содержит audit.ts, audit-skills.ts, detect-overlap.ts, merge-skills.ts, verify-merge.ts
    And `tests/fixtures/skills-rules-optimizer/` содержит test fixtures

  # @feature1 — FR-1 audit happy path
  Scenario: SRO002_audit_skills_emits_structured_json
    Given `.claude/skills/` содержит 5 valid skills (frontmatter ОК, body ОК)
    When user runs `audit.ts --dir .claude/skills`
    Then exit code 0
    And stdout содержит valid JSON
    And JSON.totalSkills == 5
    And JSON содержит keys "withErrors", "withWarnings", "overlaps", "details"

  # @feature2 — FR-2 forbidden token в name
  Scenario: SRO003_frontmatter_name_forbidden_token
    Given fixture `tests/fixtures/skills-rules-optimizer/claude-in-name/SKILL.md` с frontmatter `name: "Claude Helper"`
    When user runs `audit-skills.ts --dir <fixture>`
    Then JSON.withErrors содержит entry с code "FRONTMATTER_NAME_FORBIDDEN_TOKEN"
    And error.value == "Claude Helper"

  # @feature3 — FR-3 allowed-tools coverage
  Scenario: SRO004_allowed_tools_missing_skill_token
    Given fixture с frontmatter `allowed-tools: Read, Write` и body содержит `Skill("research-workflow")`
    When user runs `audit-skills.ts --dir <fixture>`
    Then JSON.withErrors содержит entry с code "ALLOWED_TOOLS_MISSING"
    And error.missing == ["Skill"]

  # @feature4 — FR-4 triple-axis Jaccard
  Scenario: SRO005_triple_axis_jaccard_overlap_detected
    Given fixture pair `overlap-pair/{a,b}/SKILL.md` с overlapping trigger phrases (Jaccard >= 0.45)
    When user runs `detect-overlap.ts --dir <fixtures>`
    Then JSON.overlaps содержит entry `{a: "a", b: "b", axis: "trigger", similarity: >= 0.3}`

  # @feature5 — FR-5 merge envelope
  Scenario: SRO006_merge_emits_invoke_agent_envelope
    Given two skill fixtures `a` и `b` с valid SKILL.md
    When user runs `merge-skills.ts --execute a b --merged-name ab`
    Then stdout содержит valid JSON envelope
    And envelope.action == "invoke-agent"
    And envelope.subagent_type == "general-purpose"
    And envelope.prompt содержит body обоих SKILL.md
    And envelope.continuation начинается с "verify-merge.ts --merged"

  # @feature6 — FR-6 ratchet detects regression
  Scenario: SRO007_ratchet_revert_on_regression
    Given merged SKILL.md draft с invalid frontmatter (missing `name:` field)
    And originals A и B с valid frontmatter
    When verify-merge.ts emits scorer envelope
    And scorer Agent returns `{regression: true, score_merged: 0.4, score_originals: 0.95, shouldRevert: true}`
    Then main turn deletes merged draft
    And exit code 1 без `--force` flag
    And stderr содержит "regression: ratchet rejected merge"

  # @feature7 — FR-7 preserve originals
  Scenario: SRO008_originals_preserved_after_successful_merge
    Given merge выполнился успешно (regression: false)
    When ratchet apply phase завершён
    Then `.claude/skills/<a>/SKILL.md` существует на диске unchanged
    And `.claude/skills/<b>/SKILL.md` существует unchanged
    And output JSON содержит `cleanup_suggestions: ["rm -rf .claude/skills/<a> .claude/skills/<b>"]`

  # @feature8 — FR-9 backward compat for rules
  Scenario: SRO009_rules_audit_byte_identical_after_rename
    Given `/suggest-rules` Phase 6 invokes `audit.ts --dir .claude/rules --save audit_before.json`
    When current skill renamed (rules-optimizer → skills-rules-optimizer)
    And paths updated in extension.json и suggest-rules.md
    Then audit_before.json содержит keys totalFiles, totalTokens, withPaths, withoutPaths, mergeCandidates, antipatternFiles
    And output structure byte-identical to current rules-optimizer (verified via JSON deep-equal)
