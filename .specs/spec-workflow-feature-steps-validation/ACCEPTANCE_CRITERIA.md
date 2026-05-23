# Acceptance Criteria (EARS формат)

## AC-1: Определение языка проекта

→ [FR-1](FR.md#fr-1-автоматическое-определение-языка-проекта)
@feature1

**WHEN** хук запускается на stop событие,
**THE SYSTEM SHALL** определить язык проекта по наличию step definition файлов:
- `*.steps.ts` или `steps/**/*.ts` → TypeScript
- `*_steps.py` или `steps/**/*.py` → Python
- `*Steps.cs` или `StepDefinitions/**/*.cs` → C#

---

## AC-2: Парсинг TypeScript степов

→ [FR-2](FR.md#fr-2-парсинг-typescript-step-definitions)
@feature2

**WHEN** обнаружен TypeScript проект,
**THE SYSTEM SHALL** извлечь все step definitions в формате:
```typescript
Given|When|Then('pattern', async function() { body });
```

**AND** для каждого степа определить:
- Тип (Given/When/Then/And/But)
- Паттерн (строка)
- Тело функции
- Номер строки

---

## AC-3: Парсинг Python степов

→ [FR-3](FR.md#fr-3-парсинг-python-step-definitions)
@feature3

**WHEN** обнаружен Python проект,
**THE SYSTEM SHALL** извлечь все step definitions в формате:
```python
@given|when|then('pattern')
def step_name(context):
    body
```

---

## AC-4: Парсинг C# степов

→ [FR-4](FR.md#fr-4-парсинг-c-step-definitions)
@feature4

**WHEN** обнаружен C# проект,
**THE SYSTEM SHALL** извлечь все step definitions в формате:
```csharp
[Given|When|Then(@"pattern")]
public void MethodName() { body }
```

---

## AC-5: Определение BAD Then степа (TypeScript)

→ [FR-5](FR.md#fr-5-определение-качества-then-степов)
@feature5

**WHEN** Then степ в TypeScript проекте **не содержит** ни одного из паттернов:
- `expect(`
- `.toBe(`
- `.toEqual(`
- `.toContain(`
- `assert(`

**THE SYSTEM SHALL** пометить степ как BAD.

---

## AC-6: Определение BAD Then степа (Python)

→ [FR-5](FR.md#fr-5-определение-качества-then-степов)
@feature5

**WHEN** Then степ в Python проекте **не содержит** ни одного из паттернов:
- `assert `
- `pytest.raises`
- `.should`

**THE SYSTEM SHALL** пометить степ как BAD.

---

## AC-7: Определение BAD Then степа (C#)

→ [FR-5](FR.md#fr-5-определение-качества-then-степов)
@feature5

**WHEN** Then степ в C# проекте **не содержит** ни одного из паттернов:
- `Assert.`
- `.Should()`
- `Expect(`

**THE SYSTEM SHALL** пометить степ как BAD.

---

## AC-8: Определение WARNING степа

→ [FR-5](FR.md#fr-5-определение-качества-then-степов)
@feature5

**WHEN** степ содержит один из паттернов:
- `TODO` или `FIXME` комментарий
- `throw new Error('Pending')`
- `ScenarioContext.StepIsPending()`

**THE SYSTEM SHALL** пометить степ как WARNING.

---

## AC-9: Генерация отчёта

→ [FR-6](FR.md#fr-6-генерация-отчёта)
@feature6

**WHEN** валидация завершена,
**THE SYSTEM SHALL** создать файл `steps-validation-report.md` содержащий:
- Дату генерации
- Язык проекта
- Таблицу сводки (Good/Warning/Bad)
- Список BAD степов с файлом, строкой и проблемой
- Список WARNING степов
- Список GOOD степов (свёрнутый)

---

## AC-10: Вывод в stdout при BAD степах

→ [FR-7](FR.md#fr-7-вывод-предупреждений-в-stdout)
@feature7

**WHEN** найден хотя бы один BAD степ,
**THE SYSTEM SHALL** вывести в stdout:
```
⚠️ Steps Validation: Found N bad steps
   - file:line Then('pattern')
See steps-validation-report.md for details.
```

---

## AC-11: Отключение через конфигурацию

→ [FR-8](FR.md#fr-8-конфигурация-через-yaml)
@feature8

**WHEN** файл `.steps-validator.yaml` содержит `enabled: false`,
**THE SYSTEM SHALL** пропустить валидацию и не создавать отчёт.

---

## AC-12: Opt-out активация

→ [FR-9](FR.md#fr-9-opt-out-активация)
@feature9

**IF** step definition файлы найдены,
**AND** `.steps-validator.yaml` не существует или `enabled: true`,
**THE SYSTEM SHALL** выполнить валидацию.

---

## AC-13: Graceful error handling

→ [FR-10](FR.md#fr-10-тихая-работа-при-ошибках)
@feature10

**WHEN** возникает ошибка парсинга файла,
**THE SYSTEM SHALL**:
- Записать ошибку в `~/.dev-pomogator/logs/steps-validator.log`
- Пропустить проблемный файл
- Продолжить с остальными файлами
- Завершиться с кодом 0
