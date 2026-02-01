# Паттерны валидации C# Step Definitions

> Основано на анализе реального проекта: `ZohoIntegrationClient.Tests`
> Фреймворк: Reqnroll (SpecFlow)

---

## Сводка паттернов

| Категория | Кол-во | Описание |
|-----------|--------|----------|
| ✅ GOOD (Assertions) | 15 | Паттерны с реальными проверками |
| ❌ BAD (Плохие) | 7 | Отсутствие проверок / pending |
| ⚠️ WARNING (Предупреждения) | 6 | TODO/FIXME/STUBBED |
| 📝 LOGGING (учёт) | 4 | Console.Write, Debug, _logger (сами по себе OK!) |

> **Важно:** `Console.WriteLine` сам по себе **НЕ является проблемой!**
> Проблема только если это Then step и **кроме логов ничего нет**.

---

## ✅ GOOD - Паттерны с assertions (15)

| # | Паттерн | Regex | Пример из реального кода | Файл-источник |
|---|---------|-------|-------------------------|---------------|
| 1 | xUnit Assert.Equal | `Assert\.Equal\s*[<(]` | `Assert.Equal(HttpStatusCode.OK, response.StatusCode)` | ShipmentSteps.cs |
| 2 | xUnit Assert.True | `Assert\.True\s*\(` | `Assert.True(expectedLines.Any())` | ShipmentSteps.cs |
| 3 | xUnit Assert.False | `Assert\.False\s*\(` | `Assert.False(string.IsNullOrEmpty(id))` | ShipmentSteps.cs |
| 4 | xUnit Assert.NotNull | `Assert\.NotNull\s*\(` | `Assert.NotNull(tenant)` | DatabaseAssertionSteps.cs |
| 5 | xUnit Assert.NotEmpty | `Assert\.NotEmpty\s*\(` | `Assert.NotEmpty(expectedLines)` | ShipmentSteps.cs |
| 6 | xUnit Assert.Contains | `Assert\.Contains\s*\(` | `Assert.Contains(expectedText, response.Body)` | ShipmentSteps.cs |
| 7 | xUnit Assert.DoesNotContain | `Assert\.DoesNotContain\s*\(` | `Assert.DoesNotContain("PO-", barcode)` | ShipmentSteps.cs |
| 8 | xUnit Assert.StartsWith | `Assert\.StartsWith\s*\(` | `Assert.StartsWith("SO-", barcode)` | ShipmentSteps.cs |
| 9 | xUnit Assert.Throws | `Assert\.Throws(Async)?\s*[<(]` | `Assert.ThrowsAsync<InvalidOperationException>()` | — |
| 10 | FluentAssertions Should() | `\.Should\(\)` | `result.Should().NotBeNull()` | — |
| 11 | FluentAssertions Should.Be | `Should\.(Be\|NotBe\|Contain)` | `response.StatusCode.Should().Be(200)` | — |
| 12 | throw InvalidOperationException (NOT FOUND) | `throw.*InvalidOperationException.*NOT FOUND` | `throw new InvalidOperationException($"Tenant NOT FOUND...")` | DatabaseAssertionSteps.cs |
| 13 | throw InvalidOperationException (mismatch) | `throw.*InvalidOperationException.*mismatch` | `throw new InvalidOperationException($"Email mismatch...")` | DatabaseAssertionSteps.cs |
| 14 | throw with condition check | `if\s*\([^)]+\)\s*\{?\s*throw\s+new` | `if (tenant == null) { throw new InvalidOperationException(...) }` | DatabaseAssertionSteps.cs |
| 15 | NUnit Assert.That | `Assert\.That\s*\(` | `Assert.That(result, Is.Not.Null)` | — |

---

## ❌ BAD - Плохие паттерны (7)

| # | Паттерн | Regex | Пример | Почему плохо |
|---|---------|-------|--------|--------------|
| 1 | PendingStepException | `throw\s+new\s+PendingStepException\s*\(` | `throw new PendingStepException()` | Step не реализован, тест пропускается |
| 2 | ScenarioContext.Pending() | `ScenarioContext\.Pending\s*\(` | `ScenarioContext.Pending()` | Step помечен как pending |
| 3 | ScenarioContext.StepIsPending() | `ScenarioContext\.StepIsPending\s*\(` | `ScenarioContext.StepIsPending()` | Step помечен как pending |
| 4 | NotImplementedException | `throw\s+new\s+NotImplementedException\s*\(` | `throw new NotImplementedException()` | Метод не реализован |
| 5 | Пустое тело метода | `^\s*\{\s*\}\s*$` | `public void ThenStep() { }` | Нет никакой логики |
| 6 | Только return | `^\s*return\s*;\s*$` | `return;` | Нет проверок, просто выход |
| 7 | Task.CompletedTask без логики | `^\s*return\s+Task\.CompletedTask\s*;\s*$` | `return Task.CompletedTask;` | Async метод без логики |

