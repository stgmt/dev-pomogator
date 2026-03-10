# TUI Test Runner V2

Портирование 7 фич из zoho TUI (`tui-test-explorer`) в `extensions/tui-test-runner/`: AI Test Analyst с pattern matching и v3 failure cards, clickable file paths в логах, test discovery с checkbox selection, state persistence между сессиями, configurable error patterns через YAML, auto-run по keybinding в Claude Code, screenshot/SVG export.

## Ключевые идеи

- AI Analyst автоматически категоризирует failures по 30+ паттернам с подсказками по исправлению
- TUI запускается по комбинации клавиш в Claude Code (keybinding → launcher.ts → Python TUI)
- Все 7 фич портируются из zoho с адаптацией под multi-framework (vitest, jest, pytest, dotnet, rust, go)

## Где лежит реализация

- **Python TUI**: `extensions/tui-test-runner/tools/tui-test-runner/tui/`
- **AI Analyst module**: `extensions/tui-test-runner/tools/tui-test-runner/tui/analyst/`
- **Node.js Launcher**: `extensions/tui-test-runner/tools/tui-test-runner/launcher.ts`
- **Zoho reference**: `D:\repos\zoho\tools\tui-test-explorer\`

## Где читать дальше

- [USER_STORIES.md](USER_STORIES.md) — 7 user stories (@feature1..@feature7)
- [USE_CASES.md](USE_CASES.md) — 7 use cases с edge cases
- [REQUIREMENTS.md](REQUIREMENTS.md) — traceability matrix (FR → AC → BDD → UC)
- [FR.md](FR.md) — 7 FR + 4 sub-FR с leverage references
- [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) — 11 AC в EARS формате
- [DESIGN.md](DESIGN.md) — архитектура, алгоритмы, BDD infrastructure
- [TASKS.md](TASKS.md) — 9 TDD phases (0-8)
- [FILE_CHANGES.md](FILE_CHANGES.md) — 22 файла (create/edit)
- [tui-test-runner-v2.feature](tui-test-runner-v2.feature) — 20 BDD сценариев (PLUGIN013)
