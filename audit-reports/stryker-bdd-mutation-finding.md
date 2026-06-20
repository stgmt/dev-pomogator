# Finding: can Stryker mutation-test BDD (cucumber) scenarios, and can BDD replace the vitest mutation surface?

**Date:** 2026-06-20
**Trigger:** owner request — "make Stryker track BDD tests, default for all users, automate hard at all levels." Motivated by the BDD-migration finding that `detect-invariant-candidates-unit.test.ts` must stay vitest *because Stryker's `--related` traces vitest, not cucumber* (so BDD-only-covered code gets no mutation protection).

---

## ⚠️ UPDATE 2026-06-20 (W1) — the official cucumber-runner SUPERSEDES the PoC conclusion below

The PoC (command-runner) conclusion ("BDD weak ~20%, slow 2.5h, cannot replace vitest") was **a measurement artifact**. Re-run with the OFFICIAL `@stryker-mutator/cucumber-runner` + `coverageAnalysis:'perTest'` + `concurrency:'100%'` on the SAME file [cmd:npx stryker run stryker.bdd.config.mjs → reports/mutation-bdd/mutation.json]:

| Metric | PoC (command-runner) | **Official cucumber-runner (perTest, 24 cores)** |
|---|---|---|
| Time (788 mutants) | ~2.5h (serial) | **13 min** (~11× faster; ignoreStatic would cut more — 331 static = 67% of time) |
| Mutation score | "~20%" (first-20 sample, exit-code-only) | **79.25%** (killed 568, survived 10, **noCoverage 139**, timeout 1, runtimeErr 23) |
| Of COVERED mutants | — | **~98% killed** (568 / 579) |

**Corrected conclusions:**
1. **The BDD scenarios are NOT coarse/weak.** Where a scenario reaches the code, it kills ~98% of mutants — TIGHTER than vitest's ~52% on this file. The PoC's "20%" was the command-runner (no per-test coverage, exit-code only) sampling the first ~20 mutants (unrepresentative static regex consts).
2. **The real weakness is COVERAGE GAPS, not assertion granularity.** 139 NoCoverage mutants sit in branches the 6 `@feature7` scenarios never exercise — Python `for-in` detection (L120), return-type branches (L80-82), composition-chains. So **W4's fix is to ADD scenarios for the uncovered branches**, NOT to rewrite `.includes`→`.toEqual` (the assertions are already tight).
3. **Speed is solved by the runner + parallelism**, not by narrowing — exactly the owner's instinct. cucumber-runner loaded the tsx step-defs fine (`testRunnerNodeArgs:['--import','tsx']`); dry-run 6 scenarios in 12s.
4. `detect-invariant-candidates-unit.test.ts` could in principle move to BDD once the 139-gap is closed — but **not urgent**; revisit at L1, do not blind-delete.

### W4 action — the SPECIFIC missing scenarios (from reading the NoCoverage lines)

The 139 NoCoverage mutants cluster in three branches the 6 `@feature7` scenarios never exercise
[ref:.claude/skills/strong-tests/scripts/detect-invariant-candidates.ts]:
1. **`suggestInvariants` Dict/Map branch** [ref:detect-invariant-candidates.ts:80] — a function whose
   returnType matches `dict|Map|Dict` → invariants `coverage`+`no-leak`. No scenario passes a Map-returning function.
2. **`suggestInvariants` Iterator/Iterable branch** [ref:detect-invariant-candidates.ts:81] → `idempotence`+`monotonicity`.
3. **`nestedLoopCount` Python `for-in`** [ref:detect-invariant-candidates.ts:120] + **Python indent-based
   `findFunctionEndLine`** [ref:detect-invariant-candidates.ts:148] — a Python function with nested
   `for … in …` loops → `nxm-overlap`. The existing Python scenario (TESTQUAL001_07) only tests suppression.

So W4 = author ONE scenario per branch (in-process `scan()` + `suggestInvariants` assertions, the tight
style already proven at ~98% kill), then re-run `npm run mutation:bdd` and confirm the NoCoverage count
(and the score) climbs. NOT "rewrite `.includes`→`.toEqual`" — the assertions are already tight.

### W4 RESULT — full re-measure after the 3 added scenarios (2026-06-20)

Re-ran the full file after adding TESTQUAL001_34/35/36 [cmd:npm run mutation:bdd → reports/mutation-bdd/mutation.json; host, 14m46s]:

| Metric | W1 (6 scenarios) | **W4 (+3 coverage scenarios)** |
|---|---|---|
| **Total mutation score** | 79.25% (→80.87% w/ id fix) | **82.82%** |
| **Of COVERED mutants** | ~98% | **94.88%** |
| NoCoverage (the coverage gap) | **139** | **91** (↓48 — the 3 scenarios closed ~48 uncovered mutants) |
| killed / timeout / survived / errors | 568 / 1 / 10 / 23 | **592 / 1 / 32 / 25** |

