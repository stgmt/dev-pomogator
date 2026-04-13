# Research

## Контекст

Инцидент 2026-04-06 у dkorotkov: в `D:\repos\smarts` clone появилось 17 dev-pomogator хуков в `.claude/settings.json`, но `~/.dev-pomogator/scripts/tsx-runner.js` отсутствовал. Каждый hook-trigger падал с `MODULE_NOT_FOUND`. Evidence: `tsx-runner-error.log` присланный пользователем.

Расследование показало:
1. dev-pomogator никогда не коммитился в git smarts (проверено `git log --all -S "tsx-runner"` → 0 коммитов в ~80 ветках)
2. dev-pomogator `.claude/` на CLOUD4 содержит только legacy-fixation-orchestrator агенты, НЕ dev-pomogator (47 файлов — ci-*, ct-*, lf-*)
3. `.claude/settings.json` на CLOUD4 содержит ТОЛЬКО 1 хук: `block-dotnet-test.js` — это собственный team hook smarts
4. У dkorotkov 17 dev-pomogator хуков — это **untracked diff** от git-версии, появился из **его локального запуска** `dev-pomogator install`
5. `setupGlobalScripts()` в `src/installer/shared.ts:212-233` молча пишет `console.log` warning при отсутствии `dist/tsx-runner.js`, но инсталлер продолжает работать — оставляет broken state

Дополнительно: `.dev-pomogator/` в smarts не в `.gitignore`, `.mcp.json` smarts содержит plaintext JIRA/Confluence credentials untracked — рискует попасть в git при `git add .`.

## Источники

- `D:\repos\smarts\.gitignore` (575 строк, нет `.dev-pomogator/`, есть `/.claude/settings.local.json:571`)
- `D:\repos\smarts\.claude\settings.json` (git-version: 1 хук `block-dotnet-test.js`)
- `D:\repos\smarts\.mcp.json` (untracked, содержит `JIRA_API_TOKEN=Clev2!F508`, `CONFLUENCE_API_TOKEN=Clev2!F508` plaintext)
- `D:\repos\dev-pomogator\src\installer\claude.ts` — `installClaude()` flow, `installExtensionHooks()` функция
- `D:\repos\dev-pomogator\src\installer\shared.ts` — `setupGlobalScripts()`, `copyBundledScript()`, `makePortableTsxCommand()`
- `D:\repos\dev-pomogator\src\installer\memory.ts` — `registerClaudeMemMcp()` (уже пишет только в `~/.claude.json`)
- `D:\repos\dev-pomogator\extensions\specs-workflow\tools\mcp-setup\setup-mcp.py` — `get_config_path()` project-first behavior
- `D:\repos\dev-pomogator\src\config\schema.ts` — `ManagedFileEntry`, `InstalledExtension`, `ManagedFiles` types
- `D:\repos\dev-pomogator\src\utils\atomic-json.ts` — `readJsonSafe`, `writeJsonAtomic` reusable
- `D:\repos\dev-pomogator\tests\e2e\helpers.ts` — `runInstaller`, `appPath`, `homePath`, `initGitRepo` test helpers
- `D:\repos\dev-pomogator\tests\e2e\claude-installer.test.ts` — existing E2E test patterns
- context7 `/websites/code_claude` — официальная документация Claude Code про settings.local.json precedence
- `.specs/global-dir-guard/RESEARCH.md` — предыдущий инцидент 2026-03-25 с удалением `~/.dev-pomogator/` (Claude Code v2.1.83)
- `tsx-runner-error.log` (присланный user) — логи 17 broken хуков у dkorotkov

## Технические находки

### Claude Code settings.local.json precedence

Цитата из context7 `/websites/code_claude` (Configuration scopes → How scopes interact):

> When the same setting is configured in multiple scopes, more specific scopes take precedence. The order of precedence is: **Managed** (highest), **Command line arguments**, **Local**, **Project**, and **User** (lowest).

И (Hook locations):

> Placing hooks in `.claude/settings.json` limits their scope to a single project and allows them to be committed to the repository for sharing. For project-specific settings that should not be shared, use `.claude/settings.local.json`, which is typically gitignored.

