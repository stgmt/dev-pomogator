# Fixtures

## Overview

Фикстуры для тестирования валидации кросс-ссылок между файлами спецификации.

## Fixture Inventory

| ID | Name | Type | Path | Scope | Owner |
|----|------|------|------|-------|-------|
| F-1 | Cross-ref spec files | static | `tests/fixtures/specs-generator/valid-spec-with-crossrefs/` | global | test setup (fs.copy) |

## Fixture Details

### F-1: Cross-ref spec files

- **Type:** static file
- **Format:** Markdown + Gherkin
- **Setup:** Копирование директории в временную .specs/ папку
- **Teardown:** Удаление временной директории (afterEach)
- **Dependencies:** none
- **Used by:** @feature16, @feature20
- **Assumptions:** Файлы содержат корректные markdown-ссылки между документами

## Dependencies Graph

Нет зависимостей — standalone fixture.

## Gap Analysis

| @featureN | Scenario | Fixture Coverage | Gap |
|-----------|----------|-----------------|-----|
| @feature16 | Validate spec with valid cross-references | F-1 | none |
| @feature20 | Audit passes for spec with proper cross-references | F-1 | none |

## Notes

Фикстура отличается от valid-spec наличием кросс-ссылок [FR-1](FR.md#fr-1-data-import) формата.
