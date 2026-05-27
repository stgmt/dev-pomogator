# Anti-Patterns Reference

> Loaded on-demand by `strong-tests` skill in Audit mode (Section 6.2 of SKILL.md) and Mutation-feedback fallback (Section 6.3).
>
> See also: `.claude/skills/tests-create-update/SKILL.md` for write-time prevention of these same patterns. Rule 10 in `tests-create-update` covers `MISSING_AWAIT` specifically.

## Part A — 8 anti-patterns to detect in existing tests

### 1. PERMISSIVE_MATCHING — `toBeDefined()` / `NotNull` only

**Severity:** MEDIUM (10pt). **Frequency in audited code:** very high — 33 occurrences in dev-pomogator + 20+ in ZohoIntegrationClient per `.specs/tests-create-update/RESEARCH.md`.

**BAD:**
```typescript
const result = await fetchUser(42);
expect(result).toBeDefined();
expect(result.name).toBeTruthy();
```

`toBeDefined()` passes for `null`, `0`, `""`, `false`, `{}`, wrong-shape objects. `toBeTruthy()` passes for any non-falsy value. Neither catches a regression that returns the wrong shape.

**GOOD:**
```typescript
const result = await fetchUser(42);
expect(result).toEqual({ id: 42, name: 'Alice', email: 'alice@example.com' });
```

Exact-match assertion catches any shape regression.

**Grep regex (ripgrep):**
```
expect\([^)]+\)\.(toBeDefined|toBeTruthy|toBeFalsy|not\.toBeNull)\(\)
```

**Self-eval items violated:** #2 (Assertion specificity), #12 (Self-challenge).

---

### 2. ASSERTION_ROULETTE — multiple `expect` without messages

**Severity:** MEDIUM (10pt). **Reference:** Ouédraogo et al. arXiv 2410.10628 — "Assertion Roulette" named as the dominant smell in LLM-generated tests.

**BAD:**
```typescript
it('processes order', () => {
  const result = process(order);
  expect(result.status).toBe(200);
  expect(result.items.length).toBe(3);
  expect(result.total).toBe(150);
  expect(result.tax).toBe(15);
});
```

If test fails, vitest reports only the line — not the conceptual "which check failed?". Mixing four conceptually distinct asserts in one `it()` makes failures undiagnosable.

**GOOD:**
```typescript
it('processes order — returns HTTP 200', () => {
  const result = process(order);
  expect(result.status, 'order status should be 200 OK').toBe(200);
});

it('processes order — returns 3 line items', () => {
  const result = process(order);
  expect(result.items, 'order should have 3 items').toHaveLength(3);
});
// ...
```

Split into named `it()` per logical assertion OR add a failure message string as the 2nd argument to each `expect`.

**Grep regex:**
```
\bexpect\([^)]+\)\.(toBe|toEqual)\([^,)]+\)\s*$
```
(matches `expect(...).toBe(value)` without a 2nd argument or chained `.withMessage()`)

**Self-eval items violated:** #7 (Failure messages).

---

### 3. MAGIC_NUMBER — hardcoded constants no rationale

**Severity:** LOW (5pt).

**BAD:**
```typescript
expect(taxRate).toBe(0.0875);
expect(retryDelay).toBe(2500);
expect(httpResp.code).toBe(418);
```

Future maintainers see `0.0875` and cannot tell if it's the rate, an error, or a placeholder.

**GOOD:**
```typescript
const CA_SALES_TAX_RATE = 0.0875;  // California state + Alameda county, 2026-01-01
expect(taxRate, `should match CA sales tax (8.75%)`).toBe(CA_SALES_TAX_RATE);
```

**Grep regex:**
```
\.(toBe|toEqual)\(\s*-?\d{3,}\.?\d*\s*\)
```

**Self-eval items violated:** #2 (Assertion specificity).

---

### 4. HAPPY_PATH_ONLY — no negative scenarios

