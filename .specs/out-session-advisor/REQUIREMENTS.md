# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | @featureN | Status |
|----|------|-----------|-----------|--------|
| [FR-1](FR.md#fr-1-tail-главного-транскрипта-живых-subagents-снятие-слепоты) | Tail транскрипта + живые subagents | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1) | @feature1 | Draft |
| [FR-2](FR.md#fr-2-управление-воркером-stream-json-primary-conpty-fallback) | stream-json + skip-permissions + ConPTY fallback | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2) | @feature2 | Draft |
| [FR-3](FR.md#fr-3-факт-проверка-отчётов-воркера-verifyclaims) | verify_claims (CONFIRMED/GAP + 403-цепочка) | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3) | @feature3 | Draft |
| [FR-4](FR.md#fr-4-цикл-мониторинга-не-встаёт-живость-процесса-интервальные-снапшоты) | Не «встаёт» + живость | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4) | @feature4 | Draft |
| [FR-5](FR.md#fr-5-канонический-skillmd-зеркало-доменные-истины) | SKILL.md + зеркало + домены | [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5) | @feature5 | Draft |
| [FR-6](FR.md#fr-6-git-гейт-против-add-a-и-чужих-staged-runtime-слой-no-git-add-all-shared-tree) | Git-гейт shared-tree | [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6) | @feature6 | Draft |
| [FR-7](FR.md#fr-7-атомарный-лок-сервис-с-владельцем-и-stale-восстановлением) | Атомарный лок+владелец | [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7) | @feature7 | Draft |
| [FR-8](FR.md#fr-8-инвентаризация-сессий-по-нескольким-репо) | Инвентаризация репо | [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8) | @feature8 | Draft |
| [FR-9](FR.md#fr-9-диагностика-кто-писал-файл-single-writer-для-адвизора) | Кто писал <файл> | [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9) | @feature9 | Draft |
| [FR-10](FR.md#fr-10-сводная-диагностика-параллельности-okdirtyconflict) | Сводка ok/dirty/conflict | [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10) | @feature10 | Draft |

## Functional Requirements

### Часть A — Адвизор

- [FR-1: Tail главного транскрипта + живых subagents](FR.md#fr-1-tail-главного-транскрипта-живых-subagents-снятие-слепоты)
- [FR-2: Управление воркером — stream-json (primary) + ConPTY fallback](FR.md#fr-2-управление-воркером-stream-json-primary-conpty-fallback)
- [FR-3: Факт-проверка отчётов воркера на «пиздёж» (verify_claims)](FR.md#fr-3-факт-проверка-отчётов-воркера-verifyclaims)
- [FR-4: Цикл мониторинга не «встаёт»](FR.md#fr-4-цикл-мониторинга-не-встаёт-живость-процесса-интервальные-снапшоты)
- [FR-5: Канонический SKILL.md + зеркало + доменные истины](FR.md#fr-5-канонический-skillmd-зеркало-доменные-истины)

### Часть B — Параллельная безопасность

- [FR-6: Git-гейт `add -A`/чужие staged](FR.md#fr-6-git-гейт-против-add-a-и-чужих-staged-runtime-слой-no-git-add-all-shared-tree)
- [FR-7: Атомарный лок-сервис](FR.md#fr-7-атомарный-лок-сервис-с-владельцем-и-stale-восстановлением)
- [FR-8: Инвентаризация сессий по репо](FR.md#fr-8-инвентаризация-сессий-по-нескольким-репо)
- [FR-9: «Кто писал <файл>»](FR.md#fr-9-диагностика-кто-писал-файл-single-writer-для-адвизора)
- [FR-10: Сводная диагностика](FR.md#fr-10-сводная-диагностика-параллельности-okdirtyconflict)

## Out of Scope Functional Requirements

- [FR-11: Стойкий pywinpty + fallback без PTY (OUT OF SCOPE)](FR.md#fr-11-стойкий-запуск-на-pywinpty-fallback-без-pty-out-of-scope)
- [FR-12: Множественные воркеры параллельно (OUT OF SCOPE)](FR.md#fr-12-множественные-воркеры-параллельно-в-одном-адвизоре-out-of-scope)

## Non-Functional Requirements

- [Performance](NFR.md#performance)
- [Security](NFR.md#security)
- [Reliability](NFR.md#reliability)
- [Usability](NFR.md#usability)

## Acceptance Criteria

- [AC-1 (FR-1): Tail + живые subagents](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
- [AC-2 (FR-2): stream-json + вопросы текстом](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
- [AC-3 (FR-3): verify_claims](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
- [AC-4 (FR-4): Не «встаёт»](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
- [AC-5 (FR-5): SKILL + зеркало](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)
- [AC-6 (FR-6): Git-гейт](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)
- [AC-7 (FR-7): Лок-сервис](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)
- [AC-8 (FR-8): Инвентаризация](ACCEPTANCE_CRITERIA.md#ac-8-fr-8)
- [AC-9 (FR-9): Кто писал](ACCEPTANCE_CRITERIA.md#ac-9-fr-9)
- [AC-10 (FR-10): Сводка](ACCEPTANCE_CRITERIA.md#ac-10-fr-10)

## Verification Matrix (CHK)

> Auto-populated by Skill `requirements-chk-matrix` during Phase 2.
> Hook `requirements-chk-guard` enforces format: ID `CHK-FR{n}-{nn}`, Traces To must include FR + (AC | @feature | UC),
> Verification Method ∈ {BDD scenario, Unit test, Manual review, Integration test, N/A},
> Status ∈ {Draft, In Progress, Verified, Blocked}.

| CHK-ID | Requirement | Traces To (FR+SC) | Verification Method | Status | Notes |
|--------|-------------|-------------------|---------------------|--------|-------|
| CHK-FR1-01 | Tail видит живые subagents | FR-1, AC-1, @feature1 | BDD scenario | Draft | — |
| CHK-FR2-01 | stream-json доставка без искажений; вопросы текстом | FR-2, AC-2, @feature2 | BDD scenario | Draft | — |
| CHK-FR3-01 | verify_claims CONFIRMED/GAP | FR-3, AC-3, @feature3 | BDD scenario | Draft | — |
| CHK-FR4-01 | цикл продолжается; живость | FR-4, AC-4, @feature4 | BDD scenario | Draft | — |
| CHK-FR5-01 | SKILL зеркало + parity | FR-5, AC-5, @feature5 | BDD scenario | Draft | — |
| CHK-FR6-01 | add -A гейт + чужие staged | FR-6, AC-6, @feature6 | BDD scenario | Draft | — |
| CHK-FR7-01 | атомарный лок + stale | FR-7, AC-7, @feature7 | BDD scenario | Draft | — |
| CHK-FR8-01 | инвентаризация/standalone | FR-8, AC-8, @feature8 | BDD scenario | Draft | — |
| CHK-FR9-01 | кто писал + single-writer | FR-9, AC-9, @feature9 | BDD scenario | Draft | — |
| CHK-FR10-01 | сводка ok/dirty/conflict | FR-10, AC-10, @feature10 | BDD scenario | Draft | — |

## Verification Process

### How CHKs are verified

1. Each CHK is linked to at least one BDD scenario or unit test via Traces To.
2. Verification Method values: `BDD scenario` | `Unit test` | `Manual review` | `Integration test` | `N/A`.
3. Status advances only when linked test passes; manual reviews record outcome in Notes.

### Status lifecycle

`Draft` → `In Progress` → `Verified` → `Blocked` (set `Blocked` + link issue on regression).

### Review cadence

- Phase 2 STOP: all CHKs in `Draft`.
- Phase 3 STOP: ≥50% of CHKs in `In Progress`.
- Implementation end: 100% `Verified` or explicit `Blocked` with issue link.

## Summary Counts

- Total CHKs: 10
- Verified: 0
- In Progress: 0
- Draft: 10
- Blocked: 0