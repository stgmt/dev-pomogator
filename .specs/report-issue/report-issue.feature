@report_issue
Feature: Report an issue to GitHub
  The canonical report-issue skill prepares a reviewable report and never creates it without consent.

  @FR-1
  Scenario: RPT001_01_prepare_a_sanitized_report
    Given an issue description containing a credential-shaped value
    When the user invokes report-issue
    Then the user sees a sanitized title and Markdown body
    And the user sees the resolved repository and a GitHub new-issue URL
    And no GitHub issue has been created

  @FR-2
  Scenario: RPT001_02_no_creation_without_explicit_consent
    Given a prepared issue report is displayed
    When the user does not explicitly approve the report
    Then no GitHub issue creation command is executed

  @FR-3
  Scenario: RPT001_03_duplicate_search_requires_a_second_confirmation
    Given GitHub CLI is authenticated for the resolved repository
    And the user explicitly approves the prepared report
    And a materially similar open issue exists
    When the user invokes report-issue
    Then the matching issue URL is displayed
    And creating a new issue requires explicit confirmation

  @FR-4
  Scenario: RPT001_04_unauthenticated_cli_keeps_a_manual_fallback
    Given GitHub CLI is installed but unauthenticated
    When the user invokes report-issue
    Then the user is told to run gh auth login
    And the sanitized report and filled GitHub new-issue URL remain available
    And the result does not claim an issue was created

  @FR-4
  Scenario: RPT001_06_unauthenticated_fallback_opens_only_the_sanitized_url
    Given GitHub CLI is installed but unauthenticated
    And the user requests the fallback URL to open
    When the user invokes report-issue
    Then the injected browser opener receives the sanitized GitHub new-issue URL exactly once
    And the result records that the browser opened the fallback URL

  @FR-5
  Scenario: RPT001_05_metadata_failure_uses_the_canonical_repository
    Given repository metadata and a GitHub remote are unavailable
    When the user invokes report-issue
    Then stgmt/dev-pomogator is displayed as the repository target
    And that target is used in the displayed GitHub new-issue URL
