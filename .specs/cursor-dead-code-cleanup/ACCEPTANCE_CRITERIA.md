# Acceptance Criteria (EARS)

## AC-1 (FR-1): No Cursor exports in memory.ts @feature1

**Требование:** [FR-1](FR.md#fr-1-remove-cursor-only-functions-from-memoryts)

WHEN developer greps `src/installer/memory.ts` for `installCursorHooks` THEN grep SHALL return 0 results.
WHEN developer greps `src/installer/memory.ts` for `areCursorHooksInstalled` THEN grep SHALL return 0 results.
WHEN developer greps `src/installer/memory.ts` for `CursorHooksJson` THEN grep SHALL return 0 results.

## AC-2 (FR-2): No dead helpers in memory.ts @feature2

**Требование:** [FR-2](FR.md#fr-2-remove-dead-helper-functions-from-memoryts)

WHEN developer greps `src/installer/memory.ts` for `copyCheckUpdateScript` THEN grep SHALL return 0 results.

## AC-3 (FR-3): No Cursor code in updater @feature3

**Требование:** [FR-3](FR.md#fr-3-remove-dead-cursor-code-from-updaterindexts)

WHEN developer greps `src/updater/index.ts` for `updateCursorHooksForProject` THEN grep SHALL return 0 results.

## AC-4 (FR-4): No .cursor ternary @feature4

**Требование:** [FR-4](FR.md#fr-4-simplify-unreachable-ternary-branches)

WHEN developer greps `src/updater/index.ts` for `.cursor` THEN grep SHALL return 0 results.

## AC-5 (FR-5, FR-6): Shared functions intact @feature5

**Требование:** [FR-5](FR.md#fr-5-update-outdated-comments), [FR-6](FR.md#fr-6-preserve-shared-functions)

WHEN developer imports `ensureClaudeMem` from `memory.ts` THEN import SHALL succeed.
WHEN developer runs `npm run build` THEN build SHALL complete with exit code 0.

## AC-6 (FR-6): Regression safety @feature6

**Требование:** [FR-6](FR.md#fr-6-preserve-shared-functions)

WHEN developer runs existing CORE003 tests THEN all tests SHALL pass.
