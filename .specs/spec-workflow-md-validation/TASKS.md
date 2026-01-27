# Tasks

## Phase 1: Specification

- [x] Создать структуру спецификации (13 файлов) @feature1 @feature2 @feature3 @feature4 @feature5 @feature6 @feature7 @feature8 @feature9
- [ ] Заполнить RESEARCH.md с анализом

## Phase 2: Core Components

- [ ] Реализовать completeness.ts @feature3 @feature4
  - [ ] Определить REQUIRED_MD_FILES константу
  - [ ] Реализовать checkCompleteness()
  - [ ] Реализовать findCompleteSpecs()

- [ ] Реализовать md-parser.ts @feature5 @feature6 @feature7
  - [ ] Парсинг ## FR-N: {Title} @featureN
  - [ ] Парсинг ## AC-N (FR-N): {Title} @featureN
  - [ ] Парсинг ## UC-N: {Title} @featureN
  - [ ] Извлечение всех @feature\d+ через regex

- [ ] Реализовать feature-parser.ts @feature5 @feature6 @feature7
  - [ ] Парсинг # @featureN перед Scenario
  - [ ] Извлечение имени сценария

- [ ] Реализовать matcher.ts @feature5 @feature6 @feature7
  - [ ] Логика NOT_COVERED
  - [ ] Логика ORPHAN
  - [ ] Логика COVERED

- [ ] Реализовать reporter.ts @feature5 @feature6 @feature7
  - [ ] Генерация validation-report.md
  - [ ] Вывод предупреждений в stdout

## Phase 3: Hook Integration

- [ ] Создать validate-specs.ts @feature1 @feature2 @feature8 @feature9
  - [ ] Чтение JSON из stdin
  - [ ] Поиск .specs/ папки
  - [ ] Проверка .specs-validator.yaml
  - [ ] Оркестрация валидации
  - [ ] Обработка ошибок

- [ ] Обновить extension.json @feature1 @feature2
  - [ ] Добавить hooks.cursor.beforeSubmitPrompt
  - [ ] Добавить hooks.claude.UserPromptSubmit

- [ ] Создать specs-validation.mdc @feature1 @feature2
  - [ ] Описание @featureN тегов
  - [ ] Workflow создания фичи
  - [ ] Типы проблем

## Phase 4: Installer

- [ ] Обновить src/installer/memory.ts @feature1
  - [ ] Добавить copyValidateSpecsScript()

## Phase 5: Testing

- [ ] Создать PLUGIN005_specs-validator.feature
  - [ ] 9 BDD сценариев

- [ ] Создать specs-validator.test.ts
  - [ ] 9 describe блоков
  - [ ] Helper createCompleteSpec()
