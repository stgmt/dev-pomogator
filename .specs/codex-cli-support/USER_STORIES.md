# User Stories

## US-1: Project-level поддержка Codex CLI @feature1

Как разработчик, я хочу установить `dev-pomogator` для `Codex CLI` в текущий репозиторий, чтобы получать те же рабочие процессы и ограничения, что уже доступны в `Cursor` и `Claude Code`.

## US-2: Безопасное сохранение пользовательских Codex артефактов @feature3

Как разработчик, я хочу чтобы мои существующие `AGENTS.md`, `CLAUDE.md`, `.codex/config.toml`, `.codex/hooks.json` и `.agents/skills/*` не перетирались при установке, чтобы не потерять свои проектные настройки и кастомизации.

## US-3: Parity расширений без statusline @feature8

Как разработчик, я хочу чтобы все текущие расширения `dev-pomogator`, кроме `test-statusline`, были доступны и в `Codex`, чтобы не терять знакомые workflow при переходе на новую платформу.

## US-4: Hook-driven автоматизация в Codex @feature4

Как разработчик, я хочу использовать `Codex hooks` (`SessionStart` и `Stop`) для lifecycle-автоматизации, чтобы `auto-commit`, `prompt-suggest`, health-check и другие hook-driven расширения работали и в `Codex`.

## US-5: Windows bootstrap через bash/sh @feature9

Как разработчик на Windows, я хочу запускать bootstrap для `Codex` через `bash/sh` path, чтобы установка вела себя предсказуемо и соответствовала выбранному workflow для этой платформы.

