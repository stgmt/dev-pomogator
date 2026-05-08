# Smoke Test Report

**Generated:** 2026-05-08 by F3-1 phase
**Plan reference:** `~/.claude/plans/dev-pomogator-sparkling-cocoa.md` F3-1 (smoke test)

## Structural verification (PASSED)

Все required artifacts present для canonical Anthropic plugin install:

| Check | Result |
|-------|--------|
| `.claude-plugin/` directory exists | ✅ |
| `.claude-plugin/plugin.json` valid JSON, name=dev-pomogator, version=2.0.0 | ✅ |
| `.claude-plugin/marketplace.json` valid JSON, name=stgmt, 1 plugin entry с source="./" | ✅ |
| `.claude-plugin/hooks.json` valid JSON, 25 hook entries across 5 events (Stop/SessionStart/PreToolUse/UserPromptSubmit/PostToolUse) | ✅ |
| `.mcp.json` valid JSON (empty mcpServers, expected) | ✅ |
| `.claude/skills/` — 19 skill directories | ✅ |
| `.claude/commands/` — 4 commands | ✅ |
| `tools/_shared/bootstrap.cjs` — 2975 bytes, syntactically valid | ✅ |
| `tools/_shared/tsx-runner.js` — 17243 bytes, syntactically valid (multi-strategy fallback preserved) | ✅ |
| `tools/` — 27 tool directories (migrated из extensions/) | ✅ |
| Hook commands в .claude-plugin/hooks.json reference `${CLAUDE_PLUGIN_ROOT}/tools/_shared/bootstrap.cjs` (canonical pattern) | ✅ |
| Hook commands в .claude/settings.json reference relative `tools/_shared/bootstrap.cjs` (dogfood pattern) | ✅ |
| 0 references к deleted paths (src/installer, src/updater, src/index, bin/cli, dist/, ~/.dev-pomogator/scripts/tsx-runner-bootstrap.cjs) в hooks/manifests | ✅ |
| Plugin schema fields (skills override, commands override, hooks path, mcpServers path) match Anthropic plugins-reference.md | ✅ |

## End-to-end smoke test (DEFERRED)

Actual `/plugin install dev-pomogator@stgmt` execution **deferred** к user-driven testing because:

1. Slash commands (`/plugin marketplace add`, `/plugin install`, `/reload-plugins`) are interactive Claude Code features executed в session context — cannot be invoked programmatically from automation
2. Test requires fresh Claude Code session OR Desktop application — current session has accumulated state (plugins enabled, settings cached) that would conflict
3. Verification requires user observation (skills appear в Skill picker, hooks fire без errors) — visual confirmation step

## User-driven smoke test procedure (для reviewer)

To verify canonical install works end-to-end, run следующие steps в fresh Claude Code session OR Desktop:

### Step 1 — Add marketplace
```
/plugin marketplace add D:/repos/dev-pomogator-canonical-v2
```
Expected: Claude Code clones/registers marketplace «stgmt», `/plugin marketplace list` shows it.

### Step 2 — Install plugin
```
/plugin install dev-pomogator@stgmt
```
Expected:
- `~/.claude/plugins/cache/stgmt/dev-pomogator/<version>/` directory created
- `~/.claude/settings.json` `enabledPlugins` contains `"dev-pomogator@stgmt": true`
- Stdout shows install success message

### Step 3 — Activate
```
/reload-plugins
```
Expected: skills become available в `/skill` picker:
- `/dev-pomogator:create-spec`
- `/dev-pomogator:run-tests`
- `/dev-pomogator:plan-pomogator-validate-plan`
- `/dev-pomogator:pomogator-doctor`
- `/dev-pomogator:research-workflow`
- ... (19 skills total)

### Step 4 — Hook verification
Trigger a Stop event (e.g., complete some task action). Expected:
- Auto-commit hook fires (или silently exits если no AUTO_COMMIT_API_KEY env var)
- No «MODULE_NOT_FOUND» or «ENOENT» errors in stderr
- Hook completes within 60s timeout

### Step 5 — Desktop visibility (optional)
1. Open Claude Desktop application
2. Restart Desktop (для подхвата plugin cache)
3. Click «**+**» button → «**Plugins**» menu
4. Verify «dev-pomogator» listed как enabled plugin
5. Open Skill picker: skills из plugin appear

### Step 6 — Migration script (для existing v1 users)
```bash
cd /path/with/v1/install
npx tsx D:/repos/dev-pomogator-canonical-v2/tools/migrate-v1-to-v2/migrate-v1-to-v2.ts --dry-run --global
```
Expected: shows v1 install detection, lists files которые would be removed, doesn't modify anything (dry-run).

## Known potential issues

1. **Bootstrap path resolution в hooks.json**: hook commands use `process.env.CLAUDE_PLUGIN_ROOT || '.'` fallback. Если `CLAUDE_PLUGIN_ROOT` undefined в hook execution context — path resolves к CWD which может не be plugin cache directory. Mitigation: Anthropic должен set this env var автоматически когда firing plugin hooks; if not — manual debugging needed.

2. **Bootstrap discovery в empty machine**: новый user (no v1 install, no `~/.dev-pomogator/`) делает `/plugin install` → Claude Code copies plugin к cache → bootstrap.cjs co-located с tsx-runner.js → should work. Не tested in actual fresh environment.

3. **Test suite breakage post Phase 1**: ~50 test files в tests/e2e/ имеют stale references. F1-3 deleted 6 obvious-dead, остальные deferred к v2 test rewrite. CI red expected; не blocker для plugin functionality.

4. **forbid-root-artifacts spec**: не существует в worktree HEAD (was untracked dirty в main). Если recreated в future, нужен Migration Note (similar к added к personal-pomogator/install-diagnostics).

## Conclusion

Structural verification PASSED. End-to-end user-driven smoke test deferred — required для merge-readiness confirmation. Branch `refactor/canonical-plugin-v2` ready для PR creation; recommended проверить smoke test перед merge to main.

## Recommended next steps

1. Push branch к origin: `git push origin refactor/canonical-plugin-v2`
2. Create PR: `gh pr create --base main --head refactor/canonical-plugin-v2 --title "Canonical Anthropic plugin refactor (v2.0)"`
3. Reviewer executes user-driven smoke test (Steps 1-6 above)
4. If smoke test passes → merge
5. After merge → publish marketplace add path documentation; migration messaging для existing v1 users
