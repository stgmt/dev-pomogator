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
- ✅ **G4 — FALSE POSITIVE (RESOLVED 2026-06-08):** `get_trace FR-39` does NOT return acs=0.
  The covers edges FR-39→AC-39.1/2/3 ARE in the live graph (dumped via `buildGraphFromCwd`),
  and the SOURCE handler returns them under the field `acceptance_criteria` (length 3) — the
  audit measured a non-existent `acs` key. No parser bug. (acs=0 was a stale-bundle/wrong-field
  measurement artifact.)
- ✅ **G5 — FALSE POSITIVE (RESOLVED 2026-06-08):** `propose_spec_change` requires
  `reason: z.string()` (CHANGE_SHAPE:1005). The "ok=false findings=0" smoke OMITTED `reason`
  → zod-schema reject envelope (no `findings`), not a handler refusal. With `reason` passed,
  a no-op identical `old_string` returns a CLEAR finding ("old_string is not unique (N
  occurrences) — pass replace_all or a longer anchor"). Refusal path is correct.
- ✅ **G6 — FALSE POSITIVE (RESOLVED 2026-06-08):** `get_coverage_summary` returns **54
  specs** grouped by slug (verified live: answer-simple/architecture-decision-builder/…),
  not 2. The earlier specs=2 was a stale-bundle reading.

> **G4/G5/G6 cluster lesson (verify-against-real-artifact):** all three "tool gaps" were
> MEASUREMENT artifacts (stale `server.bundle.mjs` at audit time + a wrong field name `acs`
> + an omitted required `reason`), not code defects. Re-driven through the SOURCE handlers
> (`buildToolRegistry(() => buildGraphFromCwd())`) they are all correct. The two REAL tool
> bugs (find_refs NODE_NOT_FOUND, list_specs nested collapse) plus G1 get_coverage scoping
> were genuine and are fixed. **P19-2 closed: no remaining MCP tool defect.**

## NOT yet covered (honest)

- Full GENERATIVE lifecycle by a LIVE agent under enforce (create→fill all phases→
  CHK/decisions→tasks→run tests→trace→verdict GREEN) end-to-end in ONE agent run.
  Done piecemeal: create_spec ✓, apply_spec_change ✓, read ✓, status reachable ✓,
  honesty gate ✓ — but not one continuous agent-driven build.
- Research skills (`research-workflow`, `architecture-research-workflow`) + the rest
  of the phase docs full MCP-rails refactor (only phase2 fully migrated before this).
- get_coverage spec-scoping: regression test + `spec-graph-query` skill wiring to
  pass `spec`.
- **FR-35a PRODUCER (fork):** nothing writes `.dev-pomogator/.test-quality.json`. The
  consumer chain is live (Stop-gate + get_coverage + spec-verdict all read it via the shared
  `readVerdicts`), but the verdict file is never produced, so the gate only bites a planted
  file. Options: (A) the `strong-tests` skill records its per-task verdict after grading
  (LLM, non-deterministic), (B) a deterministic analyzer stage in the orchestrator, (C) both.
  Needs a user decision — tracked as P19-5 producer residual.

## OPERATIONAL HAZARD (re-hit 2026-06-08): partial cucumber poisons the shared NDJSON

`cucumber.json` writes a SINGLE `message:.dev-pomogator/.last-test-run.ndjson` formatter
that OVERWRITES on every run. Running a FILTERED suite (`--name X` / `--tags @featureN`) to
spot-check one scenario clobbers the canonical run-state with a partial result → `get_coverage`
/ `spec-verdict` then read e.g. passed:6/not_run:159 instead of 136/28. RECOVERY: re-run the
FULL suite (no filter) — it regenerates the complete NDJSON (verified: 137 testCaseFinished,
buckets back to 136/28/skip1, GREEN). RULE OF THUMB: after any filtered cucumber run, re-run
the full suite before trusting any coverage surface. (Same incident the user flagged earlier;
hit again here when binding SPECGEN004_137 — repaired in the same pass.)

## Deep gap-hunt (34-agent adversarial workflow, wf_03852f29) — 20 CONFIRMED

The manual pass found 6; the user said "мало найдено". A 7-area parallel finder +
per-finding adversarial verify (default-refuted) found **27 candidates → 20 confirmed**.

**HIGH:**
- 🔧 FIXED (dbc8241) `find_refs` returned ok:true on a NON-EXISTENT id (fake-positive
  "nothing references this") — now NODE_NOT_FOUND like siblings.
- 🔧 FIXED (dbc8241) `list_specs` regex collapsed nested specs (`backlog/<name>`→`backlog`)
  → 5+ nested specs invisible — now specOf full path + artifact-subdir filter.
