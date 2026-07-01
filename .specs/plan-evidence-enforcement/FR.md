# Functional Requirements (FR)

## FR-1: validate-plan enforces evidence

`tools/plan-pomogator/validate-plan.ts` Phase 4 (`validateEvidence`) SHALL warn when a plan lacks an
«Источники / Пруфы» section carrying a proof, AND flag a Context/Implementation-Plan claim-bullet
(supports/быстрее/требует/default/…) that has no `[src:]`/`[ref:]`/`[cmd:]` marker. DONE — commit `8e33904`.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)

## FR-2: claims-need-evidence rule and template

The rule `.claude/rules/plan-pomogator/claims-need-evidence.md` SHALL define the proof-marker format
and what does/does not need a proof; the plan template SHALL carry an «Источники / Пруфы» section; and
`CLAUDE.md` SHALL index the rule. DONE — `8e33904`.

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
