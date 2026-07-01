# Audit Category 2: ЛОГИЧЕСКИЕ ПРОБЕЛЫ (Logic Gaps)

**Что это:** Непокрытые требования, отсутствующие BDD-сценарии для AC, FR без связи с User Stories, разорванные цепочки трассировки.

## Checks

1. Для каждого FR-N проверить полную цепочку: FR → AC → BDD сценарий → задача в TASKS.md
2. Для каждого UC проверить: есть ли связанный FR
3. Для каждой User Story проверить: есть ли связанные UC/FR
4. Для каждого AC проверить: есть ли BDD сценарий (включая edge cases и rollback)
5. **AUDIT_REPORT_EXISTS:** если Phase 3+ Audit завершён — проверить что `.specs/{feature}/AUDIT_REPORT.md` существует и заполнен
6. **FILE_CHANGES_COMPLETENESS:** файлы из TASKS.md `**files:**` ОБЯЗАНЫ быть в FILE_CHANGES.md

## Remediation

Для каждого finding:

- FR без AC → добавить `## AC-N (FR-N) ...` в ACCEPTANCE_CRITERIA.md (EARS формат)
- AC без BDD сценария → добавить `Scenario: ...` в `.feature` с НАСТОЯЩИМ Gherkin-тегом `@featureN` строкой над сценарием (НЕ комментарием `# @featureN` — его парсер графа не видит)
- FR без задачи в TASKS.md → добавить task block с `**refs:** FR-N`
- File из TASKS.md отсутствует в FILE_CHANGES.md → добавить строку в File Changes таблицу
- UC без FR → либо добавить FR, либо пометить UC `> OUT OF SCOPE`
- User Story без UC/FR → провести Phase 1 Discovery дополнение

## Severity

WARNING — gap в trace chain.
INFO — `@featureN` propagation gaps.

## Связанные правила

- [`validation-rules.md`](validation-rules.md) — `FR_AC_COVERAGE`, `FILE_CHANGES_COMPLETENESS`, `FEATURE_TAG_PROPAGATION`, `AC_TAG_SYNC`
