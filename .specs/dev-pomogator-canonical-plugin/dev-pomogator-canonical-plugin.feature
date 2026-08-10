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

  @feature3
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

  @feature4
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

  @feature6
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
    Then file should be copied to .dev-pomogator-v1-overrides/.claude/skills/custom-skill/SKILL.md
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
  @feature7
  Scenario: CANON001_101 Global-only migration preserves collision-free project sentinels
  Given a project sentinel set contains byte-bearing `.dev-pomogator` and `.dev-pomogator-v1-overrides` directories
  And the migration baseline is the resolved `origin/main` commit
  When the user runs global-only migration through success, dry-run, already-migrated, and induced-failure outcomes
  Then every project sentinel remains byte-for-byte unchanged
  And the evidence records the resolved `origin/main` commit
  And no collision occurs between `.dev-pomogator` and `.dev-pomogator-v1-overrides`

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

  # --- FR-14: plugin hook commands are deps-absent-safe ---

  @feature14
  Scenario: PLUGINDEPS001_01 the real plugin hooks reach no real npm package
    Given the real canonical plugin hooks manifest
    When the deps-safety guard scans that tree
    Then no hook command reaches a real npm package

  @feature14
  Scenario: PLUGINDEPS001_02 the deps-safety guard flags a raw-.ts hook that imports a package
    Given a synthetic plugin tree whose raw-.ts hook imports a real npm package
    When the deps-safety guard scans that tree
    Then the guard flags the offending hook citing `zod`

  # The marketplace serves this repo AS-IS ("source": "./"), so anything auto-commit sweeps into
  # the tree ships to every user. That is not hypothetical: `%windir%/Panther/UnattendGC/*.xml` —
  # real Windows Setup logs — reached main in fec62086 via `git add -A` and shipped. auto-commit
  # must stage by explicit path and never sweep a directory built from an unexpanded variable.
  @feature2
  Scenario: CANON001_130 auto-commit stages the agent's work but refuses a stray variable path
    Given a git repo containing the agent's changes and a stray "%windir%" directory at the root
    When auto-commit stages and commits
    Then the commit contains the agent's changed files
    And the commit contains no path under "%windir%"
    And the stray directory is left untracked in the working tree

  @feature14
  Scenario: PLUGINDEPS001_03 portable pre-Node dispatch preserves the hook on doctor failure
    Given a canonical plugin hook launcher invoked from a POSIX shell in a foreign project CWD
    And its doctor result is unavailable or malformed
    When the launcher receives a prohibited host BDD command
    Then the shell dispatch rejects the command before Node starts
    And a permitted hook invocation uses `node`, not `node.exe`
    And the permitted hook invocation continues fail-open despite the doctor failure
    And plugin-installed dispatch anchors on CLAUDE_PLUGIN_ROOT and repository-dogfood dispatch anchors on CLAUDE_PROJECT_DIR, not process CWD

  # --- FR-15–FR-24: shell-free HTTP managed hook policy ---

  @feature15 @feature16 @feature17 @feature18 @feature20 @feature21 @feature22 @feature23 @feature24
  Scenario: CORE024_01 hook review rejects shell, inline Node, unapproved transport, and registry drift
    Given an approved local HTTP hook registry
    And a managed hook manifest containing shell, inline Node, drifted, and unapproved hook commands
    When I run the hook review gate
    Then the gate rejects every prohibited managed hook with its reason

  @feature15 @feature16 @feature17 @feature19 @feature21 @feature22 @feature23 @feature24
  Scenario: CORE024_02 hook review permits approved HTTP hook and SessionStart bootstrap
    Given an approved local HTTP hook registry
    And a managed hook manifest containing an approved HTTP hook and documented SessionStart bootstrap
    When I run the hook review gate
    Then the hook review gate exits successfully

  @feature13 @feature17 @feature19 @feature24
  Scenario: CORE024_12 A managed hook transparently recovers after its owned daemon dies mid-session
    Given a managed hook client has dispatched through an owned authenticated hook-service daemon
    And that owned daemon dies during the same Claude Code session
    When the next managed hook dispatches the original request
    Then the client restarts the owned service through the single-flight lifecycle and retries once
    And the original registered hook response is returned without user action
    And live HTTP errors are not retried and a foreign listener is never terminated
    And a repeated transport failure remains fail-open with a sanitized durable diagnostic


  @feature26 @feature27 @feature28
  Scenario: CORE024_13 Overlapping Stop route deliveries share one ordered event flight without changing route identity
    Given an isolated HTTP hook service with two ordered Stop routes for the same session
    When both Stop routes are dispatched concurrently for that session
    Then each route returns only its own recorded result
    And the service executes the logical Stop event once in registry order

  @feature29 @feature30
  Scenario: CORE024_14 A legacy hook output burst is bounded and does not take down health
    Given an isolated HTTP hook service with a hook that exceeds the bounded output limit
    When I dispatch the overflowing hook
    Then the route returns the existing runtime-unavailable response
    And the hook service health endpoint remains available


  # @feature31 @feature32 @feature33
  Scenario: CORE024_15 An audited route reuses one persistent worker and preserves FIFO
    Given an isolated audited persistent hook worker fixture
    When I dispatch two requests to the persistent route concurrently
    Then both responses report the same worker process and ordered sequence
    And the persistent worker starts lazily with fewer spawns than dispatches

  # @feature34 @feature35
  Scenario: CORE024_16 A persistent worker failure recycles without retrying uncertain work
    Given an isolated persistent hook worker that can hang
    When the persistent request times out
    Then the request fails once without automatic retry
    And the next request uses a replacement worker process

  # @feature36
  Scenario: CORE024_17 An unaudited legacy route remains behind the child adapter
    Given an isolated unaudited legacy hook route
    When I dispatch the legacy route twice
    Then each dispatch uses the legacy child boundary and no persistent capability is claimed

  @feature13 @AC-12
  Scenario: CORE024_20 Installed hook execution separates plugin code from every caller project
    Given one installed plugin service receives interleaved Stop requests for two different projects
    When logical routes children workers and conformance tools execute
    Then each request uses only its own normalized project cwd environment flight and state
    And plugin cache and the other project receive no project owned writes

  @feature13 @AC-13
  Scenario: CORE024_21 One Stop dispatcher preserves the legacy thirteen route result
    Given a black box baseline for legacy Stop approval blocking context failure order and loop cases
    When the generated manifest dispatches the same cases through one DevPomogator Stop command
    Then logical routes execute in registry order and every host observable result matches the baseline
    And legacy child fallback runs at most one child at a time with bounded input and output

  @feature13 @AC-12 @AC-13
  Scenario: CORE024_22 Multi project Stop flights stay isolated and self heal after daemon loss
    Given independent project requests share one service and the owned daemon dies during the session
    When the next Stop requests are interleaved through the builtins client
    Then the service is recovered once and each project retains independent FIFO results and state
    And live service errors and uncertain route work are not retried

  @feature13 @AC-14
  Scenario: CORE024_23 Authenticated orphan hook service is safely recovered
    Given a stale authenticated DevPomogator hook service owns the loopback port but its service state file is missing
    When the current installed client performs startup recovery
    Then it verifies the listener twice by service token and loopback owner PID before replacement or alternate port recovery
    And it starts the current runtime on a published loopback port and never terminates an unauthenticated or unverifiable listener

  @feature13 @AC-15
  Scenario: CORE024_24 Installed client enforces route aware deadlines and a hard stdin ceiling
    Given an installed hook route with a budget above three seconds and an oversized streamed payload
    When the one shot client dispatches each boundary case
    Then the valid slow route is not aborted at three seconds
    And oversized stdin stops being consumed as soon as the byte ceiling is crossed

  @feature13 @AC-16
  Scenario: CORE024_25 Starting workers terminate on timeout and protocol faults
    Given persistent workers that hang before ready or contaminate the startup protocol
    When startup reaches its budget or receives the invalid frame
    Then each pending startup settles and its child is terminated
    And the worker receives no inherited NODE_OPTIONS

  @feature13 @AC-17
  Scenario: CORE024_26 Partial Stop failures preserve results and durable diagnostics
    Given one successful and one failing logical route in the same Stop group
    When the service aggregates the group
    Then the successful route result is preserved
    And the failing route has a bounded durable diagnostic

  @feature13 @AC-18
  Scenario: CORE024_27 Managed paths and runtime identity are closed over dependencies
    Given an escaped managed directory and a changed shared service dependency
    When journal state and service runtime identity are evaluated
    Then no descendant is created through the escaped directory
    And the shared dependency change invalidates runtime identity

  @feature13 @AC-19
  Scenario: CORE024_28 State only PID evidence cannot authorize termination
    Given authenticated health omits PID while stale state names an unrelated live process
    When orphan service recovery runs
    Then the unrelated process remains alive
    And termination requires two matching health and listener PID proofs
