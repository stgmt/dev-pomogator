# spec-reality-check evals

21-eval suite covering all 6 checks + 3 output formats + 4 hook scenarios + 2 regression baselines + **6 negative/mutation evals** + **isolated per-check fixtures** (iteration-2).

## How to reproduce

```bash
# From repo root
# 1) Functional evals (21 cases via spawned verify.ts/verify-hook.ts)
npx tsx .claude/skills/spec-reality-check/evals/run-evals.ts

# 2) In-process algorithm bench (no spawn overhead — measures real check cost)
npx tsx .claude/skills/spec-reality-check/evals/bench-synthetic.ts
```

Runner reads `evals.json`, materializes each fixture in `os.tmpdir()`, spawns `verify.ts` / `verify-hook.ts`, scores per rubric, writes `iterations/iteration-N/aggregate.json`. Bench measures `runChecks()` directly via import for 10/100/500/1000/2000 FC rows × 5 runs each, writes `iterations/iteration-N/bench.json`.

## Current iteration-2 results

| Metric | iter-1 | iter-2 |
|--------|--------|--------|
| Total evals | 14 | **21** (+7) |
| Categories | 7 | **11** (+4 negative) |
| Negative / mutation evals | 0 | **6** |
| Fixtures isolated (1 check each) | shared (parasitic) | **per-check** |
| forbidden_codes enforcement | soft (-1pt) | **hard (score=0)** |
| Hook eval code extraction | substring only | **regex from reason** |
| Pass rate (points) | 100% (73/73) | **100% (132/132)** |
| Total duration | ~25s | ~64s |

Detailed iter-1 vs iter-2 comparison + bugs caught by iter-2: [`iterations/iteration-2/DIFF_vs_iteration-1.md`](iterations/iteration-2/DIFF_vs_iteration-1.md).

### By category

| Category | Result | Avg duration |
|----------|--------|--------------|
| fc-checks | 2/2 PASS | ~1.6s |
| narrative-check | 1/1 PASS | ~1.6s |
| code-drift | 2/2 PASS | ~1.7s (positive ~1.8s with git init) |
| tasks-fc-check | 1/1 PASS | ~1.6s |
| output-format | 3/3 PASS | ~2.6s (markdown/human slower due to ANSI rendering) |
| regression-baseline | 2/2 PASS | ~1.2s |
| hook | 3/3 PASS | ~1.5s (deny path spawns verify.ts again, takes ~3s) |

### Per-eval timing (iteration-1)

| ID | Name | Result | Duration |
|----|------|--------|----------|
| 1 | fc-create-exists-stale-create | PASS 6/6 | 1602ms |
| 2 | fc-edit-and-delete-missing | PASS 6/6 | 1555ms |
| 3 | narrative-path-missing | PASS 6/6 | 1560ms |
| 4 | code-drift-positive-git-commits-present | PASS 6/6 | 1797ms |
| 5 | code-drift-skipped-no-git | PASS 6/6 | 1606ms |
| 6 | tasks-fc-orphan-warning | PASS 6/6 | 1622ms |
| 7 | format-json-valid-output | PASS 6/6 | 1573ms |
| 8 | format-human-readable-output | PASS 6/6 | 3128ms |
| 9 | format-markdown-valid-table | PASS 6/6 | 3202ms |
| 10 | baseline-clean-shipped-spec-zero-errors | PASS 6/6 | 1205ms |
| 11 | baseline-canonical-plugin-after-cleanup-zero-errors | PASS 6/6 | 1304ms |
| 12 | hook-deny-on-spec-with-errors | PASS 3/3 | 3107ms |
| 13 | hook-permit-on-clean-plan | PASS 2/2 | 755ms |
| 14 | hook-failopen-on-invalid-stdin | PASS 2/2 | 740ms |

> Note: `npx tsx` startup is ~1.2-1.5s per invocation on Windows + Node 20.19.6. Per-eval verify call dominates; real-world skill latency on a single spec is ~1.5-3s end-to-end.

