# Extension Beta Flag

Optional `stability` field в extension.json позволяет пометить плагин как beta. Beta плагины видны в checkbox с пометкой "(BETA)", unchecked по умолчанию, и не устанавливаются при `--all`.

## Ключевые идеи

- `"stability": "beta"` в extension.json — backward compatible (undefined = stable)
- Interactive checkbox: beta = unchecked + "(BETA)" label
- `--all` исключает beta, `--all --include-beta` включает всё
- Updater не добавляет новые beta автоматически

## Где лежит реализация

- **Extension interface**: `src/installer/extensions.ts`
- **Installer UI**: `src/installer/index.ts`
- **CLI args**: `src/index.ts`

## Статистика

- 6 FR, 6 AC, 8 BDD scenarios

## Где читать дальше

- [USER_STORIES.md](USER_STORIES.md)
- [USE_CASES.md](USE_CASES.md)
- [RESEARCH.md](RESEARCH.md)
- [REQUIREMENTS.md](REQUIREMENTS.md)
- [FR.md](FR.md)
- [NFR.md](NFR.md)
- [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md)
- [DESIGN.md](DESIGN.md)
- [FILE_CHANGES.md](FILE_CHANGES.md)
- [TASKS.md](TASKS.md)
- [extension-beta-flag.feature](extension-beta-flag.feature)
