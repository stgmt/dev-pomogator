# Bidirectional traceability audit (2026-06-09)

User ask: is there a REVERSE check that every BDD scenario actually traces back to a
spec (so "a scenario from nowhere" lights up)? Same question for tasks, and for
requirements that don't cite a RESEARCH file — traceability in BOTH directions. And:
spec scenarios must match not only the `.md` files but also what's already in the
PROJECT (the test code). Deep analysis of this scope + report + record the gaps (and
the not-yet-done items) into the spec so they're not forgotten.

Method (per advisor): for EACH matrix cell ask three things, not one —
**(1) Exists?** a finding is emitted · **(2) Has teeth?** does it feed a HARD GATE
(`gapsFromFindings` FR-37b traceability gate = `{UNCOVERED_FR, TASK_UNTESTED,
UNTAGGED_SCENARIO}` ONLY; or `audit-spec` ERROR; or conformance error-severity) — a
warning/info that gates nothing does NOT "свети дыры" · **(3) Actually fires?** confirmed
on the real corpus. Mapped via 3 parallel Explore agents over `conformance.ts` +
`traceability.ts` + `audit-spec`/`specs-validator` + `cross-spec-reconcile` + the
`builder`/parsers, cross-checked against my own read of `traceability.ts`.

## Empirical headline (real corpus, 2026-06-09)

- Graph holds **1538 Scenario nodes — ALL built from `.feature` files only.**
- The PROJECT contains **1195 vitest `it()`/`test()`** (tests/e2e) + **589 cucumber
  step-defs** (Given/When/Then in tests/step_definitions) — **ZERO of them have any
  node in the graph.** The builder's `walkDir` runs only over `.specs/` (md) and
  `.specs/`+`tests/features/` (`.feature`); `tests/step_definitions/` and `tests/e2e/`
  are never scanned; `extractStepBindings()` exists but is **never called** (builder.ts).
- **47 `RESEARCH.md`** files exist; **none are ingested** — `parseMarkdown` only matches
  FR/NFR/AC/Task headings, so a `## Research:` heading is silently dropped. No FR→RESEARCH
  edge can exist (grep `RESEARCH` in tools/spec-graph → 0).

So the "левый сценарий ниоткуда" hole is real and large: a step-def / vitest test that
never made it into a `.feature` is **structurally invisible** to every graph-based check,
because the graph is built FROM `.feature`, blind to the project test tree.

## The bidirectional matrix (cell → exists / teeth / verdict)

Legend: ✅ has teeth (gates the verdict RED) · 🟡 present-but-toothless (emitted, never
gates) · ❌ missing entirely.

### Forward (requirement → downstream)
| Cell | Code(s) | Status |
|---|---|---|
| FR → has AC or Scenario | `UNCOVERED_FR` (traceability gate) | ✅ gates |
| FR → @featureN scenario exists | `NOT_COVERED` (validate-specs, stdout) ; `impl-drift/missing-test` (reconcile) | 🟡 advisory only |
| FR → implementation file | `FC_EDIT_MISSING`/`FC_DELETE_MISSING` (audit ERROR) ; `impl-drift/missing-file` (reconcile WARNING) | ✅ via audit gate / 🟡 reconcile |
| AC → covered by scenario | `spec-only/uncovered-AC` (reconcile WARNING) | 🟡 |
| **FR → RESEARCH.md finding** | — | ❌ **MISSING** |

### Reverse (artifact → source) — the user's core ask
| Cell | Code(s) | Status |
|---|---|---|
| Scenario(.feature) untagged → no spec link | `UNTAGGED_SCENARIO` (traceability gate, INFO-sev but IN gap-class) | ✅ gates |
| Scenario @tag → node that exists | `SCENARIO_TAG_ORPHAN` (WARNING, NOT in gap-class) | 🟡 toothless |
| @featureN(.feature) → MD requirement | `ORPHAN` (validate-specs stdout) ; `impl-drift/test-without-fr` (reconcile) | 🟡 advisory only |
| Task → FR exists | `ORPHAN_TASK` (WARNING, NOT in gap-class) | 🟡 toothless |
| Task(DONE) → has a test | `TASK_UNTESTED` (traceability gate) | ✅ gates (fired live: SPECGEN004_98) |
| Task(DONE) → scenarios green | `TASK_STATUS_UNVERIFIED` (WARNING, NOT in gap-class) | 🟡 toothless for verdict (get_coverage caps DONE→IN_PROGRESS in coverage view only) |
| **Task(IN_PROGRESS) → empty refs (no requirement)** | — | ❌ **MISSING** |
| **Project step-def → spec scenario** | — | ❌ **MISSING (headline; structural — graph blind)** |
| **Project vitest `it()` → spec** | — | ❌ **MISSING (structural)** |
| **USER_STORIES / USE_CASES / DESIGN → requirement back-ref** | — | ❌ **MISSING** (form-guards check internal shape only, not back-trace) |