---

## ⚠️ WARNING - Предупреждения (6 паттернов)

> **Важно:** `Console.WriteLine` сам по себе **НЕ** является warning!
> Это warning только если в коде есть TODO/FIXME/STUBBED/SKIPPED.

| # | Паттерн | Regex | Пример | Почему проблема |
|---|---------|-------|--------|-----------------|
| 1 | TODO комментарий | `\/\/\s*TODO\b` | `// TODO: implement` | Незавершённая реализация |
| 2 | FIXME комментарий | `\/\/\s*FIXME\b` | `// FIXME: add assertion` | Известная проблема |
| 3 | HACK комментарий | `\/\/\s*HACK\b` | `// HACK: workaround` | Временное решение |
| 4 | STUBBED в коде | `STUBBED` | `"JWT verification STUBBED"` | Заглушка |
| 5 | SKIP в логе | `Console\.WriteLine.*SKIP` | `"Step SKIPPED"` | Step пропущен |
| 6 | XXX/BUG комментарий | `\/\/\s*(XXX\|BUG)\b` | `// XXX: fix later` | Проблема в коде |

---

## 📝 Важно: Console.WriteLine - когда это проблема?

### Логика проверки

```
Console.WriteLine сам по себе ≠ плохо!

BAD только если ВСЕ условия:
  ├─ Step Type = Then (проверка результата)
  ├─ Есть Console.WriteLine / Debug.Write / _logger.Log
  └─ НЕТ assertions (Assert.*, throw check, .Should())
```

### Примеры

| Код | Step Type | Статус | Причина |
|-----|-----------|--------|---------|
| `Console.WriteLine("..."); Assert.Equal(...)` | Then | ✅ GOOD | Лог + assertion |
| `Console.WriteLine("..."); throw new InvalidOp...` | Then | ✅ GOOD | Лог + throw check |
| `Console.WriteLine("✅ verified");` (только) | Then | ❌ BAD | Только лог! |
| `Console.WriteLine("Setting up...");` (только) | Given | ✅ OK | Given не обязан проверять |
| `Console.WriteLine("Clicking...");` (только) | When | ✅ OK | When не обязан проверять |

---

## Примеры из реального кода

### ❌ BAD: Then шаг только с Console.WriteLine (без assertion)

**Файл:** `LoggingAssertionSteps.cs`

```csharp
[StepDefinition(@"System logs ""(.*)"" at (.*) level")]
public void ThenSystemLogsAtLevel(string messagePattern, string logLevel)
{
    // ⚠️ ПРОБЛЕМА: Только Console.WriteLine, нет Assert!
    Console.WriteLine($"[Logging] Verifying log message: '{messagePattern}' at {logLevel} level");
    
    if (messagePattern.Contains("NEW INSTALLATION"))
    {
        Console.WriteLine($"[Logging] ✅ NEW INSTALLATION log assumed");
    }
    else
    {
        Console.WriteLine($"[Logging] ✅ Log message '{messagePattern}' verified");
    }
    // ← НИКАКОГО Assert.* - это BAD для Then шага!
}
```

**Проблема:** Step помечен как `[StepDefinition]` и используется для `Then`, но не содержит никаких assertions. Только `Console.WriteLine` с эмодзи ✅.

---

### ⚠️ WARNING: Then шаг с ранним return

**Файл:** `SmartApiAssertionSteps.cs`

```csharp
[Then(@"Smart API returns JWT token")]
public void ThenSmartAPIReturnsJWTToken()
{
    Console.WriteLine("[Smart API] JWT token verification STUBBED");
    
    if (!_scenarioContext.ContainsKey("SmartApiJwt"))
    {
        Console.WriteLine("[Smart API] ⚠️ No JWT in context (expected - Smart API stubbed)");
        return;  // ← Ранний выход БЕЗ проверки!
    }
    
    Console.WriteLine($"[Smart API] ✅ JWT token step SKIPPED (Phase 1.6)");
    // ← Нет Assert после return!
}
```

**Проблема:** Step завершается без assertion. Ключевое слово "STUBBED" и "SKIPPED" указывают на заглушку.

---

### ✅ GOOD: Then шаг с полноценными assertions

**Файл:** `DatabaseAssertionSteps.cs`

