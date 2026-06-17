# v4 backlog triage (W0) — spec-generator-v4 open tasks classified

**Date:** 2026-06-17 · **Source:** `spec-status.ts -Format task-table` (all 174 tasks) + FR-49d stale-marker scan + per-task `get_trace` + code reads this session.

**Headline:** the corpus census says ~199 open, but spec-generator-v4 has only **15 genuinely-open** tasks (the rest are DONE). Of those 15, **1 is an umbrella that must stay open**, leaving **14** to resolve — and they are NOT a flat "implement 14 features": they split into 4 categories with very different work.

## Closed this session (7) — for the record
verify-phase6-green, install-cross-spec-skills (6 ref docs written), impl-semantic-subagent, impl-yaml-writer, impl-sarif-output, p16-crlf-fill-template, impl-architectural-detection (FR-17/18 design+story legs back-filled). Spec held GREEN (182/182, 0 traceability gaps) throughout.

## The 15 open, classified

| Task | Title | Status | Category | Assessment |
|---|---|---|---|---|
| T12-108 `ws-f-remaining` | WS-F: remaining feature work | IN_PROGRESS | **umbrella** | DO NOT CLOSE — its mapped scenarios pass but it tracks the open backlog; closing = false-green. |
| T0-05 `verify-phase0-red` | Verify Phase 0 — all scenarios RED at entry | WONT-VERIFY | **deliberately open (waived)** | CORRECTED (verified the block): NOT drift. The RED-at-entry precondition is post-hoc unverifiable; flipping it = soft fake-DONE (advisor-waived 2026-06-07, `_waived:` note in TASKS.md). DO NOT CLOSE — same as the umbrella. |
| T7-57 `impl-coverage-summary` | Coverage Summary Table | TODO | **divergence** | Spec wants a `summary` block in the YAML report; code put it only in the stdout `renderSummaryTable` (minimal emitter by-design). Implement YAML summary OR ratify stdout + update Done-When (W3). |
| T7-61 `integration-test-fixture` | cross-spec fixture corpus | TODO | **divergence/partial** | Built simpler than the 3-spec plan (real 2-spec corpus under `corpus/`, captured against the real engine); plan's codes (`nfr-conflict`/`mcp-tool-drift`) don't exist in the engine. Extend to e2e needs OR ratify (W3/W4). |
| T7-62 `e2e-test-reconcile-roundtrip` | E2E reconcile roundtrip | TODO | **unbuilt (low-pri)** | Genuinely absent (`tests/e2e/cross-spec-reconcile.test.ts`). Build against the REAL engine codes, not mocks (W4). |
| T16-122 | P16-2 evals for 3 form skills | IN_PROGRESS | **needs verify** | Likely partial-built; verify against `evals/` of the form skills (W1/W2). |
| T16-123 | P16-3 resolve 7 orphan templates | TODO | **needs verify** | Verify the 7 templates' orphan status vs current `templates/` (W1). |
| T16-124 | P16-4 feature.template into anchor-integrity test | TODO | **needs verify** | Small; verify the anchor-integrity test covers feature.template (W1). |
| T16-125 | P16-5 document audit split-responsibility | IN_PROGRESS | **needs verify** | Doc task; verify the doc exists (W1). |
| T16-127 | P16-7 .progress.json single-writer contract | TODO | **needs verify** | Verify the contract/guard exists in code (W1/W2). |
| T16-128 | P16-8 STOP-confirm discipline | TODO | **needs verify** | Verify vs the phase-lifecycle STOP gate (W1/W2). |
| T21-153 | P21-3 сценарная гниль (scenario rot) | TODO | **likely genuine** | Ongoing-quality task; probably real remaining work (W2+). |
| T21-154 | P21-4 owner burn-down INFO-debt | TODO | **likely genuine** | Counter-debt burndown; real ongoing work (W5). |
| T21-163 | P22-3 FR-47 remainder | TODO | **likely genuine** | Explicit remainder of FR-47 retrofit; real work (W2+). |

## Category roll-up (the real shape of "14 open")
- **Deliberately-open (leave, NOT drift):** 2 — T12-108 (umbrella) + T0-05 (`verify-phase0-red`, WONT-VERIFY waived). Closing either = fake-DONE.
- **Drift (verify + close, cheap):** up to ~5 of the P16 cluster pending per-task verify (W1) — none confirmed drift yet; T0-05 was wrongly assumed drift and corrected.
- **Divergence (scope-call):** 2 — T7-57, T7-61 (W3).
- **Unbuilt low-priority:** 1 — T7-62 (W4).
- **Genuine remaining work:** ~3 — T21-153/154/163 (+ any P16 that verify shows unbuilt) (W2/W5).

## W1 CONCLUSION (verified 2026-06-17) — drift is EXHAUSTED

Per-task verification (get_trace + code reads) overturns the "mostly drift" premise for the REMAINDER:
- **Drift = only the FR-17 cluster** (7 tasks, already closed this session). No more drift remains.
- **T0-05** = deliberately-open WONT-VERIFY waiver (NOT drift) — leave.
- **P16 cluster verified GENUINE, not drift:** `p16-feature-template-anchors` confirmed undone (nothing in `tools/anchor-integrity` references feature.template); `p16-form-skill-evals`/`p16-orphan-templates`/`p16-progress-single-writer`/`p16-stop-confirm-discipline` are real undone work; `p16-audit-split-doc` is done-but-gated (needs an own cucumber scenario for the FR-46 DONE-gate).
- **P21 cluster** (scenario-rot / INFO-debt burndown / FR-47 remainder) = genuine ongoing work.

**Honest net:** of 15 open — 2 leave-open-by-design (umbrella + T0-05 waiver), ~13 are GENUINE remaining work (2 divergences, 1 unbuilt e2e, ~6 P16, ~3 P21). There is NO cheap drift left to close. The remaining work is real build/author/resolve, NOT status-flipping.

## Next (per the plan `v4-backlog-closeout.md`)
W1 (close-drift) DONE — drift exhausted. The remainder skips to W2 (back-fill legs where chain-gate blocks), W3 (decide the 2 divergences), W4 (build the low-pri e2e), W5 (corpus hygiene: 2 DENY, coverage gaps, STOPs). Each is genuine work, not a quick close.
