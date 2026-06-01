# Tasks

## Phase 1: Specification

- [x] Создать структуру спецификации (13 файлов) @feature1 @feature2 @feature3 @feature4 @feature5 @feature6 @feature7 @feature8 @feature9
- [x] Заполнить RESEARCH.md с анализом — 147 строк, разделы Objective / Analysis (@featureN формат, edge cases) / Conclusions

## Phase 2: Core Components

- [x] Реализовать completeness.ts @feature3 @feature4 → `extensions/specs-workflow/tools/specs-validator/completeness.ts`
  - [x] Определить REQUIRED_MD_FILES константу
  - [x] Реализовать checkCompleteness()
  - [x] Реализовать findCompleteSpecs()
  - [x] Bonus: findSpecsFolder() для multi-workspace-root resolve

- [x] Реализовать md-parser.ts @feature5 @feature6 @feature7 → `extensions/specs-workflow/tools/specs-validator/parsers/md-parser.ts`
  - [x] Парсинг ## FR-N: {Title} @featureN
  - [x] Парсинг ## AC-N (FR-N): {Title} @featureN
  - [x] Парсинг ## UC-N: {Title} @featureN
  - [x] Извлечение всех @feature\d+ через regex

- [x] Реализовать feature-parser.ts @feature5 @feature6 @feature7 → `extensions/specs-workflow/tools/specs-validator/parsers/feature-parser.ts`
  - [x] Парсинг # @featureN перед Scenario
  - [x] Извлечение имени сценария

- [x] Реализовать matcher.ts @feature5 @feature6 @feature7 → `extensions/specs-workflow/tools/specs-validator/matcher.ts`
  - [x] Логика NOT_COVERED
  - [x] Логика ORPHAN
  - [x] Логика COVERED
  - [x] Type-export `MatchStatus = 'COVERED' | 'NOT_COVERED' | 'ORPHAN'`

- [x] Реализовать reporter.ts @feature5 @feature6 @feature7 → `extensions/specs-workflow/tools/specs-validator/reporter.ts`
  - [x] Генерация validation-report.md
  - [x] Вывод предупреждений в stdout

## Phase 3: Hook Integration

- [x] Создать validate-specs.ts @feature1 @feature2 @feature8 @feature9 → `extensions/specs-workflow/tools/specs-validator/validate-specs.ts` (379 строк)
  - [x] Чтение JSON из stdin
  - [x] Поиск .specs/ папки
  - [x] Проверка .specs-validator.yaml
  - [x] Оркестрация валидации
  - [x] Обработка ошибок

- [x] Обновить extension.json @feature1 @feature2
  - [x] Добавить hooks.claude.UserPromptSubmit → `npx tsx .dev-pomogator/tools/specs-validator/validate-specs.ts`
  - [~] Cursor `beforeSubmitPrompt` — не добавлен в этой итерации; cursor-плагин не active surface для основного UX

- [x] ~~Создать specs-validation.mdc~~ — реализовано иначе: документация перенесена в `.claude/skills/create-spec/references/specs-validation.md` (часть `create-spec` skill бандла), что cleaner чем отдельный `.mdc` для cursor — единый источник правды.

## Phase 4: Installer

- [x] ~~Обновить ~~`src/installer/memory.ts`~~ (removed in v2 — no canonical replacement)~~ — реализовано иначе: установка идёт через generic `toolFiles` flow в `extension.json` (20 файлов перечислены, installer копирует все). Dedicated `copyValidateSpecsScript()` не нужна — переиспользует существующий generic pipeline.

## Phase 5: Testing

- [x] Создать PLUGIN005_specs-validator.feature → `tests/features/plugins/specs-workflow/PLUGIN005_specs-validator.feature`
  - [x] 11 BDD сценариев (расширены с изначально планируемых 9)

- [x] Создать specs-validator.test.ts → `tests/e2e/specs-validator.test.ts`
  - [x] 10 describe/it блоков
  - [x] Helper createCompleteSpec()

## Status Legend
- `[x]` — реализовано
- `[~]` — частично / умышленно отложено
- ~~strikethrough~~ — реализовано через альтернативный путь (см. inline объяснение)
