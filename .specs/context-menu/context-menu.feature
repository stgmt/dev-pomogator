@windows-only
Feature: CTXMENU001_Context_Menu_Setup
  Windows right-click context menu integration for Claude Code via Nilesoft Shell.
  Exported functions: generateNss, copyLaunchScript, bundledLaunchScriptPath.

  @feature1
  Scenario: CTXMENU001_01 generateNss produces NSS with all three Claude Code entries
    Given the context-menu postinstall module is imported
    When generateNss is called
    Then the NSS content should contain "Claude Code (YOLO + TUI)"
    And the NSS content should contain "Claude Code (YOLO)"
    And the NSS content should contain "Claude Code"
    And the NSS content should contain "launch-claude-tui.ps1"

  @feature1 @manual
  Scenario: CTXMENU001_02 postinstall skips on non-Windows and exits 0
    When the postinstall script is executed via tsx
    Then the context-menu postinstall exit status should be 0
    And the context-menu postinstall stdout should contain "Skipped"

  @feature1
  Scenario: CTXMENU001_03 generateNss uses global scripts path not project-specific paths
    Given the context-menu postinstall module is imported
    When generateNss is called
    Then the NSS content should contain ".dev-pomogator"
    And the NSS content should not contain "D:\\repos\\dev-pomogator"

  @feature5
  Scenario: CTXMENU001_04 launch script contains compact split ratio flag
    When the launch-claude-tui.ps1 script file is read
    Then the launch script should contain "-s 0.07"
    And the launch script should not contain "-s 0.3"

  @feature1
  Scenario: CTXMENU001_05 YOLO+TUI entry appears before plain YOLO entry in NSS
    Given the context-menu postinstall module is imported
    When generateNss is called
    Then the NSS "YOLO + TUI" entry index should be less than the "Claude Code (YOLO)" entry index

  @feature2
  Scenario: CTXMENU001_06 postinstall exits 0 and produces non-empty output via tsx integration
    When the postinstall script is executed via tsx
    Then the context-menu postinstall exit status should be 0
    And the context-menu postinstall combined output should be non-empty

  @feature3
  Scenario: CTXMENU001_07 copyLaunchScript copies bundled script to target path
    Given a temporary directory exists for context-menu copy test
    When copyLaunchScript is called with an existing source and a temporary destination
    Then copyLaunchScript should return true
    And the destination file should exist and match the source

  @feature3
  Scenario: CTXMENU001_08 copyLaunchScript returns false when source is missing
    Given a temporary directory exists for context-menu copy test
    When copyLaunchScript is called with a missing source path
    Then copyLaunchScript should return false
    And the destination file should not exist

  @manual
  Scenario: CTXMENU001_09 launch script logs every invocation
    Given pwsh is available and not on Windows
    When the launch-claude-tui.ps1 script is invoked with a project dir
    Then a log file should be created at ~/.dev-pomogator/logs/context-menu-launch.log
    And the log should contain "launch-claude-tui.ps1 invoked"

  @manual
  Scenario: CTXMENU001_10 launch script fails gracefully when wt.exe is absent
    Given pwsh is available and not on Windows
    When the launch-claude-tui.ps1 script is invoked without wt.exe
    Then the exit status should be 1
    And the log should contain "ERROR:"

  @feature3
  Scenario: CTXMENU001_11 bundledLaunchScriptPath resolves to a real file
    Given the context-menu postinstall module is imported
    When bundledLaunchScriptPath is called
    Then the returned path should end with "scripts/launch-claude-tui.ps1"
    And the file at that path should exist

  @feature4
  Scenario: CTXMENU001_12 NSS references the same path that copyLaunchScript writes to
    Given the context-menu postinstall module is imported
    When generateNss is called
    Then the NSS content should contain the global path home/.dev-pomogator/scripts/launch-claude-tui.ps1
