# Cursor Dead Code Cleanup

Удаление ~505 строк мёртвого Cursor-кода из `src/installer/memory.ts` и `src/updater/index.ts`.

## Ключевые идеи

- Проект удалил поддержку Cursor, но dead code остался в memory.ts (~415 строк) и updater/index.ts (~90 строк)
- Shared функции (ensureClaudeMem chain) сохранены
- 6 BDD сценариев покрывают отсутствие dead code и regression

## Документация

| Файл | Описание |
|------|----------|
| [USER_STORIES.md](USER_STORIES.md) | 3 user stories |
| [USE_CASES.md](USE_CASES.md) | 3 use cases |
| [FR.md](FR.md) | 6 functional requirements |
| [NFR.md](NFR.md) | Reliability, Usability |
| [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) | 6 EARS criteria |
| [DESIGN.md](DESIGN.md) | Deletion plan, TEST_DATA_NONE |
| [TASKS.md](TASKS.md) | TDD task list |
| [cursor-dead-code-cleanup.feature](cursor-dead-code-cleanup.feature) | 6 BDD scenarios |
