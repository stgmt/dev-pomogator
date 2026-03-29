Feature: PLUGIN016 Tests Create Update Skill
  As a developer using dev-pomogator
  I want AI agent to follow test quality rules automatically
  So that tests catch real bugs instead of being false positives

  Background:
    Given dev-pomogator is installed
    And test-quality extension is enabled

  # @feature1 — Anti-pattern detection
  Scenario: PLUGIN016_01 Skill SKILL.md exists and has valid frontmatter
    Given test-quality extension is installed
    Then .claude/skills/tests-create-update/SKILL.md shall exist
    And SKILL.md shall contain "name: tests-create-update" in frontmatter
    And SKILL.md shall contain "allowed-tools" in frontmatter

  # @feature1
  Scenario: PLUGIN016_02 SKILL.md contains Assertion Selection Table
    Given SKILL.md is loaded
    Then it shall contain "Assertion Selection Table" heading
    And table shall have BAD and GOOD columns
    And table shall cover file, API, config, hook, feature check types

  # @feature2
  Scenario: PLUGIN016_03 SKILL.md contains all 15 anti-pattern rules
    Given SKILL.md is loaded
    Then it shall contain "NEVER use pathExists" rule
    And it shall contain "NEVER use toBeDefined" rule
    And it shall contain "NEVER put if/else inside test body" rule
    And it shall contain "NEVER put assertions inside forEach" rule
    And it shall contain "NEVER call async function without await" rule
    And it shall contain "NEVER wrap test body in try/catch" rule
    And it shall contain "NEVER write it() with zero expect()" rule
    And it shall contain "NEVER compute expected value using same logic" rule

  # @feature3
  Scenario: PLUGIN016_04 SKILL.md contains compliance report template
    Given SKILL.md is loaded
    Then it shall contain compliance report table with 15 rules
    And each rule shall have PASS/FAIL status column

  # @feature5
  Scenario: PLUGIN016_05 Extension manifest registers skill
    Given extensions/test-quality/extension.json is loaded
    Then skills shall contain "tests-create-update" entry
    And skillFiles shall contain SKILL.md path

  # @feature8
  Scenario: PLUGIN016_06 Extension manifest registers PostToolUse hook
    Given extensions/test-quality/extension.json is loaded
    Then hooks.claude.PostToolUse shall contain compliance_check command
    And PostToolUse matcher shall be "Write|Edit"

  # @feature8
  Scenario: PLUGIN016_07 Compliance hook script exists and is non-empty
    Given test-quality extension is installed
    Then compliance_check.ts shall exist in tools/test-quality/
    And compliance_check.ts shall be larger than 1000 bytes

  # @feature1
  Scenario: PLUGIN016_08 Compliance hook detects pathExists-only pattern
    Given a test file contains "expect(await fs.pathExists(p)).toBe(true)" without readFile
    When compliance hook scans the file
    Then it shall report "existence-only" anti-pattern

  # @feature2
  Scenario: PLUGIN016_09 Compliance hook detects weak toBeDefined pattern
    Given a test file contains "expect(x).toBeDefined()" as terminal assertion
    When compliance hook scans the file
    Then it shall report "weak-assertion" anti-pattern

  # @feature8
  Scenario: PLUGIN016_10 Compliance hook skips non-test files
    Given a non-test file is written (src/index.ts)
    When compliance hook runs
    Then it shall approve without scanning

  # @feature8
  Scenario: PLUGIN016_11 Compliance hook respects cooldown
    Given compliance hook already checked a file in this session
    When the same file is edited again with same content
    Then hook shall skip (cooldown) and approve
