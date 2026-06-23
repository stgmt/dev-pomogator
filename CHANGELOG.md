# Changelog

All notable changes to this project will be documented in this file.

## [2.0.3] - 2026-06-24

### Fixed

- **Hooks broke when the process CWD was not the project root**: the dogfood hook command in `.claude/settings.json` resolved the bootstrap loader via `path.resolve('tools/_shared/bootstrap.cjs')` — relative to `process.cwd()`. When a Stop hook ran with the shell CWD left inside a subdirectory, every hook died with `Cannot find module '<subdir>/tools/_shared/bootstrap.cjs'`. The 22 dogfood hook commands now anchor on `CLAUDE_PROJECT_DIR` (mirroring how `.claude-plugin/hooks.json` already anchors on `CLAUDE_PLUGIN_ROOT`).
- **tsx-runner script resolution is now CWD-independent**: `resolveScriptPath` resolves the target `.ts` against `CLAUDE_PROJECT_DIR` / `CLAUDE_PLUGIN_ROOT` before falling back to the `.git`-walk, so hooks resolve their script even from a foreign CWD or where `.git` is absent (e.g. Docker). Adds `tests/e2e/hooks-cwd-independent.test.ts` (HOOKSCWD001).

## [2.0.2] - 2026-06-23

### Fixed

