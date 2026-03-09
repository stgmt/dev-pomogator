# Prompt-Suggest Extension (PLUGIN010)

Генерация подсказки "что набрать дальше" после каждой сессии Claude Code через Haiku LLM. Подсказка отображается с 💡 emoji через `systemMessage`, активируется вводом `+`.

## Ключевые идеи

- **User perspective**: предсказывать что ЮЗЕР набрал бы (v2 промпт Anthropic)
- **💡 systemMessage**: подсказка видна сразу после остановки агента
- **"+" активация**: ввод `+` → подсказка инжектится через `additionalContext`
- **Silence option**: если неочевидно → не предлагать ничего
- **Fail-open**: exit(0) на любую ошибку

## Где лежит реализация

- **Extension source**: `extensions/prompt-suggest/`
- **Installed tools**: `.dev-pomogator/tools/prompt-suggest/`
- **State file**: `~/.claude/prompt-suggestion.json`
- **Manifest**: `extensions/prompt-suggest/extension.json`

## Навигация

| Файл | Содержимое |
|------|------------|
| [USER_STORIES.md](USER_STORIES.md) | 3 user stories (suggestion, visibility, activation) |
| [USE_CASES.md](USE_CASES.md) | 7 use cases (UC-1..UC-7) |
| [RESEARCH.md](RESEARCH.md) | v2 prompt, hooks API, systemMessage, project context |
| [REQUIREMENTS.md](REQUIREMENTS.md) | Traceability matrix (FR/AC/BDD) |
| [FR.md](FR.md) | 9 functional requirements (FR-1..FR-9) |
| [NFR.md](NFR.md) | 11 non-functional requirements (Performance, Security, Reliability, Usability) |
| [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) | 9 acceptance criteria в EARS формате |
| [DESIGN.md](DESIGN.md) | Архитектура, компоненты, data flow, TypeScript interfaces |
| [FILE_CHANGES.md](FILE_CHANGES.md) | 6 файлов (5 create extension, 1 create test) |
| [TASKS.md](TASKS.md) | TDD phases (Phase 0 BDD, Phases 1-4) |
| [CHANGELOG.md](CHANGELOG.md) | Changelog |
| [prompt-suggest.feature](prompt-suggest.feature) | 12 BDD сценариев |

## Связанные правила

- `.claude/rules/atomic-config-save.md` — паттерн atomic write для state file
- `.claude/rules/extension-manifest-integrity.md` — manifest update rules
