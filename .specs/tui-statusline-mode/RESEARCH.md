# Research: TUI Statusline Mode

## Контекст

Текущая архитектура тестового мониторинга состоит из двух отдельных компонентов:
1. **test-statusline** — однострочный рендер в Claude Code statusline (Node.js CJS)
2. **tui-test-runner** — полноценный 4-табный TUI на Python Textual

Задача: добавить в TUI test runner "компактный режим" (statusline mode), который заменит test-statusline extension, и реализовать переключение full/compact с кнопками управления и авто-ресайзом терминального окна/пейна.

## Источники

- Textual Docs: Screens, Modes, CSS, Widgets (`pip install textual`, v0.40+)
- Windows Terminal: не поддерживает программный ресайз пейнов (только визуальный compact)
- GitHub: примеры Textual apps с compact mode
- Существующий код: `extensions/tui-test-runner/`, `extensions/test-statusline/`

## Технические находки

### 1. Textual Screen Modes — лучший API для full/compact

Textual поддерживает **MODES** — dict `App.MODES` + метод `switch_mode()`:

```python
class TestRunnerApp(App):
    MODES = {
        "full": "FullScreen",
        "compact": "CompactScreen",
    }
```

Каждый mode имеет свой **независимый screen stack** — push/pop в одном mode не влияет на другой. Это идеальный паттерн для переключения full ↔ compact.

**Альтернатива — CSS class toggle:**

```python
self.screen.toggle_class("compact")
```

С CSS правилами:
```css
.compact TabbedContent { display: none; }
.compact #compact-bar { display: block; }
```

Преимущество CSS toggle: **один экран**, нет дублирования state. Textual `display: none` полностью убирает виджет из layout.

**Рекомендация:** CSS class toggle предпочтительнее, т.к. не требует синхронизации состояния между двумя Screen-ами — reactive `status` один на весь App.

### 2. Widget Visibility в Textual

Два механизма:
- `widget.display = False` / CSS `display: none` — убирает из layout, не занимает место
- `widget.visible = False` / CSS `visibility: hidden` — невидим, но место занимает

Для compact mode нужен `display: none` — чтобы TabbedContent не занимал место, а CompactBar заполнял весь экран.

### 3. Terminal Pane Resize — ограничения Windows Terminal

Windows Terminal **НЕ поддерживает программный ресайз пейнов после создания.**
- `wt.exe split-pane -s N` работает только при создании
- Ресайз после создания — только клавиатурой `Alt+Shift+Arrow`

**Стратегия:** Compact mode работает визуально (app рендерит 3-5 строк), пейн не ресайзится. Пользователь видит компактный виджет + пустое пространство ниже.

### 4. Рекомендуемый подход

CSS class toggle в Textual — compact mode скрывает все табы, показывает CompactBar (3-5 строк). Работает в Windows Terminal и любом другом терминале. Физический ресайз пейна не делаем.

### 5. Auto-compact при ресайзе

**Выбранный подход:** `on_resize()` event handler в app.py (не VERTICAL_BREAKPOINTS — их поведение с CSS class toggle не подтверждено).

```python
def on_resize(self, event):
    if event.size.height < 15 and not self.screen.has_class("compact"):
        self.screen.add_class("compact")
```

> Примечание: Textual `VERTICAL_BREAKPOINTS` существуют, но их взаимодействие с CSS class toggle не документировано. Используем `on_resize()` как надёжный вариант.

### 6. Кнопки управления в Textual

#### Кнопка в Header/Titlebar

Textual `Header` виджет поддерживает кастомизацию через субклассинг:

```python
class CustomHeader(Header):
    def compose(self):
        yield HeaderTitle()
        yield Button("📷", id="screenshot-btn")
        yield Button("▼", id="minimize-btn")
```

Альтернатива: использовать `Action` buttons в Footer с keybinding.

#### Кнопка Stop Tests

Можно добавить кнопку/keybinding для отправки SIGTERM процессу теста по PID из YAML статус-файла:

```python
import os, signal
pid = self.status.pid
os.kill(pid, signal.SIGTERM)  # Unix
# Windows: taskkill /PID {pid} /T /F
```

### 7. CompactBar — дизайн компактного виджета

Компактный режим должен показывать в 1-3 строках:
- **Строка 1:** Статус + прогресс: `🔄 vitest 38✅ 2❌ 0⏭ [▓▓▓▓▓▓░░░░] 75% 1:23`
- **Строка 2:** Текущий запущенный тест или последняя ошибка
- **Строка 3:** Кнопки: `[■ Stop]  [▲ Full]  [📷 Screenshot]`

