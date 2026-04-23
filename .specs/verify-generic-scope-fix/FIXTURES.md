# Fixtures

## Overview

BDD сценарии verify-generic-scope-fix требуют набор staged-diff fixture-ов, marker-fixture-ов и commit-message fixture-ов для e2e тестирования hook-а в изоляции. Все fixtures — filesystem-local, никаких DB/API. Каждая fixture копируется в per-scenario tmp git repo via `createTmpRepoWithDiff()` helper.

## Fixture Inventory

| ID | Name | Type | Path | Scope | Owner |
|----|------|------|------|-------|-------|
| F-1 | stocktaking-diff.patch | static (unified diff) | `tests/fixtures/scope-gate/stocktaking-diff.patch` | per-scenario | `createTmpRepoWithDiff()` step |
| F-2 | docs-only-diff.patch | static (unified diff) | `tests/fixtures/scope-gate/docs-only-diff.patch` | per-scenario | `createTmpRepoWithDiff()` step |
| F-3 | fresh-marker.json | static (JSON template) | `tests/fixtures/scope-gate/fresh-marker.json.tpl` | per-scenario | `writeMarkerFile()` step |
| F-4 | stale-marker.json | static (JSON template) | `tests/fixtures/scope-gate/stale-marker.json.tpl` | per-scenario | `writeMarkerFile()` step |
| F-5 | escape-hatch-commit-msg.txt | static (text) | `tests/fixtures/scope-gate/escape-hatch-msg.txt` | per-scenario | inline in test body |
| F-6 | switch-case-diff.patch | static (unified diff) | `tests/fixtures/scope-gate/switch-case-diff.patch` | per-scenario | `createTmpRepoWithDiff()` step |
| F-7 | non-guard-enum-diff.patch | static (unified diff) | `tests/fixtures/scope-gate/non-guard-enum-diff.patch` | per-scenario | `createTmpRepoWithDiff()` step |

## Fixture Details

### F-1: stocktaking-diff.patch (scoring regression pin)

- **Type:** static file (unified diff format)
- **Format:** git patch (`diff --git a/... b/...`)
- **Content:** Adds `'stocktaking'` string literal to enum array в fake `src/services/StockValidationService.ts` (mirrors webapp MR !100 actual diff minus any secrets)
- **Expected scoring:** filename match (+1 Service.ts) + enum-item (+2) + predicate `isOutbound` (+1) = **4**
- **Setup:** `createTmpRepoWithDiff(F-1)` → (a) `git init`, (b) write base `StockValidationService.ts` file, (c) `git add + commit` initial, (d) apply patch via `git apply + git add`
- **Teardown:** tmpDir removed in `afterEach`
- **Dependencies:** none
- **Used by:** VSGF001_10 (block), VSGF001_11 (happy with marker), VSGF001_20 (stale marker), VSGF001_30 (escape hatch)
- **Assumptions:** `git` executable available; temp FS write access; filename regex в `score-diff.ts` matches `*Service.ts` suffix

### F-2: docs-only-diff.patch (short-circuit verification)

- **Type:** static file (unified diff)
- **Format:** git patch
- **Content:** Adds 3 lines to `README.md` only (no code changes)
- **Expected behavior:** FR-4 rule (c) short-circuit → hook exits 0 without scoreDiff invocation
- **Setup:** `createTmpRepoWithDiff(F-2)`
- **Teardown:** tmpDir cleanup
- **Dependencies:** none
- **Used by:** VSGF001_40 (docs-only pass)
- **Assumptions:** `--name-only` check выполняется до scoreDiff

### F-3: fresh-marker.json.tpl (valid marker unblocks commit)

- **Type:** static JSON template (placeholders substituted at test time)
- **Format:** JSON with `{TIMESTAMP}`, `{SESSION_ID}`, `{DIFF_SHA256}` placeholders
- **Template content:**
  ```json
  {
    "timestamp": {TIMESTAMP},
    "diff_sha256": "{DIFF_SHA256}",
    "session_id": "{SESSION_ID}",
    "variants": [
      {"file": "StockValidationService.ts", "kind": "enum-item", "name": "stocktaking", "reach": "traced", "evidence": "grep trace verified"}
    ],
    "should_ship": true
  }
  ```
- **Setup:** `writeMarkerFile(cwd, sessionId, diffSha, "fresh-marker")` — substitutes placeholders, `timestamp = Date.now()` (fresh), writes to `{cwd}/.claude/.scope-verified/<sessionId>-<diffSha.slice(0,12)>.json`
- **Teardown:** tmpDir cleanup
- **Dependencies:** F-1 (must match same diff_sha256)
- **Used by:** VSGF001_11 (happy path with fresh marker)
- **Assumptions:** helper computes sha256 of staged diff AFTER fixture apply, substitutes into marker

### F-4: stale-marker.json.tpl (mismatched hash → invalidation)