**Severity:** HIGH (20pt). **Reference:** Schäfer arXiv 2406.18181 §3.4 — 74.99% of undetected defects from missing inputs.

**BAD:** Test file has 12 `it()` blocks. Searching for `throw`, `error`, `invalid`, `should reject`, `should fail` — 0 matches.

**GOOD:** ≥1 `it()` block per error condition documented in the source. For HTTP handlers: ≥1 test per documented error code (4xx, 5xx). For validators: ≥1 test per validation rule.

**Detection heuristic:** count `it()` blocks. Count those whose body or description mentions `throw|error|invalid|reject|fail|404|400|500`. If ratio <0.33 (negative:positive <1:2) → HAPPY_PATH_ONLY.

**Self-eval items violated:** #3 (Negative:positive ratio), #4 (Error-path coverage).

---

### 5. TAUTOLOGICAL — recompute expected with same logic

**Severity:** HIGH (20pt). **Reference:** Mark Seemann + Randy Coulman blog posts on parallel-implementation smell.

**BAD:**
```typescript
// production code: src/discount.ts
export const calculateDiscount = (price: number, pct: number) => price * (pct / 100);

// test
import { calculateDiscount } from '../src/discount.ts';
it('calculates discount', () => {
  const price = 100, pct = 15;
  const expected = price * (pct / 100);  // recomputing!
  expect(calculateDiscount(price, pct)).toBe(expected);
});
```

The test will pass even if `calculateDiscount` is replaced by `(price, pct) => price * pct / 100` — same bug applied to both sides.

**GOOD:**
```typescript
it('15% off 100 should be 15', () => {
  expect(calculateDiscount(100, 15)).toBe(15);
});

it('0% off any price should be 0', () => {
  expect(calculateDiscount(999, 0)).toBe(0);
});
```

Use precomputed expected values that you would write on paper.

**Grep regex:** complex; manual review. Heuristic: import statement pulling production helpers into the test for "expected value" computation.

**Self-eval items violated:** #9 (Parallel-impl absence).

---

### 6. TRIVIAL_INPUT — toy fixture against complex pipeline

**Severity:** HIGH (30pt). **Reference:** dev-pomogator's tsx-runner CORE007_04 incident — test passed with `console.log("OK")` while real hooks broke (commit `97a7c86`).

**BAD:**
```typescript
it('CORE007_04: tsx-runner executes hook successfully', () => {
  const result = spawnSync('node', ['tsx-runner.js', 'console.log("OK")']);
  expect(result.status).toBe(0);
});
```

`console.log("OK")` is not a hook. It does not exercise the strip-types resolver, the local import path, or any failure mode. Passing this test gives false confidence that real hooks work.

**GOOD:**
```typescript
it('CORE007_04: tsx-runner executes hook with local imports', () => {
  const hookPath = path.join(fixturesDir, 'real-hook-with-local-import.ts');
  // hookPath imports from './hook-utils.ts' (the real failure mode)
  const result = spawnSync('node', ['tsx-runner.js', hookPath]);
  expect(result.status, 'real hook should succeed').toBe(0);
  expect(result.stdout, 'hook should emit expected output').toContain('HOOK_OK_TOKEN');
});
```

**Grep heuristic:** test fixtures shorter than 10 characters fed into workflow-level code (spawnSync, eval, exec, runProgram, etc.).

**Self-eval items violated:** #11 (No trivial input), #12 (Self-challenge — "would this test fail if production were replaced by 'return 0'? — yes! that means trivial input").

---

### 7. SILENT_SKIP — catch-and-swallow exceptions

**Severity:** HIGH (20pt).

**BAD:**
```typescript
it('handles network errors', async () => {
  try {
    await fetchUser(invalidId);
  } catch (e) {
    // ignore — we expect this to fail
  }
});
```

Test passes whether `fetchUser` throws the right error, the wrong error, no error at all, or hangs forever.

**GOOD:**
```typescript
it('rejects with NotFoundError for invalid id', async () => {
  await expect(fetchUser(invalidId)).rejects.toThrow(NotFoundError);
});
```

