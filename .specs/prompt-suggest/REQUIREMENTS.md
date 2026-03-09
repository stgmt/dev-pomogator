# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | BDD Scenario | @featureN | Status |
|----|------|-----------|--------------|-----------|--------|
| [FR-1](FR.md#fr-1-stop-hook--генерация-подсказки) | Stop Hook — генерация подсказки | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-stop-hook-генерация-подсказки) | Scenario 1, 2 | @feature1 | Draft |
| [FR-2](FR.md#fr-2-submit-hook--инжекция-подсказки-через-) | Submit Hook — инжекция через "+" | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-submit-hook-инжекция-подсказки), [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-2-pass-through-без-подсказки) | Scenario 3, 4, 5 | @feature2 | Draft |
| [FR-3](FR.md#fr-3-auto-detect-api) | Auto-detect API | [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-3-openrouter-api), [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-3-aipomogator-api) | Scenario 6, 7 | @feature3 | Draft |
| [FR-4](FR.md#fr-4-ttl-для-state-file) | TTL для state file | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-2-pass-through-без-подсказки) | Scenario 5 | @feature4 | Draft |
| [FR-5](FR.md#fr-5-fail-open) | Fail-open | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-5-disabled) | Scenario 8 | @feature5 | Draft |
| [FR-6](FR.md#fr-6-системный-промпт-v2) | Системный промпт v2 | — | (prompt quality) | @feature6 | Draft |
| [FR-7](FR.md#fr-7-silence--пустой-ответ-llm) | Silence | [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-7-silence) | Scenario 9 | @feature7 | Draft |
| [FR-8](FR.md#fr-8-stop_hook_active-guard) | stop_hook_active guard | [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-8-stop_hook_active) | Scenario 10 | @feature8 | Draft |
| [FR-9](FR.md#fr-9-systemmessage-с--emoji) | systemMessage 💡 | [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-9-systemmessage) | Scenario 1 | @feature9 | Draft |

## Functional Requirements

- [FR-1: Stop Hook — генерация подсказки](FR.md#fr-1-stop-hook--генерация-подсказки) @feature1
- [FR-2: Submit Hook — инжекция через "+"](FR.md#fr-2-submit-hook--инжекция-подсказки-через-) @feature2
- [FR-3: Auto-detect API](FR.md#fr-3-auto-detect-api) @feature3
- [FR-4: TTL для state file](FR.md#fr-4-ttl-для-state-file) @feature4
- [FR-5: Fail-open](FR.md#fr-5-fail-open) @feature5
- [FR-6: Системный промпт v2](FR.md#fr-6-системный-промпт-v2) @feature6
- [FR-7: Silence](FR.md#fr-7-silence--пустой-ответ-llm) @feature7
- [FR-8: stop_hook_active guard](FR.md#fr-8-stop_hook_active-guard) @feature8
- [FR-9: systemMessage 💡](FR.md#fr-9-systemmessage-с--emoji) @feature9

## Non-Functional Requirements

- [Performance](NFR.md#performance) (NFR-P1..P3)
- [Security](NFR.md#security) (NFR-S1..S2)
- [Reliability](NFR.md#reliability) (NFR-R1..R3)
- [Usability](NFR.md#usability) (NFR-U1..U4)

## Acceptance Criteria

- [AC-1 (FR-1): Stop Hook — генерация подсказки](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-stop-hook-генерация-подсказки)
- [AC-2 (FR-2): Submit Hook — инжекция подсказки](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-submit-hook-инжекция-подсказки)
- [AC-3 (FR-2): Pass-through без подсказки](ACCEPTANCE_CRITERIA.md#ac-3-fr-2-pass-through-без-подсказки)
- [AC-4 (FR-5): Disabled](ACCEPTANCE_CRITERIA.md#ac-4-fr-5-disabled)
- [AC-5 (FR-7): Silence](ACCEPTANCE_CRITERIA.md#ac-5-fr-7-silence)
- [AC-6 (FR-9): systemMessage](ACCEPTANCE_CRITERIA.md#ac-6-fr-9-systemmessage)
- [AC-7 (FR-3): OpenRouter API](ACCEPTANCE_CRITERIA.md#ac-7-fr-3-openrouter-api)
- [AC-8 (FR-3): aipomogator API](ACCEPTANCE_CRITERIA.md#ac-8-fr-3-aipomogator-api)
- [AC-9 (FR-8): stop_hook_active](ACCEPTANCE_CRITERIA.md#ac-9-fr-8-stop_hook_active)
