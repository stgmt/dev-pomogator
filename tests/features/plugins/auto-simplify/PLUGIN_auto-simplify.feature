Feature: Auto-Simplify Stop Hook
  As a developer using Claude Code
  I want automatic code-quality review on significant file changes
  So that I do not forget to review code before finishing

  # Drives the REAL tools/auto-simplify/simplify_stop.ts via tests/step_definitions/feature_auto_simplify_stop.ts
  # (spawned through the plugin bootstrap launcher; diff size via the hook's SIMPLIFY_DIFF_OVERRIDE test
  # hook = files * 10 lines; real .simplify-marker.json fixtures keyed by the real hashFileList). The two
  # original file-inspection cases (substantial module / executable bit) were dropped as anti-patterns.

  @feature1
  Scenario: AUTOSIMPLIFY_01 disabled via env approves the stop
    Given the auto-simplify hook is disabled via env
    When the auto-simplify Stop hook fires
    Then the auto-simplify hook approves the stop

  @feature2
  Scenario: AUTOSIMPLIFY_02 empty stdin approves the stop
    Given the auto-simplify hook receives empty stdin
    When the auto-simplify Stop hook fires
    Then the auto-simplify hook approves the stop

  @feature3
  Scenario: AUTOSIMPLIFY_03 a change below the line threshold approves the stop
    Given an auto-simplify change below the line threshold
    When the auto-simplify Stop hook fires
    Then the auto-simplify hook approves the stop

  @feature4
  Scenario: AUTOSIMPLIFY_04 a change above the threshold with no marker blocks and writes a marker
    Given an auto-simplify change above the threshold with no marker
    When the auto-simplify Stop hook fires
    Then the auto-simplify hook blocks the stop citing the simplify skill
    And the auto-simplify marker file is created with the current diff hash

  @feature5
  Scenario: AUTOSIMPLIFY_05 a marker with the same diff hash approves the stop (dedup)
    Given an auto-simplify marker whose hash matches the current change
    When the auto-simplify Stop hook fires
    Then the auto-simplify hook approves the stop

  @feature6
  Scenario: AUTOSIMPLIFY_06 a different hash inside the cooldown window approves the stop
    Given an auto-simplify marker with a different hash within the cooldown window
    When the auto-simplify Stop hook fires
    Then the auto-simplify hook approves the stop

  @feature7
  Scenario: AUTOSIMPLIFY_07 the max retry count approves the stop (loop protection)
    Given an auto-simplify marker that has hit the max retry count
    When the auto-simplify Stop hook fires
    Then the auto-simplify hook approves the stop

  @feature8
  Scenario: AUTOSIMPLIFY_08 a corrupted marker is treated as fresh and blocks
    Given an auto-simplify marker file containing invalid JSON
    When the auto-simplify Stop hook fires
    Then the auto-simplify hook blocks the stop citing the simplify skill
