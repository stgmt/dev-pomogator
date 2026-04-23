# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи.

См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

| Path | Action | Reason |
|------|--------|--------|
| `scripts/docker-test.sh` | edit | [FR-1](FR.md#fr-1-persistent-log-для-docker-testsh-output), [FR-3](FR.md#fr-3-directory-lifecycle--dev-pomogatordocker-status-создаётся-безопасно), [FR-5](FR.md#fr-5-exit-code-preservation--regression-guard) — добавить LOG_DIR/LOG_FILE + mkdir -p + tee в docker compose run pipeline |
| `.claude/rules/pomogator/no-blocking-on-tests.md` | edit | [FR-2](FR.md#fr-2-обновить-rule-no-blocking-on-tests--запрет-naked--tail-в-bg) — добавить Anti-patterns секцию про `\| tail` в bg + safe replacement |
| `tests/e2e/docker-test-tee.test.ts` | create | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1), [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-1), [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-3), [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-5) — integration test: tee создаёт log, mkdir -p idempotent, exit code preserved |
| `tests/features/fix-bg-output-loss.feature` | create | BDD scenarios для FBOL001_01..05 (1:1 с it() блоками в docker-test-tee.test.ts) |
| `tests/fixtures/docker-test-tee/stub-compose.yml` | create | Stub docker-compose с trivial echo test — не требует Docker daemon при unit-run; используется для AC-6 exit code verification |
| `tests/fixtures/docker-test-tee/README.md` | create | Документация fixtures lifecycle (what's stubbed vs real) |
| `.specs/fix-bg-output-loss/FIXTURES.md` | edit | TEST_DATA_NONE — минимальные fixtures (stub docker-compose только) |
