Feature: CTXMENU001 Context Menu Setup
  As a developer on Windows
  I want dev-pomogator installer to configure right-click context menu
  So that I can launch Claude Code with YOLO + TUI from any folder

  Background:
    Given dev-pomogator is installed

  # @feature1
  Scenario: CTXMENU001_01 postinstall generates valid NSS content
    Given the context-menu extension postinstall script exists
    When postinstall generates NSS for project path "/test/project"
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
  Scenario: CTXMENU001_03 NSS uses dynamic project path
    Given the context-menu extension postinstall script exists
    When postinstall generates NSS for project path "D:\repos\my-project"
    Then NSS content should contain "D:\repos\my-project\scripts\launch-claude-tui.ps1"
    And NSS content should not contain hardcoded "D:\repos\dev-pomogator"

  # @feature1
  Scenario: CTXMENU001_04 launch script uses compact split ratio
    Given the launch-claude-tui.ps1 script exists
    Then it should contain "-s 0.07" for compact TUI split
    And it should not contain "-s 0.3"

  # @feature1
  Scenario: CTXMENU001_05 YOLO+TUI entry precedes plain YOLO in NSS
    When postinstall generates NSS for any project path
    Then "Claude Code (YOLO + TUI)" should appear before "Claude Code (YOLO)"
    And "Claude Code (YOLO)" should appear before plain "Claude Code"
