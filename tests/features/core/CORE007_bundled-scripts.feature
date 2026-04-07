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

  # @feature8
  Scenario: CORE007_08 tsx-runner.js executes scripts with local .js imports
    Given tsx-runner.js exists in ~/.dev-pomogator/scripts/
    And a helper TypeScript module exists in the project
    And a main script imports the helper using .js extension
    When running tsx-runner.js with the main script
    Then the main script should execute successfully with resolved import
    And stderr should not contain ERR_MODULE_NOT_FOUND

  # @feature9
  Scenario: CORE007_09 tsx-runner Strategy 0 falls through on ERR_MODULE_NOT_FOUND
    Given tsx-runner.js exists in ~/.dev-pomogator/scripts/
    Then tsx-runner.js should contain ERR_MODULE_NOT_FOUND in fallthrough condition
    And ERR_MODULE_NOT_FOUND should be near ERR_UNSUPPORTED_NODE_OPTION in the same condition

  # @feature11
  Scenario: CORE007_11 extensions/**/*.ts use .ts extension in relative imports
    Given the dev-pomogator repo
    When scanning every .ts file under extensions/ for relative imports
    Then no import or import() expression should use a .js specifier
    And the ts-import-extensions rule should be honored

  # @feature10
  Scenario: CORE007_10 tsx-runner uses loader-aware strategy table for fall-through
    Given tsx-runner.js exists in ~/.dev-pomogator/scripts/
    Then tsx-runner.js should declare a STRATEGIES array with loader metadata
    And isResolverError should classify errors via RESOLVER_ERROR_TOKENS array
    And running a script with a broken relative import should fail without redundant same-loader retries
    And the failure log should record the originating strategy name

  # @feature7
  Scenario: CORE007_07 tsx-runner.js uses execCmd for .cmd files on Windows
    Given tsx-runner.js exists in ~/.dev-pomogator/scripts/
    Then tsx-runner.js should contain "execCmd" function
    And tsx-runner.js should contain "COMSPEC" for cmd.exe routing
    And tsx-runner.js should not call execFileSync directly on .cmd binaries
