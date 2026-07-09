# Spec-generator-v4 / MCP UX session report — 2026-07-09

## Short answer

Yes: the `TASKS.md overstates completion` case is one of the real spec-workflow problems found in this session.

It is not a low-level MCP transport crash. It is a higher-level truth/UX defect: the authored spec can say `Status: DONE`, while authoritative execution evidence still says `passed:0 / not_run:12`. The current tools technically expose the contradiction, but the product UX still lets the user/agent experience it as confusing: `DONE` text, `VERDICT: GREEN`, and `TESTS_NOT_RUN`/`DONE-but-unverified` all coexist.

## Evidence used

- `mcp__dev-pomogator-specs__get_spec_status({ spec: "carl-integration", view: "coverage" })`:
  - `passed:0`
  - `not_run:12`
  - all 12 CARL tasks have `verified_status: IN_PROGRESS` despite the TASKS document marking them DONE.
- `mcp__dev-pomogator-specs__get_spec_status({ spec: "carl-integration", view: "status" })`:
  - `lifecycle: TESTS_NOT_RUN`
  - hint: `12 scenario(s) written but never run/ingested. Next: run the suite so NDJSON lands.`
- `npx tsx tools/specs-generator/spec-verdict.ts -Path .specs/carl-integration --no-semantic` after the small story-link fix:
  - `conformance: 0 error / 18 warning — TASK_STATUS_UNVERIFIED:12, TASK_NO_OWN_SCENARIO:6`
  - coverage buckets: `passed:0`, `not_run:12`
  - `DONE-but-unverified` lists all 12 CARL tasks.
  - final line still says `VERDICT: GREEN`.
- Focused Docker BDD proof did pass, but it was a filtered run and intentionally did not update canonical coverage:
  - command: `SKIP_BUILD=1 bash scripts/docker-bdd.sh tests/features/carl-integration.feature --name "CARL001_(01|02|03|04|05|06|07|08|09|10|11|12)"`
  - result: `16 scenarios (16 passed), 112 steps (112 passed)`
  - artifact: `.dev-pomogator/.docker-status/bdd-run-1783576381-2175189-13144.ndjson`
  - Docker wrapper message: canonical was not updated because this was a filtered run.

## Bugs / defects found or confirmed

### 1. Real spec-generator-v4 bug: transcript todo replay keyed by position, not real task id

**Class:** producer bug in task-census / Stop-gate routing.

Earlier in this same session, the FR-49h work proved that transcript replay of `TaskCreate` / `TaskUpdate` used positional array behavior instead of the real task id. Duplicate/stale agent todos could therefore survive and route the next step incorrectly — specifically, stale CARL evidence work could dominate the next-step queue.

**Impact:** the agent can be pushed toward old or duplicate work even when the current task moved on.

**Fix already implemented in this session:**

- `tools/spec-graph/task-census.ts` now keys replay by real task id.
- Duplicate stale subjects collapse.
- Ambiguous duplicate clusters are demoted.
- `agentOpenTodoCount` excludes ambiguous items.
- `agentNextOpenTodoDetail` skips ambiguous clusters.
- Stop-gate fire logs now include selected todo id/source/transcript/reconciliation metadata.

**Regression proof:** focused Docker BDD passed:

- `SPECGEN004_526`
- `SPECGEN004_527`
- `SPECGEN004_528`
- `SPECGEN004_533`

### 2. TASKS can overstate completion against authoritative evidence

**Class:** status truth / UX defect.

In CARL:

- `.specs/carl-integration/TASKS.md` marks 12 tasks as `Status: DONE`.
- MCP coverage says all 12 mapped scenarios are `not_run`.
- Coverage downgrades each task to `verified_status: IN_PROGRESS`.
- `spec-verdict` reports `TASK_STATUS_UNVERIFIED:12` and `DONE-but-unverified`.

This is the exact issue the user pointed at.

**Why this hurts UX:** the human sees DONE in the task board, then sees `TESTS_NOT_RUN` elsewhere. The system has the truth, but not a single final, unambiguous status label.

**Likely producer:** task authoring/finalization workflow and/or task status mutation path permits `Status: DONE` while mapped scenario evidence is missing.

**Recommended producer fix:** refuse or auto-downgrade task `Status: DONE` when:

- any mapped scenario is `not_run` / `failed` / `undefined` / `ambiguous`, or
- any `Done When` checkbox under the task remains unchecked.

### 3. `spec-verdict` final label is too green for execution-unverified specs

**Class:** verdict semantics / UX defect.

`spec-verdict` says `VERDICT: GREEN` even while it also says:

- `not_run:12`
- `DONE-but-unverified: ... all 12 tasks`
- `TASK_STATUS_UNVERIFIED:12`

