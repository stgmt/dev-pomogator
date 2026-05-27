# Hooks Rewrite Plan

**Generated:** 2026-05-07 by Phase 0b audit
**Plan reference:** `~/.claude/plans/dev-pomogator-sparkling-cocoa.md` Phase 2.5 (rewrite-hook-commands-after-migration)

## Hooks inventory

| Event | Count | Bootstrap reference |
|-------|-------|---------------------|
| Stop | 8 hooks | All use `~/.dev-pomogator/scripts/tsx-runner-bootstrap.cjs` |
| SessionStart | 5 hooks | Same |
| PreToolUse | 7 hooks | Same |
| PostToolUse | 3 hooks | Same |
| UserPromptSubmit | 4 hooks | Same |
| **TOTAL** | **27 hooks** | All require migration |

Total occurrences of `tsx-runner-bootstrap.cjs` в `.claude/settings.json`: **26 lines**.

## Hook command rewrite mapping

### Current pattern (all hooks)

```
node -e "require(require('path').join(require('os').homedir(),'.dev-pomogator','scripts','tsx-runner-bootstrap.cjs'))" -- ".dev-pomogator/tools/<ext>/<script>.ts"
```

### Target pattern (after Phase 2 migration)

For hooks pointing к extension tools that became part of skills:
```
node -e "require(require('path').join(require('os').homedir(),'.claude','scripts','bootstrap.cjs'))" -- ".claude/skills/<skill>/scripts/<script>.ts"
```

For hooks pointing к standalone tools (e.g., `validate-plan.ts`):
```
node -e "require(...bootstrap.cjs)" -- "tools/<tool>/<script>.ts"
```

For plugin-distributed hooks (lives внутри plugin's `.claude-plugin/hooks.json`):
```
node -e "..." -- "${CLAUDE_PLUGIN_ROOT}/skills/<skill>/scripts/<script>.ts"
```

## Migration strategy options

### Option A: Move bootstrap к `~/.claude/scripts/bootstrap.cjs` (recommended)

- Migration script global cleanup deletes `~/.dev-pomogator/scripts/tsx-runner-bootstrap.cjs`
- Replaces с `~/.claude/scripts/bootstrap.cjs` (same logic, new location)
- All 27 hooks rewrite homedir path: `.dev-pomogator` → `.claude`
- Pro: Clear separation от dev-pomogator namespace; works для multiple plugins
- Con: New file in user home; not pure canonical Anthropic mechanism

### Option B: Use `${CLAUDE_PLUGIN_ROOT}` + plugin-internal bootstrap

- Each plugin distributes its own bootstrap script: `${CLAUDE_PLUGIN_ROOT}/scripts/bootstrap.cjs`
- Hooks declared в plugin's `.claude-plugin/hooks.json` использует `${CLAUDE_PLUGIN_ROOT}/...`
- Pro: Pure canonical Anthropic plugin model
- Con: 27 hooks currently в project `.claude/settings.json` — нужно migrate их к plugin's hooks.json (или dual-distribution)

### Recommended: Hybrid

- Hooks которые distributed через plugin (skill scripts, plugin-managed) → migrate в `<repo>/.claude-plugin/hooks.json` с `${CLAUDE_PLUGIN_ROOT}` paths
- Hooks которые остаются project-specific (dogfooding в самом dev-pomogator repo) → use `~/.claude/scripts/bootstrap.cjs` (Option A path)

## Per-hook rewrite list

Хуки в `.claude/settings.json` нужно rewrite individually. Без direct file inspection (audit был aggregate), exact list по signature:

| # | Event | Matcher | Current target script | Suggested new target |
|---|-------|---------|----------------------|----------------------|
| 1-8 | Stop | `*` | `.dev-pomogator/tools/<ext>/<event>_stop.ts` (8 extensions) | `.claude/skills/<skill>/scripts/<event>_stop.ts` или `${CLAUDE_PLUGIN_ROOT}/...` если plugin-distributed |
| 9-13 | SessionStart | `*` | `.dev-pomogator/tools/<ext>/session_start.ts` | Same migration pattern |
| 14-20 | PreToolUse | `Bash`, `Edit`, `Write`, etc. | `.dev-pomogator/tools/<ext>/pre_tool.ts` | Same |
| 21-23 | PostToolUse | various | `.dev-pomogator/tools/<ext>/post_tool.ts` | Same |
| 24-27 | UserPromptSubmit | `*` | `.dev-pomogator/tools/<ext>/user_prompt.ts` | Same |

Implementation note: After Phase 2 migration completes (each `extensions/<ext>/tools/<script>.ts` → either `.claude/skills/<skill>/scripts/<script>.ts` или `tools/<tool>/<script>.ts`), Phase 2.5 todo executes batch JSON edit на `.claude/settings.json` rewriting paths per concrete migration mapping.

## Verification

After rewrite, manual verification:
1. Trigger каждого rewritten hook event in test session — confirm no «file not found» errors
2. Run `validate-plan.ts` или other tool which fires hooks — confirm они execute
3. Check `claude --debug` output для hook execution traces
