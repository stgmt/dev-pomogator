# Tasks

## TDD Workflow

> Задачи организованы по TDD: Red -> Green -> Refactor.

## Phase 0: BDD Foundation

- [x] Создать `tests/features/core/CORE018_cursor-dead-code-cleanup.feature` @feature1 @feature2 @feature3 @feature4 @feature5 @feature6
- [x] Создать `tests/e2e/cursor-dead-code-cleanup.test.ts` @feature1 @feature2 @feature3 @feature4 @feature5 @feature6

## Phase 1: Code Cleanup (Green)

- [x] Удалить Cursor Hooks JSON section из memory.ts @feature1 @feature2
  - Refs: [FR-1](FR.md#fr-1-remove-cursor-only-functions-from-memoryts)
- [x] Удалить installCursorHooks из memory.ts @feature1
  - Refs: [FR-1](FR.md#fr-1-remove-cursor-only-functions-from-memoryts)
- [x] Удалить copy helpers из memory.ts @feature2
  - Refs: [FR-2](FR.md#fr-2-remove-dead-helper-functions-from-memoryts)
- [x] Удалить areCursorHooksInstalled из memory.ts @feature1
  - Refs: [FR-1](FR.md#fr-1-remove-cursor-only-functions-from-memoryts)
- [x] Удалить unused imports @feature2
  - Refs: [FR-2](FR.md#fr-2-remove-dead-helper-functions-from-memoryts)
- [x] Обновить комментарий isClaudeMemRepoCloned @feature5
  - Refs: [FR-5](FR.md#fr-5-update-outdated-comments)
- [x] Удалить CursorHooksJson и updateCursorHooksForProject из updater/index.ts @feature3
  - Refs: [FR-3](FR.md#fr-3-remove-dead-cursor-code-from-updaterindexts)
- [x] Упростить .cursor ternary в updater/index.ts @feature4
  - Refs: [FR-4](FR.md#fr-4-simplify-unreachable-ternary-branches)

## Phase 2: Verify

- [x] npm run build — компиляция без ошибок @feature5
- [ ] /run-tests — CORE003 и CORE018 проходят @feature6
