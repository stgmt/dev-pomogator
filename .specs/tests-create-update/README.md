# Tests Create Update

Skill `/tests-create-update` учит AI агента (Claude) создавать/обновлять тесты без 7 анти-паттернов, найденных в аудите 258+ проблем в двух проектах (TypeScript + C#).

## Evidence base

- **dev-pomogator**: 123 проблемы — source scan, pathExists-only, weak assertions, silent skip
- **ZohoIntegrationClient.Tests**: 135+ проблем — status-only, unsafe GetProperty, empty catch

## Ключевые компоненты

- **Assertion Selection Table**: BAD vs GOOD per language per check type
- **7 anti-pattern rules**: детекция при compliance check
- **Compliance report**: 7 rules × PASS/FAIL с line references

## Навигация

| Файл | Описание |
|------|----------|
| [USER_STORIES.md](USER_STORIES.md) | 3 user stories |
| [USE_CASES.md](USE_CASES.md) | 3 use cases (TS create, TS update, C# create) |
| [RESEARCH.md](RESEARCH.md) | Audit results (258+ issues), Anthropic skill docs, GitHub examples |
| [FR.md](FR.md) | 7 functional requirements с anti-pattern tables |
| [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) | 7 AC per FR |
| [NFR.md](NFR.md) | Performance, Reliability, Usability |
| [DESIGN.md](DESIGN.md) | Architecture, Assertion Selection Table, Reuse |
| [REQUIREMENTS.md](REQUIREMENTS.md) | Traceability matrix |
| [TASKS.md](TASKS.md) | TDD phases |
| [FILE_CHANGES.md](FILE_CHANGES.md) | 4 files |
| [CHANGELOG.md](CHANGELOG.md) | Change log |
| [tests-create-update.feature](tests-create-update.feature) | 11 BDD scenarios |
