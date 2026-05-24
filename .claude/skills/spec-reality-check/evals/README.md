# spec-reality-check evals

14-eval suite covering all 6 checks + 3 output formats + 3 hook scenarios + 2 regression baselines.

## How to reproduce

```bash
# From repo root
npx tsx .claude/skills/spec-reality-check/evals/run-evals.ts
```

Runner reads `evals.json`, materializes each fixture in `os.tmpdir()`, spawns `verify.ts` / `verify-hook.ts`, scores per 6-point rubric, writes `iterations/iteration-N/aggregate.json`.

## Current iteration-1 results

| Metric | Value |
|--------|-------|
| Total evals | 14 |
| Fully passed (6/6 or 2-3/3 for hook) | **14** |
| Failed | **0** |
| Pass rate (points) | **100%** |
| Total duration | **~25s** |

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

### Performance benchmark (verify.ts standalone)

On real shipped specs (no eval-runner overhead):

| Spec | Findings | Duration |
|------|----------|----------|
| `.specs/spec-workflow-md-validation/` (clean) | 38 (0E/4W/34I) | ~1.1s |
| `.specs/spec-reality-check/` (self-test) | 62 (4E/32W/26I) | ~1.4s |
| `.specs/dev-pomogator-canonical-plugin/` (post-cleanup) | 101 (0E/90W/11I) | ~1.3s |

Performance NFR met: ≤30s on typical spec (≤20 FILE_CHANGES rows). Real specs measured 1.1-1.4s — well under bound.

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