### Performance benchmark — in-process (bench-synthetic.ts, iteration-2)

`runChecks()` called via import — NO npx/tsx spawn overhead. Synthetic specs with N FILE_CHANGES rows × 5 runs each:

| FC rows | mean ms | p50 ms | p95 ms | findings | scaling |
|---------|---------|--------|--------|----------|---------|
| 10 | 1.69 | 1.12 | 3.61 | 17 | baseline |
| 100 | 4.44 | 4.75 | 5.18 | 167 | 2.6× / 10× rows (sublinear) |
| 500 | 10.61 | 10.20 | 11.50 | 834 | 2.4× / 5× rows (linear) |
| 1000 | 17.74 | 17.02 | 20.01 | 1667 | 1.67× / 2× rows (sublinear) |
| 2000 | 33.60 | 33.44 | 36.87 | 3334 | 1.9× / 2× rows (linear) |

**Algorithm verdict:** O(N) in FC rows. At 2000-row spec = **33.6ms**. NFR (≤30s) headroom = **892×**.

**Real bottleneck**: `npx tsx` cold-start ~1.5s dominates. End-to-end CLI latency on real specs:

| Spec | Findings | CLI ms (spawn+algo) |
|------|----------|--------------------|
| `.specs/spec-workflow-md-validation/` (clean) | 38 (0E/4W/34I) | ~1100 |
| `.specs/spec-reality-check/` (self-test) | 62 (4E/32W/26I) | ~1400 |
| `.specs/dev-pomogator-canonical-plugin/` (post-cleanup) | 101 (0E/90W/11I) | ~1300 |

In iter-1 README I claimed "real-world latency 1.5-3s = algorithm time" — that was wrong. iteration-2 separated the two: spawn dominates 95%+ of wall time; algo is sub-100ms even on 1000-row specs.

## 6-point scoring rubric (verify evals)

Each verify eval scored 0-6 points:

1. **Total count matches** (`expected_total` or always 1pt if not specified)
2. **Error count matches** (`expected_error`)
3. **Warning count matches** (`expected_warning` or `≥ expected_warning_min`)
4. **Info count matches** (`expected_info` or `≥ expected_info_min`)
5. **All `expected_codes` present in actual codes**
6. **No codes outside (`expected_codes` ∪ `expected_codes_optional`)**

Forbidden codes penalty: -1 if any `forbidden_codes` appear.

## 2-3 point scoring (hook evals)

Hook evals scored 0-3 points (only 2 for permit cases, 3 for deny):

1. **Exit code 0** (fail-open)
2. **Outcome matches** (`expected_hook_outcome: "deny"` vs `"permit"`)
3. **All `expected_reason_substrings` present in stdout** (deny cases only)

## Regression invariants (always must hold)

- `baseline-clean-shipped-spec-zero-errors` — `.specs/spec-workflow-md-validation/` MUST be 0 ERRORs. Any failure means skill regressed on shipped spec.
- `baseline-canonical-plugin-after-cleanup-zero-errors` — `.specs/dev-pomogator-canonical-plugin/` MUST be 0 ERRORs after 2026-05-24 cleanup. Any failure means cleanup regressed.

## Adding new evals

1. Edit `evals.json` — append new eval object with `id`, `name`, `category`, `prompt`, `fixture` (or `real_spec: true`), expected counts, expected codes.
2. If new fixture needed — add under `tests/fixtures/spec-reality-check/`.
3. Bump `iteration` in `evals.json` body.
4. Re-run runner; new `iterations/iteration-N/aggregate.json` written.
5. Compare with previous iteration's aggregate to confirm no regression.

## File layout

```
evals/
├── README.md            ← this file
├── evals.json           ← 14 eval definitions + scoring config
├── run-evals.ts         ← runner script (cross-platform, Windows shell:true)
└── iterations/
    └── iteration-1/
        └── aggregate.json   ← latest run results with per-eval timings
```
