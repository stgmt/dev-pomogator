# Tests Impact Report

**Generated:** 2026-05-07 by Phase 0c audit
**Updated:** 2026-05-08 — F1-3 execution outcomes documented
**Plan reference:** `~/.claude/plans/dev-pomogator-sparkling-cocoa.md` Phase 0c (audit-tests-references) + F1-3 (tests fix)

## F1-3 Execution Summary (2026-05-08)

**Deleted (6 files):**
- `tests/e2e/bundled-scripts.test.ts` — tested deleted tsx-runner installation
- `tests/e2e/claude-installer.test.ts` — tested deleted src/installer/claude.ts
- `tests/e2e/updater-404-silent.test.ts` — tested deleted src/updater/github.ts
- `tests/e2e/cli-integration.test.ts` — tested deleted bin/cli.js + dist/index.js
- `tests/features/core/CORE003_claude-installer.feature` — BDD scenarios для deleted installer
- `tests/features/core/CORE007_bundled-scripts.feature` — BDD scenarios для deleted tsx-runner

**Known-failing tests (deferred к v2 rewrite, NOT executed in F1-3):**
~50 test files в `tests/e2e/` reference deleted paths transitively через `tests/e2e/helpers.ts:42` (`spawnSync('node', ['dist/index.js', ...])` — dist/ deleted). Tests testing surviving features (skills, hooks, plugin install) need rewrite для canonical Anthropic plugin model. Task tracked в follow-up TODO «v2 test rewrite — separate spec».

**Survives unchanged (no installer dependency):**
- `tests/e2e/doctor-core.test.ts`, `tests/e2e/doctor-entry.test.ts` — pomogator-doctor engine tests (engine moved к `.claude/skills/pomogator-doctor/scripts/engine/`)
- `tests/unit/plan-gate-scope-advisory.test.ts`, `tests/unit/score-diff.test.ts` — unit tests not depending on deleted infrastructure

## Verdict

F1-3 partial. 6 obvious-dead tests removed (DELETE-candidates). Remaining ~50 tests с stale path references via helpers.ts → known broken, marked as v2-rewrite-deferred. CI will surface failures explicitly; не silent regression.

---


## Summary

26 test files scanned in `tests/`. Categorization:

| Category | Count | Action |
|----------|-------|--------|
| **DELETE** | 3 | Test verifies code being deleted (installer, updater, tsx-runner installation) |
| **UPDATE** | 8 | Test imports broken paths but logic survives |
| **SAFE** | 15 | No references к deleted/migrated paths |

## DELETE candidates

| Test file | Reason | Action timing |
|-----------|--------|----------------|
| `tests/e2e/bundled-scripts.test.ts` | 50+ references к `dist/tsx-runner.js`, `~/.dev-pomogator/scripts/tsx-runner.js` installation. Tests verify installer copies bundled scripts. После Phase 1 deletion того кода — entire test premise gone. | Delete после Phase 2 (когда canonical установлено) |
| `tests/e2e/updater-*.test.ts` (если existуют) | Tests verify `src/updater/github.ts` autoupdate logic. Canonical `/plugin marketplace update` replace это. | Delete после Phase 1 |
| `tests/e2e/installer-claude.test.ts` (если existует) | Tests verify `src/installer/claude.ts` setup logic. Canonical install replace. | Delete после Phase 1 |

(Note: список DELETE-candidates depends на actual existing tests — некоторые могут не существовать. Run actual `git ls-files tests/e2e/*.test.ts` перед execution.)

## UPDATE candidates

| Test file | Issue | Required action |
|-----------|-------|-----------------|
| `tests/e2e/chrome-devtools-mcp-mux-conflict.test.ts` | `import from '../../src/installer/mcp-conflicts.ts'` | Extract `mcp-conflicts.ts` к `src/utils/` или `tools/utils/`, update import |
| `tests/e2e/chrome-devtools-mcp-mux-mcp-config.test.ts` | `import from '../../src/installer/mcp-config.ts'` | Extract `mcp-config.ts` к `src/utils/`, update import |
| `tests/e2e/build-guard.test.ts` | References `src/index.ts` paths via `appPath()` helper | Update path references после Phase 1 deletion |
| `tests/e2e/installer.test.ts` (если existует — needs verify) | Imports installer functions | If still meaningful после canonical refactor — update imports; иначе DELETE |
| `tests/e2e/extension-test-quality.test.ts` | Tests reference `extensions/<ext>/...` paths | Update к `.claude/skills/<skill>/...` после Phase 2 migration |

## SAFE tests (no action needed)

15 tests covering BDD scenarios, hooks logic (which survives через rewrite), guards, MCP behavior. Examples:
- `tests/e2e/canonical-plugin-build.test.ts` — already aligned с canonical
- `tests/e2e/migration-v1-to-v2.test.ts` — testing migration script (FR-7)
- `tests/e2e/cursor-removal.test.ts` — testing cursor removal regression
- `tests/e2e/research-workflow-marker-guard.test.ts` (NEW) — testing новый hook (FR-4)

## Utility extraction (CRITICAL — blocks Phase 1)

Before deleting `src/installer/`:

1. Move `src/installer/mcp-conflicts.ts` → `src/utils/mcp-conflicts.ts` (or `tools/utils/mcp-conflicts.ts` repo root):
   - Update import в `tests/e2e/chrome-devtools-mcp-mux-conflict.test.ts`
2. Move `src/installer/mcp-config.ts` → `src/utils/mcp-config.ts`:
   - Update import в `tests/e2e/chrome-devtools-mcp-mux-mcp-config.test.ts`
3. Verify other `src/installer/` files имеют consumers за пределами installer (если есть — extract тоже)

## Test execution priority

1. Run audit verification: `npx vitest run tests/e2e/chrome-devtools-mcp-mux-*.test.ts` после utility extraction — confirm import update worked
2. Run full test suite после Phase 1 deletion: assert все DELETE-candidates действительно failed (expected)
3. Add new tests для FR-3 `--global` migration flag (covered by `migration-script-global-cleanup` todo)
4. Add new tests для FR-4 marker guard hook (covered by `research-workflow-marker-guard` todo)
