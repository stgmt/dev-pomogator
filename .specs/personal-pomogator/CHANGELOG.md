# Changelog

All notable changes to this feature will be documented in this file.

## [Unreleased]

### Added

- **Managed gitignore block** в target `.gitignore` — auto-generated marker block со всеми managed paths из ManagedFileEntry, atomic write, idempotent regeneration ([FR-1](FR.md#fr-1-managed-gitignore-block-feature1))
- **settings.local.json routing** — dev-pomogator hooks и env vars SHALL записываться в `.claude/settings.local.json` вместо `.claude/settings.json` (Claude Code native personal scope) ([FR-2](FR.md#fr-2-settingslocaljson-target-для-hooksenv-feature2))
- **Legacy migration** из existing `.claude/settings.json` в `.claude/settings.local.json` — detect через `installedHooksByExtension` authoritative + substring fallback ([FR-3](FR.md#fr-3-legacy-migration-из-settingsjson-feature2))
- **Self-guard** для dev-pomogator source repo — `isDevPomogatorRepo(repoRoot)` проверяет 3 условия (package.json#name + extensions/ dir + src/installer/ dir), skip personal-mode при dogfooding ([FR-4](FR.md#fr-4-self-guard-для-dev-pomogator-репо-feature3))
- **Loud-fail setupGlobalScripts** — throw Error при missing required scripts (tsx-runner.js), post-install verification ([FR-5](FR.md#fr-5-loud-fail-setupglobalscripts-feature4))
- **Fail-soft hook wrapper** `tsx-runner-bootstrap.cjs` — try/catch MODULE_NOT_FOUND → exit 0 с diagnostic, real errors propagate ([FR-6](FR.md#fr-6-fail-soft-hook-wrapper-feature5))
- **Collision detection** через batched `git ls-files --` — skip copy + skip gitignore entry для user-committed files + WARN report ([FR-7](FR.md#fr-7-collision-detection-через-git-ls-files-feature6))
- **Per-project uninstall command** `dev-pomogator uninstall --project [--dry-run]` — reads managed entries, safe delete с path traversal guard, cleanup gitignore block + settings.local.json + config ([FR-8](FR.md#fr-8-per-project-uninstall-command-feature7))
- **Force-global MCP writes** — `setup-mcp.py` всегда пишет в `~/.claude.json`, никогда в project `.mcp.json` (не смешиваем с user secrets) ([FR-9](FR.md#fr-9-force-global-mcp-writes-feature8))
- **Secret detection в project `.mcp.json`** — grep против patterns (JIRA_TOKEN, API_KEY, SECRET etc), security WARN в install report с recommendations ([FR-10](FR.md#fr-10-secret-detection-в-project-mcpjson-feature8))
- **AI agent uninstall skill** `dev-pomogator-uninstall` — Claude Code Skill для правильного soft-removal с 5-шаговым алгоритмом (safety checks → scope → CLI-first → manual fallback → verification) ([FR-11](FR.md#fr-11-ai-agent-uninstall-skill-feature9))
- **Updater syncs `_shared/` utilities** (`src/updater/shared-sync.ts`) — `extensions/_shared/.manifest.json` listed cross-extension files synced to `.dev-pomogator/tools/_shared/` on every update run, with stale-file pruning. Closes architectural gap where installer used `fs.copy` and updater used `toolFiles[]` whitelist ([FR-12](FR.md#fr-12-updater-syncs-_shared_-utilities-feature10))
- **Updater orphan dir cleanup** (`pruneEmptyDirs`) — empty parent dirs removed bottom-up after stale-file removal, stops at `.dev-pomogator/tools/` boundary ([FR-13](FR.md#fr-13-updater-orphan-dir-cleanup-feature10))
- **Updater regenerates `plugin.json`** — every project's `.dev-pomogator/.claude-plugin/plugin.json` rewritten after extension processing to reflect current `installedExtensions[]`, no stale entries. Helper extracted to `src/installer/plugin-json.ts` for reuse ([FR-14](FR.md#fr-14-updater-regenerates-pluginjson-feature10))
- **Migration sanitization completeness contract** — post-FR-3 migration `.claude/settings.json` SHALL contain ZERO dev-pomogator command substrings, ZERO env keys from `envRequirements[].name`, empty hookName arrays deleted, empty hooks object deleted, team entries preserved bit-for-bit ([FR-15](FR.md#fr-15-migration-sanitization-completeness-feature10))
- **CORE020 hook smoke test** — dynamically loads every hook command from every extension manifest, asserts no MODULE_NOT_FOUND. Catches dkidyaev incident class proactively
- **CORE021 toolFiles[] manifest completeness** — static test verifying every `.ts/.js/.cjs/.mjs/.sh/.py` file in `extensions/{ext}/{tool}/` is declared in `toolFiles[]`. Caught two real bugs: `tui-test-runner` flat-array format with bare basenames (updater couldn't resolve paths), `test-statusline/bg-task-guard/mark-bg-task.sh` not in manifest

### Changed

- **`src/installer/claude.ts:installExtensionHooks`** — routing target с `.claude/settings.json` на `.claude/settings.local.json` под self-guard false, с legacy migration
- **`src/installer/shared.ts:copyBundledScript`** — добавлено throw для REQUIRED_SCRIPTS set (не silent warning)
- **`src/installer/shared.ts:makePortableTsxCommand`** — hook command теперь ссылается на `tsx-runner-bootstrap.cjs` вместо `tsx-runner.js` напрямую
- **`src/installer/shared.ts:setupGlobalScripts`** — добавлено copying `tsx-runner-bootstrap.cjs` + post-install verification что runner существует
- **`src/updater/hook-migration.ts`** — migration targets `.claude/settings.local.json` для consistency с FR-2
- **`extensions/specs-workflow/tools/mcp-setup/setup-mcp.py:get_config_path`** — убрана project-first branch, всегда global

### Fixed

- **dkidyaev incident** (`c:\msmaster`, 2026-04-07): 5 hook scripts failing with MODULE_NOT_FOUND after auto-update — root cause was updater never syncing `extensions/_shared/`. Fixed by FR-12 (`updateSharedFiles`) + FR-13 (orphan dir prune) + CORE020 hook smoke test + CORE021 manifest completeness validation
- **`tui-test-runner` toolFiles format bug**: manifest used flat array with bare basenames (`launcher.ts`) instead of keyed object with full paths. Updater's `downloadExtensionFile` couldn't resolve them (tried `extensions/tui-test-runner/launcher.ts` instead of `extensions/tui-test-runner/tools/tui-test-runner/launcher.ts`). Manifest converted to keyed object format
- **`test-statusline/bg-task-guard/mark-bg-task.sh`**: backward-compat no-op file existed in source but missing from `toolFiles[]`. Added to manifest so updater syncs it
- **dkorotkov incident** (2026-04-06): installer не оставляет broken state с 17 failing хуками при missing `dist/tsx-runner.js` — теперь падает громко (FR-5)
- **Accidental commit risk**: dev-pomogator tools/hooks/rules/skills больше не могут случайно попасть в git через `git add .` (FR-1, FR-2)
- **Claude Code v2.1.83 updater removing `~/.dev-pomogator/`** (2026-03-25 инцидент): hooks fail-soft вместо hard-crash (FR-6) — partial mitigation, full fix в `.specs/global-dir-guard/`
- **Plaintext secrets в project `.mcp.json`**: installer warn при install, setup-mcp не дополняет file с нашими MCP серверами (FR-9, FR-10)

### Security

- Path traversal guard через `resolveWithinProject` в uninstall (Per `.claude/rules/no-unvalidated-manifest-paths.md`)
- Atomic writes для `.gitignore`, `settings.local.json`, config.json (Per `.claude/rules/atomic-config-save.md`)
- Skill не выполняет destructive команды без explicit user confirmation
- Dev-pomogator source repo protected via self-guard (не случайно уничтожим свой dogfood)

## [0.1.0] - TBD

### Added

- Initial implementation per personal-pomogator spec
