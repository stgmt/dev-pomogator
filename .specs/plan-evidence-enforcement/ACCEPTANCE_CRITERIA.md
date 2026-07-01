# Acceptance Criteria (EARS)

## AC-1 (FR-1)

**Требование:** [FR-1](FR.md#fr-1-validate-plan-enforces-evidence)

WHEN a plan lacks an «Источники / Пруфы» section with a proof THEN `validate-plan.ts` Phase 4 SHALL warn; WHEN a Context/Implementation-Plan bullet makes a claim without a `[src:]`/`[ref:]`/`[cmd:]` marker THEN it SHALL flag it as unsourced.

## AC-2 (FR-2)

**Требование:** [FR-2](FR.md#fr-2-claims-need-evidence-rule-and-template)

WHEN the rule `claims-need-evidence` is consulted THEN it SHALL define the proof-marker format AND the plan template SHALL carry an «Источники / Пруфы» section AND CLAUDE.md SHALL index the rule.
