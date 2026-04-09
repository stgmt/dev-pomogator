# Fixtures

## Overview

Фикстуры не требуются. Фича классифицирована как `TEST_DATA_NONE` в DESIGN.md (см. секцию BDD Test Infrastructure). Все тесты stateless и self-contained — каждый сценарий создаёт inline string content плана и передаёт в `validatePlanPhased` без shared state, БД, файлов или внешних сервисов. См. DESIGN.md секцию BDD Test Infrastructure для подробного Evidence по 4 классификационным вопросам.

## Fixture Inventory

N/A — нет фикстур (TEST_DATA_NONE).

## Fixture Details

N/A — нет фикстур.

## Dependencies Graph

N/A — нет фикстур.

## Cleanup Strategy

N/A — нет shared state, нет cleanup.

## Test Data Generation

Все test data генерируется inline внутри test functions:

- E2E тесты в `tests/e2e/plan-validator.test.ts` создают временные файлы планов через `fs.writeFileSync(tmpPath, content)` и удаляют через `fs.unlinkSync` в конце теста (per-test scope).
- BDD сценарии в `tests/features/plugins/plan-pomogator/PLUGIN007_plan-pomogator.feature` используют inline string content в Given-шагах.

Никаких shared fixtures между тестами. Никаких BeforeScenario/AfterScenario hooks для setup/cleanup.
