# TUI Test Runner

Rich 4-tab Terminal UI для мониторинга тестов в реальном времени. Гибридная архитектура: Python/Textual для рендеринга TUI + Node.js adapter для интеграции с dev-pomogator extension system. Поддержка vitest, jest, pytest, dotnet.

## Ключевые идеи

- **4 вкладки**: Tests (дерево suite/test), Logs (realtime + highlighting), Monitoring (progress/phases), Analysis (error grouping)
- **Гибрид**: Python Textual для UI виджетов, Node.js для framework adapters и hooks
- **Универсальность**: YAML v2 protocol — адаптеры парсят stdout любого фреймворка в единый формат
- **Сосуществование**: дополняет test-statusline (statusline = quick glance, TUI = full detail)
- **Fail-open**: Python crash не блокирует тесты, hooks всегда exit 0

## Архитектура

```
Node.js Adapter          YAML v2 (filesystem)         Python TUI
─────────────────        ───────────────────          ──────────────
adapters/*.ts    ──►     status.{session}.yaml   ◄──  yaml_reader.py
yaml_writer.ts   ──►     test.{session}.log      ◄──  log_reader.py
launcher.ts      ──►     tui.{session}.pid       ◄──  app.py (Textual)
```

## Где лежит реализация

- **Extension**: `extensions/tui-test-runner/`
- **Node.js tools**: `extensions/tui-test-runner/tools/tui-test-runner/`
- **Python TUI**: `extensions/tui-test-runner/tools/tui-test-runner/tui/`
- **Installed target**: `.dev-pomogator/tools/tui-test-runner/`

## Где читать дальше

- [USER_STORIES.md](USER_STORIES.md) — 7 user stories
- [USE_CASES.md](USE_CASES.md) — 7 use cases
- [REQUIREMENTS.md](REQUIREMENTS.md) — Traceability matrix (10 FR, 15 NFR)
- [FR.md](FR.md) — Functional Requirements
- [NFR.md](NFR.md) — Non-Functional Requirements
- [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) — 10 AC в EARS формате
- [DESIGN.md](DESIGN.md) — Архитектура, YAML v2 schema, Reuse plan
- [TASKS.md](TASKS.md) — TDD план (7 фаз, 30+ задач)
- [FILE_CHANGES.md](FILE_CHANGES.md) — 27 файлов
- [CHANGELOG.md](CHANGELOG.md) — Версия 1.0.0
- [RESEARCH.md](RESEARCH.md) — Сравнение Textual vs Ink, аналоги
- [tui-test-runner.feature](tui-test-runner.feature) — 18 BDD сценариев
