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
5. **Wire + run.** Add the `.feature` to `cucumber.json` `paths`; keep `"tags": "not @manual"` (and
   `not @wip` while staging) so un-migrated scenarios never become UNDEFINED and v4 is untouched.
   Run the FULL suite (`node --import tsx node_modules/@cucumber/cucumber/bin/cucumber.js`) — one
   full run keeps `.last-test-run.ndjson` complete (a `--tags` run collapses coverage). Confirm green.
6. **Mutation gutcheck (runtime class).** Break the engine under test, re-run, confirm the scenario
   goes RED, restore. A scenario that survives a real mutation is FAKE-POSITIVE-RISK, not a deliverable.
   (`.claude/skills/strong-tests/evals/run-evals.ts` is the reusable rubric.)
7. **Verify traceability + retire vitest.** `npx tsx tools/bdd-migrator/migrate.ts --spec <slug>`
   should now show wired + all real tags. `project-test-trace.ts` should show no orphans for the
   spec. Only THEN delete the superseded `tests/e2e/<slug>.test.ts` (BDD parity reached), and
   confirm the full Docker suite (`npm test`) still passes before the rollout scales.

## Never
- Fake a manual/agent-behaviour scenario green with a file-check that doesn't test the claim.
- Author in `tests/features/` (never executed → fake-green) — scenarios live in `.specs/<slug>/<slug>.feature`.
- Flip/delete vitest before the BDD equivalent is green in a FULL run.
- Tag with a group number when the scenario tests a different FR (breaks traceability).
- Touch `.specs/` with raw file tools — feature/TASKS edits go THROUGH the door (`apply_spec_change`).

## Relationship to strong-tests / test-author
This skill is the per-spec, batch-oriented application of strong-tests §6.5 (BDD authoring) and
the `test-author` subagent: `test-author` authors ONE missing scenario; `bdd-migrator` migrates a
whole spec's existing tests, with the deterministic `migrate.ts` planner in front so the work-list
is mechanical, not guessed.
