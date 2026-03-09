# Tasks

## TDD Workflow

> Задачи организованы по TDD: Red -> Green -> Refactor.
> Каждый этап реализации начинается с .feature сценария (Red), затем реализация (Green), затем рефакторинг.

## Phase 0: BDD Foundation (Red)

> Создать .feature файл, step definitions, и BDD hooks ПЕРЕД реализацией бизнес-логики.
> Все сценарии должны FAIL (Red) на этом этапе.
>
> **Если DESIGN.md содержит `TEST_DATA_ACTIVE`** — Phase 0 ОБЯЗАН содержать задачу
> для каждого hook из DESIGN.md "Новые hooks" и каждого fixture из "Test Data & Fixtures".
> Если `TEST_DATA_NONE` — hook-задачи не нужны.

- [ ] {Создать/обновить .feature файл с BDD сценариями}
- [ ] {Создать step definitions (заглушки с PendingStepException/throw)}
- [ ] {Создать hook: `{путь}` ({тип}, {scope}) — cleanup для {описание данных}}
  _Source: DESIGN.md "BDD Test Infrastructure" > "Новые hooks"_
  _Reuse: {путь к существующему hook, если применимо}_
- [ ] {Создать fixture: `{путь}` — {назначение}, lifecycle: {per-scenario/per-feature/shared}}
  _Source: DESIGN.md "BDD Test Infrastructure" > "Test Data & Fixtures"_
- [ ] {Убедиться что все сценарии FAIL (Red)}

## Phase 1: {Этап реализации 1} (Green)

> Реализовать код, чтобы BDD сценарии начали проходить.

- [ ] {Задача 1.1} -- @featureN
  _Requirements: [FR-N](FR.md#fr-n-{название})_
- [ ] {Задача 1.2} -- @featureN
  _Requirements: [FR-N](FR.md#fr-n-{название})_
- [ ] {Verify: сценарии @featureN переходят из Red в Green}

## Phase 2: {Этап реализации 2} (Green)

- [ ] {Задача 2.1} -- @featureN
  _Requirements: [FR-N](FR.md#fr-n-{название})_
- [ ] {Задача 2.2} -- @featureN
  _Requirements: [FR-N](FR.md#fr-n-{название})_
- [ ] {Verify: сценарии @featureN переходят из Red в Green}

## Phase 3: Refactor & Polish

- [ ] {Рефакторинг после прохождения всех сценариев}
- [ ] {Все BDD сценарии GREEN}
- [ ] {E2E тест-план выполнен}
