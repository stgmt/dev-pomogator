# Functional Requirements (FR)

## FR-1: Extension Manifest @feature1

Extension `lsp-setup` ДОЛЖЕН иметь `extension.json` со всеми компонентами: tools, ruleFiles, envRequirements, postInstall, postUpdate.

**AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-extension-manifest-valid-feature1), [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6-enable_lsp_tool-env-var-feature1), [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8-idempotent-installation-feature1), [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9-update-adds-new-servers-feature1)

## FR-2: LSP Server Installation @feature2 @feature3 @feature4

postInstall скрипт ДОЛЖЕН устанавливать LSP-серверы для доступных рантаймов:
- **TypeScript/JS**: `npm install -g @vtsls/language-server typescript` → бинарь `vtsls`
- **Python**: `npm install -g pyright` → бинарь `pyright-langserver`
- **C#**: `dotnet tool install -g csharp-ls` → бинарь `csharp-ls` (требует .NET 10 SDK)
- **JSON**: `npm install -g vscode-langservers-extracted` → бинарь `vscode-json-languageserver`

**AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-lsp-servers-installed-feature2-feature3-feature4), [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7-verification-report-feature2-feature3-feature4)

## FR-3: Runtime Detection @feature5

Setup-скрипт ДОЛЖЕН проверять наличие рантаймов перед установкой:
- `node` (>= 16) — обязателен для vtsls, pyright, json LSP
- `dotnet` (>= 10) — опционален, только для csharp-ls
- Если `node` отсутствует — fail-fast с ошибкой
- Если `dotnet` отсутствует — skip csharp-ls с warning

**AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3-missing-runtime-handling-feature5)

## FR-4: Claude Code Plugin Installation @feature7

Setup-скрипт ДОЛЖЕН установить Claude Code plugins для LSP:
1. Попытка: `claude plugin marketplace add Piebald-AI/claude-code-lsps` + `npx tweakcc --apply` + install plugins
2. Fallback: создать локальные плагины с `.lsp.json` + `plugin.json` и установить через `claude plugin install` из локального маркетплейса

**AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4-plugin-installation-with-fallback-feature7)

## FR-5: LSP Usage Rule @feature6

Extension ДОЛЖЕН устанавливать rule `.claude/rules/lsp-setup/lsp-usage.md` с инструкциями:
- Предпочитать `goToDefinition` над grep для символов кода
- Предпочитать `findReferences` над grep для поиска использований
- Использовать `hover` для получения типов
- После edit дождаться LSP диагностик перед переходом к следующему файлу

**AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5-lsp-usage-rule-installed-feature6)

## FR-6: ENABLE_LSP_TOOL Environment Variable @feature1

Extension ДОЛЖЕН инжектировать `ENABLE_LSP_TOOL=1` [VERIFIED: official docs + Piebald-AI] через `envRequirements` с `default: "1"` — инсталлер автоматически пропишет в `.claude/settings.json` env.

**AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6-enable_lsp_tool-env-var-feature1)

## FR-7: Verification Report @feature2 @feature3 @feature4

postInstall скрипт ДОЛЖЕН выводить итоговый отчёт в формате таблицы:
- Язык | LSP-сервер | Бинарь в PATH | Статус
- Общий вердикт: сколько серверов установлено из скольких

**AC:** [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7-verification-report-feature2-feature3-feature4)

## FR-8: Idempotent Installation @feature1

Повторный запуск postInstall НЕ ДОЛЖЕН переустанавливать уже установленные серверы. Проверять наличие бинарей через `which`/`where` перед установкой.

**AC:** [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8-idempotent-installation-feature1)

## FR-9: Update Support @feature1

postUpdate hook ДОЛЖЕН проверять наличие новых LSP-серверов (если расширение добавило поддержку нового языка) и доустанавливать только недостающие.

**AC:** [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9-update-adds-new-servers-feature1)
