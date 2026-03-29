# Source: .specs/analyze-test-failure/analyze-test-failure.feature
Feature: ANALYSIS001 Test Failure Analysis
  As a developer
  I want to know if a test failure is a regression, flaky, or environment issue
  So that I don't waste time on manual analysis or dismiss real regressions

  Background:
    Given dev-pomogator is installed
    And analyze-test-failure extension is enabled

  # @feature1
  Scenario: ANALYSIS001_01 History writer appends test results with git SHA
    Given a test run completed with 3 passed and 1 failed test
    When history writer processes the finalized status
    Then history.json SHALL contain 4 entries with current git SHA
    And each entry SHALL have session_id, timestamp, and git_branch

  # @feature2
  Scenario: ANALYSIS001_02 History trimming maintains max 50 entries per test
    Given history.json contains 50 entries for test "suite::testA"
    When history writer appends a new entry for "suite::testA"
    Then history.json SHALL contain exactly 50 entries for "suite::testA"
    And the oldest entry SHALL have been removed

  # @feature3
  Scenario: ANALYSIS001_03 Import resolver parses JS/TS imports
    Given a test file "sample-test.ts" with imports from "../src/service" and "../src/helper"
    When import resolver processes the file
    Then it SHALL return resolved paths including "src/service.ts" and "src/helper.ts"
    And it SHALL NOT include node_modules paths

  # @feature3b
  Scenario: ANALYSIS001_04 Import resolver parses C# project references via csproj
    Given a test file "SampleTest.cs" in project with csproj referencing "../MyApp/MyApp.csproj"
    When import resolver processes the file
    Then it SHALL return all .cs files from "MyApp/" directory as dependencies
    And it SHALL NOT include NuGet PackageReference dependencies

  # @feature3
  Scenario: ANALYSIS001_05 Import resolver returns empty for unsupported language
    Given a test file "sample_test.py" with Python imports
    When import resolver processes the file
    Then it SHALL return an empty array

  # @feature4
  Scenario: ANALYSIS001_06 DeFlaker detects regression when test touches changed code
    Given git diff shows "src/service.ts" was changed
    And test file imports "src/service.ts"
    When DeFlaker correlation runs
    Then it SHALL return regression=true with overlappingFiles=["src/service.ts"]

  # @feature4
  Scenario: ANALYSIS001_07 DeFlaker reports no regression when no overlap
    Given git diff shows "src/unrelated.ts" was changed
    And test file imports "src/service.ts"
    When DeFlaker correlation runs
    Then it SHALL return regression=false

  # @feature5
  Scenario: ANALYSIS001_08 History analysis detects flaky test
    Given history.json has entries for "suite::testB" on SHA "abc123"
    And entries include both "passed" and "failed" status
    When history analysis runs for "suite::testB"
    Then it SHALL classify as FLAKY

  # @feature6
  Scenario: ANALYSIS001_09 Error classification identifies timeout as environment
    Given a test failed with error "Test timed out after 30000ms"
    When error classification runs
    Then it SHALL return category ENVIRONMENT with subcategory TIMEOUT

  # @feature6
  Scenario: ANALYSIS001_10 Error classification identifies network error as environment
    Given a test failed with error "connect ECONNREFUSED 127.0.0.1:5432"
    When error classification runs
    Then it SHALL return category ENVIRONMENT with subcategory NETWORK

  # @feature7
  Scenario: ANALYSIS001_11 Verdict engine resolves regression vs flaky conflict
    Given DeFlaker reports regression=true
    And history analysis reports FLAKY
    When verdict engine computes
    Then verdict SHALL be REGRESSION with MEDIUM confidence

  # @feature8
  Scenario: ANALYSIS001_12 Skill analyzes last failed test when no argument given
    Given latest status YAML contains test "BIN007" with status "failed"
    When user invokes /analyze-test-failure without arguments
    Then skill SHALL analyze "BIN007" and output verdict

  # @feature9
  Scenario: ANALYSIS001_13 Graceful fallback on corrupted history
    Given history.json contains invalid JSON
    When skill runs analysis
    Then it SHALL log warning about corrupted history
    And it SHALL continue analysis using git-diff-only mode
    And confidence SHALL be reduced to MEDIUM or lower

  # @feature1 @feature4 @feature7 @feature8
  Scenario: ANALYSIS001_14 End-to-end regression detection
    Given a test run completed with test "BIN007" failed with error "expected 422, got 200"
    And git diff shows "src/services/AdjustmentProxy.ts" was changed
    And test file "tests/bin/BIN007.test.ts" imports "src/services/AdjustmentProxy.ts"
    And history.json has no prior entries for "BIN007"
    When user invokes /analyze-test-failure BIN007
    Then verdict SHALL be "REGRESSION (HIGH)"
    And evidence SHALL mention "AdjustmentProxy.ts" as overlapping changed file
    And recommendation SHALL suggest reviewing the changed code

  # @feature10
  Scenario: ANALYSIS001_15 Self-test detects existence-only assertion
    Given test file contains "expect(result).toBeDefined()" without content validation
    When self-test detection runs
    Then it SHALL output warning GREEN_MIRAGE_EXISTENCE
    And warning SHALL explain what garbage input would pass the assertion

  # @feature10
  Scenario: ANALYSIS001_16 Self-test detects assertion-free test
    Given test file contains a test body that calls production function but has no expect/assert
    When self-test detection runs
    Then it SHALL output warning GREEN_MIRAGE_ASSERTION_FREE
