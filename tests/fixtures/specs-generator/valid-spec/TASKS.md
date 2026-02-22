# Tasks

## TDD Workflow

> Задачи организованы по TDD: Red -> Green -> Refactor.

## Phase 0: BDD Foundation (Red)

- [x] Создать valid-spec.feature с BDD сценариями
- [x] Создать step definitions (заглушки)
- [x] Убедиться что все сценарии FAIL (Red)

## Phase 1: Implementation (Green)

- [x] Создать scaffold-spec.ps1 -- @feature1
- [x] Создать validate-spec.ps1 -- @feature2
- [x] Создать spec-status.ps1 -- @feature3
- [x] Создать list-specs.ps1 -- @feature4
- [x] Создать fill-template.ps1 -- @feature5
- [x] Verify: сценарии @feature1-@feature5 переходят из Red в Green

## Phase 2: Testing (Green)

- [x] Создать фикстуры для тестов -- @feature6
- [x] Написать E2E тесты -- @feature6
- [x] Проверить в Docker -- @feature6
- [x] Verify: сценарии @feature6 переходят из Red в Green

## Phase 3: Refactor & Polish

- [x] Обновить README
- [x] Добавить примеры использования
- [x] Все BDD сценарии GREEN
