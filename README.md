# dev-pomogator

Плагин-система для **Claude Code**, которая устанавливает в проект командные стандарты, рабочие процессы, инструменты, скиллы и хуки.

**Что это даёт:**
- Единый формат планов, спецификаций и коммитов для всей команды
- Автокоммиты с LLM-генерацией сообщений при завершении работы агента
- Анализ сессий и автоматическое предложение правил для проекта
- Защита от типичных LLM-ошибок (лишние файлы в корне, пустые фолбеки)
- TUI/statusline мониторинг тестов, BDD/specs workflow, hooks-автоматизация
- Автообновления плагинов с защитой пользовательских изменений

> Cursor больше не поддерживается. Если ставили старую версию с `--cursor` — переустановите без флага.

## Быстрый старт

Запускайте из папки проекта (root определяется по git).

```bash
# Интерактивный выбор плагинов
npx github:stgmt/dev-pomogator --claude

# Все плагины разом (non-interactive)
npx github:stgmt/dev-pomogator --claude --all

# Конкретные плагины
npx github:stgmt/dev-pomogator --claude --plugins=suggest-rules,specs-workflow

# Статус и обновления
npx github:stgmt/dev-pomogator --status
npx github:stgmt/dev-pomogator --update

# Удаление из проекта
npx github:stgmt/dev-pomogator uninstall --project [--dry-run]
```

## Плагины

| Плагин | Назначение |
|--------|------------|
| `suggest-rules` | Анализ сессии, предложение правил; включает skill `/deep-insights` |
| `specs-workflow` | Управление спеками (фазы Discovery → Requirements → Finalization → Audit), валидаторы, BDD |
| `plan-pomogator` | Формат планов, шаблон, валидатор (9 секций + EARS + Acceptance) |
| `auto-commit` | Автокоммиты с LLM-генерацией сообщений (Stop hook) |
| `auto-simplify` | `/simplify` review кода + спеков + тестов на Stop |
| `forbid-root-artifacts` | Allowlist файлов в корне репозитория |
| `test-quality` | Контроль качества тестов (1:1 mapping test↔feature, no helper duplication) |
| `tui-test-runner` | Гибридный Python/Node TUI для запуска и мониторинга тестов |
| `test-statusline` | Статус-строка прогресса тестов в Claude Code |
| `context-menu` | Claude Code в Windows right-click меню (через Nilesoft Shell) |
| `bun-oom-guard` | Авто-патч Bun runner от OOM на Windows |
| `debug-screenshot` | Screenshot-driven verification UI/TUI |
| `docker-optimization` | Анализ Dockerfile/compose на возможности оптимизации |
| `devcontainer` | Готовый devcontainer для проектов |
| `personal-pomogator` | Персональная установка через `.claude/settings.local.json` + gitignore guard |
| `prompt-suggest` | Предложения промптов на основе контекста |
| `claude-mem-health` | Health-check для интеграции с claude-mem |
| `onboard-repo` | Phase 0 Repo Onboarding (AI-first артефакт + PreToolUse hook) для `/create-spec` workflow |

Подробнее: `extensions/*/README.md`.

## Что устанавливается

- `.claude/commands/` — slash-команды плагинов
- `.claude/rules/` — правила (always-apply и triggered)
- `.claude/skills/` — skills, доступные через `Skill` tool
- `.claude/settings.local.json` — личные хуки проекта (preserve user keys)
- `.dev-pomogator/tools/` — утилиты плагинов (генерится из `extensions/`, в `.gitignore`)
- `.gitignore` — managed marker block со всеми путями dev-pomogator

Глобально:
- `~/.claude/settings.json` — только SessionStart check-update hook
- `~/.dev-pomogator/config.json` — список установленных плагинов + SHA-256 хеши managed-файлов
- `~/.dev-pomogator/logs/dev-pomogator-YYYY-MM-DD.log`

## Конфигурация

`~/.dev-pomogator/config.json`:

```json
{
  "platforms": ["claude"],
  "autoUpdate": true,
  "cooldownHours": 24,
  "installedExtensions": [...]
}
```

## Автообновления

- Проверка релизов GitHub раз в 24 часа (SessionStart hook)
- Фоновые обновления, не блокируют сессию
- User-модификации managed-файлов бэкапятся в `.dev-pomogator/.user-overrides/` перед перезаписью
- Hooks обновляются через smart merge — пользовательские хуки не затрагиваются

## Diagnostic Doctor

Команда `/pomogator-doctor` (или `dev-pomogator --doctor`) проверяет окружение после clone:

- 🟢 **Self-sufficient**: Node, Git, `~/.dev-pomogator/` структура, hooks registry, version match, managed gitignore
- 🟡 **Needs env vars**: `AUTO_COMMIT_API_KEY` и другие required envRequirements (ищет в `.env` и `.claude/settings.local.json → env`)
- 🔴 **Needs external deps**: Bun, Python + pip packages, Docker, MCP servers (с Full probe — реальное подключение)

Examples:

```bash
# Interactive в терминале с chalk table
dev-pomogator --doctor

# CI mode: JSON к stdout, exit 0/1/2 по severity, env values redacted
dev-pomogator --doctor --json

# Только один extension
dev-pomogator --doctor --extension=claude-mem-health

# SessionStart hook запустит автоматически `dev-pomogator --doctor --quiet`
```

При обнаружении проблем, решаемых переустановкой (missing `~/.dev-pomogator/tools/`, stale hooks, version mismatch, broken plugin-loader), команда спросит "Run `npx dev-pomogator` now?" — и сама спавнит installer при согласии.

**Non-reinstallable проблемы** (missing API keys, binaries) переустановка НЕ починит — для них Doctor показывает actionable hints и ссылается на `.env.example`.

## Интеграции

- [claude-mem](https://github.com/thedotmack/claude-mem): трекинг сессий, контекст, суммаризация. LLM-токен можно взять на `aipomogator.ru`.

## Требования

- **Node.js** ≥ 18 (с npm)
- **Git**
- **Claude Code** CLI
- (опционально) **Docker** — для изолированных E2E тестов

## Разработка

```bash
npm install
npm run build           # tsc + bundle standalone check-update
npm run lint
npm test                # E2E через Docker (изолированно, безопасно)
npm run test:all        # E2E + TUI через Docker
```

## Лицензия

MIT
