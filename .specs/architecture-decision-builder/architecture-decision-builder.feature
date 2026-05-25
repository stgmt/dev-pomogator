Feature: ARCH001_Architecture_Decision_Builder
  As a developer with a greenfield project (PRD only, no code)
  I want multi-variant tech-stack proposals rendered as browser HTML
  So that I choose the stack deliberately with pros/cons/cost/recommendation

  Background:
    Given the architecture-decision helper scripts are installed

  @feature1
  Scenario: ARCH001_01 Enumerate axes from greenfield PRD
    Given a greenfield PRD fixture without build-manifest
    When I run architecture-decision-cli.ts detect-axes on the PRD
    Then the result should return at least 1 axis
    And each axis should have a tier of "Critical", "Important", or "Deferred"

  @feature2
  Scenario: ARCH002_01 Generate per-axis markdown and HTML
    Given an axis candidate "hosting" with 3 variants
    When I run generate-axis for that axis
    Then a markdown file and a self-contained HTML file should be created
    And the HTML should contain inline CSS without external link tags
    And exactly one variant should be marked recommended and pinned top

  @feature3
  Scenario: ARCH004_01 Browser launch is ENOENT-safe
    Given an axis HTML file exists
    When open-in-browser is called in an environment without a browser
    Then the result should report launched=false with a fallback path
    And no exception should be thrown

  @feature4
  Scenario: ARCH005_01 Iterative choice records selection
    Given an axis artefact is generated and shown
    When the user selects "Take recommendation" via AskUserQuestion
    Then the axis frontmatter should record status=accepted and the chosen variant
    And the rationale should be stored

  @feature5
  Scenario: ARCH003_01 INDEX compile is idempotent
    Given two axis files with frontmatter exist
    When I run compile-index twice
    Then the content between AUTOGEN markers should be replaced not duplicated
    And user content outside the markers should be preserved

  @feature6
  Scenario: ARCH005_02 Cascading adds dependent axis within depth cap
    Given an axis choice that maps to a dependent axis
    When the choice is recorded
    Then the dependent axis should be appended to QUEUE.json
    And cascading should stop prompting beyond depth 2

  @feature7
  Scenario: ARCH005_03 create-spec Phase 1.75 invocation and migration guard
    Given a greenfield spec with progress version 4
    When create-spec reaches Phase 1.75
    Then the skill should be invoked with enumerate then next-axis loop
    And a spec with version less than 4 should skip Phase 1.75 as no-op

  @feature8
  Scenario: ARCH002_02 Anti-bias guardrails applied
    Given an axis with multiple variants is generated
    When the artefact is produced
    Then at least one variant should be outside the obvious default
    And each fact should carry a VERIFIED or UNVERIFIED marker

  @feature9
  Scenario: ARCH005_04 ARCHITECTURE_COVERAGE blocks STOP on pending axis
    Given an axis remains in status pending at Phase 2 STOP
    When the audit command runs
    Then it should emit an ARCHITECTURE_COVERAGE finding with severity WARNING

  @feature10
  Scenario: ARCH001_02 Escape hatch logs to JSONL with reason guard
    Given an axis marked with "[skip-architecture-axis: pure prototype scope]"
    When the skill processes the axis
    Then an entry should be appended to spec-architecture-escapes.jsonl
    And a reason shorter than 12 chars should emit WARNING_REASON_TOO_SHORT

  @feature11
  Scenario: ARCH006_01 Eval suite deterministic grading and anti-hallucination rubric
    Given the evals.json contract with a greenfield fixture
    When the deterministic eval runs
    Then grading.json should list expectations with passed and evidence
    And aggregate.json should roll up total passed failed
    And a tech claim in an artefact without a VERIFIED or UNVERIFIED marker should fail rubric R3

  @feature12
  Scenario: ARCH005_05 COMPLETENESS_COVERAGE blocks STOP on pending dimension
    Given a completeness ledger where the "compliance-privacy" dimension is pending
    When the audit-completeness command runs
    Then it should emit a COMPLETENESS_COVERAGE finding with code DIMENSION_PENDING and severity WARNING
    And a missing COMPLETENESS.md file should be treated as all 8 dimensions pending

  @feature13
  Scenario: ARCH005_06 COMPLETENESS_COMPLETE positive signal and reason guard
    Given a completeness ledger where all 8 dimensions are addressed or out-of-scope
    When the audit-completeness command runs
    Then it should emit exactly one COMPLETENESS_COMPLETE finding with severity INFO
    And an out-of-scope dimension whose reason is shorter than 12 chars should emit WARNING_REASON_TOO_SHORT

  @feature14
  Scenario: ARCH007_01 Cross-axis synthesis produces emergent insight
    Given a spec with two resolved axes whose choices interact
    When the synthesis command runs
    Then SYNTHESIS.md should be created
    And each insight should reference at least two axis ids

  @feature15
  Scenario: ARCH007_02 Correction-log renders only when non-empty
    Given a variant with a non-empty correction_log
    When the axis artefact is generated
    Then the markdown should contain a Corrections section
    And a variant without correction_log should produce no Corrections section

  @feature18
  Scenario: ARCH001_06 stack-locked prose still enumerates axes (completeness can run)
    Given a PRD that says the stack is already chosen but has no build manifest
    When I run detect-axes on it
    Then axes should still be enumerated (not hard-OUT to 0)
    And the result should flag stack_locked true
    And a PRD containing a real build manifest should still hard-OUT to 0 axes

  @feature19
  Scenario: ARCH005_07 addressed dimension without a pointer is flagged (non-blocking)
    Given a completeness ledger where "compliance-privacy" is addressed but has an empty pointer
    When the audit-completeness command runs
    Then it should emit an ADDRESSED_WITHOUT_POINTER finding with severity INFO
    And it should still emit COMPLETENESS_COMPLETE because INFO does not block

  @feature16
  Scenario: ARCH007_03 Live context7 marks proofs honestly
    Given the skill builds a technical claim for a variant
    When the library resolves in context7
    Then the claim should be marked VERIFIED via context7 with library and version
    And a library with no context7 match should be marked UNVERIFIED Context7 no match

  @feature17
  Scenario: ARCH007_04 Selection policy drives recommendation
    Given an axis whose variants have different policy_fit tags
    When the selected policy is mvp-poc versus production-grade
    Then the recommended variant should differ between the two policies
    And the artefact should render a variant-by-policy demonstration table
    And an unset policy should default to mvp-poc

  @feature20
  Scenario: ARCH008_01 Two-lens artefact — business summary + scorecard matrix + reality-check
    Given an axis whose variants carry business_summary, scorecard and reality_check
    When the axis artefact is rendered
    Then it should render a business summary band for the variant
    And it should render a comparison matrix of criteria by variant
    And a variant with reality_check should render a "Реальность" section

  @feature21
  Scenario: ARCH008_02 Decision economics — cost-at-scale, time-costs, exit-cost, reversibility
    Given an axis whose variants carry cost_at_scale, time_costs and exit_cost
    When the axis artefact is rendered
    Then it should render a cost-at-scale ladder with at least two tiers
    And it should render team time-costs (to_market, to_feature, to_test, to_support)
    And it should render the exit cost
    And a one-way door axis should render a reversibility banner

  @feature22
  Scenario: ARCH009_01 Full-report assembles one self-contained ARCHITECTURE.html via renderers
    Given two generated axes with persisted AXIS-*.model.json plus a COMPLETENESS.md
    When I run full-report with cross-axis insights
    Then a single ARCHITECTURE.html should be written with one DOCTYPE
    And it should contain an index matrix anchoring each axis, every axis section, a synthesis section and a completeness table
    And axis sections should carry the rich content (business band, comparison matrix, reality) inherited from renderAxisSection
    And the document should be self-contained with no external link tags

  @feature23
  Scenario: ARCH010_01 Unbacked context7-VERIFIED marker is flagged; record-verify backs it
    Given an axis artefact with a "[VERIFIED via context7:supabase]" marker and no verify-log entry
    When audit-markers runs
    Then it should emit an UNBACKED_VERIFIED_MARKER finding for supabase
    And after record-verify records a real supabase verification the marker should no longer be flagged
    And when all context7 markers are backed it should emit one MARKERS_BACKED finding

  @feature24
  Scenario: ARCH011_01 architecture-gate guarantees Phase 1.75 for greenfield specs
    Given a greenfield spec (detect-axes finds stack axes) without an ARCHITECTURE/ directory
    When a PreToolUse Write of FR.md is evaluated by architecture-gate
    Then it should deny with an actionable reason naming the skill and the skip marker
    And once ARCHITECTURE/ has artefacts or a skip marker exists it should allow
    And Discovery/Context files and brownfield specs should never be gated