- **Type:** static JSON template
- **Format:** same structure as F-3
- **Setup:** `writeMarkerFile(cwd, sessionId, "wronghash0000", "stale-marker")` — deliberately uses WRONG diff_sha256 to trigger mismatch invalidation
- **Teardown:** tmpDir cleanup
- **Dependencies:** F-1 (must coexist with actual diff having different hash)
- **Used by:** VSGF001_20 (stale marker → block)
- **Assumptions:** hook's `readFreshMarker()` compares `diff_sha256` and returns null on mismatch

### F-5: escape-hatch-commit-msg.txt

- **Type:** static text
- **Format:** plain commit message
- **Content:**
  ```
  fix: refactor existing dead-code path [skip-scope-verify: dead-code path confirmed with reviewer — no runtime reach]
  ```
- **Setup:** used inline в test: `git commit -F <path-to-fixture>` or passed via `-m` in spawned Bash command simulation
- **Teardown:** N/A (file, not DB)
- **Dependencies:** F-1 (suspicious diff that would otherwise block)
- **Used by:** VSGF001_30 (escape hatch passes + logs to jsonl)
- **Assumptions:** reason is ≥8 chars (tested: "dead-code path confirmed with reviewer — no runtime reach" is ~55 chars)

### F-6: switch-case-diff.patch (alternate suspicious pattern)

- **Type:** static file (unified diff)
- **Format:** git patch
- **Content:** Adds `case StockTaking:` inside switch в fake `src/services/DocumentGate.ts`
- **Expected scoring:** filename (+1) + switch-case (+2) = **3** → блок
- **Setup:** `createTmpRepoWithDiff(F-6)`
- **Teardown:** tmpDir cleanup
- **Dependencies:** none
- **Used by:** VSGF001_12 (switch-case variant detection — covers scoring R-case rule)
- **Assumptions:** `findEnclosingFunction` or switch detector в score-diff.ts handles this pattern

### F-7: non-guard-enum-diff.patch (false-positive guard)

- **Type:** static file (unified diff)
- **Format:** git patch
- **Content:** Adds enum entry в `src/utils/ColorPalette.ts` (non-guard file, innocuous enum expansion)
- **Expected scoring:** enum (+2) = **2** → БЛОК (borderline, acceptable false positive), escape via hatch
- **Setup:** `createTmpRepoWithDiff(F-7)`
- **Teardown:** tmpDir cleanup
- **Dependencies:** none
- **Used by:** VSGF001_41 (false positive verification + escape hatch flow)
- **Assumptions:** подтверждает что threshold=2 генерирует acceptable false positives для non-guard enum changes; escape hatch должен быть доступен

## Dependencies Graph

```
F-1 (stocktaking-diff)
 ├── used alone           → VSGF001_10 (block, no marker)
 ├── + F-3 (fresh-marker) → VSGF001_11 (pass, happy)
 ├── + F-4 (stale-marker) → VSGF001_20 (block, stale)
 └── + F-5 (escape msg)   → VSGF001_30 (pass, escape)

F-2 (docs-only)           → VSGF001_40 (pass, short-circuit)
F-6 (switch-case)         → VSGF001_12 (block, variant pattern)
F-7 (non-guard enum)      → VSGF001_41 (block, escape via hatch)
```

## Gap Analysis

| @featureN | Scenario | Fixture Coverage | Gap |
|-----------|----------|-----------------|-----|
| @feature1 | VSGF001_10 Enum extension blocked | F-1 | none |
| @feature1 | VSGF001_11 Fresh marker unblocks | F-1 + F-3 | none |
| @feature1 | VSGF001_12 Switch-case pattern blocked | F-6 | none |
| @feature2 | VSGF001_20 Stale marker → re-verify | F-1 + F-4 | none |
| @feature3 | VSGF001_30 Escape hatch passes + audits | F-1 + F-5 | none |
| @feature4 | VSGF001_40 Docs-only short-circuit | F-2 | none |
| @feature4 | VSGF001_41 Non-guard enum (false positive + escape) | F-7 | none |
| @feature5 | VSGF001_50 SKILL.md frontmatter validation | N/A — static check on extension artifact, не staged diff | N/A (no fixture, direct file read) |

## Notes

- **Cleanup order:** per-scenario tmpDir cleanup идёт последним в `afterEach`, после marker state и log files. Используем `fs.rmSync(tmpDir, {recursive: true, force: true})` — безопасно, fail-open если dir уже удалён.
- **Fixture versioning:** templates with placeholders (F-3, F-4) parameterize время/session_id чтобы избежать brittleness на clock changes. Fixed placeholders substituted at test time via `.replace()` — простой string replacement, не полноценный templating engine.
- **Regression pin:** F-1 named stocktaking-diff — прямая связка к real incident (PRODUCTS-20218). Если future heuristic tweak приведёт к `scoreDiff(F-1) < 2`, unit тест в `tests/regressions/stocktaking-incident.test.ts` сразу fail-ится с понятной ошибкой "stocktaking regression pin lost".
- **No cascade dependencies:** все fixtures self-contained, don't depend on each other's runtime state. Graph показывает only composition (какие fixtures используются вместе в сценарии), не setup chaining.
- **Future extension:** при добавлении нового variant type (e.g., `type = 'a' | 'b'` union literal) — создать F-8 и добавить соответствующий VSGF001_NN сценарий. Обновить gap analysis.
