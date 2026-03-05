# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | @featureN | Status |
|----|------|-----------|-----------|--------|
| [FR-1](FR.md#fr-1-pretooluse-hook-блокирует-запись-в-файлы-будущих-фаз) | PreToolUse hook блокирует запись в файлы будущих фаз | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-блокировка-записи-в-файл-будущей-фазы) | @feature1 | Draft |
| [FR-2](FR.md#fr-2-hook-читает-состояние-из-progressjson) | Hook читает состояние из .progress.json | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-чтение-состояния-из-progressjson) | @feature1 | Draft |
| [FR-3](FR.md#fr-3-hook-возвращает-deny-с-exit-code-2-при-блокировке) | Hook возвращает deny с exit code 2 | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3-формат-deny-ответа) | @feature1 | Draft |
| [FR-4](FR.md#fr-4-hook-работает-в-режиме-fail-open) | Hook работает в режиме fail-open | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4-fail-open-при-ошибках) | @feature1 | Draft |
| [FR-5](FR.md#fr-5-hook-пропускает-файлы-вне-specs) | Hook пропускает файлы вне .specs/ | [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5-pass-through-для-файлов-вне-specs) | @feature1 | Draft |
| [FR-6](FR.md#fr-6-feature-файл-привязан-к-фазе-requirements) | .feature файл привязан к фазе Requirements | [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6-feature-файл-в-фазе-requirements) | @feature1 | Draft |
| [FR-7](FR.md#fr-7-userpromptsubmit-hook-инжектирует-статус-фазы) | UserPromptSubmit hook инжектирует статус фазы | [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7-инжекция-статуса-фазы-в-промпт) | @feature2 | Draft |
| [FR-8](FR.md#fr-8-audit-обнаруживает-partial-implementation) | Audit обнаруживает partial implementation | [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8-обнаружение-partial-implementation) | @feature3 | Draft |
| [FR-9](FR.md#fr-9-audit-проверяет-task-fr-atomicity) | Audit проверяет task-FR atomicity | [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9-task-fr-atomicity) | @feature3 | Draft |
| [FR-10](FR.md#fr-10-audit-проверяет-fr-split-consistency) | Audit проверяет FR split consistency | [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10-fr-split-consistency) | @feature3 | Draft |
| [FR-11](FR.md#fr-11-audit-проверяет-bdd-scenario-scope-gap) | Audit проверяет BDD scenario scope gap | [AC-11](ACCEPTANCE_CRITERIA.md#ac-11-fr-11-bdd-scenario-scope-gap) | @feature3 | Draft |
| [FR-12](FR.md#fr-12-правило-fr-variant-decomposition) | Правило FR Variant Decomposition | [AC-12](ACCEPTANCE_CRITERIA.md#ac-12-fr-12-fr-variant-decomposition) | @feature4 | Draft |
| [FR-13](FR.md#fr-13-правило-task-completion-integrity) | Правило Task Completion Integrity | [AC-13](ACCEPTANCE_CRITERIA.md#ac-13-fr-13-task-completion-integrity) | @feature4 | Draft |
| [FR-14](FR.md#fr-14-правило-ac-scope-match) | Правило AC Scope Match | [AC-14](ACCEPTANCE_CRITERIA.md#ac-14-fr-14-ac-scope-match) | @feature4 | Draft |

## Functional Requirements

### Phase Gate (FR-1..FR-6) — @feature1

- [FR-1: PreToolUse hook блокирует запись в файлы будущих фаз](FR.md#fr-1-pretooluse-hook-блокирует-запись-в-файлы-будущих-фаз)
- [FR-2: Hook читает состояние из .progress.json](FR.md#fr-2-hook-читает-состояние-из-progressjson)
- [FR-3: Hook возвращает deny с exit code 2](FR.md#fr-3-hook-возвращает-deny-с-exit-code-2-при-блокировке)
- [FR-4: Hook работает в режиме fail-open](FR.md#fr-4-hook-работает-в-режиме-fail-open)
- [FR-5: Hook пропускает файлы вне .specs/](FR.md#fr-5-hook-пропускает-файлы-вне-specs)
- [FR-6: .feature файл привязан к фазе Requirements](FR.md#fr-6-feature-файл-привязан-к-фазе-requirements)

### Status Injection (FR-7) — @feature2

- [FR-7: UserPromptSubmit hook инжектирует статус фазы](FR.md#fr-7-userpromptsubmit-hook-инжектирует-статус-фазы)

### Spec Quality Audit (FR-8..FR-11) — @feature3

- [FR-8: Audit обнаруживает partial implementation](FR.md#fr-8-audit-обнаруживает-partial-implementation)
- [FR-9: Audit проверяет task-FR atomicity](FR.md#fr-9-audit-проверяет-task-fr-atomicity)
- [FR-10: Audit проверяет FR split consistency](FR.md#fr-10-audit-проверяет-fr-split-consistency)
- [FR-11: Audit проверяет BDD scenario scope gap](FR.md#fr-11-audit-проверяет-bdd-scenario-scope-gap)

### Spec Quality Rules (FR-12..FR-14) — @feature4

- [FR-12: Правило FR Variant Decomposition](FR.md#fr-12-правило-fr-variant-decomposition)
- [FR-13: Правило Task Completion Integrity](FR.md#fr-13-правило-task-completion-integrity)
- [FR-14: Правило AC Scope Match](FR.md#fr-14-правило-ac-scope-match)

## Non-Functional Requirements

- [Performance](NFR.md#performance) — NFR-Perf-1 (<100ms hook), NFR-Perf-2 (<50ms inject), NFR-Perf-3 (<500ms audit)
- [Security](NFR.md#security) — N/A
- [Reliability](NFR.md#reliability) — NFR-Rel-1 (fail-open), NFR-Rel-2 (stderr only), NFR-Rel-3 (inject graceful), NFR-Rel-4 (audit continues)
- [Usability](NFR.md#usability) — NFR-Usab-1 (deny message), NFR-Usab-2 (status block), NFR-Usab-3 (RU language)

## Acceptance Criteria

### Phase Gate — @feature1

- [AC-1 (FR-1): Блокировка записи в файл будущей фазы](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-блокировка-записи-в-файл-будущей-фазы)
- [AC-2 (FR-2): Чтение состояния из .progress.json](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-чтение-состояния-из-progressjson)
- [AC-3 (FR-3): Формат deny-ответа](ACCEPTANCE_CRITERIA.md#ac-3-fr-3-формат-deny-ответа)
- [AC-4 (FR-4): Fail-open при ошибках](ACCEPTANCE_CRITERIA.md#ac-4-fr-4-fail-open-при-ошибках)
- [AC-5 (FR-5): Pass-through для файлов вне .specs/](ACCEPTANCE_CRITERIA.md#ac-5-fr-5-pass-through-для-файлов-вне-specs)
- [AC-6 (FR-6): .feature файл в фазе Requirements](ACCEPTANCE_CRITERIA.md#ac-6-fr-6-feature-файл-в-фазе-requirements)

### Status Injection — @feature2

- [AC-7 (FR-7): Инжекция статуса фазы в промпт](ACCEPTANCE_CRITERIA.md#ac-7-fr-7-инжекция-статуса-фазы-в-промпт)

### Spec Quality Audit — @feature3

- [AC-8 (FR-8): Обнаружение partial implementation](ACCEPTANCE_CRITERIA.md#ac-8-fr-8-обнаружение-partial-implementation)
- [AC-9 (FR-9): Task-FR atomicity](ACCEPTANCE_CRITERIA.md#ac-9-fr-9-task-fr-atomicity)
- [AC-10 (FR-10): FR split consistency](ACCEPTANCE_CRITERIA.md#ac-10-fr-10-fr-split-consistency)
- [AC-11 (FR-11): BDD scenario scope gap](ACCEPTANCE_CRITERIA.md#ac-11-fr-11-bdd-scenario-scope-gap)

### Spec Quality Rules — @feature4

- [AC-12 (FR-12): FR Variant Decomposition](ACCEPTANCE_CRITERIA.md#ac-12-fr-12-fr-variant-decomposition)
- [AC-13 (FR-13): Task Completion Integrity](ACCEPTANCE_CRITERIA.md#ac-13-fr-13-task-completion-integrity)
- [AC-14 (FR-14): AC Scope Match](ACCEPTANCE_CRITERIA.md#ac-14-fr-14-ac-scope-match)
