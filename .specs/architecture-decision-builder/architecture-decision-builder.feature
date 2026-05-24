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
    When the audit command runs
    Then it should emit a COMPLETENESS_COVERAGE finding with code DIMENSION_PENDING and severity WARNING
    And a missing COMPLETENESS.md file should be treated as all 8 dimensions pending

  @feature13
  Scenario: ARCH005_06 COMPLETENESS_COMPLETE positive signal and reason guard
    Given a completeness ledger where all 8 dimensions are addressed or out-of-scope
    When the audit command runs
    Then it should emit exactly one COMPLETENESS_COMPLETE finding with severity INFO
    And an out-of-scope dimension whose reason is shorter than 12 chars should emit WARNING_REASON_TOO_SHORT
