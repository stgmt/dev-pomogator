# Workstream 1 — FR-level OR-vs-AND false-green + canonical verdict consolidation (#174/#175/#176/#177) — READ-ONLY analysis

**Date:** 2026-07-23 · **HEAD:** `07c062e7` (`fix(spec-status): bind readiness to effective evidence (#184)`, main) · **Method:** direct code traces + MCP door (`get_spec_status`/`search`/`get_node`) + `gh issue view`. All line refs verified against this tree.

---

## 1. Verified current state — the six rollup surfaces

| Surface | Entry point | Vocabulary | Aggregation today | Imports spec-graph? |
|---|---|---|---|---|
| **fr-census** (per-FR) | `tools/spec-graph/fr-census.ts` `computeFrCensus` L121–248 | `IMPLEMENTED/DONE_UNTESTED/IN_PROGRESS/PLANNED/UNIMPLEMENTED` (L47–52) | **AND over tasks** (L173–174 `tasks.every`) — BUT verdict ignores AC/scenario legs (they only feed `webComplete` L219) | core |
| **task-census** (per-task truth) | `tools/spec-graph/task-census.ts` `computeTaskCensus` (~L80–141; signals L123–128) | `open/doneRed/doneUnrun` | doneRed excludes `not_run/stale` (partial-NDJSON guard); reads `truth_issues` from coverage | core |
| **coverage** (FR-32) | `tools/spec-graph/coverage.ts` `computeCoverage` | `VerifiedStatus` + `TaskTruthIssue` codes `TASK_DONE_UNVERIFIED/TASK_DONE_CHECKLIST_OPEN/TASK_DONE_FILTERED_ONLY` (L120–125, producer L274–292) | per-task; `verified_status` downgraded to IN_PROGRESS when issues (L328) | core |
| **conformance** (findings) | `tools/spec-graph/conformance.ts` `checkConformance` | `FindingCode` 20-code union L34–54; `Finding{code,severity,location,nodeId,suggestions}` L58–73; `TASK_STATUS_UNVERIFIED`/`TASK_UNTESTED` are **task-only warnings** | n/a (atom findings, no rollup) | core |
| **corpus-health** (organism) | `tools/spec-graph/corpus-health.ts` `corpusHealth` L80–174 | `GREEN/RED` + strict | `hardRed = collisions ∨ stale FILE_CHANGES` (L143, L171–172); **never reads fr-census verdict** | core |
| **spec-verdict** (per-spec canonical) | `tools/specs-generator/spec-verdict.ts` `runSpecVerdict` L413+ | `verdict RED/GREEN` (gapList L576–586) + `readiness.overall READY/NOT_READY` (L687–689) + 7 lanes (L635–686) | AND over blocking lanes (L686); consumes `buildReadinessInventory` (L41/448) + `gapsFromFindings` (L451) | yes |
| **MCP get_spec_status** | `tools/spec-mcp-server/tools.ts` L1345–1535 | `lifecycle SPEC_ONLY/TESTS_NOT_RUN/RED/PARTIAL/GREEN` (L1436–1444) + `hint` (L1482–1483/1535) + readiness (L1448–1449) | lifecycle now stale-honest via `summary.stale` (L1395, #184); **G2 strip alive**: `stale: false` at **L1321 and L1412** ⇒ `canonical_coverage.totals.stale≡0`, `executionGaps` (L1416/1336) + `taskTruthDebt` (L1430–1431) read the stripped projection | yes |
| **CLI spec-status** | `tools/specs-generator/specs-generator-core.mjs` `commandSpecStatus` L1359 (dispatch L3745; render L382–389; model L1703–1718) | `progress_percent / phase / sub_phase / per-file status` | **own regex model (`parseTasksForTable` ~L296–360), zero spec-graph imports** — spawned by plain `node` from 16-line `spec-status.ts` wrapper | **NO** |

### The three #175 gaps, verified
1. **Verdict ≠ webComplete**: `fr-census.ts` L180–184 decides `IMPLEMENTED` from tasks only; `hasAc`/`hasScenario` (L189–190) enter only `missingLegs`/`webComplete` (L196–219). An all-done+verified FR with **zero AC and zero scenario edges** reads `IMPLEMENTED`.
2. **No dependency edges**: `EdgeType` union `types.ts` L33–42 = `refs/covers/tested-by/tagged-by/implements/last-result/runtime-trace/step-binding/code-impl` — no `depends-on`; "FR-7 depends on FR-3" is inexpressible.
3. **No single spec→FR→AC/Scenario→Task rollup function**: corpus-health, fr-census, task-census, spec-verdict lanes each re-aggregate with their own policy (table above).

### #177's three split signals, verified
- per-task `truth_issue` `TASK_DONE_UNVERIFIED` — `coverage.ts` L120–125/274–284 (not a `Finding`: no `location/suggestions` shape)
- per-FR **verdict value** `DONE_UNTESTED` — `fr-census.ts` L49/182 (a status, not a finding)
- per-task conformance `TASK_STATUS_UNVERIFIED`/`TASK_UNTESTED` — `conformance.ts` L41–42 (task-only, warnings)

### #176's four split dictionaries, verified
`Bucket` (8 run-states, `coverage.ts`), `VerifiedStatus` (`coverage.ts`), `TestQualityVerdict` STRONG/WEAK/FAKE-POSITIVE-RISK (`coverage.ts`, produced by `test-quality-gate.ts`), `FrCensusVerdict` (`fr-census.ts` L47). Stale policy = mtime-only, whole-file granularity (`parsers/scenario-overlay.ts:280`; WP-1 §7) — no TTL, no content-hash, no named "stale demotes verified" rule.

---

## 2. Existing BDD contracts that PIN current semantics (regression surface)

Canonical feature: `.specs/spec-generator-v4/spec-generator-v4.feature` (`cucumber.json` `paths[0]`).

| Scenario | line | Pins | Status |
|---|---|---|---|
| `SPECGEN004_154` deterministic FR census never false-greens an FR with open tasks | :1240 | AND-over-tasks ladder | PASSED canonical 2026-07-22 (docker-bdd:full) |
| `SPECGEN004_169` fr-census web-complete only with ALL six legs (AND, not OR) | :1339 | webComplete AND | PASSED |
| `SPECGEN004_485/452` set_entity_status over the bundle refuses a derived FR | :1385 area | live verdict refusal text | PASSED |

Step-defs (real engine, no mocks): `tests/step_definitions/feature37_fr_census.ts` (verdict list L33; DONE_UNTESTED pin L88–93; conservation L115–119), `feature37_smart_verdict.ts` (L123 OR-of-gaps gate text), `feature37_corpus_health.ts`, `feature47b_completeness_trace.ts` (drives `computeFrCensus` on synthetic graph), `feature48_set_status.ts` (**L104 literal `VERDICTS` array**; L107 asserts refusal carries live verdict), `feature32_evidence_status.ts` (`TASK_STATUS_UNVERIFIED` L50–67), `feature35_honesty_hardening.ts` (`TASK_UNTESTED` L198), `feature63_precheck_inventory.ts` (+46 lines in #184), `feature64_release_inventory.ts`.

Unit twins (existing — edit-allowed, shrink-only, new `*.test.ts` blocked by `bdd-only-test-guard`): `tools/spec-graph/__tests__/fr-census.test.ts` (ladder L117–154, webComplete L165–195, render L217/240–242), `__tests__/conformance.test.ts` (L53–69, L424–430), `__tests__/task-census.test.ts`.

Tag exclusions (`cucumber.json` default+docker): `not @wip @manual @windows-only @e2e` — new scenarios must avoid all four.

---

## 3. Spec/status + issue context

- `spec-generator-v4`: **65 FR / 175 AC / 527 scenarios / 243 tasks**, `lifecycle: PARTIAL` (MCP `get_spec_status`, this tree). FR-37 (smart verdict, FR.md:629), FR-63 (:1103), FR-61/62/64 = the P34–37 substrate; per WP-1 report Phases 34–37 all `TODO`; #184 landed part of FR-63 (`feature63_precheck_inventory.ts` +46, `readiness-inventory.ts` +7).
- **#162** (umbrella, verified via `gh`): close v4 honestly; WP-1..WP-7; baseline `main@5e4dc4a0`. HEAD #184 has since landed WP-1 items 4–5 (precheck dotted-AC regex + WSL docker probe, both `.claude`+`.agents` copies) and **G3** (`summary.stale`). **G2 (`stale:false` strip) still in source** (tools.ts:1321, :1412).
- **No branch exists for #174–177** (`git branch -a`; `git log --grep` hits are coincidental strings).
- WP-1 root-cause map: `audit-reports/wp1-evidence-foundation-rootcause-2026-07-23.md` (G1 stale bundle / G2 strip / G3 stale-blind summary — G1+G3 resolved, G2 open); 3-surface map: `audit-reports/specgen-v4-three-surface-map-2026-07-23.md`.

---

## 4. Dependencies (shared primitives any change must route through)

`computeCoverage`+`Bucket`+`VerifiedStatus`+`TestQualityVerdict`+`TaskTruthIssue` (`coverage.ts`) · `buildLegIndices` (`legs.ts` — single leg-truth shared by fr-census AND `task-lifecycle` start gate) · `checkConformance`/`Finding`/`FindingCode` (`conformance.ts`) · `checkTraceabilityCompleteness`/`summariseGaps` (`traceability.ts`) · `buildReadinessInventory`/`evaluateReadiness`/`deriveExecutionLane`/`classifyEvidence` (`readiness-inventory.ts` — stale canonical → `outcome:'stale'` debt, L141–154) · `runSpecVerdict`/`compareBddSync`/`latestFilteredProof` (`spec-verdict.ts`) · `computeFrCensus` consumed by `spec-mcp-server/set-status.ts` L32/137 · `computeTaskCensus` consumed by `lifecycle.ts` + `spec-conformance-push` → `.dev-pomogator/.task-census.json` → prompt banner + claim-evidence-gate.

**Text-contract consumers of finding codes** (must learn any NEW code): `tools/spec-graph/test-quality-gate.ts` `BLOCKING_CODES` L46 (`TASK_TEST_QUALITY`, `TASK_UNTESTED`); `tools/claim-evidence-gate/turn_window.ts` L319 **regex over Stop-feedback text** (`TASK_UNTESTED|done without a strong test|…`); `spec-conformance-push.ts` L243; `mutations.ts` before/after diff L434–435/575–576; `spec-verdict.ts` `gapList`/`errorFindings` (L576–586/635).

---

## 5. Minimal coherent change boundary (per issue, ordered)

**Slice A — #177 `UNVERIFIED_COMPLETION` (additive, lowest risk):** add code to `FindingCode` (conformance.ts L34) + one producer emitting it for Task/FR/spec with `severity:'error'`, `nodeId`, `location{file,line}`, expected-vs-found evidence, `suggestions` — consolidating the three signals of §1. Flows automatically into spec-verdict `gapList`/`STRUCTURE` lane via existing `gapsFromFindings`+`errorFindings` paths; add to `BLOCKING_CODES` + `turn_window.ts` regex. **Do NOT delete** the three legacy signals yet (consumers grep them by string).

**Slice B — #176 evidence-state + stale policy (additive):** new pure module in `tools/spec-graph/` mapping `(Bucket, verified_status, test_quality, fr-census verdict) → untagged|exercised|impl-only|verified`; explicit stale demotion `verified→exercised` with configurable policy (content-hash default, mtime fallback — hook point: `scenario-overlay.ts:280`). Existing fields stay (compat); fr-census/corpus-health rows gain the field.

**Slice C — #175 fail-closed rollup (semantic change, needs its own BDD wave):** (1) fold `hasAc && hasScenario` into the verdict ladder (`fr-census.ts` L180–184) — a leg-less all-verified FR drops from `IMPLEMENTED`; (2) new `EdgeType 'depends-on'` (`types.ts` L33) + parser for `Depends:`/`Зависит от:` markers + builder merge; (3) one `rollupState(graph, nodeId)` = worst of mandatory descendants ∪ dependencies, propagated to spec root. Touches: `types.ts`, new parser, `builder.ts`, `fr-census.ts`, new `rollup.ts`, `set-status.ts` refusal message (L147).

**Slice D — #174 canonical verdict function (consolidation, highest integration risk):** one core function in `tools/spec-graph/` (extend `readiness-inventory.ts` or new `verdict-core.ts`) + one label dictionary; switch consumers: MCP `get_spec_status` lifecycle/hint (`tools.ts` L1436–1444/1482–1483/1535), `spec-verdict.ts` lane assembly (L635–689), `corpus-health.ts` verdict (L171–172), and CLI `commandSpecStatus` (`specs-generator-core.mjs` L1359) — **see risk R3 for the node-import blocker**. Simultaneously fix G2 (drop `stale:false` at tools.ts:1321/1412 → pass-through) so `canonical_coverage` agrees with the canonical verdict.

**Hard ordering:** A → B → C → D (each later slice reads the earlier's output; D without G2-fix preserves drift).

---

## 6. Files to change

| Slice | Files |
|---|---|
| A | `tools/spec-graph/conformance.ts` (code+producer), `tools/spec-graph/test-quality-gate.ts` (BLOCKING_CODES), `tools/claim-evidence-gate/turn_window.ts` (regex L319), verify `spec-verdict.ts` gap flow |
| B | new `tools/spec-graph/evidence-state.ts`, `tools/spec-graph/types.ts` (optional field), `tools/spec-graph/parsers/scenario-overlay.ts` (policy hook), `fr-census.ts`/`coverage.ts` (expose) |
| C | `tools/spec-graph/types.ts` (EdgeType), new parser (+`builder.ts`), new `tools/spec-graph/rollup.ts`, `tools/spec-graph/fr-census.ts` (ladder+report), `tools/spec-mcp-server/set-status.ts` (message L147) |
| D | new/extended core in `tools/spec-graph/`, `tools/spec-mcp-server/tools.ts` (lifecycle/hint/G2 strip), `tools/specs-generator/spec-verdict.ts`, `tools/spec-graph/corpus-health.ts`, `tools/specs-generator/specs-generator-core.mjs` (R3 strategy) |
| all | `npm run build:mcp` (server.bundle.mjs — R1); BDD: `.specs/spec-generator-v4/spec-generator-v4.feature` (new `@feature37`-tagged scenarios via MCP door, single-line ops — R6) + `tests/step_definitions/feature37_*.ts` (or new step-def file); existing unit twins edited in place |

---

## 7. Test strategy (Docker-only BDD, per `no-host-bdd-runs`)

1. **Only** `bash scripts/docker-bdd.sh …` — host `run-bdd.mjs` refuses (`DEV_POMOGATOR_TEST_IN_DOCKER!=1`), `test_guard` PreToolUse denies any host cucumber, `tests/hooks/ensure-docker-bdd.ts` throws at load.
2. Filtered runs: `bash scripts/docker-bdd.sh --name SPECGEN004_NNN` (or `--tags @feature37`). **Filtered docker-bdd exits 0 on failure** → verify `lastResult===PASSED` **by slug id** via MCP `get_node`, never by absence from fail-list.
3. New scenarios: never tag `@wip/@manual/@windows-only/@e2e` (silent orphaning); unique slug id (latest free ≥ 566 — re-check against current .feature before authoring; 8 duplicate-id pairs from WP-1 §4 still pending renumber).
4. Cucumber-Expression trap: literal `( )`/`/` in step text ⇒ step-def **must be RegExp** with escaping, else UNDEFINED in Docker while vitest stays green.
5. Pin semantics both ways: (a) leg-less all-done FR ⇒ new demoted verdict (positive), (b) `UNVERIFIED_COMPLETION` lands in `blocking[]`/`gapList` and flips spec-verdict RED (positive), (c) conservation invariant `Σ byVerdict === rows.length` (existing fr-census.test.ts pattern), (d) stale canonical ⇒ lifecycle≠GREEN already pinned post-#184 — extend for `canonical_coverage.totals.stale>0` after G2 fix.
6. Reconcile after run: `get_spec_status(spec-generator-v4)` — lifecycle/hint/readiness lanes must agree with `spec-verdict` output (that agreement IS the #174 acceptance).
7. Unit twins: edit existing `__tests__/fr-census.test.ts` etc. only (new `*.test.ts` blocked by bdd-only guard; edits shrink-only per FR-10).

---

## 8. Migration / compatibility risks

1. **R1 — stale runtime bundle (G1 class):** `.mcp.json:8` spawns `tools/spec-mcp-server/server.bundle.mjs`; ANY `tools.ts`/spec-graph change is invisible in production until `npm run build:mcp` + plugin reload. Bundle today contains old fr-census copy (bundle L50803).
2. **R2 — G2 strip still lying:** tools.ts `stale: false` at :1321/:1412. If D switches lifecycle to the core but leaves the strip, `canonical_coverage`/`execution_gaps`/`taskTruthDebt` keep diverging from the canonical verdict — drift preserved, not removed.
3. **R3 — CLI is plain-node .mjs with ZERO spec-graph imports:** `spec-status.ts` wrapper spawns `node specs-generator-core.mjs`; dynamic `.ts` import from `.mjs` needs Node ≥22.18 native strip-types (flag-gated below) or a bundle step or wrapper-side compute. **Hardest constraint of #174** — decide strategy before touching `commandSpecStatus`.
4. **R4 — fr-census verdict semantic change breaks live pins:** SPECGEN004_154/169, `feature48_set_status.ts:104` literal VERDICTS array, fr-census.test.ts ladder, `set-status.ts:147` message text. Folding legs into verdict also turns many leg-less spec FRs RED corpus-wide (fr-census CLI exit-code consumers + CI).
5. **R5 — text/regex consumers of finding codes:** `turn_window.ts:319` regex and `BLOCKING_CODES` won't see `UNVERIFIED_COMPLETION` until added; claim-evidence-gate BDD (`CEGATE001_25/47` in `tests/features/plugins/claim-evidence-gate/`) asserts on gate feedback text.
6. **R6 — CRLF canonical feature file:** multi-line `apply_spec_change` fails LF-match ⇒ single-line ops only; all `.specs/` writes via MCP door (spec-access guard denies Bash/Read on `.specs/`).
7. **R7 — new edge type vs corpus-health:** `depends-on` edges with missing targets trip `danglingEdges` → strictVerdict RED; parser without producers is inert (safe order: parser+builder first, producer later).
8. **R8 — filtered docker-bdd exit-0** and **@windows-only orphaning** (see §7); **dual precheck copies** (`.claude`+`.agents`) must not diverge again if spec-status scripts are touched; **8 duplicate scenario ids** (526 vs 518) still pending renumber — inventory splits until WP-1 §4 lands.

---

## 9. One-paragraph verdict

The AND-over-tasks disease of the 2026-06-11 fr-census incident is fixed and BDD-pinned (SPECGEN004_154); the **live** false-green surface is (a) fr-census `verdict` ignoring AC/scenario legs + the absence of dependency edges and a unified bottom-up rollup (#175), (b) four incompatible evidence dictionaries with mtime-only stale (#176), (c) the done-without-evidence signal split across three types that never reaches `blocking[]` as one finding (#177), and (d) four surfaces — CLI `commandSpecStatus` (own regex model, no spec-graph), MCP `get_spec_status` (lifecycle honest since #184 but `canonical_coverage` still stripped at tools.ts:1321/1412), `spec-verdict` lanes, and corpus-health — each re-deriving "done" in its own words (#174). Sequencing A→B→C→D keeps every step additive until the C semantic change, which must ship with its own Docker-BDD wave; D's gating constraint is the plain-node `.mjs` CLI import path (R3) and the bundle rebuild (R1).
