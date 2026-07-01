# Spec Review: bdd-test-scanner

**Phase:** Requirements/Finalization (authored, verdict GREEN, marked backlog)
**Scope:** external-claim/reality-drift, existing-asset/name-collision, @featureN consistency, BDD scenario quality, conformance warnings

## Summary

| Severity | Count | Verdict |
|----------|-------|---------|
| P0 (blockers) | 0 | ✅ clear |
| P1 (fix before stop) | 1 | ✅ fixed |
| P2 (recommendations) | 3 | ✅ 1 fixed, 2 logged |
| P3 (informational) | 0 | — |

**Overall verdict:** READY_WITH_WARNINGS (spec-verdict GREEN; 5 non-gating conformance warnings remain by design)

## P1 Findings (fixed)

| # | Category | Location | Issue | Fix |
|---|----------|----------|-------|-----|
| P1-1 | @feature tag convention | feature, REQUIREMENTS, TASKS | Scenarios tagged `@FR-1..@FR-6` while all 30+ corpus specs + extension-test-quality / bdd-only rules use `@featureN`. | Switched all tags to `@feature1..@feature6`; re-verified GREEN, traceability 0 gaps, all 7 scenarios tracked. |

## P2 Findings

| # | Category | Location | Status / Note |
|---|----------|----------|---------------|
| P2-1 | BDD fake-positive risk | feature @feature2 (BDDSCAN002) | LOGGED. The parity scenario asserts the guard and scanner AGREE on a path — agreement can hold even with two divergent copies that coincide; it does not prove the single-source claim (FR-2). At implementation, add a structural assertion (shared-module import identity, or a check that guard.ts holds no inline patterns) so FR-2 is enforced, not just behaviourally coincident. |
| P2-2 | Conformance traceability warnings | USER_STORIES, DESIGN | PARTIALLY FIXED. Root cause (conformance.ts:219-251): the story/design covers edge is built ONLY from a `**Требование:** [FR-N]` line INSIDE each `### User Story` / `### Decision` block, and only the FIRST FR per block is credited. Added `**Требование:**` lines to all 4 stories + 3 decisions → warnings dropped 19→5 (all TOOTHLESS_STORY/DECISION cleared; FR_NO_STORY 6→2, FR_NO_DESIGN 6→3). Residual 5: the spec intentionally has 4 broad stories / 3 decisions for 6 FRs; splitting them 1:1 with FRs only to satisfy the counter would be artificial gaming and harm readability. Left as non-gating warnings. |
| P2-3 | Coverage honesty | coverage buckets | LOGGED. 7 scenarios `not_run` — expected: spec authored, hook code + step-defs not implemented yet. Resolves when scenarios run in Docker (Phase 3 task `bdd-stepdefs`). Not a defect. |

## Reality-grounding (PASS)

All cited assets verified against the repo:
- Detector reuse: `tools/bdd-only-test-guard/guard.ts` — `bddOnlyDecision` exported (line 54); `NON_BDD_TEST_PATTERNS` / `ALLOWED_PATTERNS` are private consts (lines 33, 43) → FR-2's "extract to a shared module" is accurate (not currently exported).
- SessionStart hook contract: `doctor-hook.ts` — `{continue, suppressOutput?, additionalContext?}`.
- Doctor check shape: `engine/types.ts` CheckDefinition; register in `engine/checks/index.ts`.
- Backlog append: `tools/spec-backlog/writer.ts` `appendEntry`.
- GitHub issue path: `gh` 2.95.0, `gh issue create` flags verified live.
- Shared-module home: `tools/_shared/` exists.
- Suite wiring: `cucumber.json` lists features in `paths[]` — the new feature must be added there (Phase 3 task `bdd-stepdefs`).

## Name collision (NONE)

`bdd-test-scanner` (scans EXISTING non-BDD tests, non-blocking) vs `bdd-only-test-guard` (DENIES creating NEW ones) are complementary, distinct directories + names. The shared detector at `tools/_shared/non-bdd-detector.ts` introduces no collision.
