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
  Scenario: Show Finalization phase for complete spec
    Given a complete spec fixture "valid-spec" exists
    When I run spec-status.ps1 on "valid-spec"
    Then the phase should be "Finalization"
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
