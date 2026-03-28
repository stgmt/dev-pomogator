# Tasks

## TDD Workflow

> Задачи организованы по TDD: Red -> Green -> Refactor.
> Каждый этап реализации начинается с .feature сценария (Red), затем реализация (Green), затем рефакторинг.

## Phase 0: BDD Foundation (Red)

> Создать .feature файл и тесты. Все сценарии должны FAIL (Red) на этом этапе.
> Classification: TEST_DATA_NONE — hooks/fixtures не требуются.

- [ ] Создать `tests/features/plugins/tui-test-runner/build-guard.feature` с 12 BDD сценариями -- @feature1 @feature3 @feature5
  _Requirements: FR-1_
- [ ] Создать `tests/e2e/build-guard.test.ts` с заглушками для всех 12 scenarios -- @feature1 @feature3 @feature5
  _Requirements: FR-1_
  _Leverage: `tests/e2e/test-guard.test.ts`_
- [ ] Verify: все 12 тестов FAIL (Red)

## Phase 1: Staleness Module (Green) @feature1 @feature3

> Реализовать модуль проверки staleness — основа для hook.

- [ ] Создать `extensions/tui-test-runner/tools/tui-test-runner/build-staleness.ts` с `getMaxMtime()` и `checkStaleness()` -- @feature1
  _Requirements: FR-2, FR-3, FR-4, FR-5_
  _Leverage: `extensions/_shared/hook-utils.ts`_
- [ ] Verify: unit-level тесты checkStaleness проходят

## Phase 2: Build Guard Hook (Green) @feature1 @feature5

> Реализовать PreToolUse hook — основной компонент фичи.

- [ ] Создать `extensions/tui-test-runner/tools/tui-test-runner/build_guard.ts` по паттерну `test_guard.ts` -- @feature1 @feature5
  _Requirements: FR-1, FR-6, FR-7_
  _Leverage: `extensions/tui-test-runner/tools/tui-test-runner/test_guard.ts`_
- [ ] Verify: сценарии @feature1, @feature3, @feature5 переходят из Red в Green

## Phase 3: Manifest + Docs (Green)

> Зарегистрировать hook и обновить документацию.

- [ ] Edit `extensions/tui-test-runner/extension.json`: добавить build_guard в PreToolUse hooks и toolFiles
  _Requirements: FR-1_
  _Config: см. DESIGN.md секция "Hook Registration"_
- [ ] Edit `.claude/skills/run-tests/SKILL.md`: note про build-guard hook
  _Requirements: FR-1_
- [ ] Edit `.claude/rules/tui-test-runner/centralized-test-runner.md`: секция Build Guard
  _Requirements: FR-1, FR-7_
- [ ] Verify: все 12 BDD сценариев GREEN

## Phase 4: Refactor & Polish

- [ ] Рефакторинг после прохождения всех сценариев
- [ ] Все BDD сценарии GREEN
- [ ] E2E тест-план выполнен
