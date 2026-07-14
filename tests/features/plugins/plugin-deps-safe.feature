Feature: Canonical plugin hook runtime dispatch
  The canonical plugin must choose an available runtime before Node starts and
  preserve the existing hook fail-open behaviour when recovery state is absent.

  @feature14
  Scenario: PLUGINDEPS001_03 portable pre-Node dispatch preserves the hook on doctor failure
    Given a canonical plugin hook launcher invoked from a POSIX shell in a foreign project CWD
    And its doctor result is unavailable or malformed
    When the launcher receives a prohibited host BDD command
    Then the shell dispatch rejects the command before Node starts
    And a permitted hook invocation uses `node`, not `node.exe`
    And the permitted hook invocation continues fail-open despite the doctor failure
