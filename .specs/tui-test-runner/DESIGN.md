# Design

## Реализуемые требования

- [FR-1: 4-Tab TUI Interface](FR.md#fr-1-4-tab-tui-interface-feature1)
- [FR-2: Test Tree View](FR.md#fr-2-test-tree-view-feature2)
- [FR-3: Real-Time Log Viewer](FR.md#fr-3-real-time-log-viewer-feature3)
- [FR-4: Monitoring Dashboard](FR.md#fr-4-monitoring-dashboard-feature4)
- [FR-5: Failure Analysis](FR.md#fr-5-failure-analysis-feature5)
- [FR-6: YAML v2 Protocol](FR.md#fr-6-yaml-v2-protocol-feature6)
- [FR-7: Universal Framework Adapters](FR.md#fr-7-universal-framework-adapters-feature6)
- [FR-8: YAML Polling](FR.md#fr-8-yaml-polling-feature1)
- [FR-9: TUI Launcher](FR.md#fr-9-tui-launcher-feature6)
- [FR-10: SessionStart Hook](FR.md#fr-10-sessionstart-hook-feature7)

## Архитектура: Гибридный подход

```
┌─────────────────────────────────────────────────────────────────┐
│                    FILESYSTEM (YAML + LOG)                       │
│                                                                 │
│  Node.js Side                    Python TUI Side                │
│  ────────────                    ──────────────                 │
│                                                                 │
│  test_runner_wrapper.sh          yaml_reader.py (polling 500ms) │
│  + enhanced_wrapper.ts    ──►    models.py                      │
│       │                          log_reader.py (tail)           │
│       ├── writes status.yaml          │                         │
│       ├── tees test.log               ▼                         │
│       │                          app.py (Textual, 4 tabs)       │
│  launcher.ts ──► spawns ──►      __main__.py                    │
│  config.ts (framework detect)         │                         │
│  tui_session_start.ts (hook)          ▼                         │
│                                  widgets/                       │
│  adapters/                       ├── tests_tab.py               │
│  ├── vitest_adapter.ts           ├── logs_tab.py                │
│  ├── jest_adapter.ts             ├── monitoring_tab.py           │
│  ├── pytest_adapter.ts           └── analysis_tab.py             │
│  └── dotnet_adapter.ts                                          │
└─────────────────────────────────────────────────────────────────┘
```

## Компоненты

### Node.js Adapter Layer

- `launcher.ts` — Python process manager: detect python, check textual, spawn TUI, manage PID
- `config.ts` — Framework detection (vitest.config.ts, jest.config.js, pytest.ini, *.csproj) и конфигурация
- `tui_session_start.ts` — SessionStart hook: init status dir, write env vars, fail-open
- `yaml_writer.ts` — Enhanced YAML v2 writer: converts TestEvent stream to v2 YAML
- `adapters/types.ts` — TestEvent universal interface
- `adapters/adapter_base.ts` — Abstract base: line → TestEvent
- `adapters/vitest_adapter.ts` — Vitest stdout parser (regex-based)
- `adapters/jest_adapter.ts` — Jest stdout parser
- `adapters/pytest_adapter.ts` — pytest stdout parser
- `adapters/dotnet_adapter.ts` — dotnet test stdout parser

### Python TUI Layer (портировано из zoho, framework-agnostic)

- `tui/__main__.py` — Entry point, singleton instance (lock file), CLI args
- `tui/app.py` — Textual App: 4 TabbedContent tabs, reactive status property, polling loop
- `tui/models.py` — Python dataclasses mirroring YAML v2 schema
- `tui/yaml_reader.py` — YAML file polling (500ms), emits Textual messages on change
- `tui/log_reader.py` — Log file tailer (streaming, not full load)
- `tui/widgets/tests_tab.py` — Textual Tree widget: suite → test hierarchy, status icons, sort/filter
- `tui/widgets/logs_tab.py` — Textual TextArea: real-time log with 20+ regex highlight patterns
- `tui/widgets/monitoring_tab.py` — Dashboard: phase, percent, duration, counters, current test
- `tui/widgets/analysis_tab.py` — Failure grouping by error patterns, recommendations

## Где лежит реализация

- Extension: `extensions/tui-test-runner/`
- Tools: `extensions/tui-test-runner/tools/tui-test-runner/`
- Python TUI: `extensions/tui-test-runner/tools/tui-test-runner/tui/`
- Installed (target): `.dev-pomogator/tools/tui-test-runner/`

## Директории и файлы

```
extensions/tui-test-runner/
├── extension.json
└── tools/tui-test-runner/
    ├── launcher.ts
    ├── config.ts
    ├── tui_session_start.ts
    ├── yaml_writer.ts
    ├── adapters/
    │   ├── types.ts
    │   ├── adapter_base.ts
    │   ├── vitest_adapter.ts
    │   ├── jest_adapter.ts
    │   ├── pytest_adapter.ts
    │   └── dotnet_adapter.ts
    └── tui/
        ├── pyproject.toml
        ├── __main__.py
        ├── app.py
        ├── models.py
        ├── yaml_reader.py
        ├── log_reader.py
        └── widgets/
            ├── tests_tab.py
            ├── logs_tab.py
            ├── monitoring_tab.py
            └── analysis_tab.py
```

## Алгоритм (Data Flow)

1. Тесты запускаются через `test_runner_wrapper.sh` (или enhanced wrapper)
2. Wrapper пишет YAML v1/v2 в `.dev-pomogator/.test-status/status.{session}.yaml` (atomic: temp+rename)
3. Wrapper tees stdout в `.dev-pomogator/.test-status/test.{session}.log`
4. Python TUI (запущен отдельно) polling YAML каждые 500ms
5. При обнаружении изменений — yaml_reader.py парсит в models, emits Textual message
6. app.py обновляет reactive property → UI re-render
7. log_reader.py tails log file → logs_tab.py обновляется
8. При завершении тестов — TUI показывает итоговый статус

## YAML v2 Protocol Schema

```yaml
version: 2
session_id: "abc12345"
started_at: "2026-03-09T19:30:00Z"
updated_at: "2026-03-09T19:31:15Z"
state: "running"          # idle | running | passed | failed | error
framework: "vitest"       # vitest | jest | pytest | dotnet | unknown

# v1 compat fields
total: 50
passed: 38
failed: 2
skipped: 0
running: 10
percent: 76
duration_ms: 45000
error_message: ""

# v2 extensions
suites:
  - name: "auth.test.ts"
    file: "tests/auth.test.ts"
    status: "running"
    passed: 3
    failed: 1
    skipped: 0
    total: 10
    duration_ms: 12000
    tests:
      - name: "should authenticate valid user"
        status: "passed"
        duration_ms: 120
      - name: "should reject expired token"
        status: "failed"
        duration_ms: 45
        error: "AssertionError: Expected 401, received 200"
        stack: "at Object.<anonymous> (tests/auth.test.ts:42:5)"

phases:
  - name: "setup"
    status: "completed"
    started_at: "2026-03-09T19:30:00Z"
    duration_ms: 1200
  - name: "tests"
    status: "running"
    started_at: "2026-03-09T19:30:01Z"
    duration_ms: 43800

log_file: ".dev-pomogator/.test-status/test.abc12345.log"
```

## TestEvent Interface (Node.js adapters)

```typescript
interface TestEvent {
  type: 'suite_start' | 'suite_end' | 'test_pass' | 'test_fail' | 'test_skip' | 'test_start' | 'summary' | 'error' | 'log';
  suiteName?: string;
  testName?: string;
  duration?: number;
  errorMessage?: string;
  stackTrace?: string;
  timestamp: string;
}
```

## Reuse Plan (Leverage)

| Source | Target | What is reused |
|--------|--------|---------------|
| `extensions/test-statusline/tools/test-statusline/status_types.ts` | `adapters/types.ts` | TestStatus v1 interface, extended to v2 |
| `extensions/test-statusline/tools/test-statusline/test_runner_wrapper.sh` | Unchanged, reused as-is | YAML v1 writer |
| `extensions/test-statusline/tools/test-statusline/statusline_session_start.ts` | `tui_session_start.ts` | Hook pattern (stdin JSON, stdout JSON, fail-open) |
| `D:\repos\zoho\tools\tui-test-explorer\tui_test_explorer\ui\app.py` | `tui/app.py` | 4-tab Textual App structure |
| `D:\repos\zoho\tools\tui-test-explorer\tui_test_explorer\ui\widgets\logs_tab.py` | `tui/widgets/logs_tab.py` | 20+ regex highlight patterns |
| `D:\repos\zoho\tools\tui-test-explorer\tui_test_explorer\ui\widgets\monitoring_tab.py` | `tui/widgets/monitoring_tab.py` | Dashboard layout |
| `D:\repos\zoho\tools\tui-test-explorer\tui_test_explorer\ui\widgets\tests_tab.py` | `tui/widgets/tests_tab.py` | Tree structure (rewritten for YAML v2 input) |
| `D:\repos\zoho\tools\tui-test-explorer\analyst\` | `tui/widgets/analysis_tab.py` | Error pattern matching (generalized) |

## BDD Test Infrastructure

**Classification:** TEST_DATA_ACTIVE
**Evidence:** Фича создаёт YAML status files и log files в filesystem (вопрос 1 = ДА). BDD сценарии требуют предустановленных YAML fixtures (вопрос 3 = ДА). Вопросы 2, 4 = НЕТ (нет внешних сервисов, состояние — только файлы).
**Verdict:** Нужны hooks для cleanup temp YAML/log файлов и fixtures для тестовых YAML v1/v2.

### Существующие hooks

| Hook файл | Тип | Тег/Scope | Что делает | Можно переиспользовать? |
|-----------|-----|-----------|------------|------------------------|
| `tests/e2e/helpers.ts` | Test infrastructure | Global | 1647 строк test utilities (createTempDir, runInDocker, etc.) | Да — createTempDir для status dir |

### Новые hooks

| Hook файл | Тип | Тег/Scope | Что делает | По аналогии с |
|-----------|-----|-----------|------------|---------------|
| `tests/fixtures/tui-test-runner/yaml-v1-running.yaml` | Fixture | per-test | YAML v1 sample (state=running) | N/A |
| `tests/fixtures/tui-test-runner/yaml-v2-full.yaml` | Fixture | per-test | YAML v2 sample (suites+tests+phases) | N/A |
| `tests/fixtures/tui-test-runner/yaml-v2-failed.yaml` | Fixture | per-test | YAML v2 sample (state=failed, errors) | N/A |
| `tests/fixtures/tui-test-runner/vitest-output.txt` | Fixture | per-test | Sample vitest stdout для adapter testing | N/A |

### Cleanup Strategy

Тесты создают temp directories через `helpers.ts:createTempDir()`. Cleanup автоматический через vitest afterEach/afterAll. YAML и log файлы создаются внутри temp dir — удаляются вместе с ней.

### Test Data & Fixtures

| Fixture/Data | Путь | Назначение | Lifecycle |
|-------------|------|------------|-----------|
| yaml-v1-running.yaml | `tests/fixtures/tui-test-runner/` | YAML v1 status sample | per-test (read-only) |
| yaml-v2-full.yaml | `tests/fixtures/tui-test-runner/` | YAML v2 full sample | per-test (read-only) |
| yaml-v2-failed.yaml | `tests/fixtures/tui-test-runner/` | YAML v2 failed sample | per-test (read-only) |
| vitest-output.txt | `tests/fixtures/tui-test-runner/` | Vitest stdout sample | per-test (read-only) |

### Shared Context / State Management

| Ключ | Тип | Записывается в | Читается в | Назначение |
|------|-----|----------------|------------|------------|
| tempStatusDir | string | beforeEach (createTempDir) | test assertions | Temporary .test-status directory |
