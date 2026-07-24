Fail-closed rollup графа: родитель готов лишь когда ВСЕ обязательные потомки и зависимости зелёные; худшее состояние всплывает наверх
# Fail-closed rollup графа: родитель готов лишь когда ВСЕ обязательные потомки и зависимости зелёные; худшее состояние всплывает наверх

## Кратко (Summary)

Сегодня «готов ли родитель» собирается **несколькими независимыми rollup'ами с разными правилами агрегации**, и ни один из них не реализует полную fail-closed семантику «родитель готов ⇔ **ВСЕ** обязательные потомки **И** все зависимости зелёные; любое красное состояние потомка/зависимости всплывает наверх как состояние родителя». Есть правильные островки — `fr-census` агрегирует FR←его задачи через AND (`every`, не `some`), — но: (1) вердикт FR **не требует** прикреплённых AC/сценария (они входят только в отдельный `webComplete`, а не в `verdict`); (2) в графе **нет рёбер зависимостей** между FR/задачами вообще — «зависит от» нечем выразить; (3) **нет единой функции**, которая прокатывает худшее состояние снизу вверх до уровня спеки (`spec → FR → AC/Scenario → Task`), и каждая поверхность (`fr-census`, `corpus-health`, `task-census`) считает свой rollup своей политикой. Требуется одна fail-closed функция rollup в ядре `spec-graph`, которая для любого узла вычисляет состояние = **худшее** среди обязательных потомков и всех зависимостей, и поднимает его до корня.

## Проблема сегодня (concrete workflow + verified refs)

Конкретный сценарий ложной готовности: у спеки `foo` требование `FR-7` имеет две задачи — `P21-1` (done + verified) и `P21-2` (done, но ни один mapped-сценарий не PASSED). Плюс `FR-7` **зависит** от `FR-3`, который ещё `IN_PROGRESS`. Человек спрашивает «готова ли спека / FR-7?» и получает три разных ответа: `fr-census` честно скажет `DONE_UNTESTED` (задачный AND сработал), но `corpus-health` про спеку может сказать `GREEN` (если коллизий/stale нет), а про зависимость `FR-7 → FR-3` **не скажет никто** — её нечем выразить в графе. Ни одна поверхность не ответит «FR-7 не готов, потому что его зависимость FR-3 красная» — худшее состояние зависимости не всплывает наверх.

Что проверено в коде (все ссылки — на текущее дерево):

1. **Правильный островок: `fr-census` агрегирует FR←задачи через AND.**
   - `tools/spec-graph/fr-census.ts::computeFrCensus` (L121). Анти-false-green агрегация: `allDone = tasks.every(t => t.status === 'done')` (L173), `allVerified = allDone && tasks.every(t => cov.tasks[t.id]?.verified_status === 'DONE')` (L174). Вердикт: `IMPLEMENTED` только если `allVerified`, иначе `DONE_UNTESTED` (L182).
   - Это прямое применение правила `rollup-completeness-all-not-any` (инцидент 2026-06-11: `anyImplemented` зеленело FR-43 при одной done-задаче среди `[todo,todo,done,in-progress]`).
   - **НО** rollup идёт **только по задачам**. `hasAc` (L189), `hasScenario` (L190), `hasDesign`/`hasStory`/`hasResearch` (L191–193) собираются в `missingLegs`/`webComplete` (L196–219), однако поле `verdict` (L180–184) их **не учитывает**: FR без единого AC/сценария всё равно может быть `IMPLEMENTED`, если его задачи done+verified. «Обязательные потомки AC/Scenario» не являются обязательными для вердикта.

2. **Зависимостей в графе нет — «зависит от» нечем выразить.**
   - `tools/spec-graph/types.ts::EdgeType` (L33–42): `refs | covers | tested-by | tagged-by | implements | last-result | runtime-trace | step-binding | code-impl`. **Типа `depends-on` нет.** Ни один edge-producer (md / gherkin / ndjson / file-changes) не строит ребро зависимости FR↔FR или Task↔Task.
   - Единственное «цепочечное» правило — `task-lifecycle.ts::canEnterWorkingStatus` + finding `TASK_STARTED_WITHOUT_CHAIN` (`conformance.ts` L278) — проверяет, что у задачи собрана цепочка (AC/сценарий) **перед стартом**, но это gate **входа в работу**, а не rollup готовности по зависимостям. Готовность одной сущности от готовности другой, от которой она зависит, **не вычисляется нигде**.

