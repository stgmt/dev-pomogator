# Functional Requirements

## FR-1: Регистрация хука Cursor @feature1

Система ДОЛЖНА регистрировать validate-specs.ts в hooks.json 
для триггера beforeSubmitPrompt при установке specs-workflow для Cursor.

→ [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-cursor-hook-в-hooksjson-feature1)

## FR-2: Регистрация хука Claude @feature2

Система ДОЛЖНА регистрировать validate-specs.ts в settings.json 
для триггера UserPromptSubmit при установке specs-workflow для Claude.

→ [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-claude-hook-в-settings-feature2)

## FR-3: Активация для полных фич @feature3

Система ДОЛЖНА активировать валидацию ТОЛЬКО для директорий в .specs/
которые содержат ВСЕ 12 обязательных MD файлов И хотя бы 1 .feature файл.

→ [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3-полная-фича-13-файлов-feature3)

## FR-4: Пропуск неполных фич @feature4

Система ДОЛЖНА пропускать валидацию для директорий в .specs/
которые НЕ содержат полный набор файлов (< 13).

→ [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4-неполная-фича-пропускается-feature4)

## FR-5: Детекция NOT_COVERED @feature5

Система ДОЛЖНА обнаруживать теги @featureN в MD файлах (FR.md, AC.md, UC.md),
которые НЕ имеют соответствующего # @featureN в .feature файле.

→ [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5-notcovered-в-отчёте-feature5)

## FR-6: Детекция ORPHAN @feature6

Система ДОЛЖНА обнаруживать теги # @featureN в .feature файлах,
которые НЕ имеют соответствующего @featureN в MD файлах.

→ [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6-orphan-в-отчёте-feature6)

## FR-7: Валидация полностью связанных @feature7

Система ДОЛЖНА помечать как COVERED теги @featureN,
которые присутствуют И в MD файлах И в .feature файле.

→ [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7-covered-в-отчёте-feature7)

## FR-8: Пропуск при отсутствии .specs/ @feature8

Система ДОЛЖНА тихо завершаться без ошибок и предупреждений,
если папка .specs/ НЕ существует в workspace.

→ [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8-тихий-выход-без-specs-feature8)

## FR-9: Отключение через конфиг @feature9

Система ДОЛЖНА пропускать валидацию если файл .specs-validator.yaml
содержит enabled: false.

→ [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9-конфиг-отключает-валидацию-feature9)

## FR-10: Парсер test case IDs @feature10

Система ДОЛЖНА извлекать test case ID-ы из `.test.ts` файлов
(`describe('CODE_NN ...')` / `it('CODE_NN: ...')`) и ассоциировать
`@featureN` комментарии с соответствующими test cases.

→ [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10-парсер-test-case-ids-feature10)

## FR-11: Test↔Feature alignment @feature11

Система ДОЛЖНА детектить рассинхрон между test case ID-ами и BDD scenario
ID-ами: если test содержит `CODE_NN` но соответствующего `Scenario: CODE_NN`
нет в .feature (или наоборот) — это `MISALIGNED` отчёте.

→ [AC-11](ACCEPTANCE_CRITERIA.md#ac-11-fr-11-testfeature-alignment-feature11)
