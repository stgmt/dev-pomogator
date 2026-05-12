# Strong-Tests Schema

JSON schemas for the data shapes produced and consumed by the `strong-tests` skill. These shapes are stable contracts that `tests/e2e/strong-tests.test.ts` asserts against and that `scripts/run-mutation.ts` produces.

## run-mutation.ts stdout JSON

```json
{
  "stack": "ts",
  "tool": "stryker",
  "killRate": 0.73,
  "totalMutants": 100,
  "killedMutants": 73,
  "survivedMutants": 27,
  "survivors": [
    {
      "file": "src/foo.ts",
      "line": 42,
      "column": 12,
      "mutator": "ConditionalExpression",
      "originalCode": "x > 0",
      "mutatedCode": "x >= 0",
      "status": "Survived"
    }
  ],
  "iterations": 2,
  "thresholdMet": true,
  "thresholdValue": 0.7,
  "gaps": []
}
```

- `stack`: one of `"ts" | "python" | "java" | "csharp" | "rust" | "go" | null`. `null` only when exit code 2 (no stack detected).
- `tool`: one of `"stryker" | "mutmut" | "pit" | "stryker-net" | "cargo-mutants" | "go-mutesting" | null`. `null` only when exit code 2.
- `killRate`: float in `[0.0, 1.0]`. Equals `killedMutants / (killedMutants + survivedMutants)`. NaN-safe: if totalMutants=0 → killRate=null + warning logged.
- `survivors[]`: array of survivor descriptors. Empty array when threshold met after iteration N.
- `iterations`: integer ≥1 indicating loop pass count.
- `thresholdMet`: boolean. true when killRate ≥ thresholdValue.
- `gaps[]`: array of `[GAP]` entries when max-iter reached without meeting threshold. Each entry: `{file, line, mutator, rationale, equivalentSuspect: boolean}`.

## 12-point self-eval section JSON (for downstream automation)

The 12-point self-eval is emitted as Markdown but its content maps to this canonical JSON shape:

```json
{
  "schemaVersion": 1,
  "items": [
    {
      "id": 1,
      "title": "Mutation gutcheck",
      "status": "PASS",
      "evidence": "Stryker dry-run on src/foo.ts produced 12 mutants; tests killed 9 of 12",
      "remediation": null
    }
  ],
  "summary": {
    "totalItems": 12,
    "passCount": 11,
    "failCount": 1,
    "naCount": 0,
    "killRateReadiness": "HIGH"
  }
}
```

