# File Changes

| Path | Action | Reason |
|------|--------|--------|
| `src/installer/memory.ts` | edit | Удалить ~415 строк мёртвого Cursor-кода, обновить комментарий |
| `src/updater/index.ts` | edit | Удалить ~90 строк: CursorHooksJson, updateCursorHooksForProject, .cursor ternary |
| `tests/features/core/CORE018_cursor-dead-code-cleanup.feature` | create | BDD сценарии для cleanup |
| `tests/e2e/cursor-dead-code-cleanup.test.ts` | create | Интеграционный тест |
