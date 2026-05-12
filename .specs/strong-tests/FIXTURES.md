# Fixtures

## Overview

Per DESIGN.md `Classification: TEST_DATA_NONE` — strong-tests skill itself does not create, modify, or persist data. Tests live as vitest E2E cases (`tests/e2e/strong-tests.test.ts`) that exercise the skill workflow via spawnSync / direct invocation, using ephemeral tmp dirs for fixture inputs (per-test cleanup via vitest afterEach). No persistent fixtures, no DB seed, no global state.

## Fixture Inventory

N/A — TEST_DATA_NONE classification.

Per-test ephemeral inputs (tmp source files used to feed Greenfield/Audit modes during vitest cases) are created inline in each `it()` block via `fs.mkdtempSync` and cleaned up via `afterEach`. They are not formal fixtures (no shared lifecycle, no cross-scenario state).

## Fixture Details

N/A — no formal fixtures.

## Dependencies Graph

N/A — no formal fixtures.

## Gap Analysis

| @featureN | Scenario | Fixture Coverage | Gap |
|-----------|----------|-----------------|-----|
| @feature1 | TESTQUAL001_01 Greenfield emits PBT | Inline tmp `src/foo.ts` per `it()` | none |
| @feature2 | TESTQUAL001_02 Audit flags weak | Inline tmp `tests/foo.test.ts` with toBeDefined per `it()` | none |
| @feature3 | TESTQUAL001_03 Mutation feedback loop | Inline tmp module + mock Stryker subprocess via `vi.mock` | none |
| @feature4 | TESTQUAL001_04 Auto-detect polyglot | Inline tmp dir with both package.json + pyproject.toml | none |
| @feature5 | TESTQUAL001_05 12-point self-eval | Output assertion against skill stdout | none |

## Notes

If a future FR introduces persistent fixtures (e.g., real Stryker-generated mutation reports stored across test runs for integration tests with caching), reclassify DESIGN.md to `Classification: TEST_DATA_ACTIVE` and populate this file with the proper Fixture Inventory + Lifecycle sections.