**Conclusions confirmed by real numbers:**
1. **Target massively exceeded.** The ≥45% goal (FR-4 hypothesis) is met at **82.82% total** — and the hypothesis "BDD is weak" is refuted: covered-score **94.88%** means where a scenario reaches the code it kills ~95% of mutants.
2. **The diagnosis was right.** Adding scenarios for uncovered branches (not rewriting assertions) is what moved the needle — NoCoverage fell 139→91 and total score rose ~3.5pts. The remaining 91 NoCoverage are deeper branches (further coverage work, not assertion tightening).
3. **The 32 survivors must be TRIAGED, not blindly chased — some are equivalent mutants.** Investigated the `findFunctionEndLine` Python-EOF fallback [ref:detect-invariant-candidates.ts:160] `return Math.min(lines.length - 1, startLine + fallbackOffset)`: the two survivors there (`Math.min`→`Math.max`, `length - 1`→`length + 1`) are **equivalent mutants**. The fallback only fires when a Python function runs to EOF, so `startLine + 40` already exceeds the file length; the result feeds `lines.slice(i, endLine + 1)` [ref:detect-invariant-candidates.ts:289], and `Array.prototype.slice` **clamps** an over-large end index — so over-counting `endLine` yields an identical body slice and is unobservable [cmd:node -e slice-clamp proof → body(orig)==body(max)? true; body(orig)==body(+2)? true]. No test can kill them. The honest move per strong-tests §6.5 is to triage survivors into (a) equivalent (annotate / `// Stryker disable` with rationale) vs (b) genuinely-killable (add a tight branch-reaching scenario) — NOT to author impossible tests against equivalent mutants. The remaining survivors need the same per-mutant triage before counting them as "test debt".
4. **Speed solved on the host too** — 14m46s for 741 mutants without Docker; perTest + 100% concurrency is the lever, exactly as designed.

### W4 survivor triage (all 32, from reports/mutation-bdd/mutation.json)

| Lines | Mutants | Class | Verdict |
|---|---|---|---|
| 120/122/151/156 | 14 × Regex | Stryker Regex-mutator | Likely-equivalent (Regex mutator tweaks regex internals; high equivalent rate — also the reason the skill-mutation config reverted the Regex mutator). Needs per-regex review; do not count as test debt yet. |
| 160:12, 160:21 | 2 (min→max, ±1) | Python EOF-fallback | **Proven equivalent** — `Array.slice` clamps over-large end [cmd above]. Annotate, don't chase. |
| 148/150/153/155/158 | ~12 (Block/Logical/Conditional/Equality/Method/StringLiteral) | Python indent-loop | Mixed — the `indent <= startIndent` boundary (153/155/158) may be killable with a Python fixture that de-indents at an exact column; needs a targeted scenario. |
| 71:7, 81:7 | 2 × ConditionalExpression | suggestInvariants Map/Iterator branch | Possibly killable by tightening the W4 scenarios TESTQUAL001_34/35 (assert exact invariant arrays per branch). |
| 123:38 | 1 ArrayDeclaration | suggestInvariants array | Possibly killable (assert exact array). |
| 299:20 | 1 StringLiteral | composition-chain rationale | **KILLED** (commit d99682d) — tightened TESTQUAL001_11 to assert the rationale text; proven via inject+restore. |

So the honest survivor picture is **not** "32 weak tests": 14 Regex + 2 slice-clamp are equivalent/likely-equivalent (~half), 1 killed, and ~15 are real targets for tighter/branch-reaching scenarios (the strong-tests §6.5 backlog). Driving those down is incremental scenario work, not an assertion-rewrite sweep.

### ⚠️ Flakiness finding — the aggregate score is NON-DETERMINISTIC under concurrency:100%

The post-kill confirm-run (commit d99682d, a **purely additive** +9/−0 assertion that can only kill MORE, never fewer [cmd:git show d99682d --numstat → 9 0]) returned a WORSE aggregate, not better:

| Run | total | covered | killed | survived | no-cov | errors | time |
|---|---|---|---|---|---|---|---|
| W4 re-measure | conc 100% | 82.82% | 94.88% | 592 | **32** | 91 | 25 | 14m46s |
| post-kill confirm (additive-only change) | conc 100% | 77.90% | 89.26% | 556 | **67** | 91 | 26 | 10m27s |
| determinism probe (lower-concurrency) | **conc 6** | 68.39% | 78.37% | 488 | **135** | 91 | 26 | 15m39s |

A +9/−0 test change CANNOT raise the survivor count by 35 — so the swing is **run-to-run nondeterminism** in the cucumber-runner + `coverageAnalysis:perTest` measurement. **The lower-concurrency hypothesis is REFUTED:** `--concurrency 6` made it WORSE (135 survived), not stable — so it is NOT resource contention from high parallelism. The diagnostic shape: **NoCoverage is rock-stable at 91 across all three runs** while killed/survived swing wildly (592/556/488 killed) — so the perTest **coverage map is deterministic**; it's the per-mutant **kill OUTCOME** that flakes (the same covering scenario kills a mutant in one run and lets it survive in another). That points to **order/state-dependent scenario outcomes** — most likely the module-level shared `world` in `tests/step_definitions/feature_strong_tests.ts` leaking state across scenarios when the runner reorders/reschedules them (hypothesis, not yet proven — the next investigation). What IS deterministic and confirmed in every run: **299:20 is killed** [cmd:node mutation.json scan → 299 still survives? false].

