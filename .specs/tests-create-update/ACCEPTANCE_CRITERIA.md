# Acceptance Criteria (EARS)

## AC-1 (FR-1): Anti-pattern detection @feature1

- WHEN AI creates test that uses `pathExists()` without content check THEN skill SHALL flag as "existence-only" and suggest `stat + readFile + toContain`
- WHEN AI creates test that reads source file and checks `toContain('functionName')` THEN skill SHALL flag as "source scan" and suggest spawnSync/integration
- WHEN AI creates test with `toBeDefined()` or `typeof` assertion THEN skill SHALL flag as "weak assertion" and suggest specific value check
- WHEN AI creates C# test with chained `.GetProperty()` THEN skill SHALL flag as "unsafe JSON" and suggest `TryGetProperty()`

## AC-2 (FR-2): Assertion selection @feature2

- WHEN checking installed file THEN AI SHALL use `stat().size > 0` + `readFile()` + `content.toContain(expectedString)`
- WHEN checking API response THEN AI SHALL use status code + body deserialization + field assertions
- WHEN checking config THEN AI SHALL use `.toBe(expectedValue)` not `.toBeDefined()`
- WHEN checking C# HTTP response THEN AI SHALL use `ReadFromJsonAsync<T>()` + property assertions

## AC-3 (FR-3): No silent skip @feature3

- WHEN test needs conditional check THEN AI SHALL use `expect(condition, 'reason').toBe(true)` not `if (!condition) return`
- WHEN C# test has cleanup code THEN AI SHALL use `catch (Exception ex) { output.WriteLine(...) }` not `catch { }`

## AC-4 (FR-4): Integration-first @feature4

- WHEN testing E2E installer flow THEN AI SHALL use `runInstaller()` + file system checks
- WHEN testing CLI script THEN AI SHALL use `spawnSync(script)` + stdout/exitCode checks
- WHEN testing hook THEN AI SHALL pipe JSON input and parse JSON output

## AC-5 (FR-5): Compliance report @feature5

- WHEN test is created/updated THEN AI SHALL output markdown table with 7 rules × PASS/FAIL/N_A
- WHEN any rule FAILs THEN AI SHALL show file:line and suggest specific fix

## AC-6 (FR-6): Multi-language @feature6

- WHEN project is TypeScript THEN AI SHALL use vitest assertions (expect/toBe/toContain)
- WHEN project is C# THEN AI SHALL use xUnit + FluentAssertions (Assert/Should)
- WHEN project has Reqnroll/Gherkin THEN AI SHALL align step definitions with scenario phrasing

## AC-7 (FR-7): Unsafe JSON (C#) @feature7

- WHEN C# test uses `doc.GetProperty("x").GetProperty("y")` THEN AI SHALL replace with `TryGetProperty` chain + `Assert.Fail` on missing

## AC-8 (FR-8): Auto-trigger @feature8

- WHEN Claude writes or edits a file matching `tests/**` or `*.test.ts` or `*.test.cs` or `*Steps.cs` THEN PostToolUse hook SHALL run compliance check automatically
- IF any anti-pattern detected THEN hook SHALL block and output compliance report
- WHEN same file checked twice in session THEN hook SHALL skip (cooldown via marker hash)
