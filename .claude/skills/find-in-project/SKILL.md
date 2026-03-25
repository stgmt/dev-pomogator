---
name: find-in-project
description: >
  Deep search across codebase: code, tests, specs, features, configs, rules, skills, extensions.
  Use when asked "где это", "найди", "find", "search", "искать", or when something is "missing".
allowed-tools: Grep, Glob, Read, Bash
---

# /find — Deep Project Search

## When triggered

User says: "найди", "где", "искать", "search", "find", "where is", "missing", "пропало", "потерялось", or any variant asking to locate something in the project.

## Arguments

`/find <query>` — what to search for.

## Execution

### Step 1: Normalize query

Extract search terms. If user gave Russian, also prepare English variants (and vice versa).

### Step 2: Parallel wide search

Run ALL of these in parallel (not sequentially):

```
Grep pattern="<term>" — all files, content search
Grep pattern="<term>" path="tests/" — tests specifically
Grep pattern="<term>" path=".specs/" — specs
Grep pattern="<term>" path="tests/features/" — BDD features
Grep pattern="<term>" path=".claude/rules/" — rules
Grep pattern="<term>" path=".claude/skills/" — skills
Grep pattern="<term>" path="extensions/" — extensions
Grep pattern="<term>" glob="*.json" — configs/manifests
Glob pattern="**/*<term>*" — file names
```

Use `-i` (case insensitive) on all Grep calls.

### Step 3: If nothing found — broaden

Try:
1. Partial matches (split query into words, search each)
2. Related terms (e.g. "statusline" → "status.line", "status_line", "StatusLine")
3. Abbreviations (e.g. "ctx" for "context", "cfg" for "config")

### Step 4: Report

Show results grouped by location:

```
## Found: <query>

### Code (src/, extensions/)
- file:line — context

### Tests (tests/)
- file:line — context

### Specs (.specs/)
- file:line — context

### Features (tests/features/)
- file:line — context

### Rules/Skills (.claude/)
- file:line — context

### Configs
- file:line — context
```

If nothing found anywhere — say so clearly with what was searched.
