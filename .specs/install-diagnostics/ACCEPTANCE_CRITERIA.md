# Acceptance Criteria (EARS)

## AC-1 (FR-1) @feature1

**Требование:** [FR-1](FR.md#fr-1-linux-npx-install-regression-coverage-feature1)

WHEN test runner executes on Linux platform AND npm cache is fresh AND `runInstallerViaNpx('--claude --all', { fresh: true })` is called THEN test SHALL observe `exitCode === 0` AND stdout SHALL contain `dev-pomogator installer (non-interactive)` AND stdout SHALL contain `Installation complete` AND `installerLogTouched` SHALL be `true` AND `cachePopulated` SHALL be `true` AND `cleanupWarnings.length` SHALL equal `0`.

## AC-2 (FR-2) @feature2

**Требование:** [FR-2](FR.md#fr-2-windows-npx-install-regression-coverage-feature2)

WHEN test runner executes on Windows platform AND silent install bug is NOT fixed (current state) THEN `runInstallerViaNpx('--claude --all', { fresh: true })` SHALL FAIL on at least one assertion AND test failure message SHALL reference `.specs/install-diagnostics/RESEARCH.md` for diagnosis.

**Expected failure mode (current state):**
- `exitCode === 2` (npm reify failed)
- `cleanupWarnings.length > 0` (EPERM на @inquirer/external-editor visible at verbose loglevel)
- `cachePopulated === false` (dev-pomogator never extracted)
- `installerLogTouched === false` (installer never ran)

## AC-3 (FR-2 post-fix) @feature2

**Требование:** [FR-2](FR.md#fr-2-windows-npx-install-regression-coverage-feature2)

WHEN test runner executes on Windows platform AND silent install bug IS fixed (upstream npm fix or local workaround) THEN `runInstallerViaNpx('--claude --all', { fresh: true })` SHALL satisfy all same assertions as AC-1 (`exitCode === 0`, rocket banner, completion, log touched, cache populated, no cleanup warnings).

**Сигнал что bug fixed:** AC-3 satisfied without modification of test assertions.

## AC-4 (FR-3) @feature3

**Требование:** [FR-3](FR.md#fr-3-runinstallerviapnpx-helper-api-feature3)

WHEN test code calls `runInstallerViaNpx(args, options)` THEN helper SHALL spawn `npx --loglevel verbose --yes github:stgmt/dev-pomogator <args>` synchronously via `spawnSync` AND working directory SHALL be a freshly-created `mkdtempSync` directory under `os.tmpdir()` AND if `options.fresh === true` THEN `NPM_CONFIG_CACHE` env var SHALL be set to a freshly-created mkdtemp directory AND helper SHALL parse stderr for `/npm warn cleanup/i` matching lines AND helper SHALL check existence of `_npx/<hash>/node_modules/dev-pomogator/package.json` AND helper SHALL compare `~/.dev-pomogator/logs/install.log` mtime before/after run AND helper SHALL return `NpxInstallResult` object with all 8 documented fields.

## AC-5 (FR-4) @feature4

**Требование:** [FR-4](FR.md#fr-4-install-diagnostics-spec-structure-feature4)

WHEN `./extensions/specs-workflow/tools/specs-generator/validate-spec.ts -Path ".specs/install-diagnostics"` is executed THEN exit code SHALL be `0` AND output SHALL report `0 ERRORS` (warnings допустимы для placeholder-секций которые не критичны для regression-цели).

## AC-6 (FR-5) @feature5

**Требование:** [FR-5](FR.md#fr-5-cross-references-via-featuren-tags-feature5)

WHEN `./extensions/specs-workflow/tools/specs-generator/audit-spec.ts -Path ".specs/install-diagnostics"` is executed THEN cross-refs check SHALL find `@feature1`..`@feature6` tags consistently linked between FR.md, ACCEPTANCE_CRITERIA.md, and install-diagnostics.feature. Audit notes на cross-spec tags (CORE003 feature file за пределами install-diagnostics) ожидаемы и допустимы как LOGIC_GAPS warnings при single-spec audit.

---

# Second Failure Mode Acceptance Criteria (2026-04-20, @feature6)

## AC-7 (FR-6) @feature6

**Требование:** [FR-6](FR.md#fr-6-promptrace-failure-mode-detection-feature6)

WHEN the skill `/install-diagnostics` executes the evidence-collection phase AND observes (a) `_npx/<hash>/` directory contents list is empty OR does not contain `node_modules/dev-pomogator/package.json`, AND (b) `~/.dev-pomogator/logs/install.log` mtime is older than skill invocation time, AND (c) reproduction с `npx --yes github:stgmt/dev-pomogator --claude --all` in the **same** isolated temp `NPM_CONFIG_CACHE` THEN completes successfully (exit 0 + log mtime advances + cache populated) — THEN the skill SHALL classify failure as `Mode: B — npm Confirmation Prompt Race`, quote `Ok to proceed? (y)` evidence line, cite `npm/cli#7147`, and recommend FR-7 fix (docs-level switch to `--yes`). IF Mode A indicators ALSO present (cleanup warnings + partial reify) THEN skill SHALL report `Mode: A+B (sequential)`.

## AC-8 (FR-7) @feature6

**Требование:** [FR-7](FR.md#fr-7-docs-hardening--yes-flag-in-all-userfacing-install-commands-feature6)

WHEN a contributor opens a PR modifying any `.md` file (or `.txt`/`.rst` user-facing docs) THEN CI check SHALL grep tracked files for regex `/npx\s+(?!--?yes\s+|-y\s+)(?:github:stgmt\/)?dev-pomogator/` AND build SHALL fail IF any match exists outside allowed exceptions (CHANGELOG.md, .specs/**/RESEARCH.md, files with marker `<!-- lint-install: allow -->`). Error output SHALL list file:line of each offending occurrence and provide the `npx --yes …` replacement snippet in stderr.

## AC-9 (FR-8) @feature6

**Требование:** [FR-8](FR.md#fr-8-installcommand-lint-check-regression-prevention-feature6)

Repo SHALL include file `tools/lint-install-commands.ts` (runnable via `npx tsx tools/lint-install-commands.ts`) AND vitest test `tests/e2e/docs-install-lint.test.ts` (OR integrated into CORE007 as `CORE007_12`) which: (a) выполняет grep, (b) fails if `--yes` missing, (c) prints actionable list, (d) respects exception markers. Exit code 0 if clean, 1 if violations.

## AC-10 (FR-9) @feature6

**Требование:** [FR-9](FR.md#fr-9-bdd-regression-scenario-for-promptrace-core00320-feature6)

WHEN test `CORE003_20` runs with fresh `NPM_CONFIG_CACHE` (mkdtemp) AND `spawnSync('npx', ['github:stgmt/dev-pomogator', '--claude', '--all'], { input: '', timeout: 30_000 })` is invoked THEN assertions SHALL verify: (a) `_npx/<hash>/node_modules/dev-pomogator/package.json` does NOT exist post-run, (b) `~/.dev-pomogator/logs/install.log` mtime did NOT advance, (c) if `result.status` is 0 OR signal-terminated — test PASSES (reproducing prompt-race); if install unexpectedly succeeded — test FAILS with message "prompt-race no longer reproducible — candidate for FR-9 removal".

## AC-11 (FR-10) @feature6

**Требование:** [FR-10](FR.md#fr-10-defensive-bin-wrapper-optionaldeferred-feature6)

IF repo reaches decision to implement defensive wrapper (per FR-10 deferred condition) THEN: (a) `package.json.bin.dev-pomogator` SHALL point to `bin/dev-pomogator-safe.cjs`, (b) wrapper SHALL write timestamp line to `~/.dev-pomogator/logs/wrapper-entry.log` как first action, (c) wrapper SHALL invoke `bin/dev-pomogator.cjs` via `require()` с same `process.argv`, (d) skill FR-6 Mode detection SHALL read `wrapper-entry.log` as tie-breaker when `_npx/<hash>/` является ambiguous (например symlink conditions on Windows).
