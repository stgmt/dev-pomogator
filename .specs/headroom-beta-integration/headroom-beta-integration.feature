Feature: Headroom beta integration
  Dev-pomogator offers an optional Headroom beta that can run through either a
  Codex-sub2api topology or a direct Anthropic topology, with verified savings
  and safe rollback.

  @feature1 @wip
  Scenario: HEADROOM001_01 normal install does not enable beta
    Given dev-pomogator is installed with default options
    When the Headroom beta status is inspected
    Then Headroom beta is disabled
    And no Claude Code base URL is changed by this feature

  @feature2 @wip
  Scenario: HEADROOM001_02 installer requires exactly one topology
    Given the user starts Headroom beta install
    When no topology is selected
    Then the install plan is rejected
    When both codex-sub2api and anthropic-direct are selected
    Then the install plan is rejected

  @feature3 @wip
  Scenario: HEADROOM001_03 Docker runtime is preferred when available
    Given Docker is reachable on the host
    When the user selects codex-sub2api
    Then the install plan uses Docker
    And the plan includes Headroom and sub2api services

  @feature4 @wip
  Scenario: HEADROOM001_04 host fallback is offered without Docker
    Given Docker is unavailable on host and WSL
    And pipx is available
    When the user starts Headroom beta install
    Then the install plan uses the host headless fallback
    And the plan includes an OS-native autostart unit

  @feature5 @wip
  Scenario: HEADROOM001_05 unsupported Headroom flags are skipped
    Given Headroom proxy help does not include "--code-aware"
    When the installer builds the Headroom command
    Then the command does not contain "--code-aware"
    And the command contains supported token-mode flags

  @feature6 @feature8 @wip
  Scenario: HEADROOM001_06 doctor explains zero Token Savings
    Given Headroom stats report mode "cache"
    And proxy compression saved tokens is 0
    And prefix-cache savings are nonzero
    When Headroom beta doctor runs
    Then the report says compression token savings are zero because cache mode is active
    And the report lists prefix-cache savings separately

  @feature7 @wip
  Scenario: HEADROOM001_07 Claude settings rollback preserves unknown keys
    Given Claude settings contain existing hooks and unknown keys
    When Headroom beta writes routing settings
    Then a timestamped backup is created
    And unknown keys are preserved
    When rollback runs
    Then the original settings are restored

  @feature9 @wip
  Scenario: HEADROOM001_08 Headroom skill is packaged separately from Meridian proxy skill
    Given the dev-pomogator plugin manifest is inspected
    Then the Headroom beta skill is discoverable
    And the Meridian proxy-up skill still exists

  @feature10 @wip
  Scenario: HEADROOM001_09 regression fixtures cover runtime and stats failures
    Given the Headroom beta test fixture catalog is inspected
    Then it includes cache-mode zero savings
    And it includes unsupported flag help output
    And it includes Docker unavailable fallback
    And it includes malformed Claude settings
