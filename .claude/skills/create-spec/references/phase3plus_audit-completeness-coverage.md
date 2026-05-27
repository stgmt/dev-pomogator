# Phase 3+ Audit — COMPLETENESS_COVERAGE (10th category)

FR-12. Sibling of ARCHITECTURE_COVERAGE (9th). Checks the 8 system-completeness dimensions are explicitly addressed before STOP #3 — closes silent-omission gaps surfaced in real greenfield work (bhph: missed webhook fast-ack, idempotency, retention, cost-quota).

## What it detects

Runs `architecture-decision-cli.ts audit-completeness <spec-dir>` over `ARCHITECTURE/COMPLETENESS.md` ledger:

| Code | Severity | Meaning |
|------|----------|---------|
| `DIMENSION_PENDING` | WARNING | A dimension is `pending`, absent from ledger, or ledger missing (= all 8 pending) — blocks STOP #3 |
| `COMPLETENESS_COMPLETE` | INFO | All 8 dimensions `addressed`/`out-of-scope` (positive signal) |
| `WARNING_REASON_TOO_SHORT` | INFO | `[skip-completeness-dimension: <reason>]` with reason <12 chars |

## The 8 dimensions (map to rubric R13-R20)

`internal-consistency` (R13) · `flow-completeness` (R14) · `compliance-privacy` (R15) · `auth-secrets` (R16) · `observability` (R17) · `data-lifecycle` (R18) · `cost-quota` (R19, set BEFORE axis lock) · `deploy-ops` (R20).

## Ledger format (`ARCHITECTURE/COMPLETENESS.md`)

```markdown
| dimension | status | reason |
|-----------|--------|--------|
| internal-consistency | addressed | diagrams match accepted decisions |
| cost-quota | addressed | per-SMS cost set before Twilio lock |
| data-lifecycle | out-of-scope | no unbounded growth in MVP |
| ... | pending | |
```

## When applicable

Only if `ARCHITECTURE/` exists (Phase 1.75 ran, greenfield). Brownfield/skipped → no ledger → category no-op.

## Resolution

`DIMENSION_PENDING` WARNING → mark `addressed` (+ design pointer) / `out-of-scope` (+ reason ≥12) in COMPLETENESS.md, OR add `[skip-completeness-dimension: <reason ≥12 chars>]`. Escapes logged to `.claude/logs/spec-completeness-escapes.jsonl`.

## Related

- Sibling: [phase3plus_audit-architecture-coverage.md](phase3plus_audit-architecture-coverage.md)
- Audit logic: `extensions/specs-workflow/tools/specs-generator/architecture-decision/audit.ts` (`checkCompletenessCoverage`)
- Phase 1.75: [phase1.75_architecture-decisions.md](phase1.75_architecture-decisions.md)
