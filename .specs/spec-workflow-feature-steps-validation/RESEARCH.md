# Research: Feature Steps Validation

## Цель

1. **Перевести dev-pomogator на настоящий Cucumber BDD** — .feature файлы запускаются как тесты
2. **Создать хук валидации качества step definitions** — проверка что степы не пустые

## Проблема

### Текущее состояние dev-pomogator
- `.feature` файлы используются как **документация**
- Тесты написаны отдельно в `.test.ts` (Vitest)
- Нет связи между Gherkin шагами и кодом
- **Это неправильный BDD!**

### Правильный BDD workflow
```
.feature файл         Step Definitions       Cucumber Runner
    ↓                      ↓                      ↓
Given user exists  →  Given('user exists')  →  Запуск теста
When user logs in  →  When('user logs in')  →  Выполнение
Then user sees X   →  Then('user sees X')   →  Assertion
```

### Проблема качества Step Definitions
Step definitions могут быть "пустыми":
- Только `console.log` / `print` / `Console.WriteLine` без assertions
- Пустое тело функции (`pass`, `{}`)
- `throw new PendingException()` / TODO комментарии

---

## 1. Миграция dev-pomogator на Cucumber

### 1.1 Выбор BDD фреймворка для TypeScript

| Фреймворк | Плюсы | Минусы |
|-----------|-------|--------|
| **@cucumber/cucumber** | Классический, зрелый | Много boilerplate |
| **playwright-bdd** | Интеграция с Playwright | Только для UI тестов |
| **vitest-cucumber** | Интеграция с Vitest | Менее популярен |
| **@badeball/cypress-cucumber-preprocessor** | Для Cypress | Только Cypress |

**Рекомендация: `@cucumber/cucumber`** — универсальный, работает с любыми тестами.

### 1.2 Целевая структура проекта

```
tests/
├── features/                          # .feature файлы (Gherkin)
│   ├── core/
│   │   ├── CORE001_cursor-installer.feature
│   │   ├── CORE002_auto-update.feature
│   │   └── CORE003_claude-installer.feature
│   └── plugins/
│       └── specs-workflow/
│           ├── PLUGIN003_specs-workflow.feature
│           └── PLUGIN005_specs-validator.feature
│
├── steps/                             # Step definitions (NEW!)
│   ├── common.steps.ts                # Общие Given/When/Then
│   ├── installer.steps.ts             # Шаги для installer тестов
│   ├── hooks.steps.ts                 # Шаги для hooks тестов
│   └── specs-workflow.steps.ts        # Шаги для specs-workflow
│
├── support/                           # Cucumber support files
│   ├── world.ts                       # Custom World class
│   ├── hooks.ts                       # Before/After hooks
│   └── setup.ts                       # Глобальная настройка
│
└── e2e/                               # Старые Vitest тесты (deprecated)
    └── ...
```

### 1.3 Пример миграции

**До (документация + Vitest):**

```gherkin
# tests/features/core/CORE001_cursor-installer.feature
Feature: Cursor Installer

  Scenario: Extension files are copied
    Given fresh Cursor installation
    When dev-pomogator installs
    Then extension files exist
```

```typescript
// tests/e2e/cursor-installer.test.ts (отдельный файл!)
describe('cursor-installer', () => {
  it('Extension files are copied', async () => {
    // вручную написанный тест, не связан с .feature
  });
});
```

**После (настоящий Cucumber):**

```gherkin
# tests/features/core/CORE001_cursor-installer.feature
Feature: Cursor Installer

  @feature1
  Scenario: Extension files are copied
    Given fresh Cursor installation
    When dev-pomogator installs
    Then extension files exist in ".cursor/extensions"
```

```typescript
// tests/steps/installer.steps.ts
import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from 'vitest';
import { TestWorld } from '../support/world';

Given('fresh Cursor installation', async function(this: TestWorld) {
  this.tempDir = await createTempDir();
  await setupFreshCursor(this.tempDir);
});

When('dev-pomogator installs', async function(this: TestWorld) {
  this.result = await runInstaller(this.tempDir);
});

Then('extension files exist in {string}', async function(this: TestWorld, path: string) {
  const files = await fs.readdir(join(this.tempDir, path));
  expect(files).toContain('extension.json');  // ← ASSERTION!
  expect(files).toContain('hooks.json');
});
```

### 1.4 Конфигурация Cucumber

