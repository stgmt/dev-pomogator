# Research

## Контекст

Gap analysis между zoho TUI test explorer (`D:\repos\zoho\tools\tui-test-explorer\`) и нашим `extensions/tui-test-runner/`. Наш TUI реализован на ~85% (4 таба, 4 адаптера, YAML v2, launcher, test guard, /run-tests skill). Нужно портировать 7 недостающих фич из zoho.

**Ключевое отличие:** В zoho TUI запускается как standalone CLI (`python -m tui_test_explorer --dir . --run`). Здесь TUI вызывается по **комбинации клавиш** в Claude Code через keybinding → launcher.ts → Python TUI (detached process).

## Источники

- Zoho TUI source: `D:\repos\zoho\tools\tui-test-explorer\` (19 модулей, 4898 LOC Python)
- Наш TUI: `extensions/tui-test-runner/` (26 файлов: 12 Node.js + 14 Python)
- Наши спеки: `.specs/tui-test-runner/` (v1, Phases 1-6 done, Phase 0/7 pending)
- Claude Code keybindings: `~/.claude/keybindings.json` (ещё не существует)

## Технические находки

### Gap Analysis: 7 недостающих фич

| # | Фича | Zoho source | LOC | Portability | Priority | Effort |
|---|------|-------------|-----|-------------|----------|--------|
| 1 | AI Test Analyst | `analyst/` (8 файлов) | 2665 | 90% | HIGH | High |
| 2 | Clickable file paths | `ui/widgets/clickable_path.py` | 224 | 95% | HIGH | Low |
| 3 | Test discovery | `adapter/discovery.py` | 77 | 50% | HIGH | Medium |
| 4 | State persistence | `adapter/state_service.py` | 181 | 95% | MEDIUM | Low |
| 5 | Configurable error patterns | `analyst/patterns.yaml` + `patterns.py` | 283 | 100% | MEDIUM | Low |
| 6 | Auto-run & keybinding launch | `__main__.py` + `app.py` | 230 | 80% | MEDIUM | Low |
| 7 | Screenshot/SVG export | `app.py` (lines 464-487) | 24 | 70% | LOW | Low |

### Zoho AI Test Analyst — Архитектура

```
analyst/
├── __main__.py      (344 LOC) — CLI entry point, v3 analysis flow
├── patterns.py      (172 LOC) — Pattern matching engine (regex OR keyword-AND)
├── patterns.yaml    (111 LOC) — 31 patterns (timeout, connection, DB, auth, HTTP...)
├── parsers.py       (724 LOC) — Report/log parsing, stack traces, JSON logs (Serilog)
├── output.py        (884 LOC) — Report generation v2/v3, failure cards
├── code_reader.py   (153 LOC) — Code snippet extraction (±3 lines from error)
├── pattern_generator.py (262 LOC) — LLM pattern generation (aipomogator.ru, DeepSeek)
└── __init__.py      (15 LOC)
```

**Pattern Matching Algorithm (patterns.py:29-40):**
1. Regex match (IGNORECASE) — если regex задан
2. Keyword ALL match (case-insensitive) — если keywords заданы
3. First pattern wins (break на первом match)
4. Match text = `"{error_type} {error_message}"`

**V3 Report Format:**
```yaml
version: 3
failures:
  - test: "TestName"
    error: {type, message}
    location: {crash_point: {file, line, method}, call_tree: "ASCII"}
    bdd_steps: {context: [...], failed: {step, status, error}}
    log_context: {lines: "34-56", content: "..."}
    matched_pattern: {id: "timeout", hint: "Check service availability"}
    structured_context: {trace_id, span_id}
```

### Zoho Clickable Paths — Реализация

**Widget:** `ClickablePath(Static)` — Textual Static widget.
- `on_click()` → `_open_in_explorer()` → platform-specific subprocess
- Windows: `explorer /select, path`
- macOS: `open -R path`
- Linux: `xdg-open target`
- Amber flash animation (0.3s) на клик
- Truncation: `"..." + path[-(len-3):]` для длинных путей

### Zoho State Persistence — Паттерн

**Singleton + Debounced Save:**
- `TestStateService.__new__()` — thread-safe singleton (threading.Lock)
- `update_test()` → `_schedule_save()` → Timer(0.5s) → `_save_state()` (YAML)
- Subscriber pattern: `subscribe(callback)` для UI обновлений
- State: last tab, filter, test results, expanded nodes

### Zoho Test Discovery — Алгоритм

**Текущее покрытие:** только .NET (`dotnet test --list-tests`)
**Нужно расширить:**
| Framework | Discovery command | Parse logic |
|-----------|-------------------|-------------|
| vitest | `npx vitest --list` | JSON output → test names |
| jest | `npx jest --listTests` | File paths → test names |
| pytest | `python -m pytest --collect-only -q` | `<Module>/<Function>` tree |
| dotnet | `dotnet test --list-tests -v=q` | Indented test names after header |
| rust | `cargo test -- --list` | `test_name: test` lines |
| go | `go test -list '.*' ./...` | Test function names |

### Наш текущий TUI — Что уже есть

**Hybrid Node.js/Python архитектура:**
- Node.js: 12 файлов (adapters, launcher, config, dispatch, test_guard, yaml_writer)
- Python: 14 файлов (Textual app, 4 tabs, models, yaml/log readers)
- 4 адаптера: vitest, jest, pytest, dotnet
- YAML v2 protocol (backward compatible с v1 statusline)
- Atomic writes (temp + rename)
- SessionStart hook + PreToolUse guard + /run-tests skill
- Singleton lock (PID file) для single instance

**Analysis tab (analysis_tab.py, 138 LOC):**
- 7 hardcoded ERROR_PATTERNS (regex)
- Категории: Assertion, Timeout, Connection, Permission, Not Found, Type Error, Runtime, Unknown
- Generic recommendations ("Check expected values and test data")
- **Не хватает:** configurable patterns, code snippets, v3 reports, LLM generation

**Logs tab (logs_tab.py, 97 LOC):**
- 20+ regex highlight patterns (log levels, test results, BDD, timestamps, HTTP, file paths, durations)
- RichLog с auto-scroll, max 10K lines
- File paths highlighted но **не кликабельны**

**Запуск:**
- `/run-tests` skill → test_runner_wrapper.sh → adapters → YAML v2
- launcher.ts spawns Python TUI detached
- **Нет keybinding** — только skill invocation
- Внутри TUI: 1-4 tabs, q quit, f filter

## Где лежит реализация

- Наш TUI: `extensions/tui-test-runner/tools/tui-test-runner/`
- Python TUI: `extensions/tui-test-runner/tools/tui-test-runner/tui/`
- Adapters: `extensions/tui-test-runner/tools/tui-test-runner/adapters/`
- Analysis tab: `extensions/tui-test-runner/tools/tui-test-runner/tui/widgets/analysis_tab.py`
- Logs tab: `extensions/tui-test-runner/tools/tui-test-runner/tui/widgets/logs_tab.py`
- Zoho analyst: `D:\repos\zoho\tools\tui-test-explorer\analyst\`
- Zoho widgets: `D:\repos\zoho\tools\tui-test-explorer\tui_test_explorer\ui\widgets\`

## Reuse Plan из Zoho

| Component | Zoho source | Action | Target path |
|-----------|-------------|--------|-------------|
| `patterns.yaml` | `analyst/patterns.yaml` | Адаптация: убрать .NET-specific, добавить vitest/jest | `tui/analyst/patterns.yaml` |
| `patterns.py` | `analyst/patterns.py` | Прямой порт | `tui/analyst/patterns.py` |
| `code_reader.py` | `analyst/code_reader.py` | Прямой порт (исключения: `/node_modules/` вместо `/bin/`) | `tui/analyst/code_reader.py` |
| `output.py` | `analyst/output.py` | Адаптация v3 формата (убрать Serilog, добавить vitest/jest) | `tui/analyst/output.py` |
| `parsers.py` | `analyst/parsers.py` | Адаптация (убрать .NET stack traces, добавить JS/Python) | `tui/analyst/parsers.py` |
| `pattern_generator.py` | `analyst/pattern_generator.py` | Прямой порт (LLM integration) | `tui/analyst/pattern_generator.py` |
| `clickable_path.py` | `ui/widgets/clickable_path.py` | Прямой порт (Python→Python, Textual→Textual) | `tui/widgets/clickable_path.py` |
| `state_service.py` | `adapter/state_service.py` | Прямой порт + session prefix | `tui/state_service.py` |
| `discovery.py` | `adapter/discovery.py` | Расширить на 6 фреймворков | `tui/discovery.py` |

## Выводы

1. **80% кода из zoho портируется напрямую** — Python→Python, Textual→Textual
2. **Основная адаптация**: .NET → multi-framework (JS stack traces, vitest/jest parsers)
3. **Keybinding launch** — новая фича, не из zoho, требует интеграцию с Claude Code keybindings API
4. **Analysis tab** нуждается в полной переработке: от 7 hardcoded patterns → configurable PatternMatcher + v3 reports
5. **Порядок реализации**: patterns (фундамент) → clickable paths (quick win) → state → discovery → analyst → auto-run → screenshot

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| centralized-test-runner | `.claude/rules/centralized-test-runner.md` | Тесты только через /run-tests | Запуск тестов | FR-3, FR-6 |
| docker-only-tests | `.claude/rules/docker-only-tests.md` | Тесты через Docker в dev-pomogator | Создание тестов | NFR |
| extension-manifest-integrity | `.claude/rules/extension-manifest-integrity.md` | Манифест = source of truth для апдейтера | Изменение extension | FR-1..FR-7 |
| atomic-config-save | `.claude/rules/atomic-config-save.md` | Конфиги через temp+rename | Запись state/patterns | FR-4, FR-5 |
| no-mocks-fallbacks | `.claude/rules/no-mocks-fallbacks.md` | Без моков, fail-fast | BDD тесты | All FR |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| tui-test-runner v1 | `extensions/tui-test-runner/` | Полный TUI с 4 табами, 4 адаптерами, launcher | Base для всех FR |
| test-statusline | `extensions/test-statusline/` | YAML v1 statusline, session isolation | Shared YAML protocol |
| analysis_tab.py | `tui/widgets/analysis_tab.py` | 7 hardcoded error patterns | Будет заменён FR-1, FR-5 |
| logs_tab.py | `tui/widgets/logs_tab.py` | 20+ highlight patterns, file path regex | Base для FR-2 |
| yaml_writer.ts | `tools/tui-test-runner/yaml_writer.ts` | Atomic YAML v2 writes | Shared для FR-4 |
| /run-tests skill | `skills/run-tests/SKILL.md` | Framework detection + wrapper | Интеграция с FR-3, FR-6 |

### Architectural Constraints Summary

- **Hybrid architecture**: Node.js adapters + Python TUI — новые фичи добавляются в Python слой (tui/)
- **Atomic writes**: Все записи конфигов через temp+rename (FR-4 state, FR-5 patterns)
- **Manifest integrity**: Каждый новый файл должен быть в `toolFiles` extension.json
- **Docker tests**: BDD тесты только через Docker, E2E в `tests/e2e/`
- **Keybinding**: Claude Code поддерживает `~/.claude/keybindings.json` — новая интеграционная точка
- **Session isolation**: State files с session prefix (как YAML status files)
