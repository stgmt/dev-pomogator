Feature: CMEMMID Mid-session claude-mem reaper guard

  The claude-mem SessionStart reaper already cleans a wedged worker when a new Claude Code
  session opens. This feature adds the same safety net while a session is already active, so
  a worker that dies after startup can be healed without freezing later prompts for 60 seconds.

  @FR-1
  Scenario: CMEMMID001 reap a wedged worker before a tool call
    Given a simulated Windows wedge snapshot with an orphaned chroma-mcp and an unrelated python
    When the claude-mem mid-session guard runs before a tool call
    Then the recorded kills are exactly the chroma-mcp pid
    And the reaper hook exits 0 with a continue payload

  @FR-2
  Scenario: CMEMMID002 healthy worker is a fast no-op
    Given a simulated healthy worker snapshot
    When the claude-mem mid-session guard runs before a tool call
    Then no kills are recorded
    And the reaper hook exits 0 with a continue payload

  @FR-3
  Scenario: CMEMMID003 debounce skips a repeated full check
    Given a simulated Windows wedge snapshot with an orphaned chroma-mcp and an unrelated python
    And a recent mid-session reaper check already ran
    When the claude-mem mid-session guard runs before a tool call
    Then no worker health probe is attempted
    And no kills are recorded
    And the reaper hook exits 0 with a continue payload

  @FR-4
  Scenario: CMEMMID004 plugin manifests register the mid-session guard
    Given the dev-pomogator hook manifests are available
    When the claude-mem hook registrations are inspected
    Then the canonical plugin manifest registers the reaper on PreToolUse
    And the dogfood settings register the reaper on PreToolUse

  @FR-5
  Scenario: CMEMMID005 opt-out never blocks the requested tool call
    Given a simulated Windows wedge snapshot with an orphaned chroma-mcp and an unrelated python
    And claude-mem reaping is disabled by environment
    When the claude-mem mid-session guard runs before a tool call
    Then no kills are recorded
    And the reaper hook exits 0 with a continue payload

  @FR-6
  Scenario: CMEMMID006 stale memory outage emits a visible non-blocking notice
    Given a simulated unavailable claude-mem worker has been down longer than the visibility threshold
    When the claude-mem mid-session guard runs before a tool call
    Then the guard emits a visible memory-not-recording warning
    And the reaper hook exits 0 with a continue payload


  @FR-7
  Scenario: CMEMMID007 reap a blank-command-line chroma root only when it has its Python child
    Given a simulated Windows wedge snapshot with a blank-command-line chroma-mcp root and its Python child
    And a fake claude-mem home with 17 consecutive hook failures
    When the claude-mem prompt preflight runs
    Then the recorded kills are exactly the blank chroma-mcp root pid
    And the reaper hook-failures counter is reset to 0
    And the reaper hook exits 0 with a continue payload

  @FR-8
  Scenario: CMEMMID008 do not select a foreign blank chroma process
    Given a simulated Windows wedge snapshot with a foreign blank chroma-mcp root
    When the claude-mem prompt preflight runs
    Then no kills are recorded
    And the reaper hook exits 0 with a continue payload

  @FR-9
  Scenario: CMEMMID009 denied or unverified recovery preserves the failure counter
    Given a simulated Windows wedge snapshot with a blank-command-line chroma-mcp root and its Python child
    And a fake claude-mem home with 17 consecutive hook failures
    And the simulated reaper receives access denied and cannot verify port release
    When the claude-mem prompt preflight runs
    Then the reaper hook-failures counter remains 17
    And an elevated recovery request is recorded
    And the reaper hook exits 0 with a continue payload

  @FR-10
  Scenario: CMEMMID010 generated manifest registers prompt preflight without changing port
    Given the dev-pomogator hook manifests are available
    When the claude-mem hook registrations are inspected
    Then the canonical plugin manifest registers the reaper on UserPromptSubmit
