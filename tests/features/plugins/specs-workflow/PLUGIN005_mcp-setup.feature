Feature: PLUGIN005 - MCP Setup for Research Workflow
  As a developer using specs-workflow
  I want MCP servers (Context7, Octocode) to be installed automatically
  So that I can use research-workflow with all available tools

  Background:
    Given a clean user home directory
    And no MCP servers are configured

  # ============================================================================
  # Check Mode
  # ============================================================================

  Scenario: Detect missing MCP servers
    When I run mcp-setup with "--platform cursor --check"
    Then the output should contain "[MISSING] context7"
    And the output should contain "[MISSING] octocode"

  Scenario: Detect already installed MCP servers
    Given context7 MCP is already configured in cursor
    When I run mcp-setup with "--platform cursor --check"
    Then the output should contain "[OK] context7"
    And the output should contain "[MISSING] octocode"

  # ============================================================================
  # Install Mode - Cursor
  # ============================================================================

  Scenario: Install context7 MCP to Cursor
    When I run mcp-setup with "--platform cursor --skip-interactive"
    Then the exit code should be 0
    And ~/.cursor/mcp.json should contain "context7" server
    And the context7 server should use "npx" command
    And the context7 server should have "@upstash/context7-mcp@latest" in args

  Scenario: Skip octocode without GITHUB_TOKEN
    When I run mcp-setup with "--platform cursor --skip-interactive"
    Then the output should contain "[SKIP]"
    And the output should contain "GITHUB_TOKEN"
    And ~/.cursor/mcp.json should not contain "octocode" server

  Scenario: Install octocode with GITHUB_TOKEN
    Given GITHUB_TOKEN environment variable is set to "ghp_test_token"
    When I run mcp-setup with "--platform cursor --skip-interactive"
    Then ~/.cursor/mcp.json should contain "octocode" server
    And the octocode server should have GITHUB_TOKEN in env

  Scenario: Skip already installed MCP servers
    Given context7 MCP is already configured in cursor
    When I run mcp-setup with "--platform cursor --skip-interactive"
    Then the output should contain "[OK] context7: already installed"

  Scenario: Force reinstall with --force flag
    Given context7 MCP is already configured in cursor
    When I run mcp-setup with "--platform cursor --skip-interactive --force"
    Then the output should contain "[INSTALL] context7"

  # ============================================================================
  # Install Mode - Claude Code
  # ============================================================================

  Scenario: Install MCP to Claude Code
    When I run mcp-setup with "--platform claude --skip-interactive"
    Then the exit code should be 0
    And ~/.claude.json should contain "context7" server

  # ============================================================================
  # Merge with Existing Config
  # ============================================================================

  Scenario: Preserve existing MCP servers
    Given cursor mcp.json has "my-custom-mcp" server
    When I run mcp-setup with "--platform cursor --skip-interactive"
    Then ~/.cursor/mcp.json should contain "my-custom-mcp" server
    And ~/.cursor/mcp.json should contain "context7" server

  Scenario: Preserve other properties in claude.json
    Given ~/.claude.json has "theme" property set to "dark"
    When I run mcp-setup with "--platform claude --skip-interactive"
    Then ~/.claude.json should have "theme" property equal to "dark"
    And ~/.claude.json should contain "context7" server

  # ============================================================================
  # Both Platforms
  # ============================================================================

  Scenario: Install to both Cursor and Claude Code
    When I run mcp-setup with "--platform both --skip-interactive"
    Then the exit code should be 0
    And ~/.cursor/mcp.json should contain "context7" server
    And ~/.claude.json should contain "context7" server

  # ============================================================================
  # Post-Install Hook Integration
  # ============================================================================

  Scenario: MCP setup runs as post-install hook for specs-workflow
    Given specs-workflow extension is selected for installation
    When I run the Cursor installer
    Then the post-install hook for specs-workflow should execute
    And the output should contain "MCP Setup"
