---
name: strong-tests
description: >
  Use this skill BEFORE writing any tests OR when user reports
  "тесты слабые / fake-positive / проходят но баги пропускают /
  coverage высокий но mutation score низкий".
  Triggers (RU): "напиши крепкие тесты", "сильные тесты",
  "mutation testing", "переписать тесты сильнее",
  "проверь тесты на крепкость".
  Triggers (EN): "write strong tests", "strengthen tests",
  "mutation-resistant tests", "fix weak tests",
  "no fake-positive tests".
  Skill enforces 12-point self-eval checklist + mutation testing
  feedback loop + property-based testing patterns. Auto-detects
  framework (vitest/jest, pytest, JUnit, xUnit, Go, Rust) from
  project config.
  NOT for: mocking-heavy unit tests, perf benchmarks, e2e UI tests.
argument-hint: "[<test-file-path>] [--mode=greenfield|audit|mutate] [--threshold=70]"
allowed-tools: Read, Write, Edit, Grep, Glob, Bash, AskUserQuestion, Skill
---

# /strong-tests — Mutation-Resistant Test Generation and Audit

## 1. Why this exists

Coverage is a vanity metric. Mutation score and property-based testing (PBT) are what actually measure test strength.

- **Schäfer et al. (arXiv 2406.18181 §3.4)**: 34.44–61.78% of LLM-generated tests are syntactically invalid; 74.99% of undetected defects on average stem from missing inputs (GPT-4 specifically: 14.46%). Line coverage 40.43% vs EvoSuite 78.91%. [https://arxiv.org/html/2406.18181v1]
- **OutSight AI case study**: real reconciliation workflow with 92% line coverage and 140 unit tests silently duplicated line items 2 days after deployment because AI used reference equality on objects, not business-key equality. Worst-case demo: 100% coverage / 4% mutation score. After 3-step LLM↔mutation feedback loop (5min generate / 15min mutate / 10min feed back): 70% → 78%. Recommended thresholds: critical paths ≥70%, standard ≥50%, experimental ≥30%. [https://medium.com/@outsightai/the-truth-about-ai-generated-unit-tests-why-coverage-lies-and-mutations-dont-fcd5b5f6a267]
- **Ghiringhelli on Stryker**: line cov 93.1% vs initial mutation MSI 58.62% (34.4 pp gap). After 3 iterations of targeted assertion strengthening: 93.1% / 93.10%. [https://dev.to/jghiringhelli/the-ai-reported-931-coverage-it-was-34-290k]
- **Meta ACH (engineering.fb.com 2025-09-30)**: trial Oct–Dec 2024 across FB/IG/WhatsApp/Quest/Ray-Ban Meta. Privacy engineers accepted 73% of LLM-generated tests, 36% judged privacy-relevant. Equivalence Detector precision/recall 0.95/0.96 after preprocessing. [https://engineering.fb.com/2025/09/30/security/llms-are-the-key-to-mutation-testing-and-better-compliance/]
- **Anthropic Red Team PBT 2026**: Hypothesis generated 984 bug reports across 100+ Python packages, 56%→86% validity after ranking, 5 patches accepted in NumPy / Lambda Powertools / Tokenizers. Quoted: "if a developer does not think to test an edge case, it is also likely the developer did not consider that case in the implementation". [https://red.anthropic.com/2026/property-based-testing/]
- **Meta JiT Testing 2026-02 (4× bug detection)**: Just-in-Time tests generated **during** code review by LLM + program analysis + mutation testing. Designed to **fail** when regressions exist ("catch" tests, not "harden" tests). Trial across 100M+ LOC Meta codebase. Reports 4× catch generation vs hardening, 20× vs coincidentally failing, 70% human review load reduction. Implication for strong-tests: §6.4 JiT auto-trigger mode applies this — PostToolUse hook on `Write|Edit` production code emits invariant-test suggestions inline at the moment code is written. [https://engineering.fb.com/2026/02/11/developer-tools/the-death-of-traditional-testing-agentic-development-jit-testing-revival/] [https://arxiv.org/abs/2601.22832]

Internal evidence: dev-pomogator's tsx-runner CORE007_04 test passed for months with trivial input (`console.log("OK")`) while real hooks with local imports were broken (commit `97a7c86`). That is the canonical "passes for the WRONG reason" failure mode the 12-point self-eval (item #11 Trivial Input, #12 Self-Challenge) directly catches.

---

## 1.5 Behavioural prior — реактивный vs проактивный workflow

Документ-в-файле **не** становится behavioural prior автоматически. Real-session incident (session-pilot 2026-05-11): тот же агент написал `.claude/rules/testing/output-invariants-first.md` и через 2 часа в той же сессии его нарушил — **2 раунда подряд**, оба раза потребовался пинок пользователя. Полный self-postmortem: `dev-pomogator-session-pilot/.specs/session-pilot/POSTMORTEM-test-discipline.md`. Эта секция (§1.5) и есть **prior-activator** — она загружается с каждым load skill body перед §2 Pre-write checklist.

### Workflow side-by-side

**❌ Реактивный (что делал агент 2 раунда подряд):**

| Шаг | Действие |
|-----|----------|
| 1 | Получил задачу |
| 2 | Написал код |
| 3 | Прогнал сборку / перезапустил сервер |
| 4 | **Доложил «работает»** |
| 5 | (Ожидал что пользователь скажет «ок») |
| 6 | Пинок пользователя |
| 7 | Открыл браузер / реальные данные |
| 8 | Нашёл что не работает |
| 9 | Написал тесты |
| 10 | Починил |

**✅ Проактивный (что должен с раза):**

| Шаг | Действие |
|-----|----------|
| 1 | Получил задачу |
| 2 | **Сформулировал инварианты которые код должен держать** |
| 3 | **Написал тесты на инварианты (negative cases + edge cases)** |
| 4 | Написал код |
| 5 | Прогнал тесты |
| 6 | **Открыл реальные данные / браузер, проверил визуально на 1-2 кейсах** |
| 7 | Если визуальная проверка показала новое → добавил тест, повторил с шага 5 |
| 8 | Только потом доложил |

Разница: шаги 2-3 (инварианты до кода) и шаг 6 (визуальная проверка до доклада). Реактивный workflow систематически жертвует ими ради скорости отгрузки фичи.

### 3 anti-patterns из session-pilot incident (отрицательные образцы)

**A. «Доложил без проверки в реальности».** Агент сказал «работает, открой dashboard» — не открыв сам. Tabulator silently отключил multiselect через console warning, фильтр деградировал до single-select. Урок: перед фразой «работает» — открыть и проверить минимум 1 happy path в реальной среде. Если есть browser MCP / e2e — использовать.

**B. «Happy-path fixture как доказательство покрытия».** Тест MSG_04 с fixture `[user_msg, attachment(text=""), assistant_msg]` → assert все non-empty. Проходил. Но реальные JSONL содержали **другой класс** пустых сообщений (user/assistant с tool_use без text-блоков) — fixture не покрыл, баг уехал в прод. Урок: fixture **должен** включать минимум один экземпляр **каждого** "проблемного" варианта. Если есть реальные данные — fixture строится из их структуры, не из учебной картинки. Если открыл реальный JSONL — выписать **все** встретившиеся типы перед написанием первого теста.

**C. «Реактивная дисциплина — пока не пнут».** Правило `output-invariants-first.md` написано **тем же агентом** в начале сессии, нарушено через 2 часа **без напоминания**. Урок: правило применяется к **следующему действию** агента, не только к контексту где сформулировано. Если skill загружен — он действует по умолчанию до конца сессии.

### Дословные пинки пользователя (parsing examples)

| Пинок | Длина | Что означал |
|---|---|---|
| «тестов нет нихуя не работает» | 7 слов | Двойной упрёк: тестов нет + фича сломана |
| «нажимаю на ласт меседж и нихуя. почему тестов опять нет» | 11 слов | **«опять»** — пользователь распознал паттерн, готов фиксировать как обучающий пример |

После пинка-«опять» — НЕ оправдываться «но 16/16 PASS», а сразу:
1. Открыть реальные данные через MCP / browser / debug-screenshot
2. Выписать классы edge cases которые встречаются реально
3. Написать anti-regression test на класс ошибки который пропустил
4. **Усилить** старые тесты которые этот случай не покрывали (не только добавить новый — обновить fixture старых)
5. Проверить в реальной среде end-to-end до того как сообщить «исправлено»

### Sample dialogue snippets (positive / negative pairs)

3 пары `(user_turn → ai_response_bad / ai_response_good)` в YAML формате для self-reference и supervised fine-tuning датасета — см. `dev-pomogator-session-pilot/.specs/session-pilot/POSTMORTEM-test-discipline.md` §9. Примеры покрывают:

- Snippet 1: реакция на новую задачу (test-first с реальной структурой vs «готово, открой dashboard»)
- Snippet 2: реакция на пинок «тестов нет нихуя не работает»
- Snippet 3: реакция на happy-path fixture incident («почему тестов опять нет»)

### Главный системный вывод

> **Знание правила ≠ применение правила.**
>
> Документ на диске не становится prior автоматически. Skill load обязан активировать behavioural prior на **следующее действие** агента, не только когда explicitly запрошен mutation testing.

Эта секция (§1.5) — physical prior-activator. Загружается **перед** §2 Pre-write checklist в каждой Skill activation path (slash command, semantic match, JiT hook context insertion). См. NFR-U5 в `.specs/strong-tests/NFR.md` для enforcement.

---

## 2. Pre-write checklist (BEFORE writing tests)

Run these four scans before generating a single assertion. Every "No" turns into a missing test category that mutation testing will catch later anyway — fix the gap now to avoid the second loop.

1. **Invariants list (target ≥5)**. For every function under test, write down the structural invariants in plain language. Examples: roundtrip (`deserialize(serialize(x)) === x`), idempotence (`f(f(x)) === f(x)`), commutativity, associativity, identity, monotonicity (sorted output stays sorted), preservation of cardinality, output bounds. Five or more invariants per function is the floor; if you can't find five, the function is doing too much OR you don't understand it yet — read the source again.
2. **Input categories (target ≥3)**. For every parameter, enumerate input categories: typical happy-path value, empty, null/None, very-large, unicode (where String type permits), negative, boundary (min/max), wrong-type (where dynamic dispatch permits). Each FR's tests SHALL cover ≥3 categories. Default to PBT (fast-check / Hypothesis) when ≥4 categories matter — manual enumeration is brittle.
3. **Mutation-equivalent code lines**. Walk through the source code line by line and ask: "if I flipped this `>` to `>=`, would any of my assertions catch it?" If no — write a test that does. Same for: negating an `if`, removing a guard, swapping argument order, hardcoding a return value, deleting a side effect. This is the manual mutation gutcheck — fast, no tool install required.
4. **Framework choice**. TS → vitest + fast-check (PBT) + Stryker (mutation). Python → pytest + Hypothesis + mutmut. For other stacks see [`references/tooling-setup.md`](references/tooling-setup.md). Always prefer PBT for ≥1 invariant per function; example-based for the edge cases PBT cannot reach.

If any of the four scans is empty, you SHALL stop and re-read the production source. Tests written against an unanchored mental model are the source of fake positives.

---

## 3. Multi-framework tooling matrix

Primary (TS + Python — covered in detail below). Other stacks (Java / C# / Go / Rust) — see [`references/tooling-setup.md`](references/tooling-setup.md) for install + run + threshold per stack.

| Stack | Detection signal | Test framework | PBT | Mutation tool | Threshold default |
|-------|-----------------|----------------|-----|---------------|-------------------|
| TypeScript | `package.json` with `vitest` or `jest` in devDeps | vitest / jest | `fast-check` | `@stryker-mutator/core` | 70% |
| Python | `pyproject.toml` with `pytest`; or `setup.py` | pytest | `hypothesis` | `mutmut` | 70% |
| Java | `pom.xml` with `<artifactId>junit-jupiter</artifactId>` | JUnit 5 | `jqwik` | `pitest-maven` (PIT) | see references/ |
| C# / .NET | `*.csproj` with `<PackageReference Include="xunit">` | xUnit / NUnit | `FsCheck` | `Stryker.NET` | see references/ |
| Go | `go.mod` + `*_test.go` files | testing | `gopter` | `go-mutesting` | see references/ |
| Rust | `Cargo.toml` `[dev-dependencies]` | built-in `#[test]` | `proptest` | `cargo-mutants` | see references/ |

### TS detail

```typescript
// PBT example (fast-check): roundtrip invariant
import * as fc from 'fast-check';
import { describe, it } from 'vitest';
import { serialize, deserialize } from './foo.ts';

describe('serialize/deserialize roundtrip', () => {
  it('TESTQUAL_PBT_01: deserialize(serialize(x)) === x for all valid x', () => {
    fc.assert(
      fc.property(fc.record({ id: fc.integer(), name: fc.string() }), (x) => {
        const roundtripped = deserialize(serialize(x));
        return JSON.stringify(roundtripped) === JSON.stringify(x);
      }),
      { numRuns: 1000 }
    );
  });
});
```

Mutation tool invocation:
```bash
npx stryker run
# Output: reports/mutation/mutation.json — JSON parsed by scripts/run-mutation.ts
```

### Python detail

```python
# PBT example (Hypothesis): boundary coverage
from hypothesis import given, strategies as st

@given(st.text(min_size=0, max_size=10000))
def test_tokenize_roundtrip(text):
    tokens = tokenize(text)
    assert detokenize(tokens) == text, f"roundtrip failed for: {text!r}"
```

Mutation tool invocation:
```bash
mutmut run --paths-to-mutate src/foo.py
mutmut results
```

---

## 4. Anti-pattern detection table (audit input)

Eight smells caught by Audit mode. Full BAD/GOOD + grep regexes in [`references/anti-patterns.md`](references/anti-patterns.md).

| # | Pattern | Severity | Grep pattern | Fix |
|---|---------|----------|--------------|-----|
| 1 | PERMISSIVE_MATCHING (`toBeDefined`/`NotNull` only) | MEDIUM (10pt) | `expect\([^)]+\)\.toBeDefined\(\)` | replace with `toEqual({...})` on full shape |
| 2 | ASSERTION_ROULETTE (multiple unlabelled asserts) | MEDIUM (10pt) | `expect\(.*\)\.toBe\(.*\)` × ≥3 in one `it()` | add failure messages OR split into named `it()` |
| 3 | MAGIC_NUMBER (hardcoded constants no rationale) | LOW (5pt) | `\.toBe\(\s*\d{3,}\s*\)` | extract to `const EXPECTED_X = 42` with comment |
| 4 | HAPPY_PATH_ONLY (no negative scenarios) | HIGH (20pt) | absence of `throw\|error\|invalid` in test body | add ≥1 error-path `it()` |
| 5 | TAUTOLOGICAL (recompute expected with same logic) | HIGH (20pt) | matching production formula in assertion | use precomputed expected literal |
| 6 | TRIVIAL_INPUT (e.g., `console.log("OK")` as fixture) | HIGH (30pt) | short input strings ≤10 chars feeding workflow code | use realistic representative input |
| 7 | SILENT_SKIP (`try { ... } catch {}` swallows) | HIGH (20pt) | `catch\s*\([^)]*\)\s*\{\s*\}` | re-throw or assert specific error |
| 8 | MISSING_AWAIT (async call without await) | HIGH (30pt) | `[^a-z]\w+Async\(` not preceded by `await` | add `await`; cross-ref `tests-create-update` rule 10 |

Severity score = 100 − Σ(severity_weight × count_i). Strength rating: ≥85 GOOD, 60-84 FAIR, <60 WEAK.

---

## 5. The 12-Point Self-Eval Checklist

Run as the final step in every mode. Emit Markdown table with PASS/FAIL/N_A + Evidence + Remediation per row.

| # | Item | What to verify |
|---|------|----------------|
| 1 | Mutation gutcheck | Pick one branch, flip its condition, re-run tests, confirm ≥1 test fails. If all pass: tests are not sensitive to the branch. |
| 2 | Assertion specificity | Every `expect` checks exact value, not "not undefined" / "defined" / "truthy". |
| 3 | Negative:positive ratio | Counted negative-path scenarios divided by positive ≥ 1:2. Below = HAPPY_PATH_ONLY anti-pattern. |
| 4 | Error-path coverage | Every documented error condition (HTTP 4xx/5xx, validation failure, timeout) has ≥1 dedicated test. |
| 5 | Invariants list | ≥5 invariants identified per function under test, each with ≥1 test (PBT preferred). |
| 6 | Input boundaries | Tests cover min, max, empty, null/None, very-large, unicode (where applicable). PBT covers automatically. |
| 7 | Failure messages | Every assertion has descriptive message string (3rd argument or chained `.withMessage(...)`). |
| 8 | Round-trip / parallel-impl absence | If a roundtrip exists, it has a test. There is NO parallel-implementation in the test file recomputing the expected value with the production formula. |
| 9 | Parallel-impl absence | Test does NOT import production helpers to compute its own "expected" value (catches TAUTOLOGICAL). |
| 10 | No tautology | Test does not assert `x === x` or pattern-match a value against itself. |
| 11 | No trivial input | Fixture inputs are realistic representatives, not `"OK"`/`""`/`0`/`null`-only. |
| 12 | Self-challenge per assertion | For each `expect`: write one sentence stating "this assertion would FAIL if production code did X". If you cannot write that sentence → weak assertion. |

**Kill-rate-readiness summary** (final line of output):
- `HIGH` = ≥10 PASS AND 0 FAIL on items #1 (mutation gutcheck), #5 (invariants list), #12 (self-challenge)
- `MEDIUM` = 7–9 PASS
- `LOW` = otherwise

---

## 6. Four execution modes

### 6.1 Greenfield mode (new code → strong tests)

Trigger: `$ARGUMENTS` is a path to a source file with no matching test file.

1. Read target source. List functions + signatures.
2. For each function, run Pre-write checklist Step 1 (invariants list ≥5). If invariants exist → mark function for PBT.
3. For each PBT-eligible function: emit fast-check (TS) or hypothesis (Python) property test.
4. For non-PBT functions: emit example-based tests (≥1 happy + ≥1 negative + ≥1 boundary).
5. Assert messages on every `expect` (NFR-U2).
6. Verify negative:positive ratio ≥1:2.
7. Run 12-point self-eval, emit report (Section 5).
8. Optionally invoke mutation tool via `scripts/run-mutation.ts` for verification (NFR-P1: if estimated >2min, instruct caller to use `run_in_background: true`).

### 6.2 Audit mode (existing tests → strength score)

Trigger: `$ARGUMENTS` is a path to a test file or directory.

1. Read every `*.test.ts` / `*_test.py` / similar in target.
2. For each file run the 8 anti-pattern greps from Section 4.
3. Compute strength score per file: `100 − Σ(severity_weight × count_i)`.
4. Emit Compliance Report table: file × pattern × line × BAD snippet × GOOD replacement × self-eval item violated.
5. Run 12-point self-eval over audit findings.
6. Emit ranked backlog (weakest first).

### 6.3 Mutation-feedback loop (iterate until threshold)

Trigger: `$ARGUMENTS` contains `--mutate` OR user prompt mentions "mutation testing" / "mutation-resistant".

1. Auto-detect stack via `scripts/run-mutation.ts`. If no mutation tool found → `AskUserQuestion` between (a) install command, (b) AI-driven manual mutation per `references/anti-patterns.md` Catalogue.
2. Set max-iter (default 5). Set threshold (default 70 unless user overrides).
3. Iteration N=1:
   - Invoke mutation tool subprocess. If estimated >2min → `run_in_background: true` + `tee` log per NFR-P1.
   - Parse killRate + survivors.
   - If killRate ≥ threshold → emit success report + 12-point self-eval + STOP.
   - For each survivor: emit proposed test via Edit. Flag `[EQUIVALENT_SUSPECT]` for cosmetic/dead-code diffs.
4. N++. If N > max-iter → emit `[GAP]` report listing remaining survivors with rationale + 12-point self-eval + STOP.

### 6.4 JiT (Just-in-Time) auto-trigger mode (FR-7)

Trigger: **PostToolUse hook** on `Write|Edit` of production code files. Registered in `extensions/test-quality/extension.json` per array-with-nested-hooks format per `.claude/rules/gotchas/installer-hook-formats.md`. Matchers (v0.1.0): `*.ts` / `*.py`; excludes `*test*` / `__tests__` / `tests/` / `*.test.ts` / `*_test.py` / `*.feature` / `*.md`.

**Что детектит** (через ast-grep):

- **Function returning Collection<T>**: signature с return type `list[X]` / `dict[K,V]` / `Array<T>` / `T[]` / `Set<T>` / `pd.DataFrame` / `Iterator[X]`.
- **N×M nested loop**: `for x in A: for y in B:` (Python) или nested `for (...)` (TS) где A и B могут пересекаться (file paths, IDs, URLs — где duplicates приходят естественно).
- **Function composition chain**: функция вызывает ≥2 других функций возвращающих коллекции последовательно (e.g., `discover_repos() → git_worktree_list() → assemble_rows()`).

**Что делает hook** при обнаружении hits:

1. Эмитит `additionalContext` JSON в stdout per Claude Code PostToolUse protocol с file path + suspicious function names с line numbers + suggested invariants (cardinality / uniqueness / conservation per `.claude/rules/testing/output-invariants-first.md` taxonomy)
2. AI читает context и либо:
   - (a) invokes `/strong-tests <path>` explicitly,
   - (b) пишет invariant тесты inline как часть текущей задачи per §1.5 behavioural prior
3. Hook **emit-only** — Write|Edit никогда не блокируется (NFR-R5 graceful degradation)

**Meta JiT principle** (engineering.fb.com 2026-02 + arXiv 2601.22832): тесты создаются **в момент** написания кода, designed to **fail** при нарушении инварианта. 4× catch generation rate vs hardening tests; 70% human review load reduction.

**Python cold-start shortcut**: для Python кода — Greenfield mode (§6.1) сначала запускает `hypothesis write <function>` (Ghostwriter — секунды, auto-detects roundtrip/idempotence/commutativity/array-shape) как **первый шаг** перед manual invariants list. Снижает blank-page paralysis. Для TS — manual fast-check (нет ghostwriter аналога).

**Suppression** (escape hatch per `scope-gate` analogous pattern):

```typescript
// strong-tests:skip pure-leaf reducer — type system enforces  ← above-line form (TS)
function leafReducer(items: Item[]): number { /* ... */ }

function quickHash(x: number): number { /* ... */ }  // strong-tests:skip mathematical pure func  ← same-line form (TS)
```

```python
# strong-tests:skip pure-leaf reducer — type system enforces  ← above-line form (Python)
def leaf_reducer(items: list[Item]) -> int:
    return len(items)

def quick_hash(x: int) -> int:  # strong-tests:skip mathematical pure func  ← same-line form
    return x * 31
```

Audit log: `.claude/logs/strong-tests-skips.jsonl` per `.claude/rules/scope-gate/escape-hatch-audit.md` analog. Reason ≥8 chars → entry без warning; <8 → entry с `warning: "REASON_TOO_SHORT"` + additionalContext audit note. Schema: `.specs/strong-tests/strong-tests_SCHEMA.md` §"strong-tests-skips.jsonl audit log".

**Anti-gaming** (per §"Anti-халява invariants" hard-NO #5 ниже + scope-gate guidance): не использовать suppression для:

- Bypass потому что skill «медленный» — open issue, не игнорируй gate
- Ship noted concerns без resolution — резолви до commit
- Repeated suppress на ту же функцию без изменений — фикс действительно нужен
- Reason без substance: "skip" / "ok" / "fix" / "yes" — reviewer не сможет audit

Legitimate use cases:
- Pure-leaf функции (`add(a, b)`, `parseISO8601(s)`) — invariants тривиальны
- Generated code где variant matrix duplicates source-of-truth schema
- Refactor с семантической эквивалентностью (extracted helper, preserved membership)
- Explicit deferred (`covered in follow-up spec spec-XXX`)

**Detection scope** (v0.1.0): TypeScript + Python через ast-grep catalog. C# / Go / Rust — roadmap.

---

## 7. Verbatim prompt templates (copy-paste ready)

### Template A — Greenfield TS

```
/strong-tests src/foo.ts

Mode: Greenfield. Stack: TS+vitest+fast-check. Target file: src/foo.ts.

Tasks:
1. List structural invariants for each exported function (≥5 each).
2. Emit a vitest test file at tests/foo.test.ts:
   - one fast-check property test per invariant
   - example-based tests covering happy/negative/boundary categories
   - every assertion has a descriptive failure message
   - negative:positive ratio ≥1:2
3. Run the 12-point self-eval and append the report.
4. (Optional) Invoke npx stryker run via run-mutation.ts to verify ≥70% kill rate.
```

### Template B — Greenfield Python

```
/strong-tests src/parser.py

Mode: Greenfield. Stack: Python+pytest+Hypothesis. Target file: src/parser.py.

Tasks:
1. List structural invariants for each function (≥5 each).
2. Emit tests/test_parser.py:
   - one Hypothesis property test per invariant with explicit input strategies
   - example-based tests for min/max/empty/None/very-large/unicode boundaries
   - assert messages on every assertion
3. Run the 12-point self-eval and append the report.
4. (Optional) Invoke mutmut run via run-mutation.ts to verify ≥70% kill rate.
```

### Template C — Audit existing tests

```
/strong-tests tests/legacy/

Mode: Audit. Target: tests/legacy/ directory.

Tasks:
1. Grep each test file for the 8 anti-patterns (PERMISSIVE_MATCHING, ASSERTION_ROULETTE,
   MAGIC_NUMBER, HAPPY_PATH_ONLY, TAUTOLOGICAL, TRIVIAL_INPUT, SILENT_SKIP, MISSING_AWAIT).
2. Compute strength score per file (0–100).
3. Emit a ranked Compliance Report: file × pattern × line × BAD snippet × GOOD replacement
   × 12-point self-eval item violated.
4. Run the 12-point self-eval over the audit findings.
5. Output a prioritized backlog (weakest first) with concrete remediation tasks.
```

### Template D — Mutation-feedback loop

```
/strong-tests src/auth/totp.ts --mode=mutate --threshold=80

Mode: Mutation-feedback. Target: src/auth/totp.ts. Threshold: 80%.

Tasks:
1. Auto-detect mutation tool via scripts/run-mutation.ts. If missing → ask via
   AskUserQuestion: install command vs AI-driven manual mutation fallback.
2. Run Stryker (TS) / mutmut (Python). Parse killRate + survivors.
3. Loop while killRate < 80% AND iter ≤ 5:
   - For each survivor: emit a targeted test killing that mutant.
   - Re-run mutation tool.
4. On max-iter without meeting threshold: emit [GAP] report listing remaining
   survivors with rationale (e.g., [EQUIVALENT_SUSPECT: mathematically identical]).
5. Run the 12-point self-eval. Output Kill-rate-readiness summary.
```

---

## 8. Anti-халява invariants (4 hard-NOs)

These are non-negotiable. If your output violates any, redo before submitting.

1. **NO emitting tests without running the 12-point self-eval.** The self-eval is the deliverable, not an optional appendix. Skipping it means the user has no audit trail proving each assertion was challenged.
2. **NO coverage as proof of strength.** Coverage metrics (line / branch / statement %) are NEVER reported as evidence the tests are strong. Only mutation kill rate or PBT pass-with-1000-runs is acceptable.
3. **NO equivalent-mutant silent skip.** If a survivor is suspected equivalent, mark it `[EQUIVALENT_SUSPECT: <rationale>]` and flag for human review. Do not delete it from the survivors list to inflate kill rate.
4. **NO blocking the session on mutation runs.** If estimated runtime >2min: instruct caller to use `run_in_background: true` with `tee` persistent log per `.claude/rules/pomogator/no-blocking-on-tests.md`. The skill MUST emit progress lines for runs >30s (NFR-U1).
5. **NO доклад «работает» без визуальной проверки в реальной среде.** Per §1.5 behavioural prior: если фича UI / dashboard / TUI / browser-rendered / file-system-rendered — обязательно открыть в реальной среде (browser MCP / debug-screenshot / curl + parse / реальный fixture с production-like структурой) **до** того как сообщить пользователю «готово» или «работает». Unit-тесты 16/16 PASS — недостаточное доказательство. Anti-pattern A из session-pilot incident (2026-05-11): Tabulator silently degraded multiselect → single-select; 16/16 PASS, но фильтр не работал в браузере. Перед фразой «работает» — минимум 1 happy path в реальной среде, end-to-end. Если нет browser / debug-screenshot доступа — явно сказать пользователю «unit-тесты зелёные, визуальная проверка не доступна, прошу подтвердить руками».

---

## Related Skills

- **`tests-create-update`** — write-time anti-pattern prevention (16 anti-patterns, BAD/GOOD assertion table). Invoke this skill BEFORE writing new tests. `strong-tests` is its post-write counterpart: where `tests-create-update` prevents bad assertions from being written, `strong-tests` verifies the resulting test suite actually catches bugs through mutation testing + PBT + the 12-point self-eval. Two distinct skill surfaces; both should be used together for new test work.
- **`dedup-tests`** — jscpd-based code-duplication detection for tests. Use AFTER `strong-tests` if mutation-feedback iterations introduced repetitive setup patterns. Not a substitute for either.
- **`run-tests`** — centralized test runner with statusline + TUI monitoring. Use `/run-tests` (NOT raw `npm test` / `pytest`) when invoking the test suite from within this skill's workflow per `.claude/rules/tui-test-runner/centralized-test-runner.md`.

## References

- [`references/anti-patterns.md`](references/anti-patterns.md) — 8 anti-patterns full detail + honnibal-style 8-category AI-driven mutation catalogue
- [`references/tooling-setup.md`](references/tooling-setup.md) — install + run + threshold per stack (6 stacks)
- [`scripts/run-mutation.ts`](scripts/run-mutation.ts) — auto-detect stack + dispatch Stryker/mutmut subprocess + standardized JSON output

## Empirical sources

- Schäfer et al. arXiv 2406.18181 — LLM test invalidity rates
- OutSight AI medium — coverage-vs-mutation case study
- Ghiringhelli DEV.to — Stryker line-cov vs MSI gap
- Meta ACH engineering.fb.com 2025-09-30 — LLM↔mutation feedback at scale
- Anthropic Red Team red.anthropic.com 2026 — Hypothesis bug-report production
- honnibal/claude-skills (mutation-testing.md.txt + hypothesis-tests.md.txt) — AI-driven manual mutation catalogue (credited)
