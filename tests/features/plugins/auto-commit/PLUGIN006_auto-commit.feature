@auto-commit
Feature: Auto-Commit Plugin
  Automatic git commits with LLM-generated messages

  Background:
    Given dev-pomogator is installed
    And auto-commit extension is enabled

  # ============================================================================
  # Configuration
  # ============================================================================

  @implemented: auto-commit.test.ts > Config
  Scenario: Load default configuration
    When auto-commit hook is triggered
    Then it should use default interval of 15 minutes
    And it should use generic Jira pattern "[A-Z]+-\\d+"

  @implemented: auto-commit.test.ts > Config
  Scenario: Merge user and project configs
    Given ~/.cursor/auto-commit.json has intervalMinutes: 30
    And .cursor/auto-commit.json has jiraKeyPattern: "PROJ-\\d+"
    When auto-commit hook is triggered
    Then intervalMinutes should be 30 (from user config)
    And jiraKeyPattern should be "PROJ-\\d+" (from project config)

  @implemented: auto-commit.test.ts > Config
  Scenario: Respect AUTO_COMMIT_DISABLED env
    Given AUTO_COMMIT_DISABLED=1
    When auto-commit hook is triggered
    Then it should skip commit with message "Auto-commit disabled"

  # ============================================================================
  # State Management
  # ============================================================================

  @implemented: auto-commit.test.ts > State
  Scenario: First commit creates state file
    Given no ~/.cursor/auto-commit-state.json exists
    When auto-commit hook is triggered successfully
    Then ~/.cursor/auto-commit-state.json should be created
    And it should contain lastCommitTimestampMs

  @implemented: auto-commit.test.ts > State
  Scenario: Skip commit within interval
    Given last commit was 5 minutes ago
    And interval is 15 minutes
    When auto-commit hook is triggered
    Then it should skip with message "Interval not passed: 5min < 15min"

  @implemented: auto-commit.test.ts > State
  Scenario: Allow commit after interval passed
    Given last commit was 20 minutes ago
    And interval is 15 minutes
    When auto-commit hook is triggered
    Then it should proceed with commit

  # ============================================================================
  # Git Operations
  # ============================================================================

  @implemented: auto-commit.test.ts > Git Operations
  Scenario: Detect uncommitted changes
    Given git repo has uncommitted changes
    When auto-commit hook is triggered
    Then it should detect changes and proceed

  @implemented: auto-commit.test.ts > Git Operations
  Scenario: Skip when no changes
    Given git repo has no uncommitted changes
    When auto-commit hook is triggered
    Then it should skip with message "No uncommitted changes"

  @implemented: auto-commit.test.ts > Git Operations
  Scenario: Commit with multiline message via stdin
    Given uncommitted changes exist
    And LLM generates multiline commit message
    When commit is created
    Then message should preserve newlines correctly
    And commit should use "git commit -F -" with stdin

  # ============================================================================
  # Jira Integration
  # ============================================================================

  @implemented: auto-commit.test.ts > Jira Integration
  Scenario: Extract Jira key from branch name
    Given current branch is "feature/PROJ-123-add-login"
    And jiraKeyPattern is "[A-Z]+-\\d+"
    When auto-commit hook is triggered
    Then Jira key should be "PROJ-123"
    And commit message should include Jira link

  @implemented: auto-commit.test.ts > Jira Integration
  Scenario: Handle branch without Jira key
    Given current branch is "main"
    When auto-commit hook is triggered
    Then commit message should not include Jira section

  # ============================================================================
  # Transcript Parsing
  # ============================================================================

  @implemented: auto-commit.test.ts > Transcript Parsing
  Scenario: Parse transcript file for context
    Given transcript file exists at transcript_path
    When auto-commit hook is triggered
    Then it should use FAST PATH to read transcript
    And messages should be extracted for LLM context

  @implemented: auto-commit.test.ts > Transcript Parsing
  Scenario: Filter out [Thinking] blocks
    Given transcript contains [Thinking] blocks
    When transcript is parsed
    Then [Thinking] content should be filtered out

  @implemented: auto-commit.test.ts > Transcript Parsing
  Scenario: Filter out [Tool call] and [Tool result] blocks
    Given transcript contains tool call blocks
    When transcript is parsed
    Then tool call content should be filtered out

  @implemented: auto-commit.test.ts > Transcript Parsing
  Scenario: Limit messages to maxMessages
    Given transcript has 50 messages
    And maxMessages is 12
    When transcript is parsed
    Then only last 12 messages should be returned

  # ============================================================================
  # LLM Integration
  # ============================================================================

  @implemented: auto-commit.test.ts > LLM Integration
  Scenario: Generate commit message via LLM
    Given session context and git diff are available
    And LLM API key is configured
    When generateCommitMessage is called
    Then commit message should follow gitmoji format
    And it should include file descriptions

  @implemented: auto-commit.test.ts > LLM Integration
  Scenario: Skip if API key not configured
    Given LLM API key is not set
    When auto-commit hook is triggered
    Then it should skip with message "LLM API key not configured"

  @implemented: auto-commit.test.ts > LLM Integration
  Scenario: Filter build artifacts from file list
    Given changed files include bin/debug/app.dll
    And changed files include src/main.ts
    When file list is prepared for LLM
    Then bin/debug/app.dll should be excluded
    And src/main.ts should be included

  # ============================================================================
  # Stop Hook
  # ============================================================================

  @implemented: auto-commit.test.ts > Stop Hook
  Scenario: Read input from stdin
    When stop hook is triggered
    Then it should parse JSON from stdin
    And extract workspace_roots and transcript_path

  @implemented: auto-commit.test.ts > Stop Hook
  Scenario: Write JSON output to stdout
    When stop hook completes
    Then it should output valid JSON to stdout
    And exit with code 0 (success) or 1 (error)

  @implemented: auto-commit.test.ts > Stop Hook
  Scenario: Redact secrets in context
    Given session context contains API keys
    When context is prepared for LLM
    Then API keys should be replaced with [REDACTED]

  # ============================================================================
  # Extension Configuration
  # ============================================================================

  @implemented: auto-commit.test.ts > Extension Configuration
  Scenario: Extension uses stop hook (not beforeSubmitPrompt)
    When extension.json is loaded
    Then cursor hook should be "stop" (not "beforeSubmitPrompt")
    And claude hook should be "Stop" (not "UserPromptSubmit")

  @implemented: auto-commit.test.ts > Extension Configuration
  Scenario: Extension uses npx tsx for TypeScript
    When extension.json is loaded
    Then hook command should start with "npx tsx"
    And target should be auto_commit_stop.ts
