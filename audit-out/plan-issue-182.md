## Summary

Сегодня у графа **нет никакой проверки допустимых концов ребра**. Единой точки сбора рёбер тоже нет: `pushEdge` (`tools/spec-graph/parsers/gherkin.ts:108-113`) — **локальное** замыкание-дедупликатор внутри `parseGherkin` (дедуп по ключу `from|to|type`), `parsers/md.ts` пушит рёбра **напрямую** (`edges.push({…})` на `:314,366,385,406`), а `implements`/`last-result`/`runtime-trace` эмиттит `builder.ts` (`:325,344,394,397`). grep по `tools/spec-graph/` на endpoint/node-kind/source/target-проверки даёт ноль совпадений — любое ребро может соединить любые `NodeType`-ы. Нужен **централизованный реестр ограничений** «вид ребра → допустимые `NodeType` источника и цели» (`EDGE_SCHEMA`) и **единый** хелпер `validateEdgeEndpoints`/`appendValidatedEdge`, принудительно применяемый во **всех** точках рождения рёбер (`md.ts`, `gherkin.ts`, эмиттеры `builder.ts`), **плюс** финальный инвариант-прогон по всему графу в `builder.ts` (страховка от любого продюсера в обход хелпера), **плюс** MCP-транзакция (до записи), с fail-closed отказом на нарушение. Это доменный/ранжевый аналог `rdfs:domain`/`rdfs:range` и SHACL-шейпов для спек-графа.

## Problem today (конкретный рабочий сценарий + текущие file/symbol)

`EdgeType` — закрытый союз из 9 членов (`tools/spec-graph/types.ts:33-42`), `NodeType` — закрытый союз из 11 (`types.ts:20-31`: `FR | NFR | AC | Decision | Story | Scenario | Task | UseCase | Risk | File | StepBinding`), запись `Edge { from, to, type, metadata? }` (`types.ts:265-271`). Рёбра реально рождаются в **трёх** местах, и общей точки контроля нет:

- `parseMarkdown` (`parsers/md.ts:191`) пушит `covers` **напрямую** (`edges.push({ from: parentFr, to: childId, … })` на `:314,366,385,406`, направление FR→потомок);
- `parseGherkin` (`parsers/gherkin.ts:81`) — единственный, кто идёт через `pushEdge` (`:108-113`), но это **локальное** замыкание внутри функции; эмиттит `tested-by` (`:176,185`);
- `parseTasks` (`parsers/tasks.ts:41`), `parseDesignFile` (`parsers/design.ts:162`), `parseFileChanges` (`parsers/file-changes.ts:~84`), `parseNdjson` (`parsers/ndjson.ts:118`) производят **узлы/строки/результаты**, а рёбра из них эмиттит `builder.ts`: `implements` из FILE_CHANGES/DESIGN (`emitImplements` `:278`, вызовы `:325,344`), `last-result`/`runtime-trace` из ndjson-результатов (`:394,397`).

Ни один из этих продюсеров не сверяет тип узла-источника/цели с видом ребра, а `pushEdge` лишь дедуплицирует (и доступен только внутри `parseGherkin`). Конкретные фейлы, которые это допускает:

1. **Бессмысленное ребро из-за опечатки/бага парсера.** `tested-by` по контракту идёт `FR→Scenario`; ничто не мешает продюсеру создать `Scenario→FR tested-by` или `File→Scenario tested-by` — `coverage.ts`/`fr-census.ts` молча посчитают мусор, и gap-отчёт (`traceability.ts::gapsFromFindings` `:49`, классы щелей `TraceabilityGapClass` `:26` / `GAP_CLASSES` `:38-42`) выдаст ложную картину.
2. **Инвертированное `covers`.** `covers` реально эмиттится как `FR → AC|Story|Decision` (`md.ts:314,366,385,406`, `from: parentFr, to: childId`); но без проверки концов ничто не мешает багу парсера или кривой транзакции создать обратное `AC|Story|Decision → FR covers` (потомок→FR) — структурно «валидно» (проверки нет), но семантически ломает обход `get_trace` (`tools/spec-mcp-server/tools.ts:790-792`).
3. **Мусор от новых отношений.** Когда #tier1-8 добавит `verifies`/`entitles`, без реестра концов ничего не мешает `Task --verifies--> File` или `Risk --entitles--> Scenario` — отношения без декларации допустимых концов быстро деградируют в шум.
4. **Нет единой точки отказа.** Проверка (если бы была) была бы размазана по трём продюсерам (md/gherkin/builder); сегодня её нет нигде, и MCP-транзакция не валидирует концы рёбер до записи — `validateSpecChange` (`tools.ts:45`, реальные вызовы `:1790` в `propose_spec_change`, `:1838` в `apply_spec_change`, `:2680` в rename) не покрывает endpoint-правила, а мульти-документный `apply_spec_transaction` (`:2188`) и вовсе не идёт через `validateSpecChange`.

