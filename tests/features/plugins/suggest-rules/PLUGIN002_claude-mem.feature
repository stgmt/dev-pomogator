Feature: PLUGIN002 Claude-mem Persistent Memory
  As a developer using Cursor with suggest-rules
  I want persistent memory across sessions
  So that AI remembers my project context

  # Test files:
  # - cursor-installer.test.ts: Installation & Hook Configuration (PLUGIN002: Claude-mem Hooks)
  # - claude-mem-runtime.test.ts: Runtime API & Hook Execution (PLUGIN002-RUNTIME)
  # - claude-mem-persistence.test.ts: Data Persistence Validation (PLUGIN002-PERSISTENCE)

  Background:
    Given dev-pomogator is installed for Cursor
    And suggest-rules extension requires claude-mem

  # @implemented: cursor-installer.test.ts > Scenario 1: Clean Install
  Scenario: Claude-mem is installed from marketplace location
    When dev-pomogator installs for Cursor
    Then claude-mem should be cloned to ~/.claude/plugins/marketplaces/thedotmack/
    And worker-service.cjs should exist in plugin/scripts/

  # @implemented: cursor-installer.test.ts > Scenario 2: Re-install
  Scenario: Claude-mem is not re-cloned on reinstall
    Given claude-mem is already installed in marketplace location
    When dev-pomogator installs again
    Then claude-mem should NOT be cloned again
    And logs should contain "Using existing installation"

  # @implemented: cursor-installer.test.ts > PLUGIN002: Claude-mem Hooks
  Scenario: Session-init hook is configured
    When claude-mem is installed
    Then hooks.json beforeSubmitPrompt should contain "session-init" action

  # @implemented: cursor-installer.test.ts > PLUGIN002: Claude-mem Hooks
  Scenario: Context hook is configured
    When claude-mem is installed
    Then hooks.json beforeSubmitPrompt should contain "context" action

  # @implemented: cursor-installer.test.ts > PLUGIN002: Claude-mem Hooks
  Scenario: Observation hooks are configured
    When claude-mem is installed
    Then hooks.json afterMCPExecution should contain "observation" action
    And hooks.json afterShellExecution should contain "observation" action

  # @implemented: cursor-installer.test.ts > PLUGIN002: Claude-mem Hooks
  Scenario: File-edit hook is configured
    When claude-mem is installed
    Then hooks.json afterFileEdit should contain "file-edit" action

  # @implemented: cursor-installer.test.ts > PLUGIN002: Claude-mem Hooks
  Scenario: Summarize hook is configured
    When claude-mem is installed
    Then hooks.json stop should contain "summarize" action

  # @implemented: cursor-installer.test.ts > PLUGIN002: Claude-mem Hooks
  Scenario: All hooks use bun to execute worker-service.cjs
    When claude-mem is installed
    Then all claude-mem hook commands should start with "bun"
    And all commands should reference worker-service.cjs path

  # ============================================================================
  # Runtime Scenarios - Health & Readiness
  # @implemented: claude-mem-runtime.test.ts > Health & Readiness
  # ============================================================================

  # @implemented: claude-mem-runtime.test.ts
  Scenario: Worker responds to readiness check
    Given claude-mem worker is running on port 37777
    When I call GET /api/readiness
    Then response status should be 200

  # @implemented: claude-mem-runtime.test.ts
  Scenario: Health endpoint returns status and uptime
    Given claude-mem worker is running
    When I call GET /health
    Then response should contain status
    And response should contain uptime
    And response should contain port 37777

  # ============================================================================
  # Session Lifecycle via API
  # @implemented: claude-mem-persistence.test.ts > Session Lifecycle via API
  # ============================================================================

  # @implemented: claude-mem-persistence.test.ts
  Scenario: Initialize new session via API
    Given claude-mem worker is running
    When I POST /sessions/:id/init with project "e2e-test-project"
    Then response should return session_db_id > 0

  # @implemented: claude-mem-persistence.test.ts
  Scenario: Get session status via API
    Given an active session exists
    When I GET /sessions/:id/status
    Then response should contain project name
    And response should show is_active = true

  # @implemented: claude-mem-persistence.test.ts
  Scenario: Add observation to session via API
    Given an active session exists
    When I POST /sessions/:id/observations with toolName "Shell"
    Then response should return observation_id > 0

  # @implemented: claude-mem-persistence.test.ts
  Scenario: Summarize session via API
    Given an active session with observations
    When I POST /sessions/:id/summarize
    Then response should return summary_id > 0

  # @implemented: claude-mem-persistence.test.ts
  # Note: Prompts are saved immediately during init. Projects require observations processing.
  Scenario: Project appears in prompts list after session init
    Given session was created with project "e2e-test-project"
    When I GET /api/prompts?project=e2e-test-project
    Then response should contain prompt with project "e2e-test-project"

  # @implemented: claude-mem-persistence.test.ts
  Scenario: Observations are retrievable by project
    Given observations were added to project "e2e-test-project"
    When I GET /api/observations?project=e2e-test-project
    Then response should contain at least 1 observation
    And observations should have tool_name field

  # ============================================================================
  # Hook Execution with Parameters
  # @implemented: claude-mem-runtime.test.ts > Hook Execution with Parameters
  # ============================================================================

  # @implemented: claude-mem-runtime.test.ts
  Scenario: Session-init hook with prompt parameter
    Given claude-mem worker is running
    When I execute session-init hook with prompt "Test prompt"
    Then hook should complete without error

  # @implemented: claude-mem-runtime.test.ts
  Scenario: Context hook executes and returns context
    Given claude-mem worker is running
    When I execute context hook with project "e2e-test"
    Then hook should return string output

  # @implemented: claude-mem-runtime.test.ts + claude-mem-persistence.test.ts
  Scenario: Observation hook with toolName parameter
    Given claude-mem worker is running
    When I execute observation hook with toolName "Shell" and toolResult "success"
    Then hook should complete without error

  # @implemented: claude-mem-runtime.test.ts + claude-mem-persistence.test.ts
  Scenario: File-edit hook with filePath parameter
    Given claude-mem worker is running
    When I execute file-edit hook with filePath "/tmp/test.ts"
    Then hook should complete without error

  # @implemented: claude-mem-runtime.test.ts + claude-mem-persistence.test.ts
  Scenario: Summarize hook executes session summary
    Given claude-mem worker is running
    When I execute summarize hook with project "e2e-test"
    Then hook should complete without error

  # ============================================================================
  # Data Persistence Validation
  # @implemented: claude-mem-persistence.test.ts
  # ============================================================================

  # @implemented: claude-mem-persistence.test.ts > Stats Tracking
  Scenario: Stats show non-zero counts after operations
    Given multiple sessions and observations were created
    When I GET /api/stats
    Then observations count should be > 0
    And sessions count should be > 0

  # @implemented: claude-mem-persistence.test.ts > Project Tracking
  Scenario: Projects list includes test projects
    Given test projects were created
    When I GET /api/projects
    Then response should contain at least 1 project
    And at least one project should match pattern "e2e"

  # @implemented: claude-mem-persistence.test.ts > Observations API
  Scenario: Observations persist with required fields
    Given observations were added
    When I GET /api/observations
    Then each observation should have id
    And each observation should have tool_name
    And each observation should have created_at

  # ============================================================================
  # Full Workflow: Hook to API Verification
  # @implemented: claude-mem-persistence.test.ts > Full Workflow
  # ============================================================================

  # @implemented: claude-mem-persistence.test.ts > Full Workflow
  Scenario: End-to-end workflow with hooks and API verification
    Given claude-mem worker is running
    When I execute session-init hook with prompt "Workflow test"
    And I execute observation hook with toolName "WorkflowTool"
    And I execute summarize hook
    Then project should appear in /api/projects
    And observations count should increase in /api/stats
