# Design

## Architecture

Модульная архитектура с разделением на импорт и экспорт.

## Реализуемые требования

- [FR-1: Data Import](FR.md#fr-1-data-import)
- [FR-2: Data Export](FR.md#fr-2-data-export)

## Components

### CSVImporter

- Парсинг CSV файлов
- Валидация данных
- Сохранение в БД

### PDFExporter

- Генерация PDF из шаблона
- Поддержка кириллицы

## Data Flow

```
CSV File → CSVImporter → Database → PDFExporter → PDF File
```