## Before / after example

**Before** (баг парсера/транзакции создал инвертированное `covers` и мусорное `tested-by`):

```jsonc
// buildGraph() → graph.edges молча содержит:
[ { "from": "AC-5.1", "to": "FR-5", "type": "covers" },          // инверсия: контракт FR→потомок, а тут потомок→FR
  { "from": "FILE-foo.ts", "to": "SCEN-x", "type": "tested-by" } // File не может «тестировать» (ждём FR→Scenario)
]
// get_spec_status: никаких ошибок; traceability-отчёт искажён тихо.
```

**After** (тот же ввод, реестр концов принуждает):

```jsonc
// findings (fail-closed по умолчанию для инвертированного/мусорного):
{ "edge": "AC-5.1 --covers--> FR-5",
  "error": "ENDPOINT_VIOLATION",
  "rule": "covers: from ∈ {FR,NFR}, to ∈ {AC,Story,Decision}",
  "got": { "from": "AC", "to": "FR" } }
{ "edge": "FILE-foo.ts --tested-by--> SCEN-x",
  "error": "ENDPOINT_VIOLATION",
  "rule": "tested-by: from ∈ {FR,NFR}, to ∈ {Scenario}",
  "got": { "from": "File", "to": "Scenario" } }
// MCP-транзакция (propose_spec_change / apply_spec_change / apply_spec_transaction),
// порождающая такие рёбра → отказ ENDPOINT_VIOLATION до записи.
```

## Proposed behavior (малый data/API output)

1. **Централизованный реестр `EDGE_SCHEMA`** (единый источник правды рядом с `EdgeType`, `types.ts:33-42`):

```ts
export const EDGE_SCHEMA: Record<EdgeType, { from: NodeType[]; to: NodeType[] }> = {
  'covers':        { from: ['FR','NFR'], to: ['AC','Story','Decision'] },
  'tested-by':     { from: ['FR','NFR'],              to: ['Scenario'] },
  'implements':    { from: ['FR','NFR'],              to: ['File'] },
  'verifies':      { from: ['Scenario','AC'],         to: ['FR','NFR'] },   // #tier1-8
  'entitles':      { from: ['Decision','UseCase'],    to: ['FR','NFR','Task'] }, // #tier1-8
  'refs':          { from: ['*'],                      to: ['*'] },          // wildcard
  'tagged-by':     { from: ['Scenario'],              to: ['*'] },
  'last-result':   { from: ['Scenario'],              to: ['*'] },
  'runtime-trace': { from: ['Scenario'],              to: ['*'] },
  'step-binding':  { from: ['Scenario','StepBinding'], to: ['File'] },
  'code-impl':     { from: ['File'],                  to: ['FR','NFR'] },   // reverse-индекс исходников (#tier1-5): символ/файл → требование
};
```

2. **Единая функция проверки** `validateEdgeEndpoints(edge, nodeIndex)`: ищет `NodeType` обоих концов в индексе узлов, сверяет с `EDGE_SCHEMA[edge.type]` (wildcard `'*'` = любой), возвращает типизированное `EndpointViolation[]` с `rule`/`got`. Одна реализация — ноль расползания по парсерам.
3. **Принуждение во всех точках рождения рёбер (точка a).** Так как единой точки сбора нет (`pushEdge` локален для `parseGherkin`, `md.ts` пушит напрямую, `builder.ts` эмиттит сам), вводится **общий** хелпер `appendValidatedEdge(edges, edge, nodeIndex)` (дедуп + `validateEdgeEndpoints` в одном месте, новый модуль рядом с `types.ts`), через который проходят **все** продюсеры: тело `pushEdge` в `gherkin.ts:108-113` заменяется на вызов хелпера; прямые `edges.push({…})` в `md.ts:314,366,385,406` заменяются на `appendValidatedEdge`; эмиттеры `builder.ts` (`emitImplements` `:278`/`:325`/`:344`, `last-result` `:394`, `runtime-trace` `:397`) — аналогично. Нарушение → finding (по умолчанию `error` fail-closed для инвертированных/мусорных рёбер, с逃生-клапаном `warn` для миграции легаси). Добавление нового вида ребра = одна строка в `EDGE_SCHEMA` — хелпер подхватывает её без правок в продюсерах.
4. **Принуждение в MCP-транзакции (точка b).** `validateSpecChange` (`tools.ts:45`, реальные вызовы в `propose_spec_change` `:1790`, `apply_spec_change` `:1838`, rename `:2680`) перестраивает граф из предлагаемого контента и гонит рёбра через ту же `validateEdgeEndpoints`; любое `EndpointViolation` → отказ транзакции до записи (fail-closed), внутри существующей атомарности. Мульти-документный `apply_spec_transaction` (`:2188`), который сейчас **не** идёт через `validateSpecChange`, получает тот же прогон рёбер (единый хелпер переиспользуется), чтобы ни один пишущий путь не обошёл контроль.
5. **Финальный инвариант-прогон в `builder.ts` (страховка в глубину).** После слияния всех парсеров `buildGraphFromCwd` (`builder.ts:451`) прогоняет `validateEdgeEndpoints` по **каждому** ребру итогового графа (включая порождённые `rebuildBacklinks` `:435` и любые будущие продюсеры в обход хелпера). Даже если продюсер забыт или добавлен без `appendValidatedEdge`, инвариант ловит нарушение на финальном графе и превращает его в `ENDPOINT_VIOLATION` (а при `error`-режиме — в отказ сборки).
6. **Отчёт.** Нарушения видны в `conformance_check` (`tools.ts:929`) как отдельный класс findings (`ENDPOINT_VIOLATION` с `rule`+`got`), чтобы легаси-мусор был обозрим и чиним, а не невидим.

