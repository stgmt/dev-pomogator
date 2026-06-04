# spec-generator-v4 — Global Work Plan (honest, evidence-grounded)

> Author note: every "verified" line below was produced by a real tool run this
> session (cucumber/computeCoverage/checkConformance/MCP get_trace/grep), not by
> reading status docs. Phase headers in TASKS.md say "(Green)" but carry 63 TODO
> tasks → **status drift**; counts here are from `grep Status:`, not the headers.

## 0. Honest current state (verified)

| Fact | Evidence (this session) |
|---|---|
| Anchor-integrity (FR-34) shipped + corpus swept 1744→25 | tests green; `fix.mjs --all` |
| MCP `get_trace(FR-34)` works live → `verified_status: DONE` + AC-34.1..5 | live stdio JSON-RPC |
| MCP installs for users (self-contained bundle, no node_modules) | bundle served `get_trace` with node_modules hidden |
| Honesty gate caps `DONE`+red/undefined/not-run scenario → `IN_PROGRESS` | computeCoverage + cucumber @feature32 |
| "No test at FR/@feature level" → `NOT_COVERED` (32 firing now) | conformance + live hook |
| Tasks: **26 DONE / 63 TODO** across 12 phases | `grep Status:` |

## 1. THE HONESTY HOLES (priority — user's core concern, all VERIFIED this session)

- **H-1 fake-positive test → DONE.** Gate reads only PASS/FAIL, never test *quality*.
  A passing-but-worthless test (mocked, trivial assert) marks a task `DONE` legitimately.
  *Verified:* `computeCoverage(done + PASSED)` → `DONE` with no quality check.
- **H-2 the defense is NOT wired.** `strong-tests` + `spec-status` audit test-body quality
  (STRONG/WEAK/FAKE-POSITIVE-RISK) but are **advisory** — *verified* NOT in
  `.claude-plugin/hooks.json` and **NOT in the orchestrator feature-map** (routing:
  scaffold→conformance→coverage→trace→reconcile→resolve→backlog→honesty-gate; no
  test-quality stage). A lazy/dishonest agent simply never runs them.
- **H-3 zero-linkage DONE is silent.** `checkConformance(done task, no scenario)` → `[]`
  (no finding). Mitigated in real specs (task→FR→@feature→NOT_COVERED), but a task with
  no FR linkage at all slips.

## 2. Workstreams (global)

### WS-A — Honesty hardening (close H-1/H-2/H-3) — HIGHEST PRIORITY
- Add a **test-quality stage** to the orchestrator feature-map (`scripts/feature-map.ts`)
  between coverage and honesty-gate, routing to `strong-tests` + `spec-status`.
- **Enforce** it: a Stop / pre-DONE hook that blocks marking a task `DONE` when its
  linked test is WEAK / FAKE-POSITIVE-RISK or absent (not advisory).
- Emit a conformance finding for H-3 (done task with zero scenario linkage).
- **Adversarial proof:** plant a deliberately fake-positive green test → system must
  refuse `DONE`. Plant a no-test done task → must flag.

### WS-B — Status reconciliation (kill the drift)
- Run honest status across all 63 TODO: which are really done-but-unchecked vs really
  pending. Use `spec-status` (independent sub-agent) + `npm run check:status-drift`.
- Fix `(Green)` headers / checkboxes to match reality. Output: true done/todo count.

### WS-C — Orchestrator pipeline e2e (does the agent actually RUN + use tools?)
- Create a real throwaway spec via `create-spec`; run the orchestrator end-to-end.
- Prove the agent **invokes** the MCP tools + worker skills (call trace in logs), not
  imitates. Inspect every artifact at each stage.
- Phase 11 (orchestrator) has 4 TODO + Phase 10 (FR-32) 4 TODO — close against this run.

### WS-D — Observability (full + don't-lose-it skill)
- Consolidate the scattered signals (`.claude/logs/*.jsonl`, `watcher.log`,
  `.last-test-run.ndjson`, conformance findings, SELF_IMPROVE ledger) into one
  "where did the agent stumble" view.
- Build skill **`observability-review`** so the method is reusable, not re-derived.

### WS-E — MCP distribution proof (gold-standard install)
- `verify-plugin-install`: real `claude plugin install` in clean Docker → confirm the
  bundled MCP actually boots for a user (not just "bundle runs deps-absent").
- Add a freshness guard beyond the existing one if needed (bundle ↔ source).

### WS-F — Remaining feature work (the real TODOs)
- **Phase 7 Cross-spec reconciliation — 24 TODO (biggest)**, Phase 2 MCP 7, Phase 9
  honesty 6, Phase 6 arch 6, Phase 4 SQLite/Codespaces 5, Phase 3 LLM 2, Phase 5 migr 3.
- Triage each against WS-B reality first (many may be drift, not real work).

## 3. Sequencing

1. **WS-A** (honesty holes) — the system's whole premise is "no fake DONE"; fix first.
2. **WS-B** (reconcile 63 TODO) — so WS-F is grounded, not guessing.
3. **WS-C** (orchestrator e2e) — proves the pipeline + closes Phase 10/11.
4. **WS-D** (observability + skill).
5. **WS-E** (install e2e).
6. **WS-F** (real remaining work, Phase 7 first), triaged by WS-B.

## 4. Discipline (carried from this session's incidents)
- Every "done" needs a live tool run as evidence (claim-evidence-gate).
- Verify regressions on a **clean worktree**, not the dirty tree (see memory).
- `git add -u` for sweeps; never `git add .specs/` (swept junk once already).
- No push until the user says so.
