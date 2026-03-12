# Design

## Architecture

PowerShell скрипты для автоматизации работы со спецификациями.

## Components

### scaffold-spec.sh

- Создаёт структуру папки
- Копирует шаблоны из templates/
- Заменяет плейсхолдеры

### validate-spec.sh

- Проверяет наличие файлов
- Валидирует форматы (FR, UC, EARS, NFR)
- Генерирует отчёт

### spec-status.sh

- Анализирует состояние файлов
- Определяет фазу (Discovery/Requirements/Finalization)
- Рассчитывает прогресс

## Data Flow

```
User → Script → FileSystem → JSON Output
```
