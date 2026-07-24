# spec-generator-v4 closure program — 3-surface map (READ-ONLY)

Date: 2026-07-23 · Scope: tools/, scripts/, .claude/skills/, .claude/agents/, .claude/rules/

---

## SURFACE 3 — Task-truth (FR-48 + task-census): killing the TASKS.md `DONE` split-brain

The split-brain = a task self-reports `Status: DONE` (or `- [x]`) in `TASKS.md` while its
scenarios never passed / never ran. Resolution = **never trust the checkbox**; derive truth
from the spec-graph and re-check DONE against scenario results.

### DONE-string recognition
- `tools/spec-graph/parsers/tasks.ts` `headerOf` (L32-38): a line is a Task node ONLY if it has
  BOTH `id: <slug>` AND `Status: <TODO|READY|IN_PROGRESS|DONE|BLOCKED>` (regex L34-35).
  `STATUS_MAP` (L23-29) maps the string → `todo|ready|in-progress|done|blocked`. `DONE` → `'done'`.
- A header WITHOUT `id:` is silently skipped (loose task, not tracked) — deliberate scope.

### add-task-ids (the id backfiller)
- `scripts/add-task-ids.ts`: rework helper (P21-6 dogfood) inserting `— id: t<nn>` into loose
  `Tnn:`-prefixed headers (`addTaskIds`) or ANY `— Status:` header (`addTaskIdsAnyHeader`).
  **Status-preserving** (never touches the status word), **CRLF-safe** (`[^\r\n]*?` single-line),
  **idempotent** (header already carrying `id:` is left as-is), **child-safe** (only header lines,
  never Done-When sub-checkboxes). Docstring is explicit: it does NOT fake honesty — the census
  independently re-checks each task against its scenarios.

### task-census (the truth engine)
- `tools/spec-graph/task-census.ts` `computeTaskCensus` (L80-141). Three signals that don't trust
  `- [x]`, per spec:
  - **open** — status todo/in-progress/blocked (author-admitted not-done).
  - **doneRed** — `done` BUT ≥1 mapped scenario in a HARD-NEGATIVE bucket (`failed`/`undefined`/
    `ambiguous`, L73). `not_run`/`stale` EXCLUDED so a filtered/partial cucumber run can't false-flag
    red (the "partial NDJSON poisons the gate" hazard).
  - **doneUnrun** — `done` but NOT all-passed and NOT red (≥1 not_run/stale, OR no scenario, OR a
    coverage `truth_issues` entry) → "claimed done, can't confirm" — surfaced, not hidden.
- **GRAPH-ONLY**: reuses `mapTasksToScenarios` + `bucketScenarios` + `computeCoverage` — the SAME
  machinery `get_coverage` uses → the census never diverges from the verdict (single source).
- Cached to `.dev-pomogator/.task-census.json` (+ `.prev` rotation, atomic temp+rename) by the MCP
  watcher (`tools/spec-mcp-server/lifecycle.ts`, enforce path) and `spec-conformance-push` (raw
  Write|Edit); read by the per-prompt banner (`tools/specs-validator/conformance-summary.ts`).
  Graph is NEVER built on the hot UserPromptSubmit path (NFR-Performance-6).
- Live census (`.dev-pomogator/.task-census.json`, ts 2026-07-23T13:09): **total open 248, doneRed
  13, doneUnrun 242**; spec-generator-v4 alone = open 36 / doneRed 0 / doneUnrun 206.

### FR-49d stale-marker reconciler
- `findStaleInProgress` (L162-201): an `in-progress` task whose mapped scenarios ALL passed =
  evidence the marker drifted. **FLAG-ONLY, never auto-close** (false-green guard). Precision guard
  L193: only flags a task citing its OWN `SPECGEN004_NN` scenario id — a task mapping only via its
  FR-ref (FR-32 over-map) is NOT flagged, else the reconciler itself emits false-green.

