---
name: cross-spec-reconcile
description: |
  Cross-spec consistency analyzer — scans every `.specs/<slug>/` against
  every other and against the codebase, surfacing 28 classes of drift
  (uncovered claims, contradictions, runtime-identifier mismatch, missing
  files, foreign-spec edits, architectural decisions vs reality).
  Two modes: `light` (mechanical-only, <5s, no LLM) and `full` (adds
  LLM-semantic comparison via the Phase-3 judge with FR-26 deny-list
  enforcement). Output: per-spec `.specs/<slug>/consistency-report.yaml`
  + optional `consistency-report.sarif`. CRITICAL findings invoke a
  blocking AskUserQuestion with header ⚠️ CRIT; user override is logged
  to `.claude/logs/cross-spec-overrides.jsonl` for audit trail.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion
---

# cross-spec-reconcile

Drift-finder across the `.specs/` corpus. Runs after authoring a spec
slice OR explicitly via `/cross-spec-reconcile`. The first phase
("light") is mechanical and CHEAP — glob + parse + identifier extract.
The second phase ("full") opts into LLM-semantic comparison and costs
real subprocess time; the agent only runs it when the user asks.

## When to invoke

**Auto-trigger** — Phase-4 PostToolUse hook can request `light` mode
after any `.specs/<slug>/FR.md` edit, alongside the standard
conformance_check. Findings flow into the same JSONL log.

**Manual trigger** — explicit `Skill("cross-spec-reconcile")` or
`/cross-spec-reconcile` (slash). Default mode `light`; `mode: "full"`
adds the semantic pass.

**Hard-OUT** — single-spec edits inside an already-consistent spec
(use `conformance_check` for the within-spec invariants).

## The 28 finding-code matrix

Findings carry a `code` + `class` + `severity`. Classes group related
codes for the resolve skill:

| Class                          | Severity | Example codes |
|--------------------------------|----------|---------------|
| uncovered                      | WARNING  | `impl-drift/missing-file`, `impl-drift/missing-symbol`, `impl-drift/missing-test` |
| contradiction                  | CRITICAL | `cross-spec/contradictory-fr`, `cross-spec/contradictory-nfr`, `cross-spec/module-ownership-conflict` |
| runtime-identifier-drift        | CRITICAL | `cross-spec/runtime-identifier-drift`, `cross-spec/url-shape-drift`, `cross-spec/cli-flag-drift` |
| architectural-decision-vs-reality | CRITICAL | `cross-spec/decision-locked-but-reality-diverges` |
| concept-overlap                | INFO     | `cross-spec/concept-overlap` (≥3 shared nouns between two specs without explicit link) |
| spec-only                      | INFO     | `spec-only/orphan-FR`, `spec-only/orphan-AC`, `spec-only/unreachable-task` |
| schema-drift                   | WARNING  | `cross-spec/schema-mismatch`, `cross-spec/enum-divergence` |

The CRITICAL hard-conflict subset blocks `STOP` via AskUserQuestion;
WARNING + INFO surface but never block.

## Two modes

| Mode  | Cost      | What it does                                  |
|-------|-----------|-----------------------------------------------|
| light | <5s       | Globs FRs/ACs/Scenarios; extracts identifiers via regex; compares file existence against the SpecGraph (Phase 1); produces the mechanical subset of codes |
| full  | +30-90s   | Adds the Phase-3 LLM-as-judge for pairwise FR/AC semantic compare; cached by `sha256(spec_a + spec_b)` so re-runs are free; FR-26 deny-list applies before any spawn |

## Output: `.specs/<slug>/consistency-report.yaml`

```yaml
generated_at: 2026-05-30T03:00:00Z
mode: light
spec_slug: spec-c
total_findings: 3
findings:
  - code: impl-drift/missing-file
    class: uncovered
    severity: WARNING
    referenced_in: .specs/spec-c/FR.md:42
    expected_path: src/mcp/validate_user*.ts
    suggested_fix: "Add the implementation OR mark the FR as OUT_OF_SCOPE"
  - code: cross-spec/runtime-identifier-drift
    class: runtime-identifier-drift
    severity: CRITICAL
    spec_a: .specs/spec-a/FR.md:12  (feedback_key = "session_token")
    spec_b: .specs/spec-b/FR.md:8   (sessionToken)
    suggested_fix: "Pick one canonical name + update both specs in lockstep"
```

## CRITICAL blocking

When the report contains ≥1 CRITICAL finding the skill emits a blocking
`AskUserQuestion` with `header: "⚠️ CRIT"` (max 12 chars), options
literally include «Abort STOP» and «Acknowledge & override». Override
appends `acknowledged_by: user`, `override_reason: <text>`, and
`override_timestamp: <iso>` to the YAML, AND writes a parallel JSONL
line to `.claude/logs/cross-spec-overrides.jsonl` so audit can trace
who overrode what and why.

