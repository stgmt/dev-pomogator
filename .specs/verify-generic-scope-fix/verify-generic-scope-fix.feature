Feature: VSGF001 Verify Generic Scope Fix gate

  As a Claude Code agent modifying guard/policy/enum code
  I want a mandatory code-evidence reach verification before commit
  So structurally no-op scope expansions cannot ship

  Background:
    Given dev-pomogator is installed with scope-gate extension
    And a git repository project exists
    And target project has .claude/ directory initialised

  # @feature1
  Scenario: VSGF001_10 Enum extension in Service file is blocked without marker
    Given staged diff adds line "'stocktaking'" to array in file "src/services/StockValidationService.ts"
    And no marker file exists under ".claude/.scope-verified/"
    And commit message does not contain "[skip-scope-verify:"
    When Claude Code invokes Bash "git commit -m 'fix: add stocktaking'"
    Then hook stdout contains permissionDecision "deny"
    And hook exit code is 2
    And permissionDecisionReason mentions "/verify-generic-scope-fix"
    And permissionDecisionReason mentions score >= 2

  # @feature1
  Scenario: VSGF001_11 Fresh marker with matching diff hash unblocks commit
    Given staged diff adds line "'stocktaking'" to array in file "src/services/StockValidationService.ts"
    And fresh marker file exists at ".claude/.scope-verified/sess1-<diff12>.json" with matching diff_sha256 and should_ship true
    And marker timestamp is within last 30 minutes
    When Claude Code invokes Bash "git commit -m 'fix: add stocktaking after verification'"
    Then hook exit code is 0
    And no deny JSON is emitted

  # @feature1
  Scenario: VSGF001_12 Switch-case addition in Gate file is blocked
    Given staged diff adds line "case StockTaking:" inside switch in file "src/services/DocumentGate.ts"
    And no marker file exists
    When Claude Code invokes Bash "git commit -m 'feat: handle stocktaking case'"
    Then hook exit code is 2
    And permissionDecisionReason mentions "switch-case" or "case"

  # @feature2
  Scenario: VSGF001_20 Stale marker (diff hash mismatch) is ignored
    Given staged diff has sha256 "new456"
    And marker exists with diff_sha256 "old123" and session_id matching current session
    When Claude Code invokes Bash "git commit -m 'fix'"
    Then hook exit code is 2
    And permissionDecisionReason mentions "verification stale" or re-run hint

  # @feature2
  Scenario: VSGF001_21 Marker older than 30 minutes is invalidated
    Given staged diff adds suspicious pattern
    And marker exists with matching diff_sha256 and session_id but timestamp 31 minutes ago
    When Claude Code invokes Bash "git commit -m 'fix'"
    Then hook exit code is 2
    And permissionDecisionReason mentions re-verify required

  # @feature3
  Scenario: VSGF001_30 Explicit escape hatch logs audit entry and passes
    Given staged diff adds line "case StockTaking:" in file "src/services/DocumentGate.ts"
    And no marker file exists
    When Claude Code invokes Bash "git commit -m 'chore: refactor [skip-scope-verify: dead-code path confirmed with reviewer evolkov — no runtime reach]'"
    Then hook exit code is 0
    And file ".claude/logs/scope-gate-escapes.jsonl" contains one new line
    And the new line contains reason starting with "dead-code path confirmed"
    And the new line contains the diff_sha256 of staged diff

  # @feature3
  Scenario: VSGF001_31 Escape hatch with reason shorter than 8 chars warns but passes
    Given staged diff adds suspicious pattern
    When Claude Code invokes Bash "git commit -m 'fix [skip-scope-verify: tl;dr]'"
    Then hook exit code is 0
    And hook stderr contains warning about short reason
    And escape log entry is still appended

  # @feature4
  Scenario: VSGF001_40 Docs-only diff is short-circuited without scoring
    Given staged diff touches only "README.md" and "docs/CHANGES.md"
    When Claude Code invokes Bash "git commit -m 'docs: update changelog'"
    Then hook exit code is 0
    And no deny JSON is emitted
    And no marker file is created

  # @feature4
  Scenario: VSGF001_41 Non-guard enum addition false positive — escapable
    Given staged diff adds line "'hotpink'" to array in file "src/utils/ColorPalette.ts"
    When Claude Code invokes Bash "git commit -m 'feat: add color [skip-scope-verify: pure presentation enum no runtime gate]'"
    Then hook exit code is 0
    And escape log entry is appended

  # @feature5
  Scenario: VSGF001_50 SKILL.md frontmatter contains disable-model-invocation true
    Given dev-pomogator scope-gate extension is installed
    When I read ".claude/skills/verify-generic-scope-fix/SKILL.md" frontmatter
    Then frontmatter contains "disable-model-invocation: true"
    And frontmatter contains "name: verify-generic-scope-fix"
    And frontmatter contains "allowed-tools:" with Read, Bash, Grep, Glob

  # @feature5
  Scenario: VSGF001_51 extension.json registers hook with correct matcher
    Given "extensions/scope-gate/extension.json" exists
    When I parse the manifest
    Then hooks.claude.PreToolUse.matcher equals "Bash"
    And hooks.claude.PreToolUse.command contains "scope-gate-guard.ts"
    And hooks.claude.PreToolUse.timeout is less than or equal to 10
    And skillFiles contains "verify-generic-scope-fix/SKILL.md" and analyze-diff.ts
    And toolFiles contains scope-gate-guard.ts, score-diff.ts, marker-store.ts
    And ruleFiles.claude contains when-to-verify.md and escape-hatch-audit.md

  # @feature1
  Scenario: VSGF001_60 Non-git Bash command passes without side effects
    When Claude Code invokes Bash "ls -la"
    Then hook exit code is 0
    And hook stdout is empty
    And no marker file is created
    And no escape log entry is appended