3. **Нет единого «худшее всплывает наверх» до уровня спеки — три своих rollup'а.**
   - `fr-census.ts`: per-FR `verdict` + per-report `verdict: byVerdict.DONE_UNTESTED > 0 ? 'RED' : 'GREEN'` (L245) и `strictVerdict` (L246) — агрегация **внутри отчёта**, не прокатывание состояния узла вверх по иерархии `FR → spec`.
   - `tools/spec-graph/corpus-health.ts::corpusHealth` (L80): per-spec `verdict`/`strictVerdict` (L73–74) считается из `checkTraceabilityCompleteness`-gaps (L111) и собственных флагов `hardRed`/`anyDebt` (L171–172) — **своя** политика rollup, не читающая `fr-census.verdict` как вход. Per-spec verdict здесь = «есть ли коллизии/stale/debt», а **не** «все ли FR этой спеки готовы».
   - `tools/spec-graph/task-census.ts` (P21-6): per-spec `open`/`doneRed`/`doneUnrun` (`SpecCensus` L52+) — **третий** rollup, опять со своей политикой (doneRed исключает not_run/stale, L11–13).
   - Итог: «готова ли спека» = пересечение трёх разных агрегаций, и ни одна не поднимает худшее состояние потомка/зависимости до корня единым проходом.

### Таблица нынешних rollup-политик (одно «готово» — разные правила)

| Rollup | Где | Что агрегирует | Правило | Чего не видит |
|---|---|---|---|---|
| per-FR verdict | `fr-census.ts` L180–184 | задачи FR | AND (every done + every verified) | AC/Scenario как обязательные; зависимости |
| per-FR webComplete | `fr-census.ts` L195–219 | 6 ног (AC/сценарий/задача/design/story/research) | AND (missingLegs пусто) | не входит в `verdict`; нет зависимостей |
| per-spec corpus | `corpus-health.ts` L171–172 | коллизии/stale/debt + gaps | hardRed/anyDebt | per-FR готовность как вход |
| per-spec task-census | `task-census.ts` L52+ | open/doneRed/doneUnrun | свои buckets | FR/AC; зависимости |
| вход в работу | `task-lifecycle.ts` / `TASK_STARTED_WITHOUT_CHAIN` | цепочка AC/сценарий | gate **старта** | готовность зависимости |

### Доказуемые пробелы fail-closed семантики

- (a) **Обязательные потомки не все обязательны:** `verdict: IMPLEMENTED` достижим при `hasAc=false`/`hasScenario=false` (`fr-census.ts` L180–184 vs L189–190). Fail-closed требовал бы: FR с обязательным AC, у которого нет ни одного PASSED-сценария, не может быть готов.
- (b) **Зависимости не моделируются:** нет `depends-on` в `EdgeType` (`types.ts` L33–42) → «FR-7 зависит от FR-3» невыразимо → худшее состояние зависимости не всплывает.
- (c) **Нет прокатывания вверх:** ни одна функция не вычисляет состояние спеки = худшее из состояний её FR (с учётом их зависимостей). `corpus-health` и `task-census` считают per-spec независимо от `fr-census`.

### Что уже намекает на fail-closed (но не доделано)

- `rollup-completeness-all-not-any` (правило + инцидент FR-43) зафиксировало **AND-агрегацию** как норму — но только на уровне FR←задачи.
- `webComplete` (`fr-census.ts` L219) — это уже AND по шести ногам, готовый строительный блок для «все обязательные потомки», но он **отделён** от `verdict`.
- `TASK_STARTED_WITHOUT_CHAIN` (`conformance.ts` L278) — доказательство, что граф умеет проверять «цепочка собрана»; нужен следующий шаг — «цепочка **зелёная**, и зависимости зелёные».

**Итог:** AND-агрегация есть на одном уровне; fail-closed прокатывание «все обязательные потомки + все зависимости → худшее всплывает» — нет. Это и надо построить как одну функцию.

## Before / after

