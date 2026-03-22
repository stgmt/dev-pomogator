# Tasks

## TDD Workflow

> Задачи организованы по TDD: Red -> Green -> Refactor.

## Phase 0: BDD Foundation (Red)

- [x] Создать BDD feature файл `tests/features/plugins/bg-task-guard/GUARD002_bg-task-guard.feature` @feature1 @feature2
- [x] Создать E2E тест `tests/e2e/bg-task-guard.test.ts` с 8 тестами @feature1 @feature2
- [x] Сценарии GUARD002_01-08 готовы

## Phase 1: Hook Scripts (Green) @feature1

- [x] Создать `extensions/test-statusline/tools/bg-task-guard/mark-bg-task.sh` — PostToolUse hook @feature1
- [x] Создать `extensions/test-statusline/tools/bg-task-guard/stop-guard.sh` — Stop hook @feature1 @feature2
- [x] Обновить `extensions/test-statusline/extension.json` — hooks + toolFiles @feature1
- [ ] Сценарии GUARD002_01-08 переходят из Red в Green

## Phase 2: Refactor

- [ ] Все BDD сценарии GREEN
- [ ] `/run-tests` — полный регрес проходит
