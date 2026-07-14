# Design

## Реализуемые требования

- [FR-1: Provide the lint runner required by the project](FR.md)
- [FR-2: Reuse an existing local lint install](FR.md)
- [FR-3: Report dependency setup failures clearly](FR.md)
- [FR-4: Keep plugin and dogfood verification self-sufficient](FR.md)
- [FR-5: Keep dependency versions reproducible](FR.md)

## Компоненты

- `package.json` — declares the lint script and the complete local lint runtime dependency set used by `eslint.config.mjs`.
- `package-lock.json` — pins the lint runtime dependency set so installs are reproducible.
- `tools/lint-self-bootstrap/run-lint.cjs` — builtins-only runtime wrapper that verifies and prepares the complete lint runtime before executing eslint.
- `tools/lint-self-bootstrap/run-lint.ts` — thin TypeScript delegate for BDD and internal callers without duplicating bootstrap logic.
- `tests/step_definitions/feature_lint_self_bootstrap.ts` — BDD steps that exercise the real package metadata and lint bootstrap behavior.

## Где лежит реализация

- Package metadata: `package.json`
- Lockfile: `package-lock.json`
- Optional bootstrap script: `tools/lint-self-bootstrap/run-lint.ts`
- BDD steps: `tests/step_definitions/feature_lint_self_bootstrap.ts`
- Cucumber wiring: `cucumber.json`

## Директории и файлы

- `package.json`
- `package-lock.json`
- `tools/lint-self-bootstrap/run-lint.ts`
- `tests/step_definitions/feature_lint_self_bootstrap.ts`
- `.specs/lint-self-bootstrap/lint-self-bootstrap.feature`

## Алгоритм

1. Declare `eslint` and every package imported by `eslint.config.mjs` as local development dependencies and update the lockfile.
2. Keep `npm run lint` on a supported wrapper path that resolves project-local tooling instead of global tools.
3. The wrapper computes the required runtime set from package metadata (`eslint`, `@eslint/js`, `typescript-eslint`, `globals`) and checks both the executable and package directories before deciding the runtime is ready.
4. If any required executable/package is missing, run the supported dependency installation command and capture its result.
5. After install, re-check the whole runtime set; execute lint only after dependencies are prepared, otherwise print a clear setup error naming the missing package(s) and log location.

## API

N/A — this feature changes local verification tooling, not a network API.

## Key Decisions

### Decision: Use local pinned eslint instead of a global binary

**Rationale:** Local package metadata and lockfile entries make lint verification reproducible across dogfood checkouts, Docker, and fresh user machines.

**Trade-off:** Fresh checkouts may need one dependency installation before the first lint run.

**Alternatives considered:**
- Rely on global eslint — rejected because results depend on each user's machine and currently fail when eslint is absent.
- Use `npx eslint` without declaring eslint — rejected because it can fetch a moving version and bypass the project lockfile.

### Decision: Keep always-on plugin hooks free of direct eslint imports

**Rationale:** Canonical plugin installs do not guarantee `node_modules`, so always-on hooks must remain builtins-only, bundled, or fail-open.

**Trade-off:** Lint bootstrapping lives in the explicit verification path rather than every hook startup.

**Alternatives considered:**
- Import eslint from a hook — rejected because it would break installed plugin users without `node_modules`.
- Bundle eslint into a hook — rejected because lint is a development verification tool, not a per-tool-call runtime dependency.

## BDD Test Infrastructure (ОБЯЗАТЕЛЬНО)

**TEST_DATA:** TEST_DATA_ACTIVE
**TEST_FORMAT:** BDD
**Framework:** Cucumber.js
**Install Command:** already installed for BDD; lint dependency install uses `npm install` / `npm ci` according to package metadata.
**Evidence:** `cucumber.json` imports `tests/step_definitions/**/*.ts`; `package.json` defines `test:bdd` and Docker BDD commands.
**Verdict:** BDD scenarios can use temp directories and copied package metadata; no persistent app data cleanup beyond per-scenario temp deletion is needed.

### Существующие hooks

| Hook файл | Тип | Тег/Scope | Что делает | Можно переиспользовать? |
|-----------|-----|-----------|------------|------------------------|
| `tests/hooks/before-after.ts` | Before/After | All scenarios | Provides per-scenario temp directory through `V4World`. | Да — enough for temp package fixtures. |

### Новые hooks

Не требуются; per-scenario temp directories already isolate package fixtures.

### Cleanup Strategy

Each BDD scenario creates package fixture files under `V4World.tempDir`; the existing after hook removes the temp directory. No user home or real `node_modules` is modified.

### Test Data & Fixtures

| Fixture/Data | Путь | Назначение | Lifecycle |
|-------------|------|------------|-----------|
| Minimal package metadata | generated under `V4World.tempDir` | Simulates package metadata with and without eslint declaration. | per-scenario |
| Fake local eslint binary | generated under `V4World.tempDir/node_modules/.bin/` | Proves reuse path without network install. | per-scenario |
| Fake lint runtime packages | generated under `V4World.tempDir/node_modules/{eslint,@eslint/js,typescript-eslint,globals}` | Proves the wrapper treats config-imported packages as part of readiness, not only the eslint binary. | per-scenario |

### Shared Context / State Management

| Ключ | Тип | Записывается в | Читается в | Назначение |
|------|-----|----------------|------------|------------|
| `lintFixtureDir` | string | Given steps | When/Then steps | Isolated package fixture root. |
| `lintResult` | object | When steps | Then steps | Captured exit code/stdout/stderr for assertions. |
