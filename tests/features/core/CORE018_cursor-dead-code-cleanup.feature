Feature: CORE018 Cursor Dead Code Cleanup
  As a developer
  I want dead Cursor code removed from memory.ts and updater/index.ts
  So that the codebase is clean and only contains live code

  Background:
    Given dev-pomogator source code is available

  # @feature1
  Scenario: CORE018_01 memory.ts has no Cursor-specific exports
    When I check src/installer/memory.ts for dead Cursor functions
    Then it should not contain "installCursorHooks"
    And it should not contain "areCursorHooksInstalled"
    And it should not contain "generateCursorHooksJson"
    And it should not contain "copyCursorSummarizeScript"

  # @feature2
  Scenario: CORE018_02 memory.ts has no CursorHooksJson interface
    When I check src/installer/memory.ts for dead Cursor types
    Then it should not contain "CursorHooksJson"
    And it should not contain "getWorkerServicePath"
    And it should not contain "getCursorSummarizeScriptPath"

  # @feature3
  Scenario: CORE018_03 updater/index.ts has no updateCursorHooksForProject
    When I check src/updater/index.ts for dead Cursor functions
    Then it should not contain "updateCursorHooksForProject"

  # @feature4
  Scenario: CORE018_04 updater/index.ts has no CursorHooksJson interface
    When I check src/updater/index.ts for dead Cursor types
    Then it should not contain "CursorHooksJson"
    And it should not contain ".cursor"

  # @feature5
  Scenario: CORE018_05 ensureClaudeMem still callable after cleanup
    When I import ensureClaudeMem from memory.ts
    Then the import should succeed without errors

  # @feature6
  Scenario: CORE018_06 Existing CORE003 installer tests still pass
    Given dev-pomogator installs for Claude Code with --all
    Then the installer should complete without errors
