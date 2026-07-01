Feature: SRO001_Skills_Rules_Optimizer

  Background:
    Given dev-pomogator установлен
    And `.claude/skills/skills-rules-optimizer/scripts/` содержит audit.ts, audit-skills.ts, detect-overlap.ts, merge-skills.ts, verify-merge.ts
    And `tests/fixtures/skills-rules-optimizer/` содержит test fixtures

  @feature1
  Scenario: SRO002_audit_skills_emits_structured_json
    Given `.claude/skills/` содержит 5 valid skills (frontmatter ОК, body ОК)
    When the skills audit runs over the SRO fixtures directory
    Then the SRO audit result has totalSkills == 5
    And the SRO audit result contains keys "withErrors", "withWarnings", "overlaps", "details"

  @feature2
  Scenario: SRO003_frontmatter_name_forbidden_token
    Given the SRO fixture `claude-in-name/SKILL.md` with a name carrying the forbidden token "claude"
    When the skills audit scans the SRO fixtures for a forbidden name token
    Then the SRO audit withErrors contains a FRONTMATTER_NAME_FORBIDDEN_TOKEN finding with token "claude"

  @feature3
  Scenario: SRO004_allowed_tools_missing_skill_token
    Given the SRO fixture with `allowed-tools: Read, Write` and a `Skill(` invocation in the body
    When the allowed-tools coverage check runs over that SRO fixture
    Then the SRO coverage finding has code ALLOWED_TOOLS_MISSING and missing contains Skill and Bash

  @feature4
  Scenario: SRO005_triple_axis_jaccard_overlap_detected
    Given the SRO `overlap-pair/{a,b}` fixtures with overlapping trigger phrases
    When the overlap detector runs over the SRO fixtures
    Then the SRO overlaps contain a trigger-axis pair of a and b with similarity >= 0.3

  @feature5
  Scenario: SRO006_merge_emits_invoke_agent_envelope
    Given the SRO `overlap-pair` skills a and b with valid SKILL.md files
    When merge-skills runs `--execute a b --merged-name ab` over the SRO overlap pair
    Then the SRO merge envelope action is "invoke-agent" with subagent_type "general-purpose"
    And the SRO merge envelope prompt contains both skill bodies and the continuation invokes verify-merge

  @feature5
  Scenario: SRO011_merge_rejects_path_traversal_merged_name
    Given the SRO `overlap-pair` skills a and b with valid SKILL.md files
    When merge-skills runs with a path-traversal merged-name over the SRO overlap pair
    Then the SRO merge exits non-zero rejecting path traversal

  @feature5
  Scenario: SRO012_merge_rejects_forbidden_token_merged_name
    Given the SRO `overlap-pair` skills a and b with valid SKILL.md files
    When merge-skills runs with a forbidden-token merged-name over the SRO overlap pair
    Then the SRO merge exits non-zero rejecting the forbidden token

  @feature6
  Scenario: SRO013_verify_merge_emits_scorer_envelope
    Given the SRO `overlap-pair` skills a and b with valid SKILL.md files
    When verify-merge runs over a draft and the SRO overlap originals
    Then the SRO scorer envelope routes on_regression to delete and on_pass to rename
    And the SRO scorer envelope cleanup_suggestions lists rm -rf for both originals

  @feature6
  Scenario: SRO014_verify_merge_force_propagates
    Given the SRO `overlap-pair` skills a and b with valid SKILL.md files
    When verify-merge runs with `--force` over a draft and the SRO overlap originals
    Then the SRO scorer envelope decision_handler force is true

  # SRO007: the main-turn EXECUTION (delete draft + exit 1 + "regression: ratchet rejected merge")
  # is performed by the orchestrating agent turn after the scorer Agent returns — no script / headless
  # hook / vitest covers it, so it stays @manual (excluded from the gate, never faked green).
  # verify-merge's envelope shape is covered by the runtime scenario SRO013.
  @feature6 @manual
  Scenario: SRO007_ratchet_revert_on_regression
    Given merged SKILL.md draft с invalid frontmatter (missing `name:` field)
    And originals A и B с valid frontmatter
    When verify-merge emits scorer envelope
    And scorer Agent returns `{regression: true, score_merged: 0.4, score_originals: 0.95, shouldRevert: true}`
    Then main turn deletes merged draft
    And exit code 1 без `--force` flag
    And stderr содержит "regression: ratchet rejected merge"

  @feature7
  Scenario: SRO008_originals_preserved_after_successful_merge
    Given the SRO `overlap-pair` skills a and b with valid SKILL.md files
    And the SRO overlap originals a and b are captured byte-for-byte
    When merge-skills generates a merge envelope over the SRO overlap pair
    Then the SRO originals a and b remain on disk unchanged

  @feature2
  Scenario: SRO010_oversize_skill_emits_warning
    Given the SRO `oversize-skill/SKILL.md` fixture over 500 lines
    When the oversize check runs over that SRO fixture
    Then the SRO oversize finding has code OVERSIZE with more than 500 lines

  @feature9
  Scenario: SRO009_rules_audit_byte_identical_after_rename
    Given the SRO audit dispatcher is invoked against the real `.claude/rules` directory
    When audit.ts runs `--dir .claude/rules --save` to a temp file
    Then the SRO rules audit JSON contains keys totalFiles, totalTokens, withPaths, withoutPaths, mergeCandidates, antipatternFiles

  @feature8
  Scenario: SRO015 the unified engine parses both a rule and a skill through one flexible parser
    Given a rule-format frontmatter and a skill-format frontmatter for the unified engine
    When parseFrontmatterFlexible parses each through the unified engine
    Then the rule frontmatter exposes paths and the skill frontmatter exposes name and allowed-tools

  @feature10
  Scenario: SRO016 embedding-based semantic merge stays out of scope (no embedding code in the merge engine)
    Given the merge-skills and detect-overlap engine sources
    When the merge engine sources are scanned for embedding or vector similarity dependencies
    Then no embedding-based implementation is present and overlap detection uses Jaccard

  @feature11
  Scenario: SRO017 merge never auto-applies — it emits an envelope and writes no merged skill
    Given the SRO overlap-pair skills a and b
    When merge-skills runs --execute over the overlap pair with a probe merged-name
    Then it emits an invoke-agent envelope and writes no merged skill directory to disk
