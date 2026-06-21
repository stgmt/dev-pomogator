# Acceptance Criteria (EARS)

## AC-1 (FR-1)

**Требование:** [FR-1](FR.md#fr-1-staged-bdd-only-test-file-guard)

IF an agent issues a Write that creates a NEW non-BDD test file THEN the `bdd-only-test-guard` hook SHALL deny the call with a BDD-only reason; WHEN the agent issues an Edit of an existing test file, OR a Write of a `.feature` or `tests/step_definitions/` file, THEN the hook SHALL allow it.

## AC-2 (FR-2)

**Требование:** [FR-2](FR.md#fr-2-detector-unit-tests-migrated-to-bdd-with-mutation-parity)

WHEN `npm run mutation:bdd` and `npm run mutation:verify` have run on the detector THEN every mutant previously killed by vitest SHALL be KILLED by the BDD scenarios; ELSE `detect-invariant-candidates-unit.test.ts` SHALL NOT be deleted.

## AC-3 (FR-3)

**Требование:** [FR-3](FR.md#fr-3-net-mutation-path-runs-in-docker)

WHEN the canonical Docker-cucumber run executes AND the base image ships the .NET 8 SDK and dotnet-stryker THEN the migrated .NET mutation scenario SHALL be `passed` (not `skipped`).

## AC-4 (FR-4)

**Требование:** [FR-4](FR.md#fr-4-build-guard-updated-for-v2)

WHEN `build-staleness.ts` evaluates a test command THEN it SHALL NOT consult a `src/→dist/` staleness check (that path does not exist in v2) AND SHALL still enforce Docker `SKIP_BUILD` and dotnet `--no-build` guards.

## AC-5 (FR-5)

**Требование:** [FR-5](FR.md#fr-5-all-vitest-tests-migrated-to-bdd)

WHEN the entire tail has been migrated THEN `migrate.ts --batch` netCount SHALL equal 0 AND no `*.test.ts` file SHALL remain in the repository.

## AC-6 (FR-6)

**Требование:** [FR-6](FR.md#fr-6-bdd-migrator-upgraded-for-bdd-only-with-no-exceptions)

IF the bdd-migrator classifies a test as a mutation-surface, env-dependent, or static-scan case THEN it SHALL migrate it with the correct technique and SHALL NOT refuse with "keep on vitest / not migratable / out of scope".

## AC-7 (FR-7)

**Требование:** [FR-7](FR.md#fr-7-final-gate-switch-to-the-docker-cucumber-canonical-run)

WHEN zero `*.test.ts` remain THEN `npm test` SHALL run the Docker-cucumber canonical suite AND the vitest config SHALL be removed.

## AC-8 (FR-8)

**Требование:** [FR-8](FR.md#fr-8-spec-records-the-migration-with-a-green-smart-verdict)

WHEN `spec-verdict.ts` is run on `.specs/bdd-only-migration` THEN the smart verdict SHALL be GREEN AND the spec SHALL record FR-1 through FR-9.

## AC-9 (FR-9)

**Требование:** [FR-9](FR.md#fr-9-fr-1-guard-scenarios-drive-the-real-guard)

WHEN the FR-1 guard scenarios run against the real guard THEN a new non-BDD test SHALL be denied, an Edit of an existing test SHALL be allowed, a `.feature`/step-def SHALL be allowed, and a `BDD_ONLY_SKIP` escape SHALL be allowed AND recorded in the escape log.
