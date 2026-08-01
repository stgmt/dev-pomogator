# Анализ: почему «выполнено» ставится только по тестам

Вопрос владельца: вердикт должен учитывать не только трассировку тестов, но и (1) соблюдение acceptance criteria, (2) нефункциональные требования, (3) ручные/демонстрационные обязательства («запиши mp4 и посмотри») — с реальным выполнением агентом, иначе фича/таск не «done».

Всё ниже — по коду на `main` (6506f760), с точными ссылками.

---

## 1. Как вердикт устроен сейчас

`computeSpecVerdict` (`tools/spec-graph/verdict.ts:72-86`) — И-композиция трёх входов:

| Вход | Что даёт | Источник |
|------|----------|----------|
| `findings` severity=error | RED | `conformance.ts` |
| `readiness.overall` | READY / NOT_READY | `readiness-inventory.ts:584` |
| `completionDebt` | UNVERIFIED_COMPLETION | `verdict.ts:38` |

GREEN = ноль error-находок **И** `readiness = READY` **И** пустой completion-debt.

`readiness` — AND по 5 обязательным лентам (`readiness-inventory.ts:486-492`):
`STRUCTURE`, `TRACEABILITY`, `EXECUTION`, `TASK_TRUTH`, `BDD_SYNC`.

Из них про реальные прогоны — только `EXECUTION` (`deriveExecutionLane`, `:545`), и она смотрит ровно на `inventory.scenarios[].outcome` + `inventory.frs[].never_run`. То есть **вся доказательная база вердикта — исходы cucumber-сценариев**. Остальные четыре ленты — про форму графа.

---

## 2. Дыра 1 — AC не верифицируется самостоятельно

`readiness-inventory.ts:411-424`, комментарий прямым текстом:

> `// ── AC entries: an AC maps to its parent FR's scenarios (FR-N ↔ AC-N(FR-N)) ──`

AC берёт `frKeysById.get(ac.parentFr)` — **все AC одного FR получают один и тот же набор сценариев**. Один зелёный `@FR-7` → `AC-7.1`, `AC-7.2`, `AC-7.3` одинаково выглядят покрытыми, даже если ни один из них по существу не проверялся.

Хуже: в `conformance.ts` **нет ни одного AC-уровневого кода находки**. Полный список — `UNCOVERED_FR` (:191), `UNVERIFIED_FR` (:214), `FR_DEMAND_*` (:238,:242), `FR_NO_DESIGN` (:257), `FR_NO_STORY` (:276), `TASK_*`, `SCENARIO_TAG_ORPHAN`, `UNTAGGED_SCENARIO`, `TAG_BULK_SUSPECT`, `ID_NORMALIZATION_COLLISION`, `ENDPOINT_VIOLATION`. `UNCOVERED_FR` фильтрует `node.type !== 'FR'` (:184).

**Следствие:** AC, который не тегнут ни одним сценарием, невидим для вердикта. Нет `UNCOVERED_AC`, нет `UNVERIFIED_AC`.

Ирония в том, что механика уже есть и не используется:
- `edge-schema.ts:20-21` — `tested-by` принимает target `'AC'`;
- `edge-schema.ts` — `verifies` принимает source `'AC'`;
- `parsers/gherkin.ts:36` — `@AC-N.M` уже парсится в ребро.

Рельсы проложены, поезд не пущен.

---

## 3. Дыра 2 — NFR выпадает из readiness целиком

Три места, где NFR отрезается:

1. `readiness-inventory.ts:303-304` — инвентарь собирает только `type === 'FR'` и `type === 'AC'`. NFR не собирается.
2. `readiness-inventory.ts:353` — `if (!from || from.type !== 'FR' || from.spec !== slug) continue;` → **`tested-by` рёбра от NFR выбрасываются** при построении карты «требование → сценарии».
3. `conformance.ts:235` — `if (node.type !== 'FR' || !node.metadata …) continue;` → **NFR исключён из `evaluateDelivery`**, то есть типизированные delivery-demands (FR-66) на NFR не работают вообще.

