# Design

## Реализуемые требования

- FR-1 — validate-plan.ts enforces evidence (Phase 4)
- FR-2 — claims-need-evidence rule + template + index

## Компоненты

- `tools/plan-pomogator/validate-plan.ts` — `validateEvidence()` (Phase 4): requires the «Источники / Пруфы» section + flags unsourced claim-bullets.
- `.claude/rules/plan-pomogator/claims-need-evidence.md` — the policy (proof-marker format, what needs/doesn't need a proof).
- `tools/plan-pomogator/template.md` — the «Источники / Пруфы» section in the plan template.
- `CLAUDE.md` — rules-table index row.

## Где лежит реализация

- App-код: `tools/plan-pomogator/validate-plan.ts` (`validateEvidence`, in `validateActionability`).
- Wiring: it runs in Phase 4 of `validatePlanPhased`, invoked by plan-gate at ExitPlanMode.

## Директории и файлы

- `tools/plan-pomogator/validate-plan.ts`, `tools/plan-pomogator/template.md`
- `.claude/rules/plan-pomogator/claims-need-evidence.md`, `CLAUDE.md`

## Алгоритм

1. On plan validation, Phase 4 `validateEvidence` scans for the «Источники / Пруфы» section.
2. Missing section / no proof marker → warning.
3. Claim-verb bullets (supports/быстрее/требует/default…) in Context/Implementation-Plan lacking `[src:]`/`[ref:]`/`[cmd:]` → flagged unsourced.

## Key Decisions

### Decision: Phase 4 warning, not Phase 1 error

**Rationale:** legacy plans lack the section; a hard error would block every existing plan.

**Trade-off:** advisory, not blocking — a determined author can ignore it.

**Alternatives considered:**
- Phase 1 hard error — rejected because it breaks all legacy plans.
- A Haiku plan-judge — deferred (optional follow-on; the regex flag covers the common case cheaply).

## BDD Test Infrastructure (ОБЯЗАТЕЛЬНО)

**TEST_DATA:** TEST_DATA_NONE
**TEST_FORMAT:** UNIT
**Framework:** N/A при UNIT
**Install Command:** already installed (vitest)
**Evidence:** `tests/e2e/plan-validator.test.ts` PLUGIN007_45 drives `validatePlanPhased` directly; logic verified on host 4/4 (`.dev-pomogator/.tmp/verify-evidence.mts`).
**Verdict:** no test-data hooks required — pure validator over in-memory plan lines.
