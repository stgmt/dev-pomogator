Feature: PLUGIN004 Forbid Root Artifacts
  As a developer
  I want to prevent accidental files in repository root
  So that repository stays clean and organized

  Background:
    Given a git repository
    And forbid-root-artifacts plugin is installed

  Scenario: Default whitelist blocks unknown files
    Given default whitelist is active
    And file "random.txt" exists in root
    When I run check.py
    Then exit code should be 1
    And output should contain "random.txt"
    And output should contain "NOT in whitelist"

  Scenario: Default whitelist allows known files
    Given default whitelist is active
    And file "README.md" exists in root
    And file ".gitignore" exists in root
    When I run check.py
    Then exit code should be 0

  Scenario: Custom config extends whitelist
    Given .root-artifacts.yaml exists with:
      """
      mode: extend
      allow:
        - Makefile
      """
    And file "Makefile" exists in root
    When I run check.py
    Then exit code should be 0

  Scenario: Custom config replaces whitelist
    Given .root-artifacts.yaml exists with:
      """
      mode: replace
      allow:
        - README.md
      """
    And file ".gitignore" exists in root
    When I run check.py
    Then exit code should be 1
    And output should contain ".gitignore"

  Scenario: Deny overrides default whitelist
    Given .root-artifacts.yaml exists with:
      """
      mode: extend
      deny:
        - README.md
      """
    And file "README.md" exists in root
    When I run check.py
    Then exit code should be 1
    And output should contain "README.md"

  Scenario: Ignore patterns work
    Given .root-artifacts.yaml exists with:
      """
      mode: extend
      ignore_patterns:
        - "*.tmp"
      """
    And file "test.tmp" exists in root
    When I run check.py
    Then exit code should be 0

  Scenario: Allowed directories restriction
    Given .root-artifacts.yaml exists with:
      """
      mode: extend
      allowed_directories:
        - src
        - docs
      """
    And directory "random-dir" exists in root
    When I run check.py
    Then exit code should be 1
    And output should contain "random-dir"

  Scenario: Setup creates default config
    Given .root-artifacts.yaml does not exist
    When I run setup.py
    Then .root-artifacts.yaml should exist
    And .pre-commit-config.yaml should contain "forbid-root-artifacts"

  Scenario: .progress.json classified as trash
    Given default whitelist is active
    And file ".progress.json" exists in root
    When I run check.py
    Then exit code should be 1
    And output should classify ".progress.json" as "AUTO-DELETE"

  # ===========================================================================
  # FR-1: Auto-prune stale allow entries in pre-commit
  # ===========================================================================

  # @feature1
  Scenario: PLUGIN004_AUTOPRUNE_01 auto-prune rewrites yaml when stale entries present
    Given .root-artifacts.yaml contains "allow: [foo.testsettings, README.md]"
    And file "README.md" exists in root
    And file "foo.testsettings" does not exist
    When I run check.py as pre-commit hook
    Then exit code should be 1
    And stderr should contain "auto-pruned 1 stale entries"
    And stderr should contain "Run: git add .root-artifacts.yaml && git commit"
    And .root-artifacts.yaml should not contain "foo.testsettings"
    And .root-artifacts.yaml should still contain "README.md"

  # @feature1
  Scenario: PLUGIN004_AUTOPRUNE_02 auto_prune.enabled=false leaves yaml untouched
    Given .root-artifacts.yaml contains:
      """
      mode: extend
      allow:
        - missing.txt
        - README.md
      auto_prune:
        enabled: false
      """
    And file "missing.txt" does not exist
    When I run check.py
    Then exit code should be 0
    And .root-artifacts.yaml mtime should be unchanged
    And .root-artifacts.yaml should still contain "missing.txt"

  # @feature1
  Scenario: PLUGIN004_AUTOPRUNE_03 path-traversal entries skipped with WARN
    Given .root-artifacts.yaml contains:
      """
      mode: extend
      allow:
        - "../escape.txt"
        - valid.txt
      """
    And file "valid.txt" exists in root
    When I run check.py
    Then stderr should contain "WARNING: skipping non-basename allow entry: ../escape.txt"
    And .root-artifacts.yaml should still contain "../escape.txt"

  # ===========================================================================
  # FR-2: User-configurable trash classification
  # ===========================================================================

  # @feature2
  Scenario: PLUGIN004_TRASH_01 user trash_patterns filters file from configure.py
    Given .root-artifacts.yaml contains:
      """
      mode: extend
      trash_patterns:
        - "*.foo"
      use_default_trash_patterns: false
      classifier:
        mode: config
      """
    And file "random.foo" exists in root
    When I run "configure.py --non-interactive"
    Then exit code should be 0
    And stdout should contain "random.foo"
    And stdout should contain "trash"
    And stdout should contain "add to .gitignore"
    And .root-artifacts.yaml should not contain "random.foo"

  # @feature2
  Scenario: PLUGIN004_TRASH_02 use_default_trash_patterns toggle activates plugin defaults
    Given file "MyProj.vssscc" exists in root
    When .root-artifacts.yaml has "use_default_trash_patterns: true"
    And I run "configure.py --non-interactive"
    Then .root-artifacts.yaml should not contain "MyProj.vssscc"
    When .root-artifacts.yaml is updated with "use_default_trash_patterns: false"
    And I run "configure.py --non-interactive"
    Then .root-artifacts.yaml should contain "MyProj.vssscc"

  # @feature2
  Scenario: PLUGIN004_TRASH_03 specialized hint for *.testsettings references SettingsMigrator
    Given .root-artifacts.yaml has "use_default_trash_patterns: true" and "classifier.mode: config"
    And file "Old.testsettings" exists in root
    When I run "configure.py --non-interactive"
    Then stdout should contain "deprecated VS test settings"
    And stdout should contain "https://learn.microsoft.com/en-us/visualstudio/test/migrate-testsettings-to-runsettings"

  # ===========================================================================
  # FR-3: LLM-driven classification via Claude Code CLI subscription
  # ===========================================================================

  # @feature3
  Scenario: PLUGIN004_LLM_01 hybrid mode invokes claude CLI for unmatched files
    Given .root-artifacts.yaml has "classifier.mode: hybrid" and "use_default_trash_patterns: false"
    And file "weird.unknownext" exists in root
    And fake "claude" stub in test PATH returns {"result":"trash"}
    When I run "configure.py --non-interactive"
    Then claude stub should have been invoked at least once
    And invocation log should contain "weird.unknownext"
    And .root-artifacts.yaml should not contain "weird.unknownext"
    And .dev-pomogator/.classifier-cache.json should contain "weird.unknownext" entry

  # @feature3
  Scenario: PLUGIN004_LLM_02 graceful fallback when configured CLI not in PATH
    Given .root-artifacts.yaml has "classifier.llm.cli: definitely_not_a_real_binary_12345"
    And classifier.mode is "hybrid"
    And file "weird.unknownext" exists in root
    When I run "configure.py --non-interactive"
    Then exit code should be 0
    And stderr should contain "cli not in path"
    And classify should return "unknown" for "weird.unknownext"

  # @feature3
  Scenario: PLUGIN004_LLM_03 cache hit avoids subprocess call
    Given .dev-pomogator/.classifier-cache.json contains valid entry for "cached.unknownext" within TTL
    And .root-artifacts.yaml has "classifier.mode: hybrid"
    And fake "claude" stub in test PATH
    And file "cached.unknownext" exists in root
    When I run "configure.py --non-interactive"
    Then claude stub should NOT have been invoked
    And cached classification should be used

  # ===========================================================================
  # FR-4: Shared classifier module + extended yaml config
  # ===========================================================================

  # @feature4
  Scenario: PLUGIN004_CLASS_01 no hardcoded TRASH_PATTERNS list in *.py source
    Given the plugin source tree at "extensions/forbid-root-artifacts/tools/forbid-root-artifacts"
    When I scan all *.py files for top-level "TRASH_PATTERNS = [" assignment
    Then result should be empty (excluding _FALLBACK_TRASH_PATTERNS in check.py)
    And "_classifier.py" should export load_classifier_config, classify_file, find_stale_allow_entries
    And "check.py" should contain "from _classifier import"
    And "configure.py" should contain "from _classifier import"
    And "default-whitelist.yaml" should contain "trash_patterns_default:"

  # @feature4
  Scenario: PLUGIN004_CLASS_02 new pattern in default-whitelist.yaml applies hot (no code change)
    Given default-whitelist.yaml is patched to add "*.devtest" to trash_patterns_default
    And file "foo.devtest" exists in root
    And .root-artifacts.yaml has "use_default_trash_patterns: true" and "classifier.mode: config"
    When I run "configure.py --non-interactive"
    Then exit code should be 0
    And stdout should contain "foo.devtest" classified as trash
    And .root-artifacts.yaml should not contain "foo.devtest"

  # @feature4
  Scenario: PLUGIN004_CLASS_03 graceful fallback when _classifier.py missing
    Given _classifier.py is removed from .dev-pomogator/tools/forbid-root-artifacts/
    And file "random.tmp" exists in root
    When I run check.py
    Then stderr should contain "classifier module missing"
    And stderr should contain "using fallback"
