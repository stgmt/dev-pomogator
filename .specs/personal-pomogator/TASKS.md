# Tasks

## TDD Workflow

> Задачи организованы по TDD: Red → Green → Refactor.
> Phase 0 создаёт все BDD сценарии до начала реализации (все тесты RED).
> Phase 1-8 реализует FR по одному, каждая реализация делает @featureN сценарии GREEN.
> Phase 9 — рефакторинг и финальная верификация.

## Phase -1: Infrastructure Prerequisites

> Фича НЕ требует новых сервисов, БД, или внешних конфигов. Только file system + git + node. Все dependencies уже есть в dev-pomogator (fs-extra, cross-spawn, chalk). Skipped.

## Phase 0: BDD Foundation (Red)

> Создать .feature файл и test skeleton ПЕРЕД реализацией.
> DESIGN.md classification = **TEST_DATA_ACTIVE** → Phase 0 содержит задачи для всех fixtures + hooks.

- [ ] Запустить analyze-features: `./.dev-pomogator/tools/specs-generator/analyze-features.ts -Format text -DomainCode PERSO` — получить table patterns, step dictionary, свободный domain number
- [ ] Создать `.specs/personal-pomogator/personal-pomogator.feature` с Background + 33 сценариями в 9 группах @feature1..@feature9 (PERSO_10..93) @feature1 @feature2 @feature3 @feature4 @feature5 @feature6 @feature7 @feature8 @feature9
  _Source: analyze-features report + DESIGN.md BDD Test Infrastructure_
- [ ] Создать `tests/e2e/personal-pomogator.test.ts` с describe/it skeleton 1:1 mapping к .feature через @featureN теги
  _Requirements: all FR, `.claude/rules/extension-test-quality.md`_
- [ ] Создать beforeEach hook в `personal-pomogator.test.ts` — F-1 (target dir) + F-3 (initGitRepo) + F-2 (gitignore seed)
  _Source: DESIGN.md "BDD Test Infrastructure" > "Новые hooks"_
  _Reuse: `tests/e2e/helpers.ts` (appPath, homePath, initGitRepo)_
- [ ] Создать afterEach hook в `personal-pomogator.test.ts` — cleanup temp dirs, restore HOME env
  _Source: DESIGN.md "BDD Test Infrastructure" > "Cleanup Strategy"_
- [ ] Создать helper `createFakeDevPomogatorRepo(targetDir)` в `tests/e2e/helpers.ts` — F-10 fixture для FR-4 self-guard тестов
  _Source: DESIGN.md "Test Data & Fixtures" > F-10_
- [ ] Убедиться что все 33 сценария FAIL (Red) — скелеты с `expect.fail('not implemented')`

## Phase 1: Self-guard + Gitignore writer (Green) @feature1 @feature3

> FR-4 первым — чтобы защитить dev-pomogator репо от мутаций во время работы над другими FR.
> FR-1 вторым — основа для personal-mode protection.

