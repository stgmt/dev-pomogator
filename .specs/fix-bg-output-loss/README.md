# Fix Bg Output Loss

Защита от silent-loss output у long-running background Bash тасков в Claude Code на Windows + Git Bash. Покрывает **все long bg команды** — `docker-test.sh` (v0.1.0) и generic `dotnet test`/`pytest`/`cargo test` через `scripts/bg-log.sh` обёртку (v0.2.0).

**Baseline incident #1** (2026-04-23): task `bd9aii2if` отработала 22 минуты с `exit 0`, но capture file 0 байт — pipe `| tail -40` + duration + `docker compose -T` сломали harness capture.

**Baseline incident #2** (2026-05-10): `dotnet test --filter MBIL001` через `run_in_background: true` висел 25 минут, process реально умер, capture 0 байт. Подтвердило что проблема **шире** чем docker — это 4 confirmed Anthropic Claude Code Bash tool bugs (issues [#16305](https://github.com/anthropics/claude-code/issues/16305), [#21915](https://github.com/anthropics/claude-code/issues/21915), [#36915](https://github.com/anthropics/claude-code/issues/36915), [#50616](https://github.com/anthropics/claude-code/issues/50616), все closed as "not planned"). H1/H2/H3 гипотезы из v0.1.0 RESEARCH.md оказались тремя разными confirmed багами.

**v0.3.0 refactor** (2026-05-11): откачен `scripts/bg-log.sh` как duplicate — `test_runner_wrapper.cjs` уже реализует persistent log через `logStream.write()`. Вместо отдельного скрипта добавлен `generic` passthrough adapter в существующий wrapper (`extensions/tui-test-runner/tools/tui-test-runner/adapters/generic_adapter.ts`). Любая long bg команда (`npm run build`, `dotnet ef migrations`, `sleep`) теперь идёт через тот же wrapper что и тесты. `test_guard.ts` обновлён в smart converter — генерирует готовую к копированию wrapper команду в deny-message. Skill `/run-tests` description переписан с явными trigger keywords для proactive auto-invocation. Добавлены analysis report (почему skill не сработал) + three-benchmark report (trigger rate + performance + reliability).

## Ключевые идеи

- **Persistent log как defense in depth**: `scripts/docker-test.sh` пишет через `tee` в `.dev-pomogator/.docker-status/test-run-<epoch>.log`. Generic `scripts/bg-log.sh` пишет через `> file 2>&1` (без pipe) в `.dev-pomogator/.bg-logs/<epoch>-<slug>.log` — обходит pipeline data loss (#16305) полностью.
- **Rule-based prevention**: `.claude/rules/pomogator/no-blocking-on-tests.md` документирует 4 confirmed Anthropic bugs + preferred file-redirect pattern + bg-log.sh reference. AI в будущих сессиях выбирает safe pattern по умолчанию.
- **Zero breaking changes**: `set -o pipefail` сохраняет exit code; `mkdir -p` идемпотентный; POSIX `tee`/redirect работает в Git-Bash, Alpine, Ubuntu, CI. Никаких изменений в `/run-tests`, Dockerfile, vitest config.

## Где лежит реализация

- **App-код v0.1.0**: `scripts/docker-test.sh` (wrapper над `docker compose run`) — 3 additive patches около строк 6, 63, 69-72
- ~~**App-код v0.2.0**: `scripts/bg-log.sh` (generic wrapper для любых long bg команд) — ~30 строк, `> file 2>&1` redirect без pipe~~ DEPRECATED v0.3.0 — replaced by FR-11 generic adapter
- **App-код v0.3.0**: `extensions/tui-test-runner/tools/tui-test-runner/adapters/generic_adapter.ts` + integrations в `types.ts`/`test_runner_wrapper.ts`/`dispatch.ts` + `test_guard.ts` smart converter + `.claude/skills/run-tests/SKILL.md` description update
- **Rule**: `.claude/rules/pomogator/no-blocking-on-tests.md` (always-apply) — Anti-pattern секция (v0.1.0) + Confirmed Anthropic bugs + Preferred file-redirect pattern (v0.2.0)
- **Tests**: `tests/e2e/docker-test-tee.test.ts` (6 it FBOL001) + `tests/e2e/bg-log-helper.test.ts` (3 it FBOL002) + `tests/features/fix-bg-output-loss.feature` (9 scenarios FBOL001_01..06 + FBOL002_01..03)
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
