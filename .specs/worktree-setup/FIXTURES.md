# Fixtures

## Overview

worktree-setup BDD scenarios (CORE024_01..18) require isolated git+HOME state per test. Three fixtures cover this: (1) skeleton fresh-main repo for "act as if installing from scratch"; (2) pre-recorded `gh repo view` JSON outputs for Layer 2 validation without hitting real GitHub API; (3) snapshot of pre-patch `tsx-runner-bootstrap.cjs` for regression testing of strategy fallback compatibility.

## Fixture Inventory

| ID | Name | Type | Path | Scope | Owner |
|----|------|------|------|-------|-------|
| F-1 | fresh-main | static (directory tree) | `tests/fixtures/worktree-setup/fresh-main/` | per-feature copy to tmp | `setupWorktreeFixture` beforeEach |
| F-2 | gh-mock-responses | static (JSON files) | `tests/fixtures/worktree-setup/gh-mock/*.json` | shared, read-only | tests via env override `GH_MOCK_DIR` |
| F-3 | tsx-runner-bootstrap-original | snapshot | `tests/fixtures/worktree-setup/tsx-runner-bootstrap-original.cjs` | shared, read-only | regression tests Phase 3 |

## Fixture Details

### F-1: fresh-main

- **Type:** static (directory tree skeleton)
- **Format:** mixed (package.json JSON + .git/ binary + folder structure)
- **Setup:** `cp -r tests/fixtures/worktree-setup/fresh-main/ <tmpDir>/main/` via `setupWorktreeFixture` hook
- **Teardown:** `rm -rf <tmpDir>/main/` via `cleanupWorktreeFixture` hook
- **Dependencies:** none
- **Used by:** all 18 CORE024 scenarios (every test needs a synthetic main worktree to act upon)
- **Assumptions:** scaffold contains `package.json` with `"name":"dev-pomogator"` (so doctor check #6 passes) AND minimal `.git/` (so `git worktree list --porcelain` works after first invocation)

### F-2: gh-mock-responses

- **Type:** static (per-owner-repo JSON files mirroring `gh repo view --json` outputs)
- **Format:** JSON
- **Setup:** test sets env `GH_MOCK_DIR=<this-fixture-path>` before invoking env-resolver; resolver reads JSON instead of spawning real `gh repo view` when env var is set
- **Teardown:** no — read-only fixture
- **Dependencies:** none
- **Used by:** CORE024_09, _10, _11 (Layer 1/2 PR resolution tests), CORE024_13 (gh auth pre-flight tests use mock for negative path)
- **Assumptions:** test runner respects `GH_MOCK_DIR` env (implementation: env-resolver.ts checks this env first; otherwise spawn `gh` subprocess)

### F-3: tsx-runner-bootstrap-original

- **Type:** snapshot (single CJS file)
- **Format:** CommonJS source
- **Setup:** no — file present at fixed path
- **Teardown:** no — read-only
- **Dependencies:** snapshot is taken from `~/.dev-pomogator/scripts/tsx-runner-bootstrap.cjs` AT THE TIME this spec's implementation begins (so future installer changes don't accidentally break our regression check)
- **Used by:** Phase 3 regression test "tsx-runner-bootstrap.cjs strategy fallback path unaffected by self-heal patch in tsx-runner.js"
- **Assumptions:** snapshot is captured pre-implementation; if tsx-runner-bootstrap.cjs evolves in main, this snapshot may drift — re-capture when intentionally refreshing

## Dependencies Graph

```
F-1 (fresh-main) ─── independent, copied per scenario
F-2 (gh-mock) ────── independent, shared read-only
F-3 (bootstrap-snap) ─ independent, shared read-only
```

No cross-fixture dependencies (intentional — keeps test setup parallelizable).

## Gap Analysis

- **No GitHub API contract fixture** (real `gh` API responses) — by design. Real network calls in tests are flaky and slow; F-2 covers the response shape via mock. Trade-off: if gh CLI's `--json` output schema changes in a future version, F-2 needs refresh. Mitigation: integration test "F-2 schema matches current gh CLI output" runs occasionally (manual, not CI-blocking).
- **No fixture for orphan worktree state** — generated dynamically by test via `setupWorktreeFixture` + skipping installer step (parameter to hook).
- **No fixture for session-pilot indexer state** — out of scope for this spec (session-pilot implementation lives in separate branch).
