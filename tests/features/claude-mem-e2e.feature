# Real end-to-end proof for the claude-mem bootstrap (FR-2 / FR-3): it runs the ACTUAL
# `npx claude-mem install` (network + Bun/uv download) inside a container, then asserts the real
# installer registered the plugin AND the hook's own detection flips to true. Tagged @e2e so it is
# NOT part of the fast default suite (it needs network + ~1-2min); run it explicitly:
#   node ... cucumber -c <cfg> --tags @e2e   (inside Docker/Linux with network)
# Step-defs: tests/step_definitions/feature_claude_mem_e2e.ts. Uses the EXACT command the hook issues
# (buildInstallInvocation from the hook module), so this proves the hook's command actually works.
@e2e
Feature: CMEME2E claude-mem real install end-to-end

  @e2e
  Scenario: CMEME2E_01 the hook's non-interactive command really installs claude-mem and detection flips
    Given a clean isolated HOME for a real claude-mem install
    When the hook's non-interactive claude-mem install command runs for real
    Then claude-mem is registered in installed_plugins.json with a claude-mem entry
    And the hook detection reports claude-mem as installed
