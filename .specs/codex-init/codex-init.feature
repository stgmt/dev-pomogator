# Каждый Scenario ОБЯЗАН нести @FR-N тег требования, которое он тестирует
# (conformance UNTAGGED_SCENARIO; blanket-теги ловит TAG_BULK_SUSPECT + FR-8 judge).
Feature: CODEXINIT001_Codex plugin support whitelist

  Background:
    Given the dev-pomogator repository has existing Claude Code plugin support
    And Codex plugin support is being added as a parallel channel

  @FR-1
  Scenario: CODEXINIT001_01 Whitelist entry required before Codex support claim
    Given a dev-pomogator feature has no Codex plugin whitelist entry
    When the feature is evaluated for Codex plugin support
    Then it is not reported as supported
    And the missing manifest, marketplace, runtime, and verification evidence are listed

  @FR-2
  Scenario: CODEXINIT001_02 Claude support remains present after Codex support
    Given a feature already has Claude Code plugin artifacts
    When Codex plugin support is added for that feature
    Then the Claude Code artifacts remain present
    And the Codex artifacts are verified through a separate channel

  @FR-3
  Scenario: CODEXINIT001_03 Context menu is the first whitelisted Codex plugin surface
    Given the Codex plugin support whitelist exists
    When the whitelist entries are ordered
    Then the first entry is "context-menu"
    And it links to ".specs/context-menu/" for detailed launcher behavior

  @FR-4
  Scenario: CODEXINIT001_04 Codex packaging uses Codex-native manifest paths
    Given a plugin entry is whitelisted for Codex
    When its packaging contract is inspected
    Then the Codex manifest path is ".codex-plugin/plugin.json"
    And the Codex marketplace path is ".agents/plugins/marketplace.json"

  @FR-5
  Scenario: CODEXINIT001_05 Supported status requires real Codex verification
    Given a whitelist entry is marked "Supported"
    When its verification evidence is inspected
    Then the evidence includes a real Codex plugin CLI run or equivalent integration harness
    And the evidence covers marketplace visibility, manifest validity, installed state, and runtime loading expectations

  @FR-6
  Scenario: CODEXINIT001_06 Stale Claude-to-Codex claims are rejected
    Given a Codex implementation claim is copied from a Claude-only behavior
    When local Codex CLI output or official Codex documentation contradicts the claim
    Then the claim is marked as drift
    And it cannot be used as a requirement until corrected

  @FR-7
  Scenario: CODEXINIT001_07 Codex package exposes only the context-menu surface
    Given a plugin entry is whitelisted for Codex
    When its Codex manifest install surface is inspected
    Then the Codex manifest should expose only the context-menu skill surface
    And the Codex manifest should not expose Claude hooks, Claude rules, or Claude commands
