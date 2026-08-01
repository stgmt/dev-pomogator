Feature: PLUGIN003 Specs Workflow Extension
  As a developer using Claude Code
  I want create-spec skill and specs management tools
  So that I can manage specifications via 4-phase workflow

  Background:
    Given dev-pomogator is installed
    And specs-workflow extension is enabled

  Scenario: Skill file is installed for Claude Code
    When dev-pomogator installs specs-workflow for Claude Code
    Then create-spec should exist at PROJECT/.claude/skills/create-spec/SKILL.md
    And file content should not be empty
    And SKILL.md frontmatter should contain "name: create-spec"

  Scenario: specs-workflow tools are installed
    When dev-pomogator installs specs-workflow
    Then specs-generator folder should exist in PROJECT/.dev-pomogator/tools/
    And scaffold-spec.ts should exist
    And validate-spec.ts should exist
    And templates folder should contain 14 template files

  Scenario: Claude Code plugin is registered
    Given marketplace.json exists in .claude-plugin/
    Then specs-workflow should be listed in plugins array
    And plugin source should point to ./extensions/specs-workflow

  # Source: .specs/specs-management-as-skill/specs-management-as-skill.feature
  # @feature1
  Scenario: SPECMGT001_01 SKILL.md ≤200 lines after migration
    When dev-pomogator installs specs-workflow for Claude Code
    Then create-spec/SKILL.md should exist at PROJECT/.claude/skills/create-spec/SKILL.md
    And SKILL.md frontmatter should contain "name: create-spec"
    And SKILL.md body line count should be at most 200

  # @feature1
  Scenario: SPECMGT001_02 References directory installed alongside SKILL.md
    When dev-pomogator installs specs-workflow for Claude Code
    Then references folder should exist at PROJECT/.claude/skills/create-spec/references/
    And references folder should contain at least 19 markdown files
    And every reference file should have non-empty content

  # @feature2
  Scenario: SPECMGT001_03 Phase-bound reference files match naming convention
    When dev-pomogator installs specs-workflow for Claude Code
    Then every file matching "phase*_*.md" in references/ should match regex "^phase[0-9]+(\.[0-9]+)?_[a-z][a-z0-9-]+\.md$"

  # @feature3
  Scenario: SPECMGT001_04 All Phase 3+ Audit category files exist
    When dev-pomogator installs specs-workflow for Claude Code
    Then phase3plus_audit-overview.md should exist in references/
    And phase3plus_audit-errors.md should exist in references/
    And phase3plus_audit-logic-gaps.md should exist in references/
    And phase3plus_audit-inconsistency.md should exist in references/
    And phase3plus_audit-rudiments.md should exist in references/
    And phase3plus_audit-fantasies.md should exist in references/
    And phase3plus_audit-undefined-behavior.md should exist in references/
    And phase3plus_audit-jira-drift.md should exist in references/

  # @feature4
  Scenario: SPECMGT001_06 Hard cutover removes 4 manifest-managed rules
    Given target project has pre-migration layout with 4 rules in .claude/rules/specs-workflow/
    When dev-pomogator runs update against target project
    Then specs-management.md should NOT exist in PROJECT/.claude/rules/specs-workflow/
    And no-mocks-fallbacks.md should NOT exist in PROJECT/.claude/rules/specs-workflow/
    And research-workflow.md should NOT exist in PROJECT/.claude/rules/specs-workflow/
    And specs-validation.md should NOT exist in PROJECT/.claude/rules/specs-workflow/

  # @feature4
  Scenario: SPECMGT001_07 extension.json ruleFiles.claude is empty after migration
    When dev-pomogator installs specs-workflow for Claude Code
    Then extension.json ruleFiles.claude array should have length 0
    And extension.json skills should contain key "create-spec"
    And extension.json skills should contain key "research-workflow"
    And extension.json skillFiles for "create-spec" should list at least 20 paths

  # @feature4
  Scenario: SPECMGT001_08 CLAUDE.md no longer references removed rules
    Given migration commit applied
    Then CLAUDE.md Triggered rules table should not contain "specs-management.md"
    And CLAUDE.md Triggered rules table should not contain "no-mocks-fallbacks.md"
    And CLAUDE.md Triggered rules table should not contain "research-workflow.md"
    And CLAUDE.md Triggered rules table should not contain "specs-validation.md"

  # @feature4
  Scenario: SPECMGT001_09 specs-validator hook produces identical findings before and after migration
    Given a sample spec folder ".specs/sample-feature/" with valid @featureN tags exists
    When UserPromptSubmit hook runs against the sample spec before migration
    And UserPromptSubmit hook runs against the sample spec after migration
    Then validation-report.md content should be byte-identical modulo timestamps

  # @feature5
  Scenario: SPECMGT001_10 research-workflow skill is registered separately
    When dev-pomogator installs specs-workflow for Claude Code
    Then research-workflow/SKILL.md should exist at PROJECT/.claude/skills/research-workflow/SKILL.md
    And SKILL.md frontmatter should contain "name: research-workflow"
    And SKILL.md description should mention "исследуй", "найди", "погугли", "ресерч"

  # @feature5
  Scenario: SPECMGT001_11 create-spec description includes all triggers within 1024-char limit
    Given .claude/skills/create-spec/SKILL.md frontmatter is parsed
    Then description field length should be at most 1024 characters
    And description should contain English creation triggers create, make, draft, write, sketch, outline
    And description should contain Russian creation triggers создай, сделай, набросай, напиши, опиши
    And description should contain negative scope statement mentioning "plan-pomogator"

  # @feature5
  Scenario: SPECMGT001_12 allowed-tools covers entire workflow
    Given .claude/skills/create-spec/SKILL.md frontmatter is parsed
    Then allowed-tools should include Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion, Skill, Agent, WebFetch, WebSearch

  # @feature4
  Scenario: SPECMGT001_14 user-modified rule files are backed up before deletion
    Given target project has user-modified .claude/rules/specs-workflow/specs-management.md with sentinel "// USER MOD"
    When dev-pomogator runs update against target project
    Then .dev-pomogator/.user-overrides/.claude/rules/specs-workflow/specs-management.md should contain the sentinel
    And .claude/rules/specs-workflow/specs-management.md should NOT exist after update