### Lateral (spec ↔ spec) — cross-spec-reconcile, 30 classes
Rich set (runtime-identifier-drift, enum-divergence, schema-mismatch, module-ownership,
decision-vs-reality, …). BUT these land in `consistency-report.yaml`, **NOT** in the
`spec-verdict` gate — so they inform, they don't gate per-spec health. `runtime-identifier`
checks are spec↔spec, **not** spec↔code (no code→spec identifier reverse-scan).

## Gap classification (what to fix)

**A. MISSING entirely (no code, the real "dark" cells):**
- **GT-1 (HEADLINE) project-side test ↔ spec scenario, BOTH ways.** 1195 vitest + 589
  step-defs invisible. Needs the graph to INGEST project tests (a step-def/vitest parser →
  a project-Test node) + a reverse check "project test with no spec scenario" and the
  forward "spec scenario with no backing project test". (The `extension-test-quality` RULE
  asserts 1:1 by convention — there is no AUTOMATED graph check.)
- **GT-2 FR → RESEARCH.md.** Ingest RESEARCH.md (a Research/Finding node) + a check "FR
  cites no research finding" (severity TBD — likely WARNING, gating only in Discovery-backed
  specs).
- **GT-3 IN_PROGRESS task with empty `refs`.** Today only DONE tasks are audited.
- **GT-4 USER_STORIES / USE_CASES / DESIGN back-reference completeness** (story→FR, UC→FR,
  decision→FR/research).

**B. PRESENT but TOOTHLESS (emitted, never gates the verdict) — decide promote-or-keep-advisory:**
- `ORPHAN_TASK`, `SCENARIO_TAG_ORPHAN`, `TASK_STATUS_UNVERIFIED` — WARNING, not in
  `GAP_CLASSES`, so a dangling task-ref / orphan scenario-tag / DONE-but-red task does NOT
  flip RED. (Promotion to the gap-class is a deliberate decision — some are legitimately
  advisory.)
- `NOT_COVERED` / `ORPHAN` (validate-specs) — stdout/validation-report only.
- All cross-spec-reconcile classes — consistency-report.yaml, not the verdict.

**C. COVERED WITH TEETH (already gates):**
- Traceability gate: `UNCOVERED_FR`, `TASK_UNTESTED`, `UNTAGGED_SCENARIO`.
- Audit gate (ERROR): `PARTIAL_IMPL_DETECTION`, FILE_CHANGES `FC_CREATE_EXISTS`/`FC_EDIT_MISSING`/
  `FC_DELETE_MISSING`, `DUPLICATE_DEFINITION`.

## Cross-cutting conclusion

The honesty layer is strong in the FORWARD direction and for a FEW reverse cells
(untagged scenario, untested DONE task). The reverse direction is **half-built**: the
biggest hole is that the graph has NO representation of the project's own test code, so
"a scenario/test that exists in the project but is described in no spec" cannot light up —
exactly the class the user named. Second hole: RESEARCH.md is outside the graph entirely,
so "a requirement nobody researched" is invisible. Third: several reverse checks exist but
are toothless (warning-only), so they inform rather than gate.

Recorded as FR-44 (+ AC + scenario) and Phase 20 tasks in `.specs/spec-generator-v4/`
(GT-1..GT-4 + the toothless-promotion decision), alongside the still-open Phase 19 items
(P19-5 producer, P19-4 enforce flip, P19-3 BDD regression, the skill-MCP-contract scenario
to close the P19-1 umbrella).
