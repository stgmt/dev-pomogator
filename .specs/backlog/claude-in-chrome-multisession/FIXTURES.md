# Fixtures

## Overview

BDD-тесты используют only **synthetic stdin payloads** + **isolated fake HOME directories** через `os.tmpdir()`. Static file fixtures не нужны.

## Fixture Inventory

| ID | Name | Type | Path | Scope | Owner |
|----|------|------|------|-------|-------|
| F-1 | fakeHome | factory (mkdtempSync) | `os.tmpdir()/dev-pomogator-cims-XXXXX/` | per-scenario | beforeEach |
| F-2 | synthetic stdin payloads | factory (inline JSON.stringify) | inline | per-scenario | test body |

## Fixture Details

### F-1: fakeHome

- **Type:** factory (per-test isolated tmpdir)
- **Format:** filesystem directory
- **Setup:** `fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-pomogator-cims-'))`; override `process.env.HOME` and `USERPROFILE`.
- **Teardown:** `fs.rmSync(fakeHome, {recursive, force})` в afterEach.
- **Used by:** все PLUGIN018_* scenarios.

### F-2: synthetic stdin payloads

- **Type:** factory
- **Format:** JSON strings
- **Setup:** helper `makeStdin({sessionId, eventName, toolName, toolInput, toolResponse?})` returns properly-shaped JSON string
- **Used by:** все guard tests (PLUGIN018_01-06).

## Dependencies Graph

F-1 (independent), F-2 (independent).

## Gap Analysis

| @featureN | Scenario | Fixture Coverage |
|-----------|----------|-----------------|
| @feature1 | PLUGIN018_01 (DENY) | F-1 + F-2 |
| @feature1 | PLUGIN018_02 (ALLOW) | F-1 + F-2 |
| @feature2 | PLUGIN018_03 (record) | F-1 + F-2 |
| @feature7 | PLUGIN018_04 (orphan) | F-1 + F-2 |
| @feature9 | PLUGIN018_05 (parse error) | F-1 |
| @feature8 | PLUGIN018_06 (log) | F-1 + F-2 |
| @feature5 | PLUGIN018_07 (add) | F-1 |
| @feature5 | PLUGIN018_08 (release) | F-1 |
| @feature6 | PLUGIN018_09 (clean) | F-1 + `fs.utimesSync` |
| @feature4 | PLUGIN018_10 (installer) | `tests/e2e/helpers.ts` `runInstaller` |

## Notes

- AfterEach каждого test → rm fakeHome recursive.
- No real Claude Code spawn в guard/claim/skill tests — synthetic stdin replicates protocol.
- Installer test (PLUGIN018_10) uses Docker tier (`runInstaller` requires Docker isolation).
- Atomic mtime manipulation для clean test: `fs.utimesSync(file, atime, mtime)` to age timestamp.
