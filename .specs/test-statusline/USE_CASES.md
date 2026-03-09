# Use Cases

## UC-1: Отображение прогресса запущенных тестов @feature1

Разработчик запускает тесты через Claude Code (`npm test` в background). Statusline автоматически показывает прогресс.

1. Разработчик запускает `npm test` через Claude Code (background task)
2. Daemon обнаруживает тест-процесс и начинает мониторинг
3. Daemon парсит output тест-процесса и записывает YAML status file
4. Statusline script читает YAML при каждом обновлении statusline
5. Claude Code отображает прогресс: `T 76% [#######---] 38ok 2fail 10run | 0:45`
6. При завершении тестов statusline обновляется: `T pass 50/50 | 2:15` или `T ERR 45/50 (5 failed) | 3:00`

**Edge cases:**
- Тесты завершаются до первого обновления statusline — показываем финальный результат
- YAML файл пуст или повреждён — statusline не показывает ничего (fail-silent)
- jq не установлен — fallback на grep-based парсинг JSON

## UC-2: Запуск и остановка daemon @feature2

Daemon запускается при старте сессии Claude Code и останавливается при завершении.

1. SessionStart hook проверяет наличие running daemon для текущей сессии
2. Если daemon нет — запускает как detached child process
3. Daemon начинает polling тест-процессов с интервалом (по умолчанию 2 секунды)
4. При Stop hook — daemon получает SIGTERM, очищает PID file и status file
5. При аварийном завершении — stale PID file обнаруживается при следующем SessionStart

**Edge cases:**
- Daemon уже запущен (повторный SessionStart) — не запускать дубликат
- PID file есть, но процесс не существует (stale) — удалить PID file, запустить новый daemon
- Daemon crash — status file остаётся с последним известным состоянием

## UC-3: Параллельные сессии Claude Code @feature3

Два экземпляра Claude Code работают в разных проектах, каждый видит только свои тесты.

1. Сессия A запускает тесты в проекте `/project-a/`
2. Сессия B запускает тесты в проекте `/project-b/`
3. Daemon A пишет в `logs/.test-status.{session_id_A}.yaml`
4. Daemon B пишет в `logs/.test-status.{session_id_B}.yaml`
5. Statusline A получает `session_id_A` из JSON stdin → читает только свой YAML
6. Statusline B получает `session_id_B` из JSON stdin → читает только свой YAML

**Edge cases:**
- Две сессии в одном проекте — каждая со своим session_id, файлы не конфликтуют
- Одна сессия завершается, другая продолжает — cleanup удаляет только свои файлы

## UC-4: Обнаружение тест-процессов daemon'ом @feature2

Daemon автоматически находит запущенные тест-процессы без ручной конфигурации.

1. Daemon сканирует процессы по паттернам: `vitest`, `jest`, `npm test`, `docker-compose.*test`
2. При обнаружении тест-процесса — начинает мониторинг его output файла
3. Парсит output для извлечения: количество тестов, passed/failed/running, suites
4. Обновляет YAML status file атомарно (temp + rename)
5. При завершении тест-процесса — обновляет status на `completed` или `failed`

**Edge cases:**
- Множественные тест-процессы одновременно — мониторить все, агрегировать в один YAML
- Тест-процесс без parseable output — status = `running`, percent = 0 (unknown progress)
- Процесс убит (SIGKILL) — daemon обнаруживает исчезновение PID, status = `failed`

## UC-5: Установка расширения через dev-pomogator @feature5

Пользователь устанавливает dev-pomogator, test-statusline подключается автоматически.

1. Пользователь запускает инсталлер dev-pomogator
2. Инсталлер читает `extensions/test-statusline/extension.json`
3. Копирует toolFiles в `.dev-pomogator/tools/test-statusline/`
4. Регистрирует hooks (SessionStart, Stop) в `.claude/settings.json`
5. Statusline script копируется, но не заменяет текущий statusline (пользователь подключает вручную или через ccstatusline custom command)

**Edge cases:**
- У пользователя уже есть свой statusline — не перезаписывать, предложить интеграцию
- Переустановка — идемпотентность (файлы обновляются, hooks не дублируются)
