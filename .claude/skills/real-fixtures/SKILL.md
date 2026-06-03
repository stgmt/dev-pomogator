---
name: real-fixtures
description: >
  Build REAL test fixtures from ANY external producer's actual output, on ANY
  stack / language / test framework — instead of hand-fabricated data that fakes
  the producer's shape and masks bugs. One universal recipe: capture a real
  sample, trim it to a valid minimal subset spanning the result space, document
  provenance + ground-truth, and generate an integration test (in the project's
  own framework) that reconciles with the tool's own summary. Works for test
  runners (cucumber / pytest / JUnit / xUnit / go test / cargo), git, CLI/JSON,
  HTTP & API responses, DB dumps, compilers, message queues — anything with a
  real producer. Triggers (RU): "сделай нормальную фикстуру", "нормальные
  фикстуры", "фикстура из реального вывода", "захвати реальный вывод", "скил для
  фикстур". Triggers (EN): "real fixture", "capture real output", "fixture from
  real tool", "stop faking fixtures", "proper test fixtures". Use when building
  or fixing a parser / ingester / adapter / client for external output on any
  stack, or when synthetic fixtures are suspected of faking the producer's shape.
  Do NOT use for pure-logic unit tests that have no external producer.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# real-fixtures — capture real producer output, never fabricate it (any stack)

## Mission

A fixture for the output of an **external producer** (a test runner, a CLI, an
API, a DB, a compiler — in any language) must be the producer's REAL output, not
data you hand-typed. A fabricated field the producer never emits makes your code
read the fake field and skip its real logic → green forever, broken on the first
real artifact. This skill is the stack-agnostic recipe for doing it right.

> Why this is a skill, not a one-off: the failure mode recurs on every stack
> (Python `behave` JSON, `git status` porcelain, a REST payload, protobuf). The
> recipe below is identical; only the *capture command* and *trim strategy*
> change per producer/format. See rule
> `.claude/rules/testing/verify-against-real-artifact.md`.

## When this skill applies

- Building/fixing a **parser, ingester, adapter, or client** for external output.
- Synthetic fixtures exist but were never diffed against real output.
- A data-pipeline feature is about to be marked done on hand-built smoke.

## The universal recipe (same on every stack)

### 1. Identify the producer + its capture command
What emits the data, and the flag that makes it emit a machine-readable sample:

| Producer class | Capture command (example) |
|---|---|
| Test runner | `cucumber-js --format message`, `pytest --json-report`, `go test -json`, `dotnet test --logger trx`, `cargo test --format json` |
| VCS | `git status --porcelain=v2 -z`, `git log --format=...`, `git diff --numstat` |
| CLI tool | `<tool> --output json` / `--format json` / `-o yaml` |
| HTTP / API | record the real response (curl `-D headers.txt -o body.json`, or a VCR/cassette) |
| Database | `pg_dump --data-only`, a real `EXPLAIN (FORMAT JSON)` row |
| Compiler / linter | `tsc --pretty false`, `eslint -f json`, `clang -fsyntax-only -fdiagnostics-format=json` |
| Queue / stream | one real serialized message (protobuf/avro/json) off the topic |

If you can't name the command that produced your fixture, it's probably fake.

### 2. Capture ONE real sample to disk
Run the real producer; write its output to a file. **Never reconstruct from
memory.** A gitignored runtime artifact (e.g. a test runner's last-run file) is
a fine source to extract from.

### 3. Choose representative cases — span the RESULT SPACE
Cover every outcome class, not the happy path: pass / fail / skip / pending /
undefined; 2xx / 4xx / 5xx; empty / single / many; valid / malformed; unicode /
ascii. The bugs live in the non-happy outcomes — that's exactly what hand-built
fixtures skip.

### 4. Trim to a VALID minimal subset (strategy depends on FORMAT, not stack)
Keep a parseable stream; drop unrelated cases. See `references/recipes.md` for
per-format recipes (NDJSON / JSON-array / single-object / line-oriented / CSV /
binary). General rule: **keep the dependency chain + any global header/schema
records the format requires**, then re-parse to prove it still parses.
A concrete helper for one format (Cucumber Messages NDJSON) ships at
`scripts/extract-ndjson-subset.ts` — read it as a *pattern* for writing your own
trimmer per format, not as the skill's only mode.

### 5. Document provenance + ground-truth
A `README.md` next to the fixture: exact capture command, tool + version, date,
and the expected result per case (the ground truth). Future readers must be able
to regenerate it and know what "correct" is.

### 6. Generate an integration test in the PROJECT's framework
Auto-detect the framework (vitest/jest, pytest, JUnit/xUnit, go test, cargo) and
write a test that: loads the REAL fixture, asserts the documented ground-truth
with **exact** assertions (not `toBeDefined()`), and reconciles aggregate numbers
with the **producer's own summary** (they must match exactly). Per-framework
snippets in `references/recipes.md`.

## Validation gate (stack-agnostic — run before declaring the fixture good)

- [ ] You can name the **capture command** that produced the fixture.
- [ ] **Diff** the fixture's keys/shape against a fresh real sample — any
      fixture-only key/field is a fabrication; remove it.
- [ ] Outcome classes covered (not happy-path only).
- [ ] Cross-platform handled: path separators (`\` vs `/`), line endings,
      encodings, locale, timezones.
- [ ] Fixture parses; parsed result == documented ground-truth == producer summary.
- [ ] Provenance README present.

## Anti-patterns (universal — do NOT)

- **Fabricate a field the producer never emits** (the FAKE_FIXTURE smell, see
  `strong-tests` anti-patterns #9). Diff against real output to catch it.
- **Happy-path-only capture** — omitting error/edge outcomes is why bugs ship.
- **Trim that breaks the format** — re-parse the trimmed fixture every time.
- **Synthetic-only suite** — synthetic fixtures are fine for exhaustive edge
  permutations, but ALWAYS anchor with ≥1 real captured fixture as ground truth.

## Bundled helpers

- `scripts/extract-ndjson-subset.ts` — example trimmer for the Cucumber Messages
  NDJSON format (one format among many; copy the pattern for yours).
- `references/recipes.md` — per-format trim recipes + per-framework test snippets.

## Related

- Rule: `.claude/rules/testing/verify-against-real-artifact.md` (real-time gate).
- Rule: `.claude/rules/integration-tests-first.md`.
- Skills: `strong-tests` (FAKE_FIXTURE = #9), `tests-create-update`.
