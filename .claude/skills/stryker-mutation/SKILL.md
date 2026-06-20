---
name: stryker-mutation
description: >-
  Run + interpret Stryker mutation testing in this repo — for VITEST targets (real code, the
  strong-tests detector, the spec-generator subsystem) AND for BDD/cucumber targets (via the
  official @stryker-mutator/cucumber-runner). Use when you need to measure how well tests KILL
  mutants, read a mutation report, or decide whether a survivor is a weak test vs an equivalent
  mutant vs a coverage gap. Keeps the recipe + last scores in .dev-pomogator/.mutation-state.json
  so you don't re-derive the setup each time.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Stryker Mutation — recipe + interpretation

Mutation testing breaks a copy of the code (a "mutant") and runs the tests; a mutant **killed** =
tests caught it, **survived** = tests missed it, **NoCoverage** = no test even runs that code.
Score = `(killed + timeout) / (killed + timeout + survived + noCoverage)`.

## The configs (don't re-derive — they exist)

| Command | Config | Runner | Target |
|---|---|---|---|
| `npm run mutation` | `stryker.real.config.mjs` | vitest, perTest | real product modules (ndjson parser, fr-census, add-task-ids) |
| `npm run mutation:skill` | `stryker.config.mjs` | vitest, off | strong-tests `detect-invariant-candidates.ts` |
| `npm run mutation:specgen` | `stryker.specgen.config.mjs` | vitest, perTest, ignoreStatic | the v4 spec-graph subsystem (42 files) |
| `npm run mutation:bdd` | `stryker.bdd.config.mjs` | **cucumber-runner, perTest, concurrency 100%** | code via its BDD `@featureN` scenarios |

## Run

- **vitest configs → Docker only** (`bash scripts/docker-mutation.sh <config>`): vitest loads
  `tests/setup/ensure-docker.ts` which throws on host. `npm run mutation*` already wrap this.
- **BDD config → HOST** (`npx stryker run stryker.bdd.config.mjs`): cucumber does NOT load the
  ensure-docker guard, and the host has ALL cores (no Docker cpu cap), so `concurrency:'100%'`
  parallelises fully. Stryker sandboxes the project copy → real `.specs` is safe.

## Read the report

`reports/mutation-<x>/mutation.json` (Stryker schema: `files.<path>.mutants[] = {status, mutatorName,
location, replacement}`). Parse survivors with `.dev-pomogator/.tmp/analyze-mutation.mjs` (or copy its
shape): tally `Killed/Survived/Timeout/NoCoverage/RuntimeError`, list survivors with line + mutator +
replacement. The terminal **progress** counter is misleading — it shows `survived` but NOT `noCoverage`,
so the live % looks far higher than the final honest score (BDD run 2026-06-20: progress read "9
survived ≈ 98%", final was **79.25%** once 139 NoCoverage were counted).

## Interpret a survivor — three distinct causes, three distinct fixes

1. **Survived (covered, not killed)** — a test runs the code but its assertion is too loose, OR the
   mutant is **equivalent** (no behavioural change, e.g. a char-class shuffle in a regex that still
   matches the same inputs). Fix: tighten the assertion (`.toEqual` not `.includes`), or accept as
   equivalent.
2. **NoCoverage** — NO test exercises that branch. Fix: **add a test/scenario** for it. This — not
   loose assertions — was the real weakness of the detect-invariant BDD scenarios (139 NoCoverage in
   Python-for-in / return-type / chain branches the 6 `@feature7` scenarios never touched). See
   `audit-reports/stryker-bdd-mutation-finding.md`.
3. **Timeout / RuntimeError** — the mutant hangs/throws; usually counted toward detection, but
   inspect if many.

**BDD vs vitest (proven 2026-06-20):** where a cucumber scenario reaches code, it kills ~98% of
mutants — as tight as a unit test. BDD's gap is breadth (uncovered branches), not depth. So to
strengthen a BDD mutation surface, ADD scenarios for the NoCoverage branches before touching
assertions. `ignoreStatic:true` (like the specgen config) skips static const/regex mutants that
dominate wall-clock (331 of 788 = 67% of the time on the detector).

## State

Keep the last run's numbers in `.dev-pomogator/.mutation-state.json` (atomic write — `atomic-config-save`
rule) so the next session sees what's covered + the last score without re-running: `{ target, runner,
score, killed, survived, noCoverage, ts }`. Helper: `tools/stryker-mutation/state.ts`.

## Gotchas

- **The BDD aggregate score is NON-DETERMINISTIC — PROVEN a `@stryker-mutator/cucumber-runner` bug, NOT a test/concurrency issue.** Four identical-code runs gave 32/40/67/70 survivors; a per-mutant diff of two byte-identical runs found **48 mutants flip verdict** bidirectionally [cmd:diff-mutants.mjs runA runB]. Root cause (read from source): the runner **reuses `this.supportCodeLibrary` across mutant runs** + a singleton `StrykerFormatter.instance` [ref:node_modules/@stryker-mutator/cucumber-runner/dist/src/cucumber-test-runner.js:74] → cross-mutant state bleed in the long-lived worker. **Lowering concurrency does NOT help — it made it WORSE** (conc 6 → 135 survived); do not try that. **The ONLY trustworthy unit is inject+restore** (deterministic): hand-mutate the production line → run ONLY the covering scenario (`--name <ID>`) → it MUST FAIL on your assertion → restore → it MUST PASS. **Do NOT gate on the aggregate score.** Tests + `scan()` are proven deterministic standalone, so a flaky BDD mutation number is the runner, not your test. See `audit-reports/stryker-bdd-mutation-finding.md` «PROVEN root cause».
- cucumber-runner needs `testRunnerNodeArgs: ['--import', 'tsx']` to load the TypeScript step-defs.
- The BDD config uses a dedicated `stryker-bdd` cucumber.json profile (scoped import, throwaway/no
  canonical format) — NEVER the `default` profile (it writes the canonical `.last-test-run.ndjson`).
- A stray root artifact blocks ANY commit (`forbid-root-artifacts`); whitelist real configs in
  `.root-artifacts.yaml`, delete scratch.

## Related
- `.claude/skills/strong-tests/SKILL.md` — authoring mutation-resistant tests (the quality side).
- `audit-reports/stryker-bdd-mutation-finding.md` — the BDD-runner finding + corrected conclusion.
