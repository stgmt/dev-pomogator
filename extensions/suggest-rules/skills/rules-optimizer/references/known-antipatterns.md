# Known Antipatterns in Claude Code Rules

Reference for detecting deprecated or incorrect syntax in `.claude/rules/*.md` files.

Last updated: 2026-03 | Source: Claude Code official documentation (Context7)

## Antipattern 1: @import syntax

**Deprecated:**
```markdown
@import shared/security-rules.md
```

**Fix:** Remove the line. Claude Code rules do not support imports.
Each rule file must be self-contained.

## Antipattern 2: Paths in HTML comments

**Deprecated:**
```markdown
<!-- paths: src/**/*.ts, tests/**/*.ts -->
# My Rule
...
```

**Fix:** Use YAML frontmatter:
```markdown
---
paths:
  - "src/**/*.ts"
  - "tests/**/*.ts"
---
# My Rule
...
```

## Antipattern 3: "When to use/apply/trigger" sections

**Deprecated:**
```markdown
# My Rule

## When to use
Apply this rule when working with API endpoints...

## The rule
...
```

**Fix:** Move trigger info into `paths:` frontmatter (for file-based triggers)
or keep as global rule if trigger is behavioral:
```markdown
---
paths:
  - "**/api/**/*.ts"
---
# My Rule
...
```

## Antipattern 4: File pattern headers

**Deprecated:**
```markdown
# File patterns
- src/**/*.ts
- tests/**/*.ts

# My Rule
...
```

**Fix:** Use YAML frontmatter `paths:` field:
```markdown
---
paths:
  - "src/**/*.ts"
  - "tests/**/*.ts"
---
# My Rule
...
```

## Antipattern 5: Custom scope tags

**Deprecated:**
```markdown
[ALWAYS] This rule applies globally
[SCOPED] Only for API files
[GLOBAL] Security requirements
```

**Fix:**
- `[ALWAYS]` / `[GLOBAL]` -> Remove tag, keep rule without frontmatter (global by default)
- `[SCOPED]` -> Replace with `paths:` frontmatter

## Detection regex patterns

| Pattern | Regex (case-insensitive) | Antipattern |
|---------|-------------------------|-------------|
| @import | `^@import\s+(.+)` | #1 |
| Comment paths | `<!--\s*paths?:.*?-->` | #2 |
| When to use | `^##\s+When to (use\|apply\|trigger)` | #3 |
| File patterns header | `^#\s+File patterns?\s*$` | #4 |
| Scope tags | `\[ALWAYS\]\|\[GLOBAL\]\|\[SCOPED\]` | #5 |
