# Fixtures

## Overview

BDD-тесты (CORE023_01..CORE023_08) требуют 4 starting states `~/.claude/settings.json` + isolation через temp `HOME`. Все фикстуры — inline JSON content (плюс один битый JSON literal), не отдельные файлы — простота важнее DRY.

## Fixture Inventory

| ID | Name | Type | Path | Scope | Owner |
|----|------|------|------|-------|-------|
| F-1 | settings-absent | static | inline (не создаём файл) | per-scenario | beforeEach (skip write) |
| F-2 | settings-with-1.0 | static | inline JSON `{ "skillListingBudgetFraction": 1.0 }` | per-scenario | beforeEach (write to tempHome) |
| F-3 | settings-with-0.5 | static | inline JSON `{ "skillListingBudgetFraction": 0.5, "otherKey": "preserved" }` | per-scenario | beforeEach |
| F-4 | settings-broken | static | inline string `"{ skillListingBudgetFraction: }"` (битый JSON) | per-scenario | beforeEach |
| F-5 | settings-string-value | static | inline JSON `{ "skillListingBudgetFraction": "0.5" }` (wrong type) | per-scenario | beforeEach |
| F-6 | tempHomeDir | dynamic | `${os.tmpdir()}/skill-listing-budget-${random}` | per-test (beforeEach/afterEach) | beforeEach create / afterEach remove |

## Fixture Details

### F-1: settings-absent

- **Type:** static
- **Format:** N/A (отсутствие файла)
- **Setup:** beforeEach создаёт `${tempHomeDir}/.claude/` directory но НЕ создаёт `settings.json`
- **Teardown:** afterEach `fs.removeSync(tempHomeDir)`
- **Dependencies:** F-6 (tempHomeDir)
- **Used by:** CORE023_01 (@feature1), CORE023_08 (@feature1)
- **Assumptions:** `tempHomeDir/.claude/` directory existence не required — `ensureSkillListingBudget` сам ensure-ит

### F-2: settings-with-1.0

- **Type:** static
- **Format:** JSON
- **Setup:** beforeEach `fs.writeJson('${tempHomeDir}/.claude/settings.json', { skillListingBudgetFraction: 1.0 })`
- **Teardown:** afterEach cleanup tempHomeDir
- **Dependencies:** F-6
- **Used by:** CORE023_03 (@feature2)
- **Assumptions:** значение exact `1.0` (number type), не `"1.0"` (string)

### F-3: settings-with-0.5

- **Type:** static
- **Format:** JSON
- **Setup:** beforeEach `fs.writeJson('${tempHomeDir}/.claude/settings.json', { skillListingBudgetFraction: 0.5, theme: 'dark', model: 'sonnet' })`
- **Teardown:** afterEach cleanup tempHomeDir
- **Dependencies:** F-6
- **Used by:** CORE023_02 (@feature1 — preserve keys), CORE023_04 (@feature3 — bump)
- **Assumptions:** `theme` и `model` keys должны быть preserved после write — тестирует preserve-other-keys path

### F-4: settings-broken

- **Type:** static
- **Format:** raw text (битый JSON)
- **Setup:** beforeEach `fs.writeFile('${tempHomeDir}/.claude/settings.json', '{ skillListingBudgetFraction: }', 'utf-8')`
- **Teardown:** afterEach cleanup tempHomeDir + cleanup backup directory `${tempHomeDir}/.dev-pomogator/.user-overrides/`
- **Dependencies:** F-6
- **Used by:** CORE023_05 (@feature1)
- **Assumptions:** backup file path `${tempHomeDir}/.dev-pomogator/.user-overrides/settings.json.broken-${epoch}` создаётся implementation-ом

### F-5: settings-string-value

- **Type:** static
- **Format:** JSON
- **Setup:** beforeEach `fs.writeJson('${tempHomeDir}/.claude/settings.json', { skillListingBudgetFraction: '0.5' })` (строка вместо number)
- **Teardown:** afterEach cleanup tempHomeDir
- **Dependencies:** F-6
- **Used by:** CORE023_06 (@feature1)
- **Assumptions:** строка `"0.5"` invalid даже если parse-able — strict type check `typeof === 'number'`

### F-6: tempHomeDir

- **Type:** dynamic (factory)
- **Format:** temp directory path
- **Setup:** beforeEach `tempHomeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-listing-budget-'))` + `process.env.HOME = tempHomeDir` (and HOMEDRIVE/HOMEPATH on Windows для `os.homedir()` resolution)
- **Teardown:** afterEach (1) восстановить `process.env.HOME` из snapshot, (2) `fs.removeSync(tempHomeDir)` через try-catch
- **Dependencies:** none
- **Used by:** ALL CORE023 scenarios
- **Assumptions:** Test runner не запускает scenarios в parallel внутри одного файла (vitest default), иначе HOME env race possible

## Dependencies Graph

```
F-6 (tempHomeDir) → F-1 (absent)
                  → F-2 (with-1.0)
                  → F-3 (with-0.5)
                  → F-4 (broken)
                  → F-5 (string-value)
```

F-6 — корневая фикстура; F-1..F-5 зависят от неё. Между F-1..F-5 зависимостей нет (взаимоисключающие starting states).

## Gap Analysis

| @featureN | Scenario | Fixture Coverage | Gap |
|-----------|----------|-----------------|-----|
| @feature1 | CORE023_01 absent → create | F-1, F-6 | none |
| @feature1 | CORE023_02 preserve other keys | F-3, F-6 | none |
| @feature2 | CORE023_03 idempotent no-op | F-2, F-6 | none |
| @feature3 | CORE023_04 bump 0.5 → 1.0 | F-3, F-6 | none |
| @feature1 | CORE023_05 broken JSON | F-4, F-6 | none |
| @feature1 | CORE023_06 invalid type (string) | F-5, F-6 | none |
| @feature4 | CORE023_07 one report line | F-1..F-5 (any), F-6 | none — parametrized over all states |
| @feature1 | CORE023_08 atomic write | F-1, F-6 | none |

## Notes

- **Cleanup order:** afterEach сначала восстанавливает `process.env.HOME`, потом удаляет `tempHomeDir`. Если порядок обратный — `os.homedir()` будет указывать на удалённую директорию и cleanup logic в `ensureSkillListingBudget` может пытаться писать туда.
- **Известная проблема (Windows):** `os.homedir()` на Windows читает `USERPROFILE` или `HOMEDRIVE+HOMEPATH`, не `HOME`. Тесты ОБЯЗАНЫ выставить все три env vars в `beforeEach` для cross-platform isolation.
- **No backup-fixture cleanup race:** backup-файл `settings.json.broken-${epoch}` использует Date.now() — если 2 тестов запустить в одну ms (unlikely в vitest sequential), может conflict. Mitigation: epoch + random suffix в implementation. Out of scope для фикстур (это implementation concern).
- **Каскадные зависимости:** нет — каждый scenario — single FS state, no inter-scenario carry-over.
