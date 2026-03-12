# Use Cases

## UC-1: Отображение прогресса запущенных тестов @feature1

Разработчик запускает тесты через test runner wrapper. Statusline автоматически показывает прогресс.

1. Разработчик запускает тесты через test runner wrapper (background task)
2. Wrapper парсит output тест-процесса и записывает YAML status file
3. Statusline script читает YAML при каждом обновлении statusline
4. Claude Code отображает прогресс: `76% [▓▓▓▓▓▓▓░░░] 38✅ 2❌ 10⏳ | 0:45`
5. При завершении тестов statusline обновляется: `✅ 50/50 | 2:15` или `❌ 45/50 (5 failed) | 3:00`

**Edge cases:**
- Тесты завершаются до первого обновления statusline — показываем финальный результат
- YAML файл пуст или повреждён — statusline не показывает ничего (fail-silent)
- jq не установлен — fallback на grep-based парсинг JSON

## UC-2: Инициализация сессии и cleanup @feature4

SessionStart hook инициализирует директорию для status files и очищает stale данные.

1. SessionStart hook создаёт директорию `.dev-pomogator/.test-status/` если не существует
2. Hook записывает `TEST_STATUSLINE_SESSION={prefix}` в `$CLAUDE_ENV_FILE`
3. Hook очищает stale YAML files (старше 24h или idle старше 1h)
4. Hook выводит `{}` на stdout и завершается с exit 0

**Edge cases:**
- Директория уже существует — повторное создание идемпотентно
- Нет stale файлов — cleanup ничего не делает
- CLAUDE_ENV_FILE не установлен — тихий skip

## UC-3: Параллельные сессии Claude Code @feature3

Два экземпляра Claude Code работают параллельно, каждый видит только свои тесты.

1. Сессия A запускает тесты через wrapper
2. Сессия B запускает тесты через wrapper
3. Wrapper A пишет в `.dev-pomogator/.test-status/status.{prefix_A}.yaml`
4. Wrapper B пишет в `.dev-pomogator/.test-status/status.{prefix_B}.yaml`
5. Statusline A получает session_id из JSON stdin → читает только свой YAML
6. Statusline B получает session_id из JSON stdin → читает только свой YAML

**Edge cases:**
- Две сессии в одном проекте — каждая со своим session_id prefix, файлы не конфликтуют
- Одна сессия завершается, другая продолжает — cleanup удаляет только stale файлы

## UC-4: Test runner wrapper записывает прогресс @feature2

Test runner wrapper оборачивает тест-команду и записывает прогресс в YAML.

1. Wrapper получает session prefix из env var `TEST_STATUSLINE_SESSION`
2. Создаёт initial YAML (state=running, percent=0)
3. Запускает тест-команду, pipe stdout через парсер
4. На каждой строке output — парсит test results, обновляет YAML атомарно (temp + rename)
5. При завершении тест-процесса (exit 0) — обновляет state=passed
6. При ошибке (exit != 0) — обновляет state=failed

**Edge cases:**
- Тест-процесс без parseable output — status = running, percent = 0
- Wrapper получает SIGTERM — записывает финальный state=failed
- TEST_STATUSLINE_SESSION не установлен — тихий skip (тесты запускаются без трекинга)

## UC-5: Установка расширения через dev-pomogator @feature5

Пользователь устанавливает dev-pomogator, test-statusline подключается автоматически.

1. Пользователь запускает инсталлер dev-pomogator
2. Инсталлер читает `extensions/test-statusline/extension.json`
3. Копирует toolFiles в `.dev-pomogator/tools/test-statusline/`
4. Регистрирует hook (SessionStart) в `.claude/settings.json`
5. Регистрирует `statusLine` command для `statusline_render.sh`

**Edge cases:**
- У пользователя уже есть свой statusline — не перезаписывать, использовать wrapper для coexistence
- Переустановка — идемпотентность (файлы обновляются, hooks не дублируются)

## UC-6: Защита от случайной очистки hooks @feature7

SessionStart hook проверяет, что ожидаемые managed hooks не пропали из `.claude/settings.json`.

1. Claude Code запускает SessionStart
2. Hook читает extension manifests и собирает ожидаемые hooks
3. Hook сравнивает их с текущими hooks в `.claude/settings.json`
4. Если managed hook отсутствует — hook восстанавливает его через smart merge
5. Hook логирует результат и завершается с exit 0

**Edge cases:**
- Все hooks уже целы — только логируем проверку, без изменений
- В settings есть пользовательские hooks — сохраняем их без перезаписи

## UC-7: Coexistence с существующим statusLine @feature8

У пользователя уже есть свой Claude Code `statusLine`, и `test-statusline` должен встроиться рядом, а не ломать текущий вывод.

1. Installer/updater читает project `.claude/settings.json`
2. Если project `statusLine` отсутствует — читает global `~/.claude/settings.json`
3. Если найден user-defined `statusLine` — записывает wrapper в project settings
4. Wrapper запускает user command и managed `statusline_render.sh` на одном stdin
5. Если обе стороны вернули текст — Claude Code показывает `user | managed`
6. Если одна из сторон молчит или падает — показывается только непустая сторона
7. Если wrapper уже существует — сохраняется прежний `userCommand`, обновляется только managed часть

**Edge cases:**
- Project settings и global settings оба содержат `statusLine` — project имеет приоритет
- Project settings не содержит `statusLine`, но global содержит — wrapper всё равно пишется в project settings
- Existing wrapper повреждён — fallback на direct managed `statusLine`
