# Stale Build Guard

PreToolUse hook для tui-test-runner extension. Блокирует запуск тестов если build устарел или пропущен. Работает для TypeScript (mtime src/ vs dist/), Docker (SKIP_BUILD=1), dotnet (--no-build).

## Ключевые идеи

- Hook по паттерну `test_guard.ts` — PreToolUse на Bash
- Framework-aware: TypeScript mtime check, Docker/dotnet flag detection, pytest/go/rust passthrough
- Fail-open: ошибка в hook → allow (exit 0)
- Bypass: `SKIP_BUILD_CHECK=1` env var

## Где лежит реализация

- **Hook**: `extensions/tui-test-runner/tools/tui-test-runner/build_guard.ts`
- **Staleness module**: `extensions/tui-test-runner/tools/tui-test-runner/build-staleness.ts`
- **Manifest**: `extensions/tui-test-runner/extension.json`

## Статистика

- 7 FR, 9 AC, 12 BDD scenarios
- Frameworks: vitest/jest (mtime), dotnet (--no-build), Docker (SKIP_BUILD), pytest/go/rust (passthrough)

## Где читать дальше

- [USER_STORIES.md](USER_STORIES.md)
- [USE_CASES.md](USE_CASES.md)
- [RESEARCH.md](RESEARCH.md)
- [REQUIREMENTS.md](REQUIREMENTS.md)
- [FR.md](FR.md)
- [NFR.md](NFR.md)
- [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md)
- [DESIGN.md](DESIGN.md)
- [FILE_CHANGES.md](FILE_CHANGES.md)
- [TASKS.md](TASKS.md)
- [stale-build-guard.feature](stale-build-guard.feature)
