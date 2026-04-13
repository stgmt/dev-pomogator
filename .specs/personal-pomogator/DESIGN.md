# Design

## Реализуемые требования

- [FR-1: Managed gitignore block](FR.md#fr-1-managed-gitignore-block-feature1)
- [FR-2: settings.local.json target для hooks/env](FR.md#fr-2-settingslocaljson-target-для-hooksenv-feature2)
- [FR-3: Legacy migration из settings.json](FR.md#fr-3-legacy-migration-из-settingsjson-feature2)
- [FR-4: Self-guard для dev-pomogator репо](FR.md#fr-4-self-guard-для-dev-pomogator-репо-feature3)
- [FR-5: Loud-fail setupGlobalScripts](FR.md#fr-5-loud-fail-setupglobalscripts-feature4)
- [FR-6: Fail-soft hook wrapper](FR.md#fr-6-fail-soft-hook-wrapper-feature5)
- [FR-7: Collision detection через git ls-files](FR.md#fr-7-collision-detection-через-git-ls-files-feature6)
- [FR-8: Per-project uninstall command](FR.md#fr-8-per-project-uninstall-command-feature7)
- [FR-9: Force-global MCP writes](FR.md#fr-9-force-global-mcp-writes-feature8)
- [FR-10: Secret detection в project .mcp.json](FR.md#fr-10-secret-detection-в-project-mcpjson-feature8)
- [FR-11: AI agent uninstall skill](FR.md#fr-11-ai-agent-uninstall-skill-feature9)

## Компоненты

### Новые модули (create)

- **`src/installer/self-guard.ts`** — функция `isDevPomogatorRepo(repoRoot: string): Promise<boolean>` детектирует "running in dev-pomogator source repository" через 3 условия (package.json#name + extensions/ dir + src/installer/ dir). Используется FR-1..FR-3 и FR-8 для пропуска personal-mode действий при dogfooding.

- **`src/installer/gitignore.ts`** — marker block writer/remover/collapse helper. Публичный API: `writeManagedGitignoreBlock(repoRoot, managedPaths)`, `removeManagedGitignoreBlock(repoRoot)`, `collapseToDirectoryEntries(paths)` (exported для тестов). Atomic write через temp + `fs.move`. Forward-slash normalization.

- **`src/installer/settings-local.ts`** — writer и legacy migration helpers. Публичный API: `writeHooksToSettingsLocal(repoRoot, hookEntries, envVars)`, `migrateLegacySettingsJson(repoRoot, ourHookCommands, ourEnvKeys): Promise<{moved, hooks, env}>`, `stripDevPomogatorFromSettingsLocal(repoRoot, managedHooks)`. Использует `readJsonSafe`/`writeJsonAtomic`.

- **`src/installer/collisions.ts`** — git ls-files collision detection. Публичный API: `detectGitTrackedCollisions(repoRoot, candidatePaths): Promise<Set<string>>`. Batched single `git ls-files --` call с MSYS_NO_PATHCONV env. Graceful no-git return empty Set.

- **`src/installer/uninstall-project.ts`** — per-project uninstall function. Публичный API: `uninstallFromProject(repoRoot): Promise<UninstallReport>`. Алгоритм из 7 шагов (см. "Алгоритм" ниже). Использует `isDevPomogatorRepo` для refuse, `removeManagedGitignoreBlock`, `stripDevPomogatorFromSettingsLocal`, `resolveWithinProject`.

- **`src/installer/mcp-security.ts`** — secret pattern detection. Публичный API: `checkMcpJsonForSecrets(repoRoot): Promise<SecretFinding[]>`. Читает `{repoRoot}/.mcp.json`, grep против regex `/\b(JIRA_(API_)?TOKEN|CONFLUENCE_(API_)?TOKEN|API_KEY|APIKEY|SECRET|PASSWORD|PRIVATE_KEY|AUTH_TOKEN|BEARER)\b/gi`. Read-only, no modifications.

- **`src/scripts/tsx-runner-bootstrap.cjs`** — fail-soft wrapper для hook commands. 15-строчный CJS файл, try `require(tsx-runner.js)`, catch MODULE_NOT_FOUND → stderr diagnostic + exit 0, else throw.

- **`extensions/personal-pomogator/extension.json`** — manifest нового extension для доставки uninstall skill. Declares `skills`, `skillFiles`. Минимальный extension (только skills, без tools/rules/hooks).

- **`extensions/personal-pomogator/skills/dev-pomogator-uninstall/SKILL.md`** — Claude Code Skill файл с frontmatter (name, description с trigger words, allowed-tools) и body (5-шаговый алгоритм для AI агента).

### Модифицированные модули (edit)

- **`src/installer/claude.ts`** — wire всех новых модулей:
  - Import `isDevPomogatorRepo`, `writeManagedGitignoreBlock`, `collapseToDirectoryEntries`, `writeHooksToSettingsLocal`, `migrateLegacySettingsJson`, `detectGitTrackedCollisions`, `checkMcpJsonForSecrets`
  - Перед step 1 copy: collision detection для commands/rules/skills candidates, exclude из copy AND из managedByExtension
  - `installExtensionHooks` (line 371): под self-guard false — route в settings.local.json (FR-2) через `writeHooksToSettingsLocal`, предварительно вызвать `migrateLegacySettingsJson` (FR-3)
  - После `addProjectPaths` (line 270): под self-guard false — `checkMcpJsonForSecrets` + warn, `writeManagedGitignoreBlock` (FR-1)
  - Helper `collectManagedPaths(managedByExt: Map)` собирает flat list paths

- **`src/installer/shared.ts`**:
  - `copyBundledScript` (line 212-233): добавить `REQUIRED_SCRIPTS = new Set(['tsx-runner.js', 'tsx-runner-bootstrap.cjs'])`, throw если required missing (FR-5)
  - `setupGlobalScripts` (line 235): добавить copy для `tsx-runner-bootstrap.cjs` после tsx-runner.js, post-install verification (FR-5)
  - `makePortableTsxCommand` (line 27-31): заменить `'tsx-runner.js'` на `'tsx-runner-bootstrap.cjs'` в require path (FR-6)

- **`src/updater/hook-migration.ts`** — обновить migration чтобы таргетил `.claude/settings.local.json` после migration, не `.claude/settings.json` (consistent с FR-2)

- **`src/index.ts`** — CLI parsing для `uninstall --project [--dry-run]` subcommand (FR-8)

- **`scripts/build-check-update.js`** — добавить `copyToDist('src/scripts/tsx-runner-bootstrap.cjs', 'dist/tsx-runner-bootstrap.cjs')` в copy list

- **`extensions/specs-workflow/tools/mcp-setup/setup-mcp.py`** — `get_config_path()` убирает project-first branch, всегда global (FR-9). Info print при save.

### Не изменяем (invariant preservation)

- **`src/installer/memory.ts:registerClaudeMemMcp`** — уже пишет только в `~/.claude.json` (HOME). FR-9 фиксирует это как invariant через BDD test PERSO_84, без изменений кода.

## Где лежит реализация

- **App-код**: `src/installer/*.ts` (installer core), `src/scripts/*.cjs` (runtime helpers)
- **Tests**: `tests/e2e/personal-pomogator.test.ts` (integration через runInstaller)
- **Extension manifest**: `extensions/personal-pomogator/extension.json`
- **Skill files**: `extensions/personal-pomogator/skills/dev-pomogator-uninstall/SKILL.md`
- **Build config**: `scripts/build-check-update.js` (add bootstrap.cjs to bundle list)
- **Wiring**: `src/installer/claude.ts` (installClaude flow), `src/index.ts` (CLI parsing)

## Директории и файлы

```
src/installer/
├── self-guard.ts               (create, FR-4)
├── gitignore.ts                (create, FR-1)
├── settings-local.ts           (create, FR-2, FR-3)
├── collisions.ts               (create, FR-7)
├── uninstall-project.ts        (create, FR-8)
├── mcp-security.ts             (create, FR-10)
├── claude.ts                   (edit, wire all)
└── shared.ts                   (edit, loud-fail + bootstrap)

src/scripts/
└── tsx-runner-bootstrap.cjs    (create, FR-6)

src/updater/
└── hook-migration.ts           (edit, local.json target)

src/
└── index.ts                    (edit, CLI uninstall --project)

scripts/
└── build-check-update.js       (edit, bundle bootstrap)

extensions/specs-workflow/tools/mcp-setup/
└── setup-mcp.py                (edit, FR-9 force-global)

extensions/personal-pomogator/       (create, FR-11)
├── extension.json
└── skills/dev-pomogator-uninstall/
    └── SKILL.md

tests/e2e/
└── personal-pomogator.test.ts  (create, 33 scenarios)

.specs/personal-pomogator/       (create via scaffold, 15 files)
├── USER_STORIES.md
├── USE_CASES.md
├── RESEARCH.md
├── REQUIREMENTS.md
├── FR.md
├── NFR.md
├── ACCEPTANCE_CRITERIA.md
├── DESIGN.md
├── FIXTURES.md
├── TASKS.md
├── FILE_CHANGES.md
├── CHANGELOG.md
├── README.md
├── personal-pomogator.feature
└── personal-pomogator_SCHEMA.md
```

## Алгоритм

### `installClaude()` с personal-mode (новый flow)

```
1. findRepoRoot()
2. isDogfood = await isDevPomogatorRepo(repoRoot)
3. Load extensions, filter by --claude
4. Collect candidate paths for commands/rules/skills
5. IF NOT isDogfood:
   collisions = await detectGitTrackedCollisions(repoRoot, candidates)
6. Copy commands (skip if in collisions)
7. Copy rules (skip if in collisions)
8. Copy tools (no collision check — namespace safe)
9. Copy skills (skip if in collisions)
10. Install plugin.json
11. IF NOT isDogfood:
    installExtensionHooks → writeHooksToSettingsLocal + migrateLegacySettingsJson
    ELSE:
    installExtensionHooks → write to .claude/settings.json (legacy dogfood)
12. setupGlobalScripts (throws on missing required scripts, post-verify runner exists)
13. Run post-install hooks for extensions
14. addProjectPaths (persist managed data)
15. IF NOT isDogfood:
    findings = await checkMcpJsonForSecrets(repoRoot)
    IF findings.length > 0: console.warn SECURITY WARN
    collect managedPaths from managedByExtension
    collapsed = collapseToDirectoryEntries(managedPaths)
    await writeManagedGitignoreBlock(repoRoot, ['.claude/settings.local.json', ...collapsed])
16. setupClaudeHooks (home ~/.claude/settings.json — no change)
17. setupClaudeStatusLine (no change)
```

### `writeManagedGitignoreBlock(repoRoot, paths)`

```
1. gitignorePath = path.join(repoRoot, '.gitignore')
2. existing = await readFile(gitignorePath) OR ''
3. lines = existing.split('\n')
4. beginIdx = lines.findIndex(line => line === MARKER_BEGIN)
5. endIdx = lines.findIndex(line => line === MARKER_END)
6. IF beginIdx === -1 OR endIdx === -1:
   // no existing block — append new block
   newBlock = [MARKER_BEGIN, ...sortedPaths, MARKER_END]
   newContent = existing + '\n' + newBlock.join('\n') + '\n'
7. ELSE:
   // replace block contents
   before = lines.slice(0, beginIdx + 1)
   after = lines.slice(endIdx)
   newLines = [...before, ...sortedPaths, ...after]
   newContent = newLines.join('\n')
8. tempPath = gitignorePath + '.tmp'
9. await writeFile(tempPath, newContent)
10. await fs.move(tempPath, gitignorePath, { overwrite: true })
```

### `collapseToDirectoryEntries(paths)`

```
1. Sort paths ascending
2. Group by first-N-segments parent (try maximal dir that still captures all children)
3. For each directory D where ALL managed files under D are in paths:
   replace N file entries with single D/ entry
4. Return deduplicated sorted list
```

### `uninstallFromProject(repoRoot)`

```
1. IF isDevPomogatorRepo(repoRoot): throw "Refusing to uninstall from dev-pomogator source repository"
2. config = await loadConfig()
3. managedForProject = []
   for ext in config.installedExtensions:
     if ext.managed?.[repoRoot]: managedForProject.push({ext: ext.name, managed: ext.managed[repoRoot]})
4. allPaths = flatten managedForProject to list of ManagedFileEntry.path
5. For each path:
   resolvedPath = resolveWithinProject(repoRoot, path)
   if resolvedPath === null: skippedFiles.push(path); continue
   await fs.remove(resolvedPath)
   deletedFiles.push(path)
6. Prune empty dirs — walk up from each deleted path, fs.rmdir if empty
7. await removeManagedGitignoreBlock(repoRoot)
8. managedHookCommands = flatten managedForProject.managed.hooks
9. await stripDevPomogatorFromSettingsLocal(repoRoot, managedHookCommands)
10. for ext in config.installedExtensions:
    ext.projectPaths = ext.projectPaths.filter(p => p !== repoRoot)
    delete ext.managed?.[repoRoot]
11. await saveConfig(config) (atomic)
12. return { deletedFiles, skippedFiles, errors }
```

### SKILL.md 5-step algorithm (for AI agent)

```
Step 1: Safety Checks
  - Read package.json at repoRoot
  - If name === "dev-pomogator": refuse — "This is dev-pomogator source repository"
  - Confirm with user: "I will remove dev-pomogator from {repoRoot}. This will delete managed files, strip .gitignore block, clean .claude/settings.local.json. Continue?"

Step 2: Scope Selection
  - Ask user: project-only (default) or also clean global ~/.dev-pomogator/?
  - Default to project-only (personal mode philosophy)

Step 3: CLI-First Approach
  - Try: Bash tool → `npx dev-pomogator uninstall --project --dry-run`
  - If command exists and succeeds:
    - Present dry-run output to user
    - Ask: "Proceed with actual uninstall?"
    - On yes: run without --dry-run
    - On no: stop
  - If command fails (not found, stale installation): proceed to Step 4

Step 4: Manual Fallback
  - Read ~/.config/dev-pomogator/config.json
  - Find installedExtensions[*].managed[repoRoot] entries
  - For each ManagedFileEntry:
    - Verify path is within repoRoot (safety)
    - Delete via Bash `rm -f` (or PowerShell Remove-Item on Windows)
    - Track deleted paths
  - Prune empty parent dirs under .claude/rules/, .claude/skills/, .dev-pomogator/tools/
  - Use Edit tool to remove .gitignore marker block between `# >>> dev-pomogator` and `# <<<`
  - Use Edit tool to strip dev-pomogator entries from .claude/settings.local.json
  - Update config.json: remove repoRoot from projectPaths, delete managed[repoRoot]

Step 5: Verification
  - Run Bash: `git status --porcelain`
  - Assert no output mentions .claude/, .dev-pomogator/
  - Read .gitignore → assert no `# >>> dev-pomogator` lines
  - Read .claude/settings.local.json → assert no tsx-runner, no dev-pomogator/tools/ references
  - Report to user: "Uninstall complete. N files deleted. Verify: git status clean, gitignore block removed, settings.local.json clean."
```

## API

### New internal APIs

#### `src/installer/self-guard.ts`
```typescript
export async function isDevPomogatorRepo(repoRoot: string): Promise<boolean>
```

#### `src/installer/gitignore.ts`
```typescript
export async function writeManagedGitignoreBlock(repoRoot: string, managedPaths: string[]): Promise<void>
export async function removeManagedGitignoreBlock(repoRoot: string): Promise<void>
export function collapseToDirectoryEntries(paths: string[]): string[]
```

#### `src/installer/settings-local.ts`
```typescript
export interface HookEntry {
  command: string;
  matcher?: string;
  timeout?: number;
  type: 'command';
}
export async function writeHooksToSettingsLocal(
  repoRoot: string,
  hookEntriesByName: Record<string, HookEntry[]>,
  envVars: Record<string, string>
): Promise<void>
export async function migrateLegacySettingsJson(
  repoRoot: string,
  ourHookCommands: Set<string>,
  ourEnvKeys: Set<string>
): Promise<{ moved: number }>
export async function stripDevPomogatorFromSettingsLocal(
  repoRoot: string,
  managedHookCommands: Set<string>
): Promise<void>
```

#### `src/installer/collisions.ts`
```typescript
export async function detectGitTrackedCollisions(
  repoRoot: string,
  candidatePaths: string[]
): Promise<Set<string>>
```

#### `src/installer/uninstall-project.ts`
```typescript
export interface UninstallReport {
  deletedFiles: string[];
  skippedFiles: string[];
  errors: string[];
}
export async function uninstallFromProject(repoRoot: string, options?: { dryRun?: boolean }): Promise<UninstallReport>
```

#### `src/installer/mcp-security.ts`
```typescript
export interface SecretFinding {
  pattern: string;
  context: string;
}
export async function checkMcpJsonForSecrets(repoRoot: string): Promise<SecretFinding[]>
```

### CLI: `dev-pomogator uninstall --project`

- Command: `dev-pomogator uninstall --project [--dry-run]`
- Parses via existing argv logic in `src/index.ts`
- Calls `uninstallFromProject(findRepoRoot(), { dryRun: args['--dry-run'] })`
- Prints `UninstallReport` formatted: deleted count + skipped count + errors + status

## Reuse Plan

| Переиспользуем | Откуда | Как |
|---|---|---|
| `readJsonSafe` / `writeJsonAtomic` | `src/utils/atomic-json.ts` | settings.local.json reads/writes |
| `ManagedFileEntry`, `ManagedFiles`, `InstalledExtension` | `src/config/schema.ts:3-25` | gitignore generation source, uninstall iteration |
| `installedHooksByExtension` map | `src/installer/claude.ts:373` | Authoritative hook identification в migration |
| `addProjectPaths`, `saveConfig`, `loadConfig` | `src/installer/shared.ts` + `src/config/index.ts` | Config atomic updates |
| `findRepoRoot` | `src/utils/repo.ts:13` | CLI uninstall entry point |
| `copyBundledScript` | `src/installer/shared.ts:212-233` | Bootstrap file copying |
| `getExtensionSkills` flow | `src/installer/claude.ts:173-195` | Install uninstall skill через existing pipe |
| `writeJsonAtomic` | `src/utils/atomic-json.ts` | setup-mcp.py has own Python atomic write, не reuse но parallel concept |
| `initGitRepo`, `appPath`, `homePath`, `runInstaller` | `tests/e2e/helpers.ts` | Integration test setup |
| Dedupe logic из `installExtensionHooks` | `src/installer/claude.ts:469-494` | Extract to helper, reuse в settings-local.ts |
| Hook 3-format handling | `src/installer/claude.ts:381-411` | Reuse в migrateLegacySettingsJson |

## BDD Test Infrastructure (ОБЯЗАТЕЛЬНО)

**Classification:** TEST_DATA_ACTIVE

**Evidence:**
1. Тесты создают temp git repositories с fake `.gitignore`, `.claude/settings.json`, `.dev-pomogator/`, `.mcp.json` — данные на файловой системе.
2. Каждый тест modificates filesystem state (installer runs, uninstall runs, file deletions) — нужен cleanup после.
3. Given-шаги `.feature` файла требуют предустановленных данных: fake project с user commands, fake HOME с `~/.dev-pomogator/scripts/`, fake `settings.json` с team hooks.
4. Feature взаимодействует с git subprocess (ls-files) — нужна fake `.git/` structure через `initGitRepo` helper.

**Verdict:** Нужны beforeEach/afterEach hooks для создания temp repos и cleanup. Reuse helpers из `tests/e2e/helpers.ts`. Также нужны test fixtures для fake `.gitignore`, fake settings.json, fake `.mcp.json` с secrets — в `tests/fixtures/personal-pomogator/`.

### Существующие hooks

| Hook файл | Тип | Тег/Scope | Что делает | Можно переиспользовать? |
|-----------|-----|-----------|------------|------------------------|
| `tests/e2e/helpers.ts:runInstaller` | Helper | Global | Execsync wrapper для CLI installer | Да — все PERSO_* тесты |
| `tests/e2e/helpers.ts:initGitRepo` | Helper | Global | Создаёт fake `.git/` structure (HEAD + config) | Да — для collision detection tests |
| `tests/e2e/helpers.ts:appPath` | Helper | Global | Resolve test target path | Да — beforeEach setup |
| `tests/e2e/helpers.ts:homePath` | Helper | Global | Resolve fake HOME path | Да — ~/.dev-pomogator tests |
| `tests/e2e/claude-installer.test.ts:beforeEach` | Setup | Per-test | Clean temp state | Reference — pattern для personal-pomogator.test.ts |

### Новые hooks

| Hook файл | Тип | Тег/Scope | Что делает | По аналогии с |
|-----------|-----|-----------|------------|---------------|
| `tests/e2e/personal-pomogator.test.ts:beforeEach` | BeforeEach | per-test | Создать temp project dir, initGitRepo, seed .gitignore с user entries, optional seed .claude/settings.json с team hook, optional seed .mcp.json с secrets | `claude-installer.test.ts` beforeEach |
| `tests/e2e/personal-pomogator.test.ts:afterEach` | AfterEach | per-test | Удалить temp project dir, restore HOME env если менялось, cleanup fake ~/.dev-pomogator | helpers.ts cleanup patterns |
| `tests/e2e/personal-pomogator.test.ts:describe beforeAll` | BeforeAll | per-file | Build dist если stale (чтобы runInstaller работал) | `claude-installer.test.ts` beforeAll |

### Cleanup Strategy

1. **afterEach обязательно удаляет**:
   - Temp target project dir (created в beforeEach)
   - Fake HOME `.dev-pomogator/` (если тест создавал)
   - Fake `~/.claude.json`, `~/.claude/settings.json` если менялись
2. **Cascading cleanup order**: сначала удалить target project (содержит managed files), затем fake HOME (содержит scripts)
3. **Git state cleanup**: если тест делал `git add .` — не commit, не push, только `git reset` optional
4. **Error handling**: afterEach wraps в try/catch чтобы один failed cleanup не блокировал следующие тесты

### Test Data & Fixtures

| Fixture/Data | Путь | Назначение | Lifecycle |
|-------------|------|------------|-----------|
| Fake target project | `${APP_DIR}/personal-pomogator-test-{uuid}/` | Temp project для runInstaller | per-scenario |
| Fake `.gitignore` with user entries | `${APP_DIR}/.gitignore` seeded | Test что user entries preserved | per-scenario |
| Fake `.claude/settings.json` with team hook | `${APP_DIR}/.claude/settings.json` | Test что team hooks preserved | per-scenario (some tests) |
| Fake `.claude/settings.local.json` pre-existing | `${APP_DIR}/.claude/settings.local.json` | Test preserve user keys | per-scenario (some tests) |
| Fake `.mcp.json` с secrets | `${APP_DIR}/.mcp.json` | Test FR-10 detection | per-scenario (FR-10 tests) |
| Fake user command | `${APP_DIR}/.claude/commands/create-spec.md` (git-added) | Test collision detection | per-scenario (FR-7 tests) |
| Fake `~/.dev-pomogator/scripts/tsx-runner.js` | `${HOME}/.dev-pomogator/scripts/` | Test fail-soft wrapper (delete after install) | per-scenario (FR-6 tests) |
| dev-pomogator-like package.json | `${APP_DIR}/package.json` с `"name":"dev-pomogator"` | Test self-guard activation | per-scenario (FR-4 tests) |
| `.git/` directory (fake) | `${APP_DIR}/.git/HEAD + config` | Git subprocess support | per-scenario (all git-based tests) |

_Details: see [FIXTURES.md](FIXTURES.md)_

### Shared Context / State Management

| Ключ | Тип | Записывается в | Читается в | Назначение |
|------|-----|----------------|------------|------------|
| `tempProjectDir` | string | beforeEach | all it() blocks | Isolated target project path |
| `tempHomeDir` | string | beforeEach (if HOME mocked) | all it() blocks | Isolated fake HOME |
| `originalHome` | string | beforeEach (if HOME mocked) | afterEach | Restore real HOME after test |
| `installerExitCode` | number | runInstaller call | assertions | Non-zero check для FR-5 tests |
| `installerStderr` | string | runInstaller call | assertions | Error message verification |
