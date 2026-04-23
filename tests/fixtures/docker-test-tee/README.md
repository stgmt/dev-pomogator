# docker-test-tee fixtures

Фикстуры для integration test `tests/e2e/docker-test-tee.test.ts` (feature `FBOL001: Fix Background Output Loss`).

## Files

| File | Purpose | Real or stub |
|------|---------|--------------|
| `stub-compose.yml` | Placeholder docker-compose file чтобы `-f docker-compose.test.yml` arg успешно резолвился; реальный docker compose НЕ запускается | stub |
| `mock-docker.sh` | Shell script подменяющий `docker` binary через PATH override; обрабатывает `image inspect`, `ps`, `compose build/run/down`, `inspect`, `stop`, `rm` | stub |

## Test setup pattern

1. `beforeEach` создаёт tmpDir + mock-bin/ внутри
2. Копирует `scripts/docker-test.sh` + `stub-compose.yml` в tmpDir
3. Копирует `mock-docker.sh` → `mock-bin/docker` + `chmod +x`
4. Запускает `bash scripts/docker-test.sh ...` с `PATH=mock-bin:$PATH`
5. `afterEach` удаляет tmpDir

## Cleanup

`afterEach(() => fs.removeSync(tmpDir))` — каждый тест изолирован в своём tmpDir, cleanup per-scenario. Нет persistent state вне test file boundary (TEST_DATA_NONE).

## Why mock instead of real Docker

Integration test должен работать при локальном запуске `npx vitest run tests/e2e/docker-test-tee.test.ts` без зависимости от Docker Desktop. Полный Docker flow проверяется через существующую suite `CORE003_claude-installer` — docker-test.sh вызывается оттуда end-to-end на CI.
