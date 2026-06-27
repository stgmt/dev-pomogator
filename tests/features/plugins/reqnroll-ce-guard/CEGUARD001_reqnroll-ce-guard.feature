Feature: CEGUARD001 Reqnroll Cucumber Expression Slash Guard
  As an AI agent writing C# step definitions for Reqnroll
  I want the Write/Edit tool blocked when my pattern has an unescaped `/` in a Cucumber Expression
  So that I don't produce step definitions that fail with "Alternative may not be empty"

  Background:
    Given dev-pomogator is installed
    And reqnroll-ce-guard extension is enabled

  # @feature1 — Core violation: detect + actionable message
  Scenario: CEGUARD001_01 deny on unescaped `/` in CE pattern without regex markers
    When hook receives Write of `.cs` file with `[When(@"я запрашиваю GET /v1/models")]`
    Then hook SHALL deny with exit code 2
    And deny message SHALL name the violating line and keyword `When`
    And deny message SHALL show both fix options — `^$` anchors AND `\/` escape

  # @feature1
  Scenario: CEGUARD001_02 deny on multiple violations — one message, both reported
    When hook receives Write of `.cs` file containing two bad step definitions on different lines
    Then hook SHALL deny with exit code 2
    And deny message SHALL list both violations with their line numbers

  # @feature1
  Scenario: CEGUARD001_03 deny via Edit tool checks `new_string`, not `old_string`
    When hook receives Edit with clean `old_string` and bad CE pattern in `new_string`
    Then hook SHALL deny with exit code 2

  # @feature2 — Regex detection: allow when pattern has regex metacharacters
  Scenario: CEGUARD001_04 allow when pattern contains `(.*)` regex capture group
    When hook receives Write of `.cs` file with `[When(@"модель ""(.*)"" через /v1/models")]`
    Then hook SHALL allow with exit code 0

  # @feature2
  Scenario: CEGUARD001_05 allow when pattern is anchored with `^` and `$`
    When hook receives Write of `.cs` file with `[When(@"^я запрашиваю GET /v1/models$")]`
    Then hook SHALL allow with exit code 0

  # @feature2
  Scenario: CEGUARD001_06 allow when pattern contains `\d` shorthand
    When hook receives Write of `.cs` file with `[When(@"запрос № \d+ через /v1")]`
    Then hook SHALL allow with exit code 0

  # @feature2
  Scenario: CEGUARD001_07 allow when pattern contains `[0-9]` character class
    When hook receives Write of `.cs` file with `[When(@"код [0-9]+ для /path")]`
    Then hook SHALL allow with exit code 0

  # @feature3 — CE escape: allow when `/` is properly escaped
  Scenario: CEGUARD001_08 allow when `/` is escaped as `\/` in CE pattern
    When hook receives Write of `.cs` file with `[When(@"я запрашиваю GET \/v1\/models")]`
    Then hook SHALL allow with exit code 0

  # @feature4 — Scope: only relevant tools and files
  Scenario: CEGUARD001_09 skip non-`.cs` files even with matching content
    When hook receives Write of `.ts` file containing `[When(@"/v1/models")]` as string
    Then hook SHALL allow with exit code 0

  # @feature4
  Scenario: CEGUARD001_10 skip `.cs` files without any step definition attributes
    When hook receives Write of `.cs` file with ordinary class and methods, no attributes
    Then hook SHALL allow with exit code 0

  # @feature4
  Scenario: CEGUARD001_11 skip non-Write/Edit tools (Bash, Read, etc.)
    When hook receives tool name "Bash" with command containing `/v1/models`
    Then hook SHALL allow with exit code 0

  # @feature5 — Resilience: fail-open on unexpected input
  Scenario: CEGUARD001_12 fail-open on invalid JSON input
    When hook receives invalid JSON on stdin
    Then hook SHALL allow with exit code 0

  # @feature6 — v2 canonical plugin: the guard is wired into both manifests + assets ship in place
  Scenario: CEGUARD001_13 reqnroll-ce-guard is registered as a Write|Edit PreToolUse hook
    Then reqnroll-ce-guard is registered as a Write|Edit PreToolUse hook in both plugin manifests

  # @feature6
  Scenario: CEGUARD001_14 the reqnroll-ce-guard rule file ships under .claude/rules/
    Then the reqnroll-ce-guard rule file is present under `.claude/rules/`

  # @feature6
  Scenario: CEGUARD001_15 the ce_slash_guard hook script ships under tools/
    Then the ce_slash_guard hook script is present under `tools/`
