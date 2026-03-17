# Use Cases

## UC-1: Compact mode показывает прогресс тестов @feature1

**Precondition:** TUI запущен в нижнем пейне Windows Terminal, тесты запущены через `/run-tests`.

**Happy path:**
1. Wrapper пишет YAML status файл с прогрессом
2. TUI в compact mode показывает CompactBar: иконка статуса + framework + passed/failed/skipped + progress bar + duration
3. При появлении ошибки — CompactBar показывает имя упавшего теста

**Edge cases:**
- Тесты не запущены → CompactBar показывает idle indicator
- YAML файл отсутствует/повреждён → CompactBar показывает "waiting for tests..."

## UC-2: Переключение compact ↔ full @feature2

**Precondition:** TUI запущен.

**Happy path:**
1. Пользователь нажимает `M` или кликает кнопку в header
2. TUI переключается: compact → full (табы видны) или full → compact (табы скрыты, CompactBar)
3. Состояние (текущий таб, фильтр) сохраняется между переключениями

**Edge cases:**
- Переключение во время активных тестов — прогресс не теряется
- Terminal height < 10 строк в full mode → auto-switch на compact

## UC-3: Stop tests из TUI @feature3

**Precondition:** Тесты запущены, PID записан в YAML.

**Happy path:**
1. Пользователь нажимает `X` или кликает [Stop]
2. TUI читает PID из YAML status файла
3. TUI отправляет SIGTERM (Unix) / taskkill (Windows)
4. Статус обновляется на "stopped"

**Edge cases:**
- PID не найден в YAML → кнопка неактивна
- Процесс уже завершился → игнорировать, обновить статус

## UC-4: Auto-compact при маленьком терминале @feature4

**Precondition:** TUI в full mode, пользователь ресайзит пейн.

**Happy path:**
1. Terminal height падает ниже 15 строк
2. TUI автоматически переключается в compact mode
3. При увеличении обратно > 15 — остаётся в compact (ручной возврат через `M`)

## UC-5: Выпиливание statusline render @feature5

**Precondition:** dev-pomogator установлен с test-statusline extension.

**Happy path:**
1. Удалить `statusLine` конфиг из `extension.json` test-statusline
2. Удалить render файлы: `statusline_render.cjs`, `statusline_render.sh`, `statusline_wrapper.js`
3. Оставить: `statusline_session_start.ts`, `test_runner_wrapper.*`, `status_types.ts`
4. Claude Code statusline слот свободен для пользователя
