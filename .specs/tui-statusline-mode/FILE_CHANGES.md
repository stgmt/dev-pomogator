# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи.

См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

| Path | Action | Reason |
|------|--------|--------|
| `extensions/tui-test-runner/tools/tui-test-runner/tui/widgets/compact_bar.py` | create | [FR-1](FR.md#fr-1-compactbar-виджет) — CompactBar виджет |
| `extensions/tui-test-runner/tools/tui-test-runner/tui/stop_handler.py` | create | [FR-3](FR.md#fr-3-stop-tests) — кросс-платформенный stop |
| `extensions/tui-test-runner/tools/tui-test-runner/tui/app.py` | edit | [FR-2](FR.md#fr-2-toggle-compactfull-mode) — CSS toggle + keybindings M/X |
| `extensions/tui-test-runner/tools/tui-test-runner/tui/__main__.py` | edit | Import CompactBar, register в compose() |
| `extensions/tui-test-runner/extension.json` | edit | Обновить toolFiles (добавить compact_bar.py, stop_handler.py) |
| `extensions/test-statusline/tools/test-statusline/statusline_render.cjs` | delete | [FR-5](FR.md#fr-5-выпилить-statusline-render-из-test-statusline) |
| `extensions/test-statusline/tools/test-statusline/statusline_render.sh` | delete | [FR-5](FR.md#fr-5-выпилить-statusline-render-из-test-statusline) |
| `extensions/test-statusline/tools/test-statusline/statusline_wrapper.js` | delete | [FR-5](FR.md#fr-5-выпилить-statusline-render-из-test-statusline) |
| `extensions/test-statusline/extension.json` | edit | Убрать statusLine секцию + toolFiles |
| `tests/e2e/test-statusline.test.ts` | edit | Добавить compact mode тесты, убрать render тесты |
| `tests/features/plugins/test-statusline/PLUGIN011_test-statusline.feature` | edit | Добавить compact mode BDD сценарии |
