# Tasks

## TDD Workflow

> Recorded after-the-fact: every workstream below is implemented, verified and committed (this is a
> record of done work, not a forward plan). Status DONE; commit cited per task.

## Phase 1: BDD mutation surface (Green)

- [x] cucumber-runner + perTest + concurrency mutation config -- @feature1 @feature2 — Status: DONE | Est: 90m
  _Requirements: [FR-1](FR.md#fr-1-bdd-mutation-via-the-official-cucumber-runner), [FR-2](FR.md#fr-2-parallel-mutation-across-all-cpu-cores)_
  **Done When:**
  - [x] `npm run mutation:bdd` runs via `@stryker-mutator/cucumber-runner` (perTest), 24 runners, 13 min (commit 2d6879e)
  - [x] @feature1 scenario passes
- [x] stryker-mutation skill + atomic state -- @feature3 — Status: DONE | Est: 45m
  _Requirements: [FR-3](FR.md#fr-3-stryker-mutation-skill-and-state)_
  **Done When:**
  - [x] `tools/stryker-mutation/state.ts` records score to `.dev-pomogator/.mutation-state.json` (commit 156908b)
  - [x] @feature3 scenario passes

## Phase 2: Quality (Green)

- [x] strong-tests §6.5 coverage-breadth + 3 gap scenarios -- @feature4 — Status: DONE | Est: 60m
  _Requirements: [FR-4](FR.md#fr-4-strong-tests-mutation-resistant-bdd-authoring)_
  **Done When:**
  - [x] §6.5 step 8 + scenarios close NoCoverage 139→91, score 79.25→80.87 (commits cb188e9/f06dcc6/68fbd65)
  - [x] @feature4 scenario passes
- [x] bdd-quality Haiku judge hook -- @feature5 — Status: DONE | Est: 90m
  _Requirements: [FR-5](FR.md#fr-5-bdd-quality-judge-hook)_
  **Done When:**
  - [x] PostToolUse hook scores edits against §6.5, advisory, fail-open (commit d57043a)
  - [x] @feature5 scenario passes
- [x] path-limited agent commit discipline -- @feature6 — Status: DONE | Est: 30m
  _Requirements: [FR-6](FR.md#fr-6-path-limited-agent-commit-discipline)_
  **Done When:**
  - [x] bdd-migrator commits only its own paths via `git commit -- <paths>` (commit 0974678)
  - [x] @feature6 scenario passes

## Phase 3: Refactor & Polish

- [x] Final verification — Status: DONE | Est: 15m
  **Done When:**
  - [x] All workstreams committed path-limited; mutation re-measure proves the breadth fix (80.87%)
  - [x] `spec-verdict.ts -Path .specs/bdd-mutation-quality` reviewed
