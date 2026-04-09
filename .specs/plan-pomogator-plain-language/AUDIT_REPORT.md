# Аудит спецификации: plan-pomogator-plain-language

Дата: 2026-04-09

## Сводка

| # | Категория | Авто (initial) | Авто (final) | AI | Итого | Макс. критичность |
|---|-----------|----------------|--------------|----|----|-------------------|
| 1 | ОШИБКИ (Errors) | 0 | 0 | 0 | **0** | — |
| 2 | ЛОГИЧЕСКИЕ ПРОБЕЛЫ (Logic Gaps) | 8 | 0 | 0 | **0** | — |
| 3 | НЕКОНСИСТЕНТНОСТЬ (Inconsistency) | 9 | 0 | 0 | **0** | — |
| 4 | РУДИМЕНТЫ (Rudiments) | 0 | 0 | 0 | **0** | — |
| 5 | ФАНТАЗИИ (Fantasies) | 2 | 1 | 0 | **1** | INFO (false positive) |
| | **ИТОГО** | **19** | **1** | **0** | **1** | INFO |

**Status:** Critical categories (ОШИБКИ / ЛОГИЧЕСКИЕ ПРОБЕЛЫ / НЕКОНСИСТЕНТНОСТЬ / РУДИМЕНТЫ) = **0 findings**. Spec соответствует DoD criteria.

**Iterations:** 3 (initial → fix WARNINGs → fix INFO INFO propagation → final state with 1 documented false positive).

---

## Категория 1: ОШИБКИ (Errors)

Расхождения между спецификацией и реальным кодом.

**Авто:** 0 findings
**AI semantic check:** 0 findings

**AI verification details:**

| # | Проверка | Result |
|---|----------|--------|
| 1 | DESIGN.md component/method/file references exist in codebase | ✓ Verified — `validate-plan.ts:20-29` (REQUIRED_SECTIONS), `validate-plan.ts:74-100` (validateSections), `validate-plan.ts:372-413` (validateContextContent) — все существуют (см. RESEARCH.md "Existing Patterns & Extensions") |
| 2 | Items marked "Need to add" / "TODO" — already exist? | ✓ No false positives — `validateHumanSummarySection` действительно не существует, нужно создать |
| 3 | FILE_CHANGES.md create targets — already exist? | ✓ Все 8 файлов имеют action `edit`, не `create`. Все existing files |

---

## Категория 2: ЛОГИЧЕСКИЕ ПРОБЕЛЫ (Logic Gaps)

Непокрытые требования, отсутствующие BDD-сценарии, разорванные цепочки трассировки.

**Авто (initial):** 8 findings (3 WARNING + 5 INFO)
**Авто (final):** 0 findings
**AI semantic check:** 0 findings

| # | Критичность | Файл | Проблема | Recommendation | Fix Status |
|---|-------------|------|----------|----------------|------------|
| 1 | WARNING | .feature | @feature4 in FR/AC has no matching BDD scenario | Add @feature4 to PLUGIN007_45 | ✅ Fixed |
| 2 | WARNING | .feature | @feature6 in FR/AC has no matching BDD scenario | Add @feature6 to PLUGIN007_47 | ✅ Fixed |
| 3 | WARNING | .feature | @feature8 in FR/AC has no matching BDD scenario | Add @feature8 to PLUGIN007_43, _44, _45 | ✅ Fixed |
| 4 | INFO | USER_STORIES.md | @feature7 in .feature but not in USER_STORIES.md | Add @feature7 to US-5 | ✅ Fixed |
| 5 | INFO | USE_CASES.md | @feature7 in .feature but not in USE_CASES.md | Add @feature7 to UC-4 | ✅ Fixed |
| 6 | INFO | USER_STORIES.md | @feature8 in .feature but not in USER_STORIES.md | Add @feature8 to US-5 | ✅ Fixed |
| 7 | INFO | USE_CASES.md | @feature8 in .feature but not in USE_CASES.md | Add @feature8 to UC-4 | ✅ Fixed |
| 8 | INFO | USER_STORIES.md | @feature6 in .feature but not in USER_STORIES.md | Add @feature6 to US-5 | ✅ Fixed |

