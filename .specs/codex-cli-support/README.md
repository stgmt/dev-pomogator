# Codex CLI Support

Project-level поддержка `Codex CLI` в `dev-pomogator`: новая платформа `codex` с repo-local артефактами, merge-safe coexistence с пользовательскими файлами, version-aware hooks, `AGENTS.md`, `.agents/skills`, `.codex/config.toml` и честной support matrix по каждому текущему расширению.

## Ключевые идеи

- `Codex` проектируется как third first-class платформа рядом с `Cursor` и `Claude Code`, а не как alias существующей платформы.
- Managed project артефакты для `Codex`: `.codex/config.toml`, `.codex/hooks.json`, `AGENTS.md`, `.agents/skills/`, `.dev-pomogator/tools/`. Запись в `~/.codex/*` и user-level security/auth настройки запрещена.
- Project-level `.codex/*` работают только в trusted projects. Инсталлер может materialize repo-local файлы, но обязан предупредить, что до trust onboarding Codex их будет игнорировать.
- Hook surface versioned, а не статичный:
  - `0.114.0+`: `SessionStart`, `Stop`
  - `0.116.0+`: `UserPromptSubmit`
  - `0.117.0+`: `PreToolUse`, `PostToolUse`, но только для `Bash`
  - `0.120.0+`: Windows hook gate снят по changelog; при этом docs частично расходятся, значит нужен capability resolver, а не жёстко захардкоженная модель
- `AGENTS.md` для Codex является primary guidance surface. `CLAUDE.md` остаётся legacy glossary/index и optional fallback concern, но не core artifact, на котором должна держаться parity.
- Skills в Codex читаются не только из repo root: `.agents/skills` сканируется от текущей директории вверх до корня репозитория, а одинаковые `name` не merge-ятся. Значит упаковка skills должна быть collision-aware.
- Matching hooks одного события запускаются concurrently. Поэтому `dev-pomogator` не должен materialize несколько независимых managed hooks на один и тот же event; нужен единый dispatcher per event с deterministic fan-out внутри managed слоя.
- Support matrix больше не бинарная. Для каждого extension должно быть явно указано: `supported`, `partial` или `excluded`, version floor, parity surfaces и причина ограничений.

## Upstream Watchlist

Ниже зафиксированы upstream gaps Codex, из-за которых часть parity сейчас сознательно остаётся `partial` или `excluded`. Это не “забытые задачи”, а deferred re-check points.

- Нет `PreToolUse` / `PostToolUse` для non-Bash tools:
  Нужны `Write`, `Edit`, `ApplyPatch`, `WebSearch`, `MCP` и эквивалентные tool events.
  Блокирует full parity для `specs-workflow`, `plan-pomogator`, частично `tui-test-runner`.
- Нет event-а уровня `ExitPlanMode` или другого plan-mode lifecycle hook.
  Блокирует full parity для `plan-pomogator`.
- Нет native status line / status bar surface.
  Блокирует `test-statusline`; `notify` и `tui.notifications` не считаются эквивалентом.
- Нет ordered / priority-based execution model для matching hooks.
  Пока hooks concurrent, нужен dispatcher; если Codex позже даст deterministic chain, дизайн можно упростить.
- Windows hooks docs и changelog частично расходятся.
  Нужно повторно проверить при следующем revisit, можно ли снять часть capability gates.

## BDD Suite

### Core

- `features/core/codex-platform.feature` — first-class platform, trusted project model, native Windows / WSL strategy
- `features/core/codex-protection.feature` — backup, merge-safe coexistence для project files
- `features/core/codex-update.feature` — managed reinstall/update, stale cleanup
- `features/core/codex-hooks-schema.feature` — version-aware hook contract, additive layering и dispatcher discipline

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
| [USE_CASES.md](USE_CASES.md) | Основные сценарии установки, layering, update и parity routing |
| [RESEARCH.md](RESEARCH.md) | Актуальный ресерч по Codex hooks, trust, AGENTS, skills и Windows |
| [REQUIREMENTS.md](REQUIREMENTS.md) | Traceability matrix FR/AC/@feature и support-matrix expectations |
| [FR.md](FR.md) | Functional requirements для платформы `codex` |
| [NFR.md](NFR.md) | Нефункциональные требования |
| [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) | EARS-критерии приемки |
| [DESIGN.md](DESIGN.md) | Архитектура installer/update path, trust/layering, dispatch, skills, MCP и parity routing |
| [FILE_CHANGES.md](FILE_CHANGES.md) | Целевые изменения по коду, manifests и test harness |
| [TASKS.md](TASKS.md) | TDD-порядок реализации с version-aware Codex capability model |
| [CHANGELOG.md](CHANGELOG.md) | Изменения спецификации |
| [features/core/codex-platform.feature](features/core/codex-platform.feature) | Core BDD: platform target, trust и Windows strategy |
| [features/core/codex-protection.feature](features/core/codex-protection.feature) | Core BDD: backup и coexistence |
| [features/core/codex-update.feature](features/core/codex-update.feature) | Core BDD: reinstall/update |
| [features/core/codex-hooks-schema.feature](features/core/codex-hooks-schema.feature) | Core BDD: versioned hook contract и dispatcher discipline |
| `features/plugins/*.feature` | Plugin-level BDD files для независимой и честной parity оценки |
| [codex-cli-support_SCHEMA.md](codex-cli-support_SCHEMA.md) | Контракты `.codex/*`, merge report и support matrix |

## Связанные правила

- `.claude/rules/atomic-config-save.md`
- `.claude/rules/extension-manifest-integrity.md`
- `.claude/rules/updater-sync-tools-hooks.md`
- `.claude/rules/updater-managed-cleanup.md`
- `.claude/rules/claude-md-glossary.md`
