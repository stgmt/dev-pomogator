# Simplify Extended — спеки и тесты

При выполнении `/simplify` (или любого code review) проверяй не только код, но и спеки и тесты если они есть в изменённых файлах.

## Spec-файлы (`.specs/**/*.md`, `.specs/**/*.feature`, `tests/features/**/*.feature`)

Проверяй:

1. **Нечёткие требования** — "should", "may", "might", "можно", "желательно" вместо "SHALL" / "MUST" в FR.md и ACCEPTANCE_CRITERIA.md
2. **Неиспользованный reuse** — DESIGN.md не ссылается на существующие утилиты/паттерны проекта

Остальные spec-проверки (терминология, @featureN, FR decomposition) уже покрыты в `specs-management.md` и `specs-validation.md`.

## Test-файлы (`tests/**/*.test.ts`, `tests/**/*.ts`)

Проверяй:

1. **Дублирование setup** — одинаковый beforeEach/beforeAll код в разных тестах → кандидат на helper
2. **Захардкоженные данные** — магические строки/числа вместо констант или fixtures
3. **Отсутствие edge cases** — только happy path без проверки ошибок
4. **Несоответствие naming** — имя describe/it не совпадает с .feature сценарием
5. **Неиспользованные helpers** — импортированные но не вызванные функции из helpers.ts

## Strong-tests integration (compositional check)

When `/simplify` review involves test files в diff — simplify проверяет **структурное качество** (duplication / magic numbers / edge cases / naming). `strong-tests` skill — **поведенческое качество** (mutation resistance / fake-positive detection / 12-point self-eval). Two complementary surfaces.

**Trigger condition:** AI/user runs `/simplify` AND diff contains files matching:
- `*.test.ts` / `*.test.tsx` (vitest / jest)
- `*_test.py` / `tests/test_*.py` (pytest)
- `*Tests.cs` / `*Test.cs` / `*Steps.cs` / `*.test.cs` (xUnit / NUnit / Reqnroll)
- `*_test.go` (Go)

**Action:** invoke `Skill("strong-tests")` with input describing the changed test files. Skill produces:
- 12-point self-eval table (PASS/FAIL/PARTIAL per item)
- Mutation gutcheck recommendations
- Anti-pattern findings via grep on 8 catalogued smells (см. `references/anti-patterns.md`)

Findings prepended to simplify output, не replace structural checks.

**Example:**
```
/simplify
→ Detected test file changes: tests/e2e/auth.test.ts
→ Running structural checks (this rule)...
→ Invoking Skill("strong-tests") for behavioural audit on test file
→ Strong-tests output: 12-point self-eval result + survivors list
→ Combined report: structural + behavioural findings
```

**Skip condition:** test files not in diff → skip strong-tests invocation (это не unconditional check, только при relevant changes).

## Systemic vs One-Off Classification

При обнаружении проблем в спеках/тестах РАЗЛИЧАЙ:

### One-off (фиксить в output)
- Опечатка, неправильная ссылка, пропущенная секция в конкретном файле

### Systemic (фиксить в алгоритме)
Если проблема повторяется или является структурной:
- Пропущенная категория задач → fix `TASKS.md.template`
- Непропагированный scope → fix `specs-management.md` / audit check
- Устаревшие конфиги → fix verification step в инструкциях
- Дублирование блоков → fix AI-инструкция в `specs-management.md`

**Действие при systemic issue:**
1. Исправить текущий output (если urgent)
2. Пометить `💡 Systemic: {описание}` — кандидат на fix в `specs-generator-core.mjs` / `specs-management.md` / templates
3. Предложить `/suggest-rules` для фиксации

## Ограничения

- Консервативно: исправляй только явные проблемы
- Не дублируй validate-spec.ts / audit-spec.ts — они проверяют структуру, ты проверяешь содержание
- Идемпотентно: повторный вызов не должен менять уже исправленное
