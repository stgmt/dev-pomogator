Feature: CTXMENU001_Context_Menu_Setup
  Windows right-click context menu integration for Claude Code and Codex via Nilesoft Shell.
  Exported functions: generateNss, copyLaunchScript, bundledLaunchScriptPath.

  @feature1
  Scenario: CTXMENU001_01 generateNss produces a single elevated YOLO+TUI entry
    Given the context-menu postinstall module is imported
    When generateNss is called
    Then the NSS content should contain "Claude Code (YOLO + TUI)"
    And the NSS content should contain "admin=true"
    And the NSS content should contain "-Yolo"
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
  Scenario: CTXMENU001_05 generateNss produces exactly one menu entry
    Given the context-menu postinstall module is imported
    When generateNss is called
    Then the NSS content should contain exactly 1 "item(" entry

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

  @feature6
  Scenario: CTXMENU001_13 every launch entry logs invocation regardless of TUI/NoTui/Yolo combination
    Given pwsh is available
    When the launch-claude-tui.ps1 script is invoked with -NoTui and a project dir
    Then a log file should be created at ~/.dev-pomogator/logs/context-menu-launch.log
    And the log should contain "launch-claude-tui.ps1 invoked"
    And the log should contain the resolved project dir
    And the generated Claude launcher should set TEST_STATUSLINE_PROJECT with forward slashes

  @feature6
  Scenario: CTXMENU001_14 failed claude launch is logged with ERROR and exit code
    Given pwsh is available and wt.exe is unavailable
    When the launch-claude-tui.ps1 script is invoked with -NoTui and a project dir
    Then the log should contain "ERROR"

  @feature7
  Scenario: CTXMENU001_15 -Yolo launch on an untrusted directory auto-grants trust before invoking claude
    Given pwsh is available and a temporary ~/.claude.json fixture with no entry for the target directory
    When the launch-claude-tui.ps1 script is invoked with -Yolo -NoTui and the target directory
    Then the fixture should have hasTrustDialogAccepted true for the target directory
    And the log should contain "trust granted"

  @feature7
  Scenario: CTXMENU001_16 plain non-Yolo launch never writes to claude.json
    Given pwsh is available and a temporary ~/.claude.json fixture with no entry for the target directory
    When the launch-claude-tui.ps1 script is invoked with -NoTui and the target directory
    Then the fixture should be unchanged

  @feature6
  Scenario: CTXMENU001_17 the single NSS entry routes through launch-claude-tui.ps1 not bare claude
    Given the context-menu postinstall module is imported
    When generateNss is called
    Then the NSS "Claude Code (YOLO + TUI)" entry command should reference "launch-claude-tui.ps1"
    And the NSS "Claude Code (YOLO + TUI)" entry command should not call claude directly

  @feature8
  Scenario: CTXMENU001_18 Codex support is added without removing the Claude Code channel
    Given the context-menu postinstall module is imported
    When the combined Nilesoft imports are generated
    Then the shell.nss content should contain "imports/claude-code.nss"
    And the shell.nss content should contain "imports/Codex.nss"
    And the generated entries should include "Claude Code (YOLO + TUI)"
    And the generated entries should include "Codex (YOLO)"

  @feature9
  Scenario: CTXMENU001_19 Codex NSS produces a single elevated YOLO entry without TUI
    Given the context-menu postinstall module is imported
    When the Codex NSS content is generated
    Then the Codex NSS content should contain exactly 1 "item(" entry
    And the Codex NSS content should contain "Codex (YOLO)"
    And the Codex NSS content should contain "admin=true"
    And the Codex NSS content should contain "-Yolo"
    And the Codex NSS content should contain "-NoTui"
    And the Codex NSS content should contain "launch-Codex-tui.ps1"
    And the Codex NSS content should not contain "Codex (YOLO + TUI)"
    And the Codex NSS content should not contain "launch-claude-tui.ps1"

  @feature10
  Scenario: CTXMENU001_20 Codex NSS references the same path that the Codex script copy writes to
    Given the context-menu postinstall module is imported
    When the Codex NSS content is generated
    Then the Codex NSS content should contain the global path home/.dev-pomogator/scripts/launch-Codex-tui.ps1
    And the bundled Codex launch script path should end with "scripts/launch-Codex-tui.ps1"

  @feature11
  Scenario: CTXMENU001_21 Codex YOLO launch uses Codex-native full-access flags
    Given the launch-Codex-tui.ps1 script file is read
    Then the Codex launch script should contain "--dangerously-bypass-approvals-and-sandbox"
    And the Codex launch script should not contain "--dangerously-skip-permissions"
    And the Codex launch script should invoke "codex"

  @feature11
  Scenario: CTXMENU001_22 Codex trust handling does not touch Claude trust state
    Given pwsh is available and a temporary Codex config.toml fixture with no entry for the target directory
    When the launch-Codex-tui.ps1 script is invoked with -Yolo -NoTui and the target directory
    Then the Codex config fixture should have trust_level "trusted" for the target directory
    And the Claude trust fixture should be unchanged

  @feature12
  Scenario: CTXMENU001_23 Codex-only postinstall mode does not modify Claude menu artifacts
    Given the context-menu postinstall module is imported
    When the Codex-only postinstall plan is generated
    Then the Codex-only plan should copy only the Codex launch script
    And the Codex-only plan should write only "Codex.nss"
    And the Codex-only shell imports should contain "imports/Codex.nss"
    And the Codex-only shell imports should not contain "imports/claude-code.nss"

  @feature13
  Scenario: CTXMENU001_24 Codex install uses a first-class launcher script
    When the install-codex-context-menu.ps1 script file is read
    Then the Codex install launcher should contain "codex"
    And the Codex install launcher should contain "plugin marketplace add"
    And the Codex install launcher should contain "plugin add"
    And the Codex install launcher should contain "context-menu@dev-pomogator-codex"
    And the Codex install launcher should contain "tools/context-menu/postinstall.ts"
    And the Codex install launcher should contain "--codex-only"
    And the Codex install launcher should not contain "npm"
    And the Codex install launcher should not contain "npx"
    And the Codex install launcher should not contain "--Codex"

  @feature14
  Scenario: CTXMENU001_25 Codex icon is installed by the Codex channel
    Given the context-menu postinstall module is imported
    When the Codex-only postinstall plan is generated
    Then the Codex-only plan should install only "codex-icon.ico"
    When the Codex icon file candidates are generated for a Windows app install
    Then the Codex icon file candidates should include "WindowsApps/OpenAI.Codex_1.2.3.0_x64__2p2nqsd0c76g0/app/resources/icon.ico"
    When the fallback Codex icon is generated
    Then the fallback Codex icon should be a valid ICO file
    And the Codex NSS content should contain "codex-icon.ico"

  @feature15
  Scenario: CTXMENU001_26 Codex resolves a selected project to a bare filesystem path
    Given the launch-Codex-tui.ps1 script file is read
    Then the Codex launch script should contain "ProviderPath"

  @live-evidence @windows-unc
  @feature15
  Scenario: CTXMENU001_27 a UNC Codex launch uses a unique PowerShell pane without wt.exe working-directory injection
    Given pwsh is available and no stale generated Codex panes exist
    And Codex resolves to a PowerShell shim beside a cmd shim
    When launch-Codex-tui.ps1 is invoked non-interactively for a UNC project
    Then exactly one unique Codex PowerShell pane should exist
    And the Codex PowerShell pane should set the selected project with Set-Location -LiteralPath
    And the Codex launch script should not pass a UNC project to wt.exe -d

  @feature15
  Scenario: CTXMENU001_28 a drive-backed Codex project gets a unique cmd pane with escaped paths
    Given pwsh is available and no stale generated Codex panes exist
    When launch-Codex-tui.ps1 is invoked non-interactively for a drive project containing percent signs
    Then exactly one unique Codex cmd pane should exist
    And the Codex cmd pane should preserve the literal selected project path
    And no generated Codex PowerShell pane should exist

  @feature15
  Scenario: CTXMENU001_29 worktree launchers resolve repository roots through ProviderPath
    When the worktree launcher scripts are read
    Then every worktree launcher should resolve MainRepoRoot through ProviderPath

  @feature16
  Scenario: CTXMENU001_30 Nilesoft uses the canonical exact non-interactive winget contract
    Given the context-menu postinstall module is imported
    When the Nilesoft winget arguments are generated
    Then the Nilesoft winget arguments should equal the canonical Nilesoft.Shell contract
    And the Nilesoft winget arguments should not contain "Nilesoft.NilesoftShell"

  @feature16
  Scenario: CTXMENU001_31 context-menu skill resolves bootstrap from the installed plugin root
    When the context-menu skill files are read
    Then both context-menu skills should resolve bootstrap from CLAUDE_PLUGIN_ROOT before process cwd

  @feature16
  Scenario: CTXMENU001_32 failed Nilesoft availability prevents every context-menu write
    Given the context-menu postinstall source is read
    Then Nilesoft availability should be required before every context-menu artifact write

  @feature16
  Scenario: CTXMENU001_33 generated NSS contains no dangling icon reference
    Given the context-menu postinstall module is imported
    When the Claude NSS content is generated
    Then the Claude NSS should not reference an icon that the install plan does not produce
