# Acceptance Criteria (EARS)

## AC-1 (FR-1): First-Class Codex Platform @feature1

**Требование:** [FR-1: First-Class Codex Platform](FR.md#fr-1-first-class-codex-platform-feature1)

WHEN пользователь или bootstrap выбирает платформу `codex` THEN система SHALL распознать её как отдельный platform target и SHALL запустить Codex-specific installer flow.

## AC-2 (FR-2): Trusted Project-Local Artifact Model @feature2

**Требование:** [FR-2: Trusted Project-Local Artifact Model](FR.md#fr-2-trusted-project-local-artifact-model-feature2)

WHEN установка `codex` завершается THEN система SHALL создать только project-level Codex артефакты в текущем репозитории AND SHALL NOT записывать Codex config, hooks или skills в `~/.codex/*`.

IF репозиторий не trusted THEN система SHALL предупредить, что Codex не применит project-scoped `.codex/*` layers до trust onboarding AND SHALL NOT представлять install как fully active project config override.

## AC-3 (FR-3): Existing Project Artifact Protection @feature3

**Требование:** [FR-3: Existing Project Artifact Protection](FR.md#fr-3-existing-project-artifact-protection-feature3)

IF в проекте уже существует `AGENTS.md`, `CLAUDE.md`, `.codex/config.toml`, `.codex/hooks.json` или `.agents/skills/*` THEN система SHALL создать backup до записи managed content AND SHALL показать warning с merge guidance.

## AC-4 (FR-4): Version-Aware Codex Hook Capability Model @feature4

**Требование:** [FR-4: Version-Aware Codex Hook Capability Model](FR.md#fr-4-version-aware-codex-hook-capability-model-feature4)

WHEN extension parity требует lifecycle automation THEN система SHALL определять доступные hook events по версии Codex AND SHALL materialize только поддерживаемые events и entry shapes в `.codex/hooks.json`.

IF проект использует direct hook parity THEN система SHALL включить `features.codex_hooks=true` для проекта.

## AC-5 (FR-5): Hook Orchestration and Conflict Discipline @feature5

**Требование:** [FR-5: Hook Orchestration and Conflict Discipline](FR.md#fr-5-hook-orchestration-and-conflict-discipline-feature5)

WHEN несколько managed extensions используют один и тот же Codex event THEN система SHALL materialize единый managed dispatcher для этого event AND SHALL NOT полагаться на порядок между несколькими independent managed hooks.

## AC-6 (FR-6): AGENTS-First Guidance and CLAUDE Coexistence @feature6

**Требование:** [FR-6: AGENTS-First Guidance and CLAUDE Coexistence](FR.md#fr-6-agents-first-guidance-and-claude-coexistence-feature6)

WHEN установка должна обновить guidance файлы THEN система SHALL поддерживать `AGENTS.md` и `CLAUDE.md` совместно AND SHALL NOT разрушать роль `CLAUDE.md` как project glossary/index.

AND Codex parity SHALL NOT зависеть от того, что `CLAUDE.md` автоматически читается как built-in instruction source.

## AC-7 (FR-7): Codex Skills Packaging with Layered Discovery @feature7

**Требование:** [FR-7: Codex Skills Packaging with Layered Discovery](FR.md#fr-7-codex-skills-packaging-with-layered-discovery-feature7)

WHEN extension поставляет reusable workflow для `Codex` THEN система SHALL materialize его в `.agents/skills/` с traceable managed ownership AND SHALL учитывать layered discovery и name collisions.

## AC-8 (FR-8): Project-Level Codex MCP Configuration @feature8

**Требование:** [FR-8: Project-Level Codex MCP Configuration](FR.md#fr-8-project-level-codex-mcp-configuration-feature8)

WHEN Codex extension требует MCP server THEN система SHALL описать его в project-level `.codex/config.toml` через `[mcp_servers]` AND SHALL NOT использовать `Cursor`/`Claude` JSON config writers.

## AC-9 (FR-9): Extension Parity Support Matrix @feature9

**Требование:** [FR-9: Extension Parity Support Matrix](FR.md#fr-9-extension-parity-support-matrix-feature9)

WHEN support matrix для `Codex` формируется THEN система SHALL явно указать `supportLevel`, version floor, parity surfaces и ограничения для каждого extension.

AND `test-statusline` SHALL быть явно marked `excluded` с причиной, а не просто omitted.

## AC-10 (FR-10): Windows Execution Strategy for Codex @feature10

**Требование:** [FR-10: Windows Execution Strategy for Codex](FR.md#fr-10-windows-execution-strategy-for-codex-feature10)

WHEN Windows пользователь использует `codex` THEN документация и install flow SHALL описывать native Windows sandbox как default path AND SHALL описывать WSL2 как fallback, не сводя поддержку к `bash/sh only`.

## AC-11 (FR-11): Managed Update and Reinstall Path @feature11

**Требование:** [FR-11: Managed Update and Reinstall Path](FR.md#fr-11-managed-update-and-reinstall-path-feature11)

WHEN выполняется reinstall или update для платформы `codex` THEN система SHALL синхронизировать только managed Codex артефакты AND SHALL backup user-modified managed files перед overwrite.

## AC-12 (FR-12): Explicit Codex Parity Routing @feature12

**Требование:** [FR-12: Explicit Codex Parity Routing](FR.md#fr-12-explicit-codex-parity-routing-feature12)

IF полное поведение extension не покрывается доступным hook surface THEN design SHALL назначить другой Codex-native parity surface AND SHALL NOT silently опустить часть extension behavior.
