# dev-pomogator

Установщик и менеджер команд, правил, инструментов и хуков для Cursor и Claude Code.
Помогает быстро включить командные стандарты и рабочие процессы в проекте.

## Быстрый старт

Запускайте из папки проекта (root определяется по git).

### Cursor

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/stgmt/dev-pomogator/main/install.ps1 | iex
```

**Linux/macOS:**
```bash
curl -fsSL https://raw.githubusercontent.com/stgmt/dev-pomogator/main/install.sh | bash
```

### Claude Code

**Windows (PowerShell):**
```powershell
$env:TARGET="claude"; irm https://raw.githubusercontent.com/stgmt/dev-pomogator/main/install.ps1 | iex
```

**Linux/macOS:**
```bash
curl -fsSL https://raw.githubusercontent.com/stgmt/dev-pomogator/main/install.sh | TARGET=claude bash
```

## CLI

**Интерактивно:**
```bash
npx dev-pomogator
npx dev-pomogator --cursor
npx dev-pomogator --claude
```

**Неинтерактивно:**
```bash
npx dev-pomogator --cursor --plugins=suggest-rules,specs-workflow
npx dev-pomogator --claude --all
```

**Сервисные команды:**
```bash
npx dev-pomogator --status
npx dev-pomogator --update
```

## Плагины

| Плагин | Назначение | Команда в чате |
|--------|------------|----------------|
| `suggest-rules` | Анализирует сессию и предлагает правила для проекта | `/suggest-rules` |
| `specs-workflow` | Управление спеками (3 фазы) + валидаторы | `/create-spec <name>` |
| `plan-pomogator` | Формат планов, шаблон и валидатор | — |
| `forbid-root-artifacts` | Антигаллюцинационная защита: allowlist файлов в корне репозитория | `/configure-root-artifacts` |

Идея `forbid-root-artifacts` — защитный барьер от случайных root-артефактов, которые LLM-агенты могут создавать «по инерции».

Подробнее:
- `extensions/specs-workflow/README.md`
- `extensions/plan-pomogator/README.md`
- `extensions/forbid-root-artifacts/README.md`

## Что устанавливается

Состав зависит от выбранных плагинов. Ниже — типовые места установки.

### В проект (Cursor)

- `.cursor/commands/` — команды плагинов (например, `suggest-rules`, `create-spec`, `configure-root-artifacts`)
- `.cursor/rules/` — правила плагинов (например, `specs-*`, `plan-pomogator`, `research-workflow`, `no-mocks-fallbacks`)
- `.dev-pomogator/tools/` — утилиты плагинов (`specs-generator`, `specs-validator`, `steps-validator`, `plan-pomogator`, `forbid-root-artifacts`)

### В проект (Claude Code)

- `.claude/commands/` — команды плагинов
- `.claude/rules/` — правила плагинов
- `.dev-pomogator/tools/` — утилиты плагинов

### Глобально (Cursor)

- `~/.cursor/hooks/hooks.json`
- `~/.dev-pomogator/scripts/check-update.js`
- `~/.dev-pomogator/scripts/cursor-summarize.ts`
- `~/.dev-pomogator/config.json`
- `~/.dev-pomogator/logs/`

### Глобально (Claude Code)

- `~/.claude/settings.json` (hooks)
- `~/.dev-pomogator/scripts/check-update.js`
- `~/.dev-pomogator/config.json`
- `~/.dev-pomogator/logs/`

## Конфигурация

`~/.dev-pomogator/config.json`:

```json
{
  "platforms": ["cursor", "claude"],
  "autoUpdate": true,
  "cooldownHours": 24,
  "installedExtensions": [...]
}
```

## Автообновления и логи

- Проверка релизов GitHub раз в 24 часа
- Фоновые обновления
- Логи: `~/.dev-pomogator/logs/dev-pomogator-YYYY-MM-DD.log`

## Интеграции

- [claude-mem](https://github.com/thedotmack/claude-mem): трекинг сессий, контекст, суммаризация; токен для LLM, нужный claude-mem, можно взять на `aipomogator.ru`

## Требования

- Node.js >= 18

## Разработка

```bash
npm install
npm run build
npm run test:e2e:docker
```

## Лицензия

MIT
