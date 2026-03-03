# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | @featureN | BDD Scenario | Status |
|----|------|-----------|-----------|--------------|--------|
| [FR-1](FR.md#fr-1-чтение-отчёта-insights-feature1) | Чтение отчёта insights | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-чтение-отчёта-insights-feature1) | @feature1 | PLUGIN008_01: Fresh report extraction | Draft |
| [FR-2](FR.md#fr-2-проверка-свежести-отчёта-feature2) | Проверка свежести отчёта | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-stale-маркер-для-устаревшего-отчёта-feature2), [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-2-недоступный-отчёт-feature2) | @feature2 | PLUGIN008_02: Stale report, PLUGIN008_03: Missing report | Draft |
| [FR-3](FR.md#fr-3-извлечение-friction-categories-feature3) | Извлечение friction categories | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-3-извлечение-friction-categories-feature3) | @feature3 | PLUGIN008_01: Fresh report extraction | Draft |
| [FR-4](FR.md#fr-4-извлечение-claudemd-suggestions-feature4) | Извлечение CLAUDE.md suggestions | [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-4-извлечение-claudemd-suggestions-feature4) | @feature4 | PLUGIN008_01: Fresh report extraction | Draft |
| [FR-5](FR.md#fr-5-извлечение-big-wins-и-usage-patterns-feature5) | Извлечение big wins и usage patterns | AC-1 + AC-6 (indirect) | @feature5 | PLUGIN008_01: Fresh report extraction | Draft |
| [FR-6](FR.md#fr-6-извлечение-project-areas-для-обогащения-доменов-feature6) | Извлечение project areas | -- (input for Phase 0.5) | @feature6 | PLUGIN008_01: Fresh report extraction | Draft |
| [FR-7](FR.md#fr-7-создание-pre-candidates-с-оценкой-релевантности-feature7) | Создание pre-candidates | [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-7-оценка-релевантности-pre-candidates-feature7) | @feature7 | PLUGIN008_01: Fresh report extraction | Draft |
| [FR-8](FR.md#fr-8-unified-mode-display-feature8) | Unified mode display | [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-8-unified-mode-display-feature8) | @feature8 | PLUGIN008_04: Unified mode display | Draft |
| [FR-9](FR.md#fr-9-маркер-источника-в-phase-3-feature9) | Маркер источника в Phase 3 | [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-9-маркер-источника-в-phase-3-feature9) | @feature9 | PLUGIN008_05: Source markers | Draft |
| [FR-10](FR.md#fr-10-дедупликация-insights-с-session-findings-feature9) | Дедупликация insights с session | [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-10-дедупликация-при-совпадении-с-session-feature9) | @feature9 | PLUGIN008_05: Source markers | Draft |
| -- | Пропуск Phase -0.5 в Cursor | [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-1fr-9-пропуск-phase--05-в-cursor-feature10) | @feature10 | (implicit -- absence test) | Draft |

## Functional Requirements

- [FR-1: Чтение отчёта insights](FR.md#fr-1-чтение-отчёта-insights-feature1) @feature1
- [FR-2: Проверка свежести отчёта](FR.md#fr-2-проверка-свежести-отчёта-feature2) @feature2
- [FR-3: Извлечение friction categories](FR.md#fr-3-извлечение-friction-categories-feature3) @feature3
- [FR-4: Извлечение CLAUDE.md suggestions](FR.md#fr-4-извлечение-claudemd-suggestions-feature4) @feature4
- [FR-5: Извлечение big wins и usage patterns](FR.md#fr-5-извлечение-big-wins-и-usage-patterns-feature5) @feature5
- [FR-6: Извлечение project areas для обогащения доменов](FR.md#fr-6-извлечение-project-areas-для-обогащения-доменов-feature6) @feature6
- [FR-7: Создание pre-candidates с оценкой релевантности](FR.md#fr-7-создание-pre-candidates-с-оценкой-релевантности-feature7) @feature7
- [FR-8: Unified mode display](FR.md#fr-8-unified-mode-display-feature8) @feature8
- [FR-9: Маркер источника в Phase 3](FR.md#fr-9-маркер-источника-в-phase-3-feature9) @feature9
- [FR-10: Дедупликация insights с session findings](FR.md#fr-10-дедупликация-insights-с-session-findings-feature9) @feature9

## Non-Functional Requirements

| ID | Category | Description |
|----|----------|-------------|
| [NFR-Perf](NFR.md#performance) | Performance | Targeted extraction from 3-4 HTML sections, not full file parse |
| [NFR-Sec](NFR.md#security) | Security | N/A -- local file only, no data exfiltration |
| [NFR-Rel](NFR.md#reliability) | Reliability | Graceful degradation on all failure modes (missing, corrupt, stale) |
| [NFR-Usab](NFR.md#usability) | Usability | Unified mode display, clear source markers, stale warnings |

## Acceptance Criteria

- [AC-1 (FR-1): Чтение отчёта insights](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-чтение-отчёта-insights-feature1) @feature1
- [AC-2 (FR-2): Stale-маркер для устаревшего отчёта](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-stale-маркер-для-устаревшего-отчёта-feature2) @feature2
- [AC-3 (FR-2): Недоступный отчёт](ACCEPTANCE_CRITERIA.md#ac-3-fr-2-недоступный-отчёт-feature2) @feature2
- [AC-4 (FR-3): Извлечение friction categories](ACCEPTANCE_CRITERIA.md#ac-4-fr-3-извлечение-friction-categories-feature3) @feature3
- [AC-5 (FR-4): Извлечение CLAUDE.md suggestions](ACCEPTANCE_CRITERIA.md#ac-5-fr-4-извлечение-claudemd-suggestions-feature4) @feature4
- [AC-6 (FR-7): Оценка релевантности pre-candidates](ACCEPTANCE_CRITERIA.md#ac-6-fr-7-оценка-релевантности-pre-candidates-feature7) @feature7
- [AC-7 (FR-8): Unified mode display](ACCEPTANCE_CRITERIA.md#ac-7-fr-8-unified-mode-display-feature8) @feature8
- [AC-8 (FR-9): Маркер источника в Phase 3](ACCEPTANCE_CRITERIA.md#ac-8-fr-9-маркер-источника-в-phase-3-feature9) @feature9
- [AC-9 (FR-10): Дедупликация при совпадении с session](ACCEPTANCE_CRITERIA.md#ac-9-fr-10-дедупликация-при-совпадении-с-session-feature9) @feature9
- [AC-10 (FR-1..FR-9): Пропуск Phase -0.5 в Cursor](ACCEPTANCE_CRITERIA.md#ac-10-fr-1fr-9-пропуск-phase--05-в-cursor-feature10) @feature10