**AI verification details:**

| # | Проверка | Result |
|---|----------|--------|
| 1 | Каждый FR имеет связанный AC | ✓ FR-1..FR-8 → AC-1..AC-8 (1:1 mapping) |
| 2 | Каждый FR имеет BDD сценарий | ✓ После фиксов FR-1..FR-8 → PLUGIN007_43..48 (8 FR покрыты 6 сценариями через @featureN тегирование) |
| 3 | Каждый AC имеет EARS формулировку | ✓ Все AC используют WHEN/IF/THEN/SHALL формат |
| 4 | AUDIT_REPORT_EXISTS check | ✓ Этот файл создан (Phase 3+ Audit completed) |

---

## Категория 3: НЕКОНСИСТЕНТНОСТЬ (Inconsistency)

Терминологические расхождения, разные форматы идентификаторов.

**Авто (initial):** 9 findings (8 WARNING AC_TAG_SYNC + 1 WARNING PROSE_COUNT_SYNC)
**Авто (final):** 0 findings
**AI semantic check:** 0 findings

| # | Критичность | Файл(ы) | Проблема | Recommendation | Fix Status |
|---|-------------|---------|----------|----------------|------------|
| 1 | WARNING | ACCEPTANCE_CRITERIA.md | FR-1 has @feature1 but AC-1 header missing it | Add @feature1 to AC-1 header | ✅ Fixed |
| 2 | WARNING | ACCEPTANCE_CRITERIA.md | FR-2 has @feature2 but AC-2 header missing it | Add @feature2 to AC-2 header | ✅ Fixed |
| 3 | WARNING | ACCEPTANCE_CRITERIA.md | FR-3 has @feature3 but AC-3 header missing it | Add @feature3 to AC-3 header | ✅ Fixed |
| 4 | WARNING | ACCEPTANCE_CRITERIA.md | FR-4 has @feature4 but AC-4 header missing it | Add @feature4 to AC-4 header | ✅ Fixed |
| 5 | WARNING | ACCEPTANCE_CRITERIA.md | FR-5 has @feature5 but AC-5 header missing it | Add @feature5 to AC-5 header | ✅ Fixed |
| 6 | WARNING | ACCEPTANCE_CRITERIA.md | FR-6 has @feature6 but AC-6 header missing it | Add @feature6 to AC-6 header | ✅ Fixed |
| 7 | WARNING | ACCEPTANCE_CRITERIA.md | FR-7 has @feature7 but AC-7 header missing it | Add @feature7 to AC-7 header | ✅ Fixed |
| 8 | WARNING | ACCEPTANCE_CRITERIA.md | FR-8 has @feature8 but AC-8 header missing it | Add @feature8 to AC-8 header | ✅ Fixed |
| 9 | WARNING | README.md | "5 phase" claim but actual is 7 phases in TASKS.md | Update "5 phase" to "7 phases" | ✅ Fixed |

**AI verification details:**

