# Centralized Test Runner

Тесты запускаются ТОЛЬКО через `/run-tests`. Прямые команды (`npm test`, `pytest`, `dotnet test`, `cargo test`, `go test`) блокируются PreToolUse hook-ом.

## Причина

`test_runner_wrapper.cjs` парсит stdout тестов и пишет YAML status файл, который используют:
- `statusline_render.sh` — однострочный прогресс в Claude Code statusline
- Python TUI — полный 4-tab мониторинг (Tests/Logs/Monitoring/Analysis)

Без wrapper-а statusline и TUI не получают данные.

## Правильно

```bash
/run-tests                     # авто-детект фреймворка
/run-tests auth                # фильтр по имени теста
/run-tests --framework vitest  # явный выбор фреймворка
/run-tests --docker            # через Docker Compose
```

## Неправильно

```bash
npm test                       # ❌ заблокировано
npx vitest run                 # ❌ заблокировано
pytest                         # ❌ заблокировано
dotnet test                    # ❌ заблокировано
cargo test                     # ❌ заблокировано
```

## Build Guard

PreToolUse hook `build_guard.ts` блокирует тесты если build устарел или пропущен:

- **TypeScript**: `src/` новее `dist/` → deny ("Run `npm run build` first")
- **Docker**: `SKIP_BUILD=1` → deny ("Docker build must not be skipped")
- **dotnet**: `--no-build` flag → deny ("Remove --no-build flag")
- **pytest/go/rust**: passthrough (компилятор/интерпретатор сам собирает)

Bypass: `SKIP_BUILD_CHECK=1` env var. Fail-open: ошибка в hook → allow.

