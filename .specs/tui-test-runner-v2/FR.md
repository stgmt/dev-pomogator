# Functional Requirements (FR)

## FR-1: AI Test Analyst @feature1

TUI Analysis tab должен предоставлять AI-анализ провалившихся тестов с pattern matching, code snippets и structured failure reports (v3 format).

### FR-1a: Pattern Matching @feature1

PatternMatcher загружает паттерны из `patterns.yaml` и сопоставляет каждый failure:
- Regex match (IGNORECASE) — если regex задан в паттерне
- Keyword ALL match (case-insensitive) — если keywords заданы
- First pattern wins (приоритет по порядку в YAML)
- Match text = `"{error_type} {error_message}"`

### FR-1b: Code Snippet Extraction @feature1

CodeReader извлекает фрагмент кода вокруг строки ошибки:
- Контекст: ±3 строки от error line
- Поиск файла по имени в дереве проекта (пропуск node_modules, .git, dist, build)
- Форматирование: `201| → code here` (стрелка на error line)
- Кеширование прочитанных файлов (один файл читается один раз)

### FR-1c: Structured Failure Reports (V3) @feature1

Каждый failure представляется как v3 report card:
- `location`: crash_point (file, line, method) + call_tree (ASCII tree)
- `bdd_steps`: context (passed steps) + failed (step, error)
- `log_context`: lines range + content
- `matched_pattern`: id + hint (рекомендация по исправлению)
- `structured_context`: trace_id, span_id (если доступны)

### FR-1d: LLM Pattern Generation @feature1

