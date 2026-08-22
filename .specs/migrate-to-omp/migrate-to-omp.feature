@migrate-to-omp
Feature: MIGRATE001_OMP migration of dev-pomogator spec ecosystem

  Background:
    Given a disposable OMP project fixture exists outside the repository worktree
    And a sentinel spec is recorded before migration work begins

  @feature1 @FR-1 @AC-1
  Scenario: MIGRATE001_01 root marketplace install resolves the intended plugin
    Given the root OMP marketplace catalog names dev-pomogator with source ./
    When the fixture installs dev-pomogator@stgmt at project scope
    Then source ./ resolves inside the marketplace root and the resolved plugin root is the repository root
    And the installed artifact contains the declared root extension, skills and MCP definition
    And no user-scope plugin state is changed

  @feature1 @FR-1 @AC-1
  Scenario: MIGRATE001_02 install activation reaches an OMP capability
    Given dev-pomogator is installed in the disposable project
    When plugins are reloaded and a fresh OMP session starts
    Then exactly one repository-root marketplace catalog and one root plugin source are selected
    And source ./ resolves relative to that marketplace root
    And the root extension is loaded from the installed repository-root artifact
    And the declared skills and MCP definition are present in the fresh session
    And one registered dev-pomogator capability executes

  @feature2 @FR-2 @AC-2
  Scenario: MIGRATE001_03 broken traceability remains authoritative NOT_READY
    Given an isolated spec has broken FR to AC traceability
    When the OMP wrapper requests the authoritative verdict
    Then the result is NOT_READY with a located finding from the existing SpecGraph, conformance and verdict engines
    And no independent graph, direct writer or readiness result is used

  @feature2 @FR-2 @AC-2
  Scenario: MIGRATE001_04 invalid phase confirmation is refused
    Given an isolated spec verdict is not GREEN or READY
    When the OMP path requests phase confirmation
    Then the existing status engine refuses the transition
    And the request does not bypass the existing graph, conformance, verdict or mutation door

  @feature3 @FR-3 @AC-3
  Scenario: MIGRATE001_05 Docker profile discovers migration lifecycle
    Given the OMP Docker profile is selected
    When a migration scenario runs
    Then its feature, steps and @migrate-to-omp lifecycle hook are discovered only through the declared Docker Cucumber profile
    And its canonical per-scenario evidence is ingested
    And no host execution path is accepted

  @feature3 @FR-3 @AC-3
  Scenario: MIGRATE001_06 Docker result becomes canonical evidence
    Given an installed migration wave passes its probe
    When its Docker BDD result is ingested
    Then the matching scenario has canonical evidence from the declared Docker Cucumber profile
    And the feature, step definitions and tagged lifecycle hook were discovered by that profile
    And no migration acceptance scenario can execute outside that profile

  @feature4 @FR-4 @AC-4
  Scenario: MIGRATE001_07 mapped guard blocks without writing
    Given an approved hook mapping handles a disallowed mutation
    When its OMP tool_call handler runs in its declared policy mode
    Then every in-scope legacy guard has exactly one approved mapping
    And guards without proven mappings remain outside the enabled extension
    And its mapping names legacy source, OMP event, result shape, ordering, headless policy, owner and scenario
    And it returns the mapped block and reason
    And the target document is unchanged

  @feature4 @FR-4 @AC-4
  Scenario: MIGRATE001_08 unmapped guard cannot be enabled
    Given a legacy guard has no complete OMP mapping
    When extension registration is assembled
    Then that guard is not enabled
    And a fully proven mapping can be enabled
    And each in-scope legacy guard has exactly one explicit source-to-OMP mapping
    And every mapping names source trigger, OMP event, result shape, ordering, headless policy, owner and regression scenario
    And the matrix names the missing contract

  @feature5 @FR-5 @AC-5
  Scenario: MIGRATE001_09 rollback preserves unrelated specs
    Given a disposable W1 fixture fails its gate
    When the W0 rollback runbook executes
    Then only the disposable OMP migration path is disabled and allowlisted fixture and project-scope state are removed
    And the sentinel spec bytes are unchanged
    And the Claude path remains usable

  @feature5 @FR-5 @AC-5
  Scenario: MIGRATE001_10 rollback preserves the Claude path
    Given the disposable OMP migration path is enabled
    When the W0 rollback runbook disables it
    Then the Claude plugin path remains usable
    And only allowlisted fixture and project-scope state are removed
    And the sentinel spec bytes are unchanged
    And the rollback was available before W1 began

  @feature6 @FR-6 @AC-6
  Scenario: MIGRATE001_11 installed plugin discovers portable MCP door
    Given a fresh OMP session has the root plugin installed
    When it discovers dev-pomogator-specs through root .mcp.json
    Then the installed plugin root .mcp.json discovery route is used
    And the resolved command environment and project root are recorded
    And the server-name collision policy is evidenced
    And an invalid mutation is refused atomically

  @feature6 @FR-6 @AC-6
  Scenario: MIGRATE001_12 MCP rejects an invalid mutation atomically
    Given dev-pomogator-specs is discovered from the installed plugin
    When OMP sends an invalid apply_spec_change request
    Then the reply contains findings
    And the target file is unchanged
    And discovery used the installed plugin root .mcp.json route with recorded command, environment, root and collision policy