Паттерн из Textual — `Static` с reactive + `render()`:

```python
class CompactBar(Static):
    status = reactive(TestStatus)

    def render(self) -> RenderableType:
        s = self.status
        bar = progress_bar(s.percent, width=20)
        return f"{state_icon(s.state)} {s.framework} {s.passed}✅ {s.failed}❌ {bar} {s.percent}% {format_duration(s.duration_ms)}"
```

### 8. Текущая архитектура TUI Test Runner

#### Файловая структура

```
extensions/tui-test-runner/tools/tui-test-runner/tui/
├── __main__.py          # CLI entry (argparse)
├── app.py               # TestRunnerApp (Textual App)
├── models.py            # TestStatus, TestState enums
├── yaml_reader.py       # YAML poller (mtime-based, 500ms)
├── log_reader.py        # Log file tailer
├── state_service.py     # Singleton state (active tab, filter)
├── discovery.py         # Framework test discovery
├── widgets/
│   ├── tests_tab.py     # Tree + filter
│   ├── monitoring_tab.py# Progress + phases
│   ├── logs_tab.py      # RichLog + syntax highlight
│   ├── analysis_tab.py  # Failure cards
│   └── clickable_path.py# Cross-platform path opener
├── analyst/             # Failure pattern matching
└── pyproject.toml
```

#### Ключевые точки интеграции

- `app.py:TestRunnerApp` — main class, bindings, title update, status reactive
- `app.py:_update_title()` — обновляет заголовок с иконками и счётчиками
- `app.py:BINDINGS` — Q(quit), 1-4(tabs), F(filter), S(screenshot)
- `yaml_reader.py:YamlReader` — polling loop, mtime check, parse
- CSS inline в `app.py` — minimal, `height: 1fr` для табов

#### Текущие keybindings

| Key | Action |
|-----|--------|
| Q | Quit |
| 1-4 | Switch tabs |
| F | Focus filter |
| S | Screenshot |

Нужно добавить: M (minimize/maximize toggle), X (stop tests).

### 9. Текущая архитектура test-statusline

#### Что делает

Рендерит однострочный статус тестов в Claude Code statusline:
- Вызывается Claude Code каждые ~2-3 сек
- Читает тот же YAML status file что и TUI
- Форматирует в ANSI-colored строку

#### Компоненты для выпиливания

| Файл | Роль | Замена |
|------|------|--------|
| `statusline_render.cjs` | Рендер в Claude statusline | CompactBar в TUI |
| `statusline_render.sh` | Bash fallback | CompactBar в TUI |
| `statusline_wrapper.js` | Мультиплексер statuslines | Не нужен |
| `statusline_session_start.ts` | SessionStart hook | Оставить (нужен для session management) |
| `test_runner_wrapper.sh/cjs` | Обёртка запуска тестов | Оставить (нужен для wrapper) |
| `status_types.ts` | TypeScript types | Оставить (shared) |

**Важно:** `statusline_session_start.ts` и `test_runner_wrapper.*` используются обоими — TUI и statusline. Их **нельзя удалять**. Выпиливается только рендер-часть (statusline_render.cjs/sh и wrapper.js) и конфиг `statusLine` из extension.json.

### 10. Windows Terminal Split-Pane конфигурация

Из `scripts/launch-claude-tui.ps1`:
- Windows Terminal: 70% Claude / 30% TUI (горизонтальный split)
- Передаёт `TEST_STATUSLINE_SESSION` env

### 11. Обнаруженные ограничения

1. **Claude Code statusLine — максимум 1 команда.** Если выпилить test-statusline, слот освобождается для пользователя.
2. **Windows Terminal не ресайзит пейны программно** — compact mode будет чисто визуальный.
3. **Textual minimum terminal size** — при очень маленьком терминале (< 10 строк) Textual может крэшиться. Нужен guard.
4. **Stop tests** требует PID из YAML + кросс-платформенный kill (SIGTERM/taskkill).

## Где лежит реализация

