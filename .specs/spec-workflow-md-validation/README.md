# Specs Validation Hook

## Overview

Хук для автоматической валидации покрытия требований BDD сценариями. Работает на каждый промпт в Cursor (beforeSubmitPrompt) и Claude (UserPromptSubmit).

## Features

- Автоматическая активация при наличии полных фич в `.specs/`
- Кросс-ссылки через теги `@featureN`
- Генерация отчёта `validation-report.md`
- Предупреждения о непокрытых требованиях

## Quick Links

- [User Stories](USER_STORIES.md)
- [Use Cases](USE_CASES.md)
- [Functional Requirements](FR.md)
- [Acceptance Criteria](ACCEPTANCE_CRITERIA.md)
- [Design](DESIGN.md)
- [Tasks](TASKS.md)

## Status

**Released 0.1.0 — 2026-05-23.** See [CHANGELOG.md](CHANGELOG.md).

| Phase | Status |
|-------|--------|
| Discovery | Complete |
| Requirements | Complete |
| Implementation | Complete |
| Testing | Complete (10 e2e + 11 BDD scenarios) |