Частично NFR ловится `UNVERIFIED_FR` (`conformance.ts:209` включает NFR), но это `severity: 'warning'` (:215), а RED считается только по `severity === 'error'` (`verdict.ts:78`). **Warning вердикт не роняет.**

**Следствие:** спека получает GREEN при нуле проверенных NFR.

---

## 4. Дыра 3 — не-тестовые методы верификации объявлены, но ни к чему не подключены

`metadata-schema.ts:4`:
```ts
export const VERIFICATION_METHODS = ['test', 'analysis', 'review', 'inspection', 'demonstration'] as const;
```

Единственный потребитель во всём дереве — фильтр в `policy_query_requirements` (`tools/spec-mcp-server/tools.ts:1045-1057`). **Ни один гейт не читает `verificationMethod`.**

FR с `verificationMethod: demonstration` гейтится ровно так же, как `test`: нужен зелёный cucumber-сценарий, и больше ничего. Поле — метаданные для отчётов, не контракт.

---

## 5. Дыра 4 — delivery-demand можно объявить руками (самоаттестация)

`delivery-demands.ts:19-30`, `evidenceState()`:

```ts
if (demand.state) return demand.state;      // ← строка 20: рукописный state побеждает всё
...
if (demand.type === 'implementation')  → есть ли ребро implements
if (demand.type === 'integration-test') → есть ли зелёный не-stale tested-by сценарий
return 'MISSING';                            // ← всё остальное
```

Три проблемы:

- **`state: PRESENT` в YAML → demand удовлетворён без единой проверки.** `satisfied()` (:32-37) требует rationale/actor/auditRef только для `WAIVED`; `PRESENT` проходит молча (:34).
- **`evidenceRefs` проверяет только существование узла** (:23 — `graph.nodes.has(ref)`), не его состояние. `evidenceRefs: [SCEN-foo]` = PRESENT, даже если SCEN-foo провален.
- **Автовывод есть только для двух типов из пяти.** `documentation`, `migration` и — главное — **`operational-proof`** вычислителя не имеют вообще.

`DEMAND_TYPES` (`metadata-schema.ts:6`) содержит `'operational-proof'` — ровно то, что нужно для «записать mp4 и посмотреть». Тип объявлен, семантики за ним нет.

Положительное: `FR_DEMAND_MISSING` — уже `severity: 'error'` (`conformance.ts:242`), то есть **каркас блокирующего не-тестового гейта уже стоит и уже роняет вердикт в RED.** Его надо наполнить, а не строить с нуля.

---

## 6. Дыра 5 — нет понятия «артефакт-улика»

`list_spec_docs` перечисляет `attachments/` (`tools.ts:1626-1648`), `read_attachment` их читает (`tools.ts:1769-1798`). Но:

- ни один узел графа не ссылается на attachment;
- в `EDGE_SCHEMA` (11 типов) нет ребра про артефакт — ближайшее `runtime-trace`, оно про синтетические `TRACE-*` цели;
- нет проверки «файл на месте / не нулевой / хеш тот / свежее последнего прогона».

**Следствие:** mp4 можно положить в `attachments/`, граф про него не узнает, вердикт не сдвинется.

---

## 7. На что можно опереться

| Что уже есть | Где | Чем полезно |
|---|---|---|
| `@manual` как отдельный класс сценария | `coverage.ts:180` (FR-52e), `bdd-migrator/inventory.ts:31` | класс «не автоматизируемо» уже понимается, не надо изобретать |
| Ленты readiness расширяемы | `readiness-inventory.ts:486-498` | новая лента = имя в массив + вычислитель |
| `FR_DEMAND_MISSING` уже error | `conformance.ts:242` | блокирующий не-тестовый гейт уже подключён к вердикту |
| Staged-подход warning→error | `FR_NO_DESIGN`, `conformance.ts:251-252` | проверенный способ вводить гейт без залпового покраснения корпуса |
| Протокол «смотреть глазами» | правило `screenshot-driven-verification`, скилл `debug-screenshot` (формат CONFIRMED/DENIED) | готовый образец для «посмотреть mp4» |
| Независимый судья | `tools/spec-llm-judge` | второй глаз на артефакт против самоаттестации |

