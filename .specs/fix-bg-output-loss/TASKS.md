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
  _Requirements: [FR-1](FR.md#fr-1-persistent-log-для-docker-testsh-output), [FR-2](FR.md#fr-2-обновить-rule-no-blocking-on-tests-запрет-naked-tail-в-bg), [FR-3](FR.md#fr-3-directory-lifecycle-dev-pomogatordocker-status-создаётся-безопасно), [FR-4](FR.md#fr-4-log-rotation-gitignore-не-коммитить-test-run-log), [FR-5](FR.md#fr-5-exit-code-preservation-regression-guard)_
  _Naming: describe(`FBOL001: Fix Background Output Loss`) + it(`FBOL001_NN: ...`) per extension-test-quality rule_
- [ ] Verify: все 6 сценариев FAIL (Red) — `npx vitest run tests/e2e/docker-test-tee.test.ts` exits non-zero

## Phase 1: Patch docker-test.sh (Green)

> Реализовать persistent log через tee. Сценарии FBOL001_01..04 переходят Red → Green.

- [ ] Отредактировать `scripts/docker-test.sh`: добавить блок инициализации LOG_DIR/LOG_FILE + `mkdir -p` ПОСЛЕ `set -o pipefail` (строка 6) -- @feature1
  _Requirements: [FR-1](FR.md#fr-1-persistent-log-для-docker-testsh-output), [FR-3](FR.md#fr-3-directory-lifecycle-dev-pomogatordocker-status-создаётся-безопасно)_
  _Source: DESIGN.md "Алгоритм (docker-test.sh patch)" шаги 1-3_
- [ ] Отредактировать `scripts/docker-test.sh`: добавить `echo "[docker-test] Log: $LOG_FILE"` непосредственно перед блоком docker compose run -- @feature1
  _Requirements: [FR-1](FR.md#fr-1-persistent-log-для-docker-testsh-output), [NFR Usability](NFR.md#usability)_
- [ ] Отредактировать `scripts/docker-test.sh`: изменить строки 69-72 — в конец invocation добавить `2>&1 | tee -a "$LOG_FILE"` -- @feature1
  _Requirements: [FR-1](FR.md#fr-1-persistent-log-для-docker-testsh-output), [FR-5](FR.md#fr-5-exit-code-preservation-regression-guard)_
  _Source: DESIGN.md "Patch diff (indicative)" шаг 3_
- [ ] Verify: сценарии @feature1 (FBOL001_01..04) переходят из Red в Green — `npx vitest run tests/e2e/docker-test-tee.test.ts -t "FBOL001_0[1-4]"` exits zero

## Phase 2: Update rule no-blocking-on-tests (Green)

> Добавить Anti-pattern секцию. Сценарий FBOL001_05 переходит Red → Green.

- [ ] Отредактировать `.claude/rules/pomogator/no-blocking-on-tests.md`: добавить секцию `## Anti-pattern: naked \`| tail\` в bg` после существующего "Чеклист" -- @feature2
  _Requirements: [FR-2](FR.md#fr-2-обновить-rule-no-blocking-on-tests-запрет-naked-tail-в-bg)_
  _Source: DESIGN.md "Алгоритм (rule update)" шаги 1-4_
  _Content: reasoning (H1/H2/H3 hypotheses одной строкой каждая со ссылкой на `.specs/fix-bg-output-loss/RESEARCH.md`), Неправильно (naked `| tail`), Правильно (`tee /tmp/full.log | tail -N` ИЛИ `&> /tmp/full.log; tail -N`)_
- [ ] Добавить в секцию "Чеклист" новый bullet: `- [ ] Bg команда с \`| tail\` использует \`| tee <path> | tail -N\` (не naked tail)` -- @feature2
  _Requirements: [FR-2](FR.md#fr-2-обновить-rule-no-blocking-on-tests-запрет-naked-tail-в-bg)_
- [ ] Verify: сценарий @feature2 (FBOL001_05) переходит Red → Green — `npx vitest run tests/e2e/docker-test-tee.test.ts -t "FBOL001_05"` exits zero

## Phase 3: Gitignore Verification + Refactor

> Подтвердить gitignore coverage. Сценарий FBOL001_06 должен быть Green без code changes (существующий `.dev-pomogator/` entry покрывает).

- [ ] Запустить `grep -n "\.dev-pomogator" .gitignore` и задокументировать результат в RESEARCH.md (уже сделано в Phase 1.5) — нет code changes, только verification -- @feature3
  _Requirements: [FR-4](FR.md#fr-4-log-rotation-gitignore-не-коммитить-test-run-log)_
- [ ] Verify: сценарий @feature3 (FBOL001_06) Green — `npx vitest run tests/e2e/docker-test-tee.test.ts -t "FBOL001_06"` exits zero
- [ ] Полный прогон: `npx vitest run tests/e2e/docker-test-tee.test.ts` — все 6 тестов Green, exit 0
- [ ] Рефакторинг: если есть дублирование setup между it-блоками — извлечь в beforeEach/helper (per `no-test-helper-duplication` rule)
- [ ] Финальный `/simplify` проход на всех изменённых файлах (spec + code + tests + rule)

## Phase 4: Generic bg-log.sh wrapper (Green) — v0.2.0

> Расширение scope от docker-only до generic long bg commands. Сценарии FBOL002_01..03 переходят Red → Green.

- [ ] T-7: Создать `scripts/bg-log.sh` — generic wrapper ~30 строк -- @feature7
  _Done When:_ `bash scripts/bg-log.sh smoke echo "hello"` создаёт `.dev-pomogator/.bg-logs/<epoch>-smoke.log` со словом "hello"; exit code 0
  _Status:_ Pending
  _Est:_ 15min
  _Requirements: [FR-7](FR.md#fr-7-deprecated-replaced-by-fr-11-in-v030)_
  _Source: DESIGN.md "Generic bg-log.sh architecture" Algorithm steps 1-5_

- [ ] T-8: Обновить `.claude/rules/pomogator/no-blocking-on-tests.md` — Confirmed Anthropic bugs + Preferred file-redirect pattern subsections -- @feature8
  _Done When:_ rule содержит 4 markdown ссылки на github.com/anthropics/claude-code/issues/{16305,21915,36915,50616} + file-redirect pattern + scripts/bg-log.sh reference; existing v0.1.0 sections preserved
  _Status:_ Pending
  _Est:_ 20min
  _Requirements: [FR-8](FR.md#fr-8-rule-update-confirmed-anthropic-bug-citations-file-redirect-pattern-v020)_

- [ ] T-9: Добавить BDD scenarios FBOL002_01..03 в `tests/features/fix-bg-output-loss.feature` -- @feature7
  _Done When:_ feature содержит `# @feature7` tag + 3 Scenario блока (wraps echo, preserves exit code, sanitizes slug)
  _Status:_ Pending
  _Est:_ 15min
  _Requirements: [FR-7](FR.md#fr-7-deprecated-replaced-by-fr-11-in-v030), [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-deprecated-replaced-by-ac-11-in-v030)_

- [ ] T-10: Создать `tests/e2e/bg-log-helper.test.ts` — integration test через spawnSync -- @feature7
  _Done When:_ файл содержит describe `FBOL002: Bg-log helper` + 3 it() блока с CODE_NN matching .feature scenarios; tests PASS green
  _Status:_ Pending
  _Est:_ 30min
  _Requirements: [FR-7](FR.md#fr-7-deprecated-replaced-by-fr-11-in-v030), [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-deprecated-replaced-by-ac-11-in-v030)_
  _Naming: per extension-test-quality rule_

- [ ] T-11: Записать feedback memory `feedback_bg-tail-windows-claude-code-bugs.md` + обновить MEMORY.md index
  _Done When:_ файл существует в `~/.claude/projects/D--repos-dev-pomogator/memory/` с frontmatter (type=feedback) + rule + Why (4 issue links + 25-min incident) + How to apply; MEMORY.md содержит 1 line index entry
  _Status:_ Pending
  _Est:_ 10min
  _Requirements: [FR-6](FR.md#fr-6-feedback-memory-anti-pattern-зафиксирован-в-personal-memory-out-of-scope-частично) (runtime, post-spec)_

- [ ] T-12: Verification — validate-spec + audit-spec + /run-tests filter FBOL002 + manual smoke
  _Done When:_ validate-spec.ts → 0 errors; audit-spec → 0 ERRORS / 0 OMISSIONS; FBOL002_01..03 green в /run-tests; existing FBOL001 still green (no regression)
  _Status:_ Pending
  _Est:_ 20min

## Definition of Done

### v0.1.0
- [ ] Все 6 сценариев FBOL001_01..06 Green
- [ ] `scripts/docker-test.sh` после patch проходит shellcheck (если установлен) без errors
- [ ] Rule `no-blocking-on-tests.md` содержит Anti-pattern секцию и updated checklist
- [ ] `validate-spec.ts` — `valid: true`, errors: []
- [ ] Manual smoke: `bash scripts/docker-test.sh true` создаёт log файл, `bash scripts/docker-test.sh false` возвращает exit 1 и log содержит output
- [ ] Нет regression в существующих CORE tests — `/run-tests` background прогон полной suite Green

### v0.2.0 (extension)
- [~] ~~Все 3 сценария FBOL002_01..03 Green~~ DEPRECATED v0.3.0 (FBOL002 removed)
- [~] ~~`scripts/bg-log.sh` создан~~ DEPRECATED v0.3.0 (replaced by FR-11 generic adapter)
- [x] Rule содержит ровно 4 markdown ссылки на github.com/anthropics/claude-code/issues
- [x] Rule содержит preferred file-redirect pattern example для dotnet/pytest/cargo
- [x] Feedback memory записан в `~/.claude/projects/D--repos-dev-pomogator/memory/`
- [x] MEMORY.md index обновлён
- [x] CHANGELOG v0.2.0 - 2026-05-11 entry присутствует
- [x] FR-9 явно помечен `[OUT_OF_SCOPE: defer to follow-up]`

### v0.3.0 (refactor)

- [x] T-11: scripts/bg-log.sh + tests/e2e/bg-log-helper.test.ts deleted
- [x] T-11: FBOL002 scenarios removed from both .feature files
- [x] T-11: FR-7 + AC-7 marked DEPRECATED
- [x] T-12: generic_adapter.ts created (5 lines PassthroughAdapter)
- [x] T-12: 'generic' added to TestFramework union (types.ts)
- [x] T-12: 'generic' added to KNOWN_FRAMEWORKS + getAdapter() switch (test_runner_wrapper.ts)
- [x] T-12: dispatch.ts DISPATCH/FILTER_FORMAT/getFrameworkInfo records for generic
- [x] T-12: smoke test passed — `--framework generic -- echo hello` creates log, YAML status `framework: generic, state: passed`
- [x] T-13: test_guard.ts BLOCKED_PATTERNS restructured to Array<{pattern, framework}>
- [x] T-13: buildConvertedCommand() generates ready-to-paste wrapper invocation
- [x] T-13: deny-message contains `--framework <fw> -- <orig>` smart-converted string
- [x] T-14: /run-tests SKILL.md description updated (8 trigger keywords)
- [x] T-14: SKILL.md body contains Generic mode section with examples
- [x] T-15: spec FR.md/AC.md/REQUIREMENTS.md/CHANGELOG.md/DESIGN.md/README.md/USE_CASES.md/USER_STORIES.md updated for v0.3.0
- [ ] T-16: ANALYSIS_SKILL_TRIGGER.md created with 6 sections + recommendations
- [ ] T-17: BENCHMARK.md created with 3 sections (trigger rate + performance + reliability)
- [ ] T-18: installer hook path investigation (FR-16 conditional)
- [ ] T-19: feedback memory updated — remove bg-log.sh references, point to /run-tests + generic
- [ ] T-20: final verification — validate-spec + audit-spec + smoke + no regression
