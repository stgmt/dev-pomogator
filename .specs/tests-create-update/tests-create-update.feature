# Rewritten 2026-06-17 from aspirational agent-behaviour to verifiable artifact-structure — the
# vitest (PLUGIN016) is the real contract (see .claude/rules/gotchas/verify-divergent-contracts.md).
Feature: PLUGIN016 Tests Create Update Skill

  Background:
    Given the tests-create-update skill and its compliance hook are present in the repo

  @feature1
  Scenario: PLUGIN016_01 SKILL.md has valid frontmatter (name + allowed-tools)
    Given the tests-create-update SKILL.md
    Then it declares "name: tests-create-update" and an "allowed-tools" field

  @feature1
  Scenario: PLUGIN016_02 SKILL.md carries the Assertion Selection Table
    Given the tests-create-update SKILL.md
    Then it contains an "Assertion Selection Table" with BAD and GOOD columns

  @feature2
  Scenario: PLUGIN016_03 SKILL.md enumerates all the NEVER anti-pattern rules
    Given the tests-create-update SKILL.md
    Then it lists every catalogued "NEVER" anti-pattern rule

  @feature3
  Scenario: PLUGIN016_04 SKILL.md carries the compliance report template
    Given the tests-create-update SKILL.md
    Then it contains the compliance checklist items and an "X/16 PASS" line

  @feature1
  Scenario: PLUGIN016_05 the skill is installed in the repo tree
    Then the file .claude/skills/tests-create-update/SKILL.md exists

  @wip
  Scenario: PLUGIN016_06 the plugin registry wires compliance_check as PostToolUse(Write|Edit)
    Then the plugin hooks register compliance_check on PostToolUse with matcher "Write|Edit"

  @wip
  Scenario: PLUGIN016_07 compliance_check.ts exists and exports the scanner
    Then tools/test-quality/compliance_check.ts is non-trivial and contains scanAntiPatterns and isTestFile

  @wip
  Scenario: PLUGIN016_08 the scanner detects the existence-only pattern
    Then compliance_check.ts contains "existence-only" and "pathExists"

  @wip
  Scenario: PLUGIN016_09 the scanner detects the weak-assertion pattern
    Then compliance_check.ts contains "weak-assertion" and "toBeDefined"

  @wip
  Scenario: PLUGIN016_10 isTestFile recognises the test-file patterns
    Then compliance_check.ts recognises test.ts, test.cs and Steps.cs

  @wip
  Scenario: PLUGIN016_11 the hook has a per-session cooldown
    Then compliance_check.ts uses COOLDOWN_MINUTES, markerPath and isWithinCooldown
