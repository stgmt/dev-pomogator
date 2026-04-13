---
name: tests-create-update
description: >
  This skill should be used when the user asks to "create a test",
  "write a test", "update test", "add test", "regression test",
  "bugfix test", "fix test", "создай тест", "обнови тест",
  "добавь тест", "напиши тест", "регрессионный тест".
  Also auto-triggered by PostToolUse hook when Claude writes or edits
  test files (tests/**, *.test.ts, *.test.cs, *Steps.cs).
  Teaches Claude to write integration-first tests with strong assertions,
  preventing 7 anti-patterns found in audit of 258+ issues across
  TypeScript/vitest and C#/xUnit/FluentAssertions projects.
argument-hint: "[create|update] [target file or domain]"
allowed-tools: Read, Glob, Grep, Write, Edit, Bash, AskUserQuestion, Skill, Agent
---

# /tests-create-update — Anti-Pattern Prevention for Tests

## Mission

Prevent false-positive tests. Every test Claude writes or updates MUST catch real bugs, not pass with wrong data.

Evidence: audit of 2 projects found 258+ issues — pathExists-only, toBeDefined(), source scan, silent skip, response.ok without body check.

---

## Step 0: Understand What To Test

Before writing any test code, analyze the production code being tested.

Use Agent with subagent_type Explore to read production code and extract:
- What does the code do (inputs, outputs, side effects)
- What can break (error paths, edge cases, external dependencies)
- What are the observable outcomes (files created, API responses, stdout, exit codes)

If `$ARGUMENTS` specifies a target file — read it directly. If domain (CORE, PLUGIN) — scan `tests/features/**/*.feature` via Glob to find next free domain code.

Do NOT write tests for internal implementation details. Test observable behavior.

---

## Step 1: Design Assertions — Assertion Selection Table

For each behavior to test, select assertion type from this table. The BAD column shows patterns found in real code (with issue counts). NEVER use BAD patterns.

### TypeScript / vitest

| Checking | BAD (found N times) | GOOD |
|----------|---------------------|------|
| File installed | `pathExists(p)` _(33x)_ | `const stat = await fs.stat(p); expect(stat.size).toBeGreaterThan(0); const content = await fs.readFile(p, 'utf-8'); expect(content).toContain(expectedKey);` |
| Dir has files | `readdir(d).length > 0` | `const files = await fs.readdir(d); expect(files).toContain('expected-file.md');` — check specific files from manifest, not just "non-empty". A dir with leftover junk passes `> 0` but the required file is missing. |
| API endpoint | `expect(res.ok).toBe(true)` _(11x)_ | `expect(res.status).toBe(200); const body = await res.json(); expect(body).toHaveProperty('field'); expect(body.field).toBe(expectedValue);` |
| Config / JSON value | `expect(x).toBeDefined()` _(28x)_ | `expect(x).toBe(expectedValue)` or `expect(x).toEqual({ key: value })` |
| Hook output | `expect(typeof output).toBe('string')` _(6x)_ | `const parsed = JSON.parse(output); expect(parsed).toHaveProperty('continue', true);` |
| Feature works | `readFile(src).toContain('functionName')` _(35x)_ | `const result = spawnSync('npx', ['tsx', scriptPath], { input, encoding: 'utf-8' }); expect(result.status).toBe(0); expect(result.stdout).toContain(expected);` |
| Conditional check | `if (!exists) return` _(10x)_ | `expect(exists, 'feature X must be installed for this test').toBe(true);` |

### C# / xUnit / FluentAssertions

| Checking | BAD (found N times) | GOOD |
|----------|---------------------|------|
| HTTP response | `Assert.Equal(HttpStatusCode.OK, res.StatusCode)` alone _(40x)_ | `Assert.Equal(HttpStatusCode.OK, res.StatusCode); var body = await res.Content.ReadFromJsonAsync<T>(); body.Should().NotBeNull(); body!.Id.Should().NotBeEmpty();` |
| JSON field access | `doc.GetProperty("x").GetProperty("y").GetString()!` _(50x)_ | `Assert.True(doc.RootElement.TryGetProperty("x", out var xProp), "Expected property 'x'"); Assert.True(xProp.TryGetProperty("y", out var yProp), "Expected 'x.y'"); var value = yProp.GetString(); Assert.NotNull(value);` |
| Object exists | `Assert.NotNull(x)` alone _(20x)_ | `x.Should().NotBeNull(); x!.Name.Should().Be("expected");` |
| Cleanup errors | `catch { }` _(22x)_ | `catch (Exception ex) { _output.WriteLine($"Cleanup warning: {ex.Message}"); }` |

---

## Step 2: Audit Shared Helpers

Before defining any new function, interface, or constant in a test file:

1. Grep `tests/e2e/helpers.ts` (TypeScript) or the project's shared test base class (C#) for similar name or pattern
2. If match found — import it, do NOT redefine
3. Common helpers available in dev-pomogator: `runInstaller`, `homePath`, `appPath`, `getClaudeMemDir`, `setupCleanState`, `getInstallLog`, `startWorker`, `stopWorker`, `spawnSync` wrappers, `getStatsTyped`, `runHookWithParams`

Allowed to define locally: domain-specific `readFixture()` with unique FIXTURES_DIR, helpers under 5 lines used in one test only, test-specific `beforeEach` setup.

---

## Step 3: Write the Test

Apply these rules when writing or editing test code:

**Structure (TypeScript):**
- `describe('DOMAIN_CODE: Description')` — scan existing codes via Glob `tests/features/**/*.feature`
- `it('CODE_NN: description')` — matching BDD Scenario from .feature
- `// @featureN` comment before each `it` block
- `beforeAll` with `setupCleanState()` or `runInstaller()` — integration setup

**Structure (C#/Reqnroll):**
- Step definitions in `*Steps.cs` aligned with Gherkin scenarios
- `[Then]` steps MUST assert values, not just null-checks
- Use `ITestOutputHelper` for diagnostic output in cleanup

**Assertion rules — hard requirements (original 8):**
- NEVER use `pathExists()` without `readFile()` + content check
- NEVER use `readdir().length > 0` — check for SPECIFIC expected files from manifest
- NEVER use `toBeDefined()` / `Assert.NotNull()` as the only assertion on a value
- NEVER use `res.ok` / `Assert.Equal(StatusCode)` without body deserialization
- NEVER use `if (!condition) return` — use `expect(condition, 'message').toBe(true)`
- NEVER read source file and `toContain('functionName')` — run the actual code
- NEVER define helper that exists in shared helpers file
- NEVER use chained `.GetProperty()` in C# — use `TryGetProperty()` with failure message

**Structural rules — from anti-pattern research (8 more):**
- NEVER put `if/else` inside test body that wraps assertions — if condition false, 0 assertions execute silently. Use `expect(condition).toBe(true)` THEN assert. _(Source: Google Testing Blog)_
- NEVER put assertions inside `forEach`/`for` loop without FIRST asserting `expect(array.length).toBeGreaterThan(0)` — empty array = 0 assertions = silent PASS. _(Source: xUnit Patterns)_
- NEVER call async function without `await` — `fetchUser().then(u => expect(...))` finishes before assertion. Always `const result = await fn()`. _(Source: Jest docs, eslint-plugin-jest)_
- NEVER wrap test body in `try/catch` that logs instead of failing — exception swallowed, test passes. Use `expect(fn).toThrow()` or `expect(promise).rejects.toThrow()`. _(Source: goldbergyoni/js-testing-best-practices)_
- NEVER write `try { fn() } catch(e) { expect(e)... }` — if fn does NOT throw, test passes with 0 catch assertions. Use `await expect(fn()).rejects.toThrow('msg')`. _(Source: goldbergyoni)_
- NEVER write `it()` with zero `expect()` calls — test always passes regardless of behavior. Add `expect.hasAssertions()` as guard or add real assertions. _(Source: Codurance, testsmells.org)_
- NEVER compute expected value using same logic as production code — `expect(fn(x)).toBe(x * 0.2)` can never fail. Use hardcoded expected: `expect(fn(100)).toBe(20)`. _(Source: Mark Seemann, Randy Coulman)_
- NEVER use `setTimeout`/`sleep`/`delay` to wait for async — flaky, slow. Use `expect.poll()`, `waitFor()`, `vi.useFakeTimers()`, or poll loop with condition. _(Source: Martin Fowler, Vitest docs)_

---

## Step 4: Compliance Report

After writing or updating a test, output this compliance table:

```markdown
## Compliance Report: {filename}

| # | Rule | Status | Details |
|---|------|--------|---------|
| 1 | No source scan | PASS/FAIL | {suggest spawnSync} |
| 2 | Content validation | PASS/FAIL | {suggest readFile+toContain} |
| 3 | Strong assertions | PASS/FAIL | {suggest .toBe(value)} |
| 4 | Body check on responses | PASS/FAIL | {suggest body deserialization} |
| 5 | No silent skip | PASS/FAIL | {suggest expect with message} |
| 6 | No helper duplication | PASS/FAIL | {suggest import from helpers} |
| 7 | Safe JSON (C# only) | PASS/FAIL/N_A | {suggest TryGetProperty} |
| 8 | No conditional assertions | PASS/FAIL | {suggest guard assert before} |
| 9 | Loop has length guard | PASS/FAIL | {suggest expect(arr.length).toBeGT(0)} |
| 10 | No missing await | PASS/FAIL | {suggest await before async call} |
| 11 | No exception swallowing | PASS/FAIL | {suggest remove try-catch or use .toThrow()} |
| 12 | No try-catch assert | PASS/FAIL | {suggest expect().rejects.toThrow()} |
| 13 | Has assertions | PASS/FAIL | {suggest add expect() or expect.hasAssertions()} |
| 14 | No tautological assert | PASS/FAIL | {suggest hardcoded expected value} |
| 15 | No arbitrary sleep | PASS/FAIL | {suggest poll/fakeTimers} |
| 16 | No trivial input | PASS/FAIL | {suggest real script with imports/deps} |

**Summary:** X/16 PASS, Y/16 FAIL
**Coverage:** {what behaviors are tested, what is missing}
**Weak spots:** {assertions that technically pass but could miss real bugs}
```

If any rule shows FAIL — fix it immediately before finishing. Do not leave FAILs in the report.

**Trivial input rule (from tsx-runner false-positive incident):**
- NEVER test a script runner/hook executor with a trivial script that has zero imports — it gives false confidence that import resolution works. Test with a script that has `import ... from './dep.js'` at minimum. _(Source: dev-pomogator v1.4.2 incident — CORE007_04 tested tsx-runner with `console.log("OK")`, passed for months while real hooks with local imports were broken)_

---

## Anti-Pattern Quick Reference

When reviewing existing test code (update mode), scan for these regex patterns:

**TypeScript — original 7:**
- `pathExists\(` without nearby `readFile` or `stat` → Rule 2
- `\.toBeDefined\(\)` or `\.toBeTruthy\(\)` as terminal assertion → Rule 3
- `typeof .+ === ['"]string['"]` as terminal assertion → Rule 3
- `\.ok\)\.toBe\(true\)` without nearby `.json()` → Rule 4
- `if \(!.*\) return` inside `it(` block → Rule 5
- `\.toContain\(['"](?:function|class|const|import|export|async|interface)[\s'"]` → Rule 1

**TypeScript — trivial input (from tsx-runner incident):**
- `writeFile.*console\.log` or `writeFile.*['"].*['"]` inside `it(` as the ONLY test script content (no `import`) → Rule 16 (trivial input)
- `spawnSync|execSync` test that creates temp script without `import` or `require` → Rule 16

**TypeScript — new 8 (from research):**
- `if\s*\(` inside `it(` body wrapping `expect` → Rule 8 (conditional assertions)
- `\.forEach\(` or `for\s*\(` with `expect` inside but no `length` guard before → Rule 9 (loop without guard)
- `\.then\(` with `expect` inside and no `await` or `return` → Rule 10 (missing await)
- `try\s*\{` inside `it(` with `catch` that has `console` but no `expect` rethrow → Rule 11 (exception swallowing)
- `try\s*\{[^}]*\}\s*catch` where catch has `expect` but try block has no `fail()` → Rule 12 (try-catch assert)
- `it\(` block with zero `expect(` calls → Rule 13 (zero assertions)
- `expect\((\w+)\)\.toBe\(\1\)` — same variable as expected → Rule 14 (tautological)
- `setTimeout\|new Promise.*setTimeout\|sleep\|delay` inside `it(` → Rule 15 (arbitrary sleep)

**C#:**
- `Assert\.Equal\(HttpStatusCode\.\w+,` without nearby `ReadFromJsonAsync` → Rule 4
- `\.GetProperty\("` chained 2+ times without `TryGetProperty` → Rule 7
- `catch\s*\{\s*\}` or `catch\s*\{[^}]*\}` with empty/comment-only body → Rule 5
- `Assert\.NotNull\(` as only assertion on a variable → Rule 3

---

## Related Rules (canonical sources)

- `.claude/rules/test-quality/no-test-helper-duplication.md` — helper dedup policy
- `.claude/rules/extension-test-quality.md` — naming conventions, 1:1 mapping
- `.claude/rules/integration-tests-first.md` — integration-first testing policy
- `.claude/rules/specs-workflow/no-mocks-fallbacks.md` — no mocks, fail-fast
