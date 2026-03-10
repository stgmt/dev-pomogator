# Centralized Test Runner

Тесты запускаются ТОЛЬКО через `/run-tests`. Прямые команды (`npm test`, `pytest`, `dotnet test`, `cargo test`, `go test`) блокируются PreToolUse hook-ом.

## Причина

`test_runner_wrapper.sh` парсит stdout тестов и пишет YAML status файл, который используют:
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

## Bypass

Для исключительных случаев: `TEST_GUARD_BYPASS=1` в env.