- **pomogator-doctor crashed on canonical plugin.json** ([#71](https://github.com/stgmt/dev-pomogator/issues/71)): check C15 (plugin-loader) assumed the v1 manifest shape (`commands`/`skills` as `{ name }` objects) and called `path.join(dir, undefined)` on the canonical v2 shape (arrays of path strings like `"./.claude/skills"`), throwing `The "path" argument must be of type string. Received undefined` on every canonical install. C15 now parses both shapes: canonical path entries are enumerated (commands = `*.md`, skills = subdirs containing `SKILL.md`), and non-string entries are skipped instead of crashing. Support/workspace folders under `skills/` without a `SKILL.md` are no longer mis-flagged as broken skills.
- **Doctor false-criticals on canonical installs** ([#71](https://github.com/stgmt/dev-pomogator/issues/71)): C3 (`~/.dev-pomogator/config.json`), C13 (version match) and C14 (managed `.gitignore` block) checked v1-installer artefacts that `/plugin install` never creates, reporting a fresh canonical clone as broken. When a canonical `.claude-plugin/plugin.json` is present and the v1 config is absent, C3/C14 now report OK and C13 falls back to comparing the plugin manifest version against `package.json`.
- **Stale reinstall hints**: doctor `reinstallHint`s pointed at the deprecated v1 `npx dev-pomogator` flow; they now reference `/plugin install dev-pomogator@stgmt --force` (canonical).

## [2.0.1] - 2026-06-23

### Fixed

- **tsx-runner crashes on Node 24** ([#69](https://github.com/stgmt/dev-pomogator/issues/69)): Strategy 0 (native TypeScript via `--experimental-strip-types`) passed `--experimental-default-type=module`, a flag removed in Node 24. Node rejected it pre-V8 with `bad option: --experimental-default-type=module` (exit 9), breaking every hook (`auto_commit_stop`, `simplify_stop`, `prompt_suggest_stop`, `capture`, `test-spec-gate`, `dedup_stop`, `tui_stop`, `build_guard`). The flag is now passed only on Node < 24; on Node 24+ ESM is ensured by default module detection + `package.json "type":"module"` + explicit `.ts` import specifiers.
- **No fall-through on rejected CLI flags** ([#69](https://github.com/stgmt/dev-pomogator/issues/69)): `bad option` is printed by Node's pre-V8 CLI parser and matched none of `RESOLVER_ERROR_TOKENS`, so the runner propagated a hard exit instead of falling through to the tsx loader family. Added `bad option` to the token list so a removed/unknown flag now degrades gracefully to tsx.

## [1.5.0] - 2026-04-07

### Added — Personal-Pomogator (FR-1..FR-11)

Spec: [`.specs/personal-pomogator/`](.specs/personal-pomogator/)

- **Managed gitignore block** (FR-1): installer writes a marker-bounded block (`# >>> dev-pomogator (managed) >>>`) to target `.gitignore`, listing all managed paths. Idempotent regeneration on every install. Personal files cannot accidentally leak into git via `git add .`.
- **settings.local.json routing** (FR-2/FR-3): dev-pomogator hooks/env now write to `.claude/settings.local.json` (Claude Code's native personal scope, gitignored by convention) instead of team-shared `settings.json`. Legacy migration moves existing dev-pomogator entries from `settings.json` → `settings.local.json` automatically.
- **Self-guard for dev-pomogator source repo** (FR-4): installer detects when running against its own repo (`package.json#name === "dev-pomogator"` + `extensions/` + `src/installer/` checks) and skips personal-mode features so dogfooding doesn't mutate `.gitignore` or move hooks.
- **Loud-fail `setupGlobalScripts`** (FR-5): missing `dist/tsx-runner.js` (or `tsx-runner-bootstrap.cjs`) now throws fatal error instead of silent `console.log` warning. Installer either fully succeeds or exits non-zero with clear "Run npm run build first" message. Fixes the 2026-04-06 dkorotkov incident (17 broken hooks in smarts).
- **Fail-soft hook wrapper** (FR-6): new `tsx-runner-bootstrap.cjs` wraps `tsx-runner.js` require in try/catch — if runner is removed after install (antivirus, Claude Code v2.1.83 updater, manual cleanup), hooks silently exit 0 with one-line stderr diagnostic instead of blocking the entire Claude Code session with `MODULE_NOT_FOUND`.
- **Collision detection via `git ls-files`** (FR-7): installer batches a single `git ls-files` call before copying commands/rules/skills. User-authored files already tracked in git are skipped (not overwritten) and excluded from the gitignore marker block. Reports `COLLISION:` warnings.
- **Per-project uninstall** (FR-8): new CLI command `npx dev-pomogator uninstall --project [--dry-run]`. Reads `installedExtensions[].managed[repoRoot]` from config, deletes managed files with path-traversal guard, prunes empty parent dirs, removes the gitignore marker block, strips dev-pomogator entries from `settings.local.json`, and updates config. Refuses to run in dev-pomogator source repo (self-guard).
- **Force-global MCP writes** (FR-9): `setup-mcp.py:get_config_path()` always writes to `~/.claude.json` / `~/.cursor/mcp.json` (global) — never to project `.mcp.json`. Prevents mixing Context7/Octocode entries with user's potential plaintext credentials in project MCP config.
- **Secret detection in project `.mcp.json`** (FR-10): installer scans existing `.mcp.json` for secret patterns (`JIRA_API_TOKEN`, `CONFLUENCE_API_TOKEN`, `API_KEY`, `SECRET`, `PASSWORD`, etc.) and prints SECURITY warning with mitigation recommendations. Read-only check, install continues.
- **AI agent uninstall skill** (FR-11): new Claude Code skill `dev-pomogator-uninstall` triggered by phrases like "удали dev-pomogator" / "remove dev-pomogator". Guides AI agent through 5-step safe removal: safety checks → scope selection → CLI-first dry-run → manual fallback → verification.

### New Modules

- `src/installer/self-guard.ts` — `isDevPomogatorRepo` detector
- `src/installer/gitignore.ts` — managed marker block writer/remover, namespace collapse helper
- `src/installer/settings-local.ts` — `.claude/settings.local.json` writer + legacy migration
- `src/installer/collisions.ts` — git-tracked file collision detection
- `src/installer/uninstall-project.ts` — per-project uninstall function
- `src/installer/mcp-security.ts` — secret pattern detection in project `.mcp.json`
- `src/scripts/tsx-runner-bootstrap.cjs` — fail-soft hook wrapper
- `src/utils/path-safety.ts` — `resolveWithinProject` shared with updater (extracted for reuse)
- `src/utils/atomic-json.ts:writeFileAtomic` — non-JSON atomic write helper
- `extensions/personal-pomogator/` — new extension hosting the uninstall skill
- `src/updater/shared-sync.ts` — FR-12 publisher (was inlined in bundle, now in source); exports `updateSharedFiles`, `hasMissingSharedDir`
- `extensions/_shared/.manifest.json` — published manifest listing 3 utility files (`hook-utils.ts`, `marker-utils.ts`, `index.ts`); without it FR-12 sync was 100% dead at upstream
- `.claude/rules/ts-import-extensions.md` — new rule: relative imports in `extensions/**/*.ts` MUST use `.ts` extension

### Changed

- `src/installer/claude.ts:installExtensionHooks` — branches on self-guard: dogfood writes to `settings.json`, target projects write to `settings.local.json` via new helpers
- `src/installer/shared.ts:makePortableTsxCommand` — generates hook commands referencing `tsx-runner-bootstrap.cjs` instead of `tsx-runner.js` directly (FR-6)
- `src/installer/shared.ts:copyBundledScript` — `REQUIRED_SCRIPTS` set throws on missing required files (FR-5)
- `src/installer/shared.ts:setupGlobalScripts` — bundles `tsx-runner-bootstrap.cjs`, post-install verification with `Promise.all`
- `src/installer/shared.ts:isDevPomogatorCommand` — single source of truth for hook identification (used by both dogfood scrub and personal-mode migration)
- `src/installer/claude.ts` — collision detection wired before copy loops, gitignore writer + secret check after `addProjectPaths`
- `src/index.ts` — `uninstall --project` subcommand parsing
- `extensions/specs-workflow/tools/mcp-setup/setup-mcp.py:get_config_path()` — force-global, project-first branch removed
- `scripts/build-check-update.js` — bundles `tsx-runner-bootstrap.cjs` to `dist/`
- `tests/e2e/helpers.ts:runInstaller` — switched to `spawnSync` to capture both stdout/stderr (needed for FR-10 secret warnings); `setupCleanState` cleans `settings.local.json` between runs
- `src/scripts/tsx-runner.js` — refactored 5 copies of try/catch into single `STRATEGIES` table with `{name, loader, run, onCacheError?}` metadata. Replaced the brittle `if (!msg.includes('A') && !msg.includes('B') && !msg.includes('C'))` chain with `isResolverError(err)` classifier over `RESOLVER_ERROR_TOKENS` array. Fall-through on resolver errors now happens only when the next strategy uses a different loader family (`node-strip` → `tsx`); pointless retries within the same `tsx` family are eliminated. First resolver error is logged to `~/.dev-pomogator/logs/tsx-runner.log` with originating strategy name
- `src/updater/standalone.ts` — added `recoverMissingShared(config)` helper invoked from BOTH entry points (`checkOnly()` for SessionStart, `main()` for legacy auto-update) BEFORE the cooldown gate. Probes `installedShared[projectPath]` and triggers `updateSharedFiles` directly when `_shared/` directory is physically missing. Persists recovered hashes back to config
- `src/updater/index.ts:checkUpdate` — added `effectiveForce` override before cooldown gate using `hasMissingSharedDir` probe; resolver-error fall-through chain compiled into the updater bundle
- `extensions/**/*.ts` — migrated 98 relative import specifiers from `.js` to `.ts` across 49 files. TypeScript "tsc convention" of writing `.js` extensions in source while files are actually `.ts` is incompatible with Node 22.6+ native `--experimental-strip-types`; the migration enables Strategy 0 (native) to actually work, eliminating the 200-500ms wasted on fall-through per hook invocation

### Fixed

- **dkorotkov incident (2026-04-06)**: installer no longer leaves broken state with hooks written but runtime wrapper missing
- **Hook scrub bug**: dogfood path now uses `isDevPomogatorCommand` (single source of truth) which catches `tsx-runner.js` and `tsx-runner-bootstrap.cjs` references — previously only `.dev-pomogator/tools/` substring was matched, leaving orphaned wrapper hooks on re-install
- **Pre-existing test infrastructure bug**: `extensions/{name}/tools/{name}/script.ts` source path lacks `_shared/` neighbor (only present at installed `.dev-pomogator/tools/_shared/`). Tests now use installed path, fixing 8 simplify-stop + 4 test-quality + 1 auto-commit failures
- **tui-statusline tests**: state contamination between test files (personal-pomogator's `setupCleanState` removed `_shared/`); added isolated `beforeAll` install in SessionStart Hook describe
- **`bundled-scripts.test.ts:CORE007_09`**: pre-existing `indexOf` vs `lastIndexOf` bug — now finds Strategy 0 catch block correctly. Later (this release) the test was rewritten away from string-proximity grep entirely to a structural check of the `RESOLVER_ERROR_TOKENS` array literal
- **`collapseToDirectoryEntries`**: dead code (`parentCounts.get(...) >= 1` always-true guard) removed, simplified to single-pass
- **dkidyaev incident (`c:\msmaster`)** — `SessionStart:resume hook error … loadOrImport (node:internal/modules/esm/loader:242:38)`. Three independent causes fixed:
  - **Layer 1 (97a7c86)**: tsx-runner now falls through to `tsx` on `ERR_MODULE_NOT_FOUND` from Node 22.6+ native `--experimental-strip-types`, instead of treating it as a fatal script error
  - **Layer 2 (d0ef47f)**: extension `.ts` files migrated from `.js` import specifiers to `.ts`, so native strip-types actually resolves them on the first try (no fall-through tax)
  - **Layer 3 (2b22919)**: `checkUpdate` and `checkOnly` now probe `installedShared[projectPath]` before the cooldown gate; legacy installs (pre-commit `6b475e4`, where the installer never copied `_shared/`) recover on the very next SessionStart instead of waiting 24 hours
- **HTTP 404 leak in SessionStart output** (85f725d): `src/updater/github.ts:fetchWithRetry` no longer prints `⚠ HTTP 404 for …` when an extension manifest is unreachable upstream. 404 for extension manifest is normal for local/dev-only extensions; only non-404 statuses (5xx, 403, network errors) are still logged
- **personal-pomogator extension never on upstream** (5c6f51c): `extensions/personal-pomogator/extension.json` and `.claude/skills/dev-pomogator-uninstall/SKILL.md` were locally untracked; the SessionStart updater hook hit 404 on every session start. Both files now committed

### Tests

- `tests/e2e/personal-pomogator.test.ts` — 33 BDD scenarios across 9 feature groups (PERSO001_10..93)
- `tests/e2e/claude-installer.test.ts` — new `CORE003: Personal-mode non-dogfood path` describe (CORE003_15..18) validating settings.local.json routing under `DEV_POMOGATOR_SKIP_SELF_GUARD=1` env
- 4 documented skips (PERSO001_23/30/41/61) with reasons
- Regression: 35 failures → 2 (only pre-existing claude-mem worker timeouts remain)
- `tests/e2e/bundled-scripts.test.ts` — added `CORE007_10` (strategy table + isResolverError + spawn smoke for broken-import behaviour), `CORE007_11` (regression: zero `.js` relative import specifiers in `extensions/`), and rewrote `CORE007_09` from brittle string-proximity grep to structural `RESOLVER_ERROR_TOKENS` array slicing
- `tests/e2e/updater-parity.test.ts` — published the in-progress CORE020 suite from working tree, plus added `CORE020_05` (forced sync recovers physically deleted `_shared/` while cooldown is active)
- `tests/e2e/updater-404-silent.test.ts` — new file with `CORE006_05` source-grep test ensuring `fetchWithRetry` guards `console.log` behind the `status !== 404` check, including the rebuilt bundle
- Final Docker regression: 802/810 passed, 4 skipped, 4 failed — all 4 failures are pre-existing (claude-mem worker timeouts, untracked `installer-hook-smoke.test.ts` env mismatch, `PERSO001_27a` legacy migration leaving stale env keys). Zero regressions from this release's commits

### Documentation

- `.specs/personal-pomogator/` — full 15-file spec (USER_STORIES, USE_CASES, RESEARCH, FR, NFR, AC, REQUIREMENTS, DESIGN, FIXTURES, TASKS, FILE_CHANGES, CHANGELOG, README, SCHEMA, .feature)
- `CLAUDE.md` — Architecture section updated with settings.local.json routing + personal-pomogator notes; Rules glossary table extended with `ts-import-extensions` entry
- `.claude/rules/updater-managed-cleanup.md` — extended with gitignore block + settings.local.json scope
- `.claude/rules/ts-import-extensions.md` — new rule explaining the `.ts` import specifier convention for `extensions/**/*.ts`, with Node docs quote, structural reasoning, and `tsconfig.json` migration notes for projects that switch to `tsc` compilation

## [0.1.0] - 2026-01-16

### Added
- Initial release
- `suggest-rules` command for Cursor and Claude Code
- Interactive CLI installer with Inquirer
- Auto-update for Cursor with 6-hour cooldown
- Platform selection (Cursor, Claude Code, or both)
- Configuration persistence in `~/.dev-pomogator/config.json`
- `--status` command to show current configuration
- `--update` command to force update check
