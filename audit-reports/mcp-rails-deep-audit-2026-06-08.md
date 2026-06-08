# MCP-rails deep audit (2026-06-08)

User ask: full manual test of ALL 19 MCP tools; find skills still doing MD-logic
instead of MCP orchestration (esp. the create-spec phase chain "research → … →
finalize"); honest answer on whether the full spec lifecycle (generate e2e / edit /
set statuses / close tasks / run tests / trace to a real test-run без наёба) is
actually covered. Prior (advisor): every "looks done" this session turned out
partially dead/fake — hunt for gaps, an all-green audit is suspicious.

## 1. All 19 MCP tools — value-tested against ground truth (not just ok:true)

Driven through the REAL bundle (`server.bundle.mjs`), values cross-checked against
`spec-verdict` / `ls .specs` / the fresh NDJSON:

| Tool | Result | Ground-truth check |
|---|---|---|
| get_node `FR-39` | ok, line 676 | matches FR.md:676 ✓ |
| get_trace `FR-39` | ok, scen=7, code_impl=3, **acs=0** | scen matches find_by_tags=7 ✓; **acs=0 SUSPECT — AC-39.1/2/3 exist** 🟡 |
| find_refs `FR-39` | ok, references present | ✓ |
| find_by_tags `@FR-39` | 7 scenarios | = the 7 @FR-39 scenarios ✓ |
| search `FR-39` | hits=1 | id/title substring (FR-39 node) — plausible ✓ |
| conformance_check | 1297 findings | corpus-wide (47 specs) — not scoped (by design) |
| find_orphans | 40 | corpus-wide |
| get_coverage_summary | specs=2 | "grouped by source directory" (.specs + tests/features?) — VERIFY 🟡 |
| get_coverage `{}` | scenarios:1535 passed:135 **not_run:1399** | corpus-wide → **MISLEADING per-spec** 🔴 FIXED |
| get_coverage `{spec}` | scenarios:164 passed:135 not_run:28 skipped:1 | = spec-verdict numbers ✓ (after fix) |
| get_spec_status `{spec}` | PARTIAL, last_run passed:135/skipped:1 | matches reality ✓ |
| validate_anchor `fr-39` | resolves=true | ✓ |
| list_specs | 47 | matches `ls -d .specs/*` ✓ |
| list_spec_docs `{spec}` | 26 docs | ✓ |
| read_spec_doc `FR.md` | 76761 bytes | ✓ |
| get_test_result `…_114` | PASSED | matches NDJSON ✓ |
| list_phase_tasks `Phase 17…` | 11 tasks | non-empty ✓ (count vs 9 expected — verify) |
| propose_spec_change (no-op) | **ok=false findings=0** | edge: no-op/identical change refusal unclear 🟡 |
| apply_spec_change | ok (live write-path test) | created+mutated throwaway through door ✓ |
| create_spec | ok (live write-path test) | scaffolded throwaway through door ✓ |

**Note:** propose/apply_spec_change REQUIRE a `reason` arg (zod) — an earlier smoke
that omitted it failed on validation, not on the doc — so re-test with `reason`.

## 2. Honesty gate (trace → test-run без наёба) — PROVEN two-sided on real v4 data

`get_coverage` per-task `verified_status` against the fresh real NDJSON:
- `p17-mutation-surface` → **DONE** (mapped scenario `_114` really PASSED).
- `p17-carveout-list` → **DONE** (`_133` PASSED).
- `verify-phase2-green` / `marksman-installer` → **IN_PROGRESS** (mapped scenarios
  `_15/_16` undefined/not_run → NOT falsely marked verified).

So a DONE task with a real passing scenario reads green; a task whose scenario is
undefined does NOT — the task→DoneWhen(`SPECGEN004_NN`)→scenario(@FR tag)→tested-by
edge→NDJSON lastResult→bucket→verified_status chain holds end-to-end, no fake.

## 3. Status-setting under enforce — NOT a hole (verified)

`.progress.json` is excluded from the mutation door (single-writer rule); it is
written by `spec-status.ts -ConfirmStop` (engine CLI, ENGINE_CLI carve-out → ALLOWED
under enforce), orchestrated by create-spec phase docs. TASKS.md `Status:` edits go
via `apply_spec_change`. Both reachable under enforce.

## GAPS FOUND

- 🔴 **G1 (FIXED 9658d06):** `get_coverage` had no `spec` param → always corpus-wide
  (1399 not_run) → misleading per-spec. Added optional `spec` scoping.
- 🔴 **G2:** create-spec phase docs (phase1, phase1.5, phase3, phase3plus) READ
  `.specs/{slug}/JIRA_SOURCE.md` (existence check + read) RAW — under enforce: denied.
  Migrate → `list_spec_docs` (existence) + `read_spec_doc` (read).
- 🔴 **G3:** phase3plus_audit-overview CREATES `.specs/{feature}/AUDIT_REPORT.md` via
  raw Write — under enforce: denied. Migrate → `apply_spec_change` ({content}).
- 🟡 **G4:** `get_trace FR-39` returns `acs=0` though AC-39.1/2/3 exist — AC-covers-FR
  edge may not be surfaced by get_trace. INVESTIGATE.
- 🟡 **G5:** `propose_spec_change` on an identical (no-op) change → `ok=false findings=0`
  — refusal path on a no-op/identical replace unclear. INVESTIGATE.
- 🟡 **G6:** `get_coverage_summary` returned specs=2 (likely by source-dir, not 47
  slugs) — confirm intended grouping vs a scoping miss.

## NOT yet covered (honest)

- Full GENERATIVE lifecycle by a LIVE agent under enforce (create→fill all phases→
  CHK/decisions→tasks→run tests→trace→verdict GREEN) end-to-end in ONE agent run.
  Done piecemeal: create_spec ✓, apply_spec_change ✓, read ✓, status reachable ✓,
  honesty gate ✓ — but not one continuous agent-driven build.
- Research skills (`research-workflow`, `architecture-research-workflow`) + the rest
  of the phase docs full MCP-rails refactor (only phase2 fully migrated before this).
- get_coverage spec-scoping: regression test + `spec-graph-query` skill wiring to
  pass `spec`.
