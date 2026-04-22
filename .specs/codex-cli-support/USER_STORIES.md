# User Stories

## US-1: First-class Codex platform in a trusted repo @feature1

Как разработчик, я хочу устанавливать `dev-pomogator` в `Codex` как отдельную платформу, чтобы repo-local `.codex/*`, `AGENTS.md` и `.agents/skills` работали без притворства, что это просто ещё один режим `Claude` или `Cursor`.

## US-2: Безопасное coexistence project и global Codex layers @feature3

Как разработчик, я хочу чтобы мои существующие `AGENTS.md`, `CLAUDE.md`, `.codex/config.toml`, `.codex/hooks.json`, `.agents/skills/*` и глобальные `~/.codex/*` не ломались при установке, чтобы не потерять свои проектные настройки и кастомизации.

## US-3: Version-aware hooks и deterministic dispatch @feature4

Как разработчик, я хочу чтобы hook-based автоматизация в `Codex` учитывала реальную версию CLI и ограничения конкретных hook events, чтобы parity не строилась на устаревших предположениях и race conditions.

## US-4: Честная parity через AGENTS, skills, MCP и partial support @feature9

Как разработчик, я хочу видеть для каждого расширения, оно полностью поддержано, частично поддержано или исключено, чтобы не принимать wishful mapping за реальную совместимость.

## US-5: Windows native-first support с WSL fallback @feature10

Как разработчик на Windows, я хочу чтобы документация и install flow для `Codex` соответствовали текущим official docs: native Windows по умолчанию, WSL2 как fallback, без устаревшей привязки к `bash/sh only`.
