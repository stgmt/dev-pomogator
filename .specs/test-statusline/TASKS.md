# Tasks

## TDD Workflow

> Задачи организованы по TDD: Red -> Green -> Refactor.
> Каждый этап реализации начинается с .feature сценария (Red), затем реализация (Green), затем рефакторинг.

## Phase 0: BDD Foundation (Red)

> Создать .feature файл, step definitions, и BDD hooks ПЕРЕД реализацией бизнес-логики.
> Все сценарии должны FAIL (Red) на этом этапе.

- [x] Скопировать .feature файл в `tests/features/plugins/test-statusline/PLUGIN011_test-statusline.feature`
  _Source: `.specs/test-statusline/test-statusline.feature`_
- [x] Создать step definitions (заглушки): `tests/e2e/test-statusline.test.ts`
  _Requirements: все FR_
- [x] Создать hooks: beforeEach/afterEach в test-statusline.test.ts — создание/удаление temp .test-status/ директории
  _Source: DESIGN.md "BDD Test Infrastructure" > "Новые hooks"_
  _Reuse: `tests/fixtures/learnings-capture/` (cleanup pattern)_
- [x] Создать fixtures: `tests/fixtures/test-statusline/` — mock-status-running.yaml, mock-status-passed.yaml, mock-status-failed.yaml, mock-status-corrupted.yaml, mock-stdin.json (все shared, read-only)
  _Source: DESIGN.md "BDD Test Infrastructure" > "Test Data & Fixtures"_
- [x] Verify: все 19 сценариев FAIL (Red)

## Phase 1: Types + Statusline Render (Green) @feature1 @feature1a

> Реализовать types и statusline render script.

