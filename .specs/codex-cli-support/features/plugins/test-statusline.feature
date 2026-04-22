Feature: Codex handling for test-statusline

  Background:
    Given dev-pomogator is installed
    And a git repository project exists

  Scenario: Support matrix excludes test-statusline explicitly
    When Codex support matrix is generated
    Then it should include all current installable extensions
    And "test-statusline" should be explicitly marked as excluded
    And the excluded reason should mention missing Codex status line surface and insufficient PostToolUse Bash parity
