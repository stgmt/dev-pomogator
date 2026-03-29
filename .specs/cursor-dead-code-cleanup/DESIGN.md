# Design

## Реализуемые требования

- [FR-1: Remove Cursor-only functions](FR.md#fr-1-remove-cursor-only-functions-from-memoryts)
- [FR-2: Remove dead helpers](FR.md#fr-2-remove-dead-helper-functions-from-memoryts)
- [FR-3: Remove updater dead code](FR.md#fr-3-remove-dead-cursor-code-from-updaterindexts)
- [FR-4: Simplify ternary](FR.md#fr-4-simplify-unreachable-ternary-branches)
- [FR-5: Update comments](FR.md#fr-5-update-outdated-comments)
- [FR-6: Preserve shared functions](FR.md#fr-6-preserve-shared-functions)

## Approach

Pure deletion of dead code. No new code, no new abstractions.

### memory.ts deletions

| Block | Description |
|-------|-------------|
| Cursor Hooks JSON section | CursorHooksJson interface, getWorkerServicePath, getCursorSummarizeScriptPath, generateCursorHooksJson |
| installCursorHooks | Main dead entry point (exported, 0 callers) |
| copyCheckUpdateScript | Helper, only caller: installCursorHooks |
| copyValidateSpecsScript | Helper, only caller: installCursorHooks |
| copyValidateStepsScript | Helper, only caller: installCursorHooks |
| copyCursorSummarizeScript | Helper, only caller: installCursorHooks |
| areCursorHooksInstalled | Private, 0 callers |

### updater/index.ts deletions

| Block | Description |
|-------|-------------|
| CursorHooksJson | Interface, used only by updateCursorHooksForProject |
| updateCursorHooksForProject | 0 callers |
| .cursor ternary (x2) | Unreachable branch |

## BDD Test Infrastructure

**Classification:** TEST_DATA_NONE
**Evidence:** Cleanup task only deletes dead code. No data created/modified, no state changes, no external services.
**Verdict:** Hooks/fixtures не требуются. Тесты stateless.
