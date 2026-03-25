Feature: CORE007 Bundled Scripts Installation
  As a developer installing dev-pomogator
  I want check-update and tsx-runner scripts to be reliably installed
  So that auto-update and hook execution always work out of the box

  Background:
    Given dev-pomogator is installed with --claude --all

  # @feature1
  Scenario: CORE007_01 check-update.js is installed to global scripts
    When dev-pomogator installs for Claude Code
    Then ~/.dev-pomogator/scripts/check-update.js should exist
    And check-update.js should contain "checkUpdate" function
    And check-update.js file size should be greater than 100KB

  # @feature2
  Scenario: CORE007_02 tsx-runner.js is installed to global scripts
    When dev-pomogator installs for Claude Code
    Then ~/.dev-pomogator/scripts/tsx-runner.js should exist
    And tsx-runner.js should contain "resolveScriptPath" function
    And tsx-runner.js file size should be greater than 5KB

  # @feature3
  Scenario: CORE007_03 check-update.js is executable by node
    Given check-update.js exists in ~/.dev-pomogator/scripts/
    When running "node check-update.js --check-only" from scripts dir
    Then process should exit without MODULE_NOT_FOUND error

  # @feature4
  Scenario: CORE007_04 tsx-runner.js is executable by node
    Given tsx-runner.js exists in ~/.dev-pomogator/scripts/
    And a test TypeScript file exists in the project
    When running tsx-runner.js with the test script
    Then the test script should execute successfully

  # @feature5
  Scenario: CORE007_05 dist files are included in npm pack output
    Given npm pack --dry-run runs successfully
    Then output should include dist/check-update.bundle.cjs
    And output should include dist/tsx-runner.js
    And output should include dist/launch-claude-tui.ps1

  # @feature6
  Scenario: CORE007_06 launch-claude-tui.ps1 is installed to global scripts
    When dev-pomogator installs for Claude Code
    Then ~/.dev-pomogator/scripts/launch-claude-tui.ps1 should exist
    And launch-claude-tui.ps1 should contain "-ProjectDir" parameter

  # @feature7
  Scenario: CORE007_07 tsx-runner.js uses execCmd for .cmd files on Windows
    Given tsx-runner.js exists in ~/.dev-pomogator/scripts/
    Then tsx-runner.js should contain "execCmd" function
    And tsx-runner.js should contain "COMSPEC" for cmd.exe routing
    And tsx-runner.js should not call execFileSync directly on .cmd binaries
