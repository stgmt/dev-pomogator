# Source: tests/features/core/CORE003_claude-installer.feature (паттерн installer tests)
Feature: LSP001 LSP Setup Extension
  As a developer using dev-pomogator
  I want LSP servers automatically installed and configured
  So that Claude Code has semantic code navigation out of the box

  Background:
    Given Docker test environment is running
    And base Claude Code fixture is prepared

  # @feature1
  Scenario: LSP001_01 Extension manifest is valid
    Given lsp-setup extension exists in extensions/
    When I read extensions/lsp-setup/extension.json
    Then it should contain "tools" section with "lsp-setup"
    And it should contain "ruleFiles" section
    And it should contain "envRequirements" with "ENABLE_LSP_TOOL"
    And it should contain "postInstall" hook

  # @feature6
  Scenario: LSP001_02 ENABLE_LSP_TOOL env var is injected
    When dev-pomogator installs lsp-setup extension for Claude Code
    Then project .claude/settings.json env should contain "ENABLE_LSP_TOOL" = "1"

  # @feature6
  Scenario: LSP001_03 LSP usage rule is installed
    When dev-pomogator installs lsp-setup extension for Claude Code
    Then .claude/rules/lsp-setup/lsp-usage.md should exist in project
    And rule should contain "goToDefinition"
    And rule should contain "findReferences"

  # @feature2
  Scenario: LSP001_04 Setup script detects existing binaries
    Given vtsls is already installed globally
    When I run setup-lsp.ts --install
    Then output should contain "vtsls: already installed"
    And npm install should NOT be called for @vtsls/language-server

  # @feature5
  Scenario: LSP001_05 Setup script skips C# when dotnet missing
    Given dotnet is not available in PATH
    When I run setup-lsp.ts --install
    Then output should contain "dotnet not found, skipping C# LSP"
    And exit code should be 0
    And other LSP servers should still be installed

  # @feature7
  Scenario: LSP001_06 Fallback to local plugins when marketplace unavailable
    Given Piebald-AI marketplace is not reachable
    When I run setup-lsp.ts --install
    Then local plugin directory should be created in .dev-pomogator/tools/lsp-setup/plugins/
    And output should contain "Using local LSP plugins"
    And .lsp.json files should exist for each language

  # @feature2 @feature3 @feature4
  Scenario: LSP001_07 Verification report is printed after install
    When I run setup-lsp.ts --install
    Then output should contain a table with Language, Server, Binary, Status columns
    And output should contain "LSP servers installed"

  # @feature1
  Scenario: LSP001_08 Update installs only missing servers
    Given vtsls and pyright are already installed
    When I run setup-lsp.ts --update
    Then npm install should NOT be called for @vtsls/language-server
    And npm install should NOT be called for pyright
    And only missing servers should be installed

  # @feature1
  Scenario: LSP001_09 Extension manifest rules are installed by dynamic test
    Given lsp-setup extension is listed in extensions/
    When CORE003_RULES dynamic test runs
    Then lsp-usage.md should be verified as installed
