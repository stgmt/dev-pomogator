# Acceptance Criteria (EARS)

## AC-1 (FR-1) @feature1

**Требование:** [FR-1: Managed gitignore block](FR.md#fr-1-managed-gitignore-block-feature1)

- WHEN installer завершает writing managed files AND `isDevPomogatorRepo(repoRoot) === false` THEN system SHALL append or update `# >>> dev-pomogator (managed — do not edit) >>>` marker block в ``repoRoot`/.gitignore`.
- IF `.gitignore` не существует THEN system SHALL создать его с только marker block.
- WHEN marker block уже существует THEN system SHALL заменить его содержимое (not append duplicates).
- WHEN re-install после удаления extension B THEN system SHALL dropped stale entries from block (полная регенерация из текущего `managedByExtension`).
- WHEN paths содержат backslashes (Windows) THEN system SHALL нормализовать в forward slashes внутри marker block.
- WHEN managed files в `.dev-pomogator/tools/specs-generator/` (30+ files) THEN system SHALL collapse в single directory entry `.dev-pomogator/tools/specs-generator/`.

## AC-2 (FR-2) @feature2

**Требование:** [FR-2: settings.local.json target для hooks/env](FR.md#fr-2-settingslocaljson-target-для-hooksenv-feature2)

- WHEN installer processes extension hooks AND `isDevPomogatorRepo(repoRoot) === false` THEN system SHALL писать hooks/env в ``repoRoot`/.claude/settings.local.json`, NOT в `.claude/settings.json`.
- IF `.claude/settings.json` содержит team hooks не матчащие dev-pomogator criteria THEN system SHALL оставить их intact.
- IF `.claude/settings.local.json` уже существует с user-authored hooks THEN system SHALL preserve user keys AND merge наши entries через dedupe logic.
- WHEN env vars из `extension.envRequirements` THEN system SHALL писать их в `settings.local.json.env`, не в `settings.json.env`.

## AC-3 (FR-3) @feature2

**Требование:** [FR-3: Legacy migration из settings.json](FR.md#fr-3-legacy-migration-из-settingsjson-feature2)

- WHEN installer detects dev-pomogator entries в legacy ``repoRoot`/.claude/settings.json` THEN system SHALL переместить их в `.claude/settings.local.json` AND удалить из `.claude/settings.json`.
- IF moved entries создают duplicates в `settings.local.json` THEN system SHALL dedupe по command string.
- IF `installedHooksByExtension` map доступен из persisted config THEN system SHALL использовать его для authoritative match (иначе fallback на substring match).
- WHEN `settings.json` после migration становится пустым `{}` AND был created только нами (нет других keys) THEN system MAY оставить его пустым (не удалять — preserve file existence).

## AC-4 (FR-4) @feature3

**Требование:** [FR-4: Self-guard для dev-pomogator репо](FR.md#fr-4-self-guard-для-dev-pomogator-репо-feature3)

- WHEN `package.json` at `repoRoot` contains `"name": "dev-pomogator"` AND `extensions/` directory exists AND `src/installer/` directory exists THEN `isDevPomogatorRepo(repoRoot)` SHALL return `true`.
- WHEN `isDevPomogatorRepo === true` THEN system SHALL NOT write/modify `.gitignore`.
- WHEN `isDevPomogatorRepo === true` THEN system SHALL NOT create `.claude/settings.local.json`.
- WHEN `isDevPomogatorRepo === true` THEN system SHALL NOT migrate legacy `settings.json` entries.
- WHEN `isDevPomogatorRepo === true` THEN tools/commands/rules/skills copies STILL proceed (dogfood works).
- WHEN `isDevPomogatorRepo === true` THEN system SHALL log info line: `"Detected dev-pomogator source repository — skipping personal-mode features"`.

## AC-5 (FR-5) @feature4

**Требование:** [FR-5: Loud-fail setupGlobalScripts](FR.md#fr-5-loud-fail-setupglobalscripts-feature4)

- WHEN `dist/tsx-runner.js` AND `src/scripts/tsx-runner.js` fallback both missing THEN installer SHALL exit with non-zero code.
- WHEN required script missing THEN stderr SHALL contain `"tsx-runner.js not found"` AND `"Run 'npm run build' first"`.
- WHEN `setupGlobalScripts` completes BUT `~/.dev-pomogator/scripts/tsx-runner.js` does not exist THEN installer SHALL throw with clear fatal message наговоря точный путь.
- WHEN required script missing THEN target `.claude/settings.local.json` SHALL NOT be created (no half-done state).

## AC-6 (FR-6) @feature5

**Требование:** [FR-6: Fail-soft hook wrapper](FR.md#fr-6-fail-soft-hook-wrapper-feature5)

- WHEN hook fires AND `~/.dev-pomogator/scripts/tsx-runner.js` missing THEN bootstrap SHALL exit with code 0.
- WHEN runner missing THEN stderr SHALL contain one-line diagnostic matching pattern `/\[dev-pomogator\] tsx-runner\.js missing/`.
- WHEN diagnostic is printed THEN it SHALL NOT contain Node.js stack trace (clean one-liner).
- WHEN `tsx-runner.js` exists but child script errors (exit code 1) THEN bootstrap SHALL propagate non-zero exit code.
- WHEN `tsx-runner.js` has syntax error THEN bootstrap SHALL throw/propagate (not swallow).

## AC-7 (FR-7) @feature6

**Требование:** [FR-7: Collision detection через git ls-files](FR.md#fr-7-collision-detection-через-git-ls-files-feature6)

- WHEN file path is already listed in `git ls-files` of target repo THEN installer SHALL skip copying.
- WHEN collision detected THEN path SHALL be excluded from managed entries (not added to gitignore marker block).
- WHEN collision detected THEN install report SHALL contain WARN row: `"COLLISION: {path} — skipped (user-tracked in git)"`.
- IF `.git/` directory не существует в target THEN collision detection SHALL skip (return empty Set) AND install continues normally.
- WHEN multiple collisions detected THEN `git ls-files` call SHALL be batched (single subprocess, not N calls).
- WHEN running on Windows THEN `MSYS_NO_PATHCONV=1` env var SHALL be passed to git subprocess.

## AC-8 (FR-8) @feature7

**Требование:** [FR-8: Per-project uninstall command](FR.md#fr-8-per-project-uninstall-command-feature7)

- WHEN `dev-pomogator uninstall --project` runs в valid target project THEN every managed file из `managed[repoRoot]` SHALL be deleted via `fs.remove`.
- WHEN deleting THEN path SHALL be validated через `resolveWithinProject` (path traversal guard) — paths outside `repoRoot` SHALL be skipped with warning.
- WHEN files deleted THEN empty parent directories SHALL be pruned (walk up, `fs.rmdir` if empty).
- WHEN uninstall completes THEN `.gitignore` marker block SHALL be removed (preserving user entries outside block).
- WHEN uninstall completes THEN `.claude/settings.local.json` SHALL have dev-pomogator hooks+env removed (preserving user keys).
- WHEN uninstall completes THEN config SHALL have `repoRoot` removed from `installedExtensions[].projectPaths` AND `managed[repoRoot]` deleted.
- IF running в dev-pomogator source repo (self-guard) THEN command SHALL exit with refusal message AND no files deleted.
- WHEN `--dry-run` flag passed THEN NO actual deletions/writes, только preview report printed.

## AC-9 (FR-9) @feature8

**Требование:** [FR-9: Force-global MCP writes](FR.md#fr-9-force-global-mcp-writes-feature8)

- WHEN `setup-mcp.py --claude` runs AND project ``repoRoot`/.mcp.json` exists THEN script SHALL write Context7/Octocode entries в `~/.claude.json`, NOT в project file.
- WHEN `~/.claude.json` не существует THEN script SHALL create it с empty `{"mcpServers": {}}` structure AND add our entries.
- IF project `.mcp.json` exists THEN script SHALL NOT modify it (no project writes at all).
- WHEN script writes THEN console output SHALL contain `"[INFO] Writing MCP servers to global config"`.
- WHEN `src/installer/memory.ts:registerClaudeMemMcp` runs THEN claude-mem SHALL register only в `~/.claude.json` (invariant test, no behavior change).

## AC-10 (FR-10) @feature8

**Требование:** [FR-10: Secret detection в project .mcp.json](FR.md#fr-10-secret-detection-в-project-mcpjson-feature8)

- WHEN installer runs AND ``repoRoot`/.mcp.json` exists AND self-guard === false AND content matches secret pattern regex THEN install report SHALL contain `SECURITY WARN` row naming matched pattern names.
- WHEN installer runs AND `.mcp.json` exists AND no patterns match THEN no security warning SHALL be printed.
- WHEN installer runs AND `.mcp.json` does not exist THEN no security check SHALL be performed.
- WHEN secret pattern detected THEN `.mcp.json` SHALL NOT be modified (read-only check).
- WHEN warning printed THEN it SHALL include recommendations: "move to env vars", "add to .gitignore", "or move to ~/.claude.json".
- WHEN warning printed THEN install SHALL continue (warning does not block).

## AC-11 (FR-11) @feature9

**Требование:** [FR-11: AI agent uninstall skill](FR.md#fr-11-ai-agent-uninstall-skill-feature9)

- WHEN installer runs with `personal-pomogator` extension enabled THEN `.claude/skills/dev-pomogator-uninstall/SKILL.md` SHALL be installed в target project.
- WHEN SKILL.md frontmatter is parsed THEN `description` field SHALL contain trigger words: "удали dev-pomogator", "remove dev-pomogator", "uninstall dev-pomogator", "снеси помогатор".
- WHEN SKILL.md body is read THEN it SHALL document 5-step algorithm: safety-check → scope-selection → CLI-first → manual-fallback → verification.
- WHEN AI agent reads SKILL.md THEN it SHALL find explicit instruction to refuse в dev-pomogator source repo.
- WHEN AI agent reads SKILL.md THEN it SHALL find CLI command `dev-pomogator uninstall --project --dry-run` mentioned as preferred approach.
- WHEN AI agent reads SKILL.md THEN it SHALL find manual fallback steps referencing `ManagedFileEntry` / config.json.
- WHEN AI agent reads SKILL.md THEN it SHALL find verification step mentioning `git status --porcelain`.
- WHEN SKILL.md `allowed-tools` frontmatter is set THEN it SHALL include Read, Bash, Edit, Glob, Grep (no destructive tools without user confirmation).

## AC-12 (FR-12) @feature10

**Требование:** [FR-12: Updater syncs `_shared/` utilities](FR.md#fr-12-updater-syncs-_shared_-utilities-feature10)

- WHEN updater runs AND `extensions/_shared/hook-utils.ts` was modified upstream THEN target `.dev-pomogator/tools/_shared/hook-utils.ts` SHALL contain identical bytes after update completes.
- WHEN a file was added to upstream `_shared/.manifest.json` THEN target SHALL contain the new file after next update.
- WHEN a file was removed from upstream `_shared/.manifest.json` AND that file appears in `Config.installedShared[projectPath]` THEN updater SHALL delete it from target on next run.
- WHEN updater syncs `_shared/` THEN it SHALL track written files via SHA-256 hashes in `Config.installedShared[projectPath]`.
- IF `_shared/.manifest.json` is unavailable or invalid THEN updater SHALL log warning and continue without aborting (partial > skip).

## AC-13 (FR-13) @feature10

**Требование:** [FR-13: Updater orphan dir cleanup](FR.md#fr-13-updater-orphan-dir-cleanup-feature10)

- WHEN updater removes the last file in `.dev-pomogator/tools/{ext}/sub/` THEN `sub/` directory SHALL be removed in the same update cycle.
- IF parent `{ext}/` becomes empty after pruning `sub/` THEN it SHALL also be removed (recursive bottom-up walk).
- WHEN walking up THEN walk SHALL stop at `.dev-pomogator/tools/` boundary — the tools root SHALL never be deleted.
- IF a directory still contains files (other extensions sharing it) THEN it SHALL NOT be removed.
- WHEN ENOENT or other I/O error during prune THEN updater SHALL skip silently (no abort, no error logged).

## AC-14 (FR-14) @feature10

**Требование:** [FR-14: Updater regenerates plugin.json](FR.md#fr-14-updater-regenerates-pluginjson-feature10)

- WHEN updater finishes processing all extensions THEN `.dev-pomogator/.claude-plugin/plugin.json` `description` SHALL list exactly current `installedExtensions[].name` set (filtered by platform), with no stale entries from previously-removed extensions.
- WHEN updater writes plugin.json THEN it SHALL use atomic write (`writeJsonAtomic`).
- WHEN `package.json` is unreadable THEN plugin.json `version` SHALL fall back to "0.0.0".
- WHEN regen fails for one project THEN updater SHALL log warning and continue with other projects (graceful per-project isolation).

## AC-15 (FR-15) @feature10

**Требование:** [FR-15: Migration sanitization completeness](FR.md#fr-15-migration-sanitization-completeness-feature10)

- WHEN installer runs migration AND legacy `.claude/settings.json` contained mixed team + dev-pomogator entries spanning multiple hook formats (Stop, PreToolUse with matcher, SessionStart, UserPromptSubmit, PostToolUse) THEN post-migration `.claude/settings.json` SHALL contain ZERO of: `tsx-runner.js`, `tsx-runner-bootstrap.cjs`, `.dev-pomogator/tools/`, `.dev-pomogator/scripts/`.
- WHEN migration completes AND seeded env had keys matching extension `envRequirements[].name` THEN those keys SHALL be removed from `settings.env`.
- WHEN migration empties a hookName array (e.g. all `Stop` entries were dev-pomogator) THEN that key SHALL be deleted from `settings.hooks`, not left as `[]`.
- WHEN migration empties the entire `hooks` object THEN it SHALL be deleted from settings, not left as `{}`.
- WHEN team entries existed alongside dev-pomogator entries THEN every team entry SHALL be preserved bit-for-bit identical (matcher, hooks array structure, timeout, etc.).
