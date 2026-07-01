# Design

## Реализуемые требования

- [FR-1: Staged BDD-only test-file guard](FR.md#fr-1-staged-bdd-only-test-file-guard)
- [FR-2: Detector unit tests migrated to BDD with mutation parity](FR.md#fr-2-detector-unit-tests-migrated-to-bdd-with-mutation-parity)
- [FR-3: .NET mutation path runs in Docker](FR.md#fr-3-net-mutation-path-runs-in-docker)
- [FR-4: build-guard updated for v2](FR.md#fr-4-build-guard-updated-for-v2)
- [FR-5: All vitest tests migrated to BDD](FR.md#fr-5-all-vitest-tests-migrated-to-bdd)
- [FR-6: bdd-migrator upgraded for BDD-only with no exceptions](FR.md#fr-6-bdd-migrator-upgraded-for-bdd-only-with-no-exceptions)
- [FR-7: Final gate-switch to the Docker-cucumber canonical run](FR.md#fr-7-final-gate-switch-to-the-docker-cucumber-canonical-run)
- [FR-8: Spec records the full migration with a GREEN smart verdict](FR.md#fr-8-spec-records-the-migration-with-a-green-smart-verdict)
- [FR-9: FR-1 guard scenarios drive the real guard](FR.md#fr-9-fr-1-guard-scenarios-drive-the-real-guard)

## Компоненты

- `bdd-only-test-guard` — PreToolUse hook (builtins-only) that denies new non-BDD test files (FR-1, FR-9).
- `strong-tests` mutation surface — the detector under `@feature7` Scenario Outline + Examples, gated by `verify-kill` (FR-2).
- `Dockerfile.test.base` — ships the .NET 8 SDK + dotnet-stryker so the .NET mutation scenario runs (FR-3).
- `build-staleness.ts` — the build-guard, with the dead `src/→dist/` check removed (FR-4).
- `bdd-migrator` (agent + skill + `tools/bdd-migrator/*`) — drives the tail migration with no refusals (FR-5, FR-6).
- `package.json` / `vitest.config.ts` — the gate-switch from vitest to the Docker-cucumber canonical run (FR-7).

## Где лежит реализация

- App-код: `tools/bdd-only-test-guard/guard.ts`, `tools/bdd-migrator/`, `tools/tui-test-runner/build-staleness.ts`, `.claude/skills/strong-tests/scripts/`.
- Wiring: `.claude/settings.json`, `.claude-plugin/hooks.json`, `cucumber.json`, `Dockerfile.test.base`, `package.json`.

## Директории и файлы

- `tools/bdd-only-test-guard/guard.ts`
- `tests/step_definitions/feature_bdd_only_guard.ts`
- `.specs/bdd-only-migration/bdd-only-migration.feature`
- `.claude/rules/bdd-only/bdd-only-tests.md`

## Алгоритм

1. The guard reads the PreToolUse payload from stdin (`tool_name`, `tool_input.file_path`, `cwd`).
2. It classifies the target: a Write of a path matching a non-BDD test pattern that does not yet exist is a NEW non-BDD test.
3. A new non-BDD test is denied with a BDD-only reason; Edits, `.feature` files, and `tests/step_definitions/` paths are allowed.
4. An escape (`BDD_ONLY_SKIP=1` or the commit marker) allows the write and appends one JSON line to the escape log.

## API

### bdd-only-test-guard (PreToolUse)

- Method: `stdin JSON → stdout JSON`
- Path: `tools/bdd-only-test-guard/guard.ts` (via `tools/_shared/bootstrap.cjs`)
- Request: `{ tool_name, tool_input: { file_path }, cwd }`
- Response: `{ hookSpecificOutput: { permissionDecision: "deny" | "allow", permissionDecisionReason } }`; deny → exit 2, allow → exit 0.

## Key Decisions

### Decision: Staged (not absolute) file-level guard

**Rationale:** Existing vitest tests must remain editable until their BDD twin is green, so the guard blocks only the Write of a NEW non-BDD test, not edits of existing ones.

**Trade-off:** During the migration window a non-BDD test can still be modified, so the regime is enforced fully only once the tail reaches zero `*.test.ts`.

**Alternatives considered:**
- Block all non-BDD test touches immediately — rejected because it would freeze the in-progress migration of ~120 files.
- Rely on review discipline only — rejected because it has no mechanical enforcement and lets new vitest files reappear.

### Decision: builtins-only hook with fail-open

**Rationale:** The hook is plugin-distributed; users have no `node_modules`, so it imports only Node builtins and allows on any internal error (dead-integration-guard rule).

**Trade-off:** No third-party parsing helpers are available, so path classification is hand-written.

**Alternatives considered:**
- Bundle dependencies — rejected as overkill for a few path checks.
- Lazy-import with fallback — rejected because builtins-only is simpler and has no failure surface for this guard.

## BDD Test Infrastructure (ОБЯЗАТЕЛЬНО)

**TEST_DATA:** TEST_DATA_ACTIVE
**TEST_FORMAT:** BDD
**Framework:** Cucumber.js
**Install Command:** already installed (`@cucumber/cucumber` in package.json)
**Evidence:** `tests/step_definitions/feature_bdd_only_guard.ts` exists and spawns the real guard; `tests/hooks/before-after.ts` provides the V4World per-scenario tempDir.
**Verdict:** Per-scenario isolation via the V4World Before hook (fresh tempDir); the "existing file" and escape-log assertions live inside that isolated dir. No new hook file needed.

### Существующие hooks

| Hook файл | Тип | Тег/Scope | Что делает | Можно переиспользовать? |
|-----------|-----|-----------|------------|------------------------|
| `tests/hooks/before-after.ts` | Before/After | global (V4World) | fresh per-scenario tempDir + cleanup | Да — used by feature_bdd_only_guard.ts |

### Новые hooks

| Hook файл | Тип | Тег/Scope | Что делает | По аналогии с |
|-----------|-----|-----------|------------|---------------|
| N/A | N/A | N/A | no new hook required | N/A |

### Cleanup Strategy

The V4World After hook removes the per-scenario tempDir, including the isolated `.claude/logs/bdd-only-escapes.jsonl` written under it; nothing leaks to the real repo logs.

### Test Data & Fixtures

| Fixture/Data | Путь | Назначение | Lifecycle |
|-------------|------|------------|-----------|
| existing test file | `<tempDir>/<rel>` | the "existing file" case for the allow-edit scenario | per-scenario |
| escape log | `<tempDir>/.claude/logs/bdd-only-escapes.jsonl` | asserted by the escape-logged scenario | per-scenario |

### Shared Context / State Management

| Ключ | Тип | Записывается в | Читается в | Назначение |
|------|-----|----------------|------------|------------|
| `guardExit` | number | When step (runGuard) | Then step | the guard's exit code |
| `guardStdout` | string | When step (runGuard) | Then step | the guard's stdout JSON |
