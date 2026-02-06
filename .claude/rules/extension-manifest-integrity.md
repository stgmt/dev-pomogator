# Extension Manifest Integrity

Манифест — единственный источник истины для апдейтера. Любое изменение в расширении должно отражаться в `extension.json`.

## Правильно

- Обновлять `files`, `rules`, `tools`, `toolFiles`, `hooks` при изменениях
- Перечислять **все** файлы инструмента в `toolFiles` (включая подпапки)
- В `toolFiles` включать docs/templates/fixtures/plan-файлы (`*.md`, `*.template`, `*.plan.md`)
- Если меняются команды/пути — обновить hooks и версию
- Синхронизировать `extensions/<name>/<platform>/commands/` и `.cursor/commands`

## Неправильно

- Править tool-скрипты без `toolFiles`
- Оставлять файлы инструмента вне `toolFiles` (они не обновятся и не удалятся)
- Добавлять rule без секции `rules`
- Править только `.cursor/commands` без обновления источника расширения

## Чеклист

- [ ] Команды и rules перечислены в `extension.json`
- [ ] `toolFiles` покрывает все файлы инструмента
- [ ] `toolFiles` включает docs/templates/fixtures/plan-файлы (`*.md`, `*.template`, `*.plan.md`)
- [ ] hooks и версия обновлены при изменении команд
