Feature: CTXMENU001 Context Menu Setup
  As a developer on Windows
  I want dev-pomogator installer to configure right-click context menu
  So that I can launch Claude Code with YOLO + TUI from any folder

  Background:
    Given dev-pomogator is installed

  # @feature1
  Scenario: CTXMENU001_01 postinstall generates valid NSS content
    Given the context-menu extension postinstall script exists
    When postinstall generates NSS content
    Then NSS content should contain "Claude Code (YOLO + TUI)"
    And NSS content should contain "Claude Code (YOLO)"
    And NSS content should contain "Claude Code"
    And NSS content should contain "launch-claude-tui.ps1"

  # @feature1
  Scenario: CTXMENU001_02 postinstall skips on non-Windows
    Given the platform is not Windows
    When postinstall runs
    Then it should exit with code 0
    And no NSS file should be created

  # @feature1
  Scenario: CTXMENU001_03 NSS uses global scripts path
    Given the context-menu extension postinstall script exists
    When postinstall generates NSS content
    Then NSS content should contain ".dev-pomogator" in the launch script path
    And NSS content should not contain project-specific paths

  # @feature1
  Scenario: CTXMENU001_04 launch script uses compact split ratio
    Given the launch-claude-tui.ps1 script exists
    Then it should contain "-s 0.07" for compact TUI split
    And it should not contain "-s 0.3"

  # @feature1
  Scenario: CTXMENU001_05 YOLO+TUI entry precedes plain YOLO in NSS
    When postinstall generates NSS content
    Then "Claude Code (YOLO + TUI)" should appear before "Claude Code (YOLO)"
    And "Claude Code (YOLO)" should appear before plain "Claude Code"

  # @feature1
  Scenario: CTXMENU001_06 postinstall runs end-to-end and produces output
    Given the context-menu extension postinstall script exists
    When postinstall runs
    Then it should exit with code 0
    And it should produce non-empty output

  # @feature2 — launch script must exist at the global path the NSS references
  Scenario: CTXMENU001_07 copyLaunchScript installs the launch script to the global path
    Given a bundled launch-claude-tui.ps1 source file
    When copyLaunchScript copies it to a target path
    Then the target file should exist
    And the target content should equal the source content

  # @feature2
  Scenario: CTXMENU001_08 copyLaunchScript reports failure when the source is missing
    Given the bundled launch script source does not exist
    When copyLaunchScript runs
    Then it should return false
    And the target file should not be created

  # @feature3 — every launch is logged so a failed right-click leaves a trace
  Scenario: CTXMENU001_09 launch script logs every invocation
    Given the launch-claude-tui.ps1 script exists
    When the launch script runs with a temporary HOME
    Then a log file should be created under ~/.dev-pomogator/logs
    And the log should contain the invocation marker

  # @feature3
  Scenario: CTXMENU001_10 launch script fails gracefully without hanging when wt.exe is absent
    Given the launch-claude-tui.ps1 script exists
    And Windows Terminal is not available
    When the launch script runs non-interactively
    Then it should exit with a non-zero code
    And the log should contain an ERROR entry

  # @feature2 — the launch script the NSS references must ship in the plugin tree
  Scenario: CTXMENU001_11 bundled launch script exists in the plugin tree
    When bundledLaunchScriptPath is resolved
    Then it should point to an existing scripts/launch-claude-tui.ps1 file

  # @feature2 — drift guard: NSS entry path == copyLaunchScript target
  Scenario: CTXMENU001_12 generated NSS references the global launch-script path
    When postinstall generates NSS content
    Then the NSS should reference ~/.dev-pomogator/scripts/launch-claude-tui.ps1
    And that path should equal copyLaunchScript's default target
