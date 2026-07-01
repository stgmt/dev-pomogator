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
  Scenario: CEGATE001_38 Backgrounded helpers are counted by tool_use id, so retries do not inflate the count
    Given a description was launched twice as a retry and both completed while another launch has no completion
    When the gate counts in-flight helpers by pairing each launch id against its completion id
    Then it reports exactly one in flight (the retry does not make it two) and zero once every id is completed

  # @feature11
  Scenario: CEGATE001_39 A backgrounded agent in flight by id defers the deterministic kick until its completion lands
    Given a backgrounded agent was launched with a tool_use id and a later message reset the turn window
    When the gate evaluates a lazy stop with the judge off and no completion for that id has arrived
    Then it defers because id-pairing still sees the launch pending, and it blocks the same stop once the completion id lands

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

  # 2026-06-30: reconciled against the CURRENT vitest twin (claim-evidence-gate.test.ts) — these 13
  # scenarios cover it() blocks that had no feature twin (FR-15/FR-17/FR-9b/FR-20/FR-22/FR-26/FR-28).

  # @feature26
  Scenario: CEGATE001_43 Game-guard facts compute from REAL tool_use shapes, not literals
    Given a set of real Edit, Write, door apply_spec_change, set_spec_status and Read tool_use records
    When the game-guard facts are computed from those real inputs
    Then gateSelfEdit and selfMarkedBlockedOrBacklog report true only for genuine gate-own mutations and false for reads or unrelated edits

  # @feature28
  Scenario: CEGATE001_44 The session mandate keeps genuine prompts and drops every hook-injection class
    Given a transcript mixing two genuine user prompts with a census banner, skill content, a compact summary, a system task-notification and a slash-command message
    When the gate extracts the session's full mandate
    Then it returns only the two genuine prompts in order, and an empty transcript yields an empty mandate

  # @feature28
  Scenario: CEGATE001_45 A big paste keeps the buried ask via a head plus tail clamp
    Given a prompt that pastes several kilobytes of log noise between a framing head and the real ask at the tail
    When the gate extracts the session's full mandate
    Then the returned prompt keeps both the head and the tail ask, elides the bulky middle with an omitted-chars marker, and stays bounded in length

  # @feature11
  Scenario: CEGATE001_46 A multi-line gate block-reason is skipped whole, the real prompt survives
    Given the latest messages are a genuine user prompt followed by a multi-line gate block-reason warning
    When the gate extracts the user's intent prompt
    Then it returns the genuine prompt, not any line of the gate's own block-reason

  # @feature9
  Scenario: CEGATE001_47 A done-but-not-run census alone does not arm the Дальше gate, but a done-but-red one still does
    Given the census shows only doneUnrun work in one turn and only doneRed work in another, both with an open FR.md edit and no Дальше section
    When the gate evaluates each turn
    Then the doneUnrun-only turn stays quiet while the doneRed turn still blocks

  # @feature15
  Scenario: CEGATE001_48 The no-token demand names every accepted env var and the aipomogator endpoint
    Given an open-work count for the no-token demand
    When the gate builds the no-token demand message
    Then it names AUTO_COMMIT_API_KEY, OPENROUTER_API_KEY, CLAIM_GATE_JUDGE_KEY, the aipomogator endpoint and the open-work count

  # @feature15
  Scenario: CEGATE001_49 Any one judge token resolves an endpoint; no token anywhere resolves none
    Given env snapshots each carrying a different single judge token, and one snapshot carrying none
    When the gate resolves the judge endpoint for each
    Then every single-token snapshot resolves an endpoint while the tokenless snapshot resolves null

  # @feature17
  Scenario: CEGATE001_50 A Дальше block arms the judge even when openWork is zero, including on analysis-only
    Given an arming input with a Дальше block present and openWork at zero, plain and with analysis-only set
    When the gate decides whether the judge is armed
    Then both cases arm the judge regardless of openWork or analysis-only

  # @feature17
  Scenario: CEGATE001_51 No Дальше block with openWork zero stays unarmed, but openWork alone still arms unless analysis-only
    Given an arming input with no Дальше block, varying openWork and analysis-only
    When the gate decides whether the judge is armed
    Then zero openWork stays unarmed, positive openWork arms it, and analysis-only suppresses that arming

  # @feature17
  Scenario: CEGATE001_52 A disabled judge or no gray signal is never armed
    Given an arming input with a Дальше block and open work, but the judge disabled or the gray signal absent
    When the gate decides whether the judge is armed
    Then neither case arms the judge

  # @feature9
  Scenario: CEGATE001_53 Live open-work for an uncensused spec counts only top-level real tasks
    Given a TASKS.md with a top-level open task, an in-progress task, an indented sub-item, a done task and a template placeholder, for a spec absent from the census
    When the gate counts that spec's live open work
    Then it counts only the two genuine top-level tasks, counts zero once the spec is in the census, and fails open to zero on a missing census or file

  # @feature20
  Scenario: CEGATE001_54 A works-done claim that names the gate itself is still evaluated, not free-passed
    Given a works-done claim that mentions "claim-evidence-gate" by name with no executor tool this turn, and the same claim with an executor
    When the gate evaluates each turn
    Then the unbacked claim still blocks despite naming the gate, while the executor-backed claim approves

  # @feature22
  Scenario: CEGATE001_55 The gate offers the task of the most recently edited spec, ignoring test-authoring edits
    Given a sequence of door edits across two specs ending with one spec last, then ending with the other last, then one ending on a .feature-only edit, then no edits at all
    When the gate determines the most recently edited spec
    Then it returns the spec truly edited last, treats a .feature-only edit as not taking ownership, and returns null when nothing was edited
