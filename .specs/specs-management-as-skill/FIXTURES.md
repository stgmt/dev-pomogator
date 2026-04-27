# Fixtures

## Overview

This refactor's BDD scenarios drive installer integration tests via vitest + `tests/e2e/helpers.ts` patterns. Test data is minimal: pre-migration project layout (rule files seeded into `.claude/rules/specs-workflow/`) is created inline in test bodies via `writeFile`, and post-migration assertions read filesystem state. No persistent fixture files required — most state is constructed per-scenario.

## Fixture Inventory

| ID | Name | Type | Path | Scope | Owner |
|----|------|------|------|-------|-------|
| F-1 | Pre-migration rule layout | factory | inline in `tests/e2e/specs-management-skill-migration.test.ts` | per-scenario | beforeEach in test file |
| F-2 | Sample spec folder for hook validation | static | `tests/fixtures/specs-management-as-skill/sample-spec/` | per-scenario (read-only) | committed to repo |
| F-3 | User-modified rule snapshot | factory | inline in test | per-scenario | beforeEach in test file |
| F-4 | Sandboxed project root | factory | `appPath()` from `helpers.ts` | per-scenario | `setupCleanState()` helper |
| F-5 | Sandboxed home dir | factory | `homePath()` from `helpers.ts` | per-scenario | `setupCleanState()` helper |

## Fixture Details

### F-1: Pre-migration rule layout

- **Type:** factory (constructed inline)
- **Format:** TypeScript test code creating .md files via `fs.writeFileSync`
- **Setup:** test beforeEach creates 4 manifest-managed rule files in `appPath()/.claude/rules/specs-workflow/` with non-empty content
- **Teardown:** implicit via next `setupCleanState()` call wiping appPath
- **Dependencies:** F-4 (sandboxed project root)
- **Used by:** SPECMGT001_06, SPECMGT001_07, SPECMGT001_14
- **Assumptions:** appPath is writable; existing `helpers.ts` provides `setupCleanState`

### F-2: Sample spec folder for hook validation

- **Type:** static
- **Format:** committed `.specs/sample-feature/*.md` files (USER_STORIES.md, FR.md, ACCEPTANCE_CRITERIA.md, sample-feature.feature with @featureN tags)
- **Setup:** copied from `tests/fixtures/specs-management-as-skill/sample-spec/` into `appPath()/.specs/sample-feature/` at test start
- **Teardown:** implicit via next `setupCleanState()`
- **Dependencies:** F-4
- **Used by:** SPECMGT001_09 (hook produces identical findings before/after)
- **Assumptions:** sample-spec files are valid v3 format with @featureN tags

### F-3: User-modified rule snapshot

- **Type:** factory
- **Format:** TypeScript test code; writes a "user-modified" rule file with marker string `// USER MOD: test sentinel`
- **Setup:** beforeEach in SPECMGT001_14 writes file with sentinel
- **Teardown:** implicit via next `setupCleanState()`
- **Dependencies:** F-1, F-4
- **Used by:** SPECMGT001_14 (user-overrides backup verification)
- **Assumptions:** updater-managed-cleanup behavior unchanged from existing `updater-managed-cleanup` rule

### F-4: Sandboxed project root

- **Type:** factory
- **Format:** filesystem path string returned by `appPath()` helper from `tests/e2e/helpers.ts`
- **Setup:** `setupCleanState()` creates fresh temp dir, returns path via `appPath()`
- **Teardown:** `setupCleanState()` on next test resets directory
- **Dependencies:** none (root)
- **Used by:** every scenario in this feature file
- **Assumptions:** existing helpers.ts pattern works; OS temp dir writable

### F-5: Sandboxed home dir

- **Type:** factory
- **Format:** filesystem path string returned by `homePath()` helper from `tests/e2e/helpers.ts`
- **Setup:** `setupCleanState()` creates fresh fake home dir, returns path via `homePath()`
- **Teardown:** `setupCleanState()` on next test resets
- **Dependencies:** none (root)
- **Used by:** SPECMGT001_06, SPECMGT001_07, SPECMGT001_14 (any scenario invoking `runInstaller(updateMode=true)` which writes to `~/.dev-pomogator/`)
- **Assumptions:** existing helpers.ts pattern; HOME env var override works on Windows + Unix

## Dependencies Graph

```
F-4 (sandboxed project root)  ──→ F-1 (pre-migration layout)
                                 ╲→ F-2 (sample spec)  → SPECMGT001_09
                                  ╲→ F-3 (user-mod)    → SPECMGT001_14
F-5 (sandboxed home)          ──→ runInstaller calls in SPECMGT001_06,07,14
```

## Gap Analysis

| @featureN | Scenario | Fixture Coverage | Gap |
|-----------|----------|-----------------|-----|
| @feature1 | SPECMGT001_01 SKILL.md ≤200 lines | F-4 | none |
| @feature1 | SPECMGT001_02 References installed | F-4 | none |
| @feature1 | SPECMGT001_13 Token cost ≤500 | F-4 | none — assertion via tokenizer call, no extra fixture |
| @feature2 | SPECMGT001_03 Naming convention | F-4 | none |
| @feature3 | SPECMGT001_04 Audit category files exist | F-4 | none |
| @feature3 | SPECMGT001_05 audit-overview links | F-4 | none |
| @feature4 | SPECMGT001_06 Hard cutover removes rules | F-1, F-4, F-5 | none |
| @feature4 | SPECMGT001_07 Manifest empty | F-4, F-5 | none |
| @feature4 | SPECMGT001_08 CLAUDE.md no rule refs | F-4 | none |
| @feature4 | SPECMGT001_09 Hook identical findings | F-2, F-4 | none |
| @feature4 | SPECMGT001_14 User-mod backup | F-1, F-3, F-4, F-5 | none |
| @feature5 | SPECMGT001_10 research-workflow skill | F-4 | none |
| @feature5 | SPECMGT001_11 Description 1024-char | F-4 | none |
| @feature5 | SPECMGT001_12 allowed-tools complete | F-4 | none |

All scenarios covered by existing helpers + minimal inline fixtures. No gaps.

## Notes

- Cleanup ordering: each test's `beforeEach` calls `setupCleanState()` which atomically wipes both `appPath()` and `homePath()` — no cascading order issues since fixtures are per-scenario.
- Migration plan: F-2 (sample spec) added to repo as part of refactor commit; needs to be valid v3 spec with realistic FR/AC/feature content. Copy from existing `.specs/scope-gate/` or similar reference.
- Known issue: `setupCleanState()` is shared with other tests; it should be called inside the spec's own `beforeEach`, not at module level, to avoid cross-test interference.
