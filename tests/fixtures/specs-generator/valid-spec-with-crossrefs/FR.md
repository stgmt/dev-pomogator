# Functional Requirements

## FR-1: Data Import @feature1

Система ДОЛЖНА импортировать данные из CSV файлов.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-success-import)
**Use Case:** [UC-1](USE_CASES.md#uc-1-import-csv-data)

### Details

- Поддержка UTF-8 кодировки
- Валидация формата данных
- Логирование результатов

## FR-2: Data Export @feature2

Система ДОЛЖНА экспортировать отчёты в PDF формат.

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-export-pdf)
**Use Case:** [UC-2](USE_CASES.md#uc-2-export-report)

### Details

- Генерация из шаблона
- Поддержка кириллицы
- Сохранение в указанную директорию