| # | Проверка | Result |
|---|----------|--------|
| 1 | Доменное наименование консистентно | ✓ "Простыми словами" — primary section name везде. "Plain Language Summary" — английский title в slug/CHANGELOG. "Понимание задачи" — единственное упоминание в RESEARCH.md как label rejected alternative (Plan agent's предложение) — это интенциональное историческое именование. |
| 2 | TABLE_ROW_COUNT — section headers vs actual table rows | ✓ Все count claims проверены: "FR (8)" / 8 FRs; "ACCEPTANCE_CRITERIA (8 EARS)" / 8 ACs; "FILE_CHANGES (8 файлов)" / 8 rows; ".feature (6 BDD сценариев)" / 6 scenarios |

---

## Категория 4: РУДИМЕНТЫ (Rudiments)

Устаревшая информация, закрытые open questions, scope creep.

**Авто:** 0 findings
**AI semantic check:** 0 findings

**AI verification details:**

| # | Проверка | Result |
|---|----------|--------|
| 1 | Open questions в RESEARCH.md уже отвечены elsewhere | ✓ Нет unchecked `- [ ]` items в RESEARCH.md |
| 2 | Scope creep — client-side concerns в server spec | ✓ Это extension/CLI плагин, no client-side. Все scope locked в Out of Scope (OUT OF SCOPE: реализация, transcript reading, миграция, bilingual support) |

---

## Категория 5: ФАНТАЗИИ (Fantasies)

Непроверенные допущения об API, capabilities выдуманные без верификации.

**Авто (initial):** 2 INFO findings (false positives)
**Авто (final):** 1 INFO finding (false positive — documented below)
**AI semantic check:** 0 findings

| # | Критичность | Файл | Проблема | Status |
|---|-------------|------|----------|--------|
| 1 | INFO | DESIGN.md | "Env var 'REQUIRED_SECTIONS' has no verification source" | ❌ **False positive** — `REQUIRED_SECTIONS` это TypeScript константа в `validate-plan.ts:20-29`, НЕ environment variable. Audit script regex `/\b([A-Z][A-Z0-9_]{3,})\b/` ловит SCREAMING_SNAKE_CASE и предполагает env var. Маркеры `[VERIFIED: TypeScript const, not env var]` добавлены в DESIGN.md (lines 3, 8, 18) но audit script не отпускает finding. **Acknowledged as false positive** — не блокирует DoD (категория FANTASIES не критическая, severity INFO). Future improvement: расширить ENV_VAR_WHITELIST в `specs-generator-core.mjs:2142-2152` чтобы исключать упоминания в коде context. |
| 2 | INFO | DESIGN.md | "Env var 'PLUGIN007_43' has no verification source" | ✅ Fixed — добавлен `[VERIFIED: BDD scenario IDs, not env vars]` маркер в Алгоритм Step 10. Audit script suppressed (один из двух fixed) |

**AI verification details:**

| # | Проверка | Result |
|---|----------|--------|
| 1 | API assumptions в RESEARCH.md имеют sources | ✓ Все ссылки на validate-plan.ts line numbers verified против реального кода (RESEARCH.md "Existing Patterns" table) |
| 2 | Untested claims as confirmed facts | ✓ Решения помечены как Decisions (D-1..D-6), Rejected Alternatives помечены как rejected, Rationale явно указан для каждого |

---

## Рекомендации

### Высокая критичность

Нет findings — все WARNING и ERROR категории = 0.

### Средняя критичность

Нет findings — все INFO findings либо исправлены либо false positives.

### Низкая критичность

1. **Future improvement для audit-spec.ts**: расширить `ENV_VAR_WHITELIST` в `specs-generator-core.mjs:2142-2152` или научить script распознавать context (TypeScript const, BDD scenario ID, regex match) чтобы избежать false positives для не-env-var SCREAMING_SNAKE_CASE идентификаторов. Это улучшит DX при создании spec для фич которые модифицируют TypeScript константы.

---

## Phase 3+ Audit Conclusion

Спека `plan-pomogator-plain-language` прошла Phase 3+ Audit:

- ✅ **Критичные категории = 0 findings** (ОШИБКИ / ЛОГИЧЕСКИЕ ПРОБЕЛЫ / НЕКОНСИСТЕНТНОСТЬ / РУДИМЕНТЫ)
- ⚠️ **1 INFO false positive** в категории ФАНТАЗИИ (REQUIRED_SECTIONS env var detection — known issue audit script)
- ✅ **Все 8 FR / 8 AC / 6 BDD сценариев / 8 файлов реализации** consistent и traceable
- ✅ **AI semantic checks** (10 проверок из ai_checks_pending) — все pass
- ✅ **Spec ready for implementation** — не блокировано

**Next step:** Создать отдельный план реализации (separate ExitPlanMode сессия) на основе TASKS.md из этой спеки. Реализация — OUT OF SCOPE текущего трека (per project requirement "сначала всё зафиксировать в спеке").
