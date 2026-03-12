# Tasks

## TDD Workflow

> Задачи организованы по TDD: Red -> Green -> Refactor.
> BDD-слой для `Codex` split по core и plugin parity; нельзя возвращаться к одному монолитному `.feature`.

## Phase 0: BDD Foundation (Red)

> Создать split feature suite, fixtures и test harness до реализации бизнес-логики.
> Все Codex-сценарии на этом этапе должны FAIL.

- [ ] Скопировать core feature-файлы из `.specs/codex-cli-support/features/core/` в `tests/features/core/`
  - `codex-platform.feature` -> `CORE007_codex-platform.feature`
  - `codex-protection.feature` -> `CORE008_codex-protection.feature`
  - `codex-update.feature` -> `CORE009_codex-update.feature`
  - `codex-hooks-schema.feature` -> `CORE010_codex-hooks-schema.feature`
  _Requirements: FR-1, FR-2, FR-3, FR-4, FR-5, FR-9, FR-10_
- [ ] Скопировать plugin feature-файлы из `.specs/codex-cli-support/features/plugins/` в `tests/features/plugins/<plugin>/`, создавая недостающие plugin suite directories
  - использовать существующие директории: `auto-commit`, `auto-simplify`, `suggest-rules`, `specs-workflow`, `prompt-suggest`, `tui-test-runner`, `devcontainer`, `forbid-root-artifacts`, `plan-pomogator`, `test-statusline`
  - создать новые директории: `claude-mem-health`, `bun-oom-guard`
  _Requirements: FR-4, FR-6, FR-7, FR-8, FR-11_
- [ ] Создать `tests/e2e/codex-installer.test.ts` для core install/protection scenarios
  _Requirements: FR-1, FR-2, FR-3, FR-5, FR-9_
- [ ] Создать `tests/e2e/codex-update.test.ts` для managed update/reinstall scenarios
  _Requirements: FR-10_
- [ ] Расширить `tests/e2e/helpers.ts` до platform union `cursor | claude | codex`, cleanup `.codex`, `AGENTS.md`, `.agents/skills`, Codex CLI helpers и snapshot support
  _Source: current helper layer is still dual-platform only_
- [ ] Добавить Docker/CLI harness для Codex в `Dockerfile.test` и `tests/e2e/cli-integration.test.ts`
  _Requirements: FR-1, FR-9, FR-11_
- [ ] Создать fixtures:
  - `tests/fixtures/configs/installed-codex.json`
  - `tests/fixtures/codex/existing/AGENTS.md`
  - `tests/fixtures/codex/existing/CLAUDE.md`
  - `tests/fixtures/codex/existing/.codex/config.toml`
  - `tests/fixtures/codex/existing/.codex/hooks.json`
  - `tests/fixtures/codex/existing/.agents/skills/custom-skill/SKILL.md`
- [ ] Verify: все Codex BDD scenarios FAIL (Red)

## Phase 1: Platform Schema + Manifest Normalization (Green)

> Добавить `codex` как first-class платформу и убрать допущения, что manifest/runtime навсегда ограничены `cursor | claude`.

- [ ] Обновить `src/config/schema.ts` для platform union `codex` и managed model новых project-level артефактов
  _Requirements: FR-1, FR-2_
- [ ] Обновить `src/index.ts` и `src/installer/index.ts` для `--codex`, help output, interactive selection и install flow
  _Requirements: FR-1, FR-9_
- [ ] Нормализовать `src/installer/extensions.ts` и `src/updater/github.ts` под Codex sections и heterogeneous manifest shapes
  _Requirements: FR-1, FR-8_
- [ ] Зафиксировать в design/implementation, что `.agents/skills` не может быть derived только из текущего `.claude/skills` path model
  _Requirements: FR-6, FR-8_
- [ ] Обновить `install`, `install.ps1`, `install.sh` с учетом реального Windows universal entrypoint, а не только shell branch
  _Requirements: FR-9_
- [ ] Verify: core scenarios `codex-platform` переходят из Red в Green

## Phase 2: Project-Level Codex Artifact Writers (Green)

> Реализовать новый installer path, который пишет только project-level Codex artifacts.

- [ ] Создать `src/installer/codex.ts`
  _Requirements: FR-2, FR-4, FR-6, FR-7_
- [ ] Обновить `src/constants.ts` и `src/installer/shared.ts` для `.codex`, `.agents/skills`, merge-safe helpers и project-only writers
  _Requirements: FR-2, FR-3, FR-6_