## Flags

Driven by the CLI entry `scripts/reconcile-cli.ts` (mirrors the sibling
`cross-spec-resolve/scripts/resolve-cli.ts`): a pure `parseReconcileArgs` +
`reconcileCli` over the engine (`reconcileLight` / `runFullMode`) + writers.

```bash
node --import tsx .claude/skills/cross-spec-reconcile/scripts/reconcile-cli.ts \
  --mode light --slug <name> --sarif        # writes consistency-report.yaml (+ .sarif)
```

- `--mode light|full` — default `light`
- `--dry-run` — compute findings, print the summary table, do NOT write the YAML/SARIF
- `--sarif` — also write `.specs/<slug>/consistency-report.sarif` (SARIF 2.1.0)
- `--slug <name>` — limit to one spec, repeatable (default: every `.specs/<slug>/`)

The CLI prints a per-spec **Coverage Summary Table** (CRIT/WARN/INFO/total) and
exits 0; the CRITICAL blocking `AskUserQuestion` stays in the skill body (above),
not the CLI — the CLI only reports the CRITICAL count so the skill knows to prompt.

## Resolution Patterns

When findings *do* fire, the agent (or the sibling
`cross-spec-resolve` skill) applies one of five recurring response
shapes. The full catalog with before/after diffs + decision rules
lives in `references/reference_resolution-patterns.md` — summary
below.

| # | Pattern | Trigger | When to choose |
|---|---------|---------|----------------|
| 1 | **WRAP-deprecated** | `impl-drift/missing-file` or `missing-symbol`; referenced path removed in a major migration with NO canonical replacement | Reference is load-bearing for traceability (spec/ownership table); pure deletion would erase migration history. Example: `src/installer/claude.ts` → `~~src/installer/claude.ts~~ (removed in v2 — no canonical replacement)` |
| 2 | **DELETE-if-alternative-exists** | `impl-drift/missing-test` or `missing-file`; equivalent exists under different name (split layout / rename / move) | A reachable replacement exists with the same coverage. Example: `tests/e2e/pomogator-doctor.test.ts` (aggregate, never created) → refs replaced with `tests/e2e/doctor-{core,entry,...}.test.ts (split layout)` |
| 3 | **RECREATE-as-skip** | `impl-drift/missing-test`; spec/`.feature` carries load-bearing requirements; no alternative exists | BDD 1:1 mapping (`extension-test-quality`) must be preserved. Create stub `*.test.ts` with `it.skip()` blocks mirroring `.feature` scenarios + TODO comments. Example: `settings-protection.test.ts` |
| 4 | **DEFER-spec** | Whole slug shelved: no skill, no tests, no `.feature`, multiple open `- [ ]` tasks | Add `> **Status: DEFERRED (YYYY-MM-DD)**` banner to README + mark TASKS as `[DEFERRED]`. Reconcile lowers severity for the slug. Example: `personal-pomogator` |
| 5 | **MCP-method-name exclusion** (detection-side) | Backticked ref matches the path-ref regex but is actually a JSON-RPC method name (`tools/list`, `resources/read`, ...) | Extend `MCP_METHOD_NAMES` set in `scripts/reconcile.ts` + add a regression test in `scripts/__tests__/reconcile.test.ts`. Pattern generalises to any `<noun>/<verb>` protocol family (LSP, custom JSON-RPC). |

**Selection rule when multiple patterns apply** — prefer the one
that preserves the most context for the next agent. Order from
richest to leanest: `WRAP-deprecated > RECREATE-as-skip >
DELETE-redirect > DEFER-spec`. Pattern 5 is orthogonal — it
suppresses detection before pattern selection happens.

See `references/reference_resolution-patterns.md` for the full
catalog with concrete before/after diffs, audit-footprint
expectations (which `resolution_pattern` value to stamp on each
finding), and extension procedure for adding new JSON-RPC families
to the detection-side exclusion list.

## See also

- `scripts/reconcile-cli.ts` — **the runnable CLI driver** (flags → engine → YAML/SARIF + summary table)
- `scripts/reconcile.ts` — light-mode engine (mechanical checks)
- `scripts/full-mode.ts` — full-mode semantic pass (Phase-3 LLM judge wrapper)
- `scripts/sarif.ts` — SARIF 2.1.0 emitter
- `references/reference_resolution-patterns.md` — full pattern catalog with before/after diffs
- `../cross-spec-resolve/SKILL.md` — sibling that walks the user through
  resolving each finding interactively
- `.specs/spec-generator-v4/FR.md` FR-17 (formal requirement)
