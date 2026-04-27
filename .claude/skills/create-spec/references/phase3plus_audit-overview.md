# Phase 3+ Audit: Overview & Workflow

**Когда запускается:** Автоматически после финализации (СТОП #3 подтверждён), ПЕРЕД объявлением спеки готовой. **НЕ STOP-точка.** Пользователь уже дал подтверждение на СТОП #3.

**Файл:** AUDIT_REPORT.md (опциональный, не входит в 13 обязательных)

## Step 0 (Jira-mode)

Если `.specs/{slug}/JIRA_SOURCE.md` существует — выполнить Step 0 из [`jira-mode.md`](jira-mode.md) для Phase 3+: подготовить checklist для JIRA_DRIFT категории (CRITICAL directives → coverage FR; attachments hashes → matches evidence; `last_fetch_at` > 7 дней → recommend `/jira-intake-resync`).

## Step 1: Автоматические проверки

```
.dev-pomogator/tools/specs-generator/audit-spec.ts -Path ".specs/{feature}" -Format json
```

Скрипт проверяет:

- FR↔AC покрытие (каждый FR-N имеет AC-N)
- FR/AC↔BDD покрытие через `@featureN` теги
- Полноту traceability matrix в REQUIREMENTS.md
- Незакрытые open questions в RESEARCH.md (`- [ ]`)
- TASKS.md → FR/NFR кросс-ссылки
- Терминологическую консистентность (PascalCase / camelCase варианты)
- **JIRA_DRIFT (только Jira-mode):** `checkJiraDrift` из `audit-checks.ts` сравнивает `.jira-cache.json` vs live Jira (если MCP доступен). Без MCP → INFO "skipped".

## Step 2: AI семантический анализ (7 категорий)

Агент ОБЯЗАН выполнить проверки по 7 категориям, читая файлы спеки И реальный код проекта. Каждая категория — отдельный reference-файл с описанием checks и remediation:

| Category | Reference | Severity scope |
|----------|-----------|----------------|
| ОШИБКИ (Errors) | [`phase3plus_audit-errors.md`](phase3plus_audit-errors.md) | Расхождения с реальным кодом |
| ЛОГИЧЕСКИЕ ПРОБЕЛЫ (Logic Gaps) | [`phase3plus_audit-logic-gaps.md`](phase3plus_audit-logic-gaps.md) | Непокрытые требования / разорванные цепочки |
| НЕКОНСИСТЕНТНОСТЬ (Inconsistency) | [`phase3plus_audit-inconsistency.md`](phase3plus_audit-inconsistency.md) | Терминологические расхождения |
| РУДИМЕНТЫ (Rudiments) | [`phase3plus_audit-rudiments.md`](phase3plus_audit-rudiments.md) | Устаревшая информация |
| ФАНТАЗИИ (Fantasies) | [`phase3plus_audit-fantasies.md`](phase3plus_audit-fantasies.md) | Непроверенные допущения |
| UNDEFINED_BEHAVIOR | [`phase3plus_audit-undefined-behavior.md`](phase3plus_audit-undefined-behavior.md) | Непокрытые edge cases (taxonomy с 9 категориями + BVA + 12 combined failures inlined) |
| JIRA_DRIFT (только Jira-mode) | [`phase3plus_audit-jira-drift.md`](phase3plus_audit-jira-drift.md) | Drift между spec и Jira source |

Загружай только relevant category файлы — не все 7 одновременно.

## Step 3: Исправление найденных проблем

Агент ОБЯЗАН автоматически исправить ВСЕ найденные проблемы (автоматические + AI семантические):

1. **ОШИБКИ** — исправить ссылки на несуществующие методы/файлы, убрать "Need to add" для уже существующих компонентов, указать правильные имена
2. **ЛОГИЧЕСКИЕ ПРОБЕЛЫ** — добавить недостающие AC для FR, добавить BDD сценарии для непокрытых AC, добавить ссылки в TASKS.md и REQUIREMENTS.md
3. **НЕКОНСИСТЕНТНОСТЬ** — унифицировать терминологию (выбрать один вариант, заменить во всех файлах), исправить нереалистичные тестовые данные
4. **РУДИМЕНТЫ** — закрыть решённые open questions (`- [x]`), удалить дублирующие UC, убрать client-side требования из серверной спеки
5. **ФАНТАЗИИ** — пометить непроверенные допущения как `[UNVERIFIED]`, добавить задачу live API verification в TASKS.md
6. **UNDEFINED_BEHAVIOR** — для critical/high findings: добавить FR/AC/BDD сценарий покрывающий edge case. Для medium/low: добавить `[KNOWN_UB: {category}]` пометку в FR/AC и задачу в TASKS.md

## Step 4: Повторный аудит

1. Перезапустить `audit-spec.ts` на исправленных файлах
2. Повторить AI семантический анализ
3. Если findings > 0 — повторить Step 3 (максимум 3 итерации)

## Step 5: Генерация AUDIT_REPORT.md

1. Создать `.specs/{feature}/AUDIT_REPORT.md` по шаблону `.dev-pomogator/tools/specs-generator/templates/AUDIT_REPORT.md.template`
2. Записать ВСЕ найденные и исправленные проблемы (что было → что исправлено)
3. Показать summary таблицу пользователю

## Step 6: Финальный /simplify review

После создания AUDIT_REPORT.md — запустить `/simplify` ОДИН раз для финального review всех файлов спеки. Это **единственный** вызов /simplify в workflow — НЕ запускать после каждой STOP-точки (слишком тяжело: 4 цикла по 3 review agents = спам в чат и трата токенов).

## Verdict

После Step 6 — спека готова. Если все findings закрыты или explicitly accepted в AUDIT_REPORT.md как false positives — verdict "Spec is ready for implementation".