PatternGenerator генерирует новые паттерны для нераспознанных ошибок:
- API: aipomogator.ru (DeepSeek) с JSON Schema structured output
- Input: новые уникальные ошибки + существующие паттерны
- Output: GeneratedPattern[] (id, match/keywords, severity)
- Hints НЕ генерируются LLM — добавляются вручную после review
- Standalone CLI, не вызывается в runtime

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-ai-test-analyst-feature1), [AC-1a](ACCEPTANCE_CRITERIA.md#ac-1a-fr-1a-pattern-matching-feature1), [AC-1b](ACCEPTANCE_CRITERIA.md#ac-1b-fr-1b-code-snippet-extraction-feature1), [AC-1c](ACCEPTANCE_CRITERIA.md#ac-1c-fr-1c-structured-failure-reports-v3-feature1), [AC-1d](ACCEPTANCE_CRITERIA.md#ac-1d-fr-1d-llm-pattern-generation-feature1)
**Use Case:** [UC-1](USE_CASES.md#uc-1-ai-анализ-провалившихся-тестов-feature1)
**Leverage:** `D:\repos\zoho\tools\tui-test-explorer\analyst\` (8 файлов, 2665 LOC — адаптация .NET→multi-framework)

## FR-2: Clickable File Paths @feature2

Logs tab должен детектировать пути к файлам в логах и рендерить их как кликабельные виджеты.

- Regex detection: Windows (`D:\path\file.ts:42`) и Unix (`/path/file.ts:42`)
- On-click: открытие в file explorer (`explorer /select,` Windows, `xdg-open` Linux, `open -R` macOS)
- Visual feedback: amber flash animation (0.3s)
- Truncation длинных путей: `"..." + path[-(len-3):]`
- Tooltip: полный путь
- Несколько путей в одной строке — все кликабельны

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-clickable-file-paths-feature2)
**Use Case:** [UC-2](USE_CASES.md#uc-2-кликабельные-пути-в-логах-feature2)
**Leverage:** `D:\repos\zoho\tools\tui-test-explorer\tui_test_explorer\ui\widgets\clickable_path.py` (224 LOC — прямой порт)

## FR-3: Test Discovery @feature3

TUI должен обнаруживать все тесты проекта до запуска и предоставлять UI для выборочного запуска.

- Framework-specific discovery commands:
  | Framework | Command | Parse logic |
  |-----------|---------|-------------|
  | vitest | `npx vitest --list` | JSON/text → test names |
  | jest | `npx jest --listTests` | File paths |
  | pytest | `python -m pytest --collect-only -q` | Module/Function tree |
  | dotnet | `dotnet test --list-tests -v=q` | Indented names after header |
  | rust | `cargo test -- --list` | `name: test` lines |
  | go | `go test -list '.*' ./...` | Function names |

- Tests tab: tree view с checkbox у каждого теста
- Запуск выбранных: framework filter (--grep, -k, --filter)
- Timeout discovery: 30s, после — warning + fallback на run all

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3-test-discovery-feature3)
**Use Case:** [UC-3](USE_CASES.md#uc-3-test-discovery-до-запуска-feature3)
**Leverage:** `D:\repos\zoho\tools\tui-test-explorer\tui_test_explorer\adapter\discovery.py` (77 LOC — расширить на 6 фреймворков)

## FR-4: State Persistence @feature4

TUI должен сохранять и восстанавливать пользовательское состояние между сессиями.

- Сохраняемое состояние: last active tab, filter text, expanded tree nodes, scroll positions
- Файл: `.dev-pomogator/.test-status/.tui-state.{session}.yaml`
- Debounced save: 0.5s (Timer-based, cancel previous on new change)
- Load on startup: читать state file, восстановить UI
- Fallback: если файл не существует или повреждён — defaults
- Session isolation: каждая сессия со своим state file (session prefix)
- Singleton pattern: thread-safe через threading.Lock

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4-state-persistence-feature4)
**Use Case:** [UC-4](USE_CASES.md#uc-4-сохранение-состояния-tui-между-сессиями-feature4)
**Leverage:** `D:\repos\zoho\tools\tui-test-explorer\tui_test_explorer\adapter\state_service.py` (181 LOC — прямой порт + session prefix)

## FR-5: Configurable Error Patterns @feature5

Система должна поддерживать настраиваемые паттерны ошибок через YAML конфигурацию.

- Built-in `patterns.yaml`: 30+ паттернов (timeout, connection, DB, auth, HTTP, assertion, browser, file I/O)
- User override: `.dev-pomogator/patterns.yaml` в проекте (мержится с built-in, user has priority)
- Pattern format:
  ```yaml
  patterns:
    - id: timeout
      match: "(timeout|timed out)"  # regex
      keywords: ["database", "sql"]  # AND logic
      hint: "Check service availability"
  ```
- PatternMatcher: regex first → keyword ALL → first wins
- Integration: Analysis tab использует PatternMatcher для категоризации

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5-configurable-error-patterns-feature5)
**Use Case:** [UC-5](USE_CASES.md#uc-5-настраиваемые-паттерны-ошибок-feature5)
**Leverage:** `D:\repos\zoho\tools\tui-test-explorer\analyst\patterns.yaml` + `patterns.py` (283 LOC — адаптация)

## FR-6: Auto-Run & Keybinding Launch @feature6

TUI должен запускаться по комбинации клавиш в Claude Code с опциональным автозапуском тестов.

- Keybinding: регистрация в `~/.claude/keybindings.json`
- `--run` flag: auto-start тестов при запуске TUI
- `--filter "pattern"` flag: фильтр тестов по имени
- Single instance: PID lock file, если TUI уже запущен — не запускать второй
- Framework watch integration: `vitest --watch` mode (для поддерживающих фреймворков)
- Launcher: launcher.ts spawns Python TUI detached

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6-auto-run--keybinding-launch-feature6)
**Use Case:** [UC-6](USE_CASES.md#uc-6-запуск-tui-по-комбинации-клавиш-с-auto-run-feature6)
**Leverage:** `D:\repos\zoho\tools\tui-test-explorer\__main__.py` (197 LOC — адаптация) + Claude Code keybindings API

## FR-7: Screenshot/SVG Export @feature7

TUI должен поддерживать экспорт текущего состояния в SVG файл.

- Trigger: keybinding внутри TUI (например `s`)
- Method: Textual `export_screenshot()` (built-in)
- Save: `logs/screenshots/tui-screenshot-{timestamp}.svg`
- Clipboard: автокопирование пути (Windows Set-Clipboard, macOS pbcopy, Linux xclip)
- Notification: "Screenshot saved & path copied!" в TUI
- Auto-create: директория `logs/screenshots/` создаётся при необходимости

**Связанные AC:** [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7-screenshotsvg-export-feature7)
**Use Case:** [UC-7](USE_CASES.md#uc-7-экспорт-скриншота-tui-в-svg-feature7)
**Leverage:** `D:\repos\zoho\tools\tui-test-explorer\tui_test_explorer\ui\app.py` (lines 464-487 — прямой порт)
