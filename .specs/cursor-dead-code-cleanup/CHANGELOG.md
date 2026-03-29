# Changelog

All notable changes to this feature will be documented in this file.

## [Unreleased]

### Removed
- Dead Cursor functions from memory.ts (~415 lines): installCursorHooks, areCursorHooksInstalled, generateCursorHooksJson, copy helpers, CursorHooksJson interface
- Dead Cursor code from updater/index.ts (~90 lines): CursorHooksJson, updateCursorHooksForProject
- Unreachable `.cursor` ternary branches in updater
- Unused imports: makePortableScriptCommand, makePortableTsxCommand

### Changed
- Updated isClaudeMemRepoCloned comment to reflect current purpose
