# Functional Requirements (FR)

## FR-1: Managed gitignore block @feature1

Installer SHALL записать marker block в `{repoRoot}/.gitignore` target-проекта после `addProjectPaths` (после step 9 в `src/installer/claude.ts:270`). Block содержит: `.claude/settings.local.json` (первой строкой) + все `ManagedFileEntry.path` из `managedByExtension`, нормализованные через `/`, отсортированные, с collapse per-tool/per-skill/per-rule-subfolder директорий. Маркеры: `# >>> dev-pomogator (managed — do not edit) >>>` / `# <<< dev-pomogator (managed — do not edit) <<<`. Atomic write через temp + `fs.move`. Если `.gitignore` не существует — создать с только marker block. Если block уже есть — регенерировать целиком (drop stale entries). Action пропускается при активном self-guard (FR-4).

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
**Use Case:** [UC-1](USE_CASES.md#uc-1-fresh-install-в-чистый-target-проект-feature1-feature2-feature3), [UC-2](USE_CASES.md#uc-2-re-install-после-удаления-extension-feature1)

## FR-2: settings.local.json target для hooks/env @feature2

`installExtensionHooks` в `src/installer/claude.ts:371-544` SHALL писать dev-pomogator hooks и env entries в `{repoRoot}/.claude/settings.local.json` вместо `.claude/settings.json`. Существующий `settings.json` НЕ модифицируется — team hooks preserved. Существующий `settings.local.json` читается через `readJsonSafe` (preserve user keys), dev-pomogator entries merged через существующую dedupe логику из `claude.ts:469-494`. Atomic write через `writeJsonAtomic`. Action пропускается при активном self-guard (FR-4).

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
**Use Case:** [UC-1](USE_CASES.md#uc-1-fresh-install-в-чистый-target-проект-feature1-feature2-feature3)

## FR-3: Legacy migration из settings.json @feature2

При re-install в проект где предыдущая версия installer писала в `.claude/settings.json`, installer SHALL детектить dev-pomogator hooks/env в legacy файле и мигрировать в `settings.local.json`. Идентификация:
1. **Authoritative**: через `installedExtensions[].managed[projectPath].hooks` в config.json (exact command string match)
2. **Fallback**: substring match на `.dev-pomogator/tools/` или `.dev-pomogator/scripts/` или `tsx-runner.js` в command

Env entries: матчим по именам из `extension.envRequirements[].name`. Найденные entries SHALL переноситься в `settings.local.json`, удаляться из `settings.json`. Team hooks (не матчат оба критерия) SHALL оставаться в `settings.json` нетронутыми. Action пропускается при self-guard.

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
**Use Case:** [UC-1](USE_CASES.md#uc-1-fresh-install-в-чистый-target-проект-feature1-feature2-feature3)

## FR-4: Self-guard для dev-pomogator репо @feature3

Installer SHALL детектить "running in dev-pomogator source repository" через функцию `isDevPomogatorRepo(repoRoot)`:
1. `readJsonSafe(path.join(repoRoot, 'package.json'))` → проверить `pkg?.name === 'dev-pomogator'`
2. Belt-and-suspenders: проверить existing `path.join(repoRoot, 'extensions')` directory + `path.join(repoRoot, 'src/installer')` directory
3. Все три условия должны быть true

При положительном результате installer SHALL пропускать:
- FR-1 (gitignore writer — наш `.gitignore` managed manually)
- FR-2 (settings.local.json write — мы используем `.claude/settings.json` для dogfooding)
- FR-3 (legacy migration — нет legacy, это source repo)

Копирование tools/commands/rules/skills продолжается как раньше (dogfood works). Console output: `"Detected dev-pomogator source repository — skipping personal-mode features"`.

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
**Use Case:** [UC-3](USE_CASES.md#uc-3-install-в-dev-pomogator-репо-dogfooding-feature3), [UC-8](USE_CASES.md#uc-8-uninstall-в-dev-pomogator-репо-feature7)

## FR-5: Loud-fail setupGlobalScripts @feature4

`copyBundledScript` в `src/installer/shared.ts:212-233` SHALL throw Error если `srcName` входит в `REQUIRED_SCRIPTS = new Set(['tsx-runner.js', 'tsx-runner-bootstrap.cjs'])` и файл отсутствует И в primary (`dist/`), И в fallback paths. Текущее поведение (`console.log` warning + continue) SHALL заменяться на `throw new Error(...)` с clear message: `"Fatal: {srcName} not found in {distDir}. Run 'npm run build' first."`.

После `setupGlobalScripts` completes, installer SHALL выполнять post-install verification: `if (!await fs.pathExists(runnerPath)) throw new Error('Post-install verification failed: ~/.dev-pomogator/scripts/tsx-runner.js missing')`. Это гарантирует что после успешного return из `setupGlobalScripts`, runner файл реально существует.

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)
**Use Case:** [UC-4](USE_CASES.md#uc-4-broken-dist-dkorotkov-repro-feature4)

## FR-6: Fail-soft hook wrapper @feature5

Hook command pattern SHALL измениться с прямого require на `tsx-runner.js` на использование bootstrap файла `tsx-runner-bootstrap.cjs`. `makePortableTsxCommand` в `src/installer/shared.ts:27-31` SHALL генерировать:
```
node -e "require(require('path').join(require('os').homedir(),'.dev-pomogator','scripts','tsx-runner-bootstrap.cjs'))" -- "script.ts"
```

Bootstrap файл `src/scripts/tsx-runner-bootstrap.cjs` (новый, ~15 lines):
- Try `require('~/.dev-pomogator/scripts/tsx-runner.js')`
- Catch `MODULE_NOT_FOUND` (с проверкой что error.message содержит путь к runner, не child dependency)
- Write one-line diagnostic в stderr: `"[dev-pomogator] tsx-runner.js missing ({path}) — hook no-op. Run 'npx dev-pomogator bootstrap' to fix."`
- `process.exit(0)` — не блокирует Claude Code session
- На other errors (syntax error в runner, child process error) — re-throw (bubble up)

Bootstrap копируется через `setupGlobalScripts` вместе с `tsx-runner.js`.

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)
**Use Case:** [UC-5](USE_CASES.md#uc-5-runner-исчез-после-успешной-установки-feature5)

## FR-7: Collision detection через git ls-files @feature6

Перед копированием commands/rules/skills в target project, installer SHALL проверять существующие файлы через batched `git ls-files -- {candidates}` call. Функция в новом `src/installer/collisions.ts`:

```typescript
export async function detectGitTrackedCollisions(repoRoot: string, candidatePaths: string[]): Promise<Set<string>>
```

- Если `.git/` отсутствует → return empty Set (graceful no-git)
- Иначе: `execFileSync('git', ['-C', repoRoot, 'ls-files', '--', ...candidatePaths], { env: {...process.env, MSYS_NO_PATHCONV: '1'} })`
- Parse stdout split('\n'), нормализовать paths, вернуть Set
- Error handling: если git exits non-zero (no matches) — empty Set, не throw

В `installClaude` перед copy loops (line ~63) — собрать candidate paths для commands+rules+skills (НЕ tools — они в `.dev-pomogator/` namespace, collision impossible), вызвать `detectGitTrackedCollisions`, пропускать copy + исключать из `managedByExtension` entries + WARN в install report: `"COLLISION: {path} — skipped (user-tracked in git)"`.

**Связанные AC:** [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)
**Use Case:** [UC-6](USE_CASES.md#uc-6-collision-с-user-committed-command-feature6)

## FR-8: Per-project uninstall command @feature7

Новая CLI команда `dev-pomogator uninstall --project [--dry-run]` (wire в `src/index.ts`). Реализация в новом `src/installer/uninstall-project.ts`:

```typescript
export async function uninstallFromProject(repoRoot: string): Promise<UninstallReport>
```

Алгоритм:
1. **Self-guard refuse**: если `isDevPomogatorRepo(repoRoot)` → throw `'Refusing to uninstall from dev-pomogator source repository'`
2. **Load config**: `loadConfig()` → итерировать `installedExtensions[]`, найти `managed[repoRoot]`
3. **Delete files**: для each `ManagedFileEntry.path` — `resolveWithinProject(repoRoot, entry.path)` (path traversal guard) → `fs.remove`. Skip если path outside repoRoot (log warning).
4. **Prune dirs**: walk up от each deleted file, `fs.rmdir` если directory empty and not == repoRoot. Особенно important для `.claude/rules/{subfolder}/`, `.claude/skills/{name}/`, `.dev-pomogator/tools/{name}/`.
5. **Remove gitignore block**: `removeManagedGitignoreBlock(repoRoot)` (из `src/installer/gitignore.ts`)
6. **Strip settings.local.json**: inverse FR-3 — remove dev-pomogator entries (identified via managed hooks list), preserve user keys, atomic write. Новый helper `stripDevPomogatorFromSettingsLocal` в `src/installer/settings-local.ts`.
7. **Update config**: remove `repoRoot` из `installedExtensions[i].projectPaths`, `delete installedExtensions[i].managed[repoRoot]`, save atomically через `saveConfig`.

Global `~/.dev-pomogator/scripts/` и `~/.claude.json` НЕ трогает (personal mode — только project scope).

`--dry-run` flag: preview mode, no actual deletion/writes, только print report.

**Связанные AC:** [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8)
**Use Case:** [UC-7](USE_CASES.md#uc-7-per-project-uninstall-feature7), [UC-8](USE_CASES.md#uc-8-uninstall-в-dev-pomogator-репо-feature7)

## FR-9: Force-global MCP writes @feature8

`extensions/specs-workflow/tools/mcp-setup/setup-mcp.py` SHALL всегда писать MCP серверы (Context7, Octocode) в global `~/.claude.json` (Claude platform) или `~/.cursor/mcp.json` (Cursor), НИКОГДА в project `{repoRoot}/.mcp.json`. Функция `get_config_path()` в `setup-mcp.py:41-46` SHALL убрать project-first branch, всегда возвращать `(get_global_config_path(platform), "global")`. Функция `get_project_config_path` оставляется для FR-10 detection but НЕ используется для writes.

Info print при save: `"[INFO] Writing MCP servers to global config ({config_path}) — personal mode"`.

`src/installer/memory.ts:registerClaudeMemMcp` уже пишет только в `~/.claude.json` — инвариант сохраняется (BDD test PERSO_84 защищает от регрессии).

**Связанные AC:** [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9)
**Use Case:** [UC-9](USE_CASES.md#uc-9-setup-mcppy-с-существующим-project-mcpjson-feature8), [UC-11](USE_CASES.md#uc-11-claude-mem-mcp-registration-invariant-feature8)

## FR-10: Secret detection в project .mcp.json @feature8

При `dev-pomogator install` (под self-guard false), installer SHALL проверять существует ли `{repoRoot}/.mcp.json`. Если да — читать через `readJsonSafe`, stringify JSON, grep для secret patterns через regex:

```
/\b(JIRA_(API_)?TOKEN|CONFLUENCE_(API_)?TOKEN|API_KEY|APIKEY|SECRET|PASSWORD|PRIVATE_KEY|AUTH_TOKEN|BEARER)\b/gi
```

Если match — installer SHALL добавлять WARN row в install report:

```
⚠ SECURITY: Found .mcp.json with potential secrets: JIRA_API_TOKEN, CONFLUENCE_API_TOKEN
  Risk: `git add .` will expose credentials.
  Recommendation:
    1. Move secrets to environment variables
    2. Add .mcp.json to .gitignore
    3. Or move MCP config to ~/.claude.json (global)
```

Install НЕ блокируется, только warning. Файл `.mcp.json` НЕ модифицируется (read-only check). Новый модуль `src/installer/mcp-security.ts` с функцией `checkMcpJsonForSecrets(repoRoot): Promise<SecretFinding[]>`.

**Связанные AC:** [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10)
**Use Case:** [UC-10](USE_CASES.md#uc-10-install-с-secrets-в-project-mcpjson-feature8)

## FR-11: AI agent uninstall skill @feature9

Новая Claude Code Skill `dev-pomogator-uninstall` SHALL устанавливаться через новый extension `extensions/personal-pomogator/` в target `.claude/skills/dev-pomogator-uninstall/SKILL.md`. Extension manifest:

```json
{
  "name": "personal-pomogator",
  "version": "1.0.0",
  "platforms": ["claude"],
  "category": "automation",
  "skills": { "dev-pomogator-uninstall": "skills/dev-pomogator-uninstall" },
  "skillFiles": { "dev-pomogator-uninstall": [".claude/skills/dev-pomogator-uninstall/SKILL.md"] }
}
```

SKILL.md frontmatter:
```yaml
---
name: dev-pomogator-uninstall
description: Use when user asks to remove/uninstall dev-pomogator from current project. Triggers "удали dev-pomogator", "remove dev-pomogator", "uninstall dev-pomogator", "снеси помогатор", "убери dev-pomogator". Guides safe removal via CLI-first then manual fallback with safety checks.
allowed-tools: Read, Bash, Edit, Glob, Grep
---
```

Тело SKILL.md — 5 секций (Safety Checks → Scope Selection → CLI-First → Manual Fallback → Verification). Детали в `DESIGN.md` секции "Компоненты". Skill НЕ содержит destructive команд без user confirmation.

Installer уже поддерживает skills install через `getExtensionSkills` → `src/installer/claude.ts:173-195` — дополнительных изменений в installer core не требуется.

**Связанные AC:** [AC-11](ACCEPTANCE_CRITERIA.md#ac-11-fr-11)
**Use Case:** [UC-12](USE_CASES.md#uc-12-user-просит-ai-удалить-dev-pomogator-feature9)

## FR-12: Updater syncs `_shared/` utilities @feature10

Updater (`src/updater/index.ts:checkUpdate`) SHALL sync `extensions/_shared/` to `{repoRoot}/.dev-pomogator/tools/_shared/` for every project on every update run, regardless of which extensions changed. New helper `updateSharedFiles(projectPath, previousShared)` in `src/updater/shared-sync.ts`:

1. Reads static manifest `extensions/_shared/.manifest.json` (committed alongside `_shared/` source) listing all files
2. For each file, calls `downloadExtensionFile('_shared', fileName)` (existing helper handles both local source root and GitHub raw URL fallback)
3. Atomic write to `{projectPath}/.dev-pomogator/tools/_shared/{fileName}` with `resolveWithinProject` guard
4. Computes SHA-256, returns `ManagedFileEntry[]` for config tracking
5. Removes files in `previousShared` but not in current manifest (orphan cleanup)

Result tracked in `Config.installedShared: Record<string, ManagedFileEntry[]>` keyed by project path. Failures log warning but don't abort update — partial sync better than full skip.

**Why**: installer uses `fs.copy` for `_shared/` (full directory copy at step 3b), updater historically used `toolFiles[]` whitelist. After auto-update, target `_shared/` becomes stale → hook scripts importing `../_shared/hook-utils.js` fail with `MODULE_NOT_FOUND`. Reference incident: dkidyaev (`c:\msmaster`).

**Связанные AC:** [AC-12](ACCEPTANCE_CRITERIA.md#ac-12-fr-12)
**Use Case:** UC-13 (auto-update with stale _shared/)

## FR-13: Updater orphan dir cleanup @feature10

After `updateToolFiles()` per extension returns, updater SHALL prune empty parent directories left behind by stale-file removal. New helper `pruneEmptyDirs(projectPath, removedRelativePaths)` in `src/updater/index.ts`:

1. Computes parent dir set bottom-up from each removed file path
2. Stops walking at `{projectPath}/.dev-pomogator/tools/` boundary (never deletes the tools root)
3. Sorts dirs deepest-first so leaves are pruned before parents
4. For each: `fs.readdir` → if empty, `fs.rmdir`
5. Skips silently on ENOENT or non-empty (other extensions may share dirs)

**Why**: removing files from `toolFiles[]` manifest leaves stale empty dirs accumulating after multiple updates. Cleaner state matches installer expectations.

**Связанные AC:** [AC-13](ACCEPTANCE_CRITERIA.md#ac-13-fr-13)

## FR-14: Updater regenerates `plugin.json` @feature10

After per-extension processing loop completes, updater SHALL rewrite `{repoRoot}/.dev-pomogator/.claude-plugin/plugin.json` for every project to reflect current `installedExtensions[]`. Reuses new helper `writePluginJson()` in `src/installer/plugin-json.ts` (extracted from `claude.ts`).

The helper writes `{ name, version, description, skills? }` atomically. Updater passes:
- `extensionNames`: from `config.installedExtensions[].name` (filtered by platform)
- `packageVersion`: read from upstream `package.json`
- `skills`: omitted (updater doesn't re-fetch skill metadata; installer populates this on next install)

**Why**: after extensions added or removed via re-install, `plugin.json` description becomes stale. Plugin discovery in Claude Code reads this file — stale entries can mislead users about what's installed.

**Связанные AC:** [AC-14](ACCEPTANCE_CRITERIA.md#ac-14-fr-14)

## FR-15: Migration sanitization completeness @feature10

After FR-3 legacy migration runs in `installExtensionHooks` (non-dogfood mode), the post-migration `{repoRoot}/.claude/settings.json` SHALL satisfy ALL of:

1. **Zero dev-pomogator command substrings**: no occurrence of `tsx-runner.js`, `tsx-runner-bootstrap.cjs`, `.dev-pomogator/tools/`, or `.dev-pomogator/scripts/` anywhere in `JSON.stringify(settings)`
2. **Zero env keys from envRequirements**: no key in `settings.env` matches any extension manifest's `envRequirements[].name`
3. **Empty hookName arrays deleted**: if migration empties `settings.hooks.{hookName}`, that key SHALL be `delete`d (not left as `[]`)
4. **Empty hooks object deleted**: if all hookName arrays are removed, the entire `settings.hooks` key SHALL be `delete`d
5. **Team entries preserved bit-for-bit**: any hook or env entry not matching dev-pomogator criteria SHALL remain identical to its pre-migration state

Implementation lives in `src/installer/settings-local.ts:migrateLegacySettingsJson`. Substring detection delegated to `isDevPomogatorCommand` from `src/installer/shared.ts` (single source of truth).

**Why**: incomplete migration leaves residue that confuses both users (stale references in shared team config) and the installer on subsequent runs (which might re-detect "managed" entries that should have been migrated). Bit-tight contract is the only way to be confident downstream.

**Связанные AC:** [AC-15](ACCEPTANCE_CRITERIA.md#ac-15-fr-15)
**Use Case:** UC-1 (fresh install), UC-2 (re-install)
