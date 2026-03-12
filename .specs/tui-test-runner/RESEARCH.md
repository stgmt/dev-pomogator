# Research

## Контекст

Перенос TUI test runner из `D:\repos\zoho` (Python/Textual, ~1924 строки, dotnet-specific) в dev-pomogator как универсальный плагин с гибридной архитектурой: Textual (Python) для рендеринга + Node.js adapter для интеграции.

## Источники

- `D:\repos\zoho\tools\tui-test-explorer\` — исходный TUI test runner (Python/Textual)
- `D:\repos\zoho\tools\bdd-test-runner\` — wrapper scripts (PowerShell/Bash)
- GitHub: `simonstrumse/claude-code-manager` — TUI для Claude Code на Textual
- GitHub: `gotestyourself/gotestsum` (2,614 stars) — human-friendly test output
- GitHub: `nnnkkk7/lazyactions` (82 stars) — GitHub Actions TUI на Bubbletea
- GitHub: `jeffwright13/pytest-tui` — pytest TUI runner на Textual (прямой аналог)
- npm: `ink` (1.7M weekly downloads, 29-35k stars) — React-based terminal UI
- PyPI: `textual` (34.5k stars, v8.0.2) — Python TUI framework

## Технические находки

### Архитектура исходного TUI (zoho)

4 слоя:
1. **Test Runner Wrapper** (`test-runner.ps1/sh`) — оркестрация тестов, запись YAML
2. **Real-Time Status** — `logs/.test-runner-status.yaml` polling
3. **TUI Explorer** (Python/Textual) — 4 вкладки: Tests, Logs, Monitoring, Analysis
4. **Analyst** — автоматический анализ ошибок

Ключевые паттерны:
- Filesystem-based IPC (YAML polling, нет сокетов/pipes)
- Singleton instance management (lock file)
- Threading + Queue для executor (orphan process protection)
- Debounced state writes (0.5s)

### Сравнение Textual vs Ink

| Метрика | Ink (Node.js) | Textual (Python) |
|---------|---------------|------------------|
| Stars | ~29-35k | ~34.5k |
| NPM/PyPI downloads | 1.7M/week | N/A (pip) |
| Tabs виджет | @inkjs/ui | Встроенный |
| Tree виджет | Кастомный | Встроенный |
| Scroll/Log viewer | Нет нативного | Встроенный |
| TypeScript support | Нативный | N/A |
| Используется | Claude Code, Prisma | pytest-tui, claude-code-manager |

**Решение:** Гибрид — Textual (Python) для UI + Node.js adapter layer.
**Причина:** Все виджеты из коробки, 60% кода переносится из zoho напрямую, при этом интеграция с dev-pomogator через Node.js adapter.

### YAML Status Protocol

Существующий test-statusline контракт вынесен в `extensions/test-statusline/tools/test-statusline/status_types.ts` (TestStatus interface). Canonical v2 фиксирует один runtime payload с suites[], tests[], phases[], framework и log_file без dual-mode consumer logic.

Полная v2 schema: см. [DESIGN.md § YAML v2 Protocol Schema](DESIGN.md#yaml-v2-protocol-schema).

### Python Distribution

Стратегия: bundled Python files + pip install textual pyyaml через postInstall.
Прецедент в проекте: `extensions/specs-workflow/` использует Python postInstall.

## Где лежит реализация

- Исходный TUI: `D:\repos\zoho\tools\tui-test-explorer\tui_test_explorer\`
  - Entry point: `__main__.py`
  - App: `ui/app.py`
  - Widgets: `ui/widgets/*.py` (tests_tab, logs_tab, monitoring_tab, analysis_tab, toolbar, filter_bar, header_bar)
  - Adapter: `adapter/` (commands, discovery, executor, result_parser, state_service, models, tree_builder)
  - Analyst: `analyst/` (failure analysis)
- Существующий test-statusline: `extensions/test-statusline/tools/test-statusline/`
  - YAML types: `status_types.ts`
  - Wrapper: `test_runner_wrapper.sh`
  - Hook: `statusline_session_start.ts`
  - Render: `statusline_render.sh`

## Выводы

1. Гибридный подход оптимален: Textual даёт готовые виджеты, Node.js обеспечивает native интеграцию
2. YAML v2 protocol — ключевой контракт между Node.js и Python слоями
3. ~60% Python кода переносится из zoho, основная работа — framework adapters и v2 protocol
4. Оба расширения (test-statusline + tui-test-runner) сосуществуют без конфликтов

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| extension-manifest-integrity | `.claude/rules/extension-manifest-integrity.md` | extension.json — source of truth для апдейтера; обновлять files/rules/tools/toolFiles/hooks | Изменения в расширениях | FR-9, FR-10 |
| atomic-config-save | `.claude/rules/atomic-config-save.md` | Конфиги через temp file + atomic move | YAML writes | NFR-Reliability |
| docker-only-tests | `.claude/rules/docker-only-tests.md` | Тесты только через Docker (npm test) | E2E тесты | Verification |
| updater-sync-tools-hooks | `.claude/rules/updater-sync-tools-hooks.md` | Апдейтер обновляет tools и hooks вместе | Extension install | FR-10 |
| no-mocks-fallbacks | `.claude/rules/no-mocks-fallbacks.md` | Нет моков, fail-fast | Тесты, реализация | NFR-Reliability |
| self-improving | `.claude/rules/pomogator/self-improving.md` | Детекция ситуаций для новых rules/skills/hooks | Runtime | N/A |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| test-statusline | `extensions/test-statusline/` | Canonical YAML v2 statusline, wrapper, session hook, statusline render | Основа: переиспользуем общий runtime contract и wrapper |
| auto-simplify | `extensions/auto-simplify/` | Stop hook pattern, TypeScript hook handler | Паттерн для tui_stop.ts |
| suggest-rules | `extensions/suggest-rules/` | Complex extension with tools+skills+hooks+postInstall | Паттерн для полного extension.json |
| specs-workflow | `extensions/specs-workflow/` | Python postInstall hook | Прецедент Python в Node.js проекте |
| tsx-runner | `src/scripts/tsx-runner.js` | Multi-strategy TSX execution | Запуск TS hooks |
| test helpers | `tests/e2e/helpers.ts` | 1647-line test infrastructure | E2E тесты |

### Architectural Constraints Summary

1. **Canonical YAML v2** — один runtime payload ОБЯЗАН содержать flat summary для statusline и structured sections для TUI без dual-mode consumer logic
2. **Atomic writes** — YAML status файлы пишутся через temp+rename (rule: atomic-config-save)
3. **Fail-open** — все hooks exit 0, Python crash не блокирует тесты (rule: no-mocks-fallbacks → fail-fast, но hooks — fail-open)
4. **Docker-only tests** — E2E тесты только через `npm test` в Docker
5. **extension.json source of truth** — все toolFiles/hooks/envRequirements перечислены в manifest
6. **tsx-runner** — TypeScript hooks запускаются через tsx-runner.js (multi-strategy: npx tsx, node -e require)