**Before** — три rollup'а, три ответа, зависимости невидимы:

```text
# foo:FR-7 — задачи P21-1 (done+verified), P21-2 (done, сценарий не PASSED); FR-7 зависит от FR-3 (IN_PROGRESS)

$ node --import tsx tools/spec-graph/fr-census.ts --spec foo
FR-7: DONE_UNTESTED      # AND по задачам сработал; зависимость FR-3 не видна
webComplete: false       # нет сценария — но это отдельное поле, не вердикт

# corpus-health про спеку foo:
verdict: GREEN           # коллизий/stale нет; то что FR-7/FR-3 не готовы — не вход

# «FR-7 зависит от FR-3, а FR-3 красный» — не говорит НИКТО (ребра depends-on нет)
```

**After** — одна fail-closed функция, худшее состояние всплывает до корня:

```text
# spec-graph/rollup.ts — ЕДИНСТВЕННАЯ точка fail-closed rollup
computeRollup(graph, { node: "foo:FR-7" }) →
{
  "node": "foo:FR-7",
  "state": "NOT_READY",                 // худшее из обязательных потомков + зависимостей
  "reason": [
    { "kind": "DESCENDANT", "node": "foo:P21-2", "state": "DONE_UNTESTED",
      "message": "обязательная задача done, но mapped-сценарий не PASSED" },
    { "kind": "DEPENDENCY", "node": "foo:FR-3", "state": "IN_PROGRESS",
      "message": "зависимость FR-3 не готова" }
  ],
  "mandatoryDescendants": { "total": 4, "ready": 2 },   // AC/Scenario/Task — все обязательные
  "dependencies": [ "foo:FR-3" ]
}

computeRollup(graph, { node: "foo" /*спека*/ }) →
{ "node": "foo", "state": "NOT_READY",
  "reason": [ { "kind": "DESCENDANT", "node": "foo:FR-7", "state": "NOT_READY", ... } ] }
# худшее состояние FR-7 (а через него — FR-3) всплыло до спеки одним проходом
```

CLI/MCP/audit получают один объект rollup; «родитель готов при красном потомке или красной зависимости» **становится непредставимым** — состояние родителя всегда = худшее из обязательных потомков и всех зависимостей.

## Предлагаемое поведение (Proposed behavior)

1. **Ребро зависимости.** Добавить `depends-on` в `EdgeType` (`tools/spec-graph/types.ts` L33–42) + edge-producer: явная декларация в спеке (напр. строка `Depends-On: FR-3` в блоке FR или таблица в DESIGN/TASKS). Продьюсер — новый парсер-slice по образцу `parsers/file-changes.ts` (толерантный, `FR_CITATION_RE`-подобный). Зависимости — **все обязательные** (декларированная зависимость = жёсткая).

2. **Классификация потомков «обязательные/опциональные».** Для узла обязательные потомки: у FR — его AC (`covers`), его сценарии (`tested-by`), его реализующие задачи (`refs` инверсно); у AC — покрывающие сценарии; у спеки — её FR. Опциональные (не блокируют): например, `Risk`/`UseCase`-ноды. Классификация — одна функция `mandatoryChildren(graph, node)` над существующими типами рёбер.

