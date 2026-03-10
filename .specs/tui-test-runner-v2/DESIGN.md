# Design

## Реализуемые требования

- [FR-1: AI Test Analyst](FR.md#fr-1-ai-test-analyst-feature1)
- [FR-2: Clickable File Paths](FR.md#fr-2-clickable-file-paths-feature2)
- [FR-3: Test Discovery](FR.md#fr-3-test-discovery-feature3)
- [FR-4: State Persistence](FR.md#fr-4-state-persistence-feature4)
- [FR-5: Configurable Error Patterns](FR.md#fr-5-configurable-error-patterns-feature5)
- [FR-6: Auto-Run & Keybinding Launch](FR.md#fr-6-auto-run--keybinding-launch-feature6)
- [FR-7: Screenshot/SVG Export](FR.md#fr-7-screenshotsvg-export-feature7)

## Компоненты

- `tui/analyst/` — AI Analyst модуль (patterns, parsers, code_reader, output, pattern_generator)
- `tui/widgets/clickable_path.py` — Clickable file path Textual widget
- `tui/discovery.py` — Framework-specific test discovery (6 фреймворков)
- `tui/state_service.py` — Singleton state persistence с debounced YAML save
- `tui/widgets/analysis_tab.py` — Переработанный Analysis tab с v3 failure cards
- `tui/widgets/logs_tab.py` — Logs tab с ClickablePath integration
- `tui/widgets/tests_tab.py` — Tests tab с checkbox discovery selection
- `tui/app.py` — Main app с auto-run, screenshot, state restore
- `launcher.ts` — Node.js launcher с --run/--filter passthrough

## Где лежит реализация

- Python TUI: `extensions/tui-test-runner/tools/tui-test-runner/tui/`
- Node.js: `extensions/tui-test-runner/tools/tui-test-runner/`
- Zoho reference: `D:\repos\zoho\tools\tui-test-explorer\`

## Архитектура

```
┌──────────────────────────────────────────────────────────┐
│  Claude Code Keybinding (FR-6)                          │
│  ~/.claude/keybindings.json → launcher.ts               │
└─────────────────────┬────────────────────────────────────┘
                      │ spawn detached
┌─────────────────────▼────────────────────────────────────┐
│  Python TUI App (Textual)                                │
│                                                          │
│  ┌──────────┐ ┌──────────┐ ┌────────────┐ ┌──────────┐ │
│  │ Tests    │ │ Logs     │ │ Monitoring │ │ Analysis │ │
│  │ Tab      │ │ Tab      │ │ Tab        │ │ Tab      │ │
│  │          │ │          │ │            │ │          │ │
│  │ Discovery│ │ Clickable│ │            │ │ AI       │ │
│  │ Tree +   │ │ Paths    │ │            │ │ Analyst  │ │
│  │ Checkbox │ │ (FR-2)   │ │            │ │ v3 Cards │ │
│  │ (FR-3)   │ │          │ │            │ │ (FR-1)   │ │
│  └──────────┘ └──────────┘ └────────────┘ └──────────┘ │
│                                                          │
│  ┌──────────────────┐  ┌──────────────────────────────┐ │
│  │ State Service    │  │ Pattern System (FR-5)        │ │
│  │ (FR-4)           │  │ patterns.yaml (built-in)     │ │
│  │ Debounce 0.5s    │  │ .dev-pomogator/patterns.yaml │ │
│  │ Session prefix   │  │ PatternMatcher               │ │
│  └──────────────────┘  └──────────────────────────────┘ │
│                                                          │
│  ┌──────────────────────────────────────────────────────┐│
│  │ Screenshot Export (FR-7)                             ││
│  │ Textual export_screenshot() → SVG → clipboard       ││
│  └──────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────┘
```

## Алгоритм: AI Analysis Flow

1. Тесты завершаются → YAML v2 содержит failures с error_type, error_message, stack_trace
2. Analysis tab получает failures из YAML reader
3. PatternMatcher загружает built-in + user patterns (merge, user priority)
4. Для каждого failure:
   a. PatternMatcher.match_failure(error_type, error_message) → Pattern | null
   b. Если stack_trace содержит file:line → CodeReader.get_snippet(file, line, context=3)
   c. Parsers извлекают location (crash_point, call_tree) из stack trace
   d. Формируется FailureV3 card
5. Failure cards сортируются: matched с hint наверху, "Unknown" внизу
6. TUI рендерит cards в Analysis tab с expandable details

## Алгоритм: Test Discovery Flow

1. Config.ts определяет framework (auto-detect или env var)
2. Discovery вызывает framework-specific command:
   - vitest: `npx vitest --list` → parse JSON
   - jest: `npx jest --listTests` → parse file paths
   - pytest: `python -m pytest --collect-only -q` → parse tree
   - dotnet: `dotnet test --list-tests -v=q` → parse indented
   - rust: `cargo test -- --list` → parse lines
   - go: `go test -list '.*' ./...` → parse names
3. Parse output → list of (suite, test_name)
4. Tests tab отображает tree с checkboxes
5. User выбирает тесты → filtered run через framework filter

## Алгоритм: State Persistence Flow

1. UI action (tab switch, filter, expand) → StateService.update(key, value)
2. _schedule_save() → cancel previous Timer, start new Timer(0.5s)
3. Timer fires → _save_state() → YAML dump to .tui-state.{session}.yaml (atomic: temp+rename)
4. On startup → _load_state() → restore UI (tab, filter, expanded nodes)

## BDD Test Infrastructure

**Classification:** TEST_DATA_ACTIVE
**Evidence:** Вопрос 1: ДА — state persistence создаёт/изменяет .tui-state.yaml файлы. Вопрос 3: ДА — BDD сценарии требуют предустановленных YAML status files и patterns.yaml.
**Verdict:** Нужны hooks для cleanup temp files (YAML status, state files, screenshots, lock files).

### Существующие hooks

| Hook файл | Тип | Тег/Scope | Что делает | Можно переиспользовать? |
|-----------|-----|-----------|------------|------------------------|
| Не найдены в проекте — текущие BDD тесты в Docker, cleanup через container lifecycle | - | - | - | Нет |

### Новые hooks

| Hook файл | Тип | Тег/Scope | Что делает | По аналогии с |
|-----------|-----|-----------|------------|---------------|
| `tests/e2e/helpers/tui-v2-cleanup.ts` | AfterEach | per-scenario | Удалить temp YAML status files, .tui-state.*.yaml, lock files, screenshots из temp dir | N/A (первый cleanup hook) |

### Cleanup Strategy

1. AfterEach: удалить все файлы в temp test directory:
   - `.dev-pomogator/.test-status/status.*.yaml`
   - `.dev-pomogator/.test-status/.tui-state.*.yaml`
   - `logs/screenshots/tui-screenshot-*.svg`
   - `~/.tui-test-runner.lock`
2. Каскадных зависимостей нет — все файлы независимы
3. Docker container cleanup обеспечивает полную изоляцию

### Test Data & Fixtures

| Fixture/Data | Путь | Назначение | Lifecycle |
|-------------|------|------------|-----------|
| YAML v2 status file | temp dir | Предустановленные test results для Analysis | per-scenario |
| patterns.yaml | temp dir | Test patterns для PatternMatcher | per-scenario |
| User patterns override | temp dir/.dev-pomogator/ | Custom patterns для merge test | per-scenario |
| .tui-state.yaml | temp dir | Pre-populated state для restore test | per-scenario |
| Lock file | temp dir | PID lock для singleton test | per-scenario |

### Shared Context / State Management

| Ключ | Тип | Записывается в | Читается в | Назначение |
|------|-----|----------------|------------|------------|
| `tempDir` | `string` | BeforeEach setup | All steps | Temp directory path |
| `statusFilePath` | `string` | Given step | When/Then steps | Path to YAML status file |
| `stateFilePath` | `string` | Given step | When/Then steps | Path to state file |
