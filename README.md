# dev-pomogator

Плагин-система для Cursor и Claude Code, которая устанавливает в проект командные стандарты, рабочие процессы, инструменты и хуки.

**Что это даёт:**
- Единый формат планов, спецификаций и коммитов для всей команды
- Автокоммиты с LLM-генерацией сообщений при завершении работы агента
- Анализ сессий и автоматическое предложение правил для проекта
- Защита от типичных LLM-ошибок (лишние файлы в корне, пустые фолбеки)
- Автообновления плагинов с защитой пользовательских изменений

## Быстрый старт

Запускайте из папки проекта (root определяется по git).

### Cursor (по умолчанию)

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/stgmt/dev-pomogator/main/install | iex
```

**Linux/macOS:**
```bash
curl -fsSL https://raw.githubusercontent.com/stgmt/dev-pomogator/main/install | bash
```

### Claude Code

**Windows (PowerShell):**
```powershell
$env:TARGET="claude"; irm https://raw.githubusercontent.com/stgmt/dev-pomogator/main/install | iex
```

**Linux/macOS:**
```bash
curl -fsSL https://raw.githubusercontent.com/stgmt/dev-pomogator/main/install | TARGET=claude bash
```

## Плагины

| Плагин | Назначение | Команда в чате |
|--------|------------|----------------|
| `suggest-rules` | Анализирует сессию и предлагает правила; включает skill `/deep-insights` для количественного анализа метрик | `/suggest-rules`, `/deep-insights` |
| `specs-workflow` | Управление спеками (3 фазы) + валидаторы | `/create-spec <name>` |
| `plan-pomogator` | Формат планов, шаблон и валидатор | — |
| `auto-commit` | Автокоммиты с LLM-генерацией сообщений при завершении агента (Stop hook) | — |
| `forbid-root-artifacts` | Антигаллюцинационная защита: allowlist файлов в корне репозитория | `/configure-root-artifacts` |

Подробнее: `extensions/*/README.md`

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

- `~/.cursor/hooks/hooks.json` — хуки плагинов (auto-commit Stop, check-update и др.)
- `~/.dev-pomogator/scripts/check-update.js`
- `~/.dev-pomogator/config.json`
- `~/.dev-pomogator/logs/`

### Глобально (Claude Code)

- `~/.claude/settings.json` — хуки плагинов (auto-commit Stop, check-update и др.)
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
