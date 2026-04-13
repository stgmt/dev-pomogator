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

WHEN `./extensions/specs-workflow/tools/specs-generator/audit-spec.ts -Path ".specs/install-diagnostics"` is executed THEN cross-refs check SHALL find @feature1..@feature5 tags consistently linked between FR.md, ACCEPTANCE_CRITERIA.md, and install-diagnostics.feature AND report SHALL find @feature18/@feature19 tags in CORE003_claude-installer.feature scenarios CORE003_18 and CORE003_19.
