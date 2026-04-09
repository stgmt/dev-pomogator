# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | @featureN | Status |
|----|------|-----------|-----------|--------|
| [FR-1](FR.md#fr-1-prompt-capture-использует-session_id-из-hook-input-feature1) | prompt-capture использует session_id из hook input | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-feature1) | @feature1 | Draft |
| [FR-2](FR.md#fr-2-prompt-capture-не-пишет-defaultjson-при-отсутствии-session_id-feature2) | prompt-capture не пишет default.json при отсутствии session_id | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-feature2) | @feature2 | Draft |
| [FR-3](FR.md#fr-3-prompt-capture-фильтрует-task-notification-псевдо-промпты-feature3) | prompt-capture фильтрует task-notification псевдо-промпты | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3-feature3) | @feature3 | Draft |
| [FR-4](FR.md#fr-4-plan-gate-loaduserprompts-не-имеет-most-recent-fallback-feature4) | plan-gate loadUserPrompts не имеет most-recent fallback | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4-feature4) | @feature4 | Draft |
| [FR-5](FR.md#fr-5-plan-gate-formatpromptsfromfile-фильтрует-task-notification-на-чтении-feature5) | plan-gate formatPromptsFromFile фильтрует task-notification на чтении | [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5-feature5) | @feature5 | Draft |
| [FR-6](FR.md#fr-6-спецификация-specsplan-pomogator-prompt-isolation-полна-и-валидна) | Спецификация полна и валидна | [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6) | meta-FR | Draft |
| [FR-7](FR.md#fr-7-регрессионные-тесты-покрывают-fr-1fr-5-интеграционно) | Регрессионные тесты покрывают FR-1..FR-5 интеграционно | [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7) | meta-FR | Draft |

## Functional Requirements

- [FR-1: prompt-capture использует session_id из hook input](FR.md#fr-1-prompt-capture-использует-session_id-из-hook-input-feature1)
- [FR-2: prompt-capture не пишет default.json при отсутствии session_id](FR.md#fr-2-prompt-capture-не-пишет-defaultjson-при-отсутствии-session_id-feature2)
- [FR-3: prompt-capture фильтрует task-notification псевдо-промпты](FR.md#fr-3-prompt-capture-фильтрует-task-notification-псевдо-промпты-feature3)
- [FR-4: plan-gate loadUserPrompts не имеет most-recent fallback](FR.md#fr-4-plan-gate-loaduserprompts-не-имеет-most-recent-fallback-feature4)
- [FR-5: plan-gate formatPromptsFromFile фильтрует task-notification на чтении](FR.md#fr-5-plan-gate-formatpromptsfromfile-фильтрует-task-notification-на-чтении-feature5)
- [FR-6: Спецификация полна и валидна](FR.md#fr-6-спецификация-specsplan-pomogator-prompt-isolation-полна-и-валидна-feature6)
- [FR-7: Регрессионные тесты покрывают FR-1..FR-5 интеграционно](FR.md#fr-7-регрессионные-тесты-покрывают-fr-1fr-5-интеграционно-feature7)

## Non-Functional Requirements

- [Performance](NFR.md#performance) — NFR-P1, NFR-P2
- [Security](NFR.md#security) — NFR-S1, NFR-S2, NFR-S3
- [Reliability](NFR.md#reliability) — NFR-R1, NFR-R2, NFR-R3
- [Usability](NFR.md#usability) — NFR-U1, NFR-U2, NFR-U3

## Acceptance Criteria

- [AC-1 (FR-1): session-specific file write](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-feature1)
- [AC-2 (FR-2): no write without session_id](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-feature2)
- [AC-3 (FR-3): task-notification filter on capture](ACCEPTANCE_CRITERIA.md#ac-3-fr-3-feature3)
- [AC-4 (FR-4): no most-recent fallback in loadUserPrompts](ACCEPTANCE_CRITERIA.md#ac-4-fr-4-feature4)
- [AC-5 (FR-5): defense filter in formatPromptsFromFile](ACCEPTANCE_CRITERIA.md#ac-5-fr-5-feature5)
- [AC-6 (FR-6): validate-spec passes 0 errors](ACCEPTANCE_CRITERIA.md#ac-6-fr-6-feature6)
- [AC-7 (FR-7): vitest PLUGIN007_43 green](ACCEPTANCE_CRITERIA.md#ac-7-fr-7-feature7)
