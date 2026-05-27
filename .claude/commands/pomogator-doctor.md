---
description: "Диагностика окружения dev-pomogator: Node/Git/Bun/Python/MCP/hooks/env vars с предложением переустановки"
allowed-tools: ["Bash"]
argument-hint: "[--json | --extension=<name>]"
---

# /pomogator-doctor

Запускает диагностическую команду `dev-pomogator --doctor`, которая проверяет 17 аспектов окружения после `git clone`:

- 🟢 Self-sufficient (Node, Git, `~/.dev-pomogator/` структура, hooks registry, version match, managed gitignore)
- 🟡 Needs env vars (`AUTO_COMMIT_API_KEY` и другие required envRequirements в `.env` или `.claude/settings.local.json → env`)
- 🔴 Needs external deps (Bun, Python + packages, Docker, MCP servers — с Full probe)

Для каждой проверки — severity (✓/⚠/✗), reinstallable flag и actionable hint.

При обнаружении проблем, решаемых переустановкой (missing plugin cache, stale hooks, version mismatch), команда предложит запустить `/plugin install dev-pomogator@stgmt --force` или migration script (`tools/migrate-v1-to-v2/migrate-v1-to-v2.ts --global`) если v1 install detected. Проблемы вроде отсутствующего API ключа или Bun подсвечиваются отдельно — переустановка их не починит.

## Инструкция для агента

1. Запусти doctor engine: `npx tsx .claude/skills/pomogator-doctor/scripts/engine/index.ts` через Bash
2. Если пользователь передал `--json` — передай дальше (`npx tsx ... --json`) и покажи JSON как есть
3. Если передал `--extension=<name>` — передай дальше для фильтрации checks только по конкретному extension (deprecated после canonical refactor; сохранено для backward compat)
4. Парс output: severity-grouped report (🟢 self-sufficient / 🟡 needs env vars / 🔴 needs external deps)
5. Если detected v1 install (legacy `~/.dev-pomogator/` exists) — предложи `npx tsx tools/migrate-v1-to-v2/migrate-v1-to-v2.ts --global` для cleanup
6. Если detected canonical install issues — предложи `/plugin install dev-pomogator@stgmt --force` или `/reload-plugins`
7. Exit code 0 (ok) / 1 (warnings) / 2 (critical) — сообщи пользователю итог

## Связанные документы

- Полная спецификация: `.specs/pomogator-doctor/`
- FR/AC: `.specs/pomogator-doctor/FR.md`, `.specs/pomogator-doctor/ACCEPTANCE_CRITERIA.md`
- Skill: `.claude/skills/pomogator-doctor/SKILL.md`
- Engine: `.claude/skills/pomogator-doctor/scripts/engine/`

## Migration note (v2.0)

В v1 invoked через `dev-pomogator --doctor` CLI binary. После canonical refactor v2.0 CLI binary deprecated; используется engine directly через `npx tsx <engine>/index.ts` или skill hook (`scripts/doctor-hook.ts` registered как SessionStart hook в plugin's `.claude-plugin/hooks.json`).
