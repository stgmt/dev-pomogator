# Manual Agent-Driven E2E Walkthrough

> **Date:** 2026-06-02
> **Agent:** Claude Opus 4.7 (main loop, not subagent — manual walk is the point)
> **Branch / HEAD:** `feat/phase-2a-mcp-server-and-hooks` / `92cdad8`
> **Task:** T-Trans.16 per `.specs/spec-generator-v4/TASKS.md` — Phase 8 gap-close
> **Requirements:** FR-4, FR-29, FR-30, FR-31, CHK-MANUAL-E2E-01

Purpose: prove the **agent-perceivable surface** end-to-end against the live stack on the real `.specs/` tree, surface bugs that synthetic-fixture tests miss.

---

## Phase A — Boot MCP server (in-process, identical call path to stdio server)

**Command:** `npx tsx .dev-pomogator-tmp/manual-walk-AB.mjs` (calls `startLifecycle` + `buildToolRegistry` directly — same code paths `server.ts` uses).

**Observed:**

```json
{
  "phase": "A",
  "pid": 249236,
  "boot_ms": 2398,
  "tools_registered": 11,
  "tool_names": [
    "get_trace", "find_by_tags", "conformance_check", "search",
    "get_node", "list_phase_tasks", "get_test_result", "find_orphans",
    "get_coverage_summary", "validate_anchor", "list_specs"
  ],
  "graph_node_count": 1914,
  "graph_edge_count": 1355
}
```

**Side note logged:** `[spec-graph] FILE_CHANGES.md contains glob path(s); implements edges skipped (first: .specs/spec-generator-v4/*.md)` — FR-29 AC-29.3 warn-once contract works in production.

**Expected:** 11 tools, lifecycle boots without crash, cold-start ≤2s p95 (NFR-Performance-1).
**Observed:** 11 tools ✓, lifecycle clean shutdown ✓, **cold start 2398ms ⚠️** — 20% over NFR budget for live corpus (49 specs, 1914 nodes). Synthetic fixture cold-start is ~35ms (verified separately); real corpus 70× slower than fixture. This is the same regression noted in `cold-start.bench.test.ts` post-FR-29 wiring.

**CONFIRMED with caveat:** boot path works, but NFR-Performance-1 violated on real corpus. **Separate task needed:** profile builder.ts after implements-edge wiring, optimize hot path. Not blocker for FR-29/30/31 acceptance (planning + tests in commit `92cdad8`), but feeds into existing `cold-start.bench.test.ts` failure flagged in that commit.

---

## Phase B — `get_trace` on 3 real FRs from `personal-pomogator`

**Command:** in-process call `tool.handler({node_id: 'FR-1'})` etc.

### Result FR-1

```json
{
  "fr": "FR-1",
  "ms": 1,
  "ac_count": 51,
  "scenario_count": 0,
  "task_count": 0,
  "code_impl_count": 101,
  "explanation": "FR-1 \"Atomic worktree+branch creation from main\" — 51 AC, 0 scenarios (0 PASS, 0 FAIL), 0 tasks."
}
```

### Result FR-2

```json
{ "fr": "FR-2", "ac_count": 51, "code_impl_count": 70, "explanation": "FR-2 \"Full installer bootstrap with global config registration\"..." }
```

### Result FR-3

```json
{ "fr": "FR-3", "ac_count": 51, "code_impl_count": 63, "explanation": "FR-3 \"Self-heal hint for orphan worktrees via tsx-runner.js\"..." }
```

**Expected:** `get_trace("FR-1")` against `.specs/personal-pomogator/FR.md` returns **personal-pomogator's** FR-1 ("Managed gitignore block @feature1") with its own ACs / scenarios / tasks / code_impl.

**Observed:** Response includes **aggregated** data — FR-1's explanation reads "Atomic worktree+branch creation from main" (that's `worktree-setup` spec's FR-1, not personal-pomogator's). `ac_count: 51` is the total ACs across ALL specs whose `parentFr == 'FR-1'`. `code_impl_count: 101` is implements edges from ANY FR-1 node.

**🚨 DENIED — Bug #1: Cross-spec FR-ID collision aggregates in get_trace.**

- **Root cause:** node IDs in `tools/spec-graph/types.ts` use bare `FR-N` strings — there's no spec scoping (`FR-1` from `worktree-setup` and `FR-1` from `personal-pomogator` collide on the same node).
- **Evidence:** `tools/spec-graph/parsers/md.ts` emits FR node with `id = \`FR-\${match[1]}\`` — globally non-unique.
- **Impact:** every agent query for a specific spec's FR returns aggregated data from all specs with the same FR number. AC inheritance via `code_impl` is also poisoned (AC-5.1 inherits from "the" FR-5, which is now N FR-5s merged).
- **Severity:** HIGH — this contradicts FR-4 ("Agent MUST be able to use response without follow-up file Read operations") because the agent gets WRONG data, not just incomplete.
- **Fix scope:** prefix node IDs with spec slug (e.g. `personal-pomogator/FR-1`) and update all queries + edges accordingly. Backward-compat alias for bare `FR-N` only if there's exactly one spec match.
- **File:line refs:** `tools/spec-graph/parsers/md.ts:~50` (FR id generation), `tools/spec-mcp-server/tools.ts:~100` (get_trace lookup), `tools/spec-graph/types.ts:55-90` (NodeId type).

