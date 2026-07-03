# v2: claude-mem bootstrap (SessionStart hook) + doctor detection.
# The v1 src/installer path was dropped in the canonical v2 refactor (commit 43cf9462);
# this feature covers its replacement. Step-defs: tests/step_definitions/feature_claude_mem_bootstrap.ts.
Feature: CMEM001 claude-mem bootstrap and doctor detection
  As a dev-pomogator user
  I want claude-mem installed automatically and detected honestly
  So that persistent memory works without manual setup and the doctor tells the truth

  @feature1
  Scenario Outline: CMEM001_<n> bootstrap decision is <decision> when <case>
    Given bootstrap state installed=<installed> optOut=<optOut> lockFresh=<lockFresh>
    When the claude-mem bootstrap decision is computed
    Then the decision is "<decision>"

    Examples:
      | n  | case              | installed | optOut | lockFresh | decision       |
      | 01 | nothing present   | false     | false  | false     | install        |
      | 02 | already installed | true      | false  | false     | skip-installed |
      | 03 | opted out         | false     | true   | false     | skip-optout    |
      | 04 | recent attempt    | false     | false  | true      | skip-backoff   |

  @feature2
  Scenario: CMEM001_05 hook fires the exact non-interactive install on a clean machine
    Given a clean fake home with no claude-mem plugin
    When the claude-mem bootstrap hook runs
    Then the recorded installer invocation targets "claude-mem install" non-interactively
    And the recorded installer environment disables telemetry

  @feature3
  Scenario: CMEM001_06 hook is a no-op when claude-mem is already installed
    Given a fake home where the claude-mem plugin is already installed
    When the claude-mem bootstrap hook runs
    Then no installer invocation is recorded

  @feature3
  Scenario: CMEM001_07 hook is a no-op when opted out
    Given a clean fake home with no claude-mem plugin
    When the claude-mem bootstrap hook runs with DEV_POMOGATOR_CLAUDE_MEM=off
    Then no installer invocation is recorded

  @feature4
  Scenario: CMEM001_08 hook fails open on garbage stdin
    Given a clean fake home with no claude-mem plugin
    When the claude-mem bootstrap hook runs with garbage stdin
    Then the hook exits 0 with a continue payload

  @feature5
  Scenario: CMEM001_09 doctor flags claude-mem when absent
    Given a clean fake home with no claude-mem plugin
    When the doctor claude-mem check runs
    Then the claude-mem check severity is "warning"

  @feature5
  Scenario: CMEM001_10 doctor confirms claude-mem when present
    Given a fake home where the claude-mem plugin is already installed
    When the doctor claude-mem check runs
    Then the claude-mem check severity is "ok"

  @feature6
  Scenario: CMEM001_11 doctor reads the canonical global MCP config
    Given a referenced MCP server "octocode" registered in the global "~/.claude.json"
    When the doctor MCP-parse check runs for referenced server "octocode"
    Then the MCP-parse check reports "octocode" as configured

  @feature7
  Scenario Outline: CMEM001_<n> reaper decision is <action> when <case>
    Given a reaper snapshot platform=<platform> healthOk=<healthOk> portListening=<portListening> portOwnerAlive=<portOwnerAlive> procs=<procs>
    When the claude-mem reaper decision is computed
    Then the reaper action is "<action>"
    And the reaper kills pids "<kills>"

    Examples:
      | n  | case                 | platform | healthOk | portListening | portOwnerAlive | procs          | action           | kills |
      | 12 | not windows          | linux    | false    | true          | false          | chroma         | skip-not-windows |       |
      | 13 | worker healthy       | win32    | true     | true          | false          | chroma         | skip-healthy     |       |
      | 14 | port free            | win32    | false    | false         | false          | chroma         | skip-not-wedged  |       |
      | 15 | port owner alive     | win32    | false    | true          | true           | chroma         | skip-owner-alive |       |
      | 16 | wedged with orphan   | win32    | false    | true          | false          | chroma+foreign | reap             | 27200 |
      | 17 | wedged no claude-mem | win32    | false    | true          | false          | foreign        | reap             |       |

  @feature7
  Scenario: CMEM001_18 reaper hook kills only orphaned claude-mem holders on a wedged port
    Given a simulated Windows wedge snapshot with an orphaned chroma-mcp and an unrelated python
    And a fake claude-mem home with 78 consecutive hook failures
    When the claude-mem reaper hook runs
    Then the recorded kills are exactly the chroma-mcp pid
    And the reaper hook-failures counter is reset to 0
    And the reaper hook exits 0 with a continue payload

  @feature7
  Scenario: CMEM001_19 reaper hook touches nothing when the worker is healthy
    Given a simulated healthy worker snapshot
    And a fake claude-mem home with 5 consecutive hook failures
    When the claude-mem reaper hook runs
    Then no kills are recorded