3. **Одна fail-closed функция rollup** в `tools/spec-graph/rollup.ts`:
   ```ts
   export type RollupState =
     | 'READY'          // все обязательные потомки + все зависимости READY
     | 'NOT_READY';     // хотя бы один обязательный потомок ИЛИ зависимость не READY
   export function computeRollup(
     graph: SpecGraph,
     opts: { node: string; evidence?: EvidenceStateByNode },  // evidence из Tier-1 #3
   ): RollupResult;   // { node, state, reason[], mandatoryDescendants, dependencies[] }
   ```
   Семантика: `state(node) = worst( state(каждый обязательный потомок), state(каждая зависимость) )`, рекурсивно с мемоизацией и защитой от циклов (зависимости могут циклиться → детект цикла = отдельная находка, не зависание). `READY` требует evidence-состояние `verified` (из Tier-1 #3) для leaf-узлов «задача/сценарий», а не просто флаг `done`.

4. **`fr-census.verdict` становится производным от rollup.** `IMPLEMENTED` ⇔ `computeRollup(FR).state === 'READY'` (все задачи verified **И** обязательные AC/сценарий прикреплены и зелёные **И** зависимости готовы). Нынешние `allDone`/`allVerified` (L173–174) остаются как leaf-логика, но итоговый вердикт берётся из rollup; `webComplete` сливается с rollup (ноги = обязательные потомки).

5. **Per-spec rollup = худшее из её FR.** `corpus-health`/`task-census` продолжают давать свои **диагностические** счётчики, но итоговый per-spec «готов/не готов» читается из `computeRollup(spec)`, а не считается заново своей политикой.

6. **Инвариант fail-closed:** не существует входа, при котором `computeRollup(parent).state === 'READY'`, пока любой обязательный потомок или любая зависимость не `READY` (negative-pin тест на каждый уровень иерархии).

### Малый формат данных (API in/out)

```jsonc
// OUT: computeRollup / поле в computeSpecVerdict (Tier-1 #1)
{
  "node": "foo:FR-7",
  "schema": "spec-rollup@1",
  "state": "NOT_READY",
  "reason": [
    { "kind": "DESCENDANT", "node": "foo:P21-2", "state": "DONE_UNTESTED",
      "message": "обязательная задача помечена done, но mapped-сценарий не PASSED" },
    { "kind": "DEPENDENCY", "node": "foo:FR-3", "state": "IN_PROGRESS",
      "message": "зависимость не готова" }
  ],
  "mandatoryDescendants": { "total": 4, "ready": 2, "notReady": ["foo:P21-2", "foo:AC-7.2"] },
  "dependencies": ["foo:FR-3"],
  "cycle": null        // либо список узлов цикла зависимостей
}
```

## Scope

**In scope:**
- Ребро `depends-on` в `EdgeType` + парсер-продьюсер деклараций зависимостей.
- `mandatoryChildren(graph, node)` — классификация обязательных/опциональных потомков по существующим типам рёбер.
- Одна чистая функция `computeRollup` (рекурсия + мемоизация + детект цикла) в `tools/spec-graph/rollup.ts`.
- Перевод `fr-census.verdict` и per-spec готовности на чтение rollup; слияние `webComplete` с rollup.
- Инвариант «родитель READY ⇔ все обязательные потомки и все зависимости READY» + negative-pin тесты.
- BDD-сценарии: «красный потомок → родитель NOT_READY», «красная зависимость → родитель NOT_READY», «цикл зависимостей → отдельная находка, не зависание».

**Out of scope:**
- Словарь evidence-состояний leaf-узлов (`untagged/exercised/impl-only/verified`) — это **Tier-1 #3**; здесь rollup лишь **потребляет** `verified` как leaf-условие READY.
- Новая находка `UNVERIFIED_COMPLETION` — **Tier-1 #4**; rollup даёт для неё вход («done, но не READY»).
- Reverse-аннотации исходников — **Tier-1 #5** (могут стать источником leaf-узлов, но не реализуются здесь).
- Единая каноническая функция вердикта и перевод поверхностей — **Tier-1 #1**; rollup — её внутренний строительный блок, не функция вердикта.
- Forward change-impact / blast-radius — это **#166** (прямое направление «что сломается при изменении X»); здесь — обратное «готов ли родитель при состояниях потомков/зависимостей».

## Вероятные точки реализации (verified paths)

- `tools/spec-graph/rollup.ts` — **новый** модуль: `computeRollup`, `mandatoryChildren`, детект цикла.
- `tools/spec-graph/types.ts` (`EdgeType` L33–42) — добавить `depends-on`; `Edge.metadata` (L265–271) при необходимости расширяется.
- `tools/spec-graph/parsers/` — **новый** парсер-slice деклараций зависимостей по образцу `parsers/file-changes.ts` (L28–62: `FileChangeRow`, `FR_CITATION_RE` L57, толерантный разбор).
- `tools/spec-graph/builder.ts` — подключить продьюсер `depends-on`-рёбер (по образцу `emitImplements` L278–300, `implementsSeen`-дедуп L241/L287, qualifyFr L310/L325).
- `tools/spec-graph/fr-census.ts` (`computeFrCensus` L121, `allDone`/`allVerified` L173–174, `verdict` L180–184, `webComplete`/`missingLegs` L195–219, `FrCensusReport.verdict` L245) — verdict как производная от `computeRollup`; leaf-логика остаётся.
- `tools/spec-graph/legs.ts` (`buildLegIndices` — индексы AC/design/story/directlyTested, используется в `fr-census.ts` L127) — источник «какие потомки прикреплены» для `mandatoryChildren`.
- `tools/spec-graph/corpus-health.ts` (`corpusHealth` L80, per-spec `verdict`/`strictVerdict` L73–74/L171–172) — per-spec готовность читать из `computeRollup(spec)`.
- `tools/spec-graph/task-census.ts` (`SpecCensus` L52+, `open`/`doneRed`/`doneUnrun`) — диагностические счётчики остаются, итоговый per-spec «готов» — из rollup.
- `tools/spec-graph/task-lifecycle.ts` (`canEnterWorkingStatus`) + `conformance.ts` (`TASK_STARTED_WITHOUT_CHAIN` L278) — переиспользовать понимание «цепочка собрана»; расширить до «цепочка зелёная + зависимости зелёные».

## Наблюдаемый end-to-end acceptance (включая BDD и реальные артефакты)

- [ ] `computeRollup(graph, {node})` — единственная функция fail-closed rollup; grep подтверждает, что `fr-census.verdict` и per-spec готовность читают её, а не считают свою агрегацию.
- [ ] На **реальной спеке** `.specs/spec-generator-v4/`: FR с одной done+verified задачей и одной done-без-PASSED-сценария задачей даёт `state: NOT_READY` (не `IMPLEMENTED`); FR, зависящий от `IN_PROGRESS`-FR, даёт `NOT_READY` с `reason.kind: DEPENDENCY`.
- [ ] **Fail-closed инвариант**: ни на одном реальном/тестовом графе родитель не `READY` при не-`READY` обязательном потомке или зависимости (negative-pin на каждый уровень: Task→AC→FR→spec).
- [ ] **Цикл зависимостей** (FR-A → FR-B → FR-A) не зависает: детектится и возвращается как `cycle: [...]` + отдельная находка, rollup завершается.
- [ ] Обязательные AC/Scenario учитываются вердиктом: FR без PASSED-сценария при `hasScenario=true` не `READY` (слияние `webComplete` в rollup).
- [ ] **BDD**: сценарии в `.specs/spec-generator-v4/spec-generator-v4.feature` (новые slug-id `SPECGEN004_1xx`) — «красный потомок ⇒ родитель NOT_READY», «красная зависимость ⇒ родитель NOT_READY», «цикл ⇒ находка, не hang»; прогон **только в Docker** (`scripts/docker-bdd.sh`), `lastResult===PASSED` по slug-id, не по отсутствию в fail-list (правило `cucumber-expression-parens`).
- [ ] Реальный артефакт: `computeRollup` прогоняется на реальном `.specs/spec-generator-v4/`-графе (не рукодельном); фикстуры зеркалят реальный вывод графа (правило `verify-against-real-artifact`); смоук на реальном графе с заведомо незавершённым FR (ловит OR-ложь по правилу `rollup-completeness-all-not-any`).

## Совместимость / миграция

- **`fr-census` CLI/JSON**: поле `verdict` сохраняет значения `IMPLEMENTED|DONE_UNTESTED|IN_PROGRESS|PLANNED|UNIMPLEMENTED` (на них завязаны gate-скрипты `--strict`); `IMPLEMENTED` теперь выводится из rollup, существующие потребители (banner, spec-conformance-push) не ломаются. Добавляется поле `rollup: {state, reason[]}`.
- **`webComplete`/`missingLegs`**: оставляются как view на один релиз (deprecated), выводятся из `mandatoryDescendants`; потребители (`corpus-health`, отчёты) переводятся на rollup.
- **Новое ребро `depends-on`**: additive в `EdgeType`; существующие edge-продьюсеры (md/gherkin/ndjson/file-changes) не трогаются (поле `metadata` опционально, `types.ts` L269). Графы без деклараций зависимостей дают `dependencies: []` → поведение идентично нынешнему.
- **`corpus-health`/`task-census`**: их счётчики (`open`/`doneRed`/`doneUnrun`, gaps) остаются диагностикой; итоговый per-spec «готов» берётся из rollup — формат отчёта расширяется, не ломается.
- Миграция по шагам: (1) добавить `depends-on` + парсер (empty-by-default); (2) добавить `mandatoryChildren` + `computeRollup`; (3) перевести `fr-census.verdict` на rollup (leaf-логика та же → zero-diff на текущем корпусе, где зависимостей нет); (4) перевести per-spec готовность; (5) пометить `webComplete` deprecated.

## Связанные issue

- **#162** — spec-generator-v4 closure program: **зонтик**; этот issue — его подзадача «fail-closed rollup».
- **tier1-1** — единый канонический вердикт поверхностей: rollup — внутренний строительный блок того вердикта (там явно отложено «fail-closed rollup зависимостей = Tier-1 #2»).
- **tier1-3** — evidence-состояния (`untagged/exercised/impl-only/verified`): rollup потребляет `verified` как leaf-условие READY.
- **tier1-4** — находка `UNVERIFIED_COMPLETION`: rollup даёт для неё вход («помечено done, но rollup NOT_READY»).
- **#166** — forward change-impact / blast-radius: **противоположное направление** (от изменённого узла вперёд «что заденет»); здесь — обратное (от потомков/зависимостей вверх «готов ли родитель»). Общий предок — один авторитетный граф.
- Внутренние предшественники: правило `rollup-completeness-all-not-any` (инцидент FR-43), FR-37 (honest verdict), FR-47b (trace-web legs / AND-aggregation), FR-48 (`canEnterWorkingStatus` / цепочка перед стартом).

## Prior art (прямые ссылки + заимствуемая механика)

1. **Apache Airflow — состояние DAGRun вычисляется как агрегация состояний всех его TaskInstance: `failed`, если ЛЮБАЯ задача упала; `success`, только если ВСЕ успешны (fail-closed, худшее всплывает).**
   `airflow/dagrun.py`, метод `DAGRun.update_state`: https://github.com/apache/airflow/blob/main/airflow/dagrun.py
   `update_state()` обходит все TaskInstance запуска: наличие любого `failed` → DAGRun = `failed`; `success` ⇔ все задачи в терминальном успехе. Состояние родителя **не декларируется** — оно **выводится** из худшего состояния потомков. **Заимствуем механику:** состояние спеки/FR — это вывод из худшего состояния обязательных потомков и зависимостей; «родитель готов при красном потомке» непредставим, как в Airflow DAGRun не `success` при упавшей задаче.

2. **Kubernetes — Deployment считается `Available` только когда обновлённые И доступные реплики составляют ВСЕ требуемые (AND, не «хотя бы одна»); условие пересчитывается контроллером и прокатывается в `status`.**
   `kubernetes/kubernetes/pkg/controller/deployment/progress.go`, `NewDeploymentCondition` / расчёт `Available`: https://github.com/kubernetes/kubernetes/blob/master/pkg/controller/deployment/progress.go
   `Available = updatedReplicas == replicas && availableReplicas == replicas` — готовность родителя требует готовности **всех** обязательных единиц; контроллер пересчитывает условие и пишет его в `status`, потребители его читают. **Заимствуем механику:** «готов» родителя = все обязательные потомки готовы (AND); rollup пересчитывается из графа, а не декларируется флагом. Отличие от tier1-1 (там `IsPodReady` — одно условие на один узел): здесь именно **rollup многих потомков в состояние родителя**.

3. **Bazel — статус цели выводится транзитивно: цель падает, если падает ЛЮБАЯ её зависимость; «buildable» цель требует успешности всего графа зависимостей (fail-fast propagation).**
   `bazelbuild/bazel`, анализ действия/цели — семантика transitive failure: https://github.com/bazelbuild/bazel
   В Bazel цель не может успешно собраться, если любая (транзитивная) зависимость не собралась — худшее состояние зависимости всплывает до цели без явной пометки на самой цели. **Заимствуем механику:** явные рёбра зависимостей (`depends-on`) + прокатывание худшего состояния зависимости наверх; готовность FR-7 невозможна, пока зависимость FR-3 не готова, — ровно как цель Bazel не buildable при упавшей зависимости.

