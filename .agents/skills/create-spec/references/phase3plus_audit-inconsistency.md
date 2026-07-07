# Audit Category 3: НЕКОНСИСТЕНТНОСТЬ (Inconsistency)

**Что это:** Терминологические расхождения между файлами, разные форматы идентификаторов, одна сущность — разные имена.

## Checks

1. Сравнить именование сущностей (идентификаторы, параметры API, имена полей) между FR.md, DESIGN.md, `.feature`, TASKS.md, `*_SCHEMA.md`
2. Проверить форматы ID (`vendorId` vs `customerVendorId` vs `vendor_id`)
3. Проверить что тестовые данные в `.feature` реалистичны (не "PRA" вместо числового ID)
4. **TABLE_ROW_COUNT:** проверить что section headers ("N dirs", "N files", "N entries") совпадают с количеством строк в markdown таблице ниже них
5. **PROSE_COUNT_SYNC:** проверить numerical claims в prose vs actual counts

## Remediation

Для каждого finding:

- Разные имена для одной сущности → выбрать один canonical вариант, replace во всех файлах
- Несогласованный формат ID → выбрать один (например camelCase `vendorId`), заменить во всех файлах
- Нереалистичные тестовые данные ("PRA") → заменить на realistic (`12345` или specific test fixture ID)
- Number mismatch (header says "5 entries", таблица has 4 rows) → исправить header или добавить недостающую строку

## Severity

WARNING — name inconsistency между файлами.
INFO — count mismatch.

## Связанные правила

- [`validation-rules.md`](validation-rules.md) — `COUNT_CONSISTENCY`, `TABLE_ROW_COUNT`, `PROSE_COUNT_SYNC`
