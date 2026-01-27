# Functional Requirements

## FR-1: Регистрация хука Cursor @feature1

Система ДОЛЖНА регистрировать validate-specs.ts в hooks.json 
для триггера beforeSubmitPrompt при установке specs-workflow для Cursor.

## FR-2: Регистрация хука Claude @feature2

Система ДОЛЖНА регистрировать validate-specs.ts в settings.json 
для триггера UserPromptSubmit при установке specs-workflow для Claude.

## FR-3: Активация для полных фич @feature3

Система ДОЛЖНА активировать валидацию ТОЛЬКО для директорий в .specs/
которые содержат ВСЕ 12 обязательных MD файлов И хотя бы 1 .feature файл.

## FR-4: Пропуск неполных фич @feature4

Система ДОЛЖНА пропускать валидацию для директорий в .specs/
которые НЕ содержат полный набор файлов (< 13).

## FR-5: Детекция NOT_COVERED @feature5

Система ДОЛЖНА обнаруживать теги @featureN в MD файлах (FR.md, AC.md, UC.md),
которые НЕ имеют соответствующего # @featureN в .feature файле.

## FR-6: Детекция ORPHAN @feature6

Система ДОЛЖНА обнаруживать теги # @featureN в .feature файлах,
которые НЕ имеют соответствующего @featureN в MD файлах.

## FR-7: Валидация полностью связанных @feature7

Система ДОЛЖНА помечать как COVERED теги @featureN,
которые присутствуют И в MD файлах И в .feature файле.

## FR-8: Пропуск при отсутствии .specs/ @feature8

Система ДОЛЖНА тихо завершаться без ошибок и предупреждений,
если папка .specs/ НЕ существует в workspace.

## FR-9: Отключение через конфиг @feature9

Система ДОЛЖНА пропускать валидацию если файл .specs-validator.yaml
содержит enabled: false.
