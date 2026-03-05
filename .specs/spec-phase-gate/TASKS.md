# Tasks

## TDD Workflow

> Задачи организованы по TDD: Red -> Green -> Refactor.
> Каждый этап реализации начинается с .feature сценария (Red), затем реализация (Green), затем рефакторинг.

## Phase 0: BDD Foundation (Red)

> .feature файл, step definitions и hooks создаются ПЕРЕД реализацией бизнес-логики.
> Все 23 сценария ДОЛЖНЫ FAIL (Red) на этом этапе.

- [ ] create-bdd-feature-file @feature1 @feature2 @feature3 @feature4
  **description:**
    Создать `.specs/spec-phase-gate/spec-phase-gate.feature` с 23 BDD сценариями,
    покрывающими все 4 feature-группы: PreToolUse hook (11 сценариев), phase status injection (3),
    audit checks (5), specs-management rules (4).
    **files:** `.specs/spec-phase-gate/spec-phase-gate.feature` (create)
    _Requirements: [FR-1](FR.md#fr-1-pretooluse-hook-блокирует-запись-в-файлы-будущих-фаз) thru [FR-14](FR.md#fr-14-правило-ac-scope-match)_
    **DONE** -- .feature файл уже создан

- [ ] create-step-definitions @feature1 @feature2 @feature3 @feature4
  **description:**
    Создать step definitions (заглушки с PendingStepException / throw "Not implemented")
    для всех Given/When/Then шагов из spec-phase-gate.feature.
    **files:** `tests/features/step_definitions/spec-phase-gate.steps.ts` (create)
    _Requirements: [FR-1](FR.md#fr-1-pretooluse-hook-блокирует-запись-в-файлы-будущих-фаз) thru [FR-14](FR.md#fr-14-правило-ac-scope-match)_

- [ ] verify-all-red
  **description:**
    Убедиться что все 23 BDD сценария FAIL (Red).
    Запустить тесты, зафиксировать что ни один сценарий не проходит.

---

## Phase 1: PreToolUse Hook — phase-gate.ts (Green, @feature1)

> Создать shared constants module и PreToolUse hook, зарегистрировать в extension.json и settings.json.
> После реализации: 11 сценариев @feature1 переходят из Red в Green.

- [ ] create-phase-constants @feature1
  **description:**
    Создать shared module `phase-constants.ts`, извлечённый из `validate-specs.ts:71-91`.
    Экспортирует: `PHASE_FILES`, `PHASE_ORDER`, `STOP_LABELS`, `PhaseState`, `ProgressState`, `readProgressState()`.
    **files:** `extensions/specs-workflow/tools/specs-validator/phase-constants.ts` (create)
    _Requirements: [FR-2](FR.md#fr-2-hook-читает-состояние-из-progressjson)_
    _Leverage: `extensions/specs-workflow/tools/specs-validator/validate-specs.ts` (lines 46-91, 205-214)_

- [ ] create-phase-gate-hook @feature1
  **description:**
    Создать PreToolUse hook `phase-gate.ts`. Алгоритм: stdin JSON -> extract file_path ->
    check .specs/ path -> read .progress.json -> map filename to phase -> gate decision -> deny (exit 2) or allow (exit 0).
    Fail-open на любой ошибке (exit 0 + stderr).
    **files:** `extensions/specs-workflow/tools/specs-validator/phase-gate.ts` (create)
    _Requirements: [FR-1](FR.md#fr-1-pretooluse-hook-блокирует-запись-в-файлы-будущих-фаз), [FR-3](FR.md#fr-3-hook-возвращает-deny-с-exit-code-2-при-блокировке), [FR-4](FR.md#fr-4-hook-работает-в-режиме-fail-open), [FR-5](FR.md#fr-5-hook-пропускает-файлы-вне-specs), [FR-6](FR.md#fr-6-feature-файл-привязан-к-фазе-requirements)_
    _Leverage: `extensions/specs-workflow/tools/specs-validator/phase-constants.ts`, stdin pattern from `validate-specs.ts:127-149`_

- [ ] register-hook-extension-json @feature1
  **description:**
    Добавить PreToolUse hook в `extensions/specs-workflow/extension.json`:
    - `hooks.claude[]`: `{ "event": "PreToolUse", "matcher": "Write|Edit", "command": "npx tsx .dev-pomogator/tools/specs-validator/phase-gate.ts" }`
    - `toolFiles[]`: добавить `tools/specs-validator/phase-constants.ts`, `tools/specs-validator/phase-gate.ts`
    **files:** `extensions/specs-workflow/extension.json` (edit)
    _Requirements: [FR-1](FR.md#fr-1-pretooluse-hook-блокирует-запись-в-файлы-будущих-фаз), [FR-14](FR.md#fr-14-правило-ac-scope-match)_

- [ ] register-hook-settings-json @feature1
  **description:**
    Добавить PreToolUse hook в `.claude/settings.json` (dev-repo copy):
    `hooks.PreToolUse[]: { "matcher": "Write|Edit", "command": "npx tsx .dev-pomogator/tools/specs-validator/phase-gate.ts" }`
    **files:** `.claude/settings.json` (edit)
    _Requirements: [FR-1](FR.md#fr-1-pretooluse-hook-блокирует-запись-в-файлы-будущих-фаз)_

- [ ] verify-phase1-green @feature1
  **description:**
    Verify: 11 сценариев @feature1 переходят из Red в Green.
    Тест: hook блокирует FR.md write когда Discovery не подтверждён.
    Тест: hook разрешает USER_STORIES.md write в фазе Discovery.
    Тест: hook fail-open когда .progress.json отсутствует.

---

## Phase 2: Phase Status Injection (Green, @feature2)

> Расширить validate-specs.ts: импорт shared constants + инжекция статуса фазы.
> После реализации: 3 сценария @feature2 переходят из Red в Green.

- [ ] refactor-validate-specs-imports @feature2
  **description:**
    Заменить inline constants в `validate-specs.ts` (lines 46-91, 205-214) на import из `phase-constants.ts`.
    Убедиться что существующая функциональность не сломана.
    **files:** `extensions/specs-workflow/tools/specs-validator/validate-specs.ts` (edit)
    _Requirements: [FR-7](FR.md#fr-7-userpromptsubmit-hook-инжектирует-статус-фазы)_
    _Leverage: `extensions/specs-workflow/tools/specs-validator/phase-constants.ts`_

- [ ] add-phase-status-injection @feature2
  **description:**
    Добавить в `validate-specs.ts` логику инжекции phase status banner в stdout:
    `[specs-validator] SPEC: <slug> | Phase: <phase> | STOP #N not confirmed`.
    Список allowed/blocked файлов. Graceful fallback при ошибке чтения .progress.json.
    **files:** `extensions/specs-workflow/tools/specs-validator/validate-specs.ts` (edit)
    _Requirements: [FR-7](FR.md#fr-7-userpromptsubmit-hook-инжектирует-статус-фазы)_

- [ ] update-create-spec-command @feature2
  **description:**
    Добавить в `.claude/commands/create-spec.md` phase-aware инструкцию:
    "Перед записью файла проверь phase status в начале промпта. Не пиши файлы заблокированных фаз."
    **files:** `.claude/commands/create-spec.md` (edit)
    _Requirements: [FR-7](FR.md#fr-7-userpromptsubmit-hook-инжектирует-статус-фазы)_

- [ ] verify-phase2-green @feature2
  **description:**
    Verify: 3 сценария @feature2 переходят из Red в Green.
    Тест: prompt показывает phase status для активной спеки.
    Тест: нет phase status когда .progress.json отсутствует.

---

## Phase 3: Audit Checks (Green, @feature3)

> Добавить 4 новых check в audit-spec.ps1: PARTIAL_IMPL, TASK_ATOMICITY, FR_SPLIT_CONSISTENCY, AC_SCOPE_MATCH.
> После реализации: 5 сценариев @feature3 переходят из Red в Green.

- [ ] add-partial-impl-check @feature3
  **description:**
    Добавить CHECK-9 (PARTIAL_IMPL) в `audit-spec.ps1`:
    Сканировать FR.md на маркеры ("НЕ РЕАЛИЗОВАНО", "NOT IMPLEMENTED", "PARTIAL", "TODO: implement").
    Cross-ref с TASKS.md checkboxes. ERROR если task `[x]` но FR имеет маркер.
    **files:** `extensions/specs-workflow/tools/specs-generator/audit-spec.ps1` (edit)
    _Requirements: [FR-8](FR.md#fr-8-audit-обнаруживает-partial-implementation)_

- [ ] add-task-atomicity-check @feature3
  **description:**
    Добавить CHECK-10 (TASK_ATOMICITY) в `audit-spec.ps1`:
    Парсить TASKS.md task descriptions. Считать `files:` entries в каждой задаче.
    WARNING если count > 3. Также WARNING если задача references >1 FR.
    **files:** `extensions/specs-workflow/tools/specs-generator/audit-spec.ps1` (edit)
    _Requirements: [FR-9](FR.md#fr-9-audit-проверяет-task-fr-atomicity)_

- [ ] add-fr-split-and-ac-scope-checks @feature3
  **description:**
    Добавить CHECK-11 (FR_SPLIT_CONSISTENCY) и CHECK-12 (AC_SCOPE_MATCH) в `audit-spec.ps1`:
    FR_SPLIT: найти FR-Na паттерн, проверить наличие siblings. INFO level.
    AC_SCOPE: проверить что AC ссылается ровно на 1 FR. WARNING если >1 или 0.
    **files:** `extensions/specs-workflow/tools/specs-generator/audit-spec.ps1` (edit)
    _Requirements: [FR-10](FR.md#fr-10-audit-проверяет-fr-split-consistency), [FR-11](FR.md#fr-11-audit-проверяет-bdd-scenario-scope-gap)_

- [ ] verify-phase3-green @feature3
  **description:**
    Verify: 5 сценариев @feature3 переходят из Red в Green.
    Тест: audit обнаруживает partial impl на примере zoho-ms-18210 gaps.
    Тест: audit проходит clean spec без новых issues.

---

## Phase 4: Spec Quality Rules (Green, @feature4)

> Добавить 3 новых правила в specs-management.md (обе копии) + create-spec.md.
> После реализации: 4 сценария @feature4 переходят из Red в Green.

- [ ] add-rules-to-specs-management @feature4
  **description:**
    Добавить 3 новых правила в `.claude/rules/specs-management.md`:
    1. FR Variant Decomposition: multi-variant FR -> sub-FR (FR-Na, FR-Nb) с AC/BDD/Task per variant.
    2. Task Completion Integrity: task `[x]` запрещён если FR содержит "НЕ РЕАЛИЗОВАНО"/"TODO"/"STUB".
    3. AC Scope Match: AC покрывает scope ровно одного FR.
    **files:** `.claude/rules/specs-management.md` (edit)
    _Requirements: [FR-12](FR.md#fr-12-правило-fr-variant-decomposition), [FR-13](FR.md#fr-13-правило-task-completion-integrity), [FR-14](FR.md#fr-14-правило-ac-scope-match)_

- [ ] mirror-rules-to-pomogator-copy @feature4
  **description:**
    Зеркалировать те же 3 правила в `.claude/rules/pomogator/specs-management.md`
    для консистентности обеих копий.
    **files:** `.claude/rules/pomogator/specs-management.md` (edit)
    _Requirements: [FR-12](FR.md#fr-12-правило-fr-variant-decomposition), [FR-13](FR.md#fr-13-правило-task-completion-integrity), [FR-14](FR.md#fr-14-правило-ac-scope-match)_

- [ ] verify-phase4-green @feature4
  **description:**
    Verify: 4 сценария @feature4 переходят из Red в Green.
    Тест: specs-management.md содержит FR Decomposition rule.
    Тест: specs-management.md содержит Task FR-integrity rule.
    Тест: specs-management.md содержит AC scope match rule.

---

## Phase 5: Refactor & Extension Manifest (Refactor)

> Финальная полировка: обновить extension manifest (toolFiles, version bump), финальная E2E верификация.

- [ ] update-extension-manifest-final
  **description:**
    Финальный проход по `extensions/specs-workflow/extension.json`:
    - Убедиться что `toolFiles` содержит `phase-constants.ts` и `phase-gate.ts`
    - Bump версию extension (patch increment)
    - Убедиться что `hooks.claude` содержит PreToolUse hook entry
    **files:** `extensions/specs-workflow/extension.json` (edit)
    _Requirements: [FR-14](FR.md#fr-14-правило-ac-scope-match)_

- [ ] final-e2e-verification
  **description:**
    Финальная E2E верификация: все 23 BDD сценария GREEN.
    Layer 1: hook blocks future-phase writes, allows current-phase writes, fail-open on errors.
    Layer 2: phase status injected in prompt, no status without .progress.json.
    Layer 3: audit detects partial impl, task atomicity, FR split, AC scope. Rules present in specs-management.md.
    `npm run build` -- компиляция без ошибок.
    `npm run lint` -- без warnings.

- [ ] cleanup-and-polish
  **description:**
    Рефакторинг: удалить дублирование, проверить console.log/stderr, убедиться в единообразии
    error handling паттернов между phase-gate.ts и validate-specs.ts.
    **files:** `extensions/specs-workflow/tools/specs-validator/phase-gate.ts` (edit), `extensions/specs-workflow/tools/specs-validator/validate-specs.ts` (edit)
