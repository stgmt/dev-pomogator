# Functional Requirements (FR)

## FR-1: First-Class Codex Platform @feature1

Система должна поддерживать `codex` как отдельную платформу `dev-pomogator` на уровне schema, installer flow, manifests и updater logic, а не как alias существующих платформ.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-first-class-codex-platform-feature1)
**Use Case:** [UC-1](USE_CASES.md#uc-1-fresh-project-install)

## FR-2: Project-Level Codex Artifact Layout @feature2

При установке для `Codex` система должна materialize только project-level артефакты:

- `.codex/config.toml`
- `.codex/hooks.json`
- `AGENTS.md`
- `CLAUDE.md` (если выбранная coexistence strategy требует update)
- `.agents/skills/`
- `.dev-pomogator/tools/`

Система не должна записывать `Codex`-специфичные настройки в `~/.codex/*`.

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-project-level-codex-artifact-layout-feature2)
**Use Case:** [UC-1](USE_CASES.md#uc-1-fresh-project-install)

## FR-3: Existing User Artifact Protection @feature3

Если в проекте уже существуют `AGENTS.md`, `CLAUDE.md`, `.codex/config.toml`, `.codex/hooks.json` или `.agents/skills/*`, система должна:

- определить конфликт до записи managed content
- создать backup существующего состояния
- показать warning с указанием конфликтующих файлов
- предложить merge path вместо silent overwrite

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3-existing-user-artifact-protection-feature3)
**Use Case:** [UC-2](USE_CASES.md#uc-2-safe-install-over-existing-user-artifacts)

## FR-4: Codex Hooks Installation @feature4

Система должна уметь materialize и обновлять `Codex hooks` в `.codex/hooks.json`, используя подтверждённые lifecycle events `SessionStart` и `Stop` для `Codex >= 0.114.0`.

Для каждого расширения, которое в support matrix использует эти lifecycle точки, installer и updater должны:

- синхронизировать соответствующие hook entries как managed configuration
- включать необходимый hook feature gate для проекта
- использовать совместимую с `v0.114.0` форму hook entries (`type`, `command`, `statusMessage`, `timeout`)

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4-codex-hooks-installation-feature4)
**Use Case:** [UC-4](USE_CASES.md#uc-4-lifecycle-extension-parity)

## FR-5: AGENTS.md and CLAUDE.md Coexistence @feature5

Система должна поддерживать сосуществование `AGENTS.md` и существующего `CLAUDE.md` без разрушения роли `CLAUDE.md` как project glossary/index.

Если фича требует обновления обоих файлов, installer должен:

- не дублировать полное содержимое правил в `CLAUDE.md`
- сохранять пользовательские секции `CLAUDE.md`
- писать Codex-specific guidance в `AGENTS.md` или в clearly scoped merge blocks

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5-agentsmd-and-claudemd-coexistence-feature5)
**Use Case:** [UC-2](USE_CASES.md#uc-2-safe-install-over-existing-user-artifacts)

## FR-6: Codex Skills Packaging @feature6

Система должна materialize reusable workflows для `Codex` в `.agents/skills/`, используя существующие extension skills и/или Codex-specific skill wrappers там, где это нужно для parity.

Каждый skill должен оставаться traceable к extension manifest и подлежать managed update.

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6-codex-skills-packaging-feature6)
**Use Case:** [UC-1](USE_CASES.md#uc-1-fresh-project-install)

## FR-7: Project-Level Codex MCP Configuration @feature7

Система должна уметь конфигурировать MCP для `Codex` на project level через `.codex/config.toml`, используя секции `[mcp_servers]` и не полагаясь на существующие JSON writers для `Cursor`/`Claude`.

**Связанные AC:** [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7-project-level-codex-mcp-configuration-feature7)
**Use Case:** [UC-1](USE_CASES.md#uc-1-fresh-project-install)

## FR-8: Extension Parity Support Matrix @feature8

Support matrix для `Codex` должна включать все текущие installable extensions `dev-pomogator`, кроме `test-statusline`.

Для каждого extension должно быть явно указано:

- включён ли он в Codex support
- через какие Codex-native surfaces достигается parity
- какие project-level артефакты он добавляет

**Связанные AC:** [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8-extension-parity-support-matrix-feature8)
**Use Case:** [UC-4](USE_CASES.md#uc-4-lifecycle-extension-parity)

## FR-9: Windows Bash/SH Bootstrap for Codex @feature9

Для Windows таргета `codex` bootstrap должен идти через `bash/sh` path, в соответствии с выбранным решением по фиче, и корректно вызывать installer flow для новой платформы.

**Связанные AC:** [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9-windows-bashsh-bootstrap-for-codex-feature9)
**Use Case:** [UC-5](USE_CASES.md#uc-5-windows-bashsh-bootstrap)

## FR-10: Managed Update and Reinstall Path @feature10

Reinstall и auto-update для `Codex` должны использовать ту же managed discipline, что уже есть у проекта:

- tracked managed files with hashes
- backup before overwrite for user-modified managed files
- stale managed cleanup only for owned artifacts
- smart merge for config-like files

**Связанные AC:** [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10-managed-update-and-reinstall-path-feature10)
**Use Case:** [UC-3](USE_CASES.md#uc-3-managed-reinstall-and-update)

## FR-11: Explicit Codex Parity Routing @feature11

Если полное поведение расширения нельзя выразить только через `SessionStart` и `Stop`, design должна явно назначать другой Codex-native parity surface: `AGENTS.md`, `.agents/skills`, `codex exec`, app automation или GitHub Action.

Система не должна silently опускать часть заявленного extension behavior.

**Связанные AC:** [AC-11](ACCEPTANCE_CRITERIA.md#ac-11-fr-11-explicit-codex-parity-routing-feature11)
**Use Case:** [UC-4](USE_CASES.md#uc-4-lifecycle-extension-parity)

