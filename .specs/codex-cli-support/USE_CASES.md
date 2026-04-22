# Use Cases

## UC-1: Fresh install in a trusted project

Разработчик запускает установку `dev-pomogator` с таргетом `codex` в чистом trusted git-репозитории, где ещё нет `.codex/`, `AGENTS.md` и `.agents/skills/`.

- Инсталлер распознаёт платформу `codex`
- Инсталлер создаёт только project-level Codex артефакты
- В репозитории появляются `.codex/config.toml`, `.codex/hooks.json`, `AGENTS.md`, `.agents/skills/` и `.dev-pomogator/tools/`
- Инсталлер не пишет ничего в `~/.codex/*`
- Project-level `.codex/config.toml` начинает участвовать в реальной конфигурации Codex, потому что проект trusted

## UC-2: Safe install over existing project artifacts and global Codex layers

Разработчик запускает установку `codex`, но в репозитории уже есть `AGENTS.md`, `CLAUDE.md`, `.codex/config.toml`, `.codex/hooks.json` и/или кастомные `.agents/skills/`.

- Инсталлер обнаруживает существующие project-level файлы
- Перед любой managed-записью создаются backup-копии
- Пользователь получает warning о конфликте и предложение merge
- Пользовательские файлы не теряются и не перетираются silently
- Если в `~/.codex/` уже есть user-level config/hooks, инсталлер не изменяет их и не предполагает, что project layer их заменит
- Пользователь получает пояснение, что Codex складывает hooks additively между `~/.codex` и `<repo>/.codex`

## UC-3: Managed reinstall and update

Разработчик повторно запускает установку или автообновление `dev-pomogator` после изменения manifests или upstream content.

- Апдейтер обновляет только managed Codex артефакты
- Если managed-файл был изменён пользователем, он бэкапится перед обновлением
- Устаревшие managed-файлы удаляются без затрагивания unrelated user files
- Hook dispatcher, skills, tools и `.codex/*` синхронизируются как единый managed набор

## UC-4: Version-aware lifecycle parity with deterministic dispatch

Разработчик использует в `Codex` расширения, которые в `Claude`/`Cursor` зависят от lifecycle hooks.

- Инсталлер определяет реальный hook surface по версии Codex: `0.114.0+`, `0.116.0+`, `0.117.0+`, `0.120.0+`
- Managed `.codex/hooks.json` содержит не россыпь независимых hooks по расширениям, а единый dispatcher per event там, где несколько extension делят один event
- Для расширений, которым недостаточно доступных hooks, design назначает другой Codex-native parity surface: `AGENTS.md`, skill, MCP, `codex exec`, notify/tui notifications, app automation или GitHub Action
- Ни одно расширение из support matrix не пропускается silently: у каждого есть `supported`, `partial` или `excluded`

## UC-5: Windows native-first strategy with WSL fallback

Разработчик на Windows использует `Codex` в native Windows sandbox или в WSL2, в зависимости от workflow и capability gate.

- Universal installer умеет распознать таргет `codex`
- Документация рекомендует native Windows sandbox по умолчанию и описывает WSL2 как fallback для Linux-native workflows
- Hook behavior на Windows version-gated и документирован без устаревшего предположения `bash/sh only`
- Поведение не конфликтует с существующими путями `Cursor`/`Claude`
