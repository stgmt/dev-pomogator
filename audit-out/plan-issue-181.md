## Summary

Словарь рёбер графа — закрытый союз `EdgeType` из 9 членов (`refs | covers | tested-by | tagged-by | implements | last-result | runtime-trace | step-binding | code-impl`, `tools/spec-graph/types.ts:33-42`). Из трёх целевых отношений **`covers` уже существует** (его создают `FR→AC`, `FR→Decision`, `FR→Story`, `parsers/md.ts:314,385,406`), а **`verifies` и `entitles` отсутствуют**. Нужно добавить `verifies` и `entitles` как полноправные члены `EdgeType` с ясной семантикой, направлением и допустимыми концами — согласованно с текущим словарём, чтобы каждое отношение несло разный смысл (покрывает / подтверждает / уполномочивает), а не дублировало `covers`/`tested-by`.

## Problem today (конкретный рабочий сценарий + текущие file/symbol)

Сегодня отношение «X как-то связан с Y» выражается ограниченным набором, где два разных по смыслу факта вынужденно сливаются:

- `covers` (`md.ts:314,385,406`) = «FR **покрывается/удовлетворяется** AC/Decision/Story» (ребро направлено FR→потомок).
- `tested-by` (`parsers/gherkin.ts:176,185`) = «FR **тестируется** сценарием» (по тегам `@featureN`/`@FR-N`).
- `implements` (`builder.ts:~282-302`) = «FR **реализован** файлом».

Чего не хватает:

