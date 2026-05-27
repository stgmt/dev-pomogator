# Fixtures

## Overview

Большинство тестов работают через runtime fixtures — temporary directories через existing `tests/e2e/helpers.ts` runInstaller pattern. Static fixtures нужны только для migration scenarios — нужно симулировать pre-existing v1 install чтобы тестировать `detectV1Install` и `runMigration`.

## Fixture Inventory

| ID | Name | Type | Path | Scope | Owner |
|----|------|------|------|-------|-------|
| F-1 | v1 plugin manifest | static | `tests/fixtures/v1-install/.dev-pomogator/.claude-plugin/plugin.json` | per-scenario | migration test setup |
| F-2 | v1 sample skill | static | `tests/fixtures/v1-install/.claude/skills/sample-skill/SKILL.md` | per-scenario | migration test setup |
| F-3 | v1 .gitignore with marker | static | `tests/fixtures/v1-install/.gitignore` | per-scenario | migration test setup |
| F-4 | v1 settings.local.json hooks | static | `tests/fixtures/v1-install/.claude/settings.local.json` | per-scenario | migration test setup |
| F-5 | tmp project (git init) | factory | runtime via `helpers.ts:createTmpProject(withGit: true)` | per-scenario | test `beforeEach` |
| F-6 | tmp project (no git) | factory | runtime via `helpers.ts:createTmpProject(withGit: false)` | per-scenario | test `beforeEach` |
| F-7 | tmp ~/.claude (isolated home) | factory | `helpers.ts:createIsolatedHome()` — overrides `process.env.HOME` для test | per-scenario | test `beforeEach` |
| F-8 | user-modified skill (hash mismatch) | factory | clone F-2 + modify content для simulate user override | per-scenario | migration test |

## Fixture Details

### F-1: v1 plugin manifest

- **Type:** static file
- **Format:** JSON
- **Setup:** committed to repo at `tests/fixtures/v1-install/.dev-pomogator/.claude-plugin/plugin.json`. Test copies entire `tests/fixtures/v1-install/` tree в tmp project через `fs.copy`.
- **Teardown:** tmp project удаляется в `afterEach` (existing helpers.ts pattern).
- **Dependencies:** none
- **Used by:** @feature7 (CANON001_70, CANON001_71, CANON001_72, CANON001_73)
- **Content:** valid v1 schema — `{ name: "dev-pomogator", version: "1.5.0", description: "...", skills: [{name, path}, ...] }`. Имитирует реальный v1 install.

### F-2: v1 sample skill

- **Type:** static file
- **Format:** Markdown
- **Setup:** committed at `tests/fixtures/v1-install/.claude/skills/sample-skill/SKILL.md`.
- **Teardown:** через tmp project cleanup.
- **Dependencies:** F-1 (plugin manifest должен ссылаться на этот skill)
- **Used by:** @feature7 (migration copies this file)

### F-3: v1 .gitignore с marker

- **Type:** static file
- **Format:** plain text
- **Setup:** committed at `tests/fixtures/v1-install/.gitignore`. Содержит:
  ```
  node_modules/
  # >>> dev-pomogator managed >>>
  .claude/skills/
  .dev-pomogator/
  # <<< dev-pomogator managed <<<
  ```
- **Teardown:** через tmp project cleanup
- **Dependencies:** none
- **Used by:** @feature7 (CANON001_71 cleanup test)

### F-4: v1 settings.local.json hooks

- **Type:** static file
- **Format:** JSON
- **Setup:** committed at `tests/fixtures/v1-install/.claude/settings.local.json`. Содержит hook entry с project-relative path.
- **Teardown:** через tmp project cleanup
- **Dependencies:** none
- **Used by:** @feature7 (FR-7 step 3 — hook command rewrite test)

### F-5/F-6: tmp project (with/without git)

