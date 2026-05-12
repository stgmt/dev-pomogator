# Invariants Catalogue — detect-invariant-candidates.ts

> Per `strong-tests` skill §2 Pre-write checklist item 1 — **≥5 invariants per public function**. Each invariant пара (production-code property → test guard).
>
> v0.3.0 scope: TS / Python / C# stacks. Test file: `tests/e2e/detect-invariant-candidates-unit.test.ts` (module-import unit tests for Stryker visibility) + `tests/e2e/strong-tests-jit.test.ts` (spawnSync integration tests).

## `detectStack(filePath: string): Stack | null`

| # | Invariant | Test guard |
|---|---|---|
| 1 | **Mapping completeness**: every supported extension maps to exactly one stack (no ambiguity) | `unit.test:detectStack > returns 'ts'/'python'/'csharp'` |
| 2 | **Case insensitivity**: `.CS` → `csharp`, `.TS` → `ts` | `unit.test:detectStack > is case-insensitive on extensions` |
| 3 | **Closed scope**: unknown extensions → `null` (not exception, not default stack) | `unit.test:detectStack > returns null for unknown` |
| 4 | **Empty input safety**: empty string filename → `null` (no crash) | `unit.test:detectStack > returns null for empty filename` |
| 5 | **Determinism**: `detectStack(x)` returns same value on every call (no state) | implicit — multiple test invocations across describe |
| 6 | **No false positives**: `.tsx` → `ts` but `.txt` → `null` (no `.t*` greedy match) | unknown-ext test covers `.txt` explicitly |

## `nestedLoopCount(body: string, stack: Stack): number`

| # | Invariant | Test guard |
|---|---|---|
| 1 | **Stack dispatch**: each stack uses correct regex (Python excludes C-style `for (`) | `unit.test:nestedLoopCount > Python regex does NOT match C-style` |
| 2 | **Conservation**: count = number of actual loop constructs in body | `unit.test:nestedLoopCount > counts ONLY for X in Y for Python` |
| 3 | **Empty body → 0**: no false positives on empty/whitespace | `unit.test:nestedLoopCount > returns 0 for empty body` |
| 4 | **Identifier exclusion**: `informer` does not match `for` substring | `unit.test:nestedLoopCount > does not count for substring inside identifier` |
| 5 | **C# polymorphism**: counts BOTH `for (...)` and `foreach (...)` for csharp | `unit.test:nestedLoopCount > counts both for and foreach for C#` |
| 6 | **Idempotence**: same body → same count on repeat call | implicit (pure function, no state) |

## `suggestInvariants(kind: Candidate['kind'], returnType: string): string[]`

| # | Invariant | Test guard |
|---|---|---|
| 1 | **Always non-empty**: every kind+returnType combo returns ≥2 entries | `unit.test:suggestInvariants > always includes cardinality + uniqueness` |
| 2 | **Base set**: cardinality + uniqueness present in EVERY output | covered by ALL suggestInvariants tests |
| 3 | **Kind→invariant mapping**: nxm-overlap adds conservation; composition-chain adds conservation+monotonicity | unit tests cover each kind explicitly |
| 4 | **ReturnType→invariant mapping**: Dictionary/Map → coverage+no-leak; Iterator/Iterable → idempotence+monotonicity | unit tests cover each returnType branch |
| 5 | **Output bounds**: 2 ≤ length ≤ 5 (taxonomy limit) | implicit via toEqual exact-match assertions |
| 6 | **No duplicates**: invariant strings unique within output | `toEqual([...])` preserves order, duplicates would fail |
| 7 | **Determinism**: same input → same output every call | implicit (pure function) |

## `scan(content: string, stack: Stack): { candidates, suppressed }`

| # | Invariant | Test guard |
|---|---|---|
| 1 | **Conservation**: `suppressed.length + candidates.length ≤ total functions detected` (suppressed are mutually exclusive with candidates) | `unit.test:scan > suppressed function NOT in candidates` |
| 2 | **Suppression scope window**: lookahead bounded to 4 lines below comment | `unit.test:scan > suppression lookahead bounded to i+4 lines` |
| 3 | **Return type window**: return type detection limited to 5 lines from function start | `unit.test:scan > return type window bounded to next 5 lines` |
| 4 | **Body endLine cap**: nested loop scan limited to 40 lines below function start | `unit.test:scan > endLine bounded to 40 lines from function start` |
| 5 | **Line indexing**: all line numbers in output are 1-indexed (matches editor conventions) | `unit.test:scan > suppressed.function string format` + `candidate.line` |
| 6 | **Reason boundary**: reasonLength ≥8 → warning null; <8 → REASON_TOO_SHORT (exact 8 = no warning) | `unit.test:scan > reason boundary tests (7, 8)` |
| 7 | **Orphan suppression safety**: comment without function below → empty suppressed (no crash, no fake entry) | `unit.test:scan > orphan suppression` |
| 8 | **Reason verbatim**: reason string preserved including unicode/punctuation (only outer whitespace trimmed) | `unit.test:scan > reason string preserved verbatim` |
| 9 | **Same-line form**: suppression on same line as function declaration attaches correctly | `unit.test:scan > suppression same-line form` |
| 10 | **Empty input safety**: empty content → empty candidates+suppressed (no crash) | `unit.test:scan > returns empty for empty content` |
| 11 | **Idempotence on stable input**: running scan twice on same content produces equal output | (could add property test — TODO v0.4.0) |

## NFR-R5 (graceful degradation) invariants

| # | Invariant | Test guard |
|---|---|---|
| 1 | **Hook exits 0 on detector subprocess error** | `jit.test:TESTQUAL001_NFR_R5: hook exits 0 when detector errors` |
| 2 | **Hook exits 0 on malformed stdin JSON** | `jit.test:TESTQUAL001_NFR_R5b: malformed stdin doesn't crash` |
| 3 | **Hook never blocks Write\|Edit** (emit-only contract) | implicit — exit code 0 = Claude Code does not block |

## Mutation testing results

Formal Stryker run (npm install @stryker-mutator/core @stryker-mutator/vitest-runner + npx stryker run):

| Iteration | Mutation score | Killed / Survived / NoCov | Δ |
|---|---|---|---|
| 1 (baseline) | 51.08% | 212 / 171 / 33 | — |
| 2 (+10 killer tests) | 56.83% | 236 / 147 / 33 | +5.75pp |

Surviving mutants breakdown (post iteration 2):
- 112 × Regex — character class shuffles inside regex literals (most are equivalent — e.g., reordering items inside `[...]` produces functionally identical regex)
- 11 × Import Guard L202-204 (CLI-only `isDirectRun` check, not exercised by module-import tests by design — equivalent under unit test contract)
- ~24 deeper survivors — see `reports/mutation/mutation.html`

Threshold per Stryker config: break=50%, low=60%, high=80%. Current 56.83% — above break, in low range.

Roadmap (v0.4.0):
- Property-based test (fast-check) for NFR-P4 boundary (scanDurationMs < 500ms on file with 2000 LOC)
- Idempotence PBT (scan twice → identical output)
- Reduce regex mutation surface via splitting into typed sub-patterns (less character-class equivalence noise)
- Failure messages on remaining bare `expect()` calls (per 12-point self-eval item #7)
