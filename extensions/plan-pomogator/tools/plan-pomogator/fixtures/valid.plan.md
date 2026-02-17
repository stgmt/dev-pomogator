# План работ

## User Stories
- Как {роль}, я хочу {цель}, чтобы {ценность}.

## Use Cases
- UC-1: Пользователь получает валидный план по шаблону.
- Edge cases: некорректная структура Todos, пустой File Changes.

## Requirements

### FR (Functional Requirements)
- FR-1: Валидатор проверяет структуру плана.

### Acceptance Criteria (EARS)
- WHEN валидатор запускается THEN система SHALL вернуть список структурных ошибок или OK.

### NFR (Non-Functional Requirements)
- Performance: < 1 сек на 500 строк
- Security: без сетевых вызовов
- Reliability: ненулевой exit code при ошибках
- Usability: понятные сообщения об ошибках

### Assumptions
- N/A

## Implementation Plan
1. Добавить валидатор структуры планов.
2. Обновить правила и документацию.

## Todos
- id: implement-validator
  description: Добавить скрипт проверки структуры; files: create tools/plan-pomogator/validate-plan.ts; Requirements refs: FR-1, NFR-Usability; Leverage: tools/specs-validator/validate-specs.ts
  dependencies: []

## Definition of Done (DoD)
- Валидатор сообщает об ошибках структуры.

### Verification Plan
- Automated Tests:
  - `npx tsx tools/plan-pomogator/validate-plan.ts tools/plan-pomogator/fixtures/valid.plan.md`
- Manual Verification:
  - Запустить валидатор на заведомо битом плане.

## File Changes
| Path | Action | Reason |
|---|---|---|
| `.dev-pomogator/tools/plan-pomogator/validate-plan.ts` | create | Скрипт для проверки структуры плана. |
