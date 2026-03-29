# LSP Setup Extension

Автоматическая установка и настройка LSP-серверов для Claude Code через систему расширений dev-pomogator.

## Что делает

- Устанавливает LSP-серверы: vtsls (TypeScript/JS), Pyright (Python), csharp-ls (C#), vscode-json-languageserver (JSON)
- Настраивает Claude Code plugins для подключения LSP-серверов
- Инжектирует `ENABLE_LSP_TOOL=1` в настройки проекта
- Устанавливает rule с инструкциями: goToDefinition > grep, findReferences > grep

## Навигация по спеке

| Файл | Описание |
|------|----------|
| [USER_STORIES.md](USER_STORIES.md) | 7 user stories (@feature1-@feature7) |
| [USE_CASES.md](USE_CASES.md) | 6 use cases (install, missing runtime, fallback, update, verify, daily use) |
| [RESEARCH.md](RESEARCH.md) | Верифицированное исследование Claude Code LSP, Piebald-AI, official plugins |
| [FR.md](FR.md) | 9 functional requirements |
| [NFR.md](NFR.md) | Performance, Security, Reliability, Usability |
| [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) | 9 AC в EARS формате |
| [DESIGN.md](DESIGN.md) | Архитектура, extension.json, setup flow, reuse plan |
| [TASKS.md](TASKS.md) | 5 фаз: BDD Foundation → Manifest → Setup Core → Plugins → Refactor |
| [FILE_CHANGES.md](FILE_CHANGES.md) | 16 файлов (14 create, 1 edit, 1 BDD) |
| [lsp-setup.feature](lsp-setup.feature) | 9 BDD сценариев (LSP001_01-LSP001_09) |

## Ключевые решения

1. **Extension как мост к Plugin system** — dev-pomogator Extension устанавливает Claude Code Plugins через postInstall hook
2. **Piebald-AI + local fallback** — основной источник плагинов с offline-совместимым fallback
3. **Graceful degradation** — отсутствие .NET SDK пропускает C# LSP, остальные работают
4. **ENABLE_LSP_TOOL через envRequirements** — автоинжекция при установке

## Реализация

- Код: `extensions/lsp-setup/` (extension.json + tools/ + claude/rules/)
- Тесты: `tests/e2e/lsp-setup.test.ts` + `tests/features/plugins/lsp-setup/LSP001_lsp-setup.feature`

## BDD Summary

9 сценариев: manifest valid, env var, rule, idempotent, dotnet skip, fallback, report, update, dynamic test coverage.
