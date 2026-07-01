# Acceptance Criteria (EARS)

## AC-1 (FR-1): No Cursor exports in memory.ts @feature1

**Требование:** [FR-1](FR.md#fr-1-remove-cursor-only-functions-from-memoryts-feature1)

WHEN developer greps ~~`src/installer/memory.ts`~~ (removed in v2 — no canonical replacement) for `installCursorHooks` THEN grep SHALL return 0 results.
WHEN developer greps ~~`src/installer/memory.ts`~~ (removed in v2 — no canonical replacement) for `areCursorHooksInstalled` THEN grep SHALL return 0 results.
WHEN developer greps ~~`src/installer/memory.ts`~~ (removed in v2 — no canonical replacement) for `CursorHooksJson` THEN grep SHALL return 0 results.

## AC-2 (FR-2): No dead helpers in memory.ts @feature2

**Требование:** [FR-2](FR.md#fr-2-remove-dead-helper-functions-from-memoryts-feature2)

WHEN developer greps ~~`src/installer/memory.ts`~~ (removed in v2 — no canonical replacement) for `copyCheckUpdateScript` THEN grep SHALL return 0 results.

## AC-3 (FR-3): No Cursor code in updater @feature3

**Требование:** [FR-3](FR.md#fr-3-remove-dead-cursor-code-from-updaterindexts-feature3)

WHEN developer greps ~~`src/updater/index.ts`~~ (removed in v2 migration) for `updateCursorHooksForProject` THEN grep SHALL return 0 results.

## AC-4 (FR-4): No .cursor ternary @feature4

**Требование:** [FR-4](FR.md#fr-4-simplify-unreachable-ternary-branches-feature4)

WHEN developer greps ~~`src/updater/index.ts`~~ (removed in v2 migration) for `.cursor` THEN grep SHALL return 0 results.

## AC-5 (FR-5, FR-6): Shared functions intact @feature5

**Требование:** [FR-5](FR.md#fr-5-update-outdated-comments-feature5), [FR-6](FR.md#fr-6-preserve-shared-functions-feature5-feature6)

WHEN developer imports `ensureClaudeMem` from `memory.ts` THEN import SHALL succeed.
WHEN developer runs `npm run build` THEN build SHALL complete with exit code 0.

## AC-6 (FR-6): Regression safety @feature6

**Требование:** [FR-6](FR.md#fr-6-preserve-shared-functions-feature5-feature6)

WHEN developer runs existing CORE003 tests THEN all tests SHALL pass.