- `status`: one of `"PASS" | "FAIL" | "N_A"`.
- `evidence`: non-empty string describing what was verified.
- `remediation`: non-null string only when status is `FAIL` — points at exact file:line to change.
- `killRateReadiness`: one of `"HIGH" | "MEDIUM" | "LOW"`. Computed per FR-5 rule (HIGH = ≥10 PASS AND 0 FAIL on items #1, #5, #12; MEDIUM = 7-9 PASS; LOW otherwise).

## Anti-pattern finding (Audit mode output)

```json
{
  "file": "tests/foo.test.ts",
  "line": 17,
  "patternCode": "PERMISSIVE_MATCHING",
  "patternName": "toBeDefined-only weak assertion",
  "severity": "MEDIUM",
  "badSnippet": "expect(result).toBeDefined()",
  "goodReplacement": "expect(result).toEqual({ id: 42, name: 'foo' })",
  "rationale": "toBeDefined passes for any non-undefined value including null, {}, or wrong types — does not verify behavior. Per 12-point self-eval item #2 (Assertion Specificity).",
  "selfEvalItem": 2
}
```

- `patternCode`: one of 8 enum values: `PERMISSIVE_MATCHING | ASSERTION_ROULETTE | MAGIC_NUMBER | HAPPY_PATH_ONLY | TAUTOLOGICAL | TRIVIAL_INPUT | SILENT_SKIP | MISSING_AWAIT`.
- `severity`: one of `"LOW" | "MEDIUM" | "HIGH"` with weights (10, 20, 30) for strength score computation.
- `selfEvalItem`: integer in `[1, 12]` linking the finding to the 12-point self-eval row it violates.

## Правила валидации

- `killRate` ∈ [0.0, 1.0] or null. Out-of-range = test-failing.
- `survivors[]` rows must have non-empty `file` and `line` ≥ 1.
- `summary.passCount + failCount + naCount` MUST equal 12.
- `killRateReadiness` MUST be consistent with the FR-5 rule given the item statuses (cross-check at JSON-emit time).
- Anti-pattern finding `selfEvalItem` MUST be in range [1, 12]; out-of-range → schema validation error.

## detect-invariant-candidates.ts stdout JSON (FR-7)

Produced by `.claude/skills/strong-tests/scripts/detect-invariant-candidates.ts` для каждого scan на single file:

```json
{
  "schemaVersion": 1,
  "file": "src/indexer.ts",
  "stack": "ts",
  "candidates": [
    {
      "function": "buildIndex",
      "line": 42,
      "endLine": 67,
      "kind": "collection-returning",
      "returnType": "WorktreeEntry[]",
      "suggestedInvariants": ["cardinality", "uniqueness", "conservation"],
      "rationale": "function signature returns Array; nested for-loop body detected; composition chain (discover_repos → git_worktree_list) reachable from this scope"
    },
    {
      "function": "filterDocs",
      "line": 102,
      "endLine": 115,
      "kind": "nxm-overlap",
      "returnType": "Doc[]",
      "suggestedInvariants": ["cardinality", "uniqueness"],
      "rationale": "nested for-loop over (docs × filters); both могут содержать overlapping IDs"
    }
  ],
  "suppressed": [
    {
      "function": "tally",
      "line": 80,
      "reason": "pure-leaf reducer — type system enforces",
      "reasonLength": 41,
      "reasonWarning": null
    }
  ],
  "scanDurationMs": 124,
  "astGrepVersion": "0.31.0"
}
```

Fields:
- `stack`: `"ts" | "python" | "csharp"` (v0.3.0 scope — TS / Python / C# detection).
- `candidates[].kind`: one of `"collection-returning" | "nxm-overlap" | "composition-chain"`.
- `candidates[].suggestedInvariants[]`: subset of `["cardinality", "uniqueness", "conservation", "monotonicity", "coverage", "bijection", "idempotence", "no-leak"]` per `.claude/rules/testing/output-invariants-first.md` taxonomy.
- `candidates[].line` / `endLine`: 1-indexed.
- `suppressed[].reasonWarning`: `null` if `reasonLength ≥ 8`, `"REASON_TOO_SHORT"` if `< 8`.
- `scanDurationMs`: integer milliseconds; per NFR-P4 p95 ≤500ms на files ≤2000 LOC.
- `astGrepVersion`: detected ast-grep CLI version; `null` если binary missing (graceful degradation per NFR-R5).

Exit codes:
- `0` — success (с candidates OR без)
- `2` — input file not found или unreadable
- `3` — ast-grep binary not installed (graceful degradation: detector still emits valid JSON c `candidates: []` и `astGrepVersion: null`)

## strong-tests-skips.jsonl audit log (append-only)

JSONL format — one valid JSON object per line, append-only writes per NFR-S4. Located at `.claude/logs/strong-tests-skips.jsonl` (gitignored).

Entry schema:

```json
{
  "ts": "2026-05-11T14:32:17.482Z",
  "file": "D:\\repos\\foo\\src\\foo.py",
  "function": "foo:42",
  "reason": "pure-leaf reducer — type system enforces",
  "session_id": "f4b9c2e1-23a4-4d12-9c8f-71a3b2e4c5d6",
  "cwd": "D:\\repos\\foo",
  "warning": null
}
```

Fields:
- `ts`: ISO 8601 UTC timestamp с millisecond precision.
- `file`: absolute path с platform-native separator.
- `function`: `<name>:<line>` form (line is 1-indexed).
- `reason`: verbatim suppression reason text (trimmed, no embedded newlines per NFR-S4).
- `session_id`: UUID v4 of Claude Code session (from hook stdin JSON).
- `cwd`: absolute path to git repo root (from hook env CLAUDE_PROJECT_DIR).
- `warning`: `null` OR `"REASON_TOO_SHORT"` if reason had <8 chars after trim.

## Suppression comment marker (detector input grammar)

Two forms recognized — same-line или above-line:

**TypeScript:**

```typescript
// Same-line form
function leafReducer(items: Item[]): number { /* ... */ }  // strong-tests:skip pure-leaf reducer — type system enforces

// Above-line form
// strong-tests:skip pure-leaf reducer — type system enforces
function leafReducer(items: Item[]): number { /* ... */ }
```

**Python:**

```python
# Same-line form
def leaf_reducer(items: list[Item]) -> int:  # strong-tests:skip pure-leaf reducer — type system enforces
    return len(items)

# Above-line form
# strong-tests:skip pure-leaf reducer — type system enforces
def leaf_reducer(items: list[Item]) -> int:
    return len(items)
```

Detector regex (per stack):
- TS: `//\s*strong-tests:skip\s+(.+?)\s*$`
- Python: `#\s*strong-tests:skip\s+(.+?)\s*$`
- C# / .NET: `//\s*strong-tests:skip\s+(.+?)\s*$` (identical syntax to TS — `//` line comment)

**C# additional grammar (v0.3.0):**

```csharp
// Same-line form
public List<WorktreeEntry> BuildIndex() // strong-tests:skip pure-leaf reducer — type system enforces
{
    return new List<WorktreeEntry>();
}

// Above-line form
// strong-tests:skip pure-leaf mapping returning fixed taxonomy values
public Dictionary<string, int> SuggestInvariants(string kind)
{
    // ...
}
```

C# collection return type detection — recognizes these types (regex captured): `List<T>`, `IList<T>`, `IEnumerable<T>`, `IReadOnlyList<T>`, `IReadOnlyCollection<T>`, `IReadOnlyDictionary<K,V>`, `ICollection<T>`, `Dictionary<K,V>`, `IDictionary<K,V>`, `HashSet<T>`, `ISet<T>`, `Queue<T>`, `Stack<T>`, `T[]` (array). Async wrapper `Task<...>` and `ValueTask<...>` are unwrapped to detect the inner collection type.

C# nested loop detection — counts both `for (...)` and `foreach (...)` constructs in body window; ≥2 → `nxm-overlap` kind.

Reason validation:
- Trim leading/trailing whitespace
- Length ≥8 chars → entry written без warning
- Length <8 → entry written с `warning: "REASON_TOO_SHORT"` per NFR anti-gaming guidance

## PostToolUse hook output JSON (Claude Code protocol)

Hook handler `posttool-jit.ts` emits stdout JSON conforming к Claude Code PostToolUse hook protocol:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "JiT auto-trigger: src/indexer.ts:42 — function `buildIndex` returns `WorktreeEntry[]` (collection-returning + N×M overlap). Suggested invariants: cardinality (`len(out) == |unique(worktree_path)|`), uniqueness on `worktree_path`, conservation (`sum(per-repo counts) == len(out)`). Per `.claude/rules/testing/output-invariants-first.md` §\"Class of bug: leaves correct, composition broken\" — write 3 invariant tests inline before reporting ready. To suppress: `// strong-tests:skip <reason ≥8 chars>`."
  }
}
```

Fields:
- `hookSpecificOutput.hookEventName`: literal `"PostToolUse"`.
- `hookSpecificOutput.additionalContext`: free-form string containing detector findings + suggested invariants + suppression instruction.
- AI reads `additionalContext` as part of next message context per Claude Code hook protocol (https://code.claude.com/docs/en/hooks).

## Правила валидации (cont. — JiT)

- `candidates[].line` ≥1; `endLine` ≥ `line`.
- `suppressed[].reasonLength == suppressed[].reason.trim().length` — schema-emit-time consistency check.
- `suppressed[].reasonWarning` MUST be consistent с `reasonLength`: `null` iff ≥8, `"REASON_TOO_SHORT"` iff <8.
- `scanDurationMs` ≥0; values >500 MUST emit additionalContext perf warning per NFR-P4.
- JSONL audit entry: each line MUST be valid JSON parseable by `JSON.parse()`; reason MUST be sanitized (no embedded `\n`/`\r`; embedded chars replaced с U+2028 per NFR-S4).
