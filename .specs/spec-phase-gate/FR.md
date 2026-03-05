# Functional Requirements (FR)

---

## Phase Gate (PreToolUse Hook)

---

## FR-1: PreToolUse hook блокирует запись в файлы будущих фаз @feature1

PreToolUse hook (`phase-gate.ts`) ДОЛЖЕН перехватывать вызовы Write и Edit для файлов внутри `.specs/<feature>/` и блокировать запись, если целевой файл принадлежит фазе, для которой предыдущая СТОП-точка ещё не подтверждена.

Маппинг файлов на фазы:
- **Discovery**: USER_STORIES.md, USE_CASES.md, RESEARCH.md
- **Requirements**: REQUIREMENTS.md, FR.md, NFR.md, ACCEPTANCE_CRITERIA.md, DESIGN.md, FILE_CHANGES.md, *.feature
- **Finalization**: TASKS.md, README.md, CHANGELOG.md

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
**Use Case:** [UC-1](USE_CASES.md#uc-1-блокировка-записи-в-файл-будущей-фазы)

---

## FR-2: Hook читает состояние из .progress.json @feature1

Hook ДОЛЖЕН читать `.specs/<feature>/.progress.json` для определения текущей фазы и статуса СТОП-точек. Файл содержит объект с ключами фаз (Discovery, Context, Requirements, Finalization), каждый с полем `stopConfirmed: boolean`.

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
**Use Case:** [UC-1](USE_CASES.md#uc-1-блокировка-записи-в-файл-будущей-фазы)

---

## FR-3: Hook возвращает deny с exit code 2 при блокировке @feature1

При обнаружении записи в файл будущей фазы hook ДОЛЖЕН:
1. Вывести в stdout JSON: `{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": "<сообщение>"}}`
2. Завершиться с exit code 2

Сообщение ДОЛЖНО содержать номер СТОП-точки и команду для подтверждения.

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
**Use Case:** [UC-1](USE_CASES.md#uc-1-блокировка-записи-в-файл-будущей-фазы)

---

## FR-4: Hook работает в режиме fail-open @feature1

При любой ошибке (отсутствие `.progress.json`, ошибка парсинга JSON, ошибка чтения файла, неизвестный файл) hook ДОЛЖЕН завершиться с exit code 0, разрешая операцию. Ошибка ДОЛЖНА быть записана в stderr для диагностики.

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
**Use Case:** [UC-4](USE_CASES.md#uc-4-отсутствие-progressjson-fail-open), [UC-8](USE_CASES.md#uc-8-ошибка-чтения-progressjson-fail-open)

---

## FR-5: Hook пропускает файлы вне .specs/ @feature1

Если путь файла из `tool_input.file_path` не содержит сегмент `.specs/`, hook ДОЛЖЕН немедленно завершиться с exit code 0, не выполняя никаких проверок.

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)
**Use Case:** [UC-3](USE_CASES.md#uc-3-файл-вне-specs-pass-through)

---

## FR-6: .feature файл привязан к фазе Requirements @feature1

Файл `<feature-slug>.feature` ДОЛЖЕН быть привязан к фазе Requirements. Запись в `.feature` ДОЛЖНА быть заблокирована, если STOP #1 (Discovery) не подтверждён.

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)
**Use Case:** [UC-1](USE_CASES.md#uc-1-блокировка-записи-в-файл-будущей-фазы)

---

## FR-7: UserPromptSubmit hook инжектирует статус фазы @feature2

Расширенный UserPromptSubmit hook (`validate-specs.ts`) ДОЛЖЕН при обнаружении `.progress.json` выводить в stdout текущую фазу, список разрешённых файлов для записи и список заблокированных файлов с указанием, какой STOP нужно подтвердить для разблокировки.

**Связанные AC:** [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)
**Use Case:** [UC-5](USE_CASES.md#uc-5-инжекция-статуса-фазы-в-промпт)

---

## Spec Quality Audit

---

## FR-8: Audit обнаруживает partial implementation @feature3

`audit-spec.ps1` ДОЛЖЕН обнаруживать ситуацию, когда задача в TASKS.md помечена как выполненная (`[x]`), но связанный FR в FR.md содержит маркер "НЕ РЕАЛИЗОВАНО" (или "NOT IMPLEMENTED"). Severity: ERROR.

Формат вывода: `PARTIAL_IMPL: FR-N "НЕ РЕАЛИЗОВАНО" but task [x] in TASKS.md`.

**Связанные AC:** [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8)
**Use Case:** [UC-6](USE_CASES.md#uc-6-обнаружение-partial-implementation)

---

## FR-9: Audit проверяет task-FR atomicity @feature3

`audit-spec.ps1` ДОЛЖЕН проверять, что каждая задача в TASKS.md ссылается не более чем на 1 FR. Если задача ссылается на >1 FR (например, `_Requirements: FR-1, FR-3_`), это WARNING: `TASK_ATOMICITY: task "<id>" references >1 FR`.

**Связанные AC:** [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9)
**Use Case:** [UC-6](USE_CASES.md#uc-6-обнаружение-partial-implementation)

---

## FR-10: Audit проверяет FR split consistency @feature3

`audit-spec.ps1` ДОЛЖЕН обнаруживать несогласованность decomposition: если существует FR-Na (sub-variant), но аналогичный FR-M не имеет sub-variants при схожей структуре. Severity: INFO.

Формат вывода: `FR_SPLIT_CONSISTENCY: FR-N has sub-variants (FR-Na) but FR-M does not`.

**Связанные AC:** [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10)
**Use Case:** [UC-7](USE_CASES.md#uc-7-обнаружение-fr-split-inconsistency)

---

## FR-11: Audit проверяет BDD scenario scope gap @feature3

`audit-spec.ps1` ДОЛЖЕН обнаруживать FR, которые имеют AC, но не имеют соответствующего BDD сценария в `.feature` файле (через @featureN теги). Severity: WARNING.

Формат вывода: `BDD_SCOPE_GAP: FR-N has AC-N but no BDD scenario with @featureN`.

**Связанные AC:** [AC-11](ACCEPTANCE_CRITERIA.md#ac-11-fr-11)
**Use Case:** [UC-6](USE_CASES.md#uc-6-обнаружение-partial-implementation)

---

## Spec Quality Rules

---

## FR-12: Правило FR Variant Decomposition @feature4

В `specs-management.md` ДОЛЖНО быть добавлено правило: если FR имеет несколько вариантов реализации (например, разные алгоритмы, разные источники данных), каждый вариант ДОЛЖЕН быть выделен в sub-FR (FR-Na, FR-Nb, ...). Каждый sub-FR ДОЛЖЕН иметь свой AC, BDD сценарий и задачу в TASKS.md.

**Связанные AC:** [AC-12](ACCEPTANCE_CRITERIA.md#ac-12-fr-12)
**Use Case:** [UC-7](USE_CASES.md#uc-7-обнаружение-fr-split-inconsistency)

---

## FR-13: Правило Task Completion Integrity @feature4

В `specs-management.md` ДОЛЖНО быть добавлено правило: задача в TASKS.md НЕ МОЖЕТ быть помечена `[x]` если связанный FR содержит маркеры незавершённости ("НЕ РЕАЛИЗОВАНО", "TODO", "STUB", "NOT IMPLEMENTED"). Нарушение = ERROR при аудите.

**Связанные AC:** [AC-13](ACCEPTANCE_CRITERIA.md#ac-13-fr-13)
**Use Case:** [UC-6](USE_CASES.md#uc-6-обнаружение-partial-implementation)

---

## FR-14: Правило AC Scope Match @feature4

В `specs-management.md` ДОЛЖНО быть добавлено правило: каждый AC ДОЛЖЕН покрывать scope ровно одного FR. Если AC ссылается на несколько FR или не ссылается ни на один — это WARNING при аудите.

**Связанные AC:** [AC-14](ACCEPTANCE_CRITERIA.md#ac-14-fr-14)
**Use Case:** [UC-7](USE_CASES.md#uc-7-обнаружение-fr-split-inconsistency)
