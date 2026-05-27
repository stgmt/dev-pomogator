# Сводка требований

## Функциональные требования (FR)

| ID | Название | Приоритет |
|----|----------|-----------|
| [FR-1](FR.md#fr-1-автоматическое-определение-языка-проекта) | Автоматическое определение языка проекта | High |
| [FR-2](FR.md#fr-2-парсинг-typescript-step-definitions) | Парсинг TypeScript step definitions | High |
| [FR-3](FR.md#fr-3-парсинг-python-step-definitions) | Парсинг Python step definitions | High |
| [FR-4](FR.md#fr-4-парсинг-c-step-definitions) | Парсинг C# step definitions | High |
| [FR-5](FR.md#fr-5-определение-качества-then-степов) | Определение качества Then степов | High |
| [FR-6](FR.md#fr-6-генерация-отчёта) | Генерация отчёта | Medium |
| [FR-7](FR.md#fr-7-вывод-предупреждений-в-stdout) | Вывод предупреждений в stdout | Medium |
| [FR-8](FR.md#fr-8-конфигурация-через-yaml) | Конфигурация через YAML | Low |
| [FR-9](FR.md#fr-9-opt-out-активация) | Opt-out активация | Medium |
| [FR-10](FR.md#fr-10-тихая-работа-при-ошибках) | Тихая работа при ошибках | High |

## Нефункциональные требования (NFR)

| ID | Название | Приоритет |
|----|----------|-----------|
| [NFR-1](NFR.md#nfr-1-производительность) | Производительность (<5 сек) | Medium |
| [NFR-2](NFR.md#nfr-2-переносимость) | Переносимость (Win/Mac/Linux) | High |
| [NFR-3](NFR.md#nfr-3-минимальные-зависимости) | Минимальные зависимости | High |
| [NFR-4](NFR.md#nfr-4-graceful-degradation) | Graceful Degradation | Medium |
| [NFR-5](NFR.md#nfr-5-совместимость-с-ide) | Совместимость с IDE | High |
| [NFR-6](NFR.md#nfr-6-логирование) | Логирование | Medium |
| [NFR-7](NFR.md#nfr-7-идемпотентность) | Идемпотентность | Low |
| [NFR-8](NFR.md#nfr-8-тестируемость) | Тестируемость | High |

## Матрица трассировки

| Требование | User Story | Use Case | Test |
|------------|------------|----------|------|
| [FR-1](FR.md#fr-1-автоматическое-определение-языка-проекта) | US-1 | UC-1 | @feature1 |
| [FR-2](FR.md#fr-2-парсинг-typescript-step-definitions) | US-1 | UC-1 | @feature2 |
| [FR-3](FR.md#fr-3-парсинг-python-step-definitions) | US-1 | UC-1 | @feature3 |
| [FR-4](FR.md#fr-4-парсинг-c-step-definitions) | US-1 | UC-1 | @feature4 |
| [FR-5](FR.md#fr-5-определение-качества-then-степов) | US-2 | UC-2 | @feature5 |
| [FR-6](FR.md#fr-6-генерация-отчёта) | US-3 | UC-3 | @feature6 |
| [FR-7](FR.md#fr-7-вывод-предупреждений-в-stdout) | US-3 | UC-3 | @feature7 |
| [FR-8](FR.md#fr-8-конфигурация-через-yaml) | US-4 | UC-4 | @feature8 |
| [FR-9](FR.md#fr-9-opt-out-активация) | US-4 | UC-4 | @feature9 |
| [FR-10](FR.md#fr-10-тихая-работа-при-ошибках) | US-5 | UC-5 | @feature10 |
