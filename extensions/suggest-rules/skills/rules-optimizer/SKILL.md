---
name: rules-optimizer
description: >
  Optimizes .claude/rules/ — adds path-scoped YAML frontmatter for lazy loading,
  merges small related files, fixes deprecated syntax. Called automatically from
  suggest-rules Phase 6 after rule creation. Can also be invoked manually.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, mcp__context7__resolve-library-id, mcp__context7__query-docs
---

# Rules Optimizer

## Mission

Optimize `.claude/rules/` directory: add path-scoped YAML frontmatter for conditional loading, merge small related files, fix deprecated syntax patterns.

## When to use

- **Automatically**: Called by suggest-rules Phase 6 after rule creation
- **Manually**: When you want to optimize existing rules

## Execution Steps

### Step 0: Sync with latest docs (optional)

If unsure about current Claude Code rules syntax, query Context7:

```
resolve-library-id("claude-code") -> query-docs(id, "rules frontmatter paths format")
```

**Key facts (verified 2026-03):**
- Only supported frontmatter field: `paths` (list of glob strings)
- Without `paths` = global rule (always loaded)
- With `paths` = conditional rule (loaded when Claude reads matching files)
- Glob patterns: `**/*.ts`, `src/**/*`, `**/*.{ts,tsx}`, `tests/**/*.test.ts`

### Step 1: Audit current rules

```bash
npx tsx .claude/skills/rules-optimizer/scripts/audit.ts --dir .claude/rules --save audit_before.json
```

Review output:
- Files without `paths` frontmatter (candidates for scoping)
- Merge candidates (small related files with overlapping paths)
- Antipattern detections

### Step 2: Add path-scoped frontmatter

For each file **without** `paths` in frontmatter:

1. Read the file content
2. Determine appropriate glob patterns using `references/path-inference-table.md`
3. If the rule is **global** (security, git workflow, general code style) — leave without frontmatter
4. If the rule is **scoped** (applies to specific file types/directories) — add frontmatter:

```yaml
---
paths:
  - "src/api/**/*.ts"
  - "**/*.sql"
---
```

**Decision criteria:**
- Rule mentions specific file extensions (`.ts`, `.sql`, `.py`) -> scoped
- Rule mentions specific directories (`src/`, `tests/`, `migrations/`) -> scoped
- Rule is about general practices (security, naming, git) -> global (no frontmatter)

### Step 3: Fix antipatterns

```bash
npx tsx .claude/skills/rules-optimizer/scripts/check-antipatterns.ts --dir .claude/rules
```

For each detected antipattern, apply the fix described in `references/known-antipatterns.md`.

### Step 4: Merge small related files

From audit merge candidates:
1. Review each group — confirm files cover the **same domain** with **overlapping paths**
2. Merge content into the primary file (larger one)
3. Delete the secondary file(s)
4. Update frontmatter paths to cover both originals

**Do NOT merge** files that:
- Cover different subsystems (e.g., `atomic-config-save` vs `atomic-update-lock`)
- Have non-overlapping paths
- Are both > 200 tokens individually

### Step 5: Final report

```bash
npx tsx .claude/skills/rules-optimizer/scripts/audit.ts --dir .claude/rules --save audit_after.json
npx tsx .claude/skills/rules-optimizer/scripts/report.ts --before audit_before.json --after audit_after.json
```

## Error Handling

- Script execution failure: Fall back to manual file reading via Read/Glob
- No rules directory: Report and stop
- Empty rules directory: Report and stop
