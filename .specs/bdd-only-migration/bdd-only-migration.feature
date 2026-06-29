Feature: BDDONLY001 Staged BDD-only test-file guard

  The bdd-only-test-guard hook denies a Write that creates a new non-BDD test
  file, allows edits of existing tests, always allows .feature / step-def files,
  and records a deliberate escape. Each scenario drives the REAL guard via its
  bootstrap launcher (no mocks); per-scenario isolation comes from the V4World
  Before hook's fresh tempDir.

  Background:
    Given a clean workspace for the bdd-only guard

  @feature1
  Scenario: BDDONLY001_01 deny a Write of a new non-BDD test file
    When the bdd-only guard receives a Write for a new "tests/e2e/new-thing.test.ts"
    Then the bdd-only guard should deny with a BDD-only reason

  @feature1
  Scenario: BDDONLY001_02 allow an Edit of an existing test file
    Given an existing test file "tests/e2e/legacy.test.ts" in the workspace
    When the bdd-only guard receives an Edit for "tests/e2e/legacy.test.ts"
    Then the bdd-only guard should allow the write

  @feature1
  Scenario: BDDONLY001_03 allow a Write of a new step-definition file
    When the bdd-only guard receives a Write for a new "tests/step_definitions/feature_new.ts"
    Then the bdd-only guard should allow the write

  @feature1
  Scenario: BDDONLY001_04 allow and log a BDD_ONLY_SKIP escape
    When the bdd-only guard receives a Write for a new "tests/e2e/escaped.test.ts" with BDD_ONLY_SKIP set
    Then the bdd-only guard should allow the write
    And the escape should be recorded in the bdd-only escape log

  @feature10 @wip
  Scenario: BDDONLY001_05 deny an Edit that raises the test-case count of an existing tail file
    Given an existing non-BDD test file with 2 test cases
    When the bdd-only guard receives an Edit that raises its test-case count to 3
    Then the bdd-only guard should deny with a shrink-only reason

  @feature10 @wip
  Scenario: BDDONLY001_06 allow an Edit that keeps or lowers the test-case count
    Given an existing non-BDD test file with 3 test cases
    When the bdd-only guard receives an Edit that lowers its test-case count to 2
    Then the bdd-only guard should allow the write
