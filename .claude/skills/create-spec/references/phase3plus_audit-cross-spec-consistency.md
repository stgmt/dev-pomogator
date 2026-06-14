# Phase 3+ Audit — CROSS_SPEC_CONSISTENCY (FR-17)

Cross-spec + impl reconciliation. Unlike the MECHANICAL categories (computed inside
`audit-spec.ts`), this one is **SKILL-driven**: the agent invokes `cross-spec-reconcile`
(full mode), which scans ALL specs in `.specs/*/` plus the implementation tree, and reads
back the structured findings. Same invocation discipline as `spec-reality-check` (Step 1.5).

## When this category runs

Phase 3+ Audit, after the MECHANICAL categories. `cross-spec-reconcile` is also invoked
in `light` mode earlier (Phase 2 + Phase 3 finalization) for cheap mechanical drift; the
Audit pass uses **`full`** mode (adds LLM-semantic pairwise FR/AC compare).

## How to run

```bash
node --import tsx .claude/skills/cross-spec-reconcile/scripts/reconcile-cli.ts \
  --mode full --slug <current-slug> --sarif
# writes .specs/<slug>/consistency-report.yaml (+ .sarif when --sarif)
# add --dry-run to preview (summary + first 10 findings to stdout, no file written)
```

Or invoke `Skill("cross-spec-reconcile")` with `mode: "full"`. Light mode (`--mode light`)
is the cheap mechanical subset (<5s for a 30-spec corpus); full adds the cached LLM judge.

## Finding severity → action

Read `consistency-report.yaml`. Findings carry a `code` (28 total) and `severity`:

- **CRITICAL** — hard conflicts that MUST be resolved or explicitly overridden before STOP #3:
  - `cross-spec/contradictory-fr` — two specs assert opposing requirements.
  - `cross-spec/module-ownership-conflict` — two specs claim the same module/file.
  - `cross-spec/runtime-identifier-drift` — a runtime identifier (endpoint / env var / CLI
    flag) differs between a spec and the impl (or between specs).
  - In `full` mode, all finding codes mapping to CRITICAL.
  CRITICAL findings raise a blocking `AskUserQuestion` (header `⚠️ CRIT`) listing each
  finding's `spec_a`/`spec_b` + message + suggested_fix.
- **WARNING / INFO** — pushed to agent context as a `<system-reminder>` aggregate; do NOT block.

## Resolution

For each CRITICAL finding, the user MUST choose one:

1. **Fix now via `/cross-spec-resolve`** — apply the suggested fix.
2. **Acknowledge & override (logged)** — writes `acknowledged_by: user`, `override_reason: <text>`,
   `override_timestamp: <iso>` into the YAML AND appends an entry to
   `.claude/logs/cross-spec-overrides.jsonl` (mirror of the `scope-gate` escape-hatch audit pattern).
3. **Abort STOP** — do not confirm STOP #3; go back and fix the specs.

WARNING/INFO need no action to pass the gate, but should be triaged when cheap.

## Degraded mode

When the SpecGraph + MCP server (Phase 1) are unavailable, `cross-spec-reconcile` reads
`.specs/*/*.md` directly (fs + remark + glob), so the category still runs.

## Related

- FR: [`FR-17`](../../../../.specs/spec-generator-v4/FR.md) · resolve sibling: `cross-spec-resolve` skill.
- Override audit pattern: [`scope-gate/escape-hatch-audit.md`](../../../rules/scope-gate/escape-hatch-audit.md).
- Skill: [`.claude/skills/cross-spec-reconcile/SKILL.md`](../../cross-spec-reconcile/SKILL.md).
