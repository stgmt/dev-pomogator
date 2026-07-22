# dev-pomogator

Canonical Claude Code marketplace plugin plus an explicit Codex plugin whitelist — командные стандарты, рабочие процессы, скиллы, хуки, and the first Codex-supported `context-menu` surface.

**Что это даёт:**
- Единый формат планов, спецификаций и коммитов для всей команды
- Автокоммиты с LLM-генерацией сообщений при завершении работы агента
- Анализ сессий и автоматическое предложение правил для проекта
- Защита от типичных LLM-ошибок (лишние файлы в корне, пустые фолбеки)
- TUI/statusline мониторинг тестов, BDD/specs workflow, hooks-автоматизация
- Pomogator-doctor diagnostic skill (GitHub CLI readiness plus environment checks)

> **v2.0 BREAKING**: npm install path удалён. Distribution через canonical Anthropic plugin marketplace (`/plugin marketplace add` + `/plugin install`). Cursor support удалён полностью. Existing v1 users — см. [Migration v1 → v2](#migration-v1--v2) ниже.

## Установка

### Canonical (рекомендуется)

В Claude Code CLI или Desktop session:

```
/plugin marketplace add stgmt/dev-pomogator
/plugin install dev-pomogator@stgmt
/reload-plugins
```

В Claude Desktop: после `/plugin install` restart Desktop application для подхвата нового plugin (или используй UI «**+**» button → «**Plugins**» browser для install с visual feedback).

### Scope flags (canonical Anthropic per plugin-marketplaces.md)

```
/plugin install dev-pomogator@stgmt --scope user      # default — across all your projects
/plugin install dev-pomogator@stgmt --scope project   # committed to <cwd>/.claude/settings.json (team-shared)
/plugin install dev-pomogator@stgmt --scope local     # personal per-repo (gitignored settings.local.json)
```

### Codex install (context-menu whitelist)

Codex uses its own plugin marketplace command tree; there is no npm `--codex` install flag. From this checkout:

```powershell
cd E:\repos\dev-pomogator
.\scripts\install-codex-context-menu.ps1
```

The script registers this checkout as a local Codex marketplace, installs `context-menu@dev-pomogator-codex`, and applies the Windows right-click menu with `--codex-only`.

This Codex path installs only `Codex.nss`, `imports/Codex.nss`, `codex-icon.ico`, and `launch-Codex-tui.ps1`; it does not create or overwrite Claude context-menu artifacts. The icon is extracted from the installed OpenAI Codex app when available; generated fallback is used only when the local app icon cannot be extracted. The current Codex entry is `Codex (YOLO)` with `-NoTui`; Codex+TUI is intentionally deferred until the TUI launcher path is verified.

## Что устанавливается

После canonical install Claude Code copies plugin к `~/.claude/plugins/cache/stgmt/dev-pomogator/<version>/`:

- **Skills** (47): `/dev-pomogator:create-spec`, `/dev-pomogator:run-tests`, `/dev-pomogator:plan-pomogator`, `/dev-pomogator:pomogator-doctor`, `/dev-pomogator:report-issue`, `/dev-pomogator:research-workflow` и др. — invokable через `Skill` tool или slash command
- **Commands**: `/reflect`, `/simplify`, `/pomogator-doctor`, `/report-issue` — slash commands из plugin
- **Hooks** (37 записей): SessionStart, Stop, PreToolUse, PostToolUse, UserPromptSubmit — declared в `.claude-plugin/hooks.json` plugin manifest
- **MCP servers**: настраиваются плагином через `.mcp.json`
- **Rules**: `.claude/rules/` content для context loading
- **Native statusline**: см. секцию ниже — подключается автоматически SessionStart-хуком

`enabledPlugins` declaration автоматически добавляется в `~/.claude/settings.json` соответствующего scope.

> 📍 **Карта всех встроенных инструментов и связей между ними**: [docs/COMPONENTS.md](docs/COMPONENTS.md) —
> dev-pomogator это одна система (один плагин), внутри которой инструменты связаны контурами:
> спеки → валидация → согласованность, тесты → мониторинг → качество, statusline ↔ doctor и т.д.

## Report an issue

Use `/report-issue <description>` (or `/dev-pomogator:report-issue`) to prepare a sanitized GitHub issue draft. The workflow shows the repository, title, body, and exact approval digest before it creates anything. On approval it uses GitHub CLI and opens the result URL. If GitHub CLI is missing, unauthenticated, or errors, it saves a Markdown draft and provides a filled GitHub new-issue URL instead. Authenticate with `gh auth login` to submit through GitHub CLI.

## Native statusline (repo + cwd + ветка)

Часть плагина (не отдельный plugin): SessionStart-хук `tools/native-statusline/` при первом
запуске сессии подключает [ccstatusline](https://github.com/sirmalloc/ccstatusline) как
основной statusline Claude Code и, если конфига виджетов ещё нет, создаёт
`~/.config/ccstatusline/settings.json` с 3-строчным столбиком (одна строка обрезается по
ширине терминала и съедает хвост):

```
Model: Opus 4.8 | Ctx: 232.0k
dev-pomogator | cwd: ~\dev-pomogator
⎇ feat/my-branch | (+555,-59)
```

Правила безопасности:

- Кастомный `statusLine.command` пользователя **никогда не перезаписывается** (keep-user).
- Существующий конфиг виджетов хук **не мутирует** — починка «слетевшего» конфига только
  через `/pomogator-doctor` (check `C-NSW`) с явным подтверждением; кастомные раскладки
  виджетов доктор тоже не трогает.
- Opt-out целиком: `DEV_POMOGATOR_STATUSLINE=off`.
- Бар отрисовывается со следующей сессии (settings читаются до хуков); немедленно — через
  fix-action доктора.

Спека: `.specs/native-statusline/` (FR-1…FR-11).

## Skills overview

| Skill | Purpose |
|-------|---------|
| `create-spec` | 4-фазный workflow создания/обновления specs (Discovery → Context → Requirements+Design → Finalization) |
| `research-workflow` | Hypothesis-FIRST research с triangulation через 3 INDEPENDENT angles + fail-loud markers |
| `pomogator-doctor` | Environment diagnostic: GitHub CLI readiness plus Node/Git/Bun/Python/MCP/hooks/env checks with severity grouping |
| `report-issue` | Sanitized GitHub issue draft with exact-digest approval and GitHub URL fallback |
| `run-tests` | Centralized test runner с TUI integration (vitest/jest/pytest/dotnet/cargo/go auto-detection) |
| `tests-create-update` | TDD-first test creation, integration tests preferred over unit |
| `dev-pomogator-uninstall` | Soft removal of dev-pomogator artifacts из project |
| `dedup-tests` | Duplicate test code detection через jscpd |
| `deep-insights` | Quantitative analysis Claude Code usage patterns |
| `debug-screenshot` | Screenshot-driven UI verification |
| `proxy-up` | Manage local Claude subscription proxy |
| `use-claude-subscription` | Wire project к Claude subscription (env config) |
| `context-menu` | Windows right-click Claude Code integration |
| `claude-in-chrome-multisession` | Multi-session Chrome MCP safety |
| `chrome-devtools-mcp-mux` | Chrome DevTools MCP multiplexer (multi-session) |
| `dev-pomogator-uninstall` | Removal utility |
| ... + others (skills/discovery-forms, requirements-chk-matrix, task-board-forms, variant-matrix-build для create-spec ecosystem) |

## Спецификации с проверяемой готовностью

`dev-pomogator` помогает провести функцию от потребности пользователя до требования,
критерия приёмки, BDD-сценария, задачи, теста и проверенного статуса. Цель — не просто
заполнить Markdown, а сохранить связи и подтверждения на каждом шаге. Если подтверждений
нет, процесс показывает пробел, а не объявляет работу готовой.

### Быстрый старт

1. Установите плагин по [инструкции выше](#установка) и перезагрузите Claude Code.
2. Попросите: **«создай спеку для …»**. Явный вызов установленного skill:
   `/dev-pomogator:create-spec <slug>`.
3. Пройдите Discovery → Context → Requirements + Design → Finalization и последующий
   аудит. STOP-точки подтверждают осознанное продолжение, но не заменяют проверку результата.
4. Чтобы понять, что покрывает требование или сценарий, используйте
   [`spec-graph-query`](.claude/skills/spec-graph-query/SKILL.md), а не собирайте связи
   текстовым поиском.
5. Запустите применимые тесты через `/run-tests`.
6. Перед заявлением «готово» вызовите `/spec-status <slug>`: он отделяет подтверждённое
   от заблокированного и заявленного без достаточных доказательств.
7. Готовность к релизу подтверждайте только результатами проверок, привязанными к
   конкретной версии кода. Один зелёный тест или заполненная доска задач этого не доказывают.

### Как читать готовность

| Состояние | Что оно означает |
|-----------|------------------|
| Документы существуют | Форма заполнена; реализация ещё не доказана |
| Структура проверена | Формат и ссылки корректны; это ещё не вывод о готовности |
| Есть результат тестов | Проверен конкретный объём кода в конкретное время |
| Критерии проверены | Для каждого критерия показано подтверждение или явный пробел; наличие пробела означает «не готово» |
| Готово к релизу | Все обязательные проверки привязаны к конкретной версии кода и её артефактам |

Структурная валидация — полезная предварительная проверка, но не вывод о здоровье спеки.
Актуальный статус получайте через `/spec-status` и
[итоговую проверку здоровья](.claude/spec-generator-discipline.md#the-one-health-command),
а не из статического README.

### Что обеспечивает процесс

SpecGraph связывает требование, критерий приёмки, сценарий, задачу и тест в обе стороны.
Специальные инструменты и автоматические проверки защищают эти связи при изменениях.
Независимая проверка не позволяет автору оценивать собственную работу слишком оптимистично:
отсутствие подтверждений остаётся видимым пробелом, а не превращается в ложный зелёный статус.

### Дополнительные возможности

- **Безопасная дверь для спецификаций:** MCP-сервер позволяет читать, проверять и изменять
  `.specs/` через структурированные инструменты вместо хрупкого ручного поиска и замены.
- **Автоматические проверки изменений:** хуки находят повреждённые ссылки, повторяющиеся
  идентификаторы и неверный Gherkin до того, как ошибка распространится по графу.
- **Миграция старых спецификаций:** `dev-pomogator-migrate-v3-to-v4` сначала показывает
  предлагаемые изменения, а затем применяет подтверждённые правки атомарно.
- **Навигация по Markdown:** Marksman добавляет переходы по ссылкам и заголовкам в редакторах
  с поддержкой LSP.
- **Удалённые среды:** MCP-сервер умеет запускаться в Codespaces и восстанавливаться после
  устаревшего lock-файла.

Технические детали и ограничения этих механизмов находятся в
[карте дисциплины](.claude/spec-generator-discipline.md) и соответствующих skill-документах.

### Работа с несколькими спецификациями

```
/spec-backlog              # посмотреть очередь найденных проблем
/cross-spec-reconcile      # найти противоречия между спецификациями
/cross-spec-resolve        # пройти по находкам и применить выбранные исправления
```

### Куда дальше

| Задача | Документация |
|--------|--------------|
| Создать или обновить спеку | [`create-spec`](.claude/skills/create-spec/SKILL.md) |
| Проверить, что реально подтверждено | [`spec-status`](.claude/skills/spec-status/SKILL.md) |
| Исследовать связи требований, сценариев и тестов | [`spec-graph-query`](.claude/skills/spec-graph-query/SKILL.md) |
| Провести весь процесс через существующие инструменты | [`spec-generator-orchestrator`](.claude/skills/spec-generator-orchestrator/SKILL.md) |
| Понять принципы трассируемости и защиты от ложного «готово» | [Spec-Generator Discipline](.claude/spec-generator-discipline.md) |

История реализации и внутренний реестр требований находятся в
[spec README](.specs/spec-generator-v4/README.md) и
[CHANGELOG](.specs/spec-generator-v4/CHANGELOG.md). Это история, а не источник
текущего статуса: готовность всегда вычисляется из свежих доказательств.

## Migration v1 → v2

Existing v1 users (installed через `npm i -g dev-pomogator` или `npx github:stgmt/dev-pomogator --claude`):

```bash
# Cleanup project + global v1 artifacts
npx tsx https://raw.githubusercontent.com/stgmt/dev-pomogator/main/tools/migrate-v1-to-v2/migrate-v1-to-v2.ts --global

# Or если уже cloned repo locally
cd /path/to/dev-pomogator-canonical-v2
npx tsx tools/migrate-v1-to-v2/migrate-v1-to-v2.ts --global
```

Script:
- Backups user-modified files в `<project>/.dev-pomogator/.user-overrides/<rel-path>` (content hash mismatch detection)
- Removes project-scope managed files (`.claude/skills/<dev-pomogator-managed>/`, `.claude/rules/<managed>/`, `.dev-pomogator/`)
- Removes managed marker block из `<project>/.gitignore` (preserves user entries)
- Removes `~/.dev-pomogator/` директорию (with `--global` flag)
- Smart-merges removal of dev-pomogator entries из `~/.claude/settings.json` (SessionStart hook + statusLine wrapper)
- Removes `~/.config/dev-pomogator/` если existует
- Idempotent — re-running после cleanup → exit 0 + informational

Flags:
- `--project-only` / `--no-global` — только project cleanup
- `--global-only` / `--no-project` — только global cleanup
- `--dry-run` — show что would быть removed без modification

После cleanup → canonical install (`/plugin marketplace add stgmt/dev-pomogator` + `/plugin install dev-pomogator@stgmt` + `/reload-plugins`).

## Diagnostic Doctor

`/pomogator-doctor` slash command или skill invocation проверяет GitHub CLI readiness and other environment aspects:

- 🟢 **Self-sufficient**: Node, Git, plugin cache structure, hooks registry, version match, native statusline (`C-NSL` команда + `C-NSW` виджеты repo/cwd)
- 🟡 **Needs env vars**: `AUTO_COMMIT_API_KEY` и др. (ищет в `.env` + `.claude/settings.local.json → env`)
- 🔴 **Needs external deps**: GitHub CLI authentication, Bun, Python + packages, Docker, MCP servers

Output: severity-coded report + actionable hints. Если detected v1 install — предлагает migration script. Если detected canonical install issue — предлагает `/plugin install dev-pomogator@stgmt --force`.

## Architecture (canonical v2.0)

- **Plugin manifests**: `.claude-plugin/{plugin.json, marketplace.json, hooks.json}` — canonical Anthropic schema, plugin self-contained для distribution
- **Skills**: `.claude/skills/<name>/SKILL.md` — distributed via plugin.json `"skills": ".claude/skills"` field override
- **Commands**: `.claude/commands/*.md` — slash commands
- **Hook scripts**: `tools/<tool>/<script>.ts` — TypeScript scripts, loaded via `tools/_shared/bootstrap.cjs` + `tools/_shared/tsx-runner.js` (multi-strategy tsx fallback)
- **Migration script**: `tools/migrate-v1-to-v2/migrate-v1-to-v2.ts` — standalone, user-driven (no plugin dependency)

## Требования

- **Node.js** ≥ 18 (с npm для tsx)
- **Git**
- **Claude Code** CLI ≥ 2.x (с plugin marketplace support) ИЛИ Claude Desktop application

## Лицензия

MIT
