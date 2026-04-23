# Tasks

## TDD Workflow

> Задачи организованы по TDD: Red -> Green -> Refactor.
> BDD-слой для `Codex` остаётся split по core и plugin parity; нельзя возвращаться к одному монолитному `.feature`.

## Phase 0: BDD Foundation (Red)

> Создать split feature suite, fixtures и test harness до реализации бизнес-логики.
> Все Codex-сценарии на этом этапе должны FAIL.

- [ ] Скопировать core feature-файлы из `.specs/codex-cli-support/features/core/` в `tests/features/core/`
  - `codex-platform.feature` -> `CORE007_codex-platform.feature`
  - `codex-protection.feature` -> `CORE008_codex-protection.feature`
  - `codex-update.feature` -> `CORE009_codex-update.feature`
  - `codex-hooks-schema.feature` -> `CORE010_codex-hooks-schema.feature`
  _Requirements: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-10, FR-11_
- [ ] Скопировать plugin feature-файлы из `.specs/codex-cli-support/features/plugins/` в `tests/features/plugins/<plugin>/`
  _Requirements: FR-4, FR-7, FR-8, FR-9, FR-12_
- [ ] Создать `tests/e2e/codex-installer.test.ts` для core install/trust/protection scenarios
  _Requirements: FR-1, FR-2, FR-3, FR-6, FR-10_
- [ ] Создать `tests/e2e/codex-hooks-dispatch.test.ts` для version gates, additive layering и dispatcher discipline
  _Requirements: FR-4, FR-5_
- [ ] Создать `tests/e2e/codex-update.test.ts` для managed update/reinstall scenarios
  _Requirements: FR-11_
- [ ] Расширить `tests/e2e/helpers.ts` до platform union `cursor | claude | codex`, cleanup `.codex`, `AGENTS.md`, `.agents/skills`, simulated `~/.codex`, Codex CLI helpers и snapshot support
  _Source: current helper layer is still dual-platform only_
- [ ] Добавить Docker/CLI harness для Codex в `Dockerfile.test` и `tests/e2e/cli-integration.test.ts`
  _Requirements: FR-1, FR-10_
- [ ] Создать fixtures:
  - `tests/fixtures/configs/installed-codex.json`
  - `tests/fixtures/codex/existing/AGENTS.md`
  - `tests/fixtures/codex/existing/CLAUDE.md`
  - `tests/fixtures/codex/existing/.codex/config.toml`
  - `tests/fixtures/codex/existing/.codex/hooks.json`
  - `tests/fixtures/codex/home/config.toml`
  - `tests/fixtures/codex/home/hooks.json`
  - `tests/fixtures/codex/existing/.agents/skills/custom-skill/SKILL.md`
- [ ] Verify: все Codex BDD scenarios FAIL (Red)

## Phase 1: Platform Schema + Trust/Layering (Green)

> Добавить `codex` как first-class платформу и убрать допущения, что manifest/runtime навсегда ограничены `cursor | claude`.

- [ ] Обновить `src/config/schema.ts` для platform union `codex` и managed model новых project-level артефактов
  _Requirements: FR-1, FR-2_
- [ ] Обновить `src/index.ts` и `src/installer/index.ts` для `--codex`, help output, interactive selection и install flow
  _Requirements: FR-1, FR-10_
- [ ] Нормализовать `src/installer/extensions.ts` и `src/updater/github.ts` под Codex sections и heterogeneous manifest shapes
  _Requirements: FR-1, FR-9_
- [ ] Зафиксировать в design/implementation, что `.agents/skills` не может быть derived только из текущего `.claude/skills` path model
  _Requirements: FR-7, FR-9_
- [ ] Добавить trust/layer awareness: installer должен объяснять, когда project `.codex/*` не будет применён без trust onboarding
  _Requirements: FR-2_
- [ ] Обновить `install`, `install.ps1`, `install.sh` с учетом актуального Windows native-first / WSL fallback path
  _Requirements: FR-10_
- [ ] Verify: core scenarios `codex-platform` переходят из Red в Green

## Phase 2: Project-Level Codex Artifact Writers (Green)

> Реализовать новый installer path, который пишет только project-level Codex artifacts.

- [ ] Создать `src/installer/codex.ts`
  _Requirements: FR-2, FR-4, FR-7, FR-8_
- [ ] Обновить `src/constants.ts` и `src/installer/shared.ts` для `.codex`, `.agents/skills`, merge-safe helpers и project-only writers
  _Requirements: FR-2, FR-3, FR-7_
- [ ] Реализовать `AGENTS.md`, optional minimal `CLAUDE.md`, `.codex/config.toml`, `.codex/hooks.json`, `.agents/skills/*` как managed Codex artifact set
  _Requirements: FR-2, FR-3, FR-6, FR-7_
- [ ] Verify: core install/protection scenarios переходят в Green

## Phase 3: Hook Capability Resolver + Dispatcher (Green)

> Реализовать version-aware hooks и deterministic managed dispatch.

- [ ] Добавить `CodexHookCapabilityResolver` с version floors `0.114.0`, `0.116.0`, `0.117.0`, `0.120.0+`
  _Requirements: FR-4_
