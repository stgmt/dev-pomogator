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

  @feature13
  Scenario: TESTQUAL001_17_Classifier_detects_pure_unit_C_sharp_file_with_high_confidence
    Given a C# test file with only plain assertions and no HttpClient or DbContext or Process references
    When the classifier is run on the directory containing that C# test file
    Then the JSON output SHALL contain a classification entry with type Unit for the C# file
    And the confidence SHALL be high

  @feature13
  Scenario: TESTQUAL001_18_Classifier_detects_C_sharp_file_with_Moq_and_IClassFixture_as_Integration
    Given a C# test file that references Moq and IClassFixture
    When the classifier is run on the directory containing that Moq IClassFixture file
    Then the JSON output SHALL contain a classification entry with type Integration for the Moq file

  @feature13
  Scenario: TESTQUAL001_19_Classifier_detects_C_sharp_file_with_WebApplicationFactory_and_Docker_as_E2E
    Given a C# test file that references WebApplicationFactory and Docker
    When the classifier is run on the directory containing that WebApplicationFactory Docker file
    Then the JSON output SHALL contain a classification entry with type E2E and high confidence for the WebApplicationFactory file

  @feature13
  Scenario: TESTQUAL001_20_Classifier_detects_existing_Trait_marker_as_current_marker
    Given a C# test file that already has a Trait Category marker
    When the classifier is run on the directory containing that already-marked file
    Then the JSON output SHALL have a non-null current_marker field for that file

  @feature13
  Scenario: TESTQUAL001_21_Classifier_detects_Python_pytest_file_with_mock_as_Integration
    Given a Python test file that imports pytest and unittest.mock
    When the classifier is run on the directory containing that Python mock file
    Then the JSON output SHALL contain a classification entry with type Integration for the Python file

  @feature13
  Scenario: TESTQUAL001_22_Classifier_markdown_format_emits_report_with_Unit_Integration_E2E_sections
    Given a directory containing a mix of test files of different types
    When the classifier is run on that directory with --format markdown
    Then the output SHALL contain markdown headings for Unit and Integration and E2E sections

  @feature13
  Scenario: TESTQUAL001_23_Classifier_returns_empty_array_for_directory_with_no_test_files
    Given a directory containing no test files
    When the classifier is run on that empty directory
    Then the JSON output SHALL be an empty array

  @feature13
  Scenario: TESTQUAL001_24_Classifier_dry_run_reports_wouldApply_count_without_modifying_files
    Given a directory with an unclassified C# test file for dry-run testing
    When the classifier is run with --apply --dry-run on that directory
    Then the output SHALL report a wouldApply count greater than zero
    And the target C# file SHALL remain unmodified after dry-run

  @feature13
  Scenario: TESTQUAL001_25_Classifier_apply_injects_Trait_Category_Unit_above_C_sharp_class
    Given a directory with an unclassified Unit-level C# test file for apply testing
    When the classifier is run with --apply on that directory
    Then the target C# file SHALL contain a Trait Category Unit annotation above the class declaration

  @feature13
  Scenario: TESTQUAL001_26_Classifier_apply_skips_files_with_existing_Trait_marker
    Given a C# test file that already has a Trait Category Integration marker
    When the classifier is run with --apply on the directory containing that already-marked C# file
    Then the already-marked C# file SHALL remain unchanged after --apply

  @feature13
  Scenario: TESTQUAL001_27_Classifier_apply_confidence_high_skips_medium_confidence_files
    Given a C# test file that the classifier assigns medium confidence
    When the classifier is run with --apply --confidence=high on the directory containing that medium-confidence file
    Then the medium-confidence C# file SHALL NOT have a Trait marker injected

  @feature13
  Scenario: TESTQUAL001_28_Classifier_apply_injects_pytestmark_and_adds_pytest_import_for_Python
    Given a Python test file without an existing pytestmark and without a pytest import
    When the classifier is run with --apply on the directory containing that unmarked Python file
    Then the Python file SHALL contain a pytestmark assignment at module level
    And the Python file SHALL have import pytest added if it was missing

  @feature3
  Scenario: TESTQUAL001_29_Batch_prompt_splits_130_survivors_into_3_chunks_of_50_with_monotone_cost
    Given a mutation report JSON file containing 130 survivors
    When survivors-batch-prompt is run on that report with default batch size 50
    Then the output SHALL contain exactly 3 batch JSON lines
    And the cumulative_cost_usd field SHALL be monotonically increasing across all batches
    And each batch prompt SHALL contain the strings Meta ACH and EQUIVALENT and REAL_GAP and survivor_id

  @feature3
  Scenario: TESTQUAL001_30_Budget_guard_aborts_emit_when_estimated_cost_exceeds_budget
    Given a mutation report JSON file containing 500 survivors
    When survivors-batch-prompt is run with budget-usd 0.1 on that report
    Then the process SHALL exit with status 3
    And stderr SHALL contain the string Budget exceeded

  @feature3
  Scenario: TESTQUAL001_31_Merge_verdicts_enriches_report_gaps_with_equivalentSuspect_and_summary
    Given a mutation report JSON file with 3 survivors and a verdict JSON file matching all 3 by survivor_id
    When merge-survivor-verdicts is run with that report and verdicts file
    Then the stdout JSON SHALL contain a gaps array with equivalentSuspect fields populated
    And the survivorAnalysis summary SHALL report mergedIntoGaps equal to 3

  @feature3
  Scenario: TESTQUAL001_32_Merge_verdicts_warns_on_unmatched_verdict_ids
    Given a mutation report JSON file with 1 survivor and a verdict JSON file with 1 matching and 1 stale verdict
    When merge-survivor-verdicts is run with that report and mixed verdicts file
    Then the survivorAnalysis summary SHALL report unmatchedVerdicts equal to 1 and mergedIntoGaps equal to 1
    And stderr SHALL contain the string did not match any survivor

  @feature3
  Scenario: TESTQUAL001_33_Batch_prompt_prefers_gaps_array_over_survivors_when_both_present
    Given a mutation report JSON file containing both a survivors array with 2 entries and a gaps array with 1 entry
    When survivors-batch-prompt is run on that report
    Then the output SHALL contain exactly 1 batch JSON line reflecting the gaps array length

  @feature7
  Scenario: TESTQUAL001_34_Detector_suggests_coverage_and_no_leak_for_Map_returning_function
    Given a TypeScript file with a Map-returning function and a single loop
    When the invariant detector scans the file
    Then the candidate suggestedInvariants SHALL include coverage and no-leak

  @feature7
  Scenario: TESTQUAL001_35_Detector_suggests_idempotence_and_monotonicity_for_Iterable_returning_function
    Given a TypeScript file with an Iterable-returning function and a single loop
    When the invariant detector scans the file
    Then the candidate suggestedInvariants SHALL include idempotence and monotonicity

  @feature7
  Scenario: TESTQUAL001_36_Detector_flags_Python_nested_for_in_as_nxm_overlap
    Given a Python file with a function containing nested for-in loops
    When the invariant detector scans the file
    Then the candidate kind SHALL be nxm-overlap with the conservation invariant
