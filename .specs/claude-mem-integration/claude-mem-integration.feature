# Source BDD contract. Default scenarios use local seams; real installation is explicitly selected.
Feature: CMEM001 claude-mem bootstrap and doctor detection
  As a dev-pomogator user
  I want claude-mem lifecycle automation that never blocks my session
  So that installation and diagnostics are honest, bounded, and recoverable

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
  Scenario: CMEM001_05 hook records the exact non-interactive install on a clean machine
    Given a clean fake home with no claude-mem plugin
    When the claude-mem bootstrap hook runs
    Then the recorded installer invocation targets "claude-mem install" non-interactively
    And the recorded installer environment disables telemetry
    And the installer provenance records a package specifier and outcome

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

  @feature3
  Scenario: CMEM001_08 state resolution uses the isolated Windows user profile
    Given a Windows profile "C:\\Users\\isolated" and a different HOME "C:\\Users\\shared"
    When the claude-mem state home is resolved
    Then the state home is the Windows profile "C:\\Users\\isolated"

  @feature4
  Scenario: CMEM001_09 hook fails open on garbage stdin
    Given a clean fake home with no claude-mem plugin
    When the claude-mem bootstrap hook runs with garbage stdin
    Then the hook exits 0 with a continue payload

  @feature4
  Scenario Outline: CMEM001_<n> unavailable worker yields no context and releases its request when <case>
    Given a local claude-mem worker that is <workerState>
    When the bounded claude-mem health hook runs
    Then the hook exits 0 with a continue payload
    And no claude-mem context is emitted
    And no worker request handle remains


    Examples:
      | n  | case                 | workerState          |
      | 10 | connection is refused | refusing connections |
      | 11 | response is non-200   | returning non-200    |
      | 12 | response black-holes  | accepting silently   |

  @feature5
  Scenario Outline: CMEM001_<n> doctor distinguishes claude-mem state <state>
    Given a fake claude-mem home in <state> state
    When the doctor claude-mem checks run
    Then the claude-mem installation check reports "<installationSeverity>"
    And the worker diagnostic reports "<workerCondition>"

    Examples:
      | n  | state                | installationSeverity | workerCondition     |
      | 13 | absent               | warning              | absent              |
      | 14 | installed and healthy| ok                   | healthy             |
      | 15 | malformed config     | warning              | malformed-config    |
      | 16 | installed unreachable| ok                   | unreachable-worker  |

  @feature6
  Scenario: CMEM001_17 doctor reads canonical global MCP configuration
    Given a referenced MCP server "claude-mem" registered in global "~/.claude.json"
    And a separate project MCP configuration
    When the doctor MCP-parse check runs for referenced server "claude-mem"
    Then the MCP-parse check reports "claude-mem" as configured

  @feature6
  Scenario: CMEM001_18 explicit real installation reports each verified component
    Given the network-enabled real-install profile and an isolated fake home
    When claude-mem is explicitly installed and verified
    Then the report identifies manifest, MCP registration, worker result, and version independently
    And the real-install profile does not use a recorded launcher

  @feature7
  Scenario Outline: CMEM001_<n> reaper decision is <action> when <case>
    Given a reaper snapshot platform=<platform> healthOk=<healthOk> portListening=<portListening> portOwnerAlive=<portOwnerAlive> procs=<procs>
    When the claude-mem reaper decision is computed
    Then the reaper action is "<action>"
    And the reaper kills pids "<kills>"

    Examples:
      | n  | case                 | platform | healthOk | portListening | portOwnerAlive | procs          | action           | kills |
      | 19 | not native Windows   | linux    | false    | true          | false          | chroma         | skip-not-windows |       |
      | 20 | worker healthy       | win32    | true     | true          | false          | chroma         | skip-healthy     |       |
      | 21 | port free            | win32    | false    | false         | false          | chroma         | skip-not-wedged  |       |
      | 22 | port owner alive     | win32    | false    | true          | true           | chroma         | skip-owner-alive |       |
      | 23 | wedged with orphan   | win32    | false    | true          | false          | chroma+foreign | reap             | 27200 |
      | 24 | wedged no claude-mem | win32    | false    | true          | false          | foreign        | reap             |       |

  @feature7
  Scenario: CMEM001_25 reaper hook kills only orphaned claude-mem holders on a wedged port
    Given a simulated Windows wedge snapshot with an orphaned chroma-mcp and an unrelated python
    And a fake claude-mem home with 78 consecutive hook failures
    When the claude-mem reaper hook runs
    Then the recorded kills are exactly the chroma-mcp pid
    And the reaper hook-failures counter is reset to 0
    And the reaper hook exits 0 with a continue payload

  @feature7
  Scenario: CMEM001_26 offline default Docker rail makes no real package install
    Given the offline default Docker BDD profile
    When the claude-mem lifecycle scenarios run
    Then no real package download or installation is attempted
    And only recorded launchers and local worker fixtures are used

  @feature4 @feature7
  Scenario: CMEM001_27 lifecycle manifests register fail-open bootstrap and reaper hooks
    Given the dev-pomogator hook manifests are available
    When the claude-mem hook registrations are inspected
    Then the canonical plugin manifest registers the SessionStart lifecycle hooks
    And the dogfood settings register the SessionStart lifecycle hooks
    And the Codex hooks register the SessionStart lifecycle hooks
    And the canonical plugin manifest registers the reaper on PreToolUse
    And the dogfood settings register the reaper on PreToolUse

  @feature8 @HDS006
  Scenario: CMEM001_28 existing dev-pomogator Haiku default migrates to DeepSeek
    Given an existing claude-mem settings file with model "claude-haiku-4-5-20251001"
    When the installed-user model migration runs
    Then the migration result is "migrated"
    And claude-mem uses provider "openrouter" and model "deepseek/deepseek-v4-flash"

  @feature8 @HDS007
  Scenario: CMEM001_29 existing custom claude-mem model is preserved
    Given an existing claude-mem settings file with model "custom/provider-model"
    When the installed-user model migration runs
    Then the migration result is "custom-preserved"
    And the custom model "custom/provider-model" remains unchanged

  @feature8 @HDS008
  Scenario: CMEM001_30 legacy Haiku migrates through AiPomogator when its credential is available
    Given an existing claude-mem settings file with model "claude-haiku-4-5-20251001" and no OpenRouter credential
    And the AiPomogator credential is available
    And a stale OpenRouter credential is also present
    When the installed-user model migration runs
    Then the migration result is "migrated"
    And claude-mem uses provider "openrouter" and model "openrouter/deepseek/deepseek-v4-flash"
    And claude-mem routes through AiPomogator at "https://aipomogator.ru/go/v1"

  @feature8 @HDS010
  Scenario: CMEM001_32 legacy Haiku remains usable when neither AiPomogator nor OpenRouter has a credential
    Given an existing claude-mem settings file with model "claude-haiku-4-5-20251001" and no OpenRouter credential
    When the installed-user model migration runs
    Then the migration result is "credential-required"
    And the existing provider "claude" and model "claude-haiku-4-5-20251001" remain unchanged

  @feature8 @HDS011
  Scenario: CMEM001_33 active OpenRouter route wins over a coexisting AiPomogator credential
    Given active OpenRouter claude-mem settings with legacy model "anthropic/claude-3-haiku"
    When the installed-user model migration runs
    Then the migration result is "migrated"
    And claude-mem keeps the active OpenRouter credential and direct route

  @feature8 @HDS009
  Scenario: CMEM001_31 active custom model wins over a stale provider setting
    Given nested claude-mem settings with active custom model "custom/claude-model" and stale OpenRouter model "anthropic/claude-3-haiku"
    When the installed-user model migration runs
    Then the migration result is "custom-preserved"
    And the custom model "custom/claude-model" remains unchanged
