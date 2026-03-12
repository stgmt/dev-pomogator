# Codex CLI Support

Project-level поддержка `Codex CLI` в `dev-pomogator`: новая платформа `codex` с локальными артефактами репозитория, безопасным merge/back-up пользовательских файлов, `Codex hooks`, `AGENTS.md`, `.agents/skills`, `.codex/config.toml` и parity для всех текущих расширений, кроме `test-statusline`.

## Ключевые идеи

- `Codex` проектируется как третья first-class платформа рядом с `Cursor` и `Claude Code`, а не как alias существующей платформы.
- Для `Codex` materialize только project-level артефакты: `.codex/*`, `AGENTS.md`, `.agents/skills/`, `.dev-pomogator/tools/`. Запись в `~/.codex/*` запрещена.
- Hook-driven parity в MVP опирается на experimental `Codex hooks` из `v0.114.0+` с включением `features.codex_hooks=true`.
- Существующие `AGENTS.md`, `CLAUDE.md`, `.codex/config.toml`, `.codex/hooks.json` и `.agents/skills/*` рассматриваются как high-risk merge surface: только backup + warning + merge guidance, без silent overwrite.
- BDD-слой фичи больше не монолитный: core-сценарии и parity каждого plugin описаны отдельными `.feature` файлами, чтобы их можно было независимо реализовывать и тестировать.
- Текущая кодовая база еще не реализует `Codex`, но уже содержит reusable substrate в `src/installer/shared.ts`, `src/updater/index.ts` и project-level installer path для Claude; спецификация теперь учитывает это как исходное состояние.

## BDD Suite

### Core

- `features/core/codex-platform.feature` — first-class platform, project-level only install, Windows bootstrap
- `features/core/codex-protection.feature` — backup, merge-safe guidance/config coexistence
- `features/core/codex-update.feature` — managed reinstall/update, stale cleanup
- `features/core/codex-hooks-schema.feature` — cross-cutting contract для `v0.114.0` hook entry shape

### Plugins

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

## Где лежит реализация

- **App-код**: `src/config/`, `src/installer/`, `src/updater/`
- **Поддерживающие зависимости**: `src/installer/memory.ts`, `extensions/specs-workflow/tools/mcp-setup/setup-mcp.py`, `tests/e2e/helpers.ts`, `Dockerfile.test`
- **Wiring**: `extensions/*/extension.json`, `install`, `install.ps1`, `install.sh`, `README.md`, `tests/e2e/`

## Навигация

| Файл | Содержимое |
|------|------------|
| [USER_STORIES.md](USER_STORIES.md) | Ключевые пользовательские истории |
| [USE_CASES.md](USE_CASES.md) | Основные сценарии установки, merge и update |
| [RESEARCH.md](RESEARCH.md) | Внешние и внутренние архитектурные выводы по Codex |
| [REQUIREMENTS.md](REQUIREMENTS.md) | Traceability matrix FR/AC/@feature и layout BDD suite |
| [FR.md](FR.md) | Functional requirements для платформы `codex` |
| [NFR.md](NFR.md) | Нефункциональные требования |
| [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) | EARS-критерии приемки |
| [DESIGN.md](DESIGN.md) | Архитектура installer/update path, manifest normalization, hooks, skills, merge flow |
| [FILE_CHANGES.md](FILE_CHANGES.md) | Целевые изменения по коду, manifests и test harness |
| [TASKS.md](TASKS.md) | TDD-порядок реализации с split feature suite |
| [CHANGELOG.md](CHANGELOG.md) | Изменения спецификации |
| [features/core/codex-platform.feature](features/core/codex-platform.feature) | Core BDD: платформа и bootstrap |
| [features/core/codex-protection.feature](features/core/codex-protection.feature) | Core BDD: backup и coexistence |
| [features/core/codex-update.feature](features/core/codex-update.feature) | Core BDD: reinstall/update |
| [features/core/codex-hooks-schema.feature](features/core/codex-hooks-schema.feature) | Core BDD: schema contract для `.codex/hooks.json` |
| `features/plugins/*.feature` | Plugin-level BDD files для независимой parity реализации |
| [codex-cli-support_SCHEMA.md](codex-cli-support_SCHEMA.md) | Контракты артефактов `.codex/*`, merge report и support matrix |

## Связанные правила

- `.claude/rules/atomic-config-save.md`
- `.claude/rules/extension-manifest-integrity.md`
- `.claude/rules/updater-sync-tools-hooks.md`
- `.claude/rules/updater-managed-cleanup.md`
- `.claude/rules/claude-md-glossary.md`
