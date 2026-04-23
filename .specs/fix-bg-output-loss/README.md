# Fix Bg Output Loss

Патч `scripts/docker-test.sh` и правила `no-blocking-on-tests` для защиты от silent-loss output у long-running background Bash тасков. Baseline incident: task `bd9aii2if` (2026-04-23) отработала 22 минуты с `exit 0`, но capture file оказался 0 байт — pipe `| tail -40` + duration + `docker compose -T` сломали harness capture на Windows/Git-Bash. Фича закрывает три plausible hypotheses (H1/H2/H3) одним защитным слоем: `tee` в persistent log.

## Ключевые идеи

- **Persistent log как defense in depth**: `scripts/docker-test.sh` пишет через `tee` в `.dev-pomogator/.docker-status/test-run-<epoch>.log` параллельно со stdout — при любом сбое harness capture full output остаётся на диске.
- **Rule-based prevention**: `.claude/rules/pomogator/no-blocking-on-tests.md` расширяется секцией Anti-pattern с явным запретом naked `| tail -N` в bg + safe replacement (`| tee <path> | tail -N`). AI в будущих сессиях генерирует safe pattern по умолчанию.
- **Zero breaking changes**: `set -o pipefail` сохраняет exit code propagation; `mkdir -p` идемпотентный; POSIX `tee` работает в Git-Bash, Alpine, Ubuntu, CI. Никаких изменений в invocation interface `/run-tests`, Dockerfile, vitest config.

## Где лежит реализация

- **App-код**: `scripts/docker-test.sh` (wrapper над `docker compose run`) — 3 additive patches около строк 6, 63, 69-72
- **Rule**: `.claude/rules/pomogator/no-blocking-on-tests.md` (always-apply) — +Anti-pattern секция, +checklist bullet
- **Tests**: `tests/e2e/docker-test-tee.test.ts` (6 it-блоков) + `tests/features/fix-bg-output-loss.feature` (6 сценариев FBOL001_01..06)
- **Fixtures**: `tests/fixtures/docker-test-tee/` (stub-compose.yml + README)

## Где читать дальше

- [USER_STORIES.md](USER_STORIES.md) — 4 user story (1 OUT OF SCOPE)
- [USE_CASES.md](USE_CASES.md) — 3 UC (persistent log flow, rule prevention, incident recovery)
- [RESEARCH.md](RESEARCH.md) — incident timeline, reproduction matrix, ranked hypotheses, project context
- [REQUIREMENTS.md](REQUIREMENTS.md) — 6 FR / 6 AC / NFR traceability matrix
- [DESIGN.md](DESIGN.md) — patch diff, BDD Test Infrastructure (TEST_DATA_NONE / vitest)
- [FIXTURES.md](FIXTURES.md) — 2 fixtures (stub-compose.yml + stub-exit-code factory)
- [TASKS.md](TASKS.md) — 4 phases (BDD Red → Patch Green → Rule Green → Refactor)
- [fix-bg-output-loss.feature](fix-bg-output-loss.feature) — 6 BDD сценариев 1:1 с it-блоками
