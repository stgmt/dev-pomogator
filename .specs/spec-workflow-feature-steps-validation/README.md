# Feature: Steps Validation Hook

## Обзор

Хук валидации качества BDD step definitions. Проверяет что степы не пустые и содержат assertions.

## Проблема

Step definitions могут быть некачественными:
- Только `console.log` / `print` / `Console.WriteLine` без проверок
- Пустое тело функции
- TODO/FIXME вместо реализации
- `throw new PendingException()`

Это приводит к "зелёным" тестам которые ничего не проверяют.

## Решение

Хук на **stop** событие (Cursor/Claude) который:
1. Находит step definition файлы
2. Парсит каждый степ
3. Проверяет наличие assertions
4. Генерирует отчёт о проблемах

## Поддерживаемые языки

| Язык | Фреймворки | Файлы |
|------|------------|-------|
| TypeScript | Cucumber.js, Playwright BDD | `*.steps.ts` |
| Python | Behave, pytest-bdd | `*_steps.py` |
| C# | SpecFlow, Reqnroll | `*Steps.cs` |

## Правила валидации

| Тип степа | Требование |
|-----------|-----------|
| `Given` | assertion не обязателен (setup) |
| `When` | assertion не обязателен (action) |
| `Then` | assertion **ОБЯЗАТЕЛЕН** |
| `And`/`But` | наследует от предыдущего |

## Интеграция

Хук добавляется в `extensions/specs-workflow/extension.json`:

```json
{
  "hooks": {
    "cursor": {
      "Stop": "bun ~/.dev-pomogator/scripts/validate-steps.ts"
    },
    "claude": {
      "Stop": "bun ~/.dev-pomogator/scripts/validate-steps.ts"
    }
  }
}
```

## Связанные документы

- [RESEARCH.md](./RESEARCH.md) — исследование и анализ
- [FR.md](./FR.md) — функциональные требования
- [DESIGN.md](./DESIGN.md) — архитектура решения
- [TASKS.md](./TASKS.md) — план реализации
