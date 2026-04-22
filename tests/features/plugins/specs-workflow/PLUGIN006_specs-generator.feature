Feature: PLUGIN006 Specs Generator Scripts
  As a developer
  I want to use scripts to manage specifications
  So that I can automate spec creation, validation, and status tracking

  Background:
    Given the specs-generator scripts are installed

  # scaffold-spec.ts scenarios

  @feature1
  Scenario: Create spec structure with valid name
    When I run scaffold-spec.ts with name "test-feature"
    Then the result should be successful
    And 15 files should be created in ".specs/test-feature/"
    And the next_step should mention "USER_STORIES.md"

  @feature2
  Scenario: Reject invalid kebab-case name
    When I run scaffold-spec.ts with name "InvalidName"
    Then the result should fail with exit code 2
    And the error should mention "kebab-case"

  @feature3
  Scenario: Overwrite existing spec with Force flag
    Given a spec folder "existing-spec" already exists
    When I run scaffold-spec.ts with name "existing-spec" and -Force flag
    Then the result should be successful
    And 15 files should be created

  # validate-spec.ts scenarios

  @feature4
  Scenario: Validate complete spec returns valid
    Given a complete spec fixture "valid-spec" exists
    When I run validate-spec.ts on "valid-spec"
    Then the result should have valid=true
    And errors count should be 0

  @feature5
  Scenario: Detect missing files as STRUCTURE error
    Given an incomplete spec fixture "invalid-spec" exists
    When I run validate-spec.ts on "invalid-spec"
    Then the result should have valid=false
    And errors should contain rule "STRUCTURE"

  @feature6
  Scenario: Detect invalid FR format
    Given a spec fixture with invalid FR.md format exists
    When I run validate-spec.ts on that spec
    Then errors should contain rule "FR_FORMAT"

  @feature7
  Scenario: Detect invalid UC format
    Given a spec fixture with invalid USE_CASES.md format exists
    When I run validate-spec.ts on that spec
    Then errors should contain rule "UC_FORMAT"

  @feature8
  Scenario: Detect missing NFR sections
    Given a spec fixture with missing NFR sections exists
    When I run validate-spec.ts on that spec
    Then warnings should contain rule "NFR_SECTIONS"

  # spec-status.ts scenarios

  @feature9
  Scenario: Show Discovery phase for new spec
    Given a partial spec fixture "partial-spec" exists
    When I run spec-status.ts on "partial-spec"
    Then the phase should be "Discovery" or "Requirements"
    And progress_percent should be less than 100

  @feature10
  Scenario: Show complete phase for complete spec
    Given a complete spec fixture "valid-spec" exists
    When I run spec-status.ts on "valid-spec"
    Then the phase should be "Finalization" or "Complete"
    And progress_percent should be close to 100

  @feature11
  Scenario: Provide next action recommendation
    Given a partial spec fixture exists
    When I run spec-status.ts on that spec
    Then next_action should not be empty

  # list-specs.ts scenarios

  @feature12
  Scenario: List all specs in repository
    Given multiple spec folders exist in .specs/
    When I run list-specs.ts
    Then the result should contain specs array
    And summary should have total count

  @feature13
  Scenario: Filter incomplete specs only
    Given both complete and incomplete specs exist
    When I run list-specs.ts with -Incomplete flag
    Then only incomplete specs should be returned

  # fill-template.ts scenarios

  @feature14
  Scenario: List placeholders in file
    Given a template file with placeholders exists
    When I run fill-template.ts with -ListPlaceholders
    Then the result should contain placeholders array
    And total count should match actual placeholders

  @feature15
  Scenario: Replace placeholders with values
    Given a template file with placeholders exists
    When I run fill-template.ts with -Values JSON
    Then placeholders_after should be less than placeholders_before
    And filled array should contain replaced placeholders

  # validate-spec.ts cross-reference link validation

  @feature16
  Scenario: Validate spec with valid cross-references
    Given a spec fixture "valid-spec-with-crossrefs" with all cross-reference links
    When I run validate-spec.ts on the spec
    Then the result should have valid=true
    And warnings should not contain rule "CROSS_REF_LINKS"

  @feature17
  Scenario: Detect broken anchor in cross-reference link
    Given a spec fixture "broken-crossrefs" with broken links
    When I run validate-spec.ts on the spec
    Then warnings should contain rule "CROSS_REF_LINKS"
    And CROSS_REF_LINKS warnings should mention "anchor" and "not found"

  @feature18
  Scenario: Detect missing target file in cross-reference
    Given a spec fixture "broken-crossrefs" with link to missing file
    When I run validate-spec.ts on the spec
    Then warnings should contain rule "CROSS_REF_LINKS"
    And CROSS_REF_LINKS warnings should mention "file" and "not found"

  # audit-spec.ts link validity audit

  @feature19
  Scenario: Audit finds plain text references that should be links
    Given a spec fixture "broken-crossrefs" with plain text FR references
    When I run audit-spec.ts on the spec
    Then findings should contain check "LINK_VALIDITY"
    And LINK_VALIDITY findings should have severity "ERROR"
    And LINK_VALIDITY findings should suggest clickable link format

  @feature20
  Scenario: Audit passes for spec with proper cross-references
    Given a spec fixture "valid-spec-with-crossrefs" with all links
    When I run audit-spec.ts on the spec
    Then findings should not contain check "LINK_VALIDITY"

  # audit-spec.ts coverage checks

  @feature21
  Scenario: Audit detects FR without matching Acceptance Criteria
    Given a spec fixture "audit-coverage-fixture" with FR-3 lacking AC
    When I run audit-spec.ts on the spec
    Then findings should contain check "FR_AC_COVERAGE"
    And FR_AC_COVERAGE finding should mention "FR-3"

  @feature22
  Scenario: Audit detects featureN tag mismatch between MD and BDD
    Given a spec fixture "audit-coverage-fixture" with @featureN tag gaps
    When I run audit-spec.ts on the spec
    Then audit should run FR_BDD_COVERAGE check without errors

  @feature23
  Scenario: Audit detects FR not referenced in REQUIREMENTS.md
    Given a spec fixture "audit-coverage-fixture" with incomplete REQUIREMENTS.md
    When I run audit-spec.ts on the spec
    Then findings should contain check "REQUIREMENTS_TRACEABILITY"
    And REQUIREMENTS_TRACEABILITY findings should mention "FR-2" and "FR-3"

  @feature24
  Scenario: Audit detects FR not referenced in TASKS.md
    Given a spec fixture "audit-coverage-fixture" with incomplete TASKS.md
    When I run audit-spec.ts on the spec
    Then findings should contain check "TASKS_FR_REFS"
    And TASKS_FR_REFS finding should mention "FR-2"

  @feature25
  Scenario: Audit detects unclosed open questions in RESEARCH.md
    Given a spec fixture "audit-coverage-fixture" with open questions
    When I run audit-spec.ts on the spec
    Then findings should contain check "OPEN_QUESTIONS"
    And OPEN_QUESTIONS finding should mention "unclosed"

  @feature26
  Scenario: Audit detects term inconsistency across files
    Given a spec fixture "audit-coverage-fixture" with mixed casing terms
    When I run audit-spec.ts on the spec
    Then findings should contain check "TERM_CONSISTENCY"
    And TERM_CONSISTENCY finding should mention casing variants

  # validate-spec.ts additional rule coverage

  @feature27
  Scenario: Validate detects unfilled placeholders
    Given a spec with unfilled {placeholder} templates
    When I run validate-spec.ts on that spec
    Then warnings should contain rule "PLACEHOLDER"

  @feature28
  Scenario: Validate detects missing EARS format in Acceptance Criteria
    Given a spec with non-EARS acceptance criteria
    When I run validate-spec.ts on that spec
    Then warnings should contain rule "EARS_FORMAT"

  @feature29
  Scenario: Validate detects non-standard feature naming
    Given a spec with Feature line lacking DOMAIN prefix
    When I run validate-spec.ts on that spec
    Then warnings should contain rule "FEATURE_NAMING"

  @feature30
  Scenario: Validate detects missing Project Context section in RESEARCH.md
    Given a spec with RESEARCH.md lacking Project Context
    When I run validate-spec.ts on that spec
    Then warnings should contain rule "CONTEXT_SECTION"

  # analyze-features.ts scenarios

  @feature31
  Scenario: Analyze features returns JSON report with discovered files
    When I run analyze-features.ts with -Format json
    Then the result should have totalFeatures greater than 0
    And distribution should contain production and fixture counts

  @feature32
  Scenario: Analyze features extracts step dictionary
    When I run analyze-features.ts with -Format json
    Then stepDictionary should contain given, when, and then arrays

  @feature33
  Scenario: Analyze features detects naming patterns
    When I run analyze-features.ts with -Format json
    Then namingPatterns should contain domain codes

  @feature34
  Scenario: Analyze features filters candidates by domain code
    When I run analyze-features.ts with -DomainCode "PLUGIN"
    Then all candidates should match PLUGIN domain

  @feature35
  Scenario: Analyze features filters candidates by feature slug
    When I run analyze-features.ts with -FeatureSlug "specs-generator"
    Then candidates should contain at least one match

  # .progress.json state machine scenarios

  @feature36
  Scenario: Scaffold creates .progress.json with initial state
    When I run scaffold-spec.ts with name "progress-test"
    Then .progress.json should exist in ".specs/progress-test/"
    And progress.version should be 2
    And progress.currentPhase should be "Discovery"
    And all stopConfirmed flags should be false
    And created_files count should still be 15

  @feature37
  Scenario: Spec-status creates .progress.json for pre-existing specs
    Given a partial spec fixture exists without .progress.json
    When I run spec-status.ts on the spec
    Then .progress.json should be created with version 2
    And progress_state should be included in the output

  @feature38
  Scenario: ConfirmStop marks phase as confirmed
    Given a spec with .progress.json exists
    When I run spec-status.ts with -ConfirmStop "Discovery"
    Then progress.phases.Discovery.stopConfirmed should be true
    And progress.phases.Discovery.stopConfirmedAt should not be null
    And progress.phases.Requirements.stopConfirmed should still be false

  @feature39
  Scenario: Spec-status tracks CHANGELOG.md in files output
    Given a valid spec fixture exists
    When I run spec-status.ts on the spec
    Then the files output should include CHANGELOG.md
    And CHANGELOG.md status should be defined

  @feature40
  Scenario: Spec-status updates completedAt for finished phases
    Given a valid spec fixture exists
    When I run spec-status.ts on the spec
    Then progress.phases.Discovery.completedAt should not be null

  # .progress.json state machine - false-positive and override fixes

  @feature41
  Scenario: Files with programming vars in curly braces detected as complete
    Given a spec fixture "placeholder-false-positive" with programming vars like {prefix} and {session_id}
    When I run spec-status.ts on the spec
    Then all Discovery files should have status "complete" not "partial"
    And no file should report placeholders for programming identifiers

  @feature42
  Scenario: stopConfirmed overrides auto-detection for currentPhase progression
    Given a partial spec fixture exists with incomplete files
    When I run spec-status.ts with -ConfirmStop "Discovery"
    And I run spec-status.ts with -ConfirmStop "Context"
    And I run spec-status.ts again
    Then currentPhase should be "Requirements"
    And progress.phases.Discovery.stopConfirmed should be true

  @feature43
  Scenario: Finalization completedAt is set when all Finalization files are complete
    Given a valid spec fixture exists with all files complete
    When I run spec-status.ts on the spec
    Then progress.phases.Finalization.completedAt should not be null

  @feature44
  Scenario: currentPhase becomes Complete when all phases are done
    Given a valid spec fixture exists with all files complete
    When I confirm all stop points via -ConfirmStop
    And I run spec-status.ts on the spec
    Then currentPhase should be "Complete"

  # audit-spec.ts — new checks
  @feature45
  Scenario: audit-spec detects OUT_OF_SCOPE not propagated to USE_CASES.md
    Given a spec fixture with FR-4 marked OUT OF SCOPE
    And USE_CASES.md references FR-4 without OUT OF SCOPE marker
    When I run audit-spec.ts on the spec
    Then findings should contain check "OUT_OF_SCOPE_PROPAGATION" mentioning "FR-4"

  @feature46
  Scenario: audit-spec detects UNVERIFIED_CONFIG env vars in DESIGN.md
    Given a spec fixture with env vars in DESIGN.md without verification markers
    When I run audit-spec.ts on the spec
    Then findings should contain check "UNVERIFIED_CONFIG"

  @feature47
  Scenario: audit-spec detects INFRA_TASKS_MISSING when DESIGN.md has database
    Given a spec fixture with DESIGN.md mentioning PostgreSQL
    And TASKS.md has no infrastructure phase
    When I run audit-spec.ts on the spec
    Then findings should contain check "INFRA_TASKS_MISSING"

  @feature48
  Scenario: audit-spec detects CONFIG_DUPLICATION between DESIGN.md and TASKS.md
    Given a spec fixture with identical config blocks in DESIGN.md and TASKS.md
    When I run audit-spec.ts on the spec
    Then findings should contain check "CONFIG_DUPLICATION"

  # Path validation - prevent .progress.json outside .specs/<feature>/

  @feature49
  Scenario: spec-status rejects -Path outside .specs/
    When I run spec-status.ts with -Path "."
    Then exit code should be non-zero
    And output should contain "must be inside .specs/"

  # Open questions gate - prevent finalization with unclosed research questions

  @feature50
  Scenario: validate-spec warns on unclosed open questions in RESEARCH.md
    Given a spec with RESEARCH.md containing unclosed open questions
    When I run validate-spec.ts on that spec
    Then warnings should contain rule "OPEN_QUESTIONS"
    And warning message should mention "unclosed"

  @feature51
  Scenario: spec-status marks RESEARCH.md as partial when open questions exist
    Given a spec with RESEARCH.md containing unclosed open questions
    When I run spec-status.ts on that spec
    Then RESEARCH.md status should be "partial"
    And blockers should mention "unclosed open question"

  @feature52
  Scenario: DEFERRED marker allows open questions without warning
    Given a spec with RESEARCH.md where all open questions have DEFERRED markers
    When I run validate-spec.ts on that spec
    Then warnings should not contain rule "OPEN_QUESTIONS"

  @feature53
  Scenario: audit-spec reports OPEN_QUESTIONS as WARNING severity
    Given a spec fixture with open questions in RESEARCH.md
    When I run audit-spec.ts on the spec
    Then OPEN_QUESTIONS finding severity should be "WARNING"

  # FIXTURES.md optional file support

  @feature54
  Scenario: Scaffold creates FIXTURES.md as optional file
    When I run scaffold-spec.ts with name "fixtures-test"
    Then the result should be successful
    And created files should include "FIXTURES.md"

  # audit-spec.ts review checks (FILE_CHANGES_COMPLETENESS, FILE_CHANGES_VERIFY, COUNT_CONSISTENCY)

  @feature56
  Scenario: Audit detects TASKS.md file references missing from FILE_CHANGES.md
    Given a spec fixture "audit-review-fixture" with file refs not in FILE_CHANGES.md
    When I run audit-spec.ts on the spec
    Then findings should contain check "FILE_CHANGES_COMPLETENESS"
    And FILE_CHANGES_COMPLETENESS findings should list the missing files

  @feature57
  Scenario: Audit detects phantom edit paths in FILE_CHANGES.md
    Given a spec fixture "audit-review-fixture" with action=edit for non-existent file
    When I run audit-spec.ts on the spec
    Then findings should contain check "FILE_CHANGES_VERIFY"
    And FILE_CHANGES_VERIFY finding should have severity "ERROR"

  @feature58
  Scenario: Audit detects FR count mismatch between prose and headings
    Given a spec fixture "audit-review-fixture" with "10 FR" claim but only 3 FR headings
    When I run audit-spec.ts on the spec
    Then findings should contain check "COUNT_CONSISTENCY"
    And COUNT_CONSISTENCY finding should mention actual count

  @feature59
  Scenario: Audit detects orphan @featureN in .feature not referenced in TASKS.md
    Given a spec fixture "audit-review-fixture" with @feature99 only in .feature
    When I run audit-spec.ts on the spec
    Then findings should contain check "FEATURE_TAG_PROPAGATION"
    And FEATURE_TAG_PROPAGATION finding should mention "@feature99"

  @feature60
  Scenario: Audit detects scenario count mismatch between README and .feature
    Given a spec fixture "audit-review-fixture" with "5 scenarios" claim but 2 actual
    When I run audit-spec.ts on the spec
    Then findings should contain check "SCENARIO_COUNT_SYNC"
    And SCENARIO_COUNT_SYNC finding should mention actual count

  @feature64
  Scenario: Audit detects placeholder FIXTURES.md when TEST_DATA_ACTIVE
    Given a spec fixture "audit-review-fixture" with TEST_DATA_ACTIVE and placeholder FIXTURES.md
    When I run audit-spec.ts on the spec
    Then findings should contain check "FIXTURES_CONSISTENCY"
    And FIXTURES_CONSISTENCY finding should mention "placeholder"

  @feature65
  Scenario: Audit detects @featureN tag in FR but missing from matching AC
    Given a spec fixture "audit-review-fixture" with FR-1 @feature2 but AC-1 lacks @feature2
    When I run audit-spec.ts on the spec
    Then findings should contain check "AC_TAG_SYNC"
    And AC_TAG_SYNC finding should mention "@feature2"

  @feature66
  Scenario: Audit detects @featureN missing from USER_STORIES.md
    Given a spec fixture "audit-review-fixture" with @feature99 not in USER_STORIES.md
    When I run audit-spec.ts on the spec
    Then findings should contain check "FEATURE_TAG_PROPAGATION" for USER_STORIES

  @feature67
  Scenario: Audit detects phantom create source path in FILE_CHANGES.md
    Given a spec fixture "audit-review-fixture" with "Move from extensions/nonexistent-ext/" source
    When I run audit-spec.ts on the spec
    Then findings should contain check "PHANTOM_CREATE_SOURCE"

  @feature55
  Scenario: Validate-spec passes with FIXTURES.md present
    Given a complete spec fixture "valid-spec" exists
    When I run validate-spec.ts on "valid-spec"
    Then the result should have valid=true

  # audit-spec.ts false-positive fixes

  @feature61
  Scenario: PLUGIN006_61 Audit does not flag "v1 limitation" text as OUT_OF_SCOPE
    Given a spec with FR body containing "не реализуются в v1" (not blockquote OUT OF SCOPE)
    When I run audit-spec.ts on the spec
    Then findings should NOT contain check "OUT_OF_SCOPE_PROPAGATION" for that FR

  @feature62
  Scenario: PLUGIN006_62 Audit does not flag keyword in table row as INFRA_TASKS
    Given a spec DESIGN.md with "database" inside a markdown table row
    When I run audit-spec.ts on the spec
    Then findings should NOT contain check "INFRA_TASKS_MISSING"

  @feature63
  Scenario: PLUGIN006_63 Audit suppresses FR_SPLIT_CONSISTENCY for language adapters
    Given a spec with FR-3, FR-3a, FR-3b (language adapter split) and unsplit FR-2, FR-4
    When I run audit-spec.ts on the spec
    Then findings should NOT contain check "FR_SPLIT_CONSISTENCY"
