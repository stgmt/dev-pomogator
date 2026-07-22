# Spec-Conformance Audit — 2026-07-22

**Auditor:** strict spec-conformance auditor (delegated)
**Method:** drove the repo's CANONICAL engine directly — `buildGraphFromCwd` +
`checkConformance` (`tools/spec-graph/conformance.ts`), the exact code path the
MCP `conformance_check` door wraps. (The MCP door was permission-denied this
session; CLI fallback used. No bypass of the conformance logic itself.)
**Scope:** entire `.specs/` corpus, branch `feat/spec-generator-v4-fr62-64`.

## Corpus census

| Metric | Value |
|--------|-------|
| Specs | 60 |
| Graph nodes | 5,640 |
| — Scenario | 2,541 |
| — AC | 789 |
| — FR | 717 |
| — File | 606 |
| — Task | 556 |
| — Story / Decision / NFR | 195 / 178 / 58 |
| Graph edges | 3,550 |

## Verdict: 🔴 NOT CONFORMANT (traceability), 🟢 structurally sound

- **Structural (severity=error): 0** — no `DUPLICATE_DEFINITION` / bare-id
  collisions, graph builds cleanly. The FR-36 disease class is absent.
- **Conformance drift: 2,760 findings** (1,883 warning / 877 info). The corpus
  is **not certifiable as done/healthy**: the core traceability invariants
  (every FR has an AC; every task is tested and tied to a requirement) are
  broken for **84 atoms**, and a third of all scenarios are untraceable.

## Findings by code

| Code | Count | Severity | Meaning |
|------|------:|----------|---------|
| UNTAGGED_SCENARIO | 847 | warning | scenario with no `@FR/@AC` tag — untraceable (33% of all scenarios) |
| FR_NO_STORY | 634 | warning | FR with no linked user story |
| FR_NO_DESIGN | 626 | warning | FR with no design decision |
| TASK_STATUS_UNVERIFIED | 274 | warning | task marked done without verification evidence |
| TASK_NO_OWN_SCENARIO | 108 | warning | task lacking its own BDD scenario |
| TOOTHLESS_STORY | 101 | warning | story with no enforceable content |
| TOOTHLESS_DECISION | 81 | warning | decision with no rationale/trade-off |
| **TASK_UNTESTED** | **34** | warning | **task with no test — done-claim unverified** |
| **TASK_NO_REQUIREMENT** | **28** | warning | **task traceable to no requirement** |
| **UNCOVERED_FR** | **22** | warning | **requirement no AC covers — unverifiable** |
| ORPHAN_TASK | 2 | warning | task wired to nothing |
| TAG_BULK_SUSPECT | 2 | warning | suspicious bulk tagging |
| TASK_STARTED_WITHOUT_CHAIN | 1 | warning | task started before its dependency chain |

## Priority (done-blocking) gaps — concrete evidence

### 1. `session-pilot` — every task untested (34/34) 🔴 worst offender
All 34 `TASK_UNTESTED` findings in the entire corpus belong to one spec:
`session-pilot` (`TASKS.md` t01–t48). No task carries a linked test/scenario —
its done-status is entirely unverified in the graph.

### 2. `UNCOVERED_FR` — 22 requirements with no acceptance criterion, 10 specs
| Spec | Count | FRs |
|------|------:|-----|
| spec-generator-v3 | 6 | FR-5,6,7,8,15,16 |
| spec-workflow-vmodel | 3 | FR-006,007,021 |
| suggest-rules-insights | 2 | FR-5,6 |
| stale-build-guard | 2 | FR-2,6 |
| prompt-suggest | 2 | FR-4,6 |
| fix-bg-output-loss | 2 | FR-6,9 |
| bg-task-guard | 2 | FR-6,16 |
| install-diagnostics | 1 | FR-12 |
| cursor-dead-code-cleanup | 1 | FR-5 |
| answer-simple | 1 | FR-12 |

### 3. `TASK_NO_REQUIREMENT` — 28 tasks tied to no FR, 9 specs
dev-pomogator-canonical-plugin (8), strong-tests (7), native-statusline (4),
worktree-setup (2), spec-variant-matrix (2), skill-listing-budget (2),
spec-reality-check (1), skills-rules-optimizer (1), architecture-decision-builder (1).

### 4. Orphans / broken chain
- `ORPHAN_TASK` ×2 — `claim-evidence-gate`
- `TASK_STARTED_WITHOUT_CHAIN` ×1 — `spec-generator-v4`

## Auditor's call

Per `no-structural-valid` (FR-37d): a clean structure is **not** health. This
corpus is structurally clean but carries a live traceability deficit. It must
not be reported as conformant/done until, at minimum:
1. `session-pilot` gains test linkage for its 34 tasks (or they are honestly
   re-marked not-done);
2. the 22 `UNCOVERED_FR`s each get a covering AC;
3. the 28 `TASK_NO_REQUIREMENT`s are re-linked to an FR or struck.

The 847 `UNTAGGED_SCENARIO` + 274 `TASK_STATUS_UNVERIFIED` are the systemic
tail — same disease class (claims outrunning traceable evidence), lower
individual priority.

_Engine note: `pomogator-doctor` FILE_CHANGES.md uses a glob path — its
`implements` edges are skipped by the builder (informational, not a finding)._