**cucumber.js:**
```javascript
module.exports = {
  default: {
    requireModule: ['ts-node/register'],
    require: ['tests/steps/**/*.ts', 'tests/support/**/*.ts'],
    paths: ['tests/features/**/*.feature'],
    format: ['progress', 'html:reports/cucumber.html'],
    parallel: 2,
  },
};
```

**package.json:**
```json
{
  "scripts": {
    "test:bdd": "cucumber-js",
    "test:bdd:tags": "cucumber-js --tags",
    "test": "npm run test:bdd"
  },
  "devDependencies": {
    "@cucumber/cucumber": "^10.0.0",
    "@types/node": "^20.0.0",
    "ts-node": "^10.9.0"
  }
}
```

### 1.5 Custom World

```typescript
// tests/support/world.ts
import { World, IWorldOptions, setWorldConstructor } from '@cucumber/cucumber';

export class TestWorld extends World {
  tempDir: string = '';
  result: any = null;
  error: Error | null = null;
  
  constructor(options: IWorldOptions) {
    super(options);
  }
  
  async cleanup() {
    if (this.tempDir) {
      await fs.rm(this.tempDir, { recursive: true, force: true });
    }
  }
}

setWorldConstructor(TestWorld);
```

### 1.6 Before/After Hooks

```typescript
// tests/support/hooks.ts
import { Before, After, BeforeAll, AfterAll } from '@cucumber/cucumber';
import { TestWorld } from './world';

BeforeAll(async function() {
  // Глобальная подготовка (запуск Docker и т.д.)
});

Before(async function(this: TestWorld) {
  // Перед каждым сценарием
  this.tempDir = await createTempDir();
});

After(async function(this: TestWorld) {
  // После каждого сценария
  await this.cleanup();
});

AfterAll(async function() {
  // Глобальная очистка
});
```

---

## 2. Валидация качества Step Definitions

После миграции на Cucumber нужен хук который проверяет что step definitions не пустые.

### 2.1 Python (Behave / pytest-bdd)

**Behave формат:**
```python
from behave import given, when, then

@given('user is logged in')
def step_user_logged_in(context):
    context.user = User.login('test@example.com')
    assert context.user.is_authenticated  # ← assertion

@when('user clicks logout')
def step_user_clicks_logout(context):
    context.user.logout()

@then('user should see login page')
def step_user_sees_login(context):
    assert context.browser.current_url == '/login'  # ← assertion
```

**pytest-bdd формат:**
```python
from pytest_bdd import given, when, then, scenario
import pytest

@given('user exists')
def user_exists():
    return create_user('test@example.com')

@then('response status is 200')
def check_status(response):
    assert response.status_code == 200  # ← assertion
```

**Паттерны файлов:**
- `steps/*.py`
- `*_steps.py`
- `step_*.py`
- `conftest.py` (для pytest-bdd)

**Признаки пустого степа (Python):**
```python
# ❌ Плохо - только pass
@given('something')
def step_something(context):
    pass

# ❌ Плохо - только print
@then('result is correct')
def step_result(context):
    print(context.result)

# ❌ Плохо - TODO
@when('action happens')
def step_action(context):
    # TODO: implement
    pass
```

**Признаки качественного степа (Python):**
- Содержит `assert`
- Содержит `pytest.raises`
- Содержит `context.` присваивание + использование
- Вызывает методы которые могут бросить exception

---

### 2.2 TypeScript (Cucumber.js / Playwright BDD)

**Cucumber.js формат:**
```typescript
import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';

Given('user is on {string} page', async function(page: string) {
  await this.page.goto(`/${page}`);
});

When('user clicks {string} button', async function(buttonText: string) {
  await this.page.click(`button:has-text("${buttonText}")`);
});

Then('page title should be {string}', async function(title: string) {
  expect(await this.page.title()).toBe(title);  // ← assertion
});
```

**Playwright BDD формат:**
```typescript
import { createBdd } from 'playwright-bdd';
const { Given, When, Then } = createBdd();

Given('I am on home page', async ({ page }) => {
  await page.goto('/');
});

Then('I should see {string}', async ({ page }, text: string) => {
  await expect(page.locator('body')).toContainText(text);  // ← assertion
});
```

**Паттерны файлов:**
- `steps/*.ts`
- `*.steps.ts`
- `step-definitions/*.ts`
- `*.step.ts`

