# Fixtures

## Overview

Диагностика установки гоняет реальный `npx github:stgmt/dev-pomogator` в изолированном окружении. Фикстуры — это временный рабочий каталог, временный NPM-кэш и скачиваемый GitHub-тарбол исходников; они дают каждому сценарию чистое, воспроизводимое состояние без загрязнения хоста. Источник истины — таблица «Test Data & Fixtures» в [DESIGN.md](DESIGN.md#bdd-test-infrastructure-обязательно).

## Fixture Inventory

| ID | Name | Type | Path | Scope | Owner |
|----|------|------|------|-------|-------|
| F-1 | Temp working dir | factory | `os.tmpdir()/pom-npx-XXXXXX` | per-feature | `runInstallerViaNpx({ fresh: true })` (mkdtempSync) |
| F-2 | Temp NPM cache | factory | `os.tmpdir()/pom-npx-cache-XXXXXX` | per-feature | `runInstallerViaNpx({ fresh: true })` (NPM_CONFIG_CACHE override) |
| F-3 | GitHub source tarball | container | `https://codeload.github.com/stgmt/dev-pomogator/tar.gz/<HEAD>` | global | external — downloaded by npm during the run |

## Fixture Details

### F-1: Temp working dir

- **Type:** factory
- **Format:** filesystem directory
- **Setup:** `mkdtempSync(os.tmpdir()/pom-npx-)` — created by the helper when `{ fresh: true }`; used as the cwd of the `npx` subprocess.
- **Teardown:** `fs.rmSync(result.tempDir, { recursive: true, force: true })` in `afterAll`.
- **Dependencies:** none
- **Used by:** @feature1 install-diagnostics scenarios (the npx-path runs, e.g. CORE003_18/19)
- **Assumptions:** `os.tmpdir()` is writable; the OS cleans leftovers of crashed runs.

### F-2: Temp NPM cache

- **Type:** factory
- **Format:** filesystem directory (NPM cache)
- **Setup:** `mkdtempSync(os.tmpdir()/pom-npx-cache-)` exported as `NPM_CONFIG_CACHE`, only when `{ fresh: true }` — guarantees no cross-run cache reuse.
- **Teardown:** `if (result.tempCache) fs.rmSync(result.tempCache, { recursive: true, force: true })` in `afterAll`.
- **Dependencies:** none
- **Used by:** @feature1 install-diagnostics scenarios needing an isolated cache
- **Assumptions:** npm honours `NPM_CONFIG_CACHE`; the OS cleans leftovers of crashed runs.

### F-3: GitHub source tarball

- **Type:** container (external artifact)
- **Format:** `.tar.gz`
- **Setup:** downloaded by npm from `codeload.github.com` at the pinned `<HEAD>` when resolving `github:stgmt/dev-pomogator` — used as-is, no mock (rule `no-mocks-fallbacks`).
- **Teardown:** none needed — it lives inside F-2 (the temp cache), removed with it.
- **Dependencies:** F-2 (cached into the temp NPM cache)
- **Used by:** every install-diagnostics scenario (the installer source under test)
- **Assumptions:** network reachable; the repo tag/HEAD resolves.

## Dependencies Graph

```
F-3 (GitHub tarball) → cached into F-2 (temp NPM cache)
F-1 (temp working dir) — independent, the npx cwd
```

## Gap Analysis

| @featureN | Scenario | Fixture Coverage | Gap |
|-----------|----------|-----------------|-----|
| @feature1 | npx install runs in an isolated fresh environment | F-1, F-2, F-3 | none |

## Notes

Cleanup runs in `afterAll` per describe-block; a test that crashes before `afterAll` leaves temp dirs in `os.tmpdir()` intentionally (inspection of failing state). `~/.dev-pomogator/logs/install.log` is only observed (mtime), never mutated, so it needs no restore.
