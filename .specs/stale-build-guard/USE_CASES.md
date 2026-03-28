# Use Cases

## UC-1: TypeScript проект — src/ изменён после последнего build @feature1 @feature2

Разработчик изменил файл в `src/`, но не запустил `npm run build`. Вызывает `/run-tests`.

- Guard проверяет mtime `dist/index.js` vs max mtime файлов в `src/**/*.ts`
- `src/` новее `dist/` → build stale
- Guard автоматически запускает `npm run build`
- После успешного build запускает тесты
- Statusline показывает: Building... → Running... → Passed/Failed

## UC-2: TypeScript проект — build актуален @feature1

Разработчик изменил только тесты (не `src/`). Вызывает `/run-tests`.

- Guard проверяет mtime: `dist/` новее или равен `src/`
- Build актуален → тесты запускаются сразу без пересборки

## UC-3: Docker тесты — образ устарел @feature1 @feature3

Разработчик изменил `src/` или `Dockerfile.test`. Вызывает `/run-tests --docker`.

- Guard проверяет: `--docker` режим → нужен `--build` флаг для docker compose
- Docker compose rebuild включает изменения в образ
- Без guard: `--no-build` пропускает rebuild → тесты бегут на устаревшем коде

## UC-4: dotnet проект — .cs файлы изменены @feature3

Разработчик изменил `.cs` файлы. Вызывает `/run-tests`.

- Guard проверяет: framework=dotnet → проверить mtime `bin/` vs `**/*.cs`
- Stale → запускает `dotnet build` перед `dotnet test`
- Или: `dotnet test` сам пересобирает (implicit build), но можно форсировать `--no-restore` только если build свежий

## UC-5: Принудительный запуск без проверки @feature5

Разработчик знает что build stale, но хочет запустить тесты быстро.

- Вызывает `/run-tests --skip-build-check`
- Guard пропускает проверку staleness
- Тесты запускаются на текущем (возможно устаревшем) билде
- Warning в output: "Build check skipped — results may be unreliable"

## UC-6: Нет build-артефактов (первый запуск) @feature2

Папка `dist/` не существует или пуста. Разработчик вызывает `/run-tests`.

- Guard обнаруживает отсутствие build-артефактов
- Автоматически запускает полный build
- После build → тесты

## UC-7: Build падает @feature2

`src/` содержит синтаксическую ошибку. `/run-tests`.

- Guard обнаруживает stale build → запускает `npm run build`
- Build падает с ошибкой → exit code != 0
- Guard останавливает pipeline, показывает ошибку build
- Тесты НЕ запускаются (нет смысла запускать на сломанном коде)
