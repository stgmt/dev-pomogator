# Pinator (canonical)

Stop-time drive-loop: while the session has authoritative unfinished work, the agent must not lazy-stop. Pinator evaluates Stop (eligibility + judge + evidence) and contracts next-step / async carve-outs.

**Canonical name:** Pinator = this spec.
**Runtime path (this wave):** `tools/claim-evidence-gate/` (not renamed yet).
**Not Pinator:** `prompt-suggest` / former npm script `build:pinator` (use `build:prompt-suggest`).

**Honesty:** `spec-verdict` OVERALL READY ≠ product COMPLETE. M0/M6/M7 and inherited redesign TASKS remain open debt.

## Module map

| Module | Content | Status |
|--------|---------|--------|
| M0 Intent | goal once / drive until genuine decision (#63) | open backlog |
| M1 Eligibility | task/plan/spec/`/goal` | contract migrated (CEGATE001); redesign TASKS below still open where unfinished |
| M2 Judge+evidence | classifier, Meridian, carry-over, normative (#149/#161/#193) | contract migrated + issue links; follow-ups open |
| M3 Next-step contract | packet `next*`; census owned by spec-generator-v4 FR-49 | migrated boundary |
| M4 Async | bg in-flight via [bg-task-guard](../bg-task-guard/README.md) | dependency link |
| M5 User suggest | optional [prompt-suggest](../prompt-suggest/README.md) | link only |
| M6 Polarity flip | #74 referent carve-out | open backlog |
| M7 Orchestration | #212/#215 Dynamic Workflow | open / OUT_OF_SCOPE impl this wave |

## Where code lives

`tools/claim-evidence-gate/` (`claim_evidence_gate_stop.ts`, `meridian-judge.ts`, …); bundle `claim_evidence_gate_stop.bundle.mjs`. Hooks: Claude Stop route. Executable BDD: `tests/features/plugins/claim-evidence-gate/CEGATE001_pinator.feature` (steps mirrored in `pinator.feature`).

## Related

- Supersedes archived `claim-evidence-gate`.
- Census/router infra: [spec-generator-v4 FR-49](../spec-generator-v4/FR.md) (generic only; Pinator policy lives here).
- Inbound-ref inventory: `audit-out/pinator-inbound-refs.json`.
