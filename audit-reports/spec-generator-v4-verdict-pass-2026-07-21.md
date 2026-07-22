# spec-generator-v4 — authoritative verdict pass + reconciliation (2026-07-21)

**Auditor**: strict spec-conformance auditor (independent pass, fresh context — вторая сессия аудита за день)
**Scope**: `.specs/spec-generator-v4/` · ветка `feat/spec-generator-v4-release-prep`
**Метод**: полная каноническая цепочка — `validate-spec.ts` (pre-filter) → `audit-spec.ts` (cross-ref) → `spec-verdict.ts --no-semantic` (смарт-вердикт, FR-37) + прямая верификация каждого значимого finding'а против артефактов (grep по FR.md/TASKS.md/README.md/.feature, парсинг cucumber-message stream из `.test-results.ndjson`). Per `no-structural-valid`: структурное `valid:true` нигде не трактется как здоровье.
**Отношение к двум сегодняшним аудитам**:
- `spec-generator-v4-conformance-2026-07-21.md` — **дополняет**: там секция `spec-verdict.ts` помечена «⏳ запущен, будет дополнена» и не была дополнена. D1–D6/D8/D9 и F1–F6 **независимо подтверждены** (мои замеры ниже), D7 **исправлен** (устарел), добавлены N1–N5.
- `CONFORMANCE-AUDIT-2026-07-21.md` — corpus-scope, **комплементарен** (его F4: spec-generator-v4 — крупнейший держатель dangling runtime-trace рёбер, 507 шт.).

---

## ВЕРДИКТ: `GRAPH_GREEN` / **`OVERALL: NOT_READY`** (`spec-verdict` exit 1)

| Lane | Статус | Содержание |
|---|---|---|
| STRUCTURE | 🟢 GREEN | 0 structural errors · 0 audit ERROR · 0 conformance errors |
| TRACEABILITY | 🟢 GREEN | 0 FR-37b gaps (cell→atom) |
| EXECUTION | 🔴 **RED (blocking)** | canonical: **2 failed + 15 not_run**; effective: 506 passed / 1 stale / 14 not_run / 0 failed |
| TASK_TRUTH | 🔴 **RED (blocking)** | **50 DONE-but-unverified** задач · 45 DONE с unchecked Done-When чекбоксами |
| BDD_SYNC | 🟢 GREEN | |
| SEMANTIC | ⚪ SKIPPED | нет `claude` binary — по FR-37c это «unchecked», **НЕ** «no drift» |
| FILTERED_PROOF | 🟢 GREEN | `run-1784649138074-filtered`: 7/7 passed (сегодня 15:52 UTC) |

Coverage: effective `{passed:506, stale:1, not_run:14}` / canonical `{passed:504, failed:2, not_run:15}`; итог 521 = **521** `Scenario( Outline):`-строке в `.feature` ✓ (независимый grep).
Pre-filter: `valid:true`, 0 errors / 30 warnings. Audit-spec: 326 findings, **0 ERROR-severity** (gate PASS). Conformance: 0 error / 85 warning.

---

## 2 канонических падения — идентифицированы и УЖЕ перепроверены зелёными

Парсинг cucumber-message stream (`.test-results.ndjson`, 32 141 сообщение; step-freq `PASSED:15014 / FAILED:2 / SKIPPED:2`):

1. **`SPECGEN004_52`** — «canonical plugin ships a complete static hooks.json (additive, nothing dropped)»
2. **`SPECGEN004_372`** — «the committed registry-parity snapshot stays in sync with the live settings.json»

Оба входят в сегодняшней filtered-прогон (`run-1784649138074-filtered.ndjson`, 7 passed / 0 non-passed, выбраны `_228 _229 _230 _231 _232 _372 _52`) → в **EFFECTIVE** слое они passed, но **CANONICAL** по-прежнему считает их failed: канонический rollup не меняется без полного прогона или accepted attachment (контракт FILTERED_PROOF).

→ **EXECUTION-блокер закрывается механически**: полный прогон `scripts/docker-bdd.sh` (по `no-host-bdd-runs` — НЕ на хосте) канонизировал бы фикс `_52/_372` и закрыл 15 not_run.

---

## Исправление D7 пред-аудита: headline-дефект сам протух

Пред-аудит: «Evidence: **0 passed / 507 stale** — ни одного актуального зелёного доказательства» (со ссылкой на `README.md:5`). На момент написания то было честно — но состояние **перезаписано уликами**: граф сейчас даёт 506 свежих passed / 1 stale (effective).
Дефект переехал: теперь **`README.md:5` сам врёт** — строка «Effective evidence: 0 passed, 507 stale… Historical canonical run: 506 passed» описывает прошлое; текущий canonical = 504 passed / 2 failed / 15 not_run (см. N5).

---

## Независимое подтверждение находок пред-аудита (мои замеры)

