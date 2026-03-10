# Use Cases

## UC-1: Запуск TUI и мониторинг тестов @feature1

Разработчик запускает тесты и параллельно открывает TUI для мониторинга.

1. Разработчик запускает тесты через wrapper: `bash .dev-pomogator/tools/test-statusline/test_runner_wrapper.sh npm test`
2. Wrapper пишет YAML status file в `.dev-pomogator/.test-status/status.{session}.yaml`
3. В отдельном терминале запускает TUI: `python -m tui_test_runner --status-file <path>`
4. TUI открывается с 4 вкладками, Monitoring tab активен по умолчанию
5. TUI polling (500ms) читает YAML и обновляет все вкладки в реальном времени
6. По завершении тестов TUI показывает итоговый статус (passed/failed)

## UC-2: Просмотр иерархии тестов @feature2

Разработчик переключается на Tests tab для детального просмотра.

1. Нажимает клавишу `1` для перехода на Tests tab
2. Видит иерархическое дерево: Suite → Test с иконками статусов (✅ ❌ ⏭️ 🔄 ⏳)
3. Failed тесты отсортированы наверх для быстрого доступа
4. Нажимает `f` для фильтрации — вводит имя теста или выбирает статус
5. Разворачивает/сворачивает suite nodes в дереве

## UC-3: Просмотр логов в реальном времени @feature3

Разработчик просматривает stdout тестов с подсветкой.

1. Нажимает клавишу `2` для перехода на Logs tab
2. Видит stdout тестов в реальном времени с автоскроллом
3. Подсветка: stack traces (красный), timestamps (серый), BDD keywords Given/When/Then (зелёный), HTTP codes (цветовые), file paths (подчёркнутые)
4. 20+ regex patterns для подсветки различных форматов
5. Может прокручивать вверх для просмотра истории

## UC-4: Мониторинг прогресса @feature4

Разработчик отслеживает общий прогресс тестов.

1. Нажимает клавишу `3` для перехода на Monitoring tab
2. Видит: текущая фаза (setup → build → test → done), процент выполнения, duration
3. Видит: aggregate counters (total/passed/failed/skipped)
4. Видит: имя текущего выполняемого теста
5. Progress bar обновляется в реальном времени

## UC-5: Анализ ошибок @feature5

Разработчик исследует причины падений.

1. Нажимает клавишу `4` для перехода на Analysis tab
2. Видит список failed тестов с группировкой по паттернам ошибок
3. Каждая группа содержит: тип ошибки (timeout, assertion, connection), количество, рекомендации
4. Для каждого failed теста: error message, stack trace, рекомендация по исправлению

## UC-6: Использование с разными фреймворками @feature6

Расширение работает с любым тест-фреймворком.

1. Node.js adapter автоматически определяет фреймворк по конфигу проекта (vitest.config.ts, jest.config.js, pytest.ini, *.csproj)
2. Или разработчик явно указывает через env: `TUI_TEST_FRAMEWORK=vitest`
3. Framework adapter парсит stdout конкретного фреймворка в универсальный TestEvent
4. YAML v2 writer конвертирует TestEvent в стандартный YAML формат
5. Python TUI читает только YAML — не зависит от фреймворка

## UC-7: Сосуществование с test-statusline @feature7

Оба расширения работают параллельно без конфликтов.

1. test-statusline показывает однострочный статус в Claude Code statusline
2. tui-test-runner показывает полный 4-tab TUI в отдельном терминале
3. Оба читают одни и те же YAML status files
4. YAML v2 backward compatible с v1 — statusline_render.sh работает без изменений
5. Отдельные SessionStart hooks, не конфликтуют
