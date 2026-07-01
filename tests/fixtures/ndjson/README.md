# NDJSON fixtures — real cucumber-js output

## `real-cucumber-sample.ndjson`

A **real** Cucumber Messages NDJSON subset, captured from an actual BDD run of
`.specs/spec-generator-v4/spec-generator-v4.feature` on 2026-06-03 (cucumber-js
12.x, Windows). **NOT hand-built** — every envelope is exactly what the tool
emitted, including the Windows backslash uris and the per-step `testStepFinished`
statuses that synthetic fixtures had been faking.

3 scenarios spanning the result space (the ground truth):

| Scenario | Feature line | Result |
|----------|-------------|--------|
| `SPECGEN004_03` | 31 | `PASSED` |
| `SPECGEN004_10` | 86 | `PENDING` |
| `SPECGEN004_29` | 242 | `UNDEFINED` |

**Why it exists:** the synthetic unit fixtures (`tools/spec-graph/__tests__/ndjson-ingester.test.ts`)
must agree with this real capture. It is what caught the two ingest bugs the
synthetic fixtures masked — Windows backslash uris (results dropped) and
`UNDEFINED`/`PENDING` collapsing to `PASSED`. See rule
`.claude/rules/testing/verify-against-real-artifact.md`.

### Regenerate
1. Run the BDD suite → writes `.dev-pomogator/.last-test-run.ndjson`.
2. Extract a valid 3-scenario subset (one passed / pending / undefined),
   preserving the `meta` / `source` / `gherkinDocument` / `pickle` → `testCase`
   → `testCaseStarted` → `testStepFinished` → `testCaseFinished` chain.

Use the `real-fixtures` skill (`.claude/skills/real-fixtures/`) for the
capture → trim → document → verify workflow.
