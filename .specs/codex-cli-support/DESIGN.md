# Design

## Реализуемые требования

- [FR-1: First-Class Codex Platform](FR.md#fr-1-first-class-codex-platform-feature1)
- [FR-2: Trusted Project-Local Artifact Model](FR.md#fr-2-trusted-project-local-artifact-model-feature2)
- [FR-3: Existing Project Artifact Protection](FR.md#fr-3-existing-project-artifact-protection-feature3)
- [FR-4: Version-Aware Codex Hook Capability Model](FR.md#fr-4-version-aware-codex-hook-capability-model-feature4)
- [FR-5: Hook Orchestration and Conflict Discipline](FR.md#fr-5-hook-orchestration-and-conflict-discipline-feature5)
- [FR-6: AGENTS-First Guidance and CLAUDE Coexistence](FR.md#fr-6-agents-first-guidance-and-claude-coexistence-feature6)
- [FR-7: Codex Skills Packaging with Layered Discovery](FR.md#fr-7-codex-skills-packaging-with-layered-discovery-feature7)
- [FR-8: Project-Level Codex MCP Configuration](FR.md#fr-8-project-level-codex-mcp-configuration-feature8)
- [FR-9: Extension Parity Support Matrix](FR.md#fr-9-extension-parity-support-matrix-feature9)
- [FR-10: Windows Execution Strategy for Codex](FR.md#fr-10-windows-execution-strategy-for-codex-feature10)
- [FR-11: Managed Update and Reinstall Path](FR.md#fr-11-managed-update-and-reinstall-path-feature11)
- [FR-12: Explicit Codex Parity Routing](FR.md#fr-12-explicit-codex-parity-routing-feature12)

## Компоненты

- `CodexPlatformSchema` — расширяет типы `Platform`, installer selection и manifest typing до `codex`.
- `CodexTrustAndLayerGuard` — отслеживает trusted/untrusted project state и сообщает о coexistence с user-level `~/.codex/*`.
- `CodexInstaller` — новый installer path, который materialize project-level Codex артефакты.
- `CodexArtifactMerger` — merge-safe writer для `AGENTS.md`, `CLAUDE.md`, `.codex/config.toml`, `.codex/hooks.json`, `.agents/skills/*`.
- `CodexHookCapabilityResolver` — решает, какие events доступны на текущей версии Codex и текущей ОС.
- `CodexHookDispatcherWriter` — materialize одного managed dispatcher per event вместо many independent hooks.
- `CodexGuidanceComposer` — собирает `AGENTS.md` и optional minimal updates для `CLAUDE.md` без потери glossary semantics.
- `CodexSkillsPackager` — копирует и/или адаптирует extension skills в `.agents/skills/` с collision-aware naming.
- `CodexMcpWriter` — записывает project-level `[mcp_servers]` в `.codex/config.toml`.
- `CodexSupportMatrixResolver` — для каждого extension фиксирует `supportLevel`, version floor, parity surfaces и blocked capabilities.
- `CodexUpdaterSync` — распространяет существующую managed discipline на новую платформу.
- `CodexManifestNormalizer` — убирает допущения `cursor | claude` из manifest typing и translation layer для `.agents/skills` / `.codex/*`.
- `CodexMemoryParityDecision` — явно решает, как `requiresClaudeMem`-зависимые расширения ведут себя на `codex`.
- `CodexTestHarness` — расширяет Docker/CLI/helpers под split Codex feature suite и trust/global-layer fixtures.

## Где лежит реализация

- App-код: `src/config/schema.ts`, `src/index.ts`, `src/installer/index.ts`, `src/installer/extensions.ts`, `src/installer/shared.ts`, `src/installer/memory.ts`, `src/updater/index.ts`, `src/updater/github.ts`
- Wiring: `extensions/*/extension.json`, `extensions/specs-workflow/tools/mcp-setup/setup-mcp.py`, `install`, `install.ps1`, `install.sh`, `README.md`
- Tests: `tests/e2e/`, `tests/features/`, `tests/fixtures/`

## Директории и файлы

- `src/installer/codex.ts`
- `src/installer/codex-hook-dispatch.ts`
- `src/installer/codex-support-matrix.ts`
- `src/config/schema.ts`
- `src/index.ts`
- `src/installer/index.ts`
- `src/installer/extensions.ts`
- `src/installer/shared.ts`
- `src/installer/memory.ts`
- `src/updater/index.ts`
- `src/updater/github.ts`
- `src/constants.ts`
- `install`
- `install.ps1`
- `install.sh`
- `README.md`
- `extensions/*/extension.json`
- `extensions/specs-workflow/tools/mcp-setup/setup-mcp.py`
- `tests/e2e/helpers.ts`
- `tests/e2e/codex-installer.test.ts`
- `tests/e2e/codex-hooks-dispatch.test.ts`
- `tests/e2e/codex-update.test.ts`
- `tests/e2e/cli-integration.test.ts`
- `tests/e2e/mcp-setup.test.ts`
- `Dockerfile.test`
- `tests/fixtures/configs/installed-codex.json`

## Алгоритм

1. CLI/bootstrap route распознаёт таргет `codex` и передаёт его в installer pipeline.
2. Installer сначала нормализует manifest model для `codex`: platform union, hooks/skills/tool sections и translation между legacy `.claude/skills` targets и `.agents/skills`.
3. `CodexTrustAndLayerGuard` определяет:
   - trusted ли текущий repo
   - существуют ли `~/.codex/config.toml` и `~/.codex/hooks.json`
   - нужно ли warning/debug report про additive layering
4. Installer собирает support matrix расширений для `codex` и вычисляет набор project-level артефактов.
5. Tools копируются в `.dev-pomogator/tools/` по существующей managed модели.
6. Skills materialize в `.agents/skills/`, при необходимости используя Codex-specific wrappers и collision-safe naming.
7. `AGENTS.md` и `CLAUDE.md` обновляются через merge-safe composer:
   - existing user file читается
   - before-overwrite создаётся backup
   - managed blocks вставляются/обновляются
   - выдаётся warning/report если потребовалось слияние
8. `.codex/config.toml` создаётся или обновляется на project level:
   - feature flags
   - `[mcp_servers]`
   - project-specific Codex settings
   - hook feature gate только если direct hook parity действительно используется
9. `CodexHookCapabilityResolver` определяет, какие events можно использовать на текущем Codex version / OS pair.
10. `.codex/hooks.json` создаётся или обновляется на project level через dispatcher model:
   - один managed `SessionStart` dispatcher при необходимости
   - один managed `UserPromptSubmit` dispatcher при необходимости
   - один managed `PreToolUse` dispatcher только с `matcher = "Bash"`
   - один managed `PostToolUse` dispatcher только с `matcher = "Bash"`
   - один managed `Stop` dispatcher при необходимости
11. Внутри dispatcher-а `dev-pomogator` уже сам управляет deterministic order, continuation semantics и short-circuit behavior.
12. Для extension behavior, которое не покрывается доступным hook surface, `CodexSupportMatrixResolver` назначает другой surface: skill, `AGENTS.md`, `codex exec`, notify, app automation или GitHub Action.
13. Для `requiresClaudeMem`-зависимых flows parity route обязан явно задокументировать memory strategy, а не опираться на implicit Claude-only install behavior.
14. `specs-workflow` MCP parity использует TOML writer для `.codex/config.toml`; existing JSON `setup-mcp.py` path либо адаптируется, либо явно bypassed.
15. Reinstall/update path применяет те же managed hash, backup и cleanup правила, что уже действуют для `Cursor`/`Claude`.

## Contracts

### `.codex/config.toml`

- Owner: `dev-pomogator` managed blocks + user project settings
- Scope: только текущий репозиторий
- Contents:
  - Codex project config
  - `[features]`
  - `[mcp_servers]`
  - optional project instruction fallback knobs if design решит задействовать их явно
- Constraints:
  - не хранит auth tokens
  - не пишет в `~/.codex/config.toml`
  - не предполагает trusted state без проверки
  - обновляется atomically

### `.codex/hooks.json`

- Owner: managed hook entries `dev-pomogator` + user-owned hook entries
- Supported events depend on version:
  - `0.114.0+`: `SessionStart`, `Stop`
  - `0.116.0+`: `UserPromptSubmit`
  - `0.117.0+`: `PreToolUse`, `PostToolUse` only for `Bash`
- Merge model:
  - managed dispatcher groups обновляются/удаляются автоматически
  - user entries сохраняются
  - конфликтные правки требуют backup + warning
  - проектный hooks layer не заменяет глобальный hooks layer

### `AGENTS.md`

- Owner: project-level Codex guidance
- Purpose:
  - persistent rules для Codex
  - routing to repo skills
  - build/test/install expectations
- Merge model:
  - если файл уже существует, новые managed blocks вставляются без потери существующих user sections

### `CLAUDE.md`

- Owner: существующий проектный glossary/index
- Purpose:
  - не заменяется `AGENTS.md`
  - остаётся source of truth для Claude-specific project glossary
- Merge model:
  - только минимальные, явно обозначенные managed changes
  - запрещено превращать файл в дубликат `AGENTS.md`
  - Codex parity не должна зависеть от его automatic discovery

### `.agents/skills/<skill-name>/`

- Owner: managed repo-local Codex skills
- Required file: `SKILL.md`
- Optional files: `scripts/*`, `references/*`, `assets/*`, `agents/openai.yaml`
- Constraints:
  - каждый skill traceable к extension manifest
  - при update obsolete managed skill files удаляются без затрагивания user-owned skills
  - naming strategy должна учитывать layered discovery и duplicate names

### Support Matrix Entry

- Required fields:
  - `extension`
  - `supportLevel`
  - `minimumCodexVersion`
  - `paritySurfaces`
  - `blockedCapabilities`
  - `excludedReason`
- Constraints:
  - `supported` используется только когда parity route не теряет заявленное поведение
  - `partial` используется, если часть заявленного extension behavior не переносится без redesign
  - `excluded` требует явной причины

## Support Matrix Strategy

### Supported with direct or dispatcher-based hooks

- `auto-commit` → `Stop` dispatcher
- `auto-simplify` → `Stop` dispatcher
- `claude-mem-health` → `SessionStart` dispatcher
- `bun-oom-guard` → `SessionStart` dispatcher

### Partial: hooks plus additional parity surface

- `prompt-suggest` → `UserPromptSubmit` + `Stop` + explicit manual/AGENTS fallback
- `suggest-rules` → `UserPromptSubmit`/`Stop` + skills + explicit memory parity decision
- `specs-workflow` → skills + `AGENTS.md` + TOML MCP writer; non-Bash gating remains partial
- `tui-test-runner` → skill + `SessionStart`/`Stop` + optional `PreToolUse(Bash)` guards only
- `devcontainer` → skill/post-install style workflow
- `forbid-root-artifacts` → tools + guidance + pre-commit workflow
- `plan-pomogator` → `AGENTS.md` + skill + optional `UserPromptSubmit`/`Stop`; no full `ExitPlanMode` parity

### Explicitly excluded

- `test-statusline` — excluded because Codex does not expose a Claude-style status line surface; `notify` / `tui.notifications` are not equivalent and `PostToolUse(Bash)` is insufficient

## Deferred Upstream Gaps

Эта секция фиксирует blockers, которые не должны silently превращаться в “сделаем потом в коде”. Пока upstream Codex их не предоставляет, соответствующие plugin routes остаются `partial` или `excluded`.

- Missing non-Bash `PreToolUse` / `PostToolUse`:
  - нужен для `Write`, `Edit`, `ApplyPatch`, `WebSearch`, `MCP`
  - блокирует full parity для `specs-workflow`, `plan-pomogator`
  - ограничивает `tui-test-runner` Bash-only route
- Missing plan-mode event:
  - нужен эквивалент `ExitPlanMode` или другой boundary event
  - блокирует full parity для `plan-pomogator`
  - на 2026-04-18 `ExitPlanMode` не найден в primary sources Codex, значит это именно upstream missing capability, а не просто нераскрытый config knob
- Missing status line surface:
  - блокирует `test-statusline`
  - `notify` и `tui.notifications` не переводят feature в `supported`
- Missing ordered matching-hook execution:
  - пока Codex hooks concurrent, dispatcher per event остаётся обязательным
  - если later upstream даст priorities/ordering, design можно упростить

Любой revisit этой спецификации должен сначала перепроверить эти four buckets по official docs/changelog, а уже потом менять support levels.

## BDD Feature Suite

### Core features

- `features/core/codex-platform.feature`
- `features/core/codex-protection.feature`
- `features/core/codex-update.feature`
- `features/core/codex-hooks-schema.feature`

### Plugin features

- `features/plugins/auto-commit.feature`
- `features/plugins/auto-simplify.feature`
- `features/plugins/claude-mem-health.feature`
- `features/plugins/bun-oom-guard.feature`
- `features/plugins/suggest-rules.feature`
- `features/plugins/specs-workflow.feature`
- `features/plugins/prompt-suggest.feature`
- `features/plugins/tui-test-runner.feature`
- `features/plugins/devcontainer.feature`
- `features/plugins/forbid-root-artifacts.feature`
- `features/plugins/plan-pomogator.feature`
- `features/plugins/test-statusline.feature`

> Принцип: один plugin parity path — один отдельный `.feature`, а cross-cutting contract scenarios вроде hook schema, trust/layering и dispatch discipline живут в core suite.

## API / Data Flow

```mermaid
flowchart TD
  installTarget[InstallTarget_codex] --> trustGuard[CodexTrustAndLayerGuard]
  installTarget --> extManifests[ExtensionManifests]
  extManifests --> supportMatrix[CodexSupportMatrixResolver]
  supportMatrix --> ProjectToolsCopy[ProjectToolsCopy]
  supportMatrix --> skillsPackager[CodexSkillsPackager]
  supportMatrix --> hookCapability[CodexHookCapabilityResolver]
  hookCapability --> hooksWriter[CodexHookDispatcherWriter]
  supportMatrix --> mcpWriter[CodexMcpWriter]
  supportMatrix --> guidanceComposer[CodexGuidanceComposer]
  guidanceComposer --> agentsFile[AGENTS.md]
  guidanceComposer --> claudeFile[CLAUDE.md]
  hooksWriter --> hooksJson[.codex/hooks.json]
  mcpWriter --> codexToml[.codex/config.toml]
  skillsPackager --> repoSkills[.agents/skills]
  ProjectToolsCopy --> repoTools[.dev-pomogator/tools]
  trustGuard --> codexToml
  trustGuard --> hooksJson
  backupGuard[BackupAndMergeGuard] --> agentsFile
  backupGuard --> claudeFile
  backupGuard --> hooksJson
  backupGuard --> codexToml
  updaterSync[CodexUpdaterSync] --> backupGuard
```

## BDD Test Infrastructure (ОБЯЗАТЕЛЬНО)

> Секция НЕ может быть удалена. Агент обязан классифицировать фичу по Test Data Impact.
>
> **4 вопроса классификации** (ДА/НЕТ):
> 1. Фича создаёт, изменяет или удаляет данные через API/БД/файлы?
> 2. Фича изменяет состояние системы, которое нужно откатить после теста?
> 3. BDD сценарии из .feature требуют предустановленных данных (Given-шаги с данными)?
> 4. Фича взаимодействует с внешними сервисами, требующими mock/stub на уровне теста?
>
> Хотя бы 1 ДА → `TEST_DATA_ACTIVE` (заполнить все подсекции ниже).
> Все НЕТ → `TEST_DATA_NONE` (указать Evidence и Verdict, подсекции не нужны).

**Classification:** TEST_DATA_ACTIVE
**Evidence:** Фича создаёт и изменяет project-level файлы (`.codex/*`, `AGENTS.md`, `.agents/skills/*`, backup artifacts), требует rollback/cleanup между сценариями и нуждается в предустановленных fixtures существующих project и user-level Codex artifacts.
**Verdict:** Нужны test hooks уровня `beforeEach/afterEach` для создания изолированного git-проекта, seed existing Codex artifacts, seed simulated `~/.codex` layers и cleanup backup/managed state.

### Существующие hooks

| Hook файл | Тип | Тег/Scope | Что делает | Можно переиспользовать? |
|-----------|-----|-----------|------------|------------------------|
| `tests/e2e/helpers.ts` | helper fixture | suite | `setupCleanState()`, `setupInstalledState()`, path helpers для installer сценариев | Да — база для изоляции Codex installer/update tests |
| `tests/e2e/cursor-installer.test.ts` | beforeAll / scenario setup | per-suite | Паттерн чистой установки project/global артефактов | Да — как reference для Codex installer |
| `tests/e2e/claude-installer.test.ts` | beforeAll / scenario setup | per-suite | Паттерн project settings + hooks verification | Да — как reference для Codex hooks/config verification |
| `tests/e2e/mcp-setup.test.ts` | tool integration suite | per-suite | Покрывает существующий MCP setup flow и покажет, где нужен Codex-specific TOML path | Да — reference для Codex MCP adaptation |
| `tests/e2e/cli-integration.test.ts` | real CLI integration | per-suite | Проверяет реальные IDE/CLI binaries и config visibility | Да — база для Codex CLI integration |
| `Dockerfile.test` | Docker harness | suite | Устанавливает CLI binaries и запускает `npm test` | Да — нужен для Codex CLI availability в e2e |

### Новые hooks

| Hook файл | Тип | Тег/Scope | Что делает | По аналогии с |
|-----------|-----|-----------|------------|---------------|
| `tests/e2e/codex-installer.test.ts` | beforeEach / afterEach | per-scenario | Создаёт временные project-level `Codex` артефакты и проверяет trust/layering warnings | `tests/e2e/cursor-installer.test.ts`, `tests/e2e/claude-installer.test.ts` |
| `tests/e2e/codex-hooks-dispatch.test.ts` | beforeEach / afterEach | per-scenario | Seed managed/global hooks и проверяет dispatcher strategy, version gates и additive layering | `tests/e2e/helpers.ts` |
| `tests/e2e/codex-update.test.ts` | beforeEach / afterEach | per-scenario | Seed managed state, симулирует user modifications и проверяет backup/cleanup | `tests/e2e/helpers.ts` |

> Каждый новый hook ОБЯЗАН быть указан в FILE_CHANGES.md (action=create) и в TASKS.md Phase 0.

### Cleanup Strategy

Порядок cleanup:

1. Удалить созданные `.codex/` project fixtures.
2. Удалить simulated home fixtures для `~/.codex/`.
3. Удалить generated `.agents/skills/` managed directories, не затрагивая user fixture copies.
4. Удалить backup artifacts в `.dev-pomogator/.user-overrides/`.
5. Сбросить `~/.dev-pomogator/config.json` test snapshot для сценария.
6. Сохранить install/update logs как debugging artifacts только при failing scenarios.

### Test Data & Fixtures

| Fixture/Data | Путь | Назначение | Lifecycle |
|-------------|------|------------|-----------|
| Existing AGENTS | `tests/fixtures/codex/existing/AGENTS.md` | Симуляция пользовательского `AGENTS.md` для backup/merge сценариев | per-scenario |
| Existing CLAUDE | `tests/fixtures/codex/existing/CLAUDE.md` | Симуляция пользовательского `CLAUDE.md` | per-scenario |
| Existing codex config | `tests/fixtures/codex/existing/.codex/config.toml` | Симуляция пользовательского project config | per-scenario |
| Existing codex hooks | `tests/fixtures/codex/existing/.codex/hooks.json` | Симуляция пользовательских project hooks | per-scenario |
| Existing home config | `tests/fixtures/codex/home/config.toml` | Симуляция `~/.codex/config.toml` для additive layering tests | per-scenario |
| Existing home hooks | `tests/fixtures/codex/home/hooks.json` | Симуляция `~/.codex/hooks.json` для additive layering tests | per-scenario |
| Existing custom skill | `tests/fixtures/codex/existing/.agents/skills/custom-skill/SKILL.md` | Проверка сохранения user-owned skills | per-scenario |
| Installed codex config snapshot | `tests/fixtures/configs/installed-codex.json` | Snapshot managed state для update/reinstall tests | shared |

### Shared Context / State Management

| Ключ | Тип | Записывается в | Читается в | Назначение |
|------|-----|----------------|------------|------------|
| `projectDir` | `string` | `beforeEach` test hook | installer/update assertions | Путь к временному git-проекту |
| `existingArtifacts` | `record` | fixture setup | merge assertions | Набор user-owned project files до установки |
| `homeLayerArtifacts` | `record` | fixture setup | layering assertions | Набор simulated `~/.codex/*` files |
| `backupPaths` | `string[]` | installer/update run | verification steps | Пути созданных backup files |
| `installLogs` | `string` | installer run | diagnostics assertions | Текст warning/report для merge/trust scenarios |
