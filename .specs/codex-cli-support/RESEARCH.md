# Research

## Контекст

Исследование фичи поддержки `Codex CLI` в `dev-pomogator`. Цель — подготовить полную спецификацию для третьей платформы `codex` с project-level only стратегией, безопасным merge/back-up существующих пользовательских артефактов, parity по всем текущим расширениям кроме `test-statusline`, и Windows bootstrap через `bash/sh`.

## Источники

- [Codex CLI](https://developers.openai.com/codex/cli) — overview, platform support
- [Config basics](https://developers.openai.com/codex/config-basic) — `~/.codex/config.toml` и `.codex/config.toml`
- [Configuration Reference](https://developers.openai.com/codex/config-reference) — ключи `config.toml`, `[mcp_servers]`
- [Custom instructions with AGENTS.md](https://developers.openai.com/codex/guides/agents-md) — project guidance model
- [Agent Skills](https://developers.openai.com/codex/skills) — `.agents/skills` и skill lifecycle
- [Customization](https://developers.openai.com/codex/concepts/customization) — связь `AGENTS.md`, skills и MCP
- [Custom Prompts](https://developers.openai.com/codex/custom-prompts/) — deprecated prompt model
- [Windows](https://developers.openai.com/codex/windows/) — native Windows sandbox и WSL path
- [Codex CLI features](https://developers.openai.com/codex/cli/features/) — skills, `/review`, web search, MCP, `codex exec`
- [Non-interactive mode](https://developers.openai.com/codex/noninteractive) — `codex exec`
- [Automations](https://developers.openai.com/codex/app/automations) — app automations
- [Codex GitHub Action](https://developers.openai.com/codex/github-action) — CI parity surface
- [Codex changelog](https://developers.openai.com/codex/changelog) — experimental hooks engine
- [openai/codex rust-v0.114.0 release](https://github.com/openai/codex/releases/tag/rust-v0.114.0) — release-level confirmation hooks shipped in `0.114.0`
- [openai/codex#13276](https://github.com/openai/codex/pull/13276) — `SessionStart`/`Stop` hooks PR
- [openai/codex discussion #2150](https://github.com/openai/codex/discussions/2150) — maintainer comment + `hooks.json` example

## Технические находки

### Codex project-level customization model

Официальная модель `Codex` строится вокруг project-level артефактов:

- `.codex/config.toml` — project-scoped override конфигурации
- `AGENTS.md` — persistent project guidance
- `.agents/skills/` — repo-local reusable workflows
- `[mcp_servers]` в `config.toml` — MCP конфигурация

Важная деталь: `custom prompts` существуют, но уже помечены как deprecated, а основной рекомендуемый путь для reusable workflows — `skills`.

### Codex hooks: confirmed, but still experimental

Во время исследования было подтверждено, что у `Codex` уже есть hooks engine:

- В release `rust-v0.114.0`: “Added an experimental hooks engine with `SessionStart` and `Stop` hook events.”
- В официальном changelog: “Added an experimental hooks engine with `SessionStart` and `Stop` hook events.”
- В merged PR `openai/codex#13276`: “This PR adds a first MVP for hooks, with SessionStart and Stop.”
- В maintainer discussion указан пример включения hooks через feature flag `features.codex_hooks=true` и `hooks.json` в `.codex`/config directory.

Текущий практический activation path, подтверждённый релизом/PR/discussion-связкой:

- использовать `Codex >= 0.114.0`
- включить hooks через `features.codex_hooks=true`
- положить `hooks.json` в `.codex` / config directory

Пример hook entry из discussion-level usage note:

- `type`
- `command`
- `statusMessage`
- `timeout`

Это означает, что спецификация должна проектировать не абстрактные “hooks вообще”, а именно `v0.114.0`-совместимую модель `feature flag + hooks.json + SessionStart/Stop`.

Отдельная operational note из discussion-level proof: hooks описываются как запускаемые вокруг prompt lifecycle (“before/after sending a prompt”). Так как это формулировка из discussion/example, а не из release note, в спецификации её стоит трактовать как runtime usage hint, но не как более широкий официальный набор event names.

Ограничение текущего этапа: подтверждены только два lifecycle события — `SessionStart` и `Stop`. Значит parity-архитектура должна опираться на них там, где это достаточно, и явно назначать другие Codex-native surfaces там, где нужны дополнительные lifecycle точки.

### Windows support и bootstrap implications

Официальные docs OpenAI говорят, что:

- `Codex CLI` на Windows поддерживается, но находится в experimental status
- для лучшего опыта CLI рекомендуется WSL
- native Windows использует отдельный sandbox model

Для этой фичи пользователь явно выбрал Windows bootstrap через `bash/sh`, а не через PowerShell-only flow. Это нужно зафиксировать как продуктовое решение фичи, даже если остальная документация OpenAI допускает native PowerShell path.

### Automation surfaces для functional parity

Помимо hooks, `Codex` предоставляет несколько automation surfaces:

- `codex exec` для non-interactive automation
- app automations для scheduled/background tasks в локальном app
- GitHub Action для CI-driven workflows
- `AGENTS.md` и `.agents/skills` для always-on guidance и repeatable procedures

Это означает, что parity для существующих расширений можно проектировать не только через hooks, но и через явное назначение наиболее подходящей Codex-native поверхности.

### Текущая архитектура dev-pomogator не готова к Codex без platform expansion

В текущем коде платформенная модель жёстко ограничена `cursor | claude`:

- `src/config/schema.ts` — `Platform = 'cursor' | 'claude'`
- `src/index.ts` — CLI parsing знает только `--cursor` и `--claude`
- `src/installer/extensions.ts` — manifests typed только под `cursor | claude`

Также текущая skill-модель ориентирована на Claude-specific destination:

- `src/constants.ts` → `SKILLS_DIR = '.claude/skills'`
- `extensions/*/extension.json` `skillFiles` указывают на `.claude/skills/...`

Следовательно, `Codex` support нельзя реализовать как alias существующей платформы; нужен отдельный installer/update path и отдельная destination model.

### Safe merge / backup уже существует и её надо переиспользовать

В проекте уже есть правильная основа для merge-safe обновления managed файлов:

- `src/updater/index.ts` содержит `shouldBackupFile()` и backup перед overwrite
- `.claude/rules/updater-managed-cleanup.md` требует hash-based managed tracking и backup user-modified files
- `.claude/rules/atomic-config-save.md` требует temp-file + atomic move для конфигов

Для `Codex` это особенно важно, потому что `AGENTS.md`, `CLAUDE.md`, `.codex/config.toml`, `.codex/hooks.json` и `.agents/skills/*` потенциально являются user-authored проектными файлами.

### Текущий MCP setup не подходит для Codex без отдельного writer

Существующий `extensions/specs-workflow/tools/mcp-setup/setup-mcp.py` умеет только:

- `.cursor/mcp.json` / `~/.cursor/mcp.json`
- `.mcp.json` / `~/.claude.json`

Для `Codex` нужен project-level writer под `.codex/config.toml` c секцией `[mcp_servers]`. Это не просто смена пути — это другая serialisation model: TOML вместо JSON.

### Дополнительные точки актуализации по текущему репозиторию

Поверх исходных research-выводов, текущее состояние репозитория добавляет еще несколько обязательных ограничений:

- В коде уже есть reusable substrate для Codex-safe implementation: `src/installer/shared.ts` и `src/updater/index.ts` уже решают portable commands, hash tracking, backup и stale cleanup. Значит фичу надо проектировать как expansion поверх существующей managed discipline, а не как greenfield rewrite.
- Test harness по состоянию на сейчас dual-platform only: `tests/e2e/helpers.ts`, `tests/e2e/cli-integration.test.ts` и `Dockerfile.test` знают только `cursor` и `claude`. Это делает Codex support не только product feature, но и test infrastructure feature.
- `suggest-rules` сейчас помечен `requiresClaudeMem`, а runtime memory bootstrap живет в `src/installer/memory.ts` и тоже ограничен `cursor | claude`. Следовательно parity для Codex требует explicit memory strategy, а не implicit reuse существующего Claude-only flow.
- Manifest landscape неоднороден: часть extension manifests уже отклоняется от идеальной typed model. Поэтому добавление `codex` требует отдельного manifest normalization шага, а не просто добавления третьего platform key.
- Windows bootstrap route нужно менять на уровне `install` и `install.ps1`, потому что universal entrypoint по умолчанию уходит в PowerShell path раньше shell-ветки. Правка одного `install.sh` не закроет продуктовый сценарий.

## Где лежит реализация

- App-код: `src/config/schema.ts`, `src/index.ts`, `src/installer/index.ts`, `src/installer/extensions.ts`, `src/installer/shared.ts`, `src/updater/index.ts`, `src/updater/github.ts`
- Конфигурация: `install`, `install.ps1`, `install.sh`, `README.md`, `extensions/*/extension.json`

## Выводы

1. `Codex` должен быть спроектирован как first-class платформа `dev-pomogator`, а не как вариант `Cursor` или `Claude`.
2. Выбранная пользователем стратегия `project-level only` полностью совместима с официальной Codex model.
3. Основные артефакты фичи: `.codex/config.toml`, `.codex/hooks.json`, `AGENTS.md`, `CLAUDE.md`, `.agents/skills/`, `.dev-pomogator/tools/`.
4. Hooks у `Codex` уже существуют в `v0.114.0+`, но пока ограничены `SessionStart` и `Stop` и требуют `features.codex_hooks=true`; поэтому functional parity нужно описывать как явное распределение по hooks / skills / `AGENTS.md` / `codex exec` / app automations / GitHub Action.
5. Существующие пользовательские project-level файлы должны рассматриваться как high-risk merge surface: без silent overwrite, только backup + warning + merge proposal.
6. Реализация должна опираться на уже существующие shared/update primitives, а не дублировать их в новом Codex-specific коде.
7. Test harness, MCP tooling и memory-coupled extensions являются частью объема фичи наравне с installer/update path.

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| atomic-config-save | `.claude/rules/atomic-config-save.md` | Конфиги пишутся через temp file + atomic move | `.codex/config.toml`, `.codex/hooks.json`, merge artefacts | FR-2, FR-3, NFR-Reliability |
| extension-manifest-integrity | `.claude/rules/extension-manifest-integrity.md` | `extension.json` — source of truth; новые platform assets должны быть перечислены в manifest | Добавление `codex` в manifests | FR-1, FR-6, FR-8 |
| updater-sync-tools-hooks | `.claude/rules/updater-sync-tools-hooks.md` | Апдейтер должен синхронизировать tools и hooks вместе | Reinstall/update path для `codex` | FR-4, FR-10 |
| updater-managed-cleanup | `.claude/rules/updater-managed-cleanup.md` | Только managed cleanup, backup user-modified files, smart merge configs | Existing user artifacts, update safety | FR-3, FR-10, NFR-Reliability |
| claude-md-glossary | `.claude/rules/claude-md-glossary.md` | `CLAUDE.md` — индекс/глоссарий, его нельзя разрушать или превращать в дубликат правил | Coexistence `AGENTS.md` + `CLAUDE.md` | FR-5, NFR-Usability |
| docker-only-tests | `.claude/rules/docker-only-tests.md` | Тесты живут в `tests/e2e/*` и запускаются через `npm test` | Phase 0/implementation test plan | FR-11, NFR-Reliability |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| Managed backup/update | `src/updater/index.ts` | Hash-based backup before overwrite + managed cleanup | Основа для safe merge Codex project files |
| MCP setup | `extensions/specs-workflow/tools/mcp-setup/setup-mcp.py` | Project/global config resolution, backup, atomic write | Reference для Codex TOML writer и MCP registration |
| Claude Stop hooks | `extensions/auto-commit/`, `extensions/auto-simplify/`, `extensions/prompt-suggest/` | Existing lifecycle automation patterns on `Stop` | Reuse mapping для `Codex Stop` parity |
| Claude SessionStart hooks | `extensions/claude-mem-health/`, `extensions/bun-oom-guard/` | Existing `SessionStart` hook patterns | Reuse mapping для `Codex SessionStart` parity |
| Existing skills bundles | `extensions/suggest-rules/skills/`, `extensions/tui-test-runner/skills/` | `SKILL.md` + scripts/references packaging | Source material для `.agents/skills/` |
| Root guidance | `CLAUDE.md` | Existing repo guidance/glossary that users may already maintain | Must coexist with `AGENTS.md`, not be clobbered |
| Installer targets | `install`, `install.ps1`, `install.sh` | Existing platform routing for `cursor`/`claude` | Needs explicit `codex` target and Windows bash/sh route |

### Architectural Constraints Summary

- `Codex` support must stay project-local: no writes to `~/.codex/*`, auth caches or user credential stores.
- Existing user-owned project files are treated as merge surfaces, not as installer-owned blank slates.
- `CLAUDE.md` already has repo-specific semantics in this project, so `AGENTS.md` introduction must coexist with it instead of replacing it.
- `Codex hooks` currently provide only `SessionStart` and `Stop`, require `Codex >= 0.114.0` and hook feature enablement; any parity requirement that needs more than those triggers must be routed explicitly through another supported Codex mechanism.
- Manifest, updater and bootstrap layers all require coordinated changes; partial support at only one layer would violate existing project rules and produce stale behaviour.
