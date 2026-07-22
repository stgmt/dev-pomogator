# Spec-Conformance Audit — 2026-07-22, Pass 2 (verification + FR-62–64)

**Auditor:** strict spec-conformance auditor (pass 2)
**Method:** canonical engine driven directly (`buildGraphFromCwd` + `checkConformance`,
`tools/spec-graph/`), three programs in `audit-out/` (verify-2026-07-22.ts,
verify-fr62-64-scenarios.ts, verify-slug-collisions.ts); full JSON →
`audit-out/verify-2026-07-22.json`. MCP door was permission-denied this session
(7 denied calls — evidence in-transcript), same CLI-fallback path the pass-1
report used. No conformance logic bypassed.
**Scope:** (A) verify pass-1 report `spec-conformance-audit-2026-07-22.md`;
(B) close the gap pass-1 missed — FR-62/63/64 of `spec-generator-v4`, the FRs
the current branch `feat/spec-generator-v4-fr62-64` is named after.

## A. Pass-1 report verification

| Pass-1 claim | Verdict | Evidence (current engine, current tree) |
|---|---|---|
| 0 error-severity findings | ✅ CONFIRMED | `errorFindings: 0` |
| All 34 TASK_UNTESTED = session-pilot | ✅ CONFIRMED | TASK_UNTESTED by spec = `{session-pilot: 34}` — nothing else |
| UNCOVERED_FR: 22 FRs / 10 specs (table) | ✅ CONFIRMED | re-derived table byte-identical (spec-generator-v3 ×6, spec-workflow-vmodel ×3, suggest-rules-insights ×2, stale-build-guard ×2, prompt-suggest ×2, fix-bg-output-loss ×2, bg-task-guard ×2, install-diagnostics ×1, cursor-dead-code-cleanup ×1, answer-simple ×1) |
| Census: 5,640 nodes, by-type counts | ✅ CONFIRMED | AC 789 / FR 717 / Scenario 2541 / Task 556 / Story 195 / Decision 178 / NFR 58 / File 606 — all identical |
| Census: 3,550 edges | ❌ NOT REPRODUCIBLE | current engine: **7,334** edges |
| TASK_STATUS_UNVERIFIED 274 / TASK_NO_OWN_SCENARIO 108 | ⚠️ STALE (improved) | now **70 / 35** |

**Drift is explained, not contradictory.** 35 `.test-results.ndjson` files are
modified-but-uncommitted in the working tree. The ndjson producer emits
`last-result`/`runtime-trace` edges — +3,784 edges (3,550→7,334) — which
attached fresh results to tasks, resolving exactly 204 TASK_STATUS_UNVERIFIED
+ 73 TASK_NO_OWN_SCENARIO = the −277 total delta (2,760→2,483). All other codes
unchanged. **Caveat:** the improvement lives only in the uncommitted tree; a
checkout/discard restores the pass-1 deficit.

## B. FR-62/63/64 — spec-complete, implementation-unproven

All three FRs exist (`spec-generator-v4` spans FR-1..FR-64, contiguous, 64 ids;
max FR = 64). Zero conformance findings against any of them.

| FR | ACs | Stories | Decision | Scenarios | Scenario result | Tasks |
|---|---|---|---|---|---|---|
| FR-62 | 62.1–62.3 | Story-39 | ✓ | specgen004-553 (stdin-root), 554 | **never run** (result=null, no trace edge) | P35-1..3 **todo** |
| FR-63 | 63.1–63.3 | Story-40, 42 | ✓ | 555–557 | **never run** | P36-1..3 **todo** |
| FR-64 | 64.1–64.4 | Story-41, 43 | ✓ | 558–561 | **never run** | P37-1..3 **todo** |

- Branch `feat/spec-generator-v4-fr62-64` has **0 commits** beyond `origin/main`.
- **No `implements` edges** on any of FR-62/63/64 — no traceable code linkage.
- This is an *honest* not-started state (RED-first plan: P35-1 «RED cross-host
  root BDD» etc., all todo), **not a fake-green** — never-run is reported as null.
- Within `spec-generator-v4` overall: FR_NO_STORY ×25, FR_NO_DESIGN ×10,
  TASK_STATUS_UNVERIFIED ×53, TASK_STARTED_WITHOUT_CHAIN ×1.

## C. NEW finding pass-1 missed — duplicate slug-id collisions (FR-36 class)

16 duplicate bare-slug ids (same spec, same slug number, >1 scenario node),
undetected by the Phase-1 conformance ruleset (which reports 0 errors):

- **`specgen004-553` ×2 — crosses requirement lines**: FR-62's tested-by edge
  points at `553-inherited-closed-and-noninteractive-stdin-root-handoff`
  (never run), while `553-mutation-validation-gates-only-debt` is bound to
  FR-40 and carries `lastResult=PASSED`. Per the cucumber reconciliation rule
  (reconcile by bare slug id `specgen004-NN`), FR-40's PASSED can be misread as
  evidence for FR-62 — a live false-green risk on the reconciliation path.
- spec-generator-v4 also: 471, 472, 480, 507, 531, 532 (×2 each).
- Elsewhere: `plan-pomogator-prompt-isolation` plugin007-43 **×5**,
  `plan-pomogator-plain-language` plugin007-44 **×6**,
  `architecture-decision-builder` arch001-02/arch002-02/arch003-01/arch005-01/02/03/06 (×2 each).

## Verdict: 🔴 NOT CONFORMANT (unchanged from pass-1)

1. Pass-1's material claims are **verified true** on the current tree; its two
   stale numbers are explained by uncommitted test-result updates (commit them
   or lose the improvement).
2. **FR-62/63/64: spec layer complete and clean; zero implementation evidence**
   (9/9 scenarios never run, 9/9 tasks todo, 0 branch commits, 0 implements
   edges). The branch name is a plan, not a delivery — legitimately so per its
   RED-first TASKS, but no conformance credit can be claimed yet.
3. **New blocking-class gap: 16 duplicate slug-id collisions**, worst being
   `specgen004-553` straddling FR-40/FR-62 — the Phase-1 ruleset's clean bill
   (0 errors) does not cover this class (corpus-health's mandate); reconciliation
   by bare slug is unsound until de-duplicated.
4. Corpus tail unchanged: session-pilot 34/34 tasks untested, 22 UNCOVERED_FR,
   28 TASK_NO_REQUIREMENT, 847 UNTAGGED_SCENARIO.
