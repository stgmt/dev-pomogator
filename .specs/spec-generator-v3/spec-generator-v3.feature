Feature: SPECGEN003 Spec Generator v3 — form-guards, child skills, audit log
  As a dev-pomogator maintainer
  I want blocking PreToolUse hooks + private child skills + audit log
  So that spec generation is hallucination-proof with no bypass path

  Background:
    Given dev-pomogator is installed
    And specs-workflow extension is enabled

  # @feature4
  Scenario: SPECGEN003_01 user-story-form-guard denies USER_STORIES.md without Priority
    Given a v3 spec at ".specs/foo/" with progress.json version 3
    And new USER_STORIES.md content without "(Priority: P1)" on any User Story heading
    When Claude attempts Write to ".specs/foo/USER_STORIES.md"
    Then the hook exits with code 2
    And stderr contains "Priority"
    And stderr does NOT contain "SPEC_FORM_GUARDS_DISABLE"
    And audit log has DENY entry for user-story-form-guard

  # @feature4
  Scenario: SPECGEN003_02 user-story-form-guard denies when Priority present but Why missing
    Given a v3 spec
    And USER_STORIES.md with "### User Story 1: Foo (Priority: P1)" but no "**Why:**" line
    When Claude attempts Write
    Then the hook exits with code 2
    And stderr contains "Why"

  # @feature4
  Scenario: SPECGEN003_03 user-story-form-guard allows all 4 fields present
    Given a v3 spec
    And USER_STORIES.md with "### User Story 1: Foo (Priority: P1)" + Why + Independent Test + Acceptance Scenarios
    When Claude attempts Write
    Then the hook exits with code 0
    And audit log has ALLOW_VALID entry

  # @feature5
  Scenario: SPECGEN003_04 migration safety — v1/v2 spec passes unchecked
    Given a spec at ".specs/legacy-foo/" without progress.json OR with progress.json without "version" field
    And USER_STORIES.md with old bullet format "- Как роль..."
    When Claude attempts Write
    Then the hook exits with code 0
    And audit log has ALLOW_AFTER_MIGRATION entry
    And content format is NOT validated

  # @feature4
  Scenario: SPECGEN003_05 task-form-guard denies TASKS.md without Done When
    Given a v3 spec
    And TASKS.md with task "- [ ] Implement queue" without "**Done When:**" block
    When Claude attempts Write
    Then the hook exits with code 2
    And stderr contains "Done When"

  # @feature4
  Scenario: SPECGEN003_06 task-form-guard denies Done When with zero checkboxes
    Given a v3 spec
    And TASKS.md with "**Done When:**" but no "- [ ]" child bullets
    When Claude attempts Write
    Then the hook exits with code 2
    And stderr contains "checkbox"

  # @feature4
  Scenario: SPECGEN003_07 task-form-guard allows full task format
    Given a v3 spec
    And TASKS.md with task "- [ ] Foo — Status: TODO | Est: 30m" + Done When with ≥1 checkbox
    When Claude attempts Write
    Then the hook exits with code 0

  # @feature4
  Scenario: SPECGEN003_08 design-decision-guard denies Decision without Alternatives
    Given a v3 spec
    And DESIGN.md with "### Decision: Foo" + Rationale + Trade-off but no Alternatives
    When Claude attempts Write
    Then the hook exits with code 2
    And stderr contains "Alternatives"

  # @feature4
  Scenario: SPECGEN003_09 design-decision-guard allows DESIGN.md without decisions
    Given a v3 spec
    And DESIGN.md with no "### Decision:" headings
    When Claude attempts Write
    Then the hook exits with code 0

  # @feature4
  Scenario: SPECGEN003_10 requirements-chk-guard denies CHK without Verification Method
    Given a v3 spec
    And REQUIREMENTS.md with CHK row "| CHK-FR1-01 | ... | FR-1 |  | Draft | ... |" (empty Verification Method)
    When Claude attempts Write
    Then the hook exits with code 2
    And stderr contains "Verification Method"

  # @feature4
  Scenario: SPECGEN003_11 requirements-chk-guard denies malformed CHK ID
    Given a v3 spec
    And REQUIREMENTS.md with CHK row "| CHK-001 | ... |" (missing FR linkage)
    When Claude attempts Write
    Then the hook exits with code 2
    And stderr contains "CHK-FR"

  # @feature4
  Scenario: SPECGEN003_12 requirements-chk-guard allows valid CHK row
    Given a v3 spec
    And REQUIREMENTS.md with "| CHK-FR1-01 | FR-1 covered | FR-1, AC-1, @feature1 | BDD scenario | Draft | — |"
    When Claude attempts Write
    Then the hook exits with code 0

  # @feature4
  Scenario: SPECGEN003_13 risk-assessment-guard denies heading with only 1 row
    Given a v3 spec
    And RESEARCH.md with "## Risk Assessment" heading + single populated row
    When Claude attempts Write
    Then the hook exits with code 2
    And stderr contains "Risk Assessment"
    And stderr contains "2"

  # @feature4
  Scenario: SPECGEN003_14 risk-assessment-guard allows file without heading
    Given a v3 spec
    And RESEARCH.md without "## Risk Assessment" heading
    When Claude attempts Write
    Then the hook exits with code 0

  # @feature5
  Scenario: SPECGEN003_15 fail-open on malformed stdin
    Given any hook receives non-JSON stdin
    When hook executes
    Then hook exits with code 0
    And audit log has PARSER_CRASH entry with error message

  # @feature1
  Scenario: SPECGEN003_16 discovery-forms skill populates USER_STORIES.md in v3 format
    Given empty ".specs/new-foo/USER_STORIES.md" in a v3 spec
    When create-spec invokes Skill("discovery-forms")
    Then USER_STORIES.md contains ≥1 block with Priority + Why + Independent Test + Acceptance Scenarios
    And RESEARCH.md contains "## Risk Assessment" table with ≥2 rows

  # @feature3
  Scenario: SPECGEN003_17 task-board-forms skill enriches TASKS.md
    Given TASKS.md with basic task blocks in v3 spec
    When create-spec invokes Skill("task-board-forms")
    Then TASKS.md starts with "## Task Summary" table
    And each task has Status + Est + Done When block with ≥1 checkbox

  # @feature5
  Scenario: SPECGEN003_18 existing v2 spec Write passes unblocked
    Given spec ".specs/pushy-skill-descriptions/" with no progress.json
    When Claude writes to that USER_STORIES.md with old format
    Then all 6 guards exit 0
    And audit log has ALLOW_AFTER_MIGRATION entries

  # @feature3
  Scenario: SPECGEN003_19 spec-status.ts -Format task-table renders markdown
    Given TASKS.md with 5 task blocks
    When I run "spec-status.ts -Format task-table -Path .specs/foo"
    Then stdout contains markdown table "| ID | Title | Status | Depends | Phase | Est. |"
    And table has ≥5 data rows

  # @feature3
  Scenario: SPECGEN003_20 task-table format idempotent
    Given TASKS.md unchanged
    When I run "spec-status.ts -Format task-table" twice
    Then both invocations produce byte-identical stdout

  # @feature1
  Scenario: SPECGEN003_21 Jira-mode preservation
    Given spec with JIRA_SOURCE.md and existing "Jira imperative:" lines in FR.md
    When Skill("requirements-chk-matrix") populates CHK matrix
    Then all "Jira imperative:" lines preserved byte-for-byte
    And new CHK rows contain trace to existing FR Jira quotes

  # @feature4
  Scenario: SPECGEN003_22 guards ignore Read tool
    Given any guard hook
    When tool_name is "Read" not Write/Edit
    Then hook exits with code 0
    And no audit log entry

  # @feature5
  Scenario: SPECGEN003_23 fail-open on regex exception
    Given user-story-form-guard parser throws RegExp exception
    When hook wraps main() with .catch
    Then hook exits with code 0
    And audit log has PARSER_CRASH entry

  # @feature1
  Scenario: SPECGEN003_24 child skills do NOT auto-trigger on natural-language prompts
    Given user prompt "optimize my tasks"
    When Claude processes prompt
    Then task-board-forms is NOT surfaced as auto-triggered skill
    And discovery-forms is NOT surfaced
    And requirements-chk-matrix is NOT surfaced

  # @feature7
  Scenario: SPECGEN003_25 meta-guard denies removing form-guard from extension.json
    Given extension.json with 6 form-guards in hooks.PreToolUse
    When Claude attempts Edit removing "user-story-form-guard.ts" entry
    Then meta-guard exits with code 2
    And stderr contains "cannot remove form-guards"
    And stderr contains "human review"

  # @feature7
  Scenario: SPECGEN003_26 meta-guard allows adding new unrelated hook
    Given extension.json with existing form-guards
    When Claude attempts Edit adding new "my-new-hook.ts" entry preserving all form-guards
    Then meta-guard exits with code 0

  # @feature8
  Scenario: SPECGEN003_27 audit-logger appends event with ISO timestamp
    Given audit-logger invoked with hookName, event, filepath
    When logEvent() runs
    Then ~/.dev-pomogator/logs/form-guards.log appends "{ISO-8601}Z {event} {hookName} {filepath}"
    And no existing entries are overwritten (append-only)

  # @feature8
  Scenario: SPECGEN003_28 UserPromptSubmit summary shows counts
    Given form-guards.log has 3 DENY + 1 PARSER_CRASH + 2 ALLOW_AFTER_MIGRATION events within last 24h
    When validate-specs.ts UserPromptSubmit hook runs
    Then stdout contains "📊 Form guards (24h):"
    And stdout contains "3 DENY"
    And stdout contains "1 PARSER_CRASH"
    And stdout contains "2 ALLOW_AFTER_MIGRATION"
