---
globs:
  - tests/e2e/**/*.ts
---

# No Test Helper Duplication

## Правило

ПЕРЕД определением `interface`, `function`, или `const` helper-а в тест-файле:
1. Проверь `tests/e2e/helpers.ts` — есть ли аналог
2. Проверь другие `tests/e2e/*.test.ts` — нет ли такой же функции

Если аналог найден → import, не дублировать.

## Запрещено

- Определять `interface PythonRunner` / `function getPythonRunner()` / `function runPythonJson()` в тест-файле — они экспортируются из `helpers.ts`
- Копировать spawnSync wrapper паттерн без проверки helpers.ts
- Определять `interface` с теми же полями что уже есть в helpers.ts

## Допустимо

- Domain-specific `readFixture()` с конкретным `FIXTURES_DIR` (разные для каждого домена)
- Helpers < 5 строк, используемые только в одном тесте
- Test-specific setup (beforeEach с уникальной логикой)

## При обнаружении

`💡 Заметка: дублированный helper "{имя}" — уже есть в helpers.ts или другом тесте. Используй import.`

## Чеклист

- [ ] Новый helper не дублирует существующий в `helpers.ts`
- [ ] Shared helper добавлен в `helpers.ts` с export
- [ ] Все тест-файлы используют import вместо локальной копии