**Признаки пустого степа (TypeScript):**
```typescript
// ❌ Плохо - только console.log
Then('result is visible', async function() {
  console.log(this.result);
});

// ❌ Плохо - пустое тело
Given('something', async () => {});

// ❌ Плохо - throw pending
When('action', async function() {
  throw new Error('Pending');
});

// ❌ Плохо - только return
Then('data exists', async () => {
  return true;
});
```

**Признаки качественного степа (TypeScript):**
- Содержит `expect(`
- Содержит `assert(`
- Содержит `.toBe(`, `.toEqual(`, `.toContain(`
- Содержит `await expect(`
- Содержит `should.`

---

### 2.3 .NET C# (SpecFlow / Reqnroll)

**SpecFlow/Reqnroll формат:**
```csharp
using TechTalk.SpecFlow;
using FluentAssertions;
using NUnit.Framework;

[Binding]
public class AuthenticationSteps
{
    private readonly ScenarioContext _context;
    
    public AuthenticationSteps(ScenarioContext context)
    {
        _context = context;
    }

    [Given(@"user is logged in")]
    public void GivenUserIsLoggedIn()
    {
        var user = AuthService.Login("test@example.com");
        _context["user"] = user;
        user.IsAuthenticated.Should().BeTrue();  // ← FluentAssertions
    }

    [When(@"user clicks logout")]
    public void WhenUserClicksLogout()
    {
        var user = _context.Get<User>("user");
        user.Logout();
    }

    [Then(@"user should see login page")]
    public void ThenUserShouldSeeLoginPage()
    {
        Assert.That(Browser.CurrentUrl, Is.EqualTo("/login"));  // ← NUnit
    }
}
```

**Паттерны файлов:**
- `*Steps.cs`
- `*StepDefinitions.cs`
- `Steps/*.cs`
- `StepDefinitions/*.cs`

