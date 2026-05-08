Feature: PLUGIN004 Forbid Root Artifacts — Auto-Prune + Configurable Classification + LLM

  Background:
    Given a git repository
    And forbid-root-artifacts plugin is installed
    And tools copied to .dev-pomogator/tools/forbid-root-artifacts/

  # @feature1 — FR-1: Auto-prune переписывает yaml + signal modify
  Scenario: PLUGIN004_AUTOPRUNE_01 auto-prune rewrites yaml and signals modification
    Given .root-artifacts.yaml contains:
      """
      mode: extend
      allow:
        - foo.testsettings
        - README.md
      """
    And file "README.md" exists in repo root
    And file "foo.testsettings" does NOT exist in repo root
    When I run "python check.py" as pre-commit hook
    Then exit code should be 1
    And stderr should contain "auto-pruned 1 stale entries"
    And stderr should contain "Run: git add .root-artifacts.yaml && git commit"
    And .root-artifacts.yaml should NOT contain "foo.testsettings" in allow list
    And .root-artifacts.yaml should still contain "README.md" in allow list

  # @feature1 — FR-1: auto_prune.enabled=false skips prune
  Scenario: PLUGIN004_AUTOPRUNE_02 auto_prune disabled keeps yaml untouched
    Given .root-artifacts.yaml contains:
      """
      mode: extend
      allow:
        - foo.testsettings
      auto_prune:
        enabled: false
      """
    And file "foo.testsettings" does NOT exist in repo root
    When I capture "yaml_mtime_before" from .root-artifacts.yaml mtime
    And I run "python check.py"
    Then exit code should be 0
    And .root-artifacts.yaml mtime should equal "yaml_mtime_before"
    And .root-artifacts.yaml should still contain "foo.testsettings" in allow list

  # @feature1 — FR-1: path traversal entries skipped
  Scenario: PLUGIN004_AUTOPRUNE_03 path traversal entries skipped with WARN
    Given .root-artifacts.yaml contains:
      """
      mode: extend
      allow:
        - "../escape.txt"
        - "valid.txt"
      """
    And file "valid.txt" exists in repo root
    When I run "python check.py"
    Then stderr should contain "WARNING: skipping non-basename allow entry: ../escape.txt"
    And .root-artifacts.yaml should still contain "../escape.txt" in allow list

  # @feature2 — FR-2: User trash_patterns в yaml
  Scenario: PLUGIN004_TRASH_01 user trash_patterns filters file in configure.py
    Given .root-artifacts.yaml contains:
      """
      mode: extend
      trash_patterns:
        - "*.testsettings"
      use_default_trash_patterns: false
      """
    And file "Old.testsettings" exists in repo root
    When I run "python configure.py --non-interactive"
    Then stdout should contain "Old.testsettings"
    And stdout should contain "trash"
    And .root-artifacts.yaml should NOT contain "Old.testsettings" in allow list

  # @feature2 — FR-2: use_default_trash_patterns toggle activates plugin defaults
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

  # @feature2 — FR-2: специализированный hint для *.testsettings
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
    Then stdout should contain "deprecated VS test settings"
    And stdout should contain "https://learn.microsoft.com/en-us/visualstudio/test/migrate-testsettings-to-runsettings"

  # @feature3 — FR-3: Hybrid mode вызывает claude CLI для unmatched files
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

  # @feature3 — FR-3: graceful fallback при отсутствии claude
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
    And stderr should contain "WARNING: claude CLI not in PATH"
    And classify_file should have returned "unknown" for "weird.unknownext"

  # @feature3 — FR-3: cache hit avoids subprocess call
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

  # @feature4 — FR-4: NO hardcoded TRASH_PATTERNS в .py (кроме _FALLBACK)
  Scenario: PLUGIN004_CLASS_01 single source of truth — no hardcoded TRASH_PATTERNS in *.py
    Given the plugin source tree at "extensions/forbid-root-artifacts/tools/forbid-root-artifacts"
    When I grep "^TRASH_PATTERNS = " across the .py files in directory
    Then result should be empty
    When I grep "trash_patterns_default:" in default-whitelist.yaml
    Then result should match exactly one occurrence
    And "_classifier.py" should contain "load_classifier_config"
    And "check.py" should contain "from _classifier import"
    And "configure.py" should contain "from _classifier import"
    # _FALLBACK_TRASH_PATTERNS присутствует в check.py для graceful degradation — это ожидаемо

  # @feature4 — FR-4: hot reload — новый pattern в yaml применяется без code changes
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

  # @feature4 — FR-4: graceful fallback при отсутствии _classifier.py
  Scenario: PLUGIN004_CLASS_03 graceful fallback when _classifier.py is missing
    Given _classifier.py is removed from .dev-pomogator/tools/forbid-root-artifacts/
    And file "test.tmp" exists in repo root
    When I run "python check.py"
    Then stderr should contain "WARNING: classifier module missing — using fallback"
    And exit code should be 1
    And stdout should classify "test.tmp" as trash via fallback patterns
