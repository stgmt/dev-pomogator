# Design

## Что это

SKILL.md — инструкция для AI агента (Claude) как правильно думать при создании/обновлении тестов. Не CLI tool, не scaffold. AI читает skill и следует workflow.

## Архитектура

```
User: "создай тест для installer"
         │
         ▼
┌─────────────────────────────┐
│  SKILL.md загружен в контекст │
│  (1500-2000 слов)           │
└─────────┬───────────────────┘
          │
  Step 0: Understand
  │  Agent(Explore) → читает production код
  │  → понимает inputs, outputs, side effects
  │
  Step 1: Design assertions
  │  Assertion Selection Table (BAD vs GOOD)
  │  → выбирает правильный assertion per check type
  │
  Step 2: Audit helpers
  │  Grep helpers.ts → import, не дублировать
  │
  Step 3: Write test
  │  Integration-first, content validation
  │  Anti-pattern rules inline
  │
  Step 4: Report
  │  Compliance table: 7 rules × PASS/FAIL
  │  Coverage gaps, weak assertions flagged
```

## Frontmatter

```yaml
---
name: tests-create-update
description: >
  This skill should be used when the user asks to "create a test",
  "write a test", "update test", "обнови тест", "создай тест",
  "добавь тест", "regression test", "bugfix test", "fix test".
  Teaches Claude how to write integration-first tests with strong
  assertions, preventing 7 anti-patterns found in audit of 258+ issues.
  Multi-language: TypeScript/vitest and C#/xUnit/FluentAssertions.
argument-hint: "[create|update] [target]"
allowed-tools: Read, Glob, Grep, Write, Edit, Bash, AskUserQuestion, Skill, Agent
---
```

## Assertion Selection Table (core of the skill)

**TypeScript/vitest:**

| Проверка | BAD (evidence: 123 issues) | GOOD |
|----------|----------------------------|------|
| File installed | `pathExists(p)` _(33 instances)_ | `stat(p).size > 0` + `readFile` + `toContain(key)` |
| API endpoint | `res.ok` _(11 instances)_ | `res.status === 200` + `body.toHaveProperty('field')` |
| Config | `toBeDefined()` _(28 instances)_ | `.toBe(expectedValue)` |
| Hook output | `typeof === 'string'` | `JSON.parse(output)` + `.toHaveProperty(...)` |
| Feature works | `readFile(src).toContain('fn')` _(35 instances)_ | `spawnSync(script)` + stdout check |
| Conditional | `if (!exists) return` _(10 instances)_ | `expect(exists, 'msg').toBe(true)` |

**C#/xUnit:**

| Проверка | BAD (evidence: 135+ issues) | GOOD |
|----------|------------------------------|------|
| HTTP response | `Assert.Equal(StatusCode.OK)` _(40+ instances)_ | + `ReadFromJsonAsync<T>()` + field asserts |
| JSON field | `.GetProperty("x")` chain _(50+ instances)_ | `TryGetProperty()` + `Assert.Fail` |
| Object | `Assert.NotNull(x)` _(20+ instances)_ | `.Should().NotBeNull()` + value check |
| Cleanup | `catch { }` _(22 instances)_ | `catch (ex) { output.WriteLine(...) }` |

## Reuse

| Что | Откуда | Конкретно |
|-----|--------|-----------|
| helpers.ts | `tests/e2e/helpers.ts` | `runInstaller`, `homePath`, `appPath`, `getClaudeMemDir`, `setupCleanState`, `getInstallLog`, `spawnSync` wrappers |
| analyze-features.ts | `.dev-pomogator/tools/specs-generator/analyze-features.ts` | Background patterns, Step Dictionary |
| extension-test-quality rule | `.claude/rules/extension-test-quality.md` | Naming DOMAIN_CODE_NN, @featureN |
| integration-tests-first rule | `.claude/rules/integration-tests-first.md` | runInstaller/spawnSync approach |
| 6 других rules | see RESEARCH.md | Составляют compliance checklist |

## Extension Manifest

Skill добавляется в `extensions/test-quality/extension.json`:
```json
"skills": {
  "dedup-tests": ".claude/skills/dedup-tests",          // existing
  "tests-create-update": ".claude/skills/tests-create-update"  // NEW
},
"skillFiles": {
  "dedup-tests": [".claude/skills/dedup-tests/SKILL.md"],
  "tests-create-update": [".claude/skills/tests-create-update/SKILL.md"]
}
```

## Auto-trigger Hook

```
PostToolUse (Write, Edit)
    │
    ▼
hook script: tests-create-update/compliance_check.ts
    │
    ├── matcher: file path matches tests/** | *.test.ts | *.test.cs | *Steps.cs | *.feature
    │   └── NO match → { "continue": true } (pass through)
    │
    ├── cooldown: marker file with content hash per session
    │   └── same hash → { "continue": true } (skip)
    │
    ├── scan: read file → detect 7 anti-patterns via regex/AST
    │   └── 0 issues → { "continue": true }
    │
    └── issues found → output compliance report + trigger /tests-create-update skill
        └── { "decision": "block", "reason": "..." }
```

**Extension.json hooks:**
```json
"hooks": {
  "claude": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [{
          "type": "command",
          "command": "npx tsx .dev-pomogator/tools/test-quality/compliance_check.ts"
        }]
      }
    ]
  }
}
```

## BDD Test Infrastructure

**Classification:** TEST_DATA_NONE
**Evidence:** Skill = SKILL.md + hook script. Нет БД, API, state.
**Verdict:** Hooks/fixtures не требуются.