**Признаки пустого степа (C#):**
```csharp
// ❌ Плохо - только Console.WriteLine
[Then(@"result is correct")]
public void ThenResultIsCorrect()
{
    Console.WriteLine(_context["result"]);
}

// ❌ Плохо - пустое тело
[Given(@"something")]
public void GivenSomething()
{
}

// ❌ Плохо - throw pending
[When(@"action happens")]
public void WhenActionHappens()
{
    throw new PendingStepException();
}

// ❌ Плохо - ScenarioContext.Pending()
[Then(@"data exists")]
public void ThenDataExists()
{
    ScenarioContext.StepIsPending();
}
```

**Признаки качественного степа (C#):**
- Содержит `Assert.` (NUnit/xUnit)
- Содержит `.Should()` (FluentAssertions)
- Содержит `Expect(` (NExpect)
- Содержит `_context.Get<` + использование
- Вызывает методы с проверками

---

## 3. Regex паттерны для парсинга

### 3.1 Определение step definition

**Python:**
```regex
@(given|when|then|step)\s*\(\s*['"](.*?)['"]\s*\)
```

**TypeScript:**
```regex
(Given|When|Then|And|But)\s*\(\s*[`'"](.*?)[`'"]\s*,\s*(async\s+)?(?:function|\([^)]*\)\s*=>)
```

**C#:**
```regex
\[(Given|When|Then|And|But|StepDefinition)\s*\(\s*@?"(.*?)"\s*\)\]
```

### 3.2 Определение test case (Coverage mode)

**TypeScript (Vitest/Jest):**
```regex
(?:it|test)\s*\(\s*[`'"](.*?)[`'"]\s*,
```

**Python (pytest):**
```regex
def\s+(test_\w+)\s*\(|@pytest\.mark\.parametrize
```

**C# (NUnit/xUnit):**
```regex
\[(Test|Fact|Theory)\][\s\S]*?public\s+(?:async\s+)?(?:Task|void)\s+(\w+)\s*\(
```

### 3.3 Определение assertion

**Python assertions:**
```regex
\bassert\b|pytest\.raises|should\.|expect\(
```

**TypeScript assertions:**
```regex
\bexpect\s*\(|\bassert\s*\(|\.toBe\(|\.toEqual\(|\.toContain\(|\.toHaveText\(|should\.|chai\.
```

**C# assertions:**
```regex
\bAssert\.|\.Should\(\)|Expect\(|\.ShouldBe\(|\.ShouldEqual\(
```

### 3.4 Определение "плохого" кода

**Python bad patterns:**
```regex
^\s*pass\s*$|^\s*#\s*(TODO|FIXME)|^\s*print\s*\(|^\s*return\s*$
```

**TypeScript bad patterns:**
```regex
^\s*console\.(log|warn|error)\s*\(|^\s*return\s*;?\s*$|^\s*throw\s+new\s+(Error|PendingError)\(|^\s*\}\s*$
```

**C# bad patterns:**
```regex
^\s*Console\.Write|^\s*throw\s+new\s+PendingStepException|^\s*ScenarioContext\.(Step)?IsPending|^\s*//\s*(TODO|FIXME)|^\s*\}\s*$
```

---

## 4. Структура валидатора

### 4.1 Компоненты

```
extensions/specs-workflow/tools/steps-validator/
├── validate-steps.ts          # Entry point хука (stop event)
├── types.ts                   # Общие типы и интерфейсы
├── detector.ts                # Авто-определение языка проекта
├── parsers/
│   ├── python-parser.ts       # Парсер Python steps
│   ├── typescript-parser.ts   # Парсер TypeScript steps
│   └── csharp-parser.ts       # Парсер C# steps
├── analyzer.ts                # Анализ качества степов
├── reporter.ts                # Генерация отчётов
└── config.ts                  # Загрузка конфигурации
```

### 4.2 Интерфейсы

```typescript
// Поддерживаемые языки
type Language = 'python' | 'typescript' | 'csharp';

// Step definition
interface StepDefinition {
  type: 'Given' | 'When' | 'Then' | 'And' | 'But';
  pattern: string;           // Gherkin паттерн
  file: string;
  line: number;
  language: Language;
  functionName: string;
  body: string;              // Тело функции
  quality: StepQuality;
}

interface StepQuality {
  status: 'GOOD' | 'WARNING' | 'BAD';
  hasAssertion: boolean;
  isEmpty: boolean;
  isPending: boolean;
  hasOnlyLogging: boolean;
  hasTodo: boolean;
  issues: string[];
}

// Общий результат
interface ValidationResult {
  language: Language;
  totalSteps: number;
  steps: StepDefinition[];
  summary: {
    good: number;
    warning: number;
    bad: number;
  };
}
```

### 4.3 Логика определения языка проекта

```typescript
function detectLanguage(projectRoot: string): Language | null {
  // TypeScript (Cucumber.js)
  if (glob('**/*.steps.ts').length > 0 || 
      glob('**/steps/**/*.ts').length > 0) {
    return 'typescript';
  }
  
  // Python (Behave / pytest-bdd)
  if (glob('**/*_steps.py').length > 0 || 
      glob('**/steps/**/*.py').length > 0) {
    return 'python';
  }
  
  // C# (SpecFlow / Reqnroll)
  if (glob('**/*Steps.cs').length > 0 || 
      glob('**/StepDefinitions/**/*.cs').length > 0) {
    return 'csharp';
  }
  
  return null; // Нет step definitions
}
```

---

## 5. Примеры детекции

### 5.1 TypeScript (Cucumber.js) - для dev-pomogator

```typescript
// tests/steps/installer.steps.ts

// ❌ BAD - только console.log (нет проверки!)
Then('installation completes', async function(this: TestWorld) {
  console.log('Installation result:', this.result);
});

// ❌ BAD - пустой степ
Given('fresh environment', async function() {
  // TODO: implement
});

// ❌ BAD - throw pending
When('user runs command', async function() {
  throw new Error('Pending implementation');
});

// ✅ GOOD - есть expect assertion
Then('extension files exist in {string}', async function(this: TestWorld, path: string) {
  const files = await fs.readdir(join(this.tempDir, path));
  expect(files).toContain('extension.json');
  expect(files).toContain('hooks.json');
});

// ✅ GOOD - вызов метода с проверкой внутри
Then('hooks are properly merged', async function(this: TestWorld) {
  await this.verifyHooksMerged();  // метод бросает если не ок
});
```

### 5.2 Python (Behave / pytest-bdd)

```python
# tests/steps/auth_steps.py

# ❌ BAD - только print
@then('data is saved')
def step_data_saved(context):
    print(context.data)

# ❌ BAD - пустой
@given('system is ready')
def step_system_ready(context):
    pass

# ❌ BAD - TODO
@when('user authenticates')
def step_authenticate(context):
    # TODO: implement OAuth
    pass

# ✅ GOOD - есть assertion
@then('response status is {status:d}')
def step_response_ok(context, status):
    assert context.response.status_code == status

# ✅ GOOD - pytest.raises
@then('error is raised')
def step_error_raised(context):
    with pytest.raises(AuthError):
        context.auth.validate()
```

### 5.3 C# (SpecFlow / Reqnroll)

```csharp
// Tests/StepDefinitions/AuthSteps.cs

// ❌ BAD - только Console.WriteLine
[Then(@"data is saved")]
public void ThenDataIsSaved()
{
    Console.WriteLine(_context["data"]);
}

// ❌ BAD - pending exception
[Given(@"system is ready")]
public void GivenSystemIsReady()
{
    ScenarioContext.StepIsPending();
}

// ❌ BAD - пустое тело
[When(@"nothing happens")]
public void WhenNothingHappens()
{
}

// ✅ GOOD - FluentAssertions
[Then(@"response status is (.*)")]
public void ThenResponseStatusIs(int status)
{
    _response.StatusCode.Should().Be(status);
}

// ✅ GOOD - NUnit Assert
[Then(@"user exists in database")]
public void ThenUserExistsInDatabase()
{
    var user = _context.Get<User>("user");
    Assert.That(_db.Users.Contains(user), Is.True);
}
```

---

## 6. Триггер хука

Хук на **stop** событие:
- Cursor: `Stop` hook (после завершения агента)
- Claude: `Stop` hook

**Логика:**
1. На stop определить режим валидации
2. Найти изменённые `.feature`, step files, test files
3. Если есть изменения — запустить валидацию
4. Сгенерировать отчёт `steps-validation-report.md`
5. Показать предупреждения в stdout

---

## 7. Edge Cases

| Case | Handling |
|------|----------|
| Степ вызывает helper с assertion | `GOOD` — считаем что assertion есть в helper |
| Степ с try/catch без rethrow | `WARNING` — может скрывать ошибки |
| Async степ без await перед expect | `WARNING` — может не дождаться assertion |
| Степ с множеством assertions | `GOOD` (лучше чем 0) |
| Степ использует mock.verify() | `GOOD` — это assertion |
| Given степ без assertion | `GOOD` — Given обычно setup, не обязан проверять |
| Then степ без assertion | `BAD` — Then ДОЛЖЕН проверять! |
| Степ бросает кастомный Error | `GOOD` — это валидный assertion |
| Степ только await без проверки | `BAD` — нужен expect после await |

---

## 8. Конфигурация

`.steps-validator.yaml`:

```yaml
# Включить/отключить валидацию
enabled: true

# Пути для поиска step files (авто-определение языка)
step_paths:
  typescript:
    - "tests/steps/**/*.ts"
    - "tests/**/*.steps.ts"
  python:
    - "tests/steps/**/*.py"
    - "features/steps/**/*.py"
    - "**/*_steps.py"
  csharp:
    - "Tests/StepDefinitions/**/*.cs"
    - "**/*Steps.cs"

# Строгость для типов степов
strictness:
  given: low      # Given обычно setup, assertion не обязателен
  when: low       # When — действие, assertion не обязателен
  then: high      # Then ДОЛЖЕН иметь assertion!
  and: inherit    # Наследует от предыдущего
  but: inherit

# Дополнительные assertion паттерны (кастомные)
custom_assertions:
  typescript:
    - "\\.verify\\("           # mock.verify()
    - "customExpect\\("
    - "\\.shouldMatch\\("
  python:
    - "mock\\.assert_"         # mock.assert_called_with()
  csharp:
    - "MyAssert\\."
    - "\\.Received\\("         # NSubstitute
    
# Игнорировать файлы
ignore:
  - "**/node_modules/**"
  - "**/bin/**"
  - "**/obj/**"
  - "**/__pycache__/**"

# Что делать при обнаружении BAD степов
on_bad_steps: warn  # warn | error | ignore
```

---

## 9. Формат отчёта

`steps-validation-report.md`:

```markdown
# Steps Validation Report

Generated: 2026-01-27 10:30:00
Language: TypeScript

## Summary

| Status | Count |
|--------|-------|
| ✅ GOOD | 15 |
| ⚠️ WARNING | 3 |
| ❌ BAD | 2 |

**Total steps analyzed:** 20

---

## ❌ BAD Steps (Must Fix!)

These `Then` steps have no assertions:

| Type | Pattern | File | Line | Issue |
|------|---------|------|------|-------|
| Then | `installation completes` | installer.steps.ts | 42 | Only console.log, no assertion |
| Then | `files are created` | files.steps.ts | 18 | Empty body |

---

## ⚠️ WARNING Steps

| Type | Pattern | File | Line | Issue |
|------|---------|------|------|-------|
| When | `user runs command` | common.steps.ts | 55 | TODO comment found |
| Then | `error is handled` | error.steps.ts | 72 | try/catch without rethrow |
| Given | `database is ready` | db.steps.ts | 12 | async without await |

---

## ✅ GOOD Steps

<details>
<summary>Click to expand (15 steps)</summary>

| Type | Pattern | File | Line |
|------|---------|------|------|
| Given | `fresh Cursor installation` | installer.steps.ts | 8 |
| When | `dev-pomogator installs` | installer.steps.ts | 15 |
| Then | `extension files exist in {string}` | installer.steps.ts | 22 |
| ... | ... | ... | ... |

</details>
```

---

## 10. Тестовые фикстуры

Для E2E тестов валидатора нужны изолированные фикстуры — мини-проекты на каждом языке.

### 10.1 Структура фикстур

```
tests/fixtures/steps-validator/
├── typescript/                    # TypeScript Cucumber.js проект
│   ├── features/
│   │   └── sample.feature
│   ├── steps/
│   │   ├── good.steps.ts         # Степы с assertions
│   │   └── bad.steps.ts          # Степы без assertions
│   ├── package.json
│   └── cucumber.js
│
├── python/                        # Python Behave проект
│   ├── features/
│   │   ├── sample.feature
│   │   └── steps/
│   │       ├── good_steps.py     # Степы с assert
│   │       └── bad_steps.py      # Степы без assert
│   └── requirements.txt
│
└── csharp/                        # C# SpecFlow/Reqnroll проект
    ├── Features/
    │   └── Sample.feature
    ├── StepDefinitions/
    │   ├── GoodSteps.cs          # Степы с Should()/Assert
    │   └── BadSteps.cs           # Степы без assertions
    ├── Project.csproj
    └── specflow.json
```

### 10.2 TypeScript фикстура

**tests/fixtures/steps-validator/typescript/features/sample.feature:**
```gherkin
Feature: Sample Feature

  Scenario: Good step example
    Given a good setup
    When good action happens
    Then good assertion passes

  Scenario: Bad step example
    Given a bad setup
    When bad action happens
    Then bad assertion fails
```

**tests/fixtures/steps-validator/typescript/steps/good.steps.ts:**
```typescript
import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from 'vitest';

// ✅ GOOD - все степы качественные

Given('a good setup', async function() {
  this.data = { value: 42 };
});

When('good action happens', async function() {
  this.result = this.data.value * 2;
});

Then('good assertion passes', async function() {
  expect(this.result).toBe(84);  // ← assertion!
});
```

**tests/fixtures/steps-validator/typescript/steps/bad.steps.ts:**
```typescript
import { Given, When, Then } from '@cucumber/cucumber';

// ❌ BAD - степы без assertions

Given('a bad setup', async function() {
  // TODO: implement later
});

When('bad action happens', async function() {
  console.log('Doing something...');
});

Then('bad assertion fails', async function() {
  console.log('Result:', this.result);  // ← только log, нет assertion!
});
```

**tests/fixtures/steps-validator/typescript/package.json:**
```json
{
  "name": "typescript-fixture",
  "private": true,
  "devDependencies": {
    "@cucumber/cucumber": "^10.0.0",
    "vitest": "^1.0.0"
  }
}
```

### 10.3 Python фикстура

**tests/fixtures/steps-validator/python/features/sample.feature:**
```gherkin
Feature: Sample Feature

  Scenario: Good step example
    Given a good setup
    When good action happens
    Then good assertion passes

  Scenario: Bad step example
    Given a bad setup
    When bad action happens
    Then bad assertion fails
```

**tests/fixtures/steps-validator/python/features/steps/good_steps.py:**
```python
from behave import given, when, then

# ✅ GOOD - все степы качественные

@given('a good setup')
def step_good_setup(context):
    context.data = {'value': 42}

@when('good action happens')
def step_good_action(context):
    context.result = context.data['value'] * 2

@then('good assertion passes')
def step_good_assertion(context):
    assert context.result == 84  # ← assertion!
```

**tests/fixtures/steps-validator/python/features/steps/bad_steps.py:**
```python
from behave import given, when, then

# ❌ BAD - степы без assertions

@given('a bad setup')
def step_bad_setup(context):
    pass  # ← пустой!

@when('bad action happens')
def step_bad_action(context):
    print('Doing something...')

@then('bad assertion fails')
def step_bad_assertion(context):
    print(f'Result: {context.result}')  # ← только print!
```

**tests/fixtures/steps-validator/python/requirements.txt:**
```
behave>=1.2.6
```

### 10.4 C# фикстура

**tests/fixtures/steps-validator/csharp/Features/Sample.feature:**
```gherkin
Feature: Sample Feature

  Scenario: Good step example
    Given a good setup
    When good action happens
    Then good assertion passes

  Scenario: Bad step example
    Given a bad setup
    When bad action happens
    Then bad assertion fails
```

**tests/fixtures/steps-validator/csharp/StepDefinitions/GoodSteps.cs:**
```csharp
using TechTalk.SpecFlow;
using FluentAssertions;

namespace Fixture.StepDefinitions;

// ✅ GOOD - все степы качественные

[Binding]
public class GoodSteps
{
    private readonly ScenarioContext _context;

    public GoodSteps(ScenarioContext context)
    {
        _context = context;
    }

    [Given(@"a good setup")]
    public void GivenAGoodSetup()
    {
        _context["value"] = 42;
    }

    [When(@"good action happens")]
    public void WhenGoodActionHappens()
    {
        var value = (int)_context["value"];
        _context["result"] = value * 2;
    }

    [Then(@"good assertion passes")]
    public void ThenGoodAssertionPasses()
    {
        var result = (int)_context["result"];
        result.Should().Be(84);  // ← FluentAssertions!
    }
}
```

**tests/fixtures/steps-validator/csharp/StepDefinitions/BadSteps.cs:**
```csharp
using TechTalk.SpecFlow;
using System;

namespace Fixture.StepDefinitions;

// ❌ BAD - степы без assertions

[Binding]
public class BadSteps
{
    private readonly ScenarioContext _context;

    public BadSteps(ScenarioContext context)
    {
        _context = context;
    }

    [Given(@"a bad setup")]
    public void GivenABadSetup()
    {
        // TODO: implement later
    }

    [When(@"bad action happens")]
    public void WhenBadActionHappens()
    {
        Console.WriteLine("Doing something...");
    }

    [Then(@"bad assertion fails")]
    public void ThenBadAssertionFails()
    {
        Console.WriteLine($"Result: {_context["result"]}");  // ← только Console!
    }
}
```

**tests/fixtures/steps-validator/csharp/Project.csproj:**
```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="SpecFlow" Version="3.9.74" />
    <PackageReference Include="FluentAssertions" Version="6.12.0" />
  </ItemGroup>
</Project>
```

### 10.5 E2E тесты с фикстурами

```typescript
// tests/e2e/steps-validator.test.ts

import { describe, it, expect } from 'vitest';
import { runValidateSteps } from '../../extensions/specs-workflow/tools/steps-validator/validate-steps';

describe('Steps Validator', () => {
  
  describe('TypeScript fixture', () => {
    const fixturePath = 'tests/fixtures/steps-validator/typescript';
    
    it('detects good steps', async () => {
      const result = await runValidateSteps(fixturePath);
      expect(result.summary.good).toBeGreaterThan(0);
    });
    
    it('detects bad steps', async () => {
      const result = await runValidateSteps(fixturePath);
      expect(result.summary.bad).toBeGreaterThan(0);
    });
    
    it('identifies console.log as bad in Then', async () => {
      const result = await runValidateSteps(fixturePath);
      const badStep = result.steps.find(s => 
        s.pattern.includes('bad assertion') && s.quality.status === 'BAD'
      );
      expect(badStep).toBeDefined();
      expect(badStep!.quality.issues).toContain('Only console.log, no assertion');
    });
  });
  
  describe('Python fixture', () => {
    const fixturePath = 'tests/fixtures/steps-validator/python';
    
    it('detects assert as good', async () => {
      const result = await runValidateSteps(fixturePath);
      const goodStep = result.steps.find(s => 
        s.pattern.includes('good assertion')
      );
      expect(goodStep?.quality.status).toBe('GOOD');
    });
    
    it('detects print-only as bad', async () => {
      const result = await runValidateSteps(fixturePath);
      const badStep = result.steps.find(s => 
        s.pattern.includes('bad assertion')
      );
      expect(badStep?.quality.status).toBe('BAD');
    });
    
    it('detects pass as empty', async () => {
      const result = await runValidateSteps(fixturePath);
      const emptyStep = result.steps.find(s => 
        s.pattern.includes('bad setup')
      );
      expect(emptyStep?.quality.isEmpty).toBe(true);
    });
  });
  
  describe('C# fixture', () => {
    const fixturePath = 'tests/fixtures/steps-validator/csharp';
    
    it('detects Should() as good', async () => {
      const result = await runValidateSteps(fixturePath);
      const goodStep = result.steps.find(s => 
        s.pattern.includes('good assertion')
      );
      expect(goodStep?.quality.status).toBe('GOOD');
    });
    
    it('detects Console.WriteLine as bad', async () => {
      const result = await runValidateSteps(fixturePath);
      const badStep = result.steps.find(s => 
        s.pattern.includes('bad assertion')
      );
      expect(badStep?.quality.status).toBe('BAD');
    });
    
    it('detects TODO as warning', async () => {
      const result = await runValidateSteps(fixturePath);
      const todoStep = result.steps.find(s => 
        s.quality.hasTodo
      );
      expect(todoStep).toBeDefined();
    });
  });
});
```

### 10.6 Ожидаемые результаты по фикстурам

| Fixture | Good | Warning | Bad |
|---------|------|---------|-----|
| TypeScript | 3 (good.steps.ts) | 0 | 3 (bad.steps.ts) |
| Python | 3 (good_steps.py) | 0 | 3 (bad_steps.py) |
| C# | 3 (GoodSteps.cs) | 1 (TODO) | 2 (BadSteps.cs) |

---

## 11. Зависимости

- Bun (для выполнения TypeScript хука)
- Встроенный fs/path
- Нет внешних зависимостей

---

## 12. Выводы

1. **dev-pomogator нужно перевести на настоящий Cucumber BDD**
   - .feature файлы будут запускаться как тесты
   - Step definitions свяжут Gherkin с кодом
   - Уйдёт дублирование (сейчас .feature + отдельные .test.ts)

2. **Поддержка 3 языков** для валидатора:
   - TypeScript (Cucumber.js) — основной для dev-pomogator
   - Python (Behave/pytest-bdd) — для других проектов
   - C# (SpecFlow/Reqnroll) — для .NET проектов

3. **Изолированные фикстуры** для E2E тестов:
   - Отдельный мини-проект на каждом языке
   - Содержат хорошие и плохие степы
   - Независимы от основного проекта

4. **Фокус на Then степах**:
   - `Then` ДОЛЖЕН иметь assertion
   - `Given`/`When` — не обязательно (setup/action)

5. **Regex-based парсинг** достаточен для базового анализа

6. **Хук на stop** не блокирует работу, но напоминает о проблемах

---

## 13. Две отдельные задачи

### Задача A: Миграция dev-pomogator на Cucumber

1. Установить `@cucumber/cucumber`
2. Создать структуру `tests/steps/`
3. Написать step definitions для существующих .feature
4. Настроить `cucumber.js`
5. Удалить дублирующие `.test.ts` файлы

### Задача B: Хук валидации step definitions

1. Создать полную спецификацию (12 MD + 1 .feature)
2. **Создать тестовые фикстуры** (TypeScript, Python, C#)
3. Реализовать парсеры для каждого языка
4. Реализовать анализатор качества
5. Добавить хук в extension.json (stop event)
6. Написать E2E тесты с фикстурами

---

## 14. Открытые вопросы

1. **Миграция на Cucumber — отдельная фича?**
   - Это большая работа, возможно стоит вынести в отдельную спеку

2. **Использовать Vitest как assertion library?**
   - Cucumber.js не имеет встроенных assertions
   - Можно использовать `expect` из Vitest/Chai

3. **Запускать ли E2E тесты через Cucumber?**
   - Docker тесты тоже через Cucumber?
   - Или только unit/integration?

4. **Фикстуры в репозитории или генерировать?**
   - Хранить в git (проще)
   - Или генерировать на лету (меньше файлов)
