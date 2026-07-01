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
