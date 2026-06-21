---
name: bdd-migrator
description: Migrate a spec's non-BDD (vitest) tests to traceable @featureN cucumber scenarios so coverage is visible in the spec graph (zero orphan tests, zero uncovered specs). An evolution of strong-tests §6.5. Use when a spec has a .feature with comment-tags / no step-defs / unwired, or vitest tests that are graph-invisible orphans. Drives the proven pilot conveyor: classify → fix tags → author real step-defs → wire → green → mutation-check → delete vitest. Adaptive across specs; ships for users running it on their own repos.
allowed-tools: Read, Grep, Glob, Bash, Write, Edit, mcp__dev-pomogator-specs__read_spec_doc, mcp__dev-pomogator-specs__list_spec_docs, mcp__dev-pomogator-specs__get_trace, mcp__dev-pomogator-specs__get_coverage, mcp__dev-pomogator-specs__apply_spec_change
---

# bdd-migrator — migrate one spec's tests to traceable BDD (FR-M1)

Centralise a spec's tests on BDD so every test is a graph node (traceable): no orphan tests,
no uncovered requirements, coverage visible. The conveyor below is exactly what the
answer-simple pilot proved (retrospective finding #11) — follow it, don't reinvent per session.

## When to invoke
- A spec has a `.feature` whose tags are `# comments` (graph-invisible), or no step-defs, or is
  not in `cucumber.json` `paths`.
- A spec has vitest tests that `project-test-trace.ts` reports as orphans (no backing scenario).
- The owner asks to migrate a spec / batch of specs to BDD-only.

## Inputs
- `slug` — the spec to migrate (e.g. `skill-listing-budget`).

## The conveyor (per scenario — author → run → green → flip; NEVER flip first)

1. **Plan (deterministic).** Run the inventory tool — it tells you exactly what is left:
   ```
   npx tsx tools/bdd-migrator/migrate.ts --spec <slug>
   ```
   It reports: `.feature` scenarios + tag state (real/comment/none), whether wired, and each
   vitest test classified `runtime` / `artifact` / `manual` (the three classes below).
2. **Classify each behaviour** (the tool seeds this; confirm by reading the real test/code):
   - **runtime** — exercises a real engine (imports a `tools/` module & calls it, or spawns a
     hook/CLI). → step-def calls the REAL engine (no mock, no inline copy). Strongest; mutation-checkable.
   - **artifact** — only inspects file structure. → step-def reads the real file & asserts its
     shape (same strength as the vitest, now graph-traceable). If the scenario prose claims agent
     behaviour, REWRITE it (via the door) to describe the verifiable artifact before writing the step-def.
   - **manual** — needs a live session / has no automation hook (`it.skip`). → tag the scenario
     `@manual` and leave it out of the gate. NEVER fake it green.
3. **Fix tags → real, scoped to the right FR.** Comment tags (`# @featureN`) are invisible to the
   graph. Convert to a real tag LINE via `apply_spec_change`. Tag with the FR the scenario actually
   tests (`@feature<N>` ↔ `FR-N`, or `@FR-N`) — NOT a group number (answer-simple's @feature4 group
   tested FR-8 but the edge lands on FR-4: wrong). Mark not-yet-done scenarios `@wip`.
4. **Author the step-def** under `tests/step_definitions/feature_<slug>.ts`, 1:1 with the
   scenarios. Use REGEX step patterns (not Cucumber Expressions) so literal `/`, backticks and `{}`
   match verbatim. Honour strong-tests §2 + §5 (specificity, no parallel-impl, self-challenge).
5. **Validate via a TEMP config FIRST — never the canonical run, never the shared `cucumber.json`.**
   Before touching anything shared, prove the step-defs green in isolation. Write a throwaway config
   (Write tool, NOT heredoc — under enforce a heredoc with `.specs/` is denied) e.g.
   `.dev-pomogator/.tmp/cuke-<slug>.json` with `paths:[the .feature]`, `import` = the SAME globs as
   `cucumber.json` (`tests/step_definitions/**/*.ts` + `tests/hooks/**/*.ts`), and
   `format:["message:.dev-pomogator/.tmp/<slug>.ndjson"]` — a TEMP ndjson, **NEVER**
   `message:.dev-pomogator/.last-test-run.ndjson` (a filtered/partial run into the canonical file
   poisons every other session's honesty gate). Run:
   `node --import tsx node_modules/@cucumber/cucumber/bin/cucumber.js -c .dev-pomogator/.tmp/cuke-<slug>.json --name "<id-regex>"`
   (the `.specs/` path lives in the config FILE, so it never hits the command line → the spec-access
   guard stays quiet). Iterate to all-green.
   > **Quick filtered diagnostic against the DEFAULT config** (re-running one scenario from the full
   > suite, NOT this isolated temp-config validation) — use `node scripts/run-bdd.mjs --name "<id>"`,
   > **never** raw `node … cucumber.js --name` against `cucumber.json`. The wrapper routes a filtered run
   > to a throwaway ndjson (canonical `.last-test-run.ndjson` left intact) and archives every run to
   > `.dev-pomogator/.test-history/` with timings (FR-52a). A bare `--name` against the default config
   > overwrites the canonical with a partial result → every other spec then reads `not_run`.
6. **Collision dry-run — your step-def file is loaded by the WHOLE suite.** `tests/step_definitions/**`
   is one global namespace; a too-broad regex hijacks another feature's step (ambiguous → main suite
   breaks). Scope every regex to THIS spec's vocabulary, then prove it: `--dry-run` over a **TEMP
   config** whose `paths` = the existing `cucumber.json` `paths` **PLUS your new `.feature`**, and confirm
   **0 ambiguous / 0 undefined ACROSS EVERY listed feature — not just your own scenarios** (all "skipped"
   = all matched). The breadth matters: a GENERIC assertion you add (`hook should exit with code 0`,
   `stderr should contain "…"`, `file should exist`) does NOT collide for your scenarios — it makes
   ANOTHER already-wired feature's identical step ambiguous, so the red lands on THEIR scenarios, which a
   `--name`-filtered solo check never runs. (Dogfood 2026-06-21: test-statusline's generic
   `hook should exit with code 0` silently made all 8 of auto-capture's exit-code steps ambiguous in the
   canonical run; invisible until a full-suite census, fixed by renaming the def to the spec-scoped
   `SessionStart hook should exit with code 0`.) Fix any collision by RENAMING the offending pattern to
   spec-scoped vocabulary (preferred) or a negative lookahead (disambiguates in-process vs spawn vs repeat
   Whens — see gotchas). Generic assertion text is a collision magnet — always prefix it with the spec subject.
   > 🚫 **CLOBBER TRAP (observed live 2026-06-19):** the dry-run config MUST set
   > `format:["message:.dev-pomogator/.tmp/<slug>-collision.ndjson"]` (a throwaway) — do **NOT** run the
   > default `cucumber.json` directly (`node … cucumber.js` with no `-c`, or `-c cucumber.json`). The
   > default config's format writes the canonical `.dev-pomogator/.last-test-run.ndjson`, and a
   > `--dry-run` produces an **all-skipped** ndjson → it overwrites the real run, so the spec-graph
   > census reads every scenario as `not_run` (poisons the honesty gate for ALL specs). A dry-run looks
   > harmless because nothing executes — but it still WRITES the result file. Copy the paths into your
   > temp config (Write tool); never point cucumber at `cucumber.json` for a partial/dry run.
7. **Wire — only when ALL scenarios are green AND `cucumber.json` is shared-tree-safe.** Add the
   `.feature` to `cucumber.json` `paths` (keep `"tags": "not @manual"` + `not @wip` while staging) ONLY
   after every scenario has a step-def (else mass-UNDEFINED) **and** `git status --short cucumber.json`
   is clean — if a PARALLEL session has it `M` (e.g. mid-migrating another spec), DO NOT edit it
   (you'd entangle their uncommitted work); wait for it to settle, that is a legitimate block, say so.
   Real-tag + wire TOGETHER: a real-tagged-but-unwired COVERAGE tag (`@featureN`) shows `not_run` and
   bumps the spec's `doneUnrun`, so defer it. BUT real-tag the CONTROL tags (`@manual` / `@wip`) AT
   WIRING regardless — `cucumber.json` gates on `"tags": "not @manual and not @wip"`, and a
   comment-`# @manual` is invisible to that filter, so a live-TUI/manual scenario would RUN as
   UNDEFINED → RED in the gated suite. (Dogfood: the tui-test-runner agent left 6 live-Textual
   scenarios as `# @manual` comments — correct intent, but they must become real `@manual` at wiring
   or they redden the gate.) Then run the FULL suite once (no `--tags` override) so the
   `"not @manual"` filter applies and `.last-test-run.ndjson` is complete.
8. **Mutation gutcheck (runtime class).** Break the engine under test, re-run, confirm the scenario
   goes RED, restore. A scenario that survives a real mutation is FAKE-POSITIVE-RISK, not a deliverable.
   (`.claude/skills/strong-tests/evals/run-evals.ts` is the reusable rubric.)
9. **Verify traceability + retire vitest — but NOT every twin is retirable.** `npx tsx
   tools/bdd-migrator/migrate.ts --spec <slug>` should now show wired + all real tags.
   `project-test-trace.ts` should show no orphans for the spec. Only THEN delete the superseded
   `tests/e2e/<slug>.test.ts` (BDD parity reached), and confirm the full Docker suite (`npm test`) still
   passes. THREE classes MUST STAY vitest — keep + document, never migrate/delete: (a) **Stryker mutation
   kill-surface** — Stryker traces vitest, not cucumber, so deleting a unit test the `stryker*.config.mjs`
   `mutate` field targets kills mutation coverage even if a coarse BDD scenario "covers" it (e.g.
   strong-tests' `detect-invariant-candidates-unit.test.ts` ≈56 cases); (b) **env-dependent twins**
   (gh/docker shell-mocks, Docker-only) — keep until the BDD form is green in the canonical Docker run;
   (c) **invariant-guard static scans** with no prod function to drive. A large `migrate.ts --batch` `U:`
   on such a spec is NOT a backlog — classify each as keep-with-reason; do NOT author fake BDD twins to
   zero it.
10. **Commit YOURS only — path-limited.** A bare `git commit` commits the WHOLE index incl. a parallel
    agent's staged files (incident 8ab1d22). So: clean the repo root of stray artifacts first (the
    `forbid-root-artifacts` pre-commit hook blocks ANY commit otherwise) → `git add <your explicit
    paths>` (untracked files MUST be added; never `git add -A`) → `git diff --cached --name-only` to
    confirm staged == only yours → `git commit -m "msg" -- <your explicit paths>` (`-m` BEFORE `--`;
    everything after `--` is a pathspec, so the commit is immune to foreign staged work). NEVER bare
    `git commit`. Full discipline in the agent definition `.claude/agents/bdd-migrator.md`.

## Never
- Fake a manual/agent-behaviour scenario green with a file-check that doesn't test the claim.
- Author in `tests/features/` (never executed → fake-green) — scenarios live in `.specs/<slug>/<slug>.feature`.
- Flip/delete vitest before the BDD equivalent is green in a FULL run.
- Tag with a group number when the scenario tests a different FR (breaks traceability).
- Touch `.specs/` with raw file tools — feature/TASKS edits go THROUGH the door (`apply_spec_change`).

## Dogfood-hardened gotchas (spec-reality-check, 2026-06-18 — 20/20 green)

Migrating spec-reality-check end-to-end surfaced these; they recur — apply them up front.

- **Spawn the real CLI with `node --import tsx`, NOT `npx`.** A step-def that spawns the tool as a
  CLI must use `spawnSync(process.execPath, ['--import','tsx', SCRIPT_ABS, ...args], {cwd: REPO_ROOT})`.
  `npx tsx` does NOT resolve in a Windows host spawn (empty stdout → silent failure), and `--import
  tsx` needs `node_modules`, so cwd MUST be the repo root, not the per-scenario tmpdir. Capture
  `res.stdout`/`res.status`; assert on those.
- **chalk strips ANSI when stdout is not a TTY.** A `--format human` spawn emits NO escape codes —
  assert on the textual marker the tool prints (e.g. a header line / the finding's check name), never
  on raw ANSI. (Migrate to what the tool REALLY emits — confirm by running the binary once by hand.)
- **The `.feature` prose is often decorative / inconsistent — reconcile against REAL code, then FIX
  the `.feature` via the door.** Real cases hit: a fixture named bare (`` `missing-edit/` ``) in one
  scenario and by full path (`` `tests/fixtures/.../stale-create/` ``) in another → the fixture-copy
  Given must capture the BASENAME from either (`` /`[^`]*?([\w-]+)\/`/ ``); the same `--format json`
  wording used by an in-process scenario AND a spawn scenario → disambiguate with a negative lookahead
  (`/^запущен (?!.*--format).*verify\.ts/` for the in-process When); an assertion claiming behaviour
  that does not happen (the hook "writes a stderr warning" — it actually fails open SILENTLY: verified
  exit 0 + 0-byte stdout AND stderr). When the prose lies, run the real artifact, then correct the
  scenario via `apply_spec_change` so it asserts reality (and note why in the reason).
- **Reconcile `.feature` ↔ the vitest twin BOTH ways before declaring parity.** Scenarios live in one
  but not the other (spec-reality-check: SRC002 invariants were in the vitest but NOT the `.feature`;
  SRCHOOK was in the `.feature`; a second vitest file `*-hook.test.ts` held more). Enumerate every
  `it()` across ALL the spec's vitest files; ADD the missing scenarios via the door; only "all tests
  have a BDD twin" is parity.
- **Drive the REAL exported function in-process where you can** (deterministic, fast, no spawn): import
  `runChecks` / the parse helpers and call them; reserve spawn for scenarios that genuinely assert CLI
  behaviour (output formats, the hook). Per-scenario isolation comes free from the `V4World` Before
  hook's fresh `tempDir`.
- **Step-def signature: `function (this: World, a, b)` — `this:` is a TYPE ANNOTATION; cucumber BINDS the
  World, it does NOT pass it as an argument.** The capture groups ALONE are the params. NEVER write the
  World as a real first param (`function (world, a, b)` / `function (_w, a, b)`) — that shifts every
  capture by one AND makes cucumber treat the trailing param as a `done` callback that is never called →
  the step TIMES OUT at 30s or reads the wrong capture. (Dogfood 2026-06-20: a fold step
  `function (_this, name, paths)` read `paths` as the fixture name → ENOENT; an `isDocsOrTestsOnly` step
  → 30s timeout. The capturing groups are the only arguments.)

## Field-validated additions (GitHub research + this session's dogfood, 2026-06-18)

Cross-checked against external BDD-for-AI practice; folded the genuinely-transferable parts only.

- **Spawn a FRESH agent PER SPEC — context decay is real.** ATDD-for-Claude-Code
  (swingerman/disciplined-agentic-engineering) uses "a fresh-per-phase agent team" precisely to stop
  one agent accumulating context decay across a long job. This session's dogfood confirmed it: a
  single agent hand-migrating a whole spec over a very long turn degraded. So the rollout spawns ONE
  dedicated `bdd-migrator` agent PER SPEC (`subagent_type: bdd-migrator`, see `.claude/agents/bdd-migrator.md`),
  not one marathon agent — each starts clean with just its `slug`.
- **Run the rollout SEQUENTIALLY (one spec at a time), not many agents at once.** All step-def files
  share the `tests/step_definitions/**` import glob, so the collision `--dry-run` loads EVERY agent's
  file — including another concurrent agent's HALF-WRITTEN file → spurious parse/ambiguous failures
  that aren't yours. Finish + review one spec before launching the next. (Dogfood: running
  tui-test-runner + spec-variant-matrix concurrently put two in-flight files in the shared glob at
  once — exactly this hazard.) If you MUST parallelize, scope each agent's collision-check temp config
  `import` to the STABLE step-defs + its own new file, never the whole glob.
- **Keep the gates DETERMINISTIC, not prompt-only.** Same source enforces exit criteria via scripts,
  not trust. Our gates already are real runs, not prose: `migrate.ts --spec` (work-list), the temp-config
  cucumber run (green), the `--dry-run` (0 ambiguous), the mutation gutcheck (RED-on-break). Never
  downgrade a gate to "I checked it" — run it.
- **Scenario writing (gherkin-guidelines-for-ai, AutomationPanda): one behaviour per scenario,
  CONCRETE values (no placeholders — mirrors FR-49f), declarative/domain language ("what", not "how").**
  CAVEAT for migration: a scenario migrated from a UNIT-invariant test (e.g. `parseFileChangesTable`
  cardinality) is inherently technical — keep those minimal+technical; reserve declarative domain
  language for behavioural scenarios. Don't force business prose onto a parser-invariant test.
- **The duplicate-step pitfall is industry-known.** "AI rephrases/recreates steps → step-defs become
  misaligned or near-duplicate → inconsistency." Our defence is exactly right: REUSE an existing
  step-def when the text matches, SCOPE every regex to the spec, and prove it with the collision
  `--dry-run`. Prefer reusing a shared step over authoring a near-twin.
- **Anti-fake-green = two streams + mutation.** Same source: acceptance (WHAT) + unit (HOW) + mutation
  (REAL?) "make the model think more deeply." We already keep the vitest twin live until BDD parity is
  proven AND mutation-gutcheck the runtime class — keep both; retire the vitest only after.
- **NOT adopted (deliberate):** `@amiceli/vitest-cucumber` / `jest-cucumber` / `quickpickle` run
  Gherkin INSIDE vitest. That's the mainstream alt — but it does NOT feed the spec-graph (which reads
  cucumber-js NDJSON + `@featureN` tags for traceability). We stay on cucumber-js on purpose. (Their
  `--feature → --spec` skeleton generator is a nice-to-have idea for `migrate.ts`, not a dependency.)
- **Read the WHOLE FR.md before concluding "no FR maps to this behaviour" — a partial read lies
  (dogfood 2026-06-21).** The `@featureN` tag must map to the FR whose SUBJECT is the behaviour under
  test. The main loop read only `tui-test-runner` FR-1..FR-9 and wrongly told itself `test-guard.test.ts`
  had no requirement — but `FR-12 Test Guard Hook` was at line 81, and the fresh agent (reading the full
  doc) tagged `@feature12` correctly. Find the real FR (`get_node` / full paginated `read_spec_doc`);
  never borrow a free `@featureN` mapped to an unrelated FR (forges a tested-by edge / fake traceability).
  ONLY if a FULL read shows no FR → author it via `apply_spec_change` first (in-scope+real) or report a
  BLOCKER (out-of-scope); never invent the mapping. NOTE: scenario ids are spec-qualified in the graph,
  so a `CODE_NN` reused across specs is NOT a collision (`GUARD001` lives in three specs independently) —
  the real collision risk is step-pattern ambiguity, caught by the `--dry-run`, not the code.
- **Throwaway cucumber config MUST use a `"default": { … }` profile wrapper (dogfood 2026-06-21).** A
  flat `{paths,import,format}` JSON silently runs **0 scenarios / 0 steps** (cucumber.js reads config
  only under a profile) — do not read that as "all passed". If a temp run reports 0 scenarios, the
  wrapper is missing.
- **Audit + fix EXISTING scenario tags in the spec, not only the ones you author (dogfood 2026-06-21).**
  A scenario whose `@featureN` doesn't match the FR its SUBJECT tests is mis-mapped drift — fix it via
  `apply_spec_change` in the same pass (tests-create-update had 3; tui-test-runner had 3 YAML-writer
  scenarios on `@feature11`/`@feature12` that belonged to FR-6). Correcting a mis-map can leave an FR
  honestly UNCOVERED — that is the right outcome, not a regression.

Sources: github.com/swingerman/disciplined-agentic-engineering · github.com/AutomationPanda/gherkin-guidelines-for-ai · github.com/amiceli/vitest-cucumber · github.com/bencompton/jest-cucumber

## Self-wiring procedure — THE AGENT DOES THIS END-TO-END (autonomous, parallel-safe; 2026-06-19)

You (the migrator agent) own the WHOLE migration for your spec — classify → step-defs → tags → wire →
self-verify. The ONLY step left to the coordinator is the single shared canonical run (see bottom), because
all specs write ONE shared `.last-test-run.ndjson` and N concurrent full runs would clobber it. Everything
else below you do yourself, and it is safe to run in parallel with sibling migrator agents.

1. **Promote YOUR tags via the door** — rewrite your `.feature` through `apply_spec_change`, converting every
   `# @featureN` → real `@featureN` AND every `# @manual` → real `@manual` (same line as the feature tag,
   e.g. `@feature6 @manual`). A comment `# @manual` is INVISIBLE to the gate's `not @manual` filter — leave
   it a comment and that scenario RUNS as undefined and reddens the gate. Door `findings: []` = every tag
   resolves to an FR. (Per-spec `.feature` edit through the door is CAS-safe — no cross-agent race.)
2. **Verify each tag NUMBER against the FR it actually tests — do NOT trust the file's group convention.**
   Dogfood (skills-rules-optimizer SRO009): a scenario carried `# @feature8` by the file's grouping habit
   but tested the rules-backward-compat requirement (FR-9); a blind promote would build the `tested-by`
   edge on the WRONG requirement. Read the scenario's intent; tag the real FR.
3. **Wire YOURSELF — concurrency-safe** — add your `.feature` to `cucumber.json` via
   `node scripts/wire-feature.mjs <slug>` (pass the BARE SLUG, not the `.specs/...` path — the helper
   builds the path internally, keeping `.specs/` out of the command so the enforce Bash-guard doesn't
   deny it). This is an O_EXCL-lock-guarded, idempotent,
   atomic append (debugged 2026-06-19: a naive read-modify-write loses sibling agents' paths; the helper
   serialises behind a lock so parallel agents never clobber each other). Do NOT hand-edit `cucumber.json`
   while siblings run. Keep `"tags": "not @wip and not @manual"`.
4. **Self-verify with a SCOPED run (NOT the full glob, NOT the canonical ndjson).** Validate via a temp
   config importing ONLY your own step-def + `tests/hooks/**`, format → a temp ndjson (e.g.
   `.dev-pomogator/.tmp/cuke-<slug>.ndjson`). This proves your spec green with REAL tags without loading
   siblings' in-progress step-defs or touching the shared `.last-test-run.ndjson`. Do NOT use
   `scripts/run-bdd.mjs` (its throwaway ndjson is shared → races).
5. **Bind the test to the FIX, not the trigger — run the revert-check.** Dogfood (advisor catch): a
   t20/FR-15 scenario drove the Phase-2.5 *trigger* and SURVIVED reverting the actual fix → fake-green.
   Extract the fixed unit, assert its post-fix shape, and PROVE the bind by reverting → scenario RED → restore.
6. **Report honestly** — scenarios + FR map, scoped-run pass/fail, `@manual` ones, and which vitest doubles
   are safe to delete. **Honest IN_PROGRESS is correct, not a failure**: a task whose mapped set includes a
   `@manual` (not-run) scenario stays IN_PROGRESS (FR-32 worst-of) — the truth, NOT something to force-green.

### Coordinator residual (NOT the agent — one step per wave)
After all wave agents report wired+scoped-green: run **one** full canonical run (no `--tags`) so the shared
`.last-test-run.ndjson` is complete → `get_coverage` to confirm each flip → delete the reported vitest
doubles. This single shared run is the only irreducibly-serial step.

## Relationship to strong-tests / test-author
This skill is the per-spec, batch-oriented application of strong-tests §6.5 (BDD authoring) and
the `test-author` subagent: `test-author` authors ONE missing scenario; `bdd-migrator` migrates a
whole spec's existing tests, with the deterministic `migrate.ts` planner in front so the work-list
is mechanical, not guessed.