```jsonc
// conformance_check finding
{ "code": "ENDPOINT_VIOLATION", "severity": "error",
  "edge": "AC-5.1 --covers--> FR-5",
  "rule": "covers: from ∈ {FR,NFR}, to ∈ {AC,Story,Decision}",
  "got": { "from": "AC", "to": "FR" },
  "files": [ ".specs/x/REQUIREMENTS.md" ] }
```

## Scope in / out

**In:** реестр `EDGE_SCHEMA` (все текущие 9 видов + `verifies`/`entitles` из #tier1-8); `validateEdgeEndpoints` + общий `appendValidatedEdge`; принуждение во **всех** продюсерах рёбер (`md.ts`, `pushEdge` в `gherkin.ts`, эмиттеры `builder.ts`) + финальный инвариант-прогон по графу в `buildGraphFromCwd`; принуждение в `validateSpecChange` и `apply_spec_transaction` (MCP-транзакция); класс finding `ENDPOINT_VIOLATION` в `conformance_check`; wildcard `'*'`; fail-closed default с逃生 `warn` для легаси; BDD-сценарии.

**Out:** сами новые виды отношений `verifies`/`entitles` (их объявляет #tier1-8 — здесь только их концы); fingerprint/dry-run/refuse-orphan-cascade link-мутаций (#tier1-6); provenance (#tier1-10); SMT-разряд произвольных инвариантов (#170 — общий механизм, здесь частный детерминированный случай); автоисправление инвертированных рёбер (только отказ/отчёт, фикс — руками или отдельным issue).

## Likely implementation touchpoints (проверенные пути)

- `tools/spec-graph/types.ts:33-42` — `EdgeType`; `:20-31` — `NodeType`; `:234-244` — `Node` (для индекса `id → NodeType`); `:265-271` — `Edge`. Рядом — новый `EDGE_SCHEMA` + `validateEdgeEndpoints`/`appendValidatedEdge`.
- Продюсеры рёбер (все → через общий `appendValidatedEdge`): `parsers/md.ts:314,366,385,406` (прямые `edges.push`, `covers` FR→потомок); `parsers/gherkin.ts:108-113` (`pushEdge` — **локальный**, заменить тело на хелпер; `tested-by` `:176,185`); `builder.ts` — `emitImplements` `:278`/`:325`/`:344` (`implements`), `:394`/`:397` (`last-result`/`runtime-trace`). `tasks.ts:41`/`design.ts:162`/`file-changes.ts:~84`/`ndjson.ts:118` дают узлы/строки/результаты — рёбра из них эмиттит `builder.ts`.
- `tools/spec-graph/builder.ts:451` — `buildGraphFromCwd` (финальный инвариант-прогон `validateEdgeEndpoints` по всему графу после слияния парсеров и `rebuildBacklinks` `:435`).
- `tools/spec-mcp-server/tools.ts:45` — `validateSpecChange` (добавить прогон рёбер через `validateEdgeEndpoints`); реальные точки вызова `:1790` (`propose_spec_change`), `:1838` (`apply_spec_change`), `:2680` (rename); `:2188` — `apply_spec_transaction` (сейчас не идёт через `validateSpecChange` → подключить тот же прогон).
- `tools/spec-mcp-server/tools.ts:929` — `conformance_check` (новый класс `ENDPOINT_VIOLATION`).
- `tools/spec-graph/conformance.ts` / `traceability.ts` (`gapsFromFindings` `:49`, классы щелей `TraceabilityGapClass` `:26` / `GAP_CLASSES` `:38-42`) — агрегация endpoint-findings в отчёт.

## Observable end-to-end acceptance checklist

- [ ] Инвертированное ребро (`AC→FR covers`, т.е. потомок→FR против контракта `FR→потомок`) и мусорное (`File→Scenario tested-by`) дают `ENDPOINT_VIOLATION` с `rule`+`got`; при `error`-уровне ребро **не** попадает в `graph.edges`.
- [ ] **Каждый пишущий MCP-путь** — `propose_spec_change`/`apply_spec_change` (через `validateSpecChange`) и мульти-документный `apply_spec_transaction`, — порождающий ребро с недопустимыми концами, отказывает **до записи** (документы не изменены; `get_trace` идентичен до/после).
- [ ] Валидные рёбра (`FR→AC covers`, `FR→Scenario tested-by`, `Scenario→FR verifies`) проходят без находок; wildcard `refs`/`runtime-trace` не даёт ложных срабатываний.
- [ ] **Все продюсеры под контролем:** grep подтверждает, что `md.ts`, `pushEdge` в `gherkin.ts` и эмиттеры `builder.ts` идут через общий `appendValidatedEdge`/`validateEdgeEndpoints` (нет прямых `edges.push` в обход); финальный прогон в `buildGraphFromCwd` ловит ребро с недопустимыми концами, даже если его эмиттит гипотетический продюсер в обход хелпера (negative-pin).
- [ ] `conformance_check` перечисляет все легаси `ENDPOINT_VIOLATION` (обозримо/чинимо), а не прячет их.
- [ ] Добавление нового вида ребра в #tier1-8 требует **только** строки в `EDGE_SCHEMA` — общий хелпер и финальный прогон подхватывают её автоматически (нет правок в продюсерах).
- [ ] **BDD (Docker-only, `scripts/docker-bdd.sh`):** новые сценарии `SPECGEN004_NN` в `.specs/spec-generator-v4/spec-generator-v4.feature` (шаги в `tests/step_definitions/`, рядом с `feature29_implements_edges.ts`/`feature40_mutation_edges.ts`): (a) инверсия отказана на парсинге, (b) MCP-транзакция с недопустимым концом отказана до записи, (c) валидное ребро проходит, (d) `conformance_check` показывает `ENDPOINT_VIOLATION`; прогон `scripts/docker-bdd.sh --name "SPECGEN004_…"`, сверка `lastResult===PASSED` по slug-id; фильтрованный прогон не трогает канон `.dev-pomogator/.last-test-run.ndjson`.

## Compatibility / migration

- **Легаси-мусор:** существующие спеки могут уже содержать эндпоинт-нарушения. Включение сразу в `error` fail-closed сломает их сборку. Миграция: сначала режим `warn` (нарушения видны в `conformance_check`, граф строится), затем чистка корпус-здравом (`corpus-health.ts`), затем перевод в `error` по флагу/env. Escape-клапан логируется (по образцу `[skip-…]`-маркеров репо).
- `EDGE_SCHEMA` — аддитивная структура; существующие продюсеры рёбер не меняют сигнатуру.
- Wildcard `'*'` сохраняет совместимость для `refs`/`runtime-trace`/`tagged-by`, где концы намеренно свободные.
- Не влияет на формат документов — только на валидацию выводимых рёбер.

## Related issues

- **#162** — spec-generator-v4 closure program (родительская программа).
- **#tier1-8** — типизированные отношения: `EDGE_SCHEMA` даёт концы для `verifies`/`entitles` (пара «словарь + ограничения»).
- **#tier1-6** — безопасная мутация связей: endpoint-валидация — слой под fingerprint/dry-run/политикой.
- **#170** — декларативные инварианты + SMT-разряд (общий механизм; `EDGE_SCHEMA` — его детерминированный частный случай, не требующий солвера).
- **#167** — traceability matrix/graph views (чистые концы рёбер = достоверная матрица).
- **#172** — namespaced IDs (стабильные spec-qualified id нужны для точного резолва концов).

## Prior art (проверенные прямые ссылки + заимствуемая механика)

- **`rdfs:domain` (класс субъекта, §3.2) + `rdfs:range` (класс объекта, §3.1)** — вид отношения декларирует, что допустимо на каждом конце. → `EDGE_SCHEMA: { from: NodeType[], to: NodeType[] }`. [VERIFIED] https://www.w3.org/TR/rdf-schema/
- **SHACL (W3C REC)** — валидация графа против шейпов (`sh:NodeShape`/`sh:PropertyShape` → `sh:ValidationReport`). → единая `validateEdgeEndpoints` + типизированный отчёт `ENDPOINT_VIOLATION`. [VERIFIED] https://www.w3.org/TR/shacl/
- **GraphQL — типизированная схема + валидация запросов** (spec §3 Type System / §5 Validation): поля декларируют типы, невалидные отклоняются. → отказ недопустимого ребра на парсинге/в транзакции. [VERIFIED] https://github.com/graphql/graphql-spec
