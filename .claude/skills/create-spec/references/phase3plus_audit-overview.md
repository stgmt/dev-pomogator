# Phase 3+ Audit: Overview & Workflow

**Когда запускается:** Автоматически после финализации (СТОП #3 подтверждён), ПЕРЕД объявлением спеки готовой. **НЕ STOP-точка.** Пользователь уже дал подтверждение на СТОП #3.

**Файл:** AUDIT_REPORT.md (опциональный, не входит в 13 обязательных)

## Step 0 (Jira-mode)

Если `.specs/{slug}/JIRA_SOURCE.md` существует — выполнить Step 0 из [`jira-mode.md`](jira-mode.md) для Phase 3+: подготовить checklist для JIRA_DRIFT категории (CRITICAL directives → coverage FR; attachments hashes → matches evidence; `last_fetch_at` > 7 дней → recommend `/jira-intake-resync`).

## Step 1: Автоматические проверки

```
tools/specs-generator/audit-spec.ts -Path ".specs/{feature}" -Format json
```

Скрипт проверяет:

- FR↔AC покрытие (каждый FR-N имеет AC-N)
- FR/AC↔BDD покрытие через `@featureN` теги
- Полноту traceability matrix в REQUIREMENTS.md
- Незакрытые open questions в RESEARCH.md (`- [ ]`)
- TASKS.md → FR/NFR кросс-ссылки
- Терминологическую консистентность (PascalCase / camelCase варианты)
- **JIRA_DRIFT (только Jira-mode):** `checkJiraDrift` из `audit-checks.ts` сравнивает `.jira-cache.json` vs live Jira (если MCP доступен). Без MCP → INFO "skipped".

## Step 1.5: Reality drift check (preventative)

Перед Step 2 AI семантический анализ — invoke `Skill("spec-reality-check")` для current spec. Skill проверяет реальность утверждений спеки против файловой системы + git history (6 checks: FC_CREATE_EXISTS / FC_EDIT_MISSING / FC_DELETE_MISSING / NARRATIVE_PATH_MISSING / CODE_DRIFT_FR_ALREADY_DONE / TASKS_FC_CONSISTENCY).

**Preventative path:** drift не возникает в новых спеках на стадии создания. Если skill emits ≥1 ERROR — Phase 3 НЕ confirm-ится пока drift не починен в spec docs (FILE_CHANGES paths, narrative refs). Этот шаг complement к Category 15 spec-review (которая делает то же curatively во время ConfirmStop существующих спеков).

```
Skill("spec-reality-check")
```

После cleanup — повторить Step 1 (`audit-spec.ts`) и продолжить к Step 2.

## Step 2: AI семантический анализ (10 категорий)

Агент ОБЯЗАН выполнить проверки по 10 категориям, читая файлы спеки И реальный код проекта. Каждая категория — отдельный reference-файл с описанием checks и remediation:

| Category | Backing — mechanical vs AI-semantic (P16-5) | Reference | Severity scope |
|----------|----------------------------------------------|-----------|----------------|
| ОШИБКИ (Errors) | AI-semantic **+ mechanical pre-check** CHECK-9 `PARTIAL_IMPL_DETECTION` | [`phase3plus_audit-errors.md`](phase3plus_audit-errors.md) | Расхождения с реальным кодом |
| ЛОГИЧЕСКИЕ ПРОБЕЛЫ (Logic Gaps) | AI-semantic **+ mechanical** CHECK-10 `TASK_FR_ATOMICITY` + CHECK-12 `BDD_SCENARIO_SCOPE` | [`phase3plus_audit-logic-gaps.md`](phase3plus_audit-logic-gaps.md) | Непокрытые требования / разорванные цепочки |
| НЕКОНСИСТЕНТНОСТЬ (Inconsistency) | AI-semantic **+ mechanical** CHECK-11 `FR_SPLIT_CONSISTENCY` | [`phase3plus_audit-inconsistency.md`](phase3plus_audit-inconsistency.md) | Терминологические расхождения |
| РУДИМЕНТЫ (Rudiments) | **AI-semantic only** (agent reads spec+code) | [`phase3plus_audit-rudiments.md`](phase3plus_audit-rudiments.md) | Устаревшая информация |
| ФАНТАЗИИ (Fantasies) | **AI-semantic only** (agent reads spec+code) | [`phase3plus_audit-fantasies.md`](phase3plus_audit-fantasies.md) | Непроверенные допущения |
| UNDEFINED_BEHAVIOR | **AI-semantic only** (agent reads spec+code) | [`phase3plus_audit-undefined-behavior.md`](phase3plus_audit-undefined-behavior.md) | Непокрытые edge cases (taxonomy с 9 категориями + BVA + 12 combined failures inlined) |
| JIRA_DRIFT (только Jira-mode) | **MECHANICAL** — CHECK-13 `audit-checks.ts checkJiraDrift` | [`phase3plus_audit-jira-drift.md`](phase3plus_audit-jira-drift.md) | Drift между spec и Jira source |
| VARIANT_COVERAGE | **MECHANICAL** — audit-spec category (emits `AC_DECISION_TABLE_MISSING`) | [`phase3plus_audit-variant-coverage.md`](phase3plus_audit-variant-coverage.md) | Polymorphic FRs без enumerated variant matrix (AC Decision Table + Examples + per-variant tasks) |
| ARCHITECTURE_COVERAGE | **MECHANICAL** — `architecture-decision-cli.ts audit` (9th category, FR-9) | [`phase3plus_audit-architecture-coverage.md`](phase3plus_audit-architecture-coverage.md) | Greenfield architecture axes (Phase 1.75) в статусе pending — blocks STOP #3 |
| COMPLETENESS_COVERAGE | **MECHANICAL** — `architecture-decision-cli.ts audit-completeness` (10th category) | [`phase3plus_audit-completeness-coverage.md`](phase3plus_audit-completeness-coverage.md) | Greenfield: 8 system-completeness измерений (COMPLETENESS.md ledger) в статусе pending — blocks STOP #3 |

**Mechanical vs AI-semantic (P16-5 — чтобы агент не гадал):**
- **MECHANICAL** категории (JIRA_DRIFT / VARIANT_COVERAGE / ARCHITECTURE_COVERAGE / COMPLETENESS_COVERAGE) — findings ВЫЧИСЛЯЮТСЯ скриптом: они уже в выводе Step 1 (`audit-spec.ts` гоняет `audit-checks.ts` CHECK-9..13) или архитектурного CLI. Агент **читает** эти находки, НЕ передоказывает их семантически.
- **AI-semantic only** (Rudiments / Fantasies / Undefined-behavior) — нет механического чека; агент обязан прочитать spec + реальный код и вынести суждение.
- **Hybrid** (Errors / Logic Gaps / Inconsistency) — есть механический pre-check (CHECK-9..12), который ловит очевидные случаи; агент всё равно делает более широкий семантический проход поверх.

Загружай только relevant category файлы — не все 10 одновременно.

## Step 3: Исправление найденных проблем

Агент ОБЯЗАН автоматически исправить ВСЕ найденные проблемы (автоматические + AI семантические):

1. **ОШИБКИ** — исправить ссылки на несуществующие методы/файлы, убрать "Need to add" для уже существующих компонентов, указать правильные имена
2. **ЛОГИЧЕСКИЕ ПРОБЕЛЫ** — добавить недостающие AC для FR, добавить BDD сценарии для непокрытых AC, добавить ссылки в TASKS.md и REQUIREMENTS.md
3. **НЕКОНСИСТЕНТНОСТЬ** — унифицировать терминологию (выбрать один вариант, заменить во всех файлах), исправить нереалистичные тестовые данные
4. **РУДИМЕНТЫ** — закрыть решённые open questions (`- [x]`), удалить дублирующие UC, убрать client-side требования из серверной спеки
5. **ФАНТАЗИИ** — пометить непроверенные допущения как `[UNVERIFIED]`, добавить задачу live API verification в TASKS.md
6. **UNDEFINED_BEHAVIOR** — для critical/high findings: добавить FR/AC/BDD сценарий покрывающий edge case. Для medium/low: добавить `[KNOWN_UB: {category}]` пометку в FR/AC и задачу в TASKS.md
7. **VARIANT_COVERAGE** — для каждого polymorphic FR без complete matrix: emit AC Decision Table (через Skill `variant-matrix-build`), Gherkin Scenario Outline + Examples в .feature, per-variant tasks в TASKS.md. Если matrix не applicable — добавить escape hatch `[skip-variant-matrix: <reason ≥8 chars>]` в FR body. См. `phase3plus_audit-variant-coverage.md` для resolution guide.
8. **ARCHITECTURE_COVERAGE** (greenfield only) — для каждой оси в статусе `pending`: выбрать вариант (auto-mode рекомендация или override) ИЛИ добавить `[skip-architecture-axis: <reason ≥12 chars>]`. Применимо только если `.specs/{slug}/ARCHITECTURE/` существует (Phase 1.75 ran). См. `phase3plus_audit-architecture-coverage.md`.
9. **COMPLETENESS_COVERAGE** (greenfield only) — для каждого из 8 измерений в `ARCHITECTURE/COMPLETENESS.md` ledger в статусе `pending`: пометить `addressed` (+ pointer) / `out-of-scope` (+ reason ≥12) ИЛИ `[skip-completeness-dimension: <reason ≥12>]`. Прогон `architecture-decision-cli.ts audit-completeness <spec-dir>`. См. `phase3plus_audit-completeness-coverage.md`.

## Step 4: Повторный аудит

1. Перезапустить `audit-spec.ts` на исправленных файлах
2. Повторить AI семантический анализ
3. Если findings > 0 — повторить Step 3 (максимум 3 итерации)

## Step 5: Генерация AUDIT_REPORT.md

1. Создать `.specs/{feature}/AUDIT_REPORT.md` через mutation-дверь (MCP-rails, FR-40 — НЕ raw `Write`; под enforce raw запись в `.specs/**` блокируется): `apply_spec_change({ spec: "{feature}", doc: "AUDIT_REPORT.md", content: "<по шаблону tools/specs-generator/templates/AUDIT_REPORT.md.template>", reason: "phase3+ audit report" })`. Дверь валидирует форму перед записью + пишет в аудит-лог.
2. Записать ВСЕ найденные и исправленные проблемы (что было → что исправлено) — в том же `content`
3. Показать summary таблицу пользователю

## Step 6: Финальный /simplify review

После создания AUDIT_REPORT.md — запустить `/simplify` ОДИН раз для финального review всех файлов спеки. Это **единственный** вызов /simplify в workflow — НЕ запускать после каждой STOP-точки (слишком тяжело: 4 цикла по 3 review agents = спам в чат и трата токенов).

## Verdict

«Все findings закрыты в AUDIT_REPORT.md» — это НЕ вердикт (FR-37d, правило `no-structural-valid.md`). После Step 6 — ДВА условия одновременно:

1. все findings закрыты или explicitly accepted в AUDIT_REPORT.md как false positives;
2. **смарт-вердикт GREEN**: `npx tsx tools/specs-generator/spec-verdict.ts -Path .specs/{slug} --no-semantic` — audit + traceability (UNCOVERED_FR / TASK_UNTESTED / UNTAGGED_SCENARIO) + conformance над одним графом. RED ⇒ цитировать gap list и закрывать его, не «accepted».

Только тогда verdict «Spec is ready for implementation». Для агентского потребления тот же статус доступен через MCP `get_spec_status({spec})` (lifecycle SPEC_ONLY / TESTS_NOT_RUN / RED / PARTIAL / GREEN + linked last_run).
