# Source: generated from .specs/personal-pomogator/ spec
# Domain code: PERSO (personal-pomogator — prevent dev-pomogator files from leaking into git)

Feature: PERSO001 Personal-Pomogator Mode
  As a developer in team-shared project (smarts-like)
  I want dev-pomogator installed files to never accidentally leak into git
  So that personal pomogator config stays personal and team git history stays clean

  Background:
    Given dev-pomogator is installed
    And target project is a fresh git repository with a .gitignore file
    And target project is not the dev-pomogator source repository

  # =========================================================================
  # @feature1 — Managed gitignore block (FR-1)
  # =========================================================================

  @feature1 @wip
  Scenario: PERSO001_10 Marker block is written to target .gitignore
    Given target project has .gitignore without dev-pomogator entries
    When I run "node dist/index.js install --claude"
    Then .gitignore should contain "# >>> dev-pomogator (managed — do not edit) >>>"
    And .gitignore should contain "# <<< dev-pomogator (managed — do not edit) <<<"
    And marker block should contain ".dev-pomogator/"
    And marker block should contain ".claude/settings.local.json" on the first line

  @feature1 @wip
  Scenario: PERSO001_11 Existing user gitignore entries are preserved
    Given target project .gitignore contains user entries "node_modules/" and "dist/"
    And target project .gitignore contains user comment "# My custom ignore"
    When I run "node dist/index.js install --claude"
    Then .gitignore should still contain "node_modules/"
    And .gitignore should still contain "dist/"
    And .gitignore should still contain "# My custom ignore"

  @feature1 @wip
  Scenario: PERSO001_12 Per-tool subtrees are collapsed to directory entries
    When I run "node dist/index.js install --claude"
    Then marker block should contain ".dev-pomogator/tools/specs-generator/"
    And marker block should not contain ".dev-pomogator/tools/specs-generator/scaffold-spec.ts"
    And marker block should collapse multi-file tool dirs into single directory entries

  @feature1 @wip
  Scenario: PERSO001_13 Paths in marker block use forward slashes on Windows
    Given installer runs on Windows platform
    When I run "node dist/index.js install --claude"
    Then marker block entries should not contain backslash "\\"
    And marker block entries should use forward slash "/"

  @feature1 @wip
  Scenario: PERSO001_14 Re-install drops stale entries after extension removal
    Given dev-pomogator is installed with extensions A and B
    And marker block contains paths from both extensions
    When extension B is removed from active list
    And I run "node dist/index.js install --claude" again
    Then marker block should regenerate from scratch
    And marker block should not contain stale paths from extension B
    And marker block should still contain paths from extension A

  @feature1 @wip
  Scenario: PERSO001_15 settings.local.json is always first entry in marker block
    When I run "node dist/index.js install --claude"
    Then first line inside marker block should be ".claude/settings.local.json"

  @feature1 @wip
  Scenario: PERSO001_16 Idempotent re-install produces identical bytes
    Given dev-pomogator is freshly installed
    And .gitignore marker block hash is H1
    When I run "node dist/index.js install --claude" again without any changes
    Then .gitignore marker block hash should equal H1
    And marker block should have stable sort order

  # =========================================================================
  # @feature2 — settings.local.json routing + migration (FR-2, FR-3)
  # =========================================================================

  @feature2 @wip
  Scenario: PERSO001_20 Fresh install writes hooks to settings.local.json
    Given target project has no .claude/settings.json
    When I run "node dist/index.js install --claude"
    Then .claude/settings.local.json should exist
    And settings.local.json should contain dev-pomogator hooks
    And .claude/settings.json should either not exist or contain no dev-pomogator hooks

  @feature2 @wip
  Scenario: PERSO001_21 Existing team hooks in settings.json are preserved on install
    Given target project .claude/settings.json contains team hook "block-dotnet-test.js"
    When I run "node dist/index.js install --claude"
    Then .claude/settings.json should still contain "block-dotnet-test.js"
    And .claude/settings.json should not contain "tsx-runner.js"
    And .claude/settings.local.json should contain "tsx-runner.js"

  @feature2 @wip
  Scenario: PERSO001_22 Existing user settings.local.json keys are preserved
    Given target project .claude/settings.local.json contains user key "theme" set to "dark"
    And target project .claude/settings.local.json contains user PreToolUse hook "user-log.js"
    When I run "node dist/index.js install --claude"
    Then .claude/settings.local.json should still contain "theme" set to "dark"
    And .claude/settings.local.json should still contain "user-log.js"
    And .claude/settings.local.json should also contain dev-pomogator hooks

  @feature2 @wip
  Scenario: PERSO001_23 Env vars from extension envRequirements are routed to settings.local.json
    Given an extension with envRequirements "AUTO_COMMIT_API_KEY" is enabled
    When I run "node dist/index.js install --claude"
    Then .claude/settings.local.json env section should contain "AUTO_COMMIT_API_KEY"
    And .claude/settings.json env section should not contain "AUTO_COMMIT_API_KEY"

  @feature2 @wip
  Scenario: PERSO001_24 Idempotent reinstall does not duplicate hook entries
    Given dev-pomogator is freshly installed
    And settings.local.json contains N hook entries
    When I run "node dist/index.js install --claude" again
    Then settings.local.json should still contain N hook entries
    And hook entries should have stable order

  @feature2 @wip
  Scenario: PERSO001_25 Legacy migration moves dev-pomogator hooks from settings.json to local
    Given target project .claude/settings.json contains dev-pomogator hook "tsx-runner.js"
    And target project .claude/settings.json contains team hook "block-dotnet-test.js"
    When I run "node dist/index.js install --claude"
    Then .claude/settings.json should no longer contain "tsx-runner.js"
    And .claude/settings.json should still contain "block-dotnet-test.js"
    And .claude/settings.local.json should contain "tsx-runner.js"

  @feature2 @wip
  Scenario: PERSO001_26 Non-dev-pomogator hooks in settings.json are never touched
    Given target project .claude/settings.json contains "custom-validator" with hash H1
    When I run "node dist/index.js install --claude"
    Then .claude/settings.json should still contain "custom-validator"
    And settings.json "custom-validator" content hash should equal H1

  # =========================================================================
  # @feature3 — Self-guard for dev-pomogator repo (FR-4)
  # =========================================================================

  @feature3 @wip
  Scenario: PERSO001_30 Self-guard skips gitignore mutation in dev-pomogator repo
    Given I am running installer from dev-pomogator source repository
    And dev-pomogator repo package.json contains "\"name\": \"dev-pomogator\""
    When I run "node dist/index.js install --claude"
    Then .gitignore should not be modified
    And .gitignore should not contain "# >>> dev-pomogator" marker

  @feature3 @wip
  Scenario: PERSO001_31 Self-guard skips settings.local.json creation in dev-pomogator repo
    Given I am running installer from dev-pomogator source repository
    When I run "node dist/index.js install --claude"
    Then .claude/settings.local.json should not be created
    And existing .claude/settings.json should be modified as before (dogfooding path)

  @feature3 @wip
  Scenario: PERSO001_32 Tools and commands are still copied in dev-pomogator repo (dogfooding)
    Given I am running installer from dev-pomogator source repository
    When I run "node dist/index.js install --claude"
    Then .dev-pomogator/tools/ should contain copied tools
    And .claude/commands/ should contain copied commands
    And .claude/rules/ should contain copied rules

  @feature3 @wip
  Scenario: PERSO001_33 Self-guard logs informational message
    Given I am running installer from dev-pomogator source repository
    When I run "node dist/index.js install --claude"
    Then stdout should contain "Detected dev-pomogator source repository"
    And stdout should mention "skipping personal-mode features"

  # =========================================================================
  # @feature4 — Loud-fail setupGlobalScripts (FR-5)
  # =========================================================================

  @feature4 @wip
  Scenario: PERSO001_40 Installer exits non-zero when dist/tsx-runner.js is missing
    Given dev-pomogator package has no dist/tsx-runner.js
    And dev-pomogator package has no src/scripts/tsx-runner.js fallback
    When I run "node dist/index.js install --claude"
    Then installer exit code should not be 0
    And stderr should contain "tsx-runner.js not found"
    And stderr should mention "Run 'npm run build' first"

  @feature4 @wip
  Scenario: PERSO001_41 Target .claude/settings.local.json is not created when install fails loud
    Given dev-pomogator package has no tsx-runner.js anywhere
    When I run "node dist/index.js install --claude"
    Then .claude/settings.local.json should not exist
    And target project should not be left in broken state

  @feature4 @wip
  Scenario: PERSO001_42 Post-install verification catches missing runner after setupGlobalScripts
    Given setupGlobalScripts would silently skip tsx-runner.js copy
    When I run "node dist/index.js install --claude"
    Then installer should throw fatal error mentioning ~/.dev-pomogator/scripts/tsx-runner.js
    And installer exit code should not be 0

  # =========================================================================
  # @feature5 — Fail-soft hook wrapper (FR-6)
  # =========================================================================

  @feature5 @wip
  Scenario: PERSO001_50 Hook exits zero when tsx-runner.js is missing after install
    Given dev-pomogator is successfully installed in target project
    And ~/.dev-pomogator/scripts/tsx-runner.js is deleted externally
    When a hook fires via "node -e require(tsx-runner-bootstrap.cjs) -- script.ts"
    Then hook exit code should be 0
    And hook should not block Claude Code session

  @feature5 @wip
  Scenario: PERSO001_51 Hook prints diagnostic to stderr when runner is missing
    Given dev-pomogator is successfully installed in target project
    And ~/.dev-pomogator/scripts/tsx-runner.js is deleted externally
    When a hook fires
    Then stderr should contain one-line diagnostic matching "[dev-pomogator] tsx-runner.js missing"
    And stderr should not contain Node.js stack trace

  @feature5 @wip
  Scenario: PERSO001_52 Real script runtime errors propagate through wrapper
    Given dev-pomogator is successfully installed in target project
    And ~/.dev-pomogator/scripts/tsx-runner.js exists
    And a hook script exits with non-zero status
    When the hook fires
    Then hook exit code should not be 0
    And stderr should contain script's error message

  # =========================================================================
  # @feature6 — Collision detection via git ls-files (FR-7)
  # =========================================================================

  @feature6 @wip
  Scenario: PERSO001_60 Git-tracked user command is not overwritten
    Given target project contains user-authored ".claude/commands/create-spec.md"
    And ".claude/commands/create-spec.md" is tracked in git
    When I run "node dist/index.js install --claude"
    Then .claude/commands/create-spec.md should retain user content
    And .claude/commands/create-spec.md should not be added to marker block

  @feature6 @wip
  Scenario: PERSO001_61 Collision is reported in install output
    Given target project contains git-tracked ".claude/commands/create-spec.md"
    When I run "node dist/index.js install --claude"
    Then console output should contain "COLLISION"
    And console output should mention ".claude/commands/create-spec.md"

  @feature6 @wip
  Scenario: PERSO001_62 No-git target skips collision detection gracefully
    Given target project has no .git directory
    When I run "node dist/index.js install --claude"
    Then installer should continue without error
    And collision detection should return empty set

  @feature6 @wip
  Scenario: PERSO001_63 git ls-files is called once with batched paths
    Given target project has multiple commands to check for collisions
    When I run "node dist/index.js install --claude"
    Then git ls-files should be invoked exactly once with all candidate paths

  # =========================================================================
  # @feature7 — Per-project uninstall (FR-8)
  # =========================================================================

  @feature7 @wip
  Scenario: PERSO001_70 Uninstall removes all managed files
    Given dev-pomogator is installed in target project
    And config contains managed entries for target project
    When I run "node dist/index.js uninstall --project"
    Then all managed files should be deleted from target project
    And .dev-pomogator/tools/ directory should be removed

  @feature7 @wip
  Scenario: PERSO001_71 Uninstall strips gitignore marker block
    Given dev-pomogator is installed and .gitignore contains marker block
    When I run "node dist/index.js uninstall --project"
    Then .gitignore should not contain "# >>> dev-pomogator" marker
    And user entries in .gitignore outside the block should be preserved

  @feature7 @wip
  Scenario: PERSO001_72 Uninstall cleans dev-pomogator entries from settings.local.json
    Given dev-pomogator is installed and settings.local.json contains our hooks
    And settings.local.json also contains user key "theme"
    When I run "node dist/index.js uninstall --project"
    Then settings.local.json should not contain dev-pomogator hooks
    And settings.local.json should still contain "theme"

  @feature7 @wip
  Scenario: PERSO001_73 Uninstall updates config removing projectPath
    Given dev-pomogator config contains target project in installedExtensions.projectPaths
    When I run "node dist/index.js uninstall --project"
    Then config installedExtensions.projectPaths should not contain target project
    And config managed entry for target project should be deleted

  @feature7 @wip
  Scenario: PERSO001_74 Uninstall refuses to run in dev-pomogator source repo
    Given I am running uninstall from dev-pomogator source repository
    When I run "node dist/index.js uninstall --project"
    Then uninstall should refuse with clear message
    And stderr should contain "Refusing to uninstall from dev-pomogator source repository"
    And no files should be deleted

  # =========================================================================
  # @feature8 — MCP personal mode (FR-9, FR-10)
  # =========================================================================

  @feature8
  Scenario: PERSO001_80 setup-mcp writes to global ~/.claude.json even when project .mcp.json exists
    Given target project has existing .mcp.json with Atlassian MCP server
    When I run "python tools/mcp-setup/setup-mcp.py --platform claude"
    Then project .mcp.json content should not change
    And ~/.claude.json should contain Context7 and Octocode MCP entries

  @feature8
  Scenario: PERSO001_81 setup-mcp writes to global when no project .mcp.json exists
    Given target project has no .mcp.json
    When I run "python tools/mcp-setup/setup-mcp.py --platform claude"
    Then ~/.claude.json should contain Context7 MCP entry
    And project .mcp.json should not be created

  @feature8 @wip
  Scenario: PERSO001_82 Installer warns when project .mcp.json contains secrets
    Given target project .mcp.json contains plaintext "JIRA_API_TOKEN=fake-token"
    When I run "node dist/index.js install --claude"
    Then stderr should contain "SECURITY"
    And stderr should mention "JIRA_API_TOKEN"
    And stderr should mention recommendation to move secrets to env vars
    And installer should still complete successfully

  @feature8 @wip
  Scenario: PERSO001_83 Installer does not warn when project .mcp.json has no secrets
    Given target project .mcp.json contains only Context7 config without secrets
    When I run "node dist/index.js install --claude"
    Then stderr should not contain "SECURITY"
    And installer should complete without warning

  @feature8 @wip
  Scenario: PERSO001_84 claude-mem MCP registration remains invariant writing to ~/.claude.json
    Given claude-mem-health extension is enabled
    When I run "node dist/index.js install --claude"
    Then ~/.claude.json should contain mcpServers.claude-mem entry
    And project .mcp.json should not contain mcpServers.claude-mem entry

  # =========================================================================
  # @feature8 continued — setup-mcp.py behaviours (migrated from mcp-setup.test.ts)
  # =========================================================================

  @feature8
  Scenario: PERSO001_85 check mode detects missing MCP servers
    Given no MCP config exists for cursor platform
    When I run "python tools/mcp-setup/setup-mcp.py --platform cursor --check"
    Then output should contain "[MISSING]"
    And output should contain "context7"
    And output should contain "octocode"

  @feature8
  Scenario: PERSO001_86 check mode detects installed and missing servers
    Given cursor MCP config contains context7 server entry
    When I run "python tools/mcp-setup/setup-mcp.py --platform cursor --check"
    Then output should contain "[OK] context7"
    And output should contain "[MISSING] octocode"

  @feature8
  Scenario: PERSO001_87 check mode detects prefixed server names as installed
    Given cursor MCP config contains "user-context7" and "user-octocode" server entries
    When I run "python tools/mcp-setup/setup-mcp.py --platform cursor --check"
    Then output should contain "[OK] context7"
    And output should contain "[OK] octocode"
    And output should not contain "[MISSING]"

  @feature8
  Scenario: PERSO001_88 install mode writes context7 and octocode to cursor global config
    Given no MCP config exists for cursor platform
    When I run "python tools/mcp-setup/setup-mcp.py --platform cursor"
    Then exit code should be 0
    And output should contain "[INSTALL] context7"
    And output should contain "[INSTALL] octocode"
    And output should contain "[SAVED]"
    And cursor global config should contain context7 npx entry
    And cursor global config should contain octocode npx entry

  @feature8
  Scenario: PERSO001_89 install cursor always writes to global config even when project config exists
    Given project cursor config exists with custom server "my-project-mcp"
    And cursor global config exists with server "global-only"
    When I run "python tools/mcp-setup/setup-mcp.py --platform cursor"
    Then project cursor config should still contain only "my-project-mcp"
    And project cursor config should not contain "context7"
    And cursor global config should contain "global-only"
    And cursor global config should contain "context7"
    And cursor global config should contain "octocode"

  @feature8
  Scenario: PERSO001_90 install mode writes context7 and octocode to claude global config
    Given no MCP config exists for claude platform
    When I run "python tools/mcp-setup/setup-mcp.py --platform claude"
    Then exit code should be 0
    And output should contain "[INSTALL] context7"
    And output should contain "[INSTALL] octocode"
    And claude global config should contain context7 npx entry
    And claude global config should contain octocode npx entry

  @feature8
  Scenario: PERSO001_91 install claude always writes to global config even when project .mcp.json exists
    Given project .mcp.json exists with custom server "my-project-mcp"
    And claude global config exists with server "global-only"
    When I run "python tools/mcp-setup/setup-mcp.py --platform claude"
    Then project .mcp.json should still contain only "my-project-mcp"
    And project .mcp.json should not contain "context7"
    And claude global config should contain "global-only"
    And claude global config should contain "context7"
    And claude global config should contain "octocode"

  @feature8
  Scenario: PERSO001_92 install skips already installed servers
    Given cursor global config already has context7 and octocode installed
    When I run "python tools/mcp-setup/setup-mcp.py --platform cursor"
    Then output should contain "[OK] context7: already installed"
    And output should contain "[OK] octocode: already installed"

  @feature8
  Scenario: PERSO001_93 force flag reinstalls already installed servers
    Given cursor global config already has context7 and octocode installed
    When I run "python tools/mcp-setup/setup-mcp.py --platform cursor --force"
    Then output should contain "[FORCE] context7"
    And output should contain "[FORCE] octocode"
    And output should contain "[SAVED]"

  @feature8
  Scenario: PERSO001_94 install both platforms writes to cursor and claude global configs
    Given no MCP config exists for cursor platform
    And no MCP config exists for claude platform
    When I run "python tools/mcp-setup/setup-mcp.py --platform both"
    Then exit code should be 0
    And cursor global config should contain context7 npx entry
    And cursor global config should contain octocode npx entry
    And claude global config should contain context7 npx entry
    And claude global config should contain octocode npx entry

  @feature8
  Scenario: PERSO001_95 install preserves existing servers when adding new ones
    Given cursor global config contains custom server "my-custom-mcp"
    When I run "python tools/mcp-setup/setup-mcp.py --platform cursor"
    Then cursor global config should contain "my-custom-mcp"
    And cursor global config should contain "context7"
    And cursor global config should contain "octocode"

  @feature8
  Scenario: PERSO001_96 install preserves non-mcpServers properties in claude.json
    Given claude global config contains theme "dark" and onboardingComplete true alongside empty mcpServers
    When I run "python tools/mcp-setup/setup-mcp.py --platform claude"
    Then claude global config should have theme "dark"
    And claude global config should have onboardingComplete true
    And claude global config should contain "context7"

  @feature8
  Scenario: PERSO001_97 auto-fix trailing comma in JSON without needing backup
    Given cursor global config has JSON with trailing comma in mcpServers
    When I run "python tools/mcp-setup/setup-mcp.py --platform cursor"
    Then exit code should be 0
    And output should contain "[WARN] Fixed trailing commas"
    And output should not contain "[RESTORE]"
    And cursor global config should contain original server and context7

  @feature8
  Scenario: PERSO001_98 restore from backup when config is completely unreadable
    Given claude global config contains garbage JSON "not json at all {{{"
    And claude global config backup exists with theme "dark" and empty mcpServers
    When I run "python tools/mcp-setup/setup-mcp.py --platform claude"
    Then exit code should be 0
    And output should contain "[WARN]"
    And output should contain "[RESTORE]"
    And claude global config should have theme "dark"
    And claude global config should contain "context7"

  @feature8
  Scenario: PERSO001_99 fail gracefully when config is garbage and no backup exists
    Given claude global config contains garbage JSON "not json at all"
    And no backup file exists for claude global config
    When I run "python tools/mcp-setup/setup-mcp.py --platform claude"
    Then exit code should not be 0
    And output should match "Failed to read MCP config|personal mode"

  # =========================================================================
  # @feature9 — AI agent uninstall skill (FR-11)
  # =========================================================================

  @feature9 @wip
  Scenario: PERSO001_9A Uninstall skill file is installed to target project
    Given personal-pomogator extension is enabled
    When I run "node dist/index.js install --claude"
    Then ".claude/skills/dev-pomogator-uninstall/SKILL.md" should exist

  @feature9 @wip
  Scenario: PERSO001_9B Skill frontmatter contains required trigger words
    Given SKILL.md is installed in target project
    When I read SKILL.md frontmatter description field
    Then description should contain "удали dev-pomogator"
    And description should contain "remove dev-pomogator"
    And description should contain "uninstall dev-pomogator"

  @feature9 @wip
  Scenario: PERSO001_9C Skill body documents CLI-first approach and manual fallback
    Given SKILL.md is installed in target project
    When I read SKILL.md body
    Then body should mention "uninstall --project"
    And body should mention "dry-run"
    And body should mention manual fallback via ManagedFileEntry

  @feature9 @wip
  Scenario: PERSO001_9D Skill body documents safety checks and verification
    Given SKILL.md is installed in target project
    When I read SKILL.md body
    Then body should mention "dev-pomogator source repository" refusal check
    And body should mention "git status --porcelain" verification
    And body should document 5-step algorithm

  # =========================================================================
  # @feature11 — Global MCP bootstrap: install + warn-until-configured (FR-16)
  # =========================================================================

  @feature11
  Scenario: PERSO001_B0 mcp-bootstrap installs both servers into global config when absent
    Given an empty isolated claude home
    When the mcp-bootstrap hook runs
    Then global mcpServers should contain "context7"
    And global mcpServers should contain "octocode"
    And hook output should warn about "Context7"

  @feature11
  Scenario: PERSO001_B1 mcp-bootstrap does not clobber an existing server entry
    Given an isolated claude home with a custom "context7" entry
    When the mcp-bootstrap hook runs
    Then the "context7" entry should be the custom one

  @feature11
  Scenario: PERSO001_B2 warning is suppressed once both servers are auth-configured
    Given an isolated claude home with "context7" keyed and "octocode" tokened
    When the mcp-bootstrap hook runs
    Then hook output should be suppressed

  @feature11
  Scenario: PERSO001_B3 opt-out installs nothing and stays silent
    Given an empty isolated claude home
    And env "DEV_POMOGATOR_MCP_SETUP" is "off"
    When the mcp-bootstrap hook runs
    Then global mcpServers should be empty
    And hook output should be suppressed

  @feature11
  Scenario: PERSO001_B4 set-mcp-key writes the Context7 key and verifies it
    Given an empty isolated claude home
    When I set the "context7" mcp key to "ctx7-test"
    Then the "context7" entry env "CONTEXT7_API_KEY" should be "ctx7-test"
    And the set-mcp-key result should be verified

  @feature11
  Scenario: PERSO001_B5 set-mcp-key writes the Octocode token and verifies it
    Given an empty isolated claude home
    When I set the "octocode" mcp key to "ghp-test"
    Then the "octocode" entry env "GITHUB_TOKEN" should be "ghp-test"
    And the set-mcp-key result should be verified

  @feature11
  Scenario: PERSO001_B6 Context7 is unconfigured without a key and configured with one
    Given a context7 entry without a key
    Then context7 should be reported as not configured
    When the context7 entry gets api key "k"
    Then context7 should be reported as configured

  @feature11
  Scenario: PERSO001_B7 Octocode is configured by a token or by gh auth
    Given an octocode entry without a token and gh auth logged out
    Then octocode should be reported as not configured
    When gh auth is logged in
    Then octocode should be reported as configured

  @feature11
  Scenario: PERSO001_B8 doctor C-MCPA warns when Context7 has no key
    Given an isolated claude home with "context7" unkeyed and "octocode" tokened
    When the doctor mcp-auth check runs
    Then the C-MCPA severity should be "warning"
    And the C-MCPA message should mention "Context7"

  @feature11
  Scenario: PERSO001_B9 doctor mcp-parse excludes plugin-provided servers from missing
    Given referenced mcp servers "plugin_foo_bar,claude_ai_X,context7" with empty config
    When the doctor mcp-parse check runs
    Then the missing list should contain "context7"
    And the missing list should not contain "plugin_foo_bar"
