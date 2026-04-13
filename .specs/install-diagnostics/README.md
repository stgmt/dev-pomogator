# Install Diagnostics

Diagnostics & regression tests for npx silent install failure on Windows. Эта спека документирует:
1. **Bug**: `npx github:stgmt/dev-pomogator --claude --all` молча завершается с exit code 2 на Windows из-за npm reify EPERM на cleanup `@inquirer/external-editor` files
2. **Skill**: `/install-diagnostics` slash command для interactive диагностики при столкновении с silent install failure
3. **Regression tests**: CORE003_18 (Linux control) + CORE003_19 (Windows TDD red) для предотвращения регрессии после fix-а

## Ключевые идеи

- **Silent failure detection** через сравнение mtime `~/.dev-pomogator/logs/install.log` до/после `npx` запуска (если не изменился — installer не запускался)
- **TDD red Windows test** — failing-by-design до upstream npm fix-а; assertions идентичны Linux test, поэтому fix автоматически делает тест green без manual changes
- **Cross-platform isolation** через `mkdtempSync` + опциональный fresh `NPM_CONFIG_CACHE` — исключает влияние stale npx cache на reproducibility

## Где лежит реализация

- **Diagnostic skill**: `.claude/skills/install-diagnostics/SKILL.md`
- **Test helper**: `tests/e2e/helpers.ts` → `runInstallerViaNpx()` (после `runInstaller`)
- **BDD scenarios**: `tests/features/core/CORE003_claude-installer.feature` → CORE003_18, CORE003_19
- **Integration tests**: `tests/e2e/claude-installer.test.ts` → 2 новых `describe.skipIf` блока перед `afterAll` основного `describe('CORE003: ...', ...)`
- **Bug evidence**: [RESEARCH.md](RESEARCH.md) (полное reproduction + paths)

## Где читать дальше

- [USER_STORIES.md](USER_STORIES.md) — кому это нужно
- [USE_CASES.md](USE_CASES.md) — UC-1..UC-3 + edge cases
- [RESEARCH.md](RESEARCH.md) — bug evidence, root cause, project context
- [REQUIREMENTS.md](REQUIREMENTS.md) — traceability matrix FR/AC/NFR
- [FR.md](FR.md) — FR-1..FR-5 с @feature тегами
- [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) — AC-1..AC-6 в EARS формате
- [DESIGN.md](DESIGN.md) — архитектура + BDD Test Infrastructure
- [TASKS.md](TASKS.md) — TDD план задач
- [FILE_CHANGES.md](FILE_CHANGES.md) — список изменяемых файлов
- [install-diagnostics.feature](install-diagnostics.feature) — own scenarios для skill behavior
