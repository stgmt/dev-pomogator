@plugin @claim-evidence-gate
Feature: CEGATE001 Claim-Evidence Gate
  As a dev-pomogator user
  I want the agent blocked when it states a RESULT it never actually produced
  So that fact-check verdicts / "works" / "doesn't exist" claims are backed by a real tool run

  # @feature1
  Scenario: CEGATE001_01 Blocks a verdict grid with no tool run this turn
    Given the final message is a PASS/FAIL verdict grid
    And no executor tool ran since the user last spoke
    When the gate evaluates the turn
    Then it blocks the stop

  # @feature1
  Scenario: CEGATE001_02 Approves the same verdict grid when a Bash ran this turn
    Given the final message is a PASS/FAIL verdict grid
    And a Bash tool ran this turn
    When the gate evaluates the turn
    Then it approves the stop

  # @feature2
  Scenario: CEGATE001_03 Blocks a works-done claim with no executor this turn
    Given the final message asserts "всё работает"
    And no executor tool ran this turn
    When the gate evaluates the turn
    Then it blocks the stop

  # @feature2
  Scenario: CEGATE001_04 Does not fire on a plain edit summary
    Given the final message only reports an edit without a works-claim
    When the gate evaluates the turn
    Then it approves the stop

  # @feature3
  Scenario: CEGATE001_05 Blocks a not-found claim with fewer than two searches
    Given the final message asserts "не существует"
    And only one search tool ran this turn
    When the gate evaluates the turn
    Then it blocks the stop

  # @feature3
  Scenario: CEGATE001_06 Approves a not-found claim after two or more searches
    Given the final message asserts "не существует"
    And at least two search tools ran this turn
    When the gate evaluates the turn
    Then it approves the stop

  # @feature4
  Scenario: CEGATE001_07 Blocks a VERIFIED marker with no matching tool
    Given the final message contains "[VERIFIED via npm test]"
    And no tool matching "npm test" ran this turn
    When the gate evaluates the turn
    Then it blocks the stop

  # @feature4
  Scenario: CEGATE001_08 Approves a VERIFIED marker when a matching tool ran
    Given the final message contains "[VERIFIED via npm test]"
    And a Bash running "npm test" ran this turn
    When the gate evaluates the turn
    Then it approves the stop

  # @feature5
  Scenario: CEGATE001_09 Shadow mode never blocks but still logs a fire
    Given the gate is in shadow mode
    And the final message is an unsupported verdict grid
    When the gate evaluates the turn
    Then it approves the stop
    And it appends a fire record to the log

  # @feature5
  Scenario: CEGATE001_10 Disabled mode approves without evaluating
    Given the gate is disabled
    When the gate evaluates the turn
    Then it approves the stop

  # @feature5
  Scenario: CEGATE001_11 Fail-open on a missing transcript
    Given the transcript path does not exist
    When the gate evaluates the turn
    Then it approves the stop

  # @feature5
  Scenario: CEGATE001_12 stop_hook_active does not exempt a premature continuation stop
    Given stop_hook_active is true
    And the turn ends on an unsupported works-done claim with no evidence
    When the gate evaluates the turn
    Then it blocks the stop
    And an identical re-stop is then released by the anti-loop

  # @feature1
  Scenario: CEGATE001_13 Verdict tokens inside a fenced code block do not fire
    Given the final message shows a verdict grid only inside a fenced code block
    When the classifier runs
    Then no analysis-verdict claim is detected

  # @feature2
  Scenario: CEGATE001_14 Negated works phrase is not a works-done claim
    Given the final message says "пока не работает, чиню"
    When the classifier runs
    Then no works-done claim is detected

  # @feature1
  Scenario: CEGATE001_15 Evidence is scoped to the current user turn
    Given a Bash ran before the last user message but not after
    And the final message asserts "всё работает"
    When the turn window is extracted
    Then the previous-turn tool is not counted as evidence

  # @feature2
  Scenario: CEGATE001_16 stripCode removes inline code and quotations
    Given a message with an inline-code word and a quoted phrase
    When stripCode runs
    Then those spans are removed before classification

  # NOTE: the deferred-work / lazy-stop scenarios (formerly CEGATE001_17–24) were retired
  # with the regex detector. That job moved ENTIRELY to the Meridian Haiku judge (FR-49e),
  # whose behaviour is pinned LIVE in tools/claim-evidence-gate/bench/judge-bench.ts.

  # @feature49
  Scenario: CEGATE001_25 Blocks a whole-spec done claim when the task-census shows unfinished work
    Given the final message claims the whole spec is done and an executor ran, with the census showing unfinished work
    When the gate evaluates the turn
    Then it blocks the stop with the real counts and the next step

  # @feature49
  Scenario: CEGATE001_26 Does not fire on a non-spec works-done claim even with unfinished census
    Given the final message claims a non-spec fix works and an executor ran, with the census showing unfinished work
    When the gate evaluates the turn
    Then it approves the stop

  # @feature49
  Scenario: CEGATE001_27 Does not fire on a whole-spec claim when the census is clean or absent
    Given the final message claims the whole spec is done but the census is clean or absent
    When the gate evaluates the turn
    Then it approves the stop

  # @feature11
  Scenario: CEGATE001_28 Releases after consecutive zero-tool kicks and a tool-run resets the streak
    Given the gate has blocked consecutive stops in which the agent ran no tools (no work-delta)
    When the no-progress streak reaches the cap
    Then it releases the stop, but a later kick that runs a tool resets the streak and the gate blocks again
