# Задачи реализации

## Зависимости задач

```
┌─────────────┐
│   types.ts  │ ← Первым, все зависят
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐
│  config.ts  │     │  logger.ts  │
└──────┬──────┘     └──────┬──────┘
       │                   │
       ▼                   │
┌─────────────┐            │
│ detector.ts │            │
└──────┬──────┘            │
       │                   │
       ▼                   │
┌─────────────────────┐    │
│      parsers/       │    │
│ (ts, py, cs)        │    │
└──────┬──────────────┘    │
       │                   │
       ▼                   │
┌─────────────┐            │
│ analyzer.ts │            │
└──────┬──────┘            │
       │                   │
       ▼                   │
┌─────────────┐            │
│ reporter.ts │            │
└──────┬──────┘            │
       │                   │
       ▼                   │
┌────────────────────┐     │
│ validate-steps.ts  │◄────┘
│   (entry point)    │
└──────┬─────────────┘
       │
       ▼
┌─────────────────────┐
│     fixtures/       │
│ (ts, py, cs)        │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│    e2e tests        │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ extension.json +    │
│ installer update    │
└─────────────────────┘
```

---

## Задачи

### TASK-1: Создать types.ts
**Приоритет:** High
**Зависимости:** Нет

- [ ] Определить `Language` type
- [ ] Определить `StepType` type
- [ ] Определить `QualityStatus` type
- [ ] Определить `StepDefinition` interface
- [ ] Определить `AnalyzedStep` interface
- [ ] Определить `StepQuality` interface
- [ ] Определить `ValidationResult` interface
- [ ] Определить `ValidatorConfig` interface

---

### TASK-2: Создать logger.ts
**Приоритет:** High
**Зависимости:** Нет

- [ ] Реализовать `getLogDir()` (кроссплатформенно)
- [ ] Реализовать `logError(error)` — записать в файл
- [ ] Создать директорию логов если не существует

---

### TASK-3: Создать config.ts
**Приоритет:** High
**Зависимости:** TASK-1

- [ ] Определить дефолтный конфиг
- [ ] Реализовать `loadConfig(root)` — загрузка YAML
- [ ] Мержить с дефолтом
- [ ] Обработка отсутствия файла

---

### TASK-4: Создать detector.ts
**Приоритет:** High
**Зависимости:** TASK-1, TASK-3

- [ ] Реализовать `detectLanguage(root, config)`
- [ ] Проверка TypeScript паттернов
- [ ] Проверка Python паттернов
- [ ] Проверка C# паттернов
- [ ] Возврат `null` если не найдено

---

### TASK-5: Создать parsers/typescript-parser.ts
**Приоритет:** High
**Зависимости:** TASK-1

- [ ] Regex для Given/When/Then
- [ ] Извлечение паттерна
- [ ] Извлечение тела функции (с учётом вложенных скобок)
- [ ] Определение номера строки
- [ ] Реализовать `parseFile(path)` → `StepDefinition[]`
- [ ] Реализовать `parseAll(root, config)` — найти и распарсить все

---

### TASK-6: Создать parsers/python-parser.ts
**Приоритет:** High
**Зависимости:** TASK-1

- [ ] Regex для @given/@when/@then
- [ ] Извлечение паттерна из декоратора
- [ ] Извлечение тела функции (по индентации)
- [ ] Определение номера строки
- [ ] Реализовать `parseFile(path)` → `StepDefinition[]`
- [ ] Реализовать `parseAll(root, config)`

---

### TASK-7: Создать parsers/csharp-parser.ts
**Приоритет:** High
**Зависимости:** TASK-1

- [ ] Regex для [Given]/[When]/[Then] атрибутов
- [ ] Извлечение паттерна из атрибута
- [ ] Извлечение тела метода (по скобкам)
- [ ] Определение номера строки
- [ ] Реализовать `parseFile(path)` → `StepDefinition[]`
- [ ] Реализовать `parseAll(root, config)`

---

### TASK-8: Создать parsers/index.ts
**Приоритет:** Medium
**Зависимости:** TASK-5, TASK-6, TASK-7

- [ ] Фабрика `getParser(language)` → Parser
- [ ] Общий интерфейс Parser

---

