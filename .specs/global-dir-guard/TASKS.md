# Tasks

## TDD Workflow

> Задачи организованы по TDD: Red -> Green -> Refactor.
> Каждый этап реализации начинается с .feature сценария (Red), затем реализация (Green), затем рефакторинг.

## Phase 0: BDD Foundation (Red)

> Создать .feature файл, step definitions, и BDD hooks ПЕРЕД реализацией бизнес-логики.

- [ ] Создать `tests/features/plugins/global-dir-guard/global-dir-guard.feature` — скопировать из `.specs/global-dir-guard/global-dir-guard.feature` @feature1 @feature2 @feature3
- [ ] Создать `tests/e2e/global-dir-guard.test.ts` — скелет с describe/it для всех 8 сценариев GUARD001_01..08
  _Requirements: все FR_
- [ ] beforeEach: создать temp HOME dir, fake `~/.dev-pomogator/scripts/` с tsx-runner.js, fake `.claude/settings.json` с pomogator hooks
- [ ] afterEach: удалить temp HOME, маркер `~/.dev-pomogator-uninstalled` если создан
- [ ] Убедиться что все 8 сценариев FAIL (Red)

## Phase 1: Guard скрипт (Green) @feature1 @feature3

> Создать `global-dir-guard.ts` — детекция + recovery + логирование.

- [ ] Создать `src/guard/global-dir-guard.ts` — алгоритм из 5 шагов (DESIGN.md "Алгоритм")
  _Requirements: [FR-2](FR.md#fr-2-детекция-аномального-удаления-feature1), [FR-3](FR.md#fr-3-auto-recovery-global-scripts-feature1), [FR-5](FR.md#fr-5-диагностическое-логирование-feature3)_
  - Шаг 1: check `~/.dev-pomogator/scripts/tsx-runner.js` exists
  - Шаг 2: check маркер `~/.dev-pomogator-uninstalled`
  - Шаг 3: check project hooks в `.claude/settings.json`
  - Шаг 4: recovery — copy scripts из `__dirname` (dist/)
  - Шаг 5: re-register SessionStart hook если отсутствует
- [ ] Добавить esbuild entry в `scripts/build-check-update.js` — бандлить `src/guard/global-dir-guard.ts` → `dist/global-dir-guard.cjs`
- [ ] Verify: GUARD001_01, GUARD001_03, GUARD001_04, GUARD001_05, GUARD001_07, GUARD001_08 переходят из Red в Green

## Phase 2: Uninstall маркер (Green) @feature2

> Модифицировать uninstaller — писать маркер перед удалением.

- [ ] Редактировать `uninstall.ps1` — добавить запись маркера `~/.dev-pomogator-uninstalled` с JSON `{"timestamp":"...","source":"uninstall.ps1"}` ПЕРЕД удалением `~/.dev-pomogator/`
  _Requirements: [FR-1](FR.md#fr-1-uninstall-маркер-feature2)_
- [ ] Verify: GUARD001_02, GUARD001_06 переходят из Red в Green

## Phase 3: Hook wiring (Green) @feature1

> Подключить guard к project hooks.

- [ ] Редактировать `src/installer/claude.ts` — добавить guard hook в project `.claude/settings.json` (PreToolUse или SessionStart matcher)
  _Requirements: [FR-4](FR.md#fr-4-re-registration-sessionstart-hook-feature1)_
- [ ] Редактировать `src/installer/shared.ts` — добавить `global-dir-guard.cjs` в `setupGlobalScripts()` для копирования в `~/.dev-pomogator/scripts/`
- [ ] Verify: все 8 сценариев GREEN

## Phase 4: Refactor & Polish

- [ ] Все 8 BDD сценариев GREEN
- [ ] `npm run build` проходит без ошибок
- [ ] `npm run lint` чистый
- [ ] Guard идемпотентен — повторный запуск не ломает
