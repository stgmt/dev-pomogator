Feature: TESTQUAL001_strong-tests skill — mutation-resistant test generation and audit

  Background:
    Given dev-pomogator repo with vitest installed in package.json devDependencies
    And the strong-tests skill is installed at .claude/skills/strong-tests/

  @feature1
  @manual
  Scenario: TESTQUAL001_01_Greenfield_emits_PBT_for_invariant_bearing_function
    Given a TypeScript source file src/foo.ts with a function exhibiting roundtrip invariant
    And no existing test file for that source
    When the skill is invoked in Greenfield mode with target src/foo.ts
    Then the skill SHALL emit at least one fast-check property-based test for the roundtrip invariant
    And every emitted assertion SHALL include a descriptive failure message string
    And the negative-to-positive scenario ratio SHALL be at least 1:2

  @feature2
  @manual
  Scenario: TESTQUAL001_02_Audit_flags_weak_assertions_with_BAD_GOOD_pairs
    Given an existing tests/foo.test.ts containing both expect-toBeDefined and expect-arr-length-gt-zero
    When the skill is invoked in Audit mode against tests/foo.test.ts
    Then the skill SHALL flag both assertions as weak per the 8-pattern catalogue
    And the skill SHALL propose exact-match replacements with rationale
    And the output SHALL include a Compliance Report table mapping each finding to a 12-point self-eval item

  @feature3
  @manual
  Scenario: TESTQUAL001_03_Mutation_feedback_loop_runs_Stryker_until_threshold
    Given a TypeScript project with @stryker-mutator/core installed in devDependencies
    And a target module currently at 60 percent mutation kill rate
    When the skill is invoked in Mutation-feedback mode with threshold 70 against the target
    Then the skill SHALL run Stryker on the target via run-mutation.ts dispatcher
    And the skill SHALL report each survived mutant with file colon line position
    And the skill SHALL apply targeted test fixes iteratively
    And the loop SHALL terminate when kill rate is at least 70 percent OR after max-iter 5 reached with explicit GAP report

  @feature4
  @manual
  Scenario: TESTQUAL001_04_Auto_detect_emits_matrix_for_polyglot_repo
    Given a repository containing both package.json with vitest devDep AND pyproject.toml with pytest dep
    When the skill is invoked without explicit target arguments
    Then the skill SHALL emit a detection matrix listing both TS and Python stacks
    And the matrix SHALL include mutation tool (Stryker, mutmut) and PBT framework (fast-check, Hypothesis) per stack
    And the skill SHALL invoke AskUserQuestion asking which stack to target

  @feature5
  @manual
  Scenario: TESTQUAL001_05_12_point_self_eval_final_gate_with_kill_rate_readiness
    Given the skill has just completed any of the 3 modes (Greenfield OR Audit OR Mutation-feedback)
    When the skill reaches its final step
    Then the output SHALL contain a markdown section heading 12-Point Self-Eval
    And the section SHALL include all 12 checklist items with Status column (PASS or FAIL or N_A)
    And every FAIL row SHALL include an actionable Remediation pointer (file colon line)
    And the final summary line SHALL be Kill-rate-readiness colon HIGH OR MEDIUM OR LOW per the documented rule

  @feature7
  Scenario: TESTQUAL001_06_JiT_PostToolUse_hook_emits_additionalContext_on_collection_returning_function
    Given a TypeScript production source file src/indexer.ts with a function signature returning Array WorktreeEntry and a nested for-loop body
    And the file path does not match any test path exclusion (test or __tests__ or tests slash or dot test dot ts or _test dot py)
    When AI invokes the Edit tool on src/indexer.ts adding or modifying that function
    Then the PostToolUse hook posttool-jit dot ts SHALL fire per extension dot json matcher Write or Edit
    And the hook SHALL invoke detect-invariant-candidates dot ts with src slash indexer dot ts as argument
    And the detector SHALL identify the function as Collection-returning candidate with at least 3 suggestedInvariants from the taxonomy
    And the hook SHALL emit additionalContext containing file path AND function name AND line number AND suggested invariants taxonomy entries
    And the Edit operation SHALL complete without being blocked (emit-only contract)

  @feature7
  Scenario: TESTQUAL001_07_Suppression_comment_skips_detection_and_appends_audit_log
    Given a Python production source file src/foo dot py with a function def tally returning int and an above-line comment hash strong-tests colon skip leaf reducer type system enforces
    When AI invokes the Write tool on src/foo dot py
    Then the detector SHALL skip the tally function in detection scan
    And the hook SHALL append exactly one JSONL line to dot claude slash logs slash strong-tests-skips dot jsonl
    And the JSONL entry SHALL contain fields ts AND file AND function AND reason AND session_id AND cwd AND warning
    And the warning field value SHALL be null because reason length is greater than or equal to 8 characters

  @feature7
  Scenario: TESTQUAL001_09_Detector_identifies_collection_returning_csharp_method_with_nested_loops
    Given a C# production source file src/Services/IndexerService dot cs with a method signature public List of WorktreeEntry BuildIndex with nested for-loop AND foreach-loop in the body
    And the file path does not match any test path exclusion (Tests folder OR Steps dot cs OR Tests dot cs OR Test dot cs OR _test dot cs)
    When AI invokes the Edit tool on src/Services/IndexerService dot cs adding or modifying that method
    Then the detector SHALL set stack to csharp on stdout JSON output
    And the detector SHALL identify the BuildIndex method as Collection-returning candidate with kind nxm-overlap
    And the suggestedInvariants array SHALL contain at least three entries from the taxonomy (cardinality AND uniqueness AND conservation)
    And the PostToolUse hook SHALL emit additionalContext including file path AND function name AND return type AND suggested invariants
    And the Edit operation SHALL complete without being blocked (emit-only contract preserved across v0.1.0 to v0.3.0)

  @feature7
  Scenario: TESTQUAL001_08_Behavioural_prior_section_loads_before_pre_write_checklist
    Given the strong-tests SKILL dot md body file exists at dot claude slash skills slash strong-tests slash SKILL dot md
    When the SKILL dot md content is parsed by any markdown parser
    Then the section heading 1 dot 5 Behavioural prior SHALL appear after section heading 1 Why this exists and before section heading 2 Pre-write checklist
    And the 1 dot 5 section content SHALL contain a reactive vs proactive workflow side-by-side comparison
    And the 1 dot 5 section SHALL contain 3 anti-pattern blocks labelled A AND B AND C with concrete examples from session-pilot incident
    And the 1 dot 5 section SHALL contain a table with 2 verbatim user pinok messages and their meaning
    And the 1 dot 5 section SHALL conclude with the principle quote knowledge of rule not equal application of rule

  @feature7
  Scenario: TESTQUAL001_10_Go_detector_identifies_slice_returning_function_with_nested_for_range_loops
    Given a Go production source file src/indexer.go with a pointer-receiver method returning a slice of Entry with nested for-range AND for-range loops in the body
    And the file path ends with dot go extension
    When the in-process scan is invoked on the Go source content with stack go
    Then the detector SHALL set stack to go
    And the detector SHALL identify the method as Collection-returning candidate
    And the kind SHALL be nxm-overlap because two nested for-range loops are present
    And the suggestedInvariants SHALL include cardinality AND uniqueness AND conservation

  @feature7
  Scenario: TESTQUAL001_11_Composition_chain_detector_identifies_chained_collection_calls_in_TypeScript
    Given a TypeScript production source file src/pipeline.ts with a function that chains dot filter then dot map then dot reduce on a collection
    And the function has no nested loops so nxm-overlap does not apply
    When the in-process scan is invoked on the TypeScript source content with stack ts
    Then the detector SHALL identify the function as composition-chain candidate
    And the kind SHALL be composition-chain
    And the suggestedInvariants SHALL include cardinality AND uniqueness AND conservation AND monotonicity
