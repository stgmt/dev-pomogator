# Spec Conformance Audit — `spec-generator-v4`

**Дата**: 2026-07-21 · **Аудитор**: strict spec-conformance auditor (fresh context)
**Scope**: `.specs/spec-generator-v4/` (27 файлов, активная фаза — 14 doc-файлов modified в working tree)
**Метод**: `validate-spec.ts` (структурный pre-filter) + `audit-spec.ts` (cross-ref) + прямая верификация каждого значимого finding'а grep'ом по артефактам. Structural `valid:true` вердиктом здоровья НЕ является (правило `no-structural-valid`, FR-37d).

---

## ВЕРДИКТ: ❌ NOT CONFORMANT

- **Lifecycle**: `Finalization`, `stopConfirmed: false` — фаза не закрыта (`.progress.json`)
- **Evidence (FR-32)**: `0 passed / 507 stale / 14 not_run` — **ни одного актуального зелёного доказательства**; README:5 сам это признаёт. 45 legacy `DONE`-тасок execution-unverified. До перепрогона BDD-сьюта (`docker-bdd.sh`) spec не имеет права на GREEN/DONE-статус.
- **Верифицированных дефектов**: 9 (D1–D9), из них 4 блокирующих для ConfirmStop (D2, D3, D4, D7)
- **Ложных срабатываний инструмента**: 6 классов (F1–F6) — верифицированы против артефактов, подлежат producer-фиксу в `audit-spec.ts`

---

## Верифицированные дефекты (с уликами)

### D1. README count drift — 4 из 5 метрик врут [`README.md:5`, `README.md:202`]

| Метрика | README | Факт | Метод | Статус |
|---|---|---|---|---|
| FR | 64 | **65** heading'ов | `grep ^#+\s*FR-\d+` FR.md | ❌ off-by-one |
| AC | 171 | **173** | `grep AC-\d+\.\d+` ACCEPTANCE_CRITERIA.md | ❌ |
| scenarios | 521 | 521 | `grep ^\s*Scenario( Outline)?:` .feature | ✅ верно |
| tasks | 238 | **239** checkbox-строк | `grep ^- \[(x)\| \]` TASKS.md | ❌ off-by-one |
| phases | 8 («87 files across 8 phases», FILE_CHANGES-scope) | **17** в FILE_CHANGES.md / 37 в TASKS.md | `grep ^## Phase` | ❌ вдвое |

### D2. Dangling ref: `NEEDS_HUMAN_REVIEW_PACKET.md` не существует [`README.md:51`, `README.md:208`]
README дважды ссылается («12 multi-spec triage decisions / needs-human items с per-target recommendations»); Glob: **No files found**. Либо файл не создан, либо ссылки мертвы. Рецензент Finalization-фазы упрётся в пустоту.

### D3. `extensions/` drift — 65 упоминаний в 10 доках после v2.0
v2.0 architecture: «no `extensions/` middleware after v2.0» (CLAUDE.md). В доках spec-generator-v4: RESEARCH 19, **DESIGN 18, TASKS 10, FR 6, FILE_CHANGES 3**, USER_STORIES 3, AC 2, CHANGELOG 1, MISSING_FILE_* 3.
`BDD_HOOKS_COVERAGE` ×3 подтверждает: DESIGN «Новые hooks» (`spec-conformance-guard`, `spec-conformance-push`, `bash-post-test-ingest`) прописаны по `extensions/specs-workflow/tools/...` и **не найдены в TASKS.md Phase 0**. Forward-looking доки (DESIGN/TASKS/FILE_CHANGES) описывают layout, которого нет.

### D4. FR↔BDD traceability hole: 56 тегов `@featureN` без якоря в FR/AC [`FR_BDD_COVERAGE` ×56]
`.feature` использует @feature1–18, 20–34, 36–53, 59–64, но в заголовках FR.md/ACCEPTANCE_CRITERIA.md соответствующих якорей нет → сценарии не трассируются к требованиям системно, не точечно.

### D5. Tag propagation: 146 разрывов [`FEATURE_TAG_PROPAGATION` ×146, INFO]
Теги из `.feature` не propagated в `USER_STORIES.md` / `USE_CASES.md`.

### D6. Case drift: 224 lowercase `fr-N` в TASKS.md
Канонический формат `FR-N`; 224 lowercase-ссылок порождают фантомные дубли в аудите (`TASK_FR_ATOMICITY` ×28: «Task covers multiple FRs: FR-19, fr-19, FR-22» — это один FR, задвоенный регистром).

