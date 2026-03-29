# Research

## Контекст

Исследование возможностей интеграции LSP (Language Server Protocol) серверов с Claude Code через систему расширений dev-pomogator. Claude Code поддерживает LSP нативно с версии 2.0.74 (декабрь 2025).

## Источники

- [Claude Code Plugins Reference](https://code.claude.com/docs/en/plugins-reference) — официальная документация плагинов [VERIFIED]
- [Discover and install plugins](https://code.claude.com/docs/en/discover-plugins) — установка плагинов [VERIFIED]
- [Piebald-AI/claude-code-lsps](https://github.com/Piebald-AI/claude-code-lsps) — комьюнити-маркетплейс (обновлён 2026-03-23) [VERIFIED]
- [Claude Code LSP Setup Guide](https://www.aifreeapi.com/en/posts/claude-code-lsp) — обзор поддерживаемых языков [VERIFIED]
- [vtsls npm](https://www.npmjs.com/package/@vtsls/language-server) — TypeScript LSP wrapper [VERIFIED]
- [csharp-language-server GitHub](https://github.com/razzmatazz/csharp-language-server) — Roslyn-based C# LSP [VERIFIED]
- [Pyright GitHub](https://github.com/microsoft/pyright) — Python type checker / LSP [VERIFIED]
- [anthropics/claude-code #15619](https://github.com/anthropics/claude-code/issues/15619) — ENABLE_LSP_TOOL discussion [VERIFIED]
- [anthropics/claude-code #16084](https://github.com/anthropics/claude-code/issues/16084) — LSP не работает на Windows [VERIFIED: known issue]

## Технические находки

### Claude Code LSP Architecture [VERIFIED: official docs]

Claude Code использует **Plugin System** для LSP:

1. **Plugin** предоставляет `.lsp.json` с конфигурацией LSP-сервера (command, args, extensionToLanguage)
2. **ENABLE_LSP_TOOL=1** — env var для включения LSP tool. [PARTIALLY VERIFIED] Был обязателен для v2.0.74. Piebald-AI docs используют прошедшее время ("had to be enabled manually") — возможно уже не нужен в текущих версиях. Рекомендация: устанавливать на всякий случай.
3. **5 LSP-операций**: `goToDefinition`, `findReferences`, `hover`, `documentSymbol`, `getDiagnostics`

Официальный формат `.lsp.json`:
```json
{
  "server-name": {
    "command": "binary-name",
    "args": ["--stdio"],
    "extensionToLanguage": {
      ".ext": "language-id"
    }
  }
}
```

Дополнительные optional поля: `transport`, `env`, `initializationOptions`, `settings`, `workspaceFolder`, `startupTimeout`, `shutdownTimeout`, `restartOnCrash`, `maxRestarts`.

### Piebald-AI Marketplace [VERIFIED: GitHub + issues]

GitHub: `Piebald-AI/claude-code-lsps`. Поддерживает 23+ языков. Обновлён 2026-03-23.

**Критическое замечание:** Piebald-AI требует **`npx tweakcc --apply`** для патчинга Claude Code installation ПЕРЕД использованием маркетплейса. tweakcc — отдельный инструмент, определяющий тип установки (npm или native) и применяющий патчи.

**Известные баги:** Issues #7 (vtsls), #8 (rust-analyzer), #10 (gopls), #11 (jdtls), #12 (clangd) — missing `lspServers` config в `marketplace.json`. Это значит что часть плагинов может не работать корректно.

Установка:
```bash
npx tweakcc --apply                                    # ОБЯЗАТЕЛЬНО первым шагом
claude plugin marketplace add Piebald-AI/claude-code-lsps  # или /plugin marketplace add ...
claude plugin install vtsls@claude-code-lsps
```

### Официальные Anthropic плагины [VERIFIED: official docs]

Anthropic предоставляет 3 официальных LSP-плагина:

| Plugin | Язык | Сервер | Установка сервера |
|--------|------|--------|-------------------|
| `pyright-lsp` | Python | Pyright | `pip install pyright` или `npm install -g pyright` |
| `typescript-lsp` | TypeScript | typescript-language-server | `npm install -g typescript-language-server typescript` |
| `rust-lsp` | Rust | rust-analyzer | [rust-analyzer installation](https://rust-analyzer.github.io/manual.html#installation) |

**Важно:** Официальный TypeScript плагин использует `typescript-language-server`, НЕ `vtsls`. Piebald-AI использует `vtsls`. Оба работают, но `vtsls` считается быстрее.

### LSP-серверы (бинари) [VERIFIED: npm/GitHub/NuGet]

| Язык | Сервер | Установка | Бинарь | Требования |
|------|--------|-----------|--------|------------|
| TypeScript/JS | vtsls | `npm i -g @vtsls/language-server typescript` | `vtsls` | Node >= 16 |
| TypeScript/JS (alt) | typescript-language-server | `npm i -g typescript-language-server typescript` | `typescript-language-server` | Node >= 14 |
| JSON | vscode-json-languageserver | `npm i -g vscode-langservers-extracted` | `vscode-json-languageserver` | Node |
| Python | Pyright | `npm i -g pyright` | `pyright-langserver` | Node (или `pip install pyright`) |
| C# | csharp-ls | `dotnet tool install -g csharp-ls` | `csharp-ls` | **.NET 10 SDK** (не 8!) |

### Исправления к исходному промпту

| Что было в промпте | Что на самом деле | Источник |
|---------------------|-------------------|----------|
| .NET SDK 8.0+ для C# | .NET 10 SDK required | [csharp-ls GitHub](https://github.com/razzmatazz/csharp-language-server) |
| `claude plugin marketplace add Piebald-AI/claude-code-lsps` (первый шаг) | Нужен `npx tweakcc --apply` ПЕРЕД marketplace add | [Piebald-AI README](https://github.com/Piebald-AI/claude-code-lsps) |
| `enabledPlugins` в settings.json | Plugins устанавливаются через `claude plugin install`, не через settings.json | [Official docs](https://code.claude.com/docs/en/plugins-reference) |
| Создание кастомного маркетплейса с marketplace.json | Можно, но формат plugin.json + .lsp.json — [задокументирован](https://code.claude.com/docs/en/plugins-reference) | Official docs |
| JSON LSP нужен | JSON LSP опциональный, Claude Code не использует семантику JSON файлов активно | Инженерное суждение |

### dev-pomogator Extension vs Claude Code Plugin

**Архитектурное решение:**

- **Extension** (dev-pomogator) — устанавливает tools, rules, skills, hooks в проект. Управляется инсталлером/апдейтером. НЕ имеет поля `lspServers`.
- **Plugin** (Claude Code) — нативная система расширений Claude Code CLI. Имеет `.claude-plugin/plugin.json` + `.lsp.json`. Устанавливается через маркетплейсы или `--plugin-dir`.

**Вывод:** lsp-setup будет **Extension** в dev-pomogator, который через postInstall hook:
1. Устанавливает LSP server бинари (npm global / dotnet global)
2. Устанавливает Claude Code plugins (через маркетплейс или локально)
3. Настраивает ENABLE_LSP_TOOL=1 через envRequirements

### Fallback стратегия [VERIFIED: official docs]

Если Piebald-AI недоступен, dev-pomogator Extension может создать **локальный plugin** напрямую:

```
.dev-pomogator/tools/lsp-setup/plugins/vtsls-lsp/
├── .claude-plugin/
│   └── plugin.json
└── .lsp.json
```

И установить через `claude --plugin-dir .dev-pomogator/tools/lsp-setup/plugins/vtsls-lsp` для текущей сессии, или через локальный маркетплейс для постоянной установки.

### Windows Issues [VERIFIED: GitHub issue #16084]

На Windows 11 есть known issue: LSP plugins not recognized — "No LSP server available for file type: .rs". Это может затронуть пользователей dev-pomogator на Windows.

## Где лежит реализация

- Extension manifest: `extensions/lsp-setup/extension.json` (будет создан)
- Setup-скрипт: `extensions/lsp-setup/tools/lsp-setup/setup-lsp.ts` (будет создан)
- Verify-скрипт: `extensions/lsp-setup/tools/lsp-setup/verify-lsp.ts` (будет создан)
- Rule: `.claude/rules/lsp-setup/lsp-usage.md` (будет создан)
- Инсталлер: `src/installer/extensions.ts` (существует)
- Claude settings: `src/installer/claude.ts` (существует, инжектит env через envRequirements)

## Выводы

1. Claude Code LSP — зрелая фича с [официальной документацией](https://code.claude.com/docs/en/plugins-reference)
2. **Два пути установки плагинов**: Piebald-AI (требует tweakcc) или локальный plugin (`.lsp.json` + `plugin.json`)
3. **Piebald-AI имеет баги** с lspServers config — fallback на локальные плагины обязателен
4. **csharp-ls требует .NET 10 SDK** — существенное ограничение, нужна проверка при установке
5. **ENABLE_LSP_TOOL=1** — устанавливать через envRequirements на всякий случай
6. **Windows issues** — known bugs с LSP на Windows, документировать в README
7. **Официальный TypeScript LSP** = `typescript-language-server`, Piebald-AI = `vtsls`. Оба валидны.

## Таблица верификации

| Гипотеза | Статус | Достоверность | Источники |
|----------|--------|---------------|-----------|
| Piebald-AI/claude-code-lsps существует и работает | ПОДТВЕРЖДЕНО (с оговорками) | 90% | GitHub repo, issues |
| ENABLE_LSP_TOOL=1 обязателен | ЧАСТИЧНО | 70% | Official docs, Piebald-AI |
| Plugin CLI syntax (`claude plugin install`) | ПОДТВЕРЖДЕНО | 100% | Official docs |
| vtsls: `npm i -g @vtsls/language-server`, `vtsls --stdio` | ПОДТВЕРЖДЕНО | 100% | npm, GitHub |
| pyright: `npm i -g pyright`, `pyright-langserver --stdio` | ПОДТВЕРЖДЕНО | 100% | GitHub, npm |
| csharp-ls: `dotnet tool install -g csharp-ls` | ПОДТВЕРЖДЕНО | 100% | GitHub, NuGet |
| csharp-ls requires .NET 8+ | ОПРОВЕРГНУТО | 100% | Требует .NET 10 SDK |
| Piebald-AI = просто marketplace add | ОПРОВЕРГНУТО | 100% | Требует npx tweakcc --apply |
| `.lsp.json` формат конфигурации | ПОДТВЕРЖДЕНО | 100% | Official docs |
| LSP работает на Windows | ПРОБЛЕМЫ | 80% | GitHub issue #16084 |

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| extension-manifest-integrity | `.claude/rules/extension-manifest-integrity.md` | extension.json = source of truth для апдейтера | Изменения в extension | FR-1, FR-2 |
| updater-sync-tools-hooks | `.claude/rules/updater-sync-tools-hooks.md` | Апдейтер обновляет ВСЕ артефакты: tools, rules, hooks | Обновление extension | FR-6 |
| installer-hook-formats | `.claude/rules/gotchas/installer-hook-formats.md` | 3 формата hooks (string, object, array) | hooks в extension.json | FR-1 |
| claude-md-glossary | `.claude/rules/claude-md-glossary.md` | CLAUDE.md = индекс на rules, не дублировать содержимое | Добавление rule | FR-5 |
| no-mocks-fallbacks | `.claude/rules/specs-workflow/no-mocks-fallbacks.md` | Реальные вызовы, не моки; fail-fast | Тесты | NFR |
| integration-tests-first | `.claude/rules/integration-tests-first.md` | Тесты через runInstaller/spawnSync, не unit | Написание тестов | Тесты |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| context-menu extension | `extensions/context-menu/` | postInstall + tool + skill для system-level setup | Ближайший аналог — postInstall для внешних зависимостей |
| auto-commit extension | `extensions/auto-commit/` | envRequirements с required/optional/default | Шаблон для ENABLE_LSP_TOOL env var |
| devcontainer extension | `extensions/devcontainer/` | interactive postInstall + non-interactive postUpdate | Шаблон для update flow |
| specs-workflow MCP setup | `extensions/specs-workflow/tools/mcp-setup/` | Python setup-скрипт для внешних зависимостей | Альтернативный подход (Python vs TypeScript) |
| Claude Code plugin system | [Official docs](https://code.claude.com/docs/en/plugins-reference) | `.lsp.json`, `plugin.json`, marketplace API, CLI commands | Целевая платформа для LSP интеграции |

### Architectural Constraints Summary

1. **Extension interface не имеет lspServers** — Extension = мост к Claude Code Plugin system через postInstall hook
2. **postInstall — единственная точка для npm/dotnet global install** — setup-скрипт запускается через postInstall
3. **envRequirements** — ENABLE_LSP_TOOL=1 инжектируется автоматически через default value
4. **Rule для LSP usage** — инструкции пойдут как `.claude/rules/lsp-setup/lsp-usage.md`, CLAUDE.md получит только строку в таблице
5. **Windows ограничения** — known issues с LSP на Windows (issue #16084), нужна документация
6. **csharp-ls** — .NET 10 SDK, значительное ограничение — graceful degradation если dotnet нет или версия < 10
