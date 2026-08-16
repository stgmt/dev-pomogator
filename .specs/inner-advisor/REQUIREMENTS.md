# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | @featureN | Status |
|----|------|-----------|-----------|--------|
| [FR-1](FR.md#fr-1-rolling-session-summary-10-секций-на-диске) | Rolling session summary (10 секций) | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1), [AC-1b](ACCEPTANCE_CRITERIA.md#ac-1b-fr-1) | @feature1 | Verified |
| [FR-2](FR.md#fr-2-гейт-обновления-summary-cost-gate) | Гейт обновления summary | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2) | @feature1 | Verified |
| [FR-3](FR.md#fr-3-stop-hook-автообновления-summary-в-реальных-сессиях) | Stop-hook авто-обновление | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3) | @feature2 | Verified |
| [FR-4](FR.md#fr-4-mcp-тул-advisor-self-invocation-в-каноне) | MCP-тул advisor в каноне | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4) | @feature3 | Verified |
| [FR-5](FR.md#fr-5-fail-open-и-bounded-input-по-всей-цепочке) | Fail-open и bounded-input | [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5) | @feature4 | Verified |
| [FR-6](FR.md#fr-6-evidence-based-консультация-two-pass-skeptic-balanced) | Evidence-based консультация | [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6) | @feature5 | Verified |
| [FR-7](FR.md#fr-7-изоляция-от-out-session-advisor) | Изоляция от out-session-advisor | [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7) | @feature6 | Verified |
| [FR-8](FR.md#fr-8-измеримость-bench-и-асинхронность-внутри-синхронного-тула) | Измеримость + async | [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8) | @feature7 | Verified |
| [FR-9](FR.md#fr-9-read-only-inner-advisor-строго-по-факту-инструментов) | READ-ONLY inner advisor | [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9), [AC-9b](ACCEPTANCE_CRITERIA.md#ac-9b-fr-9) | @feature8 | Verified |
| [FR-10](FR.md#fr-10-интеграция-mindlas-metrics-в-консультацию) | Интеграция MINDLAS metrics | [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10) | @feature9 | Verified |

## Functional Requirements

- [FR-1: Rolling session summary](FR.md#fr-1-rolling-session-summary-10-секций-на-диске)
- [FR-2: Гейт обновления summary](FR.md#fr-2-гейт-обновления-summary-cost-gate)
- [FR-3: Stop-hook автообновления](FR.md#fr-3-stop-hook-автообновления-summary-в-реальных-сессиях)
- [FR-4: MCP-тул advisor в каноне](FR.md#fr-4-mcp-тул-advisor-self-invocation-в-каноне)
- [FR-5: Fail-open и bounded-input](FR.md#fr-5-fail-open-и-bounded-input-по-всей-цепочке)
- [FR-6: Evidence-based консультация](FR.md#fr-6-evidence-based-консультация-two-pass-skeptic-balanced)
- [FR-7: Изоляция от out-session-advisor](FR.md#fr-7-изоляция-от-out-session-advisor)
- [FR-8: Измеримость + async](FR.md#fr-8-измеримость-bench-и-асинхронность-внутри-синхронного-тула)
- [FR-9: READ-ONLY inner advisor](FR.md#fr-9-read-only-inner-advisor-строго-по-факту-инструментов)
- [FR-10: Интеграция MINDLAS metrics](FR.md#fr-10-интеграция-mindlas-metrics-в-консультацию)

## Non-Functional Requirements

- [Performance](NFR.md#performance)
- [Security](NFR.md#security)
- [Reliability](NFR.md#reliability)
- [Usability](NFR.md#usability)

## Acceptance Criteria

- [AC-1 (FR-1): консультация через summary](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
- [AC-1b (FR-1): структура 10 секций, атомарность](ACCEPTANCE_CRITERIA.md#ac-1b-fr-1)
- [AC-2 (FR-2): гейт](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
- [AC-3 (FR-3): Stop-hook гейт+delta, fail-open](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
- [AC-4 (FR-4): каноническая доступность](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
- [AC-5 (FR-5): fail-open/bounded](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)
- [AC-6 (FR-6): balanced судит по делу](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)
- [AC-7 (FR-7): изоляция](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)
- [AC-8 (FR-8): bench-метрики](ACCEPTANCE_CRITERIA.md#ac-8-fr-8)
- [AC-9 (FR-9): read-only по инструментам](ACCEPTANCE_CRITERIA.md#ac-9-fr-9)
- [AC-9b (FR-9): re-delegate, не фиксить сам](ACCEPTANCE_CRITERIA.md#ac-9b-fr-9)
- [AC-10 (FR-10): MINDLAS секция + fail-open](ACCEPTANCE_CRITERIA.md#ac-10-fr-10)

## Verification Matrix (CHK)

| CHK-ID | Requirement | Traces To (FR+SC) | Verification Method | Status | Notes |
|--------|-------------|-------------------|---------------------|--------|-------|
| CHK-FR1-01 | Summary существует и используется консультацией | FR-1, AC-1, @feature1 | Integration test | Verified | mode='summary', 90MB→9.9K (live); BDD INNERADV01 |
| CHK-FR1-02 | 10 секций + атомарность + verifyStructure | FR-1, AC-1b, @feature1 | Unit test | Verified | BDD INNERADV01; verifyStructure в юнит-слоях |
| CHK-FR2-01 | Гейт init 5K не стреляет на короткой; force пропускает | FR-2, AC-2, @feature1 | Unit test | Verified | BDD INNERADV02 (offline детерминированно) |
| CHK-FR3-01 | Stop-hook по гейту обновляет summary; fail-open | FR-3, AC-3, @feature2 | Integration test | Verified | BDD INNERADV03; гейт+delta, wx-lock |
| CHK-FR4-01 | MCP тул доступен во всех сессиях без машинных путей | FR-4, AC-4, @feature3 | Integration test | Verified | BDD INNERADV04; CLAUDE_PLUGIN_ROOT resolve |
| CHK-FR5-01 | Fail-open: нет ключа/таймаут/битый транскрипт | FR-5, AC-5, @feature4 | Integration test | Verified | BDD INNERADV05 |
| CHK-FR5-02 | bounded входы: digest budget, delta≤40 | FR-5, AC-5, @feature4 | Unit test | Verified | BDD INNERADV05 (fail-open/bounded) |
| CHK-FR6-01 | balanced судит по делу без шаблонного «не done» | FR-6, AC-6, @feature5 | Integration test | Verified | BDD INNERADV06; skeptic-ab сравнение |
| CHK-FR7-01 | Изоляция от out-session-advisor | FR-7, AC-7, @feature6 | Manual review | Verified | BDD INNERADV07 (grep/пути/хуки) |
| CHK-FR8-01 | Bench: сжатие ≤0.3%, q≥2, kept/compact/omitted | FR-8, AC-8, @feature7 | Integration test | Verified | bench/real-sessions.mjs (0.1-0.3%) |
| CHK-FR8-02 | skeptic-ab сравнение strict/balanced | FR-8, AC-8, @feature7 | Integration test | Verified | bench/skeptic-ab.mjs |
| CHK-FR9-01 | Inner advisor строго read-only по инструментам | FR-9, AC-9, @feature8 | Integration test | Verified | BDD INNERADV09; у тула MCP нет Write/Edit/state-Bash |
| CHK-FR9-02 | Проблема → re-delegate; запись summary только Stop-hook | FR-9, AC-9b, @feature8 | Integration test | Verified | BDD INNERADV09; fable-lead приём |
| CHK-FR10-01 | MINDLAS секция в консультации при доступном scorecard | FR-10, AC-10, @feature9 | Integration test | Verified | BDD INNERADV10 (parse) + live e2e (ledger→секция) |
| CHK-FR10-02 | Fail-open: mindlas отсутствует → консультация без секции | FR-10, AC-10, @feature9 | Integration test | Verified | BDD INNERADV10 (renderMindlasStats(null)='') |

## Verification Process

1. Каждый CHK связан с тестом (BDD/unit/integration) через Traces To.
2. Verification Method: `BDD scenario` | `Unit test` | `Manual review` | `Integration test` | `N/A`.
3. Status движется к Verified только когда тест проходит; Manual review — с записью результата в Notes.

### Статус-цикл

`Draft` → `In Progress` → `Verified` → `Blocked` (Blocked + issue link при регрессии).

### Review cadence

- Phase 2 STOP: все CHK в `Draft`.
- Phase 3 STOP: ≥50% CHK в `In Progress`.
- Конец реализации: 100% `Verified` или `Blocked`.

## Summary Counts

- Total CHKs: 15
- Verified: 15
- In Progress: 0
- Draft: 0
- Blocked: 0