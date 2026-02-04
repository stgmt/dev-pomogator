# MCP Setup

Автоматическая установка MCP серверов для research-workflow.

## MCP Серверы

| Сервер | Описание |
|--------|----------|
| **context7** | Документация библиотек (Context7) |
| **octocode** | Поиск кода на GitHub (Octocode) |

## Установка

### Автоматическая (при установке dev-pomogator)

MCP серверы устанавливаются автоматически при установке плагина `specs-workflow`.
При отсутствии сервера выполняется `npm install -g --prefix ~/.npm-global <package>`, затем в config
записывается путь к бинарнику из user-prefix (`~/.npm-global` на Windows, `~/.npm-global/bin` на Linux/macOS).

### Ручная

```bash
# Cursor
python tools/mcp-setup/setup-mcp.py --platform cursor

# Claude Code  
python tools/mcp-setup/setup-mcp.py --platform claude

# Оба
python tools/mcp-setup/setup-mcp.py --platform both
```

## Параметры

| Параметр | Описание |
|----------|----------|
| `--platform` | Платформа: `cursor`, `claude`, `both` |
| `--check` | Только проверить, не устанавливать |
| `--force` | Переустановить даже если уже есть |

## Требования

- Должен быть установлен `npm` (Node.js).
- Установка выполняется в user-prefix `~/.npm-global` (без прав администратора).

## Файлы конфигурации

- **Cursor:** `.cursor/mcp.json` (если существует в проекте), иначе `~/.cursor/mcp.json`
- **Claude Code:** `.mcp.json` (если существует в проекте), иначе `~/.mcp.json`

## Приватные репозитории

Для доступа к приватным репозиториям через Octocode установите `GITHUB_TOKEN` в переменных окружения.
