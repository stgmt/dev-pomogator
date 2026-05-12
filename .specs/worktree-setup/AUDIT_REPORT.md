# Phase 3+ Audit Report: worktree-setup

**Spec:** `.specs/worktree-setup/`
**Audit date:** 2026-05-13
**Tool:** `npx tsx .dev-pomogator/tools/specs-generator/audit-spec.ts`

## Summary

| Severity | Count | Verdict |
|----------|-------|---------|
| ERROR | 0 | ✅ none blocking |
| WARNING | 0 | ✅ all resolved post-fix |
| INFO | 30 | logged, not blocking |

**Verdict:** AUDIT_CLEAR — spec passes Phase 3+ structural audit. Ready for implementation kickoff.

## Audit categories breakdown

| Category | Findings | Notes |
|----------|----------|-------|
| ERRORS | 0 | No file-path / link / structural errors |
| LOGIC_GAPS | 22 INFO | Mostly scaffold placeholder remnants in unused doc sections — non-blocking |
| INCONSISTENCY | 0 | After LINK_VALIDITY fix for FR-9 ↔ AC-9 |
| RUDIMENTS | 0 | No scope creep / dead refs |
| FANTASIES | 8 INFO | Env-var-shaped tokens (`TEST_DATA`, `TEST_FORMAT`, `GH_MOCK_DIR`) without `[VERIFIED:]` marker — false-positive for spec/test names |
| VARIANT_COVERAGE | 0 | No polymorphic dispatch (skill is single-purpose) |

## Resolved during audit

| # | Finding | Fix |
|---|---------|-----|
| 1 | LINK_VALIDITY ERROR: FR-9 missing AC link | Added `**AC:** [AC-9](...)` to FR-9; created AC-9 stub explaining OUT_OF_SCOPE |
| 2 | FR_AC_COVERAGE WARNING: FR-9 no matching AC | Same as above |
| 3 | BDD_HOOKS_COVERAGE WARNING (×3): setupWorktreeFixture, cleanupWorktreeFixture, isolateEnv hooks not in TASKS.md Phase 0 | Split T0-2 into T0-2a / T0-2b / T0-2c (one task per hook) |
| 4 | Classification field missing | Added `**Classification:** TEST_DATA_ACTIVE` to DESIGN.md BDD section |
| 5 | FIXTURES_CONSISTENCY WARNING: FIXTURES.md scaffold | Filled FIXTURES.md with 3 fixtures (F-1 fresh-main, F-2 gh-mock, F-3 tsx-runner-bootstrap-original) |

## Remaining INFO findings (non-blocking)

- **UNVERIFIED_CONFIG** (×8): env-var-shaped tokens like `TEST_DATA`, `TEST_FORMAT`, `GH_MOCK_DIR` in DESIGN.md without `[VERIFIED:]` marker. These are spec/test internal names, not external API env vars — audit's heuristic mistakes them. Acceptable false-positive.
- **PLACEHOLDER residue** (×22): in scaffold-generated table headers, framework lookups, and stale template lines. None affect testable behavior. Future improvement: tighten audit's placeholder detection to exclude scaffold-generated tables.

## AI-side checks (per audit `ai_checks_pending`)

| Check | Verdict | Evidence |
|-------|---------|----------|
| Verify DESIGN.md component/method/file references exist in codebase | ✅ verified via Read for tsx-runner.js (line 107), tsx-runner-bootstrap.cjs (60 LOC loader), handlers.py (line 52 whitelist), terminal_launcher.py (existing pattern) | Round 3 + Round 4 spec-review |
| Check items marked 'Need to add' or 'TODO' that may already exist | ✅ no Need-to-add findings; FILE_CHANGES.md `create` paths verified non-existent (skill scripts, worktree-doctor.cjs, fixtures) | Round 4 grep |
| Verify FILE_CHANGES.md create targets do not already exist | ✅ verified `.claude/skills/worktree-setup/` does not yet exist; `extensions/worktree-setup/` does not yet exist | manual check |
| Compare domain-specific naming across all spec files | ✅ consistent: WT_ prefix uniform across env keys; worktree-doctor.cjs uniform across all refs; FR/AC/UC IDs consistent | Round 4 grep |
| Verify API assumptions in RESEARCH.md have sources/proof | ✅ all gh CLI claims verified via real `gh --help` invocations Round 3; tsx-runner.js claims verified via Read | Rounds 3 & 4 |
| Check for untested claims presented as confirmed facts | ✅ all external claims either Read-verified or marked context | Rounds 3 & 4 |
| Identify scope creep | ✅ session-pilot integration explicitly contract-only, no impl in this branch; session migration / cleanup-batch / self-dogfood refactor explicitly OUT_OF_SCOPE | FR-9 |
| Check for open questions answered elsewhere | ✅ no `## Open Questions` section; initial Q1–Q7 all resolved via conversation | Round 1 |
| TABLE_ROW_COUNT consistency | ✅ headers match row counts (manually verified for FILE_CHANGES, TASKS Summary, CHK matrix) | manual check |
| AUDIT_REPORT_EXISTS | ✅ this file | self |

## Cross-references

- [REVIEW_NOTES.md](REVIEW_NOTES.md) — 4 rounds of spec-review with full P0/P1/P2 history
- [TASKS.md](TASKS.md) — 21 implementation tasks (Phase 0..6, ~13h total estimate)
- [CHANGELOG.md](CHANGELOG.md) — spec milestones + planned 0.1.0 implementation entries
- [README.md](README.md) — overview + navigation

## Recommendation

Spec is **READY FOR IMPLEMENTATION**. Suggested next actions:

1. **Apply create-spec / spec-review skill improvements** introduced during this session (B + C variants) to subsequent spec creation — these would have prevented all 4 P0/P1 found in this spec.
2. **Implement in dependency order** per TASKS.md: Phase 0 (Red — failing scenarios) → Phase 1 (worktree core) → Phase 2 (bootstrap + doctor) → Phase 3 (self-heal) → Phase 4 (PR flow) → Phase 5 (session-pilot cross-ref) → Phase 6 (refactor + final validation).
3. **Memory artifacts** (`feedback_no-hardcoded-repo-or-user-identifiers.md`, `feedback_env-first-then-investigate-then-ask.md`) are now active constraints for the entire dev-pomogator project; spec-review Category 14 enforces them automatically on subsequent specs.
