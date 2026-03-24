# Fixtures

## Overview

Фикстуры для тестирования валидной спецификации. Статические файлы, не требующие setup/teardown.

## Fixture Inventory

| ID | Name | Type | Path | Scope | Owner |
|----|------|------|------|-------|-------|
| F-1 | Valid spec files | static | `tests/fixtures/specs-generator/valid-spec/` | global | test setup (fs.copy) |

## Fixture Details

### F-1: Valid spec files

- **Type:** static file
- **Format:** Markdown + Gherkin
- **Setup:** Копирование директории в временную .specs/ папку
- **Teardown:** Удаление временной директории (afterEach)
- **Dependencies:** none
- **Used by:** @feature4, @feature10, @feature39, @feature43, @feature44
- **Assumptions:** Все 13 обязательных файлов присутствуют и корректно заполнены

## Dependencies Graph

Нет зависимостей — standalone fixture.

## Gap Analysis

| @featureN | Scenario | Fixture Coverage | Gap |
|-----------|----------|-----------------|-----|
| @feature4 | Validate complete spec returns valid | F-1 | none |
| @feature10 | Show complete phase | F-1 | none |

## Notes

Фикстура используется как эталон корректной спецификации для позитивных тестов.