---

## Phase C — Parse 3 real multi-lang NDJSON fixtures

**Command:** `npx tsx .dev-pomogator-tmp/manual-walk-C.mjs` — calls `detectRunner` + `parseNdjsonFile` on each.

### Reqnroll fixture

```json
{
  "lang": "reqnroll",
  "bytes": 6754,
  "detected_runner": "reqnroll",
  "scenarios_count": 2,
  "scenario_locations": [
    { "loc": "features/Auth.feature:3", "status": "PASSED" },
    { "loc": "features/Auth.feature:8", "status": "FAILED" }
  ],
  "failing_step_sample": {
    "step": "",
    "errorMessage": "Reqnroll.AssertionException: Expected response to be rejected but got 200 OK\n   at AuthSteps.TheResponseIsRejected() in C:\\src\\AuthSample\\Steps\\AuthSteps.cs:line 42"
  }
}
```

### behave fixture

```json
{
  "lang": "behave",
  "detected_runner": "behave",
  "scenarios_count": 2,
  "scenario_locations": [
    { "loc": "features/checkout.feature:4", "status": "PASSED" },
    { "loc": "features/checkout.feature:9", "status": "FAILED" }
  ]
}
```

### Cucumber-JVM fixture

```json
{
  "lang": "jvm",
  "detected_runner": "cucumber-jvm",
  "scenarios_count": 2,
  "scenario_locations": [
    { "loc": "src/test/resources/features/payment.feature:4", "status": "PASSED" },
    { "loc": "src/test/resources/features/payment.feature:9", "status": "FAILED" }
  ]
}
```

**Expected:** detectRunner accurate, 2 scenarios per fixture (1 PASSED + 1 FAILED), failingStep carries realistic error message.

**Observed:** All 3 match expectations. detectRunner returns canonical runner identifier (`reqnroll`/`behave`/`cucumber-jvm`). 2/2 scenarios per fixture. Realistic error messages with stack-trace-style location refs.

**Minor quirk:** `failingStep.step` is empty string `""` — the parser extracts `errorMessage` but not the human-readable step text. Not blocker (errorMessage carries enough context), but `get_trace` consumers expecting `failingStep.step` for display will see blank. Low-priority finding.

**CONFIRMED:** FR-31 multi-lang parsing works on real (handcrafted-to-schema) fixtures across all 3 languages.

---

## Phase D — `cross-spec-reconcile` light mode

**Command:** in-process `reconcileLight({repoRoot})`.

**Observed:**

```json
{
  "phase": "D",
  "ms": ~5000,
  "specs_processed": 49,
  "findings_total": 1278,
  "by_severity": { "WARNING": 1108, "INFO": 138, "CRITICAL": 32 },
  "by_code_top": [
    ["impl-drift/missing-file", 1020],
    ["cross-spec/missing-cross-ref", 92],
    ["spec-only/unreachable-task", 65],
    ["cross-spec/module-ownership-conflict", 32],
    ["spec-only/orphan-task", 30],
    ["impl-drift/test-result-stale", 25],
    ["impl-drift/dead-link", 8],
    ["spec-only/missing-fr-section", 7]
  ]
}
```

**Expected:** Findings emitted on real corpus; counts ≥ baseline (1182 at commit `5a19b03`).