- [ ] Реализовать `AGENTS.md`, `CLAUDE.md`, `.codex/config.toml`, `.codex/hooks.json`, `.agents/skills/*` как managed Codex artifact set
  _Requirements: FR-2, FR-3, FR-5, FR-6_
- [ ] Зафиксировать baseline `Codex >= 0.114.0` и `features.codex_hooks=true` в Codex config writer
  _Requirements: FR-4_
- [ ] Verify: core install/protection scenarios переходят в Green

## Phase 3: Direct Hooks Parity (Green)

> Реализовать прямой hook parity для расширений, которые действительно ложатся на `SessionStart` и `Stop`.

- [ ] Добавить manifest typing и installer wiring для Codex hooks
  _Requirements: FR-4_
- [ ] Materialize `Stop` hooks для `auto-commit` и `auto-simplify`
  _Requirements: FR-4, FR-8_
- [ ] Materialize `SessionStart` hooks для `claude-mem-health` и `bun-oom-guard`
  _Requirements: FR-4, FR-8_
- [ ] Валидировать `v0.114.0` entry shape (`type`, `command`, `statusMessage`, `timeout`) в `.codex/hooks.json`
  _Requirements: FR-4_
- [ ] Verify: core feature `codex-hooks-schema` и plugin features `auto-commit`, `auto-simplify`, `claude-mem-health`, `bun-oom-guard` переходят в Green

## Phase 4: Skills + MCP + Guidance Parity (Green)

> Реализовать parity через `.agents/skills`, `AGENTS.md` и `.codex/config.toml`.

- [ ] Пакетировать Codex skills в `.agents/skills/` с traceable managed ownership
  _Requirements: FR-6_
- [ ] Добавить project-level Codex MCP writer в `.codex/config.toml`
  _Requirements: FR-7_
- [ ] Обновить `extensions/specs-workflow/tools/mcp-setup/setup-mcp.py` и `tests/e2e/mcp-setup.test.ts` под Codex TOML flow или explicitly bypass old JSON writers
  _Requirements: FR-7, FR-11_
- [ ] Реализовать `AGENTS.md` guidance composer и CLAUDE coexistence blocks
  _Requirements: FR-5, FR-11_
- [ ] Verify: plugin features `suggest-rules`, `specs-workflow`, `tui-test-runner`, `plan-pomogator` переходят в Green

## Phase 5: Explicit Plugin Parity Decisions (Green)

> Для каждого plugin feature-файла зафиксировать отдельный Codex parity path.

- [ ] Обновить relevant `extensions/*/extension.json` для явных Codex parity sections
  _Requirements: FR-8, FR-11_
- [ ] Разрешить `suggest-rules` / `requiresClaudeMem` coupling через `src/installer/memory.ts` или через explicit exclusion/replacement strategy для Codex
  _Requirements: FR-8, FR-11_
- [ ] Реализовать explicit parity routing для `prompt-suggest`, `devcontainer`, `forbid-root-artifacts`, `plan-pomogator`
  _Requirements: FR-11_
- [ ] Проверить, что `test-statusline` остается отдельным feature-файлом, но marked excluded
  _Requirements: FR-8_
- [ ] Verify: все plugin feature-файлы имеют независимый Green path

## Phase 6: Managed Update Discipline (Green)

> Распространить существующую managed update discipline на `codex`.

- [ ] Обновить `src/updater/index.ts` и `src/updater/github.ts` для Codex assets, `.agents/skills`, `.codex/*` и stale cleanup
  _Requirements: FR-10_
- [ ] Добавить hash-based tracking для managed Codex files в `~/.dev-pomogator/config.json`
  _Requirements: FR-10_
- [ ] Защитить unrelated user-owned `.agents/skills/*` и guidance files during Codex update
  _Requirements: FR-3, FR-10_
- [ ] Verify: core update scenarios переходят в Green

## Phase 7: Docs, Docker and Final Verification

- [ ] Обновить `README.md` с Codex docs, project-level only policy, Windows bootstrap и требованием `Codex >= 0.114.0`
- [ ] Проверить, что `extension.json` manifests перечисляют все новые Codex assets
- [ ] `npm test` запускает split Codex e2e scenarios через Docker
- [ ] Все Codex BDD scenarios GREEN
- [ ] Финальная manual verification checklist для Codex support собрана в отчете
