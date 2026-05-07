# Source: generated from .specs/dev-pomogator-canonical-plugin/ spec
# Domain code: CANON (canonical-plugin — make dev-pomogator a canonical Claude Code marketplace plugin)

Feature: CANON001 Canonical Claude Code Marketplace Plugin
  As a developer using dev-pomogator across multiple projects (CLI + Desktop)
  I want dev-pomogator distributed and installed via canonical Anthropic marketplace mechanism
  So that install/update/uninstall managed by Claude Code itself, no custom postinstall hacks, full Desktop compatibility

  Background:
    Given dev-pomogator repo built с canonical artifacts: .claude-plugin/plugin.json + .claude-plugin/marketplace.json + skills/, commands/, hooks/, .mcp.json
    And dev-pomogator marketplace name = "stgmt"
    And dev-pomogator plugin name = "dev-pomogator"

  # =========================================================================
  # @feature1 — Canonical plugin layout (FR-1)
  # =========================================================================

  # @feature1
  Scenario: CANON001_10 plugin.json contains canonical required fields
    Given dev-pomogator repo built via "npm run build:plugin"
    When I read .claude-plugin/plugin.json
    Then file should contain field "name" equal to "dev-pomogator"
    And field "version" matching semver "2.x.x"
    And field "description"
    And field "author" with object structure

  # @feature1
  Scenario: CANON001_11 Canonical sub-directories exist after build
    Given dev-pomogator repo built
    Then skills/ directory should exist with at least one <name>/SKILL.md file
    And commands/ directory should exist
    And hooks/hooks.json should exist
    And .mcp.json should exist
    And agents/ may or may not exist (optional)

  # @feature1
  Scenario: CANON001_12 .claude-plugin contains only plugin.json and marketplace.json
    Given dev-pomogator repo built
    When I list .claude-plugin/ directory contents
    Then directory should contain only "plugin.json" and "marketplace.json"
    And directory should NOT contain "skills/", "commands/", "agents/" sub-directories

  # =========================================================================
  # @feature2 — Marketplace catalog (FR-2)
  # =========================================================================

  # @feature2
  Scenario: CANON001_20 marketplace.json valid per Anthropic schema
    Given dev-pomogator repo built
    When I read .claude-plugin/marketplace.json
    Then file should contain top-level field "name" equal to "stgmt"
    And field "owner" with required "name" sub-field
    And field "plugins" array with at least 1 entry

  # @feature2
  Scenario: CANON001_21 Plugin entry contains required name and source fields
    Given marketplace.json valid
    When I parse plugins[0]
    Then entry should contain "name" equal to "dev-pomogator"
    And "source" equal to "./" (relative path to repo root)
    And optional "description", "version", "author", "license" fields populated

  # =========================================================================
  # @feature3 — Distribution via /plugin marketplace add (FR-3)
  # =========================================================================

  # @feature3 @manual
  Scenario: CANON001_30 /plugin marketplace add registers marketplace
    Given fresh Claude Code session без существующих marketplaces
    When user runs "/plugin marketplace add stgmt/dev-pomogator"
    Then Claude Code should clone dev-pomogator repo
    And read .claude-plugin/marketplace.json
    And register marketplace "stgmt" в Claude Code state
    And marketplace should appear в "/plugin marketplace list" output

  # =========================================================================
  # @feature4 — Install via /plugin install (FR-4)
  # =========================================================================

  # @feature4 @manual
  Scenario: CANON001_40 /plugin install copies plugin to cache
    Given marketplace "stgmt" added в Claude Code session
    When user runs "/plugin install dev-pomogator@stgmt"
    Then Claude Code should copy plugin tree в ~/.claude/plugins/cache/stgmt/dev-pomogator/<version>/
    And plugin.json should be present в cache
    And ~/.claude/settings.json should contain "dev-pomogator@stgmt": true в enabledPlugins

  # =========================================================================
  # @feature5 — Scope-aware install (FR-5)
  # =========================================================================

  # @feature5 @manual
  Scenario: CANON001_50 Default scope is user
    Given marketplace added
    When user runs "/plugin install dev-pomogator@stgmt" без --scope flag
    Then ~/.claude/settings.json should contain enabledPlugins entry
    And <cwd>/.claude/settings.json should NOT contain entry
    And <cwd>/.claude/settings.local.json should NOT contain entry

  # @feature5 @manual
  Scenario: CANON001_51 --scope project writes to committed settings.json
    Given marketplace added
    When user runs "/plugin install dev-pomogator@stgmt --scope project"
    Then <cwd>/.claude/settings.json should contain enabledPlugins entry
    And ~/.claude/settings.json should NOT receive new entry from this install
    And <cwd>/.claude/settings.local.json should NOT receive entry

  # @feature5 @manual
  Scenario: CANON001_52 --scope local writes to gitignored settings.local.json
    Given marketplace added
    When user runs "/plugin install dev-pomogator@stgmt --scope local"
    Then <cwd>/.claude/settings.local.json should contain enabledPlugins entry
    And <cwd>/.claude/settings.json should NOT receive entry
    And ~/.claude/settings.json should NOT receive new entry from this install

  # =========================================================================
  # @feature6 — Activation via /reload-plugins (FR-6)
  # =========================================================================

  # @feature6 @manual
  Scenario: CANON001_60 /reload-plugins activates plugin in current CLI session
    Given plugin installed via "/plugin install dev-pomogator@stgmt"
    And current CLI session does NOT yet see plugin skills
    When user runs "/reload-plugins"
    Then plugin skills should become available в current session
    And /skill picker should list "dev-pomogator:create-spec" (или similar namespaced skill)

  # =========================================================================
  # @feature7 — Migration v1 → v2 cleanup script (FR-7)
  # =========================================================================

  # @feature7
  Scenario: CANON001_70 Cleanup script detects v1 install
    Given test fixture project с .dev-pomogator/.claude-plugin/plugin.json version "1.5.0"
    And no .dev-pomogator/.migrated-to-v2 marker
    When I run "npx tsx tools/migrate-v1-to-v2.ts" в fixture project root
    Then script should print "Detected v1 install, version 1.5.0"
    And script should proceed to cleanup steps

  # @feature7
  Scenario: CANON001_71 Cleanup removes managed project files
    Given test fixture project с v1 install
    When migration script runs
    Then .claude/skills/<dev-pomogator-managed>/ should be removed
    And .claude/rules/<dev-pomogator-managed>/ should be removed
    And .dev-pomogator/ directory should be removed (kept .user-overrides/ если backups created)

  # @feature7
  Scenario: CANON001_72 Cleanup removes .gitignore managed block
    Given test fixture project с marker block в .gitignore
    When migration script runs
    Then .gitignore should NOT contain "# >>> dev-pomogator managed >>>" marker
    And .gitignore should preserve user-authored entries (e.g., "node_modules/")

  # @feature7
  Scenario: CANON001_73 Cleanup backups user-modified files
    Given test fixture project с v1 install
    And .claude/skills/custom-skill/SKILL.md has content hash mismatch from upstream
    When migration script runs
    Then file should be copied to .dev-pomogator/.user-overrides/.claude/skills/custom-skill/SKILL.md
    And original file should still be removed from .claude/skills/

  # @feature7
  Scenario: CANON001_74 Cleanup script idempotent
    Given test fixture project where migration already ran (.migrated-to-v2 marker exists)
    When migration script runs снова
    Then script should exit с code 0
    And stdout should contain informational message "No v1 install detected" or "Already migrated"
    And no project files should be modified

  # @feature7
  Scenario: CANON001_75 Cleanup prints canonical install instructions
    Given test fixture project с v1 install
    When migration script completes successfully
    Then stdout should contain "/plugin marketplace add stgmt/dev-pomogator"
    And stdout should contain "/plugin install dev-pomogator@stgmt"
    And stdout should contain "/reload-plugins"

  # =========================================================================
  # @feature8 — Cursor support removal (FR-8)
  # =========================================================================

  # @feature8
  Scenario: CANON001_80 Legacy CLI --cursor exits with v2 message
    Given dev-pomogator legacy CLI binary still exists for migration utility
    When user runs "dev-pomogator --cursor"
    Then exit code should be non-zero
    And stderr should contain "Cursor support was removed in v2.0"
    And stderr should suggest "Use canonical install: /plugin marketplace add stgmt/dev-pomogator"

  # @feature8
  Scenario: CANON001_81 No extension manifest contains cursor platform
    Given dev-pomogator v2 source repository
    When I grep extensions/*/extension.json для "cursor" string
    Then no extension.json should contain "cursor" в platforms array
    And edge-debug-port extension.json should have platforms equal to ["claude"]

  # @feature8
  Scenario: CANON001_82 package.json description and keywords have no Cursor
    Given dev-pomogator v2 source repository
    When I read package.json
    Then "description" field should not contain "Cursor"
    And "keywords" array should not contain "cursor"

  # =========================================================================
  # @feature9 — buildCanonicalPlugin aggregation (FR-9)
  # =========================================================================

  # @feature9
  Scenario: CANON001_90 buildCanonicalPlugin aggregates all extensions
    Given dev-pomogator repo с 26 extensions
    When I run "npm run build:plugin"
    Then .claude-plugin/plugin.json should be generated/updated
    And skills/ directory should contain SKILL.md from all extensions с skills declared
    And commands/ should contain all commands from extensions
    And hooks/hooks.json should aggregate hooks from extension manifests

  # =========================================================================
  # @feature10 — Update path (FR-10)
  # =========================================================================

  # @feature10
  Scenario: CANON001_100 marketplace.json and plugin.json versions synchronized
    Given dev-pomogator repo built
    When I read .claude-plugin/marketplace.json plugin entry version
    And I read .claude-plugin/plugin.json version
    Then both version strings should be equal

  # =========================================================================
  # @feature11 — Desktop compatibility (FR-11)
  # =========================================================================

  # @feature11 @manual
  Scenario: CANON001_110 Skills visible in Claude Desktop after install
    Given dev-pomogator installed via canonical "/plugin install dev-pomogator@stgmt"
    And Claude Desktop application restarted (если был open)
    When user opens Claude Desktop Skill picker
    Then skills из ~/.claude/plugins/cache/stgmt/dev-pomogator/<version>/skills/ should be listed
    And no additional Desktop configuration should be required beyond install

  # =========================================================================
  # @feature12 — Uninstall canonical (FR-12)
  # =========================================================================

  # @feature12 @manual
  Scenario: CANON001_120 /plugin uninstall removes cache and enabledPlugins entry
    Given dev-pomogator installed at user scope
    When user runs "/plugin uninstall dev-pomogator@stgmt"
    Then ~/.claude/plugins/cache/stgmt/dev-pomogator/ should be removed
    And ~/.claude/settings.json should NOT contain "dev-pomogator@stgmt" в enabledPlugins
    And ~/.claude/settings.json should preserve other user keys unchanged