Вывод: `.claude/settings.local.json` — нативная фича Claude Code для личных хуков, gitignored by convention, precedence **выше** чем `settings.json`. Merge с `settings.json` работает автоматически. Идеально для "personal pomogator".

### ManagedFileEntry уже трекает всё

`src/config/schema.ts:3-25`:
```typescript
interface ManagedFileEntry { path: string; hash: string }
interface ManagedFiles {
  commands?: ManagedFileEntry[]
  rules?: ManagedFileEntry[]
  tools?: ManagedFileEntry[]
  skills?: ManagedFileEntry[]
  hooks?: Record<string, string[]>
}
interface InstalledExtension {
  managed?: Record<string, ManagedFiles>  // projectPath -> ManagedFiles
}
```

Installer уже собирает все paths в `managedByExtension` map во время `installClaude()`. `addProjectPaths()` сохраняет в config. Вся информация для gitignore генерации уже есть — нужен только writer (`src/installer/gitignore.ts`).

### Write surface инсталлера (target project)

Полный список куда installer пишет в target project (через `installClaude()`):

| Category | Path | Source in claude.ts |
|---|---|---|
| Commands | `.claude/commands/{cmd}.md` | lines 63-92 |
| Rules | `.claude/rules/{subfolder}/{rule}.md` | lines 94-128 |
| Tools | `.dev-pomogator/tools/{name}/**` | lines 130-158 |
| Shared utils | `.dev-pomogator/tools/_shared/**` | lines 160-171 |
| Skills | `.claude/skills/{name}/**` | lines 173-195 |
| Plugin metadata | `.dev-pomogator/.claude-plugin/plugin.json` | lines 208-254 |
| Hooks + env | `.claude/settings.json` (merged) | lines 371-544 |

Write surface в HOME (безопасно — не target):
- `~/.dev-pomogator/scripts/*` (tsx-runner.js, check-update.js, launch-claude-tui.ps1, node_modules/)
- `~/.claude/settings.json` (SessionStart check-update hook, statusLine)
- `~/.claude.json` (claude-mem MCP registration)

### setupGlobalScripts молча pass через warning

`src/installer/shared.ts:212-233` — `copyBundledScript()`:

```typescript
if (await fs.pathExists(primary)) { await fs.copy(primary, dest, { overwrite: true }); return; }
if (fallbackPaths) { for (const fallback of fallbackPaths) { if (await fs.pathExists(fallback)) { ... return; } } }
console.log(`  ⚠ ${srcName} not found. Run "npm run build" first.`);
// ← continues without throwing!
```

Это root cause dkorotkov incident. Installer продолжает дальше, хуки записываются в settings.json, runner не создан — broken state.

### setup-mcp.py project-first behavior

`extensions/specs-workflow/tools/mcp-setup/setup-mcp.py:41-46`:

```python
def get_config_path(platform: str) -> Tuple[Path, str]:
    project_path = get_project_config_path(platform)  # проверяет root/.mcp.json
    if project_path:
        return project_path, "project"
    return get_global_config_path(platform), "global"
```

Project `.mcp.json` в smarts содержит **plaintext credentials** → если user запустит setup-mcp.py, наш script допишет Context7/Octocode в тот же файл рядом с secrets → повышает risk leak при `git add .mcp.json`.

### claude-mem MCP уже безопасен

`src/installer/memory.ts:610-675` — `registerClaudeMemMcp()` пишет только в `~/.claude.json` (`path.join(os.homedir(), '.claude.json')`). Это правильное поведение, spec фиксирует как invariant.

### git ls-files для collision detection

`git ls-files -- path1 path2 path3` batched call — возвращает только paths которые уже tracked в git. Быстрее чем N отдельных вызовов. Нужна MSYS_NO_PATHCONV env var на Windows для корректного path handling.

## Где лежит реализация

- Installer core: `src/installer/claude.ts`, `src/installer/shared.ts`, `src/installer/memory.ts`
- Hook runtime: `src/scripts/tsx-runner.js`, `dist/tsx-runner.js`
- Config schema: `src/config/schema.ts`, `src/utils/atomic-json.ts`
- Tests: `tests/e2e/claude-installer.test.ts`, `tests/e2e/helpers.ts`
- MCP setup: `extensions/specs-workflow/tools/mcp-setup/setup-mcp.py`
- Claude-mem: `src/installer/memory.ts`
- Updater: `src/updater/hook-migration.ts`
- Existing spec (related): `.specs/global-dir-guard/` — addresses `~/.dev-pomogator/` deletion recovery
- Build scripts: `scripts/build-check-update.js`

