# Fixtures

## Overview

Феча классифицирована как **TEST_DATA_NONE** (см. [DESIGN.md BDD Test Infrastructure](DESIGN.md#bdd-test-infrastructure)). Minimal fixtures: только stub docker-compose file для integration test без dependency на реальный Docker daemon.

## Fixture Inventory

| ID | Name | Type | Path | Scope | Owner |
|----|------|------|------|-------|-------|
| F-1 | stub-compose.yml | static | `tests/fixtures/docker-test-tee/stub-compose.yml` | per-feature | describe-level beforeAll |
| F-2 | stub-exit-code | factory | inline in `docker-test-tee.test.ts` | per-scenario | it-level beforeEach |

## Fixture Details

### F-1: stub-compose.yml

- **Type:** static file
- **Format:** YAML
- **Setup:** committed в репозиторий; копируется в tmpdir на старте integration test
- **Teardown:** tmpdir удаляется через `afterAll(() => fs.rm(tmpdir, {recursive: true}))`
- **Dependencies:** none
- **Used by:** @feature1 сценарии FBOL001_01, FBOL001_02, FBOL001_04
- **Assumptions:** file содержит trivial `echo` service (`image: busybox` + `command: echo "..."`) — тест запускается БЕЗ Docker daemon dependency за счёт mocking `docker compose run` invocation самого `docker-test.sh` через test wrapper

### F-2: stub-exit-code

- **Type:** factory (inline function в `docker-test-tee.test.ts`)
- **Format:** TypeScript
- **Setup:** inline helper в test file — `stubCmd(code)` возвращает shell-строку `sh -c 'echo start; echo done; exit <code>'`, где `<code>` — аргумент функции (TypeScript template literal с number параметром).
- **Teardown:** no teardown required — pure function, no side effects
- **Dependencies:** none
- **Used by:** @feature1 FBOL001_04 (exit code preservation test)
- **Assumptions:** `sh` available в Git-Bash/CI environment (POSIX standard)

## Dependencies Graph

```
F-1 (stub-compose.yml) — independent
F-2 (stub-exit-code)   — independent
```

Fixtures независимы друг от друга; нет каскадных зависимостей.

## Gap Analysis

| @featureN | Scenario | Fixture Coverage | Gap |
|-----------|----------|-----------------|-----|
| @feature1 | FBOL001_01 tee creates log file | F-1 | none |
| @feature1 | FBOL001_02 output in both stdout+log | F-1 | none |
| @feature1 | FBOL001_03 mkdir -p idempotent | — | no fixture needed (filesystem-only assertion) |
| @feature1 | FBOL001_04 exit code preserved | F-1, F-2 | none |
| @feature2 | FBOL001_05 rule contains anti-pattern | — | no fixture (reads existing committed rule file) |
| @feature3 | FBOL001_06 gitignore covers log files | — | no fixture (reads existing `.gitignore`) |

## Notes

- TEST_DATA_NONE classification: интеграционные тесты используют `os.tmpdir()` + per-scenario cleanup. Нет persistent test data вне test file boundary.
- Stub docker-compose не требует реального Docker daemon — тест работает локально без Docker при запуске через `vitest run` напрямую (полный Docker flow по-прежнему проверяется через существующую suite `CORE003_claude-installer`).
- Cleanup order: per-scenario `afterEach` удаляет tmpdir; если процесс убит mid-test — Windows остаётся с temp file (acceptable, OS cleanup eventually).
