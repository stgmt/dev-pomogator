# Анализ Skip Scenario логики и варианты решения

## Проблема 1: Skip Scenario логика

Skip scenario логика - это **нормальная оптимизация** для тестов:

```csharp
if (_scenarioContext.TryGetValue("SkipScenario", out bool skip) && skip)
{
    Console.WriteLine($"[OAuth] ⏭️ SKIP OAuth authorization - tokens already validated");
    return;  // Пропускает проверку если токены уже валидированы через API
}

// Основной код с assertions
await page.WaitForURLAsync("**/oauth/v2/auth**", new() { Timeout = 30000 });  // ✅ ASSERTION
```

Но текущий валидатор помечает это как **WARNING** из-за паттерна `Console.WriteLine.*SKIP`.

## Текущая логика валидатора

### Файл: `csharp-parser.ts:117`

```typescript
export const CSHARP_WARNING_PATTERNS: RegExp[] = [
  // ...
  /Console\.WriteLine.*SKIP/i,  // ⚠️ Триггерит WARNING для всех SKIP паттернов
];
```

### Файл: `analyzer.ts:164-167`

```typescript
if (analysis.hasWarningPattern && !analysis.hasTodo) {
  if (status !== "BAD") status = "WARNING";  // ⚠️ Устанавливает WARNING независимо от assertions
  issues.push("Warning pattern detected");
}
```

**Проблема:** WARNING устанавливается **независимо** от наличия assertions в основном коде.

---

## Варианты решения

### Вариант 1: Умная логика - Skip case игнорируется если есть assertions

**Идея:** Если в теле метода есть assertions (после skip case), то skip case не должен быть warning.

**Реализация:**

```typescript
// В analyzer.ts
function analyzeStep(step: StepDefinition, language: Language, config: ValidatorConfig): AnalyzedStep {
  const analysis = analyzeByLanguage(step.body, language, config);
  
  // ... существующая логика ...
  
  // Умная логика для skip scenarios
  if (analysis.hasWarningPattern && analysis.hasAssertion) {
    // Проверяем что warning pattern в skip case, а assertion в основном коде
    const skipCasePattern = /if\s*\([^)]*SkipScenario[^)]*\)\s*\{[\s\S]*?Console\.WriteLine.*SKIP[\s\S]*?return[\s\S]*?\}/i;
    const hasSkipCase = skipCasePattern.test(step.body);
    
    if (hasSkipCase) {
      // Skip case найден - проверяем что assertion после него
      const skipCaseEnd = step.body.search(/}\s*(?=\/\/|Console|await|var|if|throw)/i);
      const bodyAfterSkip = skipCaseEnd > 0 ? step.body.slice(skipCaseEnd) : step.body;
      const hasAssertionAfterSkip = hasCSharpAssertion(bodyAfterSkip, config.customAssertions?.csharp || []);
      
      if (hasAssertionAfterSkip) {
        // Assertion есть после skip case - это нормальная оптимизация, не warning
        analysis.hasWarningPattern = false;
      }
    }
  }
  
  // ... остальная логика ...
}
```

**Плюсы:**
- ✅ Различает нормальную skip логику от реальных проблем
- ✅ Не требует изменений в коде тестов
- ✅ Автоматически определяет контекст

**Минусы:**
- ⚠️ Сложная логика парсинга
- ⚠️ Может быть ложные срабатывания

---

### Вариант 2: Разделить SKIP и STUBBED паттерны

**Идея:** `SKIP` - это оптимизация (не warning), `STUBBED` - это заглушка (warning).

**Реализация:**

```typescript
// В csharp-parser.ts
export const CSHARP_WARNING_PATTERNS: RegExp[] = [
  // TODO/FIXME comments - всегда warning
  /\/\/\s*(TODO|FIXME|HACK|XXX|BUG)\b/i,
  /\/\*\s*(TODO|FIXME|HACK|XXX|BUG)\b/i,

  // STUBBED - заглушка (warning)
  /\/\/.*STUBBED/i,
  /Console\.WriteLine.*STUBBED/i,
  
  // SKIP удалён из warning patterns - это нормальная оптимизация
  // /Console\.WriteLine.*SKIP/i,  // ❌ УДАЛЕНО
];

// Добавить в BAD patterns если SKIP без assertions
export const CSHARP_BAD_PATTERNS: RegExp[] = [
  // ...
  // SKIP без assertions в Then step - это BAD
  // Но это уже покрывается логикой "no assertion found"
];
```

