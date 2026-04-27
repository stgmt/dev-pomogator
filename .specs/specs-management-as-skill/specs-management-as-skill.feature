# Source: tests/features/plugins/specs-workflow/PLUGIN003_specs-workflow.feature (Background pattern reused)
Feature: SPECMGT001 Specs Management as Skill
  As a dev-pomogator maintainer
  I want the specs management workflow packaged as a Claude Code skill with progressive disclosure
  So that the 40k-char rule no longer loads on every session

  Background:
    Given dev-pomogator is installed
    And specs-workflow extension is enabled

  # @feature1
  Scenario: SPECMGT001_01 SKILL.md is ≤200 lines after migration
    When dev-pomogator installs specs-workflow for Claude Code
    Then create-spec/SKILL.md should exist at PROJECT/.claude/skills/create-spec/SKILL.md
    And file content should not be empty
    And SKILL.md frontmatter should contain "name: create-spec"
    And SKILL.md body line count should be at most 200

  # @feature1
  Scenario: SPECMGT001_02 References directory is installed alongside SKILL.md
    When dev-pomogator installs specs-workflow for Claude Code
    Then references folder should exist at PROJECT/.claude/skills/create-spec/references/
    And references folder should contain at least 19 markdown files
    And every reference file should have non-empty content

  # @feature1
  Scenario: SPECMGT001_13 Skill metadata startup token cost is bounded
    Given a fresh Claude Code session is started
    When system prompt is constructed
    Then total token count for create-spec, research-workflow, discovery-forms, requirements-chk-matrix, task-board-forms metadata should be at most 500 tokens

  # @feature2
  Scenario: SPECMGT001_03 All phase-bound references match naming convention
    When dev-pomogator installs specs-workflow for Claude Code
    Then every file matching "phase*_*.md" in references/ should match regex "^phase[0-9]+(\.[0-9]+)?_[a-z][a-z0-9-]+\.md$"
    And every non-phase reference should match regex "^[a-z][a-z0-9-]+\.md$"

  # @feature3
  Scenario: SPECMGT001_04 Phase 3+ Audit category files all exist
    When dev-pomogator installs specs-workflow for Claude Code
    Then phase3plus_audit-overview.md should exist in references/
    And phase3plus_audit-errors.md should exist in references/
    And phase3plus_audit-logic-gaps.md should exist in references/
    And phase3plus_audit-inconsistency.md should exist in references/
    And phase3plus_audit-rudiments.md should exist in references/
    And phase3plus_audit-fantasies.md should exist in references/
    And phase3plus_audit-undefined-behavior.md should exist in references/
    And phase3plus_audit-jira-drift.md should exist in references/

  # @feature3
  Scenario: SPECMGT001_05 audit-overview links to all category siblings
    Given references/phase3plus_audit-overview.md content is read
    Then content should contain link to "phase3plus_audit-errors.md"
    And content should contain link to "phase3plus_audit-logic-gaps.md"
    And content should contain link to "phase3plus_audit-inconsistency.md"
    And content should contain link to "phase3plus_audit-rudiments.md"
    And content should contain link to "phase3plus_audit-fantasies.md"
    And content should contain link to "phase3plus_audit-undefined-behavior.md"
    And content should contain link to "phase3plus_audit-jira-drift.md"

  # @feature4
  Scenario: SPECMGT001_06 Hard cutover removes all 4 manifest-managed rules
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
    When grep is run for "specs-management.md" in CLAUDE.md within Triggered rules table
    Then no matches should be found
    And similar grep for "no-mocks-fallbacks.md", "research-workflow.md", "specs-validation.md" should return no matches in rule tables

  # @feature4
  Scenario: SPECMGT001_09 specs-validator hook produces identical findings before and after migration
    Given a sample spec folder ".specs/sample-feature/" with valid @featureN tags exists
    When UserPromptSubmit hook runs against the sample spec before migration
    And UserPromptSubmit hook runs against the sample spec after migration
    Then validation-report.md content should be byte-identical modulo timestamps

  # @feature4
  Scenario: SPECMGT001_14 user-modified rule files are backed up before deletion
    Given target project has user-modified .claude/rules/specs-workflow/specs-management.md
    When dev-pomogator runs update against target project
    Then .dev-pomogator/.user-overrides/.claude/rules/specs-workflow/specs-management.md should contain the user version
    And .claude/rules/specs-workflow/specs-management.md should NOT exist after update

  # @feature5
  Scenario: SPECMGT001_10 research-workflow skill is registered separately
    When dev-pomogator installs specs-workflow for Claude Code
    Then research-workflow/SKILL.md should exist at PROJECT/.claude/skills/research-workflow/SKILL.md
    And SKILL.md frontmatter should contain "name: research-workflow"
    And SKILL.md description should contain trigger phrases for "исследуй", "найди", "погугли", "ресерч"

  # @feature5
  Scenario: SPECMGT001_11 create-spec description includes all triggers within 1024-char limit
    Given .claude/skills/create-spec/SKILL.md frontmatter is parsed
    Then description field length should be at most 1024 characters
    And description should contain all of: "create", "make", "draft", "write", "sketch", "outline", "spec out"
    And description should contain all of: "создай", "сделай", "набросай", "напиши", "опиши"
    And description should contain negative scope statement mentioning "plan-pomogator"

  # @feature5
  Scenario: SPECMGT001_12 allowed-tools covers entire workflow
    Given .claude/skills/create-spec/SKILL.md frontmatter is parsed
    Then allowed-tools should include "Read"
    And allowed-tools should include "Write"
    And allowed-tools should include "Edit"
    And allowed-tools should include "Glob"
    And allowed-tools should include "Grep"
    And allowed-tools should include "Bash"
    And allowed-tools should include "AskUserQuestion"
    And allowed-tools should include "Skill"
    And allowed-tools should include "Agent"
    And allowed-tools should include "WebFetch"
    And allowed-tools should include "WebSearch"