- **Type:** factory (runtime)
- **Format:** filesystem directory
- **Setup:** `helpers.ts:createTmpProject({ withGit })` создаёт unique tmp dir; если `withGit=true` — runs `git init` + `.gitignore` template
- **Teardown:** `afterEach` removes tmp dir recursively
- **Dependencies:** none
- **Used by:** ALL canonical-plugin/migration tests (most use F-5; CANON001_61 uses F-6 для no-git error case)

### F-7: tmp ~/.claude (isolated home)

- **Type:** factory (runtime)
- **Format:** filesystem directory
- **Setup:** `helpers.ts:createIsolatedHome()` создаёт unique tmp dir; sets `process.env.HOME` (Linux/Mac) или `USERPROFILE` (Windows) на этот path; cleanup restoraates оригинальное значение в `afterEach`
- **Teardown:** restore env vars + remove tmp dir
- **Dependencies:** none
- **Used by:** ALL user-scope install tests (CANON001_10..32, CANON001_120). Critical: тесты НЕ должны писать в реальный `~/.claude/` пользователя.

### F-8: user-modified skill (hash mismatch)

- **Type:** factory (derived from F-2)
- **Format:** Markdown
- **Setup:** `helpers.ts:cloneFixtureWithMod('v1-install', 'sample-skill/SKILL.md', extraContent)` — копирует F-2 в tmp project + добавляет user-content в конец файла
- **Teardown:** через tmp project cleanup
- **Dependencies:** F-1, F-2 (нужен полный v1 install context)
- **Used by:** @feature7 CANON001_74 (backup в `.user-overrides/` test)

## Dependencies Graph

```
F-1 (v1 manifest)
 ├─→ F-2 (skill referenced by manifest)
 │    └─→ F-8 (user-modified clone of F-2)
 └─→ F-4 (hooks reference skill paths)

F-3 (gitignore) — independent

F-5/F-6 (tmp project) — base for all integration tests
 └─→ F-1, F-2, F-3, F-4 are copied INTO F-5/F-6 в test setup

F-7 (isolated ~/.claude) — independent, used in parallel
```

## Gap Analysis

| @featureN | Scenario | Fixture Coverage | Gap |
|-----------|----------|-----------------|-----|
| @feature1 | CANON001_10..12 (canonical layout) | F-7 (isolated home) | none |
| @feature2 | CANON001_20 (CWD untouched) | F-5 (tmp project) + F-7 | none |
| @feature3 | CANON001_30..32 (postinstall) | F-7 + env var manipulation | none |
| @feature4 | CANON001_40 (project-scope) | F-5 + F-7 | none |
| @feature5 | CANON001_50 (gitignore opt-in) | F-5 + F-7 | none |
| @feature6 | CANON001_60..61 (exclude writer) | F-5, F-6 (no-git case) + F-7 | none |
| @feature7 | CANON001_70..74 (migration) | F-1..F-4 (v1 fixtures) + F-5 + F-7 | F-8 для CANON001_74 |
| @feature8 | CANON001_80..82 (cursor) | none required (read-only checks of repo state) | none |
| @feature11 | CANON001_110 (Desktop) | F-7 + manual verification | manual scenario — Desktop UI inspection |
| @feature12 | CANON001_120..121 (uninstall) | F-7 + post-install state | none |

## Notes

- **Cleanup порядок**: tmp project и isolated home независимы — могут cleanup в любом порядке.
- **Idempotency**: F-1..F-4 immutable static fixtures — copy не модифицирует source. F-5..F-8 unique per-scenario, нет shared state.
- **Cross-platform**: F-3 marker block использует forward slashes (per existing personal-pomogator FR-1.13). Тесты на Windows/Linux/Mac должны давать одинаковый результат.
- **Self-guard concern**: Тесты могут случайно зацепить dev-pomogator dogfood install в репо. Mitigation: F-7 isolated home + run тестов в Docker (existing `scripts/docker-test.sh`).
- **Fixture maintenance**: фикстура v1 — статический снимок старого формата (`src/` удалён в этой миграции); обновлять F-1 manifest content только если меняется детект v1 в `tools/migrate-v1-to-v2/migrate-v1-to-v2.ts`.
