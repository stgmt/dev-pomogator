# Spec-Conformance Audit — dev-pomogator corpus, 2026-07-21

**Verdict: 🔴 RED** (hard trigger: 112 stale FILE_CHANGES paths; strict: RED on any debt class)

Auditor: strict spec-conformance pass. Methodology: the canonical deterministic engines —
`corpus-health.ts` (organism view: 5566 nodes / 7256 edges), `checkTraceabilityCompleteness`
(FR-37b invariants), `research-trace` / `upstream-trace` (FR-44 reverse traceability) — the SAME
engines the `dev-pomogator-specs` MCP door serves. Per repo rule `no-structural-valid`, no
structural "valid" claim is made anywhere here.

Methodology limits (stated honestly): the MCP door tools and the per-spec deep verdict
(`spec-verdict.ts`, semantic LLM judge) were permission-gated in this session; this audit is the
deterministic pass (audit+traceability+conformance+coverage), NOT the semantic pair-check.

Machine detail: `audit-reports/corpus-deep.json`, `audit-reports/corpus-verdict.json` (driver), `audit-reports/run-corpus-audit.cjs`.

---

## What holds (evidence of health)

| Check | Result |
|---|---|
| Bare-id collisions (FR-36 disease class) | **0** (4973 raw / 4973 unique) |
| Orphan project tests (FR-44/GT-1 — vitest `it()` with no scenario) | **0** |
| Graph build | clean, 5566 nodes / 7256 edges |

## Findings, most severe first

### F1 — 🔴 HARD: 112 stale FILE_CHANGES paths (the RED trigger)
`implements` edges with `action=edit` pointing at files that do not exist on disk.
Concentrated in pre-v2.0-layout specs: `tui-test-runner-v2` (`extensions/tui-test-runner/...`),
`worktree-setup` (`src/scripts/tsx-runner.js`, `extensions/devcontainer/...`). Either the docs
drifted from the v2.0 canonical layout or the specs outlived their code. Per-spec triage required:
fix FILE_CHANGES or archive the spec (door: `get_archival_proof` → `archive_spec`).

### F2 — 🔴 session-pilot: 34/34 tasks have NO mapped scenario (100% of the TASK_UNTESTED class)
The entire `TASK_UNTESTED` class IS one spec: `session-pilot:t01`–`t48` (34 tasks)
@ `.specs/session-pilot/TASKS.md:51-467`. No task in this spec is covered by a BDD scenario —
the honest DONE verdict (`get_spec_status view=coverage`) can never go green for it.
Canonical remediation exists: `test-author` agent on TASK_NO_OWN_SCENARIO findings.

### F3 — 🔴 22 UNCOVERED_FR across 10 specs (requirements with zero AC/scenario coverage)
Worst: `spec-generator-v3` ×6 (FR-5/6/7/8/15/16 @ FR.md:19-63 — but v3 is LEGACY, superseded
by v4; candidate for archival proof, not patching), `spec-workflow-vmodel` ×3 (FR-006/007/021
@ FR.md:414-432), `fix-bg-output-loss` ×2, `stale-build-guard` ×2, `bg-task-guard` ×2,
`suggest-rules-insights` ×2, `prompt-suggest` ×2, `install-diagnostics:FR-12`,
`cursor-dead-code-cleanup:FR-5`, `answer-simple:FR-12`.
**Aggravating:** `fix-bg-output-loss` also owns dangling `covers` edges FR-10→AC-10 … FR-14→AC-14
with the `from` side MISSING — ACs exist for FR-10..14 that FR.md never defines (FR.md:57's FR-9
is itself uncovered). Internal contradiction, not mere omission — highest-priority single fix.

### F4 — 🟠 69 semantic-graph breaks (dangling edges, minus rotational noise)
Of 1920 dangling edges, **1851 are `runtime-trace`** (scenario trace-chunk pointers — check
whether trace rotation explains them or the ndjson ingester is broken; `spec-generator-dev`
territory, runtime-dogfood would settle it). The real requirement-graph breaks:
`tested-by: 55`, `covers: 7`, `implements: 7`. Top owners: `spec-generator-v4` (507, mostly
runtime-trace), `onboard-repo-phase0` (96), `tui-test-runner` (77),
`architecture-decision-builder` (64), `strong-tests` (51).

### F5 — 🟠 843 UNTAGGED_SCENARIO (~597 id-prefixes) — BDD-migration debt
Untagged scenarios cannot enter the coverage/honesty rollup — the same silence mechanism as the
`@windows-only` incident (a scenario that drops out of every run reports as clean, not as missing).
Top owners: `spec-generator-v3` (28), `architecture-decision-builder` (22),
`codex-cli-support/features/*` (29), `specs-management-as-skill` (14), `stale-build-guard` (12),
`prompt-suggest` (12). Canonical remediation: `bdd-migrator` per spec.

### F6 — 🟡 INFO-class traceability debt
- **671 FRs cite no RESEARCH.md finding** (`claims-need-evidence` discipline) — top:
  `spec-generator-v4` (62), `pomogator-doctor` (36), `session-pilot` (27),
  `dev-pomogator-canonical-plugin` (24).
- **566 upstream artifacts wired to no requirement** (story:177 / use-case:338 / decision:51) —
  top: `onboard-repo-phase0` (28), `pomogator-doctor` (27), `personal-pomogator` (23),
  `session-pilot` (23).

## Recommended sequence
1. `fix-bg-output-loss` — reconcile FR.md ↔ ACCEPTANCE_CRITERIA (F3 aggravating; one spec, one sitting).
2. `session-pilot` — `test-author` over its 34 TASK_NO_OWN_SCENARIO findings (F2).
3. Triage the 112 stale FILE_CHANGES by spec: re-point (v2.0 layout) or archive (F1, the RED trigger).
4. `spec-generator-v4` runtime-trace investigation: rotation-artifact vs ingester break (F4).
5. `bdd-migrator` rollout on the F5 top-6 specs; then INFO-debt sweep (F6) via `spec-backlog`.