1. **Нет `verifies` (направление доказательства).** «Сценарий/AC/результат **подтверждает** требование» — это дуальное к `tested-by` направление, которое к тому же должно нести provenance (producer/version, run id — см. #tier1-10). Сегодня `Scenario→RESULT last-result` (`builder.ts:394`) и `runtime-trace` (`builder.ts:397`) фиксируют факт прогона, но нет ребра «это доказательство **verifies** вот этот FR», по которому `find_refs`/`get_trace` могли бы идти от доказательства к требованию. `coverage.ts`/`fr-census.ts` вынуждены разворачивать `tested-by` в обратную сторону вручную.
2. **Нет `entitles` (уполномочивание/разрешение).** «Решение/UseCase **уполномочивает** FR/работу» — факт авторизации, отличный и от «покрывает» (`covers`), и от «тестируется» (`tested-by`). Сегодня архитектурное решение, разрешающее фичу, записывается как `FR→Decision covers` (`md.ts:385`), смешивая «решение покрывает требование» с «решение **разрешает** требование» — а это разные вопросы для аудита и traceability.

Конкретный фейл-сценарий: владелец спрашивает «какое решение **уполномочило** FR-5 и чем FR-5 **подтверждён**?». `get_trace` (`tools/spec-mcp-server/tools.ts:790-792`) и `find_refs` (`tools.ts:1172-1184`) идут по `covers`/`tested-by`/`implements` — оба вопроса отвечаются одним размытым `covers`, доказательная часть (`verifies`) с producer/version вообще не представлена ребром.

`pushEdge` (`gherkin.ts:108-111`) дедуплицирует по `from|to|type`, так что новый член союза автоматически получит дедупликацию; но сам союз закрытый — добавить `verifies`/`entitles` без правки `types.ts` нельзя (TS не скомпилирует неизвестный `type`).

## Before / after example

**Before** (решение `D-2` разрешает `FR-5`; сценарий `SPECGEN004_143` подтверждает `FR-5`):

```jsonc
// оба факта вынужденно как covers/tested-by:
{ "from": "D-2",  "to": "FR-5", "type": "covers" }              // «покрывает» ≠ «разрешает»
{ "from": "FR-5", "to": "SCEN-specgen004_143", "type": "tested-by" }
// направления «доказательство → требование» нет; provenance негде нести.
```

**After** (явные типизированные отношения):

```jsonc
{ "from": "D-2", "to": "FR-5", "type": "entitles" }            // решение УПОЛНОМОЧИВАЕТ требование
{ "from": "SCEN-specgen004_143", "to": "FR-5", "type": "verifies",
  "metadata": { "producer": "cucumber-js@11.3.0", "runId": "…", "outcome": "PASSED" } }
// covers остаётся для FR→AC («покрывается/удовлетворяется»), tested-by — для FR→Scenario.
```

## Proposed behavior (малый data/API output)

1. **Расширить `EdgeType`** (`types.ts:33-42`) двумя членами, сохранив закрытость союза:

```ts
export type EdgeType =
  | 'refs' | 'covers' | 'tested-by' | 'tagged-by'
  | 'implements' | 'last-result' | 'runtime-trace'
  | 'step-binding' | 'code-impl'
  | 'verifies' | 'entitles';   // NEW
```

2. **Семантика и направление** (каждое отношение — отдельный смысл):
   - `covers` (существует): `FR → AC|Story|Decision` — «покрывается/удовлетворяется».
   - `verifies` (новое): `Scenario|AC|VerificationResult → FR|NFR` — «предоставляет доказательство, подтверждающее требование»; несёт `metadata` с provenance (producer/version, run id, outcome — стыкуется с #tier1-10). Дуально к `tested-by` (обратное направление + доказательная нагрузка).
   - `entitles` (новое): `Decision|UseCase → FR|NFR|Task` — «уполномочивает/разрешает работу»; факт авторизации для аудита.
3. **Продюсеры рёбер** (парсинг, согласованно с существующими): якорь-синтаксис в спеках (например `Verifies: FR-5` в блоке сценария/AC, `Entitles: FR-5` в Decision/UseCase) → новые ветки в `parsers/md.ts` (по образцу `covers` `:314,385,406`) и `parsers/gherkin.ts` (по образцу `tested-by` `:176,185`). `verifies` из результата прогона — в `builder.ts` рядом с `last-result`/`runtime-trace` (`:394,397`).
4. **Потребители в запросах.** `find_refs` (`tools.ts:1172-1184`) и `get_trace` (`tools.ts:790-792`) читают `graph.edges` по `type` — добавить `verifies`/`entitles` в семантический набор, чтобы трассировка шла «требование ← подтверждено ← доказательство» и «решение → уполномочило → требование». `traceability.ts:49`/`conformance.ts` могут вывести новые gap-классы (например `UNVERIFIED_FR` — FR без входящих `verifies`).
5. **Допустимые концы** декларативно (реализация принуждения — #tier1-9): каждое отношение объявляет допустимые `NodeType`-ы источника/цели (`types.ts:20-31`), например `verifies: { from: [Scenario, AC], to: [FR, NFR] }`, `entitles: { from: [Decision, UseCase], to: [FR, NFR, Task] }`.

```jsonc
// get_trace("FR-5") после добавления:
{ "id": "FR-5",
  "entitled_by": [ { "from": "D-2", "type": "entitles" } ],
  "covered_by":  [ { "from": "AC-5.1", "type": "covers" } ],
  "verified_by": [ { "from": "SCEN-specgen004_143", "type": "verifies",
                     "metadata": { "producer": "cucumber-js@11.3.0", "outcome": "PASSED" } } ] }
```

## Scope in / out

**In:** два новых члена `EdgeType` (`verifies`, `entitles`) с семантикой/направлением; продюсеры в `parsers/md.ts`+`parsers/gherkin.ts`+`builder.ts`; расширение `find_refs`/`get_trace`; опциональные gap-классы (`UNVERIFIED_FR`); якорь-синтаксис `Verifies:`/`Entitles:` в формах спеки; BDD-сценарии на каждое отношение.

**Out:** механизм **принудительной** проверки допустимых концов на парсинге/в транзакции (это #tier1-9 — endpoint constraints; здесь только декларация концов); отпечаток/dry-run/refuse-orphan-cascade для link-мутаций (это #tier1-6); само наполнение provenance в `verifies.metadata` (это #tier1-10); рендер матрицы (#167).

## Likely implementation touchpoints (проверенные пути)

- `tools/spec-graph/types.ts:33-42` — `EdgeType` (добавить `verifies | entitles`); `types.ts:20-31` — `NodeType` (источник/цель отношений); `types.ts:265-271` — `Edge` (+ `EdgeMetadata` `types.ts:256` под provenance `verifies`).
- `tools/spec-graph/parsers/md.ts:314,385,406` — продюсеры `covers` (образец для `entitles`: `Verifies:`/`Entitles:` в блоках AC/Decision/UseCase).
- `tools/spec-graph/parsers/gherkin.ts:176,185` — продюсеры `tested-by` (образец для `verifies` из сценарных якорей); `:108-111` `pushEdge` (дедупликация нового типа «из коробки»).
- `tools/spec-graph/builder.ts:394,397` — вывод `last-result`/`runtime-trace` (рядом — `verifies` из результата прогона).
- `tools/spec-mcp-server/tools.ts:1172-1184` `find_refs`; `:790-792` `get_trace` (новые типы в семантическом обходе).
- `tools/spec-graph/traceability.ts:49` / `conformance.ts` — новые gap-классы (`UNVERIFIED_FR` и т.п.).

## Observable end-to-end acceptance checklist

- [ ] `parseMarkdown`/`parseGherkin` создают рёбра `verifies` и `entitles` из якорей `Verifies:`/`Entitles:`; `pushEdge` дедуплицирует повтор (нет дублей рёбер по `from|to|type`).
- [ ] `get_node`/`find_refs` по FR возвращает входящие `verifies` и `entitles` отдельно от `covers`/`tested-by`.
- [ ] `get_trace("FR-N")` показывает `entitled_by` (Decision/UseCase), `covered_by` (AC) и `verified_by` (Scenario с `metadata.producer/outcome`) как три разные ветки.
- [ ] FR без входящих `verifies` помечается gap-классом `UNVERIFIED_FR` в `conformance_check`/`traceability` (не смешивается с `UNCOVERED_FR`).
- [ ] Существующие отношения (`covers`/`tested-by`/`implements`/…) не изменили поведения; старые спеки без `Verifies:`/`Entitles:` парсятся как раньше (нет ложных `UNVERIFIED_FR` там, где доказательство есть через `tested-by`+passed).
- [ ] **BDD (Docker-only, `scripts/docker-bdd.sh`):** новые сценарии `SPECGEN004_NN` в `.specs/spec-generator-v4/spec-generator-v4.feature` (шаги в `tests/step_definitions/`, рядом с `feature29_implements_edges.ts`): (a) `Verifies:`-якорь создаёт `verifies`-ребро с metadata, (b) `Entitles:`-якорь создаёт `entitles`-ребро, (c) `get_trace` разделяет три ветки, (d) `UNVERIFIED_FR` срабатывает только при реальном отсутствии доказательства; прогон `scripts/docker-bdd.sh --tags "@featureN"`/`--name`, сверка `lastResult===PASSED` по slug-id; фильтрованный прогон не трогает канон `.dev-pomogator/.last-test-run.ndjson`.

## Compatibility / migration

- `EdgeType` расширяется добавлением членов союза — существующие `switch`/мапы по `type` должны получить ветки (TS exhaustiveness укажет точки); потребители, не знающие о новых типах, просто не видят эти рёбра, граф не ломается.
- Старые документы без якорей `Verifies:`/`Entitles:` не порождают новых рёбер — обратная совместимость полная; миграция не требуется.
- `verifies.metadata` опционален; `Edge.metadata?` уже допускает отсутствие (`types.ts:265-271`, поле `metadata?` L270).
- Совместимость с #167 (рендер матрицы): новые отношения — дополнительные столбцы/ветки, существующие не переопределяются.

## Related issues

- **#162** — spec-generator-v4 closure program (родительская программа).
- **#tier1-9** — endpoint constraints: декларация допустимых концов из этого issue становится входом для принудительной проверки.
- **#tier1-6** — безопасная мутация связей: новые рёбра наследуют fingerprint/dry-run/политику.
- **#tier1-10** — provenance тест-доказательств: наполняет `verifies.metadata` (producer/version, run id).
- **#167** — traceability matrix/graph views (потребляет типизированные отношения как столбцы матрицы).
- **#170** — декларативные инварианты/SMT (может проверять консистентность отношений как инвариант).

## Prior art (проверенные прямые ссылки + заимствуемая механика)

- **StrictDoc — типизированные отношения требований** (`RELATIONS: TYPE: Parent/Child/File` с `ROLE:`/`REVERSE_ROLE:`; код `grammar_grammar.py` (`GrammarElementRelationParent`), `grammar_element.py` (`relation_type="Child"`), пример `docs/strictdoc_22_l3_low_level_requirements.sdoc`): отношение — именованный типизированный объект с ролью и обратной ролью, а не свободная ссылка. → `verifies`/`entitles`/`covers` как именованные члены союза с направлением. [VERIFIED] https://github.com/strictdoc-project/strictdoc
- **RDF reification / rdfs** (`rdf:Statement`, `rdf:subject`/`rdf:predicate`/`rdf:object`, §5.3): тройка становится ресурсом, о котором можно делать утверждения. → ребро как объект, несущий `metadata` (provenance). [VERIFIED] https://www.w3.org/TR/rdf-schema/
- **Wikidata qualifiers** — утверждение «субъект–свойство–значение» плюс типизированные квалификаторы. → отношение с дополнительной типизированной нагрузкой. [VERIFIED] https://www.wikidata.org/wiki/Wikidata:Glossary
