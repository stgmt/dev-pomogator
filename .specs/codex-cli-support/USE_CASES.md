# Use Cases

## UC-1: Fresh project install

Разработчик запускает установку `dev-pomogator` с таргетом `codex` в чистом git-репозитории, где ещё нет `.codex/`, `AGENTS.md` и `.agents/skills/`.

- Инсталлер распознаёт платформу `codex`
- Инсталлер создаёт только project-level артефакты `Codex`
- В репозитории появляются `.codex/config.toml`, `.codex/hooks.json`, `AGENTS.md`, `.agents/skills/` и `.dev-pomogator/tools/`
- Инсталлер не пишет ничего в `~/.codex/*`

## UC-2: Safe install over existing user artifacts

Разработчик запускает установку `codex`, но в репозитории уже есть `AGENTS.md`, `CLAUDE.md`, `.codex/config.toml`, `.codex/hooks.json` и/или кастомные `.agents/skills/`.

- Инсталлер обнаруживает существующие project-level файлы
- Перед любой managed-записью создаются backup-копии
- Пользователь получает warning о конфликте и предложение merge
- Пользовательские файлы не теряются и не перетираются silently

## UC-3: Managed reinstall and update

Разработчик повторно запускает установку или автообновление `dev-pomogator` после изменения manifests или upstream content.

- Апдейтер обновляет только managed Codex артефакты
- Если managed-файл был изменён пользователем, он бэкапится перед обновлением
- Устаревшие managed-файлы удаляются без затрагивания unrelated user files
- Hook, skills, tools и `.codex/*` синхронизируются как единый набор

## UC-4: Lifecycle extension parity

Разработчик использует в `Codex` расширения, которые в `Claude`/`Cursor` зависят от lifecycle hooks.

- `SessionStart` и `Stop` hooks materialize в `.codex/hooks.json`
- Для расширений, которым недостаточно только двух hooks, design назначает Codex-native parity surface: skill, `AGENTS.md`, `codex exec`, app automation или GitHub Action
- Ни одно расширение из support matrix не пропускается silently

## UC-5: Windows bash/sh bootstrap

Разработчик на Windows выбирает таргет `codex` и запускает bootstrap через `bash/sh`-ветку.

- Bootstrap route для `Codex` уходит в bash/sh path
- Установка корректно доходит до installer logic для платформы `codex`
- Поведение документировано в `README` и не конфликтует с существующими путями `Cursor`/`Claude`