## Выводы

1. **`.claude/settings.local.json` — правильный target** для dev-pomogator хуков. Нативно поддерживается Claude Code, gitignored by convention, precedence выше чем settings.json, не конфликтует с team-shared settings.json.

2. **ManagedFileEntry уже полная data-модель** для gitignore generation. Нужен только writer + collapse helper.

3. **Self-guard через `package.json#name === 'dev-pomogator'`** — простая надёжная проверка. Добавить belt-and-suspenders проверку `extensions/` + `src/installer/` directory existing.

4. **Loud-fail в `copyBundledScript` — фикс одного символа** (throw вместо console.log) — убирает весь класс dkorotkov-like incidents.

5. **Fail-soft hook wrapper** (`tsx-runner-bootstrap.cjs`) — 10-строчный файл, даёт graceful degradation при исчезновении runner.

6. **Collision detection через git ls-files** — простое решение, batched call, graceful no-git.

7. **Per-project uninstall** — переиспользует `ManagedFileEntry` list, atomic config update, self-guard refuse.

8. **MCP force-global** — 3 строки в `setup-mcp.py` убирают project-first branch. Secret detection — 20 строк в новом `mcp-security.ts`.

9. **Uninstall skill** — SKILL.md файл в новом extension `personal-pomogator`, 5-шаговый алгоритм для AI агента.

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| atomic-config-save | `.claude/rules/atomic-config-save.md` | Конфиги через temp + atomic move | Writes to `.gitignore`, `settings.local.json` | FR-1, FR-2, FR-3, FR-8 |
| atomic-update-lock | `.claude/rules/atomic-update-lock.md` | Lock через flag: 'wx' (O_EXCL) | Не релевантно напрямую | N/A |
| no-unvalidated-manifest-paths | `.claude/rules/no-unvalidated-manifest-paths.md` | Пути из манифеста — resolveWithinProject | Uninstall file deletion | FR-8 |
| updater-managed-cleanup | `.claude/rules/updater-managed-cleanup.md` | Апдейтер удаляет только managed файлы | Managed file tracking | FR-1, FR-8 |
| integration-tests-first | `.claude/rules/integration-tests-first.md` | Тесты через runInstaller/spawnSync, не unit | All BDD tests | FR-1..FR-11 |
| extension-test-quality | `.claude/rules/extension-test-quality.md` | 1:1 test ↔ feature scenario, DOMAIN_NN naming | BDD tests + .feature file | All @featureN |
| specs-management | `.claude/rules/specs-workflow/specs-management.md` | 4-phase spec workflow, 13 files | Spec creation | spec-* todos |
| extension-manifest-integrity | `.claude/rules/extension-manifest-integrity.md` | Манифест = source of truth для апдейтера | New extension creation | FR-11 (personal-pomogator extension) |
| claude-md-glossary | `.claude/rules/claude-md-glossary.md` | CLAUDE.md = глоссарий на rules | Docs update | docs-update todo |
| spec-test-sync | `.claude/rules/plan-pomogator/spec-test-sync.md` | Тесты → спеки, багфикс → BDD | File Changes must include .specs/ | All file changes |
| plan-pomogator | `.claude/rules/plan-pomogator/plan-pomogator.md` | 9-section plan format | Plan file | Plan completeness |
| pomogator/no-blocking-on-tests | `.claude/rules/pomogator/no-blocking-on-tests.md` | Docker тесты в background, не блокировать | /run-tests invocation | Verification phase |
| extension-test-quality | `.claude/rules/extension-test-quality.md` | Naming DOMAIN_CODE_NN, @featureN tags | .feature + .test.ts | PERSO_NN scenarios |
| manifest-test-coverage | `.claude/rules/checklists/manifest-test-coverage.md` | Новый rule/tool в extension.json → динамический тест CORE003_RULES покрывает | New extension creation | FR-11 extension |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| `readJsonSafe` | `src/utils/atomic-json.ts` | Safe JSON read с backup recovery | Reuse для `.gitignore`, settings.local.json reads |
| `writeJsonAtomic` | `src/utils/atomic-json.ts` | Atomic JSON write через temp + move | Reuse для settings.local.json writes |
| `ManagedFileEntry` | `src/config/schema.ts:3-25` | Per-file path + hash tracking | Authoritative source для gitignore generation |
| `installedHooksByExtension` | `src/installer/claude.ts:373` | Per-extension hook commands list | Authoritative source для hook identification в migration |
| `initGitRepo` | `tests/e2e/helpers.ts` | Создание fake .git/ для тестов | Reuse в test setup |
| `runInstaller` | `tests/e2e/helpers.ts` | execSync wrapper для installer CLI | Reuse для integration тестов |
| `appPath` / `homePath` | `tests/e2e/helpers.ts` | Test path helpers | Reuse в test beforeEach |
| `scaffold-spec.ts` | `.dev-pomogator/tools/specs-generator/` | Создаёт 13 файлов спеки | Used для spec-scaffold todo |
| `analyze-features.ts` | `.dev-pomogator/tools/specs-generator/` | Analyze existing .feature patterns | Used перед написанием personal-pomogator.feature |
| `validate-spec.ts` | `.dev-pomogator/tools/specs-generator/` | Validate spec format | Used в verification |
| `audit-spec.ts` | `.dev-pomogator/tools/specs-generator/` | Cross-ref audit | Used в verification |
| `resolveWithinProject` pattern | `.claude/rules/no-unvalidated-manifest-paths.md` | Path traversal guard | Reuse в uninstall-project.ts |
| `installClaude` step 9 `addProjectPaths` | `src/installer/claude.ts:270` | Persists managed data | Wire-point для gitignore writer |
| `installExtensionHooks` | `src/installer/claude.ts:371-544` | Current hook merge logic | Extends для settings.local.json routing |
| `copyBundledScript` | `src/installer/shared.ts:212-233` | Global scripts copy | Modify для loud-fail |
| `makePortableTsxCommand` | `src/installer/shared.ts:27-31` | Hook command generator | Modify для bootstrap pattern |
| `getExtensionSkills` | `src/installer/claude.ts:173-195` | Skills install flow | Reuse для personal-pomogator extension |
| Existing skills pattern | `extensions/*/skills/*/SKILL.md` | Skill file format | Template для dev-pomogator-uninstall skill |

