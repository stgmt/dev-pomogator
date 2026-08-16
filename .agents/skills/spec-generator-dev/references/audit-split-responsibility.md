# Audit split-responsibility model (who checks what)

Spec health is **not** one check — it's a layered composition. The authoritative
entry point is `spec-verdict.ts` (per-spec) / `corpus-health.ts` (corpus-wide);
the individual tools below are its inputs. Reporting "valid/clean/done" from any
single layer is forbidden (rule `no-structural-valid.md`, FR-37d) — only the
composed verdict counts.

## Per-spec layers (composed by `spec-verdict.ts`, in order)

| Layer | Tool | Scope | Gates? | What it answers |
|---|---|---|---|---|
| pre-filter | `validate-spec.ts` | structural (format, headings, cross-ref links) | NO (pre-filter only) | "is the markdown well-formed?" — NOT health |
| audit gate | `audit-spec.ts` | per-spec audit findings (P0…) | YES — any ERROR fails | "are there hard structural defects?" |
| conformance | `spec-graph/conformance.ts` | the SpecGraph (one graph) | error-severity gates | UNCOVERED_FR / ORPHAN_TASK / UNTAGGED_SCENARIO / TASK_UNTESTED / TASK_STATUS_UNVERIFIED / TAG_BULK_SUSPECT |
| coverage | `spec-graph/coverage.ts` (FR-32) | last-run NDJSON × tasks | rollup | per-scenario buckets + per-task `verified_status` (DONE only if every mapped scenario passed) |
| traceability | FR-37b (in verdict) | cell→atom | YES — gaps fail | stale FILE_CHANGES / UNCOVERED_FR / TASK_UNTESTED / UNTAGGED_SCENARIO |
| semantic | FR-8 judge (`claude`) | LLM drift spec↔code | fail-loud if skipped | "does the prose still match reality?" (SEMANTIC_SKIPPED ≠ clean) |

`VERDICT` = GREEN only when every gating layer passes; a gap list is cited
alongside (FR-37d).

## Corpus-wide (separate tool — `corpus-health.ts`)

The ORGANISM view across ALL `.specs/`, NOT a per-spec verdict:
bare-id collisions (raw pre-map dump), dangling/unresolved edges, untraced
atoms, stale FILE_CHANGES, and the reverse-trace checks (ORPHAN_PROJECT_TEST /
FR_NO_RESEARCH / UPSTREAM_UNLINKED / TASK_NO_REQUIREMENT, FR-44).

## Adjacent surfaces (not part of the verdict)

- `spec-conformance-push.ts` — PostToolUse: runs conformance on spec edits, throttled push + JSONL log.
- `task-census.ts` — the per-prompt banner's "what's unfinished" (open / 🔴 / ⏸), graph-only.
- `spec-status` skill — honest per-spec status via an independent sub-agent (delegates to the verdict).

## The rule

Pick the layer by the question:
- "well-formed?" → validate-spec; "hard defects?" → audit-spec; "graph wired?" →
  conformance; "really done?" → coverage `verified_status`; "prose drifted?" →
  FR-8 semantic; "corpus-wide disease?" → corpus-health; **"is it healthy?" →
  spec-verdict (the composition), never one layer alone.**
