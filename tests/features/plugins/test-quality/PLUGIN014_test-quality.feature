Feature: PLUGIN014_test-quality
  The test-quality dedup Stop hook detects changed test files and nudges /dedup-tests
  So that duplicated test helpers get reviewed before the agent finishes

  # Drives the REAL tools/test-quality/dedup_stop.ts via tests/step_definitions/feature_test_quality_dedup.ts
  # (spawned through the plugin bootstrap launcher; "test files changed" cases use a real throwaway git
  # repo with a modified tests/ file; real .dedup-marker.json fixtures keyed by the real hashFileList).
  # The old @feature2/@feature3 manifest + helper-export cases were dropped as file-inspection
  # anti-patterns (they also referenced the removed v1 extensions/ path).

  @feature1
  Scenario: PLUGIN014_01 no changed test files approves the stop
    Given a dedup workspace with no changed test files
    When the dedup Stop hook fires
    Then the dedup hook approves the stop

  @feature1
  Scenario: PLUGIN014_02 a changed test file with no marker blocks and writes a marker
    Given a dedup workspace with a changed test file and no marker
    When the dedup Stop hook fires
    Then the dedup hook blocks the stop citing the dedup-tests skill
    And the dedup marker file is created with the current test-file hash

  @feature1
  Scenario: PLUGIN014_03 a marker with the same test-file hash approves the stop (dedup)
    Given a dedup workspace with a changed test file already recorded by a matching marker
    When the dedup Stop hook fires
    Then the dedup hook approves the stop

  @feature1
  Scenario: PLUGIN014_04 disabled via env approves the stop
    Given the dedup hook is disabled via env
    When the dedup Stop hook fires
    Then the dedup hook approves the stop

  @feature1
  Scenario: PLUGIN014_05 the max retry count approves the stop (loop protection)
    Given a dedup workspace with a changed test file that has hit the max retry count
    When the dedup Stop hook fires
    Then the dedup hook approves the stop