| # | Находка пред-аудита | Мой независимый замер | Статус |
|---|---|---|---|
| D1 | README count drift: 64→65 FR, 171→173 AC, 238→239 tasks, 8→17/37 phases | FR-заголовков в FR.md = **65** ✓ (`^#+\s*(FR-\d\|fr-\d)`); scenarios = **521** ✓ (README тут ПРАВ — тул неправ, см. F2); AC/tasks не пересчитывал — доверяю grep'у пред-аудита | ✅ подтверждено (README stale) |
| D2 | `NEEDS_HUMAN_REVIEW_PACKET.md` не существует | Glob: отсутствует; README:51 («review table для 12 needs-human items») + README:208 — две ссылки в никуда | ✅ подтверждено |
| D3 | `extensions/` drift: 65 упоминаний / 10 доков | Grep: **ровно 65 в 10 файлах**, разбивка 1-в-1: RESEARCH 19 · DESIGN 18 · TASKS 10 · FR 6 · FILE_CHANGES 3 · USER_STORIES 3 · AC 2 · CHANGELOG 1 · MISSING_FILE_* 3 | ✅ подтверждено |
| D4 | 56 `@featureN` без якоря в FR/AC | в `.feature` **470** tag-вхождений, в FR.md+AC всего **14** `@feature`-упоминаний. НО: TRACEABILITY gate = GREEN — FR-37b cell→atom строится на slug-id `SPECGEN004_NN`, не на header-тегах | ✅ подтверждено как **convention-долг**; механическим гейтом не блокирует (audit 0 ERROR) — классификация пред-аудита «блокирующий» строже канона |
| D5 | 146 tag-propagation разрывов (USER_STORIES/USE_CASES) | воспроизведено в моём прогоне audit-spec (126 INFO + 20 WARNING) | ✅ подтверждено |
| D6 | 224 lowercase `fr-N` в TASKS.md | Grep: **224** ✓ (источник фантомных дублей `TASK_FR_ATOMICITY`: «FR-19, fr-19» = один FR) | ✅ подтверждено |
| D8 | `FEATURE_NAMING` (имя не `{DOMAIN}{NNN}_Название`) | воспроизведено | ✅ |
| D9 | `testCase`/`TestCase`, `BrokenAnchor`/`brokenAnchor` | воспроизведено | ✅ |
| F1–F6 | 6 классов false-positive тула | **все воспроизведены и перепроверены**: «3 FR headings» (факт 65) · «517 scenarios» (факт 521 — `Scenario Outline:` не считается; бонус «004 scenario» = SPECGEN004 id как число) · 72× `UNVERIFIED_CONFIG` (UPPER_SNAKE finding-коды `UNCOVERED_FR`/`ORPHAN_TASK`…, не env vars) · 6× `PHANTOM_CREATE_SOURCE` (слова «vitest»/«GitHub»/«session» из prose) · ~20× `CROSS_REF_LINKS` — все 10 cross-spec `../<slug>/FR.md` целей **существуют** (Glob), `https://`-URL валидны, `[t](f.md#a)`/`[label](/file.md#heading)` — иллюстративные примеры в prose (RESEARCH:162/392, AC:447, TASKS:1004 описывают классы ссылок) — единственный реально битый линк = D2 | ✅ → producer-фиксы `audit-spec.ts` (территория `spec-generator-dev`) |

---

## Новые находки (нет в пред-аудите)

### N1. TASK_TRUTH RED — 50 DONE-but-unverified (не «45 legacy», как говорит README:5)
Полный список задач, DONE без свежих зелёных улик (verdict, coverage view):
`graph-types, md-parser-impl, gherkin-parser-impl, ndjson-ingester-impl, graph-builder-impl, incremental-rebuild, conformance-checker, verify-phase1-green, mcp-tool-get-trace, mcp-tools-rest, pretooluse-hard-hook, posttooluse-push-hook, bash-post-test-hook, marksman-installer, file-watcher-impl, lock-manager-impl, extension-json-update, semantic-drift-check, multi-lang-extractor, sqlite-index, sqlite-recovery, spec-check-log, codespaces-detector, devcontainer-poststartcommand, heading-converter, interactive-prompt, arch-research-scripts, impl-resolve-loop, impl-architectural-detection, register-skills-in-manifest, e2e-test-reconcile-roundtrip, verify-fr-19-failure-tiers, verify-fr-22-version-gate, verify-fr-23-log-inventory, verify-fr-25-additive-merge, verify-fr-26-llm-deny-list, ws-b-status-reconcile, ws-e-install-e2e, p14-traceability-check, p16-creation-review, p17-shadow-guard, p17-skill-migration, p17-enforce, p18-legacy-classifier, p26-waived-close-gate, p30-sentinel-classifier, p30-audit-category, p30-fold-fixtures, p30-exclusions, p30-corpus-run` (50 шт.)
+ 45 DONE-задач с unchecked `- [ ]` в Done When.

