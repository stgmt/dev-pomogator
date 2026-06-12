# Multi-level verification plan — spec-archival work + corpus invariants

**Why:** "Docker green" only proves the suite ran. It does NOT prove: every BDD
test maps to a spec (no orphan tests), every requirement traces down to tests
(no untraced FR), my OWN new code is traced (FR-45 isn't even written yet), or
that the new tools handle every edge + happy path. This plan executes the
project's OWN organism engines, not "I looked". Each level: command + pass bar.
Findings recorded honestly, including gaps in my own work.

## L0 — Suite (DONE)
- `bash scripts/docker-test.sh` → 156 passed / 2 pre-existing reds (spec-generator-v3,
  specs-generator — the v3 remnants the agent targets). My archive-tools GREEN.

## L1 — Per-spec authoritative verdict (EACH spec, not just v4)
- For every slug: `spec-verdict.ts -Path .specs/<slug>` → GREEN (audit 0 ERROR +
  traceability 0 gaps + conformance error-free + coverage + semantic-or-skip).
- Pass: no spec is RED, OR each RED gap is a known/pre-existing debt named.

## L2 — Organism (whole corpus) — the user's exact concerns
- `corpus-health.ts` → ONE verdict over the whole `.specs/`:
  - **orphan project tests** (FR-44/GT-1) = a BDD/vitest test with NO spec scenario.
  - **untraced atoms** (FR-37b) = UNCOVERED_FR / TASK_UNTESTED / UNTAGGED_SCENARIO
    = a requirement that traces to no test.
  - id collisions, dangling edges, stale FILE_CHANGES, FRs with no research,
    upstream-unlinked stories/use-cases.
- `project-test-trace.ts` (orphan tests), `traceability.ts` (untraced atoms) —
  drill-down if corpus-health flags.
- Pass: 0 orphan tests + 0 untraced atoms, OR every one is pre-existing + named
  (NOT introduced by my diff).

## L3 — My OWN new code is traced (the biggest known gap)
- FR-45 authored in the v4 spec (+ AC + @feature45 scenario + step defs).
- Every new file (the 2 MCP tools, spec-archive.ts, the agent, the tests) listed
  in FILE_CHANGES (→ implements edges) AND a TASK with `refs: FR-45`.
- `fr-census --spec spec-generator-v4` → FR-45 = IMPLEMENTED (task done + scenario green).
- Pass: my new code is NOT an untraced atom / orphan test after this.

## L4 — New tools/agent: every edge + happy path
- archive_spec: happy actual move (tmp corpus) + idempotent re-archive +
  DEST_EXISTS + ARCHIVE_BLOCKED + audit line written.
- get_archival_proof: ARCHIVE / KEEP_FALSE_POSITIVE / NEEDS_HUMAN / SPEC_NOT_FOUND
  / ALREADY_ARCHIVED + both ref carriers (edge AND prose).
- prune (TEST_SHARED vs orphaned), report written.
- Drive the REAL `server.bundle.mjs` over stdio calling the new tools; deps-absent
  load (hidden node_modules) → no ERR_MODULE_NOT_FOUND.
- Pass: every branch has a passing assertion; real-server drive green.

## L5 — First real archival end-to-end (the cleanup)
- Agent `--apply` on the proven v3 remnant: prove → archive_spec move → prune the
  orphaned test → write report → `git` the move; fully `git revert`-able.
- Pass: spec moved to archive/, the 2 v3 reds resolved, suite green, revertable.

## Execution log

### L0 — Suite — DONE
2 failed / 156 passed. Both reds (spec-generator-v3, specs-generator) PRE-EXISTING
(v3 remnants). My archive-tools now GREEN (corpus-independent fix).

### L2 — Organism (corpus-health) — DONE → 🔴 RED
- dangling edges: 10
- **untraced atoms (FR-37b): 1325** — UNCOVERED_FR:40, TASK_UNTESTED:34,
  **UNTAGGED_SCENARIO:1251** (scenarios with no @feature → traced to no requirement).
- stale FILE_CHANGES (graph-side): 118
- **orphan project tests (FR-44/GT-1): 98** — vitest it() with no spec scenario
  ("a BDD test with no spec" — the user's exact concern; YES, 98 exist).
- upstream unlinked (FR-44/GT-4): 467 (story:156, use-case:269, decision:42).
- collisions: 0.

**Mine vs pre-existing:** ALL of the above is PRE-EXISTING corpus debt — my diff
introduced none of it (my ARCHSEAL/ARCHTOOL tests sit in `tools/**/__tests__/`,
outside the GT-1 detector's `tests/e2e/` scope; my new CODE is not yet a spec node).
HONEST GAP IN MY OWN WORK: FR-45 is NOT written, so the new tools / agent / tests
are traced to NO requirement — L3 is therefore MANDATORY and NOT done. I must NOT
claim the archival work "done/clean" until L3 closes.

### Verdict so far
The archival MECHANICS are built + suite-green, but the corpus is 🔴 RED and my
own work is UNTRACED. Two distinct tracks:
1. **My obligation (this task):** L3 — author FR-45 + @feature45 scenario + step
   defs + FILE_CHANGES + TASKS so the new code stops being untraced; then L1 (v4
   GREEN) + L4 (edges/happy) + L5 (first archival).
2. **Pre-existing corpus debt (separate, large):** 1251 UNTAGGED_SCENARIO + 98
   orphan tests + 467 upstream-unlinked — a corpus-wide cleanup, NOT introduced
   by me, NOT closeable in one pass. Named here so it is not silently "green".

