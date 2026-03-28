Feature: GUARD002 Build Guard Hook
  As a developer using dev-pomogator
  I want test commands to be blocked when build is stale
  So that tests never run on outdated code

  Background:
    Given dev-pomogator is installed
    And tui-test-runner extension is enabled

  # @feature1
  Scenario: GUARD002_01 deny when TypeScript src newer than dist
    Given src/index.ts has been modified after last build
    And dist/index.js exists but is older than src/
    When build_guard hook receives a Bash command with "test_runner_wrapper --framework vitest"
    Then hook SHALL deny with exit code 2
    And deny message SHALL contain "Build stale"
    And deny message SHALL contain "npm run build"

  # @feature1
  Scenario: GUARD002_02 deny when dist directory missing
    Given dist/ directory does not exist
    When build_guard hook receives a Bash command with "test_runner_wrapper --framework vitest"
    Then hook SHALL deny with exit code 2
    And deny message SHALL contain "No build artifacts"
    And deny message SHALL contain "npm run build"

  # @feature1
  Scenario: GUARD002_03 allow when build is fresh
    Given dist/index.js is newer than all src/**/*.ts files
    When build_guard hook receives a Bash command with "test_runner_wrapper --framework vitest"
    Then hook SHALL allow with exit code 0

  # @feature3
  Scenario: GUARD002_04 deny when Docker SKIP_BUILD is set
    Given SKIP_BUILD=1 is set in environment
    When build_guard hook receives a Bash command with "docker-test.sh"
    Then hook SHALL deny with exit code 2
    And deny message SHALL contain "Docker build must not be skipped"

  # @feature3
  Scenario: GUARD002_05 deny when dotnet --no-build flag present
    Given the test command contains "--no-build" flag
    When build_guard hook receives a Bash command with "test_runner_wrapper --framework dotnet -- dotnet test --no-build"
    Then hook SHALL deny with exit code 2
    And deny message SHALL contain "--no-build"

  # @feature3
  Scenario: GUARD002_06 allow for pytest without staleness check
    When build_guard hook receives a Bash command with "test_runner_wrapper --framework pytest"
    Then hook SHALL allow with exit code 0

  # @feature3
  Scenario: GUARD002_07 allow for go without staleness check
    When build_guard hook receives a Bash command with "test_runner_wrapper --framework go"
    Then hook SHALL allow with exit code 0

  # @feature3
  Scenario: GUARD002_08 allow for rust without staleness check
    When build_guard hook receives a Bash command with "test_runner_wrapper --framework rust"
    Then hook SHALL allow with exit code 0

  # @feature5
  Scenario: GUARD002_09 allow with SKIP_BUILD_CHECK bypass
    Given src/index.ts has been modified after last build
    And SKIP_BUILD_CHECK=1 is set in environment
    When build_guard hook receives a Bash command with "test_runner_wrapper --framework vitest"
    Then hook SHALL allow with exit code 0
    And stderr SHALL contain "Build check skipped"

  # @feature1
  Scenario: GUARD002_10 allow for non-test commands (passthrough)
    When build_guard hook receives a Bash command with "ls -la"
    Then hook SHALL allow with exit code 0

  # @feature1
  Scenario: GUARD002_11 fail-open on invalid JSON input
    When build_guard hook receives invalid JSON on stdin
    Then hook SHALL allow with exit code 0

  # @feature1
  Scenario: GUARD002_12 fail-open on stat error
    Given src/ directory does not exist
    When build_guard hook receives a Bash command with "test_runner_wrapper --framework vitest"
    Then hook SHALL allow with exit code 0

  # @feature1
  Scenario: GUARD002_13 installer registers build_guard in settings.json
    Given dev-pomogator is installed with --claude --all
    Then .claude/settings.json PreToolUse SHALL contain build_guard hook entry
    And build_guard entry SHALL have matcher "Bash"

  # @feature1
  Scenario: GUARD002_14 build_guard is before test_guard in hook order
    Given dev-pomogator is installed with --claude --all
    Then build_guard index in PreToolUse SHALL be less than test_guard index
