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


@FR-5 @AC-5.1
Scenario: CODEXINIT001_08 support fails without a real path-safe Codex probe
  Given the Codex verification harness cannot complete its real plugin probe
  When the whitelist verification report is finalized
  Then Supported fails rather than converting skipped probe checks into pass
  And a sibling path with the CODEX_HOME string prefix is rejected as outside containment

  @FR-5 @AC-5
  Scenario: CODEXINIT001_09 production harness ignores probe overrides and succeeds only via PATH shim
    Given a whitelist entry is marked "Supported"
    When its verification evidence is inspected
    Then the harness succeeds only through a PATH-shimmed codex executable backed by the committed probe fixture

@FR-8 @AC-8
  Scenario: CODEXINIT001_10 full spec generator is the distinct second plugin entry
    Given the Codex plugin support whitelist exists
    When the whitelist entries are ordered
    Then the first entry is "context-menu"
    And the second entry is "spec-generator-v4"
    And the second entry has its own plugin source and manifest reference
    And codex-init is the only writer of whitelist order and support status
    And the entry consumes the package handoff from "spec-generator-v4" task "p50-codex-plugin-distribution"
    And full plugin behavior is delegated to "spec-generator-v4" requirement 83
    And the second entry is not reported as Supported without installed-runtime evidence
