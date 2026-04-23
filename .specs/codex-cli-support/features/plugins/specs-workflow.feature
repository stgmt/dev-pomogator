Feature: Codex parity for specs-workflow

  Background:
    Given dev-pomogator is installed
    And a git repository project exists

  Scenario: specs-workflow writes MCP servers to project Codex config
    Given specs-workflow is enabled in the support matrix
    When user runs dev-pomogator install with target "codex"
    Then ".codex/config.toml" should contain an mcp_servers entry for "context7"
    And ".codex/config.toml" should contain an mcp_servers entry for "octocode"
    And Codex MCP parity should not depend on existing Cursor or Claude JSON writers

  Scenario: specs-workflow is marked partial until non-Bash gating replacement exists
    When Codex support matrix is generated
    Then specs-workflow should have an explicit parity route
    And the parity route should name skills, AGENTS guidance and MCP as applicable
    And specs-workflow should be marked "partial" unless non-Bash interception parity is implemented
