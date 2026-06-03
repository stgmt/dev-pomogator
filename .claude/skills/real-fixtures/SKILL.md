---
name: real-fixtures
description: >
  Build REAL test fixtures from ACTUAL external-tool output (cucumber NDJSON,
  git porcelain, CLI/JSON, API responses) instead of hand-fabricated envelopes
  that fake the producer's shape and mask bugs. Captures one real sample, trims
  it to a valid minimal subset spanning the result space (passed/pending/
  undefined/failed, success/error, empty/large), documents provenance +
  ground-truth, and generates an integration test that reconciles with the
  tool's own summary. Triggers (RU): "сделай нормальную фикстуру", "нормальные
  фикстуры", "фикстура из реального вывода", "захвати реальный вывод",
  "скил для фикстур". Triggers (EN): "real fixture", "capture real output",
  "fixture from real tool", "stop faking fixtures", "proper test fixtures".
  Use when building or fixing a parser / ingester / adapter for external output,
  or when synthetic fixtures are suspected of faking the producer's shape.
  Do NOT use for pure-logic unit tests that have no external producer.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# real-fixtures — capture real producer output, don't fabricate it

## Mission

A fixture for the output of an **external tool** must be the tool's REAL output,
not envelopes you hand-typed. A fabricated field the producer never emits makes
the parser read the fake field and skip its real logic → green forever, broken
on the first real artifact. This skill turns "I'll just make up an NDJSON" into
"I captured the tool's real output and pinned the ground truth."

> Motivating incident (spec-generator-v4, 2026-06-03): 359 green specs while the
> NDJSON ingester was broken on real cucumber output — fixtures faked
> `testCaseFinished.testStepResult.status`, a field cucumber-js never emits.
> See `.claude/rules/testing/verify-against-real-artifact.md`.

## When this skill applies

- Building/fixing a **parser, ingester, or adapter** for external-tool output.
- Synthetic fixtures exist but you've never diffed them against real output.
- A data-pipeline feature is about to be marked done on hand-built smoke.

## The recipe (6 steps)

### 1. Identify the producer + the capture command
What tool emits the data, and how to make it emit a sample to a file:
`cucumber-js --format message`, `git status --porcelain=v2 -z`,
`<cli> --format json`, a recorded HTTP response, etc.

### 2. Capture ONE real sample
Run the real tool, write its output to disk. For this repo's BDD:
```bash
# the BDD runner already writes the real Cucumber Messages stream here:
ls -la .dev-pomogator/.last-test-run.ndjson
```
Never reconstruct it from memory.

### 3. Choose representative cases — span the RESULT SPACE
Pick cases covering every outcome class, not just the happy path:
passed / pending / undefined / failed; success / error; empty / single / large.
The bugs live in the non-happy outcomes (that's what synthetic fixtures skip).

### 4. Trim to a VALID minimal subset
Keep the dependency chain + global envelopes; drop unrelated cases. Trimming
must preserve a parseable stream. For Cucumber Messages NDJSON, use the bundled
extractor (keeps `meta`/`source`/`gherkinDocument`/`stepDefinition`/`hook` and
the `pickle` → `testCase` → `testCaseStarted` → `testStepFinished` →
`testCaseFinished` chain for the chosen scenarios):
```bash
npx tsx .claude/skills/real-fixtures/scripts/extract-ndjson-subset.ts \
  .dev-pomogator/.last-test-run.ndjson \
  tests/fixtures/ndjson/real-cucumber-sample.ndjson \
  SPECGEN004_03 SPECGEN004_10 SPECGEN004_29
```
For other tools: keep only the records for the chosen cases plus any global
header/schema records the format requires.

### 5. Document provenance + ground-truth
Write a `README.md` next to the fixture: the exact capture command, tool +
version, date, and a table of the expected result per case (the ground truth).
Model: `tests/fixtures/ndjson/README.md`.

### 6. Generate an integration test that reconciles with reality
- Parse the REAL fixture (`parseNdjsonFile(fixture)`), assert the documented
  ground-truth (exact results, not `toBeDefined()`).
- Reconcile aggregate numbers with the **tool's own summary** (e.g. cucumber's
  `N scenarios (X passed, Y pending, Z undefined)` line) — they must match
  exactly. Model: `tools/spec-graph/__tests__/ndjson-real-fixture.test.ts`.

## Validation gate (run before declaring the fixture good)

- [ ] Diff fixture record keys against a fresh real sample's keys — **any
      fixture-only key is a fabrication**; remove it.
- [ ] Outcome classes covered (not happy-path only).
- [ ] Cross-platform handled: path separators (`\` vs `/`), line endings,
      encodings, locale.
- [ ] Fixture parses; parsed result == documented ground-truth == tool summary.
- [ ] Provenance README present (command + version + date + expected table).

## Anti-patterns (do NOT)

- **Fabricate a field the producer never emits** (the FAKE_FIXTURE smell — see
  `strong-tests` anti-patterns #9). Diff against real output to catch it.
- **Happy-path-only capture** — omitting pending/undefined/failed is why the
  bug ships.
- **Trim that breaks the chain** — dropping `testCaseStarted`/`pickle` so the
  parser silently yields nothing; always re-parse the trimmed fixture.
- **Synthetic-only suite** — keep synthetic unit fixtures for edge cases, but
  ALWAYS anchor with at least one real captured fixture as ground truth.

## Related

- Rule: `.claude/rules/testing/verify-against-real-artifact.md` (real-time gate).
- Rule: `.claude/rules/integration-tests-first.md`.
- Skill: `strong-tests` (FAKE_FIXTURE = anti-pattern #9), `tests-create-update`.
- Worked example: `tests/fixtures/ndjson/` + `tools/spec-graph/__tests__/ndjson-real-fixture.test.ts`.