### D7. Evidence honesty: 0 passed / 507 stale / 14 not_run [`README.md:5`]
Historical canonical run: 506 passed — но протух. По FR-32/`no-structural-valid` текущий честный статус = **TESTS_NOT_RUN/stale**, не GREEN.

### D8. `FEATURE_NAMING` — имя Feature не в формате `{DOMAIN}{NNN}_Название`
Единственный warning структурного валидатора по `.feature`.

### D9. Term variants [`TERM_CONSISTENCY` ×2]
`testCase`/`TestCase`, `BrokenAnchor`/`brokenAnchor` — разнобой терминов.

---

## Верифицированные FALSE POSITIVES инструмента (producer-дефекты `audit-spec.ts`)

Каждый проверен против реальных артефактов — это шум, НЕ дефекты спеки. Кандидаты для `spec-generator-dev`:

| # | Finding | Что сказал аудит | Факт | Корень |
|---|---|---|---|---|
| F1 | `COUNT_CONSISTENCY` | «FR.md has 3 FR headings» | **65** heading'ов | regex считает только один формат заголовков |
| F2 | `SCENARIO_COUNT_SYNC` | «README claims 521 but .feature has 517» | **521** — README прав | regex не считает `Scenario Outline:` строки; бонус: «claims 004 scenario» — SPECGEN004 id распознан как число |
| F3 | `PROSE_COUNT_SYNC` ×3 | «claims 8 phase vs 37 in TASKS.md» | claim про FILE_CHANGES (там 17), не про TASKS | неверный denominator (scope claim'а не определён) |
| F4 | `UNVERIFIED_CONFIG` ×72 | «Env var 'UNCOVERED_FR'/'ORPHAN_TASK'/'BROKEN_REF' has no verification source» | это finding-kind'ы аудит-системы, не env vars | детектор env-var = любой SCREAMING_SNAKE токен |
| F5 | `PHANTOM_CREATE_SOURCE` ×6 | source «vitest»/«existing»/«Phase»/«tampering»/«GitHub»/«session» does not exist | слова из prose FILE_CHANGES | парсер «create <X>» хватает слово после глагола |
| F6 | `CROSS_REF_LINKS` ×~20 | broken links на `https://github.com/...`, template-примеры `[t](f.md#a)` и cross-spec `../other/FR.md` | внешние URL валидны; примеры — prose | линк-чекер не отличает URL/пример/межспековый линк; единственный реально битый = D2 |

---

## Рекомендации (приоритет)

1. **D7** — перепрогнать BDD-сьют (`scripts/docker-bdd.sh`, не на хосте!) → обновить `.test-results.ndjson`; без свежего green никакой DONE/ConfirmStop
2. **D2** — создать `NEEDS_HUMAN_REVIEW_PACKET.md` или вырезать обе ссылки из README
3. **D3** — заменить `extensions/` → `tools/...` в DESIGN/TASKS/FILE_CHANGES по v2.0 layout (в RESEARCH/CHANGELOG допустимо оставить как историю с пометкой)
4. **D1** — синхронизировать README: 65 FR / 173 AC / 239 tasks / 17 FILE_CHANGES-phases (или пересчитать графом и зафиксировать источник правды)
5. **D4/D5** — добавить `@featureN`-якоря в заголовки FR.md/AC либо оформить waiver как форматное решение
6. **D6** — нормализовать `fr-N` → `FR-N` в TASKS.md (224 шт.)
7. **D8/D9** — формат имени Feature + унификация терминов
8. **F1–F6** — producer-фиксы в `tools/specs-generator/audit-spec.ts` (территория skill `spec-generator-dev`): FR-heading regex, Scenario Outline, scope-aware prose-counts, env-var детектор, FILE_CHANGES create-парсер, URL/cross-spec исключение в link-чекере

**ConfirmStop Finalization блокирован** пунктами D2, D3, D4, D7.

---

## Приложение: батарея

| Инструмент | Результат |
|---|---|
| `validate-spec.ts` | `valid: true`, 0 errors, ~30 warnings (26/27 файлов чистые) |
| `audit-spec.ts` | 326 findings: 0 ERROR-severity / 127 WARNING\|CRITICAL / 199 INFO |
| `spec-verdict.ts` | ⏳ запущен (build spec-graph по корпусу); секция будет дополнена по завершении |
| MCP `conformance_check` / `get_spec_status` | недоступны в сессии (permission не выдан) — компенсировано CLI + прямой верификацией |
