# Functional Requirements (FR)

## FR-1: First-Class Codex Platform @feature1

Система должна поддерживать `codex` как отдельную платформу `dev-pomogator` на уровне schema, installer flow, manifests и updater logic, а не как alias существующих платформ.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-first-class-codex-platform-feature1)
**Use Case:** [UC-1](USE_CASES.md#uc-1-fresh-install-in-a-trusted-project)

## FR-2: Trusted Project-Local Artifact Model @feature2

При установке для `Codex` система должна materialize только project-level артефакты:

- `.codex/config.toml`
- `.codex/hooks.json`
- `AGENTS.md`
- `.agents/skills/`
- `.dev-pomogator/tools/`

Система не должна записывать `Codex`-специфичные настройки в `~/.codex/*`.

Система должна явно учитывать, что project-level `.codex/config.toml` и связанные `.codex/*` layers применяются Codex только в trusted projects, и должна:

- предупреждать об этом при install/update
- не предполагать, что project layer заменяет user-level `~/.codex/*`
- корректно сосуществовать с additively loaded global hooks/config

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-trusted-project-local-artifact-model-feature2)
**Use Case:** [UC-1](USE_CASES.md#uc-1-fresh-install-in-a-trusted-project)

## FR-3: Existing Project Artifact Protection @feature3

Если в проекте уже существуют `AGENTS.md`, `CLAUDE.md`, `.codex/config.toml`, `.codex/hooks.json` или `.agents/skills/*`, система должна:

- определить конфликт до записи managed content
- создать backup существующего состояния
- показать warning с указанием конфликтующих файлов
- предложить merge path вместо silent overwrite

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3-existing-project-artifact-protection-feature3)
**Use Case:** [UC-2](USE_CASES.md#uc-2-safe-install-over-existing-project-artifacts-and-global-codex-layers)

## FR-4: Version-Aware Codex Hook Capability Model @feature4

Система должна materialize и обновлять `Codex hooks` в `.codex/hooks.json`, используя version-aware capability matrix вместо hardcoded допущения про два события.

Минимальная capability baseline:

- `Codex >= 0.114.0` — `SessionStart`, `Stop`
- `Codex >= 0.116.0` — `UserPromptSubmit`
- `Codex >= 0.117.0` — `PreToolUse`, `PostToolUse` только для `Bash`

Для каждого extension installer и updater должны:

- синхронизировать только те managed hook entries, которые реально поддерживаются текущим capability level
- включать `features.codex_hooks=true` только когда hook-capable route действительно используется
- использовать совместимую с актуальной docs форму hook entries (`type`, `command`, `statusMessage`, `timeout`)
- не заявлять parity через unsupported events или unsupported tool interception

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4-version-aware-codex-hook-capability-model-feature4)
**Use Case:** [UC-4](USE_CASES.md#uc-4-version-aware-lifecycle-parity-with-deterministic-dispatch)

## FR-5: Hook Orchestration and Conflict Discipline @feature5

Так как matching hooks одного события запускаются concurrently и project hooks не заменяют user/global hooks, система должна:

- materialize не более одного managed `dev-pomogator` hook group на один event
- использовать deterministic dispatcher внутри managed hook command для fan-out по нескольким extensions
- избегать design, где несколько managed `Stop` hooks соревнуются за continuation behavior
- учитывать additive coexistence с user/global hooks и не предполагать полный контроль над event chain

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5-hook-orchestration-and-conflict-discipline-feature5)
**Use Case:** [UC-4](USE_CASES.md#uc-4-version-aware-lifecycle-parity-with-deterministic-dispatch)

## FR-6: AGENTS-First Guidance and CLAUDE Coexistence @feature6

Система должна использовать `AGENTS.md` как primary Codex guidance surface и одновременно поддерживать сосуществование с существующим `CLAUDE.md` без разрушения роли `CLAUDE.md` как project glossary/index.

Если фича требует обновления guidance files, installer должен:

- не дублировать полное содержимое правил в `CLAUDE.md`
- сохранять пользовательские секции `CLAUDE.md`
- писать Codex-specific guidance в `AGENTS.md`
- рассматривать `CLAUDE.md` только как legacy/fallback concern, а не как обязательный Codex instruction source
- при необходимости использовать explicit fallback config или cross-link, а не молчаливое предположение, что Codex сам читает `CLAUDE.md`

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6-agents-first-guidance-and-claude-coexistence-feature6)
**Use Case:** [UC-2](USE_CASES.md#uc-2-safe-install-over-existing-project-artifacts-and-global-codex-layers)

## FR-7: Codex Skills Packaging with Layered Discovery @feature7

Система должна materialize reusable workflows для `Codex` в `.agents/skills/`, используя существующие extension skills и/или Codex-specific skill wrappers там, где это нужно для parity.

Каждый skill должен:

- оставаться traceable к extension manifest
- подлежать managed update
- учитывать layered discovery в Codex от текущей директории до repo root
- не конфликтовать по `name` с уже существующими repo/user/admin/system skills без explicit strategy
- не перетирать user-owned skills с тем же именем silently

**Связанные AC:** [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7-codex-skills-packaging-with-layered-discovery-feature7)
**Use Case:** [UC-1](USE_CASES.md#uc-1-fresh-install-in-a-trusted-project)

## FR-8: Project-Level Codex MCP Configuration @feature8

Система должна уметь конфигурировать MCP для `Codex` на project level через `.codex/config.toml`, используя секции `[mcp_servers]` и не полагаясь на существующие JSON writers для `Cursor`/`Claude`.

**Связанные AC:** [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8-project-level-codex-mcp-configuration-feature8)
**Use Case:** [UC-1](USE_CASES.md#uc-1-fresh-install-in-a-trusted-project)

## FR-9: Extension Parity Support Matrix @feature9

Support matrix для `Codex` должна включать все текущие installable extensions `dev-pomogator`, но не в бинарной форме.

Для каждого extension должно быть явно указано:

- `supportLevel`: `supported`, `partial` или `excluded`
- `minimumCodexVersion`, если applicable
- через какие Codex-native surfaces достигается parity
- какие project-level артефакты он добавляет
- какие known limitations или blocked capabilities остаются
- причина exclusion или partial support, если parity не полная

`test-statusline` не должен быть просто “пропущен”; он должен быть явно marked `excluded` с причиной.

**Связанные AC:** [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9-extension-parity-support-matrix-feature9)
**Use Case:** [UC-4](USE_CASES.md#uc-4-version-aware-lifecycle-parity-with-deterministic-dispatch)

## FR-10: Windows Execution Strategy for Codex @feature10

Для Windows таргета `codex` система должна поддерживать актуальную Windows strategy из official docs:

- native Windows sandbox как default path
- WSL2 как explicit fallback для Linux-native workflows
- version-aware handling hooks support на Windows без устаревшего допущения `bash/sh only`

Инсталлер и документация не должны проектировать Windows support как обязательный shell detour через `bash/sh`.

**Связанные AC:** [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10-windows-execution-strategy-for-codex-feature10)
**Use Case:** [UC-5](USE_CASES.md#uc-5-windows-native-first-strategy-with-wsl-fallback)

## FR-11: Managed Update and Reinstall Path @feature11

Reinstall и auto-update для `Codex` должны использовать ту же managed discipline, что уже есть у проекта:

- tracked managed files with hashes
- backup before overwrite for user-modified managed files
- stale managed cleanup only for owned artifacts
- smart merge for config-like files

**Связанные AC:** [AC-11](ACCEPTANCE_CRITERIA.md#ac-11-fr-11-managed-update-and-reinstall-path-feature11)
**Use Case:** [UC-3](USE_CASES.md#uc-3-managed-reinstall-and-update)

## FR-12: Explicit Codex Parity Routing @feature12

Если полное поведение extension нельзя выразить через доступный hook surface текущей версии Codex, design должна явно назначать другой Codex-native parity surface: `AGENTS.md`, `.agents/skills`, `[mcp_servers]`, `codex exec`, `notify`, `tui.notifications`, app automation или GitHub Action.

Система не должна silently опускать часть заявленного extension behavior и не должна маркировать такую реализацию как full parity без причины.

**Связанные AC:** [AC-12](ACCEPTANCE_CRITERIA.md#ac-12-fr-12-explicit-codex-parity-routing-feature12)
**Use Case:** [UC-4](USE_CASES.md#uc-4-version-aware-lifecycle-parity-with-deterministic-dispatch)
