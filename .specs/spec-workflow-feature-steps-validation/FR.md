# Функциональные требования (FR)

## FR-1: Автоматическое определение языка проекта
@feature1

**Описание:** Система должна автоматически определять язык проекта по наличию step definition файлов.

**Критерии:**
- Если найдены `*.steps.ts` или `steps/**/*.ts` → TypeScript
- Если найдены `*_steps.py` или `steps/**/*.py` → Python  
- Если найдены `*Steps.cs` или `StepDefinitions/**/*.cs` → C#
- Если step definitions не найдены → пропустить валидацию

---

## FR-2: Парсинг TypeScript step definitions
@feature2

**Описание:** Система должна извлекать step definitions из TypeScript файлов.

**Формат:**
```typescript
Given('pattern', async function() { ... });
When('pattern', async () => { ... });
Then('pattern', async function() { ... });
```

**Извлекаемые данные:**
- Тип степа (Given/When/Then/And/But)
- Паттерн (строка в кавычках)
- Тело функции
- Номер строки

---

## FR-3: Парсинг Python step definitions
@feature3

**Описание:** Система должна извлекать step definitions из Python файлов.

**Формат:**
```python
@given('pattern')
def step_name(context):
    ...

@then('pattern')
def step_name(context):
    ...
```

**Извлекаемые данные:**
- Тип степа (given/when/then/step)
- Паттерн (строка в декораторе)
- Тело функции
- Номер строки

---

## FR-4: Парсинг C# step definitions
@feature4

**Описание:** Система должна извлекать step definitions из C# файлов.

**Формат:**
```csharp
[Given(@"pattern")]
public void MethodName() { ... }

[Then(@"pattern")]
public void MethodName() { ... }
```

**Извлекаемые данные:**
- Тип степа (Given/When/Then/And/But)
- Паттерн (строка в атрибуте)
- Тело метода
- Номер строки

---

## FR-5: Определение качества Then степов
@feature5

**Описание:** Система должна определять наличие assertions в Then степах.

**Хорошие паттерны (assertion есть):**

| Язык | Паттерны |
|------|----------|
| TypeScript | `expect(`, `.toBe(`, `.toEqual(`, `assert(` |
| Python | `assert `, `pytest.raises`, `should.` |
| C# | `Assert.`, `.Should()`, `Expect(` |

**Плохие паттерны (assertion отсутствует):**

| Язык | Паттерны |
|------|----------|
| TypeScript | только `console.log`, пустое тело, `throw new Error('Pending')` |
| Python | только `print(`, только `pass`, TODO комментарий |
| C# | только `Console.Write`, `ScenarioContext.StepIsPending()`, пустое тело |

---

## FR-6: Генерация отчёта
@feature6

**Описание:** Система должна генерировать Markdown отчёт о качестве степов.

**Содержание отчёта:**
- Дата генерации
- Язык проекта
- Сводка (Good/Warning/Bad)
- Список BAD степов с указанием проблемы
- Список WARNING степов
- Список GOOD степов (свёрнутый)

**Путь:** `steps-validation-report.md` в корне проекта

---

## FR-7: Вывод предупреждений в stdout
@feature7

**Описание:** При обнаружении BAD степов система должна выводить предупреждение.

**Формат:**
```
⚠️ Steps Validation: Found 2 bad steps (Then without assertions)
   - installer.steps.ts:42 Then('installation completes')
   - files.steps.ts:18 Then('files are created')
See steps-validation-report.md for details.
```

---

## FR-8: Конфигурация через YAML
@feature8

**Описание:** Система должна поддерживать конфигурацию через `.steps-validator.yaml`.

**Параметры:**
- `enabled: true/false` — включить/отключить валидацию
- `step_paths` — пути для поиска step files
- `custom_assertions` — дополнительные assertion паттерны
- `ignore` — паттерны файлов для игнорирования
- `on_bad_steps: warn/error/ignore` — поведение при BAD

---

## FR-9: Opt-out активация
@feature9

**Описание:** Хук должен автоматически запускаться если найдены step definitions, но может быть отключён через конфигурацию.

**Логика:**
1. Проверить наличие step definition файлов
2. Если найдены — проверить `.steps-validator.yaml`
3. Если `enabled: false` — пропустить
4. Иначе — запустить валидацию

---

## FR-10: Тихая работа при ошибках
@feature10

**Описание:** Хук не должен блокировать работу пользователя при ошибках парсинга.

**Поведение:**
- Ошибки логируются в `~/.dev-pomogator/logs/steps-validator.log`
- Хук завершается с кодом 0
- Пользователь не видит стектрейсы
