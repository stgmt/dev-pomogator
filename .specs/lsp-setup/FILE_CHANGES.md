# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи.

См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

| Path | Action | Reason |
|------|--------|--------|
| `extensions/lsp-setup/extension.json` | create | Manifest расширения с tools, ruleFiles, envRequirements, postInstall, postUpdate |
| `extensions/lsp-setup/tools/lsp-setup/setup-lsp.ts` | create | Основной скрипт: runtime detection, LSP server install, plugin install, verification report |
| `extensions/lsp-setup/tools/lsp-setup/verify-lsp.ts` | create | Standalone скрипт верификации установленных LSP серверов |
| `extensions/lsp-setup/tools/lsp-setup/plugins/marketplace.json` | create | Локальный маркетплейс для fallback установки плагинов |
| `extensions/lsp-setup/tools/lsp-setup/plugins/vtsls-lsp/.claude-plugin/plugin.json` | create | Plugin manifest для vtsls |
| `extensions/lsp-setup/tools/lsp-setup/plugins/vtsls-lsp/.lsp.json` | create | LSP config для vtsls (TypeScript/JavaScript) |
| `extensions/lsp-setup/tools/lsp-setup/plugins/json-lsp/.claude-plugin/plugin.json` | create | Plugin manifest для JSON LSP |
| `extensions/lsp-setup/tools/lsp-setup/plugins/json-lsp/.lsp.json` | create | LSP config для vscode-json-languageserver |
| `extensions/lsp-setup/tools/lsp-setup/plugins/pyright-lsp/.claude-plugin/plugin.json` | create | Plugin manifest для Pyright |
| `extensions/lsp-setup/tools/lsp-setup/plugins/pyright-lsp/.lsp.json` | create | LSP config для pyright-langserver (Python) |
| `extensions/lsp-setup/tools/lsp-setup/plugins/csharp-lsp/.claude-plugin/plugin.json` | create | Plugin manifest для csharp-ls |
| `extensions/lsp-setup/tools/lsp-setup/plugins/csharp-lsp/.lsp.json` | create | LSP config для csharp-ls (C#) |
| `extensions/lsp-setup/claude/rules/lsp-usage.md` | create | Rule: инструкции по использованию LSP (goToDefinition > grep, findReferences > grep) |
| `CLAUDE.md` | edit | Добавить строку в таблицу Rules для lsp-usage |
| `tests/features/plugins/lsp-setup/LSP001_lsp-setup.feature` | create | BDD сценарии для lsp-setup extension |
| `tests/e2e/lsp-setup.test.ts` | create | E2E тесты: manifest, env var, rule installation, idempotent |
