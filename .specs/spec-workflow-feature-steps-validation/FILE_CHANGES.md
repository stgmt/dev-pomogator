# Изменяемые файлы

## Новые файлы

### Валидатор

| Файл | Описание |
|------|----------|
| `extensions/specs-workflow/tools/steps-validator/validate-steps.ts` | Entry point хука |
| `extensions/specs-workflow/tools/steps-validator/types.ts` | Интерфейсы и типы |
| `extensions/specs-workflow/tools/steps-validator/config.ts` | Загрузка конфигурации |
| `extensions/specs-workflow/tools/steps-validator/detector.ts` | Определение языка |
| `extensions/specs-workflow/tools/steps-validator/parsers/index.ts` | Фабрика парсеров |
| `extensions/specs-workflow/tools/steps-validator/parsers/typescript-parser.ts` | Парсер TypeScript |
| `extensions/specs-workflow/tools/steps-validator/parsers/python-parser.ts` | Парсер Python |
| `extensions/specs-workflow/tools/steps-validator/parsers/csharp-parser.ts` | Парсер C# |
| `extensions/specs-workflow/tools/steps-validator/analyzer.ts` | Анализатор качества |
| `extensions/specs-workflow/tools/steps-validator/reporter.ts` | Генератор отчёта |
| `extensions/specs-workflow/tools/steps-validator/logger.ts` | Логирование |

### Тестовые фикстуры

| Файл | Описание |
|------|----------|
| `tests/fixtures/steps-validator/typescript/package.json` | TypeScript fixture config |
| `tests/fixtures/steps-validator/typescript/features/sample.feature` | Sample feature |
| `tests/fixtures/steps-validator/typescript/steps/good.steps.ts` | Хорошие степы |
| `tests/fixtures/steps-validator/typescript/steps/bad.steps.ts` | Плохие степы |
| `tests/fixtures/steps-validator/python/requirements.txt` | Python fixture deps |
| `tests/fixtures/steps-validator/python/features/sample.feature` | Sample feature |
| `tests/fixtures/steps-validator/python/features/steps/good_steps.py` | Хорошие степы |
| `tests/fixtures/steps-validator/python/features/steps/bad_steps.py` | Плохие степы |
| `tests/fixtures/steps-validator/csharp/Project.csproj` | C# fixture config |
| `tests/fixtures/steps-validator/csharp/Features/Sample.feature` | Sample feature |
| `tests/fixtures/steps-validator/csharp/StepDefinitions/GoodSteps.cs` | Хорошие степы |
| `tests/fixtures/steps-validator/csharp/StepDefinitions/BadSteps.cs` | Плохие степы |

### E2E тесты

| Файл | Описание |
|------|----------|
| `tests/e2e/steps-validator.test.ts` | E2E тесты валидатора |

### BDD сценарии

| Файл | Описание |
|------|----------|
| `tests/features/plugins/specs-workflow/PLUGIN006_steps-validator.feature` | BDD сценарии |

---

## Изменяемые файлы

### Extension manifest

| Файл | Изменение |
|------|-----------|
| `extensions/specs-workflow/extension.json` | Добавить Stop хук |

**Добавить:**
```json
{
  "hooks": {
    "cursor": {
      "Stop": "bun ~/.dev-pomogator/scripts/validate-steps.ts"
    },
    "claude": {
      "Stop": "bun ~/.dev-pomogator/scripts/validate-steps.ts"
    }
  },
  "tools": [
    {
      "name": "steps-validator",
      "path": "tools/steps-validator",
      "description": "Validates step definitions quality"
    }
  ]
}
```

### Installer

| Файл | Изменение |
|------|-----------|
| `src/installer/memory.ts` | Копировать validate-steps.ts при установке |

**Добавить функцию:**
```typescript
async function copyValidateStepsScript(): Promise<void> {
  const srcDir = path.join(extensionDir, 'tools/steps-validator');
  const destDir = path.join(homeDir, '.dev-pomogator/scripts');
  
  await fs.cp(srcDir, destDir, { recursive: true });
}
```

---

## Структура после реализации

```
extensions/specs-workflow/
├── extension.json                    # MODIFIED
├── tools/
│   ├── specs-validator/              # existing
│   └── steps-validator/              # NEW
│       ├── validate-steps.ts
│       ├── types.ts
│       ├── config.ts
│       ├── detector.ts
│       ├── analyzer.ts
│       ├── reporter.ts
│       ├── logger.ts
│       └── parsers/
│           ├── index.ts
│           ├── typescript-parser.ts
│           ├── python-parser.ts
│           └── csharp-parser.ts

tests/
├── fixtures/
│   └── steps-validator/              # NEW
│       ├── typescript/
│       ├── python/
│       └── csharp/
├── features/
│   └── plugins/specs-workflow/
│       └── PLUGIN006_steps-validator.feature  # NEW
└── e2e/
    └── steps-validator.test.ts       # NEW (or extend existing)
```