The current meaning seems to be “structure + traceability gate are OK”, not “implementation/work is done”. That is technically defensible, but the word `GREEN` is misleading in a workflow where users read green as done/healthy.

**Recommended UX change:** split the final label into separate lanes, for example:

```text
STRUCTURE: GREEN
TRACEABILITY: GREEN
EXECUTION: NOT_RUN
TASK_TRUTH: RED (12 DONE-but-unverified)
OVERALL: NOT_READY
```

or rename the current final verdict to `GRAPH_GREEN` / `STRUCTURAL_GREEN`, not plain `GREEN`.

### 4. MCP `status` and `spec-verdict` disagree on traceability gaps after the story fix

**Class:** status aggregation inconsistency.

After fixing the toothless story, live checks showed:

- `conformance_check(scope=["carl-integration"], severity="info")` returned `count:0`.
- `spec-verdict` said `traceability gate: 0 gaps — gate PASSES`.
- `get_spec_status(view="status")` reported `gaps.UNCOVERED_FR: 9`.

That is a confusing contradiction. If `UNCOVERED_FR` means traceability, it disagrees with `spec-verdict`. If it means “not execution-covered by a passed scenario”, the label is overloaded and should not be named the same as the conformance/traceability class.

**Recommended producer fix:** make `get_spec_status(view="status")` consume the same gap model as `spec-verdict`, or rename execution-derived gaps to something like `FR_NOT_EXECUTION_VERIFIED`.

### 5. MCP `conformance_check` surface is narrower than `spec-verdict` conformance but looks similarly named

**Class:** API contract / UX mismatch.

`conformance_check` returned no findings, while `spec-verdict` reported conformance warnings:

- `TASK_STATUS_UNVERIFIED:12`
- `TASK_NO_OWN_SCENARIO:6`

The tool description for `conformance_check` says it only returns the Phase-1 ruleset (`UNCOVERED_FR`, `ORPHAN_TASK`, `SCENARIO_TAG_ORPHAN`, `UNTAGGED_SCENARIO`). That is internally consistent, but the user/agent sees two “conformance” surfaces with different scopes.

**Recommended UX change:** rename or extend one of the surfaces:

- `conformance_check` → `traceability_check`, or
- add `view:"full"` / `includeVerdictWarnings:true`, or
- make MCP expose `spec_verdict_summary` as the one authoritative truth surface.

### 6. Executable CARL BDD feature drifted beyond the spec source feature

**Class:** source-of-truth drift.

The spec source feature has 12 scenario ids (`CARL001_01..12`). The executable feature contains additional implementation-only scenarios:

- `tests/features/carl-integration.feature:30` — `CARL001_13`
- `tests/features/carl-integration.feature:42` — `CARL001_14`
- `tests/features/carl-integration.feature:52` — `CARL001_15`

The task text also says “Mirror the ten spec scenarios”, which is stale against both the 12 spec scenarios and the executable feature.

**Impact:** BDD can be greener/richer than the spec graph knows. The spec source no longer fully explains what the executable suite proves.

**Recommended producer fix:** add a sync checker:

- every executable `CARL001_NN` must have a matching source scenario or explicit `[EXEC_ONLY]` / `[OUT_OF_SCOPE]` marker;
- every source scenario must have an executable counterpart;
- scenario count phrases like “ten scenarios” should be treated as stale when actual count differs.

### 7. Filtered Docker BDD run proof is hard to connect back to spec coverage

**Class:** evidence ingestion UX.

The focused CARL Docker BDD run passed. But because filtered runs are clobber-safe, they intentionally do not update `.dev-pomogator/.last-test-run.ndjson`. The MCP coverage therefore remains `not_run`.

This is correct for canonical coverage, but painful for review work: the agent has to manually parse the filtered artifact to prove what happened.

**Recommended UX change:** keep canonical full-run semantics, but add a first-class “review evidence” lane:

- `get_spec_status(view="coverage", include_filtered_evidence:true)`
- or `attach_test_artifact(spec, artifact, mode:"filtered-proof")`
- or a status note: “latest filtered proof exists: 12/12 CARL source scenario ids passed, but canonical coverage remains not_run until a full run.”

### 8. `read_spec_doc(section=...)` exact-section behavior is too brittle

**Class:** MCP read UX.

Earlier in the session, reading section `Phase 32b` failed with `SECTION_NOT_FOUND`. The doc had relevant content, but the section lookup required an exact heading match.

**Recommended UX change:** on `SECTION_NOT_FOUND`, return nearest candidate headings and maybe allow fuzzy matching:

