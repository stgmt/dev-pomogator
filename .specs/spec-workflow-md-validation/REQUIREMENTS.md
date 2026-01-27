# Requirements Index

## Functional Requirements

| ID | Название | @featureN | Статус |
|----|----------|-----------|--------|
| [FR-1](FR.md#fr-1-регистрация-хука-cursor-feature1) | Регистрация хука Cursor | @feature1 | Draft |
| [FR-2](FR.md#fr-2-регистрация-хука-claude-feature2) | Регистрация хука Claude | @feature2 | Draft |
| [FR-3](FR.md#fr-3-активация-для-полных-фич-feature3) | Активация для полных фич | @feature3 | Draft |
| [FR-4](FR.md#fr-4-пропуск-неполных-фич-feature4) | Пропуск неполных фич | @feature4 | Draft |
| [FR-5](FR.md#fr-5-детекция-not_covered-feature5) | Детекция NOT_COVERED | @feature5 | Draft |
| [FR-6](FR.md#fr-6-детекция-orphan-feature6) | Детекция ORPHAN | @feature6 | Draft |
| [FR-7](FR.md#fr-7-валидация-полностью-связанных-feature7) | Валидация COVERED | @feature7 | Draft |
| [FR-8](FR.md#fr-8-пропуск-при-отсутствии-specs-feature8) | Пропуск без .specs/ | @feature8 | Draft |
| [FR-9](FR.md#fr-9-отключение-через-конфиг-feature9) | Отключение через конфиг | @feature9 | Draft |

## Acceptance Criteria

| ID | FR | @featureN | Формат |
|----|----|-----------| -------|
| [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-cursor-hook-в-hooksjson-feature1) | FR-1 | @feature1 | WHEN...THEN |
| [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-claude-hook-в-settings-feature2) | FR-2 | @feature2 | WHEN...THEN |
| [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3-полная-фича--13-файлов-feature3) | FR-3 | @feature3 | IF...THEN |
| [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4-неполная-фича-пропускается-feature4) | FR-4 | @feature4 | IF...THEN |
| [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5-not_covered-в-отчёте-feature5) | FR-5 | @feature5 | WHEN...THEN |
| [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6-orphan-в-отчёте-feature6) | FR-6 | @feature6 | WHEN...THEN |
| [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7-covered-в-отчёте-feature7) | FR-7 | @feature7 | WHEN...THEN |
| [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8-тихий-выход-без-specs-feature8) | FR-8 | @feature8 | IF...THEN |
| [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9-конфиг-отключает-валидацию-feature9) | FR-9 | @feature9 | IF...THEN |

## Non-Functional Requirements

| ID | Категория | Описание |
|----|-----------|----------|
| [NFR-1](NFR.md#nfr-1-время-выполнения-хука) | Performance | < 500ms |
| [NFR-2](NFR.md#nfr-2-минимальное-потребление-памяти) | Performance | Стриминг |
| [NFR-3](NFR.md#nfr-3-fail-safe-выполнение) | Reliability | Не блокирует |
| [NFR-4](NFR.md#nfr-4-устойчивость-к-битым-файлам) | Reliability | Пропуск ошибок |
| [NFR-5](NFR.md#nfr-5-понятные-сообщения) | Usability | Русский язык |
| [NFR-6](NFR.md#nfr-6-формат-отчёта) | Usability | Valid MD |
| [NFR-7](NFR.md#nfr-7-без-выполнения-стороннего-кода) | Security | No exec |
| [NFR-8](NFR.md#nfr-8-кросс-платформенность) | Compatibility | Win/Mac/Linux |
| [NFR-9](NFR.md#nfr-9-совместимость-с-bun) | Compatibility | Bun 1.0+ |