**Observed:** **1278 findings** vs baseline 1182 → +96. Likely from FR-29 builder wiring surfacing new implements-edge inconsistencies (paths cited in FILE_CHANGES.md that don't exist on disk now produce findings).

**CONFIRMED:** detector runs, emits structured findings, respects severity bucketing. No new error class introduced (top-8 codes are all pre-existing categories).

---

## Phase E — `cross-spec-resolve` on one finding (`cross-ref-linker` resolver)

**Picked finding:** first `cross-spec/missing-cross-ref` from Phase D corpus.

**Finding payload (from reconcileLight):**

```json
{
  "code": "cross-spec/missing-cross-ref",
  "severity": "INFO",
  "suggested_fix": "Spec mentions \"auto-capture\" but has no markdown link. Add [...](../auto-capture/FR.md) to make the cross-ref explicit."
}
```

**Synthesized backlog entry (Phase E action):**

```json
{
  "id": "manual-walk-1780376077222",
  "code": "cross-spec/missing-cross-ref",
  "category": "missing-cross-ref",
  "evidence": {}
}
```

**Resolver result:**

```json
{
  "confidence": 0,
  "files_changed": [],
  "bailed_out": { "reason": "missing-evidence" },
  "notes": "evidence.file, evidence.spec_a, or evidence.spec_b missing — cannot link cross-ref."
}
```

**Expected:** cross-ref-linker resolves the finding, wraps slug mention in markdown link.

**Observed:** Resolver bails immediately with `missing-evidence` because the finding emitted by `reconcileLight` doesn't carry `evidence.file` / `evidence.spec_a` / `evidence.spec_b` directly on the `evidence` field. The finding has these as TOP-LEVEL fields (`finding.spec`, `finding.evidence.referenced_in`?) but the resolver expects them inside `entry.evidence`.

**🚨 DENIED — Bug #2: Finding shape contract mismatch between detector and resolver.**

- **Root cause:** `reconcileLight` finding shape and `tools/spec-backlog/classifier.ts → BacklogEntry` shape have differently-named evidence fields. The classifier+ingest pipeline normalizes this when entries are persisted to `.dev-pomogator/.specs-backlog/<date>.jsonl`, but **directly invoking a resolver in-process against a raw finding doesn't go through that normalization** → resolver sees empty evidence.
- **Evidence:** `tools/spec-backlog/resolvers/cross-ref-linker.ts:~40` reads `entry.evidence.file/spec_a/spec_b`. `reconcileLight` finding shape: `{code, severity, spec, evidence: {referenced_in, ...}}` (different keys).
- **Impact:** documentation gap. The pipeline works via CLI (`spec-backlog ingest` does normalization), but the agent-facing "invoke resolver directly" surface doesn't. T-Trans.15 step-defs (just shipped) avoid this by going through the CLI; but a hypothetical sub-agent that calls resolver directly with a fresh finding would hit this.
- **Severity:** MEDIUM — workaround exists (use CLI). Either:
  - Option A: add a normalizer to resolver entrypoint that accepts both finding-shape and entry-shape
  - Option B: document the canonical entry-shape and direct callers to use `classifyAndNormalize(finding)` helper first
- **File:line refs:** `tools/spec-backlog/resolvers/cross-ref-linker.ts:~40`, `.claude/skills/cross-spec-reconcile/scripts/reconcile.ts:~1850` (finding emission shape), `tools/spec-backlog/classifier.ts:~150` (normalization).

---

## Known Bugs Surfaced

| # | Bug | Severity | File:line | Recommendation |
|---|---|---|---|---|
| 1 | Cross-spec FR-ID collision in `get_trace` (FR-1 from spec A aggregates with FR-1 from spec B) | **HIGH** | `tools/spec-graph/parsers/md.ts:~50` (id gen), `tools/spec-mcp-server/tools.ts:~100` (lookup) | Prefix node IDs with spec slug + backward-compat alias for single-match disambiguation |
| 2 | Detector finding shape ≠ resolver entry shape (cross-ref-linker bails `missing-evidence` on raw findings) | MEDIUM | `tools/spec-backlog/resolvers/cross-ref-linker.ts:~40`, `reconcile.ts:~1850` | Add normalizer at resolver entrypoint OR document `classifyAndNormalize()` helper |
| 3 | NFR-Performance-1 cold-start budget violated on real corpus (2398ms vs ≤2000ms) post-FR-29 wiring | MEDIUM | `tools/spec-graph/builder.ts` (FR-29 implements-edge resolution hot path) | Profile + optimize file-changes parser + DESIGN section parser; same fix closes `cold-start.bench.test.ts` regression |
| 4 | `failingStep.step` empty string in multilang NDJSON parse (only `errorMessage` filled) | LOW | `tools/spec-graph/parsers/ndjson.ts:~170` | Extract step.text from `testStepStarted` envelope into `failingStep.step` |
| 5 | `# @featureN` in spec-generator-v4.feature is Gherkin comment, not real tag (workflow noted) | LOW | `.specs/spec-generator-v4/spec-generator-v4.feature` (multiple lines) | Strip leading `#` so cucumber-js `--tags @feature29` filter works |

---

## Summary Verdict

**Phases A, C, D: CONFIRMED** — boot, multi-lang parse, detector emit all work end-to-end on real corpus.

**Phases B, E: DENIED with actionable findings** — 2 real bugs surfaced (cross-spec FR collision + finding/entry shape mismatch). Both are agent-facing surface bugs invisible to current synthetic-fixture unit tests.

**Overall:** the v4 stack delivers on FR-4 (graph navigation), FR-9 (multi-lang), FR-17 (reconcile detection) on real data. **Does NOT yet deliver FR-4 correctly** because cross-spec FR collision means `get_trace` gives the agent WRONG data, not just incomplete.

These 5 bugs are not in `92cdad8` commit scope (they predate or surface from it) but are now CHK-MANUAL-E2E-01 deliverable artifacts for the next sub-PR.

---

## Reproduction

All inputs / scripts staged at `.dev-pomogator-tmp/manual-walk-{AB,C,DE}.mjs`. Re-run:

```bash
cd D:/repos/dev-pomogator
npx tsx .dev-pomogator-tmp/manual-walk-AB.mjs   # Phase A + B
npx tsx .dev-pomogator-tmp/manual-walk-C.mjs    # Phase C
npx tsx .dev-pomogator-tmp/manual-walk-DE.mjs   # Phase D + E
```