- [ ] Создать `src/installer/self-guard.ts` с `isDevPomogatorRepo(repoRoot)` — 3 условия (package.json#name + extensions/ dir + src/installer/ dir) -- @feature3
  _Requirements: [FR-4](FR.md#fr-4-self-guard-для-dev-pomogator-репо-feature3)_
  _Leverage: `src/utils/atomic-json.ts:readJsonSafe`_
- [ ] Создать `src/installer/gitignore.ts` с API: `writeManagedGitignoreBlock`, `removeManagedGitignoreBlock`, `collapseToDirectoryEntries` -- @feature1
  _Requirements: [FR-1](FR.md#fr-1-managed-gitignore-block-feature1)_
  _Leverage: atomic write pattern из `.claude/rules/atomic-config-save.md`_
- [ ] Добавить `MARKER_BEGIN` / `MARKER_END` constants + block regeneration логику
- [ ] Реализовать `collapseToDirectoryEntries` — sort + group-by-parent + collapse если все leaves managed
- [ ] Wire в `src/installer/claude.ts` после `addProjectPaths` (~line 270) — self-guard check + collectManagedPaths helper + writeManagedGitignoreBlock call
  _Requirements: [FR-1](FR.md#fr-1-managed-gitignore-block-feature1), [FR-4](FR.md#fr-4-self-guard-для-dev-pomogator-репо-feature3)_
- [ ] Verify: сценарии PERSO_10..16 (@feature1 gitignore) и PERSO_30..33 (@feature3 self-guard) переходят из Red в Green

## Phase 2: settings.local.json routing + migration (Green) @feature2

> FR-2 + FR-3 — переносим hooks/env в local, мигрируем legacy.

- [ ] Создать `src/installer/settings-local.ts` с API: `writeHooksToSettingsLocal`, `migrateLegacySettingsJson`, `stripDevPomogatorFromSettingsLocal` -- @feature2
  _Requirements: [FR-2](FR.md#fr-2-settingslocaljson-target-для-hooksenv-feature2), [FR-3](FR.md#fr-3-legacy-migration-из-settingsjson-feature2)_
  _Leverage: `src/utils/atomic-json.ts`, dedupe logic из `src/installer/claude.ts:469-494`_
- [ ] Реализовать `writeHooksToSettingsLocal` — readJsonSafe existing + merge с preserve user keys + writeJsonAtomic
- [ ] Реализовать `migrateLegacySettingsJson` — detect через installedHooksByExtension (authoritative) + substring fallback, move to local, clean original
- [ ] Изменить `installExtensionHooks` в `src/installer/claude.ts:371-544` — под self-guard false route в settings.local.json, call migration first
  _Requirements: [FR-2](FR.md#fr-2-settingslocaljson-target-для-hooksenv-feature2), [FR-3](FR.md#fr-3-legacy-migration-из-settingsjson-feature2)_
- [ ] Обновить `src/updater/hook-migration.ts` чтобы targeted `.claude/settings.local.json` для consistency
- [ ] Verify: сценарии PERSO_20..26 (@feature2) переходят из Red в Green

## Phase 3: Loud-fail setupGlobalScripts (Green) @feature4

> Fix dkorotkov incident root cause.

- [ ] Добавить `REQUIRED_SCRIPTS` constant в `src/installer/shared.ts` (top of file)
- [ ] Модифицировать `copyBundledScript` (lines 212-233) — throw Error для required scripts если primary и fallbacks все отсутствуют -- @feature4
  _Requirements: [FR-5](FR.md#fr-5-loud-fail-setupglobalscripts-feature4)_
- [ ] Добавить post-install verification в `setupGlobalScripts` (line 235+) — проверить `fs.pathExists(runnerPath)` after all copies, throw если false
- [ ] Verify: сценарии PERSO_40..42 (@feature4) переходят из Red в Green

## Phase 4: Fail-soft hook wrapper (Green) @feature5

> Bootstrap wrapper для graceful degradation при runner loss.

- [ ] Создать `src/scripts/tsx-runner-bootstrap.cjs` — 15-строчный try/catch с MODULE_NOT_FOUND detection + diagnostic + exit 0 -- @feature5
  _Requirements: [FR-6](FR.md#fr-6-fail-soft-hook-wrapper-feature5)_
- [ ] Проверить что catch matches только MODULE_NOT_FOUND для runner path specifically (не для child deps) — check `e.message.includes(runner)`
- [ ] Изменить `makePortableTsxCommand` в `src/installer/shared.ts:27-31` — заменить `'tsx-runner.js'` на `'tsx-runner-bootstrap.cjs'` в require path
- [ ] Добавить copy для bootstrap в `setupGlobalScripts` — `await copyBundledScript(distDir, scriptsDir, 'tsx-runner-bootstrap.cjs', undefined, [fallback])`
- [ ] Обновить `scripts/build-check-update.js` (~line 65) — добавить `copyToDist('src/scripts/tsx-runner-bootstrap.cjs', 'dist/tsx-runner-bootstrap.cjs')`
- [ ] Verify: сценарии PERSO_50..52 (@feature5) переходят из Red в Green

## Phase 5: Collision detection (Green) @feature6

> Защита user-authored файлов через git ls-files.

- [ ] Создать `src/installer/collisions.ts` с `detectGitTrackedCollisions(repoRoot, candidatePaths): Promise<Set<string>>` -- @feature6
  _Requirements: [FR-7](FR.md#fr-7-collision-detection-через-git-ls-files-feature6)_
- [ ] Реализовать batched `git ls-files --` call через `execFileSync` с MSYS_NO_PATHCONV env
- [ ] Graceful no-git handling — return empty Set если `.git/` отсутствует
- [ ] Error handling — git non-zero exit = empty Set (не throw)
- [ ] Wire в `src/installer/claude.ts` перед step 1 copy (line ~63) — собрать candidates для commands+rules+skills, call detect, exclude collisions from copies AND from managedByExtension
  _Requirements: [FR-7](FR.md#fr-7-collision-detection-через-git-ls-files-feature6), [FR-1](FR.md#fr-1-managed-gitignore-block-feature1)_
- [ ] Добавить WARN console.warn при collision detection
- [ ] Verify: сценарии PERSO_60..63 (@feature6) переходят из Red в Green

## Phase 6: Per-project uninstall (Green) @feature7

> CLI command для безопасного удаления с path traversal guard.

- [ ] Создать `src/installer/uninstall-project.ts` с `uninstallFromProject(repoRoot, options?): Promise<UninstallReport>` -- @feature7
  _Requirements: [FR-8](FR.md#fr-8-per-project-uninstall-command-feature7)_
  _Leverage: `isDevPomogatorRepo`, `removeManagedGitignoreBlock`, `stripDevPomogatorFromSettingsLocal`, `resolveWithinProject`_
- [ ] Реализовать 7-шаговый алгоритм из DESIGN.md "Алгоритм" секции: refuse → load config → delete files → prune dirs → strip gitignore → strip settings.local → update config
- [ ] Path traversal guard через `resolveWithinProject` pattern (`.claude/rules/no-unvalidated-manifest-paths.md`)
- [ ] Add `stripDevPomogatorFromSettingsLocal` в `src/installer/settings-local.ts` (inverse от writeHooksToSettingsLocal)
- [ ] Поддержка `--dry-run` flag — no actual deletions, только preview report
- [ ] Wire CLI в `src/index.ts` — parse `uninstall --project [--dry-run]` subcommand, call `uninstallFromProject(findRepoRoot(), options)`, print report
  _Requirements: [FR-8](FR.md#fr-8-per-project-uninstall-command-feature7)_
- [ ] Verify: сценарии PERSO_70..74 (@feature7) переходят из Red в Green

## Phase 7: MCP personal mode (Green) @feature8

> setup-mcp force-global + secret detection в project .mcp.json.

- [ ] Модифицировать `extensions/specs-workflow/tools/mcp-setup/setup-mcp.py:get_config_path()` — убрать project-first branch, всегда возвращать `(get_global_config_path(platform), "global")` -- @feature8
  _Requirements: [FR-9](FR.md#fr-9-force-global-mcp-writes-feature8)_
- [ ] Добавить `print(f"[INFO] Writing MCP servers to global config ({config_path}) — personal mode")` перед save_mcp_config
- [ ] Создать `src/installer/mcp-security.ts` с `SecretFinding` interface и `checkMcpJsonForSecrets(repoRoot): Promise<SecretFinding[]>` -- @feature8
  _Requirements: [FR-10](FR.md#fr-10-secret-detection-в-project-mcpjson-feature8)_
  _Leverage: `readJsonSafe`_
- [ ] Реализовать regex match `/\b(JIRA_(API_)?TOKEN|CONFLUENCE_(API_)?TOKEN|API_KEY|APIKEY|SECRET|PASSWORD|PRIVATE_KEY|AUTH_TOKEN|BEARER)\b/gi` против stringified JSON content
- [ ] Wire в `src/installer/claude.ts` — после `addProjectPaths` (~line 270) под self-guard false — call `checkMcpJsonForSecrets` + console.warn если findings.length > 0
- [ ] Verify: сценарии PERSO_80..84 (@feature8) переходят из Red в Green (PERSO_84 = claude-mem invariant, fixes current behavior without changes)

## Phase 8: Uninstall skill (Green) @feature9

> AI agent skill для правильного soft-removal.

- [ ] Создать `extensions/personal-pomogator/extension.json` — minimal manifest с skills + skillFiles declarations -- @feature9
  _Requirements: [FR-11](FR.md#fr-11-ai-agent-uninstall-skill-feature9)_
- [ ] Создать `extensions/personal-pomogator/skills/dev-pomogator-uninstall/SKILL.md` с frontmatter (name, description с trigger words, allowed-tools) -- @feature9
  _Requirements: [FR-11](FR.md#fr-11-ai-agent-uninstall-skill-feature9)_
  _Leverage: existing skill format из `extensions/*/skills/*/SKILL.md`_
- [ ] Написать SKILL.md тело — 5 секций (Safety Checks, Scope Selection, CLI-First, Manual Fallback, Verification) согласно DESIGN.md "SKILL.md 5-step algorithm"
- [ ] Убедиться что installer уже подхватит skill через existing `getExtensionSkills` flow (`src/installer/claude.ts:173-195`) — no installer changes needed
- [ ] Verify: сценарии PERSO_90..93 (@feature9) переходят из Red в Green

## Phase 9: Tests + Docs + Refactor

> Заполнить test cases, обновить документацию, финальная верификация.

- [ ] Заполнить test cases PERSO_10..93 в `tests/e2e/personal-pomogator.test.ts` — replace expect.fail stubs реальной integration logic через runInstaller + filesystem assertions
  _Requirements: all FR, `.claude/rules/integration-tests-first.md`_
- [ ] Обновить `CLAUDE.md` — Architecture секция про settings.local.json routing + MCP force-global + uninstall skill
  _Requirements: `.claude/rules/claude-md-glossary.md`_
- [ ] Обновить `.claude/rules/updater-managed-cleanup.md` — добавить gitignore marker block в scope cleanup + settings.local.json stripping
- [ ] `npm run build` — компиляция без ошибок
- [ ] `npm run lint` — чистый (добавить нужные type annotations в новые модули)
- [ ] `/run-tests personal-pomogator` — все 33 BDD сценария GREEN (в background per `.claude/rules/pomogator/no-blocking-on-tests.md`)
- [ ] `./.dev-pomogator/tools/specs-generator/validate-spec.ts -Path .specs/personal-pomogator` — 0 errors
- [ ] `./.dev-pomogator/tools/specs-generator/audit-spec.ts -Path .specs/personal-pomogator` — 0 findings
- [ ] Manual self-guard test: `cd D:\repos\dev-pomogator && npm run build && node dist/index.js install --claude` — verify `.gitignore` not mutated, `.claude/settings.json` not modified, `.claude/settings.local.json` not created
- [ ] Manual smarts target test: copy smarts в tmp, run installer, verify managed gitignore block + settings.local.json written, team hooks preserved
- [ ] Manual loud-fail test: remove `dist/tsx-runner.js`, run install, verify non-zero exit + clear stderr
- [ ] Manual fail-soft test: install success, rm runner, trigger hook, verify exit 0 + diagnostic
- [ ] Manual collision test: seed user command + git add, run install, verify not overwritten + WARN
- [ ] Manual uninstall test: install in smarts copy, run `uninstall --project`, verify clean state
- [ ] Manual MCP force-global test: seed project .mcp.json, run setup-mcp.py, verify project file unchanged, ~/.claude.json updated
- [ ] Manual secrets warn test: install with .mcp.json containing JIRA_API_TOKEN, verify stderr WARN
- [ ] Manual skill trigger test: in Claude Code session in tmp target, say "удали dev-pomogator", verify skill triggers with 5-step algorithm
