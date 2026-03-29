# Functional Requirements (FR)

## FR-1: Remove Cursor-only functions from memory.ts @feature1

Delete all Cursor-specific functions from `src/installer/memory.ts`: `installCursorHooks`, `areCursorHooksInstalled`, `generateCursorHooksJson`, `getWorkerServicePath`, `getCursorSummarizeScriptPath`, `copyCursorSummarizeScript`, `CursorHooksJson` interface.

## FR-2: Remove dead helper functions from memory.ts @feature2

Delete helper functions called only from dead `installCursorHooks`: `copyCheckUpdateScript`, `copyValidateSpecsScript`, `copyValidateStepsScript`. Remove unused imports.

## FR-3: Remove dead Cursor code from updater/index.ts @feature3

Delete `CursorHooksJson` interface and `updateCursorHooksForProject` function from `src/updater/index.ts`.

## FR-4: Simplify unreachable ternary branches @feature4

Replace `platform === 'claude' ? '.claude' : '.cursor'` with `'.claude'` in updater/index.ts.

## FR-5: Update outdated comments @feature5

Update `isClaudeMemRepoCloned` comment from "Used for Cursor path" to accurate description.

## FR-6: Preserve shared functions @feature5 @feature6

Ensure `isClaudeMemRepoCloned`, `cloneAndBuildRepo`, `ensureClaudeMem`, `startClaudeMemWorker`, `checkClaudeMemPluginInstalled`, `installClaudeMemPlugin` remain intact and callable.
