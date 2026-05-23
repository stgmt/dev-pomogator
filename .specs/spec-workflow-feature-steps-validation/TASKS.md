# Задачи реализации

> **Status: всё закрыто (2026-05-23).** Реализация в `extensions/specs-workflow/tools/steps-validator/` (9 файлов: validate-steps.ts entry, detector.ts auto-lang, parsers/{typescript,python,csharp}-parser.ts, analyzer.ts assertion-detect, reporter.ts md+stdout, config.ts YAML, logger.ts). 33 e2e теста в `tests/e2e/steps-validator.test.ts` на 3-х языковых фикстурах (`tests/fixtures/steps-validator/{csharp,python,typescript}/`). **Hook добавлен сейчас:** `Stop → validate-steps.ts` в `extensions/specs-workflow/extension.json` (bump v1.19.0 → v1.20.0). Audit-spec: 0 ERRORS / 0 WARNINGS.

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

- [x] Определить `Language` type
- [x] Определить `StepType` type
- [x] Определить `QualityStatus` type
- [x] Определить `StepDefinition` interface
- [x] Определить `AnalyzedStep` interface
- [x] Определить `StepQuality` interface
- [x] Определить `ValidationResult` interface
- [x] Определить `ValidatorConfig` interface

---

### TASK-2: Создать logger.ts
**Приоритет:** High
**Зависимости:** Нет

- [x] Реализовать `getLogDir()` (кроссплатформенно)
- [x] Реализовать `logError(error)` — записать в файл
- [x] Создать директорию логов если не существует

---

### TASK-3: Создать config.ts
**Приоритет:** High
**Зависимости:** TASK-1

- [x] Определить дефолтный конфиг
- [x] Реализовать `loadConfig(root)` — загрузка YAML
- [x] Мержить с дефолтом
- [x] Обработка отсутствия файла

---

### TASK-4: Создать detector.ts
**Приоритет:** High
**Зависимости:** TASK-1, TASK-3

- [x] Реализовать `detectLanguage(root, config)`
- [x] Проверка TypeScript паттернов
- [x] Проверка Python паттернов
- [x] Проверка C# паттернов
- [x] Возврат `null` если не найдено

---

### TASK-5: Создать parsers/typescript-parser.ts
**Приоритет:** High
**Зависимости:** TASK-1

- [x] Regex для Given/When/Then
- [x] Извлечение паттерна
- [x] Извлечение тела функции (с учётом вложенных скобок)
- [x] Определение номера строки
- [x] Реализовать `parseFile(path)` → `StepDefinition[]`
- [x] Реализовать `parseAll(root, config)` — найти и распарсить все

---

### TASK-6: Создать parsers/python-parser.ts
**Приоритет:** High
**Зависимости:** TASK-1

- [x] Regex для @given/@when/@then
- [x] Извлечение паттерна из декоратора
- [x] Извлечение тела функции (по индентации)
- [x] Определение номера строки
- [x] Реализовать `parseFile(path)` → `StepDefinition[]`
- [x] Реализовать `parseAll(root, config)`

---

### TASK-7: Создать parsers/csharp-parser.ts
**Приоритет:** High
**Зависимости:** TASK-1

- [x] Regex для [Given]/[When]/[Then] атрибутов
- [x] Извлечение паттерна из атрибута
- [x] Извлечение тела метода (по скобкам)
- [x] Определение номера строки
- [x] Реализовать `parseFile(path)` → `StepDefinition[]`
- [x] Реализовать `parseAll(root, config)`

---

### TASK-8: Создать parsers/index.ts
**Приоритет:** Medium
**Зависимости:** TASK-5, TASK-6, TASK-7

- [x] Фабрика `getParser(language)` → Parser
- [x] Общий интерфейс Parser

---

### TASK-9: Создать analyzer.ts
**Приоритет:** High
**Зависимости:** TASK-1

- [x] Определить assertion patterns для каждого языка
- [x] Определить bad patterns для каждого языка
- [x] Реализовать `analyzeStep(step, language, config)` → `AnalyzedStep`
- [x] Реализовать `analyzeSteps(steps[], language, config)` → `ValidationResult`
- [x] Логика строгости для Then vs Given/When

---

### TASK-10: Создать reporter.ts
**Приоритет:** Medium
**Зависимости:** TASK-1

- [x] Реализовать `generateReport(root, result)` — Markdown файл
- [x] Секция Summary
- [x] Секция BAD steps
- [x] Секция WARNING steps
- [x] Секция GOOD steps (collapsible)
- [x] Реализовать `printWarnings(result)` — stdout

---

### TASK-11: Создать validate-steps.ts
**Приоритет:** High
**Зависимости:** TASK-2, TASK-3, TASK-4, TASK-8, TASK-9, TASK-10

- [x] Реализовать `readStdin()` — парсинг hook input
- [x] Реализовать `validateProject(root)`
- [x] Реализовать `main()` с try/catch
- [x] Обработка нескольких workspace roots

---

### TASK-12: Создать TypeScript фикстуру
**Приоритет:** Medium
**Зависимости:** Нет

- [x] `tests/fixtures/steps-validator/typescript/package.json`
- [x] `features/sample.feature`
- [x] `steps/good.steps.ts` — с assertions
- [x] `steps/bad.steps.ts` — без assertions

---

### TASK-13: Создать Python фикстуру
**Приоритет:** Medium
**Зависимости:** Нет

- [x] `tests/fixtures/steps-validator/python/requirements.txt`
- [x] `features/sample.feature`
- [x] `features/steps/good_steps.py` — с assert
- [x] `features/steps/bad_steps.py` — без assert

---

### TASK-14: Создать C# фикстуру
**Приоритет:** Medium
**Зависимости:** Нет

- [x] `tests/fixtures/steps-validator/csharp/Project.csproj`
- [x] `Features/Sample.feature`
- [x] `StepDefinitions/GoodSteps.cs` — с Should()
- [x] `StepDefinitions/BadSteps.cs` — без assertions

---

### TASK-15: Написать E2E тесты
**Приоритет:** High
**Зависимости:** TASK-11, TASK-12, TASK-13, TASK-14

- [x] Тест TypeScript фикстуры
- [x] Тест Python фикстуры
- [x] Тест C# фикстуры
- [x] Тест opt-out через конфиг
- [x] Тест graceful error handling

---

### TASK-16: Обновить extension.json
**Приоритет:** High
**Зависимости:** TASK-11

- [x] Добавить Stop хук для Cursor
- [x] Добавить Stop хук для Claude
- [x] Добавить tool entry

---

### TASK-17: Обновить installer
**Приоритет:** High
**Зависимости:** TASK-16

- [x] Добавить `copyValidateStepsScript()`
- [x] Вызвать при установке
- [x] Обновить проверку установленных хуков

---

### TASK-18: Создать BDD feature файл
**Приоритет:** Medium
**Зависимости:** TASK-15

- [x] `PLUGIN006_steps-validator.feature`
- [x] Сценарии для каждого @featureN

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
