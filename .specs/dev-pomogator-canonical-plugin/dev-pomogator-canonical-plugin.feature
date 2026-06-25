# Source: generated from .specs/dev-pomogator-canonical-plugin/ spec
# Domain code: CANON (canonical-plugin — make dev-pomogator a canonical Claude Code marketplace plugin)

Feature: CANON001 Canonical Claude Code Marketplace Plugin
  As a developer using dev-pomogator across multiple projects (CLI + Desktop)
  I want dev-pomogator distributed and installed via canonical Anthropic marketplace mechanism
  So that install/update/uninstall managed by Claude Code itself, no custom postinstall hacks, full Desktop compatibility

  Background:
    Given dev-pomogator repo with hand-maintained canonical manifests: .claude-plugin/plugin.json + .claude-plugin/marketplace.json + .claude-plugin/hooks.json, plus skills/, commands/, .mcp.json, tools/
    And dev-pomogator marketplace name = "stgmt"
    And dev-pomogator plugin name = "dev-pomogator"

  # =========================================================================
  # @feature1 — Canonical plugin layout (FR-1)
  # =========================================================================

  @feature1
  Scenario: CANON001_10 plugin.json contains canonical required fields
    Given dev-pomogator repo with hand-maintained .claude-plugin/ manifests
    When I read .claude-plugin/plugin.json
    Then file should contain field "name" equal to "dev-pomogator"
    And field "version" matching semver "2.x.x"
    And field "description"
    And field "author" with object structure

  @feature1
  Scenario: CANON001_11 Canonical sub-directories and hooks config exist
    Given dev-pomogator repo with hand-maintained .claude-plugin/ manifests
    Then skills/ directory should exist with at least one <name>/SKILL.md file
    And commands/ directory should exist
    And .claude-plugin/hooks.json should exist
    And .mcp.json should exist
    And agents/ may or may not exist (optional)

  @feature1
  Scenario: CANON001_12 .claude-plugin contains only plugin.json, marketplace.json and hooks.json
    Given dev-pomogator repo with hand-maintained .claude-plugin/ manifests
    When I list .claude-plugin/ directory contents
    Then directory should contain only "plugin.json", "marketplace.json" and "hooks.json"
    And directory should NOT contain "skills/", "commands/", "agents/" sub-directories

  # =========================================================================
  # @feature2 — Marketplace catalog (FR-2)
  # =========================================================================

  @feature2
  Scenario: CANON001_20 marketplace.json valid per Anthropic schema
    Given dev-pomogator repo with hand-maintained .claude-plugin/ manifests
    When I read .claude-plugin/marketplace.json
    Then file should contain top-level field "name" equal to "stgmt"
    And field "owner" with required "name" sub-field
    And field "plugins" array with at least 1 entry

  @feature2
  Scenario: CANON001_21 Plugin entry contains required name and source fields
    Given marketplace.json valid
    When I parse plugins[0]
    Then entry should contain "name" equal to "dev-pomogator"
    And "source" equal to "./" (relative path to repo root)
    And optional "description", "version", "author", "license" fields populated

  # =========================================================================
  # @feature3 — Distribution via /plugin marketplace add (FR-3)
  # =========================================================================

  @feature3 @manual
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

  @feature4 @manual
  Scenario: CANON001_40 /plugin install copies plugin to cache
    Given marketplace "stgmt" added в Claude Code session
    When user runs "/plugin install dev-pomogator@stgmt"
    Then Claude Code should copy plugin tree в ~/.claude/plugins/cache/stgmt/dev-pomogator/<version>/
    And plugin.json should be present в cache
    And ~/.claude/settings.json should contain "dev-pomogator@stgmt": true в enabledPlugins

  # =========================================================================
  # @feature5 — Scope-aware install (FR-5)
  # =========================================================================

  @feature5 @manual
  Scenario: CANON001_50 Default scope is user
    Given marketplace added
    When user runs "/plugin install dev-pomogator@stgmt" без --scope flag
    Then ~/.claude/settings.json should contain enabledPlugins entry
    And <cwd>/.claude/settings.json should NOT contain entry
    And <cwd>/.claude/settings.local.json should NOT contain entry

  @feature5 @manual
  Scenario: CANON001_51 --scope project writes to committed settings.json
    Given marketplace added
    When user runs "/plugin install dev-pomogator@stgmt --scope project"
    Then <cwd>/.claude/settings.json should contain enabledPlugins entry
    And ~/.claude/settings.json should NOT receive new entry from this install
    And <cwd>/.claude/settings.local.json should NOT receive entry

  @feature5 @manual
  Scenario: CANON001_52 --scope local writes to gitignored settings.local.json
    Given marketplace added
    When user runs "/plugin install dev-pomogator@stgmt --scope local"
    Then <cwd>/.claude/settings.local.json should contain enabledPlugins entry
    And <cwd>/.claude/settings.json should NOT receive entry
    And ~/.claude/settings.json should NOT receive new entry from this install

  # =========================================================================
  # @feature6 — Activation via /reload-plugins (FR-6)
  # =========================================================================

  @feature6 @manual
  Scenario: CANON001_60 /reload-plugins activates plugin in current CLI session
    Given plugin installed via "/plugin install dev-pomogator@stgmt"
    And current CLI session does NOT yet see plugin skills
    When user runs "/reload-plugins"
    Then plugin skills should become available в current session
    And /skill picker should list "dev-pomogator:create-spec" (или similar namespaced skill)

  # =========================================================================
  # @feature7 — Migration v1 → v2 cleanup script (FR-7)
  # =========================================================================

  @feature7
  Scenario: CANON001_70 Cleanup script detects v1 install
    Given test fixture project с .dev-pomogator/.claude-plugin/plugin.json version "1.5.0"
    And no .dev-pomogator/.migrated-to-v2 marker
    When I run "npx tsx tools/migrate-v1-to-v2.ts" в fixture project root
    Then script should print "Detected v1 install, version 1.5.0"
    And script should proceed to cleanup steps

  @feature7
  Scenario: CANON001_71 Cleanup removes managed project files
    Given test fixture project с v1 install
    When migration script runs
    Then .claude/skills/<dev-pomogator-managed>/ should be removed
    And .claude/rules/<dev-pomogator-managed>/ should be removed
    And .dev-pomogator/ directory should be removed (kept .user-overrides/ если backups created)

  @feature7
  Scenario: CANON001_72 Cleanup removes .gitignore managed block
    Given test fixture project с marker block в .gitignore
    When migration script runs
    Then .gitignore should NOT contain "# >>> dev-pomogator managed >>>" marker
    And .gitignore should preserve user-authored entries (e.g., "node_modules/")

  @feature7
  Scenario: CANON001_73 Cleanup backups user-modified files
    # Reconciliation: the script backs up .claude/skills/ + .claude/rules/ to
    # .dev-pomogator/.user-overrides/, then safeRemove('.dev-pomogator/') destroys the backup.
    # Only .dev-pomogator/.migrated-to-v2 survives. Backup is therefore transient (a design
    # quirk: .user-overrides/ is inside .dev-pomogator/ which is the first removal target).
    # Step-def uses --dry-run pre-flight in the Given step to verify backup would include
    # custom-skill (count >= 2), then confirms real run reports same count in stdout.
    Given test fixture project с v1 install
    And .claude/skills/custom-skill/SKILL.md has content hash mismatch from upstream
    When migration script runs
    Then file should be copied to .dev-pomogator/.user-overrides/.claude/skills/custom-skill/SKILL.md
    And original file should still be removed from .claude/skills/

  @feature7
  Scenario: CANON001_74 Cleanup script idempotent
    Given test fixture project where migration already ran (.migrated-to-v2 marker exists)
    When migration script runs снова
    Then script should exit с code 0
    And stdout should contain informational message "No v1 install detected" or "Already migrated"
    And no project files should be modified

  @feature7
  Scenario: CANON001_75 Cleanup prints canonical install instructions
    Given test fixture project с v1 install
    When migration script completes successfully
    Then stdout should contain "/plugin marketplace add stgmt/dev-pomogator"
    And stdout should contain "/plugin install dev-pomogator@stgmt"
    And stdout should contain "/reload-plugins"

  # =========================================================================
  # @feature8 — Cursor support removal (FR-8)
  # =========================================================================

  @feature8 @wip
  Scenario: CANON001_80 Legacy CLI --cursor exits with v2 message
    Given dev-pomogator legacy CLI binary still exists for migration utility
    When user runs "dev-pomogator --cursor"
    Then exit code should be non-zero
    And stderr should contain "Cursor support was removed in v2.0"
    And stderr should suggest "Use canonical install: /plugin marketplace add stgmt/dev-pomogator"

  @feature8
  Scenario: CANON001_81 No cursor references remain in the repo
    Given dev-pomogator v2 source repository (no extensions/ or extension.json — deleted)
    When I grep the whole repo (tools/, .claude/, package.json, .claude-plugin/) for "cursor"
    Then no functional cursor reference should remain
    And any match should be only a historical note ("removed in v2")

  @feature8
  Scenario: CANON001_82 package.json description and keywords have no Cursor
    Given dev-pomogator v2 source repository
    When I read package.json
    Then "description" field should not contain "Cursor"
    And "keywords" array should not contain "cursor"

  # =========================================================================
  # @feature9 — Manifest integrity / drift test (FR-9)
  # =========================================================================

  @feature9
  Scenario: CANON001_90 drift test asserts hooks.json commands resolve to on-disk tools
    Given dev-pomogator repo with hand-maintained .claude-plugin/ manifests
    When I run the drift test "tests/e2e/canonical-plugin.test.ts"
    Then every hook command in .claude-plugin/hooks.json should resolve to an existing script under tools/
    And every registered hook script under tools/ should be present in .claude-plugin/hooks.json
    And .claude-plugin/plugin.json, marketplace.json and hooks.json should be schema-valid per Anthropic spec
  # Reconciliation: "When I run the drift test 'tests/e2e/canonical-plugin.test.ts'" would be
  # self-referential (launching the vitest twin from inside cucumber). Step-def performs the
  # identical in-process checks: reads hooks.json, validates each command resolves to an on-disk
  # tools/ file, checks bootstrap.cjs exists, validates plugin.json + marketplace.json fields.

  @feature9
  Scenario: CANON001_91 hook resolves plugin-relative child script via CLAUDE_PLUGIN_ROOT from a foreign CWD
    Given a plugin tree at a CLAUDE_PLUGIN_ROOT separate from the session CWD
    And the session CWD is an unrelated project with no plugin files
    When a hook bootstraps tsx-runner and passes a plugin-relative child script "tools/<x>.ts"
    Then tsx-runner should resolve the script against CLAUDE_PLUGIN_ROOT, not the CWD
    And the script should execute (no ENOENT) for an external user

  @feature9
  Scenario: CANON001_92 the published npm package ships the spec-check-log bin and it runs
    Given the dev-pomogator repo is packed with npm pack and unpacked into a temp dir
    Then the packed tarball should contain the spec-check-log bin cli and writer source files
    And the packed package.json maps dev-pomogator-spec-check-log to the bin.cjs launcher
    And the packed bin.cjs runs with --count against an empty repo and prints 0

  # =========================================================================
  # @feature10 — Update path (FR-10)
  # =========================================================================

  @feature10
  Scenario: CANON001_100 marketplace.json and plugin.json versions synchronized
    Given dev-pomogator repo with hand-maintained .claude-plugin/ manifests
    When I read .claude-plugin/marketplace.json plugin entry version
    And I read .claude-plugin/plugin.json version
    Then both version strings should be equal

  # =========================================================================
  # @feature11 — Desktop compatibility (FR-11)
  # =========================================================================

  @feature11 @manual
  Scenario: CANON001_110 Skills visible in Claude Desktop after install
    Given dev-pomogator installed via canonical "/plugin install dev-pomogator@stgmt"
    And Claude Desktop application restarted (если был open)
    When user opens Claude Desktop Skill picker
    Then skills из ~/.claude/plugins/cache/stgmt/dev-pomogator/<version>/skills/ should be listed
    And no additional Desktop configuration should be required beyond install

  # =========================================================================
  # @feature12 — Uninstall canonical (FR-12)
  # =========================================================================

  @feature12 @manual
  Scenario: CANON001_120 /plugin uninstall removes cache and enabledPlugins entry
    Given dev-pomogator installed at user scope
    When user runs "/plugin uninstall dev-pomogator@stgmt"
    Then ~/.claude/plugins/cache/stgmt/dev-pomogator/ should be removed
    And ~/.claude/settings.json should NOT contain "dev-pomogator@stgmt" в enabledPlugins
    And ~/.claude/settings.json should preserve other user keys unchanged

  # --- FR-13: plugin hooks resolve independent of process CWD ---

  @feature13
  Scenario Outline: HOOKSCWD001_01 the plugin Stop hook resolves from a foreign CWD via the env anchor
    When the plugin Stop hook is launched from a <location> anchored on <anchor>
    Then the hook does not fail with a missing bootstrap module
    And the hook exits 0

    Examples:
      | location          | anchor             |
      | repo subdirectory | CLAUDE_PROJECT_DIR |
      | fresh tmpdir      | CLAUDE_PROJECT_DIR |
      | fresh tmpdir      | CLAUDE_PLUGIN_ROOT |

  @feature13
  Scenario: HOOKSCWD001_02 the committed settings.json anchors the bootstrap on CLAUDE_PROJECT_DIR
    Given the committed .claude/settings.json
    Then it anchors the bootstrap require on CLAUDE_PROJECT_DIR, not the process cwd
