# Research

## Контекст

Исследование возможности отображения статуса тест-раннера в Claude Code statusline. Поиск готовых решений, анализ API statusline, верификация гипотез через live PoC.

## Источники

- [Claude Code Statusline Docs](https://code.claude.com/docs/en/statusline) — Официальная документация
- [GitHub Issue #13847](https://github.com/anthropics/claude-code/issues/13847) — Feature request "Show running background bash processes in statusline" (CLOSED, NOT PLANNED)
- [sirmalloc/ccstatusline](https://github.com/sirmalloc/ccstatusline) — 4.6k stars, Custom Command widget
- [jarrodwatts/claude-hud](https://github.com/jarrodwatts/claude-hud) — 4.2k stars, todo progress tracking
- [Issue #20588](https://github.com/anthropics/claude-code/issues/20588) — "Add active agents/tasks to statusLine JSON input" (DUPLICATE of #18455)

## Технические находки

### Claude Code Statusline API

- Shell script получает JSON на stdin с данными сессии
- Печатает 1+ строк на stdout → отображается внизу Claude Code
- **Обновляется**: после каждого assistant message, permission change, vim mode toggle
- **Debounce**: 300ms — rapid changes batched
- **НЕ обновляется** по таймеру — только при конверсационных событиях
- Может выполнять произвольные команды (git, чтение файлов)
- Не потребляет API tokens

### JSON Schema (stdin)

Ключевые поля для нашего расширения:
- `session_id` — уникальный идентификатор сессии (для session isolation)
- `cwd` — текущая рабочая директория
- `workspace.current_dir` — то же что cwd
- `workspace.project_dir` — директория запуска Claude Code

### PoC Верификация

Live тест подтвердил:
- Bash скрипт корректно читает YAML файл и рендерит форматированную строку
- ANSI цвета работают в statusline
- Fallback при отсутствии файла (тихий exit) работает корректно
- Простой YAML парсер через grep/sed достаточен (не нужен yq)

### Экосистема statusline расширений (Deep Research)

GitHub поиск выявил 415+ репозиториев statusline для Claude Code. **Ни одно не реализует мониторинг тест-процессов.** Ни один проект НЕ предоставляет plugin SDK — все монолитные.

#### Community проекты

| Проект | Stars | Язык | Plugin SDK | Ключевые фичи |
|--------|-------|------|-----------|----------------|
| ccstatusline | 4.6k | Bash | Нет | Custom Command widget, конфигурация через JSON |
| CCometixLine | ~200 | Python | Нет | Multi-line compose, ANSI colors, модульная структура |
| claude-powerline | ~150 | Bash | Нет | oh-my-posh стиль, git status, system metrics |
| claudia-statusline | ~80 | TypeScript | Нет | React-like состояние, WebSocket bridge |
| claude-statusline | ~50 | Bash | Нет | Минималистичный, git branch + cost |
| claude_monitor_statusline | ~30 | Python | Нет | CPU/RAM мониторинг, disk usage |
| claude-hud | 4.2k | TypeScript | Нет | Todo progress tracking, не тесты |

**Вывод:** Все проекты configuration-only, расширяемость через shell variable подстановку или конфиг-файлы. Нет ни одного plugin/module API.

#### Официальный Statusline API

JSON stdin → shell script → stdout text. Полная schema (30+ полей):

| Группа | Поля | Описание |
|--------|------|----------|
| session | `session_id` | Уникальный ID сессии |
| model | `model.name`, `model.provider`, `model.api_type` | Текущая модель |
| workspace | `workspace.current_dir`, `workspace.project_dir` | Рабочие директории |
| cost | `cost.total_cost_usd`, `cost.session_cost_usd`, `cost.message_cost_usd` | Стоимость |
| context_window | `context_window.used_tokens`, `context_window.max_tokens`, `context_window.percent_used` | Контекст |
| vim | `vim.mode` | Режим vim (если включён) |
| worktree | `worktree.is_active`, `worktree.branch`, `worktree.path` | Git worktree |
| agent | `agent.name` | Имя агента (если запущен) |
| cwd | `cwd` | Текущая директория |

Поддерживает multi-line (каждый echo = отдельная строка в statusline), ANSI colors, OSC 8 links. Debounce 300ms.

#### SDK: cchooks

`cccnext/cchooks` — Python SDK для hooks (NOT statusline):
- `create_context()` возвращает typed context objects (PreToolUse, PostToolUse, etc.)
- Декораторы для hook-функций
- Не покрывает statusline scripts — только hooks lifecycle
- **Вывод:** Полезен как reference для TypeScript typed contexts, но не для statusline

#### Верифицированные гипотезы

| # | Гипотеза | Статус | Пруф |
|---|----------|--------|------|
| 1 | Community проекты имеют plugin SDK | ОПРОВЕРГНУТО | Все 6+ проектов монолитные |
| 2 | Statusline API поддерживает multi-line | ПОДТВЕРЖДЕНО | Каждый echo = отдельная строка |
| 3 | Наш YAML side-channel ортогонален | ПОДТВЕРЖДЕНО | Ни один проект не использует внешний data source |
| 4 | Есть SDK для statusline extensions | ОПРОВЕРГНУТО | cchooks = hooks only |

#### Рекомендации

1. **НЕ интегрироваться** с существующими statusline — все монолитные, нет API
2. **Использовать multi-line compose** — наша строка может быть одной из нескольких строк statusline
3. **YAML side-channel** — уникальный и валидный подход, не конфликтует с основными statusline
4. **Потенциал для marketplace** — при появлении Claude Code marketplace наш extension.json близок к формату cc-marketplace-boilerplate

## Forkable Projects

Проекты с полезными паттернами для адаптации (не полного форка):

| Проект | Repo | Что адаптировать | Ценность для нас |
|--------|------|------------------|------------------|
| oh-my-claude | `ZachHandley/oh-my-claude` | bats-core bash testing, background usage updater (60s interval), oh-my-posh rendering | Тестирование bash-скриптов (statusline_render.sh, test_runner_wrapper.sh) через bats-core; паттерн фонового обновления |
| cc-marketplace-boilerplate | `anthropics/cc-marketplace-boilerplate` | Plugin scaffold: `.claude-plugin/plugin.json`, agents/, commands/, skills/, hooks/ | Структура plugin manifest для будущей публикации в marketplace |
| claude-hooks | `decider/claude-hooks` | Dispatcher pattern: `universal-*.py` routing, code quality enforcement, notification system | Паттерн hooks dispatcher для hooks-integrity-guard |
| cchooks | `cccnext/cchooks` | Python SDK: `create_context()` с typed contexts (PreToolUse, PostToolUse, etc.) | Typed context objects для TypeScript hooks SDK |

### Рекомендации по адаптации

- **bats-core** (oh-my-claude) — для unit-тестов bash-скриптов, без необходимости Docker. Адаптация подхода, не форк
- **Plugin manifest** (cc-marketplace-boilerplate) — сравнить `.claude-plugin/plugin.json` с нашим `extension.json`, выровнять при необходимости для совместимости с будущим marketplace
- **Hooks dispatcher** (claude-hooks) — `universal-*.py` routing как вдохновение для hooks-integrity архитектуры
- **Typed contexts** (cchooks) — уже частично реализовано в `statusline_session_start.ts` (readStdin), расширить типизацию

### Feature Request #13847

- Предлагал `[running backend:3001] [npm build --watch] [tests]` формат
- Закрыт автоматически за неактивность (Feb 2026)
- Нет ответа от maintainers

## Где лежит реализация

- Statusline config: `~/.claude/settings.json` → `statusLine.command`
- Project hooks: `.claude/settings.json` → `hooks.SessionStart`, `hooks.Stop`
- Extension source: `extensions/test-statusline/`
- Deployed tools: `.dev-pomogator/tools/test-statusline/`
- Status files: `.dev-pomogator/.test-status/status.{session_id_prefix}.yaml`

## Выводы

1. **Готового решения нет** — нужно строить с нуля
2. **Statusline API достаточен** — может читать файлы и рендерить произвольный текст
3. **Ограничение обновлений** — не по таймеру, только на assistant events — ОК для реального use case
4. **Session isolation через session_id** — Claude Code предоставляет его в JSON
5. **Wrapper подход валиден** — test runner wrapper пишет YAML напрямую, без daemon-процесса

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| extension-manifest-integrity | `.claude/rules/extension-manifest-integrity.md` | extension.json = source of truth для апдейтера | Изменения в extensions/ | FR-9 (manifest) |
| atomic-config-save | `.claude/rules/atomic-config-save.md` | Конфиги через temp + atomic move | Запись файлов | FR-3 (YAML writes) |
| atomic-update-lock | `.claude/rules/atomic-update-lock.md` | Lock через flag 'wx' | Параллельные процессы | FR-5 (daemon PID) |
| updater-sync-tools-hooks | `.claude/rules/updater-sync-tools-hooks.md` | Апдейтер синхронизирует tools и hooks | Установка/обновление | FR-9 (install) |
| docker-only-tests | `.claude/rules/docker-only-tests.md` | Тесты только через Docker | Тестирование | NFR (testing) |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| auto-simplify | `extensions/auto-simplify/` | Stop hook pattern, fail-open, anti-loop | Reuse hook architecture |
| prompt-suggest | `extensions/prompt-suggest/` | Stop + UserPromptSubmit hooks, state file, core module | Reuse readStdin(), log(), atomic writes |
| claude-mem-health | `extensions/claude-mem-health/` | SessionStart hook pattern | Reuse daemon launcher pattern |
| tsx-runner.js | `src/scripts/tsx-runner.js` | Resilient TypeScript execution | Reuse for hook execution |
| ccstatusline | User's `~/.claude/settings.json` | Current statusline tool | Integration target (custom command) |

### Architectural Constraints Summary

- **atomic-config-save**: Все YAML записи wrapper'а должны быть атомарными (temp + rename)
- **extension-manifest-integrity**: extension.json должен перечислять ВСЕ файлы в toolFiles
- **docker-only-tests**: BDD тесты запускаются только в Docker через `npm test`
- **Statusline limitation**: обновляется только на assistant events, не по таймеру
