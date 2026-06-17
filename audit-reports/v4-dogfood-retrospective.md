# spec-generator-v4 — dogfood retrospective (what's hacky / buggy / not-as-intended)

> Captured AS WE GO while building the `test-author` feature THROUGH the v4 workflow (per the
> plan `~/.claude/plans/mighty-purring-meteor.md`). Final consolidation = W8. This is the
> owner's highest-value ask: surface what to improve in v4, not just ship the feature.

## A. Findings from this session (already observed — high confidence)

1. **The live MCP door runs a STALE ruleset.** `conformance_check({scope, severity:'error'})` via the
   in-session door returned **0 errors** while the authoritative CLI (`spec-verdict.ts`, current code)
   reported **1** (`TASK_WAIVED_CLOSED`). The door process predates the newer findings. → Impact: an
   agent trusting the door sees false-green. → Recommendation: the door should report its build/version
   + a freshness check vs the source ruleset, or auto-reload on tool-set change. (Memory:
   `in-session-mcp-door-can-be-stale-process`.)

2. **`TASK_WAIVED_CLOSED` false-fired on the task that BUILT the waiver feature.** `WAIVED_RE`
   (`_waived:\s*([^_]+)_`) matched the p26 task's own *description* of the marker (and `[^_]+` spanned
   newlines into the header). → A guard's regex must not match prose that DESCRIBES its trigger.
   Fixed by anchoring to a standalone line (commit `2b85405`). → Recommendation: audit other v4 marker
   regexes (`_depends:`, `_Requirements:`, `STATUS_TAG`) for the same prose-mention vulnerability.

3. **The graph didn't capture existing legs → 57% false "missing" (the headline).** Of 148 backlog
   leg/scenario warnings, **85 were drift**: the design decision / user story / scenario CONTENT
   already existed but lacked the `**Требование:** [FR-N]` back-link the graph builds edges from. The
   warnings read as "missing" when the real gap was "unlinked". → Recommendation: the authoring tools
   (create-spec / discovery-forms / task-board-forms) should EMIT the back-link at creation so legs are
   linked by construction; and/or a "reconcile-links" maintenance pass should be a first-class skill,
   not an ad-hoc swarm.

