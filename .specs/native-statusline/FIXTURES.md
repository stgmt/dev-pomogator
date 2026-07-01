# Fixtures

## Overview

Все фикстуры этой фичи — **factory (in-test генерация)**, не статичные файлы. Каждый сценарий
получает изолированный temp HOME (`mkdtempSync`) с собственным `~/.claude/settings.json`,
сгенерированным в нужном состоянии, и удаляемым в afterEach. Статичных fixture-файлов на диске нет
(per `real-fixtures` discipline артефакт — реальный settings.json shape, не выдуманные поля).

## Fixture Inventory

| ID | Name | Type | Path | Scope | Owner |
|----|------|------|------|-------|-------|
| F-1 | empty settings.json | factory | temp HOME (генерится в тесте) | per-scenario | beforeEach + helper |
| F-2 | settings.json с чужой statusLine | factory | temp HOME (генерится) | per-scenario | helper |
| F-3 | settings.json с нашим ccstatusline | factory | temp HOME (генерится) | per-scenario | helper |
| F-4 | corrupt (invalid JSON) settings.json | factory | temp HOME (генерится) | per-scenario | helper |
| F-5 | отсутствующий settings.json | factory | temp HOME (файл не создаётся) | per-scenario | beforeEach |

## Fixture Details

### F-1: empty settings.json

- **Type:** factory
- **Format:** JSON
- **Setup:** helper пишет `{}` (или объект без `statusLine`) в `<tmpHome>/.claude/settings.json`
- **Teardown:** afterEach `rmSync(tmpHome, {recursive:true})`
- **Dependencies:** none
- **Used by:** @feature1 (NSL001_01, NSL001_02, NSL001_03)
- **Assumptions:** `<tmpHome>/.claude/` существует (создаётся beforeEach)

### F-2: settings.json с чужой statusLine

- **Type:** factory
- **Format:** JSON
- **Setup:** helper пишет `{ statusLine: { type:'command', command:'my-custom-bar.sh' } }`
- **Teardown:** afterEach rmSync
- **Dependencies:** none
- **Used by:** @feature2 (NSL001_04)
- **Assumptions:** команда не содержит маркер `ccstatusline`

### F-3: settings.json с нашим ccstatusline

- **Type:** factory
- **Format:** JSON
- **Setup:** helper пишет `{ statusLine: { type:'command', command:'npx -y ccstatusline@latest' } }`
- **Teardown:** afterEach rmSync
- **Dependencies:** none
- **Used by:** @feature2 (NSL001_05), @feature5 (NSL001_07 идемпотентность)
- **Assumptions:** команда содержит маркер `ccstatusline`

### F-4: corrupt settings.json

- **Type:** factory
- **Format:** invalid JSON (например `{ "statusLine": `)
- **Setup:** helper пишет битую строку
- **Teardown:** afterEach rmSync
- **Dependencies:** none
- **Used by:** @feature5 (NSL001_08 fail-open)
- **Assumptions:** парсер обязан кинуть → ловится → exit 0

### F-5: отсутствующий settings.json

- **Type:** factory (отсутствие)
- **Format:** N/A
- **Setup:** beforeEach создаёт tmpHome, но НЕ создаёт settings.json
- **Teardown:** afterEach rmSync
- **Dependencies:** none
- **Used by:** @feature1 (NSL001_09 создание файла)
- **Assumptions:** writer создаёт settings.json с одним полем statusLine

## Dependencies Graph

Фикстуры независимы (каждая — самодостаточный state одного temp HOME).

```
F-1   F-2   F-3   F-4   F-5   (нет взаимных зависимостей)
```

## Gap Analysis

| @featureN | Scenario | Fixture Coverage | Gap |
|-----------|----------|-----------------|-----|
| @feature1 | NSL001_01/02/03/09 | F-1, F-5 | none |
| @feature2 | NSL001_04/05 | F-2, F-3 | none |
| @feature3 | NSL001_10 (doctor) | F-1 (нет statusLine) | none |
| @feature4 | NSL001_06 (opt-out) | F-1 + env off | none |
| @feature5 | NSL001_07/08 | F-3, F-4 | none |

## Notes

Cleanup строго per-scenario (afterEach rmSync recursive) — параллельные тесты изолированы своим
tmpHome, общего состояния нет. Никогда не писать в реальный `~/.claude/settings.json` из тестов —
всегда через `HOME`-override в spawnSync env.
