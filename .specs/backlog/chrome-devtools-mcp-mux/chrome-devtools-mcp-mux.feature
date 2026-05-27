Feature: PLUGIN017_chrome-devtools-mcp-mux

  Background:
    Given dev-pomogator is installed
    And a git repository project exists

  # @feature1 — FR-1: Extension package
  Scenario: PLUGIN017_01 installer creates extension files in target project
    Given a fresh fixture project without dev-pomogator artifacts
    When dev-pomogator installer runs with chrome-devtools-mcp-mux extension enabled
    Then "<targetProject>/.dev-pomogator/tools/chrome-devtools-mcp-mux/smoke-test.mjs" exists
    And "<targetProject>/.claude/skills/chrome-devtools-mcp-mux/SKILL.md" exists
    And "~/.dev-pomogator/config.json" contains an installedExtensions entry with name "chrome-devtools-mcp-mux"

  # @feature2 — FR-2: MCP server registration (smart merge)
  Scenario: PLUGIN017_02 installer adds mux entry to existing .mcp.json without losing user keys
    Given a fixture project with existing ".mcp.json" containing mcpServers key "user-server-foo"
    When dev-pomogator installer runs with chrome-devtools-mcp-mux extension enabled
    Then ".mcp.json" mcpServers contains key "chrome-devtools-mcp-mux" with command "npx" and args matching "chrome-devtools-mcp-mux@\d+\.\d+\.\d+"
    And ".mcp.json" mcpServers still contains key "user-server-foo" with original config
    And ".mcp.json" was written atomically (no .tmp file remaining)

  # @feature2 — FR-2: MCP server registration (create from scratch)
  Scenario: PLUGIN017_03 installer creates .mcp.json when absent
    Given a fixture project without ".mcp.json"
    When dev-pomogator installer runs with chrome-devtools-mcp-mux extension enabled
    Then ".mcp.json" file is created
    And ".mcp.json" contains exactly one mcpServers key "chrome-devtools-mcp-mux"

  # @feature3 — FR-3: Skill направляет Claude к mux как DEFAULT
  Scenario: PLUGIN017_04 SKILL.md contains DEFAULT directive and 5 mandatory sections
    Given chrome-devtools-mcp-mux extension is installed
    When the test parses ".claude/skills/chrome-devtools-mcp-mux/SKILL.md"
    Then the SKILL.md frontmatter has name "chrome-devtools-mcp-mux"
    And the SKILL.md description contains the phrase "FIRST and DEFAULT" (case-insensitive)
    And the SKILL.md body contains sections "Triggers", "Decision Tree", "Hard rules", "Compatibility", "When NOT to use"
    And the SKILL.md "Triggers" section lists at least 10 keywords including "browser", "screenshot", "console", "navigate"
    And the SKILL.md "Hard rules" section explicitly forbids vanilla "mcp__chrome-devtools-mcp__" tool calls when mux is configured

  # @feature4 — FR-4: Pomogator-doctor checks (per-extension driving)
  Scenario: PLUGIN017_05 doctor emits 5 CDMM-* checks when extension installed
    Given chrome-devtools-mcp-mux extension is installed
    And ".mcp.json" contains a valid chrome-devtools-mcp-mux mcpServers entry
    When the test invokes pomogator-doctor in the fixture project
    Then doctor output contains 5 entries with IDs "CDMM-1", "CDMM-2", "CDMM-3", "CDMM-4", "CDMM-5"
    And each CDMM entry has severity equal to "ok" or "warning" or "critical"
    And each non-ok CDMM entry has a non-empty fixHint string
    And the CDMM entries are grouped under header "chrome-devtools-mcp-mux"

  # @feature4 — FR-4: Doctor skips checks when extension not installed
  Scenario: PLUGIN017_06 doctor skips CDMM-* checks when extension absent
    Given chrome-devtools-mcp-mux extension is not in installedExtensions
    When the test invokes pomogator-doctor in the fixture project
    Then doctor output contains zero entries with IDs starting with "CDMM-"

  # @feature5 — FR-5: Conflict detection с claude-in-chrome
  Scenario: PLUGIN017_07 installer warns when claude-in-chrome already configured
    Given a fixture project with ".mcp.json" containing mcpServers key "claude-in-chrome"
    When dev-pomogator installer runs with chrome-devtools-mcp-mux extension and CI=true
    Then installer stderr contains the phrase "mutually exclusive"
    And installer stderr contains the phrase "Chrome 136"
    And installer applies default behavior (skip install of mux)
    And ".mcp.json" mcpServers still contains "claude-in-chrome"
    And ".mcp.json" mcpServers does NOT contain "chrome-devtools-mcp-mux"

  # @feature5 — FR-5: Doctor co-existence warning
  Scenario: PLUGIN017_08 doctor emits warning when both MCPs configured
    Given chrome-devtools-mcp-mux extension is installed
    And ".mcp.json" contains BOTH "chrome-devtools-mcp-mux" AND "claude-in-chrome" mcpServers entries
    When the test invokes pomogator-doctor in the fixture project
    Then doctor CDMM-2 entry has severity "warning"
    And the CDMM-2 fixHint contains text referencing FR-5 conflict resolution

  # @feature6 — FR-6: Uninstall cleanup
  Scenario: PLUGIN017_09 uninstall removes mux entry but preserves other mcp servers
    Given chrome-devtools-mcp-mux extension is installed in a fixture project
    And ".mcp.json" mcpServers contains keys "chrome-devtools-mcp-mux" AND "user-server-foo"
    When dev-pomogator uninstall command runs for chrome-devtools-mcp-mux
    Then ".mcp.json" mcpServers does NOT contain "chrome-devtools-mcp-mux"
    And ".mcp.json" mcpServers still contains "user-server-foo"
    And directory ".claude/skills/chrome-devtools-mcp-mux/" does not exist
    And directory ".dev-pomogator/tools/chrome-devtools-mcp-mux/" does not exist
    And "~/.dev-pomogator/config.json" installedExtensions does not contain entry with name "chrome-devtools-mcp-mux"

  # @feature7 — FR-7: Pinned version in extension.json
  Scenario: PLUGIN017_10 extension.json declares exact pinned version
    When the test parses "extensions/chrome-devtools-mcp-mux/extension.json"
    Then mcpServers.chrome-devtools-mcp-mux.args matches the regex "^chrome-devtools-mcp-mux@\d+\.\d+\.\d+$"
    And the args do NOT contain "@latest" suffix
    And the args do NOT contain "^" or "~" semver prefixes

  # @feature9 — FR-9: First-run browser preference prompt (skill triggers configure-browser.mjs)
  Scenario: PLUGIN017_12 configure-browser helper switches to bundled Chromium
    Given a fixture project with ".mcp.json" containing chrome-devtools-mcp-mux entry
    And the env.CDMCP_MUX_CHROMIUM key is set to an Edge path
    When the test runs "configure-browser.mjs bundled" via npx tsx
    Then the script exit code is 0
    And ".mcp.json" mcpServers.chrome-devtools-mcp-mux entry has NO env.CDMCP_MUX_CHROMIUM key
    And "~/.dev-pomogator/.cdmm-browser-choice.json" file is created with choice "bundled" and dismissed false

  # @feature9 — FR-9: don't-ask-again marker honors flag
  Scenario: PLUGIN017_13 configure-browser with --dismiss writes dismissed=true
    Given a fixture project with ".mcp.json" containing chrome-devtools-mcp-mux entry
    When the test runs "configure-browser.mjs edge --dismiss" via npx tsx
    Then "~/.dev-pomogator/.cdmm-browser-choice.json" file has dismissed equal to true
    And subsequent invocations of the skill SHALL skip the prompt

  # @feature8 — FR-8: Windows transport smoke test
  Scenario: PLUGIN017_11 smoke test completes JSON-RPC handshake on Windows
    Given Windows platform OR Linux/macOS CI runner
    And chrome-devtools-mcp-mux extension is installed
    When the test runs ".dev-pomogator/tools/chrome-devtools-mcp-mux/smoke-test.mjs"
    Then the smoke script exit code is 0 within 30 seconds
    And the smoke script stdout contains a valid MCP "initialize" response with "protocolVersion"
    And the smoke script stdout contains a valid "tools/list" response listing at least one of these tools: "navigate_page", "take_screenshot", "list_pages", or "select_page"
