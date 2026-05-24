# Iteration-2 vs Iteration-1 diff

Cross-iteration comparison addressing 8 gaps identified during iteration-1 critical analysis.

## Headline numbers

| Metric | iter-1 | iter-2 |
|--------|--------|--------|
| Eval count | 14 | **21** (+7) |
| Categories | 7 | **11** (+4: negative-fenced-skip, negative-parser, negative-edit-not-create, regression-baseline-pinned, hook-parsed) |
| Positive happy-path evals | 14 | 9 |
| **Negative / mutation evals** | **0** | **6** (fenced-skip, no-git, malformed, edit-not-create, empty-table + edit-on-existing happy path) |
| **forbidden_codes enforcement** | soft (-1pt) | **hard (score=0)** |
| **Hook eval extracts codes from reason** | no (substring only) | **yes** (regex `[A-Z_]+`) |
| **Isolated fixtures** | no (shared fixtures parasitically emit other codes) | **yes** (per-check fixture; forbidden_codes verifies no leak) |
| **In-process bench** | none | **yes** (bench-synthetic.ts; 5 sizes × 5 runs) |
| Pass rate (points) | 100% | 100% |

## Gaps from iter-1 critical analysis — status

| # | Gap | iter-1 state | iter-2 state |
|---|-----|--------------|--------------|
| 1 | canonical-plugin 90 WARNINGs hidden behind green eval | only error=0 pinned | **expected_codes_optional + forbidden_codes** for FC_*_MISSING regression |
| 2 | shipped specs always trigger CODE_DRIFT noise | acknowledged | declared known limitation (optional code in baseline) — fix deferred to skill itself, not evals |
| 3 | task-orphan eval over-permissive (5 codes pass on 1 expected) | passed via expected_codes_optional | **isolated tasks-fc-only fixture + forbidden_codes** — fires ONLY TASKS_FC_CONSISTENCY |
| 4 | hook eval loses code data (actual_codes=[]) | substring check only | **parseDenyReason() extracts codes**; actual_codes populated; can verify exact code set + forbidden codes in reason |
| 5 | zero negative/mutation tests | 0 negative evals | **6 negative evals**: fenced-code-skip / no-git-skip / malformed-parser / empty-table / edit-on-existing / hook-permit-on-clean-spec |
| 6 | bench dominated by npx-tsx startup (~1.2s) | no separate bench | **in-process bench-synthetic.ts** measures algorithm alone — 1.69ms@10rows → 33.6ms@2000rows linear |
| 7 | iteration-1 alone — no regression baseline | only iter-1 | **iter-2 + DIFF_vs_iteration-1.md**; baseline-pinned evals snapshot real spec codes |
| 8 | 100% points statistically weak (73/73) | 73 max pts | **132 max pts**; harder discrimination via forbidden_codes |

## Bugs caught by iter-2 (real, not contrived)

### Bug 1 — verify.ts: FC_EMPTY + FC_PARSE_UNPARSEABLE double-emit

iter-2 eval-10 (`v2-fc-malformed-parser-graceful-NEGATIVE`) failed first run with `unexpected codes: FC_EMPTY`.

**Root cause:** when ALL FC rows fail to parse (missing Path column), `rows.length === 0` is true → second check `if (rows.length === 0 && content.trim().length > 0)` fires FC_EMPTY. This is wrong: the table was NOT empty (had unparseable rows), parser just couldn't extract anything.

**Fix:** `verify.ts:156` — added `hasUnparseableFindings` guard. FC_EMPTY only emits when no FC_PARSE_UNPARSEABLE present.

**Eval discrimination matters:** in iter-1 this would have passed because `expected_codes_optional` was permissive. iter-2's `forbidden_codes` enforcement caught it.

### Bug 2 — evals/run-evals.ts: hook test setup gap

iter-2 eval-21 (`v2-hook-permit-on-clean-spec-reference`) failed: hook denied instead of permitting.

**Root cause:** hook eval branch (`if c.hook_test`) supported `fixture_to_copy` but ignored `setup.create_files` / `setup.git_init*`. clean-baseline fixture needs `existing_baseline.txt` pre-created — without it action=edit → FC_EDIT_MISSING → hook correctly denies.

**Fix:** `run-evals.ts:212` — hook branch now applies `setup.create_files` and `git_init*` to tmpDir before invoking hook.

**Eval discrimination matters:** without this fix iter-2 hook category would have been 3/4 (forever wrong). Eval correctly identified eval-21 was its own bug, not hook's.

## In-process bench (bench-synthetic.ts) — first numbers

| FC rows | mean ms | p50 ms | p95 ms | findings | scaling vs prev |
|---------|---------|--------|--------|----------|-----------------|
| 10 | 1.69 | 1.12 | 3.61 | 17 | baseline |
| 100 | 4.44 | 4.75 | 5.18 | 167 | 2.6× time for 10× rows (sublinear / fixed overhead) |
| 500 | 10.61 | 10.20 | 11.50 | 834 | 2.4× time for 5× rows (linear) |
| 1000 | 17.74 | 17.02 | 20.01 | 1667 | 1.67× time for 2× rows (sublinear) |
| 2000 | 33.60 | 33.44 | 36.87 | 3334 | 1.9× time for 2× rows (linear) |

**Verdict:** algorithm is O(N) in FC rows. At 2000 rows = 33.6ms in-process. NFR (≤30s) headroom = **892×**. Real bottleneck is `npx tsx` cold start (~1.5s), not the checks.

Previously claimed in iter-1 README: "real-world latency 1.5-3s" — actually that was launch cost; algorithm time is sub-100ms even on large specs.

## What iter-2 still does NOT cover

- **Cross-spec drift** (one spec references slug of another moved spec) — out of scope for v0.1.0 per spec FR.
- **LLM-semantic drift** (narrative text claims behavior code doesn't have) — also v0.1.0 OOS.
- **Concurrency / parallel hook invocation** — hook is single-process by design; would need stress test.
- **Real Unicode/encoding edge cases** in spec paths — fixtures all ASCII.
- **Performance on hot/cold disk** — bench uses tmpfs/native fs; no SSD vs HDD comparison.

Candidates for iter-3 if needed.
