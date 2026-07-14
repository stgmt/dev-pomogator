Feature: Canonical plugin hook runtime dispatch
  The canonical plugin must choose an available runtime before Node starts and
  preserve the existing hook fail-open behaviour when recovery state is absent.

  @feature14
  Scenario: PLUGINDEPS001_03 portable pre-Node dispatch chooses the platform runtime and recovers per project
    Given a canonical plugin hook launcher invoked from a POSIX shell in a foreign project CWD
    When the launcher receives a prohibited host BDD command
    Then the shell dispatch rejects the command before Node starts
    And a POSIX permitted hook invocation uses `node`, not `node.exe`
    And a Windows-family permitted hook invocation uses `node.exe`, not `node`
    And unavailable Windows `node.exe` recovers separately for two projects sharing one HOME

  Scenario: PLUGINDEPS001_04 global-only legacy migration preserves project and v2 artifacts
    Given a v1 global install and an independent project with v2 sentinels
    When I run the v1 migration with `--global-only`
    Then only recognized global v1 artifacts and their global settings hooks are removed
    And project sentinels and unrelated v2 global artifacts remain byte-for-byte unchanged
