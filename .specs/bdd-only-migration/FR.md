# Functional Requirements (FR)

## FR-1: Staged BDD-only test-file guard

The PreToolUse hook `bdd-only-test-guard` (`tools/bdd-only-test-guard/guard.ts`, builtins-only, fail-open) SHALL DENY a Write that creates a NEW non-BDD test file — a path matching `*.test.ts`, `*.test.tsx`, `*.spec.*`, `test_*.py`, `*_test.py`, `*_test.go`, `*Tests.cs`, or `*Test.cs` that does not already exist on disk. It SHALL ALLOW an Edit of an existing test file (staged mode) and SHALL ALWAYS ALLOW a `.feature` file, a `tests/step_definitions/` path, and fixture files. A deliberate escape (`BDD_ONLY_SKIP=1` or the `[skip-bdd-only: <reason>]` commit marker) SHALL be allowed and recorded to `.claude/logs/bdd-only-escapes.jsonl`. The guard SHALL be registered in `.claude/settings.json` and `.claude-plugin/hooks.json`.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
**Use Case:** [UC-1](USE_CASES.md#uc-1-developer-authors-a-test-under-the-bdd-only-regime)

## FR-2: Detector unit tests migrated to BDD with mutation parity

The 56 checks in `detect-invariant-candidates-unit.test.ts` SHALL be represented as `@feature7` Scenario Outline + Examples in `strong-tests.feature`, driving `scan` / `nestedLoopCount` / `suggestInvariants` / `detectStack` in-process at the same granularity (language × return-type × boundary). `npm run mutation:bdd` (cucumber-runner, perTest) plus `npm run mutation:verify` (deterministic) SHALL prove that the new BDD scenarios KILL every mutant the vitest suite killed; only then SHALL the vitest twin be deleted and `stryker.config.mjs` be retired or repointed at BDD.

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
**Use Case:** [UC-2](USE_CASES.md#uc-2-mutation-parity-is-proven-before-deleting-a-vitest-twin)

## FR-3: .NET mutation path runs in Docker

`Dockerfile.test.base` SHALL install the .NET 8 SDK plus `dotnet-stryker`, and the .NET mutation scenarios (`TESTQUAL001_11b/c/d`) SHALL be migrated to BDD and actually RUN (not skipped) in the canonical Docker-cucumber run, driving `run-mutation.ts runStrykerNet` against `tests/fixtures/dotnet-stryker-target/`. The vitest twin `strong-tests-dotnet-stryker.test.ts` SHALL be deleted.

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
**Use Case:** [UC-3](USE_CASES.md#uc-3-the-net-mutation-scenario-runs-in-the-canonical-docker-run)

## FR-4: build-guard updated for v2

`build-staleness.ts` SHALL NO LONGER consult the non-existent `src/→dist/` staleness check; it SHALL retain the Docker `SKIP_BUILD` guard, the dotnet `--no-build` guard, and interpreter passthrough. The 2 dead `@wip` scenarios that tested the removed path SHALL be removed, and the vitest twin `build-guard.test.ts` SHALL be migrated and deleted.

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
**Use Case:** [UC-1](USE_CASES.md#uc-1-developer-authors-a-test-under-the-bdd-only-regime)

## FR-5: All vitest tests migrated to BDD

All remaining ~120 `*.test.ts` files SHALL be migrated to BDD in waves via `bdd-migrator` (including the internal tool unit suites); homeless tests (no spec) SHALL first get a spec via `create-spec`, then be migrated. The `corpus.ts` / `migrate.ts --batch` netCount SHALL reach 0.

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)
**Use Case:** [UC-4](USE_CASES.md#uc-4-editing-an-existing-not-yet-migrated-test-is-still-allowed)

## FR-6: bdd-migrator upgraded for BDD-only with no exceptions

The `bdd-migrator` agent + skill + `tools/bdd-migrator/*` SHALL be upgraded so that the three former keep-vitest classes (mutation-surface, env-dependent, static-scan) are migrated with the correct technique rather than kept, and refusals ("not migratable / out of scope / keep on vitest") SHALL be forbidden. Step-defs SHALL load real fixtures from `tests/fixtures/**` and isolate per scenario via `tests/hooks/before-after.ts` (V4World fresh tempDir); the classifier SHALL mark the mutation surface as `runtime-mutation` (migrate), and `corpus.ts` SHALL count all test roots (`tools/**/__tests__`, `.claude/**/__tests__`).

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)
**Use Case:** [UC-1](USE_CASES.md#uc-1-developer-authors-a-test-under-the-bdd-only-regime)

## FR-7: Final gate-switch to the Docker-cucumber canonical run

Once zero `*.test.ts` remain, `npm test` SHALL run the Docker-cucumber canonical suite and the vitest config SHALL be removed; the staged guard then becomes a full guard naturally (no new non-BDD tests, none remaining). CLAUDE.md and the docs SHALL be updated.

**Связанные AC:** [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)
**Use Case:** [UC-1](USE_CASES.md#uc-1-developer-authors-a-test-under-the-bdd-only-regime)

## FR-8: Spec records the migration with a GREEN smart verdict

This spec `.specs/bdd-only-migration` SHALL record FR-1 through FR-9 as FR + AC + `.feature` + TASKS, and its smart verdict (`spec-verdict.ts`) SHALL be GREEN.

**Связанные AC:** [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8)
**Use Case:** [UC-1](USE_CASES.md#uc-1-developer-authors-a-test-under-the-bdd-only-regime)

## FR-9: FR-1 guard scenarios drive the real guard

The `.feature` SHALL carry `@feature1` guard scenarios (BDDONLY001_01 deny-new, _02 allow-edit-existing, _03 allow-step-def/`.feature`, _04 escape-logged) that PAIR with the committed step-defs in `tests/step_definitions/feature_bdd_only_guard.ts`, which spawn the real guard via its bootstrap launcher (no mocks). The feature SHALL be wired into `cucumber.json` `default.paths`.

**Связанные AC:** [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9)
**Use Case:** [UC-5](USE_CASES.md#uc-5-a-deliberate-escape-is-recorded-for-audit)