**Grep regex:**
```
catch\s*\([^)]*\)\s*\{\s*(\/\/[^\n]*\n\s*)*\}
```

**Self-eval items violated:** #4 (Error-path coverage), #2 (Assertion specificity).

---

### 8. MISSING_AWAIT — async call without await

**Severity:** HIGH (30pt). **Cross-ref:** `.claude/skills/tests-create-update/SKILL.md` rule 10 (write-time prevention).

**BAD:**
```typescript
it('saves user to db', () => {
  const result = saveUserAsync(user);  // returns Promise, not awaited
  expect(result.id).toBeDefined();      // result is Promise, .id is undefined
});
```

Test passes because `result.id` is undefined and... wait, this should fail. But `toBeDefined()` (per anti-pattern #1) might let it through. With `MISSING_AWAIT + PERMISSIVE_MATCHING` combined the test passes for completely wrong reasons.

**GOOD:**
```typescript
it('saves user to db', async () => {
  const result = await saveUserAsync(user);
  expect(result).toEqual({ id: expect.any(Number), name: user.name, createdAt: expect.any(Date) });
});
```

**Grep regex:**
```
[^a-zA-Z_]\w+Async\(  (* not preceded by `await` or `return` on same line *)
```
or pytest equivalent for `asyncio.run` missing in async test funcs.

**Self-eval items violated:** #2 (Assertion specificity), #12 (Self-challenge).

---

## Part B — honnibal-style 8-category mutation catalogue

> Source: `honnibal/claude-skills/mutation-testing.md.txt` (verified via gh API 2026-05-10). Used as fallback when no mutation tool (Stryker / mutmut / etc.) is installed — the AI applies one mutation at a time via Edit + re-runs tests + reverts via git checkout.

| # | Category | Action | Diagnostic quality |
|---|----------|--------|--------------------|
| 1 | DELETE_SIDE_EFFECT | Remove a `console.log`, `metric.emit`, `cache.set`, `db.write` call | Clear — if test passes, the side effect was unverified |
| 2 | NEGATE_CONDITION | `if (x > 0)` → `if (x <= 0)`; flip every conditional one at a time | Clear |
| 3 | CHANGE_BOUNDARY | `x > 0` → `x >= 0`; `i < n` → `i <= n`; off-by-one | Indirect — boundary tests catch only some |
| 4 | HARDCODE_RETURN | `function foo() { ... }` → `function foo() { return null }` (or 0 / `[]`) | Clear |
| 5 | DELETE_GUARD | Remove `if (!x) throw new Error(...)` guard | Clear — guard tests are mandatory |
| 6 | CHANGE_OPERATOR | `+` → `-`; `&&` → `||`; `===` → `!==`; one operator at a time | Clear or Cascading depending on context |
| 7 | MODIFY_DEFAULT | `function foo(x = 1)` → `function foo(x = 0)`; flip default values | Indirect |
| 8 | SWAP_ARGUMENT_ORDER | `f(a, b, c)` → `f(b, a, c)`; one swap at a time | Clear when args differ in type |

**Workflow:**
1. Pick one source file. List mutations by category.
2. Apply ONE mutation via Edit.
3. Run tests: `npm test` / `pytest` / equivalent.
4. If tests still PASS → that mutation is uncaught → write a test that fails on the mutation.
5. Revert mutation: `git checkout HEAD -- <file>`.
6. Repeat until ≥70% of the listed mutations are caught.

**Diagnostic quality rating:**
- `Clear` — failed test directly names the broken assertion. Easy to act on.
- `Indirect` — failure happens downstream; trace from failing test back to mutation point.
- `Cascading` — one mutation breaks 10+ tests; suggests over-coupled tests or under-isolated production code.

**Credits:** Catalogue + diagnostic-quality rating verbatim from honnibal/claude-skills `mutation-testing.md.txt`. Extended to multi-stack by `strong-tests`.
