# Functional Requirements (FR)

## FR-1: Hook intercept @feature1

PreToolUse hook на Bash перехватывает команды содержащие `test_runner_wrapper` или `docker-test.sh`. Остальные Bash команды — passthrough (exit 0).

**Связанные AC:** AC-9
**Use Case:** UC-1

## FR-2: TypeScript staleness check @feature1

Для framework vitest/jest: сравнивает max mtime файлов `src/**/*.ts` с mtime `dist/index.js`. Если src новее dist или dist не существует → stale.

**Связанные AC:** AC-1, AC-2, AC-3
**Use Case:** UC-1, UC-2, UC-6

## FR-3: Docker SKIP_BUILD block @feature3

Для Docker тестов: блокирует команды с `SKIP_BUILD=1` в env или command string. Docker build обязателен — layer caching при `--build` работает корректно.

**Связанные AC:** AC-4
**Use Case:** UC-3

## FR-4: dotnet no-build block @feature3

Для framework dotnet: блокирует `--no-build` flag в тест-команде. Без этого флага `dotnet test` сам собирает проект.

**Связанные AC:** AC-5
**Use Case:** UC-4

## FR-5: Framework detection @feature1

Извлекает framework из `--framework` аргумента в wrapper-команде. Docker определяется по `docker-test.sh` в команде.

**Связанные AC:** AC-6

## FR-6: Deny message with fix command @feature1

При deny hook выдаёт конкретную команду для исправления:
- TypeScript: "Run `npm run build` first"
- Docker: "Do not skip Docker build — remove SKIP_BUILD=1"
- dotnet: "Remove `--no-build` flag"

**Связанные AC:** AC-1, AC-4, AC-5

## FR-7: SKIP_BUILD_CHECK bypass @feature5

Env var `SKIP_BUILD_CHECK=1` позволяет bypass всех проверок staleness. Hook allow (exit 0) + warning в stderr.

**Связанные AC:** AC-7
**Use Case:** UC-5
