# Tasks

## TDD Workflow

> Задачи организованы по TDD: Red -> Green -> Refactor.
> Phase 0 — .feature + integration test (Red). Phase 1 — patch docker-test.sh (Green). Phase 2 — rule update (Green). Phase 3 — Refactor + verify.

## Phase 0: BDD Foundation (Red)

> vitest framework уже установлен (BDD foundation already in place, verified in DESIGN.md Evidence: `tests/e2e/*.test.ts` existing pattern + `package.json` devDependencies).
> TEST_DATA_NONE — дополнительные hook/fixture задачи не требуются (per-scenario `os.tmpdir()` + `afterEach`).

- [ ] Создать `tests/features/fix-bg-output-loss.feature` с 6 сценариями FBOL001_01..06 -- @feature1, @feature2, @feature3
  _Source: `.specs/fix-bg-output-loss/fix-bg-output-loss.feature` — скопировать содержимое 1:1_
- [ ] Создать `tests/fixtures/docker-test-tee/stub-compose.yml` — trivial busybox echo service для integration test
  _Source: DESIGN.md "Директории и файлы"_
- [ ] Создать `tests/fixtures/docker-test-tee/README.md` — документация fixtures (что stubbed, что real)
- [ ] Создать `tests/e2e/docker-test-tee.test.ts` с 6 it-блоками 1:1 с FBOL001_01..06
  _Requirements: [FR-1](FR.md#fr-1-persistent-log-для-docker-testsh-output), [FR-2](FR.md#fr-2-обновить-rule-no-blocking-on-tests--запрет-naked--tail-в-bg), [FR-3](FR.md#fr-3-directory-lifecycle--dev-pomogatordocker-status-создаётся-безопасно), [FR-4](FR.md#fr-4-log-rotation--gitignore--не-коммитить-test-run-log), [FR-5](FR.md#fr-5-exit-code-preservation--regression-guard)_
  _Naming: describe(`FBOL001: Fix Background Output Loss`) + it(`FBOL001_NN: ...`) per extension-test-quality rule_
- [ ] Verify: все 6 сценариев FAIL (Red) — `npx vitest run tests/e2e/docker-test-tee.test.ts` exits non-zero

## Phase 1: Patch docker-test.sh (Green)

> Реализовать persistent log через tee. Сценарии FBOL001_01..04 переходят Red → Green.

- [ ] Отредактировать `scripts/docker-test.sh`: добавить блок инициализации LOG_DIR/LOG_FILE + `mkdir -p` ПОСЛЕ `set -o pipefail` (строка 6) -- @feature1
  _Requirements: [FR-1](FR.md#fr-1-persistent-log-для-docker-testsh-output), [FR-3](FR.md#fr-3-directory-lifecycle--dev-pomogatordocker-status-создаётся-безопасно)_
  _Source: DESIGN.md "Алгоритм (docker-test.sh patch)" шаги 1-3_
- [ ] Отредактировать `scripts/docker-test.sh`: добавить `echo "[docker-test] Log: $LOG_FILE"` непосредственно перед блоком docker compose run -- @feature1
  _Requirements: [FR-1](FR.md#fr-1-persistent-log-для-docker-testsh-output), [NFR Usability](NFR.md#usability)_
- [ ] Отредактировать `scripts/docker-test.sh`: изменить строки 69-72 — в конец invocation добавить `2>&1 | tee -a "$LOG_FILE"` -- @feature1
  _Requirements: [FR-1](FR.md#fr-1-persistent-log-для-docker-testsh-output), [FR-5](FR.md#fr-5-exit-code-preservation--regression-guard)_
  _Source: DESIGN.md "Patch diff (indicative)" шаг 3_
- [ ] Verify: сценарии @feature1 (FBOL001_01..04) переходят из Red в Green — `npx vitest run tests/e2e/docker-test-tee.test.ts -t "FBOL001_0[1-4]"` exits zero

## Phase 2: Update rule no-blocking-on-tests (Green)

> Добавить Anti-pattern секцию. Сценарий FBOL001_05 переходит Red → Green.

- [ ] Отредактировать `.claude/rules/pomogator/no-blocking-on-tests.md`: добавить секцию `## Anti-pattern: naked \`| tail\` в bg` после существующего "Чеклист" -- @feature2
  _Requirements: [FR-2](FR.md#fr-2-обновить-rule-no-blocking-on-tests--запрет-naked--tail-в-bg)_
  _Source: DESIGN.md "Алгоритм (rule update)" шаги 1-4_
  _Content: reasoning (H1/H2/H3 hypotheses одной строкой каждая со ссылкой на `.specs/fix-bg-output-loss/RESEARCH.md`), Неправильно (naked `| tail`), Правильно (`tee /tmp/full.log | tail -N` ИЛИ `&> /tmp/full.log; tail -N`)_
- [ ] Добавить в секцию "Чеклист" новый bullet: `- [ ] Bg команда с \`| tail\` использует \`| tee <path> | tail -N\` (не naked tail)` -- @feature2
  _Requirements: [FR-2](FR.md#fr-2-обновить-rule-no-blocking-on-tests--запрет-naked--tail-в-bg)_
- [ ] Verify: сценарий @feature2 (FBOL001_05) переходит Red → Green — `npx vitest run tests/e2e/docker-test-tee.test.ts -t "FBOL001_05"` exits zero

## Phase 3: Gitignore Verification + Refactor

> Подтвердить gitignore coverage. Сценарий FBOL001_06 должен быть Green без code changes (существующий `.dev-pomogator/` entry покрывает).

- [ ] Запустить `grep -n "\.dev-pomogator" .gitignore` и задокументировать результат в RESEARCH.md (уже сделано в Phase 1.5) — нет code changes, только verification -- @feature3
  _Requirements: [FR-4](FR.md#fr-4-log-rotation--gitignore--не-коммитить-test-run-log)_
- [ ] Verify: сценарий @feature3 (FBOL001_06) Green — `npx vitest run tests/e2e/docker-test-tee.test.ts -t "FBOL001_06"` exits zero
- [ ] Полный прогон: `npx vitest run tests/e2e/docker-test-tee.test.ts` — все 6 тестов Green, exit 0
- [ ] Рефакторинг: если есть дублирование setup между it-блоками — извлечь в beforeEach/helper (per `no-test-helper-duplication` rule)
- [ ] Финальный `/simplify` проход на всех изменённых файлах (spec + code + tests + rule)

## Definition of Done

- [ ] Все 6 сценариев FBOL001_01..06 Green
- [ ] `scripts/docker-test.sh` после patch проходит shellcheck (если установлен) без errors
- [ ] Rule `no-blocking-on-tests.md` содержит Anti-pattern секцию и updated checklist
- [ ] `validate-spec.ts` — `valid: true`, errors: []
- [ ] Manual smoke: `bash scripts/docker-test.sh true` создаёт log файл, `bash scripts/docker-test.sh false` возвращает exit 1 и log содержит output
- [ ] Нет regression в существующих CORE tests — `/run-tests` background прогон полной suite Green
