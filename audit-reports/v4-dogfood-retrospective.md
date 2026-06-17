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
