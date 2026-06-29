# Tasks

> Tasks carry Done-When checkboxes, Status, Est, and FR/@feature traceability. `.feature` is authored first (done); step-defs + impl follow.

## Phase 0: Foundation

### 📋 `extract-detector`

> Extract the non-BDD classification (patterns + allow-lists) from the deny-guard into one shared builtins-only pure module.

- **files:** `tools/_shared/non-bdd-detector.ts` *(create)*, `tools/bdd-only-test-guard/guard.ts` *(edit)*
- **Done When:**
  - [ ] `isNonBddTest(path)` and `detectNonBddTests(root)` exported from the shared module, builtins-only
  - [ ] `guard.ts` imports the shared module; its existing BDD tests still pass
- Status: TODO
- Est: 40m
- refs: [FR-2](FR.md#fr-2-shared-non-bdd-test-detector), @FR-2

## Phase 1: Scanner core

### 📋 `scan-engine`

> Bounded project walk that classifies each file via the shared detector and returns a count + covered set.

- **files:** `tools/bdd-test-scanner/engine/scan.ts` *(create)*
- **Done When:**
  - [ ] walk skips `node_modules`, `.git`, `dist`; caps files; returns count + covered set
  - [ ] classification is path-only via the shared detector
- Status: TODO
- Est: 40m
- refs: [FR-1](FR.md#fr-1-scan-existing-non-bdd-tests-at-session-start), @FR-1

### 📋 `scanner-hook`

> SessionStart entry that drains stdin, runs the scan under a timeout race, emits the notice, and is fail-open.

- **files:** `tools/bdd-test-scanner/scanner-hook.ts` *(create)*
- **Done When:**
  - [ ] returns `{continue:true, ...}` with the count + bdd-migrator path + `gh issue create` path when tests found
  - [ ] any error or timeout returns continue silently
- Status: TODO
- Est: 40m
- refs: [FR-1](FR.md#fr-1-scan-existing-non-bdd-tests-at-session-start), @FR-1

### 📋 `ack-marker`

> Local marker holding the tracking issue number + covered set that gates the notice.

- **files:** `tools/bdd-test-scanner/engine/ack.ts` *(create)*
- **Done When:**
  - [ ] notice silent when a tracking issue covers the current set
  - [ ] notice re-fires when a non-BDD test appears beyond the covered set
- Status: TODO
- Est: 30m
- refs: [FR-4](FR.md#fr-4-a-tracking-issue-gates-the-notice), @FR-4

## Phase 2: Distribution and Doctor

### 📋 `register-hook`

> Register the scanner as a SessionStart hook for all plugin users and for dogfooding.

- **files:** `.claude-plugin/hooks.json` *(edit)*, `.claude/settings.json` *(edit)*
- **Done When:**
  - [ ] scanner entry present in the plugin manifest under SessionStart
  - [ ] scanner entry present in project settings via the bootstrap launcher
- Status: TODO
- Est: 20m
- refs: [FR-5](FR.md#fr-5-plugin-wide-distribution), @FR-5

### 📋 `doctor-check`

> Doctor check verifying the hook is registered + runnable and its dependencies are present.

- **files:** `.claude/skills/pomogator-doctor/scripts/engine/checks/bdd-test-scanner.ts` *(create)*, `.claude/skills/pomogator-doctor/scripts/engine/checks/index.ts` *(edit)*
- **Done When:**
  - [ ] reports ok when hook registered and `gh` available
  - [ ] reports a problem with a fix hint when the hook entry is absent or `gh` is missing
- Status: TODO
- Est: 40m
- refs: [FR-6](FR.md#fr-6-doctor-verifies-and-repairs-the-hook-and-its-dependencies), @FR-6

## Phase 3: Tests and verification

### 📋 `bdd-stepdefs`

> Step-defs driving the real scanner against seeded temp projects; wire the feature into the suite.

- **files:** `tests/step_definitions/feature_bdd_test_scanner.ts` *(create)*, `cucumber.json` *(edit)*
- **Done When:**
  - [ ] all `@FR-1`..`@FR-6` scenarios drive the real scanner and pass in Docker
  - [ ] detector parity scenario asserts guard and scanner agree
- Status: TODO
- Est: 60m
- refs: [FR-3](FR.md#fr-3-advisory-two-path-notice), @FR-3

### 📋 `deps-absent-verify`

> Prove the core runs for users with no installed dependencies.

- **files:** `tools/bdd-test-scanner/scanner-hook.ts` *(edit)*
- **Done When:**
  - [ ] with `node_modules` hidden, the hook runs via the real launcher and does not crash the session
- Status: TODO
- Est: 20m
- refs: [FR-1](FR.md#fr-1-scan-existing-non-bdd-tests-at-session-start), @FR-1
