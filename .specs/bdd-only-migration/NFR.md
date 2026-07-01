# Non-Functional Requirements (NFR)

## Performance

- BDD mutation of a single file SHALL complete in minutes on all cores (`concurrency: "100%"`, `coverageAnalysis: perTest`).
- The .NET 8 SDK adds roughly 1 GB to the test base image; this is acceptable because the base image is cached and rebuilt rarely.

## Security

- The `bdd-only-test-guard` hook SHALL be fail-open: any internal error or absent stdin results in allow, never a hard block of the developer.
- Every escape (`BDD_ONLY_SKIP=1` or `[skip-bdd-only: <reason>]`) SHALL be recorded to `.claude/logs/bdd-only-escapes.jsonl`; no secrets are written to any artifact.

## Reliability

- The hook SHALL be builtins-only (no `node_modules` imports) because it is plugin-distributed and users have no installed dependencies (dead-integration-guard rule).
- The mutation verdict SHALL be taken from the deterministic `verify-kill` path, not the known-flaky aggregate score.
- Throwaway cucumber configs SHALL be used for ad-hoc runs so the canonical `.dev-pomogator/.last-test-run.ndjson` is never clobbered.

## Usability

- `npm test` SHALL remain the single test door for the repository before and after the gate-switch.
- The hook's deny reason SHALL tell the developer how to write a BDD test (`.feature` + step definition) instead of a vitest file.
