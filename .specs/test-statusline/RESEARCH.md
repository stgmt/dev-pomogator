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

### Экосистема statusline расширений

GitHub поиск выявил 415+ репозиториев statusline для Claude Code. **Ни одно не реализует мониторинг тест-процессов.** Ближайшие:
- ccstatusline Custom Command widget — можно использовать для интеграции
- claude-hud — отслеживает todo progress, но не тесты

### Feature Request #13847

- Предлагал `[running backend:3001] [npm build --watch] [tests]` формат
- Закрыт автоматически за неактивность (Feb 2026)
- Нет ответа от maintainers

## Где лежит реализация

- Statusline config: `~/.claude/settings.json` → `statusLine.command`
- Project hooks: `.claude/settings.json` → `hooks.SessionStart`, `hooks.Stop`
- Extension source: `extensions/test-statusline/`
- Deployed tools: `.dev-pomogator/tools/test-statusline/`
- Status files: `logs/.test-status.{session_id}.yaml`
- Daemon PID: `logs/.test-daemon.{session_id}.pid`

## Выводы

1. **Готового решения нет** — нужно строить с нуля
2. **Statusline API достаточен** — может читать файлы и рендерить произвольный текст
3. **Ограничение обновлений** — не по таймеру, только на assistant events — ОК для реального use case
4. **Session isolation через session_id** — Claude Code предоставляет его в JSON
5. **Daemon подход валиден** — отделяет мониторинг от рендеринга, работает кроссплатформенно

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

- **atomic-config-save**: Все YAML записи daemon'а должны быть атомарными (temp + rename)
- **atomic-update-lock**: PID file daemon'а через `flag: 'wx'` для предотвращения параллельных daemon'ов
- **extension-manifest-integrity**: extension.json должен перечислять ВСЕ файлы в toolFiles
- **docker-only-tests**: BDD тесты запускаются только в Docker через `npm test`
- **Statusline limitation**: обновляется только на assistant events, не по таймеру