### Architectural Constraints Summary

- **Atomic writes obligatory** (`atomic-config-save.md`): `.gitignore` и `settings.local.json` — temp file + `fs.move`. Нельзя direct writeJson/writeFile.
- **Path traversal guard obligatory** (`no-unvalidated-manifest-paths.md`): в uninstall для each ManagedFileEntry — `resolveWithinProject` перед `fs.remove`. Нельзя доверять путям из config blindly.
- **Integration tests only** (`integration-tests-first.md`): все BDD сценарии через `runInstaller` / `spawnSync` / file system assertions. Unit тесты допустимы только как supplement.
- **1:1 test mapping** (`extension-test-quality.md`): каждый `Scenario: PERSO_NN_description` в `.feature` имеет парный `it('PERSO_NN_description')` в `.test.ts`, связаны через `@featureN` теги.
- **Spec workflow 4 phases** (`specs-management.md`): Discovery → Context → Requirements+Design → Finalization → Audit. ConfirmStop на каждой фазе через `spec-status.ts -ConfirmStop`.
- **Managed files only cleanup** (`updater-managed-cleanup.md`): при uninstall удаляем ТОЛЬКО files из ManagedFileEntry. User-authored файлы не трогаем.
- **Extension manifest integrity** (`extension-manifest-integrity.md`): новый extension `personal-pomogator` должен декларировать skills + skillFiles полностью. Dynamic test `CORE003_RULES` автоматически подхватит.
- **CLAUDE.md glossary discipline** (`claude-md-glossary.md`): при добавлении нового extension — обновить Architecture таблицу в CLAUDE.md, не раздувать.
- **Plan freshness** (`plan-freshness.md`): текущий план в `C:\Users\stigm\.claude\plans\snuggly-tumbling-lark.md` — каждый File Changes path trace'ится к текущим requirements (не stale).