### N2. Conformance 85 warning — долг ног трассировки
`FR_NO_STORY:25` (нет `**Требование:** [FR-N]` внутри `### User Story` → нет story→FR ребра) · `FR_NO_DESIGN:10` (нет Decision-ноги) · `TASK_STARTED_WITHOUT_CHAIN:1` · `TAG_BULK_SUSPECT:2`.
**Честный лимит**: конкретные сущности TASK_STARTED_WITHOUT_CHAIN / TAG_BULK_SUSPECT не определены — `conformance_check` MCP-дверь без permission в сессии; в TASKS.md нет маркеров `Status: ready/in-progress` (нарушение graph-derived).

### N3. SEMANTIC lane не мерян
`SEMANTIC_SKIPPED — no claude binary` (FR-8 semantic drift FR↔код). Для release нельзя отчитаться «no drift» — только «not checked» (FR-37c fail-loud соблюдён самим вердиктом).

### N4. FILE_CHANGES.md glob-пути ломают implements-трассировку
`[spec-graph] FILE_CHANGES.md contains glob path(s); implements edges skipped (first: .specs/pomogator-doctor/*.md)` — cross-spec glob-записи не порождают implements-рёбра → слепая зона FR-44/GT-4 для этих файлов.

### N5. `README.md:5` — строка evidence stale (см. исправление D7)

---

## Release-блокеры (приоритет для `feat/spec-generator-v4-release-prep`)

1. **Полный `scripts/docker-bdd.sh`-прогон** (НЕ на хосте!) — канонизирует фикс `_52/_372`, закроет 15 not_run, снимет EXECUTION RED, обновит evidence-строку README.
2. **TASK_TRUTH**: 50 DONE-but-unverified / 45 unchecked Done-When — либо доверифицировать, либо честно снять DONE.
3. **`NEEDS_HUMAN_REVIEW_PACKET.md`** — создать (README:51 описывает содержимое: 12 needs-human items) ИЛИ вырезать обе ссылки (README:51, README:208).
4. **`extensions/` → `tools/`** в forward-looking доках (DESIGN 18 / TASKS 10 / FILE_CHANGES 3 / FR 6); RESEARCH/CHANGELOG — допустимо как история с пометкой.
5. **README sync**: 65 FR / 173 AC / 239 tasks / evidence-строка по факту прогона (D1+N5).
6. **`@featureN`-якоря** в заголовки FR.md/AC — либо явный waiver как форматное решение (convention-долг, не гейт).
7. **`fr-N` → `FR-N`** в TASKS.md (224 шт.) — устраняет фантомные `TASK_FR_ATOMICITY`-дубли.
8. **Producer-фиксы F1–F6** в `tools/specs-generator/audit-spec.ts` — территория `spec-generator-dev` (FR-heading regex; Scenario Outline; scope-aware prose-counts; env-var vs finding-code; FILE_CHANGES create-парсер; URL/cross-spec/example-исключения в link-чекере).

**Механические гейты ConfirmStop**: STRUCTURE/TRACEABILITY/BDD_SYNC — GREEN; блокируют ровно две lanes — **EXECUTION** (закрывается п.1, если полный прогон зелёный) и **TASK_TRUTH** (п.2). D2/D4 — аудиторские (не механические) блокеры: D2 — факт пустой ссылки в финализируемом доке, D4 — конвенционный долг.

---

## Честные лимиты этого прохода

- **MCP-дверь** (`get_spec_status` / `conformance_check` / `get_test_result`) — permission не выдан (как в обеих предыдущих сессиях); компенсировано CLI-цепочкой + парсингом артефактов.
- **SEMANTIC** — не мерян (нет binary); содержательный дрейф FR↔код вне проверки.
- **TASK_STARTED_WITHOUT_CHAIN:1 / TAG_BULK_SUSPECT:2** — сущности не определены (N2).
- **AC=173 / tasks=239** — доверено grep'у пред-аудита, независимо не пересчитано (FR=65 и scenarios=521 — пересчитано мной).

## Приложение: батарея

| Инструмент | Результат |
|---|---|
| `validate-spec.ts` | `valid:true`, 0 errors / 30 warnings (26/27 файлов чистые) |
| `audit-spec.ts` | 326 findings · 0 ERROR-severity · категории: LOGIC_GAPS 178 / FANTASIES 72 / INCONSISTENCY 70 / ERRORS-category 6 (severity=WARNING/INFO) |
| `spec-verdict.ts --no-semantic` | GRAPH_GREEN / OVERALL NOT_READY / exit 1 (полный вывод сохранён в контексте сессии-аудитора) |
| cucumber-message parse | 32 141 сообщение · step PASSED 15014 / FAILED 2 / SKIPPED 2 · failed testCases: SPECGEN004_52, SPECGEN004_372 |
| Прямые grep'ы | FR.md headings=65 · `.feature` scenarios=521 · `@feature` в FR+AC=14 vs 470 в `.feature` · `fr-N` в TASKS=224 · `extensions/`=65/10 файлов · README:5 verbatim |
