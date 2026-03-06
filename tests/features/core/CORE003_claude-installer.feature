Feature: CORE003 Claude Code Installer
  As a developer
  I want to install dev-pomogator for Claude Code
  So that I get all extensions and hooks configured

  Background:
    Given Docker test environment is running
    And base Claude Code fixture is prepared

  Scenario: Clean installation
    Given Claude Code is installed with base configuration
    And dev-pomogator has not been installed before
    When I run "node dist/index.js --claude"
    Then settings.json should contain Stop hooks in ~/.claude/
    And check-update.js should be copied to ~/.dev-pomogator/scripts/
    And selected extensions should be installed to project

  Scenario: Commands are installed to project
    When dev-pomogator installs for Claude Code
    Then .claude/commands/ should exist in project
    And suggest-rules.md should be in .claude/commands/
    And create-spec.md should be in .claude/commands/

  Scenario: Rules are installed to project
    When dev-pomogator installs for Claude Code
    Then .claude/rules/ should exist in project
    And specs-management.md should be in .claude/rules/
    And plan-pomogator.md should be in .claude/rules/
    And research-workflow.md should be in .claude/rules/

  Scenario: Tools are installed to project
    When dev-pomogator installs for Claude Code
    Then .dev-pomogator/tools/specs-generator/ should exist in project
    And .dev-pomogator/tools/forbid-root-artifacts/ should exist in project
    And .dev-pomogator/tools/forbid-root-artifacts/check.py should be executable

  Scenario: Settings.json hooks structure is correct
    When dev-pomogator installs for Claude Code
    Then ~/.claude/settings.json should exist
    And settings.json should contain hooks.Stop array
    And Stop hooks should include check-update.js with --claude flag

  Scenario: Extension hooks use portable relative paths in project settings
    Given dev-pomogator installs for Claude Code with --all
    Then project .claude/settings.json should contain extension hooks
    And extension hook commands should use tsx-runner wrapper
    And extension hook paths should be relative ".dev-pomogator/tools/"
    And extension hook paths should not contain OS-specific absolute paths

  Scenario: Extension hooks with matcher are installed correctly
    Given dev-pomogator installs for Claude Code with --all
    Then project .claude/settings.json should contain PreToolUse hooks
    And PreToolUse hooks should have matcher "Write|Edit"
    And PreToolUse hook command should reference phase-gate.ts via tsx-runner

  @implemented: claude-installer.test.ts > Extension hooks use absolute paths
  Scenario: Re-installation preserves existing hooks
    Given dev-pomogator was previously installed for Claude Code
    And settings.json contains existing Stop hooks
    When I run "node dist/index.js --claude" again
    Then existing Stop hooks should remain
    And check-update.js hook should not be duplicated

  Scenario: Config tracks Claude Code installations
    When dev-pomogator installs for Claude Code
    Then ~/.dev-pomogator/config.json should exist
    And installedExtensions should contain entries with platform "claude"
    And projectPaths should include current project path

  Scenario: tsx-runner resolves script from subdirectory via git root
    Given tsx-runner.js is installed in ~/.dev-pomogator/scripts/
    And .dev-pomogator/tools/ contains hook scripts in project root
    When tsx-runner is invoked from a project subdirectory with relative path
    Then it should find the script by walking up to git root
    And the hook script should execute successfully

  Scenario: Auto-update migrates old-format hooks to portable format
    Given project .claude/settings.json has old-format "npx tsx" hook
    When check-update runs for the project
    Then hook command should be migrated to tsx-runner format
    And hook paths should be portable relative paths

  Scenario: PostInstall hooks install dependencies
    Given dev-pomogator installs for Claude Code with --all
    Then deps-install.py should exist in .dev-pomogator/tools/forbid-root-artifacts/
    And deps-install.py should run without errors
    And pyyaml should be importable by Python
    And pre-commit should be available via python -m pre_commit
    And .pre-commit-config.yaml should contain forbid-root-artifacts hook
