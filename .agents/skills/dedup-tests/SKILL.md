---
name: dedup-tests
description: >
  Scan test files for duplicated code using jscpd, classify findings, extract shared helpers.
  Use when dedup_stop hook blocks or manually to check for test code duplication.
user-invocable: true
allowed-tools: Read, Bash, Glob, Grep, Edit, Write, AskUserQuestion
---

# /dedup-tests — Test Deduplication Scanner

## Mission

Find duplicated code across test files and extract shared helpers. Uses deterministic jscpd scan + AI classification.

## When triggered

- **Auto**: `dedup_stop` hook blocks Stop when test files changed
- **Manual**: User runs `/dedup-tests`

## Execution Steps

### Step 1: Deterministic scan (jscpd)

Run jscpd on test files:

```bash
npx jscpd@4 tests/ --min-tokens 30 --min-lines 3 --reporters json --output /tmp/dedup-report --gitignore --ignore "**/*.feature"
```

If jscpd fails (not installed), fall back to manual Grep scan:

```bash
# Search for function definitions that appear in multiple files
grep -rn "^function \|^export function \|^interface " tests/e2e/*.test.ts | sort
```

### Step 2: Parse results

If jscpd succeeded, read `/tmp/dedup-report/jscpd-report.json`. Sort duplicates by lines (highest impact first). Take top 10.

If using grep fallback, group identical function names across files.

### Step 3: Classify each duplicate

For each finding, read both source files and classify:

| Type | Criteria | Action |
|------|----------|--------|
| **Exact** | Identical code | Extract to `tests/e2e/helpers.ts` |
| **Near** | Same logic, different params | Create generic helper with parameters |
| **Structural** | Same pattern, different data | Consider abstraction |
| **Coincidental** | Similar by accident, different purpose | Leave as-is |

### Step 4: Check helpers.ts

Before suggesting extraction, verify the helper doesn't already exist in `tests/e2e/helpers.ts`.
Use Grep to search for function names.

### Step 5: Report

Present findings as a table:

```
| # | Fragment | Files | Lines | Type | Action |
|---|----------|-------|-------|------|--------|
```

Include summary: total duplicated lines, duplication percentage, estimated savings.

### Step 6: Fix (with confirmation)

Ask the user before making changes. For each Exact/Near duplicate:

1. Add the shared helper to `tests/e2e/helpers.ts` with export
2. Update all files to import from helpers
3. Remove the local duplicate definitions
4. Verify with Grep that no local copies remain

### Step 7: Verify

After fixes, re-run the scan to confirm duplication is resolved. Report final stats.
