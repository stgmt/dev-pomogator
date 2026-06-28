---
name: spec-generator-orchestrator
description: Thin end-to-end orchestrator for the spec-generator-v4 workflow (scaffold → conformance → coverage → reconcile → resolve → honesty-gate). Owns ONLY the feature map + a human-merge self-improve ledger; delegates every unit of work to existing worker skills and MCP tools — never re-implements worker logic. Triggers on "run the spec workflow / orchestrate specs / end-to-end spec pipeline".
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Skill, AskUserQuestion, mcp__dev-pomogator-specs__get_trace, mcp__dev-pomogator-specs__get_spec_status, mcp__dev-pomogator-specs__get_test_result, mcp__dev-pomogator-specs__find_orphans, mcp__dev-pomogator-specs__conformance_check
---

# spec-generator-orchestrator

## Mission

Sequence the end-to-end spec workflow over **existing workers**. This skill owns
exactly two things — the **feature map** (which worker covers which step) and a
**self-improving merge ledger** under a human gate. It re-implements nothing.

> Architecture: thin orchestrator + existing workers (FR-33). If you find
> yourself writing bucketing / parsing / conformance logic in this skill, STOP —
> that logic already lives in a worker; call the worker instead.

## Feature map (routing table)

The canonical routing lives in `scripts/feature-map.ts` (`WORKFLOW`). Each stage
delegates to a worker — a `Skill(...)` or an MCP tool — never inline logic:

| Stage | Worker | Kind |
|-------|--------|------|
| scaffold | `Skill("create-spec")` | skill |
| architecture | `Skill("architecture-research-workflow")` | skill |
| conformance | `conformance_check` MCP tool | mcp-tool |
| coverage | **`get_spec_status` MCP tool (view: coverage)** | mcp-tool |
| trace | `get_trace` MCP tool | mcp-tool |
| reconcile | `Skill("cross-spec-reconcile")` | skill |
| resolve | `Skill("cross-spec-resolve")` | skill |
| backlog | `Skill("spec-backlog")` | skill |
| legacy-triage | **`legacy-triage --judge` engine CLI** | engine-cli |
| archive | **`Skill("spec-archive")`** | skill |
| honesty-gate | **`get_spec_status` MCP tool (view: coverage)** | mcp-tool |

### Coverage + honesty step (delegation, not re-implementation)

When the workflow reaches the coverage / honesty-gate step, **call the
`get_spec_status` MCP tool with `view: 'coverage'`** and read its per-scenario
buckets + per-task `verified_status`. Do NOT compute buckets here — the
bucketing + FR-32 honesty derivation is owned by `tools/spec-graph/coverage.ts`
and surfaced by `get_spec_status` (view coverage). This skill body intentionally
contains no bucketing code.

### Legacy/drift triage step (FR-43 — SUSPICION only, the orchestrator runs it)

After the backlog step and before the honesty-gate, run the legacy/drift triage —
**only the orchestrator can**, because it has `Bash`; the phase agents are MCP-only
(FR-41a) and cannot spawn a CLI. Call the engine directly:

```bash
# Flags abandoned specs; --judge escalates the reality-drift kinds via the LLM judge.
npx tsx tools/specs-generator/legacy-triage.ts --judge
```

It emits SUSPICIONS, never verdicts: each candidate is `SUPERSEDED` (deterministic —
version-lineage + not_run + lineage header) or, for the reality-drift kinds, the
`claude -p` judge separates `MOVED→DRIFTED` (re-sync paths, don't retire) /
`REMOVED` / `ABSORBED`, grep-grounded and degrade-honest (no binary → stays
`DRIFTED`). The engine **never auto-retires** (AC-43.3 / FR-43c) — a missing path is
DRIFTED by default, and a human confirms before anything is archived to `.specs/archive/`.
Surface the breakdown + evidence into the merge ledger as a `pending` entry; do not
mutate any spec from this step.

### Archive step (FR-45 — proof-gated, runs after legacy-triage)

After legacy-triage SUSPECTS abandoned specs, `Skill("spec-archive")` PROVES each
against the repo and acts only on hard proof. It calls the door's
`get_archival_proof` (no LIVE inbound reference — graph edges + prose links — to
the spec) and combines it with the supersession signal:

- **ARCHIVE** (no live refs + SUPERSEDED/REMOVED/ABSORBED) → autonomously
  `archive_spec` (gated move) + prune orphaned tests + write the proof report.
- **KEEP_FALSE_POSITIVE** (live refs) → it is still in use; leave it (the
  "наоборот ошибка" — a false legacy suspicion the proof catches).
- **NEEDS_HUMAN** (graph-clear but ambiguous supersession) → escalate, untouched.

Everything is git-revertable; the dogfood proved **0 false archival** on the live
corpus (19 of 24 suspected specs were saved as still-referenced).

## Self-improve merge ledger (human gate)

Backed by `scripts/ledger.ts`, stored at `.specs/<slug>/SELF_IMPROVE.md`.

- **During a run**, on friction/gap/idea → `appendPendingEntry(...)`: a dated
  `status: pending` entry. A pending entry is a **reminder** — NEVER auto-apply
  it to spec or code (AC-33.2).
- **At session start** (and on demand) → `pendingReminder(...)`: if ≥1 pending,
  surface the count + top observations so they aren't forgotten (AC-33.3).
- **Only after the human** flips an entry to `approved` → `applyApproved(...)`
  may convert it (→ `applied` + applied-at). Pending entries stay untouched
  (AC-33.4).
- Reuses `/reflect` + `suggest-rules` + `self-improving` mechanics — this is the
  spec-workflow-scoped surface, not a duplicate.

## Drift guard (honesty applied to the orchestrator itself)

`scripts/feature-map.ts::checkFeatureMapDrift(actual)` fails when a live MCP tool
/ worker skill / FR exists that the feature map doesn't reference (AC-33.5).
Run it after adding any worker: a green workflow with an unreferenced capability
is the same dishonesty FR-32 forbids for tasks.

```bash
# drift check against the live MCP tool registry
npx tsx .claude/skills/spec-generator-orchestrator/scripts/drift-check.ts
```

## Workers (no logic duplication)

- Skills: `create-spec`, `cross-spec-reconcile`, `cross-spec-resolve`,
  `spec-backlog`, `architecture-research-workflow`.
- MCP tools: `get_trace`, `get_spec_status` (view coverage/counts/status), `get_test_result`, `find_orphans`,
  conformance guard/push hooks.
- Workers MAY run as isolated sub-agents for parallelism (mirrors spec-backlog
  dispatch).

@see .specs/spec-generator-v4/FR.md FR-33
