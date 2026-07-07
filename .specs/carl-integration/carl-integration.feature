Feature: CARL001_CARL integration lifecycle

  CARL integration packages CARL rules/recall hooks as a managed dev-pomogator integration for Claude Code first, with Codex support gated behind the Codex launcher and dispatcher path.

  Background:
    Given dev-pomogator is installed
    And specs-workflow extension is enabled

  @feature1
  @FR-1
  Scenario: CARL001_01 Claude Code install creates managed CARL artifacts
    Given a supported Claude Code project has no managed CARL artifacts
    When the CARL integration installer runs for Claude Code
    Then managed CARL artifacts are created with dev-pomogator owner and version markers
    And project language coverage is recorded separately from global CARL runtime support
    And Russian prompts without project Russian coverage are reported as degraded instead of healthy empty recall
    And unrelated user configuration remains unchanged

  @feature1
  @FR-1
  Scenario: CARL001_11 Russian CARL adapter refreshes rule and skill domains
    Given a project rule or skill is added after CARL was generated
    When the CARL adaptation script runs for the project
    Then the project CARL manifest records the changed source hash
    And Russian aliases are added when safe source text or curated overrides exist
    And sources without safe Russian aliases are marked as needing aliases instead of being silently omitted

  @feature2
  @FR-2
  Scenario: CARL001_02 Missing CARL runtime is not reported as healthy
    Given managed CARL files exist without a runnable CARL runtime consumer
    When CARL integration health is evaluated
    Then the CARL status is degraded rather than healthy
    And the diagnostic names the missing runtime consumer

  @feature3
  @FR-3
  Scenario: CARL001_03 Hook registration invokes the real CARL runner
    Given the managed CARL hook is registered through the plugin hook launcher
    When the hook launcher executes the CARL hook event
    Then the managed CARL runner is invoked through the registered command path
    And the runner records runtime consumer proof in the project manifest
    And the scenario fails if only CARL files exist without a runtime consumer

  @feature4
  @FR-4
  Scenario Outline: CARL001_04 Broken CARL hook fails open with agent-visible warning
    Given the managed CARL hook is configured with a <failure_mode> failure
    When the CARL hook executes during an agent session
    Then the hook result is fail-open
    And the CARL diagnostic code is <diagnostic_code>
    And agent-visible context warns that CARL did not run
    And the warning reminds the AI agent to tell the user CARL guidance was unavailable

    Examples:
      | failure_mode       | diagnostic_code   |
      | missing dependency | missing-runtime   |
      | timeout            | timeout           |
      | malformed output   | malformed-output  |
      | unsupported runtime | unsupported       |
      | runtime exception  | exception         |

  @feature5
  @FR-5
  Scenario: CARL001_05 Doctor repairs stale managed CARL artifacts
    Given a project has stale managed CARL version markers
    When pomogator-doctor runs the CARL check with repair enabled
    Then doctor reports the stale CARL state
    And doctor refreshes only managed CARL artifacts
    And user-owned configuration remains unchanged

  @feature6
  @FR-6
  Scenario: CARL001_06 User-owned CARL configuration is preserved
    Given a project has a user-authored CARL hook entry outside the dev-pomogator managed region
    When CARL repair runs
    Then the user-authored CARL hook entry is preserved
    And managed CARL entries are written only inside managed markers or deterministic managed keys

  @feature7
  @FR-7
  Scenario: CARL001_07 Codex CARL path waits for launcher and dispatcher prerequisites
    Given the Codex context-menu launcher or Codex hook dispatcher prerequisite is unavailable
    When CARL integration evaluates the Codex platform path
    Then Codex CARL is reported as unsupported or deferred
    And Claude Code CARL status is evaluated independently

  @feature8
  @FR-8
  Scenario: CARL001_08 Review report separates verified and unverified CARL claims
    Given CARL integration implementation evidence is collected
    When the CARL review report is generated
    Then the report covers install, runtime consumer, warning injection, doctor repair, user preservation, Codex sequencing, and benchmark evidence
    And each external CARL claim is marked VERIFIED, UNVERIFIED, or ASSUMED

  @feature8
  @FR-8
  Scenario: CARL001_12 Russian CARL self-evaluation report proposes optimizations
    Given Russian CARL prompt evaluation cases are defined with expected domains
    When the Russian CARL evaluator runs against fixture-backed or real CARL output
    Then the report records expected and actual loaded domains for each prompt
    And false positives and false negatives are listed with optimization recommendations
    And fixture-backed sibling output is not reported as dev-pomogator runtime readiness

  @feature9
  @FR-9
  Scenario: CARL001_09 Recall benchmark refuses invented thresholds
    Given CARL recall benchmark evidence has no real CARL artifact yet
    When the CARL benchmark gate is evaluated
    Then the benchmark threshold remains draft or blocked
    And no numeric pass threshold is invented

  @feature9
  @FR-9
  Scenario: CARL001_10 Recall benchmark accepts a real CARL baseline
    Given a real CARL recall artifact has been captured with provenance, source hashes, and producer ground truth
    When the CARL benchmark runs against that artifact
    Then the benchmark records a baseline for supported metrics
    And future regression checks compare against that baseline