```json
{
  "error":"SECTION_NOT_FOUND",
  "candidates":["Phase 32b: ...", "## Phase 32", "### P32-5 ..."]
}
```

### 9. Bash/statusline failure blocked normal CLI verification

**Class:** surrounding toolchain pain, not strictly MCP.

Several ordinary Bash calls failed with:

```text
/usr/bin/bash: line 228: TEST_STATUSLINE_P: command not found
```

That forced the session to route verification through `ctx_batch_execute` instead of normal Bash. It made spec verification slower and noisier.

**Recommended fix:** inspect statusline/test env generation for an unquoted/truncated `TEST_STATUSLINE_*` assignment. This is not a spec-generator-v4 logic bug, but it directly hurts spec-generator UX because `spec-verdict`, Docker BDD, and local probes are CLI-heavy.

### 10. Stop hook next-step gate is too global for report/review moments

**Class:** workflow UX.

After a review answer, the stop hook blocked because there was “unclosed work” and no `Дальше:` section. The immediate practical fix was to perform a concrete next step: I fixed the toothless CARL story via the MCP door and verified the warning disappeared.

**Pain:** the gate is right to enforce concrete continuation, but it can feel global rather than scoped to the just-completed task/report. It treats broad corpus backlog as unfinished work unless the answer contains a concrete next step.

**Recommended UX change:** make the gate current-task-aware:

- if the active task was just completed, allow a final report without forcing another project task;
- if global backlog remains, require `Дальше:` only when the answer claims the broader work is done;
- when it blocks, suggest the exact next action it expects.

## What was actually improved during this report cycle

I fixed the concrete `TOOTHLESS_STORY` issue in CARL via MCP:

- Changed `.specs/carl-integration/USER_STORIES.md` User Story 5 to add:
  - `**Требование:** [FR-8](FR.md#fr-8-review-audit-and-reporting)`
- `apply_spec_change` succeeded with no findings.
- Post-fix checks:
  - `conformance_check(... severity:"info")` → `count:0`
  - `spec-verdict` warning count dropped from 19 to 18.
  - `TOOTHLESS_STORY` disappeared.

## Top UX improvements to build next

### P0 — Stop saying plain GREEN when execution is not verified

Make verdict output multi-lane and change the final label when any task is DONE-but-unverified.

Target UX:

```text
STRUCTURE: GREEN
TRACEABILITY: GREEN
EXECUTION: NOT_RUN (12 scenarios)
TASK_TRUTH: RED (12 DONE-but-unverified)
OVERALL: NOT_READY
```

### P0 — Fix/clarify `get_spec_status(view="status")` gap semantics

`UNCOVERED_FR=9` from status while `spec-verdict` says `traceability gate: 0 gaps` is a trust-breaker. Either use the same model or rename the status gap.

### P1 — Add task DONE guard

A task should not remain textually `Status: DONE` if:

- its own `Done When` checklist has unchecked boxes, or
- mapped scenarios are not all passed in canonical coverage.

This can live in form guards, `set_entity_status`, `spec-verdict`, or all three.

### P1 — Add source/executable BDD scenario sync check

For every `tests/features/<slug>.feature`, compare against `.specs/<slug>/<slug>.feature`:

- missing executable scenario;
- executable-only scenario;
- stale scenario count language;
- mismatched FR tags.

### P1 — First-class filtered evidence display

Filtered runs should not poison canonical coverage, but review UX needs a place to show them. Add “latest filtered proof” to `get_spec_status(view="coverage")` or a separate MCP tool.

### P2 — Section read suggestions

Make `read_spec_doc(section=...)` return candidate headings on miss.

### P2 — One consolidated MCP status surface

Expose what agents currently synthesize manually:

- structural/audit result;
- traceability gaps;
- coverage buckets;
- task truth (`DONE-but-unverified`);
- latest filtered run proof;
- exact next command.

## Session pain summary

The biggest pain was not lack of data. The data existed in the graph, verdict, coverage, Docker artifacts, and task census. The pain was that it was split across too many surfaces with slightly different vocabularies:

- `TASKS.md` says DONE;
- MCP coverage says IN_PROGRESS / not_run;
- `spec-verdict` says GREEN but warns DONE-but-unverified;
- focused Docker BDD says passed but cannot update canonical coverage;
- executable feature has scenarios that spec source does not know about;
- status view and verdict disagree on `UNCOVERED_FR` semantics.

The UX goal should be: one command/tool gives a single honest sentence:

> “CARL spec is structurally/traceably OK, has filtered proof for the focused executable scenarios, but is NOT execution-verified canonically; 12 tasks are text-DONE but evidence-IN_PROGRESS; next action is a full Docker BDD run or explicit filtered-artifact attachment.”
