# Phase 3+ Audit — ARCHITECTURE_COVERAGE (9th category)

Mirror of VARIANT_COVERAGE. Checks greenfield architecture decisions are resolved before STOP #3.

## What it detects

Runs `architecture-decision-cli.ts audit <spec-dir>` over `.specs/{slug}/ARCHITECTURE/`:

| Code | Severity | Meaning |
|------|----------|---------|
| `AXIS_PENDING` | WARNING | An axis is still `pending` — blocks STOP #3 (resolve or escape) |
| `MATRIX_COMPLETE` | INFO | All axes resolved (positive signal) |
| `ESCAPE_HATCH_USED` | INFO | `[skip-architecture-axis: <reason ≥12>]` used (logged to JSONL) |
| `WARNING_REASON_TOO_SHORT` | INFO | escape reason <12 chars |

## When applicable

Only if `.specs/{slug}/ARCHITECTURE/` exists (Phase 1.75 ran). Brownfield/skipped specs → no ARCHITECTURE dir → category no-op (0 findings).

## Resolution

- `AXIS_PENDING` WARNING → either choose a variant (auto-mode recommendation or override) or add `[skip-architecture-axis: <reason ≥12 chars>]`.
- Escape audit trail: `.claude/logs/spec-architecture-escapes.jsonl`. See `.claude/rules/specs-workflow/architecture-decision/escape-hatch-audit.md`.

## Related

- Phase 1.75: [phase1.75_architecture-decisions.md](phase1.75_architecture-decisions.md)
- Audit logic: `extensions/specs-workflow/tools/specs-generator/architecture-decision/audit.ts`
- Mirror: [phase3plus_audit-variant-coverage.md](phase3plus_audit-variant-coverage.md)
