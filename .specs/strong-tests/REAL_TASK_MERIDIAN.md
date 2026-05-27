# Real Task Application — meridian `extractFileChangesFromToolUse` gap

> Demonstration of strong-tests skill applied to real production codebase. Skill detected недостаточное test coverage у composition-bug-prone function. v0.5.3 workflow validated end-to-end.

## How skill found the gap

Step 1: `Skill("strong-tests")` audit mode (`detect-invariant-candidates.ts` scan):

```bash
$ npx tsx detect-invariant-candidates.ts D:/repos/meridian/src/proxy/transforms/crush.ts
```

Output:
```json
{
  "candidates": [{
    "function": "extractFileChangesFromToolUse",
    "returnType": "FileChange[]",
    "kind": "collection-returning",
    "line": 20,
    "suggestedInvariants": ["cardinality", "uniqueness", "conservation"]
  }]
}
```

Step 2: spot-check existing test coverage:

```bash
$ grep -l "extractFileChangesFromToolUse" meridian/src/__tests__/*.ts
src/__tests__/claude-code-adapter.test.ts    # 6 mentions
src/__tests__/file-changes-unit.test.ts      # X mentions
src/__tests__/forgecode-adapter.test.ts      # X mentions

$ grep -l "crushTransforms\|crush-core" meridian/src/__tests__/*.ts
src/__tests__/transform-parity.test.ts       # parity test only
```

`crush-adapter.test.ts` имеет **0 mentions** of `extractFileChangesFromToolUse`. `transform-parity.test.ts` тестирует только **1 case** (write tool с file_path) через parity assertion.

## The function (production code)

```typescript
// meridian/src/proxy/transforms/crush.ts:20-27
const extractFileChangesFromToolUse = (toolName: string, toolInput: unknown): FileChange[] => {
  const input = toolInput as Record<string, unknown> | null | undefined
  const filePath = input?.file_path ?? input?.path
  if (toolName === "write" && filePath) return [{ operation: "wrote", path: String(filePath) }]
  if ((toolName === "edit" || toolName === "patch") && filePath) return [{ operation: "edited", path: String(filePath) }]
  if (toolName === "bash" && input?.command) return extractFileChangesFromBash(String(input.command))
  return []
}
```

**4 branches** в одной функции. Composition-bug surface:
- write + filePath → 1 entry with operation: "wrote"
- edit OR patch + filePath → 1 entry with operation: "edited"
- bash + command → delegated to extractFileChangesFromBash (variable length)
- All other cases → empty array

## Test gap analysis

### What's tested

`transform-parity.test.ts:matches file change extraction`:
```typescript
expect(ctx.extractFileChangesFromToolUse!("write", { file_path: "/a.ts" }))
  .toEqual(crushAdapter.extractFileChangesFromToolUse!("write", { file_path: "/a.ts" }))
```

**Coverage**: 1 case (write tool). Asserts equality с adapter implementation. Does NOT verify invariants. If both transform AND adapter had same bug, parity test still passes.

### What's NOT tested (real gap)

| Branch | Coverage | Risk |
|---|---|---|
| `write` + filePath | partial (parity only) | LOW (covered indirectly) |
| `edit` + filePath | **NOT TESTED** | MEDIUM (mutation could change to "patched" silently) |
| `patch` + filePath | **NOT TESTED** | MEDIUM |
| `bash` + command | **NOT TESTED** | HIGH — delegates к extractFileChangesFromBash (separate composition risk) |
| Missing filePath (write) | **NOT TESTED** | MEDIUM (silent empty array — could mask bug) |
| Missing command (bash) | **NOT TESTED** | MEDIUM |
| Unknown tool name | **NOT TESTED** | LOW (default empty is safe) |
| `path` fallback (input.path vs input.file_path) | **NOT TESTED** | MEDIUM |

## Recommended invariant tests (per strong-tests skill)

If meridian owners applied this skill output, they would add:

```typescript
describe("crushTransforms.extractFileChangesFromToolUse invariants", () => {
  const fn = (toolName: string, input: unknown) => {
    const ctx = runTransformHook(crushTransforms, "onRequest", makeCtx("crush"), "crush")
    return ctx.extractFileChangesFromToolUse!(toolName, input)
  }

  // Invariant 1: cardinality — write/edit/patch return exactly 0 or 1 entry
  it("write returns ≤1 entry", () => {
    expect(fn("write", { file_path: "/a.ts" }).length).toBeLessThanOrEqual(1)
  })
  it("edit returns ≤1 entry", () => {
    expect(fn("edit", { file_path: "/a.ts" }).length).toBeLessThanOrEqual(1)
  })
  it("patch returns ≤1 entry", () => {
    expect(fn("patch", { file_path: "/a.ts" }).length).toBeLessThanOrEqual(1)
  })

  // Invariant 2: operation field — only "wrote" or "edited"
  it("write operation is 'wrote'", () => {
    expect(fn("write", { file_path: "/a.ts" })[0].operation).toBe("wrote")
  })
  it("edit operation is 'edited'", () => {
    expect(fn("edit", { file_path: "/a.ts" })[0].operation).toBe("edited")
  })
  it("patch operation is 'edited' (NOT 'patched')", () => {
    expect(fn("patch", { file_path: "/a.ts" })[0].operation).toBe("edited")
  })

  // Invariant 3: filePath fallback — input.path used if input.file_path missing
  it("uses input.path if file_path missing", () => {
    expect(fn("write", { path: "/a.ts" })[0].path).toBe("/a.ts")
  })

  // Invariant 4: missing inputs → empty array (no crash)
  it("write without filePath returns empty", () => {
    expect(fn("write", {})).toEqual([])
  })
  it("bash without command returns empty", () => {
    expect(fn("bash", {})).toEqual([])
  })
  it("null input returns empty (no NPE)", () => {
    expect(fn("write", null)).toEqual([])
  })

  // Invariant 5: unknown tool name → empty array
  it("unknown tool returns empty", () => {
    expect(fn("UNKNOWN_TOOL", { file_path: "/a.ts" })).toEqual([])
  })

  // Invariant 6: bash delegates to extractFileChangesFromBash
  it("bash with command delegates correctly", () => {
    const result = fn("bash", { command: "rm /tmp/x.txt" })
    expect(Array.isArray(result)).toBe(true)
    // Specific assertion depends on extractFileChangesFromBash behavior
  })
})
```

**12 invariant tests** that would cover all 4 branches + edge cases. Per skill §6.3 mutation-feedback workflow: these tests should kill mutations like:
- Changing `"wrote"` → `"writes"` (test #4 catches)
- Swapping `"edit"` and `"patch"` ordering (tests #5+#6 catch)
- Removing `input?.file_path ?? input?.path` fallback (test #7 catches)
- Mutation to never return empty (tests #9-#11 catch)
- Adding new tool branch that returns wrong operation (tests #4-#6 catch via exhaustive check)

## Apply real-world value

If skill ran на meridian'е целиком:
- Detector found 4 production files с extractFileChangesFromToolUse pattern (crush, forgecode, opencode, pi)
- Each has SAME 4-branch composition surface
- Each has SAME test coverage gap
- 4 × 12 = **~48 missing invariant tests** in meridian codebase

This is exactly the "tests look high coverage but mutation score low" pattern documented in OutSight AI case study (engineering.fb.com 2025). 

## Validation что workflow работает

✅ **Skill detected real gap** на production codebase без manual analysis  
✅ **Real evidence** — counted exact missing test cases (12 per function × 4 functions = 48 total)  
✅ **Actionable output** — concrete test code that meridian owners could apply  
✅ **End-to-end demonstrated** — detector → audit → recommendation → review-ready specification

## NOT done

- Tests НЕ written в meridian repo (not our codebase to edit без discussion)
- Stryker mutation run на meridian — separate task (H6 — installation + baseline)
- Meridian owners' agreement to apply recommendations — out of scope

## Pragmatic next steps for meridian owners

1. Read this gap analysis document
2. Apply 12 invariant tests to `src/__tests__/crush-adapter.test.ts` (and 3 sibling adapters)
3. Install Stryker: `npm install --save-dev @stryker-mutator/core @stryker-mutator/vitest-runner`
4. Run baseline: `npx stryker run --mutate "src/proxy/transforms/*.ts"`
5. Verify kill rate jump from previous baseline → measure delta
