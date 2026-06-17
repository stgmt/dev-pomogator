# Source: Background pattern reused from tests/features/fix-bg-output-loss.feature
# Domain code NSL001 claimed — next free after CORE/CTXMENU/ONBOARD/FBOL/PLUGIN domains
# Domain: NATIVE Claude Code statusLine (ccstatusline) — NOT test-progress (compact_bar.py / test-statusline)
Feature: NSL001_Native_Statusline_Auto_Install

  Background:
    Given dev-pomogator native-statusline tools are available
    And a temporary HOME with an isolated ~/.claude/settings.json

  # @feature1
  @feature1
  Scenario: NSL001_01 reconciler installs into an empty slot
    Given settings.json has no statusLine field
    When reconcileStatusLine is called with an undefined existing command
    Then it returns action "install" with command "npx -y ccstatusline@latest"

  # @feature1
  @feature1
  Scenario: NSL001_02 SessionStart hook writes statusLine into a clean settings.json
    Given a settings.json with no statusLine field
    When the native-statusline SessionStart hook runs with a session-start stdin JSON
    Then settings.json gains statusLine.command containing "ccstatusline" with type "command"
    And the hook exits with code 0

  # @feature1
  @feature1
  Scenario: NSL001_03 writer preserves all other settings.json fields
    Given a settings.json with env and permissions fields and no statusLine
    When the writer installs the native statusLine
    Then the env and permissions fields are preserved unchanged
    And only the statusLine field was added

  # @feature2
  @feature2
  Scenario: NSL001_04 a user's custom statusLine is never overwritten
    Given settings.json has a custom statusLine.command without the ccstatusline marker
    When the native-statusline hook runs
    Then the existing statusLine.command is left unchanged
    And no write to settings.json occurs

  # @feature2
  @feature2
  Scenario: NSL001_05 our own marked statusLine is recognised as ours
    Given settings.json statusLine.command already contains "ccstatusline"
    When reconcileStatusLine is called with that command
    Then it returns action "noop"

  # @feature4
  @feature4
  Scenario: NSL001_06 opt-out switch disables all writes
    Given the env var DEV_POMOGATOR_STATUSLINE is set to "off"
    And settings.json has no statusLine field
    When the native-statusline hook runs
    Then settings.json is left unchanged and no statusLine is added

  # @feature5
  @feature5
  Scenario: NSL001_07 second run is idempotent (no disk churn)
    Given the hook already installed the native statusLine in a previous run
    When the hook runs again with no other changes
    Then no write to settings.json occurs and the file mtime is unchanged

  # @feature5
  @feature5
  Scenario: NSL001_08 corrupt settings.json is handled fail-open
    Given settings.json contains invalid JSON
    When the native-statusline hook runs
    Then the hook exits with code 0 without throwing
    And settings.json is not mutated

  # @feature1
  @feature1
  Scenario: NSL001_09 missing settings.json is created with only our statusLine
    Given ~/.claude/settings.json does not exist
    When the native-statusline hook runs with default-on behavior
    Then a valid settings.json is created containing only the statusLine field

  # @feature3
  @feature3
  Scenario: NSL001_10 pomogator-doctor offers a fix when statusLine is missing
    Given pomogator-doctor runs against a HOME whose settings.json has no statusLine
    When the statusline check executes
    Then the check is reported as needing a fix
    And applying the fix-action writes the ccstatusline command immediately

  # @feature3
  @feature3
  Scenario: NSL001_11 pomogator-doctor check is OK when a statusLine already exists
    Given a HOME whose settings.json statusLine.command contains "ccstatusline"
    When the statusline check executes
    Then the check severity is "ok"
    And a HOME with a custom non-ccstatusline statusLine also reports "ok" (preserved)
    And a HOME with corrupt settings.json reports "warning" (unreadable, not verified)

  # @feature6
  @feature6
  Scenario: NSL001_12 hook seeds a missing ccstatusline widget config with repo and cwd
    Given ~/.config/ccstatusline/settings.json does not exist
    When the native-statusline hook runs
    Then a widget config is created as a 3-line column whose line 1 contains "git-root-dir" and "current-working-dir"

  # @feature6
  @feature6
  Scenario: NSL001_13 hook never mutates an existing widget config (install-only)
    Given a stock-default ccstatusline widget config without repo and cwd widgets
    When the native-statusline hook runs
    Then the widget config file is byte-for-byte unchanged

  # @feature7
  @feature7
  Scenario: NSL001_14 doctor fix-action enriches a stock-default widget config
    Given a stock-default ccstatusline widget config mirroring the real producer output
    When the apply-statusline fix-action runs
    Then the layout is normalized to a 3-line column with "git-root-dir" and "current-working-dir" on their own line (a single line truncates at terminal width)
    And the original stock widgets and all other config fields are preserved

  # @feature7
  @feature7
  Scenario: NSL001_15 a customized widget layout is never enriched
    Given a ccstatusline widget config containing a non-stock widget type
    When the apply-statusline fix-action runs
    Then the widget config file is byte-for-byte unchanged

  # @feature7
  @feature7
  Scenario: NSL001_16 widget enrichment is idempotent
    Given a widget config already containing repo and cwd widgets
    When the apply-statusline fix-action runs again
    Then no write occurs and the action is "noop"

  # @feature8
  @feature8
  Scenario: NSL001_17 doctor detects a stock widget config missing repo and cwd
    Given ccstatusline is the configured statusLine
    And the widget config is stock-default without repo and cwd widgets
    When the statusline-widgets check executes
    Then the check severity is "warning" naming the missing widget types
    And after the apply-statusline fix-action the check reports "ok"

  # @feature8
  @feature8
  Scenario: NSL001_18 widgets check defers to the statusline check and respects custom layouts
    Given a HOME without any statusLine configured
    When the statusline-widgets check executes
    Then the check severity is "ok" (not applicable — C-NSL's domain)
    And a HOME with a customized widget layout missing repo/cwd also reports "ok" (left untouched)
  # @feature7
  @feature7
  Scenario: NSL001_19 a previous dev-pomogator single-line layout migrates to the column
    Given a widget config in the previous dev-pomogator revision (our widgets tail-appended to the stock single line)
    When the apply-statusline fix-action runs
    Then the layout is normalized to the canonical 3-line column with repo and cwd on their own line
    And all other config fields are preserved
