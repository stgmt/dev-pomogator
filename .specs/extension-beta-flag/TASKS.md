# Tasks

## TDD Workflow

> Задачи организованы по TDD: Red -> Green -> Refactor.
> Classification: TEST_DATA_NONE — hooks/fixtures не требуются.

## Phase 0: BDD Foundation (Red)

- [ ] Создать `tests/features/core/CORE019_beta-flag.feature` с 8 BDD сценариями -- @feature1 @feature2 @feature3 @feature4
  _Requirements: FR-1_
- [ ] Создать `tests/e2e/beta-flag.test.ts` с заглушками для 8 scenarios -- @feature1 @feature2 @feature3 @feature4
  _Requirements: FR-1_
  _Leverage: ~~`tests/e2e/claude-installer.test.ts`~~ (installer test patterns)_
- [ ] Verify: все 8 тестов FAIL (Red)

## Phase 1: Extension Interface + Manifest (Green) @feature1

  _Requirements: FR-1_
- [ ] Edit `extensions/docker-optimization/extension.json`: добавить `"stability": "beta"` -- @feature1
  _Requirements: FR-1_
- [ ] Verify: CORE019_01, CORE019_02 Green

## Phase 2: Installer UI + CLI (Green) @feature2 @feature3 @feature4

  _Requirements: FR-2, FR-3, FR-4, FR-5_
  _Requirements: FR-5_
- [ ] Verify: CORE019_03..06 Green

## Phase 3: Updater Filter (Green) @feature3

  _Requirements: FR-6_
- [ ] Verify: CORE019_07, CORE019_08 Green

## Phase 4: Refactor & Polish

- [ ] Все 8 BDD сценариев GREEN
- [ ] `npm run build` pass
- [ ] Существующие CORE003 тесты не сломаны