- [x] Создать `extensions/test-statusline/tools/test-statusline/status_types.ts` — TypeScript интерфейсы TestStatus, TestSuite, HookInput @feature2
  _Requirements: [FR-2](FR.md#fr-2-yaml-status-file-protocol-feature2)_
  _Leverage: `extensions/prompt-suggest/tools/prompt-suggest/prompt_suggest_core.ts` (interface patterns)_
- [x] Создать `extensions/test-statusline/tools/test-statusline/statusline_render.sh` — statusline render script @feature1 @feature1a
  _Requirements: [FR-1](FR.md#fr-1-statusline-render-script-feature1), [FR-1a](FR.md#fr-1a-statusline-render-graceful-degradation-feature1a)_
  _Leverage: PoC already exists, refine per specs_
- [x] Verify: сценарии PLUGIN011_01–06 (@feature1, @feature1a) переходят из Red в Green

## Phase 2: Test Runner Wrapper + YAML Protocol (Green) @feature2

> Реализовать test runner wrapper с atomic YAML writes.

- [x] Создать `extensions/test-statusline/tools/test-statusline/test_runner_wrapper.sh` — wrapper для тест-раннера @feature2
  _Requirements: [FR-4](FR.md#fr-4-test-runner-wrapper-feature2), [FR-3](FR.md#fr-3-atomic-yaml-writes-feature2), [FR-2](FR.md#fr-2-yaml-status-file-protocol-feature2)_
  _Leverage: `.claude/rules/atomic-config-save.md` (temp + rename pattern)_
- [x] Verify: сценарии PLUGIN011_07–11 (@feature2) переходят из Red в Green

## Phase 3: Session Isolation (Green) @feature3

> Реализовать session isolation через session_id prefix.

- [x] Добавить session prefix logic в statusline_render.sh и test_runner_wrapper.sh @feature3
  _Requirements: [FR-5](FR.md#fr-5-session-isolation-feature3)_
- [x] Verify: сценарии PLUGIN011_12–13 (@feature3) переходят из Red в Green

## Phase 4: SessionStart Hook (Green) @feature4

> Реализовать SessionStart hook для инициализации и cleanup.

- [x] Создать `extensions/test-statusline/tools/test-statusline/statusline_session_start.ts` — SessionStart hook @feature4
  _Requirements: [FR-6](FR.md#fr-6-sessionstart-hook-feature4), [FR-7](FR.md#fr-7-stale-session-cleanup-feature4)_
  _Leverage: `extensions/prompt-suggest/tools/prompt-suggest/prompt_suggest_core.ts` (readStdin, log), `src/scripts/tsx-runner.js` (execution)_
- [x] Verify: сценарии PLUGIN011_14–17 (@feature4) переходят из Red в Green

## Phase 5: Extension Manifest (Green) @feature5

> Создать extension.json и зарегистрировать hooks.

- [x] Создать `extensions/test-statusline/extension.json` — manifest @feature5
  _Requirements: [FR-8](FR.md#fr-8-extension-manifest-feature5)_
  _Leverage: `extensions/auto-simplify/extension.json` (template)_
- [x] Обновить `.claude/settings.json` — зарегистрировать SessionStart hook @feature5
  _Requirements: [FR-8](FR.md#fr-8-extension-manifest-feature5)_
- [x] Verify: сценарии PLUGIN011_18–19 (@feature5) переходят из Red в Green

## Phase 6: Refactor & Final Verification

- [x] Все 19 BDD сценариев GREEN
- [ ] `npm test` проходит без ошибок (pre-existing failures в specs-validator не связаны с test-statusline)
- [ ] Statusline отображается корректно в live Claude Code сессии

## Phase 7: Docker Test Isolation (Green) @feature6

> Реализовать изоляцию Docker Compose для параллельных тестовых запусков.

- [x] Добавить `image: dev-pomogator-test:local` в `docker-compose.test.yml` @feature6
  _Requirements: [FR-9](FR.md#fr-9-docker-test-isolation-feature6)_
- [x] Создать `scripts/docker-test.sh` — wrapper с `COMPOSE_PROJECT_NAME` isolation и trap cleanup @feature6
  _Requirements: [FR-9](FR.md#fr-9-docker-test-isolation-feature6)_
- [x] Обновить `package.json` `test:e2e` → `bash scripts/docker-test.sh` @feature6
  _Requirements: [FR-9](FR.md#fr-9-docker-test-isolation-feature6)_
- [x] Добавить `generateProjectName()` и Docker isolation в `dispatch.ts` @feature6
  _Requirements: [FR-9](FR.md#fr-9-docker-test-isolation-feature6)_
  _Leverage: `extensions/tui-test-runner/tools/tui-test-runner/dispatch.ts`_
- [x] Обновить SKILL.md с документацией Docker isolation @feature6
  _Files: `.claude/skills/run-tests/SKILL.md`, `extensions/tui-test-runner/skills/run-tests/SKILL.md`_
- [x] Обновить спеку test-statusline (FR-9, TASKS Phase 7, CHANGELOG, FILE_CHANGES) @feature6
- [x] Verify: `npm test` проходит (19/19 GREEN), Docker isolation с уникальным COMPOSE_PROJECT_NAME работает

## Phase 8: Hooks Integrity Guard (Green) @feature7

> Реализовать защиту от случайной очистки hooks в `.claude/settings.json`.
> Мотивация: при /simplify были случайно очищены все hooks — обнаружено только вручную, нет runtime-защиты.

- [ ] Создать `extensions/hooks-integrity/extension.json` — manifest @feature7
  _Requirements: [FR-10](FR.md#fr-10-hooks-integrity-guard-feature7)_
  _Leverage: `extensions/auto-simplify/extension.json` (template)_
- [ ] Создать `extensions/hooks-integrity/tools/hooks-integrity/hooks_integrity_check.ts` — SessionStart hook @feature7
  _Requirements: [FR-10](FR.md#fr-10-hooks-integrity-guard-feature7)_
  _Leverage: `src/installer/claude.ts:420-427` (smart merge), `extensions/test-statusline/tools/test-statusline/statusline_session_start.ts` (readStdin, log)_
- [ ] Зарегистрировать SessionStart hook в `.claude/settings.json` @feature7
  _Requirements: [FR-10](FR.md#fr-10-hooks-integrity-guard-feature7)_
- [ ] Создать BDD тесты: `tests/features/plugins/hooks-integrity/PLUGIN012_hooks-integrity.feature` и `tests/e2e/hooks-integrity.test.ts` @feature7
  _Requirements: [FR-10](FR.md#fr-10-hooks-integrity-guard-feature7)_
- [ ] Verify: hooks-integrity сценарии GREEN, восстановление hooks работает при SessionStart
