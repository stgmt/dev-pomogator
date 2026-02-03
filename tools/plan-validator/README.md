# Plan Validator

Ручной валидатор структуры dev‑планов. Проверяет формат и структуру, но не оценивает доменную корректность.

## Usage
```
npx tsx tools/plan-validator/validate-plan.ts <path-to-plan.md>
```

## Что проверяет
- Наличие и порядок секций
- Подразделы Requirements (FR/AC/NFR/Assumptions)
- Категории NFR (Performance/Security/Reliability/Usability)
- Вложенность и формат Todos (`id`, `description`, `dependencies`)
- Наличие конкретных команд в Automated Tests
- Таблицу File Changes (не пустая, не в code‑block, относительные пути)

## Ограничения
- Валидатор **не** проверяет доменную корректность требований.
- Проверка строго структурная — возможны ложные срабатывания при нестандартной разметке.
