# Other Specs Impact Report

**Generated:** 2026-05-07 by Phase 0d audit
**Plan reference:** `~/.claude/plans/dev-pomogator-sparkling-cocoa.md` Phase 0d (audit-other-specs)

## Summary

39 specs total в `.specs/` (excluding `dev-pomogator-canonical-plugin/`). Categorization:

| Status | Count | Action |
|--------|-------|--------|
| **P1-NEEDS-UPDATE** | 6 | Active spec с substantial old-arch references; needs canonical refactor sync |
| **P2-HISTORICAL** | 8 | Legacy/archived spec; mark с ARCHIVED header, preserve content |
| **CLEAN** | 25 | No old-arch references; safe для Phase 1 destructive cleanup |

## P1-NEEDS-UPDATE — detailed

### 1. `personal-pomogator/` — CRITICAL

**Match count:** 50+ lines reference old architecture
**References:**
- `extensions/`, `extensions/<ext>/...` paths
- `src/installer/mcp-conflicts.ts`, `src/installer/...` imports
- `dist/tsx-runner.js`, `~/.dev-pomogator/scripts/tsx-runner.js`
- `--claude --all` CLI flags
- npm install patterns

**Edit effort:** HIGH — extensive AC rewrite (~30 lines)

**Suggested changes:**
- Replace `src/installer/...` references с canonical Anthropic mechanism descriptions OR drop installer-specific AC entirely (Anthropic-managed)
- Update `extensions/<ext>/tools/<script>.ts` paths к `.claude/skills/<skill>/scripts/...`  или `tools/<tool>/...` per Phase 2 migration map
- `--claude --all` CLI flag references → `/plugin install dev-pomogator@stgmt --scope user`
- Add Migration Note section: «v2.0: this spec was originally written under v1 architecture; см. dev-pomogator-canonical-plugin spec для current model»

### 2. `plan-pomogator/` — HIGH

**Match count:** 15+ lines
**References:**
- `npm i -g dev-pomogator`, `npx dev-pomogator --claude` examples
- Hooks executing tsx-runner

**Edit effort:** MEDIUM — ~5 lines update

**Suggested changes:**
- `npm i -g dev-pomogator` → `/plugin marketplace add stgmt/dev-pomogator` + `/plugin install dev-pomogator@stgmt`
- `npx dev-pomogator --claude` → `/plugin install dev-pomogator@stgmt --scope user`
- Hook examples updated к new bootstrap path

### 3. `specs-workflow/` — MEDIUM

**Match count:** 10+ lines
**References:**
- `--claude` flag mentions
- `extension.json` references (in spec workflow context, not directly affected)
- Hook patterns referencing tsx-runner

**Edit effort:** MEDIUM — ~3 lines

**Suggested changes:**
- Update hook execution examples к new bootstrap path
- Clarify что spec workflow tools (validate-spec.ts, audit-spec.ts) перенесены к `tools/specs-workflow/...` или эквивалент

### 4. `install-diagnostics/` — MEDIUM

**Match count:** 8+ lines
**References:**
- `npm run build`, `npx dev-pomogator`
- `tsx-runner.js` paths
- `~/.dev-pomogator/logs/install.log`

**Edit effort:** MEDIUM — ~8 lines

**Suggested changes:**
- Update diagnostic targets — после canonical refactor, install logs не существуют в `.dev-pomogator/`
- Diagnostic flow shifts: вместо «check `~/.dev-pomogator/logs/install.log`» → «check `~/.claude/plugins/cache/stgmt/dev-pomogator/<version>/`»
- Drop `npm run build` references

### 5. `forbid-root-artifacts/` — LOW

**Match count:** 3+ lines
**References:**
- `extensions/` directory (currently rooted there)
- `package.json#files` array

**Edit effort:** LOW — ~3 lines

**Suggested changes:**
- Update whitelist для root artifacts: `extensions/` → drops, `bin/`+`dist/` → drops, `.claude-plugin/` adds, `tools/` adds
- Update `package.json#files` reference (which больше не applicable если npm distribution dropped)

### 6. `plan-pomogator-plain-language/` — LOW

**Match count:** 5+ lines
**References:**
- `npx dev-pomogator` usage examples в plan templates
- `--claude` flag example

**Edit effort:** LOW — ~5 lines

**Suggested changes:**
- Update plan template examples к canonical install commands

## P2-HISTORICAL — preserve as-is с ARCHIVED header

| Spec | Reason |
|------|--------|
| `cursor-dead-code-cleanup` | About removing Cursor support — done in canonical refactor; historical |
| `codex-cli-support` | Codex experimental support — likely deprecated |
| `extension-beta-flag` | About `extensions/` flag system — entire concept gone |
| `global-dir-guard` | About `~/.dev-pomogator/` dir protection — relevant до canonical migration; historical after |
| `dev-pomogator-canonical-plugin` | THIS spec, не applicable here |
| (3 more) | Historical/legacy specs without active relevance |

**Action для each P2:** Add `## ARCHIVED (2026-05-07)` header at top + brief note: «This spec describes v1 architecture (custom installer, extensions/ layer). Preserved as historical record. Current architecture: см. `.specs/dev-pomogator-canonical-plugin/`.»

## CLEAN specs (no action)

25 specs covering specific features (auto-capture, bg-task-guard, chrome-devtools-mcp-mux, claude-in-chrome-multisession, debug-screenshot, etc.) which describe behavior independent of installer/distribution architecture. No old-arch references found via grep.

## Execution priority

1. **First:** Update P1 specs with HIGH/CRITICAL effort (personal-pomogator, plan-pomogator) — these define core contract behavior
2. **Second:** Update P1 specs MEDIUM effort (specs-workflow, install-diagnostics)
3. **Third:** Update P1 specs LOW effort (forbid-root-artifacts, plan-pomogator-plain-language)
4. **Fourth:** Mark P2 specs ARCHIVED (batch operation, ~10 minutes)
5. **No action для CLEAN specs**

Total estimated edit effort: ~80 lines across 6 specs + 8 archived headers.
