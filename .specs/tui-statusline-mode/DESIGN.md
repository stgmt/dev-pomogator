# Design

## Реализуемые требования

- [FR-1: CompactBar виджет](FR.md#fr-1-compactbar-виджет)
- [FR-2: Toggle compact/full mode](FR.md#fr-2-toggle-compactfull-mode)
- [FR-3: Stop tests](FR.md#fr-3-stop-tests)
- [FR-4: Auto-compact](FR.md#fr-4-auto-compact-при-малом-terminal-height)
- [FR-5: Выпилить statusline render](FR.md#fr-5-выпилить-statusline-render-из-test-statusline)
- [FR-6: Idle indicator](FR.md#fr-6-idle-indicator-в-compact-mode)

## Компоненты

- `CompactBar` — новый Textual Static виджет (3 строки: progress + current test + buttons)
- `app.py` — модификация TestRunnerApp: добавить CSS class toggle, keybindings M/X
- `app.css` — новые CSS правила для `.compact` class
- `stop_handler.py` — кросс-платформенная остановка тестов по PID

## Где лежит реализация

- App-код: `extensions/tui-test-runner/tools/tui-test-runner/tui/`
- Statusline removal: `extensions/test-statusline/`

## Архитектурное решение: CSS class toggle

Вместо Textual Screen Modes используем CSS class toggle на текущем экране:

```python
# В app.py (Textual не имеет toggle_class — используем add/remove)
def action_toggle_compact(self):
    if self.screen.has_class("compact"):
        self.screen.remove_class("compact")
    else:
        self.screen.add_class("compact")
```

```css
/* Compact mode: скрыть табы, показать compact bar */
.compact TabbedContent { display: none; }
.compact CompactBar { display: block; }

/* Full mode (default): табы видны, compact bar скрыт */
CompactBar { display: none; }
```

**Преимущество:** один Screen, один reactive `status`, нет синхронизации state между экранами.

## Новые файлы

```
extensions/tui-test-runner/tools/tui-test-runner/tui/
├── widgets/
│   └── compact_bar.py      # NEW: CompactBar виджет
├── stop_handler.py          # NEW: Stop tests по PID
├── app.py                   # EDIT: toggle + bindings + CSS
└── app.css                  # NEW: compact mode styles (или inline в app.py)
```

## Алгоритм CompactBar

### Progress Bar Rendering
- CompactBar использует **text-based ASCII progress bar** (не Textual ProgressBar widget)
- Format: `"█" * filled + "░" * empty` где `filled = width * percent // 100`
- Leverage: переиспользовать `TestStatus.duration_display` из `models.py` для duration formatting
- Leverage: импортировать иконки состояний из `widgets/monitoring_tab.py` (без Textual markup — plain emoji)

```python
class CompactBar(Static):
    def render(self) -> RenderableType:
        s = self.app.status  # reactive TestStatus
        if not s or s.state == 'idle':
            return Text("│ no test runs", style="dim")

        icon = STATE_ICONS[s.state]
        bar = progress_bar(s.percent, width=20)
        line1 = f"{icon} {s.framework} {s.passed}✅ {s.failed}❌ {s.skipped}⏭ {bar} {s.percent}% {format_duration(s.duration_ms)}"
        line2 = s.current_test or (s.last_error if s.failed > 0 else "")
        line3 = "[Stop: X]  [Full: M]  [Screenshot: S]"
        return f"{line1}\n{line2}\n{line3}"
```

## Алгоритм Stop Tests

```python
# stop_handler.py
import os, sys, signal, subprocess

def stop_tests(pid: int) -> bool:
    try:
        if sys.platform == 'win32':
            subprocess.run(['taskkill', '/PID', str(pid), '/T', '/F'], check=True)
        else:
            os.kill(pid, signal.SIGTERM)
        return True
    except (ProcessLookupError, subprocess.CalledProcessError):
        return False
```

## Алгоритм Auto-Compact

```python
# В app.py
def on_resize(self, event):
    if event.size.height < 15 and not self.screen.has_class("compact"):
        self.screen.add_class("compact")
```

## Выпиливание statusline render

Удалить из `extensions/test-statusline/`:
1. `tools/test-statusline/statusline_render.cjs`
2. `tools/test-statusline/statusline_render.sh`
3. `tools/test-statusline/statusline_wrapper.js`
4. `statusLine` секция из `extension.json`
5. Соответствующие entries из `toolFiles`

Оставить:
- `statusline_session_start.ts` — SessionStart hook (создаёт session.env)
- `test_runner_wrapper.sh` / `.cjs` — wrapper запуска тестов
- `status_types.ts` — shared TypeScript types

## BDD Test Infrastructure

**Classification:** TEST_DATA_ACTIVE
**Evidence:** Тесты создают temporary YAML status файлы (Given-шаги), пишут PID, проверяют CompactBar render output. Нужен cleanup temporary files.
**Verdict:** Нужны AfterScenario hooks для cleanup temp YAML files + kill zombie processes.

### Существующие hooks

| Hook файл | Тип | Тег/Scope | Что делает | Можно переиспользовать? |
|-----------|-----|-----------|------------|------------------------|
| `tests/e2e/test-statusline.test.ts` helpers | BeforeEach/AfterEach | per-test | Создаёт/чистит temp dirs + YAML files | Да — расширить для compact mode тестов |

### Новые hooks

| Hook файл | Тип | Тег/Scope | Что делает | По аналогии с |
|-----------|-----|-----------|------------|---------------|
| Расширение existing helpers | AfterEach | per-test | Cleanup compact mode test artifacts | test-statusline.test.ts helpers |

### Cleanup Strategy

1. AfterEach: удалить temporary YAML status files из temp dir
2. AfterEach: kill zombie test processes если PID остался

### Test Data & Fixtures

| Fixture/Data | Путь | Назначение | Lifecycle |
|-------------|------|------------|-----------|
| YAML status fixture (running) | inline in test | Input для CompactBar render | per-test |
| YAML status fixture (idle) | inline in test | Idle indicator test | per-test |
| YAML status fixture (with PID) | inline in test | Stop tests test | per-test |
