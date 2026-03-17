---
name: create-extension-test
description: >
  Guided workflow for creating properly formatted extension tests. Ensures 1:1 mapping
  between test cases and BDD feature scenarios, calls real production code, follows naming conventions.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion
---

# /create-extension-test — Extension Test Creator

## Mission

Create properly formatted E2E tests for dev-pomogator extensions. Ensures tests are aligned 1:1 with BDD feature scenarios, call real production code (no inline copies), and follow the `extension-test-quality` rule.

## When triggered

- Manually: User runs `/create-extension-test [extension-name]`
- When creating tests for a new or existing extension

## Arguments

- `/create-extension-test context-menu` — create/update tests for specific extension
- `/create-extension-test` — interactive selection from available extensions

## Execution Steps

### Step 1: Identify extension

If extension name provided as argument, use it. Otherwise:
1. Scan `extensions/` directory for all extensions
2. For each, check if `tests/e2e/{name}.test.ts` exists
3. Present list to user with coverage status (has test / missing test)
4. User selects extension

### Step 2: Read extension manifest

Read `extensions/{name}/extension.json` to understand:
- tools and toolFiles (what to test)
- hooks (SessionStart, PreToolUse, etc.)
- postInstall (if any)
- skills (if any)

### Step 3: Find existing .feature file

Search in order:
1. `tests/features/**/{name}.feature`
2. `tests/features/**/*{DOMAIN_CODE}*.feature` (by describe block pattern)
3. `.specs/**/{name}.feature`

If no .feature found:
- Warn user: "No .feature file found. Create one first (Feature First rule)."
- Offer to scaffold a basic .feature using existing patterns from `tests/features/`

### Step 4: Parse .feature scenarios

Extract all `Scenario: CODE_NN description` lines from the .feature file.
Build the list of test case IDs that the .test.ts must have.

### Step 5: Check existing .test.ts

If `tests/e2e/{name}.test.ts` exists:
- Parse existing it() blocks
- Compare with feature scenarios
- Report: ALIGNED / TEST_NOT_IN_FEATURE / FEATURE_NOT_IN_TEST
- Offer to fix misalignments

If no .test.ts exists, proceed to Step 6.

### Step 6: Determine test approach for each tool

For each tool in extension:
- If tool has exported functions → use `import` approach
- If tool is CLI script (has shebang or main() call) → check for import guard
  - If no import guard → warn: "Add import guard before importing"
  - Offer to add import guard automatically
- If tool is Python/Bash script → use `spawnSync` approach

### Step 7: Generate test boilerplate

Generate `tests/e2e/{name}.test.ts` with:
- imports (vitest, fs-extra, path, child_process, helpers)
- describe block: `DOMAIN_CODE: Extension Description`
- For each feature scenario → it() stub with CODE_NN
- // @featureN tags matching .feature
- Real code import or spawnSync template

### Step 8: Verify alignment

After generation:
1. Count it() blocks vs Scenario blocks
2. Verify 1:1 CODE_NN match
3. Report coverage summary

## Important Rules

- Follow `.claude/rules/extension-test-quality.md`
- Follow `.claude/rules/docker-only-tests.md` — tests in `tests/e2e/` only
- Follow `.claude/rules/no-mocks-fallbacks.md` — no mocks
- Feature First: .feature scenario must exist before creating test
- All tests run in Docker via `npm test`
