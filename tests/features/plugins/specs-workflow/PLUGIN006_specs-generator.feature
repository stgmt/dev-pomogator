Feature: PLUGIN006 Specs Generator PowerShell Scripts
  As a developer
  I want to use PowerShell scripts to manage specifications
  So that I can automate spec creation, validation, and status tracking

  Background:
    Given the specs-generator scripts are installed

  # scaffold-spec.ps1 scenarios

  @feature1
  Scenario: Create spec structure with valid name
    When I run scaffold-spec.ps1 with name "test-feature"
    Then the result should be successful
    And 14 files should be created in ".specs/test-feature/"
    And the next_step should mention "USER_STORIES.md"

  @feature2
  Scenario: Reject invalid kebab-case name
    When I run scaffold-spec.ps1 with name "InvalidName"
    Then the result should fail with exit code 2
    And the error should mention "kebab-case"

  @feature3
  Scenario: Overwrite existing spec with Force flag
    Given a spec folder "existing-spec" already exists
    When I run scaffold-spec.ps1 with name "existing-spec" and -Force flag
    Then the result should be successful
    And 14 files should be created

  # validate-spec.ps1 scenarios

  @feature4
  Scenario: Validate complete spec returns valid
    Given a complete spec fixture "valid-spec" exists
    When I run validate-spec.ps1 on "valid-spec"
    Then the result should have valid=true
    And errors count should be 0

  @feature5
  Scenario: Detect missing files as STRUCTURE error
    Given an incomplete spec fixture "invalid-spec" exists
    When I run validate-spec.ps1 on "invalid-spec"
    Then the result should have valid=false
    And errors should contain rule "STRUCTURE"

  @feature6
  Scenario: Detect invalid FR format
    Given a spec fixture with invalid FR.md format exists
    When I run validate-spec.ps1 on that spec
    Then errors should contain rule "FR_FORMAT"

  @feature7
  Scenario: Detect invalid UC format
    Given a spec fixture with invalid USE_CASES.md format exists
    When I run validate-spec.ps1 on that spec
    Then errors should contain rule "UC_FORMAT"

  @feature8
  Scenario: Detect missing NFR sections
    Given a spec fixture with missing NFR sections exists
    When I run validate-spec.ps1 on that spec
    Then warnings should contain rule "NFR_SECTIONS"

  # spec-status.ps1 scenarios

  @feature9
  Scenario: Show Discovery phase for new spec
    Given a partial spec fixture "partial-spec" exists
    When I run spec-status.ps1 on "partial-spec"
    Then the phase should be "Discovery" or "Requirements"
    And progress_percent should be less than 100

  @feature10
  Scenario: Show complete phase for complete spec
    Given a complete spec fixture "valid-spec" exists
    When I run spec-status.ps1 on "valid-spec"
    Then the phase should be "Finalization" or "Complete"
    And progress_percent should be close to 100

  @feature11
  Scenario: Provide next action recommendation
    Given a partial spec fixture exists
    When I run spec-status.ps1 on that spec
    Then next_action should not be empty

  # list-specs.ps1 scenarios

  @feature12
  Scenario: List all specs in repository
    Given multiple spec folders exist in .specs/
    When I run list-specs.ps1
    Then the result should contain specs array
    And summary should have total count

  @feature13
  Scenario: Filter incomplete specs only
    Given both complete and incomplete specs exist
    When I run list-specs.ps1 with -Incomplete flag
    Then only incomplete specs should be returned

  # fill-template.ps1 scenarios

  @feature14
  Scenario: List placeholders in file
    Given a template file with placeholders exists
    When I run fill-template.ps1 with -ListPlaceholders
    Then the result should contain placeholders array
    And total count should match actual placeholders

  @feature15
  Scenario: Replace placeholders with values
    Given a template file with placeholders exists
    When I run fill-template.ps1 with -Values JSON
    Then placeholders_after should be less than placeholders_before
    And filled array should contain replaced placeholders

  # validate-spec.ps1 cross-reference link validation

  @feature16
  Scenario: Validate spec with valid cross-references
    Given a spec fixture "valid-spec-with-crossrefs" with all cross-reference links
    When I run validate-spec.ps1 on the spec
    Then the result should have valid=true
    And warnings should not contain rule "CROSS_REF_LINKS"

  @feature17
  Scenario: Detect broken anchor in cross-reference link
    Given a spec fixture "broken-crossrefs" with broken links
    When I run validate-spec.ps1 on the spec
    Then warnings should contain rule "CROSS_REF_LINKS"
    And CROSS_REF_LINKS warnings should mention "anchor" and "not found"

  @feature18
  Scenario: Detect missing target file in cross-reference
    Given a spec fixture "broken-crossrefs" with link to missing file
    When I run validate-spec.ps1 on the spec
    Then warnings should contain rule "CROSS_REF_LINKS"
    And CROSS_REF_LINKS warnings should mention "file" and "not found"

  # audit-spec.ps1 link validity audit

  @feature19
  Scenario: Audit finds plain text references that should be links
    Given a spec fixture "broken-crossrefs" with plain text FR references
    When I run audit-spec.ps1 on the spec
    Then findings should contain check "LINK_VALIDITY"
    And LINK_VALIDITY findings should suggest clickable link format

  @feature20
  Scenario: Audit passes for spec with proper cross-references
    Given a spec fixture "valid-spec-with-crossrefs" with all links
    When I run audit-spec.ps1 on the spec
    Then findings should not contain check "LINK_VALIDITY"

  # audit-spec.ps1 coverage checks

  @feature21
  Scenario: Audit detects FR without matching Acceptance Criteria
    Given a spec fixture "audit-coverage-fixture" with FR-3 lacking AC
    When I run audit-spec.ps1 on the spec
    Then findings should contain check "FR_AC_COVERAGE"
    And FR_AC_COVERAGE finding should mention "FR-3"

  @feature22
  Scenario: Audit detects featureN tag mismatch between MD and BDD
    Given a spec fixture "audit-coverage-fixture" with @featureN tag gaps
    When I run audit-spec.ps1 on the spec
    Then audit should run FR_BDD_COVERAGE check without errors

  @feature23
  Scenario: Audit detects FR not referenced in REQUIREMENTS.md
    Given a spec fixture "audit-coverage-fixture" with incomplete REQUIREMENTS.md
    When I run audit-spec.ps1 on the spec
    Then findings should contain check "REQUIREMENTS_TRACEABILITY"
    And REQUIREMENTS_TRACEABILITY findings should mention "FR-2" and "FR-3"

  @feature24
  Scenario: Audit detects FR not referenced in TASKS.md
    Given a spec fixture "audit-coverage-fixture" with incomplete TASKS.md
    When I run audit-spec.ps1 on the spec
    Then findings should contain check "TASKS_FR_REFS"
    And TASKS_FR_REFS finding should mention "FR-2"

  @feature25
  Scenario: Audit detects unclosed open questions in RESEARCH.md
    Given a spec fixture "audit-coverage-fixture" with open questions
    When I run audit-spec.ps1 on the spec
    Then findings should contain check "OPEN_QUESTIONS"
    And OPEN_QUESTIONS finding should mention "unclosed"

  @feature26
  Scenario: Audit detects term inconsistency across files
    Given a spec fixture "audit-coverage-fixture" with mixed casing terms
    When I run audit-spec.ps1 on the spec
    Then findings should contain check "TERM_CONSISTENCY"
    And TERM_CONSISTENCY finding should mention casing variants

  # validate-spec.ps1 additional rule coverage

  @feature27
  Scenario: Validate detects unfilled placeholders
    Given a spec with unfilled {placeholder} templates
    When I run validate-spec.ps1 on that spec
    Then warnings should contain rule "PLACEHOLDER"

  @feature28
  Scenario: Validate detects missing EARS format in Acceptance Criteria
    Given a spec with non-EARS acceptance criteria
    When I run validate-spec.ps1 on that spec
    Then warnings should contain rule "EARS_FORMAT"

  @feature29
  Scenario: Validate detects non-standard feature naming
    Given a spec with Feature line lacking DOMAIN prefix
    When I run validate-spec.ps1 on that spec
    Then warnings should contain rule "FEATURE_NAMING"

  @feature30
  Scenario: Validate detects missing Project Context section in RESEARCH.md
    Given a spec with RESEARCH.md lacking Project Context
    When I run validate-spec.ps1 on that spec
    Then warnings should contain rule "CONTEXT_SECTION"

  # analyze-features.ps1 scenarios

  @feature31
  Scenario: Analyze features returns JSON report with discovered files
    When I run analyze-features.ps1 with -Format json
    Then the result should have totalFeatures greater than 0
    And distribution should contain production and fixture counts

  @feature32
  Scenario: Analyze features extracts step dictionary
    When I run analyze-features.ps1 with -Format json
    Then stepDictionary should contain given, when, and then arrays

  @feature33
  Scenario: Analyze features detects naming patterns
    When I run analyze-features.ps1 with -Format json
    Then namingPatterns should contain domain codes

  @feature34
  Scenario: Analyze features filters candidates by domain code
    When I run analyze-features.ps1 with -DomainCode "PLUGIN"
    Then all candidates should match PLUGIN domain

  @feature35
  Scenario: Analyze features filters candidates by feature slug
    When I run analyze-features.ps1 with -FeatureSlug "specs-generator"
    Then candidates should contain at least one match

  # .progress.json state machine scenarios

  @feature36
  Scenario: Scaffold creates .progress.json with initial state
    When I run scaffold-spec.ps1 with name "progress-test"
    Then .progress.json should exist in ".specs/progress-test/"
    And progress.version should be 1
    And progress.currentPhase should be "Discovery"
    And all stopConfirmed flags should be false
    And created_files count should still be 14

  @feature37
  Scenario: Spec-status creates .progress.json for pre-existing specs
    Given a partial spec fixture exists without .progress.json
    When I run spec-status.ps1 on the spec
    Then .progress.json should be created with version 1
    And progress_state should be included in the output

  @feature38
  Scenario: ConfirmStop marks phase as confirmed
    Given a spec with .progress.json exists
    When I run spec-status.ps1 with -ConfirmStop "Discovery"
    Then progress.phases.Discovery.stopConfirmed should be true
    And progress.phases.Discovery.stopConfirmedAt should not be null
    And progress.phases.Requirements.stopConfirmed should still be false

  @feature39
  Scenario: Spec-status tracks CHANGELOG.md in files output
    Given a valid spec fixture exists
    When I run spec-status.ps1 on the spec
    Then the files output should include CHANGELOG.md
    And CHANGELOG.md status should be defined

  @feature40
  Scenario: Spec-status updates completedAt for finished phases
    Given a valid spec fixture exists
    When I run spec-status.ps1 on the spec
    Then progress.phases.Discovery.completedAt should not be null

  # .progress.json state machine — false-positive and override fixes

  @feature41
  Scenario: Files with programming vars in curly braces detected as complete
    Given a spec fixture "placeholder-false-positive" with programming vars like {prefix} and {session_id}
    When I run spec-status.ps1 on the spec
    Then all Discovery files should have status "complete" not "partial"
    And no file should report placeholders for programming identifiers

  @feature42
  Scenario: stopConfirmed overrides auto-detection for currentPhase progression
    Given a partial spec fixture exists with incomplete files
    When I run spec-status.ps1 with -ConfirmStop "Discovery"
    And I run spec-status.ps1 with -ConfirmStop "Context"
    And I run spec-status.ps1 again
    Then currentPhase should be "Requirements"
    And progress.phases.Discovery.stopConfirmed should be true

  @feature43
  Scenario: Finalization completedAt is set when all Finalization files are complete
    Given a valid spec fixture exists with all files complete
    When I run spec-status.ps1 on the spec
    Then progress.phases.Finalization.completedAt should not be null

  @feature44
  Scenario: currentPhase becomes Complete when all phases are done
    Given a valid spec fixture exists with all files complete
    When I confirm all stop points via -ConfirmStop
    And I run spec-status.ps1 on the spec
    Then currentPhase should be "Complete"