**Плюсы:**
- ✅ Простое решение
- ✅ Различает оптимизацию от заглушек
- ✅ Не требует сложной логики

**Минусы:**
- ⚠️ Может пропустить реальные проблемы где SKIP используется как заглушка

---

### Вариант 3: Контекстный анализ - Skip case только для Given/When

**Идея:** Skip case в Given/When степах - это нормально (они не требуют assertions). Skip case в Then степах - warning только если нет assertions.

**Реализация:**

```typescript
// В analyzer.ts
if (analysis.hasWarningPattern && !analysis.hasTodo) {
  // Для Given/When - skip case это нормально
  if (step.type === "Given" || step.type === "When") {
    const skipPattern = /Console\.WriteLine.*SKIP/i;
    if (skipPattern.test(step.body)) {
      // Skip case в Given/When - это оптимизация, не warning
      // Но только если это действительно skip case, а не STUBBED
      const isStubbed = /STUBBED/i.test(step.body);
      if (!isStubbed) {
        analysis.hasWarningPattern = false;  // Игнорируем skip для Given/When
      }
    }
  }
  
  // Для Then - warning только если нет assertions
  if (step.type === "Then" && analysis.hasAssertion) {
    const skipPattern = /Console\.WriteLine.*SKIP/i;
    if (skipPattern.test(step.body)) {
      // Skip case в Then с assertions - это оптимизация, не warning
      analysis.hasWarningPattern = false;
    }
  }
  
  if (analysis.hasWarningPattern) {
    if (status !== "BAD") status = "WARNING";
    issues.push("Warning pattern detected");
  }
}
```

**Плюсы:**
- ✅ Учитывает тип степа
- ✅ Различает оптимизацию от проблем
- ✅ Простая логика

**Минусы:**
- ⚠️ Может пропустить случаи где skip case в Then без assertions

---

### Вариант 4: Конфигурация whitelist для skip patterns

**Идея:** Добавить в конфиг возможность исключать определенные паттерны из warning.

**Реализация:**

```typescript
// В types.ts
export interface ValidatorConfig {
  // ...
  warningPatternWhitelist?: {
    csharp?: string[];  // Regex patterns которые не должны быть warning
    typescript?: string[];
    python?: string[];
  };
}

// В analyzer.ts
function analyzeByLanguage(body: string, language: Language, config: ValidatorConfig) {
  // ...
  let hasWarningPattern = CSHARP_WARNING_PATTERNS.some(p => p.test(body));
  
  // Применить whitelist
  if (config.warningPatternWhitelist?.csharp) {
    const whitelisted = config.warningPatternWhitelist.csharp.some(
      pattern => new RegExp(pattern).test(body)
    );
    if (whitelisted && analysis.hasAssertion) {
      hasWarningPattern = false;  // Игнорируем если есть assertion
    }
  }
  // ...
}
```

**Конфиг файл:**

```yaml
# .steps-validator.yaml
warningPatternWhitelist:
  csharp:
    - "Console\\.WriteLine.*SKIP.*tokens already validated"
    - "Console\\.WriteLine.*SKIP.*using existing"
```

**Плюсы:**
- ✅ Гибкость через конфиг
- ✅ Можно настроить под проект
- ✅ Не требует изменений в коде валидатора

**Минусы:**
- ⚠️ Требует настройки конфига
- ⚠️ Может быть избыточно для простых случаев

---

### Вариант 5: Комбинированный подход (РЕКОМЕНДУЕТСЯ)

**Идея:** Комбинация вариантов 2 и 3:
1. Убрать `SKIP` из warning patterns (вариант 2)
2. Добавить умную логику для Then степов (вариант 3)

**Реализация:**