- 🔴 **P19-6 FORK (root cause confirmed deterministically 2026-06-08):** spec
  SUBDIRECTORIES are structurally unreachable through the door. `docOf =
  path.basename(String(doc))` (tools.ts:1025) and the list inventory `path.basename`
  (tools.ts:982) STRIP the directory — so `read_spec_doc({doc:"ARCHITECTURE/AXIS-1.md"})`
  → basename `AXIS-1.md` → DOC_NOT_FOUND; `attachments/diagram.png` → `diagram.png` →
  DOC_NOT_FOUND; `../../etc/passwd` → `passwd` (traversal neutralized — good, but also no
  subdir). `apply_spec_change` shares `docOf` → can't WRITE subdirs either. Consumers that
  break under enforce: `architecture-decision-builder` (reads `ARCHITECTURE/AXIS-*.md`),
  `phase2` Step 5c (reads `attachments/<file>` — BINARY, read_spec_doc returns text only),
  `architecture-research-workflow` (writes `.architecture-research/<N>-stage.md`). FORK
  options: (A) extend read_spec_doc/apply_spec_change to accept a traversal-validated
  relative SUBPATH within `.specs/{slug}/` (one door; binary still needs base64) +
  `read_attachment` for binaries; (B) dedicated `read_attachment` (base64) + subdir-md in
  read_spec_doc; (C) a subdir carve-out (raw Read of `.specs/{slug}/{ARCHITECTURE,
  attachments,.architecture-research}/**` allowed under enforce, door stays top-level).
  Needs a user decision.
- 🔧 FIXED (b13b416) `variant-matrix-build` mutated ACCEPTANCE_CRITERIA/{slug}.feature/TASKS
  via raw Write/Edit — now apply_spec_change + MCP read door (mirrors sibling chk-matrix).
- 🟡 `spec-review` Step 1 `ls -t .specs/*/.progress.json` (raw ls) — UNBLOCKED, no fork:
  read_spec_doc DOES serve `.progress.json` (verified live: ok:true, 765 bytes — the audit's
  earlier "md/feature only" was WRONG) and list_spec_docs enumerates it. Migration = list_specs
  + read_spec_doc each `.progress.json` to pick the active spec (loses raw mtime-ordering; pass
  the slug from the caller when known). Mechanical, top-level only.
- 🔧 FIXED (2026-06-08) `get_coverage` never passed `testQualityByTask` → couldn't cap DONE
  with a weak/fake test. Now reads the `.dev-pomogator/.test-quality.json` side-channel via
  a SHARED `readVerdicts` (extracted to `test-quality-gate.ts`, one source of truth for the
  Stop-hook + get_coverage + spec-verdict) and passes it to computeCoverage. Proven with a
  planted WEAK verdict (install-bdd-framework → IN_PROGRESS, test_quality=WEAK). PRODUCER
  (who WRITES the file) remains a fork — see "NOT yet covered".

**MEDIUM:** create-spec SKILL:69 raw Read of .progress.json (UNBLOCKED — read_spec_doc serves
it, mechanical migration); arch-research-workflow
writes stage files 1-7 raw to `.architecture-research/`; arch-decision writes
COMPLETENESS.md/QUEUE.json raw; arch-review-loop edits .specs docs raw; spec-status
Step 5b computes coverage + raw grep + sub-agent raw-read (3); spec-review Step 4
Edit not apply_spec_change; `.architecture-research/` subdir has NO mutation-door path
(MUTABLE_DOC_RE top-level only); **FR-35a test-quality gate — CONSUMER side
REVIVED (2026-06-08)** — spec-verdict now reads testQualityByTask and passes it to BOTH
checkConformance and computeCoverage (was a 2-arg call) → a green-but-weak DONE task surfaces
as TASK_TEST_QUALITY warning + DONE-but-unverified. get_coverage fixed in the same pass
(HIGH above). The remaining INERT half is the PRODUCER: nothing WRITES `.test-quality.json`
yet, so the gate only bites when the file is planted — that's a fork (strong-tests LLM stage
vs deterministic analyzer), see "NOT yet covered".

**LOW:** `DUPLICATE_DEFINITION` finding code declared but never produced
(conformance.ts:361-376 dead `idCount`; test asserts a non-existent contract).

**Cross-cutting themes:** (1) the mutation/read door is TOP-LEVEL-DOC only — spec
SUBDIRECTORIES (ARCHITECTURE/, attachments/, .architecture-research/) have no MCP path,
so every skill using them breaks under enforce; (2) the test-QUALITY honesty layer is
wired in code but dead end-to-end (no producer, no consumer); (3) several authoring
skills (variant-matrix, spec-review, spec-status, arch-*) were never migrated off raw
Read/Write/ls — only the 4-5 from the first slice were.
