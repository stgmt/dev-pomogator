# Source: new feature, domain code PLUGIN016 (next free after PLUGIN015)
Feature: PLUGIN016 Tests Create Update Skill
  As a developer using dev-pomogator
  I want AI agent to follow test quality rules automatically
  So that tests catch real bugs instead of being false positives

  Background:
    Given dev-pomogator is installed
    And test-quality extension is enabled

  # @feature1 — Anti-pattern detection
  Scenario: PLUGIN016_01 AI shall flag pathExists-only assertion
    Given test checks fs.pathExists without content validation
    When AI runs compliance check
    Then it shall flag "existence-only" with line reference
    And suggest stat + readFile + toContain

  # @feature1
  Scenario: PLUGIN016_02 AI shall flag source scan assertion
    Given test reads source file and checks toContain('functionName')
    When AI runs compliance check
    Then it shall flag "source scan / unit-only"
    And suggest spawnSync integration approach

  # @feature1
  Scenario: PLUGIN016_03 AI shall flag weak toBeDefined assertion
    Given test uses expect(x).toBeDefined() without value check
    When AI runs compliance check
    Then it shall flag "weak assertion"
    And suggest .toBe(expectedValue) or .toEqual(structure)

  # @feature2 — Assertion selection
  Scenario: PLUGIN016_04 AI shall use content validation for file checks
    When AI creates test that verifies file installation
    Then assertion shall include readFile + content length + toContain
    And shall NOT use pathExists alone

  # @feature2
  Scenario: PLUGIN016_05 AI shall use body check for API responses
    When AI creates test that verifies API endpoint
    Then assertion shall include status code AND body structure check
    And shall NOT use res.ok alone

  # @feature3 — No silent skip
  Scenario: PLUGIN016_06 AI shall not use early return in tests
    When AI creates test with conditional logic
    Then it shall use expect(condition, 'message').toBe(true)
    And shall NOT use if (!condition) return

  # @feature4 — Integration-first
  Scenario: PLUGIN016_07 AI shall use runInstaller for E2E tests
    When AI creates test for installer functionality
    Then it shall call runInstaller() and check file system results
    And shall NOT import function and call with hardcoded args

  # @feature5 — Compliance report
  Scenario: PLUGIN016_08 AI shall output compliance table
    When AI finishes creating or updating a test
    Then it shall output markdown table with 7 rules
    And each rule shall show PASS or FAIL with details

  # @feature6 — Multi-language
  Scenario: PLUGIN016_09 AI shall use FluentAssertions for C# projects
    Given project uses xUnit and FluentAssertions
    When AI creates C# test
    Then assertions shall use Should() syntax
    And shall NOT use Assert.NotNull alone

  # @feature7 — Unsafe JSON (C#)
  Scenario: PLUGIN016_10 AI shall use TryGetProperty for JSON parsing
    Given C# test parses JSON response
    When AI writes JSON field access
    Then it shall use TryGetProperty with Assert.Fail fallback
    And shall NOT use chained GetProperty()

  # @feature1
  Scenario: PLUGIN016_11 AI shall flag empty catch blocks in C# tests
    Given C# test has catch { } without logging
    When AI runs compliance check
    Then it shall flag "silent skip"
    And suggest catch with output.WriteLine

  # @feature8 — Auto-trigger
  Scenario: PLUGIN016_12 Hook triggers compliance check on test file write
    When Claude writes a file matching tests/e2e/*.test.ts
    Then PostToolUse hook shall run anti-pattern scan
    And output compliance report if issues found

  # @feature8
  Scenario: PLUGIN016_13 Hook skips already-checked file in same session
    Given hook already checked tests/e2e/foo.test.ts in this session
    When Claude edits tests/e2e/foo.test.ts again
    Then hook shall skip (cooldown)
