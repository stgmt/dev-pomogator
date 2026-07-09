---
paths:
  - "**/*.plan.md"
  - "**/plans/*.md"
---

# Plan Todos — Single-Line Description

validate-plan.ts проверяет `files:` и `Requirements refs:` ТОЛЬКО на строке `description:`. Multiline YAML (`|`) не поддерживается.

## Антипаттерн

```yaml
- id: my-task
  description: |
    Сделать X и Y.
    files: edit src/module.ts
    Requirements refs: FR-1
  dependencies: []
```

Валидатор видит только `  description: |` — `files:` и `Requirements refs:` не найдены → 2 ошибки.

## Как правильно

```yaml
- id: my-task
  description: Сделать X и Y; files: edit src/module.ts; Requirements refs: FR-1
  dependencies: []
```

Всё на одной строке, разделено `;`.

## Причина

validate-plan.ts (строка 179-181) захватывает ТОЛЬКО строку с `description:`:
```typescript
if (/^\s{2,}description:/.test(todoLine)) {
  descriptionLine = todoLine; // только эта строка проверяется
}
```

## Чеклист

- [ ] `description:` содержит `files:` на той же строке
- [ ] `description:` содержит `Requirements refs:` на той же строке
- [ ] НЕ используется YAML multiline (`|` или `>`)
