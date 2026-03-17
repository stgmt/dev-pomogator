# Functional Requirements (FR)

## FR-1: CompactBar виджет @feature1

TUI test runner SHALL содержать виджет `CompactBar`, отображающий в 3 строках:
- Строка 1: иконка статуса + framework + passed✅ + failed❌ + skipped⏭ + progress bar + % + duration
- Строка 2: имя текущего теста или последней ошибки
- Строка 3: кнопки [Stop] [Full] [Screenshot]

CompactBar SHALL читать данные из того же YAML status файла (`status.{prefix}.yaml`) что и полный TUI.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-compactbar-рендеринг)
**Use Case:** [UC-1](USE_CASES.md#uc-1-compact-mode-показывает-прогресс-тестов)

## FR-2: Toggle compact/full mode @feature2

TUI SHALL поддерживать переключение между compact и full режимами:
- Keybinding `M` — toggle
- CSS class toggle `.compact` на screen — скрывает `TabbedContent`, показывает `CompactBar`
- При toggle состояние (текущий таб, фильтр, reactive status) SHALL сохраняться

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-toggle-compactfull)
**Use Case:** [UC-2](USE_CASES.md#uc-2-переключение-compact--full)

## FR-3: Stop tests @feature3

TUI SHALL поддерживать остановку тестов:
- Keybinding `X` и кнопка [Stop] в CompactBar
- Читает PID из YAML status файла (`pid` field)
- Отправляет `os.kill(pid, SIGTERM)` на Unix, `subprocess.run(['taskkill', '/PID', str(pid), '/T', '/F'])` на Windows
- Кнопка SHALL быть неактивна если PID отсутствует или процесс не запущен

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3-stop-tests)
**Use Case:** [UC-3](USE_CASES.md#uc-3-stop-tests-из-tui)

## FR-4: Auto-compact при малом terminal height @feature4

TUI SHALL автоматически переключаться в compact mode если terminal height < 15 строк. Реализация через Textual CSS responsive breakpoints (`VERTICAL_BREAKPOINTS`) или `on_resize()` event.

При увеличении терминала обратно TUI SHALL оставаться в compact (возврат в full — только ручной через `M`).

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4-auto-compact)
**Use Case:** [UC-4](USE_CASES.md#uc-4-auto-compact-при-маленьком-терминале)

## FR-5: Выпилить statusline render из test-statusline @feature5

Из extension `test-statusline` SHALL быть удалены:
- `statusline_render.cjs` — Node.js render скрипт
- `statusline_render.sh` — Bash fallback
- `statusline_wrapper.js` — мультиплексер statuslines
- `statusLine` секция из `extension.json`

SHALL быть сохранены (shared с TUI):
- `statusline_session_start.ts` — SessionStart hook
- `test_runner_wrapper.sh` / `test_runner_wrapper.cjs` — wrapper запуска тестов
- `status_types.ts` — TypeScript types

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5-выпиливание-statusline)
**Use Case:** [UC-5](USE_CASES.md#uc-5-выпиливание-statusline-render)

## FR-6: Idle indicator в compact mode @feature1

CompactBar SHALL показывать idle indicator когда тесты не запущены:
- Если YAML файл не существует или state = "idle" → показать "no test runs" с приглушённым стилем
- Если YAML файл повреждён → показать "waiting for tests..."

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6-idle-indicator)
