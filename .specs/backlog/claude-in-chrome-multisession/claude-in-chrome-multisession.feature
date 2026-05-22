Feature: PLUGIN018_claude-in-chrome-multisession

  Background:
    Given dev-pomogator is installed
    And a git repository project exists

  # @feature1 — FR-2: PreToolUse DENY cross-session
  Scenario: PLUGIN018_01 hook denies navigate when tabId owned by another session
    Given session A has tabId 100 in its allowlist
    When session B invokes the cims-guard hook with PreToolUse for navigate tabId=100
    Then the hook exits with code 2
    And the hook stdout contains permissionDecision equal to "deny"
    And the permissionDecisionReason references session A as the owner

  # @feature1 — FR-2: ALLOW for own tab
  Scenario: PLUGIN018_02 hook allows navigate when tabId is owned by current session
    Given session A has tabId 100 in its allowlist
    When session A invokes the hook with PreToolUse for navigate tabId=100
    Then the hook exits with code 0
    And the hook stdout is empty

  # @feature2 — FR-3: PostToolUse auto-record
  Scenario: PLUGIN018_03 hook records new tabId from tabs_create_mcp PostToolUse
    Given session A has empty allowlist
    When session A invokes the hook with PostToolUse for tabs_create_mcp returning text "Created new tab. Tab ID: 200"
    Then the hook exits with code 0
    And session A allowlist contains tabId 200

  # @feature7 — FR-6: Orphan auto-claim
  Scenario: PLUGIN018_04 hook auto-claims orphan tab on first touch
    Given session A has empty allowlist
    And no other session owns tabId 999
    When session A invokes the hook with PreToolUse for navigate tabId=999
    Then the hook exits with code 0
    And session A allowlist contains tabId 999

  # @feature9 — FR-8: Fail-open on parse error
  Scenario: PLUGIN018_05 hook exits 0 with malformed stdin JSON
    When the hook is invoked with malformed stdin
    Then the hook exits with code 0
    And cims-guard log contains an event "parse_error"

  # @feature8 — FR-7: JSONL event log
  Scenario: PLUGIN018_06 hook writes JSONL events to log file
    Given a fresh isolated HOME
    When session A invokes the hook with various ALLOW and DENY scenarios
    Then the cims-guard log file exists
    And each line of the log is valid JSON

  # @feature5 — FR-5: claim-tab.mjs add
  Scenario: PLUGIN018_07 claim-tab adds tabId to current session
    Given a fresh isolated HOME
    When the test runs claim-tab.mjs with arguments "add 500 --session S1"
    Then the script exits with code 0
    And session S1 allowlist contains tabId 500

  # @feature5 — FR-5: claim-tab.mjs release
  Scenario: PLUGIN018_08 claim-tab release removes tabId from current session
    Given session S1 has tabId 500 in its allowlist
    When the test runs claim-tab.mjs with arguments "release 500 --session S1"
    Then the script exits with code 0
    And session S1 allowlist does NOT contain tabId 500

  # @feature6 — FR-5: claim-tab.mjs clean
  Scenario: PLUGIN018_09 claim-tab clean removes stale sessions
    Given session S1 has lastUsedAt 25 hours ago
    And session S2 has lastUsedAt 1 hour ago
    When the test runs claim-tab.mjs with arguments "clean"
    Then the script exits with code 0
    And session S1 directory does NOT exist
    And session S2 directory still exists

  # @feature4 — FR-9: Installer integration
  Scenario: PLUGIN018_10 installer registers hooks in target settings.local.json
    Given a fresh fixture project without dev-pomogator artifacts
    When dev-pomogator installer runs with claude-in-chrome-multisession plugin enabled
    Then the targetProject path .dev-pomogator/tools/claude-in-chrome-multisession/cims-guard.ts exists
    And the targetProject settings.local.json contains a PreToolUse entry with matcher "mcp__claude-in-chrome__.*"
