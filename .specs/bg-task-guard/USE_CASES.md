# Use Cases

## UC-1: Claude запускает тесты в фоне и продолжает работу @feature1

- Claude выполняет `run_in_background: true` для Docker тестов
- PostToolUse hook на Bash обнаруживает "running in background" в stdout
- Hook создаёт marker файл `.dev-pomogator/.bg-task-active` с timestamp
- Claude пытается остановиться (idle stop)
- Stop hook обнаруживает marker, возвращает `{"decision": "block", "reason": "..."}`
- Claude получает systemMessage и продолжает работу
- Результат: Claude не простаивает, а работает над другими задачами

## UC-2: Фоновая задача завершается — marker удаляется @feature1

- Background task завершается (notification приходит)
- Claude обрабатывает результат
- Marker файл остаётся (удаляется при следующем Stop check или вручную)
- Stop hook проверяет: marker есть, но нет активных background tasks → разрешает stop
- Результат: Claude может нормально остановиться после обработки результата

## UC-3: Stale marker — автоматический expire @feature2

- Claude запустил bg task, создался marker
- Claude crash / disconnect / сессия закрылась
- Через 15 минут marker становится stale
- Новая сессия: Stop hook проверяет marker → age > 15 мин → не блокирует stop
- Результат: stale marker не блокирует будущие сессии

## UC-4: Нет фоновых задач — stop разрешён @feature1

- Claude работает без фоновых задач
- Marker файл не существует
- Stop hook: нет marker → exit 0 → Claude останавливается нормально
- Результат: hook не мешает обычной работе