- **TUI App:** `extensions/tui-test-runner/tools/tui-test-runner/tui/app.py`
- **TUI Widgets:** `extensions/tui-test-runner/tools/tui-test-runner/tui/widgets/`
- **TUI Models:** `extensions/tui-test-runner/tools/tui-test-runner/tui/models.py`
- **TUI Entry:** `extensions/tui-test-runner/tools/tui-test-runner/tui/__main__.py`
- **Statusline Render:** `extensions/test-statusline/tools/test-statusline/statusline_render.cjs`
- **Statusline Manifest:** `extensions/test-statusline/extension.json`
- **TUI Manifest:** `extensions/tui-test-runner/extension.json`
- **WT Launcher:** `scripts/launch-claude-tui.ps1`
- **YAML Protocol:** `plugin-dev/skills/create-test-statusline/references/yaml-protocol.md`
- **Session Hook:** `extensions/test-statusline/tools/test-statusline/statusline_session_start.ts`

## Выводы

### Рекомендуемый подход

1. **CSS class toggle** (не Screens/Modes) — один экран, toggle `.compact` class скрывает табы, показывает CompactBar
2. **CompactBar** — новый виджет (3-5 строк): прогресс + текущий тест/ошибка + кнопки [Stop] [Full] [Screenshot]
3. **Keybinding `M`** — toggle compact/full
4. **Кнопка в Header** (рядом со Screenshot) — визуальный toggle для compact mode
5. **Compact mode визуальный** — пейн не ресайзится (ограничение Windows Terminal), но app рендерит 3-5 строк
6. **Stop tests** — кнопка/keybinding `X`, шлёт SIGTERM/taskkill по PID из YAML
7. **Выпилить statusline_render** — убрать `statusLine` из extension.json test-statusline, удалить render скрипты
8. **Responsive breakpoints** — авто-compact при terminal height < 10 строк

### Риски

| Риск | Митигация |
|------|-----------|
| Windows Terminal не поддерживает pane resize | Compact mode чисто визуальный — known limitation |
| Textual crash при очень маленьком терминале | Guard: min 5 строк для compact, min 15 для full |
| PID kill кросс-платформенность | `os.kill()` на Unix, `subprocess taskkill` на Windows |
| Потеря statusline в Claude Code | Освобождаем слот — пользователь может использовать свой statusline |

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| extension-manifest-integrity | `.claude/rules/extension-manifest-integrity.md` | extension.json source of truth, обновлять files/rules/tools/toolFiles/hooks | Изменения в расширениях | FR (manifest update) |
| updater-sync-tools-hooks | `.claude/rules/updater-sync-tools-hooks.md` | Апдейтер синхронизирует tools+hooks, не только commands | Обновление extensions | FR (tool sync) |
| updater-managed-cleanup | `.claude/rules/updater-managed-cleanup.md` | Удалять только managed files, бэкап user modifications | Удаление statusline render | FR (safe removal) |
| centralized-test-runner | `.claude/rules/centralized-test-runner.md` | Тесты только через /run-tests, wrapper пишет YAML | Запуск тестов | NFR (test integration) |
| docker-only-tests | `.claude/rules/docker-only-tests.md` | Тесты в Docker через npm test | E2E тесты | NFR (testing) |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| TUI Test Runner | `extensions/tui-test-runner/` | 4-tab Textual TUI, YAML polling, widgets | Основной код для модификации |
| Test Statusline | `extensions/test-statusline/` | Claude Code statusline render, session hooks | Частично выпиливается (render), session hooks остаются |
| YAML Protocol | `plugin-dev/skills/create-test-statusline/references/yaml-protocol.md` | Canonical v2 YAML schema | Shared data format |
| WT Launcher | `scripts/launch-claude-tui.ps1` | Windows Terminal split launcher (70/30) | Может потребовать обновления размеров |
| Statusline Wrapper | `extensions/test-statusline/tools/test-statusline/statusline_wrapper.js` | Мультиплексер statuslines | Удаляется вместе с render |

### Architectural Constraints Summary

1. **extension.json — source of truth**: все изменения файлов расширений должны отражаться в `toolFiles`, `hooks`, `statusLine` секциях манифеста
2. **YAML v2 protocol**: CompactBar читает тот же `status.{prefix}.yaml` что и текущий statusline_render — протокол не меняется
3. **Session management**: `statusline_session_start.ts` остаётся — он создаёт `session.env` и чистит stale files, это нужно и TUI, и wrapper-у
4. **Updater**: при удалении statusline render файлов — апдейтер должен корректно удалить managed files из целевых проектов
5. **test_runner_wrapper**: остаётся в test-statusline extension, т.к. launcher.ts из tui-test-runner его не заменяет для всех кейсов