**Implication for FR-2 ("automate hard, default-on"):** the aggregate BDD mutation *score* is NOT a stable blocking-gate metric — it ranged 68–83% / 32–135 survivors across three runs of essentially identical code, and concurrency tuning does NOT fix it. A reliable BDD mutation gate needs the **kill-outcome determinism** fixed first (isolate per-scenario state so a scenario's pass/fail doesn't depend on run order), OR the gate must be built on the **deterministic inject+restore unit** (output-invariants-first) rather than the aggregate — that, not the flaky score, is the trustworthy unit of "did this scenario get stronger". This corrects the earlier W4 "82.82% confirmed" framing: 82.82% was the LUCKIEST of three samples of a noisy metric, not a fixed number.

Everything below is the SUPERSEDED PoC record (kept for history).

---

## What was built (proof-of-concept)

- `stryker.bdd.config.mjs` — Stryker's built-in **`command` test runner** (no plugin; `@stryker-mutator/core` ships it) running cucumber via `cucumber.bdd-mutation.json`, `coverageAnalysis: 'off'`, `concurrency: 1` (command writes a fixed temp path → parallel runs would race it → fake-green kills).
- `cucumber.bdd-mutation.json` — scoped to `strong-tests.feature` `@feature7` (the 6 detect-invariant behavioural scenarios), **throwaway `message:` format** (clobber-safe — never touches the canonical `.last-test-run.ndjson`).
- Target: `.claude/skills/strong-tests/scripts/detect-invariant-candidates.ts` — the SAME file `stryker.config.mjs` mutation-tests via **vitest** (~49-52% kill), so the kill-rate delta is apples-to-apples.
- Runs on the **host** (cucumber does NOT load `tests/setup/ensure-docker.ts` — that guards vitest only; cucumber has run on host all session). Stryker sandboxes the project copy, so real `.specs` is safe.

## Measured result (decisive)

| Dimension | BDD (cucumber, command runner) | vitest twin (same file) |
|---|---|---|
| **Kill rate** | **~20%** (at 20/741 mutants: 16 survived, 4 killed) | **~49-52%** |
| **Speed** | **~8s/run × 741 mutants ≈ 2.5 h for ONE file** | minutes (perTest coverage) |
| Plumbing | ✅ works — cucumber exit code kills mutants | ✅ |

**Plumbing works. The premise does not.** "Stryker *can* run BDD" ≠ "BDD *can replace* the vitest mutation surface":

1. **BDD kills < half what vitest kills.** Coarse behavioural scenarios (6 paths) don't reach the file's 12+ regex heuristics / return-type alternations the way 30+ fine-grained `scan()` unit tests do. Retiring the vitest twin would *lower* mutation coverage from ~52% → ~20%.
2. **BDD mutation is fundamentally slow, and NOT fixable by import-scoping.** Scoping the cucumber `import` from 107 step-def files to the 2 needed files changed runtime **8.0s → 6.9s** (negligible). The cost is **scenario execution** — the scenarios spawn `detect-invariant-candidates.ts` as a tsx subprocess (~1s each), not step-def compilation. A default-on BDD mutation gate across the codebase would be **days**.

## Implication for the L1 gate-switch (delete vitest twins)

**Do NOT blindly delete vitest twins.** Mutation-surface tests (e.g. `detect-invariant-candidates-unit.test.ts`) and the Stryker `mutate` targets stay vitest — BDD cannot protect them. This is the **3b "keep-as-scratch" bucket** in the rollout memory.

## Realistic options (owner decision — the literal "default-on, automate-hard" form is ruled out by the data)

1. **Opt-in scoped tool** — `npm run mutation:bdd -- <file> <@featureN>` to check "do my BDD scenarios kill mutants in this file" on demand. Cheap, honest, but not "default for everyone".
2. **Speed up first** — only viable by rewriting the scenarios' step-defs to call the code **in-process** (not spawn) — but that changes what the scenarios test (CLI/hook behaviour → unit behaviour). Large effort, semantic change.
3. **Hybrid (recommended)** — vitest stays the primary, fast mutation surface where it's strong; add a **scoped BDD mutation check only for production code that has NO vitest test** (the exact gap that motivated the request). Closes "BDD-only code is now mutation-checked" without degrading what works, and without pretending to a days-long default gate.

## Artifacts

- `stryker.bdd.config.mjs`, `cucumber.bdd-mutation.json` (PoC — host run)
- Experiment log: `.dev-pomogator/.tmp/stryker-bdd.out` (stopped at 20/741 — trend decisive)
