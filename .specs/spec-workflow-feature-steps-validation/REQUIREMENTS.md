# Сводка требований

## Функциональные требования (FR)

| ID | Название | Приоритет |
|----|----------|-----------|
| FR-1 | Автоматическое определение языка проекта | High |
| FR-2 | Парсинг TypeScript step definitions | High |
| FR-3 | Парсинг Python step definitions | High |
| FR-4 | Парсинг C# step definitions | High |
| FR-5 | Определение качества Then степов | High |
| FR-6 | Генерация отчёта | Medium |
| FR-7 | Вывод предупреждений в stdout | Medium |
| FR-8 | Конфигурация через YAML | Low |
| FR-9 | Opt-out активация | Medium |
| FR-10 | Тихая работа при ошибках | High |

## Нефункциональные требования (NFR)

| ID | Название | Приоритет |
|----|----------|-----------|
| NFR-1 | Производительность (<5 сек) | Medium |
| NFR-2 | Переносимость (Win/Mac/Linux) | High |
| NFR-3 | Минимальные зависимости | High |
| NFR-4 | Graceful Degradation | Medium |
| NFR-5 | Совместимость с IDE | High |
| NFR-6 | Логирование | Medium |
| NFR-7 | Идемпотентность | Low |
| NFR-8 | Тестируемость | High |

## Матрица трассировки

| Требование | User Story | Use Case | Test |
|------------|------------|----------|------|
| FR-1 | US-1 | UC-1 | @feature1 |
| FR-2 | US-1 | UC-1 | @feature2 |
| FR-3 | US-1 | UC-1 | @feature3 |
| FR-4 | US-1 | UC-1 | @feature4 |
| FR-5 | US-2 | UC-2 | @feature5 |
| FR-6 | US-3 | UC-3 | @feature6 |
| FR-7 | US-3 | UC-3 | @feature7 |
| FR-8 | US-4 | UC-4 | @feature8 |
| FR-9 | US-4 | UC-4 | @feature9 |
| FR-10 | US-5 | UC-5 | @feature10 |
