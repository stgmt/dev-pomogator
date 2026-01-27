# Acceptance Criteria (EARS формат)

## AC-1: Определение языка проекта
@feature1

**WHEN** хук запускается на stop событие,
**THE SYSTEM SHALL** определить язык проекта по наличию step definition файлов:
- `*.steps.ts` или `steps/**/*.ts` → TypeScript
- `*_steps.py` или `steps/**/*.py` → Python
- `*Steps.cs` или `StepDefinitions/**/*.cs` → C#

---

## AC-2: Парсинг TypeScript степов
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
@feature4

**WHEN** обнаружен C# проект,
**THE SYSTEM SHALL** извлечь все step definitions в формате:
```csharp
[Given|When|Then(@"pattern")]
public void MethodName() { body }
```

---

## AC-5: Определение BAD Then степа (TypeScript)
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
@feature5

**WHEN** Then степ в Python проекте **не содержит** ни одного из паттернов:
- `assert `
- `pytest.raises`
- `.should`

**THE SYSTEM SHALL** пометить степ как BAD.

---

## AC-7: Определение BAD Then степа (C#)
@feature5

**WHEN** Then степ в C# проекте **не содержит** ни одного из паттернов:
- `Assert.`
- `.Should()`
- `Expect(`

**THE SYSTEM SHALL** пометить степ как BAD.

---

## AC-8: Определение WARNING степа
@feature5

**WHEN** степ содержит один из паттернов:
- `TODO` или `FIXME` комментарий
- `throw new Error('Pending')`
- `ScenarioContext.StepIsPending()`

**THE SYSTEM SHALL** пометить степ как WARNING.

---

## AC-9: Генерация отчёта
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
@feature8

**WHEN** файл `.steps-validator.yaml` содержит `enabled: false`,
**THE SYSTEM SHALL** пропустить валидацию и не создавать отчёт.

---

## AC-12: Opt-out активация
@feature9

**IF** step definition файлы найдены,
**AND** `.steps-validator.yaml` не существует или `enabled: true`,
**THE SYSTEM SHALL** выполнить валидацию.

---

## AC-13: Graceful error handling
@feature10

**WHEN** возникает ошибка парсинга файла,
**THE SYSTEM SHALL**:
- Записать ошибку в `~/.dev-pomogator/logs/steps-validator.log`
- Пропустить проблемный файл
- Продолжить с остальными файлами
- Завершиться с кодом 0
