# Design

## Реализуемые требования

- [FR-1](FR.md#fr-1-scan-existing-non-bdd-tests-at-session-start)
- [FR-2](FR.md#fr-2-shared-non-bdd-test-detector)
- [FR-3](FR.md#fr-3-advisory-two-path-notice)
- [FR-4](FR.md#fr-4-a-tracking-issue-gates-the-notice)
- [FR-5](FR.md#fr-5-plugin-wide-distribution)
- [FR-6](FR.md#fr-6-doctor-verifies-and-repairs-the-hook-and-its-dependencies)

## Компоненты

- `tools/_shared/non-bdd-detector.ts` — shared pure detector (`isNonBddTest()`, `detectNonBddTests(root)`), builtins-only; extracted from the deny-guard and imported by both the guard and the scanner.
- `tools/bdd-test-scanner/scanner-hook.ts` — SessionStart entry; drains stdin, runs the scan under a timeout race, emits the hook output, fail-open.
- `tools/bdd-test-scanner/engine/scan.ts` — walks the project skipping `node_modules`/`.git`/`dist`, classifies via the shared detector, returns count + covered set.
- `tools/bdd-test-scanner/engine/ack.ts` — reads/writes the local marker holding the tracking issue number + covered set, to gate the notice.
- `.claude/skills/pomogator-doctor/scripts/engine/checks/bdd-test-scanner.ts` — doctor check verifying the hook is registered and runnable and its dependencies are present.

## Где лежит реализация

- App-код: `tools/bdd-test-scanner/`
- Wiring: `.claude-plugin/hooks.json` + `.claude/settings.json` (SessionStart registration); `.claude/skills/pomogator-doctor/scripts/engine/checks/index.ts` (register the doctor check)

## Директории и файлы

- `tools/bdd-test-scanner/scanner-hook.ts`
- `tools/bdd-test-scanner/engine/scan.ts`
- `tools/bdd-test-scanner/engine/ack.ts`
- `tools/_shared/non-bdd-detector.ts`
- `.claude/skills/pomogator-doctor/scripts/engine/checks/bdd-test-scanner.ts`

## Алгоритм

1. SessionStart fires the scanner hook; it drains stdin.
2. The scan walks the project bounded, classifying each file via the shared detector, producing a count and a covered set.
3. Read the local marker; if a tracking issue covers the current set and nothing new appeared, emit nothing.
4. Otherwise emit a one-line notice carrying the count, the bdd-migrator path, and the `gh issue create` path.
5. On any error or timeout, return continue silently — fail-open.
6. pomogator-doctor independently verifies the hook is registered and runnable and that dependencies are present, warning with a fix hint otherwise.

## API

### SessionStart hook IO

- Method: `N/A`
- Path: `N/A — Claude Code SessionStart hook, not an HTTP service`
- Request: stdin JSON SessionStart payload, drained and unused
- Response: hook output JSON with `continue`, optional `suppressOutput`, optional `additionalContext`

## Key Decisions

### Decision: Reuse the deny-guard detector via one shared module

**Rationale:** A single source of truth for non-BDD classification prevents the scanner's patterns drifting from the guard's, so the two never disagree on what counts as a non-BDD test.

**Trade-off:** It requires refactoring a live guard to import the extracted module — a small change to existing enforcement code.

**Alternatives considered:**
- Copy the regexes into the scanner — rejected because two copies drift and the guard and scanner would eventually classify the same file differently.
- Move patterns to a config file — rejected because the guard already encodes them in code; a config layer adds indirection without value here.

### Decision: Gate the notice by a GitHub issue, not a local seen-flag

**Rationale:** A filed issue records the migration debt durably in the team tracker (owner directive), whereas a local flag dismisses it silently with no record.

**Trade-off:** The issue path needs the `gh` tool — an external dependency outside the plugin.

**Alternatives considered:**
- A local seen-acknowledgment flag — rejected because it hides the debt instead of tracking it.
- The hook auto-files the issue itself — rejected because that needs network and auth inside a SessionStart hook, breaking the fail-open builtins-only core.

### Decision: builtins-only fail-open core; dependencies via warn plus doctor-fix

**Rationale:** The core runs for plugin users with no installed dependencies and never crashes a session; any dependency it needs is surfaced rather than silently skipped (owner directive).

**Trade-off:** When `gh` is absent the issue path degrades to an install hint instead of working immediately.

**Alternatives considered:**
- Bundle the dependency — rejected because `gh` is an external CLI, not a node package that can be bundled.
- Require dependencies at install time — rejected because it makes a lightweight nudge heavy and can fail offline.

## BDD Test Infrastructure (ОБЯЗАТЕЛЬНО)

**TEST_DATA:** TEST_DATA_ACTIVE
**TEST_FORMAT:** BDD
**Framework:** Cucumber.js
**Install Command:** already installed
**Evidence:** `cucumber.json` at repo root + `tests/step_definitions/` — the repo runs cucumber-js (see RESEARCH.md "Existing Patterns").
**Verdict:** Scenarios build per-scenario temp project trees with seeded test files; they need per-scenario temp-dir creation and cleanup hooks; no external services are involved.

### Существующие hooks

| Hook файл | Тип | Тег/Scope | Что делает | Можно переиспользовать? |
|-----------|-----|-----------|------------|------------------------|
| `tests/hooks/before-after.ts` | Before/After | V4World | per-scenario isolation and cleanup | Да — base isolation |

### Новые hooks

| Hook файл | Тип | Тег/Scope | Что делает | По аналогии с |
|-----------|-----|-----------|------------|---------------|
| `tests/step_definitions/feature_bdd_test_scanner.ts` | step-defs | @FR-1..@FR-6 | seed temp project, run scanner, assert | existing `feature_*.ts` step-defs |

### Cleanup Strategy

Each scenario builds an isolated temp project directory; the After hook removes it. The local ack marker is written under a temp state path so the test never touches the real user state.

### Test Data & Fixtures

| Fixture/Data | Путь | Назначение | Lifecycle |
|-------------|------|------------|-----------|
| temp project tree | per-scenario temp dir | seeded non-BDD tests + a feature file for the scan | per-scenario |

### Shared Context / State Management

| Ключ | Тип | Записывается в | Читается в | Назначение |
|------|-----|----------------|------------|------------|
| projectDir | string | Given step | When and Then steps | path of the seeded temp project |
| noticeOutput | string | When step | Then step | captured scanner notice text |