- [ ] Создать `src/installer/codex-hook-dispatch.ts` и materialize один managed dispatcher per event
  _Requirements: FR-5_
- [ ] Реализовать `Stop` dispatcher route для `auto-commit` и `auto-simplify`
  _Requirements: FR-4, FR-5, FR-9_
- [ ] Реализовать `SessionStart` dispatcher route для `claude-mem-health` и `bun-oom-guard`
  _Requirements: FR-4, FR-5, FR-9_
- [ ] Реализовать `UserPromptSubmit` route для `prompt-suggest` там, где version floor позволяет
  _Requirements: FR-4, FR-9_
- [ ] Зафиксировать, что `PreToolUse`/`PostToolUse` materialize только для `Bash`, без претензии на общий tool interception
  _Requirements: FR-4_
- [ ] Verify: core feature `codex-hooks-schema` и direct-hook plugin features переходят в Green

## Phase 4: Skills + MCP + Guidance Parity (Green)

> Реализовать parity через `.agents/skills`, `AGENTS.md` и `.codex/config.toml`.

- [ ] Пакетировать Codex skills в `.agents/skills/` с traceable managed ownership и collision-aware naming
  _Requirements: FR-7_
- [ ] Добавить project-level Codex MCP writer в `.codex/config.toml`
  _Requirements: FR-8_
- [ ] Обновить `extensions/specs-workflow/tools/mcp-setup/setup-mcp.py` и `tests/e2e/mcp-setup.test.ts` под Codex TOML flow или explicitly bypass old JSON writers
  _Requirements: FR-8, FR-12_
- [ ] Реализовать `AGENTS.md` guidance composer и minimal `CLAUDE.md` coexistence blocks
  _Requirements: FR-6, FR-12_
- [ ] Verify: `suggest-rules`, `specs-workflow`, `tui-test-runner`, `plan-pomogator` получают хотя бы honest partial path

## Phase 5: Explicit Plugin Parity Decisions (Green)

> Для каждого plugin feature-файла зафиксировать отдельный Codex parity path и уровень поддержки.

- [ ] Обновить relevant `extensions/*/extension.json` для явных Codex parity sections, `supportLevel` и version floors
  _Requirements: FR-9, FR-12_
- [ ] Разрешить `suggest-rules` / `requiresClaudeMem` coupling через `src/installer/memory.ts` или через explicit exclusion/replacement strategy для Codex
  _Requirements: FR-9, FR-12_
- [ ] Зафиксировать partial support для `specs-workflow` и `plan-pomogator`, пока нет non-Bash interception replacement
  _Requirements: FR-9, FR-12_
- [ ] Зафиксировать excluded reason для `test-statusline`
  _Requirements: FR-9, FR-12_
- [ ] Verify: все plugin feature-файлы имеют честный `supported` / `partial` / `excluded` outcome

## Phase 6: Managed Update Discipline + Docs

- [ ] Обновить `src/updater/index.ts` и `src/updater/github.ts` для Codex assets, `.agents/skills`, `.codex/*` и stale cleanup
  _Requirements: FR-11_
- [ ] Добавить hash-based tracking для managed Codex files в `~/.dev-pomogator/config.json`
  _Requirements: FR-11_
- [ ] Защитить unrelated user-owned `.agents/skills/*`, `AGENTS.md`, `CLAUDE.md` и simulated home-layer files during Codex update
  _Requirements: FR-3, FR-11_
- [ ] Обновить `README.md` с Codex docs, trusted project note, versioned hooks matrix, support matrix semantics и Windows strategy
  _Requirements: FR-2, FR-4, FR-9, FR-10_
- [ ] `npm test` запускает split Codex e2e scenarios через Docker
- [ ] Все Codex BDD scenarios GREEN или честно отмечены как partial/excluded по design

## Deferred Revisit: Upstream Codex Watchlist

> Это не текущая implementation phase. Возвращаться к ней только после нового research pass по official Codex docs/changelog.

- [ ] Re-check, появились ли `PreToolUse` / `PostToolUse` для `Write`, `Edit`, `ApplyPatch`, `WebSearch`, `MCP`
  _Impact: может перевести `specs-workflow`, `plan-pomogator`, `tui-test-runner` из `partial` ближе к `supported`_
- [ ] Re-check, появился ли lifecycle event уровня `ExitPlanMode` или иной plan-mode boundary hook
  _Impact: может снять главный blocker у `plan-pomogator`_
  _Note: на 2026-04-18 `ExitPlanMode` не найден в primary sources Codex; revisit нужен именно при появлении новой официальной plan-mode сущности_
- [ ] Re-check, появился ли native status line / status bar surface
  _Impact: может перевести `test-statusline` из `excluded` в новый design track_
- [ ] Re-check, появились ли deterministic ordering / priorities / sequential chain semantics для matching hooks
  _Impact: может упростить dispatcher architecture_
- [ ] Re-check, синхронизировались ли docs и changelog по hooks на Windows
  _Impact: может снять часть Windows capability gates_

> Правило: если upstream capability появилась, сначала обновить `RESEARCH.md`, `DESIGN.md`, support matrix и `.feature`, и только потом менять implementation plan.
