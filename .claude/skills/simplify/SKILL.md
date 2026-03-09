---
name: simplify
description: >
  Review changed code for reuse, quality, and efficiency, then fix any issues found.
  Triggered automatically by the auto-simplify stop hook or invoked manually.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# Simplify — Code Quality Review

## Mission

Review recently changed files for code quality improvements. Find and fix duplicate code, unused imports, dead code, over-complicated logic, and inconsistencies with project patterns.

## When triggered

- **Automatically**: Stop hook detects significant file changes (>= threshold lines)
- **Manually**: User runs `/simplify`

## Execution Steps

### Step 1: Get changed files

```bash
git diff --name-only
```

Filter out:
- Binary files, images, fonts
- Lock files (`*.lock`, `package-lock.json`)
- Generated/build output (`dist/`, `node_modules/`, `.next/`)
- Config files that don't need review (`.gitignore`, `.editorconfig`)

### Step 2: Read and analyze each file

For each changed file, use Read tool and check for:

1. **Duplicate code** — same logic repeated within file or across changed files
2. **Unused imports** — imports not referenced in file body
3. **Dead code** — unreachable branches, unused functions/variables, commented-out code blocks
4. **Over-complicated logic** — nested ternaries, long chains, unnecessary abstractions for one-time operations
5. **Inconsistent naming** — mixed conventions compared to surrounding code (camelCase vs snake_case)
6. **Missing error handling** — empty catch blocks, swallowed errors without re-throw
7. **Code reuse opportunities** — existing utilities/helpers in the project that could replace inline code

### Step 3: Apply improvements

Use Edit tool for each fix. Keep changes minimal and focused:
- Remove unused imports
- Extract duplicate code into shared function (only if used 3+ times)
- Simplify over-nested logic
- Fix naming inconsistencies
- Do NOT add new features, comments, or docstrings — only simplify existing code

### Step 4: Summary

Output a brief summary:
- Files reviewed: N
- Issues found: N
- Fixes applied: N
- What was changed (1-2 sentences per fix)

## Constraints

- **Idempotent**: Running twice on the same code produces no additional changes
- **Conservative**: Only fix clear issues. When in doubt, leave code as-is
- **No scope creep**: Don't refactor beyond the changed files. Don't add features
- **Respect project rules**: Follow existing patterns from `.claude/rules/`
