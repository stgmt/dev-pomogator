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

  # @feature4 @feature5 — links to FR-4 (spec structure) + FR-5 (cross-refs traceability)
  Scenario: INSTALL_DIAG_04 Skill references this spec for full context
    When the user runs slash command "/install-diagnostics"
    Then the skill output SHALL contain a reference to .specs/install-diagnostics/RESEARCH.md
    And the skill output SHALL contain a reference to CORE003_18 and CORE003_19 BDD scenarios

  # ============================================================
  # Second Failure Mode scenarios (2026-04-20, @feature6)
  # Prompt-race on Windows PowerShell (npm/cli#7147)
  # ============================================================

  # @feature6 — links to FR-6 (Mode B detection)
  Scenario: INSTALL_DIAG_05 Skill identifies Mode B on empty _npx hash folder
    Given the host OS is Windows
    And "_npx/<hash>/" directory exists but contains no node_modules/
    And `~/.dev-pomogator/logs/install.log` mtime did not advance during install attempt
    And stderr of user npx run was empty (apart from "Ok to proceed? (y)" prompt)
    And reproduction with `npx --yes github:stgmt/dev-pomogator` in fresh NPM_CONFIG_CACHE completes with exit 0
    When the user runs slash command "/install-diagnostics"
    Then the skill SHALL classify failure as "Mode B — npm Confirmation Prompt Race"
    And the skill SHALL cite npm/cli#7147 issue link
    And the skill SHALL recommend `npx --yes github:stgmt/dev-pomogator --claude` as the primary fix
    And the skill SHALL NOT recommend cleaning _npx cache (that doesn't fix prompt-race)

  # @feature6 — links to FR-6 (sequential A+B)
  Scenario: INSTALL_DIAG_06 Skill reports A+B sequential when both indicators present
    Given the host OS is Windows
    And "_npx/<hash>/" contains partial `@inquirer/...` folders but no dev-pomogator
    And stderr contains at least one "npm warn cleanup" line with EPERM
    And reproduction with --yes still fails with same EPERM
    And also reproduction without --yes produces empty _npx hash folder when cache is fresh
    When the user runs slash command "/install-diagnostics"
    Then the skill SHALL report classification "Mode: A+B (sequential)"
    And the skill SHALL explain that Mode B blocks user from reaching Mode A issue
    And the skill SHALL recommend both FR-7 docs fix AND upstream npm fix tracking

  # @feature6 — links to FR-7 (docs hardening) via lint
  Scenario: INSTALL_DIAG_07 Lint detects unsafe npx command in user-facing docs
    Given repo contains file `extensions/example/README.md` with line `npx github:stgmt/dev-pomogator --claude`
    And that file is not listed in lint exceptions
    And that line does not have a `<!-- lint-install: allow -->` marker nearby
    When CI runs `npx tsx tools/lint-install-commands.ts`
    Then exit code SHALL be non-zero
    And stderr SHALL contain the file path and line number
    And stderr SHALL suggest replacement with `npx --yes github:stgmt/dev-pomogator --claude`

  # @feature6 — links to FR-8 (lint passes when docs are safe)
  Scenario: INSTALL_DIAG_08 Lint passes when all user-facing docs use --yes flag
    Given all `.md` files containing "npx" and "dev-pomogator" also contain `--yes` or `-y` flag
    When CI runs `npx tsx tools/lint-install-commands.ts`
    Then exit code SHALL be 0
    And stdout SHALL contain summary "N docs scanned, 0 violations"

  # @feature6 — links to FR-9 (CORE003_20 regression)
  Scenario: INSTALL_DIAG_09 CORE003_20 reproduces prompt-race failure mode
    Given a fresh NPM_CONFIG_CACHE directory via mkdtemp
    And empty stdin (no "y" answer provided to npx)
    When test spawnSync invokes `npx github:stgmt/dev-pomogator --claude --all` without --yes
    Then the spawnSync call returns within 30 seconds
    And "_npx/<hash>/node_modules/dev-pomogator/package.json" does NOT exist after the run
    And `~/.dev-pomogator/logs/install.log` mtime did not advance
    And the test passes as "prompt-race reproduced"
