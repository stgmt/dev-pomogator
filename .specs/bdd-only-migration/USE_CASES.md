# Use Cases

## UC-1: Developer authors a test under the BDD-only regime

A developer (or agent) adds a new test to the repository.

- The developer writes a new test as a `.feature` scenario plus a step definition under `tests/step_definitions/`.
- An attempt to Write a brand-new `tests/e2e/foo.test.ts` instead is intercepted by the `bdd-only-test-guard` hook.
- The hook returns a deny decision naming BDD-only and pointing at the `.feature` + step-def path; the file is not created.

## UC-2: Mutation parity is proven before deleting a vitest twin

A maintainer migrates the 56 strong-tests detector unit checks to BDD.

- The 56 assertions are expressed as `@feature7` Scenario Outline + Examples driving the real detector in-process.
- `npm run mutation:bdd` runs the cucumber-runner with `perTest`; survivors are re-checked deterministically by `npm run mutation:verify`.
- Only once every mutant previously killed by vitest is KILLED by the BDD scenarios is `detect-invariant-candidates-unit.test.ts` deleted and the vitest Stryker config retired.

## UC-3: The .NET mutation scenario runs in the canonical Docker run

The canonical BDD run executes inside Docker, where the toolchain is guaranteed.

- `Dockerfile.test.base` installs the .NET 8 SDK plus `dotnet-stryker`.
- The migrated .NET mutation scenario drives `runStrykerNet` against a real fixture target.
- In the Docker-cucumber canonical run the scenario reports `passed` rather than being skipped for a missing toolchain.

## UC-4: Editing an existing not-yet-migrated test is still allowed

During the staged migration, existing vitest tests must remain editable until their BDD twin is green.

- A developer opens an existing `tests/e2e/legacy.test.ts` and edits it.
- The `bdd-only-test-guard` hook receives an Edit (not a Write of a new file) and allows it.
- A Write of a brand-new non-BDD test file in the same session is still denied.

## UC-5: A deliberate escape is recorded for audit

A developer must, in a justified case, create a new non-BDD test file.

- The developer sets `BDD_ONLY_SKIP=1` (or adds the `[skip-bdd-only: <reason>]` commit marker).
- The guard allows the Write and appends one JSON line to `.claude/logs/bdd-only-escapes.jsonl` recording the escape reason.
- The audit trail lets a reviewer see every bypass after the fact.