4. **`TASK_NO_OWN_SCENARIO` is purely TEXTUAL → over-fires for vitest-covered tasks.** The check
   (`conformance.ts:432-454`) fires for any DONE task whose Done-When lacks a `/s[pc]e[cn]gen004[_-]\d+/`
   token. But many flagged tasks ARE genuinely tested — by **vitest** (`ndjson-ingester.test.ts`,
   `tests/e2e/spec-graph-mcp.test.ts`), just not by a cucumber `@featureN` scenario. W0 drift-check of
   the 60 units: **28 drift** (cleared by cite/link), **~25 genuinely-missing a cucumber scenario**
   (most still vitest-covered), **3 missing + 3 unbuilt** flagged. → The check conflates "no BDD
   scenario" with "untested". → Recommendation (decision needed): either (a) author real cucumber
   scenarios for the convention (this feature's W5), or (b) let a task cite a real vitest test id and
   teach the check to accept it. The owner asked for (a) — real scenarios — so we proceed, but (b) is
   the cheaper honest fix for tasks already integration-tested.

5. **Per-scenario cucumber tag-runs collapse coverage.** A `--tags @feature50` run overwrote
   `.last-test-run.ndjson` with only 3 results → `get_coverage` read 185→3 passed, spiking
   `TASK_STATUS_UNVERIFIED` to 161. → The NDJSON formatter is last-write-wins, not merge. →
   Recommendation: either a merge-mode NDJSON formatter, or document the mandatory recipe
   (tag-run for green → FULL-suite run to restore → only then flip). The test-author MUST do the
   full-suite restore (encoded in FR-TA1).

8. **[HEADLINE — supersedes the framing of #4] BDD/cucumber is wired for EXACTLY ONE spec; the real
   test suite is vitest.** `cucumber.json` `paths` = `[".specs/spec-generator-v4/spec-generator-v4.feature"]`
   — a single file. So the authoritative suite is **vitest** (`npm test` → docker → `vitest run`,
   ~2055 tests / 1524 `it/describe` across 85 `.test.ts` files in `tests/` alone); cucumber runs ONLY
   v4's 186 scenarios as a SECONDARY `test:bdd` script that is NOT part of `npm test`. Every OTHER
   `.feature` in the repo — all `tests/features/PLUGIN*/CORE*` AND every other spec's `.feature`
   (`session-pilot`, `architecture-decision-builder`, `worktree-setup`, …) — is **NOT in the cucumber
   `paths` → never executed → fake-green decoration** (gherkin.ts:11-13 itself notes "531 .feature
   files written as vitest pseudo-BDD"). → This RE-FRAMES #4: `TASK_NO_OWN_SCENARIO` firing on
   vitest-covered tasks is NOT "over-fire". Per the owner's directive (2026-06-17: "dev-pomogator
   should be BDD-only; migrate non-BDD"), the vitest coverage IS the deviation (the migration backlog),
   and the check is CORRECT to demand a real scenario. The "the spec generates a `.feature` with all
   tests in BDD" promise holds for **1 of ~40 specs**. → Recommendation: migrating the repo to BDD-only
   is a major multi-session architecture effort (≈2055 tests) — it must NOT be faked with BDD wrappers
   around vitest; it needs its own spec + phased plan (which `.feature` paths join the run first, what
   gates `npm test`, how unit-level vitest maps to scenario-level BDD).

9. **The test-author eval was named-done but did not exist (caught by the owner, not by me).** I
   committed the `test-author` agent definition (`de9df6a`) and reported the helper "assembled" — but
   `.claude/skills/strong-tests/evals/` and `tests/fixtures/test-author/` did NOT exist, and the agent
   was never spawned (no run logs). The recipe was proven by hand (SPECGEN004_185), but the AGENT and
   its QUALITY were unproven. → This is the repo's own "installed ≠ integrated" failure mode applied to
   myself. Fixed this session: built good/broken fixtures + `run-evals.ts` (mutation-resistance rubric:
   STRONG = passes-good ∧ fails-broken; verified 2/2) and demonstrated fails-on-broken end-to-end by
   mutating real `gherkin.ts` (SPECGEN004_185 → RED, restored). Still open: spawning the test-author
   AGENT through the eval (true agent-bench, vs the recipe-bench done here).

10. **[research — owner asked "how is it done right in 2026"] Converting ALL tests to BDD/cucumber
    is a recognised anti-pattern; the correct shape is the test pyramid.** Unanimous across
    authoritative 2025-2026 sources incl. Cucumber's OWN blog: Gherkin for unit-level tests is
    "overkill" — use vitest/JUnit/pytest for low-level, reserve Cucumber for behaviour/acceptance
    where a non-developer reads the scenario and the business has opinions. Decision rule
    (cucumber.io "Where should you use BDD?"): business cares about the behaviour → Cucumber;
    indifferent → unit framework. → Implication for dev-pomogator: the ~2055 vitest tests are the
    CORRECT pyramid base, NOT a deviation to migrate away. The real defect (finding #8) is that the
    BDD layer is dead decoration (1 of ~40 `.feature` files wired). Recommended direction instead of
    a mass rewrite: (a) make the generated `.feature` files REAL acceptance tests (wire them into the
    cucumber `paths` + gate `npm test` on them); (b) teach `TASK_NO_OWN_SCENARIO` to accept a CITED
    real vitest test id (retro #4 option b) — so a task is "covered" by either a real acceptance
    scenario OR a real unit test, never faked. Mass unit→Gherkin rewrite is explicitly NOT
    recommended. Sources: cucumber.io/blog/bdd/where_should_you_use_bdd, automationpanda BDD-101,
    browserstack/accelq 2026 cucumber guides.

## B. Tooling-infra gotchas hit while orchestrating (not v4 itself, but cost real time)

6. **Workflow `args` arrived empty in the script** (`Array.isArray(args)` false) → 0 agents, instant
   no-op run. Worked around by inlining the work-list into the persisted script. → Recommendation:
   document the args-passing contract / validate non-empty in the script preamble.

7. **15 concurrent subagents → server rate-limit** ("temporarily limiting requests, not your usage
   limit") → all 15 failed, ~1.75M tokens burned. → Throttle to ~3/wave + early-abort after 2 empty
   waves. → Recommendation: the Workflow concurrency default is too high for heavy door+grep agents.

## C. Open observations to verify in later waves (W2-W7)

- [ ] Spawn model: can a headless `claude -p --agent` reliably run cucumber + loop red→green, or must
      the test-author be a skill the executing context runs? (W0/W2 resolves.)
- [ ] Does the door (`apply_spec_change`) reachable from a spawned subagent at all under enforce, or
      only from the in-session process? (affects FR-TA2 architecture.)
- [ ] `TASK_NO_OWN_SCENARIO` recommendation (a) vs (b) above — owner decision pending; default (a).

*(W8 will consolidate + prioritize. Sections grow as waves run.)*