---

## 8. Что чинить — три пакета по возрастанию цены

### Пакет A — AC начинает отвечать за себя (дёшево, ~1 PR)

1. В инвентаре строить AC→сценарии по **собственным** `tested-by`/`verifies` рёбрам на AC; наследование от родительского FR оставить только как fallback с явным флагом `inherited: true` в записи.
2. Новые коды `UNCOVERED_AC` (ни одного `@AC`-тега) и `UNVERIFIED_AC` (тег есть, зелёного `verifies` нет). Ввести как warning, поднять до error после ретрофита — по образцу `FR_NO_DESIGN`.
3. Обязательная лента `AC_SATISFACTION`: GREEN только когда у каждого AC есть собственная зелёная улика или явный `inherited`-waiver.

Закрывает буквальную формулировку «при соблюдении acceptance criteria».

### Пакет B — NFR попадает в вердикт (дёшево, ~1 PR)

4. Снять фильтры на `readiness-inventory.ts:303-304` и `:353` — собирать NFR наравне с FR.
5. Снять `node.type !== 'FR'` на `conformance.ts:235` — разрешить delivery-demands на NFR.
6. Лента `NFR_SATISFACTION` + поднять `UNVERIFIED_FR` до error для NFR с `obligation: required`.

### Пакет C — ручные и демонстрационные доказательства (это и есть история про mp4; ~2-3 PR)

7. Тип узла `Evidence` + ребро `evidenced-by` (Scenario/AC/FR/NFR → Evidence) в `EDGE_SCHEMA`.
8. Манифест артефакта рядом с `attachments/`: `sha256`, `producedAt`, `producedBy`, `runId`, `checks` (длительность/размер/кодек для mp4).
9. Вычислитель `operational-proof` в `evidenceState()`: PRESENT только если Evidence-узел есть, файл на месте, хеш сходится, `producedAt` не старше последнего прогона (по аналогии с `resultStale`).
10. Подключить `verificationMethod` к гейту: `demonstration`/`inspection` → обязателен `operational-proof`-demand; `test` → как сейчас.
11. Закрыть самоаттестацию: для `operational-proof` голый `state: PRESENT` запретить — требовать `actor` + `auditRef` (сейчас `satisfied()` требует их только для `WAIVED`).
12. Агентская сторона: скилл, который **реально записывает и реально смотрит** — отдаёт кадры мультимодальной модели и возвращает структурированный CONFIRMED/DENIED, как в `screenshot-driven-verification`.

---

## 9. Честное ограничение пакета C

Любое доказательство, которое производит тот же агент, который по нему отчитывается, — самоаттестация. Хеш и таймстемп ловят «файл не тот» и «файл старый», но **не ловят «агент записал не то и написал CONFIRMED»**.

Смягчение (не устранение): независимый судья на артефакте (`spec-llm-judge`) + обязательные `actor`/`auditRef`. Это переводит задачу из «доверяем на слово» в «есть след, по которому ловится враньё» — но не в «невозможно соврать». Стоит зафиксировать это как явное ограничение в спеке, а не делать вид, что гейт герметичен.

---

## 10. Рекомендация

Начинать с **A + B одним PR** (одна фича — один PR): это два фильтра-снятия и две ленты, полностью в существующей архитектуре, и оно уже закрывает «AC и NFR учитываются». Пакет C — отдельной спекой, потому что он вводит новый тип узла, новое ребро и новый вид улики, и требует собственных BDD-сценариев на подделку артефакта (несходящийся хеш, протухший `producedAt`, отсутствующий файл).
