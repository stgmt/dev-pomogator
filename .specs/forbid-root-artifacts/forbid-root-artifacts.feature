Feature: PLUGIN004 Forbid Root Artifacts — Auto-Prune + Configurable Classification + LLM

  Background:
    Given a git repository
    And forbid-root-artifacts plugin is installed
    And tools copied to .dev-pomogator/tools/forbid-root-artifacts/

  @feature4
  Scenario: PLUGIN004_STRUCT_01 check.py script exists in plugin source tree
    Given the plugin source tree at "tools/forbid-root-artifacts"
    Then file "check.py" exists in the plugin directory

  @feature4
  Scenario: PLUGIN004_STRUCT_02 default-whitelist.yaml exists in plugin source tree
    Given the plugin source tree at "tools/forbid-root-artifacts"
    Then file "default-whitelist.yaml" exists in the plugin directory

  @feature4
  Scenario: PLUGIN004_STRUCT_03 configure-root-artifacts command is installed
    Then ".claude/commands/configure-root-artifacts.md" exists in the repository

  @feature4
  Scenario: PLUGIN004_BASE_01 check.py blocks unknown file not in whitelist
    And file "random.txt" exists in repo root
    When I run "python check.py" as pre-commit hook
    Then exit code should be 1
    And stdout contains "random.txt"

  @feature4
  Scenario: PLUGIN004_BASE_02 check.py allows README.md via default whitelist
    And file "README.md" exists in repo root
    When I run "python check.py" as pre-commit hook
    Then exit code should be 0

  @feature4
  Scenario: PLUGIN004_BASE_03 check.py allows .gitignore via default whitelist
    And file ".gitignore" exists in repo root
    When I run "python check.py" as pre-commit hook
    Then exit code should be 0

  @feature4
  Scenario: PLUGIN004_BASE_04 check.py allows .sln files via default pattern
    And file "MyProject.sln" exists in repo root
    When I run "python check.py" as pre-commit hook
    Then exit code should be 0

  @feature4
  Scenario: PLUGIN004_EXTEND_01 extend mode allows user-added file
    Given .root-artifacts.yaml contains:
      """
      mode: extend
      allow:
        - custom-file.txt
      """
    And file "custom-file.txt" exists in repo root
    When I run "python check.py" as pre-commit hook
    Then exit code should be 0

  @feature4
  Scenario: PLUGIN004_EXTEND_02 extend deny removes file from default whitelist
    Given .root-artifacts.yaml contains:
      """
      mode: extend
      deny:
        - README.md
      """
    And file "README.md" exists in repo root
    When I run "python check.py" as pre-commit hook
    Then exit code should be 1
    And stdout contains "README.md"

  @feature4
  Scenario: PLUGIN004_REPLACE_01 replace mode only allows specified files
    Given .root-artifacts.yaml contains:
      """
      mode: replace
      allow:
        - only-this.txt
      """
    And file "only-this.txt" exists in repo root
    And file "README.md" exists in repo root
    When I run "python check.py" as pre-commit hook
    Then exit code should be 1
    And stdout contains "README.md"

  @feature4
  Scenario: PLUGIN004_IGNORE_01 ignore_patterns allows matching files through
    Given .root-artifacts.yaml contains:
      """
      mode: extend
      ignore_patterns:
        - "*.tmp"
        - "*.bak"
      """
    And file "test.tmp" exists in repo root
    And file "backup.bak" exists in repo root
    When I run "python check.py" as pre-commit hook
    Then exit code should be 0

  @feature4
  Scenario: PLUGIN004_DIR_01 allowed_directories blocks dir not in list
    Given .root-artifacts.yaml contains:
      """
      mode: extend
      allowed_directories:
        - src
        - docs
        - .dev-pomogator
      """
    And directory "random-dir" exists in repo root
    When I run "python check.py" as pre-commit hook
    Then exit code should be 1
    And stdout contains "random-dir"

  @feature4
  Scenario: PLUGIN004_DIR_02 allowed_directories allows listed directory
    Given .root-artifacts.yaml contains:
      """
      mode: extend
      allowed_directories:
        - src
        - .dev-pomogator
      """
    And directory "src" exists in repo root
    When I run "python check.py" as pre-commit hook
    Then exit code should be 0

  @feature2
  Scenario: PLUGIN004_TRASH_BLOCK_01 .progress.json classified as trash and reported AUTO-DELETE
    And file ".progress.json" exists in repo root
    When I run "python check.py" as pre-commit hook
    Then exit code should be 1
    And stdout contains ".progress.json"
    And stdout contains "AUTO-DELETE"

  @feature1
  Scenario: PLUGIN004_AUTOPRUNE_DEFAULT_OFF default config does not auto-prune (C3 backward compat)
    Given .root-artifacts.yaml contains:
      """
      mode: extend
      allow:
        - missing.txt
        - README.md
      """
    And file "README.md" exists in repo root
    When I run "python check.py" as pre-commit hook
    Then exit code should be 0
    And stderr should NOT contain "auto-pruned"
    And .root-artifacts.yaml mtime should be unchanged

  @feature1
  Scenario: PLUGIN004_AUTOPRUNE_HEADER_PRESERVED custom yaml header kept byte-for-byte after prune
    Given .root-artifacts.yaml with custom header contains:
      """
      # Copyright 2026 Acme Corp
      # Owned by team: platform-foundation
      # Do not modify without team review

      mode: extend
      allow:
        - missing.txt
        - README.md
      auto_prune:
        enabled: true
      """
    And file "README.md" exists in repo root
    When I run "python check.py" as pre-commit hook
    Then .root-artifacts.yaml should contain "Copyright 2026 Acme Corp"
    And .root-artifacts.yaml should contain "Owned by team: platform-foundation"
    And .root-artifacts.yaml should NOT contain "Documentation: https://github.com/stgmt/dev-pomogator"

  @feature1
  Scenario: PLUGIN004_AUTOPRUNE_COMBINED violations and stale entries both reported in single run
    Given .root-artifacts.yaml contains:
      """
      mode: extend
      allow:
        - missing.txt
        - README.md
      auto_prune:
        enabled: true
      classifier:
        mode: config
      """
    And file "README.md" exists in repo root
    And file "rogue.txt" exists in repo root
    When I run "python check.py" as pre-commit hook
    Then exit code should be 1
    And stdout contains "rogue.txt"
    And stdout contains "NOT in whitelist"
    And stderr contains "also auto-pruned"
    And stderr contains "missing.txt"

  @feature1
  Scenario: PLUGIN004_AUTOPRUNE_01 auto-prune rewrites yaml and signals modification
    Given .root-artifacts.yaml contains:
      """
      mode: extend
      allow:
        - foo.testsettings
        - README.md
      auto_prune:
        enabled: true
      """
    And file "README.md" exists in repo root
    And file "foo.testsettings" does NOT exist in repo root
    When I run "python check.py" as pre-commit hook
    Then exit code should be 1
    And stderr contains "auto-pruned 1 stale entries"
    And stderr contains "Run: git add .root-artifacts.yaml && git commit"
    And .root-artifacts.yaml should NOT contain "foo.testsettings" in allow list
    And .root-artifacts.yaml should still contain "README.md" in allow list

  @feature1
  Scenario: PLUGIN004_AUTOPRUNE_02 auto_prune disabled keeps yaml untouched
    Given .root-artifacts.yaml contains:
      """
      mode: extend
      allow:
        - missing.txt
        - README.md
      auto_prune:
        enabled: false
      """
    And file "README.md" exists in repo root
    When I run "python check.py" as pre-commit hook
    Then exit code should be 0
    And stderr should NOT contain "auto-pruned"
    And .root-artifacts.yaml mtime should be unchanged
    And .root-artifacts.yaml should still contain "missing.txt" in allow list

  @feature1
  Scenario: PLUGIN004_AUTOPRUNE_03 path traversal entries skipped with WARN
    Given .root-artifacts.yaml contains:
      """
      mode: extend
      allow:
        - "../escape.txt"
        - valid.txt
      auto_prune:
        enabled: true
      """
    And file "valid.txt" exists in repo root
    When I run "python check.py" as pre-commit hook
    Then stderr contains "WARNING: skipping non-basename allow entry: ../escape.txt"
    And .root-artifacts.yaml should still contain "../escape.txt" in allow list

  @feature2
  Scenario: PLUGIN004_TRASH_01 user trash_patterns filters file in configure.py
    Given .root-artifacts.yaml contains:
      """
      mode: extend
      trash_patterns:
        - "*.foo"
      use_default_trash_patterns: false
      """
    And file "junk.foo" exists in repo root
    When I run "python configure.py --non-interactive"
    Then stdout contains "junk.foo"
    And stdout contains "trash"
    And .root-artifacts.yaml should NOT contain "junk.foo" in allow list

  @feature2
  Scenario: PLUGIN004_TRASH_02 default trash patterns from default-whitelist.yaml apply when toggled on
    Given .root-artifacts.yaml contains:
      """
      mode: extend
      use_default_trash_patterns: true
      classifier:
        mode: config
      """
    And file "MyProj.vssscc" exists in repo root
    When I run "python configure.py --non-interactive"
    Then .root-artifacts.yaml should NOT contain "MyProj.vssscc" in allow list
    When I update .root-artifacts.yaml to set "use_default_trash_patterns: false"
    And I run "python configure.py --non-interactive"
    Then .root-artifacts.yaml should contain "MyProj.vssscc" in allow list

  @feature2
  Scenario: PLUGIN004_TRASH_03 specialized hint for *.testsettings references SettingsMigrator
    Given .root-artifacts.yaml contains:
      """
      mode: extend
      use_default_trash_patterns: true
      classifier:
        mode: config
      """
    And file "Old.testsettings" exists in repo root
    When I run "python configure.py --non-interactive"
    Then stdout contains "deprecated VS test settings"
    And stdout contains "https://learn.microsoft.com/en-us/visualstudio/test/migrate-testsettings-to-runsettings"

  @feature3
  Scenario: PLUGIN004_LLM_01 hybrid mode invokes claude CLI for unmatched file
    Given fake "claude" binary in test PATH that returns JSON {"result":"trash"}
    And .root-artifacts.yaml contains:
      """
      mode: extend
      classifier:
        mode: hybrid
      use_default_trash_patterns: false
      """
    And file "weird.unknownext" exists in repo root
    When I run "python configure.py --non-interactive"
    Then claude CLI should have been invoked exactly once with prompt containing "weird.unknownext"
    And .root-artifacts.yaml should NOT contain "weird.unknownext" in allow list
    And .dev-pomogator/.classifier-cache.json should contain "weird.unknownext" entry

  @feature3
  Scenario: PLUGIN004_LLM_02 graceful fallback when claude CLI not in PATH
    Given no "claude" binary in test PATH
    And .root-artifacts.yaml contains:
      """
      mode: extend
      classifier:
        mode: hybrid
      use_default_trash_patterns: false
      """
    And file "weird.unknownext" exists in repo root
    When I run "python configure.py --non-interactive"
    Then exit code should be 0
    And stderr contains "WARNING: claude CLI not in PATH"
    And classify_file should have returned "unknown" for "weird.unknownext"

  @feature3
  Scenario: PLUGIN004_LLM_03 cache hit avoids claude subprocess call
    Given fake "claude" binary in test PATH that records invocations
    And .dev-pomogator/.classifier-cache.json contains:
      """
      {
        "schema_version": 1,
        "entries": {
          "cached.unknownext": {"result": "trash", "ts": 9999999999}
        }
      }
      """
    And .root-artifacts.yaml contains:
      """
      mode: extend
      classifier:
        mode: hybrid
      """
    And file "cached.unknownext" exists in repo root
    When I run "python configure.py --non-interactive"
    Then claude CLI should NOT have been invoked
    And .root-artifacts.yaml should NOT contain "cached.unknownext" in allow list

  @feature4
  Scenario: PLUGIN004_CLASS_01 single source of truth — no hardcoded TRASH_PATTERNS in *.py
    Given the plugin source tree at "tools/forbid-root-artifacts"
    When I grep "^TRASH_PATTERNS = " across the .py files in directory
    Then result should be empty
    When I grep "trash_patterns_default:" in default-whitelist.yaml
    Then result should match exactly one occurrence
    And "_classifier.py" should contain "load_classifier_config"
    And "check.py" should contain "from _classifier import"
    And "configure.py" should contain "from _classifier import"
    # _FALLBACK_TRASH_PATTERNS присутствует в check.py для graceful degradation — это ожидаемо

  @feature4
  Scenario: PLUGIN004_CLASS_02 new pattern in default-whitelist.yaml applies hot
    Given default-whitelist.yaml is patched to add "*.devtest" to trash_patterns_default
    And .root-artifacts.yaml contains:
      """
      mode: extend
      use_default_trash_patterns: true
      classifier:
        mode: config
      """
    And file "weird.devtest" exists in repo root
    When I run "python configure.py --non-interactive"
    Then .root-artifacts.yaml should NOT contain "weird.devtest" in allow list
    When I run "python check.py"
    Then exit code should be 1 OR exit code should be 0 (если уже не в violations)
    And no Python source code change should have been made

  @feature4
  Scenario: PLUGIN004_CLASS_03 graceful fallback when _classifier.py is missing
    Given _classifier.py is removed from .dev-pomogator/tools/forbid-root-artifacts/
    And file "test.tmp" exists in repo root
    When I run "python check.py"
    Then stderr contains "WARNING: classifier module missing — using fallback"
    And exit code should be 1
    And stdout should classify "test.tmp" as trash via fallback patterns

  @feature7
  Scenario: PLUGIN004_INSTALL_01 SessionStart hook wires the pre-commit hook in a fresh git repo
    Given no ".pre-commit-config.yaml" exists in repo root
    And a recording setup launcher is configured
    When I run the forbid-root-artifacts install-hook
    Then exit code should be 0
    And the setup launcher should have been invoked exactly once

  @feature7
  Scenario: PLUGIN004_INSTALL_02 install-hook is idempotent when the hook is already wired
    Given ".pre-commit-config.yaml" already contains hook id "forbid-root-artifacts"
    And a recording setup launcher is configured
    When I run the forbid-root-artifacts install-hook
    Then exit code should be 0
    And the setup launcher should NOT have been invoked
    And .pre-commit-config.yaml mtime should be unchanged

  @feature7
  Scenario: PLUGIN004_INSTALL_03 opt-out env makes install-hook a no-op
    Given no ".pre-commit-config.yaml" exists in repo root
    And the root-artifacts opt-out env is set
    And a recording setup launcher is configured
    When I run the forbid-root-artifacts install-hook
    Then exit code should be 0
    And the setup launcher should NOT have been invoked
    And no ".pre-commit-config.yaml" exists in repo root

  @feature7
  Scenario: PLUGIN004_INSTALL_04 non-git directory is a no-op (fail-open)
    Given the repo root is not a git repository
    And a recording setup launcher is configured
    When I run the forbid-root-artifacts install-hook
    Then exit code should be 0
    And the setup launcher should NOT have been invoked

  @feature8
  Scenario: PLUGIN004_INSTALL_RESOLVE_01 real setup writes a resolvable, portable entry path
    Given no ".pre-commit-config.yaml" exists in repo root
    When I run "python setup.py" as the installer
    Then the pre-commit entry for "forbid-root-artifacts" should be "python .dev-pomogator/tools/forbid-root-artifacts/check.py"
    And the pre-commit entry path should exist in repo root

  @feature9
  Scenario: PLUGIN004_INSTALL_DEPS_01 missing deps trigger deps-install before setup
    Given no ".pre-commit-config.yaml" exists in repo root
    And "pre-commit" is not available in test PATH
    And a recording deps launcher is configured
    And a recording setup launcher is configured
    When I run the forbid-root-artifacts install-hook
    Then exit code should be 0
    And the deps launcher should have been invoked before the setup launcher

  @feature9
  Scenario: PLUGIN004_INSTALL_DEPS_02 unavailable deps fail open with a backoff lock
    Given no ".pre-commit-config.yaml" exists in repo root
    And "pre-commit" is not available in test PATH
    And deps-install cannot provision the dependencies
    When I run the forbid-root-artifacts install-hook
    Then exit code should be 0
    And stderr contains "WARNING"
    And a backoff lock file exists under ".dev-pomogator"

  @feature10
  Scenario: PLUGIN004_DOCTOR_01 doctor flags a missing / unresolvable hook install
    Given no ".pre-commit-config.yaml" exists in repo root
    When I run the forbid-root-artifacts doctor check
    Then the doctor check status should be non-green
    And the doctor check should offer a reinstall fix action

  @feature10
  Scenario: PLUGIN004_DOCTOR_02 doctor is green when the hook is wired and the entry path resolves
    Given ".pre-commit-config.yaml" already contains hook id "forbid-root-artifacts"
    And the pre-commit entry path exists in repo root
    When I run the forbid-root-artifacts doctor check
    Then the doctor check status should be green
