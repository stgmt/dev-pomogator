# Source: Background pattern reused from tests/features/fix-bg-output-loss.feature
# Domain code NSL001 claimed — next free after CORE/CTXMENU/ONBOARD/FBOL/PLUGIN domains
# Domain: NATIVE Claude Code statusLine (ccstatusline) — NOT test-progress (compact_bar.py / test-statusline)
# Spec: .specs/native-statusline/
Feature: NSL001_Native_Statusline_Auto_Install

  Background:
    Given dev-pomogator native-statusline tools are available
    And a temporary HOME with an isolated ~/.claude/settings.json

  # @feature1
  Scenario: NSL001_01 reconciler installs into an empty slot
    Given settings.json has no statusLine field
    When reconcileStatusLine is called with an undefined existing command
    Then it returns action "install" with command "npx -y ccstatusline@latest"

  # @feature1
  Scenario: NSL001_02 SessionStart hook writes statusLine into a clean settings.json
    Given a settings.json with no statusLine field
    When the native-statusline SessionStart hook runs with a session-start stdin JSON
    Then settings.json gains statusLine.command containing "ccstatusline" with type "command"
    And the hook exits with code 0

  # @feature1
  Scenario: NSL001_03 writer preserves all other settings.json fields
    Given a settings.json with env and permissions fields and no statusLine
    When the writer installs the native statusLine
    Then the env and permissions fields are preserved unchanged
    And only the statusLine field was added

  # @feature2
  Scenario: NSL001_04 a user's custom statusLine is never overwritten
    Given settings.json has a custom statusLine.command without the ccstatusline marker
    When the native-statusline hook runs
    Then the existing statusLine.command is left unchanged
    And no write to settings.json occurs

  # @feature2
  Scenario: NSL001_05 our own marked statusLine is recognised as ours
    Given settings.json statusLine.command already contains "ccstatusline"
    When reconcileStatusLine is called with that command
    Then it returns action "noop"

  # @feature4
  Scenario: NSL001_06 opt-out switch disables all writes
    Given the env var DEV_POMOGATOR_STATUSLINE is set to "off"
    And settings.json has no statusLine field
    When the native-statusline hook runs
    Then settings.json is left unchanged and no statusLine is added

  # @feature5
  Scenario: NSL001_07 second run is idempotent (no disk churn)
    Given the hook already installed the native statusLine in a previous run
    When the hook runs again with no other changes
    Then no write to settings.json occurs and the file mtime is unchanged

  # @feature5
  Scenario: NSL001_08 corrupt settings.json is handled fail-open
    Given settings.json contains invalid JSON
    When the native-statusline hook runs
    Then the hook exits with code 0 without throwing
    And settings.json is not mutated

  # @feature1
  Scenario: NSL001_09 missing settings.json is created with only our statusLine
    Given ~/.claude/settings.json does not exist
    When the native-statusline hook runs with default-on behavior
    Then a valid settings.json is created containing only the statusLine field

  # @feature3
  Scenario: NSL001_10 pomogator-doctor offers a fix when statusLine is missing
    Given pomogator-doctor runs against a HOME whose settings.json has no statusLine
    When the statusline check executes
    Then the check is reported as needing a fix
    And applying the fix-action writes the ccstatusline command immediately
