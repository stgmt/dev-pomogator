Feature: VSGF001 Verify Generic Scope Fix gate

  As a Claude Code agent modifying guard/policy/enum code
  I want a mandatory code-evidence reach verification before commit
  So structurally no-op scope expansions cannot ship

  Background:
    Given dev-pomogator is installed with scope-gate extension
    And a git repository project exists
    And target project has .claude/ directory initialised

  @feature1
  Scenario: VSGF001_10 Enum extension in Service file is blocked without marker
    Given staged diff adds line "'stocktaking'" to array in file "src/services/StockValidationService.ts"
    And no marker file exists under ".claude/.scope-verified/"
    And commit message does not contain "[skip-scope-verify:"
    When Claude Code invokes Bash "git commit -m 'fix: add stocktaking'"
    Then hook stdout contains permissionDecision "deny"
    And hook exit code is 2
    And permissionDecisionReason mentions "/verify-generic-scope-fix"
    And permissionDecisionReason mentions score >= 2

  @feature1
  Scenario: VSGF001_11 Fresh marker with matching diff hash unblocks commit
    Given staged diff adds line "'stocktaking'" to array in file "src/services/StockValidationService.ts"
    And fresh marker file exists at ".claude/.scope-verified/sess1-<diff12>.json" with matching diff_sha256 and should_ship true
    And marker timestamp is within last 30 minutes
    When Claude Code invokes Bash "git commit -m 'fix: add stocktaking after verification'"
    Then hook exit code is 0
    And no deny JSON is emitted

  @feature1
  Scenario: VSGF001_12 Switch-case addition in Gate file is blocked
    Given staged diff adds line "case StockTaking:" inside switch in file "src/services/DocumentGate.ts"
    And no marker file exists
    When Claude Code invokes Bash "git commit -m 'feat: handle stocktaking case'"
    Then hook exit code is 2
    And permissionDecisionReason mentions "switch-case" or "case"

  @feature2
  Scenario: VSGF001_20 Stale marker (diff hash mismatch) is ignored
    Given staged diff has sha256 "new456"
    And marker exists with diff_sha256 "old123" and session_id matching current session
    When Claude Code invokes Bash "git commit -m 'fix'"
    Then hook exit code is 2
    And permissionDecisionReason mentions re-run hint or score pattern

  @feature2
  Scenario: VSGF001_21 Marker older than 30 minutes is invalidated
    Given staged diff adds suspicious pattern
    And marker exists with matching diff_sha256 and session_id but timestamp 31 minutes ago
    When Claude Code invokes Bash "git commit -m 'fix'"
    Then hook exit code is 2
    And permissionDecisionReason mentions re-verify required

  @feature3
  Scenario: VSGF001_30 Explicit escape hatch logs audit entry and passes
    Given staged diff adds line "case StockTaking:" in file "src/services/DocumentGate.ts"
    And no marker file exists
    When Claude Code invokes Bash "git commit -m 'chore: refactor [skip-scope-verify: dead-code path confirmed with reviewer evolkov — no runtime reach]'"
    Then hook exit code is 0
    And file ".claude/logs/scope-gate-escapes.jsonl" contains one new line
    And the new line contains reason starting with "dead-code path confirmed"
    And the new line contains the diff_sha256 of staged diff

  @feature3
  Scenario: VSGF001_31 Escape hatch with reason shorter than 8 chars warns but passes
    Given staged diff adds suspicious pattern
    When Claude Code invokes Bash "git commit -m 'fix [skip-scope-verify: tl;dr]'"
    Then hook exit code is 0
    And hook stderr contains warning about short reason
    And escape log entry is still appended

  @feature4
  Scenario: VSGF001_40 Docs-only diff is short-circuited without scoring
    Given staged diff touches only "README.md" and "docs/CHANGES.md"
    When Claude Code invokes Bash "git commit -m 'docs: update changelog'"
    Then hook exit code is 0
    And no deny JSON is emitted
    And no marker file is created

  @feature4
  Scenario: VSGF001_41 Non-guard enum addition false positive — escapable
    Given staged diff adds line "'hotpink'" to array in file "src/utils/ColorPalette.ts"
    When Claude Code invokes Bash "git commit -m 'feat: add color [skip-scope-verify: pure presentation enum no runtime gate]'"
    Then hook exit code is 0
    And escape log entry is appended

  @feature5
  Scenario: VSGF001_50 SKILL.md frontmatter contains disable-model-invocation true
    Given dev-pomogator scope-gate extension is installed
    When I read ".claude/skills/verify-generic-scope-fix/SKILL.md" frontmatter
    Then frontmatter contains "disable-model-invocation: true"
    And frontmatter contains "name: verify-generic-scope-fix"
    And frontmatter contains "allowed-tools:" with Read, Bash, Grep, Glob

  @feature5
  Scenario: VSGF001_51 ships scope-gate guard tool, skill and rules at v2 paths
    Given dev-pomogator scope-gate extension is installed
    When I check the v2 artifact paths
    Then "tools/scope-gate/scope-gate-guard.ts" exists
    And "tools/scope-gate/analyze-diff.ts" exists
    And ".claude/skills/verify-generic-scope-fix/SKILL.md" exists
    And ".claude/rules/scope-gate/when-to-verify.md" exists
    And ".claude/rules/scope-gate/escape-hatch-audit.md" exists

  @feature1
  Scenario: VSGF001_60 Non-git Bash command passes without side effects
    When Claude Code invokes Bash "ls -la"
    Then hook exit code is 0
    And hook stdout is empty
    And no marker file is created
    And no escape log entry is appended

  @feature6
  Scenario: VSGF001_61 The stocktaking incident fixture scores >= 4 via the weighted heuristic (regression pin)
    Given the stocktaking incident diff fixture from PRODUCTS-20218
    When the scope-gate weighted heuristic scores the stocktaking diff
    Then the suspicion score is at least 4
    And the score reasons include a filename hit on "StockValidationService.ts"
    And the score reasons include an enum-item hit on "StockValidationService.ts"

  @feature6
  Scenario: VSGF001_62 An empty diff scores zero
    Given a raw scope-gate diff ""
    When the scope-gate heuristic scores the diff
    Then the suspicion score is exactly 0

  @feature6
  Scenario: VSGF001_63 A malformed diff scores zero
    Given a raw scope-gate diff "this is not a diff"
    When the scope-gate heuristic scores the diff
    Then the suspicion score is exactly 0

  @feature6
  Scenario: VSGF001_64 A switch-case addition scores at least three
    Given a scope-gate diff fixture "switch-case-diff.patch"
    When the scope-gate heuristic scores the diff
    Then the suspicion score is at least 3
    And a score reason matches /switch-case|case/

  @feature6
  Scenario: VSGF001_65 A non-guard enum addition scores in the borderline band
    Given a scope-gate diff fixture "non-guard-enum-diff.patch"
    When the scope-gate heuristic scores the diff
    Then the suspicion score is between 2 and 4

  @feature6
  Scenario: VSGF001_66 A dampened markdown file subtracts two from the score
    Given a scope-gate diff fixture "stocktaking-diff.patch"
    When the diff is scored plain and again dampening files "README.md"
    Then the dampened score is the plain score minus 2

  @feature6
  Scenario: VSGF001_67 A dampened tests file subtracts one from the score
    Given a scope-gate diff fixture "stocktaking-diff.patch"
    When the diff is scored plain and again dampening files "tests/foo.test.ts"
    Then the dampened score is the plain score minus 1

  @feature6
  Scenario: VSGF001_68 parseFilesFromDiff lists every file path in order
    Then parseFilesFromDiff of fixture "docs-only-diff.patch" yields paths "README.md|docs/CHANGES.md"

  @feature6
  Scenario: VSGF001_69 Every score reason carries a signed weight
    Given a scope-gate diff fixture "stocktaking-diff.patch"
    When the scope-gate heuristic scores the diff
    Then every score reason starts with a signed weight

  @feature4
  Scenario: VSGF001_70 isDocsOrTestsOnly is true for a docs-or-tests-only file list
    Then isDocsOrTestsOnly of "README.md|docs/CHANGES.md" is true
    And isDocsOrTestsOnly of "tests/foo.test.ts|tests/bar.test.ts" is true
    And isDocsOrTestsOnly of "docs/a.rst" is true

  @feature4
  Scenario: VSGF001_71 isDocsOrTestsOnly is false when any code file is present
    Then isDocsOrTestsOnly of "README.md|src/index.ts" is false
    And isDocsOrTestsOnly of "src/a.ts" is false

  @feature4
  Scenario: VSGF001_72 isDocsOrTestsOnly is false for empty input
    Then isDocsOrTestsOnly of "" is false
    And isDocsOrTestsOnly of "   " is false

  @feature4
  Scenario: VSGF001_73 A docs-only diff scores zero
    Given a scope-gate diff fixture "docs-only-diff.patch"
    When the scope-gate heuristic scores the diff
    Then the suspicion score is exactly 0

  @feature2
  Scenario: VSGF001_74 writeMarker creates a JSON file under .claude/.scope-verified/
    Given a fresh temporary directory as the marker store cwd
    When writeMarker is called with a valid marker
    Then a JSON file exists under ".claude/.scope-verified/" in that cwd

  @feature2
  Scenario: VSGF001_75 readFreshMarker returns null on session_id mismatch
    Given a fresh temporary directory as the marker store cwd
    And a marker is written for session "sess-A" with a known diff sha
    When readFreshMarker is called with session "sess-B" and the same diff sha
    Then readFreshMarker returns null

  @feature2
  Scenario: VSGF001_76 readFreshMarker returns null on corrupt JSON
    Given a fresh temporary directory as the marker store cwd
    And a corrupt JSON marker file exists for session "sess-1" with a known diff sha
    When readFreshMarker is called with session "sess-1" and that diff sha
    Then readFreshMarker returns null

  @feature2
  Scenario: VSGF001_77 runGC removes markers older than 24 hours
    Given a fresh temporary directory as the marker store cwd
    And a marker is written and then artificially aged beyond GC_STALE_MS
    When runGC is called on that cwd
    Then no JSON files remain under ".claude/.scope-verified/"

  @feature2
  Scenario: VSGF001_78 runGC preserves fresh markers
    Given a fresh temporary directory as the marker store cwd
    And a fresh marker is written for session "sess-fresh"
    When runGC is called on that cwd
    Then exactly 1 JSON file remains under ".claude/.scope-verified/"

  @feature2
  Scenario: VSGF001_79 markerDir resolves to a path inside cwd
    Given a fresh temporary directory as the marker store cwd
    When markerDir is called on that cwd
    Then the result starts with the resolved cwd path

  @feature2
  Scenario: VSGF001_80 writeMarker strips path separators from session_id in filename
    Given a fresh temporary directory as the marker store cwd
    When writeMarker is called with session_id "../../etc/passwd" and a known diff sha
    Then no file created under ".claude/.scope-verified/" contains ".." or "/"

  @feature3
  Scenario: VSGF001_81 appendEscapeLog appends multiple entries as valid JSONL
    Given a fresh temporary directory as the marker store cwd
    When appendEscapeLog is called twice with reasons "r1" and "r2"
    Then the escape log file contains exactly 2 valid JSONL lines
    And the first line has reason "r1" and the second has reason "r2"
