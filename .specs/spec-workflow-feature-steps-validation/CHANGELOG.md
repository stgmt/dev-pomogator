# Changelog

Все изменения в спецификации документируются здесь.

## [0.1.0] — 2026-05-23

> Shipped via `extensions/specs-workflow/tools/steps-validator/` (9 files: validate-steps.ts entry, detector.ts auto-lang, parsers/{typescript,python,csharp}-parser.ts, analyzer.ts assertion-detect, reporter.ts md+stdout, config.ts YAML, logger.ts) + 33 e2e tests in `tests/e2e/steps-validator.test.ts` on 3-language fixtures (`tests/fixtures/steps-validator/{csharp,python,typescript}/`).
>
> **Hook wiring added in this closeout commit:** `Stop → validate-steps.ts` registered in `extensions/specs-workflow/extension.json` (plugin bumped v1.19.0 → v1.20.0). Until now the validator existed but never auto-ran — only could be invoked manually. With the hook, the validator fires on Stop event (per DESIGN.md "Stop Event" diagram) and silently no-ops if no step definitions are detected (FR-9 + FR-10).
>
> Audit-spec: 0 ERRORS / 0 WARNINGS.

## [Unreleased]

### Added
- Начальная версия спецификации
- RESEARCH.md — исследование форматов step definitions
- FR.md — 10 функциональных требований
- NFR.md — 8 нефункциональных требований
- USER_STORIES.md — 5 user stories
- USE_CASES.md — 7 use cases
- ACCEPTANCE_CRITERIA.md — 13 критериев приёмки в EARS формате
- DESIGN.md — архитектура валидатора
- FILE_CHANGES.md — список изменяемых файлов
- TASKS.md — 18 задач реализации
- README.md — обзор фичи

### Фичи в этой версии
- Поддержка TypeScript (Cucumber.js)
- Поддержка Python (Behave/pytest-bdd)
- Поддержка C# (SpecFlow/Reqnroll)
- Тестовые фикстуры для каждого языка
- Хук на Stop событие (Cursor/Claude)
- Генерация Markdown отчёта
- Конфигурация через YAML
- Opt-out активация

---

## Версионирование

Формат: `MAJOR.MINOR.PATCH`

- **MAJOR** — breaking changes в требованиях
- **MINOR** — новые требования
- **PATCH** — уточнения и исправления
