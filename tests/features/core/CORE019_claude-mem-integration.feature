# Source: extends PLUGIN002_claude-mem.feature with installation reliability scenarios
Feature: CORE019 Claude-mem Integration
  As a developer installing dev-pomogator
  I want claude-mem to install fully and reliably
  So that persistent memory works immediately without manual steps

  Background:
    Given Docker test environment is running
    And dev-pomogator installer runs with --claude --all

  # @feature1
  Scenario: CORE019_01 claude-mem-health hooks registered after install
    When installer completes with suggest-rules selected
    Then project .claude/settings.json shall contain SessionStart hook for health-check.ts
    And health-check.ts shall exist in .dev-pomogator/tools/claude-mem-health/

  # @feature2
  Scenario: CORE019_02 Post-install validation reports worker status
    When installer completes
    Then install report shall contain "claude-mem/worker" component
    And status shall be "ok" or "fail" (not missing)

  # @feature2
  Scenario: CORE019_03 Post-install validation reports chroma status
    When installer completes
    Then install report shall contain "claude-mem/chroma" component
    And status shall be "ok" or "warn" (not fail for chroma)

  # @feature3
  Scenario: CORE019_04 Failure points logged to install.log
    When any claude-mem step fails during install
    Then install.log shall contain ERROR entry with step name and error message
    And install.log shall contain stack trace via formatErrorChain

  # @feature4
  Scenario: CORE019_05 User sees diagnostics on failure
    When claude-mem installation fails
    Then console shall show reason and path to install.log
    And install report shall show per-component table

  # @feature5
  Scenario: CORE019_06 Graceful degradation when chroma unavailable
    When chroma fails to start but worker succeeds
    Then worker shall be running on port 37777
    And MCP shall be registered
    And install report shall show chroma: warn

  # @feature5
  Scenario: CORE019_07 MCP not registered when worker dead
    When worker fails to start
    Then MCP shall NOT be registered in ~/.claude.json
    And install report shall show claude-mem: fail

  # @feature6
  Scenario: CORE019_08 Re-install skips when already running
    Given claude-mem worker is already running on port 37777
    When installer runs again with --claude --all
    Then installer shall skip clone and build
    And hooks shall not be duplicated
    And install report shall show claude-mem: ok

  # @feature7
  Scenario: CORE019_09 Install report has per-component breakdown
    When installer completes
    Then install report shall have rows for worker, chroma, mcp, hooks
    And each row shall have status ok/warn/fail