```typescript
// В csharp-parser.ts - убрать SKIP из warning patterns
export const CSHARP_WARNING_PATTERNS: RegExp[] = [
  /\/\/\s*(TODO|FIXME|HACK|XXX|BUG)\b/i,
  /\/\*\s*(TODO|FIXME|HACK|XXX|BUG)\b/i,
  /\/\/.*STUBBED/i,
  /Console\.WriteLine.*STUBBED/i,
  // SKIP удалён - это нормальная оптимизация
];

// В analyzer.ts - добавить умную логику
if (step.type === "Then" || isInheritedThen(step, config)) {
  // ... существующая логика для assertions ...
  
  // Проверка skip case: если есть assertions после skip case, это нормально
  const skipCaseMatch = step.body.match(/if\s*\([^)]*SkipScenario[^)]*\)\s*\{[\s\S]*?\}/);
  if (skipCaseMatch && analysis.hasAssertion) {
    const skipCaseEnd = skipCaseMatch.index! + skipCaseMatch[0].length;
    const bodyAfterSkip = step.body.slice(skipCaseEnd);
    const hasAssertionAfterSkip = hasCSharpAssertion(bodyAfterSkip, customAssertions);
    
    if (hasAssertionAfterSkip) {
      // Skip case с assertions после - это оптимизация, не проблема
      // Не устанавливаем warning для этого случая
    }
  }
}
```

**Плюсы:**
- ✅ Простое решение (убрать SKIP из warning)
- ✅ Умная логика для edge cases
- ✅ Различает оптимизацию от проблем
- ✅ Не требует конфига

**Минусы:**
- ⚠️ Нужно протестировать на реальных случаях

---

## Проблема 2: Exceptions в When степах для валидации preconditions

**Пример нормальной логики:**

```csharp
[When(@"System creates test item in Zoho Inventory")]
public async Task WhenSystemCreatesTestItemInZohoInventory()
{
    // ... код ...
    if (tenant == null)
    {
        throw new InvalidOperationException("No ZohoToken in context and no ExistingTenant to load from");  // ✅ НОРМАЛЬНО
    }
    
    if (!orgsResponse.IsSuccessStatusCode)
    {
        throw new InvalidOperationException($"Failed to get organizations. Status: {orgsResponse.StatusCode}");  // ✅ НОРМАЛЬНО
    }
    // ... код продолжается ...
}
```

**Проблема:** Exceptions в When степах для валидации входных данных/состояния (preconditions) - это **нормальная практика**, не должна быть WARNING.

**Текущая логика:** `throw new InvalidOperationException` распознаётся как assertion (строка 66 в `csharp-parser.ts`), но если есть warning pattern, то всё равно ставится WARNING.

**Решение:** 
- Exceptions в When/Given степах для валидации preconditions - это нормально, не warning
- Exceptions в Then степах для проверки результата - это assertions, хорошо
- Нужно уточнить логику: если When/Given step имеет exceptions для валидации, то warning patterns игнорируются

---

## Рекомендация

**Вариант 5 (Комбинированный)** - лучший баланс простоты и точности:

1. **Убрать `SKIP` из warning patterns** - это нормальная оптимизация
2. **Оставить `STUBBED` в warning** - это реальная проблема
3. **Добавить умную логику для Then степов** - если skip case + assertions после, то не warning

### Изменения в коде:

**Файл: `csharp-parser.ts`**
- Удалить `/Console\.WriteLine.*SKIP/i` из `CSHARP_WARNING_PATTERNS`
- Оставить только `STUBBED` паттерны

**Файл: `analyzer.ts`**
- Добавить проверку: если Then step имеет skip case + assertions после skip case, то не warning

---

## Итоговая таблица вариантов

| Вариант | Сложность | Точность | Гибкость | Рекомендация |
|---------|-----------|----------|----------|--------------|
| 1. Умная логика | Высокая | Высокая | Средняя | ⚠️ Слишком сложно |
| 2. Разделить SKIP/STUBBED | Низкая | Средняя | Низкая | ✅ Простое решение |
| 3. Контекстный анализ | Средняя | Высокая | Средняя | ✅ Хороший баланс |
| 4. Конфиг whitelist | Средняя | Высокая | Высокая | ⚠️ Избыточно |
| 5. Комбинированный | Средняя | Высокая | Средняя | ✅ **РЕКОМЕНДУЕТСЯ** |
