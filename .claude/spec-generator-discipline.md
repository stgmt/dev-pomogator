# Spec-Generator Discipline — the one map

The spec-generator (spec-generator-v4) enforces a **traceability + anti-fake-green** working model.
The substance is real and deep, but it's spread across ~51 FRs + dozens of rules/skills/agents/tools —
so this file is the **single index**: each principle → what it is → where it lives → how to verify it.
This is a map, not the source of truth; the FRs (`.specs/spec-generator-v4/FR.md`) and the rules table
in `CLAUDE.md` are. Start here when you ask "how does this repo keep specs/tests honest?".

## The one health command

A spec is "valid / clean / done" ONLY by the **smart verdict**, never a bare structural pass:

```
npx tsx tools/specs-generator/spec-verdict.ts -Path .specs/<slug>     # [--no-semantic] [--json]
```

It composes (over ONE graph) structural pre-filter + `audit-spec` + traceability-completeness +
conformance + coverage rollup + semantic. RED ⇒ a gap list you must cite. See rule
`spec-verdict/no-structural-valid` (FR-37d).

## The principles (what · where · verify)

1. **Traceability — everything is a graph node/edge.** Requirement → AC → scenario → task → test is a
   real graph (FR↔`@featureN` `tested-by`), navigable both ways.
   *Where:* FR-36 (spec-qualified composite ids), FR-44 (reverse traceability), FR-47 (design/story
   legs), `tools/spec-graph/` builder + parsers; MCP `get_trace` / `find_refs` / `get_spec_status`.
   *Verify:* `get_trace({node_id})`; `spec-verdict` (traceability-completeness gate, FR-37b).

2. **Anti-fake-green — status is DERIVED from evidence, never claimed.** A task is DONE only when ALL
   its mapped scenarios are green; "done" needs a passing test, not a checkbox.
   *Where:* FR-32 (evidence-derived status), FR-37 (smart verdict authoritative), FR-46 (a task needs
   its OWN green scenario, not just its FR's), FR-35a (test-quality side-channel caps weak DONE);
   rules `spec-verdict/no-structural-valid`, `gotchas/rollup-completeness-all-not-any`,
   `testing/verify-against-real-artifact`.
   *Verify:* `get_spec_status` (view: coverage, per-task `verified_status`); `fr-census`; `get_spec_status` (FR-38).

3. **Deterministic gates — the MCP door, not prompt-trust.** Spec mutations go THROUGH
   `apply_spec_change`, which validates form-contracts + anchors + conformance BEFORE touching disk and
   refuses on any error-severity finding (`findings:[]` = clean). Agents read the rule from the refusal,
   not from memory.
   *Where:* FR-39 (MCP-only `.specs/` access under enforce), FR-40 (mutation door + CAS), FR-48b
   (chain gate), FR-50 (waived-close gate); `tools/spec-graph/conformance.ts`; rule
   `gotchas/enforce-spec-door-bash-workflow`.
   *Verify:* the door reply's `findings` array; `conformance_check`.

4. **Fresh-per-phase agents — no context decay.** Each spec phase is authored by a fresh headless
   agent through the door only (Discovery / Requirements / Finalization / Audit), spawned by the
   orchestrator-verifier. (Cross-checked against ATDD-for-Claude-Code's "fresh-per-phase team".)
   *Where:* FR-41; `.claude/agents/spec-phase-{discovery,requirements,finalization,audit}.md`;
   `spec-generator-orchestrator` skill (phase-runner). Same pattern for the BDD rollout:
   `.claude/agents/bdd-migrator.md` (one fresh agent per spec).

5. **Lifecycle + chain gate — can't start/finish without the assembled chain.** Status transitions go
   through `set_entity_status`; a task can't enter `ready`/`in-progress` unless its requirement's chain
   (AC + design + story + scenario) is assembled, and can't be `done` without its own green scenario.
   *Where:* FR-48 (lifecycle machine + chain gate), FR-46 (own-scenario), FR-50 (waived).
   *Verify:* `set_entity_status` refusal reasons; `fr-census` `missingLegs`.

6. **Mutation resistance — a test that can't fail is not a test.** Tests must go RED on broken code;
   coverage % is a vanity metric.
   *Where:* `strong-tests` skill (12-point self-eval + mutation), FR-35a producer; rule
   `testing/output-invariants-first`.
   *Verify:* `npx tsx .claude/skills/strong-tests/evals/run-evals.ts`; the mutation gutcheck.

7. **Relentless honest stop — surface the truth, don't announce-and-quit.** The per-prompt census
   banner names the next open task; the claim-evidence-gate Stop hook (+ deterministic require-next
   "Дальше:" section + Haiku judge) blocks a premature/false "done".
   *Where:* FR-49 (a–g); `tools/claim-evidence-gate/`; rule
   `verify-status-against-code-before-acting`.
   *Verify:* `/spec-status` (honest evidence-backed status).

8. **BDD migration — centralize all tests on traceable `@featureN`.** Non-BDD (vitest) tests are
   migrated to cucumber scenarios driving real code so the graph sees them (no orphan tests).
   *Where:* FR-51; `tools/bdd-migrator/` (planner) + `.claude/skills/bdd-migrator/SKILL.md` +
   `.claude/agents/bdd-migrator.md`; spec-generator-v4 Phase 27.
   *Verify:* `node --import tsx tools/bdd-migrator/corpus.ts .` (roadmap);
   `tools/spec-graph/project-test-trace.ts` (no vitest orphans).

## The enforcing rules

The principles above are *enforced* by the always-apply rules indexed in `CLAUDE.md` (e.g.
`no-structural-valid`, `rollup-completeness-all-not-any`, `verify-against-real-artifact`,
`dead-integration-guard`, `enforce-spec-door-bash-workflow`, `integration-tests-first`). CLAUDE.md is
the rule glossary; this file is the principle index that ties those rules to the FRs and tools.

## See also
- `.specs/spec-generator-v4/FR.md` — the requirements (source of truth).
- `.claude/skills/spec-generator-dev/SKILL.md` — the subsystem file-map + logs (where code lives).
- `.claude/skills/create-spec/SKILL.md` — the authoring workflow that produces specs under this discipline.
