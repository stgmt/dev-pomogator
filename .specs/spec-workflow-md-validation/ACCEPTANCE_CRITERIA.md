# Acceptance Criteria

## AC-1 (FR-1): Cursor hook в hooks.json @feature1

→ [FR-1](FR.md#fr-1-регистрация-хука-cursor-feature1)

WHEN dev-pomogator устанавливается с флагом --cursor
AND specs-workflow extension включён
THEN система SHALL добавить команду с validate-specs.ts 
     в hooks.beforeSubmitPrompt массив в ~/.cursor/hooks/hooks.json

## AC-2 (FR-2): Claude hook в settings @feature2

→ [FR-2](FR.md#fr-2-регистрация-хука-claude-feature2)

WHEN dev-pomogator устанавливается с флагом --claude
AND specs-workflow extension включён  
THEN система SHALL добавить UserPromptSubmit hook
     в .claude/settings.json в project directory

## AC-3 (FR-3): Полная фича = 13 файлов @feature3

→ [FR-3](FR.md#fr-3-активация-для-полных-фич-feature3)

IF директория .specs/{name}/ содержит:
  - ВСЕ 12 файлов: ACCEPTANCE_CRITERIA.md, CHANGELOG.md, DESIGN.md, 
    FILE_CHANGES.md, FR.md, NFR.md, README.md, REQUIREMENTS.md,
    RESEARCH.md, TASKS.md, USE_CASES.md, USER_STORIES.md
  - И хотя бы один *.feature файл
THEN система SHALL считать эту директорию "полной фичей"
AND система SHALL запустить валидацию для неё

## AC-4 (FR-4): Неполная фича пропускается @feature4

→ [FR-4](FR.md#fr-4-пропуск-неполных-фич-feature4)

IF директория .specs/{name}/ НЕ содержит всех 13 обязательных файлов
THEN система SHALL пропустить эту директорию
AND система SHALL НЕ создавать validation-report.md в ней

## AC-5 (FR-5): NOT_COVERED в отчёте @feature5

→ [FR-5](FR.md#fr-5-детекция-notcovered-feature5)

WHEN @featureN тег найден в FR.md, ACCEPTANCE_CRITERIA.md или USE_CASES.md
AND этот @featureN НЕ найден в .feature файле (как # @featureN)
THEN система SHALL добавить запись в validation-report.md:
  - Status: NOT_COVERED
  - Source: путь к MD файлу и номер строки
  - Action: рекомендация добавить # @featureN в .feature

## AC-6 (FR-6): ORPHAN в отчёте @feature6

→ [FR-6](FR.md#fr-6-детекция-orphan-feature6)

WHEN # @featureN тег найден в .feature файле
AND этот @featureN НЕ найден ни в одном MD файле
THEN система SHALL добавить запись в validation-report.md:
  - Status: ORPHAN
  - Source: путь к .feature файлу и номер строки
  - Action: рекомендация добавить @featureN в FR.md/ACCEPTANCE_CRITERIA.md

## AC-7 (FR-7): COVERED в отчёте @feature7

→ [FR-7](FR.md#fr-7-валидация-полностью-связанных-feature7)

WHEN @featureN тег найден И в MD файле И в .feature файле
THEN система SHALL добавить запись в validation-report.md:
  - Status: COVERED
  - Mapping: FR-N ↔ Scenario name

## AC-8 (FR-8): Тихий выход без .specs/ @feature8

→ [FR-8](FR.md#fr-8-пропуск-при-отсутствии-specs-feature8)

IF папка .specs/ НЕ существует в workspace_roots
THEN система SHALL завершиться с exit code 0
AND система SHALL НЕ выводить ничего в stdout/stderr

## AC-9 (FR-9): Конфиг отключает валидацию @feature9

→ [FR-9](FR.md#fr-9-отключение-через-конфиг-feature9)

IF файл .specs-validator.yaml существует
AND файл содержит "enabled: false"
THEN система SHALL пропустить валидацию
AND система SHALL НЕ создавать validation-report.md

## AC-10 (FR-10): Парсер test case IDs @feature10

→ [FR-10](FR.md#fr-10-парсер-test-case-ids-feature10)

WHEN parser получает на вход `.test.ts` файл
THEN parseTestFile SHALL извлечь все `CODE_NN` идентификаторы
     из `describe(...)` и `it(...)` строк
AND каждый предшествующий `// @featureN` комментарий SHALL быть
     ассоциирован с следующим за ним test case

## AC-11 (FR-11): Test↔Feature alignment @feature11

→ [FR-11](FR.md#fr-11-testfeature-alignment-feature11)

WHEN test case с `CODE_NN` есть в `.test.ts`
AND `Scenario: CODE_NN ...` отсутствует в соответствующем `.feature`
THEN matchTestFeature SHALL вернуть status `MISALIGNED`
AND validation-report SHALL ссылаться на оба файла с указанием расхождения
