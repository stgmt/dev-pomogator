# Functional Requirements

## FR-1: Scaffold Command

Система ДОЛЖНА создавать структуру папки спецификации с 13 файлами при вызове scaffold-spec.ps1.

### Details

- Входной параметр: Name (kebab-case)
- Выходной формат: JSON
- Файлы копируются из templates/

## FR-2: Validate Command

Система ДОЛЖНА проверять структуру и форматы спецификации при вызове validate-spec.ps1.

### Details

- Проверка наличия обязательных файлов
- Проверка формата FR-N в FR.md
- Проверка формата UC-N в USE_CASES.md
- Проверка EARS формата в ACCEPTANCE_CRITERIA.md

## FR-3: Status Command

Система ДОЛЖНА показывать прогресс заполнения спецификации при вызове spec-status.ps1.

### Details

- Определение текущей фазы
- Расчёт процента заполнения
- Рекомендация следующего действия
