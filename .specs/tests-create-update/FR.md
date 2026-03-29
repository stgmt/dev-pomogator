# Functional Requirements (FR)

> Skill учит AI агента (Claude) как правильно создавать/обновлять тесты. Multi-language: TypeScript + C#.
> Auto-trigger: PostToolUse hook на Write/Edit файлов `tests/**` и `*.test.ts` / `*.test.cs` / `*Steps.cs`.

## FR-1: Anti-pattern detection @feature1

AI MUST детектировать 7 категорий анти-паттернов при создании/обновлении тестов:

| # | Паттерн | TypeScript пример | C# пример |
|---|---------|-------------------|-----------|
| 1 | Source scan (unit-only) | `readFile(src).toContain('fnName')` | N/A (не найдено в Zoho) |
| 2 | Existence-only | `pathExists(p)` без content | `Assert.NotNull(x)` без value |
| 3 | Weak assertion | `toBeDefined()`, `typeof` | `Assert.Equal(StatusCode.OK)` без body |
| 4 | Response status only | `res.ok` без body | `Assert.Equal(HttpStatusCode.OK)` без body |
| 5 | Silent skip | `if (!x) return` | `catch { }` без logging |
| 6 | Helper duplication | Inline interface/function | N/A |
| 7 | Unsafe JSON | N/A | Chained `.GetProperty()` без `TryGetProperty()` |

## FR-2: Assertion Selection Table @feature2

AI MUST выбирать правильный assertion по типу проверки:

**TypeScript/vitest:**

| Проверка | BAD | GOOD |
|----------|-----|------|
| Файл установлен | `pathExists(p)` | `stat(p).size > 0` + `readFile` + `toContain(key)` |
| API endpoint | `res.ok` | `res.status === 200` + `body.toHaveProperty('field')` |
| Config value | `toBeDefined()` | `.toBe(expectedValue)` или `.toEqual(structure)` |
| Hook output | `typeof === 'string'` | `JSON.parse(output)` + `.toHaveProperty('continue', true)` |
| Feature works | `readFile(src).toContain('fn')` | `spawnSync(script)` + stdout/exitCode check |
| Conditional | `if (!exists) return` | `expect(exists, 'msg').toBe(true)` |

**C#/xUnit/FluentAssertions:**

| Проверка | BAD | GOOD |
|----------|-----|------|
| HTTP response | `Assert.Equal(StatusCode.OK)` | + `ReadFromJsonAsync<T>()` + field asserts |
| JSON field | `.GetProperty("x")` chain | `TryGetProperty()` + `Assert.Fail` if missing |
| Object exists | `Assert.NotNull(x)` | `.Should().NotBeNull()` + `.Subject.Field.Should().Be(value)` |
| Cleanup error | `catch { }` | `catch (Exception ex) { _output.WriteLine(...); }` |

## FR-3: No silent skip @feature3

AI MUST НЕ использовать early return или пустой catch в тестах:
- TypeScript: `if (!condition) return` → `expect(condition, 'описание').toBe(true)`
- C#: `catch { }` → `catch (Exception ex) { testOutput.WriteLine($"Warning: {ex.Message}"); }`

## FR-4: Integration-first approach @feature4

AI MUST выбирать integration подход для E2E кода:
- TypeScript: `runInstaller()` → check fs result, НЕ `readFile(source).toContain('functionName')`
- TypeScript: `spawnSync(script)` → check stdout/exit, НЕ import + call with hardcoded args
- C#: real API call → check response body, НЕ mock service

## FR-5: Compliance report @feature5

AI MUST выдавать compliance report после создания/обновления теста:

```markdown
| # | Rule | Status | Details |
|---|------|--------|---------|
| 1 | No source scan | PASS | — |
| 2 | Content validation | FAIL | line 42: pathExists without readFile |
| 3 | Strong assertions | PASS | — |
| 4 | No silent skip | PASS | — |
| 5 | Integration-first | FAIL | line 78: reads source instead of running |
| 6 | No helper dup | PASS | — |
| 7 | Safe JSON (C#) | N/A | TypeScript project |
```

## FR-6: Multi-language support @feature6

Skill MUST поддерживать TypeScript/vitest И C#/xUnit/FluentAssertions/Reqnroll. Assertion selection table и anti-pattern detection адаптированы под каждый язык.

## FR-7: Unsafe JSON parsing detection (C# specific) @feature7

AI MUST детектировать chained `.GetProperty()` без `TryGetProperty()` guards в C# тестах и предлагать safe альтернативу.

## FR-8: Auto-trigger на PostToolUse @feature8

Skill MUST автоматически срабатывать когда Claude трогает тестовые файлы:

**Hook**: PostToolUse на Write и Edit tools
**Matcher**: файлы matching `tests/**`, `*.test.ts`, `*.test.cs`, `*Steps.cs`, `*.feature`
**Поведение**: hook скрипт проверяет изменённый файл на 7 anti-patterns, если найдены — блокирует и запускает compliance check
**Cooldown**: не чаще 1 раза на файл за сессию (marker file с hash)
