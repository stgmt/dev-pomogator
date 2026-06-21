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

  # @feature11
  Scenario: CEGATE001_29 Blocks an unproven blocker claim but approves a substantiated or real-async one
    Given the final message rests the stop on a blocker claim while work remains
    When the turn ran no tool and launched no background task
    Then it blocks the stop demanding proof, yet approves when the agent ran a tool or launched a background task

  # @feature9
  Scenario: CEGATE001_30 A test-authoring .feature edit does not scope the spec while an FR.md edit does
    Given the session edits only a spec's .feature in one turn and only its FR.md in another, with an open census
    When the gate evaluates each turn
    Then the .feature-only turn stays quiet (the spec is not scoped) while the FR.md turn blocks as before

  # @feature11
  Scenario: CEGATE001_32 A live bg-task-active marker defers the lazy-stop kick across turns
    Given a real background job is in flight (a live .bg-task-active marker) while scope-open work remains
    When the gate evaluates a stop that merely awaits the result with no «Дальше:» step
    Then it defers to the bg-task-guard and approves, but the same stop blocks once the marker is gone

  # @feature11
  Scenario: CEGATE001_33 A still-running background command (not a test) defers until its completion lands
    Given the window shows a background command launched (a build, not a test) with no completion record yet
    When the gate evaluates a stop that merely awaits it while scope-open work remains
    Then it approves, but once the harness completion record lands in the window the same lazy stop blocks

  # @feature11
  Scenario: CEGATE001_34 Inspecting the gate is not progress — first tolerated, second blocked; editing it is never flagged
    Given the session has scope-open work and the current turn only read the gate's own source with no edit
    When the gate evaluates a second consecutive such inspection turn
    Then it blocks with a bare next-step demand, while a turn that EDITS the gate is treated as real work and approved

  # @feature11
  Scenario: CEGATE001_35 A backgrounded agent is in-flight while running and not after it comes to rest
    Given a backgrounded helper agent was launched and has not yet delivered its «came to rest» completion
    When the gate checks whether a background job is still in flight
    Then it reports in-flight while running, but the «came to rest» user-message resets the window so it is no longer in-flight

  # @feature11
  Scenario: CEGATE001_36 An analysis-only request requires only proofs while an implement request still enforces work
    Given the user's last request was for analysis/report only and the agent ended on a lazy stop while work remains
    When the gate evaluates the stop
    Then it approves (no work-kick), but it blocks an unbacked works-done claim, and an implement request still enforces work

  # @feature11
  Scenario: CEGATE001_37 The last user prompt is read with hook-injected lines stripped
    Given the latest user-role messages include a spec-tasks banner and validator output appended by hooks
    When the gate extracts the user's intent prompt
    Then it returns the typed request with the injected banner/validator lines stripped and injection-only messages skipped

  # @feature11
  Scenario: CEGATE001_38 A sibling agent coming to rest does not clear a still-running backgrounded agent
    Given two backgrounded agents were launched and only one has delivered its «came to rest» completion
    When the gate pairs launches against completions by name across the whole transcript
    Then it reports still in-flight while the other agent runs, not in-flight once both rest, and a cross-session rest with no matching launch clears nothing

  # @feature11
  Scenario: CEGATE001_39 A backgrounded agent still in flight across a sibling's window-resetting completion defers the kick
    Given a migration agent launched siblings and one «came to rest» reset the turn window while another agent still runs
    When the agent ends on a lazy status stop with open tasks remaining
    Then the gate defers the kick while the other agent is in flight and blocks the same stop once both agents have come to rest

  # @feature11
  Scenario: CEGATE001_40 The agent's own open todos arm the gate even with zero spec scope
    Given a session edited no spec but its own task list still has an open todo and it ends on a lazy stop
    When the gate evaluates the stop
    Then it blocks because the agent's open todo counts as open work AND the kick names that next open todo, and it stays quiet once all todos are completed

  # @feature11
  Scenario: CEGATE001_42 A backgrounded command still in flight across a window reset defers the kick
    Given a run_in_background command was launched in an earlier turn and a later message reset the turn window before the agent's lazy stop
    When the gate evaluates the stop while no completion record has arrived
    Then it defers because the whole-transcript check sees the launch is still pending, and it blocks the same lazy stop once the completion record lands

  # @feature11
  Scenario: CEGATE001_41 The agent task list is reconstructed from the transcript to count open work
    Given the transcript records TaskCreate/TaskUpdate calls and a latest TodoWrite list
    When the gate counts the agent's open declared work
    Then it replays the task ids to their final status and counts pending plus in-progress, failing open to zero on a missing transcript
