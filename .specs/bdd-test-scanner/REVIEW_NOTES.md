# Spec Review: bdd-test-scanner

**Phase:** Requirements/Finalization (authored, verdict GREEN, marked backlog)
**Scope:** external-claim/reality-drift, existing-asset/name-collision, @featureN consistency, BDD scenario quality, conformance warnings

## Summary

| Severity | Count | Verdict |
|----------|-------|---------|
| P0 (blockers) | 0 | ✅ clear |
| P1 (fix before stop) | 1 | ✅ fixed in this review |
| P2 (recommendations) | 3 | ℹ️ logged |
| P3 (informational) | 0 | — |

**Overall verdict:** READY_WITH_WARNINGS

## P1 Findings (fixed in this review)

| # | Category | Location | Issue | Fix |
|---|----------|----------|-------|-----|
| P1-1 | @feature tag convention | bdd-test-scanner.feature, REQUIREMENTS.md, TASKS.md | Scenarios were tagged `@FR-1..@FR-6` while all 30+ corpus specs and the extension-test-quality / bdd-only rules use `@featureN`. Conformance accepted `@FR-N`, but it deviated from the established convention. | Switched all tags to `@feature1..@feature6` (maps to FR-N) in the feature, requirements matrix, and task refs; re-ran spec-verdict → GREEN, traceability 0 gaps, all 7 scenarios still tracked. |

## P2 Findings (recommendations, non-blocking)

| # | Category | Location | Note |
|---|----------|----------|------|
| P2-1 | BDD fake-positive risk | bdd-test-scanner.feature @feature2 (BDDSCAN002) | The parity scenario asserts the guard and the scanner AGREE on a path's classification. Agreement can hold even if they are two divergent copies that happen to coincide — it does not prove the single-source claim (FR-2). When implementing, add a structural assertion (shared-module import identity, or a check that the guard contains no inline patterns) so FR-2's "one source of truth" is truly enforced, not just behaviourally coincident. |
| P2-2 | Upstream traceability (conformance warnings) | FR.md | spec-verdict reports 19 non-blocking conformance warnings: FR_NO_STORY×6 (no FR traces to a user story), FR_NO_DESIGN×6, TOOTHLESS_DECISION×3, TOOTHLESS_STORY×4. Recommend adding `**User Story:** US-N` lines to each FR (FR-1/2/5→US-1, FR-3→US-2, FR-4→US-3, FR-6→US-4) to close FR_NO_STORY and strengthen story→requirement traceability. Does not gate the verdict. |
| P2-3 | Coverage honesty | coverage buckets | 7 scenarios `not_run` — expected: the spec is authored, the hook code + step-defs are not implemented yet. Resolves when the BDD scenarios run in Docker after implementation (Phase 3 task `bdd-stepdefs`). Not a defect. |

## Reality-grounding (PASS)

All cited assets verified against the repo:
- Detector reuse: `tools/bdd-only-test-guard/guard.ts` — `bddOnlyDecision` exported (line 54); `NON_BDD_TEST_PATTERNS` / `ALLOWED_PATTERNS` are private consts (lines 33, 43), so FR-2's "extract to a shared module" is accurate (they are not currently exported).
- SessionStart hook contract: `.claude/skills/pomogator-doctor/scripts/doctor-hook.ts` — `{continue, suppressOutput?, additionalContext?}`.
- Doctor check shape: `engine/types.ts` CheckDefinition; register in `engine/checks/index.ts`.
- Backlog append: `tools/spec-backlog/writer.ts` `appendEntry`.
- GitHub issue path: `gh` 2.95.0, `gh issue create` flags verified live.
- Shared-module home: `tools/_shared/` exists.
- Suite wiring: `cucumber.json` lists features in `paths[]` — the new feature must be added there (Phase 3 task `bdd-stepdefs`).

## Name collision (NONE)

`bdd-test-scanner` (scans EXISTING non-BDD tests, non-blocking) vs `bdd-only-test-guard` (DENIES creating NEW ones) are complementary, in distinct directories with distinct names. The shared detector at `tools/_shared/non-bdd-detector.ts` introduces no collision.
