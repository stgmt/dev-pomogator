# Phase 1 Deletion Precheck

**Generated:** 2026-05-07 by Phase 0 audit
**Plan:** `~/.claude/plans/dev-pomogator-sparkling-cocoa.md` Phase 0a

## Deletion targets

| Path | Files | Count | Status |
|------|-------|-------|--------|
| `bin/cli.js` | `cli.js` | 1 | exists |
| `bin/postinstall.js` | — | 0 | does not exist (was speculative) |
| `dist/` | compiled output | ~40 files | exists, rebuild artifact |
| `src/installer/` | claude.ts, extensions.ts, gitignore.ts, settings-local.ts, uninstall-project.ts, mcp-conflicts.ts, mcp-config.ts | 7 | exists |
| `src/updater/` | github.ts, hook-migration.ts, content-hash.ts + 2 more | 5 | exists |
| `src/index.ts` | index.ts | 1 | exists, CLI entry point |
| `src/scripts/` | tsx-runner.js, tsx-runner-bootstrap.cjs | 2 | exists, **CRITICAL BLOCKER** |
| `scripts/build-check-update.js` | — | 1 | exists, build tooling |
| `.dev-pomogator/.claude-plugin/` | plugin.json | 1 | exists, legacy |

## BLOCKERS (must resolve before Phase 1 destructive cleanup)

### B1. tsx-runner-bootstrap.cjs referenced by 27 hooks in `.claude/settings.json`

26 occurrences в `.claude/settings.json`, all hooks (Stop=8, SessionStart=5, PreToolUse=7, PostToolUse=3, UserPromptSubmit=4) load `tsx-runner-bootstrap.cjs` через:
```
node -e "require(require('path').join(require('os').homedir(),'.dev-pomogator','scripts','tsx-runner-bootstrap.cjs'))" -- ".dev-pomogator/tools/<ext>/<script>.ts"
```

**Action required BEFORE deletion:**
- Phase 2 migration must complete first (extensions/<ext>/tools/ → .claude/skills/<skill>/scripts/ или tools/<tool>/)
- All 27 hook commands rewritten к new bootstrap path (covered by `rewrite-hook-commands-after-migration` todo)
- Bootstrap script either kept (renamed/moved to `~/.claude/scripts/bootstrap.cjs`) или canonical Anthropic plugin runtime takes over (`${CLAUDE_PLUGIN_ROOT}/...`)

### B2. ~~src/installer/mcp-conflicts.ts + src/installer/mcp-config.ts imported by tests~~ — **CORRECTED 2026-05-07**

**Original audit-pass-1 claim:** tests import mcp-conflicts.ts + mcp-config.ts utilities → blocker.

**Verification (audit-pass-2):**
- Actual `src/installer/` files: claude.ts, collisions.ts, env-setup.ts, extensions.ts, gitignore.ts, index.ts, mcp-security.ts, memory.ts, plugin-json.ts, report.ts, self-guard.ts, settings-local.ts, shared.ts, status.ts, uninstall-project.ts (15 files; **no mcp-conflicts.ts или mcp-config.ts existуют**)
- `grep "from.*src/(installer|updater|index)" tests/` → **0 matches** (no actual imports)
- Existing references: 5 comments + `appPath('src/installer/collisions.ts')` в `tests/e2e/personal-pomogator.test.ts:779` (file-existence check) + `fs.readFile('src/updater/github.ts')` в `tests/e2e/updater-404-silent.test.ts:25` (file-content check)

**Verdict:** B2 audit-pass-1 hallucinated file names. No utility extraction required. Tests с src/installer/src/updater string references → DELETE-candidates (тесты тестирующие deleted code), не UPDATE-candidates.

**B2 STATUS: FALSE POSITIVE — no action required.**

### B3. src/index.ts imports from installer/updater

`src/index.ts` обширно imports from `./installer/`, `./updater/` — это CLI entry point. Будет удалён вместе с Phase 1, но bin/cli.js → dist/index.js → src/index.ts chain нужно учесть в build process:
- Phase 1 deletes `bin/cli.js` + `src/index.ts` + `dist/` synchronously
- After Phase 1, `npx dev-pomogator` или `dev-pomogator` CLI command перестаёт существовать (intentional — distribution через canonical Anthropic mechanism, не npm)

## Non-blocker references (DOC only)

- `CLAUDE.md` references `extensions/<ext>/tools/...` paths в Commands table — update в Phase 6 (docs sync)
- `.claude/rules/extension-layout.md`, `extension-manifest-integrity.md` — entire rules become non-applicable, deletable в Phase 2

## Verdict

Phase 1 destructive cleanup **CANNOT START** until:
1. ✅ Audit done (this report)
2. ⏳ B2 resolved: extract mcp-conflicts.ts + mcp-config.ts utilities first
3. ⏳ B1 resolved: rewrite 27 hooks (depends on Phase 2 migration completion)

Recommended actual sequence:
- Extract utilities (small, safe)
- Phase 2 migration (extensions/ → .claude/skills/ etc.)
- Phase 2.5 rewrite hooks (using B1 mapping)
- THEN Phase 1 destructive deletes (with B1+B2 resolved)