### FR-9 session scoping (anti-over-fire) + next-step routing
- `scopeCensusToSlugs`, `sessionEditedSpecSlugs` (L308), `lastEditedSpecSlug` (L357): scope the
  census to specs THIS session wrote to (parsed from the transcript's tool_use records). A
  `.feature` (test-authoring) edit does NOT take ownership of the spec's impl backlog.
- `liveOpenForUncensusedSlugs` (L274): fail-open count for freshly-created specs the cache predates.
- K3 `parseAgentTodos`/`agentOpenTodoCount` (L505/L627): reconstructs the agent's OWN TodoWrite/Task
  list from the transcript — non-spec declared work also arms the gate.
- `selectNextStepRoute` (L683): priority agent-todo → active-async → current-spec; NEVER falls back
  to the corpus' busiest `specs[0]` (the leak that bled WS-F backlog into unrelated sessions).

### task-status skill (FR-48 — the validated write door)
- `.claude/skills/task-status/SKILL.md`: status is NOT set by hand-editing `Status:` — it goes
  through ONE door tool `set_entity_status`, which validates the move.
- Machine (FR-48a): `todo → ready → in-progress → done`; `blocked` from any active; `done →
  in-progress` reopen. **No skip-to-finish** (`todo→done`, `ready→done` rejected).
- `CHAIN_NOT_ASSEMBLED` (missing FR legs: AC/scenario/Decision/Story) refuses a start; `[spec-phase]`
  marker exempts tasks that AUTHOR legs (anti-deadlock). `STATUS_DERIVED` for computed entities
  (FR/story/decision/spec) — returns the live verdict instead. `set_spec_status` marks a whole spec
  `backlog`/`active`; a `backlog` spec is EXCLUDED from the census.
- The floor: even a raw `Status:` flip raises conformance `TASK_STARTED_WITHOUT_CHAIN` — the door is
  ergonomic, the conformance gate is the floor.

---

## SURFACE 4 — Cross-spec governance (FR-17/FR-18): detecting & governing edits to ANOTHER spec

### cross-spec-reconcile (the analyzer)
- `.claude/skills/cross-spec-reconcile/SKILL.md`: scans every `.specs/<slug>/` against every other
  + the codebase, surfacing **28 classes of drift** (uncovered claims, contradictions,
  runtime-identifier mismatch, missing files, foreign-spec edits, decision-vs-reality).
- Two modes: `light` (mechanical, <5s, no LLM) and `full` (adds Phase-3 LLM-as-judge pairwise
  FR/AC compare, cached by sha256(spec_a+spec_b), FR-26 deny-list before any spawn).
- Output: per-spec `.specs/<slug>/consistency-report.yaml` (+ optional `.sarif`). Findings carry
  `code`+`class`+`severity`. CRITICAL subset blocks STOP via `AskUserQuestion` (header `⚠️ CRIT`);
  WARNING/INFO surface but never block.
- CRITICAL override → appends `acknowledged_by/override_reason/override_timestamp` to the YAML AND a
  parallel line to `.claude/logs/cross-spec-overrides.jsonl` (audit). **That log does not exist yet
  = zero overrides have ever been recorded.**

### cross-spec-resolve (the interactive walker)
- `.claude/skills/cross-spec-resolve/SKILL.md`: 7-step loop over the report. Per finding emits a
  5-field block (code/severity/class · files/lines · plain-language · WHY · options), then applies
  the chosen fix. Path A/B/C for `architectural-decision-vs-reality` (update spec / update code /
  defer OUT_OF_SCOPE).
- **Foreign-spec detection** lives in `scripts/walker.ts` `buildExplanation` (L135-152):
  `requiresForeignSpecConfirm = class==='architectural-decision-vs-reality' || spec_a/spec_b not
  under .specs/<currentSlug>`; `foreignSpecBanner = "⚠️ This edits foreign spec: <path>"` when a
  target path starts with `.specs/` but NOT `.specs/<currentSlug>/`. Step 6 fires the extra
  "This edits a foreign spec — continue?" confirm; "No" demotes to `deferred`.
- MCP-rails (FR-39/FR-40): every `.specs/` write goes through `apply_spec_change`, never raw Edit;
  only Path B (impl code) uses Edit. Step 7 re-runs reconcile(full) once and stamps each finding's
  outcome `resolved`/`still_present`/`transformed`.

### owner-picker resolver (ownership-conflict, mechanical)
- `tools/spec-backlog/resolvers/owner-picker.ts`: given two specs claiming the same path, runs
  `git log --follow --diff-filter=A --reverse` to get the path's FIRST-COMMIT date, compares against
  each spec's creation date (`.progress.json` `created_at` else dir birthtime), recommends the spec
  CLOSEST in time as canonical owner → writes `<winner>/OWNERSHIP_RECOMMENDATION.md` (advisory,
  confidence 0.65). **Idempotent** (existing file → bail `already-exists`). Bails cleanly on
  missing specs / path mismatch / untracked path / git error. Registered in `registry.ts` alongside
  ac-author, link-fixer, scenario-writer, fr-author, decision-arbiter, cross-ref-linker,
  wrap-deprecated-ref (8 resolvers).

### spec-backlog skill (the at-scale pipeline)
- `.claude/skills/spec-backlog/SKILL.md`: drives `dev-pomogator-spec-backlog` CLI — finding →
  classifier (AUTO_FIX/BACKLOG/NOISE) → `.dev-pomogator/.specs-backlog/<DATE>.jsonl` (append-only,
  sha256 entryId, latest-line-wins) → specialist resolver → `.md` skeleton OR recommendation file →
  entry resolved. Replaces "3,878 AskUserQuestion calls". Rule: don't resolve ownership-conflict /
  contradictory-nfr without showing the recommendation to the user first (they produce advice, not
  direct mutations).

---

## SURFACE 5 — BDD-only migration (FR-51 / FR-M1 / FR-M5): the staged PreToolUse block

### bdd-only-test-guard (the staged file-level hook)
- `tools/bdd-only-test-guard/guard.ts` (builtins-only, fail-open, PreToolUse on Write|Edit):
  - **DENY** `Write` of a **NEW** non-BDD test file (`*.test.ts`/`*.spec.*`/`test_*.py`/`*_test.py`/
    `*_test.go`/`*Tests.cs`/`*Test.cs`; Reqnroll `*Steps.cs` is BDD → allowed).
  - **ALLOW** Edit/MultiEdit of an EXISTING non-BDD test (staged: the tail is migrated & deleted over
    time). Always-allow: `*.feature`, `tests/step_definitions/`, `tests/hooks/`, fixture trees.
  - **FR-10 shrink-only**: an edit to an existing non-BDD test may NOT raise its test-case count
    (`countTestCases` pre vs post) — the tail only shrinks.
  - **Escape (logged, anti-gaming)**: `BDD_ONLY_SKIP=1` → allow + record to
    `.claude/logs/bdd-only-escapes.jsonl`. **That log does not exist = zero escapes used.**
- Decision logic is the pure exported `bddOnlyDecision(tool, filePath, exists)` + `shrinkOnlyDeny`,
  both BDD-tested.

### Rules
- `.carl/rules/bdd-only/bdd-only-tests.md`: goal = **zero `*.test.ts`**; new test work → BDD;
  describes the guard + the "how to write a BDD test instead" recipe + the backlog-scaffolding ≠
  migration-target carve-out (`_artifact/__fixtures__/`).
- `.carl/rules/pomogator/no-host-bdd-runs.md`: ANY cucumber/BDD run is Docker-ONLY (owner directive
  2026-06-24 "literally nothing on the host"). 3 enforcement layers: (1) PreToolUse `test_guard.ts`
  `[test-guard:host-bdd]` denies any host cucumber/run-bdd (full/`--name`/`--tags`/`--dry-run`);
  (2) `scripts/run-bdd.mjs` refuses outside Docker (`DEV_POMOGATOR_TEST_IN_DOCKER!=1`); (3)
  `tests/hooks/ensure-docker-bdd.ts` throws at cucumber load outside Docker. Basis: a host full run
  overwrites the canonical `.last-test-run.ndjson` with isolation-artifact garbage → poisons
  census/verdict corpus-wide.

### bdd-migrator (skill + agent + planner)
- `.claude/skills/bdd-migrator/SKILL.md` + `.claude/agents/bdd-migrator.md`: per-spec conveyor —
  plan (`migrate.ts`) → classify each behaviour **runtime/artifact/manual** → fix comment-tags to
  REAL `@featureN` (mapped to the FR the scenario's SUBJECT tests) → author REGEX step-defs driving
  the REAL code (real fixtures, no mocks) → validate via a **TEMP config + Docker** (never the
  canonical `cucumber.json`, never a host run; a `--dry-run` into the canonical NDJSON poisons the
  honesty gate) → collision `--dry-run` (0 ambiguous across EVERY feature) → wire (`wire-feature.mjs`,
  O_EXCL lock) → mutation gutcheck → delete the vitest twin (**refusing to migrate is forbidden**).
- Spawns ONE fresh `bdd-migrator` agent PER SPEC (context-decay defence), run SEQUENTIALLY (all
  step-defs share one import glob → concurrent half-written files cause spurious ambiguous steps).
- `tools/bdd-migrator/corpus.ts` (FR-M5 roadmap): walks for `*.test.ts`, inventories each
  (pure/runtime/artifact/manual), ranks ease, and separates **wired** (spec's `.feature` already in
  `cucumber.json` → migrated, kept twin) / **twin-candidate** / **net-remaining**. `SKIP_DIRS`
  excludes node_modules/.git/fixtures/__fixtures__/.specs.

### Live migration state (measured 2026-07-23)
- **46** features wired in `cucumber.json` (`tags: not @wip and not @manual and not @windows-only
  and not @e2e`); **159** step-definition files.
- Main-tree non-BDD `*.test.ts` remaining: **84** (13 in `tests/e2e` = real suite twins; the rest
  co-located unit tests under `tools/*` and `.agents/skills`).
- ⚠️ **Roadmap overcount**: `corpus.ts` as-run reports `fileCount 4472 / netCount 4414`, but
  **4388 of those live in `.claude/worktrees/`** (parallel-session git-worktree checkouts the walk
  doesn't skip). The honest main-tree tail is ~84 files, not ~4414 — the roadmap "REAL remaining"
  number is inflated ~50× by worktree duplicates (a real corpus.ts gap worth a `SKIP_DIRS` entry).
- Honesty feed: `.dev-pomogator/.last-test-run.ndjson` = 117,385 lines (~38 MB, last full Docker run
  2026-07-23 01:04) — the canonical cucumber NDJSON the census/verdict reads.
- `BDD_ONLY_SKIP` escapes logged: **0** (`.claude/logs/bdd-only-escapes.jsonl` absent).