### TASK-9: Создать analyzer.ts
**Приоритет:** High
**Зависимости:** TASK-1

- [ ] Определить assertion patterns для каждого языка
- [ ] Определить bad patterns для каждого языка
- [ ] Реализовать `analyzeStep(step, language, config)` → `AnalyzedStep`
- [ ] Реализовать `analyzeSteps(steps[], language, config)` → `ValidationResult`
- [ ] Логика строгости для Then vs Given/When

---

### TASK-10: Создать reporter.ts
**Приоритет:** Medium
**Зависимости:** TASK-1

- [ ] Реализовать `generateReport(root, result)` — Markdown файл
- [ ] Секция Summary
- [ ] Секция BAD steps
- [ ] Секция WARNING steps
- [ ] Секция GOOD steps (collapsible)
- [ ] Реализовать `printWarnings(result)` — stdout

---

### TASK-11: Создать validate-steps.ts
**Приоритет:** High
**Зависимости:** TASK-2, TASK-3, TASK-4, TASK-8, TASK-9, TASK-10

- [ ] Реализовать `readStdin()` — парсинг hook input
- [ ] Реализовать `validateProject(root)`
- [ ] Реализовать `main()` с try/catch
- [ ] Обработка нескольких workspace roots

---

### TASK-12: Создать TypeScript фикстуру
**Приоритет:** Medium
**Зависимости:** Нет

- [ ] `tests/fixtures/steps-validator/typescript/package.json`
- [ ] `features/sample.feature`
- [ ] `steps/good.steps.ts` — с assertions
- [ ] `steps/bad.steps.ts` — без assertions

---

### TASK-13: Создать Python фикстуру
**Приоритет:** Medium
**Зависимости:** Нет

- [ ] `tests/fixtures/steps-validator/python/requirements.txt`
- [ ] `features/sample.feature`
- [ ] `features/steps/good_steps.py` — с assert
- [ ] `features/steps/bad_steps.py` — без assert

---

### TASK-14: Создать C# фикстуру
**Приоритет:** Medium
**Зависимости:** Нет

- [ ] `tests/fixtures/steps-validator/csharp/Project.csproj`
- [ ] `Features/Sample.feature`
- [ ] `StepDefinitions/GoodSteps.cs` — с Should()
- [ ] `StepDefinitions/BadSteps.cs` — без assertions

---

### TASK-15: Написать E2E тесты
**Приоритет:** High
**Зависимости:** TASK-11, TASK-12, TASK-13, TASK-14

- [ ] Тест TypeScript фикстуры
- [ ] Тест Python фикстуры
- [ ] Тест C# фикстуры
- [ ] Тест opt-out через конфиг
- [ ] Тест graceful error handling

---

### TASK-16: Обновить extension.json
**Приоритет:** High
**Зависимости:** TASK-11

- [ ] Добавить Stop хук для Cursor
- [ ] Добавить Stop хук для Claude
- [ ] Добавить tool entry

---

### TASK-17: Обновить installer
**Приоритет:** High
**Зависимости:** TASK-16

- [ ] Добавить `copyValidateStepsScript()`
- [ ] Вызвать при установке
- [ ] Обновить проверку установленных хуков

---

### TASK-18: Создать BDD feature файл
**Приоритет:** Medium
**Зависимости:** TASK-15

- [ ] `PLUGIN006_steps-validator.feature`
- [ ] Сценарии для каждого @featureN

---

## Оценка трудозатрат

| Задача | Сложность | ~Время |
|--------|-----------|--------|
| TASK-1 | Low | 15 min |
| TASK-2 | Low | 15 min |
| TASK-3 | Medium | 30 min |
| TASK-4 | Medium | 30 min |
| TASK-5 | High | 1 hour |
| TASK-6 | High | 1 hour |
| TASK-7 | High | 1 hour |
| TASK-8 | Low | 15 min |
| TASK-9 | High | 1 hour |
| TASK-10 | Medium | 45 min |
| TASK-11 | Medium | 45 min |
| TASK-12 | Low | 20 min |
| TASK-13 | Low | 20 min |
| TASK-14 | Low | 20 min |
| TASK-15 | High | 1 hour |
| TASK-16 | Low | 15 min |
| TASK-17 | Medium | 30 min |
| TASK-18 | Low | 30 min |
