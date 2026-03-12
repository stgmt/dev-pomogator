# Acceptance Criteria (EARS)

## AC-1 (FR-1): First-Class Codex Platform @feature1

**Требование:** [FR-1: First-Class Codex Platform](FR.md#fr-1-first-class-codex-platform-feature1)

WHEN пользователь или bootstrap выбирает платформу `codex` THEN система SHALL распознать её как отдельный platform target и SHALL запустить Codex-specific installer flow.

## AC-2 (FR-2): Project-Level Codex Artifact Layout @feature2

**Требование:** [FR-2: Project-Level Codex Artifact Layout](FR.md#fr-2-project-level-codex-artifact-layout-feature2)

WHEN установка `codex` завершается THEN система SHALL создать только project-level Codex артефакты в текущем репозитории AND SHALL NOT записывать Codex config, hooks или skills в `~/.codex/*`.

## AC-3 (FR-3): Existing User Artifact Protection @feature3

**Требование:** [FR-3: Existing User Artifact Protection](FR.md#fr-3-existing-user-artifact-protection-feature3)

IF в проекте уже существует `AGENTS.md`, `CLAUDE.md`, `.codex/config.toml`, `.codex/hooks.json` или `.agents/skills/*` THEN система SHALL создать backup до записи managed content AND SHALL показать warning с merge guidance.

## AC-4 (FR-4): Codex Hooks Installation @feature4

**Требование:** [FR-4: Codex Hooks Installation](FR.md#fr-4-codex-hooks-installation-feature4)

WHEN extension parity требует lifecycle automation AND проект использует `Codex >= 0.114.0` THEN система SHALL включить `features.codex_hooks=true` для проекта AND SHALL materialize соответствующие managed hook entries в `.codex/hooks.json` для `SessionStart` и `Stop`.

## AC-5 (FR-5): AGENTS.md and CLAUDE.md Coexistence @feature5

**Требование:** [FR-5: AGENTS.md and CLAUDE.md Coexistence](FR.md#fr-5-agentsmd-and-claudemd-coexistence-feature5)

WHEN установка должна обновить guidance файлы THEN система SHALL поддерживать `AGENTS.md` и `CLAUDE.md` совместно AND SHALL NOT разрушать роль `CLAUDE.md` как project glossary/index.

## AC-6 (FR-6): Codex Skills Packaging @feature6

**Требование:** [FR-6: Codex Skills Packaging](FR.md#fr-6-codex-skills-packaging-feature6)

WHEN extension поставляет reusable workflow для `Codex` THEN система SHALL materialize его в `.agents/skills/` с traceable managed ownership.

## AC-7 (FR-7): Project-Level Codex MCP Configuration @feature7

**Требование:** [FR-7: Project-Level Codex MCP Configuration](FR.md#fr-7-project-level-codex-mcp-configuration-feature7)

WHEN Codex extension требует MCP server THEN система SHALL описать его в project-level `.codex/config.toml` через `[mcp_servers]` AND SHALL NOT использовать `Cursor`/`Claude` JSON config writers.

## AC-8 (FR-8): Extension Parity Support Matrix @feature8

**Требование:** [FR-8: Extension Parity Support Matrix](FR.md#fr-8-extension-parity-support-matrix-feature8)

WHEN support matrix для `Codex` формируется THEN система SHALL включить все текущие installable extensions, кроме `test-statusline`, AND SHALL явно указать parity surface для каждого extension.

## AC-9 (FR-9): Windows Bash/SH Bootstrap for Codex @feature9

**Требование:** [FR-9: Windows Bash/SH Bootstrap for Codex](FR.md#fr-9-windows-bashsh-bootstrap-for-codex-feature9)

WHEN Windows пользователь выбирает таргет `codex` THEN bootstrap SHALL route установку через выбранный `bash/sh` path AND SHALL довести execution до Codex installer flow.

## AC-10 (FR-10): Managed Update and Reinstall Path @feature10

**Требование:** [FR-10: Managed Update and Reinstall Path](FR.md#fr-10-managed-update-and-reinstall-path-feature10)

WHEN выполняется reinstall или update для платформы `codex` THEN система SHALL синхронизировать только managed Codex артефакты AND SHALL backup user-modified managed files перед overwrite.

## AC-11 (FR-11): Explicit Codex Parity Routing @feature11

**Требование:** [FR-11: Explicit Codex Parity Routing](FR.md#fr-11-explicit-codex-parity-routing-feature11)

IF полное поведение extension не покрывается только `SessionStart` и `Stop` THEN design SHALL назначить другой Codex-native parity surface AND SHALL NOT silently опустить часть extension behavior.

