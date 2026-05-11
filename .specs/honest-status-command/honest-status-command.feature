# Domain code HSCMD001 — Honest Spec Status Command
Feature: HSCMD001_Honest_Spec_Status_Command

  Background:
    Given dev-pomogator repo с .dev-pomogator/tools/specs-generator/spec-status.ts present
    And Agent tool (subagent_type=general-purpose) available
    And `.claude/skills/spec-status/` skill installed

  # @feature1
  Scenario: HSCMD001_01 AI proactive invocation auto-detects active spec + delegates to sub-agent
    Given активная спека `.specs/active-feature/` с recent .progress.json (mtime <7 days)
    And `~/.claude/plans/active-feature.md` exists with 8 todos
    And `.specs/active-feature/ACCEPTANCE_CRITERIA.md` содержит AC-1..AC-5
    When главный AI вызывает `Skill("spec-status")` без аргументов
    Then skill auto-detects slug=active-feature по mtime + plan path
    And skill invokes `Agent(subagent_type="general-purpose", ...)` с context bundle ≤4KB
    And sub-agent reads ACCEPTANCE_CRITERIA.md + TASKS.md + test files
    And sub-agent returns JSON conforming to SCHEMA с ac[] classified verified/blocked/claimed_only
    And output markdown содержит секции: Spec Progress / AC Status / Tests / Git
    And exit code is 0

  # @feature2
  Scenario: HSCMD001_02 User explicit invocation flags AC as claimed-only when no evidence
    Given .specs/honest-status-command/TASKS.md содержит "- [x] T-3: implement FR-3" without commit/test evidence
    And no test file matches FR-3 verification
    When пользователь вызывает `/spec-status honest-status-command`
    Then sub-agent classifies AC linked to FR-3 as `claimed_only` (NOT `verified`)
    And output markdown содержит "❌ AC-3: claimed-only (no evidence file/test/commit found)"
    And exit code is 0

  # @feature3
  Scenario: HSCMD001_03 Environmental blocker — Docker unreachable separated from test failures
    Given `docker ps` returns exit code 1 with message "Cannot connect to Docker daemon"
    And `.dev-pomogator/.test-status/status.abc.yaml` exists с `state: running` AND mtime 8 min ago
    When `/spec-status` invoked
    Then output содержит секцию "## Environmental Blockers"
    And section lists "Docker daemon unreachable: Cannot connect to Docker daemon"
    And section lists "Test heartbeat dead — last update 8 min ago"
    And tests section marks YAML status as "⏸ stale" (NOT "❌ failed")
    And exit code is 0 (environmental ≠ failure)

  # @feature4
  Scenario: HSCMD001_04 Sub-agent flags weak test bodies as fake-positive risk
    Given fixture `tests/fixtures/spec-status/sample.test.ts` contains 3 it() blocks
    And it() #1 uses only `expect(result).toBeDefined()` (no value assertion)
    And it() #2 uses `vi.mock("../../src/critical-parser.ts")` for production path
    And it() #3 uses `expect(parsed).toEqual({key: "value", nested: {a: 1}})` (strong)
    When `/spec-status` invoked
    Then sub-agent test quality output reports:
      | Line | Classification        | Reason                                       |
      | 1    | WEAK                  | Assertion is presence-only, not value-level  |
      | 2    | FAKE-POSITIVE-RISK    | Mocks production path src/critical-parser.ts |
      | 3    | STRONG                | Value-level assertion with full structure    |
    And output markdown содержит summary "1/3 STRONG, 1/3 WEAK, 1/3 FAKE-POSITIVE-RISK"
    And exit code is 0
