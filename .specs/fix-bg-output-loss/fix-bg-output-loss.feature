# Source: Background pattern reused from tests/features/core/CORE002_auto-update.feature
# Domain code FBOL001 claimed — next free after existing CORE/CTXMENU/ONBOARD/ANALYSIS domains
Feature: FBOL001_Fix_Background_Output_Loss_docker-test_tee_persistence

  Background:
    Given dev-pomogator source code is available
    And scripts/docker-test.sh exists

  # @feature1
  Scenario: FBOL001_01 docker-test.sh creates persistent log file at known path
    Given directory ".dev-pomogator/.docker-status/" does not exist yet
    When scripts/docker-test.sh is invoked with a stub docker compose command
    Then file ".dev-pomogator/.docker-status/test-run-<epoch>.log" exists on disk
    And the log file contains stdout produced by the stub command

  # @feature1
  Scenario: FBOL001_02 output appears in both parent stdout and persistent log
    Given scripts/docker-test.sh is patched with tee into persistent log
    When the script is run with a stub command that prints "hello\nworld"
    Then captured parent stdout contains "hello" and "world"
    And the persistent log file also contains "hello" and "world"

  # @feature1
  Scenario: FBOL001_03 mkdir -p creates missing log directory idempotently
    Given directory ".dev-pomogator/.docker-status/" has been deleted beforehand
    When scripts/docker-test.sh starts execution
    Then the directory is created before the first log write
    And re-running the script does not fail when the directory already exists

  # @feature1
  Scenario: FBOL001_04 exit code is preserved when stub command exits non-zero
    Given scripts/docker-test.sh uses set -o pipefail and tee in pipeline
    When the stub command exits with code 3
    Then bash scripts/docker-test.sh exits with code 3
    And the persistent log file contains output produced before failure

  # @feature2
  Scenario: FBOL001_05 no-blocking-on-tests rule documents anti-pattern and safe replacement
    Given file ".claude/rules/pomogator/no-blocking-on-tests.md" exists
    When the rule file is read
    Then the content contains a section titled "Anti-pattern" with the pattern "| tail" at run_in_background mode
    And the content contains a safe replacement example using "tee"

  # @feature3
  Scenario: FBOL001_06 persistent log files are ignored by git
    Given ".gitignore" already contains ".dev-pomogator/" entry
    When a new log file is created at ".dev-pomogator/.docker-status/test-run-1745000000.log"
    Then git status does not report the new log file as untracked
