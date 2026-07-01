Feature: specs-workflow-jira-mode — Optional Jira-first Spec Workflow

  # FR-1: JIRA_SOURCE_PRESERVED check triggers for untraced FR sections

  @feature100
  Scenario: SPECJIRA001_01 JIRA_SOURCE.md presence triggers JIRA_SOURCE_PRESERVED warning for untraced FR sections
    Given a Jira-mode spec with JIRA_SOURCE.md and untraced FR sections
    When the Jira-mode validate-spec CLI runs
    Then the Jira-mode validate-spec output warns JIRA_SOURCE_PRESERVED for FR.md mentioning "Jira imperative"

  # FR-2: Jira imperative trace suppresses JIRA_SOURCE_PRESERVED for FR.md

  @feature101
  Scenario: SPECJIRA001_02 FR with Jira imperative trace passes JIRA_SOURCE_PRESERVED
    Given a Jira-mode spec with all Jira traces present in FR.md, AC.md, feature, and TASKS
    When the Jira-mode validate-spec CLI runs
    Then the Jira-mode validate-spec output has no JIRA_SOURCE_PRESERVED warning for FR.md

  # FR-3: No JIRA_SOURCE.md → rule is no-op

  @feature102
  Scenario: SPECJIRA001_03 No JIRA_SOURCE.md makes rule a no-op
    Given a Jira-mode spec without JIRA_SOURCE.md
    When the Jira-mode validate-spec CLI runs
    Then the Jira-mode validate-spec output has zero JIRA_SOURCE_PRESERVED warnings

  # FR-4: AC lacking Jira acceptance emits warning

  @feature103
  Scenario: SPECJIRA001_04 AC without Jira acceptance or Evidence emits warning
    Given a Jira-mode spec with JIRA_SOURCE.md and AC lacking Jira acceptance or Evidence
    When the Jira-mode validate-spec CLI runs
    Then the Jira-mode validate-spec output warns JIRA_SOURCE_PRESERVED for ACCEPTANCE_CRITERIA.md

  # FR-5: Scenario without Jira trace comment emits warning

  @feature104
  Scenario: SPECJIRA001_05 BDD scenario without Jira trace comment emits warning
    Given a Jira-mode spec with JIRA_SOURCE.md and a scenario lacking Jira trace comment
    When the Jira-mode validate-spec CLI runs
    Then the Jira-mode validate-spec output warns JIRA_SOURCE_PRESERVED for the feature file mentioning "Jira trace"

  # FR-6: checkJiraDrift — INFO when MCP unavailable and cache present

  @feature105
  Scenario: SPECJIRA001_06 checkJiraDrift emits INFO when MCP unavailable and .jira-cache.json exists
    Given a Jira-mode spec dir with a valid .jira-cache.json cache file
    When the Jira-mode checkJiraDrift runs with MCP unavailable and no live state
    Then the Jira-mode drift check returns exactly one INFO finding with message containing "skipped"

  # FR-6: checkJiraDrift — no-op when cache absent

  @feature105
  Scenario: SPECJIRA001_06b checkJiraDrift is no-op when .jira-cache.json is absent
    Given a Jira-mode spec dir without a .jira-cache.json file
    When the Jira-mode checkJiraDrift runs with MCP unavailable and no live state
    Then the Jira-mode drift check returns zero findings

  # FR-6: checkJiraDrift — WARNING on live state drift

  @feature105
  Scenario: SPECJIRA001_06c checkJiraDrift emits WARNING when issue_updated_at differs from live
    Given a Jira-mode spec dir with a .jira-cache.json showing old timestamp and lower comment count
    And the live Jira state shows issue updated at "2026-02-15T12:00:00Z" with 5 comments
    When the Jira-mode checkJiraDrift runs against the live Jira state
    Then the Jira-mode drift check returns a WARNING about "Issue modified since intake"
    And the Jira-mode drift check returns a WARNING about "new comment"

  # FR-7: Jira template files exist on disk

  @feature106
  Scenario: SPECJIRA001_07 Jira templates exist on disk
    Then the Jira-mode template file "JIRA_SOURCE.md.template" exists in tools/specs-generator/templates
    And the Jira-mode template file "ATTACHMENTS.md.template" exists in tools/specs-generator/templates
    And the Jira-mode template file "JIRA_CACHE.schema.json" exists in tools/specs-generator/templates

  # Regression: non-Jira specs get zero JIRA_DRIFT findings from runAllChecks

  @feature102
  Scenario: SPECJIRA001_REG runAllChecks on non-Jira spec emits zero JIRA_DRIFT findings
    Given a Jira-mode non-Jira spec dir with an FR and TASKS but no JIRA_SOURCE.md
    When the Jira-mode runAllChecks runs on the spec dir
    Then the Jira-mode runAllChecks returns zero JIRA_DRIFT findings