```csharp
[StepDefinition(@"SmartUser is created in database:")]
public async Task ThenSmartUserIsCreatedInDatabase(Table table)
{
    var tenantId = _scenarioContext.Get<Guid>("TenantId");
    using var dbContext = GetDbContext();
    
    var expectedEmail = table.Rows.First(r => r["Field"] == "Email")["Value"];
    
    var user = await dbContext.SmartUsers
        .FirstOrDefaultAsync(u => u.Email == expectedEmail && u.TenantId == tenantId);
    
    // ✅ GOOD: throw при отсутствии данных = assertion
    if (user == null)
    {
        throw new InvalidOperationException(
            $"SmartUser with Email '{expectedEmail}' NOT FOUND.");
    }
    
    // ✅ GOOD: проверка каждого поля с throw при несоответствии
    foreach (var row in table.Rows)
    {
        var field = row["Field"];
        var expectedValue = row["Value"];
        
        switch (field)
        {
            case "Email":
                if (user.Email != expectedValue)
                    throw new InvalidOperationException($"Email mismatch. Expected: {expectedValue}");
                break;
        }
    }
}
```

**Почему GOOD:** Используется `throw new InvalidOperationException` с проверкой условия - это эквивалент assertion.

---

### ✅ GOOD: Then шаг с xUnit Assert

**Файл:** `ShipmentSteps.cs`

```csharp
[Then(@"response contains Sales Orders and NOT Purchase Orders")]
public void ThenResponseContainsSalesOrdersNotPurchaseOrders()
{
    var response = ScenarioContext.Get<DocumentsResponseSnapshot>(DocumentsResponseKey);
    
    // ✅ GOOD: xUnit Assert
    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    
    var doc = JsonSerializer.Deserialize<JsonElement>(response.Body);
    var results = doc.GetProperty("result").EnumerateArray().ToList();
    
    foreach (var result in results)
    {
        var barcode = result.GetProperty("barcode").GetString();
        
        // ✅ GOOD: Assert.StartsWith
        Assert.StartsWith("SO-", barcode, StringComparison.OrdinalIgnoreCase);
        
        // ✅ GOOD: Assert.DoesNotContain
        Assert.DoesNotContain("PO-", barcode, StringComparison.OrdinalIgnoreCase);
    }
}
```

---

## Атрибуты Step Definitions в C#

| Атрибут | Использование | Пример |
|---------|---------------|--------|
| `[Given(@"...")]` | Предусловие | `[Given(@"User is logged in")]` |
| `[When(@"...")]` | Действие | `[When(@"User clicks button")]` |
| `[Then(@"...")]` | Проверка (assertion) | `[Then(@"Page shows success")]` |
| `[And(@"...")]` | Продолжение предыдущего | `[And(@"Email is sent")]` |
| `[But(@"...")]` | Исключение | `[But(@"Admin panel is hidden")]` |
| `[StepDefinition(@"...")]` | Универсальный | `[StepDefinition(@"System logs ...")]` |

---

## Структура файлов в типичном проекте

```
Project.Tests/
├── Steps/
│   ├── BaseSteps.cs              # Базовый класс
│   ├── DatabaseAssertionSteps.cs # DB проверки
│   ├── ShipmentSteps.cs          # Shipment workflow
│   ├── ReceivingSteps.cs         # Receiving workflow
│   └── ...
├── Features/
│   ├── Shipment.feature          # Gherkin сценарии
│   └── ...
├── Hooks/
│   ├── WebApiHooks.cs            # BeforeScenario/AfterScenario
│   └── ...
└── Infrastructure/
    ├── Fixtures/                 # Test fixtures
    └── ...
```

---

## Классификация по Strictness

| Step Type | Strictness | Требования |
|-----------|------------|------------|
| `Then` | **HIGH** | ОБЯЗАТЕЛЬНО assertion (`Assert.*`, `throw`, `.Should()`) |
| `Given` | LOW | Допускается setup без проверок |
| `When` | LOW | Допускается action без проверок |
| `And` | INHERIT | Наследует от предыдущего (Then → HIGH) |
| `But` | INHERIT | Наследует от предыдущего |

---

## Как добавить свои паттерны

Создайте `.steps-validator.yaml` в корне проекта:

```yaml
enabled: true

# Добавить свои assertion паттерны
custom_assertions:
  csharp:
    - 'MyCustomAssert\.'
    - 'Verify\('
    - '\.ShouldSatisfy\('

# Игнорировать файлы
ignore:
  - '**/Generated/**'
  - '**/*Mock*.cs'

# Строгость проверки
strictness:
  Then: high
  Given: low
  When: low
```
