# Каждый Scenario несёт @FR-N тег требования (conformance UNTAGGED_SCENARIO; blanket-теги — TAG_BULK_SUSPECT).
Feature: INNERADV01_inner-advisor

  Background:
    Given inner-advisor is enabled as a canonical plugin component
    And a session transcript path is resolvable via CLAUDE_CODE_SESSION_ID + CLAUDE_PROJECT_DIR

  @FR-1
  Scenario: INNERADV01_consult_uses_rolling_summary_not_full_transcript
    Given a rolling session summary.md exists with 10 '#'-section headers
    When the advisor MCP tool is invoked without parameters
    Then the consultation is built from the summary plus a small delta tail
    And the built packet reports mode 'summary' instead of rebuilding the full transcript

  @FR-2
  Scenario: INNERADV02_gate_skips_short_sessions_and_force_overrides
    Given a session with content tokens below the init threshold (5000)
    When the stop hook evaluates the summary gate
    Then no summary update is performed
    And with ADVISOR_SUMMARY_FORCE=1 the gate is bypassed and the summary is created

  @FR-3
  Scenario: INNERADV03_stop_hook_updates_summary_and_fails_open
    Given a long session that passes the summary gate
    When the stop hook fires at end of turn
    Then the summary is updated atomically under a per-session lock using the recent delta
    And on any error the stop is not blocked (fail-open)

  @FR-4
  Scenario: INNERADV04_mcp_tool_available_without_machine_paths
    Given the plugin is installed canonically
    When a new session starts and the agent calls mcp__dev-pomogator-advisor__advisor
    Then the tool is available in every session
    And the registered command resolves via CLAUDE_PLUGIN_ROOT, not an absolute repo path

  @FR-5
  Scenario: INNERADV05_fail_open_when_model_unavailable
    Given no ANTHROPIC_BASE_URL token or a model timeout
    When the advisor is consulted
    Then it returns a short fail-open answer (or {})
    And the Stop hook never blocks because of advisor failure

  @FR-6
  Scenario: INNERADV06_balanced_skeptic_does_not_manufacture_done_blocks
    Given a complete, evidenced session with no goal drift and no rule violation
    When the advisor evaluates in 'balanced' mode
    Then it says the work looks sound and names one verification
    And it does not emit a template "do not declare done" without a concrete reason

  @FR-7
  Scenario: INNERADV07_no_coupling_with_out_session_advisor
    Given the out-session-advisor spec and implementation exist
    When the inner-advisor implementation is checked for coupling
    Then tools/advisor does not import from out-session-advisor
    And paths, hooks and data files are distinct

  @FR-8
  Scenario: INNERADV08_bench_compression_meets_margin
    Given a real 10-16 MB session transcript
    When real-sessions bench runs
    Then raw-to-digest ratio is at most 0.3% and quality layer q is at least 2

  @FR-9
  Scenario: INNERADV09_advisor_is_strictly_read_only
    Given the advisor MCP tool is invoked
    When the advisor's tool surface is inspected
    Then it exposes only read operations (no Write / Edit / state-changing Bash)
    And any identified problem is returned as re-delegate guidance, never as a self-applied fix
    And summary.md / session-state.json are written only by the Stop hook

  @FR-10
  Scenario: INNERADV10_mindlas_metrics_reach_the_advisor
    Given mindlas scorecard --json is available (or demo fixture)
    And ADVISOR_MINDLAS=1
    When the advisor packet is built
    Then it includes a MINDLAS METRICS section with the four gauges
    And with mindlas unavailable the consultation still works without that section

  @FR-3
  Scenario: INNERADV11_bundle_entry_executes_as_process_on_posix
    Given the advisor stop bundle exists at the canonical plugin path
    When the bundle is spawned as a process with an empty hook input
    Then it exits 0 and prints an approve JSON on stdout
    And it records the stop event in the advisor fires log