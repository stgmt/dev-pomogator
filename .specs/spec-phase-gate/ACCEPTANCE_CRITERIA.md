# Acceptance Criteria (EARS)

---

## Phase Gate (PreToolUse Hook)

---

## AC-1 (FR-1): Блокировка записи в файл будущей фазы @feature1

**Требование:** [FR-1](FR.md#fr-1-pretooluse-hook-блокирует-запись-в-файлы-будущих-фаз)

WHEN Claude вызывает Write или Edit для файла в `.specs/<feature>/` AND файл принадлежит фазе, для которой предыдущая СТОП-точка не подтверждена THEN PreToolUse hook SHALL вернуть `permissionDecision: "deny"` и завершиться с exit code 2.

WHEN Claude вызывает Write или Edit для файла текущей или подтверждённой фазы THEN PreToolUse hook SHALL завершиться с exit code 0 (разрешить операцию).

---

## AC-2 (FR-2): Чтение состояния из .progress.json @feature1

**Требование:** [FR-2](FR.md#fr-2-hook-читает-состояние-из-progressjson)

WHEN PreToolUse hook обрабатывает запрос на запись в `.specs/<feature>/` THEN hook SHALL прочитать `.specs/<feature>/.progress.json` и извлечь статус `stopConfirmed` для каждой фазы.

WHEN `.progress.json` содержит `Discovery.stopConfirmed = true` AND `Requirements.stopConfirmed = false` THEN hook SHALL определить текущую фазу как Requirements и разрешить запись только в файлы Discovery и Requirements.

---

## AC-3 (FR-3): Формат deny-ответа @feature1

**Требование:** [FR-3](FR.md#fr-3-hook-возвращает-deny-с-exit-code-2-при-блокировке)

WHEN hook блокирует запись THEN hook SHALL вывести в stdout JSON-объект с полями `hookSpecificOutput.hookEventName = "PreToolUse"`, `hookSpecificOutput.permissionDecision = "deny"`, `hookSpecificOutput.permissionDecisionReason` содержащим номер STOP и команду подтверждения.

WHEN hook блокирует запись THEN hook SHALL завершиться с exit code 2 (не 0, не 1).

---

## AC-4 (FR-4): Fail-open при ошибках @feature1

**Требование:** [FR-4](FR.md#fr-4-hook-работает-в-режиме-fail-open)

IF `.progress.json` не существует THEN hook SHALL завершиться с exit code 0 (разрешить запись).

IF `.progress.json` содержит невалидный JSON THEN hook SHALL записать ошибку в stderr AND завершиться с exit code 0.

IF произошла ошибка чтения файловой системы THEN hook SHALL записать ошибку в stderr AND завершиться с exit code 0.

IF имя файла не найдено в маппинге фаз THEN hook SHALL завершиться с exit code 0.

---

## AC-5 (FR-5): Pass-through для файлов вне .specs/ @feature1

**Требование:** [FR-5](FR.md#fr-5-hook-пропускает-файлы-вне-specs)

WHEN `tool_input.file_path` не содержит сегмент `.specs/` THEN hook SHALL немедленно завершиться с exit code 0 без чтения `.progress.json`.

---

## AC-6 (FR-6): .feature файл в фазе Requirements @feature1

**Требование:** [FR-6](FR.md#fr-6-feature-файл-привязан-к-фазе-requirements)

WHEN Claude вызывает Write для `.specs/<feature>/<feature>.feature` AND Discovery.stopConfirmed = false THEN hook SHALL вернуть deny с сообщением "STOP #1 (Discovery) не подтверждён".

WHEN Discovery.stopConfirmed = true THEN hook SHALL разрешить запись в `.feature` файл.

---

## AC-7 (FR-7): Инжекция статуса фазы в промпт @feature2

**Требование:** [FR-7](FR.md#fr-7-userpromptsubmit-hook-инжектирует-статус-фазы)

WHEN UserPromptSubmit hook обнаруживает `.specs/<feature>/.progress.json` THEN hook SHALL вывести в stdout блок статуса, содержащий текущую фазу, разрешённые файлы и заблокированные файлы.

IF `.progress.json` не существует или повреждён THEN UserPromptSubmit hook SHALL пропустить инжекцию статуса фазы и продолжить остальные проверки.

---

## Spec Quality Audit

---

## AC-8 (FR-8): Обнаружение partial implementation @feature3

**Требование:** [FR-8](FR.md#fr-8-audit-обнаруживает-partial-implementation)

WHEN `audit-spec.ps1` находит задачу в TASKS.md помеченную `[x]` AND связанный FR содержит строку "НЕ РЕАЛИЗОВАНО" или "NOT IMPLEMENTED" THEN audit SHALL вывести ERROR: `PARTIAL_IMPL: FR-N "НЕ РЕАЛИЗОВАНО" but task [x] in TASKS.md`.

WHEN задача помечена `[x]` AND связанный FR не содержит маркеров незавершённости THEN audit SHALL не генерировать PARTIAL_IMPL ошибку.

WHEN задача помечена `[ ]` AND FR содержит "НЕ РЕАЛИЗОВАНО" THEN audit SHALL не генерировать PARTIAL_IMPL ошибку (ожидаемое состояние).

---

## AC-9 (FR-9): Task-FR atomicity @feature3

**Требование:** [FR-9](FR.md#fr-9-audit-проверяет-task-fr-atomicity)

WHEN `audit-spec.ps1` находит задачу в TASKS.md с `_Requirements: FR-1, FR-3_` (ссылки на >1 FR) THEN audit SHALL вывести WARNING: `TASK_ATOMICITY: task "<id>" references >1 FR`.

WHEN задача ссылается ровно на 1 FR THEN audit SHALL не генерировать TASK_ATOMICITY предупреждение.

---

## AC-10 (FR-10): FR split consistency @feature3

**Требование:** [FR-10](FR.md#fr-10-audit-проверяет-fr-split-consistency)

WHEN `audit-spec.ps1` обнаруживает FR-Na (sub-variant) в FR.md AND существует FR-M без sub-variants при наличии аналогичной структуры THEN audit SHALL вывести INFO: `FR_SPLIT_CONSISTENCY: FR-N has sub-variants but FR-M does not`.

IF в FR.md нет sub-variants (нет заголовков вида `## FR-Na:`) THEN audit SHALL пропустить проверку FR_SPLIT_CONSISTENCY.

---

## AC-11 (FR-11): BDD scenario scope gap @feature3

**Требование:** [FR-11](FR.md#fr-11-audit-проверяет-bdd-scenario-scope-gap)

WHEN `audit-spec.ps1` находит FR-N с соответствующим AC-N AND `.feature` файл не содержит `@featureN` тег для данного FR THEN audit SHALL вывести WARNING: `BDD_SCOPE_GAP: FR-N has AC-N but no BDD scenario with @featureN`.

WHEN FR-N имеет AC-N AND `.feature` содержит сценарий с `# @featureN` THEN audit SHALL не генерировать BDD_SCOPE_GAP.

---

## Spec Quality Rules

---

## AC-12 (FR-12): FR Variant Decomposition @feature4

**Требование:** [FR-12](FR.md#fr-12-правило-fr-variant-decomposition)

WHEN FR описывает несколько вариантов реализации THEN specs-management.md SHALL требовать decomposition в sub-FR (FR-Na, FR-Nb).

WHEN sub-FR создан THEN specs-management.md SHALL требовать наличие отдельного AC, BDD сценария и задачи для каждого sub-FR.

---

## AC-13 (FR-13): Task Completion Integrity @feature4

**Требование:** [FR-13](FR.md#fr-13-правило-task-completion-integrity)

WHEN задача в TASKS.md помечена `[x]` AND связанный FR содержит маркеры "НЕ РЕАЛИЗОВАНО", "TODO", "STUB" или "NOT IMPLEMENTED" THEN audit SHALL вывести ERROR.

IF задача помечена `[ ]` THEN правило Task Completion Integrity SHALL не применяться к данной задаче.

---

## AC-14 (FR-14): AC Scope Match @feature4

**Требование:** [FR-14](FR.md#fr-14-правило-ac-scope-match)

WHEN AC ссылается на несколько FR (например, `AC-1 (FR-1, FR-3)`) THEN audit SHALL вывести WARNING: `AC_SCOPE_MISMATCH: AC-N references multiple FRs`.

WHEN AC не ссылается ни на один FR THEN audit SHALL вывести WARNING: `AC_SCOPE_MISMATCH: AC-N has no FR reference`.

WHEN AC ссылается ровно на один FR THEN audit SHALL не генерировать AC_SCOPE_MISMATCH.
