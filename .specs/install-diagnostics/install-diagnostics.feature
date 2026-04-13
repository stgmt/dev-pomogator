# Source: tests/features/core/CORE003_claude-installer.feature (CORE003_18, CORE003_19)
# This file documents own scenarios for the install-diagnostics SKILL behaviour.
# Cross-platform regression scenarios live in CORE003_claude-installer.feature.

Feature: INSTALL_DIAG Silent Install Diagnostics

  Background:
    Given dev-pomogator is installed
    And the user invokes a slash command from Claude Code

  # @feature1 — links to FR-1 (Linux control test)
  Scenario: INSTALL_DIAG_01 Skill correctly identifies Linux happy path as Mode None
    Given the host OS is Linux
    And `~/.dev-pomogator/logs/install.log` mtime is recent (less than 5 minutes old)
    And `~/.dev-pomogator/last-install-report.md` exists with status "ok"
    When the user runs slash command "/install-diagnostics"
    Then the skill SHALL report "no failure mode detected"
    And the skill SHALL recommend no fix action

  # @feature2 — links to FR-2 (Windows TDD red regression)
  Scenario: INSTALL_DIAG_02 Skill identifies Mode A on Windows EPERM evidence
    Given the host OS is Windows
    And npm cache log contains "npm warn cleanup" with EPERM on @inquirer/external-editor
    And `_npx/<hash>/node_modules/dev-pomogator/package.json` does NOT exist
    And `~/.dev-pomogator/logs/install.log` mtime did not advance during install attempt
    When the user runs slash command "/install-diagnostics"
    Then the skill SHALL classify failure as "Mode A — Windows EPERM на reify cleanup"
    And the skill SHALL show evidence including the cleanup warning lines
    And the skill SHALL recommend git clone source install as recommended fix

  # @feature3 — links to FR-3 (helper API)
  Scenario: INSTALL_DIAG_03 Skill suggests runInstallerViaNpx for reproduction
    Given the user wants to reproduce silent install failure programmatically
    When the user runs slash command "/install-diagnostics"
    Then the skill SHALL provide a tests/e2e/helpers.ts code snippet using runInstallerViaNpx with fresh option
    And the skill SHALL explain that the helper captures cleanup warnings at verbose loglevel

  # @feature4 — links to FR-4 (spec structure)
  Scenario: INSTALL_DIAG_04 Skill references this spec for full context
    When the user runs slash command "/install-diagnostics"
    Then the skill output SHALL contain a reference to .specs/install-diagnostics/RESEARCH.md
    And the skill output SHALL contain a reference to CORE003_18 and CORE003_19 BDD scenarios
