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

При обнаружении проблем, решаемых переустановкой (missing `~/.dev-pomogator/tools/`, stale hooks, version mismatch, broken plugin-loader), команда предложит запустить `npx dev-pomogator`. Проблемы вроде отсутствующего API ключа или Bun подсвечиваются отдельно — переустановка их не починит.

## Инструкция для агента

1. Запусти `dev-pomogator --doctor` через Bash
2. Если пользователь передал `--json` — передай дальше (`dev-pomogator --doctor --json`) и покажи JSON как есть
3. Если передал `--extension=<name>` — передай дальше для фильтрации checks только по конкретному extension
4. Если команда предложит переустановку и пользователь согласится, `dev-pomogator --doctor` сам спавнит `npx dev-pomogator` — Claude Code не нужно вмешиваться
5. Exit code 0 (ok) / 1 (warnings) / 2 (critical) — сообщи пользователю итог

## Связанные документы

- Полная спецификация: `.specs/pomogator-doctor/`
- FR/AC: `.specs/pomogator-doctor/FR.md`, `.specs/pomogator-doctor/ACCEPTANCE_CRITERIA.md`
