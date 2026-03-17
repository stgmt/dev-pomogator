# Tasks

## TDD Workflow

> Задачи организованы по TDD: Red -> Green -> Refactor.

## Phase 0: BDD Foundation (Red)

- [ ] Расширить test helpers в `tests/e2e/test-statusline.test.ts` для compact mode (YAML fixture creation, process cleanup) — @feature1..@feature5
  files: `tests/e2e/test-statusline.test.ts` (edit)
  _Source: DESIGN.md "BDD Test Infrastructure" > "Новые hooks"_
- [ ] Добавить compact mode сценарии (PLUGIN011_60..68) в `tests/e2e/test-statusline.test.ts` — @feature1..@feature5
  _Requirements: [FR-1](FR.md#fr-1-compactbar-виджет-feature1), [FR-2](FR.md#fr-2-toggle-compactfull-mode-feature2), [FR-3](FR.md#fr-3-stop-tests-feature3), [FR-4](FR.md#fr-4-auto-compact-при-малом-terminal-height-feature4), [FR-5](FR.md#fr-5-выпилить-statusline-render-из-test-statusline-feature5)_
- [ ] Обновить `.feature` файл с новыми сценариями
- [ ] Убедиться что все новые сценарии FAIL (Red)

## Phase 1: CompactBar виджет (Green) — @feature1

- [ ] Создать `widgets/compact_bar.py` — CompactBar(Static) с render() — @feature1
  files: `extensions/tui-test-runner/tools/tui-test-runner/tui/widgets/compact_bar.py` (create)
  _Requirements: [FR-1](FR.md#fr-1-compactbar-виджет-feature1), [FR-6](FR.md#fr-6-idle-indicator-в-compact-mode-feature1)_
  _Leverage: `extensions/tui-test-runner/tools/tui-test-runner/tui/widgets/monitoring_tab.py`_
- [ ] Добавить idle indicator и corrupted YAML handling — @feature1
  _Requirements: [FR-6](FR.md#fr-6-idle-indicator-в-compact-mode-feature1)_
- [ ] Verify: сценарии @feature1 (PLUGIN011_60, 61, 62) переходят из Red в Green

## Phase 2: Toggle compact/full (Green) — @feature2

- [ ] VERIFY: Textual CSS `display: none` скрывает TabbedContent (тест с минимальным примером) — @feature2
  _Если не работает — использовать `widget.display = False` programmatically_
- [ ] Добавить CSS `.compact` class toggle и CompactBar mount в `app.py` — @feature2
  files: `extensions/tui-test-runner/tools/tui-test-runner/tui/app.py` (edit)
  _Requirements: [FR-2](FR.md#fr-2-toggle-compactfull-mode-feature2)_
- [ ] Добавить keybinding `M` для toggle — @feature2
- [ ] Verify: сценарии @feature2 (PLUGIN011_63, 64) переходят из Red в Green

## Phase 3: Stop tests (Green) — @feature3

- [ ] Создать `stop_handler.py` — кросс-платформенный kill по PID — @feature3
  files: `extensions/tui-test-runner/tools/tui-test-runner/tui/stop_handler.py` (create)
  _Requirements: [FR-3](FR.md#fr-3-stop-tests-feature3)_
- [ ] Добавить keybinding `X` и [Stop] button — @feature3
- [ ] Verify: сценарии @feature3 (PLUGIN011_65, 66) переходят из Red в Green

## Phase 4: Auto-compact (Green) — @feature4

- [ ] Добавить `on_resize()` handler в app.py — auto-compact при height < 15 — @feature4
  files: `extensions/tui-test-runner/tools/tui-test-runner/tui/app.py` (edit)
  _Requirements: [FR-4](FR.md#fr-4-auto-compact-при-малом-terminal-height-feature4)_
- [ ] Verify: сценарий @feature4 (PLUGIN011_67) переходит из Red в Green

## Phase 5: Выпилить statusline render (Green) — @feature5

- [ ] Удалить `statusline_render.cjs`, `statusline_render.sh`, `statusline_wrapper.js` — @feature5
  files: `extensions/test-statusline/tools/test-statusline/statusline_render.cjs` (delete), `statusline_render.sh` (delete), `statusline_wrapper.js` (delete)
  _Requirements: [FR-5](FR.md#fr-5-выпилить-statusline-render-из-test-statusline-feature5)_
- [ ] Обновить extension.json: убрать statusLine + toolFiles — @feature5
  files: `extensions/test-statusline/extension.json` (edit), `extensions/tui-test-runner/extension.json` (edit)
- [ ] Verify: сценарий @feature5 (PLUGIN011_68) переходит из Red в Green

## Phase 6: Refactor & Polish

- [ ] Рефакторинг после прохождения всех сценариев
- [ ] Все BDD сценарии GREEN
- [ ] E2E тест-план выполнен (`/run-tests --docker`)
