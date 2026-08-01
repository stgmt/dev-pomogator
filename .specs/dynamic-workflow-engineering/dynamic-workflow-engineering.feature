Feature: DWE001_Dynamic_Workflow_Engineering
  Direct subagents are forbidden outside bounded Dynamic Workflow contracts, and workflow quality is judged from evidence rather than size alone.

  @FR-1 @feature1
  Scenario: DWE001_01_Direct_Agent_is_denied_before_spawn
    Given the dynamic workflow policy is active without trusted Workflow provenance
    When an actual native Agent invocation is submitted
    Then the invocation is denied before spawn with reason DWE_DIRECT_AGENT_DENIED
    And the guidance names Dynamic Workflow and dynamic-workflow-engineering

  @FR-2 @feature2
  Scenario: DWE001_02_Registered_Workflow_child_is_admitted_within_contract
    Given a valid runtime-issued Workflow context and current consumer contract
    When one allowed child is requested within subtype call concurrency and envelope limits
    Then exactly one child is admitted
    And a duplicate extra forged or expired request is denied

  @FR-3 @feature3
  Scenario: DWE001_03_Canonical_install_discovers_skill_and_steering
    Given dev-pomogator is installed in a clean home without repository node_modules
    When the installed plugin handles a denied direct delegation request
    Then the bundled dynamic-workflow-engineering skill is discoverable
    And repository and installed guidance use the same policy inventory

  @FR-4 @feature4
  Scenario: DWE001_04_Unbounded_workflow_fails_admission
    Given a workflow has no finite population or discovery bound
    And it omits ownership barrier evidence output or stop contracts
    When workflow admission runs
    Then no child is spawned
    And the missing bounds are reported deterministically

  @FR-5 @feature5
  Scenario: DWE001_05_Deterministic_collection_precedes_bounded_classification
    Given a finite issue and spec inventory can be collected mechanically
    When the workflow plan is built
    Then one bounded deterministic retrieval classifies the finite population first
    And child attempts calls rounds findings and input size cannot exceed the contract
    And unsupported hard time or token preemption is labelled best effort

  @FR-6 @feature6
  Scenario: DWE001_06_Repeated_unchanged_failure_trips_circuit_breaker
    Given one logical call returns the same normalized failure without output
    When automatic physical attempts reach the configured ceiling without material change
    Then the circuit opens and no further automatic attempt starts
    And resume requires a changed prompt scope or contract

  @FR-7 @feature7
  Scenario: DWE001_07_Monitor_uses_journal_evidence_not_size_only
    Given a large workflow journal contains progress attempts outputs failures and barrier state
    When status is classified
    Then logical calls and physical attempts are reported separately
    And FACT INFERENCE UNKNOWN and ACTION are separated
    And elapsed time tokens or Large workflow alone do not produce a runaway verdict

  @FR-8 @feature8
  Scenario: DWE001_08_Independent_completed_output_survives_sibling_failure
    Given one independent branch completed and another exhausted bounded retries
    When partial synthesis runs
    Then the completed result remains inspectable and conserved
    And the missing scope and partial status are explicit
    And full coverage is not claimed

  @FR-9 @feature9
  Scenario: DWE001_09_Verifier_refutes_without_repeating_discovery
    Given a finding cites a location input and wrong output
    When the adversarial verifier receives bounded evidence
    Then it attempts to refute premise reachability gates reproduction and severity
    And it returns CONFIRMED PLAUSIBLE REFUTED or BLOCKED
    And it does not repeat the complete discovery crawl

  @FR-10 @feature10
  Scenario: DWE001_10_Stop_and_resume_are_journal_first
    Given a workflow has completed unchanged calls and one incomplete call
    When an operator evaluates stop and resumes with a material change
    Then journal calls attempts outputs failures coverage and reproduction are inspected first
    And completed unchanged calls are reused
    And only incomplete or changed work reruns

  @FR-11 @feature11
  Scenario: DWE001_11_Protected_policy_fails_closed_and_audit_is_redacted
    Given the protected policy cannot initialize authorize or transport a decision
    When a native Agent invocation is attempted
    Then the invocation is denied rather than failed open
    And exactly one audit event contains policy consumer run attempt reason counters hash and schema result
    And the event contains no raw prompt secret token or tool payload

  @FR-12 @feature12
  Scenario: DWE001_12_Guarantee_tier_matches_real_host_evidence
    Given clean-install and real-host capability probes have completed
    When the guarantee is published
    Then the tier is exactly ENFORCED STEERING_ONLY or UNAVAILABLE
    And a missing trusted pre-spawn origin cannot be called a complete ban

  @FR-13 @feature13
  Scenario: DWE001_13_Dogfood_incidents_replay_without_false_completion
    Given journal-shaped fixtures for the finite inventory incident and partial useful review
    When the workflow evaluator replays both incidents
    Then unchanged broad retries are circuit-broken
    And independent outputs and reproduced findings are preserved
    And missing inputs and coverage gaps remain visible
    And logical calls differ from physical attempts
