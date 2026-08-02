Feature: DWE001_Dynamic_Workflow_Engineering
  Dynamic Workflow work is finite, deterministic-first, journaled, adversarially verified, and judged by evidence rather than size alone. Native Agent and Workflow-native agent() are separate subjects.

  @pending @FR-1 @feature1
  Scenario: DWE001_01_Unproven_native_Agent_boundary_publishes_no_fake_hard_ban
    Given no protected native-Agent pre-spawn boundary has been proven and installed
    When the host capability matrix evaluates the native Agent route
    Then the published guarantee is STEERING_ONLY or UNAVAILABLE
    And no prompt label frontmatter subtype session environment marker or claimed Workflow provenance authorizes native Agent

  @pending @FR-1 @feature1
  Scenario: DWE001_14_Proven_native_Agent_boundary_denies_direct_and_nested_calls
    Given a protected native-Agent pre-spawn boundary has been proven and installed
    When a native Agent call is attempted directly or from inside a Workflow worker
    Then the call is denied before child spawn with reason DWE_DIRECT_AGENT_DENIED
    And guidance names Dynamic Workflow and dynamic-workflow-engineering
    And a valid Workflow-native agent() packet remains independently eligible for bounded admission

  @pending @FR-2 @feature2
  Scenario: DWE001_02_Runtime_issued_Workflow_packet_is_admitted_within_exact_contract
    Given a valid runtime-issued Workflow run and attempt identity bound to one finite consumer contract
    When one Workflow-native child is requested within its declared scope subtype call concurrency and schema limits
    Then exactly one child is admitted
    And a duplicate stale widened expired or exceeded request is denied
    And caller-supplied copies of trusted context cannot authorize delivery

  @pending @FR-2 @feature2
  Scenario: DWE001_28_Caller_controlled_provenance_never_authorizes_a_child
    Given a request copies trusted-looking run attempt consumer operation prompt and environment fields
    But no matching runtime-issued packet identity exists
    When Workflow-native admission evaluates the request
    Then the request is denied deterministically before child spawn
    And the audit records only redacted reason and identity hashes

  @pending @FR-3 @feature3
  Scenario: DWE001_03_Canonical_install_resolves_skill_and_scripts_from_plugin_root
    Given dev-pomogator is installed in a clean home without repository node_modules
    And the current working directory is outside the repository
    When the installed plugin discovers the Dynamic Workflow skill and resolves an executable scriptPath
    Then the bundled dynamic-workflow-engineering skill is discoverable
    And scriptPath resolves from CLAUDE_PLUGIN_ROOT or the installed plugin root
    And the result does not assume .claude/workflows is automatically distributed

  @pending @FR-4 @feature4
  Scenario: DWE001_04_Unbounded_or_incomplete_packet_fails_admission
    Given a packet has no finite population or discovery bound
    And it omits ownership barrier evidence output stop or blocked-scope contracts
    When workflow admission runs
    Then no child is spawned
    And every missing contract field is reported deterministically
    And recursive rediscovery is rejected

  @pending @FR-4 @feature4
  Scenario: DWE001_15_Root_and_worktree_mismatch_block_before_first_work_action
    Given a packet declares expectedRoot an exact existing or explicitly isolated worktree baseSha and dirty-path allowlist
    But normalized expectedRoot differs from the actual git top-level or worktree mode
    When preflight runs
    Then the run is blocked before Read Write Bash spawn or mutation
    And existing-worktree continuation never silently creates another worktree

  @pending @FR-4 @feature4
  Scenario: DWE001_16_State_transitions_and_locks_have_one_fenced_writer
    Given a run is in CREATED with a runtime-issued owner instance process start identity stateVersion and fencingToken
    When it advances through root verification ownership preflight and plan freeze
    Then every transition compare-and-swaps stateVersion
    And source mutation remains blocked until PLAN_FROZEN
    And checkout-writer lock is acquired before external-runtime lease
    And a second mutating owner is denied

  @pending @FR-4 @feature4
  Scenario: DWE001_17_Stale_owner_takeover_issues_a_new_fencing_token
    Given a lock owner stopped and its lease expired after bounded renewal and stale-owner inspection
    When an eligible takeover acquires ownership
    Then takeover issues a newer fencingToken and ownerInstanceId
    And the old owner cannot renew release or write with its stale token
    And lock timeout expiry takeover and release are journaled

  @pending @FR-5 @feature5
  Scenario: DWE001_05_Deterministic_inventory_and_serial_phase_adapter_precede_model_work
    Given a finite issue and spec inventory can be collected mechanically
    When the packet runs its collectors and serial phase adapter
    Then source scope digest cardinality and ordering are persisted before any model loop
    And authoritative serial phase order is unchanged
    And a non-zero child exit is an explicit phase failure
    And no adapter performs an N-by-M rediscovery crawl

  @pending @FR-5 @feature5
  Scenario: DWE001_26_Each_resource_ceiling_has_an_honest_control_mode
    Given a packet declares logical-call physical-attempt concurrency round tool finding byte token and wall-clock ceilings
    When host capability and admission evaluate the ceilings
    Then each ceiling is classified as hard admission hard cancellation monitored circuit best-effort or unavailable
    And post-event observation is not reported as enforcement
    And a packet requiring an unavailable hard guarantee is rejected or explicitly downgraded before launch

  @pending @FR-5 @feature5
  Scenario: DWE001_27_Captured_process_and_typed_summary_preserve_ground_truth
    Given an external command and typed result collection are required
    When the canonical captured-process runner executes an argv array
    Then UTF-8 stdout stderr evidence native exit code and atomic result JSON are preserved separately
    And failure diagnostics are collected without replacing the native error
    And count must equal items.length
    And external producer claims require independent readback through the canonical real API path

  @pending @FR-6 @feature6
  Scenario: DWE001_06_One_changed_retry_then_circuit_breaker
    Given one logical call fails without sufficient output
    When retry policy classifies the failure
    Then unchanged context-exhausted invalid_request schema and budget failures do not retry
    And at most one retry is allowed only after a materially changed or narrowed strategy is journaled
    And the circuit opens after the permitted retry or any non-retryable failure
    And logical calls remain distinct from physical attempts

  @pending @FR-6 @feature6
  Scenario: DWE001_20_Repeated_infrastructure_failure_enters_harness_repair
    Given two physical attempts fail with the same infrastructure signature
    When the retry circuit evaluates the second failure
    Then the run enters HARNESS_REPAIR
    And domain apply remains blocked
    And the next action is repair or explicit disposition rather than another unchanged attempt

  @pending @FR-7 @feature7
  Scenario: DWE001_07_Per_run_monitor_separates_progress_from_size
    Given a selected run directory contains state progress commands artifacts and terminal records
    When status is classified
    Then logical calls and physical attempts are reported separately
    And FACT INFERENCE UNKNOWN and ACTION are separated
    And elapsed time tokens or Large workflow alone do not produce a stalled or runaway verdict
    And only the selected runId and monotonic seq can prove current progress
    And stale pulses or monitors from other runs are ignored

  @pending @FR-7 @feature7
  Scenario: DWE001_18_Stop_is_terminal_only_after_the_owned_process_tree_is_empty
    Given an owner has wrappers PowerShell jobs WSL nested CLIs child Claude processes monitors and writers
    When stop is requested for its OS process group or Windows Job Object
    Then completion reports ownerStopped true descendantsRemaining zero and writersRemaining zero
    And monitors inherit the owner and terminate with it
    And foreign-owned processes and resources are not stopped or deleted

  @pending @FR-8 @feature8
  Scenario: DWE001_08_Completed_branch_output_is_conserved_without_false_completeness
    Given one mandatory branch completed with evidence and another mandatory branch is blocked exhausted or dropped
    When partial synthesis runs
    Then the completed result remains inspectable exportable and conserved
    And every missing blocked and dropped scope is explicit
    And overall completeness is not COMPLETE unless all mandatory branches have required evidence

  @pending @FR-8 @feature8
  Scenario: DWE001_21_Source_mutation_is_staged_until_required_gates_pass
    Given baseline hashes and typed originalCandidates staged proven rejected deferred and unprovenApplied collections exist
    When a mutation batch is evaluated by ordered required gates
    Then source replacement occurs only after the declared commit boundary
    And a failed mandatory gate rolls back or quarantines the batch as unproven
    And plan refresh does not count unprovenApplied entries as complete
    And unrelated global BDD or log green cannot close the active incomplete run

  @pending @FR-9 @feature9
  Scenario: DWE001_09_Bounded_verifier_refutes_without_rediscovery
    Given a finding cites a location allowed input expected output wrong output and minimal reproduction evidence
    When an adversarial verifier receives only the bounded finding context
    Then it tries to refute premise reachability surrounding gates reproduction and severity
    And it returns CONFIRMED PLAUSIBLE REFUTED or BLOCKED
    And it does not repeat the complete discovery crawl
    And useful partial findings do not imply full scope coverage

  @pending @FR-10 @feature10
  Scenario: DWE001_10_Redacted_journal_supports_offline_replay
    Given a redacted per-run journal references compatible producer evidence
    When an operator replays it offline
    Then replay reads only journal and exporter artifacts
    And replay does not contact the producer network GitHub MCP or a model
    And missing incomplete or incompatible producer evidence returns REPLAY_UNAVAILABLE

  @pending @FR-10 @feature10
  Scenario: DWE001_19_Unsafe_old_context_resume_is_rejected
    Given a run ended as TERMINATED_NO_RESUME after contamination or context overflow
    When an old worker or SendMessage attempts to continue it
    Then continuation is rejected
    And a new worker receives only a bounded recovery capsule with root owner base SHA dirty paths accepted evidence unproven work last green gate blocker next action and do-not-touch paths
    And a PAUSED_RESUMABLE run may reuse only unchanged completed calls

  @pending @FR-11 @feature11
  Scenario: DWE001_11_Protected_route_fails_closed_and_emits_one_redacted_audit_event
    Given a proven and installed protected route cannot initialize authorize or transport a policy decision
    When a native Agent invocation is attempted
    Then the protected invocation is denied rather than failed open
    And exactly one audit event contains redacted policy consumer run attempt reason counters hash strategy marker and schema result
    And the event contains no raw prompt secret token or tool payload
    And native exit code and terminal diagnostics remain authoritative over warnings locks stale pulses and foreign runs
    And unrelated routes retain their documented behavior

  @pending @FR-12 @feature12
  Scenario: DWE001_12_Real_host_matrix_publishes_one_honest_guarantee_tier
    Given clean-install foreign-CWD dependency-absent and real-host probes have completed
    When the guarantee is published
    Then the tier is exactly ENFORCED STEERING_ONLY or UNAVAILABLE
    And an unproven pre-spawn boundary cannot install or claim a complete native-Agent gate
    And installed and repository behavior are compared without treating prose or mocks as host proof

  @pending @FR-12 @feature12
  Scenario: DWE001_22_Shared_resources_require_owned_identity_and_mount_validation
    Given an external shared runtime or container already exists
    When a workflow considers reuse replacement or cleanup
    Then repository worktree SHA run owner lease and actual mount or source are validated
    And a healthy matching resource may be reused
    And an expired task-owned resource may follow the declared replacement policy
    And a foreign-owned resource is never deleted
    And startup failure preserves complete diagnostics

  @pending @FR-13 @feature13
  Scenario: DWE001_13_First_local_incident_replays_without_losing_partial_output
    Given the first local incident exporter reconciles audit-reports/wf-0315d03b-28f-mcp-incident.json with its producer journal and transcripts
    When the evaluator replays the incident and corrected bounded path
    Then evidence records six spec attempts 695 spec-MCP calls 5459786 response bytes a completed GitHub branch and zero spec structured outputs
    And the completed GitHub output remains available despite the exhausted spec branch
    And corrected verification stays within three spec-MCP calls and 512 KiB aggregate response bytes
    And missing producer evidence returns REPLAY_UNAVAILABLE instead of a fabricated positive replay

  @pending @FR-13 @feature13
  Scenario: DWE001_23_Second_user_supplied_incident_is_provenance_only
    Given the second incident is a user-supplied postmortem without original producer artifacts
    When its claims are evaluated for replay or completion evidence
    Then its commits tests model names container names and adjacent-project results are context only
    And authoritative replay is REPLAY_UNAVAILABLE until original run-state journals process scans terminal diagnostics lease and mount evidence and independent producer readback are reconciled
    And no task implementation or guarantee tier becomes complete from the supplied report

  @pending @FR-1 @FR-2 @FR-4 @feature1 @feature2 @feature4
  Scenario: DWE001_24_Deterministic_consumer_census_finds_every_native_Agent_surface
    Given a working bounded Workflow pilot exists
    When the repository census enumerates native Agent consumers and Workflow-native agent() consumers
    Then each source location subject and current contract is recorded deterministically
    And architecture-decision-builder is included as a known prior omission
    And nested children monitors background processes and writers appear in the ownership census

  @pending @FR-1 @FR-2 @FR-4 @feature1 @feature2 @feature4
  Scenario: DWE001_25_Consumer_migration_requires_an_exact_bounded_contract
    Given the deterministic census contains an unmigrated native Agent consumer
    When migration evaluates that consumer
    Then it receives an exact bounded Workflow contract or an explicit OUT_OF_SCOPE or blocked record
    And workflow text never authorizes the native Agent route
    And no consumer is declared migrated without executable evidence from its real path
